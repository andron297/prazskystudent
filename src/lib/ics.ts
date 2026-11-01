/**
 * Parser iCalendar (RFC 5545) pro export rozvrhu ze SISu a Google Kalendáře.
 * Podporuje: skládání řádků, escapování, TZID (IANA i Windows názvy), celodenní
 * události, DURATION, RRULE (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT,
 * UNTIL, BYDAY, BYMONTHDAY), EXDATE a přepsané výskyty (RECURRENCE-ID).
 */

export interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  categories: string[];
  url?: string;
  status?: string;
  organizer?: string;
  recurring: boolean;
}

export interface IcsCalendar {
  name?: string;
  timeZone?: string;
  events: IcsEvent[];
  warnings: string[];
}

export interface IcsParseOptions {
  /** Rozvíjet opakování jen v tomto okně (výchozí: −60 dní až +240 dní od teď). */
  windowStart?: Date;
  windowEnd?: Date;
  maxOccurrencesPerEvent?: number;
}

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* Lexikální vrstva                                                    */
/* ------------------------------------------------------------------ */

export function unfoldLines(text: string): string[] {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n|\r/g, '\n');
  const out: string[] = [];
  for (const line of normalized.split('\n')) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.trim().length > 0);
}

function splitOutsideQuotes(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of input) {
    if (ch === '"') quoted = !quoted;
    if (ch === separator && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

export function parseProperty(line: string): IcsProperty | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = splitOutsideQuotes(head, ';');
  const name = parts[0].trim().toUpperCase();
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch)).trim();
}

/* ------------------------------------------------------------------ */
/* Časová pásma                                                        */
/* ------------------------------------------------------------------ */

const WINDOWS_TZ: Record<string, string> = {
  'central europe standard time': 'Europe/Prague',
  'central european standard time': 'Europe/Warsaw',
  'w. europe standard time': 'Europe/Berlin',
  'romance standard time': 'Europe/Paris',
  'gmt standard time': 'Europe/London',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Kyiv',
  utc: 'UTC',
  'coordinated universal time': 'UTC',
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat | null {
  if (dtfCache.has(timeZone)) return dtfCache.get(timeZone) ?? null;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(timeZone, dtf);
    return dtf;
  } catch {
    return null;
  }
}

/** Převede TZID (IANA, Windows, „/Europe/Prague“ apod.) na platné IANA pásmo. */
export function resolveTimeZone(tzid: string | undefined | null): string | null {
  if (!tzid) return null;
  const cleaned = tzid.trim().replace(/^"|"$/g, '');
  const windows = WINDOWS_TZ[cleaned.toLowerCase()];
  if (windows) return windows;
  if (/^[A-Za-z_]+\/[A-Za-z_]+(\/[A-Za-z_]+)?$/.test(cleaned) && getFormatter(cleaned)) return cleaned;
  if (cleaned.toUpperCase() === 'UTC' || cleaned.toUpperCase() === 'GMT') return 'UTC';
  // Prefixované varianty, např. „/freeassociation.sourceforge.net/Tzfile/Europe/Prague“.
  const segments = cleaned.split('/').filter(Boolean);
  for (const take of [2, 3]) {
    if (segments.length < take) continue;
    const candidate = segments.slice(-take).join('/');
    if (/^[A-Za-z_]+(\/[A-Za-z_]+)+$/.test(candidate) && getFormatter(candidate)) return candidate;
  }
  return null;
}

function tzOffsetMs(instant: number, timeZone: string): number {
  const dtf = getFormatter(timeZone);
  if (!dtf) return 0;
  const parts = dtf.formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - (instant - (instant % 1000));
}

/** Místní čas v daném pásmu → okamžik (UTC). Správně řeší letní/zimní čas. */
export function zonedTimeToUtc(
  y: number,
  month: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(y, month - 1, d, h, mi, s);
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const candidate = wall - tzOffsetMs(guess, timeZone);
    if (candidate === guess) break;
    guess = candidate;
  }
  return new Date(guess);
}

/* ------------------------------------------------------------------ */
/* Datum a čas                                                         */
/* ------------------------------------------------------------------ */

interface WallTime {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  utc: boolean;
  dateOnly: boolean;
}

function parseWallTime(value: string, params: Record<string, string>): WallTime | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const dateOnly = params.VALUE === 'DATE' || m[4] === undefined;
  return {
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    hh: dateOnly ? 0 : Number(m[4]),
    mm: dateOnly ? 0 : Number(m[5]),
    ss: dateOnly ? 0 : Number(m[6] ?? '0'),
    utc: m[7] === 'Z',
    dateOnly,
  };
}

