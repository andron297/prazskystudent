/**
 * Ze sylabu (podmínky zakončení, sylabus) udělá povinnosti předmětu:
 * hodnocené složky, jejich váhy a termíny. S AI (Claude) přes `/api/ai-parse`,
 * bez ní opatrnými pravidly – raději méně položek, ale skutečných.
 */
import type { Requirement, RequirementType, Subject, SubjectSyllabus } from '../types';
import { academicYearStart, capitalize, fromDateKey, isDateKey } from './dates';
import { hashString } from './id';
import { defaultSubtasks, guessRequirementType } from './progress';
import { parseScheduleText, type ParsedItem } from './scheduleTextParser';
import { foldDiacritics, normalizeKey, truncate } from './text';

/** Text sylabu vhodný pro vytažení povinností (podmínky mají přednost). */
export function syllabusText(s: SubjectSyllabus): string {
  return [s.requirements, s.syllabus].filter(Boolean).join('\n\n').slice(0, 20_000);
}

const KEYWORDS: { re: RegExp; type: RequirementType; title: string }[] = [
  { re: /seminarni (?:prace|ukol)|semestralni prace|zaverecna prace|rocnikova prace/, type: 'assignment', title: 'Seminární práce' },
  { re: /\besej/, type: 'assignment', title: 'Esej' },
  { re: /\breferat/, type: 'presentation', title: 'Referát' },
  { re: /prezentac/, type: 'presentation', title: 'Prezentace' },
  { re: /\bprojekt/, type: 'assignment', title: 'Projekt' },
  { re: /reflex|recenz|anotac[ei] (?:textu|cetby)|rozbor/, type: 'assignment', title: 'Písemný úkol' },
  { re: /prubezn\w* test|\btest|kviz|pisemk|zapoctov\w* test|kolokvi/, type: 'test', title: 'Test' },
  { re: /zaverecn\w* zkousk|ustni zkousk|pisemn\w* zkousk|\bzkous[kc]/, type: 'exam', title: 'Zkouška' },
  { re: /dochazk|ucast na (?:seminarich|vyuce|cvicenich)|aktivni ucast/, type: 'attendance', title: 'Docházka a aktivita' },
];

/** Procenta, která jsou hranicí (např. „alespoň 60 %“), ne váhou složky. */
const THRESHOLD_BEFORE = /(?:vyssi nez|nizsi nez|alespon|aspon|minimalne|minimum|nejmene|nejvyse|maximalne|max\.?|min\.?|nad|pod|vice nez|mene nez|ziskat|ziskani|ziska|hranic\w*|uspesnost\w*|limit\w*|absence|do)\s*(?:je\s*|cini\s*|z\s*|:\s*)?$/;
const THRESHOLD_AFTER = /^\s*(?:a vice|a mene|nebo vice|absenc\w*|uspesnost\w*|spravn\w*|z celkov\w*|z maxim\w*|ucast\w*)/;

interface Weight {
  value: number;
  index: number;
  end: number;
}

function realWeights(folded: string): Weight[] {
  const out: Weight[] = [];
  for (const m of folded.matchAll(/(\d{1,3})\s*%/g)) {
    const value = Number(m[1]);
    const index = m.index ?? 0;
    if (value <= 0 || value > 100) continue;
    if (THRESHOLD_BEFORE.test(folded.slice(Math.max(0, index - 40), index))) continue;
    if (THRESHOLD_AFTER.test(folded.slice(index + m[0].length, index + m[0].length + 30))) continue;
    out.push({ value, index, end: index + m[0].length });
  }
  return out;
}

function keywordOf(folded: string): (typeof KEYWORDS)[number] | undefined {
  return KEYWORDS.find((k) => k.re.test(folded));
}

