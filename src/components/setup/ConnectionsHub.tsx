/**
 * Sdílené prvky propojení: ikony služeb (logo Google), karta Soukromí
 * a návod pro správce serveru (jen pro správce v Nastavení → Server).
 */
import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import type { ServiceId } from '../../hooks/useConnections';
import { useAppStore } from '../../store/appStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { Glyph, GlyphTile, type GlyphName } from '../ui/Glyph';
import { cn } from '../ui/primitives';

/** Oficiální logo Google „G“ (podle pravidel pro přihlašovací tlačítka). */
export function GoogleG({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

const VISUAL: Record<Exclude<ServiceId, 'google'>, GlyphName> = {
  weather: 'weather',
  transit: 'tram',
  location: 'pin',
  school: 'building',
  sis: 'cap',
  moodle: 'book',
  music: 'note',
  notifications: 'bell',
  ai: 'ai',
};

/** Ikona služby: vlastní kresba, u Googlu jeho logo. */
export function ServiceVisual({ id, size = 34 }: { id: ServiceId; size?: number }) {
  if (id === 'google') return <GoogleG size={Math.round(size * 0.7)} />;
  return <Glyph name={VISUAL[id]} size={Math.round(size * 0.66)} />;
}

export function PrivacyCard() {
  const clearAllData = useAppStore((s) => s.clearAllData);
  return (
    <div className="card rounded-[24px] p-5">
      <p className="flex items-center gap-2.5 text-[16px] font-bold">
        <GlyphTile name="shield" size={34} /> Soukromí a bezpečnost
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-snug text-muted marker:text-accent">
        <li>S účtem se rozvrh, úkoly i nastavení šifrují přímo ve vašem zařízení – na serveru je jen zašifrovaný balík, který nikdo jiný nepřečte. Bez účtu zůstává vše jen v tomto prohlížeči.</li>
        <li>Pro cestu se posílá jen poloha startu a cíle (do plánovače PID) a pro počasí jen přibližná poloha.</li>
        <li>Google a Moodle vidí jen to, co jim povolíte. Odpojit je můžete kdykoli jedním kliknutím.</li>
        <li>
          Kód aplikace je otevřený – kdokoli si může ověřit, co dělá.{' '}
          <a href="https://github.com/andron297/prazskystudent" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Zdrojový kód
          </a>
        </li>
      </ul>
      <button
        type="button"
        onClick={async () => {
          if (await confirmAction({ title: 'Smazat všechna data?', message: 'Smaže rozvrh, úkoly, propojení i nastavení v tomhle prohlížeči. Nejde to vrátit.', confirmLabel: 'Smazat vše', tone: 'danger' })) {
            clearAllData();
            toast.success('Všechna data v tomhle prohlížeči jsou smazaná.');
          }
        }}
        className="mt-4 text-[13px] font-semibold text-red-700 hover:underline dark:text-red-300"
      >
        Smazat všechna moje data
      </button>
    </div>
  );
}

function CopyName({ name }: { name: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(name).then(() => toast.success(`Zkopírováno: ${name}`));
      }}
      className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-fg hover:bg-line"
      title="Zkopírovat název"
    >
      {name} <Copy className="size-3" aria-hidden />
    </button>
  );
}

