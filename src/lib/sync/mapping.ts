/**
 * Převody mezi doménovými objekty aplikace a položkami Google Kalendáře / Úkolů.
 * Každá strana má vlastní „payload“ (normalizovaný tvar) a jeho otisk – změnu
 * poznáme porovnáním otisku s hodnotou uloženou při poslední synchronizaci.
 */
import type { Building, Countdown, Milestone, Requirement, ScheduleEvent, Subject, SubjectColor, Subtask, Task } from '../../types';
import { addDays, formatDeadline, fromDateKey, isDateKey, toDateKey } from '../dates';
import { hashString } from '../id';
import { isRequirementComplete, REQUIREMENT_TYPE_LABELS } from '../progress';
import { stripHtml } from '../text';
import type { EventBody, RemoteEvent, RemoteTask, TaskBody } from './remote';

/* ------------------------------------------------------------------ */
/* Otisky                                                              */
/* ------------------------------------------------------------------ */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function hashPayload(payload: object): string {
  return hashString(stableStringify(payload)).toString(36);
}

/* ------------------------------------------------------------------ */
/* Kalendář                                                            */
/* ------------------------------------------------------------------ */

export interface CalendarPayload {
  summary: string;
  description: string;
  location: string;
  /** ISO okamžik (UTC), u celodenních 'YYYY-MM-DD'. */
  start: string;
  /** U celodenních den PO posledním dni (exkluzivně, jako v iCal/Google). */
  end: string;
  allDay: boolean;
}

export interface CalendarCandidate {
  key: string;
  payload: CalendarPayload;
  /** Přijímat změny provedené v Googlu (osobní události). */
  editable: boolean;
  updatedAt: string;
  reminders: number[];
  colorId?: string;
  transparent?: boolean;
}

/** Barvy předmětů → ID barev událostí Google Kalendáře (1–11). */
export const GOOGLE_EVENT_COLOR: Record<SubjectColor, string> = {
  indigo: '9',
  emerald: '10',
  amber: '5',
  rose: '4',
  sky: '7',
  violet: '3',
  teal: '2',
  orange: '6',
  fuchsia: '3',
  lime: '2',
};

const KIND_WORD: Record<ScheduleEvent['kind'], string> = {
  lecture: 'přednáška',
  seminar: 'seminář',
  exam: 'zkouška',
  consultation: 'konzultace',
  personal: '',
  other: '',
};

const iso = (value: string): string => new Date(value).toISOString();

function eventLocation(event: ScheduleEvent, building?: Building): string {
  if (building) return [event.room, building.name, building.address].filter(Boolean).join(', ');
  return event.location ?? '';
}

/** Výuka, zkouška nebo osobní událost → payload pro Google Kalendář. */
export function eventPayload(event: ScheduleEvent, subject: Subject | undefined, building: Building | undefined, appUrl: string): CalendarPayload {
  if (event.kind === 'personal') {
    if (event.allDay) {
      const startKey = toDateKey(new Date(event.start));
      let endKey = toDateKey(new Date(event.end));
      if (endKey <= startKey) endKey = toDateKey(addDays(fromDateKey(startKey), 1));
      return { summary: event.title, description: event.notes ?? '', location: event.location ?? '', start: startKey, end: endKey, allDay: true };
    }
    return { summary: event.title, description: event.notes ?? '', location: event.location ?? '', start: iso(event.start), end: iso(event.end), allDay: false };
  }
  const name = subject?.name ?? event.title;
  const word = KIND_WORD[event.kind];
  const summary = event.kind === 'exam' ? `Zkouška · ${name}` : word ? `${name} · ${word}` : name;
  const lines = [
    [word ? word.charAt(0).toUpperCase() + word.slice(1) : null, subject?.code].filter(Boolean).join(' · '),
    event.teacher ? `Vyučující: ${event.teacher}` : null,
    event.room || building ? `Místnost: ${[event.room, building?.name].filter(Boolean).join(' – ')}` : null,
    subject ? `\nOtevřít ve Stihnutu: ${appUrl}/#/predmety/${encodeURIComponent(subject.id)}` : null,
  ].filter(Boolean);
  return {
    summary,
    description: lines.join('\n').trim(),
    location: eventLocation(event, building),
    start: iso(event.start),
    end: iso(event.end),
    allDay: false,
  };
}

