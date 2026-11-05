/**
 * Zdvojené položky: stejná hodina ze SISu i z vlastního kalendáře v Googlu,
 * stejný předmět založený dvakrát pod trochu jiným názvem. Při zobrazení
 * ukazujeme jen tu obsáhlejší variantu (a doplníme do ní, co má ta druhá).
 */
import type { ScheduleEvent, Subject } from '../types';
import { normalizeKey } from './text';

const NOISE = new Set(['prednaska', 'prednasky', 'seminar', 'seminare', 'cviceni', 'lekce', 'hodina', 'vyuka', 'skupina', 'paralelka', 'online', 'kurz', 'p', 's', 'x', 'c']);
const NUMERAL = /^(?:[ivx]{1,4}|\d{1,2})$/;

function tokens(text: string): string[] {
  return normalizeKey(text)
    .split(' ')
    .filter((t) => t.length >= 2 && !NOISE.has(t) && !NUMERAL.test(t));
}

/** Pořadová čísla v názvu („Statistika I“, „Angličtina 2“) – I a II jsou dva různé předměty. */
function numerals(text: string): string {
  return normalizeKey(text)
    .split(' ')
    .filter((t) => NUMERAL.test(t) && !/^\d{3,}$/.test(t))
    .sort()
    .join(',');
}

/** Podobné názvy: většina slov kratšího názvu se shoduje (i zkratky – „soc. psychologie“). */
export function similarTitles(a: string, b: string): boolean {
  if (numerals(a) !== numerals(b)) return false;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  let matched = 0;
  for (const t of short) {
    if (long.some((u) => u === t || (Math.min(t.length, u.length) >= 3 && (u.startsWith(t) || t.startsWith(u))))) matched++;
  }
  return matched >= 1 && matched / short.length >= 0.6;
}

/** Kolik užitečného položka nese (víc = obsáhlejší). */
export function eventRichness(e: ScheduleEvent): number {
  return (
    (e.subjectId ? 3 : 0) +
    (e.buildingId ? 2 : 0) +
    (e.room ? 2 : 0) +
    (e.location ? 1 : 0) +
    (e.teacher ? 1 : 0) +
    (e.notes ? Math.min(2, e.notes.length / 120) : 0) +
    (e.source === 'sis' ? 1 : 0) +
    (e.google?.readOnly ? -1 : 0)
  );
}

const ms = (iso: string) => new Date(iso).getTime();
const WINDOW = 10 * 60_000;

function sameSlot(a: ScheduleEvent, b: ScheduleEvent): boolean {
  if (Boolean(a.allDay) !== Boolean(b.allDay)) return false;
  return Math.abs(ms(a.start) - ms(b.start)) <= WINDOW && Math.abs(ms(a.end) - ms(b.end)) <= 2 * WINDOW;
}

function fullName(e: ScheduleEvent, subjects: Map<string, Subject>): string {
  const s = e.subjectId ? subjects.get(e.subjectId) : undefined;
  return [e.title, s?.name, s?.code].filter(Boolean).join(' ');
}

function isDuplicate(a: ScheduleEvent, b: ScheduleEvent, subjects: Map<string, Subject>): boolean {
  if (!sameSlot(a, b)) return false;
  if (a.subjectId && a.subjectId === b.subjectId) return true;
  // Dva různé předměty ve stejný čas (paralelky) nejsou duplikát.
  if (a.subjectId && b.subjectId) return false;
  return similarTitles(a.title, b.title) || similarTitles(fullName(a, subjects), fullName(b, subjects));
}

