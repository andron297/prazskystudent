/**
 * Spotify účet: přihlášení přes Authorization Code + PKCE přímo v prohlížeči
 * (žádný tajný klíč na serveru), co právě hraje, ovládání přehrávání
 * (Spotify Premium), vaše playlisty a naposledy hrané skladby.
 * Tokeny zůstávají jen v tomto zařízení (localStorage), nesynchronizují se.
 */
import { create } from 'zustand';
import { useUiStore } from '../store/uiStore';

const AUTH = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const TOKENS_KEY = 'stihnu:spotify';
const PENDING_KEY = 'stihnu:spotify-pending';
const CALLBACK_KEY = 'stihnu:spotify-callback';

export const SPOTIFY_SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-recently-played',
];

interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number;
  scope: string;
}

export interface SpotifyProfile {
  id: string;
  name: string;
  image?: string;
  premium: boolean;
  country?: string;
}

export interface SpotifyImage {
  url: string;
  width?: number | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  url: string;
  image?: string;
  tracks: number;
  owner?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  url: string;
  artists: string;
  album: string;
  image?: string;
  durationMs: number;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  active: boolean;
  restricted: boolean;
}

export interface SpotifyPlayback {
  playing: boolean;
  progressMs: number;
  fetchedAt: number;
  track: SpotifyTrack | null;
  device: SpotifyDevice | null;
  context?: string;
}

interface SpotifyState {
  status: 'off' | 'disconnected' | 'connecting' | 'connected';
  profile: SpotifyProfile | null;
  error: string | null;
}

export const useSpotify = create<SpotifyState>(() => ({ status: 'off', profile: null, error: null }));

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(n: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function spotifyRedirectUri(): string {
  return `${window.location.origin}/spotify`;
}

function clientId(): string | null {
  return useUiStore.getState().server.spotifyClientId ?? null;
}

function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: Tokens | null): void {
  try {
    if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
    else localStorage.removeItem(TOKENS_KEY);
  } catch {
    /* plné úložiště */
  }
}

/**
 * Zavolat co nejdřív při startu (před přihlášením k účtu Stihnu): převezme
 * odpověď Spotify z adresy /spotify?code=… a adresu hned vyčistí, aby si
 * parametr `code` nespletlo přihlašování k účtu.
 */
export function captureSpotifyCallback(): void {
  if (window.location.pathname !== '/spotify') return;
  const params = new URLSearchParams(window.location.search);
  try {
    sessionStorage.setItem(CALLBACK_KEY, JSON.stringify({ code: params.get('code'), state: params.get('state'), error: params.get('error') }));
  } catch {
    /* bez sessionStorage se přihlášení nedokončí */
  }
  window.history.replaceState(null, '', '/#/hudba');
}

/** Přesměruje na přihlášení Spotify. */
export async function connectSpotify(): Promise<void> {
  const id = clientId();
  if (!id) throw new Error('Přihlášení ke Spotify zatím správce aplikace nezapnul.');
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  const url = new URL(`${AUTH}/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: spotifyRedirectUri(),
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  }).toString();
  useSpotify.setState({ status: 'connecting', error: null });
  window.location.assign(url.toString());
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  let response: Response;
  try {
    response = await fetch(`${AUTH}/api/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  } catch {
    throw new Error('Spotify teď nejde zastihnout – jste online?');
  }
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    if (data.error === 'invalid_grant') throw Object.assign(new Error('Přihlášení ke Spotify vypršelo – propojte ho prosím znovu.'), { expired: true });
    throw new Error(data.error_description ? `Spotify: ${data.error_description}` : `Spotify odmítl přihlášení (${response.status}).`);
  }
  const previous = loadTokens();
  return { access: data.access_token, refresh: data.refresh_token ?? previous?.refresh ?? '', expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000, scope: data.scope ?? previous?.scope ?? '' };
}