/** Termín povinnosti → 30min blok končící termínem (neblokuje „volno/zaneprázdněn“). */
export function requirementEventPayload(req: Requirement, subject: Subject | undefined, appUrl: string): CalendarPayload | null {
  if (!req.deadline) return null;
  const deadline = new Date(req.deadline);
  const done = isRequirementComplete(req);
  const lines = [
    subject ? `${subject.code ? `${subject.code} · ` : ''}${subject.name}` : null,
    `${REQUIREMENT_TYPE_LABELS[req.type]}${req.weight ? ` · ${req.weight} % hodnocení` : ''}`,
    req.subtasks.length ? req.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`).join('\n') : null,
    req.url ? `Odkaz: ${req.url}` : null,
    subject ? `Otevřít ve Stihnutu: ${appUrl}/#/predmety/${encodeURIComponent(subject.id)}` : null,
  ].filter(Boolean);
  return {
    summary: `${done ? '✓ ' : ''}${req.title}${subject?.code ? ` · ${subject.code}` : ''}`,
    description: lines.join('\n'),
    location: '',
    start: new Date(deadline.getTime() - 30 * 60_000).toISOString(),
    end: deadline.toISOString(),
    allDay: false,
  };
}

export function milestonePayload(m: Milestone, subject?: Subject): CalendarPayload {
  const description = [subject ? `Předmět: ${subject.name}` : null, m.note, 'Harmonogram · Stihnuto'].filter(Boolean).join('\n');
  if (m.allDay) {
    const startKey = isDateKey(m.start) ? m.start : toDateKey(new Date(m.start));
    const lastKey = m.end ? (isDateKey(m.end) ? m.end : toDateKey(new Date(m.end))) : startKey;
    return { summary: m.title, description, location: '', start: startKey, end: toDateKey(addDays(fromDateKey(lastKey < startKey ? startKey : lastKey), 1)), allDay: true };
  }
  const start = new Date(m.start);
  const end = m.end ? new Date(m.end) : new Date(start.getTime() + 60 * 60_000);
  return { summary: m.title, description, location: '', start: start.toISOString(), end: end.toISOString(), allDay: false };
}

/** Odpočet jako důležitý den (do Google Kalendáře jde stejně jako termíny harmonogramu). */
export function countdownMilestone(c: Countdown): Milestone {
  const allDay = isDateKey(c.at);
  return { id: `cd-${c.id}`, title: c.title, category: 'event', start: c.at, allDay, source: 'manual', note: 'Odpočet', updatedAt: c.createdAt };
}

export function toEventBody(candidate: CalendarCandidate, appUrl: string): EventBody {
  const p = candidate.payload;
  return {
    summary: p.summary,
    description: p.description,
    location: p.location,
    start: p.allDay ? { date: p.start } : { dateTime: p.start, timeZone: 'Europe/Prague' },
    end: p.allDay ? { date: p.end } : { dateTime: p.end, timeZone: 'Europe/Prague' },
    colorId: candidate.colorId,
    transparency: candidate.transparent ? 'transparent' : 'opaque',
    reminders: { useDefault: false, overrides: candidate.reminders.slice(0, 5).map((minutes) => ({ method: 'popup', minutes: Math.min(40_320, Math.max(0, Math.round(minutes))) })) },
    extendedProperties: { private: { stihnuKey: candidate.key } },
    source: { title: 'Stihnuto', url: appUrl },
  };
}

export function remoteEventPayload(ev: RemoteEvent): CalendarPayload {
  const allDay = Boolean(ev.start.date);
  const startDate = ev.start.date ?? '';
  return {
    summary: (ev.summary ?? '').trim(),
    description: (ev.description ?? '').trim(),
    location: (ev.location ?? '').trim(),
    start: allDay ? startDate : new Date(ev.start.dateTime ?? 0).toISOString(),
    end: allDay ? (ev.end.date ?? toDateKey(addDays(fromDateKey(startDate), 1))) : new Date(ev.end.dateTime ?? ev.start.dateTime ?? 0).toISOString(),
    allDay,
  };
}

export function remoteEventKey(ev: RemoteEvent): string | undefined {
  return ev.extendedProperties?.private?.stihnuKey;
}

