/**
 * Vyhledávání spojení odkudkoli kamkoli (jako IDOS): hledání míst
 * (adresy, zastávky, místa) a plán cesty se stránkováním dřívějších
 * a pozdějších spojů. Data z Transitous přes /api/transit.
 */
import type { Itinerary, LatLng } from '../types';
import { requestJson } from './http';
import { fromTransitous, type CompactItinerary } from './transitous';

export type PlaceKind = 'gps' | 'origin' | 'stop' | 'address' | 'place' | 'building' | 'recent';

export interface Place {
  kind: PlaceKind;
  label: string;
  detail?: string;
  coords: LatLng;
}

interface GeocodeHit {
  type: string;
  name: string;
  area?: string;
  lat: number;
  lon: number;
}

const geoCache = new Map<string, Place[]>();

export async function geocode(text: string, signal?: AbortSignal): Promise<Place[]> {
  const key = text.trim().toLowerCase();
  const hit = geoCache.get(key);
  if (hit) return hit;
  const data = await requestJson<{ places: GeocodeHit[] }>(`/api/transit?op=geocode&text=${encodeURIComponent(text.trim())}`, { timeoutMs: 10_000, signal });
  const places = (data.places ?? []).map<Place>((p) => ({
    kind: p.type === 'STOP' ? 'stop' : p.type === 'ADDRESS' ? 'address' : 'place',
    label: p.name,
    detail: p.area,
    coords: { lat: p.lat, lng: p.lon },
  }));
  geoCache.set(key, places);
  if (geoCache.size > 100) geoCache.delete(geoCache.keys().next().value!);
  return places;
}

export interface JourneyQuery {
  from: Place;
  to: Place;
  time: Date;
  arriveBy: boolean;
  wheelchair?: boolean;
  cursor?: string;
}

export interface JourneyResult {
  itineraries: Itinerary[];
  next?: string;
  previous?: string;
  fetchedAt: number;
}

const round = (n: number) => n.toFixed(5);

export async function planBetween(q: JourneyQuery, signal?: AbortSignal): Promise<JourneyResult> {
  const params = new URLSearchParams({
    op: 'plan',
    from: `${round(q.from.coords.lat)},${round(q.from.coords.lng)}`,
    to: `${round(q.to.coords.lat)},${round(q.to.coords.lng)}`,
    time: q.time.toISOString().slice(0, 16) + ':00Z',
    arriveBy: q.arriveBy ? '1' : '0',
    n: '7',
    ...(q.wheelchair ? { wheelchair: '1' } : {}),
    ...(q.cursor ? { cursor: q.cursor } : {}),
  });
  const data = await requestJson<{ itineraries: CompactItinerary[]; next?: string; previous?: string }>(`/api/transit?${params}`, { timeoutMs: 25_000, signal });
  const fromLabel = q.from.kind === 'gps' ? 'Vaše poloha' : q.from.label;
  const itineraries = (data.itineraries ?? [])
    .map((raw) => fromTransitous(raw, fromLabel, q.to.label))
    .filter((it): it is Itinerary => Boolean(it));
  return { itineraries, next: data.next, previous: data.previous, fetchedAt: Date.now() };
}

/* ------------------------------------------------------------------ */
/* Nedávná místa (jen v tomto zařízení)                                */
/* ------------------------------------------------------------------ */

const RECENT_KEY = 'stihnu:recent-places';

export function recentPlaces(): Place[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as Place[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function rememberPlace(p: Place): void {
  if (p.kind === 'gps' || p.kind === 'origin') return;
  try {
    const list = recentPlaces().filter((x) => x.label !== p.label);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ ...p, kind: p.kind === 'recent' ? p.kind : p.kind }, ...list].slice(0, 6)));
  } catch {
    /* plné úložiště nevadí */
  }
}
