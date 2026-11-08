/**
 * Den v kostce – jen praktické věci: kam a v kolik jdu (budova, učebna),
 * kdy a odkud mi to jede, co mám k dnešním předmětům. Večer (když je výuka
 * hotová) výhled na další den a úkoly na nejbližší dny.
 */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Building2, ListTodo, MapPin, MonitorPlay, Moon, Sun } from 'lucide-react';
import type { Building, Itinerary, RideLeg, ScheduleEvent, Subject } from '../../types';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { dayPhrase, vTime, addDays, formatDayMonth, formatTime, formatWeekdayShort, isSameDay, plural, startOfDay } from '../../lib/dates';
import { buildTaskRows, dueMoment, type TaskRow } from '../../lib/taskList';
import { rideLegs } from '../../lib/transitPlanner';
import { planTripTo } from '../../store/journeyStore';
import { navigateTo } from '../../hooks/useAppShell';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent, subjectMap } from '../../store/selectors';
import { cn } from '../ui/primitives';
import { LineBadge } from '../transit/TransitBits';
import { KIND_LABEL } from '../transit/transitStatus';
import { countdownStart } from '../../lib/transitWindow';
import { useTripStore } from '../../store/tripStore';
import { appNow } from '../../store/clockStore';

const DAY_PREP = ['V neděli', 'V pondělí', 'V úterý', 'Ve středu', 'Ve čtvrtek', 'V pátek', 'V sobotu'];

function dayLabel(day: Date, now: Date): string {
  if (isSameDay(day, now)) return 'Dnes';
  if (isSameDay(day, addDays(now, 1))) return 'Zítra';
  return DAY_PREP[day.getDay()];
}

const isStudy = (e: ScheduleEvent) => e.kind !== 'personal' && !e.allDay && !e.google?.readOnly;

function Departure({ itinerary }: { itinerary: Itinerary }) {
  const ride = rideLegs(itinerary)[0] as RideLeg | undefined;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
      <span className="font-bold">Vyrazte {vTime(new Date(itinerary.leaveAt))}</span>
      {ride ? (
        <>
          <span className="opacity-60">·</span>
          <LineBadge ride={ride} size="sm" />
          <span className="opacity-90">
            ze zastávky <strong className="font-semibold">{ride.fromStop}</strong>
            {ride.platform ? ` (nástupiště ${ride.platform})` : ''} {vTime(new Date(ride.predictedDeparture))}
          </span>
        </>
      ) : (
        <span className="opacity-90">pěšky</span>
      )}
    </p>
  );
}

