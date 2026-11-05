/**
 * Jeden model pro celý Plán: výuka, vlastní události, úkoly, termíny
 * z předmětů a období z harmonogramu. Všechny pohledy (seznam, týden,
 * měsíc, rok) čerpají z těchto položek, takže nic není na dvou místech jinak.
 */
import type { Milestone, Requirement, ScheduleEvent, Task } from '../types';
import { addDays, isDateKey, startOfDay, toDate } from './dates';
import { isRequirementComplete } from './progress';

export type PlanItem =
  | { kind: 'class'; key: string; start: Date; end: Date; event: ScheduleEvent }
  | { kind: 'event'; key: string; start: Date; end: Date; allDay: boolean; event: ScheduleEvent }
  | { kind: 'task'; key: string; start: Date; allDay: boolean; task: Task }
  | { kind: 'deadline'; key: string; start: Date; requirement: Requirement; done: boolean }
  | { kind: 'milestone'; key: string; start: Date; end: Date; milestone: Milestone };

export interface PlanData {
  events: ScheduleEvent[];
  tasks: Task[];
  requirements: Requirement[];
  milestones: Milestone[];
}

const DAY = 86_400_000;

/** Konec celodenní události v aplikaci = půlnoc dne PO posledním dni (exkluzivně). */
function eventEnd(e: ScheduleEvent): Date {
  return new Date(e.end);
}

/** Všechny položky, které zasahují do intervalu [from, to). */
export function planItems(data: PlanData, from: Date, to: Date, opts: { includeDone?: boolean } = {}): PlanItem[] {
  const out: PlanItem[] = [];
  const a = from.getTime();
  const b = to.getTime();
  for (const e of data.events) {
    const s = new Date(e.start).getTime();
    const en = eventEnd(e).getTime();
    if (en <= a || s >= b) continue;
    const isClass = e.kind !== 'personal' && !e.allDay;
    if (isClass) out.push({ kind: 'class', key: `event:${e.id}`, start: new Date(e.start), end: new Date(e.end), event: e });
    else out.push({ kind: 'event', key: `event:${e.id}`, start: new Date(e.start), end: new Date(e.end), allDay: Boolean(e.allDay), event: e });
  }
  for (const t of data.tasks) {
    if (!t.due) continue;
    if (t.done && !opts.includeDone) continue;
    const d = toDate(t.due);
    const allDay = isDateKey(t.due);
    const at = allDay ? startOfDay(d) : d;
    if (at.getTime() < a - (allDay ? 0 : 0) || at.getTime() >= b) continue;
    out.push({ kind: 'task', key: `task:${t.id}`, start: at, allDay, task: t });
  }
  for (const r of data.requirements) {
    if (!r.deadline) continue;
    const done = isRequirementComplete(r);
    if (done && !opts.includeDone) continue;
    const at = new Date(r.deadline);
    if (at.getTime() < a || at.getTime() >= b) continue;
    out.push({ kind: 'deadline', key: `req:${r.id}`, start: at, requirement: r, done });
  }
  for (const m of data.milestones) {
    const start = startOfDay(toDate(m.start));
    const endDay = m.end ? startOfDay(toDate(m.end)) : start;
    const endEx = addDays(endDay, 1);
    if (endEx.getTime() <= a || start.getTime() >= b) continue;
    out.push({ kind: 'milestone', key: `ms:${m.id}`, start, end: endEx, milestone: m });
  }
  return out.sort(compareItems);
}

const ORDER: Record<PlanItem['kind'], number> = { milestone: 0, event: 1, class: 2, deadline: 3, task: 4 };

export function isAllDay(i: PlanItem): boolean {
  return i.kind === 'milestone' || (i.kind === 'event' && i.allDay) || (i.kind === 'task' && i.allDay);
}

export function compareItems(x: PlanItem, y: PlanItem): number {
  const ax = isAllDay(x) ? 0 : 1;
  const ay = isAllDay(y) ? 0 : 1;
  if (ax !== ay) return ax - ay;
  return x.start.getTime() - y.start.getTime() || ORDER[x.kind] - ORDER[y.kind];
}

