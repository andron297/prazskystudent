/**
 * Správa účtu na serveru (vyžaduje serverový klíč Supabase, který do
 * prohlížeče nesmí):
 *  - smazání účtu,
 *  - propojení nového zařízení přes QR kód.
 *
 * Propojení přes QR (bez nové tabulky – stav je v app_metadata uživatele):
 *  1. Přihlášený počítač si vyžádá jednorázové párování (platí 3 minuty).
 *     Pošle klíč k datům ZABALENÝ náhodným klíčem P; P zůstává jen v QR kódu
 *     (v části adresy za #, která se na server nikdy neposílá).
 *  2. Telefon QR načte a párování „vyzvedne“: server ověří tajné ID, vytvoří
 *     jednorázové přihlášení (magic link token) a vydá zabalený klíč – jen
 *     jednou a jen do vypršení. Server klíč k datům nikdy nevidí rozbalený.
 *  3. Počítač mezitím sleduje stav a hned ukáže, které zařízení se připojilo.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, errorResponse, json, methodNotAllowed, readJsonBody } from './http.js';
import { accountConfig, serviceKey, verifyUser } from './supabase.js';

const PAIR_TTL_MS = 3 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;

interface PairState {
  /** SHA-256 tajného ID párování (samotné ID zná jen QR kód a počítač). */
  h: string;
  exp: number;
  st: 'pending' | 'claimed';
  /** Klíč k datům zabalený klíčem z QR (smaže se při vyzvednutí). */
  w?: string;
  at?: number;
  dev?: string;
}

