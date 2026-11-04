/**
 * Přehled propojení: u každé služby jedna věta, jasný stav a jedno tlačítko.
 * Pod tím soukromí (kde jsou data, co kam jde) a krátký návod pro správce.
 */
import { useState } from 'react';
import {
  BellRing,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronDown,
  CloudSun,
  Copy,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Lock,
  MapPin,
  Music2,
  ShieldCheck,
  Sparkles,
  TramFront,
  type LucideIcon,
} from 'lucide-react';
import { spotifyEmbedUrl } from '../../lib/music';
import { useConnections, type ServiceId, type ServiceStatus } from '../../hooks/useConnections';
import { connectGoogle } from '../../services/syncCenter';
import { useAppStore } from '../../store/appStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';
import { StateDot } from './SetupWizard';

const ICON: Record<ServiceId, LucideIcon> = {
  weather: CloudSun,
  transit: TramFront,
  location: MapPin,
  sis: GraduationCap,
  moodle: BookOpenCheck,
  google: CalendarDays,
  music: Music2,
  notifications: BellRing,
  ai: Sparkles,
};

const STATE_LABEL: Record<ServiceStatus['state'], string> = {
  auto: 'Funguje samo',
  connected: 'Propojeno',
  attention: 'Potřebuje 1 klik',
  todo: 'Nepropojeno',
  skipped: 'Přeskočeno',
  unavailable: 'Zatím nejde',
};

const WIZARD_STEP: Partial<Record<ServiceId, string>> = { location: 'location', sis: 'sis', moodle: 'moodle', google: 'google', music: 'extras', notifications: 'extras' };

