/**
 * Týden jako v kalendáři: časová mřížka, hodiny vedle sebe bez překrývání,
 * nahoře celodenní věci (úkoly, termíny, období). V mobilu jeden den
 * s výběrem dne nahoře.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Flag } from 'lucide-react';
import type { Subject } from '../../types';
import { addDays, formatTime, formatWeekdayShort, isSameDay, startOfDay } from '../../lib/dates';
import { hourRange, isAllDay, isSpan, itemsOnDay, layoutDay, planItems, type PlanItem, type TimedBox } from '../../lib/plan';
import { useNow } from '../../hooks/useNow';
import { usePlanData } from '../../hooks/usePlanData';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent } from '../../store/selectors';
import { Checkbox, cn } from '../ui/primitives';
import { itemTitle, itemTone, openItem, PHASE_DOT } from './PlanBits';

const HOUR = 52;

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

function AllDayChip({ item, byId }: { item: PlanItem; byId: Map<string, Subject> }) {
  const toggleTask = useAppStore((s) => s.toggleTask);
  const tone = itemTone(item, byId);
  const title = itemTitle(item, byId);
  if (item.kind === 'task' || item.kind === 'deadline') {
    const done = item.kind === 'task' ? item.task.done : item.done;
    return (
      <div className={cn('flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11.5px] font-semibold', item.kind === 'deadline' ? 'bg-red-500/10 text-red-800 dark:text-red-200' : 'bg-surface-2')}>
        {item.kind === 'deadline' ? (
          <Flag className="size-3 shrink-0" aria-hidden />
        ) : (
          <Checkbox checked={done} onChange={() => toggleTask(item.task.id)} label={`Hotovo: ${title}`} className="size-3.5 rounded-full" />
        )}
        <button type="button" onClick={() => openItem(item)} className={cn('min-w-0 flex-1 truncate text-left', done && 'line-through opacity-60')} title={title}>
          {!(item.kind === 'task' && item.allDay) && <span className="tabular opacity-70">{formatTime(item.start)} </span>}
          {title}
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => openItem(item)} className={cn('flex min-w-0 items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-[11.5px] font-semibold', tone.soft)} title={title}>
      <span className={cn('size-1.5 shrink-0 rounded-full', item.kind === 'milestone' ? PHASE_DOT[item.milestone.category] : tone.bar)} style={tone.style} />
      <span className="truncate">{title}</span>
    </button>
  );
}

function EventBlock({ box, byId, from }: { box: TimedBox; byId: Map<string, Subject>; from: number }) {
  const settings = useAppStore((s) => s.settings);
  const now = useNow(60_000);
  const item = box.item;
  const tone = itemTone(item, byId);
  const title = itemTitle(item, byId);
  const e = item.kind === 'class' || item.kind === 'event' ? item.event : null;
  const place = e && item.kind === 'class' ? buildingForEvent(e, settings) : null;
  const top = ((box.top - from * 60) / 60) * HOUR;
  const height = Math.max(22, (box.height / 60) * HOUR - 3);
  const width = 100 / box.cols;
  const past = 'end' in item && item.end < now;
  return (
    <motion.button
      type="button"
      onClick={() => openItem(item)}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: past ? 0.55 : 1, scale: 1 }}
      className={cn('absolute overflow-hidden rounded-[12px] border border-white/40 px-2 py-1 text-left shadow-[0_6px_16px_-12px_rgb(0_0_0/0.5)] transition hover:z-10 hover:shadow-lg dark:border-black/20', tone.soft)}
      style={{ top, height, left: `calc(${box.col * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
      title={`${formatTime(item.start)} ${title}`}
    >
      <span className={cn('absolute inset-y-1 left-1 w-[3px] rounded-full', tone.bar)} style={tone.style} />
      <span className="block truncate pl-1.5 text-[11.5px] font-bold leading-tight">{title}</span>
      {height > 34 && (
        <span className="block truncate pl-1.5 text-[10.5px] leading-tight opacity-80">
          {formatTime(item.start)}
          {place?.building ? ` · ${place.building.name}${place.room ? ` ${place.room}` : ''}` : e?.location ? ` · ${e.location}` : ''}
        </span>
      )}
    </motion.button>
  );
}

export function WeekGrid({ anchor, byId }: { anchor: Date; byId: Map<string, Subject> }) {
  const now = useNow(60_000);
  const data = usePlanData();
  const narrow = useIsNarrow();
  const monday = useMemo(() => {
    const d = startOfDay(anchor);
    return addDays(d, -((d.getDay() + 6) % 7));
  }, [anchor]);
  const [selected, setSelected] = useState<Date>(() => (isSameDay(startOfDay(anchor), startOfDay(now)) || (now >= monday && now < addDays(monday, 7)) ? startOfDay(now) : monday));
  useEffect(() => {
    setSelected((s) => (s >= monday && s < addDays(monday, 7) ? s : now >= monday && now < addDays(monday, 7) ? startOfDay(now) : monday));
  }, [monday]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const items = useMemo(() => planItems(data, monday, addDays(monday, 7)), [data, monday]);
  const spans = items.filter(isSpan);
  const weekend = days.slice(5).some((d) => itemsOnDay(items, d).some((i) => !isSpan(i)));
  const shown = narrow ? [selected] : weekend ? days : days.slice(0, 5);
  const layouts = shown.map((d) => layoutDay(itemsOnDay(items, d), d));
  const [from, to] = hourRange(layouts.flat());
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const scroller = useRef<HTMLDivElement>(null);

  return (
    <div>
      {narrow && (
        <div className="mb-3 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const count = itemsOnDay(items, d).filter((i) => i.kind === 'class' || i.kind === 'event' || i.kind === 'deadline').length;
            const active = isSameDay(d, selected);
            return (
              <button key={d.toISOString()} type="button" onClick={() => setSelected(d)} className={cn('flex flex-col items-center rounded-2xl py-1.5 transition-colors', active ? 'bg-accent text-accent-fg' : isSameDay(d, now) ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2')}>
                <span className="text-[10.5px] font-bold uppercase opacity-75">{formatWeekdayShort(d)}</span>
                <span className="text-[17px] font-bold tabular">{d.getDate()}</span>
                <span className={cn('mt-0.5 h-1 w-1 rounded-full', count ? (active ? 'bg-accent-fg' : 'bg-accent') : 'bg-transparent')} />
              </button>
            );
          })}
        </div>
      )}

      {spans.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {spans.map((sp) =>
            sp.kind === 'milestone' ? (
              <span key={sp.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted ring-1 ring-inset ring-line">
                <span className={cn('size-2 rounded-full', PHASE_DOT[sp.milestone.category])} />
                {sp.milestone.title}
              </span>
            ) : null,
          )}
        </div>
      )}
      <div className="overflow-hidden rounded-[22px] ring-1 ring-inset ring-line">
        {/* Záhlaví dnů a celodenní řádek */}
        <div className="grid border-b border-line bg-surface-2/50" style={{ gridTemplateColumns: `44px repeat(${shown.length}, minmax(0, 1fr))` }}>
          <div />
          {shown.map((d) => {
            const today = isSameDay(d, now);
            const all = itemsOnDay(items, d).filter((i) => !isSpan(i) && (isAllDay(i) || i.kind === 'deadline' || i.kind === 'task'));
            return (
              <div key={d.toISOString()} className="min-w-0 border-l border-line px-1.5 pb-1.5 pt-2">
                {!narrow && (
                  <p className={cn('mb-1 flex items-baseline gap-1.5 px-0.5', today && 'text-accent')}>
                    <span className="text-[11px] font-bold uppercase tracking-wide">{formatWeekdayShort(d)}</span>
                    <span className={cn('grid size-6 place-items-center rounded-full text-[13px] font-bold tabular', today && 'bg-accent text-accent-fg')}>{d.getDate()}</span>
                  </p>
                )}
                <div className="space-y-1">
                  {all.slice(0, 4).map((i) => (
                    <AllDayChip key={i.key} item={i} byId={byId} />
                  ))}
                  {all.length > 4 && <p className="px-1 text-[11px] font-semibold text-subtle">a další {all.length - 4}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Časová mřížka */}
        <div ref={scroller} className="relative max-h-[640px] overflow-y-auto">
          <div className="grid" style={{ gridTemplateColumns: `44px repeat(${shown.length}, minmax(0, 1fr))` }}>
            <div className="relative" style={{ height: hours.length * HOUR }}>
              {hours.map((h, i) => (
                <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10.5px] font-semibold text-subtle tabular" style={{ top: i * HOUR }}>
                  {i === 0 ? '' : `${h}:00`}
                </span>
              ))}
            </div>
            {shown.map((d, di) => {
              const today = isSameDay(d, now);
              const nowTop = ((now.getHours() * 60 + now.getMinutes() - from * 60) / 60) * HOUR;
              return (
                <div key={d.toISOString()} className={cn('relative border-l border-line', today && 'bg-accent/[0.03]')} style={{ height: hours.length * HOUR }}>
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR }} />
                  ))}
                  {layouts[di].map((b) => (
                    <EventBlock key={b.item.key} box={b} byId={byId} from={from} />
                  ))}
                  {today && nowTop >= 0 && nowTop <= hours.length * HOUR && (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                      <span className="absolute -left-1 -top-1 size-2 rounded-full bg-clay" />
                      <span className="block h-[2px] bg-clay" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
