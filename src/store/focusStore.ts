/**
 * Soustředění (pomodoro) – stav jen v tomto zařízení.
 * Počítá se z času konce úseku (endsAt), takže běží dál i při přepnutí stránky,
 * zavření karty nebo uspání telefonu; po návratu se úsek správně uzavře.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toDateKey } from '../lib/dates';

export type FocusPhase = 'focus' | 'short' | 'long';
export type FocusPresetId = 'classic' | 'deep' | 'sprint';

export interface FocusPreset {
  id: FocusPresetId;
  label: string;
  hint: string;
  focus: number;
  short: number;
  long: number;
  rounds: number;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: 'classic', label: '25 / 5', hint: 'Klasické pomodoro', focus: 25, short: 5, long: 15, rounds: 4 },
  { id: 'deep', label: '50 / 10', hint: 'Hluboká práce', focus: 50, short: 10, long: 20, rounds: 3 },
  { id: 'sprint', label: '15 / 3', hint: 'Rychlý sprint', focus: 15, short: 3, long: 10, rounds: 4 },
];

export interface FocusDay {
  minutes: number;
  blocks: number;
}

interface FocusState {
  presetId: FocusPresetId;
  phase: FocusPhase;
  /** Běží: čas konce úseku (ms od epochy). */
  endsAt: number | null;
  /** Pozastaveno: kolik ms zbývá. */
  pausedLeft: number | null;
  /** Hotová soustředění v aktuální sadě. */
  round: number;
  autoNext: boolean;
  sound: boolean;
  /** Na čem se pracuje (úkol nebo vlastní text). */
  focusOn: { taskId?: string; title: string } | null;
  /** Den (YYYY-MM-DD) → minuty soustředění a počet bloků; drží se 60 dní. */
  stats: Record<string, FocusDay>;
  /** Kdy naposledy skončil úsek (pro jemné upozornění v aplikaci). */
  lastFinished: { phase: FocusPhase; at: number } | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  finish: (at?: number) => void;
  setPreset: (id: FocusPresetId) => void;
  setFocusOn: (value: FocusState['focusOn']) => void;
  setAutoNext: (value: boolean) => void;
  setSound: (value: boolean) => void;
}

export function presetOf(id: FocusPresetId): FocusPreset {
  return FOCUS_PRESETS.find((p) => p.id === id) ?? FOCUS_PRESETS[0];
}

export function phaseMinutes(preset: FocusPreset, phase: FocusPhase): number {
  return phase === 'focus' ? preset.focus : phase === 'short' ? preset.short : preset.long;
}

function trimStats(stats: Record<string, FocusDay>, now: Date): Record<string, FocusDay> {
  const limit = toDateKey(new Date(now.getTime() - 60 * 86_400_000));
  return Object.fromEntries(Object.entries(stats).filter(([day]) => day >= limit));
}

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      presetId: 'classic',
      phase: 'focus',
      endsAt: null,
      pausedLeft: null,
      round: 0,
      autoNext: true,
      sound: true,
      focusOn: null,
      stats: {},
      lastFinished: null,
      start: () => {
        const s = get();
        const left = s.pausedLeft ?? phaseMinutes(presetOf(s.presetId), s.phase) * 60_000;
        set({ endsAt: Date.now() + left, pausedLeft: null });
      },
      pause: () => {
        const s = get();
        if (!s.endsAt) return;
        set({ pausedLeft: Math.max(0, s.endsAt - Date.now()), endsAt: null });
      },
      reset: () => set({ phase: 'focus', endsAt: null, pausedLeft: null, round: 0 }),
      skip: () => {
        const s = get();
        const preset = presetOf(s.presetId);
        const next: FocusPhase = s.phase === 'focus' ? (s.round + 1 >= preset.rounds ? 'long' : 'short') : 'focus';
        const round = s.phase === 'focus' ? Math.min(preset.rounds, s.round + 1) : s.phase === 'long' ? 0 : s.round;
        const running = Boolean(s.endsAt);
        set({ phase: next, round, pausedLeft: null, endsAt: running ? Date.now() + phaseMinutes(preset, next) * 60_000 : null });
      },
      finish: (at = Date.now()) => {
        const s = get();
        const preset = presetOf(s.presetId);
        const finishedAt = s.endsAt ?? at;
        let stats = s.stats;
        let round = s.round;
        if (s.phase === 'focus') {
          const day = toDateKey(new Date(finishedAt));
          const prev = stats[day] ?? { minutes: 0, blocks: 0 };
          stats = trimStats({ ...stats, [day]: { minutes: prev.minutes + preset.focus, blocks: prev.blocks + 1 } }, new Date(at));
          round = Math.min(preset.rounds, round + 1);
        } else if (s.phase === 'long') {
          round = 0;
        }
        const next: FocusPhase = s.phase === 'focus' ? (round >= preset.rounds ? 'long' : 'short') : 'focus';
        // Pokračovat samo jen tehdy, když od konce úseku neuplynula dlouhá doba (aplikace byla zavřená).
        const fresh = at - finishedAt < 2 * 60_000;
        const auto = s.autoNext && fresh;
        set({
          phase: next,
          round,
          stats,
          lastFinished: { phase: s.phase, at: finishedAt },
          endsAt: auto ? at + phaseMinutes(preset, next) * 60_000 : null,
          pausedLeft: null,
        });
      },
      setPreset: (presetId) => set({ presetId, phase: 'focus', endsAt: null, pausedLeft: null, round: 0 }),
      setFocusOn: (focusOn) => set({ focusOn }),
      setAutoNext: (autoNext) => set({ autoNext }),
      setSound: (sound) => set({ sound }),
    }),
    {
      name: 'stihnu:focus',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ presetId: s.presetId, phase: s.phase, endsAt: s.endsAt, pausedLeft: s.pausedLeft, round: s.round, autoNext: s.autoNext, sound: s.sound, focusOn: s.focusOn, stats: s.stats }),
    },
  ),
);

/** Kolik ms zbývá v aktuálním úseku (běžícím, pozastaveném i nespuštěném). */
export function focusLeft(s: Pick<FocusState, 'endsAt' | 'pausedLeft' | 'phase' | 'presetId'>, now = Date.now()): number {
  if (s.endsAt) return Math.max(0, s.endsAt - now);
  if (s.pausedLeft !== null) return s.pausedLeft;
  return phaseMinutes(presetOf(s.presetId), s.phase) * 60_000;
}

/** Dnešní minuty a série dní se soustředěním (včetně dneška, pokud už nějaké je). */
export function focusSummary(stats: Record<string, FocusDay>, now = new Date()): { today: FocusDay; streak: number; week: number } {
  const today = stats[toDateKey(now)] ?? { minutes: 0, blocks: 0 };
  let streak = 0;
  for (let i = today.blocks > 0 ? 0 : 1; i < 60; i++) {
    const day = stats[toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))];
    if (day && day.blocks > 0) streak++;
    else break;
  }
  let week = 0;
  for (let i = 0; i < 7; i++) week += stats[toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))]?.minutes ?? 0;
  return { today, streak, week };
}