/** Položky jednoho dne (víceden­ní období a události se ukážou v každém dni). */
export function itemsOnDay(items: PlanItem[], day: Date): PlanItem[] {
  const a = startOfDay(day).getTime();
  const b = a + DAY;
  return items.filter((i) => {
    if (i.kind === 'milestone' || i.kind === 'class' || i.kind === 'event') return i.start.getTime() < b && i.end.getTime() > a;
    return i.start.getTime() >= a && i.start.getTime() < b;
  });
}

/** Je položka období (víc dní), které se v náhledu dne ukazuje jen jako pruh? */
export function isSpan(i: PlanItem): boolean {
  return i.kind === 'milestone' && i.end.getTime() - i.start.getTime() > DAY;
}

export interface TimedBox {
  item: PlanItem;
  /** Minuty od půlnoci. */
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Rozmístění časových položek dne do sloupců, aby se nepřekrývaly. */
export function layoutDay(items: PlanItem[], day: Date): TimedBox[] {
  const dayStart = startOfDay(day).getTime();
  const timed = items
    .filter((i) => (i.kind === 'class' || (i.kind === 'event' && !i.allDay)) && i.start.getTime() < dayStart + DAY)
    .map((i) => {
      const s = Math.max(i.start.getTime(), dayStart);
      const e = Math.min((i as { end: Date }).end.getTime(), dayStart + DAY);
      return { item: i, top: (s - dayStart) / 60_000, bottom: Math.max((e - dayStart) / 60_000, (s - dayStart) / 60_000 + 20) };
    })
    .sort((x, y) => x.top - y.top || y.bottom - x.bottom);
  const boxes: TimedBox[] = [];
  // shluky překrývajících se položek
  let cluster: typeof timed = [];
  let clusterEnd = -1;
  const flush = () => {
    const colsEnd: number[] = [];
    const placed = cluster.map((c) => {
      let col = colsEnd.findIndex((end) => end <= c.top);
      if (col === -1) {
        col = colsEnd.length;
        colsEnd.push(c.bottom);
      } else colsEnd[col] = c.bottom;
      return { c, col };
    });
    for (const { c, col } of placed) boxes.push({ item: c.item, top: c.top, height: c.bottom - c.top, col, cols: colsEnd.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const t of timed) {
    if (cluster.length && t.top >= clusterEnd) flush();
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, t.bottom);
  }
  if (cluster.length) flush();
  return boxes;
}

/** Rozsah hodin pro týdenní mřížku (aspoň 8–18, rozšíří se podle událostí). */
export function hourRange(boxes: TimedBox[]): [number, number] {
  let min = 8;
  let max = 18;
  for (const b of boxes) {
    min = Math.min(min, Math.floor(b.top / 60));
    max = Math.max(max, Math.ceil((b.top + b.height) / 60));
  }
  return [Math.max(0, min), Math.min(24, max)];
}

/** Dny měsíční mřížky (od pondělí, 6 týdnů nebo méně). */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDays(start, i));
}

/** Fáze akademického roku pro daný den (podbarvení v měsíci a roce). */
export function phaseOn(milestones: Milestone[], day: Date): Milestone['category'] | null {
  const t = startOfDay(day).getTime();
  const order: Milestone['category'][] = ['holiday', 'exam-period', 'teaching', 'enrollment'];
  let best: Milestone['category'] | null = null;
  for (const m of milestones) {
    if (!order.includes(m.category)) continue;
    const s = startOfDay(toDate(m.start)).getTime();
    const e = startOfDay(toDate(m.end ?? m.start)).getTime();
    if (t < s || t > e) continue;
    // jednodenní volno (rektorský den) přebíjí výuku
    if (best === null || order.indexOf(m.category) < order.indexOf(best)) best = m.category;
  }
  return best;
}
