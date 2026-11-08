import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { appNow } from '../../store/clockStore';
import { motion } from 'motion/react';
import { BookOpen, CalendarDays, Clock, FastForward, ArrowRight, FlaskConical, House, Plus, RotateCcw, Timer, TramFront, type LucideIcon } from 'lucide-react';
import { AlertsButton } from '../notifications/AlertsCenter';
import { FocusChip } from '../focus/FocusCard';
import { ViewBoundary } from './ViewBoundary';
import { formatTime } from '../../lib/dates';
import { buildTaskRows, dueGroup } from '../../lib/taskList';
import { navigateTo, type View } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { useAccount } from '../../services/account';
import { useClockStore } from '../../store/clockStore';
import { activeSimulations, isOwnerEmail, useTestStore } from '../../store/testStore';
import { usePresentationStore } from '../../store/presentationStore';
import { useUiStore } from '../../store/uiStore';
import { Glyph } from '../ui/Glyph';
import { Menu } from '../ui/overlays';
import { cn } from '../ui/primitives';

const NAV: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'dnes', label: 'Dnes', icon: House },
  { view: 'plan', label: 'Plán', icon: CalendarDays },
  { view: 'doprava', label: 'Doprava', icon: TramFront },
  { view: 'predmety', label: 'Předměty', icon: BookOpen },
];

/** Stránky, které patří pod Nastavení (ozubené kolo je pak zvýrazněné). */
const SETTINGS_VIEWS: View[] = ['nastaveni', 'propojeni', 'ucet', 'vzhled', 'pruvodce', 'import'];

/** Počet úkolů a termínů po termínu a na dnešek (odznak v navigaci). */
function useUrgentCount(): number {
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const now = useNow(60_000);
  return useMemo(() => buildTaskRows(tasks, requirements, now).filter((r) => ['overdue', 'today'].includes(dueGroup(r, now))).length, [tasks, requirements, now]);
}

/**
 * Ručičky loga: při otevření se roztočí a zastaví na aktuálním čase, pak
 * jdou s časem (každou půlminutu). Bez `live` ukazují pevný čas loga.
 */
function useLiveHands(live: boolean): { hour: number; minute: number } | null {
  const [now, setNow] = useState(() => appNow());
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(appNow()), 30_000);
    let raf = 0;
    const t0 = performance.now() + 250;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (t: number) => {
      const x = Math.min(1, Math.max(0, (t - t0) / 1300));
      setK(ease(x));
      if (x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      clearInterval(t);
      cancelAnimationFrame(raf);
    };
  }, [live]);
  if (!live) return null;
  const minute = (now.getMinutes() + now.getSeconds() / 60) * 6 + 360;
  const hour = ((now.getHours() % 12) + now.getMinutes() / 60) * 30 + 360;
  return { hour: hour * k, minute: minute * k };
}

