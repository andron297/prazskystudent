/**
 * Akademický rok na jeden pohled: kde v semestru právě jsem, co přijde dál
 * a kdy se kupí termíny. Celý rok se vejde na šířku (i v mobilu), období se
 * nikdy nepřekrývají – co se časově kryje, dostane vlastní řádek.
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarRange } from 'lucide-react';
import type { Milestone, MilestoneCategory, Requirement, Subject } from '../../types';
import { academicYearStart, addDays, calendarDayDiff, formatDayMonth, formatMonthShort, plural, startOfDay, startOfWeek, toDate } from '../../lib/dates';
import { isRequirementComplete } from '../../lib/progress';
import { CATEGORY_LABELS } from '../../lib/scheduleTextParser';
import { useNow } from '../../hooks/useNow';
import { Card, cn } from '../ui/primitives';

const PHASE_COLOR: Partial<Record<MilestoneCategory, string>> = {
  teaching: 'bg-accent/80 text-accent-fg',
  semester: 'bg-moss/60 text-white',
  'exam-period': 'bg-rose-600/75 text-white',
  holiday: 'bg-emerald-500/80 text-white',
  enrollment: 'bg-sand text-[#3d2f1a]',
  event: 'bg-sky-600/70 text-white',
  assessment: 'bg-clay text-white',
  deadline: 'bg-red-600 text-white',
};

interface Span {
  id: string;
  title: string;
  category: MilestoneCategory;
  start: Date;
  end: Date;
}

/** Rozdělí období do řádků tak, aby se v žádném nepřekrývala. */
function pack(spans: Span[]): Span[][] {
  const rows: Span[][] = [];
  for (const s of [...spans].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())) {
    const row = rows.find((r) => r[r.length - 1].end < s.start);
    if (row) row.push(s);
    else rows.push([s]);
  }
  return rows;
}

const PRIORITY: MilestoneCategory[] = ['holiday', 'exam-period', 'teaching', 'enrollment', 'semester', 'event'];

function describe(span: Span, now: Date): string {
  const total = calendarDayDiff(span.end, span.start) + 1;
  if (span.category === 'teaching' && total > 20) {
    const week = Math.floor(calendarDayDiff(now, span.start) / 7) + 1;
    const weeks = Math.ceil(total / 7);
    return `${week}. týden z ${weeks}`;
  }
  const left = calendarDayDiff(span.end, now);
  return left <= 0 ? 'poslední den' : `ještě ${left} ${plural(left, ['den', 'dny', 'dní'])}, do ${formatDayMonth(span.end)}`;
}

function untilText(d: Date, now: Date): string {
  const days = calendarDayDiff(d, now);
  if (days <= 0) return 'dnes';
  if (days === 1) return 'zítra';
  if (days < 14) return `za ${days} ${plural(days, ['den', 'dny', 'dní'])}`;
  const weeks = Math.round(days / 7);
  return `za ${weeks} ${plural(weeks, ['týden', 'týdny', 'týdnů'])}`;
}

