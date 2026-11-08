/**
 * Vyhledávání spojení odkudkoli kamkoli (jako IDOS): hledání míst
 * (adresy, zastávky, místa) a plán cesty se stránkováním dřívějších
 * a pozdějších spojů. Data z Transitous přes /api/transit.
 */
import type { Itinerary, LatLng, TransitMode } from '../types';
import { modesParam, normalizeModes } from '../lib/transitModes';
import { tripKey } from '../lib/journeyRank';
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
  category?: string;
  street?: string;
  lat: number;
  lon: number;
}

const geoCache = new Map<string, Place[]>();

/**
 * Hledání míst seřazené podle blízkosti k `near` (aktuální poloha). U míst
 * ukáže druh a čtvrť („Supermarket · Sárská 133/5 · Stodůlky“), aby se
 * hypermarket nepletl s automyčkou stejného jména.
 */
export async function geocode(text: string, signal?: AbortSignal, near?: LatLng | null): Promise<Place[]> {
  const nearKey = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : '';
  const key = `${text.trim().toLowerCase()}|${nearKey}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const nearParam = near ? `&near=${near.lat.toFixed(5)},${near.lng.toFixed(5)}` : '';
  const data = await requestJson<{ places: GeocodeHit[] }>(`/api/transit?op=geocode&text=${encodeURIComponent(text.trim())}${nearParam}`, { timeoutMs: 10_000, signal });
  const places = (data.places ?? []).map<Place>((p) => ({
    kind: p.type === 'STOP' ? 'stop' : p.type === 'ADDRESS' ? 'address' : 'place',
    label: p.name,
    detail: [p.category, p.street, p.area].filter(Boolean).join(' · ') || undefined,
    coords: { lat: p.lat, lng: p.lon },
  }));
  geoCache.set(key, places);
  if (geoCache.size > 100) geoCache.delete(geoCache.keys().next().value!);
  return places;
}

/** Místo vybrané na mapě → adresa nebo název (jinak „Místo na mapě“). */
export async function reverseGeocode(coords: LatLng, signal?: AbortSignal): Promise<Place> {
  try {
    const data = await requestJson<{ name: string | null; area: string | null }>(`/api/transit?op=reverse&at=${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`, { timeoutMs: 8_000, signal });
    return { kind: 'place', label: data.name || 'Místo na mapě', detail: data.area ?? 'vybráno na mapě', coords };
  } catch {
    return { kind: 'place', label: 'Místo na mapě', detail: 'vybráno na mapě', coords };
  }
}

export interface JourneyQuery {
  from: Place;
  to: Place;
  time: Date;
  arriveBy: boolean;
  wheelchair?: boolean;
  cursor?: string;
  /** Povolené dopravní prostředky (nevyplněno = všechny). */
  modes?: TransitMode[];
}

export interface JourneyResult {
  itineraries: Itinerary[];
  next?: string;
  previous?: string;
  fetchedAt: number;
}

const round = (n: number) => n.toFixed(5);

async function planOnce(q: JourneyQuery, modes: string | null, signal?: AbortSignal): Promise<{ itineraries: CompactItinerary[]; next?: string; previous?: string }> {
  const params = new URLSearchParams({
    op: 'plan',
    from: `${round(q.from.coords.lat)},${round(q.from.coords.lng)}`,
    to: `${round(q.to.coords.lat)},${round(q.to.coords.lng)}`,
    time: q.time.toISOString().slice(0, 16) + ':00Z',
    arriveBy: q.arriveBy ? '1' : '0',
    n: '9',
    ...(q.wheelchair ? { wheelchair: '1' } : {}),
    ...(q.cursor ? { cursor: q.cursor } : {}),
    ...(modes ? { modes } : {}),
  });
  return requestJson<{ itineraries: CompactItinerary[]; next?: string; previous?: string }>(`/api/transit?${params}`, { timeoutMs: 25_000, signal });
}

/**
 * Pestřejší nabídka: k hlavnímu hledání přidá i spoje bez metra (nebo bez
 * tramvaje, když metro nechcete) – ale jen ty, které nejsou o moc horší.
 */
function alternativeModes(modes: TransitMode[]): string | null {
  const list = normalizeModes(modes);
  for (const drop of ['metro', 'tram'] as TransitMode[]) {
    const rest = list.filter((m) => m !== drop);
    if (list.includes(drop) && rest.length > 0) return rest.join(',');
  }
  return null;
}

const minutesOf = (it: Itinerary) => (new Date(it.arriveAt).getTime() - new Date(it.leaveAt).getTime()) / 60_000;

export function withinLimits(main: Itinerary[], extra: Itinerary[]): Itinerary[] {
  if (main.length === 0) return extra;
  const best = Math.min(...main.map(minutesOf));
  const latest = Math.max(...main.map((it) => new Date(it.arriveAt).getTime()));
  return extra.filter((it) => minutesOf(it) <= best + Math.max(15, best * 0.5) && it.legs.filter((l) => l.kind === 'ride').length <= 4 && new Date(it.arriveAt).getTime() <= latest + 20 * 60_000);
}

export async function planBetween(q: JourneyQuery, signal?: AbortSignal): Promise<JourneyResult> {
  const fromLabel = q.from.kind === 'gps' ? 'Vaše poloha' : q.from.label;
  const convert = (raw: CompactItinerary[]) => raw.map((r) => fromTransitous(r, fromLabel, q.to.label)).filter((it): it is Itinerary => Boolean(it));
  const main = modesParam(q.modes);
  const alt = q.cursor ? null : alternativeModes(q.modes ?? []);
  const [first, second] = await Promise.all([planOnce(q, main, signal), alt ? planOnce(q, alt, signal).catch(() => null) : Promise.resolve(null)]);
  const itineraries = convert(first.itineraries ?? []);
  if (second) {
    const seen = new Set(itineraries.map(tripKey));
    for (const it of withinLimits(itineraries, convert(second.itineraries ?? []))) {
      if (seen.has(tripKey(it))) continue;
      seen.add(tripKey(it));
      itineraries.push(it);
    }
    itineraries.sort((a, b) => a.leaveAt.localeCompare(b.leaveAt));
  }
  return { itineraries, next: first.next, previous: first.previous, fetchedAt: Date.now() };
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
