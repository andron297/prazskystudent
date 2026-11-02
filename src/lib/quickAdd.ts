/**
 * Rychlé zadání úkolu nebo události přirozenou češtinou:
 *   „zítra 18:00 trénink“            → událost zítra 18:00–19:00
 *   „pá 10–12 konzultace @Hollar“     → událost v pátek, místo Hollar
 *   „esej do pátku #JSB012 !“         → úkol s termínem v pátek, předmět, priorita
 *   „koupit lítačku“                  → úkol bez termínu
 * Parser vrací nejlepší odhad; v rozhraní lze typ přepnout.
 */
import type { Building, Subject } from '../types';
import { addDays, atTime, formatDayMonth, formatWeekdayShort, isSameDay, pad2, startOfDay, startOfWeek, toDateKey } from './dates';
import { foldDiacritics } from './text';

export interface QuickAddContext {
  now: Date;
  subjects: Subject[];
  buildings: Building[];
}

export type QuickTokenType = 'date' | 'time' | 'subject' | 'place' | 'priority' | 'kind';

export interface QuickToken {
  type: QuickTokenType;
  label: string;
}

export interface QuickAddResult {
  kind: 'task' | 'event';
  /** Typ určený výslovně („úkol:“, „událost:“). */
  explicitKind: boolean;
  title: string;
  /** Den (DateKey), pokud byl zadaný. */
  date?: string;
  startTime?: string;
  endTime?: string;
  /** Úkol: DateKey nebo ISO čas. */
  due?: string;
  /** Událost: ISO začátek a konec. */
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  buildingId?: string;
  subjectId?: string;
  priority?: 'high';
  tokens: QuickToken[];
}

const WEEKDAYS: { re: string; day: number }[] = [
  { re: 'pondeli|pondelka', day: 1 },
  { re: 'utery|uteri|utereka', day: 2 },
  { re: 'streda|stredu|stredy|stredou', day: 3 },
  { re: 'ctvrtek|ctvrtka|ctvrtku', day: 4 },
  { re: 'patek|patku|patka', day: 5 },
  { re: 'sobota|sobotu|soboty|sobote', day: 6 },
  { re: 'nedele|nedeli', day: 0 },
];
const SHORT_WEEKDAYS: Record<string, number> = { po: 1, ut: 2, st: 3, ct: 4, pa: 5, so: 6, ne: 0 };

const MONTHS = ['ledna', 'unora', 'brezna', 'dubna', 'kvetna', 'cervna', 'cervence', 'srpna', 'zari', 'rijna', 'listopadu', 'prosince'];

const TASK_VERBS = /^(koupit|napsat|odevzdat|zavolat|poslat|docist|precist|nacist|naucit|pripravit|vyridit|zaplatit|objednat|vratit|udelat|dodelat|opravit|zaregistrovat|prihlasit|zapsat|vytisknout|stahnout|nahrat|odeslat|projit|zopakovat|spocitat|vyplnit|domluvit|zjistit|uklidit|vyprat|nakoupit)\b/;
const EVENT_WORDS = /\b(schuzka|schuzku|sraz|trenink|obed|vecere|snidane|kino|divadlo|koncert|party|oslava|narozeniny|konzultace|prednaska|seminar|zkouska|doktor|lekar|zubar|kadernik|pohovor|meeting|call|hodina|lekce|trening|zapas|vylet)\b/;

interface Span {
  start: number;
  end: number;
}

/** Nejbližší daný den v týdnu (dnešek se počítá); `nextWeek` = den v příštím kalendářním týdnu. */
function nextWeekday(from: Date, weekday: number, nextWeek: boolean): Date {
  const today = startOfDay(from);
  if (nextWeek) return addDays(addDays(startOfWeek(today), 7), (weekday + 6) % 7);
  return addDays(today, (weekday - today.getDay() + 7) % 7);
}

function validTime(h: number, m: number): boolean {
  return h >= 0 && h <= 24 && m >= 0 && m < 60 && !(h === 24 && m > 0);
}

function hm(h: number, m: number): string {
  return `${pad2(h === 24 ? 0 : h)}:${pad2(m)}`;
}

function dateLabel(day: Date, now: Date): string {
  if (isSameDay(day, now)) return 'dnes';
  if (isSameDay(day, addDays(now, 1))) return 'zítra';
  if (isSameDay(day, addDays(now, 2))) return 'pozítří';
  return `${formatWeekdayShort(day)} ${formatDayMonth(day)}`;
}