export function YearOverview({ milestones, requirements, subjects }: { milestones: Milestone[]; requirements: Requirement[]; subjects: Map<string, Subject> }) {
  const now = useNow(60_000);
  const today = startOfDay(now);
  const ay = academicYearStart(now);
  const rangeStart = new Date(ay, 8, 1);
  const rangeEnd = new Date(ay + 1, 8, 30);
  const total = calendarDayDiff(rangeEnd, rangeStart) + 1;
  const pct = (d: Date) => Math.max(0, Math.min(100, (calendarDayDiff(d, rangeStart) / total) * 100));
  const [picked, setPicked] = useState<string | null>(null);

  const { spans, single, breaks, mainRows, sideRows, weeks } = useMemo(() => {
    const spans: Span[] = [];
    const single: Span[] = [];
    for (const m of milestones) {
      const start = toDate(m.start);
      const end = m.end ? toDate(m.end) : start;
      if (end < rangeStart || start > rangeEnd) continue;
      const span = { id: m.id, title: m.title, category: m.category, start, end };
      if (calendarDayDiff(end, start) >= 1) spans.push(span);
      else single.push(span);
    }
    // Prázdniny přerušují výuku – kreslí se přes ni ve stejném řádku, ne na další.
    const main = spans.filter((s) => s.category === 'teaching' || s.category === 'exam-period');
    const breaks = spans.filter((s) => s.category === 'holiday');
    const side = spans.filter((s) => s.category === 'enrollment' || s.category === 'event' || s.category === 'assessment' || s.category === 'deadline');
    // Termíny po týdnech (histogram – žádné překrývající se tečky).
    const weekMap = new Map<number, { start: Date; items: { title: string; subject?: Subject; done: boolean }[] }>();
    const addItem = (d: Date, item: { title: string; subject?: Subject; done: boolean }) => {
      if (d < rangeStart || d > rangeEnd) return;
      const w = startOfWeek(d);
      const key = w.getTime();
      const entry = weekMap.get(key) ?? { start: w, items: [] };
      entry.items.push(item);
      weekMap.set(key, entry);
    };
    for (const r of requirements) if (r.deadline) addItem(new Date(r.deadline), { title: r.title, subject: subjects.get(r.subjectId), done: isRequirementComplete(r) });
    for (const s of single) if (s.category === 'deadline' || s.category === 'assessment') addItem(s.start, { title: s.title, done: false });
    return { spans, single, breaks, mainRows: pack(main), sideRows: pack(side), weeks: [...weekMap.values()].sort((a, b) => a.start.getTime() - b.start.getTime()) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones, requirements, subjects, ay]);

  const current = spans.filter((s) => s.start <= today && s.end >= today).sort((a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category))[0];
  const next = [...spans, ...single.filter((s) => s.category !== 'deadline' && s.category !== 'assessment')]
    .filter((s) => s.start > today)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const thisWeek = weeks.find((w) => w.start.getTime() === startOfWeek(now).getTime());
  const openThisWeek = thisWeek?.items.filter((i) => !i.done).length ?? 0;
  const maxWeek = Math.max(1, ...weeks.map((w) => w.items.filter((i) => !i.done).length));
  const months = Array.from({ length: 13 }, (_, i) => new Date(ay, 8 + i, 1));
  const holidaysOneDay = single.filter((s) => s.category === 'holiday');

  const pickedSpan = picked ? [...spans, ...single].find((s) => s.id === picked) : undefined;
  const pickedWeek = picked?.startsWith('week:') ? weeks.find((w) => `week:${w.start.getTime()}` === picked) : undefined;

  const Bar = ({ s, row, front = false }: { s: Span; row: number; front?: boolean }) => {
    const left = pct(s.start);
    const width = Math.max(0.8, pct(addDays(s.end, 1)) - left);
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, scaleX: 0.4 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.45, delay: row * 0.05, ease: [0.22, 1, 0.36, 1] }}
        style={{ left: `${left}%`, width: `${width}%`, originX: 0 }}
        onClick={() => setPicked(s.id)}
        className={cn('absolute inset-y-0 overflow-hidden rounded-[8px] px-1.5 text-left text-[10.5px] font-bold leading-[26px] shadow-sm ring-2 ring-[var(--surface)] transition hover:brightness-110', front && 'z-10', PHASE_COLOR[s.category] ?? 'bg-zinc-400 text-white', picked === s.id && 'ring-fg')}
        title={`${s.title}: ${formatDayMonth(s.start)} – ${formatDayMonth(s.end)}`}
        aria-label={`${s.title}, ${formatDayMonth(s.start)} až ${formatDayMonth(s.end)}`}
      >
        <span className="block truncate">{width > 9 ? s.title : ''}</span>
      </motion.button>
    );
  };

  return (
    <Card title="Akademický rok" icon={CalendarRange} action={<span className="text-xs font-semibold text-muted tabular">{ay}/{ay + 1}</span>}>
      {/* Kde právě jsem */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-[18px] bg-accent-soft px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-accent">Teď</p>
          <p className="mt-0.5 text-[15px] font-bold leading-snug">{current ? current.title : 'Mimo výuku'}</p>
          {current && <p className="text-[12.5px] text-muted">{describe(current, now)}</p>}
        </div>
        <div className="rounded-[18px] bg-surface-2 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-subtle">Potom</p>
          <p className="mt-0.5 text-[15px] font-bold leading-snug">{next ? next.title : 'Nic dalšího v harmonogramu'}</p>
          {next && (
            <p className="text-[12.5px] text-muted">
              {calendarDayDiff(next.end, next.start) >= 1 ? 'od ' : ''}
              {formatDayMonth(next.start)} · {untilText(next.start, now)}
            </p>
          )}
        </div>
        <div className="rounded-[18px] bg-surface-2 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-subtle">Tento týden</p>
          <p className="mt-0.5 text-[15px] font-bold leading-snug">{openThisWeek ? `${openThisWeek} ${plural(openThisWeek, ['termín', 'termíny', 'termínů'])}` : 'Žádný termín'}</p>
          <p className="text-[12.5px] text-muted">{openThisWeek ? 'Podrobnosti v Agendě níže' : 'Klidný týden'}</p>
        </div>
      </div>

      {/* Časová osa */}
      <div className="relative mt-5 select-none" aria-label="Časová osa akademického roku">
        <div className="relative space-y-1.5">
          {/* Výuka, zkouškové, prázdniny */}
          {(mainRows.length ? mainRows : [[]]).map((row, i) => (
            <div key={`m${i}`} className="relative h-[26px] rounded-[8px] bg-surface-2">
              {row.map((s) => (
                <Bar key={s.id} s={s} row={i} />
              ))}
              {i === 0 && breaks.map((s) => <Bar key={s.id} s={s} row={i} front />)}
            </div>
          ))}
          {/* Jednodenní volno (rektorský den…) jako značky */}
          {holidaysOneDay.length > 0 && (
            <div className="relative h-3">
              {holidaysOneDay.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPicked(s.id)}
                  className="absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-full bg-emerald-500 hover:scale-125"
                  style={{ left: `${pct(s.start)}%` }}
                  title={`${s.title} – ${formatDayMonth(s.start)}`}
                  aria-label={`${s.title}, ${formatDayMonth(s.start)}`}
                />
              ))}
            </div>
          )}
          {/* Zápis a další období */}
          {sideRows.map((row, i) => (
            <div key={`s${i}`} className="relative h-[26px]">
              {row.map((s) => (
                <Bar key={s.id} s={s} row={i + mainRows.length} />
              ))}
            </div>
          ))}
          {/* Termíny po týdnech */}
          <div className="relative mt-1 h-9 border-b border-line" aria-label="Počet termínů v jednotlivých týdnech">
            {weeks.map((w) => {
              const open = w.items.filter((i) => !i.done).length;
              const past = addDays(w.start, 7) <= today;
              const left = pct(w.start);
              const width = Math.max(0.9, pct(addDays(w.start, 7)) - left - 0.25);
              const h = open ? 6 + (open / maxWeek) * 28 : 4;
              return (
                <button
                  key={w.start.getTime()}
                  type="button"
                  onClick={() => setPicked(`week:${w.start.getTime()}`)}
                  className={cn('absolute bottom-0 rounded-t-[3px] transition hover:brightness-110', open === 0 ? 'bg-line-strong' : past ? 'bg-zinc-400/70' : 'bg-clay')}
                  style={{ left: `${left}%`, width: `${width}%`, height: h }}
                  title={`Týden od ${formatDayMonth(w.start)}: ${w.items.length} ${plural(w.items.length, ['termín', 'termíny', 'termínů'])}`}
                  aria-label={`Týden od ${formatDayMonth(w.start)}, ${open} otevřených termínů`}
                />
              );
            })}
          </div>
          {/* Měsíce */}
          <div className="relative h-4">
            {months.map((m) => (
              <span key={m.toISOString()} className="absolute top-0.5 -translate-x-0 text-[10px] font-semibold text-subtle" style={{ left: `${pct(m)}%` }}>
                {formatMonthShort(m)}
              </span>
            ))}
          </div>
        </div>
        {/* Dnes */}
        <div className="pointer-events-none absolute -top-2 bottom-4 w-0.5 -translate-x-1/2 rounded-full bg-fg/80" style={{ left: `${pct(now)}%` }}>
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-fg px-1.5 py-px text-[9.5px] font-black uppercase tracking-wide text-[var(--surface)]">dnes</span>
        </div>
      </div>

      {/* Vybraný prvek */}
      <div className="mt-3 min-h-[2.5rem] rounded-[16px] bg-surface-2 px-3.5 py-2 text-[13px]" aria-live="polite">
        {pickedSpan ? (
          <p>
            <strong>{pickedSpan.title}</strong> · {CATEGORY_LABELS[pickedSpan.category]} · {formatDayMonth(pickedSpan.start)}
            {pickedSpan.end.getTime() !== pickedSpan.start.getTime() ? ` – ${formatDayMonth(pickedSpan.end)}` : ''}
          </p>
        ) : pickedWeek ? (
          <div>
            <p className="font-bold">Týden od {formatDayMonth(pickedWeek.start)}</p>
            <ul className="mt-0.5 space-y-0.5 text-muted">
              {pickedWeek.items.map((i, idx) => (
                <li key={idx} className={cn(i.done && 'line-through opacity-60')}>
                  {i.title}
                  {i.subject ? ` · ${i.subject.code ?? i.subject.name}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted">Klepni na období nebo na sloupek s termíny a uvidíš podrobnosti.</p>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
        {(['teaching', 'exam-period', 'holiday', 'enrollment'] as MilestoneCategory[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', PHASE_COLOR[c]?.split(' ')[0])} />
            {CATEGORY_LABELS[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-1.5 rounded-sm bg-clay" /> Termíny v týdnu
        </span>
      </div>
    </Card>
  );
}
