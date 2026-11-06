// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../services/google/auth', () => ({ loadIdentityScript: async () => undefined, registerSealedGoogleToken: () => undefined }));

import { handleAccount } from '../../server/account';
import { useAppStore } from '../store/appStore';
import { __afterSignInForTests, __setClientForTests, acknowledgeRecovery, forceSync, signOutAccount, useAccount } from '../services/account';
import { forgetDek } from '../services/deviceKeys';
import { claimPairing, createPairing, parsePairingCode } from '../services/pairing';

/** Napodobenina Supabase: tabulky v paměti, filtry eq, jako PostgREST s RLS pro jednoho uživatele. */
function fakeSupabase(db: Record<string, Record<string, unknown>[]>, userId: string) {
  const builder = (table: string) => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Record<string, unknown> = {};
    let returning = false;
    const filters: [string, unknown][] = [];
    const rows = () => (db[table] ??= []).filter((r) => r.user_id === userId && filters.every(([k, v]) => r[k] === v));
    const run = () => {
      if (op === 'insert') {
        if ((db[table] ??= []).some((r) => r.user_id === payload.user_id)) return { data: null, error: { message: 'duplicate key' } };
        db[table].push({ ...payload });
        return { data: null, error: null };
      }
      if (op === 'update') {
        const hit = rows();
        hit.forEach((r) => Object.assign(r, payload));
        return { data: returning ? hit.map((r) => ({ version: r.version })) : null, error: null };
      }
      if (op === 'delete') {
        db[table] = (db[table] ?? []).filter((r) => !rows().includes(r));
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };
    const b = {
      select() {
        if (op !== 'select') returning = true;
        return b;
      },
      insert(p: Record<string, unknown>) {
        op = 'insert';
        payload = p;
        return b;
      },
      update(p: Record<string, unknown>) {
        op = 'update';
        payload = p;
        return b;
      },
      delete() {
        op = 'delete';
        return b;
      },
      eq(k: string, v: unknown) {
        filters.push([k, v]);
        return b;
      },
      async maybeSingle() {
        const r = run();
        return { data: (r.data as unknown[])?.[0] ?? null, error: r.error };
      },
      async single() {
        const r = run();
        return { data: (r.data as unknown[])?.[0] ?? null, error: r.error };
      },
      then(resolve: (v: unknown) => void) {
        resolve(run());
      },
    };
    return b;
  };
  return { from: builder, auth: { signOut: async () => ({ error: null }), verifyOtp: async ({ token_hash }: { token_hash: string }) => (token_hash === 'hash-ok' ? { data: { session: session(userId) }, error: null } : { data: { session: null }, error: { message: 'Token has expired or is invalid' } }) } };
}

const UID = '0b8f6a3e-1111-4222-8333-944455556666';
const session = (id: string) => ({ access_token: 'token-aaaaaaaaaaaaaaaaaaaaaaaa', user: { id, email: 'student@example.cz', app_metadata: { provider: 'google' }, user_metadata: {} } });

/** Server /api/account s napodobeninou Supabase Auth (admin API). */
function wireServer() {
  const authUser = { id: UID, email: 'student@example.cz', app_metadata: {} as Record<string, unknown> };
  vi.stubEnv('SUPABASE_URL', 'https://abcdefgh.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/api/account')) return handleAccount(new Request('https://prazskystudent.vercel.app/api/account', init));
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: UID, email: authUser.email }), { status: 200 });
    if (url.includes('/auth/v1/admin/users/') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { app_metadata: Record<string, unknown> };
      for (const [k, v] of Object.entries(body.app_metadata)) {
        if (v === null) delete authUser.app_metadata[k];
        else authUser.app_metadata[k] = v;
      }
      return new Response(JSON.stringify(authUser), { status: 200 });
    }
    if (url.includes('/auth/v1/admin/users/')) return new Response(JSON.stringify(authUser), { status: 200 });
    if (url.endsWith('/auth/v1/admin/generate_link')) return new Response(JSON.stringify({ hashed_token: 'hash-ok' }), { status: 200 });
    return realFetch(input as RequestInfo, init);
  });
  return authUser;
}

describe('propojení telefonu přes QR – celý průběh', () => {
  const db: Record<string, Record<string, unknown>[]> = {};
  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('počítač ukáže kód, telefon se přihlásí, odemkne a má stejná data', async () => {
    wireServer();
    // Počítač: účet s daty
    await forgetDek(UID);
    useAppStore.getState().startOwnData();
    useAppStore.getState().addTask({ title: 'Odevzdat seminárku z dějin médií' });
    __setClientForTests(fakeSupabase(db, UID));
    await __afterSignInForTests(session(UID));
    acknowledgeRecovery();
    await forceSync();
    expect(useAccount.getState().status).toBe('ready');

    const ticket = await createPairing();
    const code = parsePairingCode(ticket.url);
    expect(code).not.toBeNull();
    // Zabalený klíč na serveru neobsahuje klíč z QR
    expect(ticket.url).not.toContain('hash-ok');

    // Telefon: čisté zařízení, nic nezná
    await signOutAccount();
    await forgetDek(UID);
    expect(useAppStore.getState().tasks.some((t) => t.title.includes('seminárku'))).toBe(false);
    __setClientForTests(fakeSupabase(db, UID));
    useAccount.setState({ status: 'signedOut', user: null });

    await claimPairing(code!);
    expect(useAccount.getState().status).toBe('ready');
    expect(useAccount.getState().user?.email).toBe('student@example.cz');
    expect(useAppStore.getState().tasks.some((t) => t.title === 'Odevzdat seminárku z dějin médií')).toBe(true);

    // Stejný kód podruhé neprojde
    await expect(claimPairing(code!)).rejects.toThrow(/neplatí/);
  });

  it('se špatným klíčem z QR data neodemkne', async () => {
    wireServer();
    __setClientForTests(fakeSupabase(db, UID));
    await __afterSignInForTests(session(UID));
    expect(useAccount.getState().status).toBe('ready');
    const ticket = await createPairing();
    const code = parsePairingCode(ticket.url)!;
    const tampered = { ...code, key: (code.key[0] === 'A' ? 'B' : 'A') + code.key.slice(1) };
    await expect(claimPairing(tampered)).rejects.toThrow(/nesedí/);
  });
});
