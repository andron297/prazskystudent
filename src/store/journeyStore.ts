/** Vybrané spojení ve vyhledávači – mapa ho vykreslí. */
import { create } from 'zustand';
import type { Itinerary, LatLng } from '../types';

interface JourneyState {
  selected: Itinerary | null;
  from: LatLng | null;
  to: LatLng | null;
  /** Cíl je budova školy (jiná značka na mapě). */
  toIsSchool: boolean;
  /** Kolikrát uživatel klikl na „Zobrazit na mapě“ (mapa se přiblíží). */
  focusTick: number;
  /** Požadavek odjinud („Trasa do menzy“): vyhledávač si ho převezme. */
  request: { label: string; detail?: string; coords: LatLng } | null;
}

export const useJourneyStore = create<JourneyState>(() => ({ selected: null, from: null, to: null, toIsSchool: false, focusTick: 0, request: null }));

/** Otevře Dopravu s vyhledáním spojení do daného místa. */
export function planTripTo(label: string, coords: LatLng, detail?: string): void {
  useJourneyStore.setState({ request: { label, coords, detail } });
  window.location.hash = '#/doprava';
}