export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  const text = input.replace(/\s+/g, ' ');
  const folded = foldDiacritics(text);
  const consumed: Span[] = [];
  const tokens: QuickToken[] = [];
  const free = (start: number, end: number) => consumed.every((s) => end <= s.start || start >= s.end);
  const take = (start: number, end: number) => consumed.push({ start, end });

  /** Najde první volný výskyt regulárního výrazu (nad textem bez diakritiky). */
  const find = (re: RegExp): RegExpExecArray | null => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(folded))) {
      if (m[0].length === 0) {
        g.lastIndex++;
        continue;
      }
      if (free(m.index, m.index + m[0].length)) return m;
    }
    return null;
  };

  let kind: 'task' | 'event' | undefined;
  let explicitKind = false;
  let deadlineCue = false;

  // 1) Výslovný typ
  const prefix = /^\s*(ukol|todo|udelat)\s*[:\-–]\s*|^\s*(ukol|todo)\s+|^\s*(udalost|akce|event)\s*[:\-–]?\s+/.exec(folded);
  if (prefix) {
    kind = prefix[3] ? 'event' : 'task';
    explicitKind = true;
    take(prefix.index, prefix.index + prefix[0].length);
    tokens.push({ type: 'kind', label: kind === 'task' ? 'úkol' : 'událost' });
  }

  // 2) Priorita
  const prio = find(/(^|\s)(!{1,3})(?=\s|$)/);
  let priority: 'high' | undefined;
  if (prio) {
    priority = 'high';
    take(prio.index, prio.index + prio[0].length);
    tokens.push({ type: 'priority', label: 'důležité' });
  }

  // 3) Předmět (#kód nebo #název)
  let subjectId: string | undefined;
  const hash = find(/#([a-z0-9_\-À-ɏ]+)/i);
  if (hash) {
    const needle = foldDiacritics(hash[1]);
    const subject =
      ctx.subjects.find((s) => s.code && foldDiacritics(s.code) === needle) ??
      ctx.subjects.find((s) => foldDiacritics(s.name).startsWith(needle)) ??
      ctx.subjects.find((s) => foldDiacritics(s.name).split(/\s+/).some((w) => w.length > 2 && w.startsWith(needle)));
    if (subject) {
      subjectId = subject.id;
      take(hash.index, hash.index + hash[0].length);
      tokens.push({ type: 'subject', label: subject.code ?? subject.name });
    } else {
      take(hash.index, hash.index + 1); // jen „#“, slovo zůstane v názvu
    }
  }

  // 4) Místo (@místo nebo známá budova „na Hollaru“)
  let location: string | undefined;
  let buildingId: string | undefined;
  const at = find(/@([^\s#!@]+)/);
  if (at) {
    location = text.slice(at.index + 1, at.index + at[0].length).replace(/[,.;]+$/, '');
    take(at.index, at.index + at[0].length);
  }
  for (const b of ctx.buildings) {
    const phrases = [b.locative, ...b.aliases.map((a) => a)].filter((p): p is string => Boolean(p && p.length >= 4));
    for (const phrase of phrases) {
      const re = new RegExp(`(^|\\s)(${foldDiacritics(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=\\s|$|[,.;])`);
      const m = find(re);
      if (m && (!location || foldDiacritics(location).includes(foldDiacritics(b.name).split(' ')[0]))) {
        buildingId = b.id;
        if (!location || foldDiacritics(location) === foldDiacritics(b.name) || foldDiacritics(location).startsWith(foldDiacritics(b.name).split(' ')[0])) location = b.name;
        if (b.locative && foldDiacritics(b.locative) === m[2]) take(m.index + m[1].length, m.index + m[0].length);
        break;
      }
    }
    if (buildingId) break;
  }
  if (location && !buildingId) {
    const lf = foldDiacritics(location);
    const b = ctx.buildings.find((x) => foldDiacritics(x.name).startsWith(lf) || x.aliases.some((a) => a && foldDiacritics(a).startsWith(lf)));
    if (b) {
      buildingId = b.id;
      location = b.name;
    }
  }
  if (location) tokens.push({ type: 'place', label: location });

  // 5) Čas
  let startTime: string | undefined;
  let endTime: string | undefined;
  let durationMinutes: number | undefined;

  const range =
    find(/\bod\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hod)?\s+do\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hod)?(?![\d.])/) ??
    find(/\b(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|hod)?(?![\d.:])/) ??
    find(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})(?::(\d{2}))\s*(?:h|hod)?(?![\d.:])/) ??
    find(/(?<![\d.])(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:h|hod)?(?![\d.:])/);
  if (range) {
    let h1: number, m1: number, h2: number, m2: number;
    if (range.length === 5) {
      h1 = Number(range[1]);
      m1 = Number(range[2] ?? 0);
      h2 = Number(range[3]);
      m2 = Number(range[4] ?? 0);
    } else if (range[3] !== undefined && /:/.test(range[0]) && !/^\d{1,2}:/.test(range[0])) {
      h1 = Number(range[1]);
      m1 = 0;
      h2 = Number(range[2]);
      m2 = Number(range[3]);
    } else {
      h1 = Number(range[1]);
      m1 = 0;
      h2 = Number(range[2]);
      m2 = 0;
    }
    if (validTime(h1, m1) && validTime(h2, m2) && h1 <= 24 && h2 <= 24) {
      startTime = hm(h1, m1);
      endTime = hm(h2, m2);
      take(range.index, range.index + range[0].length);
    }
  }

  if (!startTime) {
    const deadlineTime = find(/\b(?:do|nejpozdeji(?:\s+do)?|deadline)\s+(\d{1,2})[:.](\d{2})\b/);
    if (deadlineTime && validTime(Number(deadlineTime[1]), Number(deadlineTime[2]))) {
      startTime = hm(Number(deadlineTime[1]), Number(deadlineTime[2]));
      deadlineCue = true;
      take(deadlineTime.index, deadlineTime.index + deadlineTime[0].length);
    }
  }
  if (!startTime) {
    const single =
      find(/\b(?:v|ve|od|o)?\s*(\d{1,2}):(\d{2})(?:\s*(?:h|hod))?\b/) ??
      find(/\b(?:v|ve|od|o)?\s*(\d{1,2})\s*(?:h|hod|hodin)\b/) ??
      find(/\b(?:v|ve)\s+(\d{1,2})(?![\d.:])\b/);
    if (single) {
      const h = Number(single[1]);
      const m = Number(single[2] ?? 0);
      if (validTime(h, m)) {
        startTime = hm(h, m);
        take(single.index, single.index + single[0].length);
      }
    }
  }
  const dur = find(/\bna\s+(\d{1,3})\s*(min|minut|minuty|h|hod|hodiny|hodin|hodinu)\b/);
  if (dur) {
    const n = Number(dur[1]);
    durationMinutes = dur[2].startsWith('m') ? n : n * 60;
    take(dur.index, dur.index + dur[0].length);
  }

  // 6) Datum
  let day: Date | undefined;
  const now = ctx.now;
  const markDeadline = (m: RegExpExecArray) => {
    if (/^(?:do|nejpozdeji)\b/.test(m[0].trimStart())) deadlineCue = true;
  };

  const rel = find(/\b(?:(do|nejpozdeji(?:\s+do)?)\s+)?(dnes|dneska|dnesni|zitra|zitrka|zitrejsi|pozitri|pozitrka)\b/);
  if (rel) {
    const w = rel[2];
    day = startOfDay(w.startsWith('dnes') ? now : w.startsWith('zitr') ? addDays(now, 1) : addDays(now, 2));
    markDeadline(rel);
    take(rel.index, rel.index + rel[0].length);
  }
  if (!day) {
    const inN = find(/\b(?:(do)\s+)?za\s+(\d{1,2}|jeden|jednu|dva|dve|tri|ctyri)\s+(den|dny|dni|dnu|tyden|tydny|tydnu|mesic)\b/);
    if (inN) {
      const words: Record<string, number> = { jeden: 1, jednu: 1, dva: 2, dve: 2, tri: 3, ctyri: 4 };
      const n = words[inN[2]] ?? Number(inN[2]);
      const unit = inN[3];
      day = startOfDay(addDays(now, unit.startsWith('t') ? n * 7 : unit === 'mesic' ? n * 30 : n));
      if (inN[1]) deadlineCue = true;
      take(inN.index, inN.index + inN[0].length);
    }
  }
  if (!day) {
    const nextWeek = find(/\b(?:(do)\s+)?(?:pristi|pristiho)\s+(?:tyden|tydne)\b/);
    if (nextWeek) {
      day = nextWeekday(now, 1, true);
      if (nextWeek[1]) deadlineCue = true;
      take(nextWeek.index, nextWeek.index + nextWeek[0].length);
    }
  }
  if (!day) {
    const weekend = find(/\b(?:(do)\s+)?(?:o\s+)?vikendu?\b/);
    if (weekend) {
      day = nextWeekday(now, 6, false);
      if (weekend[1]) deadlineCue = true;
      take(weekend.index, weekend.index + weekend[0].length);
    }
  }
  if (!day) {
    const wd = find(
      new RegExp(`\\b(?:(do|nejpozdeji(?:\\s+do)?)\\s+)?(?:(v|ve|tento|tuto|tenhle|pristi|pristiho|pristim|priste)\\s+)?(${WEEKDAYS.map((w) => w.re).join('|')})\\b`),
    );
    if (wd) {
      const entry = WEEKDAYS.find((w) => new RegExp(`^(?:${w.re})$`).test(wd[3]))!;
      day = nextWeekday(now, entry.day, (wd[2] ?? '').startsWith('prist'));
      if (wd[1]) deadlineCue = true;
      take(wd.index, wd.index + wd[0].length);
    }
  }
  if (!day) {
    const short = find(/\b(?:(do)\s+)?(po|ut|st|ct|pa|so|ne)\.?(?=\s*\d)/);
    if (short) {
      day = nextWeekday(now, SHORT_WEEKDAYS[short[2]], false);
      if (short[1]) deadlineCue = true;
      take(short.index, short.index + short[0].length);
    }
  }
  if (!day) {
    const numeric = find(/\b(?:(do|nejpozdeji(?:\s+do)?)\s+)?(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}))?/);
    const named = numeric ? null : find(new RegExp(`\\b(?:(do|nejpozdeji(?:\\s+do)?)\\s+)?(\\d{1,2})\\.?\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?`));
    const m = numeric ?? named;
    if (m) {
      const d = Number(m[2]);
      const month = numeric ? Number(m[3]) - 1 : MONTHS.indexOf(m[3]);
      let year = m[4] ? Number(m[4]) : now.getFullYear();
      let candidate = new Date(year, month, d);
      if (!m[4] && candidate.getTime() < startOfDay(now).getTime() - 31 * 86_400_000) {
        year += 1;
        candidate = new Date(year, month, d);
      }
      if (candidate.getMonth() === month && candidate.getDate() === d) {
        day = candidate;
        if (m[1]) deadlineCue = true;
        take(m.index, m.index + m[0].length);
      }
    }
  }

  // „do“ těsně před časem („do 23:59“) už zachytil krok 5; „do“ před datem nastavuje termín.
  if (!deadlineCue && find(/\b(?:nejpozdeji|deadline|termin)\b/)) deadlineCue = true;

  // 7) Typ
  const restFolded = (() => {
    let out = '';
    for (let i = 0; i < folded.length; i++) out += consumed.some((s) => i >= s.start && i < s.end) ? ' ' : folded[i];
    return out.trim();
  })();
  if (!kind) {
    if (endTime || durationMinutes) kind = 'event';
    else if (deadlineCue) kind = 'task';
    else if (TASK_VERBS.test(restFolded)) kind = 'task';
    else if (EVENT_WORDS.test(restFolded)) kind = startTime || day ? 'event' : 'task';
    else if (startTime) kind = 'event';
    else kind = 'task';
  }

  // 8) Název
  let title = '';
  for (let i = 0; i < text.length; i++) title += consumed.some((s) => i >= s.start && i < s.end) ? ' ' : text[i];
  title = title
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:–\-]+|[\s,;:–\-]+$/g, '')
    .replace(/\b(v|ve|na|do|od)$/i, '')
    .trim();
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
  else title = kind === 'task' ? 'Nový úkol' : 'Nová událost';

  // 9) Výsledek
  const result: QuickAddResult = { kind, explicitKind, title, allDay: false, location, buildingId, subjectId, priority, tokens };
  const baseDay = day ?? (startTime ? startOfDay(now) : undefined);
  if (baseDay) {
    result.date = toDateKey(baseDay);
    tokens.unshift({ type: 'date', label: dateLabel(baseDay, now) });
  }
  if (startTime) {
    tokens.splice(baseDay ? 1 : 0, 0, { type: 'time', label: endTime ? `${startTime}–${endTime}` : startTime });
    result.startTime = startTime;
    result.endTime = endTime;
  }

  if (kind === 'task') {
    if (baseDay) {
      if (startTime) {
        const [h, m] = startTime.split(':').map(Number);
        result.due = atTime(baseDay, h, m).toISOString();
      } else result.due = toDateKey(baseDay);
    }
  } else {
    const d = baseDay ?? startOfDay(now);
    if (!result.date) result.date = toDateKey(d);
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number);
      const start = atTime(d, h, m);
      let end: Date;
      if (endTime) {
        const [h2, m2] = endTime.split(':').map(Number);
        end = atTime(d, h2, m2);
        if (end <= start) end = addDays(end, 1);
      } else end = new Date(start.getTime() + (durationMinutes ?? 60) * 60_000);
      result.start = start.toISOString();
      result.end = end.toISOString();
    } else {
      result.allDay = true;
      result.start = startOfDay(d).toISOString();
      result.end = startOfDay(addDays(d, 1)).toISOString();
    }
  }
  return result;
}
