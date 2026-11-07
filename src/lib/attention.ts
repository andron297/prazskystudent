/**
 * Co je potřeba udělat: jeden seřazený seznam z celé aplikace – kdy vyrazit,
 * termíny po splatnosti i ty blízké, úkoly, propojení, která chtějí jedno
 * kliknutí, chyby synchronizace a důležité dny z harmonogramu. Čistá funkce
 * bez vedlejších účinků (snadno se testuje), texty obyčejnou češtinou.
 */
import type { Countdown, Milestone, Requirement, Subject, Task } from '../types';
import { vTime, formatDeadline, plural } from './dates';
import { isRequirementComplete } from './progress';

export type AttentionLevel = 'now' | 'today' | 'soon' | 'info';
export type AttentionKind = 'leave' | 'overdue' | 'deadline' | 'task' | 'connection' | 'sync' | 'milestone' | 'countdown' | 'profile';
export type AttentionRun = 'complete-requirement' | 'complete-task' | 'reconnect-google' | 'retry-sync' | 'ask-profile';

export interface AttentionItem {
  /** Stálé ID (odložení se pamatuje podle něj). */
  id: string;
  level: AttentionLevel;
  kind: AttentionKind;
  title: string;
  detail?: string;
  /** Čas, ke kterému se položka vztahuje (řazení, „za 2 h“). */
  at?: string;
  action?: { label: string; href?: string; run?: AttentionRun; targetId?: string };
}

