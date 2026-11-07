/**
 * Hodiny aplikace. V demo režimu běží simulovaný čas, který při startu vždy
 * začíná ve 13:05 – takže odpočet k semináři ve 14:00 je vidět kdykoli.
 * Testovací režim (jen účet správce) umí čas posunout i zrychlit.
 */
import { create } from 'zustand';

export const DEMO_START: [number, number] = [13, 5];

interface ClockState {
  offsetMs: number;
  simulated: boolean;
  /** Zrychlení času (1 = reálně). */
  speed: number;
  /** Reálný okamžik, od kdy běží zrychlení. */
  speedFrom: number;
  startSimulation: () => void;
  switchToRealTime: () => void;
  shiftMinutes: (minutes: number) => void;
  /** Nastaví čas aplikace na daný okamžik (běží dál od něj). */
  setNow: (date: Date) => void;
  setSpeed: (speed: number) => void;
  /** Obnoví uložený simulovaný čas (testovací režim po načtení stránky). */
  restore: (saved: { offsetMs: number; speed: number }) => void;
}

function demoOffset(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEMO_START[0], DEMO_START[1], 0, 0);
  return target.getTime() - now.getTime();
}

/** Posun hodin aplikace proti reálnému času v okamžiku `real`. */
export function clockOffsetAt(s: Pick<ClockState, 'offsetMs' | 'speed' | 'speedFrom'>, real: number): number {
  return s.offsetMs + (s.speed - 1) * Math.max(0, real - s.speedFrom);
}

export const useClockStore = create<ClockState>()((set, get) => ({
  offsetMs: 0,
  simulated: false,
  speed: 1,
  speedFrom: Date.now(),
  startSimulation: () => set({ offsetMs: demoOffset(), simulated: true, speed: 1, speedFrom: Date.now() }),
  switchToRealTime: () => set({ offsetMs: 0, simulated: false, speed: 1, speedFrom: Date.now() }),
  shiftMinutes: (minutes) => {
    const real = Date.now();
    set({ offsetMs: clockOffsetAt(get(), real) + minutes * 60_000, speedFrom: real, simulated: true });
  },
  setNow: (date) => {
    const real = Date.now();
    set({ offsetMs: date.getTime() - real, speedFrom: real, simulated: true });
  },
  setSpeed: (speed) => {
    const real = Date.now();
    set({ offsetMs: clockOffsetAt(get(), real), speed: Math.max(1, speed), speedFrom: real, simulated: get().simulated || speed > 1 });
  },
  restore: ({ offsetMs, speed }) => set({ offsetMs, speed: Math.max(1, speed), speedFrom: Date.now(), simulated: true }),
}));

/** Aktuální čas aplikace (simulovaný v demu nebo v testovacím režimu, jinak reálný). */
export function appNow(): Date {
  const real = Date.now();
  return new Date(real + clockOffsetAt(useClockStore.getState(), real));
}
