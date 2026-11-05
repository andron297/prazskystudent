/**
 * Správa účtu na serveru: jen smazání účtu (vyžaduje serverový klíč Supabase,
 * který do prohlížeče nesmí). Vše ostatní (přihlášení, heslo, odhlášení)
 * obsluhuje Supabase Auth přímo a data jsou šifrovaná v prohlížeči.
 */
import { HttpError, errorResponse, json, methodNotAllowed, readJsonBody } from './http.js';
import { accountConfig, serviceKey, verifyUser } from './supabase.js';

export async function handleAccount(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    if (request.headers.get('x-stihnu') !== '1') throw new HttpError(403, 'forbidden', 'Chybí ochranná hlavička.');
    const config = accountConfig();
    if (!config) throw new HttpError(501, 'accounts_off', 'Účty nejsou na serveru zapnuté.');
    const user = await verifyUser(request);
    if (!user) throw new HttpError(401, 'unauthorized', 'Přihlášení vypršelo – přihlaste se prosím znovu.');
    const body = await readJsonBody<{ op?: string; confirmEmail?: string }>(request, 2000);
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
