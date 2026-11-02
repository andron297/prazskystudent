import type { Building, Requirement, ScheduleEvent, Settings, Subject, Task } from '../types';
import { isDateKey, toDate } from '../lib/dates';
import { resolveBuilding } from '../lib/buildings';

export function subjectMap(subjects: Subject[]): Map<string, Subject> {
  return new Map(subjects.map((s) => [s.id, s]));
}

export function buildingForEvent(event: ScheduleEvent, settings: Settings): { building?: Building; room?: string } {
  if (event.buildingId) {
    const building = settings.buildings.find((b) => b.id === event.buildingId);
    if (building) return { building, room: event.room };
  }
  const match = resolveBuilding(event.location, settings.buildings, settings.locationAliases);
  return { building: match.building, room: event.room ?? match.room };
}

/** Událost, na kterou má smysl plánovat MHD (výuka, nebo osobní událost s budovou). */
export function isTransitTarget(e: ScheduleEvent): boolean {
  if (e.allDay || e.google?.readOnly) return false;
  if (e.kind === 'personal') return Boolean(e.buildingId);
  return true;
}

/** Další událost (začíná po `now`) a právě probíhající událost. */
export function upcomingEvents(events: ScheduleEvent[], now: Date): { current?: ScheduleEvent; next?: ScheduleEvent } {
  const t = now.getTime();
  let current: ScheduleEvent | undefined;
  let next: ScheduleEvent | undefined;
  for (const e of events) {
    if (!isTransitTarget(e)) continue;
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    if (start <= t && end > t && !current) current = e;
    if (start > t && (!next || start < new Date(next.start).getTime())) next = e;
  }
  return { current, next };
}

export function upcomingDeadlines(requirements: Requirement[], now: Date, isDone: (r: Requirement) => boolean, limit = 6): Requirement[] {
  const horizon = now.getTime() - 24 * 3_600_000;
  return requirements
    .filter((r) => r.deadline && new Date(r.deadline).getTime() >= horizon && !isDone(r))
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Agenda dne a úkoly                                                  */
/* ------------------------------------------------------------------ */

export type AgendaItem =
  | { type: 'event'; at: Date; end: Date; event: ScheduleEvent }
  | { type: 'task'; at: Date; task: Task; allDay: boolean }
  | { type: 'deadline'; at: Date; requirement: Requirement };

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Vše, co se týká daného dne: výuka, události, úkoly a termíny. */
export function agendaForDay(day: Date, data: { events: ScheduleEvent[]; tasks: Task[]; requirements: Requirement[] }, isDone: (r: Requirement) => boolean): AgendaItem[] {
  const items: AgendaItem[] = [];
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 86_400_000;
  for (const e of data.events) {
    const start = new Date(e.start);
    const end = new Date(e.end);
    if (end.getTime() <= dayStart || start.getTime() >= dayEnd) continue;
    items.push({ type: 'event', at: start, end, event: e });
  }
  for (const t of data.tasks) {
    if (!t.due) continue;
    const due = toDate(t.due);
    if (!sameDay(due, day)) continue;
    items.push({ type: 'task', at: isDateKey(t.due) ? new Date(dayStart + 23.99 * 3_600_000) : due, task: t, allDay: isDateKey(t.due) });
  }
  for (const r of data.requirements) {
    if (!r.deadline || isDone(r)) continue;
    const at = new Date(r.deadline);
    if (sameDay(at, day)) items.push({ type: 'deadline', at, requirement: r });
  }
  return items.sort((a, b) => {
    const allA = a.type === 'event' && a.event.allDay ? 0 : 1;
    const allB = b.type === 'event' && b.event.allDay ? 0 : 1;
    return allA - allB || a.at.getTime() - b.at.getTime();
  });
}

export interface OpenItem {
  key: string;
  kind: 'task' | 'requirement';
  title: string;
  due?: Date;
  dueAllDay: boolean;
  task?: Task;
  requirement?: Requirement;
}

/** Otevřené úkoly a blízké termíny (7 dní) seřazené podle naléhavosti. */
export function openItems(tasks: Task[], requirements: Requirement[], now: Date, isDone: (r: Requirement) => boolean): OpenItem[] {
  const horizon = now.getTime() + 7 * 86_400_000;
  const items: OpenItem[] = [];
  for (const t of tasks) {
    if (t.done) continue;
    items.push({ key: `task:${t.id}`, kind: 'task', title: t.title, due: t.due ? toDate(t.due) : undefined, dueAllDay: Boolean(t.due && isDateKey(t.due)), task: t });
  }
  for (const r of requirements) {
    if (!r.deadline || isDone(r)) continue;
    const due = new Date(r.deadline);
    if (due.getTime() > horizon || due.getTime() < now.getTime() - 3 * 86_400_000) continue;
    items.push({ key: `req:${r.id}`, kind: 'requirement', title: r.title, due, dueAllDay: false, requirement: r });
  }
  const rank = (i: OpenItem) => (i.due ? (i.dueAllDay ? new Date(i.due.getFullYear(), i.due.getMonth(), i.due.getDate(), 23, 59).getTime() : i.due.getTime()) : Number.POSITIVE_INFINITY);
  return items.sort((a, b) => {
    const pa = a.task?.priority === 'high' ? 0 : 1;
    const pb = b.task?.priority === 'high' ? 0 : 1;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return pa - pb;
  });
}
