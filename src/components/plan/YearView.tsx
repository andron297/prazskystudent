/**
 * Akademický rok (harmonogram): dvanáct přehledných měsíců podbarvených
 * podle fáze semestru, s termíny. Klepnutím se měsíc otevře. Termíny, které
 * se studenta netýkají, jsou skryté (a dají se zobrazit).
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Eye, EyeOff, Flag, ScrollText, SlidersHorizontal } from 'lucide-react';
import type { Milestone, Subject } from '../../types';
import { academicYearStart, addDays, calendarDayDiff, formatDayMonth, isSameDay, plural, startOfDay, toDate } from '../../lib/dates';
import { isRequirementComplete } from '../../lib/progress';
import { LEVEL_LABEL } from '../../lib/relevance';
import { CATEGORY_LABELS } from '../../lib/scheduleTextParser';
import { monthGrid, phaseOn } from '../../lib/plan';
import { useNow } from '../../hooks/useNow';
import { usePlanData } from '../../hooks/usePlanData';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { Button, cn } from '../ui/primitives';
import { PHASE_DOT, PHASE_TINT } from './PlanBits';
import { StudyProfileDialog } from './StudyProfileDialog';

const MONTH_NAMES = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const PRIORITY: Milestone['category'][] = ['holiday', 'exam-period', 'teaching', 'enrollment', 'semester', 'event'];

function untilText(d: Date, now: Date): string {
  const days = calendarDayDiff(d, now);
  if (days <= 0) return 'dnes';
  if (days === 1) return 'zítra';
  if (days < 14) return `za ${days} ${plural(days, ['den', 'dny', 'dní'])}`;
  const weeks = Math.round(days / 7);
  return `za ${weeks} ${plural(weeks, ['týden', 'týdny', 'týdnů'])}`;
}

function Summary({ milestones, deadlines }: { milestones: Milestone[]; deadlines: Date[] }) {
  const now = useNow(60_000);
  const today = startOfDay(now);
  const ranges = milestones.map((m) => ({ m, s: startOfDay(toDate(m.start)), e: startOfDay(toDate(m.end ?? m.start)) }));
  const current = ranges.filter((r) => r.s <= today && r.e >= today && r.e > r.s).sort((a, b) => PRIORITY.indexOf(a.m.category) - PRIORITY.indexOf(b.m.category))[0];
  const next = ranges.filter((r) => r.s > today && r.m.category !== 'deadline' && r.m.category !== 'assessment').sort((a, b) => a.s.getTime() - b.s.getTime())[0];
  const weekEnd = addDays(today, 7 - ((today.getDay() + 6) % 7));
  const thisWeek = deadlines.filter((d) => d >= now && d < weekEnd).length;
  let currentText = '';
  if (current) {
    const total = calendarDayDiff(current.e, current.s) + 1;
    if (current.m.category === 'teaching' && total > 20) currentText = `${Math.floor(calendarDayDiff(today, current.s) / 7) + 1}. týden z ${Math.ceil(total / 7)}`;
    else currentText = `do ${formatDayMonth(current.e)}`;
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-[18px] bg-accent-soft px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-accent">Teď</p>
        <p className="mt-0.5 text-[15px] font-bold leading-snug">{current ? current.m.title : 'Mimo výuku'}</p>
        {currentText && <p className="text-[12.5px] text-muted">{currentText}</p>}
      </div>
      <div className="rounded-[18px] bg-surface-2 px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-subtle">Potom</p>
        <p className="mt-0.5 text-[15px] font-bold leading-snug">{next ? next.m.title : 'Nic dalšího v harmonogramu'}</p>
        {next && (
          <p className="text-[12.5px] text-muted">
            {formatDayMonth(next.s)} · {untilText(next.s, now)}
          </p>
        )}
      </div>
      <div className="rounded-[18px] bg-surface-2 px-4 py-3">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-subtle">Do konce týdne</p>
        <p className="mt-0.5 text-[15px] font-bold leading-snug">{thisWeek ? `${thisWeek} ${plural(thisWeek, ['termín', 'termíny', 'termínů'])}` : 'Žádný termín'}</p>
        <p className="text-[12.5px] text-muted">{thisWeek ? 'Podrobnosti v týdnu a měsíci' : 'Klidný týden'}</p>
      </div>
    </div>
  );
}

function MiniMonth({ month, milestones, deadlineDays, onOpen, byId: _byId }: { month: Date; milestones: Milestone[]; deadlineDays: Set<string>; onOpen: () => void; byId: Map<string, Subject> }) {
  const now = useNow(60_000);
  const cells = monthGrid(month);
  const m = month.getMonth();
  const inMonth = milestones
    .filter((ms) => {
      const s = toDate(ms.start);
      return s.getMonth() === m && s.getFullYear() === month.getFullYear();
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const deadlineCount = cells.filter((d) => d.getMonth() === m && deadlineDays.has(d.toDateString())).length;
  const current = now.getMonth() === m && now.getFullYear() === month.getFullYear();
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileHover={{ y: -2 }}
      className={cn('card group flex flex-col rounded-[22px] p-3.5 text-left', current && 'ring-2 ring-accent/50')}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display text-[22px] leading-none">{MONTH_NAMES[m]}</span>
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-subtle">
          {deadlineCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-red-700 dark:text-red-300">
              <Flag className="size-3" aria-hidden /> {deadlineCount}
            </span>
          )}
          <ChevronRight className="size-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
        </span>
      </span>
      <span className="mt-2.5 grid grid-cols-7 gap-[3px]">
        {cells.map((d) => {
          const own = d.getMonth() === m;
          const phase = own ? phaseOn(milestones, d) : null;
          const today = isSameDay(d, now);
          const hasDeadline = own && deadlineDays.has(d.toDateString());
          return (
            <span
              key={d.toISOString()}
              className={cn('relative grid aspect-square place-items-center rounded-[6px] text-[9.5px] font-semibold tabular', !own && 'opacity-0', phase ? PHASE_TINT[phase] : 'bg-transparent', today && 'bg-accent text-accent-fg')}
            >
              {d.getDate()}
              {hasDeadline && <span className="absolute bottom-[2px] size-1 rounded-full bg-red-500" />}
            </span>
          );
        })}
      </span>
      <span className="mt-3 space-y-1">
        {inMonth.slice(0, 3).map((ms) => (
          <span key={ms.id} className="flex items-center gap-1.5 text-[11.5px]">
            <span className={cn('size-1.5 shrink-0 rounded-full', PHASE_DOT[ms.category])} />
            <span className="w-9 shrink-0 font-semibold tabular text-subtle">{toDate(ms.start).getDate()}.</span>
            <span className="truncate">{ms.title}</span>
          </span>
        ))}
        {inMonth.length > 3 && <span className="block pl-[3.1rem] text-[11px] font-semibold text-subtle">a další {inMonth.length - 3}</span>}
        {inMonth.length === 0 && <span className="block text-[11.5px] text-subtle">Žádné termíny harmonogramu</span>}
      </span>
    </motion.button>
  );
}

export function YearView({ byId, onOpenMonth }: { byId: Map<string, Subject>; onOpenMonth: (month: Date) => void }) {
  const now = useNow(60_000);
  const data = usePlanData();
  const updateSettings = useAppStore((s) => s.updateSettings);
  const shownIds = useAppStore((s) => s.settings.shownMilestones);
  const openConnect = useUiStore((s) => s.openConnect);
  const [dialog, setDialog] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const ay = academicYearStart(now);
  const months = Array.from({ length: 12 }, (_, i) => new Date(ay, 8 + i, 1));
  const deadlines = useMemo(() => data.requirements.filter((r) => r.deadline && !isRequirementComplete(r)).map((r) => new Date(r.deadline!)), [data.requirements]);
  const deadlineDays = useMemo(() => new Set(deadlines.map((d) => d.toDateString())), [deadlines]);
  const profile = data.profile;

  return (
    <div className="space-y-4">
      <Summary milestones={data.milestones} deadlines={deadlines} />

      {data.allMilestones.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[22px] bg-surface-2/70 p-5 sm:flex-row sm:items-center">
          <ScrollText className="size-6 shrink-0 text-moss" aria-hidden />
          <p className="flex-1 text-[14px] text-muted">Harmonogram akademického roku zatím nemáte. Nahrajte PDF z webu fakulty nebo vložte jeho text – termíny se roztřídí samy.</p>
          <Button variant="primary" icon={ScrollText} onClick={() => openConnect('parser')}>
            Nahrát harmonogram
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-surface-2/70 px-4 py-2.5 text-[13.5px]">
          <SlidersHorizontal className="size-4 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 text-muted">
            {profile ? (
              <>
                {LEVEL_LABEL[profile.level]} studium, {profile.year}. ročník
                {data.hiddenMilestones.length > 0 && <> · skryto {data.hiddenMilestones.length} termínů, které se vás netýkají</>}
              </>
            ) : (
              <>Harmonogram obsahuje i termíny pro jiné typy studia. Upřesněte své studium a nepotřebné skryjeme.</>
            )}
          </span>
          {data.hiddenMilestones.length > 0 && (
            <button type="button" onClick={() => setShowHidden((v) => !v)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-muted hover:bg-surface hover:text-fg">
              {showHidden ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />} {showHidden ? 'Skrýt seznam' : 'Zobrazit skryté'}
            </button>
          )}
          <Button size="sm" variant={profile ? 'ghost' : 'primary'} onClick={() => setDialog(true)}>
            {profile ? 'Upravit' : 'Upřesnit studium'}
          </Button>
        </div>
      )}

      {showHidden && data.hiddenMilestones.length > 0 && (
        <ul className="divide-y divide-line rounded-[18px] ring-1 ring-inset ring-line">
          {data.hiddenMilestones.map(({ milestone: m, reason }) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <span className="w-16 shrink-0 font-semibold tabular text-subtle">{formatDayMonth(toDate(m.start))}</span>
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="hidden shrink-0 text-[12px] text-subtle sm:block">{reason}</span>
              <button type="button" onClick={() => updateSettings({ shownMilestones: [...new Set([...(shownIds ?? []), m.id])] })} className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold text-accent hover:bg-accent-soft">
                Zobrazit
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => (
          <MiniMonth key={month.toISOString()} month={month} milestones={data.milestones} deadlineDays={deadlineDays} onOpen={() => onOpenMonth(month)} byId={byId} />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12px] text-muted">
        {(['teaching', 'exam-period', 'holiday', 'enrollment'] as Milestone['category'][]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', PHASE_DOT[c])} /> {CATEGORY_LABELS[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-red-500" /> Termín z předmětu
        </span>
      </div>
      <StudyProfileDialog key={String(dialog)} open={dialog} onClose={() => setDialog(false)} />
    </div>
  );
}