export interface AttentionInput {
  now: Date;
  requirements: Requirement[];
  tasks: Task[];
  subjects: Subject[];
  milestones: Milestone[];
  countdowns: Countdown[];
  leave?: { at: Date; title: string; start: Date; place?: string } | null;
  connections: { id: string; title: string; state: string; detail: string }[];
  syncError?: string | null;
  /** Harmonogram je nahraný, ale student ještě neřekl, co studuje. */
  needsProfile?: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ORDER: Record<AttentionLevel, number> = { now: 0, today: 1, soon: 2, info: 3 };

/** Termín úkolu: celý den = konec dne. */
function dueDate(due: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:00`) : new Date(due);
}

function dayStart(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function buildAttention(input: AttentionInput): AttentionItem[] {
  const { now } = input;
  const t = now.getTime();
  const items: AttentionItem[] = [];
  const subjectName = (id?: string) => (id ? input.subjects.find((s) => s.id === id)?.name : undefined);

  // Kdy vyrazit
  if (input.leave) {
    const left = input.leave.at.getTime() - t;
    if (left > -5 * 60_000 && left < 90 * 60_000) {
      const mins = Math.max(0, Math.round(left / 60_000));
      items.push({
        id: `leave|${input.leave.start.toISOString()}`,
        level: mins <= 15 ? 'now' : 'today',
        kind: 'leave',
        title: mins <= 0 ? 'Vyrazte teď' : `Vyrazte ${vTime(input.leave.at)} (za ${mins} min)`,
        detail: `${input.leave.title} ${vTime(input.leave.start)}${input.leave.place ? ` · ${input.leave.place}` : ''}`,
        at: input.leave.at.toISOString(),
        action: { label: 'Trasa', href: '#/doprava' },
      });
    }
  }

  // Povinnosti z předmětů (Moodle, sylaby, ručně)
  for (const r of input.requirements) {
    if (!r.deadline || isRequirementComplete(r)) continue;
    const d = new Date(r.deadline);
    const diff = d.getTime() - t;
    const subject = subjectName(r.subjectId);
    if (diff < 0) {
      if (diff < -14 * DAY) continue;
      items.push({ id: `req|${r.id}`, level: 'now', kind: 'overdue', title: `Po termínu: ${r.title}`, detail: `${subject ? `${subject} · ` : ''}termín byl ${formatDeadline(d, now)}`, at: r.deadline, action: { label: 'Hotovo', run: 'complete-requirement', targetId: r.id } });
    } else if (diff < 7 * DAY) {
      items.push({
        id: `req|${r.id}`,
        level: diff < 3 * HOUR ? 'now' : diff < DAY ? 'today' : 'soon',
        kind: 'deadline',
        title: r.title,
        detail: `${subject ? `${subject} · ` : ''}do ${formatDeadline(d, now)}`,
        at: r.deadline,
        action: { label: 'Hotovo', run: 'complete-requirement', targetId: r.id },
      });
    }
  }

  // Vlastní úkoly s termínem
  for (const task of input.tasks) {
    if (task.done || !task.due) continue;
    const d = dueDate(task.due);
    const diff = d.getTime() - t;
    const subject = subjectName(task.subjectId);
    if (diff < 0 && diff > -7 * DAY) {
      items.push({ id: `task|${task.id}`, level: 'now', kind: 'overdue', title: `Po termínu: ${task.title}`, detail: subject, at: d.toISOString(), action: { label: 'Hotovo', run: 'complete-task', targetId: task.id } });
    } else if (diff >= 0 && diff < 3 * DAY) {
      items.push({
        id: `task|${task.id}`,
        level: diff < 3 * HOUR ? 'now' : diff < DAY ? 'today' : 'soon',
        kind: 'task',
        title: task.title,
        detail: `${subject ? `${subject} · ` : ''}do ${formatDeadline(d, now)}`,
        at: d.toISOString(),
        action: { label: 'Hotovo', run: 'complete-task', targetId: task.id },
      });
    }
  }

  // Propojení, která chtějí pozornost
  for (const c of input.connections) {
    if (c.state !== 'attention') continue;
    items.push({
      id: `conn|${c.id}`,
      level: 'today',
      kind: 'connection',
      title: c.id === 'google' ? 'Google chce znovu potvrdit přihlášení' : `${c.title}: potřebuje jedno kliknutí`,
      detail: c.id === 'google' ? 'Bez potvrzení se kalendář a úkoly nesynchronizují.' : c.detail,
      action: c.id === 'google' ? { label: 'Potvrdit', run: 'reconnect-google' } : { label: 'Otevřít', href: '#/propojeni' },
    });
  }
  if (input.syncError) {
    items.push({ id: 'sync|account', level: 'today', kind: 'sync', title: 'Synchronizace účtu se nepovedla', detail: input.syncError, action: { label: 'Zkusit znovu', run: 'retry-sync' } });
  }

  // Důležité dny z harmonogramu (už jen ty, které se studenta týkají)
  for (const m of input.milestones) {
    const start = dayStart(m.start);
    const diff = start.getTime() - t;
    const startsToday = start.toDateString() === now.toDateString();
    if (!startsToday && (diff < 0 || diff > 7 * DAY)) continue;
    const days = Math.ceil((start.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY);
    items.push({
      id: `ms|${m.id}`,
      level: startsToday ? 'today' : 'soon',
      kind: 'milestone',
      title: startsToday ? `Dnes: ${m.title}` : `Za ${days} ${plural(days, ['den', 'dny', 'dní'])}: ${m.title}`,
      at: start.toISOString(),
      action: { label: 'Plán', href: '#/plan/rok' },
    });
  }

  // Odpočty, které dnes končí
  for (const c of input.countdowns) {
    const at = dayStart(c.at);
    if (at.toDateString() !== now.toDateString()) continue;
    items.push({ id: `cd|${c.id}`, level: 'today', kind: 'countdown', title: `Dnes: ${c.title}`, at: at.toISOString() });
  }

  if (input.needsProfile) {
    items.push({ id: 'profile', level: 'info', kind: 'profile', title: 'Upřesněte, co studujete', detail: 'Skryji termíny z harmonogramu, které se vás netýkají.', action: { label: 'Upřesnit', run: 'ask-profile' } });
  }

  return items.sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.at ?? '9999').localeCompare(b.at ?? '9999'));
}

/** Kolik věcí ukázat na zvonku: jen „teď“ a „dnes“, bez odložených. */
export function attentionCount(items: AttentionItem[], snoozed: Record<string, string> = {}, now = new Date()): number {
  return items.filter((i) => (i.level === 'now' || i.level === 'today') && !isSnoozed(i.id, snoozed, now)).length;
}

export function isSnoozed(id: string, snoozed: Record<string, string>, now = new Date()): boolean {
  const until = snoozed[id];
  return Boolean(until && new Date(until).getTime() > now.getTime());
}
