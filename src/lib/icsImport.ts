/**
 * Převod událostí z iCal (SIS rozvrh, Google Kalendář, nahraný .ics) na
 * předměty a rozvrhové lístky aplikace, včetně namapování místností na budovy.
 */
import type { Building, DataSource, EventKind, ScheduleEvent, Subject } from '../types';
import type { IcsCalendar, IcsEvent } from './ics';
import { resolveBuilding } from './buildings';
import { nextSubjectColor } from './colors';
import { hashString, uid } from './id';
import { extractSubjectCode, foldDiacritics, normalizeKey } from './text';

export interface IcsImportContext {
  subjects: Subject[];
  buildings: Building[];
  aliases: Record<string, string>;
  source: DataSource;
  now: Date;
}

export interface IcsImportPreview {
  calendarName?: string;
  newSubjects: Subject[];
  events: ScheduleEvent[];
  matchedSubjects: number;
  resolvedLocations: { location: string; building: string; room?: string }[];
  unresolvedLocations: string[];
  warnings: string[];
  skipped: number;
}

const KIND_PATTERNS: { kind: EventKind; re: RegExp }[] = [
  { kind: 'exam', re: /zkousk(?!ov)|\bexam|zapoctov\w* test|kolokvi/ },
  { kind: 'seminar', re: /seminar|cviceni|\bcv\b|tutorial|workshop|\((x|s|c)\)/ },
  { kind: 'lecture', re: /prednask|lecture|\(p\)/ },
  { kind: 'consultation', re: /konzultac/ },
];

const ONLINE_RE = /\bonline\b|\bJONLINE\b|ms teams|\bzoom\b|webex|distan[cč]n/i;

export function isOnlineLocation(location?: string): boolean {
  return Boolean(location && ONLINE_RE.test(location));
}

/** SIS (Rozvrh NG): UID „26aJKB202x01_…“ – p = přednáška, x = seminář/cvičení. */
export function sisKindFromUid(uid?: string): EventKind | null {
  const m = /^\d{2}[a-z]?[A-Z]{2,5}\d{2,6}[A-Z]?(p|x)\d/.exec(uid ?? '');
  if (!m) return null;
  return m[1] === 'p' ? 'lecture' : 'seminar';
}

export function detectEventKind(text: string): EventKind {
  const folded = foldDiacritics(text);
  for (const { kind, re } of KIND_PATTERNS) if (re.test(folded)) return kind;
  return 'other';
}

const NAME_NOISE = [
  /\((?:prednaska|seminar|cviceni|p|s|x|c|lecture)\)/g,
  // Druh výuky jen jako samostatný kus názvu („X – přednáška“, „Seminář: X“),
  // ne uprostřed („Žurnalistická tvorba I – seminář psaní C“ je jiný předmět).
  /(?:^|\s[–-]\s)(?:prednaska|seminar|cviceni|lecture|tutorial)\s*(?:[:–-]\s*|$)/g,
  /\b(?:paralelka|par\.)\s*\d+\w*/g,
];

const ACADEMIC_TITLE = /(?:^|[\s,])(?:Mgr|MgA|PhDr|Ph\.\s?D|Bc|BcA|Ing|RNDr|JUDr|MUDr|PaedDr|ThDr|doc|prof|Dr|M\.A|MSc|MBA|DiS|CSc|DrSc)\.?(?=[\s,]|$)/;

/** „Předmět - Novák Jan, Mgr.“ → název a vyučující (SIS někdy dává jméno do SUMMARY). */
export function splitTeacherTail(summary: string): { name: string; teacher?: string } {
  const parts = summary.split(/\s+[-–]\s+/);
  if (parts.length < 2) return { name: summary };
  const tail = parts[parts.length - 1].trim();
  if (!ACADEMIC_TITLE.test(tail)) return { name: summary };
  return { name: parts.slice(0, -1).join(' - '), teacher: tail };
}

/** Název předmětu ze SUMMARY bez kódu, typu výuky a jména vyučujícího. */
export function extractSubjectName(rawSummary: string, code?: string): string {
  const summary = splitTeacherTail(rawSummary).name;
  const folded = foldDiacritics(summary);
  const mask = new Array<boolean>(summary.length).fill(false);
  const cover = (start: number, end: number) => {
    for (let i = start; i < end && i < mask.length; i++) mask[i] = true;
  };
  if (code) {
    const idx = summary.indexOf(code);
    if (idx >= 0) cover(idx, idx + code.length);
  }
  for (const re of NAME_NOISE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded))) cover(m.index, m.index + m[0].length);
  }
  let out = '';
  for (let i = 0; i < summary.length; i++) out += mask[i] ? ' ' : summary[i];
  out = out
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s–\-|:,]+|[\s–\-|:,]+$/g, '')
    .trim();
  return out || summary.trim();
}

