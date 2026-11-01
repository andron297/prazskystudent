/**
 * iCal most: stáhne soukromý .ics odkaz (SIS rozvrh, Google Kalendář – tajná
 * adresa iCal) a vrátí text kalendáře. Obchází CORS, hlídá SSRF a velikost.
 */
import { HttpError, errorResponse, methodNotAllowed } from './http.js';
import { assertPublicUrl, readTextLimited, safeFetch } from './security.js';

export async function handleIcs(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const raw = new URL(request.url).searchParams.get('url');
    if (!raw) throw new HttpError(400, 'missing_url', 'Chybí parametr url s odkazem na kalendář.');
    const target = await assertPublicUrl(raw);
    const response = await safeFetch(
      target,
      {
        method: 'GET',
        headers: {
          accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5',
          'user-agent': 'Stihnu/1.0 (iCal bridge)',
        },
      },
      { timeoutMs: 12_000, maxRedirects: 3 },
    );
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(502, 'ics_forbidden', 'Kalendář vyžaduje přihlášení – použij soukromý (tajný) odkaz iCal.');
    }
    if (response.status === 404) throw new HttpError(502, 'ics_not_found', 'Kalendář na této adrese neexistuje (404).');
    if (!response.ok) throw new HttpError(502, 'ics_http_error', `Server kalendáře odpověděl chybou HTTP ${response.status}.`);
    const text = await readTextLimited(response, 4_000_000);
    if (!/BEGIN:VCALENDAR/i.test(text.slice(0, 4000))) {
      throw new HttpError(422, 'not_ical', 'Odkaz nevrací kalendář ve formátu iCal (.ics).');
    }
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
