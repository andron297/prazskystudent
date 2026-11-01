/**
 * Ochrana proxy proti SSRF: povolujeme jen veřejné HTTPS adresy, kontrolujeme
 * DNS (žádné privátní/loopback IP), přesměrování validujeme v každém kroku
 * a omezujeme velikost odpovědi.
 */
import { lookup } from 'node:dns/promises';
import { isIP, isIPv4, isIPv6 } from 'node:net';
import { HttpError } from './http.js';

const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

export function isPrivateIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) {
      return true;
    }
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

export function parseAllowedHosts(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function hostAllowed(host: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((rule) => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1);
      return host.endsWith(suffix) || host === rule.slice(2);
    }
    return host === rule;
  });
}

/** Ověří, že URL míří na veřejný HTTPS server. Vrací normalizovanou URL. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let input = raw.trim();
  if (/^webcal:\/\//i.test(input)) input = `https://${input.slice('webcal://'.length)}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'invalid_url', 'Neplatná URL adresa.');
  }
  if (url.protocol !== 'https:') throw new HttpError(400, 'https_required', 'Povolené jsou jen adresy začínající https://.');
  if (url.username || url.password) throw new HttpError(400, 'credentials_in_url', 'URL nesmí obsahovat přihlašovací údaje.');
  if (url.port && url.port !== '443') throw new HttpError(400, 'port_not_allowed', 'Nestandardní port není povolený.');

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || !host.includes('.') || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new HttpError(400, 'host_not_allowed', 'Tato adresa není povolená.');
  }
  if (!hostAllowed(host, parseAllowedHosts(process.env.PROXY_ALLOWED_HOSTS))) {
    throw new HttpError(403, 'host_not_in_allowlist', 'Doména není na seznamu povolených (PROXY_ALLOWED_HOSTS).');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new HttpError(403, 'private_address', 'Adresa míří do privátní sítě.');
    return url;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpError(502, 'dns_failed', `Doménu ${host} se nepodařilo najít.`);
  }
  if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
    throw new HttpError(403, 'private_address', 'Adresa míří do privátní sítě.');
  }
  return url;
}

export interface SafeFetchOptions {
  timeoutMs: number;
  maxRedirects: number;
}

/** fetch s ručním sledováním přesměrování – každý krok se znovu validuje. */
export async function safeFetch(target: URL, init: RequestInit, options: SafeFetchOptions): Promise<Response> {
  let current = target;
  const signal = AbortSignal.timeout(options.timeoutMs);
  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    const response = await fetch(current, { ...init, redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop === options.maxRedirects) throw new HttpError(502, 'too_many_redirects', 'Příliš mnoho přesměrování.');
      const next = new URL(response.headers.get('location') as string, current);
      current = await assertPublicUrl(next.toString());
      if (init.method && init.method !== 'GET' && response.status !== 307 && response.status !== 308) {
        init = { ...init, method: 'GET', body: undefined };
      }
      continue;
    }
    return response;
  }
  throw new HttpError(502, 'too_many_redirects', 'Příliš mnoho přesměrování.');
}

/** Přečte tělo odpovědi jako text s limitem velikosti. */
export async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'response_too_large', 'Odpověď vzdáleného serveru je příliš velká.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'response_too_large', 'Odpověď vzdáleného serveru je příliš velká.');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(buffer);
}
