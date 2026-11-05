/**
 * Klient pro `/api/transit` (Transitous – veřejný plánovač nad jízdními řády
 * PID se živými zpožděními). Funguje bez jakéhokoli klíče. Dotazy se cachují,
 * ať plánovač (komunitní služba) zbytečně nezatěžujeme.
 */
import type { Itinerary, JourneyLeg, LatLng, RideLeg, TransitMode } from '../types';
import { haversineMeters } from '../lib/geo';
import { decodePolyline } from '../lib/polyline';
import { requestJson } from './http';

export const TRANSITOUS_SOURCES_URL = 'https://transitous.org/sources/';

interface CompactPlace {
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
  geometry?: string;
  steps?: { d: number; s?: string; dir?: string }[];
  via?: { name: string; lat: number; lon: number; at?: string }[];
}

export interface CompactItinerary {
  start: string;
  end: string;
  transfers: number;
  legs: CompactLeg[];
}

const MODE: Record<string, TransitMode> = {
  TRAM: 'tram',
  SUBWAY: 'metro',
  METRO: 'metro',
  BUS: 'bus',
  COACH: 'bus',
  TROLLEYBUS: 'trolleybus',
  RAIL: 'train',
  REGIONAL_RAIL: 'train',
  REGIONAL_FAST_RAIL: 'train',
  SUBURBAN: 'train',
  LONG_DISTANCE: 'train',
  HIGHSPEED_RAIL: 'train',
  NIGHT_RAIL: 'train',
  FERRY: 'ferry',
  FUNICULAR: 'funicular',
  AERIAL_LIFT: 'funicular',
  CABLE_CAR: 'funicular',
};

const ms = (iso: string) => new Date(iso).getTime();

function safeDecode(encoded: string) {
  try {
    const path = decodePolyline(encoded, 7);
    return path.length >= 2 && path.every((p) => Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180) ? path : undefined;
  } catch {
    return undefined;
  }
}
const stripPid = (id?: string) => (id?.startsWith('cz-PID_') ? id.slice(7) : id);

/** Itinerář z Transitous → itinerář aplikace (souvislé chůze se sloučí). */
export function fromTransitous(raw: CompactItinerary, originLabel: string, buildingName: string): Itinerary | null {
  const legs: JourneyLeg[] = [];
  for (const l of raw.legs) {
    const minutes = Math.max(0, Math.round((ms(l.end) - ms(l.start)) / 60_000));
    const path = l.geometry ? safeDecode(l.geometry) : undefined;
    if (l.mode === 'WALK' || l.mode === 'BIKE' || !MODE[l.mode]) {
      const prev = legs[legs.length - 1];
      const to = l.to.name === 'Cíl' ? buildingName : l.to.name;
      const steps = l.steps?.map((st) => ({ distance: st.d, street: st.s, dir: st.dir }));
      if (prev && prev.kind === 'walk') {
        prev.minutes += minutes;
        prev.to = to;
        prev.distanceMeters = (prev.distanceMeters ?? 0) + (l.distance ?? 0);
        prev.path = prev.path && path ? [...prev.path, ...path] : undefined;
        prev.steps = prev.steps && steps ? [...prev.steps, ...steps] : undefined;
        prev.toCoords = { lat: l.to.lat, lng: l.to.lon };
      } else {
        legs.push({
          kind: 'walk',
          minutes,
          from: l.from.name === 'Start' ? originLabel : l.from.name,
          to,
          distanceMeters: l.distance,
          path,
          steps,
          fromCoords: { lat: l.from.lat, lng: l.from.lon },
          toCoords: { lat: l.to.lat, lng: l.to.lon },
        });
      }
      continue;
    }
    const ride: RideLeg = {
      kind: 'ride',
      line: l.line ?? '?',
      mode: MODE[l.mode],
      headsign: l.headsign ?? '',
      fromStop: l.from.name,
      toStop: l.to.name,
      platform: l.from.track || undefined,
      toPlatform: l.to.track || undefined,
      scheduledDeparture: l.scheduledStart,
      predictedDeparture: l.start,
      scheduledArrival: l.scheduledEnd,
      predictedArrival: l.end,
      delaySeconds: l.realTime ? Math.round((ms(l.start) - ms(l.scheduledStart)) / 1000) : null,
      isAirConditioned: null,
      isWheelchairAccessible: l.wheelchair ?? null,
      tripId: l.tripId ?? `${stripPid(l.from.stopId)}@${l.scheduledStart}`,
      stopCount: l.stops,
      color: l.color,
      fromCoords: { lat: l.from.lat, lng: l.from.lon },
      toCoords: { lat: l.to.lat, lng: l.to.lon },
      path,
      via: l.via?.map((v) => ({ name: v.name, coords: { lat: v.lat, lng: v.lon }, at: v.at })),
    };
    legs.push(ride);
  }
  const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
  if (legs.length === 0) return null;
  if (rides.length > 0) {
    if (legs[0].kind !== 'walk') legs.unshift({ kind: 'walk', minutes: 0, from: originLabel, to: rides[0].fromStop });
    const last = legs[legs.length - 1];
    if (last.kind !== 'walk') legs.push({ kind: 'walk', minutes: 0, from: rides[rides.length - 1].toStop, to: buildingName });
  }
  const firstWalk = legs[0].kind === 'walk' ? legs[0].minutes : 0;
  const lastLeg = legs[legs.length - 1];
  const lastWalk = rides.length > 0 && lastLeg.kind === 'walk' ? lastLeg.minutes : 0;
  return {
    id: rides.length ? `transitous:${rides.map((r) => r.tripId).join('>')}` : `transitous:walk:${raw.start}`,
    legs,
    leaveAt: raw.start,
    departAt: rides[0]?.predictedDeparture ?? raw.start,
    arriveAt: raw.end,
    walkToStopMinutes: firstWalk,
    walkFromStopMinutes: lastWalk,
    transfers: Math.max(0, rides.length - 1),
    source: 'transitous',
  };
}

