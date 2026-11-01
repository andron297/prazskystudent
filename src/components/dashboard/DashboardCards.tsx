import { motion } from 'motion/react';
import { ArrowRight, CalendarDays, CalendarRange, Flag, GraduationCap, ListChecks, MapPin, Sparkles } from 'lucide-react';
import type { Milestone, ScheduleEvent, Subject } from '../../types';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { addDays, formatDayMonth, formatDeadline, formatTime, formatWeekdayLong, isSameDay, toDate, toDateKey } from '../../lib/dates';
import { isRequirementComplete, requirementProgress, subjectProgress } from '../../lib/progress';
import { CATEGORY_LABELS } from '../../lib/scheduleTextParser';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { navigateTo } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent, subjectMap, upcomingDeadlines } from '../../store/selectors';
import { Button, Card, Chip, cn, EmptyState, ProgressBar } from '../ui/primitives';

export const MILESTONE_STYLES: Record<Milestone['category'], string> = {
  semester: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  teaching: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
  'exam-period': 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  enrollment: 'bg-amber-500/14 text-amber-800 dark:text-amber-300',
  holiday: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  deadline: 'bg-red-500/12 text-red-700 dark:text-red-300',
  assessment: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  event: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
};

/* ------------------------------------------------------------------ */
/* Dnešní rozvrh                                                       */
/* ------------------------------------------------------------------ */

