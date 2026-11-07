/**
 * Co je která cesta na pěší trase – přechod (se zebrou, se semaforem),
 * chodník, schody, eskalátor, výtah, podchod. Data z OpenStreetMap přes
 * `/api/transit?op=ways` (cachuje se na týden), v zařízení pak v paměti.
 */
import type { Itinerary } from '../types';
import { requestJson } from './http';

export interface WayInfo {
  k: 'crossing' | 'steps' | 'escalator' | 'elevator' | 'sidewalk' | 'footway' | 'platform' | 'passage' | 'underground' | 'road';
  sig?: 1;
  zebra?: 1;
  u?: 1;
  name?: string;
}

export type WayMap = Record<number, WayInfo>;

const cache = new Map<number, WayInfo | null>();

/** ID cest OSM ze všech pěších úseků itineráře. */
export function itineraryWayIds(it: Itinerary): number[] {
  const ids = new Set<number>();
  for (const leg of it.legs) if (leg.kind === 'walk') for (const st of leg.steps ?? []) if (st.way) ids.add(st.way);
  return [...ids];
}

export async function fetchWayInfo(ids: number[]): Promise<WayMap> {
  const missing = ids.filter((id) => !cache.has(id)).slice(0, 300);
  if (missing.length) {
    const data = await requestJson<{ ways: Record<string, WayInfo> }>(`/api/transit?op=ways&ids=${missing.join(',')}`, { timeoutMs: 15_000 });
    for (const id of missing) cache.set(id, data.ways?.[String(id)] ?? null);
  }
  const out: WayMap = {};
  for (const id of ids) {
    const info = cache.get(id);
    if (info) out[id] = info;
  }
  return out;
}
