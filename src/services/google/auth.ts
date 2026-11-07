/**
 * Přihlášení Google přes Google Identity Services.
 *  - S nastaveným serverem (GOOGLE_CLIENT_SECRET): popup s autorizačním kódem,
 *    server drží refresh token v HttpOnly cookie → synchronizace běží i na pozadí.
 *  - Bez serveru: klientský access token (platí ~1 h, pak stačí jedno kliknutí).
 * Access token se drží jen v paměti, nikdy v localStorage.
 */
import { accountAuthHeader } from '../authToken';
import type { GoogleAccount, GoogleSyncSettings } from '../../types';
import { GoogleAuthError } from '../../lib/sync/remote';

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GisCodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GisError {
  type?: string;
  message?: string;
}

interface GoogleIdentity {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        include_granted_scopes?: boolean;
        callback: (response: GisTokenResponse) => void;
        error_callback?: (error: GisError) => void;
      }) => { requestAccessToken: (overrides?: { prompt?: string; scope?: string }) => void };
      initCodeClient: (config: {
        client_id: string;
        scope: string;
        ux_mode: 'popup' | 'redirect';
        include_granted_scopes?: boolean;
        select_account?: boolean;
        callback: (response: GisCodeResponse) => void;
        error_callback?: (error: GisError) => void;
      }) => { requestCode: () => void };
      revoke: (token: string, done?: () => void) => void;
    };
    /** Přihlášení „Pokračovat přes Google“ (ID token pro účet Stihnuto). */
    id?: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        nonce?: string;
        ux_mode?: 'popup' | 'redirect';
        auto_select?: boolean;
        itp_support?: boolean;
        use_fedcm_for_prompt?: boolean;
        context?: 'signin' | 'signup' | 'use';
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, string | number | boolean>) => void;
      disableAutoSelect: () => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export const GOOGLE_SCOPES = {
  identity: ['openid', 'email', 'profile'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
  calendarEvents: ['https://www.googleapis.com/auth/calendar.events'],
  tasks: ['https://www.googleapis.com/auth/tasks'],
  drive: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'],
} as const;

/** Oprávnění podle zapnutých služeb (žádáme jen o to, co je potřeba). */
export function scopesForSettings(g: GoogleSyncSettings): string[] {
  const out: string[] = [...GOOGLE_SCOPES.identity];
  if (g.calendar.enabled) out.push(...GOOGLE_SCOPES.calendar);
  if (g.tasks.enabled) out.push(...GOOGLE_SCOPES.tasks);
  if (g.drive.enabled) out.push(...GOOGLE_SCOPES.drive);
  return out;
}

interface TokenInfo {
  token: string;
  expiresAt: number;
  scopes: string[];
  persistent: boolean;
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;
let current: TokenInfo | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Zapečetěný (serverem šifrovaný, s účtem svázaný) Google refresh token – ukládá ho účet. */
let sealedGetter: () => string | undefined = () => undefined;
let sealedSetter: (sealed: string) => void = () => undefined;
export function registerSealedGoogleToken(get: () => string | undefined, put: (sealed: string) => void): void {
  sealedGetter = get;
  sealedSetter = put;
}
const sealedGoogleToken = () => sealedGetter();
const storeSealedGoogleToken = (sealed: string) => sealedSetter(sealed);

export function loadIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Nepodařilo se načíst přihlášení Google (jste online?).'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function setToken(token: string, expiresIn: number | string | undefined, scope: string | undefined, persistent: boolean): TokenInfo {
  current = {
    token,
    expiresAt: Date.now() + Number(expiresIn ?? 3600) * 1000,
    scopes: (scope ?? '').split(/\s+/).filter(Boolean),
    persistent,
  };
  emit();
  return current;
}

async function serverCall<T>(action: 'exchange' | 'refresh' | 'logout', extra: Record<string, string> = {}): Promise<T> {
  const sealed = action === 'refresh' ? sealedGoogleToken() : undefined;
  const response = await fetch('/api/google', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-stihnu': '1', ...accountAuthHeader() },
    body: JSON.stringify({ action, ...(sealed ? { sealed } : {}), ...extra }),
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (response.status === 401) throw new GoogleAuthError(data.message ?? 'Přihlášení ke Googlu vypršelo.');
  if (!response.ok) throw new Error(data.message ?? `Server odpověděl chybou HTTP ${response.status}.`);
  return data;
}

export interface SignInOptions {
  clientId: string;
  scopes: string[];
  serverFlow: boolean;
  prompt?: '' | 'consent' | 'select_account';
}

/** Interaktivní přihlášení (musí být vyvolané kliknutím – otevírá okno Googlu). */
export async function signIn(options: SignInOptions): Promise<TokenInfo> {
  if (!options.clientId) throw new Error('Chybí OAuth Client ID – správce ho nastaví na serveru (Nastavení → Server aplikace).');
  await loadIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services nejsou dostupné.');
  const scope = [...new Set(options.scopes)].join(' ');

  if (options.serverFlow) {
    const code = await new Promise<string>((resolve, reject) => {
      const client = oauth2.initCodeClient({
        client_id: options.clientId,
        scope,
        ux_mode: 'popup',
        include_granted_scopes: true,
        select_account: options.prompt === 'select_account',
        callback: (response) => (response.code ? resolve(response.code) : reject(new Error(response.error_description ?? response.error ?? 'Přihlášení se nezdařilo.'))),
        error_callback: (error) => reject(new Error(error.type === 'popup_closed' ? 'Okno přihlášení bylo zavřeno.' : (error.message ?? 'Přihlášení se nezdařilo.'))),
      });
      client.requestCode();
    });
    const data = await serverCall<{ access_token: string; expires_in: number; scope: string; persistent: boolean; sealed?: string }>('exchange', { code });
    // Zapečetěné propojení pro další zařízení (jde do šifrovaného trezoru účtu).
    if (data.sealed) storeSealedGoogleToken(data.sealed);
    return setToken(data.access_token, data.expires_in, data.scope, data.persistent);
  }

  return new Promise<TokenInfo>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: options.clientId,
      scope,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? response.error ?? 'Přihlášení se nezdařilo.'));
          return;
        }
        resolve(setToken(response.access_token, response.expires_in, response.scope, false));
      },
      error_callback: (error) => reject(new Error(error.type === 'popup_closed' ? 'Okno přihlášení bylo zavřeno.' : (error.message ?? 'Přihlášení se nezdařilo.'))),
    });
    client.requestAccessToken({ prompt: options.prompt ?? '' });
  });
}

