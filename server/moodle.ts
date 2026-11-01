/**
 * Proxy pro Moodle Web Services (REST, moodlewsrestformat=json).
 * Moodle neposílá CORS hlavičky, proto volání jde přes server.
 * Povolené jsou jen čtecí funkce, které aplikace používá.
 */
import { HttpError, errorResponse, json, methodNotAllowed, readJsonBody } from './http.js';
import { assertPublicUrl, readTextLimited, safeFetch } from './security.js';

export const ALLOWED_MOODLE_FUNCTIONS = new Set([
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'mod_assign_get_assignments',
  'core_calendar_get_action_events_by_timesort',
  'core_course_get_contents',
  'mod_assign_get_submission_status',
]);

type MoodleParam = string | number | boolean | null | undefined | MoodleParam[] | { [key: string]: MoodleParam };

/** Převede vnořené parametry do formátu Moodle: courseids[0]=1&options[0][name]=x */
export function flattenMoodleParams(params: Record<string, MoodleParam>, prefix = ''): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') {
          out.push(...flattenMoodleParams(item as Record<string, MoodleParam>, `${name}[${index}]`));
        } else if (item !== undefined && item !== null) {
          out.push([`${name}[${index}]`, typeof item === 'boolean' ? (item ? '1' : '0') : String(item)]);
        }
      });
    } else if (typeof value === 'object') {
      out.push(...flattenMoodleParams(value, name));
    } else {
      out.push([name, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]);
    }
  }
  return out;
}

interface MoodleProxyBody {
  baseUrl?: unknown;
  token?: unknown;
  wsfunction?: unknown;
  params?: unknown;
}

export async function handleMoodle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const body = await readJsonBody<MoodleProxyBody>(request, 50_000);
    if (typeof body.baseUrl !== 'string' || typeof body.token !== 'string' || typeof body.wsfunction !== 'string') {
      throw new HttpError(400, 'invalid_request', 'Chybí adresa Moodlu, token nebo název funkce.');
    }
    if (!ALLOWED_MOODLE_FUNCTIONS.has(body.wsfunction)) {
      throw new HttpError(400, 'function_not_allowed', `Funkce ${body.wsfunction} není povolená.`);
    }
    const token = body.token.trim();
    if (!/^[A-Za-z0-9]{16,128}$/.test(token)) {
      throw new HttpError(400, 'invalid_token_format', 'Token Moodlu má neplatný formát (očekává se 32 znaků 0–9 a a–f).');
    }
    const base = await assertPublicUrl(body.baseUrl);
    const basePath = base.pathname.replace(/\/+$/, '').replace(/\/(login|my|user|course)(\/.*)?$/, '');
    const endpoint = new URL(`${basePath}/webservice/rest/server.php`, base.origin);

    const params =
      body.params && typeof body.params === 'object' && !Array.isArray(body.params)
        ? (body.params as Record<string, MoodleParam>)
        : {};
    const form = new URLSearchParams();
    form.set('wstoken', token);
    form.set('wsfunction', body.wsfunction);
    form.set('moodlewsrestformat', 'json');
    for (const [k, v] of flattenMoodleParams(params)) form.append(k, v);

    const response = await safeFetch(
      endpoint,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: form.toString(),
      },
      { timeoutMs: 15_000, maxRedirects: 2 },
    );
    const text = await readTextLimited(response, 12_000_000);
    if (!response.ok) {
      throw new HttpError(502, 'moodle_http_error', `Moodle odpověděl chybou HTTP ${response.status}.`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new HttpError(
        502,
        'moodle_not_json',
        'Moodle nevrátil JSON – zkontroluj adresu (např. https://dl1.cuni.cz) a že má zapnuté webové služby.',
      );
    }
    if (payload && typeof payload === 'object' && 'exception' in payload) {
      const p = payload as { errorcode?: string; message?: string };
      const status = p.errorcode === 'invalidtoken' || p.errorcode === 'accessexception' ? 401 : 400;
      return json({ error: p.errorcode ?? 'moodle_exception', message: p.message ?? 'Moodle vrátil chybu.' }, status);
    }
    return json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