/** Jednorázové nastavení serveru (Vercel) – pro toho, kdo aplikaci provozuje. */
export function OwnerCard() {
  const server = useUiStore((s) => s.server);
  const [open, setOpen] = useState(false);
  const supabaseCallback = server.account ? `${server.account.url}/auth/v1/callback` : null;
  const rows: { ok: boolean; title: string; why: string; vars: string[]; how: React.ReactNode }[] = [
    {
      ok: Boolean(server.account) && server.accountSchema === 'ok',
      title: 'Účty a synchronizace mezi zařízeními (nejdůležitější)',
      why: server.account
        ? server.accountSchema === 'ok'
          ? 'Databáze účtů je připravená.'
          : 'Supabase je připojené, ale databáze účtů ještě není připravená – zkontrolujte krok 1.'
        : 'Bez toho jsou data jen v jednom zařízení.',
      vars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'POSTGRES_URL'],
      how: (
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Ve Vercelu otevřete projekt <strong>prazskystudent</strong> → záložka <strong>Storage</strong> → <strong>Create Database</strong> → <strong>Supabase</strong> → plán Free, region <strong>Frankfurt</strong> → <strong>Create</strong>. Pak ji připojte k projektu
            (<strong>Connect</strong>, všechna prostředí). Proměnné se doplní samy, tabulky si aplikace založí sama.
          </li>
          <li>
            Dejte <strong>Redeploy</strong> (Deployments → ⋯ → Redeploy).
          </li>
          <li>
            Ze Storage otevřete Supabase (<strong>Open in Supabase</strong>) → <strong>Authentication → Sign In / Providers → Google</strong> → zapněte, do <strong>Client IDs</strong> vložte Client ID a do <strong>Client Secret</strong> secret
            (stejné jako u GOOGLE_CLIENT_ID a GOOGLE_CLIENT_SECRET) → <strong>Save</strong>.
          </li>
          <li>
            V Supabase <strong>Authentication → URL Configuration</strong>: Site URL <CopyName name={typeof window !== 'undefined' ? window.location.origin : 'https://stihnuto.vercel.app'} />, do Redirect URLs přidejte{' '}
            <CopyName name={`${typeof window !== 'undefined' ? window.location.origin : 'https://stihnuto.vercel.app'}/**`} />.
          </li>
          {supabaseCallback && (
            <li>
              V Google Cloud → Clients → váš klient → <strong>Authorized redirect URIs</strong> přidejte <CopyName name={supabaseCallback} /> a uložte.
            </li>
          )}
        </ol>
      ),
    },
    {
      ok: server.aiProvider !== null,
      title: 'AI zdarma pro všechny',
      why: server.aiProvider === 'ovh' ? 'Běží bezplatná AI z OVHcloud (EU) bez klíče. Vlastní klíč (GEMINI_API_KEY, OPENAI_API_KEY nebo ANTHROPIC_API_KEY) ji může nahradit.' : 'Chytré čtení sylabů, stránek z Moodlu a PDF bez vlastního klíče.',
      vars: ['FREE_AI'],
      how: <>Bezplatná AI je zapnutá automaticky. Vypnout ji jde proměnnou FREE_AI=off.</>,
    },
    {
      ok: Boolean(server.contactEmail),
      title: 'Kontaktní e-mail',
      why: 'Zobrazí se v zásadách ochrany osobních údajů a v podmínkách (vyžaduje to GDPR).',
      vars: ['PUBLIC_CONTACT_EMAIL'],
      how: <>Vložte e-mail, na který vám mohou uživatelé psát kvůli svým údajům.</>,
    },
    {
      ok: server.googleServerFlow,
      title: 'Trvalé přihlášení Googlem',
      why: 'Bez toho Google po hodině nečinnosti chce znovu potvrdit přihlášení.',
      vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      how: (
        <>
          V{' '}
          <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Google Cloud → Clients
          </a>{' '}
          otevřete svého klienta a zkopírujte Client ID a Client secret. V{' '}
          <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Audience
          </a>{' '}
          přepněte aplikaci na <strong>In production</strong> (jinak Google přihlášení po 7 dnech zruší).
        </>
      ),
    },
    {
      ok: Boolean(server.googlePickerKey),
      title: 'Výběr souborů a složek z Google Disku',
      why: 'Studenti si k předmětům přidají cokoli z Disku jedním klepnutím (bez toho jen vložením odkazu).',
      vars: ['GOOGLE_PICKER_API_KEY'],
      how: (
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            V Google Cloud (stejný projekt jako přihlášení Googlem) otevřete{' '}
            <a href="https://console.cloud.google.com/apis/library/picker.googleapis.com" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              Google Picker API
            </a>{' '}
            a klikněte <strong>Enable</strong>.
          </li>
          <li>
            V{' '}
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              Credentials
            </a>{' '}
            → <strong>Create credentials → API key</strong>. U klíče nastavte <strong>Application restrictions: Websites</strong> s adresou <CopyName name={`${typeof window !== 'undefined' ? window.location.origin : 'https://stihnuto.vercel.app'}/*`} /> a{' '}
            <strong>API restrictions: Google Picker API</strong>.
          </li>
          <li>Klíč vložte do Vercelu jako GOOGLE_PICKER_API_KEY a dejte Redeploy. (Tenhle klíč je veřejný z principu – chrání ho omezení na vaši adresu.)</li>
        </ol>
      ),
    },
    {
      ok: server.golemio,
      title: 'Klimatizace a bezbariérovost spojů (nepovinné)',
      why: 'Doprava funguje i bez toho; Golemio přidá podrobnosti o vozech.',
      vars: ['GOLEMIO_API_KEY'],
      how: (
        <>
          Klíč zdarma na{' '}
          <a href="https://api.golemio.cz/api-keys" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            api.golemio.cz
          </a>
          .
        </>
      ),
    },
  ];
  const missing = rows.filter((r) => !r.ok).length;
  return (
    <div id="spravce" className="card scroll-mt-24 rounded-[24px] p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <GlyphTile name="key" size={34} tone="muted" />
        <span className="flex-1">
          <span className="block text-[16px] font-bold">Pro správce aplikace</span>
          <span className="block text-[13px] text-muted">{missing ? `${missing} ${missing === 1 ? 'věc' : 'věci'} na serveru ještě není nastavená` : 'Server je nastavený'}</span>
        </span>
        <ChevronDown className={cn('size-5 text-muted transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-[13.5px] text-muted">
            <strong className="text-fg">Stačí jednou a platí pro všechny uživatele</strong> – běžní uživatelé tuhle kartu nepotřebují. Jednou nastavíte ve Vercelu (projekt → <strong>Settings → Environment Variables</strong>), pak <strong>Redeploy</strong>. Klíče zůstávají na serveru, do prohlížeče ani do kódu se nedostanou.{' '}
            <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">
              Otevřít Vercel <ExternalLink className="size-3" aria-hidden />
            </a>
          </p>
          {rows.map((r) => (
            <div key={r.title} className="rounded-[18px] bg-surface-2/70 p-3.5">
              <p className="flex items-center gap-2 text-[14.5px] font-bold">
                <span className={cn('grid size-6 place-items-center rounded-full', r.ok ? 'bg-accent text-accent-fg' : 'bg-surface ring-1 ring-inset ring-line-strong')}>{r.ok ? <Check className="size-3.5" aria-hidden /> : null}</span>
                {r.title}
              </p>
              <p className="mt-1 text-[13px] text-muted">{r.why}</p>
              {!r.ok && (
                <div className="mt-2 space-y-1.5 text-[13px]">
                  <p className="flex flex-wrap items-center gap-1.5">
                    Proměnné: {r.vars.map((v) => <CopyName key={v} name={v} />)}
                  </p>
                  <p className="text-muted">{r.how}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