/* ------------------------------------------------------------------ */
/* Dotazy s cache                                                      */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  origin: LatLng;
  key: string;
  at: number;
  data: CompactItinerary[];
}

const cache: CacheEntry[] = [];
const inflight = new Map<string, Promise<CompactItinerary[]>>();
const round = (n: number) => n.toFixed(4);

export interface TransitousPlanRequest {
  origin: LatLng;
  destination: LatLng;
  /** Chceme být v cíli do tohoto času. */
  arriveBy: Date;
  now: Date;
  wheelchair?: boolean;
  /** Ruční obnovení – starší výsledek než minuta se nepoužije. */
  fresh?: boolean;
}

export async function transitousPlan(req: TransitousPlanRequest): Promise<CompactItinerary[]> {
  const key = `${round(req.destination.lat)},${round(req.destination.lng)}|${req.arriveBy.toISOString().slice(0, 16)}|${req.wheelchair ? 1 : 0}`;
  // Těsně před odjezdem obnovujeme častěji (živá zpoždění), jinak jednou za pár minut.
  const minutesToGo = (req.arriveBy.getTime() - req.now.getTime()) / 60_000;
  const ttl = req.fresh ? 60_000 : minutesToGo < 45 ? 2 * 60_000 : 8 * 60_000;
  const hit = cache.find((c) => c.key === key && Date.now() - c.at < ttl && haversineMeters(c.origin, req.origin) < 120);
  if (hit) return hit.data;
  const params = new URLSearchParams({
    op: 'plan',
    from: `${round(req.origin.lat)},${round(req.origin.lng)}`,
    to: `${round(req.destination.lat)},${round(req.destination.lng)}`,
    time: req.arriveBy.toISOString().slice(0, 16) + ':00Z',
    arriveBy: '1',
    ...(req.wheelchair ? { wheelchair: '1' } : {}),
  });
  const url = `/api/transit?${params}`;
  let pending = inflight.get(url);
  if (!pending) {
    pending = requestJson<{ itineraries: CompactItinerary[] }>(url, { timeoutMs: 25_000 }).then((r) => r.itineraries ?? []);
    inflight.set(url, pending);
    pending.finally(() => inflight.delete(url)).catch(() => undefined);
  }
  const data = await pending;
  cache.unshift({ origin: req.origin, key, at: Date.now(), data });
  cache.length = Math.min(cache.length, 30);
  return data;
}

export interface TransitousDeparture {
  line: string;
  mode: string;
  headsign: string;
  color?: string;
  stopId?: string;
  track?: string;
  departure: string;
  scheduledDeparture: string;
  realTime: boolean;
  tripId?: string;
}

export async function transitousDepartures(stopIds: string[], now: Date, perStop = 10): Promise<TransitousDeparture[]> {
  const ids = [...new Set(stopIds.filter(Boolean))].slice(0, 8);
  const lists = await Promise.all(
    ids.map((id) =>
      requestJson<{ departures: TransitousDeparture[] }>(`/api/transit?${new URLSearchParams({ op: 'departures', stopId: id, time: now.toISOString().slice(0, 16) + ':00Z', n: String(perStop) })}`, { timeoutMs: 20_000 })
        .then((r) => r.departures ?? [])
        .catch(() => [] as TransitousDeparture[]),
    ),
  );
  return lists.flat().sort((a, b) => ms(a.departure) - ms(b.departure));
}

export function modeFromTransitous(mode: string): TransitMode {
  return MODE[mode] ?? 'bus';
}
