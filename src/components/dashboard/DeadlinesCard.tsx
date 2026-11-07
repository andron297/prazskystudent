/**
 * Termíny dnes a zítra – výrazně, hned pod úvodní fotkou, ale věcně: nadpis
 * „Termíny“ a u každého jen kdy („Dnes 23:59“, „Zítra 14:00“, „Po termínu
 * · 2 dny“). Po termínu červeně, dnes v barvě hlíny, zítra jantarově.
 */
import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { formatTime, plural } from '../../lib/dates';
import { buildTaskRows, dueGroup, type TaskRow } from '../../lib/taskList';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { cn } from '../ui/primitives';

const ORDER = { overdue: 0, today: 1, tomorrow: 2 } as const;
type Urgent = keyof typeof ORDER;

function whenText(r: TaskRow, group: Urgent, now: Date): string {
  if (!r.due) return '';
  if (group === 'overdue') {
    const days = Math.floor((now.getTime() - r.due.getTime()) / 86_400_000);
    return days >= 1 ? `Po termínu · ${days} ${plural(days, ['den', 'dny', 'dní'])}` : 'Po termínu';
  }
  const day = group === 'today' ? 'Dnes' : 'Zítra';
  return r.dueAllDay ? day : `${day} ${formatTime(r.due)}`;
}

export function DeadlinesCard({ now }: { now: Date }) {
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const subjects = useAppStore((s) => s.subjects);
  const minute = Math.floor(now.getTime() / 60_000);
  const rows = useMemo(() => {
    const t = new Date(minute * 60_000);
    return buildTaskRows(tasks, requirements, t)
      .map((r) => ({ r, g: dueGroup(r, t) }))
      .filter((x): x is { r: TaskRow; g: Urgent } => x.g === 'overdue' || x.g === 'today' || x.g === 'tomorrow')
      .filter((x) => x.g !== 'overdue' || (x.r.due && t.getTime() - x.r.due.getTime() < 14 * 86_400_000))
      .sort((a, b) => ORDER[a.g] - ORDER[b.g] || (a.r.due?.getTime() ?? 0) - (b.r.due?.getTime() ?? 0));
  }, [tasks, requirements, minute]);
  if (rows.length === 0) return null;

  const count = (g: Urgent) => rows.filter((x) => x.g === g).length;
  const today = count('today');
  const tomorrow = count('tomorrow');
  const overdue = count('overdue');
  const complete = (r: TaskRow) => {
    const store = useAppStore.getState();
    if (r.task && !r.task.done) store.toggleTask(r.task.id);
    if (r.requirement && !r.requirement.done) store.toggleRequirementDone(r.requirement.id);
    toast.success(`Hotovo: ${r.title}`);
  };
  const headline = 'Termíny';

  return (
    <section
      className={cn('relative overflow-hidden rounded-[26px] p-4 ring-2 sm:p-5', overdue > 0 ? 'bg-red-50 ring-red-500/45 dark:bg-red-950/40' : today > 0 ? 'bg-[#f6e9df] ring-[#a36f45]/55 dark:bg-[#3a2a1f]' : 'bg-amber-50 ring-amber-500/40 dark:bg-amber-950/30')}
      aria-label="Termíny dnes a zítra"
      role="region"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-[26px] leading-none text-fg">{headline}</h2>
        <p className="text-[12.5px] font-bold text-muted">
          {[overdue && `${overdue} po termínu`, today && `${today} dnes`, tomorrow && `${tomorrow} zítra`].filter(Boolean).join(' · ')}
        </p>
      </header>
      <ul className="mt-3 space-y-2">
        <AnimatePresence initial={false}>
          {rows.slice(0, 6).map(({ r, g }) => {
            const subject = r.subjectId ? subjects.find((s) => s.id === r.subjectId) : undefined;
            return (
              <motion.li key={r.key} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 rounded-[18px] bg-surface/90 px-3.5 py-2.5 shadow-sm ring-1 ring-inset ring-black/5 dark:bg-surface/70">
                <span className={cn('w-1.5 self-stretch rounded-full', g === 'overdue' ? 'bg-red-600' : g === 'today' ? 'bg-[#a36f45]' : 'bg-amber-500')} aria-hidden />
                <button type="button" onClick={() => navigateTo('plan', 'ukoly')} className="min-w-0 flex-1 text-left">
                  <span className={cn('block text-[12.5px] font-bold tabular', g === 'overdue' ? 'text-red-700 dark:text-red-300' : g === 'today' ? 'text-[#8a5a35] dark:text-[#e8b98f]' : 'text-amber-700 dark:text-amber-300')}>{whenText(r, g, now)}</span>
                  <span className="block text-[15px] font-bold leading-snug text-fg">{r.title}</span>
                  {subject && <span className="block truncate text-[12.5px] text-muted">{subject.name}</span>}
                </button>
                <button type="button" onClick={() => complete(r)} className="shrink-0 rounded-full bg-fg px-3.5 py-2 text-[12.5px] font-bold text-canvas hover:opacity-90">
                  Hotovo
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {rows.length > 6 && (
        <button type="button" onClick={() => navigateTo('plan', 'ukoly')} className="mt-2 text-[13px] font-bold text-accent hover:underline">
          Všechny termíny ({rows.length})
        </button>
      )}
    </section>
  );
}
