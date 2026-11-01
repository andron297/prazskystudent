/** Přechodný stav UI: toasty, modální okno „Propojit studium“, schopnosti serveru. */
import { create } from 'zustand';
import { fetchServerCapabilities, NO_SERVER, type ServerCapabilities } from '../services/api';
import { uid } from '../lib/id';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

export type ConnectTab = 'moodle' | 'ics' | 'parser';

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

interface UiState {
  toasts: Toast[];
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
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
}

export const useUiStore = create<UiState>()((set, get) => ({
  toasts: [],
  pushToast: (message, tone = 'success') => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 6500 : 3800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
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
