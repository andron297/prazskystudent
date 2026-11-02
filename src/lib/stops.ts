/**
 * Zastávky PID: dekódování kompaktního datasetu (public/data/stops-praha.json),
 * hledání podle názvu bez diakritiky a nejbližší zastávky podle pěší vzdálenosti.
 */
import type { LatLng, TransitMode, WalkSpeed } from '../types';
import { haversineMeters, walkingMinutes } from './geo';
import { foldDiacritics } from './text';

export interface StopLine {
  name: string;
  mode: TransitMode;
  night: boolean;
}

export interface PlatformService {
  line: string;
  mode: TransitMode;
  night: boolean;
  direction?: string;
}

export interface StopPlatform {
  coords: LatLng;
  gtfsId: string;
  code: string;
  accessible: boolean;
  serves: PlatformService[];
}

export interface StopGroup {
  /** Stabilní identifikátor = název (v Praze jsou názvy skupin unikátní). */
  id: string;
  name: string;
  coords: LatLng;
  mainMode: TransitMode;
  lines: StopLine[];
  platforms: StopPlatform[];
  accessible: boolean;
  /** Název bez diakritiky pro hledání. */
  search: string;
}

export interface RawStopsFile {
  generatedAt?: string;
  source?: string;
  d: string[];
  groups: { n: string; y: number; x: number; t: string; l: string[]; p: [number, number, string, string, number, number[]][] }[];
}

const MODE_BY_CODE: Record<string, TransitMode> = { t: 'tram', m: 'metro', b: 'bus', r: 'train', y: 'trolleybus', f: 'ferry', u: 'funicular' };
const MAIN_MODE: Record<string, TransitMode> = { tram: 'tram', metro: 'metro', bus: 'bus', train: 'train', trolleybus: 'trolleybus', ferry: 'ferry', funicular: 'funicular' };

function decodeLine(key: string): StopLine {
  const i = key.lastIndexOf(':');
  const name = key.slice(0, i);
  const code = key.slice(i + 1);
  return { name, mode: MODE_BY_CODE[code.charAt(0)] ?? 'bus', night: code.endsWith('n') };
}

export function decodeStops(raw: RawStopsFile): StopGroup[] {
  return raw.groups.map((g) => {
    const lines = g.l.map(decodeLine);
    const platforms: StopPlatform[] = g.p.map(([lat, lon, gtfsId, code, accessible, served]) => {
      const serves: PlatformService[] = [];
      for (let i = 0; i + 1 < served.length; i += 2) {
        const line = lines[served[i]];
        if (!line) continue;
        serves.push({ line: line.name, mode: line.mode, night: line.night, direction: served[i + 1] >= 0 ? raw.d[served[i + 1]] : undefined });
      }
      return { coords: { lat, lng: lon }, gtfsId, code, accessible: accessible === 1, serves };
    });
    return {
      id: g.n,
      name: g.n,
      coords: { lat: g.y, lng: g.x },
      mainMode: MAIN_MODE[g.t] ?? 'bus',
      lines,
      platforms,
      accessible: platforms.length > 0 && platforms.every((p) => p.accessible),
      search: foldDiacritics(g.n),
    };
  });
}

const MODE_ORDER: Record<TransitMode, number> = { metro: 0, train: 1, tram: 2, trolleybus: 3, bus: 4, ferry: 5, funicular: 6 };

/** Linky seřazené: metro, vlak, tram, bus; denní před nočními; čísla vzestupně. */
export function sortLines<T extends { name: string; mode: TransitMode; night: boolean }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => Number(a.night) - Number(b.night) || MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || a.name.localeCompare(b.name, 'cs', { numeric: true }));
}

export interface NearbyStop extends StopGroup {
  meters: number;
  walkMinutes: number;
}

export function nearbyStops(groups: StopGroup[], origin: LatLng, options: { walkSpeed?: WalkSpeed; maxMeters?: number; limit?: number; modes?: TransitMode[] } = {}): NearbyStop[] {
  const max = options.maxMeters ?? 1200;
  const latPad = max / 111_000;
  const lngPad = max / (111_000 * Math.cos((origin.lat * Math.PI) / 180));
  const out: NearbyStop[] = [];
  for (const g of groups) {
    if (Math.abs(g.coords.lat - origin.lat) > latPad || Math.abs(g.coords.lng - origin.lng) > lngPad) continue;
    if (options.modes && !g.lines.some((l) => options.modes!.includes(l.mode) && !l.night)) continue;
    const meters = haversineMeters(origin, g.coords);
    if (meters > max) continue;
    out.push({ ...g, meters, walkMinutes: walkingMinutes(origin, g.coords, options.walkSpeed ?? 'normal') });
  }
  return out.sort((a, b) => a.meters - b.meters).slice(0, options.limit ?? 12);
}