/** Platný access token bez interakce (případně obnovený serverem); jinak GoogleAuthError. */
export async function getAccessToken(serverFlow: boolean): Promise<string> {
  if (current && current.expiresAt - 60_000 > Date.now()) return current.token;
  if (serverFlow) {
    const data = await serverCall<{ access_token: string; expires_in: number; scope: string }>('refresh');
    return setToken(data.access_token, data.expires_in, data.scope, true).token;
  }
  throw new GoogleAuthError('Přihlášení ke Googlu vypršelo – klikněte na „Přihlásit znovu“.');
}

export function invalidateToken(): void {
  if (current) {
    current = { ...current, expiresAt: 0 };
    emit();
  }
}

export function tokenState(): { valid: boolean; scopes: string[]; persistent: boolean; expiresAt: number } {
  return {
    valid: Boolean(current && current.expiresAt - 60_000 > Date.now()),
    scopes: current?.scopes ?? [],
    persistent: current?.persistent ?? false,
    expiresAt: current?.expiresAt ?? 0,
  };
}

export function hasScopes(required: readonly string[]): boolean {
  const granted = new Set(current?.scopes ?? []);
  return required.every((s) => granted.has(s));
}

export async function signOut(serverFlow: boolean): Promise<void> {
  const token = current?.token;
  current = null;
  emit();
  if (token) window.google?.accounts?.oauth2?.revoke(token);
  if (serverFlow) await serverCall('logout').catch(() => undefined);
}

export async function fetchProfile(token: string): Promise<GoogleAccount> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) return {};
  const data = (await response.json()) as { email?: string; name?: string; picture?: string };
  return { email: data.email, name: data.name, picture: data.picture };
}

/** Client ID: ruční nastavení > proměnná při buildu > server. */
export function resolveClientId(settingsClientId: string, serverClientId: string | null): string {
  return settingsClientId.trim() || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || serverClientId?.trim() || '';
}