const LEAD_NOISE = /^(?:[-–—•*·,;:/]|\d{1,2}[.)]|\d{1,2}\s*[x×]|[a-h][.)]|a|and|plus|\+)\s+/i;
const TRAIL_VERB = /\s+(?:tvoří|tvori|představuje|predstavuje|činí|cini|je|má váhu|ma vahu|s váhou|s vahou|se započítává|se zapocitava|započítává se|váha|vaha|váhou|=)\s*$/i;
const LEAD_REST = /^(?:zbytek|zbývající\s+(?:část|body)|zbyvajici\s+(?:cast|body)|ostatní|ostatni)\s+(?:hodnocení\s+|hodnoceni\s+)?(?:tvoří|tvori|je|představuje|predstavuje)\s+/i;
const LEAD_VERB = /^(?:z\s+)?(?:celkového\s+|celkoveho\s+)?(?:hodnocení|hodnoceni|známky|znamky|bodů|bodu|výsledku|vysledku)\s+(?:tvoří|tvori|představuje|predstavuje|je|činí|cini|připadá na|pripada na)\s+/i;

const MONTHS = 'ledna|února|unora|března|brezna|dubna|května|kvetna|června|cervna|července|cervence|srpna|září|zari|října|rijna|listopadu|prosince';
const DATE_IN_TITLE = new RegExp(`(?:\\b(?:do|od|dne|ke dni)\\s+)?\\d{1,2}\\.\\s*(?:\\d{1,2}\\.|(?:${MONTHS}))(?:\\s*\\d{4})?`, 'gi');
const TIME_IN_TITLE = /(?:\b(?:v|ve|od|do)\s+)?\d{1,2}[:.]\d{2}(?:\s*h(?:od)?\.?)?/gi;

/** Z kousku textu udělá krátký název složky („Esej“, „Průběžné testy“), nebo nic. */
function cleanTitle(raw: string): string | null {
  const segments = raw
    .replace(/\(?\s*\d{1,3}\s*%\s*\)?/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\([^)]*$/, ' ')
    .replace(DATE_IN_TITLE, ' ')
    .replace(TIME_IN_TITLE, ' ')
    .split(':')
    .map((x) => x.trim())
    .filter((x) => /\p{L}{2}/u.test(x));
  let t = segments.at(-1) ?? '';
  for (let i = 0; i < 3; i++) t = t.replace(LEAD_NOISE, '').replace(LEAD_REST, '').replace(LEAD_VERB, '').replace(TRAIL_VERB, '');
  t = t
    .replace(/^[\s\-–—•*·,;/]+|[\s\-–—•*·,;:./]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 3 || t.length > 60 || t.split(' ').length > 7) return null;
  return capitalize(t);
}

function item(title: string, sourceLine: string, extra: Partial<ParsedItem>): ParsedItem {
  const type = extra.requirementType ?? guessRequirementType(title);
  return {
    id: `loc_${hashString(`${title}|${sourceLine}`).toString(36)}`,
    title,
    category: extra.start ? (extra.isDeadline ? 'deadline' : 'assessment') : 'assessment',
    allDay: true,
    isDeadline: false,
    target: 'requirement',
    confidence: 0.6,
    sourceLine: truncate(sourceLine, 300),
    selected: true,
    ...extra,
    requirementType: type,
  };
}

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?;])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/))
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 2);
}

const TOPIC_LINE = /^\s*(?:\d{1,2}\.\s*(?:tyden|prednask|seminar|lekce|hodina|setkani|cviceni)|(?:tyden|lekce|tema|seminar)\s*\d)/;
const STRONG_IN_TOPIC = /\btest|kviz|odevzd|deadline|prezentac|referat|pisemk|kolokvi|\besej/;
const WEAK_TOPIC = /priprava na|opakovani|shrnuti|\buvod\b/;

const stem = (title: string) =>
  normalizeKey(title)
    .replace(/^(?:odevzdani|termin|deadline|vypracovani|napsani|zpracovani|prubezne odevzdani)\s+/, '')
    .split(' ')[0]
    ?.slice(0, 4) ?? '';

