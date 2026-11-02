import { motion } from 'motion/react';
import { ArrowRight, CalendarDays, Check, Flag, FlaskConical, GraduationCap, ListTodo, MapPin, Zap } from 'lucide-react';
import type { Milestone, ScheduleEvent, Subject } from '../../types';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { formatDayMonth, formatDeadline, formatTime, isSameDay, toDate, toDateKey } from '../../lib/dates';
import { isRequirementComplete, requirementProgress, subjectProgress } from '../../lib/progress';
import { CATEGORY_LABELS } from '../../lib/scheduleTextParser';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { navigateTo } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { agendaForDay, buildingForEvent, openItems, subjectMap, type AgendaItem } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';
import { QuickAdd } from '../common/QuickAdd';
import { Button, Card, Checkbox, Chip, cn, EmptyState, ProgressRing } from '../ui/primitives';

export const MILESTONE_STYLES: Record<Milestone['category'], string> = {
  semester: 'bg-moss/15 text-moss',
  teaching: 'bg-accent-soft text-accent',
  'exam-period': 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  enrollment: 'bg-sand/25 text-clay',
  holiday: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  deadline: 'bg-red-500/12 text-red-700 dark:text-red-300',
  assessment: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  event: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
};

const KIND_SHORT: Record<ScheduleEvent['kind'], string> = {
  lecture: 'Přednáška',
  seminar: 'Seminář',
  exam: 'Zkouška',
  consultation: 'Konzultace',
  personal: '',
  other: 'Výuka',
};

/* ------------------------------------------------------------------ */
/* Pás se statistikami                                                 */
/* ------------------------------------------------------------------ */

