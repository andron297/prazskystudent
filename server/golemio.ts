/**
 * Proxy pro PID Golemio API (https://api.golemio.cz/v2/).
 * Klíč: hlavička `x-golemio-key` (zadaný studentem) nebo env `GOLEMIO_API_KEY`.
 * Povolené jsou jen endpointy, které aplikace potřebuje.
 */
import { HttpError, errorResponse, methodNotAllowed, pickKey } from './http.js';

const GOLEMIO_BASE = 'https://api.golemio.cz/v2/';

const ALLOWED_PATHS = [
  /^pid\/departureboards$/,
  /^gtfs\/stops$/,
  /^gtfs\/trips\/[\w\-:.~%]+$/,
  /^vehiclepositions$/,
  /^vehiclepositions\/[\w\-:.~%]+$/,
];

export async function handleGolemio(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const url = new URL(request.url);
    const path = (url.searchParams.get('path') ?? '').replace(/^\/+/, '');
    if (!ALLOWED_PATHS.some((re) => re.test(path))) {
      throw new HttpError(400, 'path_not_allowed', 'Tento Golemio endpoint proxy nepodporuje.');
    }
    const key = pickKey(request, 'x-golemio-key', 'GOLEMIO_API_KEY');
    if (!key) {
      throw new HttpError(
        401,
        'missing_golemio_key',
        'Chybí Golemio API klíč. Zadejte ho v Propojení (zdarma na api.golemio.cz) nebo ho nastavte na serveru jako GOLEMIO_API_KEY.',
      );
    }
    const upstream = new URL(path, GOLEMIO_BASE);
    url.searchParams.forEach((value, name) => {
      if (name !== 'path') upstream.searchParams.append(name, value);
    });
    const response = await fetch(upstream, {
      headers: { 'X-Access-Token': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    const body = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(401, 'invalid_golemio_key', 'Golemio odmítlo API klíč – zkontrolujte ho v Propojení.');
    }
    if (response.status === 429) {
      throw new HttpError(429, 'golemio_rate_limited', 'Golemio dočasně omezilo počet dotazů. Zkuste to za chvíli.');
    }
    return new Response(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
