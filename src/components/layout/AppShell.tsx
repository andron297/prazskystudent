import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  CalendarDays,
  CloudAlert,
  Clock,
  FastForward,
  FlaskConical,
  House,
  LoaderCircle,
  Monitor,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sun,
  Timer,
  TramFront,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ThemePref } from '../../types';
import { formatRelative, formatTime } from '../../lib/dates';
import { navigateTo, type View } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { runGoogleSync, useSyncStore } from '../../services/syncCenter';
import { useAppStore } from '../../store/appStore';
import { useClockStore } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Menu } from '../ui/overlays';
import { cn, IconButton } from '../ui/primitives';

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'dnes', label: 'Dnes', icon: House },
  { view: 'doprava', label: 'Doprava', icon: TramFront },
  { view: 'predmety', label: 'Předměty', icon: BookOpen },
  { view: 'kalendar', label: 'Kalendář', icon: CalendarDays },
  { view: 'propojeni', label: 'Propojení', icon: Settings2 },
];

export function BrandMark({ className }: { className?: string }) {
  // Unikátní id gradientu – logo je v DOM víckrát.
  const id = `stihnu-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f7a55" />
          <stop offset="1" stopColor="#1b3626" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="20" fill={`url(#${id})`} />
      <circle cx="32" cy="33" r="16" fill="none" stroke="#f1ece0" strokeOpacity="0.28" strokeWidth="4.5" />
      <path d="M32 17a16 16 0 0 1 15.2 11" fill="none" stroke="#d4b98e" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 24v9.5l6.5 4.5" fill="none" stroke="#f1ece0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 12c-5 0-8 3-8 7 4 0 8-2.5 8-7z" fill="#a8c79f" />
    </svg>
  );
}

function ThemeToggle() {
  const theme = useAppStore((s) => s.settings.theme);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const next: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Světlý motiv' : theme === 'dark' ? 'Tmavý motiv' : 'Motiv podle systému';
  return <IconButton icon={Icon} label={`${label} (přepnout)`} size="sm" onClick={() => updateSettings({ theme: next[theme] })} className="rounded-full" />;
}

function ModeSwitch() {
  const mode = useAppStore((s) => s.settings.mode);
  const setMode = useAppStore((s) => s.setMode);
  const toggle = () => {
    const nextMode = mode === 'demo' ? 'live' : 'demo';
    setMode(nextMode);
    toast.info(nextMode === 'demo' ? 'Sandbox: simulovaná doprava, Moodle i Google.' : 'Live: skutečný čas, GPS, Golemio, Moodle a Google.');
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold ring-1 ring-inset transition-colors',
        mode === 'demo' ? 'bg-sand/20 text-clay ring-sand/40' : 'bg-accent-soft text-accent ring-accent/25',
      )}
      title="Přepnout Sandbox / Live"
    >
      {mode === 'demo' ? <FlaskConical className="size-3.5" aria-hidden /> : <Zap className="size-3.5" aria-hidden />}
      {mode === 'demo' ? 'Sandbox' : 'Live'}
    </button>
  );
}

function DemoClockChip() {
  const mode = useAppStore((s) => s.settings.mode);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const simulated = useClockStore((s) => s.simulated);
  const now = useNow(1000);
  if (mode !== 'demo') return null;
  const clock = useClockStore.getState();
  return (
    <Menu
      label="Simulovaný čas"
      items={[
        { label: 'Posunout o 5 minut', hint: 'Sleduj, jak se mění stav spojů', icon: FastForward, onSelect: () => clock.shiftMinutes(5) },
        { label: 'Posunout o 15 minut', hint: 'Rychle do „Last call“', icon: FastForward, onSelect: () => clock.shiftMinutes(15) },
        {
          label: 'Restart na 13:05',
          hint: 'Seminář na Hollaru za 55 minut',
          icon: RotateCcw,
          onSelect: () => {
            clock.startSimulation();
            updateSettings({ demoClock: true });
          },
        },
        {
          label: simulated ? 'Přepnout na reálný čas' : 'Zapnout simulovaný čas',
          icon: Clock,
          onSelect: () => {
            if (simulated) {
              clock.switchToRealTime();
              updateSettings({ demoClock: false });
            } else {
              clock.startSimulation();
              updateSettings({ demoClock: true });
            }
          },
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12px] font-semibold text-muted ring-1 ring-inset ring-line transition-colors hover:text-fg tabular"
          title="Simulovaný čas Sandboxu"
        >
          <Timer className="size-3.5" aria-hidden />
          {simulated ? `${formatTime(now)}:${String(now.getSeconds()).padStart(2, '0')}` : 'reálný čas'}
        </button>
      )}
    />
  );
}

