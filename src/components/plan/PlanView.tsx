/**
 * Plán – úkoly, kalendář a harmonogram na jednom místě.
 * Seznam (co mě čeká), Úkoly, Týden, Měsíc a Rok (harmonogram fakulty).
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Hourglass, List, ListTodo, Plus, ScrollText, Sun } from 'lucide-react';
import { addDays, formatDayMonth, formatMonthYear, isSameDay, startOfDay } from '../../lib/dates';
import { navigateTo } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { subjectMap } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';
import { Menu } from '../ui/overlays';
import { cn, SerifTitle } from '../ui/primitives';
import { TasksView } from '../tasks/TasksView';
import { AgendaPanel } from './AgendaPanel';
import { MonthGrid } from './MonthGrid';
import { WeekGrid } from './WeekGrid';
import { YearView } from './YearView';

export type PlanTab = 'prehled' | 'ukoly' | 'tyden' | 'mesic' | 'rok';

const TABS: { id: PlanTab; label: string; icon: typeof List }[] = [
  { id: 'prehled', label: 'Přehled', icon: Sun },
  { id: 'ukoly', label: 'Úkoly', icon: ListTodo },
  { id: 'tyden', label: 'Týden', icon: CalendarDays },
  { id: 'mesic', label: 'Měsíc', icon: CalendarRange },
  { id: 'rok', label: 'Rok', icon: ScrollText },
];

function weekLabel(monday: Date, now: Date): string {
  const sunday = addDays(monday, 6);
  const thisMonday = startOfDay(addDays(now, -((now.getDay() + 6) % 7)));
  if (isSameDay(monday, thisMonday)) return 'Tento týden';
  if (isSameDay(monday, addDays(thisMonday, 7))) return 'Příští týden';
  if (isSameDay(monday, addDays(thisMonday, -7))) return 'Minulý týden';
  return `${formatDayMonth(monday)} – ${formatDayMonth(sunday)}`;
}

export function PlanView({ tab: tabParam }: { tab?: string }) {
  const now = useNow(60_000);
  const subjects = useAppStore((s) => s.subjects);
  const byId = useMemo(() => subjectMap(subjects), [subjects]);
  const openEditor = useUiStore((s) => s.openEditor);
  const openConnect = useUiStore((s) => s.openConnect);
  const tab: PlanTab = (TABS.some((t) => t.id === tabParam) ? tabParam : 'prehled') as PlanTab;
  const [anchor, setAnchor] = useState(() => startOfDay(now));
  const setTab = (t: PlanTab) => navigateTo('plan', t);

  const monday = addDays(anchor, -((anchor.getDay() + 6) % 7));
  const step = (dir: number) => {
    if (tab === 'tyden') setAnchor((a) => addDays(a, dir * 7));
    if (tab === 'mesic') setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + dir, 1));
  };
  const navLabel = tab === 'tyden' ? weekLabel(monday, now) : tab === 'mesic' ? formatMonthYear(anchor) : null;
  const atToday = tab === 'tyden' ? isSameDay(monday, startOfDay(addDays(now, -((now.getDay() + 6) % 7)))) : tab === 'mesic' ? anchor.getMonth() === now.getMonth() && anchor.getFullYear() === now.getFullYear() : true;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="eyebrow text-subtle">Úkoly · kalendář · harmonogram</p>
          <SerifTitle as="h1" className="mt-1 text-[40px] sm:text-[56px]">
            Plán
          </SerifTitle>
        </div>
        <Menu
          label="Přidat do plánu"
          items={[
            { label: 'Úkol', hint: 'S termínem i bez', icon: ListTodo, onSelect: () => openEditor({ type: 'task' }) },
            { label: 'Událost', hint: 'Schůzka, trénink, konzultace…', icon: CalendarDays, onSelect: () => openEditor({ type: 'event' }) },
            { label: 'Odpočet', hint: 'Zobrazí se na hlavní stránce', icon: Hourglass, onSelect: () => useUiStore.setState({ countdownEditor: true }) },
            { label: 'Harmonogram fakulty', hint: 'PDF nebo vložený text', icon: ScrollText, onSelect: () => openConnect('parser') },
          ]}
          trigger={(props) => (
            <button type="button" {...props} className="hidden h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-bold text-accent-fg shadow-[0_10px_24px_-14px_var(--accent)] hover:brightness-110 lg:inline-flex">
              <Plus className="size-4" aria-hidden /> Přidat
            </button>
          )}
        />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Pohled plánu">
          <div className="flex shrink-0 gap-1 rounded-full bg-surface-2/80 p-1 ring-1 ring-inset ring-line">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined} className={cn('relative flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold transition-colors sm:px-3.5 sm:text-[13.5px]', active ? 'text-accent-fg' : 'text-muted hover:text-fg')}>
                  {active && <motion.span layoutId="plan-tab" className="absolute inset-0 rounded-full bg-accent shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <t.icon className="relative hidden size-4 sm:block" aria-hidden />
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        {navLabel && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Předchozí">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <span className="min-w-[9.5rem] text-center text-[14.5px] font-bold">{navLabel}</span>
            <button type="button" onClick={() => step(1)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Další">
              <ChevronRight className="size-5" aria-hidden />
            </button>
            {!atToday && (
              <button type="button" onClick={() => setAnchor(startOfDay(now))} className="ml-1 h-9 rounded-full bg-surface-2 px-3.5 text-[13px] font-bold ring-1 ring-inset ring-line hover:bg-surface">
                Dnes
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {tab === 'prehled' && (
            <div className="card rounded-[26px] p-3 sm:p-4">
              <AgendaPanel byId={byId} />
            </div>
          )}
          {tab === 'ukoly' && <TasksView embedded />}
          {tab === 'tyden' && (
            <div className="card rounded-[26px] p-2 sm:p-3">
              <WeekGrid anchor={anchor} byId={byId} />
            </div>
          )}
          {tab === 'mesic' && <MonthGrid anchor={anchor} byId={byId} />}
          {tab === 'rok' && (
            <YearView
              byId={byId}
              onOpenMonth={(m) => {
                setAnchor(m);
                setTab('mesic');
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
