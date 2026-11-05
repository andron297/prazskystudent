/**
 * Měsíc: mřížka dní podbarvená podle fáze semestru (výuka, zkouškové,
 * volno), v každém dni to podstatné. Klepnutím na den se ukáže jeho detail.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Flag } from 'lucide-react';
import type { Subject } from '../../types';
import { addDays, capitalize, formatDayMonth, formatWeekdayLong, isSameDay, startOfDay } from '../../lib/dates';
import { isSpan, itemsOnDay, monthGrid, phaseOn, planItems, type PlanItem } from '../../lib/plan';
import { useNow } from '../../hooks/useNow';
import { usePlanData } from '../../hooks/usePlanData';
import { cn } from '../ui/primitives';
import { DayList } from './AgendaPanel';
import { itemTitle, itemTone, PHASE_DOT, PHASE_TINT } from './PlanBits';

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];

function CellEntry({ item, byId }: { item: PlanItem; byId: Map<string, Subject> }) {
  const tone = itemTone(item, byId);
  const title = itemTitle(item, byId);
  if (item.kind === 'deadline') {
    return (
      <span className="flex min-w-0 items-center gap-1 truncate text-[10.5px] font-bold text-red-700 dark:text-red-300">
        <Flag className="size-2.5 shrink-0" aria-hidden />
        <span className="truncate">{title}</span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1 truncate text-[10.5px] font-semibold text-muted">
      <span className={cn('size-1.5 shrink-0 rounded-full', item.kind === 'milestone' ? PHASE_DOT[item.milestone.category] : tone.bar)} style={tone.style} />
      <span className={cn('truncate', item.kind === 'task' && item.task.done && 'line-through')}>{title}</span>
    </span>
  );
}

export function MonthGrid({ anchor, byId }: { anchor: Date; byId: Map<string, Subject> }) {
  const now = useNow(60_000);
  const data = usePlanData();
  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const items = useMemo(() => planItems(data, cells[0], addDays(cells[cells.length - 1], 1)), [data, cells]);
  const [selected, setSelected] = useState<Date | null>(null);
  const month = anchor.getMonth();
  const sel = selected && selected.getMonth() === month ? selected : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-[22px] ring-1 ring-inset ring-line">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-subtle">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const inMonth = day.getMonth() === month;
            const today = isSameDay(day, now);
            const phase = phaseOn(data.milestones, day);
            const dayItems = itemsOnDay(items, day).filter((x) => !isSpan(x));
            const classes = dayItems.filter((x) => x.kind === 'class').length;
            const rest = dayItems.filter((x) => x.kind !== 'class');
            const active = sel && isSameDay(day, sel);
            return (
              <motion.button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelected(startOfDay(day))}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 30) * 0.008 }}
                className={cn(
                  'relative flex min-h-[74px] flex-col items-stretch gap-0.5 border-b border-r border-line p-1.5 text-left transition-colors sm:min-h-[96px]',
                  (i + 1) % 7 === 0 && 'border-r-0',
                  phase && PHASE_TINT[phase],
                  !inMonth && 'opacity-40',
                  active ? 'ring-2 ring-inset ring-accent' : 'hover:bg-surface-2/70',
                )}
                aria-label={`${capitalize(formatWeekdayLong(day))} ${formatDayMonth(day)}${dayItems.length ? `, ${dayItems.length} položek` : ''}`}
              >
                <span className={cn('grid size-6 place-items-center rounded-full text-[12.5px] font-bold tabular', today && 'bg-accent text-accent-fg')}>{day.getDate()}</span>
                {classes > 0 && (
                  <>
                    <span className="hidden truncate text-[10.5px] font-semibold text-accent sm:block">
                      {classes} {classes === 1 ? 'hodina' : classes < 5 ? 'hodiny' : 'hodin'}
                    </span>
                    <span className="flex gap-0.5 sm:hidden" aria-hidden>
                      {Array.from({ length: Math.min(classes, 4) }, (_, k) => (
                        <span key={k} className="h-1 w-2 rounded-full bg-accent/70" />
                      ))}
                    </span>
                  </>
                )}
                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {rest.slice(0, 2).map((x) => (
                    <CellEntry key={x.key} item={x} byId={byId} />
                  ))}
                  {rest.length > 2 && <span className="text-[10px] font-semibold text-subtle">a další {rest.length - 2}</span>}
                </span>
                {rest.length > 0 && (
                  <span className="mt-auto flex gap-0.5 sm:hidden">
                    {rest.slice(0, 4).map((x) => (
                      <span key={x.key} className={cn('size-1.5 rounded-full', x.kind === 'deadline' ? 'bg-red-500' : x.kind === 'milestone' ? PHASE_DOT[x.milestone.category] : itemTone(x, byId).bar)} />
                    ))}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0">
        <AnimatePresence mode="wait">
          {sel ? (
            <motion.div key={sel.toISOString()} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card rounded-[22px] p-3">
              <p className="px-2.5 pt-1 font-display text-[24px] leading-tight">{isSameDay(sel, now) ? 'Dnes' : capitalize(formatWeekdayLong(sel))}</p>
              <p className="px-2.5 pb-2 text-[12.5px] font-semibold text-subtle">{formatDayMonth(sel)}</p>
              <DayList items={items} day={sel} byId={byId} />
            </motion.div>
          ) : (
            <motion.div key="legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[22px] bg-surface-2/60 p-4 text-[13px] text-muted">
              <p className="font-semibold text-fg">Klepněte na den a uvidíte jeho program.</p>
              <ul className="mt-3 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded bg-moss/30" /> Výuka
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded bg-rose-500/25" /> Zkouškové období
                </li>
                <li className="flex items-center gap-2">
                  <span className="size-3 rounded bg-emerald-400/40" /> Volno a prázdniny
                </li>
                <li className="flex items-center gap-2">
                  <Flag className="size-3 text-red-600" aria-hidden /> Termín odevzdání nebo testu
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
