/**
 * Účty přes Supabase (Auth + Postgres s Row Level Security).
 * Server nikdy nedostane obsah dat studenta – v databázi je jen zašifrovaný
 * trezor (šifruje se v prohlížeči). Tady je jen konfigurace, ověření
 * přihlášení a jednorázové založení tabulek.
 *
 * Proměnné (vytvoří je integrace Supabase ve Vercelu, případně ručně):
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY / *_PUBLISHABLE_KEY  (veřejný klíč)
 *   SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY                         (jen server – smazání účtu)
 *   POSTGRES_URL_NON_POOLING / POSTGRES_URL                                 (jen server – založení tabulek)
 */

const env = (...names: string[]): string | undefined => {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
};

export interface AccountConfig {
  url: string;
  anonKey: string;
}

export function accountConfig(): AccountConfig | null {
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey || !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url.replace(/\/+$/, ''))) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export function serviceKey(): string | undefined {
  return env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
}

export function postgresUrl(): string | undefined {
  return env('POSTGRES_URL_NON_POOLING', 'POSTGRES_URL', 'DATABASE_URL');
}

export interface VerifiedUser {
  id: string;
  email?: string;
}

const verifyCache = new Map<string, { user: VerifiedUser; at: number }>();

/** Ověří přihlášení (Bearer token Supabase) dotazem na Supabase Auth. */
export async function verifyUser(request: Request): Promise<VerifiedUser | null> {
  const config = accountConfig();
  const header = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(header)?.[1];
  if (!config || !token) return null;
  const cached = verifyCache.get(token);
  if (cached && Date.now() - cached.at < 60_000) return cached.user;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = (await response.json().catch(() => null)) as { id?: string; email?: string } | null;
  if (!data?.id) return null;
  const user = { id: data.id, email: data.email };
  verifyCache.set(token, { user, at: Date.now() });
  if (verifyCache.size > 500) verifyCache.clear();
  return user;
}

/* ------------------------------------------------------------------ */
/* Tabulky – založí se samy (idempotentně), pokud server zná databázi  */
/* ------------------------------------------------------------------ */

export const SCHEMA_SQL = `
create table if not exists public.stihnu_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 1,
  ciphertext text not null check (octet_length(ciphertext) < 8000000),
  iv text not null check (octet_length(iv) < 64),
  updated_at timestamptz not null default now()
);
create table if not exists public.stihnu_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_wrap text not null check (octet_length(recovery_wrap) < 512),
  password_wrap text check (octet_length(password_wrap) < 512),
  kdf_iterations integer not null default 600000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stihnu_vaults enable row level security;
alter table public.stihnu_keys enable row level security;
alter table public.stihnu_vaults force row level security;
alter table public.stihnu_keys force row level security;
revoke all on public.stihnu_vaults from anon, public;
revoke all on public.stihnu_keys from anon, public;
grant select, insert, update, delete on public.stihnu_vaults to authenticated;
grant select, insert, update, delete on public.stihnu_keys to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stihnu_vaults' and policyname = 'stihnu_vault_owner') then
    create policy stihnu_vault_owner on public.stihnu_vaults for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stihnu_keys' and policyname = 'stihnu_keys_owner') then
    create policy stihnu_keys_owner on public.stihnu_keys for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
`;

let schemaState: 'unknown' | 'ok' | 'missing' | 'error' = 'unknown';
let schemaCheckedAt = 0;

/** Stav tabulek; když chybí a server zná databázi, založí je. */
export async function ensureSchema(): Promise<'ok' | 'missing' | 'error' | 'off'> {
  if (!accountConfig()) return 'off';
  if (schemaState === 'ok') return 'ok';
  if (Date.now() - schemaCheckedAt < 30_000 && schemaState !== 'unknown') return schemaState as 'missing' | 'error';
  schemaCheckedAt = Date.now();
  const url = postgresUrl();
  if (!url) {
    schemaState = 'missing';
    return 'missing';
  }
  try {
    const { default: postgres } = await import('postgres');
    const sql = postgres(url, { ssl: 'require', max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false });
    try {
      await sql.unsafe(SCHEMA_SQL);
      schemaState = 'ok';
    } finally {
      await sql.end({ timeout: 2 });
    }
  } catch {
    schemaState = 'error';
  }
  return schemaState as 'ok' | 'error';
}