/** Stav synchronizace s Googlem – jedno kliknutí = synchronizovat teď. */
export function SyncChip({ compact = false }: { compact?: boolean }) {
  const mode = useAppStore((s) => s.settings.mode);
  const enabled = useAppStore((s) => s.settings.google.enabled);
  const gs = useAppStore((s) => s.googleSync[s.settings.mode]);
  const { running, needsAuth, lastError } = useSyncStore();
  const now = useNow(30_000);
  if (!enabled || !gs.connectedAt) return null;
  const label = running ? 'Synchronizuji' : needsAuth ? 'Přihlásit' : lastError ? 'Chyba' : gs.lastSync ? formatRelative(new Date(gs.lastSync), mode === 'demo' ? new Date() : now).replace('před ', '') : 'Google';
  const Icon = running ? LoaderCircle : needsAuth || lastError ? CloudAlert : RefreshCw;
  return (
    <button
      type="button"
      onClick={() => (needsAuth ? navigateTo('propojeni', 'google') : void runGoogleSync({ manual: true }))}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ring-1 ring-inset transition-colors',
        needsAuth || lastError ? 'bg-amber-500/12 text-amber-800 ring-amber-500/30 dark:text-amber-300' : 'bg-surface-2 text-muted ring-line hover:text-fg',
      )}
      title={needsAuth ? 'Přihlášení ke Googlu vypršelo' : lastError ?? 'Synchronizovat s Googlem teď'}
    >
      <Icon className={cn('size-3.5', running && 'animate-spin')} aria-hidden />
      {!compact && <span className="max-w-28 truncate">{label}</span>}
    </button>
  );
}

export function AppShell({ view, children, fullBleed = false }: { view: View; children: ReactNode; fullBleed?: boolean }) {
  const openEditor = useUiStore((s) => s.openEditor);

  return (
    <div className={fullBleed ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-dvh'}>
      {/* Horní lišta */}
      <header className={cn('glass-strong z-30 shrink-0 border-b border-line pt-[env(safe-area-inset-top)]', fullBleed ? 'relative' : 'sticky top-0')}>
        <div className={cn('mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8', !fullBleed && 'max-w-[1320px]')}>
          <a href="#/dnes" className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="size-8 lg:size-9" />
            <span className="font-display text-[24px] leading-none tracking-tight lg:text-[26px]">
              Stih<em className="text-moss">nu</em>
            </span>
          </a>
          <nav className="mx-auto hidden items-center gap-1 rounded-full bg-surface-2/70 p-1 ring-1 ring-inset ring-line lg:flex" aria-label="Hlavní navigace">
            {NAV.map((item) => {
              const active = item.view === view;
              return (
                <a
                  key={item.view}
                  href={`#/${item.view}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn('relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors', active ? 'text-accent-fg' : 'text-muted hover:text-fg')}
                >
                  {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-full bg-accent shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <item.icon className="relative size-4" aria-hidden />
                  <span className="relative">{item.label}</span>
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
            <SyncChip />
            <div className="hidden items-center gap-1.5 sm:flex">
              <DemoClockChip />
              <ModeSwitch />
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => openEditor({ type: 'quick' })}
              className="hidden h-9 items-center gap-1.5 rounded-full bg-accent pl-3 pr-4 text-[13px] font-bold text-accent-fg shadow-[0_8px_20px_-10px_var(--accent)] transition hover:brightness-110 lg:inline-flex"
            >
              <Plus className="size-4" aria-hidden /> Přidat
            </button>
            <a href="#/propojeni" className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg lg:hidden" aria-label="Propojení a nastavení">
              <Settings2 className="size-[18px]" aria-hidden />
            </a>
          </div>
        </div>
        {/* Mobil: režim a simulovaný čas pod lištou */}
        <div className="flex items-center justify-end gap-1.5 px-4 pb-2 sm:hidden">
          <DemoClockChip />
          <ModeSwitch />
        </div>
      </header>

      <main className={cn(fullBleed ? 'relative min-h-0 w-full flex-1' : 'mx-auto w-full max-w-[1320px] px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-14 lg:pt-6')}>{children}</main>

      {/* Spodní navigace (mobil) */}
      <nav className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 items-center rounded-full border border-line px-1 py-1 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)] lg:hidden" aria-label="Hlavní navigace">
        <BottomItem item={NAV[0]} active={view === 'dnes'} />
        <BottomItem item={NAV[1]} active={view === 'doprava'} />
        <button type="button" onClick={() => openEditor({ type: 'quick' })} className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_10px_24px_-10px_var(--accent)] active:scale-95" aria-label="Přidat úkol nebo událost">
          <Plus className="size-6" aria-hidden />
        </button>
        <BottomItem item={NAV[2]} active={view === 'predmety'} />
        <BottomItem item={NAV[3]} active={view === 'kalendar'} />
      </nav>
    </div>
  );
}

function BottomItem({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  return (
    <button type="button" onClick={() => navigateTo(item.view)} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10.5px] font-bold transition-colors', active ? 'text-accent' : 'text-muted')}>
      {active && <motion.span layoutId="bottom-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <item.icon className="relative size-5" aria-hidden />
      <span className="relative">{item.label}</span>
    </button>
  );
}
