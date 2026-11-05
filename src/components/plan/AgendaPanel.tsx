/**
 * Seznam nejbližších dní: výuka, události, úkoly, termíny a období
 * harmonogramu den po dni. Prázdné dny se přeskakují, dnešek je vždy vidět.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarCheck2, ChevronDown } from 'lucide-react';
import type { Subject } from '../../types';
import { addDays, capitalize, formatDayMonth, formatWeekdayLong, isSameDay, startOfDay } from '../../lib/dates';
import { isSpan, itemsOnDay, planItems, type PlanItem } from '../../lib/plan';
import { useNow } from '../../hooks/useNow';
import { usePlanData } from '../../hooks/usePlanData';
import { useAppStore } from '../../store/appStore';
import { cn } from '../ui/primitives';
import { PHASE_DOT, PlanRow } from './PlanBits';

export function dayHeading(day: Date, now: Date): string {
  if (isSameDay(day, now)) return 'Dnes';
  if (isSameDay(day, addDays(now, 1))) return 'Zítra';
  if (isSameDay(day, addDays(now, -1))) return 'Včera';
  return capitalize(formatWeekdayLong(day));
}

/** Položky jednoho dne (použité i v detailu dne v měsíci). */
export function DayList({ items, day, byId, emptyText = 'Nic naplánováno.' }: { items: PlanItem[]; day: Date; byId: Map<string, Subject>; emptyText?: string }) {
  const now = useNow(60_000);
  const settings = useAppStore((s) => s.settings);
  const dayItems = itemsOnDay(items, day);
  const spans = dayItems.filter(isSpan);
  const rest = dayItems.filter((i) => !isSpan(i));
  return (
    <div>
      {spans.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1.5 px-2.5">
          {spans.map((s) =>
            s.kind === 'milestone' ? (
              <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-semibold text-muted">
                <span className={cn('size-1.5 rounded-full', PHASE_DOT[s.milestone.category])} />
                {s.milestone.title}
              </span>
            ) : null,
          )}
        </div>
      )}
      {rest.length === 0 ? (
        <p className="px-2.5 py-1.5 text-[13px] text-subtle">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5">
          {rest.map((i) => (
            <li key={i.key}>
              <PlanRow item={i} byId={byId} settings={settings} now={now} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgendaPanel({ byId }: { byId: Map<string, Subject> }) {
  const now = useNow(60_000);
  const data = usePlanData();
  const [weeks, setWeeks] = useState(3);
  const today = startOfDay(now);
  const until = addDays(today, weeks * 7);
  const items = useMemo(() => planItems(data, today, until), [data, today.getTime(), until.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Po termínu (nesplněné úkoly a termíny z minulosti)
  const overdue = useMemo(() => planItems(data, addDays(today, -60), today).filter((i) => i.kind === 'task' || i.kind === 'deadline'), [data, today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(today, i)).filter((d, i) => i === 0 || itemsOnDay(items, d).some((x) => !isSpan(x)));

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <section className="rounded-[22px] bg-red-500/[0.06] p-2 ring-1 ring-inset ring-red-500/20">
          <h3 className="px-2.5 pb-1 pt-1.5 text-[12px] font-black uppercase tracking-[0.12em] text-red-700 dark:text-red-300">Po termínu ({overdue.length})</h3>
          <ul className="space-y-0.5">
            {overdue.map((i) => (
              <li key={i.key}>
                <OverdueRow item={i} byId={byId} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {days.map((day, idx) => (
        <motion.section key={day.toISOString()} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 8) * 0.03 }}>
          <h3 className={cn('flex items-baseline gap-2 px-2.5 pb-1', isSameDay(day, now) && 'text-accent')}>
            <span className="font-display text-[22px] leading-none">{dayHeading(day, now)}</span>
            <span className="text-[12.5px] font-semibold text-subtle">{formatDayMonth(day)}</span>
          </h3>
          <DayList items={items} day={day} byId={byId} emptyText="Dnes už nic naplánováno. Užijte si volno." />
        </motion.section>
      ))}
      {days.length <= 1 && (
        <p className="flex items-center gap-2 px-2.5 text-[13.5px] text-muted">
          <CalendarCheck2 className="size-4" aria-hidden /> V příštích {weeks * 7} dnech nic dalšího nemáte.
        </p>
      )}
      <button type="button" onClick={() => setWeeks((w) => w + 3)} className="mx-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
        <ChevronDown className="size-4" aria-hidden /> Další tři týdny
      </button>
    </div>
  );
}

function OverdueRow({ item, byId }: { item: PlanItem; byId: Map<string, Subject> }) {
  const now = useNow(60_000);
  const settings = useAppStore((s) => s.settings);
  return <PlanRow item={item} byId={byId} settings={settings} now={now} />;
}