function extractTeacher(event: IcsEvent): string | undefined {
  const desc = event.description ?? '';
  const m = /(?:vyučující|vyucujici|učitel|ucitel|teacher|lektor)\s*:\s*([^\n;]+)/i.exec(desc);
  if (m) return m[1].trim();
  return event.organizer;
}

export function findSubject(subjects: Subject[], code: string | undefined, name: string): Subject | undefined {
  if (code) {
    const byCode = subjects.find((s) => s.code && s.code.toUpperCase() === code.toUpperCase());
    if (byCode) return byCode;
  }
  // Předměty s různým kódem jsou různé předměty, i když se jmenují podobně
  // („Žurnalistická tvorba I“ JKB064 vs. „… – seminář psaní C“ JKB076).
  const compatible = (s: Subject) => !code || !s.code || s.code.toUpperCase() === code.toUpperCase();
  const key = normalizeKey(name);
  if (!key) return undefined;
  const exact = subjects.find((s) => compatible(s) && normalizeKey(s.name) === key);
  if (exact) return exact;
  if (key.length >= 8) {
    return subjects.find((s) => {
      if (!compatible(s)) return false;
      const k = normalizeKey(s.name);
      return k.length >= 8 && (k.includes(key) || key.includes(k));
    });
  }
  return undefined;
}

export function buildIcsImport(calendar: IcsCalendar, ctx: IcsImportContext): IcsImportPreview {
  const known = [...ctx.subjects];
  const newSubjects: Subject[] = [];
  const events: ScheduleEvent[] = [];
  const resolved = new Map<string, { building: string; room?: string }>();
  const unresolved = new Set<string>();
  const matched = new Set<string>();
  let skipped = 0;
  const windowStart = ctx.now.getTime() - 21 * 86_400_000;
  const windowEnd = ctx.now.getTime() + 200 * 86_400_000;

  for (const ev of calendar.events) {
    const duration = ev.end.getTime() - ev.start.getTime();
    if (ev.allDay || duration <= 0 || duration > 12 * 3_600_000) {
      skipped++;
      continue;
    }
    if (ev.end.getTime() < windowStart || ev.start.getTime() > windowEnd) {
      skipped++;
      continue;
    }
    const code = extractSubjectCode(ev.summary, ev.description, ev.categories.join(' '));
    const name = extractSubjectName(ev.summary, code);
    let subject = findSubject(known, code, name);
    if (!subject) {
      subject = {
        id: uid('subj'),
        code,
        name,
        color: nextSubjectColor(known.map((s) => s.color)),
        teacher: extractTeacher(ev) ?? splitTeacherTail(ev.summary).teacher,
        source: ctx.source,
        createdAt: ctx.now.toISOString(),
      };
      known.push(subject);
      newSubjects.push(subject);
    } else if (ctx.subjects.includes(subject)) {
      matched.add(subject.id);
    }

    const online = isOnlineLocation(ev.location);
    const match = online ? { building: undefined, room: undefined } : resolveBuilding(ev.location, ctx.buildings, ctx.aliases);
    if (ev.location && !online) {
      if (match.building) resolved.set(ev.location, { building: match.building.name, room: match.room });
      else unresolved.add(ev.location);
    }

    const textKind = detectEventKind(`${ev.summary} ${ev.description ?? ''} ${ev.categories.join(' ')}`);
    const { name: cleanTitle, teacher: teacherFromTitle } = splitTeacherTail(ev.summary);
    events.push({
      id: `ics_${hashString(`${ev.uid}|${ev.start.toISOString()}`).toString(36)}`,
      uid: ev.uid,
      subjectId: subject.id,
      title: cleanTitle,
      kind: textKind === 'exam' || textKind === 'consultation' ? textKind : (sisKindFromUid(ev.uid) ?? textKind),
      start: ev.start.toISOString(),
      end: ev.end.toISOString(),
      location: online ? 'Online' : ev.location,
      room: match.room,
      buildingId: match.building?.id,
      teacher: extractTeacher(ev) ?? teacherFromTitle,
      online: online || undefined,
      source: ctx.source,
    });
  }

  return {
    calendarName: calendar.name,
    newSubjects,
    events,
    matchedSubjects: matched.size,
    resolvedLocations: [...resolved.entries()].map(([location, v]) => ({ location, ...v })),
    unresolvedLocations: [...unresolved],
    warnings: calendar.warnings,
    skipped,
  };
}
