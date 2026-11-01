/**
 * Hodiny aplikace. V demo režimu běží simulovaný čas, který při startu vždy
 * začíná ve 13:05 – takže odpočet k semináři ve 14:00 je vidět kdykoli.
 */
import { create } from 'zustand';

export const DEMO_START: [number, number] = [13, 5];

interface ClockState {
  offsetMs: number;
  simulated: boolean;
  startSimulation: () => void;
  switchToRealTime: () => void;
  shiftMinutes: (minutes: number) => void;
}

function demoOffset(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEMO_START[0], DEMO_START[1], 0, 0);
  return target.getTime() - now.getTime();
}

export const useClockStore = create<ClockState>()((set) => ({
  offsetMs: 0,
  simulated: false,
  startSimulation: () => set({ offsetMs: demoOffset(), simulated: true }),
  switchToRealTime: () => set({ offsetMs: 0, simulated: false }),
  shiftMinutes: (minutes) => set((s) => ({ offsetMs: s.offsetMs + minutes * 60_000, simulated: true })),
}));

/** Aktuální čas aplikace (simulovaný v demu, jinak reálný). */
export function appNow(): Date {
  return new Date(Date.now() + useClockStore.getState().offsetMs);
}