interface AdminUser {
  id: string;
  email?: string;
  app_metadata?: { stihnu_pair?: PairState | null } & Record<string, unknown>;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function requireAdmin(): { url: string; secret: string } {
  const config = accountConfig();
  if (!config) throw new HttpError(501, 'accounts_off', 'Účty nejsou na serveru zapnuté.');
  const secret = serviceKey();
  if (!secret) throw new HttpError(501, 'admin_off', 'Tahle funkce potřebuje na serveru klíč SUPABASE_SERVICE_ROLE_KEY. Napište prosím správci.');
  return { url: config.url, secret };
}

async function admin(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, secret } = requireAdmin();
  return fetch(`${url}/auth/v1/admin${path}`, {
    ...init,
    headers: { apikey: secret, authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
}

async function adminUser(id: string): Promise<AdminUser | null> {
  const response = await admin(`/users/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(502, 'auth_unavailable', `Účty teď neodpovídají (HTTP ${response.status}).`);
  return (await response.json()) as AdminUser;
}

async function setPair(id: string, value: PairState | null): Promise<void> {
  const response = await admin(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ app_metadata: { stihnu_pair: value } }) });
  if (!response.ok) throw new HttpError(502, 'auth_unavailable', `Párování se nepodařilo uložit (HTTP ${response.status}).`);
}

/** Popisek zařízení od klienta – jen bezpečné znaky, krátký. */
function cleanDevice(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} ·.,()/+-]/gu, '').trim().slice(0, 60) || 'Nové zařízení' : 'Nové zařízení';
}

interface Body {
  op?: string;
  confirmEmail?: string;
  wrapped?: string;
  pairId?: string;
  userId?: string;
  device?: string;
}

export async function handleAccount(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    if (request.headers.get('x-stihnu') !== '1') throw new HttpError(403, 'forbidden', 'Chybí ochranná hlavička.');
    const config = accountConfig();
    if (!config) throw new HttpError(501, 'accounts_off', 'Účty nejsou na serveru zapnuté.');
    const body = await readJsonBody<Body>(request, 4000);

    // Vyzvednutí párování novým zařízením – bez přihlášení, ověřuje se tajným ID z QR.
    if (body.op === 'pair-claim') return await claimPairing(body);

    const user = await verifyUser(request);
    if (!user) throw new HttpError(401, 'unauthorized', 'Přihlášení vypršelo – přihlaste se prosím znovu.');

    if (body.op === 'pair-create') {
      if (typeof body.wrapped !== 'string' || body.wrapped.length < 40 || body.wrapped.length > 200 || !B64URL.test(body.wrapped)) throw new HttpError(400, 'bad_request', 'Neplatná data párování.');
      const pairId = randomBytes(16).toString('base64url');
      const expiresAt = Date.now() + PAIR_TTL_MS;
      await setPair(user.id, { h: sha256(pairId), exp: expiresAt, st: 'pending', w: body.wrapped });
      return json({ pairId, userId: user.id, expiresAt }, 200, { 'cache-control': 'no-store' });
    }
    if (body.op === 'pair-status') {
      const record = (await adminUser(user.id))?.app_metadata?.stihnu_pair;
      if (!record || typeof body.pairId !== 'string' || !sameHash(record.h, sha256(body.pairId))) return json({ status: 'gone' }, 200, { 'cache-control': 'no-store' });
      if (record.st === 'claimed') return json({ status: 'claimed', device: record.dev, at: record.at }, 200, { 'cache-control': 'no-store' });
      return json({ status: record.exp < Date.now() ? 'expired' : 'pending', expiresAt: record.exp }, 200, { 'cache-control': 'no-store' });
    }
    if (body.op === 'pair-cancel') {
      await setPair(user.id, null);
      return json({ ok: true });
    }

    if (body.op !== 'delete') throw new HttpError(400, 'unknown_op', 'Neznámá operace.');
    if (!user.email || (body.confirmEmail ?? '').trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new HttpError(400, 'confirm_mismatch', 'Pro smazání účtu napište přesně svůj e-mail.');
    }
    const secret = serviceKey();
    if (!secret) throw new HttpError(501, 'delete_off', 'Smazání účtu zatím není na serveru zapnuté (chybí serverový klíč Supabase). Data v účtu jsou smazaná, ale samotný účet zůstal – napište prosím správci.');
    // Smazání uživatele smaže kaskádou i trezor a klíče (on delete cascade).
    const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE',
      headers: { apikey: secret, authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) throw new HttpError(502, 'delete_failed', `Účet se nepodařilo smazat (HTTP ${response.status}).`);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function claimPairing(body: Body): Promise<Response> {
  const expired = new HttpError(410, 'pair_expired', 'Kód už neplatí. Na počítači vytvořte nový QR kód a naskenujte ho znovu.');
  if (typeof body.userId !== 'string' || !UUID.test(body.userId) || typeof body.pairId !== 'string' || body.pairId.length !== 22 || !B64URL.test(body.pairId)) {
    throw new HttpError(400, 'bad_request', 'Tohle není platný kód pro propojení.');
  }
  const user = await adminUser(body.userId);
  const record = user?.app_metadata?.stihnu_pair;
  if (!user?.email || !record || !sameHash(record.h, sha256(body.pairId))) throw expired;
  if (record.st !== 'pending' || record.exp < Date.now() || !record.w) throw expired;
  // Nejdřív označit jako vyzvednuté (jednorázovost), pak vytvořit přihlášení.
  const wrapped = record.w;
  await setPair(user.id, { h: record.h, exp: record.exp, st: 'claimed', at: Date.now(), dev: cleanDevice(body.device) });
  const response = await admin('/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: user.email }) });
  if (!response.ok) {
    await setPair(user.id, record).catch(() => undefined);
    throw new HttpError(502, 'pair_failed', `Přihlášení se nepodařilo připravit (HTTP ${response.status}). Zkuste to prosím znovu.`);
  }
  const link = (await response.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash) throw new HttpError(502, 'pair_failed', 'Přihlášení se nepodařilo připravit. Zkuste to prosím znovu.');
  return json({ tokenHash, wrapped }, 200, { 'cache-control': 'no-store' });
}
