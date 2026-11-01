/**
 * Perzistence stavu. Výchozí je localStorage (aplikace funguje okamžitě bez účtu),
 * s pamětí jako záchranou pro anonymní okna / zablokované úložiště.
 * Volitelně se stav synchronizuje na vlastní backend (VITE_SYNC_URL) –
 * REST kontrakt: GET {url}/state → { updatedAt, state }, PUT {url}/state ← totéž.
 */
import type { StateStorage } from 'zustand/middleware';

const memory = new Map<string, string>();

export const safeLocalStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Plné nebo zablokované úložiště – data zůstávají v paměti této relace.
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      // nic dalšího nelze udělat
    }
  },
};

export interface RemoteSyncTarget<S> {
  getState: () => S;
  setState: (partial: Partial<S>) => void;
  subscribe: (listener: (state: S) => void) => () => void;
}

const UPDATED_KEY = 'stihnu:updatedAt';

function readUpdatedAt(): string {
  return safeLocalStorage.getItem(UPDATED_KEY) as string | null ?? '';
}

/**
 * Write-through synchronizace na backend: po startu stáhne novější stav ze
 * serveru, každou změnu (s debounce 1,5 s) odešle zpět.
 */
export function startRemoteSync<S>(
  store: RemoteSyncTarget<S>,
  options: { baseUrl: string; token?: string; pick: (state: S) => Partial<S> },
): () => void {
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/state`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPayload = '';
  let applyingRemote = false;

  void fetch(endpoint, { headers })
    .then((response) => (response.ok ? (response.json() as Promise<{ updatedAt?: string; state?: Partial<S> }>) : null))
    .then((remote) => {
      if (remote?.state && remote.updatedAt && remote.updatedAt > readUpdatedAt()) {
        applyingRemote = true;
        store.setState(remote.state);
        safeLocalStorage.setItem(UPDATED_KEY, remote.updatedAt);
        applyingRemote = false;
      }
    })
    .catch(() => undefined);

  const unsubscribe = store.subscribe((state) => {
    if (applyingRemote) return;
    const updatedAt = new Date().toISOString();
    safeLocalStorage.setItem(UPDATED_KEY, updatedAt);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const body = JSON.stringify({ updatedAt, state: options.pick(state) });
      if (body === lastPayload) return;
      void fetch(endpoint, { method: 'PUT', headers, body })
        .then((response) => {
          if (response.ok) lastPayload = body;
        })
        .catch(() => undefined);
    }, 1500);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