function ClassRow({ event, subject, building, room, tasks, now, itinerary }: { event: ScheduleEvent; subject?: Subject; building?: Building; room?: string; tasks: TaskRow[]; now: Date; itinerary?: Itinerary | null }) {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const current = start <= now && end > now;
  const place = event.online ? 'online' : building ? building.name : event.location;
  return (
    <li className={cn('relative rounded-[20px] px-4 py-3', current ? 'bg-white/14 ring-1 ring-inset ring-white/25' : 'bg-white/[0.07]')}>
      <div className="flex items-start gap-3">
        <span className="w-12 shrink-0 pt-0.5 text-[15px] font-bold leading-tight tabular">
          {formatTime(start)}
          <span className="block text-[11.5px] font-medium opacity-60">{formatTime(end)}</span>
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => subject && navigateTo('predmety', subject.id)} className="block max-w-full text-left">
            <span className="flex items-center gap-2">
              {subject && <span className={cn('size-2 shrink-0 rounded-full', SUBJECT_COLOR_CLASSES[subject.color].dot)} />}
              <span className="truncate text-[15.5px] font-semibold">{subject?.name ?? event.title}</span>
            </span>
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] opacity-85">
            <span>{KIND_LABEL[event.kind]}</span>
            {place && (
              <span className="inline-flex items-center gap-1">
                {event.online ? <MonitorPlay className="size-3.5" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />}
                {place}
                {room && <strong className="font-bold">· učebna {room}</strong>}
              </span>
            )}
            {current && <span className="rounded-full bg-[#e7d6b5] px-2 py-px text-[11px] font-black text-[#2b3a2c]">právě probíhá</span>}
          </p>
          {building && !event.online && <p className="text-[12px] opacity-60">{building.address}</p>}
          {itinerary && !current && <Departure itinerary={itinerary} />}
          {tasks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {tasks.slice(0, 3).map((t) => (
                <li key={t.key} className="flex items-start gap-2 text-[13px]">
                  <ListTodo className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 flex-1">{t.title}</span>
                  {t.due && <span className={cn('shrink-0 text-[12px] font-bold tabular', dueMoment(t) < now.getTime() ? 'text-[#ffb4a2]' : 'opacity-75')}>{dueText(t, now)}</span>}
                </li>
              ))}
              {tasks.length > 3 && <li className="pl-5 text-[12px] opacity-70">a další {tasks.length - 3}</li>}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function dueText(t: TaskRow, now: Date): string {
  if (!t.due) return '';
  if (dueMoment(t) < now.getTime()) return 'po termínu';
  const day = isSameDay(t.due, now) ? 'dnes' : isSameDay(t.due, addDays(now, 1)) ? 'zítra' : `${formatWeekdayShort(t.due)} ${formatDayMonth(t.due)}`;
  return t.dueAllDay ? day : `${day} ${formatTime(t.due)}`;
}

/** Kdy a kde se ukáže doprava na další výuku + možnost naplánovat cestu hned. */
function TransitHint({ event }: { event: ScheduleEvent }) {
  const settings = useAppStore((s) => s.settings);
  const events = useVisibleEvents();
  const { building } = buildingForEvent(event, settings);
  if (!building || event.online) return null;
  const chosen = useTripStore((s) => s.byEvent[event.id]);
  const start = new Date(event.start);
  const from = countdownStart(event, events, chosen?.itinerary);
  const arrive = new Date(start.getTime() - settings.bufferMinutes * 60_000);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] bg-white/[0.07] px-4 py-3">
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug opacity-90">
        Odpočet, kdy vyrazit, začne na hlavní stránce {dayPhrase(from, appNow())} {vTime(from)}.
      </p>
      <button type="button" onClick={() => planTripTo(building.name, building.coords, building.address, arrive)} className="shrink-0 rounded-full bg-[#e7d6b5] px-3.5 py-1.5 text-[13px] font-bold text-[#1d3a2a] hover:brightness-105">
        Naplánovat cestu
      </button>
    </div>
  );
}

