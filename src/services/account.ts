/**
 * Účet Stihnuto: přihlášení (Google nebo e-mail a heslo), klíče a šifrovaná
 * synchronizace mezi zařízeními.
 *
 * Bezpečnost:
 *  - data se šifrují v prohlížeči klíčem k datům (DEK), který server nikdy nevidí;
 *  - DEK je na serveru jen zabalený: záchranným kódem a (u účtů s heslem) klíčem z hesla;
 *  - heslo samo nejde ani do Supabase – jen odvozený přihlašovací otisk;
 *  - v databázi platí Row Level Security: každý vidí jen svůj zašifrovaný řádek.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { GoogleAccount } from '../types';
import { buildSnapshot, mergeSnapshots, pickSharedSettings, snapshotData, type SnapshotData } from '../lib/sync/driveState';
import { generateDek, generateRecoveryCode, openJson, passwordKeys, recoveryWrapKey, sealJson, unwrapDek, wrapDek } from '../lib/vaultCrypto';
import { useAppStore } from '../store/appStore';
import { toast, useUiStore } from '../store/uiStore';
import { setAccountToken, accountAuthHeader } from './authToken';
import { forgetDek, recallDek, rememberDek } from './deviceKeys';
import { loadIdentityScript, registerSealedGoogleToken } from './google/auth';
import { errorMessage } from './http';

export type AccountStatus =
  /** Účty na serveru nejsou zapnuté – aplikace funguje jen v tomto zařízení. */
  | 'off'
  | 'loading'
  | 'signedOut'
  /** Přihlášen(a), ale tohle zařízení ještě nemá klíč k datům. */
  | 'locked'
  /** Nový účet: je potřeba uložit si záchranný kód. */
  | 'showRecovery'
  /** Odkaz pro obnovu hesla – nastavit nové. */
  | 'resetPassword'
  | 'ready';

export interface AccountUser {
  id: string;
  email: string;
  provider: 'google' | 'email';
  name?: string;
  avatar?: string;
}

interface AccountState {
  status: AccountStatus;
  user: AccountUser | null;
  /** Záchranný kód k zobrazení (jen jednou, hned po vytvoření). */
  recoveryCode: string | null;
  syncing: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
}

export const useAccount = create<AccountState>()(() => ({ status: 'loading', user: null, recoveryCode: null, syncing: false, lastSyncAt: null, syncError: null }));

let client: SupabaseClient | null = null;
let dek: CryptoKey | null = null;
/** Klíč z hesla jen v paměti během přihlášení (k odemčení na novém zařízení). */
let pendingWrapKey: { userId: string; key: CryptoKey } | null = null;

export function supabase(): SupabaseClient | null {
  return client;
}

/** Jen pro testy: podstrčit napodobeninu Supabase. */
export function __setClientForTests(fake: unknown): void {
  client = fake as SupabaseClient;
  dek = null;
  pendingWrapKey = null;
  version = 0;
  lastFingerprint = '';
}

/** Jen pro testy: dokončit přihlášení s danou relací. */
export function __afterSignInForTests(session: unknown): Promise<void> {
  return afterSignIn(session as Session);
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

export async function initAccount(): Promise<void> {
  const config = useUiStore.getState().server.account;
  if (!config) {
    useAccount.setState({ status: 'off' });
    return;
  }
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'stihnu-auth' },
    });
    client.auth.onAuthStateChange((event, session) => {
      setAccountToken(session?.access_token ?? null);
      if (event === 'PASSWORD_RECOVERY') useAccount.setState({ status: 'resetPassword', user: userFrom(session) });
      else if (event === 'SIGNED_OUT') useAccount.setState({ status: 'signedOut', user: null });
      else if (event === 'SIGNED_IN' && session && useAccount.getState().status === 'signedOut') void afterSignIn(session);
    });
    registerSealedGoogleToken(
      () => useAppStore.getState().settings.googleSealed,
      (sealed) => useAppStore.getState().updateSettings({ googleSealed: sealed }),
    );
  }
  const { data } = await client.auth.getSession();
  cleanAuthParams();
  setAccountToken(data.session?.access_token ?? null);
  if (!data.session) {
    useAccount.setState({ status: 'signedOut', user: null });
    return;
  }
  if (useAccount.getState().status !== 'resetPassword') await afterSignIn(data.session);
}