/**
 * Lokální extrakce (bez AI): hodnocené složky s vahami (i víc v jedné větě),
 * termíny s datem a věty s typickou složkou (seminární práce, test, docházka…).
 * Procenta, která jsou jen hranicí („alespoň 60 %“), se jako váha nepočítají.
 */
export function localSyllabusItems(text: string, now: Date): ParsedItem[] {
  const out: ParsedItem[] = [];
  const dates = new Map<ParsedItem, Set<string>>();
  const noteDate = (target: ParsedItem, start?: string) => {
    if (!start) return;
    const set = dates.get(target) ?? new Set<string>();
    set.add(start.slice(0, 10));
    dates.set(target, set);
  };
  const add = (next: ParsedItem) => {
    const key = normalizeKey(next.title);
    const hintOnly = next.weight === undefined && !next.start;
    const same =
      (hintOnly ? out.find((x) => x.requirementType === next.requirementType) : undefined) ??
      out.find((x) => normalizeKey(x.title) === key) ??
      out.find(
        (x) =>
          x.requirementType === next.requirementType &&
          stem(x.title) === stem(next.title) &&
          (x.weight === undefined || next.weight === undefined) &&
          (!x.start || !next.start),
      );
    if (!same) {
      out.push(next);
      noteDate(next, next.start);
      return;
    }
    noteDate(same, next.start);
    same.weight ??= next.weight;
    if (!same.start && next.start) Object.assign(same, { start: next.start, allDay: next.allDay, isDeadline: next.isDeadline, category: next.category });
    if (same.sourceLine.length < 240 && !same.sourceLine.includes(next.sourceLine)) same.sourceLine = truncate(`${same.sourceLine} ${next.sourceLine}`, 400);
  };

  for (const sentence of sentencesOf(text)) {
    const folded = foldDiacritics(sentence);
    // Téma přednášky („12. týden: Shrnutí a příprava na zkoušku“) není povinnost – jen když jde o test/odevzdání.
    if (TOPIC_LINE.test(folded) && (!STRONG_IN_TOPIC.test(folded) || WEAK_TOPIC.test(folded))) continue;
    const weights = realWeights(folded);
    const kw = keywordOf(folded);

    if (weights.length >= 2) {
      // „Esej (30 %), průběžné testy (20 %) a zkouška (50 %)“ → tři složky
      let from = 0;
      for (const w of weights) {
        const before = sentence.slice(from, w.end);
        const parts = before.split(/[,;]|\s+a\s+|\s+\+\s+/);
        const title = cleanTitle(parts.at(-1) ?? '') ?? cleanTitle(parts.slice(-2).join(' '));
        from = w.end;
        if (title) add(item(title, sentence, { weight: w.value }));
      }
      continue;
    }

    let start: string | undefined;
    let allDay = true;
    let isDeadline = false;
    let datedTitle: string | undefined;
    if (/\d/.test(sentence)) {
      const dated = parseScheduleText(sentence, { mode: 'syllabus', referenceDate: now }).items.find((i) => i.start);
      if (dated) {
        start = dated.start;
        allDay = dated.allDay;
        isDeadline = dated.isDeadline;
        datedTitle = dated.title;
      }
    }
    const weight = weights[0]?.value;
    if (weight === undefined && !start && !kw) continue;
    if (weight === undefined && start && !kw && !/odevzd|termin|deadline|zkousk|test|prezentac|referat|esej|prace|ukol/.test(folded)) continue;

    let title: string | null = null;
    if (weights[0]) {
      title = cleanTitle(sentence.slice(0, weights[0].index)) ?? cleanTitle(sentence.slice(weights[0].end).split(/[,.;]/)[0] ?? '');
    }
    if (!title && datedTitle) title = cleanTitle(datedTitle);
    title ??= kw?.title ?? null;
    if (!title) continue;
    add(item(title, sentence, { weight, start, allDay, isDeadline, requirementType: kw && title === kw.title ? kw.type : undefined }));
  }
  // Víc různých termínů u jedné složky (např. prezentace skupin 9. 11., 23. 11., …):
  // který je ten tvůj, z textu poznat nejde – termíny jen vypíšeme.
  for (const [target, set] of dates) {
    if (set.size < 2) continue;
    const list = [...set].sort().map((d) => `${Number(d.slice(8, 10))}. ${Number(d.slice(5, 7))}.`);
    Object.assign(target, { start: undefined, end: undefined, allDay: true, isDeadline: false, category: 'assessment' });
    target.sourceLine = truncate(`Možné termíny: ${list.join(', ')} – doplňte ten svůj. ${target.sourceLine}`, 400);
  }
  return out;
}