/** Dokončí přihlášení po návratu ze Spotify (pokud nějaké čeká). */
export async function completeSpotifyLogin(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(CALLBACK_KEY);
    sessionStorage.removeItem(CALLBACK_KEY);
  } catch {
    raw = null;
  }
  if (!raw) return;
  const cb = JSON.parse(raw) as { code: string | null; state: string | null; error: string | null };
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as { verifier: string; state: string } | null;
  sessionStorage.removeItem(PENDING_KEY);
  const id = clientId();
  if (cb.error) {
    useSpotify.setState({ status: 'disconnected', error: cb.error === 'access_denied' ? 'Přihlášení ke Spotify jste zrušili.' : `Spotify: ${cb.error}` });
    return;
  }
  if (!cb.code || !pending || cb.state !== pending.state || !id) {
    useSpotify.setState({ status: 'disconnected', error: 'Přihlášení ke Spotify se nepodařilo ověřit. Zkuste to prosím znovu.' });
    return;
  }
  useSpotify.setState({ status: 'connecting', error: null });
  try {
    const tokens = await tokenRequest({ grant_type: 'authorization_code', code: cb.code, redirect_uri: spotifyRedirectUri(), client_id: id, code_verifier: pending.verifier });
    saveTokens(tokens);
    await loadProfile();
  } catch (e) {
    saveTokens(null);
    useSpotify.setState({ status: 'disconnected', error: e instanceof Error ? e.message : 'Přihlášení ke Spotify se nepodařilo.' });
  }
}

let refreshing: Promise<Tokens> | null = null;

async function accessToken(): Promise<string> {
  const t = loadTokens();
  if (!t) throw new Error('Spotify není propojený.');
  if (Date.now() < t.expiresAt - 60_000) return t.access;
  const id = clientId();
  if (!id || !t.refresh) throw new Error('Spotify není propojený.');
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: id }).finally(() => {
    refreshing = null;
  });
  try {
    const next = await refreshing;
    saveTokens(next);
    return next.access;
  } catch (e) {
    if ((e as { expired?: boolean }).expired) {
      saveTokens(null);
      useSpotify.setState({ status: 'disconnected', profile: null, error: (e as Error).message });
    }
    throw e;
  }
}

async function call<T>(path: string, init: RequestInit = {}, retry = true): Promise<T | null> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) } });
  } catch {
    throw new Error('Spotify teď nejde zastihnout – jste online?');
  }
  if (response.status === 401 && retry) {
    const t = loadTokens();
    if (t) saveTokens({ ...t, expiresAt: 0 });
    return call<T>(path, init, false);
  }
  if (response.status === 429 && retry) {
    const wait = Math.min(10, Number(response.headers.get('retry-after') ?? '2')) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return call<T>(path, init, false);
  }
  if (response.status === 204 || response.status === 202) return null;
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: { message?: string; reason?: string } } | null;
    if (response.status === 403 && /premium/i.test(`${detail?.error?.reason} ${detail?.error?.message}`)) throw new Error('Ovládání přehrávání vyžaduje Spotify Premium.');
    if (response.status === 404 && detail?.error?.reason === 'NO_ACTIVE_DEVICE') throw new Error('Spotify teď nikde neběží – otevřete ho na telefonu nebo počítači.');
    if (response.status === 403) throw new Error('Spotify tenhle účet zatím nepustí – správce ho musí přidat do aplikace ve Spotify (vývojářský režim, max. 25 účtů).');
    throw new Error(detail?.error?.message ? `Spotify: ${detail.error.message}` : `Spotify odpověděl chybou ${response.status}.`);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

const pickImage = (images?: SpotifyImage[] | null, target = 300) => (images && images.length ? [...images].sort((a, b) => Math.abs((a.width ?? target) - target) - Math.abs((b.width ?? target) - target))[0].url : undefined);

interface RawTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  external_urls?: { spotify?: string };
  artists?: { name: string }[];
  album?: { name: string; images?: SpotifyImage[] };
}