/** Pole osobní události převzatá z Googlu. */
export function eventFieldsFromRemote(ev: RemoteEvent): Pick<ScheduleEvent, 'title' | 'start' | 'end' | 'allDay' | 'location' | 'notes'> {
  const p = remoteEventPayload(ev);
  if (p.allDay) {
    return {
      title: p.summary || '(bez názvu)',
      start: fromDateKey(p.start).toISOString(),
      end: fromDateKey(p.end).toISOString(),
      allDay: true,
      location: p.location || undefined,
      notes: p.description ? stripHtml(p.description) : undefined,
    };
  }
  return {
    title: p.summary || '(bez názvu)',
    start: p.start,
    end: p.end,
    allDay: false,
    location: p.location || undefined,
    notes: p.description ? stripHtml(p.description) : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Úkoly                                                               */
/* ------------------------------------------------------------------ */

export interface TaskPayload {
  title: string;
  notes: string;
  /** '' nebo 'YYYY-MM-DD'. */
  due: string;
  completed: boolean;
}

export interface TaskCandidate {
  key: string;
  payload: TaskPayload;
  /** 'full' = osobní úkol (vše), 'status' = povinnost / podúkol (stav a termín). */
  editable: 'full' | 'status';
  updatedAt: string;
  /** Podúkol: klíč nadřazené povinnosti. */
  parentKey?: string;
}

const MARKER_RE = /\s*\n?— Stihnu · ([a-z]+:[^\s]+)\s*$/;

/** Patička poznámky, podle které poznáme úkol založený aplikací (i na jiném zařízení). */
export function withTaskMarker(notes: string, key: string): string {
  const clean = notes.trim();
  return `${clean ? `${clean}\n\n` : ''}— Stihnu · ${key}`;
}

export function taskMarkerKey(notes: string | undefined): string | undefined {
  return notes ? MARKER_RE.exec(notes)?.[1] : undefined;
}

export function stripTaskMarker(notes: string | undefined): string {
  return (notes ?? '').replace(MARKER_RE, '').trim();
}

/** Datum úkolu (DateKey) z ISO času nebo DateKey. */
export function dueDateKey(due: string | undefined): string {
  if (!due) return '';
  return isDateKey(due) ? due : toDateKey(new Date(due));
}

export function personalTaskPayload(task: Task): TaskPayload {
  return { title: task.title.trim(), notes: (task.notes ?? '').trim(), due: dueDateKey(task.due), completed: task.done };
}

export function requirementTaskPayload(req: Requirement, subject: Subject | undefined, includeChecklist: boolean, now: Date): TaskPayload {
  const lines = [
    `${REQUIREMENT_TYPE_LABELS[req.type]}${subject ? ` · ${subject.code ?? subject.name}` : ''}${req.weight ? ` · ${req.weight} %` : ''}`,
    req.deadline ? `Termín: ${formatDeadline(new Date(req.deadline), now)}` : null,
    includeChecklist && req.subtasks.length ? req.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`).join('\n') : null,
    req.url ?? null,
  ].filter(Boolean);
  return {
    title: `${req.title}${subject?.code ? ` · ${subject.code}` : ''}`,
    notes: lines.join('\n'),
    due: req.deadline ? toDateKey(new Date(req.deadline)) : '',
    completed: isRequirementComplete(req),
  };
}

export function subtaskPayload(st: Subtask): TaskPayload {
  return { title: st.title.trim(), notes: '', due: '', completed: st.done };
}

export function toTaskBody(candidate: TaskCandidate): TaskBody {
  const p = candidate.payload;
  return {
    title: p.title,
    notes: withTaskMarker(p.notes, candidate.key),
    status: p.completed ? 'completed' : 'needsAction',
    due: p.due ? `${p.due}T00:00:00.000Z` : null,
  };
}

export function remoteTaskPayload(task: RemoteTask): TaskPayload {
  return {
    title: (task.title ?? '').trim(),
    notes: stripTaskMarker(task.notes),
    due: task.due ? task.due.slice(0, 10) : '',
    completed: task.status === 'completed',
  };
}

/** Nový termín úkolu z Googlu: když se datum nezměnilo, zůstane původní čas. */
export function mergeDue(localDue: string | undefined, remoteDateKey: string): string | undefined {
  if (!remoteDateKey) return undefined;
  if (!localDue || isDateKey(localDue)) return remoteDateKey;
  const local = new Date(localDue);
  if (toDateKey(local) === remoteDateKey) return localDue;
  const day = fromDateKey(remoteDateKey);
  day.setHours(local.getHours(), local.getMinutes(), 0, 0);
  return day.toISOString();
}

/* ------------------------------------------------------------------ */
/* Operace nad lokálními daty (výstup synchronizace)                   */
/* ------------------------------------------------------------------ */

export type LocalOp =
  | { type: 'upsertEvent'; event: ScheduleEvent }
  | { type: 'removeEvent'; id: string }
  | { type: 'upsertTask'; task: Task }
  | { type: 'removeTask'; id: string }
  | { type: 'setRequirementDone'; id: string; done: boolean }
  | { type: 'setRequirementDeadline'; id: string; deadline: string }
  | { type: 'setSubtaskDone'; requirementId: string; subtaskId: string; done: boolean };
