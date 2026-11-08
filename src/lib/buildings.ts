import type { Building, LocationPreset, ScheduleEvent } from '../types';
import { CAMPUS_BUILDINGS, FACULTIES, facultyById, type Faculty } from './campus';
import { foldDiacritics, normalizeKey } from './text';

/** Výchozí budovy = katalog pražských fakult a škol (lib/campus); upravitelné v Nastavení → Škola a budovy. */
export const DEFAULT_BUILDINGS: Building[] = CAMPUS_BUILDINGS;

/** Výchozí body pro simulaci polohy a záložní polohu bez GPS. */
export const LOCATION_PRESETS: LocationPreset[] = [
  { id: 'centrum', label: 'Praha – centrum (Můstek)', coords: { lat: 50.08385, lng: 14.42345 } },
  { id: 'hlavak', label: 'Hlavní nádraží', coords: { lat: 50.0831, lng: 14.4351 } },
  { id: 'andel', label: 'Anděl', coords: { lat: 50.0712, lng: 14.4031 } },
  { id: 'dejvicka', label: 'Dejvická', coords: { lat: 50.1006, lng: 14.3918 } },
  { id: 'florenc', label: 'Florenc', coords: { lat: 50.0911, lng: 14.4388 } },
  { id: 'kajetanka', label: 'Kolej Kajetánka (Břevnov)', coords: { lat: 50.0875, lng: 14.3713 } },
  { id: 'hvezda', label: 'Kolej Hvězda (Praha 6)', coords: { lat: 50.0851, lng: 14.3494 } },
  { id: 'strahov', label: 'Koleje Strahov', coords: { lat: 50.0811, lng: 14.3897 } },
  { id: 'jednota', label: 'Kolej Jednota (Opletalova)', coords: { lat: 50.0868, lng: 14.4354 } },
  { id: 'trojska', label: 'Koleje v Troji (17. listopadu)', coords: { lat: 50.1163, lng: 14.443 } },
];

export function findPreset(id: string): LocationPreset {
  return LOCATION_PRESETS.find((p) => p.id === id) ?? LOCATION_PRESETS[0];
}

/** Odhad fakulty podle budov, kde se podle rozvrhu učí (nejčastější vyhrává). */
export function detectFaculty(events: Pick<ScheduleEvent, 'location' | 'kind'>[], buildings: Building[], aliases: Record<string, string> = {}): { faculty: Faculty; matches: number } | null {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.kind === 'personal') continue;
    const b = resolveBuilding(e.location, buildings, aliases).building;
    if (!b) continue;
    const owners = FACULTIES.filter((f) => f.buildings.includes(b.id));
    // Sdílené budovy (Jinonice: FSV i FF) se počítají napůl.
    for (const f of owners) counts.set(f.id, (counts.get(f.id) ?? 0) + 1 / owners.length);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 2) return null;
  const faculty = facultyById(top[0]);
  return faculty ? { faculty, matches: Math.round(top[1]) } : null;
}

export interface BuildingMatch {
  building?: Building;
  room?: string;
  matchedBy?: 'custom' | 'alias' | 'room' | 'name';
}

const ROOM_TOKEN_RE = /\b([A-Z]{1,3}\s?-?\d{1,4}[A-Z]?)\b/g;

function compileRoomPattern(pattern?: string): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

/** Vytáhne kód místnosti z textu lokace (např. „H212 (Hollar)“ → „H212“). */
export function extractRoom(location: string): string | undefined {
  ROOM_TOKEN_RE.lastIndex = 0;
  const m = ROOM_TOKEN_RE.exec(location);
  if (m) return m[1].replace(/[\s-]/g, '');
  const numeric = /\b(?:m\.|místnost|mistnost|uč\.|učebna|ucebna)\s*([A-Z]?\d{1,4}[A-Z]?)\b/i.exec(location);
  return numeric ? numeric[1].toUpperCase() : undefined;
}

/**
 * Namapuje text lokace z rozvrhu na budovu:
 * 1) ruční mapování uživatele, 2) aliasy (název, ulice), 3) vzor kódu místnosti.
 */
export function resolveBuilding(
  location: string | undefined,
  buildings: Building[],
  aliases: Record<string, string> = {},
): BuildingMatch {
  if (!location || !location.trim()) return {};
  const room = extractRoom(location);
  const key = normalizeKey(location);
  const customId = aliases[key];
  if (customId) {
    const building = buildings.find((b) => b.id === customId);
    if (building) return { building, room, matchedBy: 'custom' };
  }
  const folded = foldDiacritics(location);
  for (const building of buildings) {
    if (building.aliases.some((alias) => alias && folded.includes(foldDiacritics(alias)))) {
      return { building, room, matchedBy: 'alias' };
    }
  }
  for (const building of buildings) {
    if (folded.includes(foldDiacritics(building.name))) return { building, room, matchedBy: 'name' };
  }
  if (room) {
    for (const building of buildings) {
      const re = compileRoomPattern(building.roomPattern);
      if (re && re.test(room)) return { building, room, matchedBy: 'room' };
    }
  }
  return { room };
}

export function locationAliasKey(location: string): string {
  return normalizeKey(location);
}
