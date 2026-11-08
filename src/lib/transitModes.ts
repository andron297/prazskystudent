/**
 * Čím student chce jezdit: metro, tramvaj, autobus, vlak, přívoz, lanovka.
 * Nevyplněný nebo úplný výběr = vším (parametr se pak neposílá).
 */
import type { TransitMode } from '../types';

export const MODE_CHOICES: { id: TransitMode; label: string }[] = [
  { id: 'metro', label: 'Metro' },
  { id: 'tram', label: 'Tramvaj' },
  { id: 'bus', label: 'Autobus' },
  { id: 'train', label: 'Vlak' },
  { id: 'ferry', label: 'Přívoz' },
  { id: 'funicular', label: 'Lanovka' },
];

const ALL: TransitMode[] = MODE_CHOICES.map((m) => m.id);

/** Výběr bez trolejbusu (jezdí jako autobus) a bez duplicit, v pevném pořadí. */
export function normalizeModes(modes?: TransitMode[] | null): TransitMode[] {
  if (!modes || modes.length === 0) return ALL;
  const set = new Set<TransitMode>(modes.map((m) => (m === 'trolleybus' ? 'bus' : m)));
  const out = ALL.filter((m) => set.has(m));
  return out.length ? out : ALL;
}

/** Hodnota parametru `modes` pro /api/transit, nebo null (= vším). */
export function modesParam(modes?: TransitMode[] | null): string | null {
  const list = normalizeModes(modes);
  return list.length === ALL.length ? null : list.join(',');
}

/** Vypnout/zapnout prostředek – aspoň jeden musí zůstat. */
export function toggleMode(modes: TransitMode[] | undefined, mode: TransitMode): TransitMode[] {
  const list = normalizeModes(modes);
  const next = list.includes(mode) ? list.filter((m) => m !== mode) : [...list, mode];
  return next.length ? normalizeModes(next) : list;
}

/** Krátký popis výběru („vším“, „bez metra“, „jen tramvají a autobusem“). */
export function modesSummary(modes?: TransitMode[] | null): string {
  const list = normalizeModes(modes);
  if (list.length === ALL.length) return 'vším';
  const missing = ALL.filter((m) => !list.includes(m));
  const NO: Record<TransitMode, string> = { metro: 'metra', tram: 'tramvají', bus: 'autobusů', train: 'vlaků', ferry: 'přívozů', funicular: 'lanovky', trolleybus: 'trolejbusů' };
  if (missing.length <= 2) return `bez ${missing.map((m) => NO[m]).join(' a ')}`;
  return `jen ${list.map((m) => MODE_CHOICES.find((c) => c.id === m)!.label.toLowerCase()).join(', ')}`;
}
