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
const USER_AGENT = 'Stihnuto/2.4 (studijni aplikace, open source; +https://github.com/andron297/prazskystudent)';

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
  steps?: { relativeDirection?: string; distance?: number; streetName?: string; area?: boolean; fromLevel?: number; toLevel?: number; osmWay?: number }[];
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
  /** Pokyny pro chůzi: vzdálenost (m), ulice, směr, patro po kroku (0 = ulice), cesta v OSM. */
  steps?: CompactStep[];
  /** Zastávky po cestě (jen jízdy). */
  via?: { name: string; lat: number; lon: number; at?: string }[];
}

export interface CompactStep {
  d: number;
  s?: string;
  dir?: string;
  /** Patro po kroku (záporné = pod zemí); chybí = úroveň ulice. */
  l?: number;
  /** Cesta v OpenStreetMap (chodník, přechod, schody…) – pro přesné pokyny. */
  w?: number;
}

/**
 * Kroky chůze: drobné úseky na stejné cestě OSM se sloučí, ale hranice cest
 * zůstanou – podle nich navigace pozná přechod, schody, eskalátor nebo výtah.
 */
export function compactSteps(steps: NonNullable<RawLeg['steps']>): CompactStep[] {
  const out: CompactStep[] = [];
  for (const st of steps.slice(0, 400)) {
    const d = Math.max(0, Math.round(st.distance ?? 0));
    const street = st.streetName?.trim() || undefined;
    const dir = st.relativeDirection && st.relativeDirection !== 'CONTINUE' ? st.relativeDirection : undefined;
    const level = typeof st.toLevel === 'number' && Number.isFinite(st.toLevel) && st.toLevel !== 0 ? Math.round(st.toLevel * 2) / 2 : undefined;
    const way = typeof st.osmWay === 'number' && st.osmWay > 0 ? st.osmWay : undefined;
    const last = out[out.length - 1];
    if (last && !dir && !last.dir && last.s === street && last.l === level && last.w === way) {
      last.d += d;
      continue;
    }
    out.push({ d, ...(street ? { s: street.slice(0, 80) } : {}), ...(dir ? { dir } : {}), ...(level !== undefined ? { l: level } : {}), ...(way ? { w: way } : {}) });
  }
  return out.slice(0, 160);
}

/* ------------------------------------------------------------------ */
/* Co je která cesta (přechod, chodník, schody…) – z OpenStreetMap     */
/* ------------------------------------------------------------------ */

export interface WayInfo {
  k: 'crossing' | 'steps' | 'escalator' | 'elevator' | 'sidewalk' | 'footway' | 'platform' | 'passage' | 'underground' | 'road';
  /** Přechod se semaforem. */
  sig?: 1;
  /** Přechod se zebrou. */
  zebra?: 1;
  /** Pod zemí (tunel, záporné patro). */
  u?: 1;
  name?: string;
}

export function wayInfoFromTags(t: Record<string, string>): WayInfo | null {
  const hw = t.highway;
  const level = Number((t.level ?? '').split(';')[0]);
  const underground = t.tunnel === 'yes' || Number(t.layer) < 0 || (Number.isFinite(level) && level < 0) ? { u: 1 as const } : {};
  const name = t.name ? { name: t.name.slice(0, 80) } : {};
  if (hw === 'elevator') return { k: 'elevator', ...underground };
  if (hw === 'steps') return { k: t.conveying && t.conveying !== 'no' ? 'escalator' : 'steps', ...underground };
  if (t.footway === 'crossing' || hw === 'crossing' || (t.crossing && t.crossing !== 'no')) {
    const sig = t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes';
    const markings = t['crossing:markings'];
    const zebra = (markings && markings !== 'no') || t.crossing === 'zebra' || t.crossing === 'marked' || (t.crossing === 'uncontrolled' && markings !== 'no');
    return { k: 'crossing', ...(sig ? { sig: 1 as const } : {}), ...(zebra ? { zebra: 1 as const } : {}) };
  }
  if (t.public_transport === 'platform' || t.railway === 'platform' || hw === 'platform') return { k: 'platform', ...underground, ...name };
  if (t.footway === 'sidewalk') return { k: 'sidewalk', ...underground };
  if (t.tunnel === 'building_passage') return { k: 'passage' };
  if (underground.u && (hw === 'footway' || hw === 'corridor' || hw === 'pedestrian' || hw === 'path')) return { k: 'underground', u: 1 };
  if (hw === 'footway' || hw === 'pedestrian' || hw === 'path' || hw === 'corridor' || hw === 'living_street' || hw === 'track' || hw === 'cycleway') return { k: 'footway', ...underground, ...name };
  if (hw) return { k: 'road', ...name };
  return null;
}

const OSM_UA = 'Stihnuto/2.4 (studijni aplikace, open source; +https://github.com/andron297/prazskystudent)';

