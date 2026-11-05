/**
 * Trasy a odjezdy PID bez klíče – přes veřejný plánovač Transitous
 * (MOTIS, https://transitous.org). Ten má jízdní řády PID i živá zpoždění
 * a hledá trasy s přestupy včetně skutečné chůze po OpenStreetMap.
 *
 * Podle pravidel Transitous: aplikace je open source a nekomerční, posílá
 * User-Agent s odkazem na projekt, ptá se střídmě (odpovědi se cachují)
 * a v aplikaci je vidět odkaz na zdroje dat (transitous.org/sources).
 * Proxy přijímá jen souřadnice v okolí Prahy a ID zastávek PID – nejde
 * zneužít k obecnému stahování.
 */
import { HttpError, errorResponse, json, methodNotAllowed } from './http.js';
import { readTextLimited } from './security.js';

const API = 'https://api.transitous.org/api/v1/';
const USER_AGENT = 'Stihnu/2.4 (studijni aplikace, open source; +https://github.com/andron297/prazskystudent)';

// Pražská integrovaná doprava sahá i do Středočeského kraje.
const BOUNDS = { minLat: 49.4, maxLat: 50.7, minLon: 13.4, maxLon: 15.6 };

function parsePoint(value: string | null, label: string): { lat: number; lon: number } {
  const m = /^(-?\d{1,2}\.\d{1,7}),(-?\d{1,3}\.\d{1,7})$/.exec(value ?? '');
  if (!m) throw new HttpError(400, 'bad_point', `Neplatné souřadnice (${label}).`);
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lon < BOUNDS.minLon || lon > BOUNDS.maxLon) {
    throw new HttpError(400, 'out_of_area', 'Plánovač zná jen spoje PID v Praze a okolí.');
  }
  return { lat, lon };
}

function parseTime(value: string | null): string {
  const t = value ? new Date(value) : new Date();
  if (Number.isNaN(t.getTime())) throw new HttpError(400, 'bad_time', 'Neplatný čas.');
  if (Math.abs(t.getTime() - Date.now()) > 3 * 86_400_000) throw new HttpError(400, 'bad_time', 'Čas je moc daleko.');
  return t.toISOString();
}

async function upstream<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (response.status === 429) throw new HttpError(429, 'transit_rate_limited', 'Plánovač je teď přetížený – zkuste to za chvíli.');
  if (!response.ok) throw new HttpError(502, 'transit_error', `Plánovač odpověděl chybou HTTP ${response.status}.`);
  return JSON.parse(await readTextLimited(response, 4_000_000)) as T;
}

/* ------------------------------------------------------------------ */
/* Kompaktní tvar odpovědi (bez geometrie a pomocných dat)             */
/* ------------------------------------------------------------------ */

interface RawPlace {
  name?: string;
  stopId?: string;
  lat?: number;
  lon?: number;
  track?: string;
  scheduledTrack?: string;
  arrival?: string;
  departure?: string;
  scheduledArrival?: string;
  scheduledDeparture?: string;
}

interface RawLeg {
  mode?: string;
  from?: RawPlace;
  to?: RawPlace;
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  realTime?: boolean;
  distance?: number;
  routeShortName?: string;
  headsign?: string;
  routeColor?: string;
  tripId?: string;
  wheelchairAccessible?: string;
  cancelled?: boolean;
  intermediateStops?: RawPlace[];
  legGeometry?: { points?: string; precision?: number };
  steps?: { relativeDirection?: string; distance?: number; streetName?: string; area?: boolean }[];
}

export interface CompactPlace {
  name: string;
  stopId?: string;
  lat: number;
  lon: number;
  track?: string;
}

export interface CompactLeg {
  mode: string;
  from: CompactPlace;
  to: CompactPlace;
  start: string;
  end: string;
  scheduledStart: string;
  scheduledEnd: string;
  realTime: boolean;
  distance?: number;
  line?: string;
  headsign?: string;
  color?: string;
  tripId?: string;
  wheelchair?: boolean;
  stops?: number;
  /** Tvar trasy – zakódovaná lomená čára (Google polyline, přesnost 7). */
  geometry?: string;
  /** Pokyny pro chůzi: vzdálenost (m), ulice, směr. */
  steps?: { d: number; s?: string; dir?: string }[];
  /** Zastávky po cestě (jen jízdy). */
  via?: { name: string; lat: number; lon: number; at?: string }[];
}

/** Sloučí drobné úseky „pokračuj rovně“ na stejné ulici do jednoho pokynu. */
function compactSteps(steps: NonNullable<RawLeg['steps']>): CompactLeg['steps'] {
  const out: NonNullable<CompactLeg['steps']> = [];
  for (const st of steps.slice(0, 400)) {
    const d = Math.max(0, Math.round(st.distance ?? 0));
    const street = st.streetName?.trim() || undefined;
    const dir = st.relativeDirection && st.relativeDirection !== 'CONTINUE' ? st.relativeDirection : undefined;
    const last = out[out.length - 1];
    if (last && !dir && last.s === street) {
      last.d += d;
      continue;
    }
    out.push({ d, ...(street ? { s: street.slice(0, 80) } : {}), ...(dir ? { dir } : {}) });
  }
  return out.slice(0, 120);
}

