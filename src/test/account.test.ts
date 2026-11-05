// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/google/auth', () => ({ loadIdentityScript: async () => undefined, registerSealedGoogleToken: () => undefined }));

import { useAppStore } from '../store/appStore';
import { __afterSignInForTests, __setClientForTests, acknowledgeRecovery, forceSync, unlockWithRecoveryCode, useAccount } from '../services/account';
import { forgetDek } from '../services/deviceKeys';

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
  return { from: builder, auth: { signOut: async () => ({ error: null }) } };
}

const session = (id: string) => ({ access_token: 'token-aaaaaaaaaaaaaaaaaaaaaaaa', user: { id, email: 'student@example.cz', app_metadata: { provider: 'google' }, user_metadata: {} } });

describe('účet: šifrovaná synchronizace mezi zařízeními', () => {
  const db: Record<string, Record<string, unknown>[]> = {};
  beforeEach(async () => {
    await forgetDek('u1');
  });

  it('nový účet → záchranný kód, trezor na serveru je zašifrovaný', async () => {
    useAppStore.getState().startOwnData();
    useAppStore.getState().addTask({ title: 'Napsat esej o médiích' });
    __setClientForTests(fakeSupabase(db, 'u1'));
    await __afterSignInForTests(session('u1'));
    const st = useAccount.getState();
    expect(st.status).toBe('showRecovery');
    expect(st.recoveryCode).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(db.stihnu_keys).toHaveLength(1);
    expect(String(db.stihnu_keys[0].recovery_wrap)).not.toContain(st.recoveryCode!);
    expect(db.stihnu_vaults).toHaveLength(1);
    expect(String(db.stihnu_vaults[0].ciphertext)).not.toMatch(/esej|Napsat/i);
    (globalThis as { __code?: string }).__code = st.recoveryCode!;
    acknowledgeRecovery();
    expect(useAccount.getState().status).toBe('ready');
  });

  it('druhé zařízení: bez kódu zamčeno, se záchranným kódem data dorazí', async () => {
    useAppStore.getState().clearAllData();
    expect(useAppStore.getState().tasks.some((t) => t.title === 'Napsat esej o médiích')).toBe(false);
    __setClientForTests(fakeSupabase(db, 'u1'));
    await __afterSignInForTests(session('u1'));
    expect(useAccount.getState().status).toBe('locked');
    await expect(unlockWithRecoveryCode('AAAAA-AAAAA-AAAAA-AAAAA-AAAAA')).rejects.toThrow(/nesedí/);
    await unlockWithRecoveryCode((globalThis as { __code?: string }).__code!.toLowerCase());
    expect(useAccount.getState().status).toBe('ready');
    expect(useAppStore.getState().tasks.some((t) => t.title === 'Napsat esej o médiích')).toBe(true);
  });

  it('souběžná změna z jiného zařízení se sloučí, nic se neztratí', async () => {
    // jiné zařízení mezitím uložilo novou verzi trezoru
    const before = Number(db.stihnu_vaults[0].version);
    db.stihnu_vaults[0].version = before + 1;
    useAppStore.getState().addTask({ title: 'Vrátit knihy' });
    await forceSync();
    expect(useAccount.getState().syncError).toBeNull();
    expect(Number(db.stihnu_vaults[0].version)).toBeGreaterThan(before + 1);
    const titles = useAppStore.getState().tasks.map((t) => t.title);
    expect(titles).toContain('Vrátit knihy');
    expect(titles).toContain('Napsat esej o médiích');
  });

  it('cizí uživatel trezor nerozšifruje (vázaný na účet)', async () => {
    const other: Record<string, Record<string, unknown>[]> = { stihnu_keys: [{ ...db.stihnu_keys[0], user_id: 'u2' }], stihnu_vaults: [{ ...db.stihnu_vaults[0], user_id: 'u2' }] };
    await forgetDek('u2');
    useAppStore.getState().clearAllData();
    __setClientForTests(fakeSupabase(other, 'u2'));
    await __afterSignInForTests({ ...session('u2'), user: { ...session('u2').user, id: 'u2' } });
    await unlockWithRecoveryCode((globalThis as { __code?: string }).__code!);
    // klíč se odemkl (stejný zabalený klíč), ale obsah je svázaný s účtem u1 → nejde rozšifrovat
    expect(useAccount.getState().syncError).toMatch(/rozšifrovat/);
    expect(useAppStore.getState().tasks.some((t) => t.title === 'Vrátit knihy')).toBe(false);
  });
});