export function BrandMark({ className, live = false }: { className?: string; live?: boolean }) {
  // Unikátní id gradientu – logo je v DOM víckrát.
  const id = `stihnu-g-${useId().replace(/:/g, '')}`;
  const hands = useLiveHands(live);
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
      {hands ? (
        <>
          <line x1="32" y1="33" x2="32" y2="24.5" stroke="#f1ece0" strokeWidth="4.5" strokeLinecap="round" transform={`rotate(${hands.hour.toFixed(2)} 32 33)`} />
          <line x1="32" y1="33" x2="32" y2="20.5" stroke="#f1ece0" strokeWidth="3.4" strokeLinecap="round" transform={`rotate(${hands.minute.toFixed(2)} 32 33)`} />
          <circle cx="32" cy="33" r="2.4" fill="#f1ece0" />
        </>
      ) : (
        <path d="M32 24v9.5l6.5 4.5" fill="none" stroke="#f1ece0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      <path d="M44 12c-5 0-8 3-8 7 4 0 8-2.5 8-7z" fill="#a8c79f" />
    </svg>
  );
}

/** Výrazný pruh: ukázková data nejsou vaše. */
export function DemoRibbon() {
  const mode = useAppStore((s) => s.settings.mode);
  const openSetup = useUiStore((s) => s.openSetup);
  if (mode !== 'demo') return null;
  return (
    <div className="demo-ribbon relative z-40 border-b border-sand/50">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#7a5a2e] px-2.5 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#fbf3e3]">
          <FlaskConical className="size-3.5" aria-hidden /> Ukázka
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-[#5c4322] dark:text-[#f0dcb8]">Předměty, rozvrh i úkoly jsou vymyšlené – jen na vyzkoušení.</span>
        <DemoClockChip />
        <button
          type="button"
          onClick={() => openSetup('start')}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#2b5a40] px-3.5 text-[12.5px] font-bold text-white shadow-sm transition hover:brightness-110"
        >
          Nastavit svoje data <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
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
        { label: 'Posunout o 5 minut', hint: 'Sledujte, jak se mění stav spojů', icon: FastForward, onSelect: () => clock.shiftMinutes(5) },
        { label: 'Posunout o 15 minut', hint: 'Rychle k poslednímu spoji', icon: FastForward, onSelect: () => clock.shiftMinutes(15) },
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
          title="Simulovaný čas ukázky"
        >
          <Timer className="size-3.5" aria-hidden />
          {simulated ? `${formatTime(now)}:${String(now.getSeconds()).padStart(2, '0')}` : 'reálný čas'}
        </button>
      )}
    />
  );
}

/** Režim prezentace: popisky jsou vymyšlené – ať to presenter ví a umí ho jedním klepnutím vypnout. */
function PresentationRibbon() {
  const masked = usePresentationStore((p) => p.masked);
  if (!masked) return null;
  return (
    <div className="border-b border-line bg-fg text-canvas">
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-1.5 text-[12.5px] sm:px-6 lg:px-8">
        <span className="min-w-0 flex-1 truncate font-semibold">Režim prezentace – popisky jsou vymyšlené, co přidáte na ukázku, po vypnutí zmizí</span>
        <button type="button" onClick={() => usePresentationStore.getState().setMasked(false)} className="shrink-0 rounded-full bg-canvas/15 px-3 py-0.5 font-bold hover:bg-canvas/25">
          Vypnout
        </button>
      </div>
    </div>
  );
}

/** Výrazný štítek, když správce něco simuluje (čas, polohu, chůzi, počasí). */
function TestBadge() {
  const email = useAccount((s) => s.user?.email);
  const gps = useTestStore((s) => s.gps);
  const walkSim = useTestStore((s) => s.walkSim);
  const weather = useTestStore((s) => s.weather);
  const clock = useTestStore((s) => s.clock);
  const simulated = useClockStore((s) => s.simulated);
  const demo = useAppStore((s) => s.settings.mode === 'demo');
  if (!isOwnerEmail(email)) return null;
  const sims = activeSimulations({ gps, walkSim, weather, clock: clock && simulated && !demo ? clock : null });
  if (sims.length === 0) return null;
  return (
    <a href="#/nastaveni/test" className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-amber-500/15 px-3 text-[12px] font-bold text-amber-800 ring-1 ring-inset ring-amber-500/35 dark:text-amber-300" title={`Testovací režim: ${sims.join(', ')}`}>
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span className="sm:hidden">Test</span>
      <span className="hidden max-w-40 truncate sm:inline">Test · {sims.join(', ')}</span>
    </a>
  );
}

