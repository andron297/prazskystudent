import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAccount } from '../../server/account';
import { parsePairingCode } from '../services/pairing';

/** Napodobenina Supabase Auth (GoTrue) – jen to, co párování používá. */
function fakeSupabase() {
  const user = { id: '0b8f6a3e-1111-4222-8333-944455556666', email: 'student@example.cz', app_metadata: { provider: 'email' } as Record<string, unknown> };
  let links = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: user.id, email: user.email }), { status: 200 });
    if (url.includes('/auth/v1/admin/users/') && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify(user), { status: 200 });
    if (url.includes('/auth/v1/admin/users/') && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { app_metadata: Record<string, unknown> };
      for (const [k, v] of Object.entries(body.app_metadata)) {
        if (v === null) delete user.app_metadata[k];
        else user.app_metadata[k] = v;
      }
      return new Response(JSON.stringify(user), { status: 200 });
    }
    if (url.endsWith('/auth/v1/admin/generate_link')) {
      links++;
      return new Response(JSON.stringify({ id: user.id, hashed_token: `hash-${links}`, verification_type: 'magiclink' }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  return { user, fetchMock, links: () => links };
}

const post = (body: unknown, auth = true) =>
  new Request('https://prazskystudent.vercel.app/api/account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-stihnu': '1', ...(auth ? { authorization: `Bearer ${'t'.repeat(40)}` } : {}) },
    body: JSON.stringify(body),
  });

const WRAPPED = 'A'.repeat(80);

describe('propojení zařízení přes QR (server)', () => {
  let sb: ReturnType<typeof fakeSupabase>;
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://abcdefgh.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    sb = fakeSupabase();
    vi.stubGlobal('fetch', sb.fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('vytvoří kód, telefon ho jednou vyzvedne a počítač vidí připojené zařízení', async () => {
    const created = (await (await handleAccount(post({ op: 'pair-create', wrapped: WRAPPED }))).json()) as { pairId: string; userId: string; expiresAt: number };
    expect(created.pairId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(created.userId).toBe(sb.user.id);
    // Server si drží jen otisk ID, ne ID samotné
    const stored = sb.user.app_metadata.stihnu_pair as { h: string; st: string; w: string };
    expect(stored.st).toBe('pending');
    expect(stored.h).not.toContain(created.pairId);
    expect(stored.w).toBe(WRAPPED);

    const pending = (await (await handleAccount(post({ op: 'pair-status', pairId: created.pairId }))).json()) as { status: string };
    expect(pending.status).toBe('pending');

    const claim = await handleAccount(post({ op: 'pair-claim', userId: created.userId, pairId: created.pairId, device: 'iPhone · Safari <script>' }, false));
    expect(claim.status).toBe(200);
    const claimed = (await claim.json()) as { tokenHash: string; wrapped: string };
    expect(claimed.tokenHash).toBe('hash-1');
    expect(claimed.wrapped).toBe(WRAPPED);
    // Zabalený klíč po vyzvednutí na serveru nezůstává
    expect((sb.user.app_metadata.stihnu_pair as { w?: string }).w).toBeUndefined();

    const status = (await (await handleAccount(post({ op: 'pair-status', pairId: created.pairId }))).json()) as { status: string; device: string };
    expect(status.status).toBe('claimed');
    expect(status.device).toBe('iPhone · Safari script');

    // Podruhé už kód neplatí
    const again = await handleAccount(post({ op: 'pair-claim', userId: created.userId, pairId: created.pairId }, false));
    expect(again.status).toBe(410);
    expect(sb.links()).toBe(1);
  });

  it('cizí nebo vypršelý kód neprojde', async () => {
    const created = (await (await handleAccount(post({ op: 'pair-create', wrapped: WRAPPED }))).json()) as { pairId: string; userId: string };
    const wrong = await handleAccount(post({ op: 'pair-claim', userId: created.userId, pairId: 'x'.repeat(22) }, false));
    expect(wrong.status).toBe(410);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 4 * 60_000);
    const late = await handleAccount(post({ op: 'pair-claim', userId: created.userId, pairId: created.pairId }, false));
    expect(late.status).toBe(410);
    expect(sb.links()).toBe(0);
  });

  it('vytvořit kód jde jen přihlášenému a bez ochranné hlavičky nic', async () => {
    sb.fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 401 }));
    const anon = await handleAccount(post({ op: 'pair-create', wrapped: WRAPPED }, false));
    expect(anon.status).toBe(401);
    const noHeader = await handleAccount(new Request('https://x/api/account', { method: 'POST', body: '{"op":"pair-claim"}' }));
    expect(noHeader.status).toBe(403);
  });

  it('nesmyslná data odmítne', async () => {
    const bad = await handleAccount(post({ op: 'pair-claim', userId: 'nope', pairId: '../../etc' }, false));
    expect(bad.status).toBe(400);
    const badWrap = await handleAccount(post({ op: 'pair-create', wrapped: 'krátké' }));
    expect(badWrap.status).toBe(400);
  });
});

describe('kód z QR (klient)', () => {
  const id = '0b8f6a3e-1111-4222-8333-944455556666';
  const pair = 'abcdefghijklmnopqrstuv';
  const key = 'K'.repeat(43);
  it('přečte celý odkaz i jen část za #', () => {
    expect(parsePairingCode(`https://prazskystudent.vercel.app/#/pripojit/${id}.${pair}.${key}`)).toEqual({ userId: id, pairId: pair, key });
    expect(parsePairingCode(`pripojit/${id}.${pair}.${key}`)?.pairId).toBe(pair);
  });
  it('odmítne jiné odkazy a poškozené kódy', () => {
    expect(parsePairingCode('https://example.com')).toBeNull();
    expect(parsePairingCode(`pripojit/${id}.${pair}.${key.slice(5)}`)).toBeNull();
    expect(parsePairingCode(`pripojit/${id}.${pair}.${key}X`)).toBeNull();
  });
});