/** Zobrazitelné události bez duplicit; ponechá obsáhlejší a doplní do ní chybějící údaje. */
export function dedupeEvents(events: ScheduleEvent[], subjects: Subject[] = []): ScheduleEvent[] {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const kept: ScheduleEvent[] = [];
  for (const e of sorted) {
    let merged = false;
    for (let i = kept.length - 1; i >= 0; i--) {
      const k = kept[i];
      if (ms(e.start) - ms(k.start) > WINDOW) break;
      if (!isDuplicate(k, e, bySubject)) continue;
      const [rich, poor] = eventRichness(e) > eventRichness(k) ? [e, k] : [k, e];
      kept[i] = {
        ...rich,
        subjectId: rich.subjectId ?? poor.subjectId,
        location: rich.location ?? poor.location,
        room: rich.room ?? poor.room,
        buildingId: rich.buildingId ?? poor.buildingId,
        teacher: rich.teacher ?? poor.teacher,
        notes: rich.notes ?? poor.notes,
        // výuka zůstává výukou, i když obsáhlejší je záznam z vlastního kalendáře
        kind: rich.kind === 'personal' && poor.kind !== 'personal' ? poor.kind : rich.kind,
      };
      merged = true;
      break;
    }
    if (!merged) kept.push(e);
  }
  return kept;
}

let cache: { events: ScheduleEvent[]; subjects: Subject[]; out: ScheduleEvent[] } | null = null;

/** Totéž co `dedupeEvents`, ale počítá se jen jednou pro stejná data (sdílí ho všechny obrazovky). */
export function visibleEvents(events: ScheduleEvent[], subjects: Subject[]): ScheduleEvent[] {
  if (cache && cache.events === events && cache.subjects === subjects) return cache.out;
  const out = dedupeEvents(events, subjects);
  cache = { events, subjects, out };
  return out;
}

/**
 * Hodiny z rozvrhu, které už student má ve vlastním Google Kalendáři.
 * Ty do Googlu podruhé nezapisujeme (a dřív zapsanou kopii uklidíme).
 */
export function classesInOwnCalendar(events: ScheduleEvent[], subjects: Subject[]): Set<string> {
  const bySubject = new Map(subjects.map((s) => [s.id, s]));
  const own = events.filter((e) => e.source === 'google' && !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const out = new Set<string>();
  if (own.length === 0) return out;
  for (const e of events) {
    if (e.source === 'google' || e.kind === 'personal' || e.allDay || e.google?.readOnly) continue;
    const t = ms(e.start);
    // binární vyhledání prvního vlastního záznamu v okně
    let lo = 0;
    let hi = own.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ms(own[mid].start) < t - WINDOW) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < own.length && ms(own[i].start) <= t + WINDOW; i++) {
      if (isDuplicate(e, own[i], bySubject)) {
        out.add(e.id);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Zdvojené předměty                                                   */
/* ------------------------------------------------------------------ */

function subjectRichness(s: Subject, usage: Map<string, number>): number {
  return (s.code ? 5 : 0) + (s.syllabus ? 4 : 0) + (s.source === 'sis' ? 2 : 0) + (s.moodleCourseId ? 2 : 0) + (s.teacher ? 1 : 0) + Math.min(5, usage.get(s.id) ?? 0);
}

export interface SubjectDuplicate {
  keep: Subject;
  drop: Subject;
  /** 'sure' = stejný kód nebo úplně stejný název → sloučit hned; 'maybe' = jen nabídnout. */
  confidence: 'sure' | 'maybe';
}

/** Předměty, které jsou ve skutečnosti jeden. Dva různé kódy nikdy neslučujeme. */
export function duplicateSubjects(subjects: Subject[], usage: Map<string, number> = new Map()): SubjectDuplicate[] {
  const out: SubjectDuplicate[] = [];
  const taken = new Set<string>();
  const live = subjects.filter((s) => !s.demo);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (taken.has(a.id) || taken.has(b.id)) continue;
      const ca = a.code?.toUpperCase();
      const cb = b.code?.toUpperCase();
      if (ca && cb && ca !== cb) continue;
      const ka = normalizeKey(a.name);
      const kb = normalizeKey(b.name);
      let confidence: SubjectDuplicate['confidence'] | null = null;
      if ((ca && ca === cb) || (ka === kb && ka.length >= 4)) confidence = 'sure';
      else if (Math.min(ka.length, kb.length) >= 6 && similarTitles(a.name, b.name)) confidence = 'maybe';
      if (!confidence) continue;
      const [keep, drop] = subjectRichness(a, usage) >= subjectRichness(b, usage) ? [a, b] : [b, a];
      out.push({ keep, drop, confidence });
      taken.add(drop.id);
    }
  }
  return out;
}
