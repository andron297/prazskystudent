import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarRange, ChevronLeft, ChevronRight, Clock, Flag, MapPin, Plus, ScrollText, Trash } from 'lucide-react';
import type { Milestone, MilestoneCategory, Requirement, Subject, Task } from '../../types';
import { milestoneToCalendarItem, requirementToCalendarItem, type CalendarItem } from '../../lib/calendarExport';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import {
  academicYearStart,
  addDays,
  calendarDayDiff,
  formatDayMonth,
  formatDeadline,
  formatMonthShort,
  formatMonthYear,
  formatRelative,
  formatTime,
  formatWeekdayShort,
  isSameDay,
  startOfDay,
  startOfWeek,
  toDate,
  toDateKey,
  capitalize,
  isDateKey,
} from '../../lib/dates';
import { uid } from '../../lib/id';
import { isRequirementComplete } from '../../lib/progress';
import { CATEGORY_LABELS } from '../../lib/scheduleTextParser';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { navigateTo } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent, subjectMap } from '../../store/selectors';
import { toast, useUiStore } from '../../store/uiStore';
import { AddToCalendar } from '../common/AddToCalendar';
import { MILESTONE_STYLES } from '../dashboard/DashboardCards';
import { Modal } from '../ui/overlays';
import { Button, Card, Checkbox, Chip, cn, EmptyState, Field, IconButton, Segmented, Select, TextInput, Toggle } from '../ui/primitives';


const BAR_COLORS: Record<MilestoneCategory, string> = {
  semester: 'bg-moss/70',
  teaching: 'bg-accent/75',
  'exam-period': 'bg-rose-700/65',
  enrollment: 'bg-sand',
  holiday: 'bg-emerald-600/55',
  deadline: 'bg-red-600',
  assessment: 'bg-clay',
  event: 'bg-sky-600/70',
};

const LANES: { label: string; categories: MilestoneCategory[] }[] = [
  { label: 'Výuka', categories: ['teaching', 'semester'] },
  { label: 'Zkouškové', categories: ['exam-period'] },
  { label: 'Zápis a volno', categories: ['enrollment', 'holiday', 'event'] },
];

/* ------------------------------------------------------------------ */
/* Časová osa semestru                                                 */
/* ------------------------------------------------------------------ */

