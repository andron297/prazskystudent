/**
 * Režim prezentace (jen v tomto zařízení): skutečná data se na obrazovce
 * zobrazí s vymyšlenými popisky – sál neuvidí, co máte v kalendáři.
 * A prezentace aplikace na plátno (velká prohlídka).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PresentationState {
  masked: boolean;
  setMasked: (masked: boolean) => void;
  /** Běží prezentace aplikace (nepamatuje se). */
  slideshow: boolean;
  setSlideshow: (on: boolean) => void;
}

export const usePresentationStore = create<PresentationState>()(
  persist(
    (set) => ({
      masked: false,
      setMasked: (masked) => set({ masked }),
      slideshow: false,
      setSlideshow: (slideshow) => set({ slideshow }),
    }),
    { name: 'stihnu:present', version: 1, storage: createJSONStorage(() => localStorage), partialize: (s) => ({ masked: s.masked }) },
  ),
);
