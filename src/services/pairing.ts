/**
 * Propojení nového zařízení přes QR kód (viz server/account.ts):
 * počítač ukáže QR, telefon ho načte a je přihlášený i odemčený.
 * Klíč k rozbalení dat je jen v QR (za #), server ho nikdy nedostane.
 */
import { fromB64, toB64 } from '../lib/vaultCrypto';
import { signInWithPairing, wrapDekForPairing } from './account';
import { accountAuthHeader } from './authToken';

const b64url = (bytes: Uint8Array<ArrayBuffer>) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text: string) => fromB64(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));

async function call<T>(op: string, body: Record<string, unknown> = {}, auth = true): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-stihnu': '1', ...(auth ? accountAuthHeader() : {}) },
      body: JSON.stringify({ op, ...body }),
    });
  } catch {
    throw new Error('Bez připojení k internetu to nepůjde.');
  }
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message ?? `Propojení se nepodařilo (HTTP ${response.status}).`);
  return data;
}

export interface PairingTicket {
  url: string;
  pairId: string;
  expiresAt: number;
}

export type PairingStatus = { status: 'pending'; expiresAt: number } | { status: 'claimed'; device?: string; at?: number } | { status: 'expired' | 'gone' };

/** Počítač: vytvoří jednorázový QR kód (platí 3 minuty). */
export async function createPairing(): Promise<PairingTicket> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const wrapped = b64url(fromB64(await wrapDekForPairing(key)));
  const { pairId, userId, expiresAt } = await call<{ pairId: string; userId: string; expiresAt: number }>('pair-create', { wrapped });
  return { pairId, expiresAt, url: `${window.location.origin}/#/pripojit/${userId}.${pairId}.${b64url(raw)}` };
}

export function pairingStatus(pairId: string): Promise<PairingStatus> {
  return call<PairingStatus>('pair-status', { pairId });
}

export async function cancelPairing(): Promise<void> {
  await call('pair-cancel').catch(() => undefined);
}

export interface PairingCode {
  userId: string;
  pairId: string;
  key: string;
}

/** Přečte kód z adresy (celý odkaz z QR nebo jen část za #). */
export function parsePairingCode(text: string): PairingCode | null {
  const m = /pripojit\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/i.exec(text);
  return m ? { userId: m[1].toLowerCase(), pairId: m[2], key: m[3] } : null;
}

/** Srozumitelný název zařízení pro počítač („iPhone · Safari“). */
export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Zařízení';
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /OPR\//.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'prohlížeč';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  return `${os} · ${standalone ? 'aplikace' : browser}`;
}

/** Nové zařízení: vyzvedne párování, přihlásí se a odemkne data. */
export async function claimPairing(code: PairingCode): Promise<void> {
  const { tokenHash, wrapped } = await call<{ tokenHash: string; wrapped: string }>('pair-claim', { userId: code.userId, pairId: code.pairId, device: deviceLabel() }, false);
  const key = await crypto.subtle.importKey('raw', fromB64url(code.key), { name: 'AES-GCM' }, false, ['decrypt']);
  await signInWithPairing(code.userId, tokenHash, toB64(fromB64url(wrapped)), key);
}
