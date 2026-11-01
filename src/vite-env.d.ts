/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Volitelná adresa backendu pro synchronizaci stavu (GET/PUT {url}/state). */
  readonly VITE_SYNC_URL?: string;
  /** Volitelný Bearer token pro synchronizační backend. */
  readonly VITE_SYNC_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