function wallToDate(w: WallTime, timeZone: string | null): Date {
  if (w.dateOnly) return new Date(w.y, w.m - 1, w.d);
  if (w.utc) return new Date(Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss));
  if (timeZone) return zonedTimeToUtc(w.y, w.m, w.d, w.hh, w.mm, w.ss, timeZone);
  return new Date(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
}

/** DURATION, např. PT1H30M, P1D, P2W → milisekundy. */
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const [w, d, h, mi, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? '0'));
  return sign * ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

/* ------------------------------------------------------------------ */
/* Opakování                                                           */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: Date;
  byDay?: number[];
  byMonthDay?: number[];
}

function parseRRule(value: string, timeZone: string | null): RRule | null {
  const parts: Record<string, string> = {};
  for (const chunk of value.split(';')) {
    const [k, v] = chunk.split('=');
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freq = parts.FREQ as RRule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
  const rule: RRule = { freq, interval: Math.max(1, Number(parts.INTERVAL ?? '1') || 1) };
  if (parts.COUNT) rule.count = Math.max(1, Number(parts.COUNT));
  if (parts.UNTIL) {
    const w = parseWallTime(parts.UNTIL, {});
    if (w) {
      // UNTIL je včetně – u data bez času bereme konec dne.
      rule.until = w.dateOnly ? new Date(w.y, w.m - 1, w.d, 23, 59, 59) : wallToDate(w, timeZone);
    }
  }
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',')
      .map((token) => WEEKDAYS.indexOf(token.replace(/^[+-]?\d+/, '').toUpperCase()))
      .filter((i) => i >= 0);
    if (days.length) rule.byDay = days.sort((a, b) => a - b);
  }
  if (parts.BYMONTHDAY) {
    const days = parts.BYMONTHDAY.split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
    if (days.length) rule.byMonthDay = days;
  }
  return rule;
}

/** Kalendářní datum jako UTC půlnoc – aritmetika dnů bez vlivu letního času. */
function utcDay(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function splitUtcDay(ts: number): { y: number; m: number; d: number; weekday: number } {
  const date = new Date(ts);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
    weekday: (date.getUTCDay() + 6) % 7,
  };
}

function* candidateDays(start: WallTime, rule: RRule): Generator<number> {
  const startDay = utcDay(start.y, start.m, start.d);
  const guardLimit = 4000;
  if (rule.freq === 'DAILY') {
    for (let k = 0; k < guardLimit; k++) yield startDay + k * rule.interval * DAY_MS;
    return;
  }
  if (rule.freq === 'WEEKLY') {
    const startWeekday = (new Date(startDay).getUTCDay() + 6) % 7;
    const weekStart = startDay - startWeekday * DAY_MS;
    const days = rule.byDay ?? [startWeekday];
    for (let k = 0; k < guardLimit; k++) {
      for (const wd of days) {
        const ts = weekStart + (k * rule.interval * 7 + wd) * DAY_MS;
        if (ts >= startDay) yield ts;
      }
    }
    return;
  }
  if (rule.freq === 'MONTHLY') {
    const monthDays = rule.byMonthDay ?? [start.d];
    for (let k = 0; k < guardLimit; k++) {
      const monthIndex = start.m - 1 + k * rule.interval;
      const y = start.y + Math.floor(monthIndex / 12);
      const m = (monthIndex % 12) + 1;
      for (const d of monthDays) {
        const ts = utcDay(y, m, d);
        if (splitUtcDay(ts).m !== m) continue;
        if (ts >= startDay) yield ts;
      }
    }
    return;
  }
  for (let k = 0; k < guardLimit; k++) {
    const ts = utcDay(start.y + k * rule.interval, start.m, start.d);
    if (splitUtcDay(ts).m === start.m) yield ts;
  }
}

/* ------------------------------------------------------------------ */
/* Hlavní parser                                                       */
/* ------------------------------------------------------------------ */

interface RawEvent {
  props: IcsProperty[];
}

function first(props: IcsProperty[], name: string): IcsProperty | undefined {
  return props.find((p) => p.name === name);
}

function all(props: IcsProperty[], name: string): IcsProperty[] {
  return props.filter((p) => p.name === name);
}

