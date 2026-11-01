import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CalendarRange, Clock, FastForward, FlaskConical, LayoutDashboard, Library, Monitor, Moon, Plug, RotateCcw, Settings, Sun, Timer, Zap } from 'lucide-react';
import type { ThemePref } from '../../types';
import { formatTime } from '../../lib/dates';
import { navigateTo, type View } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { useClockStore } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Menu } from '../ui/overlays';
import { Button, cn, IconButton } from '../ui/primitives';

const NAV: { view: View; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dnes', label: 'Dnes & doprava', short: 'Dnes', icon: LayoutDashboard },
  { view: 'predmety', label: 'Předměty & materiály', short: 'Předměty', icon: Library },
  { view: 'harmonogram', label: 'Harmonogram & kalendář', short: 'Kalendář', icon: CalendarRange },
  { view: 'integrace', label: 'Integrace & nastavení', short: 'Nastavení', icon: Settings },
];

export function BrandMark({ className }: { className?: string }) {
  // Unikátní id gradientu – logo je v DOM dvakrát (boční panel i mobilní lišta).
  const gradientId = `stihnu-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gradientId})`} />
      <circle cx="32" cy="32" r="17" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="5" />
      <path d="M32 15a17 17 0 0 1 16.2 11.8" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 22v10l7 5" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeToggle() {
  const theme = useAppStore((s) => s.settings.theme);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const next: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Světlý motiv' : theme === 'dark' ? 'Tmavý motiv' : 'Motiv podle systému';
  return <IconButton icon={Icon} label={`${label} (přepnout)`} onClick={() => updateSettings({ theme: next[theme] })} />;
}

function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const mode = useAppStore((s) => s.settings.mode);
  const setMode = useAppStore((s) => s.setMode);
  const toggle = () => {
    const nextMode = mode === 'demo' ? 'live' : 'demo';
    setMode(nextMode);
    toast.info(nextMode === 'demo' ? 'Sandbox: simulovaná data PID, Moodle i čas.' : 'Live režim: skutečný čas, GPS a API (Golemio, Moodle, iCal).');
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset transition-colors',
        compact ? 'h-7 px-2.5 text-[11.5px]' : 'h-8 px-3 text-xs',
        mode === 'demo' ? 'bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300' : 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
      )}
      title="Přepnout Demo / Live"
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
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 font-mono text-[11.5px] font-medium text-muted ring-1 ring-inset ring-line transition-colors hover:text-fg"
          title="Simulovaný čas sandboxu"
        >
          <Timer className="size-3.5" aria-hidden />
          {simulated ? formatTime(now) + ':' + String(now.getSeconds()).padStart(2, '0') : 'reálný čas'}
        </button>
      )}
    />
  );
}

export function AppShell({ view, children }: { view: View; children: ReactNode }) {
  const openConnect = useUiStore((s) => s.openConnect);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Boční panel (desktop) */}
      <aside className="glass-strong fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line px-4 py-5 lg:flex">
        <a href="#/dnes" className="flex items-center gap-2.5 px-2">
          <BrandMark className="size-9" />
          <span>
            <span className="block text-[17px] font-semibold tracking-tight">Stihnu</span>
            <span className="block text-[11px] text-muted">studium · MHD · deadliny</span>
          </span>
        </a>
        <nav className="mt-7 space-y-1" aria-label="Hlavní navigace">
          {NAV.map((item) => {
            const active = item.view === view;
            return (
              <a
                key={item.view}
                href={`#/${item.view}`}
                aria-current={active ? 'page' : undefined}
                className={cn('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors', active ? 'text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
              >
                {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-surface shadow-sm ring-1 ring-line" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <item.icon className="relative size-[18px]" aria-hidden />
                <span className="relative">{item.label}</span>
              </a>
            );
          })}
        </nav>
        <Button variant="primary" icon={Plug} className="mt-6" onClick={() => openConnect('moodle')}>
          Propojit studium
        </Button>
        <div className="mt-auto space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ModeSwitch />
            <DemoClockChip />
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-surface-2/70 px-3 py-2 ring-1 ring-line">
            <span className="text-xs text-muted">Motiv</span>
            <ThemeToggle />
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-subtle">Data zůstávají v tomto zařízení. Doprava: PID Golemio.</p>
        </div>
      </aside>

      {/* Horní lišta (mobil/tablet) */}
      <header className="glass-strong sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] lg:hidden">
        <a href="#/dnes" className="flex items-center gap-2">
          <BrandMark className="size-8" />
          <span className="text-[16px] font-semibold tracking-tight">Stihnu</span>
        </a>
        <div className="flex items-center gap-1.5">
          <DemoClockChip />
          <ModeSwitch compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>

      {/* Spodní navigace (mobil) */}
      <nav className="glass-strong fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Hlavní navigace">
        {NAV.slice(0, 2).map((item) => (
          <BottomItem key={item.view} item={item} active={item.view === view} />
        ))}
        <button type="button" onClick={() => openConnect('moodle')} className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium text-accent">
          <span className="grid size-9 place-items-center rounded-2xl bg-accent text-accent-fg shadow-md">
            <Plug className="size-[18px]" aria-hidden />
          </span>
          Propojit
        </button>
        {NAV.slice(2).map((item) => (
          <BottomItem key={item.view} item={item} active={item.view === view} />
        ))}
      </nav>
    </div>
  );
}

function BottomItem({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  return (
    <button type="button" onClick={() => navigateTo(item.view)} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors', active ? 'text-accent' : 'text-muted')}>
      {active && <motion.span layoutId="bottom-active" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
      <item.icon className="size-5" aria-hidden />
      {item.short}
    </button>
  );
}