export function ConnectionsHub() {
  const { services, done, total, attention } = useConnections();
  const openSetup = useUiStore((s) => s.openSetup);
  const music = useAppStore((s) => s.settings.music);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const firstTodo = services.find((s) => !s.optional && (s.state === 'todo' || s.state === 'skipped'));

  const action = (s: ServiceStatus): { label: string; run: () => void } | null => {
    if (s.state === 'auto') return null;
    if (s.id === 'google' && s.state === 'attention')
      return {
        label: 'Potvrdit',
        run: () => {
          setBusyGoogle(true);
          void connectGoogle({ reconnect: true }).finally(() => setBusyGoogle(false));
        },
      };
    if (s.state === 'unavailable') return s.id === 'notifications' ? null : { label: 'Pro správce', run: () => document.getElementById('spravce')?.scrollIntoView({ behavior: 'smooth' }) };
    const step = WIZARD_STEP[s.id];
    if (!step) return null;
    if (s.id === 'google' && s.state === 'connected') return { label: 'Spravovat', run: () => document.getElementById('google')?.scrollIntoView({ behavior: 'smooth' }) };
    return { label: s.state === 'connected' ? 'Změnit' : 'Propojit', run: () => openSetup(step) };
  };

  return (
    <section className="space-y-4" aria-label="Přehled propojení">
      <div className="card flex flex-wrap items-center gap-4 rounded-[28px] p-5 sm:p-6">
        <ProgressRing done={done} total={total} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[30px] leading-none sm:text-[34px]">
            Tvoje <em className="text-moss">propojení</em>
          </h2>
          <p className="mt-1.5 text-[15px] text-muted">
            {done === total ? 'Všechno důležité je propojené.' : `Hotovo ${done} z ${total}.`}
            {attention > 0 && <strong className="text-amber-700 dark:text-amber-300"> {attention === 1 ? 'Jedna věc potřebuje' : `${attention} věci potřebují`} jedno kliknutí.</strong>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openSetup(firstTodo ? (WIZARD_STEP[firstTodo.id] ?? 'start') : 'start')}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-bold text-accent-fg shadow-[0_10px_24px_-12px_var(--accent)] hover:brightness-110"
        >
          <Sparkles className="size-4.5" aria-hidden /> {firstTodo ? 'Projít průvodce' : 'Spustit průvodce znovu'}
        </button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((s) => {
          const Icon = ICON[s.id];
          const act = action(s);
          const embed = s.id === 'music' ? spotifyEmbedUrl(music?.url) : null;
          return (
            <li key={s.id} className={cn('card flex flex-col rounded-[24px] p-4', s.state === 'attention' && 'ring-2 ring-amber-400/70')}>
              <div className="flex items-start gap-3">
                <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', s.state === 'auto' || s.state === 'connected' ? 'bg-accent-soft text-accent' : s.state === 'attention' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-surface-2 text-muted')}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-bold leading-tight">{s.title}</span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-muted">{s.detail}</span>
                </span>
                <StateDot state={s.state} />
              </div>
              {embed && (
                <iframe
                  title="Přehrávač Spotify"
                  src={embed}
                  className="mt-3 h-[80px] w-full rounded-[14px] border-0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                />
              )}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className={cn('text-[12.5px] font-bold', s.state === 'auto' || s.state === 'connected' ? 'text-accent' : s.state === 'attention' ? 'text-amber-700 dark:text-amber-300' : 'text-subtle')}>
                  {STATE_LABEL[s.state]}
                  {s.optional && s.state !== 'auto' && s.state !== 'connected' ? ' · nepovinné' : ''}
                </span>
                {act && (
                  <button
                    type="button"
                    onClick={act.run}
                    disabled={s.id === 'google' && busyGoogle}
                    className={cn(
                      'inline-flex h-9 items-center rounded-full px-4 text-[13.5px] font-bold transition',
                      s.state === 'attention' ? 'bg-amber-500 text-white hover:brightness-110' : s.state === 'connected' ? 'text-accent hover:bg-accent-soft' : 'bg-accent text-accent-fg hover:brightness-110',
                    )}
                  >
                    {act.label}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <PrivacyCard />
        <OwnerCard />
      </div>
    </section>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = total ? done / total : 0;
  return (
    <span className="relative grid size-16 shrink-0 place-items-center" aria-label={`Propojeno ${done} z ${total}`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      {done === total ? <Check className="size-6 text-accent" aria-hidden /> : <span className="font-display text-[20px] tabular">{done}/{total}</span>}
    </span>
  );
}

function PrivacyCard() {
  const clearAllData = useAppStore((s) => s.clearAllData);
  return (
    <div className="card rounded-[24px] p-5">
      <p className="flex items-center gap-2 text-[16px] font-bold">
        <ShieldCheck className="size-5 text-accent" aria-hidden /> Soukromí a bezpečnost
      </p>
      <ul className="mt-3 space-y-2 text-[14px] leading-snug text-muted">
        <li className="flex gap-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> Rozvrh, úkoly i klíče jsou uložené jen v tomhle prohlížeči. Žádný účet, žádná databáze s tvými daty.
        </li>
        <li className="flex gap-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> Pro cestu se posílá jen poloha startu a cíle (do plánovače PID) a pro počasí jen přibližná poloha.
        </li>
        <li className="flex gap-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> Google a Moodle vidí jen to, co jim povolíš. Odpojit je můžeš kdykoli jedním kliknutím.
        </li>
        <li className="flex gap-2">
          <Lock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> Kód aplikace je otevřený – kdokoli si může ověřit, co dělá.{' '}
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
function OwnerCard() {
  const server = useUiStore((s) => s.server);
  const [open, setOpen] = useState(false);
  const rows: { ok: boolean; title: string; why: string; vars: string[]; how: React.ReactNode }[] = [
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
          otevři svého klienta a zkopíruj Client ID a Client secret. V{' '}
          <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Audience
          </a>{' '}
          přepni aplikaci na <strong>In production</strong> (jinak Google přihlášení po 7 dnech zruší).
        </>
      ),
    },
    {
      ok: server.anthropic,
      title: 'Chytré čtení sylabů (AI)',
      why: 'Claude čte sylaby, stránky Moodlu i PDF harmonogramy přesněji než pravidla.',
      vars: ['ANTHROPIC_API_KEY'],
      how: (
        <>
          Klíč vytvoříš v{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
            Anthropic Console
          </a>
          .
        </>
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
        <KeyRound className="size-5 text-accent" aria-hidden />
        <span className="flex-1">
          <span className="block text-[16px] font-bold">Pro správce aplikace</span>
          <span className="block text-[13px] text-muted">{missing ? `${missing} ${missing === 1 ? 'věc' : 'věci'} na serveru ještě není nastavená` : 'Server je nastavený'}</span>
        </span>
        <ChevronDown className={cn('size-5 text-muted transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-[13.5px] text-muted">
            <strong className="text-fg">Stačí jednou a platí pro všechny uživatele</strong> – běžní uživatelé tuhle kartu nepotřebují. Jednou nastavíš ve Vercelu (projekt → <strong>Settings → Environment Variables</strong>), pak <strong>Redeploy</strong>. Klíče zůstávají na serveru, do prohlížeče ani do kódu se nedostanou.{' '}
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