export function StatsBand({ stats }: { stats: { value: string; label: string; hint?: string }[] }) {
  return (
    <section className="band-forest grain relative overflow-hidden rounded-[28px] px-5 py-6 sm:px-8 sm:py-7" aria-label="Přehled">
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -top-12 size-56 text-white/[0.06]" aria-hidden>
        <path d="M100 10c40 30 60 70 50 110-8 34-40 60-50 70-10-10-42-36-50-70C40 80 60 40 100 10z" fill="currentColor" />
        <path d="M100 30v150" stroke="currentColor" strokeWidth="3" fill="none" />
      </svg>
      <dl className="relative grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="eyebrow text-[var(--forest-fg)]/65">{s.label}</dt>
            <dd className="mt-1.5 font-display text-[44px] leading-none tabular sm:text-[52px]">{s.value}</dd>
            {s.hint && <dd className="mt-1 text-xs text-[var(--forest-fg)]/70">{s.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Časová osa dne                                                      */
/* ------------------------------------------------------------------ */

export function TodayTimeline({ day, label, targetId, onSelect }: { day: Date; label: string; targetId?: string; onSelect: (event: ScheduleEvent) => void }) {
  const now = useNow(30_000);
  const events = useAppStore((s) => s.events);
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const openEditor = useUiStore((s) => s.openEditor);
  const byId = subjectMap(subjects);
  const items = agendaForDay(day, { events, tasks, requirements }, isRequirementComplete);
  const isToday = isSameDay(day, now);
  const nowIndex = isToday ? items.findIndex((i) => (i.type === 'event' ? i.end : i.at) > now) : -1;

  const renderItem = (item: AgendaItem) => {
    if (item.type === 'event') {
      const e = item.event;
      const past = item.end < now;
      const current = item.at <= now && item.end > now;
      const subject = e.subjectId ? byId.get(e.subjectId) : undefined;
      const study = e.kind !== 'personal';
      const { building, room } = study ? buildingForEvent(e, settings) : { building: undefined, room: undefined };
      const selected = targetId === e.id;
      const dot = subject ? SUBJECT_COLOR_CLASSES[subject.color].dot : e.google?.readOnly ? '' : 'bg-sand';
      return (
        <button
          type="button"
          onClick={() => (study && !past ? onSelect(e) : openEditor({ type: 'event', id: e.id }))}
          className={cn('group flex w-full items-start gap-3 rounded-[18px] px-2.5 py-2 text-left transition-colors', past ? 'opacity-45' : 'hover:bg-surface-2', selected && 'bg-accent-soft hover:bg-accent-soft')}
        >
          <span className="w-11 shrink-0 pt-0.5 text-right text-[12.5px] font-bold leading-tight tabular">
            {e.allDay ? <span className="text-subtle">celý den</span> : formatTime(item.at)}
            {!e.allDay && <span className="block text-[11px] font-medium text-subtle">{formatTime(item.end)}</span>}
          </span>
          <span className={cn('relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-[var(--surface)]', dot, current && 'animate-pulse')} style={!dot && e.google?.color ? { background: e.google.color } : undefined} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{study ? (subject?.name ?? e.title) : e.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              {study && <span>{KIND_SHORT[e.kind]}</span>}
              {(building || e.location) && (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="size-3" aria-hidden />
                  {building ? `${building.name}${room ? ` ${room}` : ''}` : e.location}
                </span>
              )}
              {e.google && <span className="text-subtle">{e.google.calendarName ?? 'Google'}</span>}
            </span>
          </span>
          {current && <Chip className="bg-accent text-accent-fg">teď</Chip>}
          {selected && !current && <Chip className="bg-accent-soft text-accent">cíl cesty</Chip>}
        </button>
      );
    }
    if (item.type === 'task') {
      const t = item.task;
      return (
        <div className="flex items-start gap-3 rounded-[18px] px-2.5 py-2">
          <span className="w-11 shrink-0 pt-0.5 text-right text-[12.5px] font-bold tabular text-subtle">{item.allDay ? '' : formatTime(item.at)}</span>
          <Checkbox checked={t.done} onChange={() => toggleTask(t.id)} label={`Hotovo: ${t.title}`} className="mt-0.5 rounded-full" />
          <button type="button" onClick={() => openEditor({ type: 'task', id: t.id })} className={cn('min-w-0 flex-1 text-left text-[14px] font-semibold', t.done && 'text-subtle line-through')}>
            {t.title}
          </button>
        </div>
      );
    }
    const r = item.requirement;
    const subject = byId.get(r.subjectId);
    return (
      <button type="button" onClick={() => navigateTo('predmety', r.subjectId)} className="flex w-full items-start gap-3 rounded-[18px] px-2.5 py-2 text-left hover:bg-surface-2">
        <span className="w-11 shrink-0 pt-0.5 text-right text-[12.5px] font-bold tabular text-red-700 dark:text-red-300">{formatTime(item.at)}</span>
        <Flag className="mt-1 size-3.5 shrink-0 text-red-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{r.title}</span>
          <span className="text-xs text-muted">Termín · {subject?.code ?? subject?.name}</span>
        </span>
      </button>
    );
  };

  return (
    <Card
      title={label}
      eyebrow={formatDayMonth(day)}
      className="h-full"
      action={
        <Button size="sm" variant="ghost" onClick={() => navigateTo('kalendar')}>
          Kalendář <ArrowRight className="size-3.5" />
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Volný den">
          Rozvrh ze SISu přidáš v Propojení.
        </EmptyState>
      ) : (
        <ol className="relative space-y-0.5 before:absolute before:bottom-4 before:left-[4.15rem] before:top-4 before:w-px before:bg-line">
          {items.map((item, i) => (
            <li key={item.type === 'event' ? item.event.id : item.type === 'task' ? item.task.id : item.requirement.id}>
              {i === nowIndex && nowIndex > 0 && (
                <div className="relative my-1 flex items-center gap-2 pl-[3.6rem]" aria-label="Teď">
                  <span className="size-2 rounded-full bg-clay" />
                  <span className="h-px flex-1 bg-clay/50" />
                  <span className="text-[11px] font-bold text-clay tabular">{formatTime(now)}</span>
                </div>
              )}
              {renderItem(item)}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Úkoly a termíny                                                     */
/* ------------------------------------------------------------------ */

export function TasksCard() {
  const now = useNow(60_000);
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const subjects = useAppStore((s) => s.subjects);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const toggleRequirementDone = useAppStore((s) => s.toggleRequirementDone);
  const openEditor = useUiStore((s) => s.openEditor);
  const byId = subjectMap(subjects);
  const list = openItems(tasks, requirements, now, isRequirementComplete);
  const doneToday = tasks.filter((t) => t.done && t.completedAt && isSameDay(new Date(t.completedAt), now)).length;
  const shown = list.slice(0, 7);

  return (
    <Card
      title={
        <>
          Úkoly <em className="italic text-moss">a termíny</em>
        </>
      }
      eyebrow={doneToday ? `${doneToday} hotovo dnes` : `${list.length} otevřených`}
      className="h-full"
    >
      <QuickAdd />
      {shown.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={ListTodo} title="Čistý stůl">
            Napiš úkol výš – třeba „koupit lítačku do pátku“.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-3 space-y-0.5">
          {shown.map((item) => {
            const subject = item.task?.subjectId ? byId.get(item.task.subjectId) : item.requirement ? byId.get(item.requirement.subjectId) : undefined;
            const urgency = item.due ? deadlineUrgency(item.dueAllDay ? new Date(item.due.getFullYear(), item.due.getMonth(), item.due.getDate(), 23, 59) : item.due, now) : 'none';
            const style = DEADLINE_STYLES[urgency];
            const req = item.requirement;
            const progress = req ? requirementProgress(req) : 0;
            return (
              <motion.li key={item.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-[18px] px-2 py-2 hover:bg-surface-2">
                <Checkbox
                  checked={false}
                  onChange={() => (item.task ? toggleTask(item.task.id) : req && toggleRequirementDone(req.id))}
                  label={`Hotovo: ${item.title}`}
                  className="rounded-full"
                  colorClass="bg-accent"
                />
                <button type="button" onClick={() => (item.task ? openEditor({ type: 'task', id: item.task.id }) : req && navigateTo('predmety', req.subjectId))} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5">
                    {item.task?.priority === 'high' && <Flag className="size-3.5 shrink-0 fill-clay text-clay" aria-label="Důležité" />}
                    <span className="truncate text-[14px] font-semibold">{item.title}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {subject && <span className={cn('font-semibold', SUBJECT_COLOR_CLASSES[subject.color].text)}>{subject.code ?? subject.name}</span>}
                    {req && req.subtasks.length > 0 && (
                      <span className="tabular">
                        {req.subtasks.filter((s) => s.done).length}/{req.subtasks.length} · {Math.round(progress * 100)} %
                      </span>
                    )}
                    {req?.source === 'moodle' && <span className="text-subtle">Moodle</span>}
                    {item.task?.source === 'google' && <span className="text-subtle">Google Úkoly</span>}
                  </span>
                </button>
                {item.due && (
                  <span className={cn('shrink-0 text-right text-[12px] font-bold tabular', style.text)}>
                    {item.dueAllDay ? formatDeadline(item.due, now).replace(/\s\d{1,2}:\d{2}$/, '') : formatDeadline(item.due, now)}
                  </span>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
      {list.length > shown.length && (
        <button type="button" onClick={() => navigateTo('kalendar')} className="mt-2 w-full rounded-full py-2 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
          + {list.length - shown.length} dalších
        </button>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Předměty (prstence)                                                 */
/* ------------------------------------------------------------------ */

export function SubjectsGlance() {
  const subjects = useAppStore((s) => s.subjects);
  const requirements = useAppStore((s) => s.requirements);
  const rows = subjects.map((subject) => ({ subject, progress: subjectProgress(requirements.filter((r) => r.subjectId === subject.id)) }));
  return (
    <Card
      title="Předměty"
      eyebrow="Plnění semestru"
      className="h-full"
      action={
        <Button size="sm" variant="ghost" onClick={() => navigateTo('predmety')}>
          Vše <ArrowRight className="size-3.5" />
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Zatím žádné předměty" />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map(({ subject, progress }) => (
            <li key={subject.id}>
              <button type="button" onClick={() => navigateTo('predmety', subject.id)} className="flex w-full items-center gap-3 rounded-[18px] p-2 text-left transition hover:bg-surface-2">
                <ProgressRing value={progress.ratio} size={46} stroke={5} className={SUBJECT_COLOR_CLASSES[subject.color].text}>
                  <span className="text-[11px] font-bold tabular">{progress.percent}</span>
                </ProgressRing>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold">{subject.code ?? subject.name}</span>
                  <span className="line-clamp-2 text-[11.5px] leading-tight text-muted">{subject.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Harmonogram                                                         */
/* ------------------------------------------------------------------ */

export function MilestonesCard() {
  const now = useNow(60_000);
  const milestones = useAppStore((s) => s.milestones);
  const todayKey = toDateKey(now);
  const list = milestones
    .filter((m) => (m.end ?? m.start).slice(0, 10) >= todayKey)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);

  return (
    <Card title="Harmonogram" eyebrow="Akademický rok" className="h-full">
      {list.length === 0 ? (
        <EmptyState icon={Flag} title="Žádné milníky">
          Vlož harmonogram fakulty v Propojení.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {list.map((m) => {
            const start = toDate(m.start);
            const ongoing = m.start.slice(0, 10) <= todayKey;
            return (
              <li key={m.id} className="flex items-start gap-3">
                <span className="w-12 shrink-0 text-center">
                  <span className="block font-display text-[24px] leading-none tabular">{start.getDate()}</span>
                  <span className="text-[10.5px] font-bold uppercase tracking-wide text-subtle">{start.toLocaleDateString('cs-CZ', { month: 'short' }).replace('.', '')}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold" title={m.title}>
                    {m.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Chip className={MILESTONE_STYLES[m.category]}>{CATEGORY_LABELS[m.category]}</Chip>
                    {ongoing && m.end ? <span>probíhá · do {formatDayMonth(toDate(m.end))}</span> : m.end ? <span>do {formatDayMonth(toDate(m.end))}</span> : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Uvítání                                                             */
/* ------------------------------------------------------------------ */

export function WelcomeCard() {
  const mode = useAppStore((s) => s.settings.mode);
  const dismissed = useAppStore((s) => s.meta.welcomeDismissed);
  const dismiss = useAppStore((s) => s.dismissWelcome);
  const setMode = useAppStore((s) => s.setMode);
  if (mode !== 'demo' || dismissed) return null;
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-4 rounded-[26px] p-5 sm:flex-row sm:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-sand/25 text-clay">
        <FlaskConical className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[24px] leading-tight">
          Tohle je <em className="text-moss">ukázka</em>
        </p>
        <p className="mt-0.5 text-[13.5px] text-muted">Simulovaná doprava, Moodle i Google. Klikej a zkoušej – nic se nikam neodešle.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Check} onClick={dismiss}>
          Rozumím
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Zap}
          onClick={() => {
            setMode('live');
            dismiss();
            navigateTo('propojeni');
          }}
        >
          Začít naostro
        </Button>
      </div>
    </motion.section>
  );
}

export function subjectLabel(subject?: Subject): string {
  if (!subject) return 'Bez předmětu';
  return subject.code ? `${subject.code} · ${subject.name}` : subject.name;
}
