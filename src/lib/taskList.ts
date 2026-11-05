/**
 * Jeden seznam všeho, co je potřeba udělat: vlastní úkoly (i z Google Úkolů)
 * a termíny z předmětů (SIS, Moodle, sylaby). Seskupení podle termínu nebo
 * podle předmětu – stejné pořadí všude v aplikaci.
 */
import type { Requirement, Task } from '../types';
import { addDays, isDateKey, startOfDay, startOfWeek, toDate } from './dates';
import { isRequirementComplete } from './progress';

export interface TaskRow {
  key: string;
  kind: 'task' | 'requirement';
  title: string;
  subjectId?: string;
  due?: Date;
  dueAllDay: boolean;
  done: boolean;
  task?: Task;
  requirement?: Requirement;
}

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'nextweek' | 'later' | 'none';

export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  overdue: 'Po termínu',
  today: 'Dnes',
  tomorrow: 'Zítra',
  week: 'Do konce týdne',
  nextweek: 'Příští týden',
  later: 'Později',
  none: 'Bez termínu',
};

/** Konec dne u celodenního termínu – úkol „do pátku“ je po termínu až v sobotu. */
export function dueMoment(row: Pick<TaskRow, 'due' | 'dueAllDay'>): number {
  if (!row.due) return Number.POSITIVE_INFINITY;
  return row.dueAllDay ? new Date(row.due.getFullYear(), row.due.getMonth(), row.due.getDate(), 23, 59, 59).getTime() : row.due.getTime();
}

export function dueGroup(row: Pick<TaskRow, 'due' | 'dueAllDay'>, now: Date): DueGroup {
  if (!row.due) return 'none';
  const t = dueMoment(row);
  if (t < now.getTime()) return 'overdue';
  const today = startOfDay(now).getTime();
  const day = startOfDay(row.due).getTime();
  if (day === today) return 'today';
  if (day === addDays(startOfDay(now), 1).getTime()) return 'tomorrow';
  const nextMonday = addDays(startOfWeek(now), 7).getTime();
  if (day < nextMonday) return 'week';
  if (day < addDays(startOfWeek(now), 14).getTime()) return 'nextweek';
  return 'later';
}

export interface TaskListOptions {
  /** Ukázat i hotové (posledních 14 dní). */
  includeDone?: boolean;
  /** Termíny z předmětů bez data (docházka, aktivní účast) – jen při filtru na předmět. */
  includeUndated?: boolean;
  subjectId?: string | null;
}

export function buildTaskRows(tasks: Task[], requirements: Requirement[], now: Date, opts: TaskListOptions = {}): TaskRow[] {
  const rows: TaskRow[] = [];
  const doneSince = now.getTime() - 14 * 86_400_000;
  for (const t of tasks) {
    if (t.done && (!opts.includeDone || (t.completedAt && new Date(t.completedAt).getTime() < doneSince))) continue;
    rows.push({ key: `task:${t.id}`, kind: 'task', title: t.title, subjectId: t.subjectId, due: t.due ? toDate(t.due) : undefined, dueAllDay: Boolean(t.due && isDateKey(t.due)), done: t.done, task: t });
  }
  for (const r of requirements) {
    const done = isRequirementComplete(r);
    if (!r.deadline && !(opts.includeUndated && opts.subjectId === r.subjectId)) continue;
    if (done && (!opts.includeDone || (r.deadline && new Date(r.deadline).getTime() < doneSince))) continue;
    rows.push({ key: `req:${r.id}`, kind: 'requirement', title: r.title, subjectId: r.subjectId, due: r.deadline ? new Date(r.deadline) : undefined, dueAllDay: false, done, requirement: r });
  }
  const filtered = opts.subjectId === undefined ? rows : rows.filter((r) => (opts.subjectId === null ? !r.subjectId : r.subjectId === opts.subjectId));
  return filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const d = dueMoment(a) - dueMoment(b);
    if (d !== 0) return d;
    const pa = a.task?.priority === 'high' ? 0 : 1;
    const pb = b.task?.priority === 'high' ? 0 : 1;
    return pa - pb || a.title.localeCompare(b.title, 'cs');
  });
}

export function groupByDue(rows: TaskRow[], now: Date): { group: DueGroup; rows: TaskRow[] }[] {
  const order: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'nextweek', 'later', 'none'];
  const map = new Map<DueGroup, TaskRow[]>();
  for (const r of rows) {
    if (r.done) continue;
    const g = dueGroup(r, now);
    map.set(g, [...(map.get(g) ?? []), r]);
  }
  return order.filter((g) => map.has(g)).map((group) => ({ group, rows: map.get(group)! }));
}
