import type { Building, Milestone, Requirement, ScheduleEvent, Subject } from '../types';
import { addDays, addMinutes, fromDateKey, isDateKey, pad2, plural, toDate } from './dates';
import { REQUIREMENT_TYPE_LABELS } from './progress';

/** Jednotný tvar položky pro export do kalendáře. */
export interface CalendarItem {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  /** U celodenních položek poslední den VČETNĚ. */
  end?: Date;
  allDay: boolean;
}

/* ------------------------------------------------------------------ */
/* Převody doménových objektů                                          */
/* ------------------------------------------------------------------ */

/** Termín povinnosti jako 30min blok končící v okamžiku deadlinu. */
export function requirementToCalendarItem(req: Requirement, subject?: Subject): CalendarItem | null {
  if (!req.deadline) return null;
  const deadline = new Date(req.deadline);
  const lines = [
    subject ? `Předmět: ${subject.code ? `${subject.code} – ` : ''}${subject.name}` : null,
    `Typ: ${REQUIREMENT_TYPE_LABELS[req.type]}${req.weight ? ` (${req.weight} % hodnocení)` : ''}`,
    req.subtasks.length
      ? `Checklist:\n${req.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`).join('\n')}`
      : null,
    req.url ? `Odkaz: ${req.url}` : null,
    'Vytvořeno v aplikaci Stihnu',
  ].filter(Boolean);
  return {
    id: `req-${req.id}`,
    title: `⏰ ${req.title}${subject?.code ? ` (${subject.code})` : ''}`,
    description: lines.join('\n'),
    start: addMinutes(deadline, -30),
    end: deadline,
    allDay: false,
  };
}

export function milestoneToCalendarItem(m: Milestone, subject?: Subject): CalendarItem {
  if (m.allDay) {
    const start = isDateKey(m.start) ? fromDateKey(m.start) : toDate(m.start);
    const end = m.end ? (isDateKey(m.end) ? fromDateKey(m.end) : toDate(m.end)) : undefined;
    return {
      id: `ms-${m.id}`,
      title: m.title,
      description: [subject ? `Předmět: ${subject.name}` : null, m.note, 'Harmonogram – Stihnu'].filter(Boolean).join('\n'),
      start,
      end,
      allDay: true,
    };
  }
  const start = toDate(m.start);
  return {
    id: `ms-${m.id}`,
    title: m.title,
    description: [subject ? `Předmět: ${subject.name}` : null, m.note, 'Harmonogram – Stihnu'].filter(Boolean).join('\n'),
    start,
    end: m.end ? toDate(m.end) : addMinutes(start, 60),
    allDay: false,
  };
}

export function scheduleEventToCalendarItem(ev: ScheduleEvent, building?: Building): CalendarItem {
  return {
    id: `ev-${ev.id}`,
    title: ev.title,
    description: [ev.teacher ? `Vyučující: ${ev.teacher}` : null, ev.room ? `Místnost: ${ev.room}` : null]
      .filter(Boolean)
      .join('\n'),
    location: building ? `${building.name}${ev.room ? ` ${ev.room}` : ''}, ${building.address}` : ev.location,
    start: new Date(ev.start),
    end: new Date(ev.end),
    allDay: false,
  };
}

/* ------------------------------------------------------------------ */
/* iCalendar export                                                    */
/* ------------------------------------------------------------------ */

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

const encoder = new TextEncoder();

/** Zalomení řádků na 75 oktetů (UTF-8) dle RFC 5545. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = ch;
      bytes = size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n');
}

function formatUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(
    d.getUTCMinutes(),
  )}${pad2(d.getUTCSeconds())}Z`;
}

function formatDateValue(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export interface IcsBuildOptions {
  calendarName?: string;
  /** Připomínky v minutách před začátkem (VALARM). */
  reminders?: number[];
  now?: Date;
}

export function buildIcs(items: CalendarItem[], options: IcsBuildOptions = {}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stihnu//Studijni kalendar//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:Europe/Prague',
  ];
  if (options.calendarName) lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`);
  const stamp = formatUtc(options.now ?? new Date());
  for (const item of items) {
    lines.push('BEGIN:VEVENT', `UID:${item.id}@stihnu.app`, `DTSTAMP:${stamp}`);
    if (item.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateValue(item.start)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateValue(addDays(item.end ?? item.start, 1))}`);
    } else {
      lines.push(`DTSTART:${formatUtc(item.start)}`);
      lines.push(`DTEND:${formatUtc(item.end ?? addMinutes(item.start, 60))}`);
    }
    lines.push(`SUMMARY:${escapeText(item.title)}`);
    if (item.description) lines.push(`DESCRIPTION:${escapeText(item.description)}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    for (const minutes of options.reminders ?? []) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(item.title)}`,
        `TRIGGER:-PT${Math.max(0, Math.round(minutes))}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/* ------------------------------------------------------------------ */
/* Google Kalendář – přímý odkaz                                       */
/* ------------------------------------------------------------------ */

export function googleCalendarUrl(item: CalendarItem): string {
  const dates = item.allDay
    ? `${formatDateValue(item.start)}/${formatDateValue(addDays(item.end ?? item.start, 1))}`
    : `${formatUtc(item.start)}/${formatUtc(item.end ?? addMinutes(item.start, 60))}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: item.title, dates, ctz: 'Europe/Prague' });
  if (item.description) params.set('details', item.description);
  if (item.location) params.set('location', item.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Stažení souboru                                                     */
/* ------------------------------------------------------------------ */

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadIcs(filename: string, items: CalendarItem[], options: IcsBuildOptions = {}): void {
  downloadTextFile(filename.endsWith('.ics') ? filename : `${filename}.ics`, buildIcs(items, options), 'text/calendar');
}

export function formatReminder(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} ${plural(days, ['den', 'dny', 'dní'])} předem`;
  }
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} h předem`;
  return `${minutes} min předem`;
}
