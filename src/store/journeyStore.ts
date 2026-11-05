/** Vybrané spojení ve vyhledávači – mapa ho vykreslí. */
import { create } from 'zustand';
import type { Itinerary, LatLng } from '../types';

interface JourneyState {
  selected: Itinerary | null;
  from: LatLng | null;
  to: LatLng | null;
  /** Kolikrát uživatel klikl na „Zobrazit na mapě“ (mapa se přiblíží). */
  focusTick: number;
}

export const useJourneyStore = create<JourneyState>(() => ({ selected: null, from: null, to: null, focusTick: 0 }));