function cleanAuthParams(): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const p of ['code', 'error', 'error_code', 'error_description', 'confirmed', 'reset']) {
    if (url.searchParams.has(p)) {
      url.searchParams.delete(p);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(null, '', url.toString());
}

function userFrom(session: Session | null): AccountUser | null {
  const u = session?.user;
  if (!u?.email) return null;
  const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string };
  return {
    id: u.id,
    email: u.email,
    provider: u.app_metadata?.provider === 'google' ? 'google' : 'email',
    name: meta.full_name ?? meta.name,
    avatar: meta.avatar_url ?? meta.picture,
  };
}

/* ------------------------------------------------------------------ */
/* Přihlášení                                                          */
/* ------------------------------------------------------------------ */

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Vykreslí oficiální tlačítko „Pokračovat přes Google“; po kliknutí přihlásí k účtu Stihnuto. */
export async function renderGoogleButton(parent: HTMLElement, onError: (message: string) => void): Promise<boolean> {
  const clientId = useUiStore.getState().server.googleClientId;
  if (!client || !clientId) return false;
  await loadIdentityScript();
  const id = window.google?.accounts?.id;
  if (!id) return false;
  const rawNonce = crypto.randomUUID();
  id.initialize({
    client_id: clientId,
    nonce: await sha256Hex(rawNonce),
    ux_mode: 'popup',
    auto_select: false,
    itp_support: true,
    use_fedcm_for_prompt: true,
    context: 'signin',
    callback: (response) => {
      if (!response.credential || !client) return;
      void client.auth
        .signInWithIdToken({ provider: 'google', token: response.credential, nonce: rawNonce })
        .then(({ data, error }) => {
          if (error) onError(friendlyAuthError(error.message));
          else if (data.session) void afterSignIn(data.session);
        });
    },
  });
  parent.innerHTML = '';
  id.renderButton(parent, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'cs', width: Math.min(360, parent.clientWidth || 320), logo_alignment: 'center' });
  return true;
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail nebo heslo nesedí.';
  if (m.includes('email not confirmed')) return 'Nejdřív potvrďte e-mail – odkaz vám přišel do schránky.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Tenhle e-mail už má účet – přihlaste se.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Moc pokusů za sebou. Zkuste to prosím za chvíli.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'Přihlášení přes Google teď není k dispozici – použijte e-mail.';
  if (m.includes('nonce')) return 'Přihlášení přes Google se nepovedlo ověřit. Zkuste to prosím znovu.';
  return 'Přihlášení se nepovedlo. Zkuste to prosím znovu.';
}

export async function signUpWithEmail(email: string, password: string): Promise<'confirm' | 'done'> {
  if (!client) throw new Error('Účty nejsou zapnuté.');
  const keys = await passwordKeys(password, email);
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password: keys.authSecret,
    options: { emailRedirectTo: `${window.location.origin}/?confirmed=1#/ucet` },
  });
  if (error) throw new Error(friendlyAuthError(error.message));
  if (data.user) pendingWrapKey = { userId: data.user.id, key: keys.wrapKey };
  if (data.session) {
    await afterSignIn(data.session);
    return 'done';
  }
  return 'confirm';
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!client) throw new Error('Účty nejsou zapnuté.');
  const keys = await passwordKeys(password, email);
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password: keys.authSecret });
  if (error) throw new Error(friendlyAuthError(error.message));
  pendingWrapKey = { userId: data.user.id, key: keys.wrapKey };
  await afterSignIn(data.session);
}