/** Nastavení: všechno kromě hlavních sekcí (propojení, účet, vzhled, průvodce…). */
function SettingsButton({ active }: { active: boolean }) {
  return (
    <a
      href="#/nastaveni"
      data-tour="settings"
      aria-current={active ? 'page' : undefined}
      className={cn('inline-flex size-9 items-center justify-center rounded-full transition-colors', active ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
      aria-label="Nastavení"
      title="Nastavení"
    >
      <Glyph name="gear" size={20} strokeWidth={1.8} />
    </a>
  );
}

export function AppShell({ view, children, fullBleed = false }: { view: View; children: ReactNode; fullBleed?: boolean }) {
  const openEditor = useUiStore((s) => s.openEditor);
  const demo = useAppStore((s) => s.settings.mode === 'demo');
  const urgent = useUrgentCount();

  return (
    <div className={fullBleed ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-dvh'}>
      {/* Horní lišta */}
      <header className={cn('glass-strong z-30 shrink-0 border-b border-line pt-[env(safe-area-inset-top)]', fullBleed ? 'relative' : 'sticky top-0')}>
        <DemoRibbon />
        <PresentationRibbon />
        <div className={cn('mx-auto flex h-14 items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8', !fullBleed && 'max-w-[1320px]')}>
          <a href="#/dnes" className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="size-8 lg:size-9" live />
            <span className="font-display wordmark text-[24px] leading-none tracking-tight lg:text-[26px]">
              Stihnu<em className="text-moss">to</em>
            </span>
          </a>
          <nav className="mx-auto hidden items-center gap-1 rounded-full bg-surface-2/70 p-1 ring-1 ring-inset ring-line lg:flex" aria-label="Hlavní navigace" data-tour="nav">
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
                  {item.view === 'plan' && urgent > 0 && <span className={cn('relative grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-black tabular', active ? 'bg-accent-fg text-accent' : 'bg-clay text-white')} aria-label={`${urgent} na dnešek nebo po termínu`}>{urgent}</span>}
                </a>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5 lg:ml-0">
            <TestBadge />
            <FocusChip />
            <button
              type="button"
              onClick={() => openEditor({ type: 'quick' })}
              data-tour="add"
              className="hidden h-9 items-center gap-1.5 rounded-full bg-accent pl-3 pr-4 text-[13px] font-bold text-accent-fg shadow-[0_8px_20px_-10px_var(--accent)] transition hover:brightness-110 lg:inline-flex"
            >
              <Plus className="size-4" aria-hidden /> Přidat
            </button>
            <AlertsButton />
            <SettingsButton active={SETTINGS_VIEWS.includes(view)} />
          </div>
        </div>
      </header>

      <main className={cn(fullBleed ? 'relative min-h-0 w-full flex-1' : 'mx-auto w-full max-w-[1320px] px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-4 sm:px-6 lg:px-8 lg:pb-14 lg:pt-6')}>
        <ViewBoundary key={view}>{children}</ViewBoundary>
      </main>

      {/* Spodní navigace (mobil): čtyři sekce a uprostřed Přidat – nic neplave nad obsahem */}
      <nav className="glass-strong fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 items-center rounded-full border border-line px-1 py-1 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)] lg:hidden" aria-label="Hlavní navigace" data-tour="nav-mobile">
        {NAV.slice(0, 2).map((item) => (
          <BottomItem key={item.view} item={item} active={view === item.view} badge={item.view === 'plan' ? urgent : 0} />
        ))}
        <button
          type="button"
          onClick={() => openEditor({ type: 'quick' })}
          data-tour="add"
          className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_10px_22px_-10px_var(--accent)] transition active:scale-95"
          aria-label="Přidat úkol, událost nebo termín"
        >
          <Plus className="size-6" aria-hidden />
        </button>
        {NAV.slice(2, 4).map((item) => (
          <BottomItem key={item.view} item={item} active={view === item.view} />
        ))}
      </nav>
      {demo && <div className="demo-frame" aria-hidden />}
    </div>
  );
}

function BottomItem({ item, active, badge = 0 }: { item: (typeof NAV)[number]; active: boolean; badge?: number }) {
  return (
    <button type="button" onClick={() => navigateTo(item.view)} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10.5px] font-bold transition-colors', active ? 'text-accent' : 'text-muted')}>
      {active && <motion.span layoutId="bottom-active" className="absolute inset-0 rounded-full bg-accent-soft" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      <span className="relative">
        <item.icon className="size-5" aria-hidden />
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[9.5px] font-black text-white tabular ring-2 ring-[var(--surface)]" aria-label={`${badge} na dnešek nebo po termínu`}>
            {badge}
          </span>
        )}
      </span>
      <span className="relative">{item.label}</span>
    </button>
  );
}