/** Značky cest: nejdřív Overpass (určený pro čtení dat), při výpadku hlavní API OSM. */
async function fetchWayTags(ids: string[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  try {
    const body = new URLSearchParams({ data: `[out:json][timeout:10];way(id:${ids.join(',')});out tags;` });
    const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body, headers: { 'user-agent': OSM_UA, accept: 'application/json' }, signal: AbortSignal.timeout(9_000) });
    if (!response.ok) throw new Error(`overpass ${response.status}`);
    const data = JSON.parse(await readTextLimited(response, 3_000_000)) as { elements?: { type?: string; id?: number; tags?: Record<string, string> }[] };
    for (const e of data.elements ?? []) if (e.type === 'way' && e.id) out[String(e.id)] = e.tags ?? {};
    return out;
  } catch {
    // Záložně hlavní API OSM – jeden dotaz na všechny cesty najednou.
  }
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/ways.json?ways=${ids.join(',')}`, { headers: { 'user-agent': OSM_UA, accept: 'application/json' }, signal: AbortSignal.timeout(9_000) });
  if (!response.ok) throw new HttpError(502, 'osm_error', `OpenStreetMap odpověděla chybou HTTP ${response.status}.`);
  const data = JSON.parse(await readTextLimited(response, 3_000_000)) as { elements?: { type?: string; id?: number; tags?: Record<string, string> }[] };
  for (const e of data.elements ?? []) if (e.type === 'way' && e.id) out[String(e.id)] = e.tags ?? {};
  return out;
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
      // Stránkování „dřívější / pozdější spoje“ – kurzor vrací sám plánovač.
      const cursor = params.get('cursor');
      if (cursor && !/^[\w=+/-]{1,600}$/.test(cursor)) throw new HttpError(400, 'bad_cursor', 'Neplatný kurzor.');
      const count = Math.min(10, Math.max(3, Number(params.get('n')) || 6));
      const data = await upstream<{ itineraries?: { startTime?: string; endTime?: string; transfers?: number; legs?: RawLeg[] }[]; nextPageCursor?: string; previousPageCursor?: string }>('plan', {
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        time,
        arriveBy: String(arriveBy),
        numItineraries: String(count),
        maxPreTransitTime: '1200',
        maxPostTransitTime: '1200',
        ...(cursor ? { pageCursor: cursor } : {}),
        ...(wheelchair ? { pedestrianProfile: 'WHEELCHAIR' } : {}),
      });
      const itineraries = (data.itineraries ?? [])
        .filter((it) => !(it.legs ?? []).some((l) => l.cancelled))
        .map((it) => ({ start: it.startTime ?? '', end: it.endTime ?? '', transfers: it.transfers ?? 0, legs: (it.legs ?? []).map(compactLeg) }));
      return json({ itineraries, next: data.nextPageCursor, previous: data.previousPageCursor, source: 'transitous' }, 200, { 'cache-control': 'public, max-age=30, s-maxage=60' });
    }
    if (op === 'geocode') {
      // Hledání míst: adresy, zastávky, místa (jen Praha a okolí).
      const text = (params.get('text') ?? '').trim();
      if (text.length < 2 || text.length > 80) throw new HttpError(400, 'bad_text', 'Zadejte aspoň dva znaky.');
      const data = await upstream<{ type?: string; name?: string; id?: string; lat?: number; lon?: number; areas?: { name?: string; adminLevel?: number; matched?: boolean; default?: boolean }[]; street?: string; houseNumber?: string }[]>('geocode', { text, language: 'cs' });
      const places = (Array.isArray(data) ? data : [])
        .filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number' && p.lat >= BOUNDS.minLat && p.lat <= BOUNDS.maxLat && p.lon >= BOUNDS.minLon && p.lon <= BOUNDS.maxLon)
        .slice(0, 10)
        .map((p) => {
          const area = (p.areas ?? []).filter((a) => a.name && a.name !== 'Česko').sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0))[0]?.name;
          return { type: p.type ?? 'PLACE', name: (p.name ?? '').slice(0, 120), area: area?.slice(0, 80), lat: p.lat!, lon: p.lon!, stopId: p.type === 'STOP' ? p.id : undefined };
        });
      return json({ places }, 200, { 'cache-control': 'public, max-age=3600, s-maxage=86400' });
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
    if (op === 'ways') {
      // Co je která cesta na pěší trase (přechod, schody, eskalátor…) – pro přesné pokyny navigace.
      const ids = [...new Set((params.get('ids') ?? '').split(',').filter((x) => /^\d{1,12}$/.test(x)))].slice(0, 300);
      if (ids.length === 0) throw new HttpError(400, 'bad_ids', 'Chybí cesty.');
      const tags = await fetchWayTags(ids);
      const ways: Record<string, WayInfo> = {};
      for (const [id, t] of Object.entries(tags)) {
        const info = wayInfoFromTags(t);
        if (info) ways[id] = info;
      }
      return json({ ways }, 200, { 'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800' });
    }
    throw new HttpError(400, 'unknown_op', 'Neznámá operace.');
  } catch (error) {
    return errorResponse(error);
  }
}