export async function sendPasswordReset(email: string): Promise<void> {
  if (!client) throw new Error('Účty nejsou zapnuté.');
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?reset=1#/ucet` });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** Nové heslo po odkazu z e-mailu (nebo změna hesla přihlášeného). */
export async function setNewPassword(password: string): Promise<void> {
  if (!client) throw new Error('Účty nejsou zapnuté.');
  const { data } = await client.auth.getUser();
  const email = data.user?.email;
  if (!email || !data.user) throw new Error('Přihlášení vypršelo – požádej o nový odkaz.');
  const keys = await passwordKeys(password, email);
  const { error } = await client.auth.updateUser({ password: keys.authSecret });
  if (error) throw new Error(friendlyAuthError(error.message));
  const existing = dek ?? (await recallDek(data.user.id));
  if (existing) {
    await client.from('stihnu_keys').update({ password_wrap: await wrapDek(existing, keys.wrapKey), updated_at: new Date().toISOString() }).eq('user_id', data.user.id);
  } else {
    // Na tomhle zařízení klíč k datům není – po zadání záchranného kódu se heslo k datům přidá samo.
    pendingWrapKey = { userId: data.user.id, key: keys.wrapKey };
  }
  const { data: s } = await client.auth.getSession();
  if (s.session) await afterSignIn(s.session);
}

/* ------------------------------------------------------------------ */
/* Klíče k datům                                                       */
/* ------------------------------------------------------------------ */

interface KeysRow {
  user_id: string;
  recovery_wrap: string;
  password_wrap: string | null;
}

async function afterSignIn(session: Session): Promise<void> {
  if (!client) return;
  const user = userFrom(session);
  if (!user) return;
  setAccountToken(session.access_token);
  useAccount.setState({ user, status: 'loading' });
  try {
    const { data: keys, error } = await client.from('stihnu_keys').select('user_id, recovery_wrap, password_wrap').eq('user_id', user.id).maybeSingle<KeysRow>();
    if (error) throw new Error('Účet se nepodařilo načíst (databáze účtů zatím není připravená).');
    if (!keys) {
      // Nový účet: vytvořit klíč k datům a záchranný kód.
      const newDek = await generateDek();
      const code = generateRecoveryCode();
      const passwordWrap = pendingWrapKey?.userId === user.id ? await wrapDek(newDek, pendingWrapKey.key) : null;
      const { error: insertError } = await client.from('stihnu_keys').insert({ user_id: user.id, recovery_wrap: await wrapDek(newDek, await recoveryWrapKey(code)), password_wrap: passwordWrap });
      if (insertError) throw new Error('Účet se nepodařilo založit. Zkuste to prosím znovu.');
      pendingWrapKey = null;
      dek = newDek;
      await rememberDek(user.id, newDek);
      useAccount.setState({ status: 'showRecovery', recoveryCode: code });
      await startSync();
      return;
    }
    // Známé zařízení?
    const remembered = await recallDek(user.id);
    if (remembered) {
      dek = remembered;
      await finishUnlock(user.id, keys);
      return;
    }
    // Přihlášení heslem: klíč k datům se odemkne heslem.
    if (pendingWrapKey?.userId === user.id && keys.password_wrap) {
      try {
        dek = await unwrapDek(keys.password_wrap, pendingWrapKey.key);
        pendingWrapKey = null;
        await rememberDek(user.id, dek);
        await finishUnlock(user.id, keys);
        return;
      } catch {
        /* heslo se změnilo přes odkaz z e-mailu → záchranný kód */
      }
    }
    useAccount.setState({ status: 'locked' });
  } catch (error) {
    useAccount.setState({ status: 'signedOut', syncError: errorMessage(error) });
    toast.error(errorMessage(error));
  }
}

async function finishUnlock(userId: string, keys: KeysRow): Promise<void> {
  // Po obnově hesla doplnit balení klíče novým heslem.
  if (client && dek && pendingWrapKey?.userId === userId) {
    await client.from('stihnu_keys').update({ password_wrap: await wrapDek(dek, pendingWrapKey.key), updated_at: new Date().toISOString() }).eq('user_id', userId);
    pendingWrapKey = null;
  }
  void keys;
  useAccount.setState({ status: 'ready' });
  await startSync();
}

/** Odemknutí na novém zařízení záchranným kódem. */
export async function unlockWithRecoveryCode(code: string): Promise<void> {
  const user = useAccount.getState().user;
  if (!client || !user) throw new Error('Nejdřív se přihlaste.');
  const { data: keys } = await client.from('stihnu_keys').select('user_id, recovery_wrap, password_wrap').eq('user_id', user.id).single<KeysRow>();
  if (!keys) throw new Error('Účet se nepodařilo načíst. Zkuste to prosím znovu.');
  dek = await unwrapDek(keys.recovery_wrap, await recoveryWrapKey(code));
  await rememberDek(user.id, dek);
  await finishUnlock(user.id, keys);
}

/** Zabalí klíč k datům pro nové zařízení (propojení přes QR); jen když je účet odemčený. */
export async function wrapDekForPairing(wrapKey: CryptoKey): Promise<string> {
  if (!dek || useAccount.getState().status !== 'ready') throw new Error('Nejdřív se přihlaste a odemkněte účet.');
  return wrapDek(dek, wrapKey);
}

/**
 * Nové zařízení z QR kódu: odemkne klíč k datům (klíčem z QR), přihlásí se
 * jednorázovým tokenem a stáhne data. Klíč se uloží dřív než relace, aby
 * přihlášení rovnou skončilo odemčené.
 */
export async function signInWithPairing(userId: string, tokenHash: string, wrapped: string, wrapKey: CryptoKey): Promise<void> {
  if (!client) throw new Error('Účty teď nejsou dostupné.');
  const newDek = await unwrapDek(wrapped, wrapKey);
  const current = useAccount.getState().user;
  if (current && current.id !== userId) await signOutAccount(false);
  await rememberDek(userId, newDek);
  useAccount.setState({ status: 'loading' });
  let result = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (result.error) result = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (result.error || !result.data.session) {
    await forgetDek(userId);
    useAccount.setState({ status: 'signedOut' });
    throw new Error(result.error ? friendlyAuthError(result.error.message) : 'Přihlášení se nepodařilo. Zkuste nový QR kód.');
  }
  dek = newDek;
  await afterSignIn(result.data.session);
}

/** Nový záchranný kód (starý přestane platit). */
export async function regenerateRecoveryCode(): Promise<string> {
  const user = useAccount.getState().user;
  if (!client || !user || !dek) throw new Error('Nejdřív se přihlaste.');
  const code = generateRecoveryCode();
  const { error } = await client.from('stihnu_keys').update({ recovery_wrap: await wrapDek(dek, await recoveryWrapKey(code)), updated_at: new Date().toISOString() }).eq('user_id', user.id);
  if (error) throw new Error('Kód se nepodařilo uložit. Zkuste to prosím znovu.');
  return code;
}

export function acknowledgeRecovery(): void {
  useAccount.setState({ status: 'ready', recoveryCode: null });
}

/* ------------------------------------------------------------------ */
/* Odhlášení a smazání                                                 */
/* ------------------------------------------------------------------ */

/** Odhlásí; data z tohoto zařízení smaže (v účtu zůstanou zašifrovaná). */
export async function signOutAccount(everywhere = false): Promise<void> {
  const user = useAccount.getState().user;
  stopSync();
  try {
    if (user) await forceSync().catch(() => undefined);
    await client?.auth.signOut({ scope: everywhere ? 'global' : 'local' });
  } finally {
    if (user) await forgetDek(user.id);
    dek = null;
    setAccountToken(null);
    window.google?.accounts?.id?.disableAutoSelect();
    useAppStore.getState().clearAllData();
    useAccount.setState({ status: 'signedOut', user: null, recoveryCode: null, lastSyncAt: null });
  }
}

export async function deleteAccount(confirmEmail: string): Promise<void> {
  const user = useAccount.getState().user;
  if (!client || !user) throw new Error('Nejdřív se přihlaste.');
  stopSync();
  // 1) Smazat zašifrovaná data (i kdyby smazání účtu na serveru nebylo zapnuté).
  await client.from('stihnu_vaults').delete().eq('user_id', user.id);
  await client.from('stihnu_keys').delete().eq('user_id', user.id);
  // 2) Smazat účet samotný.
  const response = await fetch('/api/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-stihnu': '1', ...accountAuthHeader() },
    body: JSON.stringify({ op: 'delete', confirmEmail }),
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  await forgetDek(user.id);
  dek = null;
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  useAppStore.getState().clearAllData();
  useAccount.setState({ status: 'signedOut', user: null });
  if (!response.ok) throw new Error(body.message ?? 'Data jsou smazaná, ale účet samotný se smazat nepodařilo.');
}

/* ------------------------------------------------------------------ */
/* Šifrovaná synchronizace                                             */
/* ------------------------------------------------------------------ */

interface VaultPayload {
  format: 'stihnu-vault';
  v: 1;
  savedAt: string;
  deviceId: string;
  data: SnapshotData;
  google?: { account?: GoogleAccount; connectedAt?: string };
}

/** Nastavení, která se v účtu sdílí navíc proti Disku (propojení a poloha). */
const EXTRA_KEYS = ['origin', 'originStop', 'google', 'theme', 'googleSealed'] as const;

function localData(): SnapshotData {
  const s = useAppStore.getState();
  const live = s.googleSync.live;
  const settings: Record<string, unknown> = { ...pickSharedSettings(s.settings) };
  for (const k of EXTRA_KEYS) settings[k] = s.settings[k];
  return snapshotData({
    subjects: s.subjects,
    events: s.events,
    requirements: s.requirements,
    tasks: s.tasks,
    materials: s.materials,
    milestones: s.milestones,
    tombstones: s.tombstones,
    settings: settings as SnapshotData['settings'],
    settingsUpdatedAt: s.meta.settingsUpdatedAt,
    settingsStamps: s.meta.settingsStamps,
    google: { links: live.links, containers: live.containers, excluded: live.excluded },
  });
}

let version = 0;
let lastFingerprint = '';
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pullTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;
let running: Promise<void> | null = null;

const fingerprint = (d: SnapshotData) => {
  const text = JSON.stringify(d);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
};

async function pullAndMerge(): Promise<boolean> {
  const user = useAccount.getState().user;
  if (!client || !user || !dek) return false;
  const { data: row, error } = await client.from('stihnu_vaults').select('version, ciphertext, iv').eq('user_id', user.id).maybeSingle<{ version: number; ciphertext: string; iv: string }>();
  if (error) throw new Error('Synchronizace se nepodařila (server účtů neodpovídá).');
  if (!row) {
    version = 0;
    return true;
  }
  if (row.version === version) return false;
  const remote = await openJson<VaultPayload>(dek, row.ciphertext, row.iv, user.id);
  version = row.version;
  const outcome = mergeSnapshots(localData(), remote.data);
  // Účet už je nastavený (z jiného zařízení) → průvodce nastavením ani prohlídku znovu nenabízet.
  const st = useAppStore.getState();
  if ((remote.data.subjects.length > 0 || (remote.data.settings?.icsSources?.length ?? 0) > 0) && (!st.meta.setupDone || !st.meta.tourSeen)) {
    st.setSetup({ done: true });
    st.markTourSeen();
  }
  if (outcome.changedLocal) {
    applyingRemote = true;
    try {
      useAppStore.getState().applyDriveMerge(outcome.merged);
      if (remote.google?.connectedAt && !useAppStore.getState().googleSync.live.connectedAt && remote.data.settings && 'googleSealed' in remote.data.settings) {
        useAppStore.getState().patchGoogleSync('live', { account: remote.google.account, connectedAt: remote.google.connectedAt });
      }
    } finally {
      setTimeout(() => (applyingRemote = false), 50);
    }
  }
  return outcome.changedRemote;
}

async function push(): Promise<void> {
  const user = useAccount.getState().user;
  if (!client || !user || !dek) return;
  const data = localData();
  const fp = fingerprint(data);
  if (fp === lastFingerprint) return;
  const s = useAppStore.getState();
  const payload: VaultPayload = {
    format: 'stihnu-vault',
    v: 1,
    savedAt: new Date().toISOString(),
    deviceId: s.meta.deviceId,
    data: buildSnapshot(data, s.meta.deviceId, new Date()).data,
    google: { account: s.googleSync.live.account, connectedAt: s.googleSync.live.connectedAt },
  };
  const sealed = await sealJson(dek, payload, user.id);
  if (version === 0) {
    const { error } = await client.from('stihnu_vaults').insert({ user_id: user.id, version: 1, ciphertext: sealed.ciphertext, iv: sealed.iv });
    if (error) throw new Error('conflict');
    version = 1;
  } else {
    const { data: updated, error } = await client
      .from('stihnu_vaults')
      .update({ version: version + 1, ciphertext: sealed.ciphertext, iv: sealed.iv, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('version', version)
      .select('version');
    if (error || !updated?.length) throw new Error('conflict');
    version += 1;
  }
  lastFingerprint = fp;
}

/** Stáhnout, sloučit a nahrát (s opakováním při souběžné změně z jiného zařízení). */
export function forceSync(): Promise<void> {
  if (running) return running;
  running = (async () => {
    useAccount.setState({ syncing: true });
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        await pullAndMerge();
        try {
          await push();
          break;
        } catch (error) {
          if ((error as Error).message !== 'conflict' || attempt === 3) throw error;
        }
      }
      useAccount.setState({ lastSyncAt: new Date().toISOString(), syncError: null });
    } catch (error) {
      useAccount.setState({ syncError: (error as Error).message === 'conflict' ? 'Souběžná změna z jiného zařízení – zkusím to znovu.' : errorMessage(error) });
    } finally {
      useAccount.setState({ syncing: false });
      running = null;
    }
  })();
  return running;
}

async function startSync(): Promise<void> {
  stopSync();
  version = 0;
  lastFingerprint = '';
  // Vlastní data: ukázka pryč.
  if (useAppStore.getState().settings.mode === 'demo') useAppStore.getState().startOwnData();
  await forceSync();
  unsubscribe = useAppStore.subscribe(() => {
    if (applyingRemote) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void forceSync(), 3000);
  });
  pullTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void forceSync();
  }, 90_000);
  window.addEventListener('focus', onFocus);
}

function onFocus(): void {
  void forceSync();
}

function stopSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (pushTimer) clearTimeout(pushTimer);
  if (pullTimer) clearInterval(pullTimer);
  pushTimer = null;
  pullTimer = null;
  window.removeEventListener('focus', onFocus);
}

/** Pro export „Stáhnout moje data“ – rozšifrovaný obsah účtu. */
export async function exportAccountData(): Promise<string> {
  await forceSync();
  return JSON.stringify({ exportedAt: new Date().toISOString(), account: useAccount.getState().user?.email, data: localData() }, null, 2);
}
