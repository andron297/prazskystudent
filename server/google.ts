/**
 * Volitelné serverové přihlášení Google (authorization code flow, popup).
 * Refresh token se ukládá zašifrovaný v HttpOnly cookie – synchronizace pak běží
 * i po vypršení hodinového access tokenu, bez nového okna přihlášení.
 * Bez GOOGLE_CLIENT_SECRET aplikace používá čistě klientský token (přihlášení
 * je potřeba obnovit kliknutím, když token vyprší).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { HttpError, errorResponse, json, methodNotAllowed, readJsonBody } from './http.js';

const COOKIE = 'stihnu_grt';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export function googleClientId(): string | undefined {
  return (process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID)?.trim() || undefined;
}

export function googleServerFlowAvailable(): boolean {
  return Boolean(googleClientId() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function key(): Buffer {
  const secret = process.env.GOOGLE_TOKEN_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
  return createHash('sha256').update(`stihnu:${secret}`).digest();
}

export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function openToken(sealed: string): string | null {
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function cookieHeader(value: string, maxAge: number, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/api/google; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    const invalid = data.error === 'invalid_grant';
    throw new HttpError(invalid ? 401 : 502, invalid ? 'google_reauth' : 'google_token_error', data.error_description ?? data.error ?? `Google odpověděl chybou HTTP ${response.status}.`);
  }
  return data;
}

export async function handleGoogle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    // Vlastní hlavička vynutí CORS preflight – cizí stránka požadavek neodešle.
    if (request.headers.get('x-stihnu') !== '1') throw new HttpError(403, 'forbidden', 'Chybí ochranná hlavička.');
    const clientId = googleClientId();
    const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !secret) throw new HttpError(501, 'google_server_flow_off', 'Serverové přihlášení Google není nastavené (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET).');
    const body = await readJsonBody<{ action?: string; code?: string }>(request, 20_000);

    if (body.action === 'exchange') {
      if (!body.code) throw new HttpError(400, 'missing_code', 'Chybí autorizační kód.');
      const data = await tokenRequest({ code: body.code, client_id: clientId, client_secret: secret, redirect_uri: 'postmessage', grant_type: 'authorization_code' });
      const headers: Record<string, string> = {};
      if (data.refresh_token) headers['set-cookie'] = cookieHeader(sealToken(data.refresh_token), 180 * 86_400, request);
      return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600, scope: data.scope ?? '', persistent: Boolean(data.refresh_token) }, 200, headers);
    }

    if (body.action === 'refresh') {
      const sealed = readCookie(request, COOKIE);
      const refresh = sealed ? openToken(sealed) : null;
      if (!refresh) throw new HttpError(401, 'google_reauth', 'Přihlášení ke Googlu vypršelo.');
      try {
        const data = await tokenRequest({ refresh_token: refresh, client_id: clientId, client_secret: secret, grant_type: 'refresh_token' });
        return json({ access_token: data.access_token, expires_in: data.expires_in ?? 3600, scope: data.scope ?? '', persistent: true });
      } catch (error) {
        if (error instanceof HttpError && error.code === 'google_reauth') {
          return json({ error: 'google_reauth', message: 'Přístup byl odvolán – přihlas se znovu.' }, 401, { 'set-cookie': cookieHeader('', 0, request) });
        }
        throw error;
      }
    }

    if (body.action === 'logout') {
      const sealed = readCookie(request, COOKIE);
      const refresh = sealed ? openToken(sealed) : null;
      if (refresh) {
        await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST', signal: AbortSignal.timeout(8000) }).catch(() => undefined);
      }
      return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0, request) });
    }

    throw new HttpError(400, 'unknown_action', 'Neznámá akce.');
  } catch (error) {
    return errorResponse(error);
  }
}