export function parseIcs(text: string, options: IcsParseOptions = {}): IcsCalendar {
  const lines = unfoldLines(text);
  const warnings: string[] = [];
  if (!lines.some((l) => l.toUpperCase().startsWith('BEGIN:VCALENDAR'))) {
    throw new Error('Soubor neobsahuje kalendář ve formátu iCal (chybí BEGIN:VCALENDAR).');
  }

  const now = Date.now();
  const windowStart = (options.windowStart ?? new Date(now - 60 * DAY_MS)).getTime();
  const windowEnd = (options.windowEnd ?? new Date(now + 240 * DAY_MS)).getTime();
  const maxOccurrences = options.maxOccurrencesPerEvent ?? 600;

  let calendarName: string | undefined;
  let calendarTz: string | null = null;
  const rawEvents: RawEvent[] = [];
  const stack: string[] = [];
  let current: RawEvent | null = null;

  for (const line of lines) {
    const prop = parseProperty(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN') {
      const component = prop.value.trim().toUpperCase();
      stack.push(component);
      if (component === 'VEVENT') current = { props: [] };
      continue;
    }
    if (prop.name === 'END') {
      const component = stack.pop();
      if (component === 'VEVENT' && current) {
        rawEvents.push(current);
        current = null;
      }
      continue;
    }
    const inside = stack[stack.length - 1];
    if (inside === 'VEVENT' && current) {
      current.props.push(prop);
    } else if (inside === 'VCALENDAR') {
      if (prop.name === 'X-WR-CALNAME') calendarName = unescapeText(prop.value);
      if (prop.name === 'X-WR-TIMEZONE') calendarTz = resolveTimeZone(prop.value);
    }
  }

  // Přepsané výskyty (RECURRENCE-ID) podle UID.
  const overrides = new Map<string, Map<number, RawEvent>>();
  const masters: RawEvent[] = [];
  for (const raw of rawEvents) {
    const recurrence = first(raw.props, 'RECURRENCE-ID');
    const uid = first(raw.props, 'UID')?.value.trim() ?? '';
    if (recurrence && uid) {
      const tz = resolveTimeZone(recurrence.params.TZID) ?? calendarTz;
      const w = parseWallTime(recurrence.value, recurrence.params);
      if (!w) continue;
      const key = wallToDate(w, tz).getTime();
      if (!overrides.has(uid)) overrides.set(uid, new Map());
      overrides.get(uid)?.set(key, raw);
    } else {
      masters.push(raw);
    }
  }

  const events: IcsEvent[] = [];
  let index = 0;

  const buildEvent = (raw: RawEvent, start: Date, end: Date, allDay: boolean, recurring: boolean): IcsEvent | null => {
    const status = first(raw.props, 'STATUS')?.value.trim().toUpperCase();
    if (status === 'CANCELLED') return null;
    const uid = first(raw.props, 'UID')?.value.trim() || `ics-${index++}`;
    const categories = all(raw.props, 'CATEGORIES').flatMap((p) =>
      unescapeText(p.value)
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    );
    const organizer = first(raw.props, 'ORGANIZER');
    return {
      uid,
      summary: unescapeText(first(raw.props, 'SUMMARY')?.value ?? '') || 'Bez názvu',
      description: first(raw.props, 'DESCRIPTION') ? unescapeText(first(raw.props, 'DESCRIPTION')!.value) : undefined,
      location: first(raw.props, 'LOCATION') ? unescapeText(first(raw.props, 'LOCATION')!.value) : undefined,
      start,
      end,
      allDay,
      categories,
      url: first(raw.props, 'URL')?.value.trim(),
      status,
      organizer: organizer?.params.CN ? organizer.params.CN : undefined,
      recurring,
    };
  };

  for (const raw of masters) {
    const dtstart = first(raw.props, 'DTSTART');
    if (!dtstart) {
      warnings.push('Událost bez DTSTART byla přeskočena.');
      continue;
    }
    const tz = resolveTimeZone(dtstart.params.TZID) ?? calendarTz;
    if (dtstart.params.TZID && !resolveTimeZone(dtstart.params.TZID)) {
      warnings.push(`Neznámé časové pásmo „${dtstart.params.TZID}“ – použit místní čas.`);
    }
    const startWall = parseWallTime(dtstart.value, dtstart.params);
    if (!startWall) {
      warnings.push(`Nečitelné datum začátku „${dtstart.value}“.`);
      continue;
    }
    const allDay = startWall.dateOnly;
    const startDate = wallToDate(startWall, tz);

    let durationMs: number;
    const dtend = first(raw.props, 'DTEND');
    const durationProp = first(raw.props, 'DURATION');
    if (dtend) {
      const endTz = resolveTimeZone(dtend.params.TZID) ?? tz;
      const endWall = parseWallTime(dtend.value, dtend.params);
      durationMs = endWall ? wallToDate(endWall, endTz).getTime() - startDate.getTime() : 60 * 60_000;
    } else if (durationProp) {
      durationMs = parseDuration(durationProp.value) ?? 60 * 60_000;
    } else {
      durationMs = allDay ? DAY_MS : 60 * 60_000;
    }
    if (durationMs < 0) durationMs = 60 * 60_000;

    const exdates = new Set<number>();
    const exdateDays = new Set<string>();
    for (const ex of all(raw.props, 'EXDATE')) {
      const exTz = resolveTimeZone(ex.params.TZID) ?? tz;
      for (const v of ex.value.split(',')) {
        const w = parseWallTime(v, ex.params);
        if (!w) continue;
        if (w.dateOnly) exdateDays.add(`${w.y}-${w.m}-${w.d}`);
        else exdates.add(wallToDate(w, exTz).getTime());
      }
    }

    const uid = first(raw.props, 'UID')?.value.trim() ?? '';
    const eventOverrides = overrides.get(uid);
    const rruleProp = first(raw.props, 'RRULE');
    const rule = rruleProp ? parseRRule(rruleProp.value, tz) : null;

    if (!rule) {
      const built = buildEvent(raw, startDate, new Date(startDate.getTime() + durationMs), allDay, false);
      if (built) events.push(built);
      continue;
    }

    let produced = 0;
    let counted = 0;
    for (const dayTs of candidateDays(startWall, rule)) {
      const { y, m, d } = splitUtcDay(dayTs);
      const occurrenceWall: WallTime = { ...startWall, y, m, d };
      const occStart = wallToDate(occurrenceWall, tz);
      const occTime = occStart.getTime();
      if (rule.until && occTime > rule.until.getTime()) break;
      counted++;
      if (rule.count && counted > rule.count) break;
      if (occTime > windowEnd) break;
      if (exdates.has(occTime) || exdateDays.has(`${y}-${m}-${d}`)) continue;
      const override = eventOverrides?.get(occTime);
      if (override) {
        eventOverrides?.delete(occTime);
        const oStart = first(override.props, 'DTSTART');
        const oEnd = first(override.props, 'DTEND');
        const oTz = resolveTimeZone(oStart?.params.TZID) ?? tz;
        const oStartWall = oStart ? parseWallTime(oStart.value, oStart.params) : null;
        const oStartDate = oStartWall ? wallToDate(oStartWall, oTz) : occStart;
        const oEndWall = oEnd ? parseWallTime(oEnd.value, oEnd.params) : null;
        const oEndDate = oEndWall
          ? wallToDate(oEndWall, resolveTimeZone(oEnd?.params.TZID) ?? oTz)
          : new Date(oStartDate.getTime() + durationMs);
        if (oEndDate.getTime() >= windowStart) {
          const built = buildEvent(override, oStartDate, oEndDate, Boolean(oStartWall?.dateOnly ?? allDay), true);
          if (built) events.push(built);
        }
      } else if (occTime + durationMs >= windowStart) {
        const built = buildEvent(raw, occStart, new Date(occTime + durationMs), allDay, true);
        if (built) events.push(built);
      }
      produced++;
      if (produced >= maxOccurrences) {
        warnings.push(`Opakování události „${first(raw.props, 'SUMMARY')?.value ?? uid}“ bylo zkráceno.`);
        break;
      }
    }

    // Přepsané výskyty, které neodpovídají žádnému vygenerovanému termínu (např. přesun mimo pravidlo).
    if (eventOverrides) {
      for (const override of eventOverrides.values()) {
        const oStart = first(override.props, 'DTSTART');
        if (!oStart) continue;
        const oTz = resolveTimeZone(oStart.params.TZID) ?? tz;
        const w = parseWallTime(oStart.value, oStart.params);
        if (!w) continue;
        const oStartDate = wallToDate(w, oTz);
        const oEnd = first(override.props, 'DTEND');
        const oEndWall = oEnd ? parseWallTime(oEnd.value, oEnd.params) : null;
        const oEndDate = oEndWall
          ? wallToDate(oEndWall, resolveTimeZone(oEnd?.params.TZID) ?? oTz)
          : new Date(oStartDate.getTime() + durationMs);
        if (oEndDate.getTime() < windowStart || oStartDate.getTime() > windowEnd) continue;
        const built = buildEvent(override, oStartDate, oEndDate, w.dateOnly, true);
        if (built) events.push(built);
      }
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { name: calendarName, timeZone: calendarTz ?? undefined, events, warnings };
}
