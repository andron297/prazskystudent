/** Přechodný stav UI: toasty, modální okno „Propojit studium“, schopnosti serveru. */
import { create } from 'zustand';
import { fetchServerCapabilities, NO_SERVER, type ServerCapabilities } from '../services/api';
import type { SisPayload } from '../services/sisBridge';
import type { Building, Itinerary, LatLng, ScheduleEvent } from '../types';
import { uid } from '../lib/id';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

export type ConnectTab = 'moodle' | 'ics' | 'parser';

/** Otevřený editor úkolu nebo události. */
export type EditorTarget =
  | { type: 'task'; id?: string; text?: string }
  | { type: 'event'; id?: string; text?: string }
  | { type: 'quick'; text?: string };

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
}

interface ConfirmRequest extends Required<Omit<ConfirmOptions, 'message'>> {
  message?: string;
  resolve: (value: boolean) => void;
}

/** Spuštěná navigace (celoobrazovková). */
export interface NavigationTarget {
  itinerary: Itinerary;
  event: ScheduleEvent | null;
  building: Building | null;
  origin: LatLng;
}

interface UiState {
  /** Otevřený editor odpočtu. */
  countdownEditor: boolean;
  /** Po nahrání harmonogramu se zeptat na typ studia. */
  askStudyProfile: boolean;
  /** Zvýší se, když má úvodní animace proběhnout znovu (ukázka ve Vzhledu). */
  introTick: number;
  /** Oslava nového propojení (velké potvrzení nahoře). */
  celebration: { id: number; title: string; detail: string } | null;
  /** Centrum upozornění otevřené. */
  alertsOpen: boolean;
  /** Běží krátká prohlídka aplikace. */
  tour: boolean;
  startTour: () => void;
  navigation: NavigationTarget | null;
  startNavigation: (target: NavigationTarget) => void;
  stopNavigation: () => void;
  toasts: Toast[];
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
  /** Průvodce propojením (krok, na kterém se otevře). */
  setupOpen: boolean;
  setupStep: string | null;
  /** Po přihlášení pokračovat v průvodci. */
  resumeSetup: boolean;
  openSetup: (step?: string) => void;
  closeSetup: () => void;
  connectOpen: boolean;
  connectTab: ConnectTab;
  parserSubjectId?: string;
  openConnect: (tab?: ConnectTab, parserSubjectId?: string) => void;
  closeConnect: () => void;
  server: ServerCapabilities;
  serverChecked: boolean;
  refreshServer: () => Promise<void>;
  confirmRequest: ConfirmRequest | null;
  askConfirm: (options: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: (value: boolean) => void;
  editor: EditorTarget | null;
  openEditor: (target: EditorTarget) => void;
  closeEditor: () => void;
  sisImport: SisPayload | null;
  setSisImport: (payload: SisPayload | null) => void;
  /** Vybraná zastávka na mapě (z jiné obrazovky). */
  focusStop: string | null;
  setFocusStop: (name: string | null) => void;
  /** Spoj vybraný studentem pro danou událost (ID události → ID itineráře). */
  selectedTrip: Record<string, string>;
  selectTrip: (eventId: string, itineraryId: string | null) => void;
}

export const useUiStore = create<UiState>()((set, get) => ({
  toasts: [],
  pushToast: (message, tone = 'success') => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 6500 : 3800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setupOpen: false,
  setupStep: null,
  resumeSetup: false,
  openSetup: (step) => set({ setupOpen: true, setupStep: step ?? null }),
  closeSetup: () => set({ setupOpen: false }),
  connectOpen: false,
  connectTab: 'moodle',
  openConnect: (tab = 'moodle', parserSubjectId) => set({ connectOpen: true, connectTab: tab, parserSubjectId }),
  closeConnect: () => set({ connectOpen: false }),
  server: NO_SERVER,
  serverChecked: false,
  refreshServer: async () => {
    const caps = await fetchServerCapabilities();
    set({ server: caps, serverChecked: true });
  },
  confirmRequest: null,
  askConfirm: (options) =>
    new Promise<boolean>((resolve) => {
      get().confirmRequest?.resolve(false);
      set({
        confirmRequest: {
          title: options.title,
          message: options.message,
          confirmLabel: options.confirmLabel ?? 'Potvrdit',
          tone: options.tone ?? 'default',
          resolve,
        },
      });
    }),
  resolveConfirm: (value) => {
    get().confirmRequest?.resolve(value);
    set({ confirmRequest: null });
  },
  countdownEditor: false,
  askStudyProfile: false,
  introTick: 0,
  celebration: null,
  alertsOpen: false,
  tour: false,
  startTour: () => set({ tour: true, setupOpen: false }),
  navigation: null,
  startNavigation: (target) => set({ navigation: target }),
  stopNavigation: () => set({ navigation: null }),
  editor: null,
  openEditor: (target) => set({ editor: target }),
  closeEditor: () => set({ editor: null }),
  sisImport: null,
  setSisImport: (payload) => set({ sisImport: payload }),
  focusStop: null,
  setFocusStop: (name) => set({ focusStop: name }),
  selectedTrip: {},
  selectTrip: (eventId, itineraryId) =>
    set((s) => {
      const next = { ...s.selectedTrip };
      if (itineraryId) next[eventId] = itineraryId;
      else delete next[eventId];
      return { selectedTrip: next };
    }),
}));

/** Potvrzení v rozhraní aplikace (nativní confirm() je na mobilu nevzhledný a v některých prostředích blokovaný). */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useUiStore.getState().askConfirm(options);
}

export const toast = {
  success: (message: string) => useUiStore.getState().pushToast(message, 'success'),
  error: (message: string) => useUiStore.getState().pushToast(message, 'error'),
  info: (message: string) => useUiStore.getState().pushToast(message, 'info'),
};

/** Velké potvrzení, že se něco propojilo (zmizí samo). */
export function celebrate(title: string, detail: string): void {
  useUiStore.setState({ celebration: { id: Date.now(), title, detail } });
}
