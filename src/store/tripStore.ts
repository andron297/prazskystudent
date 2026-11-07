/**
 * Spoj, kterým se student rozhodl jet („Pojedu tímto“). Platí pro konkrétní
 * výuku (odpočet na hlavní stránce se pak řídí tímto spojem), nebo jako
 * samostatná cesta (třeba domů nebo do menzy). Ukládá se jen v tomto zařízení
 * a po příjezdu se sama zapomene.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Itinerary, LatLng } from '../types';
import { catchability, tripKey } from '../lib/journeyRank';

export interface PlannedTrip {
  itinerary: Itinerary;
  /** Kam (název cíle). */
  label: string;
  coords?: LatLng;
  /** Výuka, ke které spoj patří. */
  eventId?: string;
  chosenAt: string;
}

interface TripState {
  /** Volby k výukám (klíč = id události). */
  byEvent: Record<string, PlannedTrip>;
  /** Samostatná naplánovaná cesta (domů, do menzy…). */
  adhoc: PlannedTrip | null;
  choose: (trip: Omit<PlannedTrip, 'chosenAt'>) => void;
  clearEvent: (eventId: string) => void;
  clearAdhoc: () => void;
}

export const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      byEvent: {},
      adhoc: null,
      choose: (trip) =>
        set((s) => {
          const t: PlannedTrip = { ...trip, chosenAt: new Date().toISOString() };
          return trip.eventId ? { byEvent: { ...s.byEvent, [trip.eventId]: t } } : { adhoc: t };
        }),
      clearEvent: (eventId) =>
        set((s) => {
          const next = { ...s.byEvent };
          delete next[eventId];
          return { byEvent: next };
        }),
      clearAdhoc: () => set({ adhoc: null }),
    }),
    {
      name: 'stihnu:trips',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Po příjezdu (a dvou hodinách navíc) se volba zapomene.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const cutoff = Date.now() - 2 * 3_600_000;
        const keep = Object.fromEntries(Object.entries(state.byEvent).filter(([, t]) => new Date(t.itinerary.arriveAt).getTime() > cutoff));
        useTripStore.setState({ byEvent: keep, adhoc: state.adhoc && new Date(state.adhoc.itinerary.arriveAt).getTime() > cutoff ? state.adhoc : null });
      },
    },
  ),
);

/**
 * Spoj zvolený studentem v aktuálních datech: stejný vůz z živého plánu
 * (se zpožděním), jinak uložená podoba – dokud ze zastávky neodjel.
 */
export function resolveChosen(chosen: PlannedTrip | undefined | null, live: Itinerary[], now: Date): Itinerary | null {
  if (!chosen) return null;
  const key = tripKey(chosen.itinerary);
  const match = live.find((it) => tripKey(it) === key);
  const it = match ?? chosen.itinerary;
  return catchability(it, now) === 'gone' ? null : it;
}
