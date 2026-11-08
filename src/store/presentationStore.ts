/**
 * Režim prezentace (jen v tomto zařízení): skutečná data se na obrazovce
 * zobrazí s vymyšlenými popisky – sál neuvidí, co máte v kalendáři. Co během
 * prezentace na ukázku přidáte (úkol, událost…), zůstane čitelné a po vypnutí
 * režimu se samo smaže. A prezentace aplikace na plátno (velká prohlídka).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DemoItemKind = 'task' | 'event' | 'requirement' | 'subject' | 'material';

interface PresentationState {
  masked: boolean;
  setMasked: (masked: boolean) => void;
  /** Položky přidané během prezentace (po jejím konci se smažou). */
  created: { kind: DemoItemKind; id: string; by?: 'tour' }[];
  track: (kind: DemoItemKind, id: string, by?: 'tour') => void;
  /** Zapomenout položky (všechny, nebo jen ty z prezentační prohlídky). */
  clearTracked: (by?: 'tour') => void;
  /** Běží prezentace aplikace (nepamatuje se). */
  slideshow: boolean;
  setSlideshow: (on: boolean) => void;
  /** Běží prezentační prohlídka (nepamatuje se). */
  stage: boolean;
  setStage: (on: boolean) => void;
}

export const usePresentationStore = create<PresentationState>()(
  persist(
    (set) => ({
      masked: false,
      setMasked: (masked) => set({ masked }),
      created: [],
      track: (kind, id, by) => set((s) => (s.created.some((x) => x.id === id) ? s : { created: [...s.created, { kind, id, ...(by ? { by } : {}) }] })),
      clearTracked: (by) => set((s) => ({ created: by ? s.created.filter((x) => x.by !== by) : [] })),
      slideshow: false,
      setSlideshow: (slideshow) => set({ slideshow }),
      stage: false,
      setStage: (stage) => set({ stage }),
    }),
    { name: 'stihnu:present', version: 2, storage: createJSONStorage(() => localStorage), partialize: (s) => ({ masked: s.masked, created: s.created }) },
  ),
);

/** Je tahle položka přidaná během prezentace (ukazuje se skutečně a dá se upravovat)? */
export function isPresentationItem(id: string | undefined): boolean {
  return Boolean(id) && usePresentationStore.getState().created.some((x) => x.id === id);
}