function toTrack(t: RawTrack | null | undefined): SpotifyTrack | null {
  if (!t?.id) return null;
  return { id: t.id, name: t.name, uri: t.uri, url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`, artists: (t.artists ?? []).map((a) => a.name).join(', '), album: t.album?.name ?? '', image: pickImage(t.album?.images), durationMs: t.duration_ms };
}

async function loadProfile(): Promise<void> {
  const me = await call<{ id: string; display_name?: string; images?: SpotifyImage[]; product?: string; country?: string }>('/me');
  if (!me) throw new Error('Profil Spotify se nepodařilo načíst.');
  useSpotify.setState({ status: 'connected', error: null, profile: { id: me.id, name: me.display_name || me.id, image: pickImage(me.images, 96), premium: me.product === 'premium', country: me.country } });
}

/** Při startu: je Spotify zapnuté na serveru a propojené v tomto zařízení? */
export async function initSpotify(): Promise<void> {
  if (!clientId()) {
    useSpotify.setState({ status: 'off' });
    return;
  }
  await completeSpotifyLogin();
  if (useSpotify.getState().status === 'connected') return;
  if (!loadTokens()) {
    if (useSpotify.getState().status !== 'disconnected') useSpotify.setState({ status: 'disconnected' });
    return;
  }
  try {
    await loadProfile();
  } catch (e) {
    useSpotify.setState({ status: loadTokens() ? 'connected' : 'disconnected', error: e instanceof Error ? e.message : null });
  }
}

export function disconnectSpotify(): void {
  saveTokens(null);
  useSpotify.setState({ status: 'disconnected', profile: null, error: null });
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

export async function myPlaylists(): Promise<SpotifyPlaylist[]> {
  const data = await call<{ items: ({ id: string; name: string; uri: string; images?: SpotifyImage[] | null; tracks?: { total: number }; owner?: { display_name?: string }; external_urls?: { spotify?: string } } | null)[] }>('/me/playlists?limit=24');
  return (data?.items ?? [])
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.id))
    .map((p) => ({ id: p.id, name: p.name, uri: p.uri, url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`, image: pickImage(p.images), tracks: p.tracks?.total ?? 0, owner: p.owner?.display_name }));
}

export async function recentlyPlayed(): Promise<SpotifyTrack[]> {
  const data = await call<{ items: { track: RawTrack }[] }>('/me/player/recently-played?limit=12');
  const seen = new Set<string>();
  return (data?.items ?? [])
    .map((i) => toTrack(i.track))
    .filter((t): t is SpotifyTrack => Boolean(t) && !seen.has(t!.id) && (seen.add(t!.id), true))
    .slice(0, 8);
}

export async function playback(): Promise<SpotifyPlayback | null> {
  const data = await call<{ is_playing: boolean; progress_ms: number | null; item: RawTrack | null; device?: { id: string; name: string; type: string; is_active: boolean; is_restricted: boolean }; context?: { uri: string } | null }>('/me/player?additional_types=track');
  if (!data) return null;
  return {
    playing: data.is_playing,
    progressMs: data.progress_ms ?? 0,
    fetchedAt: Date.now(),
    track: toTrack(data.item),
    device: data.device ? { id: data.device.id, name: data.device.name, type: data.device.type, active: data.device.is_active, restricted: data.device.is_restricted } : null,
    context: data.context?.uri,
  };
}

export async function devices(): Promise<SpotifyDevice[]> {
  const data = await call<{ devices: { id: string; name: string; type: string; is_active: boolean; is_restricted: boolean }[] }>('/me/player/devices');
  return (data?.devices ?? []).filter((d) => d.id).map((d) => ({ id: d.id, name: d.name, type: d.type, active: d.is_active, restricted: d.is_restricted }));
}

export const control = {
  play: (opts: { contextUri?: string; deviceId?: string } = {}) => call(`/me/player/play${opts.deviceId ? `?device_id=${encodeURIComponent(opts.deviceId)}` : ''}`, { method: 'PUT', body: opts.contextUri ? JSON.stringify({ context_uri: opts.contextUri }) : undefined }),
  pause: () => call('/me/player/pause', { method: 'PUT' }),
  next: () => call('/me/player/next', { method: 'POST' }),
  previous: () => call('/me/player/previous', { method: 'POST' }),
  transfer: (deviceId: string, play = true) => call('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play }) }),
};