export function TodaySchedule({ targetId, onSelect }: { targetId?: string; onSelect: (event: ScheduleEvent) => void }) {
  const now = useNow(30_000);
  const events = useAppStore((s) => s.events);
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const byId = subjectMap(subjects);
  let day = now;
  let list = events.filter((e) => isSameDay(new Date(e.start), now));
  let label = 'Dnešní rozvrh';
  if (list.length === 0 || list.every((e) => new Date(e.end) < now)) {
    for (let i = 1; i <= 6; i++) {
      const candidate = addDays(now, i);
      const found = events.filter((e) => isSameDay(new Date(e.start), candidate));
      if (found.length) {
        list = found;
        day = candidate;
        label = i === 1 ? 'Zítřejší rozvrh' : `Rozvrh – ${formatWeekdayLong(candidate)}`;
        break;
      }
    }
  }

  return (
    <Card title={label} icon={CalendarDays} className="h-full" action={<span className="text-xs text-muted">{formatDayMonth(day)}</span>}>
      {list.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Tento týden žádná výuka">
          Importuj rozvrh ze SISu přes .ics odkaz v sekci Integrace.
        </EmptyState>
      ) : (
        <ol className="relative space-y-1.5 before:absolute before:bottom-3 before:left-[3.15rem] before:top-3 before:w-px before:bg-line">
          {list.map((e) => {
            const start = new Date(e.start);
            const end = new Date(e.end);
            const past = end < now;
            const current = start <= now && end > now;
            const subject = e.subjectId ? byId.get(e.subjectId) : undefined;
            const color = subject ? SUBJECT_COLOR_CLASSES[subject.color] : null;
            const { building, room } = buildingForEvent(e, settings);
            const selected = targetId === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  disabled={past}
                  className={cn(
                    'relative flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition-colors',
                    past ? 'opacity-50' : 'hover:bg-surface-2',
                    selected && 'bg-accent-soft hover:bg-accent-soft',
                  )}
                  title={past ? 'Proběhlo' : 'Naplánovat cestu na tuto výuku'}
                >
                  <span className="w-10 shrink-0 pt-0.5 text-right font-mono text-[12px] leading-tight text-muted tabular">
                    {formatTime(start)}
                    <span className="block text-[10.5px] text-subtle">{formatTime(end)}</span>
                  </span>
                  <span className={cn('relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-[var(--surface)]', color?.dot ?? 'bg-zinc-400', current && 'animate-pulse')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{subject?.name ?? e.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{e.kind === 'lecture' ? 'Přednáška' : e.kind === 'seminar' ? 'Seminář' : e.kind === 'exam' ? 'Zkouška' : 'Výuka'}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="size-3" aria-hidden />
                        {building ? `${building.name}${room ? ` ${room}` : ''}` : (e.location ?? 'bez místa')}
                      </span>
                    </span>
                  </span>
                  {current && <Chip className="bg-accent text-accent-fg">teď</Chip>}
                  {selected && !current && <Chip className="bg-accent-soft text-accent">cíl</Chip>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Nejbližší deadliny                                                  */
/* ------------------------------------------------------------------ */

export function DeadlinesCard() {
  const now = useNow(60_000);
  const requirements = useAppStore((s) => s.requirements);
  const subjects = useAppStore((s) => s.subjects);
  const byId = subjectMap(subjects);
  const list = upcomingDeadlines(requirements, now, isRequirementComplete, 6);

  return (
    <Card
      title="Nejbližší deadliny"
      icon={ListChecks}
      className="h-full"
      action={
        <Button size="sm" variant="ghost" onClick={() => navigateTo('harmonogram')}>
          Vše <ArrowRight className="size-3.5" />
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nic nehoří">
          Všechny termíny máš splněné. Úkoly z Moodlu se načtou po propojení.
        </EmptyState>
      ) : (
        <ul className="space-y-1">
          {list.map((r) => {
            const deadline = new Date(r.deadline!);
            const urgency = deadlineUrgency(deadline, now);
            const style = DEADLINE_STYLES[urgency];
            const subject = byId.get(r.subjectId);
            const progress = requirementProgress(r);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => navigateTo('predmety', r.subjectId)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2">
                  <span className={cn('size-2.5 shrink-0 rounded-full', style.dot, urgency === 'critical' && 'animate-pulse')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{r.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                      {subject && <span className="truncate">{subject.code ?? subject.name}</span>}
                      {r.subtasks.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <ProgressBar value={progress} height="h-1.5" className="w-14" barClassName={style.bar} />
                          {r.subtasks.filter((s) => s.done).length}/{r.subtasks.length}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Chip className={style.chip}>{style.label}</Chip>
                    <span className="text-[11.5px] text-muted tabular">{formatDeadline(deadline, now)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Progress předmětů                                                   */
/* ------------------------------------------------------------------ */

export function SubjectsProgressCard() {
  const subjects = useAppStore((s) => s.subjects);
  const requirements = useAppStore((s) => s.requirements);
  const rows = subjects.map((subject) => ({ subject, progress: subjectProgress(requirements.filter((r) => r.subjectId === subject.id)) }));
  const avg = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.progress.percent, 0) / rows.length) : 0;

  return (
    <Card
      title="Progress předmětů"
      icon={GraduationCap}
      className="h-full"
      action={<span className="text-xs font-medium text-muted tabular">průměr {avg} %</span>}
    >
      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Zatím žádné předměty" />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ subject, progress }) => (
            <li key={subject.id}>
              <button type="button" onClick={() => navigateTo('predmety', subject.id)} className="group block w-full text-left">
                <span className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn('size-2 shrink-0 rounded-full', SUBJECT_COLOR_CLASSES[subject.color].dot)} />
                    <span className="truncate font-medium group-hover:text-accent">{subject.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular">{progress.percent} %</span>
                </span>
                <ProgressBar value={progress.ratio} barClassName={SUBJECT_COLOR_CLASSES[subject.color].bar} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Milníky harmonogramu                                                */
/* ------------------------------------------------------------------ */

export function MilestonesCard() {
  const now = useNow(60_000);
  const milestones = useAppStore((s) => s.milestones);
  const todayKey = toDateKey(now);
  const list = milestones
    .filter((m) => (m.end ?? m.start).slice(0, 10) >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 5);

  return (
    <Card
      title="Harmonogram"
      icon={Flag}
      className="h-full"
      action={
        <Button size="sm" variant="ghost" onClick={() => navigateTo('harmonogram')} aria-label="Otevřít harmonogram">
          <CalendarRange className="size-3.5" />
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState icon={Flag} title="Žádné milníky">
          Vlož harmonogram fakulty do parseru.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {list.map((m) => {
            const start = toDate(m.start);
            const ongoing = m.start.slice(0, 10) <= todayKey;
            return (
              <motion.li key={m.id} layout className="min-w-0">
                <p className="truncate text-[13px] font-medium" title={m.title}>
                  {m.title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Chip className={MILESTONE_STYLES[m.category]}>{CATEGORY_LABELS[m.category]}</Chip>
                  <span className="tabular">
                    {ongoing && m.end ? `probíhá · do ${formatDayMonth(toDate(m.end))}` : `${formatDayMonth(start)}${m.end ? ` – ${formatDayMonth(toDate(m.end))}` : ''}`}
                  </span>
                </p>
              </motion.li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function subjectLabel(subject?: Subject): string {
  if (!subject) return 'Bez předmětu';
  return subject.code ? `${subject.code} · ${subject.name}` : subject.name;
}
