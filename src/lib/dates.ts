import type { DateKey } from '../types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isDateKey(value: string | undefined | null): value is DateKey {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ISO čas nebo 'YYYY-MM-DD' (lokální půlnoc) → Date. */
export function toDate(value: string): Date {
  return isDateKey(value) ? fromDateKey(value) : new Date(value);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Přičte kalendářní dny se zachováním lokálního času (bezpečné přes změnu času). */
export function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + days);
  return r;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MINUTE);
}

export function atTime(day: Date, hours: number, minutes = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Rozdíl v kalendářních dnech (a − b). */
export function calendarDayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY);
}

/** Pondělí týdne, do kterého patří datum. */
export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // 0 = pondělí
  return startOfDay(addDays(d, -day));
}

export function mondayOnOrAfter(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return startOfDay(day === 0 ? d : addDays(d, 7 - day));
}

/** Posun ISO času nebo DateKey o celé dny (zachová hodinu a minutu v lokálním čase). */
export function shiftByDays(value: string, days: number): string {
  if (days === 0) return value;
  if (isDateKey(value)) return toDateKey(addDays(fromDateKey(value), days));
  return addDays(new Date(value), days).toISOString();
}

/** Začáteční rok akademického roku (září–srpen). */
export function academicYearStart(d: Date): number {
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/* ------------------------------------------------------------------ */
/* Formátování (cs-CZ)                                                 */
/* ------------------------------------------------------------------ */

const timeFmt = new Intl.DateTimeFormat('cs-CZ', { hour: 'numeric', minute: '2-digit' });
const dayMonthFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const dateFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
const weekdayShortFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' });
const weekdayLongFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long' });
const dateLongFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
const dayMonthLongFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long' });
const monthYearFmt = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('cs-CZ', { month: 'short' });

export const formatTime = (d: Date): string => timeFmt.format(d);
export const formatDayMonth = (d: Date): string => dayMonthFmt.format(d);
export const formatDate = (d: Date): string => dateFmt.format(d);
export const formatWeekdayShort = (d: Date): string => weekdayShortFmt.format(d);
export const formatWeekdayLong = (d: Date): string => weekdayLongFmt.format(d);
export const formatDateLong = (d: Date): string => dateLongFmt.format(d);
export const formatDayMonthLong = (d: Date): string => dayMonthLongFmt.format(d);
export const formatMonthShort = (d: Date): string => monthShortFmt.format(d).replace('.', '');

export function formatMonthYear(d: Date): string {
  const s = monthYearFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** České skloňování podle čísla: [1, 2–4, 5+]. */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  if (abs === 1) return forms[0];
  if (abs >= 2 && abs <= 4) return forms[1];
  return forms[2];
}

export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Odpočet mm:ss, případně h:mm:ss. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/** „za 55 min“, „zítra v 9:30“, „za 3 dny“, „před 2 h“… */
export function formatRelative(target: Date, now: Date): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / MINUTE);
  const dayDiff = calendarDayDiff(target, now);
  if (diffMin === 0) return 'právě teď';
  if (diffMin > 0) {
    if (dayDiff === 0) return diffMin < 6 * 60 ? `za ${formatDuration(diffMin)}` : `dnes v ${formatTime(target)}`;
    if (dayDiff === 1) return `zítra v ${formatTime(target)}`;
    if (dayDiff === 2) return `pozítří v ${formatTime(target)}`;
    if (dayDiff < 7) return `za ${dayDiff} ${plural(dayDiff, ['den', 'dny', 'dní'])}`;
    if (dayDiff < 35) {
      const weeks = Math.round(dayDiff / 7);
      return `za ${weeks} ${plural(weeks, ['týden', 'týdny', 'týdnů'])}`;
    }
    return formatDate(target);
  }
  const ago = -diffMin;
  if (dayDiff === 0) return ago < 6 * 60 ? `před ${formatDuration(ago)}` : `dnes v ${formatTime(target)}`;
  if (dayDiff === -1) return `včera v ${formatTime(target)}`;
  const days = -dayDiff;
  if (days < 7) return `před ${days} ${plural(days, ['dnem', 'dny', 'dny'])}`;
  return formatDate(target);
}

/** Popis termínu: „dnes 23:59“, „čt 5. 11. 9:30“, „5. 11. 2026“. */
export function formatDeadline(deadline: Date, now: Date): string {
  const dayDiff = calendarDayDiff(deadline, now);
  const time = formatTime(deadline);
  if (dayDiff === 0) return `dnes ${time}`;
  if (dayDiff === 1) return `zítra ${time}`;
  if (dayDiff === -1) return `včera ${time}`;
  if (Math.abs(dayDiff) < 7) return `${formatWeekdayShort(deadline)} ${formatDayMonth(deadline)} ${time}`;
  if (deadline.getFullYear() === now.getFullYear()) return `${formatDayMonth(deadline)} ${time}`;
  return `${formatDate(deadline)} ${time}`;
}

/** Hodnota pro `<input type="datetime-local">`. */
export function toLocalInputValue(d: Date): string {
  return `${toDateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}
