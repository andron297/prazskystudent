/**
 * Testovací režim (jen účet správce): simulovaná poloha, chůze v navigaci,
 * počasí a čas. Ukládá se jen v tomto zařízení a nikam se neposílá.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useAccount } from '../services/account';
import type { LatLng } from '../types';
import { useAppStore } from './appStore';
import { useClockStore } from './clockStore';

/** Účty, kterým se testovací režim ukáže. */
export const OWNER_EMAILS = ['andrleondrej@gmail.com'];

export function isOwnerEmail(email: string | null | undefined): boolean {
  return Boolean(email && OWNER_EMAILS.includes(email.trim().toLowerCase()));
}

export interface SimWeather {
  code: number;
  temp: number;
  feels: number;
  precipProb: number;
  label: string;
}

interface TestState {
  gps: (LatLng & { label: string }) | null;
  /** V navigaci se chodec pohybuje sám po trase. */
  walkSim: boolean;
  /** Rychlost simulované chůze (m/s). */
  walkSpeed: number;
  weather: SimWeather | null;
  /** Uložený simulovaný čas (pro obnovení po načtení stránky). */
  clock: { offsetMs: number; speed: number } | null;
  setGps: (gps: TestState['gps']) => void;
  setWalkSim: (on: boolean, speed?: number) => void;
  setWeather: (weather: SimWeather | null) => void;
  saveClock: () => void;
  reset: () => void;
}

export const useTestStore = create<TestState>()(
  persist(
    (set) => ({
      gps: null,
      walkSim: false,
      walkSpeed: 4,
      weather: null,
      clock: null,
      setGps: (gps) => set({ gps }),
      setWalkSim: (walkSim, speed) => set((s) => ({ walkSim, walkSpeed: speed ?? s.walkSpeed })),
      setWeather: (weather) => set({ weather }),
      saveClock: () => {
        const c = useClockStore.getState();
        const real = Date.now();
        const offset = c.offsetMs + (c.speed - 1) * Math.max(0, real - c.speedFrom);
        set({ clock: offset === 0 && c.speed === 1 ? null : { offsetMs: offset, speed: c.speed } });
      },
      reset: () => {
        useClockStore.getState().switchToRealTime();
        set({ gps: null, walkSim: false, weather: null, clock: null });
      },
    }),
    { name: 'stihnu:test', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** Běží nějaká simulace? (pro výrazný štítek v hlavičce) */
export function activeSimulations(s: Pick<TestState, 'gps' | 'walkSim' | 'weather' | 'clock'>): string[] {
  const out: string[] = [];
  if (s.clock) out.push('čas');
  if (s.gps) out.push('poloha');
  if (s.walkSim) out.push('chůze');
  if (s.weather) out.push('počasí');
  return out;
}

/** Testovací režim smí jen správce – podle přihlášeného účtu. */
export function isTestOwner(): boolean {
  return isOwnerEmail(useAccount.getState().user?.email);
}

/** Obnoví uložený simulovaný čas správce (jen u vlastních dat; ukázka má své hodiny). */
export function applySavedTestClock(): void {
  const saved = useTestStore.getState().clock;
  if (!saved || !isTestOwner() || useAppStore.getState().settings.mode === 'demo') return;
  useClockStore.getState().restore(saved);
}

/**
 * Hlídá testovací režim: správci po přihlášení obnoví simulovaný čas, komukoli
 * jinému všechny simulace vypne (třeba po odhlášení na sdíleném počítači).
 */
export function useTestModeGuard(): void {
  const status = useAccount((s) => s.status);
  const email = useAccount((s) => s.user?.email ?? null);
  useEffect(() => {
    if (status === 'loading') return;
    const t = useTestStore.getState();
    if (isOwnerEmail(email)) {
      applySavedTestClock();
      return;
    }
    if (status === 'ready' || status === 'off' || status === 'signedOut') {
      if (activeSimulations(t).length > 0) {
        const hadClock = Boolean(t.clock);
        t.reset();
        if (!hadClock) return;
        // Ukázka si hodiny nastaví sama; u vlastních dat zpět na reálný čas.
        if (useAppStore.getState().settings.mode === 'demo') {
          if (useAppStore.getState().settings.demoClock) useClockStore.getState().startSimulation();
        }
      }
    }
  }, [status, email]);

  // Zrychlený čas: při odchodu ze stránky uložit, kde právě je.
  useEffect(() => {
    const save = () => {
      if (isOwnerEmail(useAccount.getState().user?.email) && useTestStore.getState().clock) useTestStore.getState().saveClock();
    };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, []);
}
