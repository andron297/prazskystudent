/**
 * Nástupiště PID pro plánovač: rychlé hledání podle GTFS id, nástupiště
 * v okolí bodu (s chůzí k přesnému nástupišti, ne ke středu zastávky)
 * a výběr nejlepšího místa pro výstup ze spoje.
 */
import type { LatLng, WalkSpeed } from '../types';
import { haversineMeters, walkingMinutes } from './geo';
import type { StopGroup, StopPlatform } from './stops';

export interface PlatformRef {
  group: StopGroup;
  platform: StopPlatform;
}

export interface CandidatePlatform extends PlatformRef {
  meters: number;
  /** Minuty chůze mezi bodem a nástupištěm. */
  walk: number;
}

/** Zastávkové časy jednoho spoje (podmnožina GTFS stop_times). */
export interface StopTimeLike {
  stopId: string;
  arrivalSec: number;
  departureSec: number;
}

const indexCache = new WeakMap<StopGroup[], Map<string, PlatformRef>>();

export function platformIndex(groups: StopGroup[]): Map<string, PlatformRef> {
  const cached = indexCache.get(groups);
  if (cached) return cached;
  const index = new Map<string, PlatformRef>();
  for (const group of groups) {
    for (const platform of group.platforms) if (platform.gtfsId) index.set(platform.gtfsId, { group, platform });
  }
  indexCache.set(groups, index);
  return index;
}

/** PID používá id s „P“ na konci i bez něj (U483Z1P / U483Z1). */
export function lookupPlatform(index: Map<string, PlatformRef>, stopId: string): PlatformRef | undefined {
  return index.get(stopId) ?? index.get(stopId.endsWith('P') ? stopId.slice(0, -1) : `${stopId}P`);
}

const isDaytime = (p: StopPlatform) => p.serves.some((s) => !s.night);

/** Nástupiště (s denními linkami) do `maxMeters` od bodu, od nejbližšího. */
export function platformsNear(groups: StopGroup[], point: LatLng, options: { maxMeters?: number; walkSpeed?: WalkSpeed } = {}): CandidatePlatform[] {
  const max = options.maxMeters ?? 1000;
  // Nástupiště bývají i pár set metrů od středu skupiny – hrubý filtr proto s rezervou.
  const latPad = (max + 600) / 111_000;
  const lngPad = (max + 600) / (111_000 * Math.cos((point.lat * Math.PI) / 180));
  const out: CandidatePlatform[] = [];
  for (const group of groups) {
    if (Math.abs(group.coords.lat - point.lat) > latPad || Math.abs(group.coords.lng - point.lng) > lngPad) continue;
    for (const platform of group.platforms) {
      if (!isDaytime(platform)) continue;
      const meters = haversineMeters(point, platform.coords);
      if (meters > max) continue;
      out.push({ group, platform, meters, walk: walkingMinutes(point, platform.coords, options.walkSpeed ?? 'normal') });
    }
  }
  return out.sort((a, b) => a.meters - b.meters);
}

/** Nástupiště jedné zastávky (zvolené studentem) s chůzí z bodu. */
export function platformsOf(group: StopGroup, point: LatLng, walkSpeed: WalkSpeed = 'normal'): CandidatePlatform[] {
  return group.platforms
    .filter(isDaytime)
    .map((platform) => ({ group, platform, meters: haversineMeters(point, platform.coords), walk: walkingMinutes(point, platform.coords, walkSpeed) }))
    .sort((a, b) => a.meters - b.meters);
}

/** Linky (denní), které staví na daných nástupištích. */
export function linesServed(candidates: CandidatePlatform[]): Set<string> {
  const lines = new Set<string>();
  for (const c of candidates) for (const s of c.platform.serves) if (!s.night) lines.add(s.line);
  return lines;
}

/** Zastávky skupin od nejbližší (podle nejbližšího nástupiště). */
export function nearestGroups(candidates: CandidatePlatform[], limit: number): StopGroup[] {
  const seen = new Set<string>();
  const out: StopGroup[] = [];
  for (const c of candidates) {
    if (seen.has(c.group.name)) continue;
    seen.add(c.group.name);
    out.push(c.group);
    if (out.length >= limit) break;
  }
  return out;
}

export function stopIndexOf(times: StopTimeLike[], stopId: string, from = 0): number {
  const alt = stopId.endsWith('P') ? stopId.slice(0, -1) : `${stopId}P`;
  for (let i = from; i < times.length; i++) if (times[i].stopId === stopId || times[i].stopId === alt) return i;
  return -1;
}

export interface Alight {
  index: number;
  /** Jízda od nástupu po výstup (s). */
  rideSec: number;
  candidate: CandidatePlatform;
}

/**
 * Minuta chůze „stojí“ víc než minuta jízdy (odhad chůze je nejistý, s taškou
 * do kopce, v dešti…) – jako „walk reluctance“ v plánovačích typu OpenTripPlanner.
 */
export const WALK_RELUCTANCE = 2;

/**
 * Nejlepší výstup ze spoje: ze všech dalších zastávek u cíle ta s nejlepším
 * poměrem jízdy a chůze do budovy – ne první, na kterou spoj dojede, ale ani
 * vzdálená zastávka, odkud by se šlo 13 minut pěšky kvůli minutě úspory.
 */
export function bestAlight(times: StopTimeLike[], originIndex: number, destination: Map<string, CandidatePlatform>): Alight | null {
  const origin = times[originIndex];
  if (!origin || !Number.isFinite(origin.departureSec)) return null;
  let best: Alight | null = null;
  let bestTotal = Number.POSITIVE_INFINITY;
  for (let k = originIndex + 1; k < times.length; k++) {
    const candidate = destination.get(times[k].stopId) ?? destination.get(times[k].stopId.endsWith('P') ? times[k].stopId.slice(0, -1) : `${times[k].stopId}P`);
    if (!candidate) continue;
    const rideSec = times[k].arrivalSec - origin.departureSec;
    if (!Number.isFinite(rideSec) || rideSec <= 0) continue;
    const total = rideSec + candidate.walk * 60 * WALK_RELUCTANCE;
    // Při shodě vyhraje kratší chůze (méně nejistoty).
    if (total < bestTotal || (total === bestTotal && best && candidate.walk < best.candidate.walk)) {
      best = { index: k, rideSec, candidate };
      bestTotal = total;
    }
  }
  return best;
}
