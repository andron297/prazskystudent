/**
 * Proxy pro Google Maps Routes API (computeRoutes, travelMode TRANSIT).
 * Slouží k vyhledání trasy A → B včetně přestupů; živá data o zpoždění
 * a klimatizaci pak klient doplní z Golemio odjezdových tabulí.
 */
import { HttpError, errorResponse, json, methodNotAllowed, pickKey, readJsonBody } from './http.js';

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = [
  'routes.duration',
  'routes.legs.duration',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.staticDuration',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.transitDetails',
].join(',');

interface RoutesBody {
  origin?: { lat?: unknown; lng?: unknown };
  destination?: { lat?: unknown; lng?: unknown };
  arrivalTime?: unknown;
  departureTime?: unknown;
}

function latLng(value: RoutesBody['origin'], label: string) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'invalid_coordinates', `Neplatné souřadnice: ${label}.`);
  }
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

export async function handleRoutes(request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);
  try {
    const key = pickKey(request, 'x-google-key', 'GOOGLE_MAPS_API_KEY');
    if (!key) {
      throw new HttpError(401, 'missing_google_key', 'Chybí Google Maps API klíč (Routes API).');
    }
    const body = await readJsonBody<RoutesBody>(request, 10_000);
    const payload: Record<string, unknown> = {
      origin: latLng(body.origin, 'start'),
      destination: latLng(body.destination, 'cíl'),
      travelMode: 'TRANSIT',
      computeAlternativeRoutes: true,
      languageCode: 'cs',
      units: 'METRIC',
    };
    const time = typeof body.arrivalTime === 'string' ? body.arrivalTime : typeof body.departureTime === 'string' ? body.departureTime : null;
    if (time) {
      if (Number.isNaN(Date.parse(time))) throw new HttpError(400, 'invalid_time', 'Neplatný čas.');
      payload[typeof body.arrivalTime === 'string' ? 'arrivalTime' : 'departureTime'] = new Date(time).toISOString();
    }
    const response = await fetch(ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = `Google Routes API vrátilo chybu HTTP ${response.status}.`;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) message = `Google Routes API: ${parsed.error.message}`;
      } catch {
        // ponecháme obecnou zprávu
      }
      return json({ error: 'google_routes_error', message }, response.status === 403 ? 401 : 502);
    }
    return new Response(text, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