export function DayBrief({ now, target, itinerary }: { now: Date; target: ScheduleEvent | null; itinerary: Itinerary | null }) {
  const events = useVisibleEvents();
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const byId = useMemo(() => subjectMap(subjects), [subjects]);
  const minute = Math.floor(now.getTime() / 60_000);

  const { mode, day, classes } = useMemo(() => {
    const t = new Date(minute * 60_000);
    const study = events.filter(isStudy);
    const todayLeft = study.filter((e) => isSameDay(new Date(e.start), t) && new Date(e.end) > t).sort((a, b) => a.start.localeCompare(b.start));
    if (todayLeft.length > 0) return { mode: 'today' as const, day: t, classes: todayLeft };
    for (let i = 1; i <= 4; i++) {
      const d = addDays(startOfDay(t), i);
      const list = study.filter((e) => isSameDay(new Date(e.start), d)).sort((a, b) => a.start.localeCompare(b.start));
      if (list.length > 0) return { mode: 'ahead' as const, day: d, classes: list };
    }
    return { mode: 'free' as const, day: addDays(startOfDay(t), 1), classes: [] as ScheduleEvent[] };
  }, [events, minute]);

  const rows = useMemo(() => buildTaskRows(tasks, requirements, new Date(minute * 60_000)), [tasks, requirements, minute]);

  const forClass = (e: ScheduleEvent) => {
    if (!e.subjectId) return [];
    const horizon = new Date(e.start).getTime() + 7 * 86_400_000;
    return rows.filter((r) => r.subjectId === e.subjectId && (r.due ? dueMoment(r) <= horizon : r.kind === 'task'));
  };
  const classSubjects = new Set(classes.map((c) => c.subjectId).filter(Boolean));
  void classSubjects;
  // Dnešek a zítřek ukazuje výrazně karta Termíny nahoře – tady jen to, co přijde potom.
  const ahead = mode === 'today' ? [] : rows.filter((r) => r.due && dueMoment(r) >= now.getTime() && startOfDay(r.due) > addDays(startOfDay(now), 1) && startOfDay(r.due) <= addDays(startOfDay(now), 4));
  const aheadByDay = new Map<string, TaskRow[]>();
  for (const r of ahead) {
    const key = startOfDay(r.due!).toISOString();
    aheadByDay.set(key, [...(aheadByDay.get(key) ?? []), r]);
  }

  const evening = mode !== 'today';
  const title = mode === 'today' ? 'Dnes vás čeká' : mode === 'ahead' ? `${dayLabel(day, now)} vás čeká` : 'Pár dní bez výuky';

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="band-forest grain relative overflow-hidden rounded-[28px] px-4 py-5 text-[var(--forest-fg)] sm:px-7 sm:py-6"
      data-tour="brief"
      aria-label="Den v kostce"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 font-display text-[28px] leading-none sm:text-[32px]">
          {evening ? <Moon className="size-5 opacity-80" aria-hidden /> : <Sun className="size-5 opacity-80" aria-hidden />}
          {title}
        </h2>
        <p className="text-[12.5px] font-semibold opacity-70">
          {mode === 'today' ? `${classes.length} ${plural(classes.length, ['hodina', 'hodiny', 'hodin'])} ještě dnes` : mode === 'ahead' ? `${formatWeekdayShort(day)} ${formatDayMonth(day)}` : 'další výuka později'}
        </p>
      </div>

      <div className={cn('mt-4 grid grid-cols-[minmax(0,1fr)] gap-4', evening && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
        {classes.length > 0 && (
          <ul className="min-w-0 space-y-2">
            {classes.map((e) => {
              const { building, room } = buildingForEvent(e, settings);
              return <ClassRow key={e.id} event={e} subject={e.subjectId ? byId.get(e.subjectId) : undefined} building={building} room={room} tasks={mode === 'today' ? forClass(e) : []} now={now} itinerary={target?.id === e.id ? itinerary : null} />;
            })}
          </ul>
        )}

        {evening && (
          <div className="min-w-0 rounded-[20px] bg-white/[0.07] px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.12em] opacity-75">
              <ListTodo className="size-4" aria-hidden /> Další termíny
            </p>
            {aheadByDay.size === 0 ? (
              <p className="mt-2 text-[14px] opacity-85">V dalších dnech žádný termín.</p>
            ) : (
              <div className="mt-2 space-y-2.5">
                {[...aheadByDay.entries()].map(([key, list]) => {
                  const d = new Date(key);
                  return (
                    <div key={key}>
                      <p className="text-[12px] font-bold opacity-70">{isSameDay(d, now) ? 'Ještě dnes' : isSameDay(d, addDays(now, 1)) ? 'Zítra' : `${formatWeekdayShort(d)} ${formatDayMonth(d)}`}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {list.map((r) => {
                          const subject = r.subjectId ? byId.get(r.subjectId) : undefined;
                          return (
                            <li key={r.key} className="flex items-start gap-2 text-[13.5px]">
                              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', subject ? SUBJECT_COLOR_CLASSES[subject.color].dot : 'bg-white/50')} />
                              <span className="min-w-0 flex-1">
                                {r.title}
                                {subject && <span className="opacity-60"> · {subject.code ?? subject.name}</span>}
                              </span>
                              {!r.dueAllDay && r.due && <span className="shrink-0 text-[12px] opacity-70 tabular">{formatTime(r.due)}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {mode === 'ahead' && classes[0] && <TransitHint event={classes[0]} />}
      {classes.length === 0 && mode === 'free' && (
        <p className="mt-3 flex items-center gap-2 px-1 text-[13.5px] opacity-80">
          <Building2 className="size-4" aria-hidden /> V nejbližších dnech nemáte v rozvrhu žádnou výuku.
        </p>
      )}
    </motion.section>
  );
}