function deadlineFrom(item: ParsedItem): string | undefined {
  if (!item.start) return undefined;
  if (isDateKey(item.start)) {
    const d = fromDateKey(item.start);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  }
  return new Date(item.start).toISOString();
}

const sameDay = (a?: string, b?: string) => Boolean(a && b && a.slice(0, 10) === b.slice(0, 10));
const prefixMatch = (a: string, b: string) => a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);

export interface RequirementMerge {
  /** Nové povinnosti. */
  created: Requirement[];
  /** Existující povinnosti doplněné o váhu nebo termín ze sylabu. */
  enriched: Requirement[];
}

/**
 * Převod nalezených položek na povinnosti předmětu. Co už předmět má (stejný
 * název, název začínající stejně, nebo stejný typ i váha), se znovu nepřidá –
 * jen se doplní chybějící váha a termín (typicky úkol z Moodlu bez váhy).
 */
export function mergeSyllabusItems(items: ParsedItem[], subject: Subject, existing: Requirement[], now: Date, sourceTag: string): RequirementMerge {
  const own = existing.filter((r) => r.subjectId === subject.id);
  const enrichedById = new Map<string, Requirement>();
  const created: Requirement[] = [];
  const stamp = now.toISOString();
  for (const item of items) {
    if (item.target !== 'requirement' && item.category !== 'deadline' && item.category !== 'assessment') continue;
    const title = item.title.trim();
    const key = normalizeKey(title);
    if (!key) continue;
    const type = item.requirementType ?? 'other';
    const deadline = deadlineFrom(item);
    const weight = item.weight ?? 0;

    const byName = own.find((r) => prefixMatch(normalizeKey(r.title), key));
    if (byName) {
      const base = enrichedById.get(byName.id) ?? byName;
      const patch: Partial<Requirement> = {};
      if (!base.weight && weight) patch.weight = weight;
      if (!base.deadline && deadline) patch.deadline = deadline;
      if (Object.keys(patch).length) enrichedById.set(byName.id, { ...base, ...patch, updatedAt: stamp });
      continue;
    }
    if (own.some((r) => r.type === type && ((weight > 0 && r.weight === weight) || sameDay(r.deadline, deadline)))) continue;
    if (created.some((r) => normalizeKey(r.title) === key)) continue;
    created.push({
      id: `req_sis_${hashString(`${subject.id}|${key}`).toString(36)}`,
      subjectId: subject.id,
      title,
      type,
      weight,
      deadline,
      done: false,
      subtasks: defaultSubtasks(type, 'parser'),
      description: item.sourceLine ? truncate(item.sourceLine, 500) : undefined,
      source: 'sis',
      externalId: `${sourceTag}:${key}`,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  return { created, enriched: [...enrichedById.values()] };
}

/** Jen nové povinnosti (viz {@link mergeSyllabusItems}). */
export function itemsToRequirements(items: ParsedItem[], subject: Subject, existing: Requirement[], now: Date, sourceTag: string): Requirement[] {
  return mergeSyllabusItems(items, subject, existing, now, sourceTag).created;
}

export function syllabusAcademicYear(now: Date): number {
  return academicYearStart(now);
}