/** Hledání: celé slovo na začátku > začátek slova > kdekoli; kratší název dřív. */
export function searchStops(groups: StopGroup[], query: string, limit = 8): StopGroup[] {
  const q = foldDiacritics(query.trim()).replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const scored: { g: StopGroup; score: number }[] = [];
  for (const g of groups) {
    const s = g.search;
    let score = -1;
    if (s === q) score = 0;
    else if (s.startsWith(q)) score = 1;
    else if (s.includes(` ${q}`) || s.includes(`-${q}`)) score = 2;
    else if (s.includes(q)) score = 3;
    if (score >= 0) scored.push({ g, score: score * 100 + Math.min(99, s.length) });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.g);
}

export function findStop(groups: StopGroup[], name: string): StopGroup | undefined {
  const key = foldDiacritics(name);
  return groups.find((g) => g.name === name) ?? groups.find((g) => g.search === key);
}

/** Barva značky zastávky podle hlavního druhu dopravy (metro podle linky). */
export function stopColor(group: Pick<StopGroup, 'mainMode' | 'lines'>): string {
  if (group.mainMode === 'metro') {
    const metro = group.lines.find((l) => l.mode === 'metro');
    if (metro?.name === 'A') return '#1a9e5b';
    if (metro?.name === 'B') return '#e8a91a';
    if (metro?.name === 'C') return '#d22a3f';
  }
  switch (group.mainMode) {
    case 'tram':
      return '#9b2c2c';
    case 'train':
      return '#1f4e8c';
    case 'trolleybus':
      return '#7b3f8c';
    case 'ferry':
      return '#1c7c9c';
    case 'funicular':
      return '#a36f45';
    default:
      return '#2f6f8f';
  }
}

export function stopsToGeoJSON(groups: StopGroup[]) {
  return {
    type: 'FeatureCollection' as const,
    features: groups.map((g) => ({
      type: 'Feature' as const,
      id: g.id,
      properties: {
        name: g.name,
        mode: g.mainMode,
        color: stopColor(g),
        rank: g.mainMode === 'metro' ? 3 : g.mainMode === 'train' ? 2 : g.mainMode === 'tram' ? 1 : 0,
        lines: sortLines(g.lines.filter((l) => !l.night))
          .slice(0, 8)
          .map((l) => l.name)
          .join(' · '),
      },
      geometry: { type: 'Point' as const, coordinates: [g.coords.lng, g.coords.lat] },
    })),
  };
}

/** Jednotlivá nástupiště (přesná poloha z dat PID) – na mapě při velkém přiblížení. */
export function platformsToGeoJSON(groups: StopGroup[]) {
  return {
    type: 'FeatureCollection' as const,
    features: groups.flatMap((g) =>
      g.platforms
        .filter((p) => p.serves.some((s) => !s.night))
        .map((p, i) => {
          const day = p.serves.filter((s) => !s.night);
          const mode = day.some((s) => s.mode === 'metro') ? 'metro' : day.some((s) => s.mode === 'train') ? 'train' : day.some((s) => s.mode === 'tram') ? 'tram' : (day[0]?.mode ?? g.mainMode);
          return {
            type: 'Feature' as const,
            id: `${g.name}#${i}`,
            properties: {
              name: g.name,
              code: p.code,
              color: stopColor({ mainMode: mode, lines: day.map((s) => ({ name: s.line, mode: s.mode, night: false })) }),
              lines: [...new Set(day.map((s) => s.line))].slice(0, 6).join(' · '),
            },
            geometry: { type: 'Point' as const, coordinates: [p.coords.lng, p.coords.lat] },
          };
        }),
    ),
  };
}

/** Nástupiště, ze kterého linka jede daným směrem (podle směrů v datech PID). */
export function platformCode(groups: StopGroup[], stopName: string, line: string, headsign: string): string | undefined {
  const group = findStop(groups, stopName);
  if (!group) return undefined;
  const target = foldDiacritics(headsign);
  const candidates = group.platforms.filter((p) => p.code && p.serves.some((s) => s.line === line));
  if (candidates.length === 0) return undefined;
  const exact = candidates.find((p) => p.serves.some((s) => s.line === line && s.direction && foldDiacritics(s.direction) === target));
  if (exact) return exact.code;
  return candidates.length === 1 ? candidates[0].code : undefined;
}