function SemesterTimeline({ milestones, requirements, subjects }: { milestones: Milestone[]; requirements: Requirement[]; subjects: Map<string, Subject> }) {
  const now = useNow(60_000);
  const scroller = useRef<HTMLDivElement>(null);
  const ay = academicYearStart(now);
  const rangeStart = new Date(ay, 8, 1);
  const rangeEnd = new Date(ay + 1, 8, 30);
  const days = calendarDayDiff(rangeEnd, rangeStart) + 1;
  const px = 4.2;
  const width = Math.round(days * px);
  const x = (d: Date) => Math.max(0, Math.min(width, calendarDayDiff(d, rangeStart) * px));
  const months = Array.from({ length: 13 }, (_, i) => new Date(ay, 8 + i, 1));
  const todayX = x(now);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2);
  }, [todayX]);

  const markers = [
    ...requirements
      .filter((r) => r.deadline)
      .map((r) => ({ id: r.id, date: new Date(r.deadline!), title: r.title, subject: subjects.get(r.subjectId), done: isRequirementComplete(r), kind: 'req' as const })),
    ...milestones
      .filter((m) => !m.end && m.category !== 'holiday')
      .map((m) => ({ id: m.id, date: toDate(m.start), title: m.title, subject: undefined, done: false, kind: 'ms' as const })),
  ];

  return (
    <Card title="Časová osa akademického roku" icon={CalendarRange} action={<span className="text-xs text-muted">{ay}/{ay + 1}</span>} padded={false} className="overflow-hidden">
      <div className="flex">
        <div className="hidden w-28 shrink-0 border-r border-line pt-8 sm:block">
          {[...LANES.map((l) => l.label), 'Termíny'].map((label) => (
            <div key={label} className="flex h-10 items-center px-4 text-xs font-medium text-muted">
              {label}
            </div>
          ))}
        </div>
        <div ref={scroller} className="scrollbar-thin min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width, height: 32 + 4 * 40 + 30 }}>
            {months.map((m) => (
              <div key={m.toISOString()} className="absolute top-0 h-full border-l border-line" style={{ left: x(m) }}>
                <span className="ml-1.5 mt-2 block text-[11px] font-medium capitalize text-subtle">
                  {formatMonthShort(m)}
                  {m.getMonth() === 0 ? ` ${m.getFullYear()}` : ''}
                </span>
              </div>
            ))}
            {LANES.map((lane, laneIndex) =>
              milestones
                .filter((m) => lane.categories.includes(m.category) && (m.end || m.category === 'holiday'))
                .map((m) => {
                  const start = toDate(m.start);
                  const end = m.end ? toDate(m.end) : start;
                  const left = x(start);
                  const w = Math.max(6, x(addDays(end, 1)) - left);
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, scaleX: 0.6 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      style={{ left, width: w, top: 32 + laneIndex * 40 + 8, originX: 0 }}
                      className={cn('absolute h-6 overflow-hidden rounded-lg px-2 text-[11px] font-medium leading-6 text-white shadow-sm', BAR_COLORS[m.category])}
                      title={`${m.title}: ${formatDayMonth(start)}${m.end ? ` – ${formatDayMonth(end)}` : ''}`}
                    >
                      <span className="truncate">{w > 60 ? m.title : ''}</span>
                    </motion.div>
                  );
                }),
            )}
            {markers.map((mk) => (
              <button
                key={mk.id}
                type="button"
                onClick={() => mk.kind === 'req' && mk.subject && navigateTo('predmety', mk.subject.id)}
                className={cn(
                  'absolute size-3.5 -translate-x-1/2 rounded-full ring-2 ring-[var(--surface)] transition-transform hover:scale-150',
                  mk.done ? 'bg-zinc-400' : mk.subject ? SUBJECT_COLOR_CLASSES[mk.subject.color].dot : 'bg-red-500',
                )}
                style={{ left: x(mk.date), top: 32 + 3 * 40 + 13 }}
                title={`${mk.title} – ${formatDayMonth(mk.date)}${mk.subject ? ` (${mk.subject.code ?? mk.subject.name})` : ''}`}
                aria-label={`${mk.title}, ${formatDayMonth(mk.date)}`}
              />
            ))}
            <div className="absolute top-7 w-0.5 rounded-full bg-accent" style={{ left: todayX, bottom: 18 }}>
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg">dnes</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11.5px] text-muted">
        {(['teaching', 'exam-period', 'holiday', 'enrollment'] as MilestoneCategory[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', BAR_COLORS[c])} />
            {CATEGORY_LABELS[c]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" /> Termíny (barva předmětu)
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

type AgendaItem =
  | { kind: 'milestone'; id: string; date: Date; end?: Date; milestone: Milestone }
  | { kind: 'deadline'; id: string; date: Date; requirement: Requirement; subject?: Subject }
  | { kind: 'task'; id: string; date: Date; task: Task; allDay: boolean; subject?: Subject };

function Agenda({ items, now, showPast }: { items: AgendaItem[]; now: Date; showPast: boolean }) {
  const removeMilestone = useAppStore((s) => s.removeMilestone);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const openEditor = useUiStore((s) => s.openEditor);
  const subjects = useAppStore((s) => s.subjects);
  const byId = subjectMap(subjects);
  const today = startOfDay(now);
  const visible = items.filter((i) => showPast || (i.kind === 'milestone' ? (i.end ?? i.date) >= today : i.kind === 'task' ? !i.task.done || i.date >= addDays(today, -1) : i.date >= addDays(today, -1)));
  const groups = new Map<string, AgendaItem[]>();
  for (const item of visible) {
    const key = formatMonthYear(item.date);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  if (visible.length === 0) {
    return (
      <EmptyState icon={Flag} title="Nic k zobrazení">
        Vlož harmonogram fakulty nebo přidej milník.
      </EmptyState>
    );
  }
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([month, list]) => (
        <section key={month}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subtle">{month}</h3>
          <ul className="space-y-1">
            {list.map((item) => {
              if (item.kind === 'task') {
                const t = item.task;
                const urgency = deadlineUrgency(item.allDay ? new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate(), 23, 59) : item.date, now, t.done);
                return (
                  <li key={`task-${item.id}`} className="group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
                    <div className={cn('grid w-11 shrink-0 place-items-center rounded-xl py-1 text-center ring-1 ring-inset ring-line', isSameDay(item.date, now) ? 'bg-accent text-accent-fg' : 'bg-surface')}>
                      <span className="text-[15px] font-semibold leading-none tabular">{item.date.getDate()}</span>
                      <span className="text-[10px] uppercase leading-tight opacity-80">{formatWeekdayShort(item.date)}</span>
                    </div>
                    <Checkbox checked={t.done} onChange={() => toggleTask(t.id)} label={`Hotovo: ${t.title}`} className="rounded-full" />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEditor({ type: 'task', id: t.id })}>
                      <span className={cn('block truncate text-[13.5px] font-medium', t.done && 'text-subtle line-through')}>{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Chip className={DEADLINE_STYLES[urgency].chip}>{t.done ? 'Hotovo' : 'Úkol'}</Chip>
                        {item.subject && <span className="truncate">{item.subject.code ?? item.subject.name}</span>}
                        {!item.allDay && <span className="tabular">{formatTime(item.date)}</span>}
                        {t.source === 'google' && <span className="text-subtle">Google Úkoly</span>}
                      </span>
                    </button>
                  </li>
                );
              }
              const isMs = item.kind === 'milestone';
              const calendarItem: CalendarItem | null = isMs
                ? milestoneToCalendarItem(item.milestone, item.milestone.subjectId ? byId.get(item.milestone.subjectId) : undefined)
                : requirementToCalendarItem(item.requirement, item.subject);
              const done = !isMs && isRequirementComplete(item.requirement);
              const urgency = !isMs ? deadlineUrgency(item.date, now, done) : null;
              const ongoing = isMs && item.end && item.date <= now && item.end >= today;
              return (
                <li key={`${item.kind}-${item.id}`} className={cn('group flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2', item.date < today && !ongoing && 'opacity-60')}>
                  <div className={cn('grid w-11 shrink-0 place-items-center rounded-xl py-1 text-center ring-1 ring-inset ring-line', isSameDay(item.date, now) ? 'bg-accent text-accent-fg' : 'bg-surface')}>
                    <span className="text-[15px] font-semibold leading-none tabular">{item.date.getDate()}</span>
                    <span className="text-[10px] uppercase leading-tight opacity-80">{formatWeekdayShort(item.date)}</span>
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => (!isMs && item.subject ? navigateTo('predmety', item.subject.id) : undefined)}
                  >
                    <span className={cn('block truncate text-[13.5px] font-medium', done && 'line-through')}>{isMs ? item.milestone.title : item.requirement.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {isMs ? (
                        <>
                          <Chip className={MILESTONE_STYLES[item.milestone.category]}>{CATEGORY_LABELS[item.milestone.category]}</Chip>
                          <span className="tabular">
                            {item.end ? `${formatDayMonth(item.date)} – ${formatDayMonth(item.end)}` : item.milestone.allDay ? formatDayMonth(item.date) : `${formatDayMonth(item.date)} ${formatTime(item.date)}`}
                          </span>
                          {ongoing && <Chip className="bg-accent-soft text-accent">probíhá</Chip>}
                        </>
                      ) : (
                        <>
                          {urgency && <Chip className={DEADLINE_STYLES[urgency].chip}>{DEADLINE_STYLES[urgency].label}</Chip>}
                          {item.subject && <span className="truncate">{item.subject.code ?? item.subject.name}</span>}
                          <span className="tabular">{formatDeadline(item.date, now)}</span>
                        </>
                      )}
                    </span>
                  </button>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">{formatRelative(item.date, now)}</span>
                  {calendarItem && <AddToCalendar items={[calendarItem]} filename={`stihnu-${toDateKey(item.date)}`} compact />}
                  {isMs && (
                    <IconButton
                      icon={Trash}
                      label="Smazat milník"
                      size="sm"
                      tone="danger"
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={() => {
                        removeMilestone(item.milestone.id);
                        toast.info('Milník smazán.');
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Týdenní rozvrh                                                      */
/* ------------------------------------------------------------------ */

function WeekSchedule() {
  const now = useNow(60_000);
  const events = useAppStore((s) => s.events);
  const tasks = useAppStore((s) => s.tasks);
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const openEditor = useUiStore((s) => s.openEditor);
  const byId = subjectMap(subjects);
  const [offset, setOffset] = useState(0);
  const monday = addDays(startOfWeek(now), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const label = offset === 0 ? 'Tento týden' : offset === 1 ? 'Příští týden' : offset === -1 ? 'Minulý týden' : `Týden od ${formatDayMonth(monday)}`;

  return (
    <Card
      title={label}
      icon={Clock}
      action={
        <span className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Předchozí týden" size="sm" onClick={() => setOffset((o) => o - 1)} />
          {offset !== 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
              Dnes
            </Button>
          )}
          <IconButton icon={ChevronRight} label="Další týden" size="sm" onClick={() => setOffset((o) => o + 1)} />
        </span>
      }
    >
      <div className="space-y-3">
        {days.map((day) => {
          const list = events
            .filter((e) => (e.allDay ? new Date(e.start) <= day && new Date(e.end) > day : isSameDay(new Date(e.start), day)))
            .sort((a, b) => Number(Boolean(b.allDay)) - Number(Boolean(a.allDay)) || a.start.localeCompare(b.start));
          const dayTasks = tasks.filter((t) => t.due && isSameDay(toDate(t.due), day));
          if (list.length === 0 && dayTasks.length === 0 && day.getDay() % 6 === 0) return null;
          const isToday = isSameDay(day, now);
          return (
            <div key={toDateKey(day)}>
              <p className={cn('mb-1 text-[12px] font-semibold uppercase tracking-wide', isToday ? 'text-accent' : 'text-subtle')}>
                {capitalize(formatWeekdayShort(day))} {formatDayMonth(day)} {isToday && '· dnes'}
              </p>
              {list.length === 0 && dayTasks.length === 0 ? (
                <p className="text-xs text-subtle">Volno</p>
              ) : (
                <ul className="space-y-1">
                  {list.map((e) => {
                    const subject = e.subjectId ? byId.get(e.subjectId) : undefined;
                    const personal = e.kind === 'personal';
                    const { building, room } = personal ? { building: undefined, room: undefined } : buildingForEvent(e, settings);
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => (personal ? openEditor({ type: 'event', id: e.id }) : subject && navigateTo('predmety', subject.id))}
                          className="flex w-full items-center gap-2.5 rounded-xl bg-surface-2/60 px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                        >
                          <span
                            className={cn('h-7 w-1 shrink-0 rounded-full', subject ? SUBJECT_COLOR_CLASSES[subject.color].bar : personal && !e.google?.color ? 'bg-sand' : 'bg-zinc-400')}
                            style={!subject && e.google?.color ? { background: e.google.color } : undefined}
                          />
                          <span className="w-11 shrink-0 text-xs font-semibold text-muted tabular">{e.allDay ? 'den' : formatTime(new Date(e.start))}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{personal ? e.title : (subject?.name ?? e.title)}</span>
                          <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:flex">
                            {(building || e.location) && <MapPin className="size-3" aria-hidden />}
                            {building ? `${building.name}${room ? ` ${room}` : ''}` : (e.location ?? e.google?.calendarName ?? '')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {dayTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px]">
                      <Checkbox checked={t.done} onChange={() => toggleTask(t.id)} label={`Hotovo: ${t.title}`} className="rounded-full" />
                      <button type="button" onClick={() => openEditor({ type: 'task', id: t.id })} className={cn('min-w-0 flex-1 truncate text-left font-medium', t.done && 'text-subtle line-through')}>
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Editor milníku                                                      */
/* ------------------------------------------------------------------ */

function MilestoneEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addMilestones = useAppStore((s) => s.addMilestones);
  const subjects = useAppStore((s) => s.subjects);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MilestoneCategory>('deadline');
  const [start, setStart] = useState(toDateKey(new Date()));
  const [end, setEnd] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [range, setRange] = useState(false);

  const save = () => {
    if (!title.trim() || !start) return;
    addMilestones([
      {
        id: uid('ms'),
        title: title.trim(),
        category,
        start,
        end: range && end && end >= start ? end : undefined,
        allDay: true,
        subjectId: subjectId || undefined,
        source: 'manual',
      },
    ]);
    toast.success('Milník přidán do harmonogramu.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nový milník"
      icon={Flag}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            Přidat
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Název" className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Zápočtový test – Statistika" />
        </Field>
        <Field label="Kategorie">
          <Select value={category} onChange={(e) => setCategory(e.target.value as MilestoneCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Předmět (nepovinné)">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={range ? 'Od' : 'Datum'}>
          <TextInput type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        {range && (
          <Field label="Do (včetně)">
            <TextInput type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <Toggle checked={range} onChange={setRange} label="Vícedenní období" description="Např. zkouškové období nebo prázdniny." />
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Pohled                                                              */
/* ------------------------------------------------------------------ */

export function CalendarView() {
  const now = useNow(60_000);
  const milestones = useAppStore((s) => s.milestones);
  const requirements = useAppStore((s) => s.requirements);
  const tasks = useAppStore((s) => s.tasks);
  const subjects = useAppStore((s) => s.subjects);
  const openConnect = useUiStore((s) => s.openConnect);
  const openEditor = useUiStore((s) => s.openEditor);
  const [filter, setFilter] = useState<'all' | 'harmonogram' | 'deadlines' | 'tasks'>('all');
  const [showPast, setShowPast] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const byId = useMemo(() => subjectMap(subjects), [subjects]);

  const items = useMemo<AgendaItem[]>(() => {
    const list: AgendaItem[] = [];
    if (filter === 'all' || filter === 'harmonogram') {
      for (const m of milestones) {
        list.push({ kind: 'milestone', id: m.id, date: toDate(m.start), end: m.end ? toDate(m.end) : undefined, milestone: m });
      }
    }
    if (filter === 'all' || filter === 'deadlines') {
      for (const r of requirements) {
        if (r.deadline) list.push({ kind: 'deadline', id: r.id, date: new Date(r.deadline), requirement: r, subject: byId.get(r.subjectId) });
      }
    }
    if (filter === 'all' || filter === 'tasks') {
      for (const t of tasks) {
        if (t.due) list.push({ kind: 'task', id: t.id, date: toDate(t.due), task: t, allDay: isDateKey(t.due), subject: t.subjectId ? byId.get(t.subjectId) : undefined });
      }
    }
    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [milestones, requirements, tasks, filter, byId]);

  const exportItems = useMemo(() => {
    const today = startOfDay(now);
    return items
      .filter((i) => i.kind !== 'task' && (i.kind === 'milestone' ? (i.end ?? i.date) >= today : i.date >= today))
      .map((i) => (i.kind === 'milestone' ? milestoneToCalendarItem(i.milestone, i.milestone.subjectId ? byId.get(i.milestone.subjectId) : undefined) : i.kind === 'deadline' ? requirementToCalendarItem(i.requirement, i.subject) : null))
      .filter((x): x is CalendarItem => Boolean(x));
  }, [items, now, byId]);

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-[32px] bg-forest px-6 py-8 text-white sm:px-10 sm:py-11">
        <img src="/images/mist-1200.webp" alt="" className="absolute inset-0 size-full object-cover opacity-75" />
        <div className="photo-scrim absolute inset-0" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-white/75">Výuka · termíny · úkoly · volno</p>
            <h1 className="mt-2 font-display text-[48px] leading-[0.95] sm:text-[62px]">
              Kalendář <em className="text-[#e7d6b5]">a harmonogram</em>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="sand" icon={Plus} onClick={() => openEditor({ type: 'event' })}>
              Událost
            </Button>
            <Button variant="glass" icon={Plus} onClick={() => openEditor({ type: 'task' })}>
              Úkol
            </Button>
            <Button variant="glass" icon={ScrollText} onClick={() => openConnect('parser')} title="Harmonogram akademického roku – vlož text nebo nahraj PDF">
              Harmonogram (PDF)
            </Button>
            <Button
              variant="glass"
              icon={Flag}
              onClick={() => {
                setEditorKey((k) => k + 1);
                setEditorOpen(true);
              }}
            >
              Milník
            </Button>
          </div>
        </div>
      </header>

      <SemesterTimeline milestones={milestones} requirements={requirements} subjects={byId} />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card
          className="min-w-0 lg:col-span-7"
          title="Agenda"
          icon={Flag}
          action={<AddToCalendar items={exportItems} filename="stihnu-harmonogram" label={`Export (${exportItems.length})`} compact />}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Vše' },
                { value: 'deadlines', label: 'Termíny' },
                { value: 'tasks', label: 'Úkoly' },
                { value: 'harmonogram', label: 'Harmonogram' },
              ]}
            />
            <Toggle checked={showPast} onChange={setShowPast} label={<span className="text-[13px]">Proběhlé</span>} />
          </div>
          <Agenda items={items} now={now} showPast={showPast} />
        </Card>
        <div className="min-w-0 lg:col-span-5">
          <WeekSchedule />
        </div>
      </div>
      <MilestoneEditor key={editorKey} open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  );
}

