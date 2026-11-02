import type { Building, LocationPreset } from '../types';
import { foldDiacritics, normalizeKey } from './text';

/**
 * Výchozí budovy (upravitelné v Nastavení). Souřadnice jsou orientační,
 * cílové zastávky mají pěší čas do budovy – vstup pro zpětný výpočet trasy.
 */
export const DEFAULT_BUILDINGS: Building[] = [
  {
    id: 'hollar',
    locative: 'na Hollaru',
    name: 'Hollar',
    faculty: 'FSV UK',
    address: 'Smetanovo nábřeží 6, 110 00 Praha 1',
    coords: { lat: 50.0843, lng: 14.4136 },
    aliases: ['hollar', 'smetanovo nabr', 'smetanovo nabrezi'],
    roomPattern: '^H\\d{1,4}[A-Z]?$',
    arrivalStops: [
      { name: 'Karlovy lázně', walkMinutes: 2, lines: ['2', '17', '18'] },
      { name: 'Národní divadlo', walkMinutes: 4, lines: ['2', '9', '17', '18', '22', '23'] },
      { name: 'Staroměstská', walkMinutes: 7, lines: ['A'] },
      { name: 'Národní třída', walkMinutes: 8, lines: ['B'] },
    ],
  },
  {
    id: 'jinonice',
    locative: 'v Jinonicích',
    name: 'Areál Jinonice',
    faculty: 'FSV UK · FF UK',
    address: 'U Kříže 8, 158 00 Praha 5',
    coords: { lat: 50.0566, lng: 14.3731 },
    aliases: ['jinonice', 'u krize'],
    roomPattern: '^J\\d{2,4}[A-Z]?$',
    arrivalStops: [{ name: 'Jinonice', walkMinutes: 7, lines: ['B'] }],
  },
  {
    id: 'opletalova',
    locative: 'v Opletalově',
    name: 'Opletalova',
    faculty: 'FSV UK',
    address: 'Opletalova 26, 110 00 Praha 1',
    coords: { lat: 50.0822, lng: 14.4296 },
    aliases: ['opletalova'],
    arrivalStops: [
      { name: 'Hlavní nádraží', walkMinutes: 5, lines: ['C'] },
      { name: 'Muzeum', walkMinutes: 6, lines: ['A', 'C'] },
      { name: 'Můstek', walkMinutes: 9, lines: ['A', 'B'] },
    ],
  },
  {
    id: 'karolinum',
    locative: 'v Karolinu',
    name: 'Karolinum',
    faculty: 'UK',
    address: 'Ovocný trh 560/5, 116 36 Praha 1',
    coords: { lat: 50.0866, lng: 14.4238 },
    aliases: ['karolinum', 'ovocny trh'],
    arrivalStops: [
      { name: 'Můstek', walkMinutes: 5, lines: ['A', 'B'] },
      { name: 'Náměstí Republiky', walkMinutes: 6, lines: ['B'] },
    ],
  },
  {
    id: 'ff-palach',
    locative: 'na FF UK',
    name: 'FF UK – nám. Jana Palacha',
    faculty: 'FF UK',
    address: 'nám. Jana Palacha 1/2, 116 38 Praha 1',
    coords: { lat: 50.0889, lng: 14.4155 },
    aliases: ['jana palacha', 'palachovo nam', 'ff uk'],
    arrivalStops: [{ name: 'Staroměstská', walkMinutes: 2, lines: ['A', '2', '17', '18'] }],
  },
  {
    id: 'pf',
    locative: 'na Právnické fakultě',
    name: 'PF UK',
    faculty: 'PF UK',
    address: 'nám. Curieových 901/7, 116 40 Praha 1',
    coords: { lat: 50.0921, lng: 14.4176 },
    aliases: ['curieovych', 'pravnicka fakulta', 'pf uk'],
    arrivalStops: [{ name: 'Staroměstská', walkMinutes: 6, lines: ['A', '2', '17', '18'] }],
  },
  {
    id: 'albertov',
    locative: 'na Albertově',
    name: 'PřF UK – Albertov',
    faculty: 'PřF UK',
    address: 'Albertov 6, 128 00 Praha 2',
    coords: { lat: 50.0681, lng: 14.4240 },
    aliases: ['albertov', 'prf uk'],
    arrivalStops: [{ name: 'Albertov', walkMinutes: 2, lines: ['7', '14', '18', '24'] }],
  },
  {
    id: 'mff-malastrana',
    locative: 'na Malé Straně',
    name: 'MFF UK – Malá Strana',
    faculty: 'MFF UK',
    address: 'Malostranské nám. 25, 118 00 Praha 1',
    coords: { lat: 50.0882, lng: 14.4033 },
    aliases: ['malostranske nam', 'mala strana'],
    roomPattern: '^S\\d{1,2}$',
    arrivalStops: [{ name: 'Malostranské náměstí', walkMinutes: 1, lines: ['12', '15', '20', '22', '23'] }],
  },
  {
    id: 'mff-karlov',
    locative: 'na Karlově',
    name: 'MFF UK – Karlov',
    faculty: 'MFF UK',
    address: 'Ke Karlovu 3, 121 16 Praha 2',
    coords: { lat: 50.0717, lng: 14.4245 },
    aliases: ['ke karlovu', 'karlov'],
    arrivalStops: [{ name: 'I. P. Pavlova', walkMinutes: 7, lines: ['C', '4', '6', '10', '16', '22'] }],
  },
];

/** Výchozí body pro simulaci polohy a záložní polohu bez GPS. */
export const LOCATION_PRESETS: LocationPreset[] = [
  { id: 'kajetanka', label: 'Kolej Kajetánka (Břevnov)', coords: { lat: 50.0862, lng: 14.3712 } },
  { id: 'hvezda', label: 'Kolej Hvězda (Praha 6)', coords: { lat: 50.0818, lng: 14.3422 } },
  { id: 'jednota', label: 'Kolej Jednota (Opletalova)', coords: { lat: 50.0828, lng: 14.4318 } },
  { id: 'andel', label: 'Anděl', coords: { lat: 50.0712, lng: 14.4031 } },
  { id: 'dejvicka', label: 'Dejvická', coords: { lat: 50.1006, lng: 14.3918 } },
  { id: 'florenc', label: 'Florenc', coords: { lat: 50.0911, lng: 14.4388 } },
];

export function findPreset(id: string): LocationPreset {
  return LOCATION_PRESETS.find((p) => p.id === id) ?? LOCATION_PRESETS[0];
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