const place = (p: RawPlace | undefined): CompactPlace => ({
  name: p?.name === 'START' ? 'Start' : p?.name === 'END' ? 'Cíl' : (p?.name ?? ''),
  stopId: p?.stopId,
  lat: p?.lat ?? 0,
  lon: p?.lon ?? 0,
  track: p?.track ?? p?.scheduledTrack,
});

function compactLeg(l: RawLeg): CompactLeg {
  return {
    mode: l.mode ?? 'WALK',
    from: place(l.from),
    to: place(l.to),
    start: l.startTime ?? '',
    end: l.endTime ?? '',
    scheduledStart: l.scheduledStartTime ?? l.startTime ?? '',
    scheduledEnd: l.scheduledEndTime ?? l.endTime ?? '',
    realTime: Boolean(l.realTime),
    distance: l.distance,
    line: l.routeShortName,
    headsign: l.headsign,
    color: l.routeColor ? `#${l.routeColor}` : undefined,
    tripId: l.tripId,
    wheelchair: l.wheelchairAccessible ? l.wheelchairAccessible === 'ACCESSIBLE' : undefined,
    stops: Array.isArray(l.intermediateStops) ? l.intermediateStops.length + 1 : undefined,
    geometry: l.legGeometry?.points && (l.legGeometry.precision ?? 7) === 7 && l.legGeometry.points.length < 40_000 ? l.legGeometry.points : undefined,
    steps: l.mode === 'WALK' && Array.isArray(l.steps) ? compactSteps(l.steps) : undefined,
    via:
      Array.isArray(l.intermediateStops) && l.mode !== 'WALK'
        ? l.intermediateStops.slice(0, 80).map((p) => ({ name: p.name ?? '', lat: p.lat ?? 0, lon: p.lon ?? 0, at: p.arrival ?? p.scheduledArrival }))
        : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Endpoint                                                            */
/* ------------------------------------------------------------------ */

export async function handleTransit(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const params = new URL(request.url).searchParams;
    const op = params.get('op');
    if (op === 'plan') {
      const from = parsePoint(params.get('from'), 'odkud');
      const to = parsePoint(params.get('to'), 'kam');
      const time = parseTime(params.get('time'));
      const arriveBy = params.get('arriveBy') === '1';
      const wheelchair = params.get('wheelchair') === '1';
      const data = await upstream<{ itineraries?: { startTime?: string; endTime?: string; transfers?: number; legs?: RawLeg[] }[] }>('plan', {
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        time,
        arriveBy: String(arriveBy),
        numItineraries: '6',
        maxPreTransitTime: '1200',
        maxPostTransitTime: '1200',
        ...(wheelchair ? { pedestrianProfile: 'WHEELCHAIR' } : {}),
      });
      const itineraries = (data.itineraries ?? [])
        .filter((it) => !(it.legs ?? []).some((l) => l.cancelled))
        .map((it) => ({ start: it.startTime ?? '', end: it.endTime ?? '', transfers: it.transfers ?? 0, legs: (it.legs ?? []).map(compactLeg) }));
      return json({ itineraries, source: 'transitous' }, 200, { 'cache-control': 'public, max-age=30, s-maxage=60' });
    }
    if (op === 'departures') {
      const stopId = (params.get('stopId') ?? '').trim();
      if (!/^(cz-PID_)?U\d{1,5}[ZS]\d{1,4}P?$/.test(stopId)) throw new HttpError(400, 'bad_stop', 'Neplatné ID zastávky PID.');
      const time = parseTime(params.get('time'));
      const n = Math.min(30, Math.max(1, Number(params.get('n')) || 12));
      const data = await upstream<{ stopTimes?: { place?: RawPlace; mode?: string; realTime?: boolean; routeShortName?: string; headsign?: string; routeColor?: string; tripId?: string; cancelled?: boolean }[] }>('stoptimes', {
        stopId: stopId.startsWith('cz-PID_') ? stopId : `cz-PID_${stopId}`,
        time,
        n: String(n),
      });
      const departures = (data.stopTimes ?? [])
        .filter((s) => !s.cancelled)
        .map((s) => ({
          line: s.routeShortName ?? '',
          mode: s.mode ?? 'BUS',
          headsign: s.headsign ?? '',
          color: s.routeColor ? `#${s.routeColor}` : undefined,
          stopId: s.place?.stopId,
          track: s.place?.track ?? s.place?.scheduledTrack,
          departure: s.place?.departure ?? s.place?.scheduledDeparture ?? '',
          scheduledDeparture: s.place?.scheduledDeparture ?? s.place?.departure ?? '',
          realTime: Boolean(s.realTime),
          tripId: s.tripId,
        }));
      return json({ departures, source: 'transitous' }, 200, { 'cache-control': 'public, max-age=15, s-maxage=20' });
    }
    throw new HttpError(400, 'unknown_op', 'Neznámá operace.');
  } catch (error) {
    return errorResponse(error);
  }
}
