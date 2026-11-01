/**
 * Chytrý textový parser pro „Harmonogram akademického roku“ a sylaby předmětů.
 * Funguje lokálně a okamžitě (bez sítě). Rozpozná české formáty dat
 * (5. 10. 2026, 5.10., 5. října 2026, 5.–9. 10., 2026-10-05, 5/10/2026),
 * rozsahy, „do 18. 10.“ (mezní termín), časy, váhy hodnocení v % i odkazy
 * na výukové týdny, a odhadne kategorii podle klíčových slov.
 */
import type { MilestoneCategory, RequirementType } from '../types';
import { academicYearStart, addDays, fromDateKey, pad2, toDateKey } from './dates';
import { uid } from './id';
import { guessRequirementType } from './progress';
import { foldDiacritics, normalizeKey } from './text';

export type ParseMode = 'harmonogram' | 'syllabus';

export interface ParsedItem {
  id: string;
  title: string;
  category: MilestoneCategory;
  /** 'YYYY-MM-DD' (celodenní) nebo ISO (s časem). Chybí u povinností bez data. */
  start?: string;
  end?: string;
  allDay: boolean;
  isDeadline: boolean;
  weight?: number;
  requirementType?: RequirementType;
  target: 'milestone' | 'requirement';
  confidence: number;
  sourceLine: string;
  selected: boolean;
}

export interface ParseOptions {
  mode: ParseMode;
  referenceDate: Date;
  /** Začátek výuky (YYYY-MM-DD) – pro převod „7. týden“ na datum. */
  teachingStart?: string;
}

export interface ParseResult {
  items: ParsedItem[];
  academicYearStart: number;
  detectedYear: boolean;
  stats: { lines: number; matchedLines: number };
}

interface DatePart {
  d: number;
  m: number;
  y?: number;
}

interface Token {
  start: number;
  end: number;
  kind: 'date' | 'range' | 'week';
  a: DatePart;
  b?: DatePart;
  week?: number;
}

interface TimeToken {
  start: number;
  end: number;
  h: number;
  min: number;
  h2?: number;
  min2?: number;
}

const MONTHS: Record<string, number> = {
  ledna: 1,
  leden: 1,
  unora: 2,
  unor: 2,
  brezna: 3,
  brezen: 3,
  dubna: 4,
  duben: 4,
  kvetna: 5,
  kveten: 5,
  cervna: 6,
  cerven: 6,
  cervence: 7,
  cervenec: 7,
  srpna: 8,
  srpen: 8,
  zari: 9,
  rijna: 10,
  rijen: 10,
  listopadu: 11,
  listopad: 11,
  prosince: 12,
  prosinec: 12,
};

const MONTH_RE = '(cervence|cervenec|cervna|cerven|ledna|leden|unora|unor|brezna|brezen|dubna|duben|kvetna|kveten|srpna|srpen|zari|rijna|rijen|listopadu|listopad|prosince|prosinec)';
const DASH = '\\s*[–-]\\s*';
const NUM_DATE = '(?<![\\d.])(\\d{1,2})\\.\\s*(\\d{1,2})\\.(?:\\s*(\\d{4}))?';
const TEXT_DATE = `(?<![\\d.])(\\d{1,2})\\.\\s*${MONTH_RE}(?:\\s+(\\d{4}))?`;

const RANGE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => { a: DatePart; b: DatePart } | null }[] = [
  {
    // 5. 10. – 8. 1. 2027 | 7. 9. 2026 – 20. 9. 2026
    re: new RegExp(`${NUM_DATE}${DASH}${NUM_DATE}`, 'g'),
    build: (m) => ({
      a: { d: +m[1], m: +m[2], y: m[3] ? +m[3] : undefined },
      b: { d: +m[4], m: +m[5], y: m[6] ? +m[6] : undefined },
    }),
  },
  {
    // 5. října – 8. ledna 2027
    re: new RegExp(`${TEXT_DATE}${DASH}${TEXT_DATE}`, 'g'),
    build: (m) => ({
      a: { d: +m[1], m: MONTHS[m[2]], y: m[3] ? +m[3] : undefined },
      b: { d: +m[4], m: MONTHS[m[5]], y: m[6] ? +m[6] : undefined },
    }),
  },
  {
    // 5.–9. 10. 2026
    re: /(?<![\d.])(\d{1,2})\.?\s*[–-]\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?/g,
    build: (m) => {
      const y = m[4] ? +m[4] : undefined;
      return { a: { d: +m[1], m: +m[3], y }, b: { d: +m[2], m: +m[3], y } };
    },
  },
  {
    // 5.–9. října 2026
    re: new RegExp(`(?<![\\d.])(\\d{1,2})\\.?\\s*[–-]\\s*(\\d{1,2})\\.\\s*${MONTH_RE}(?:\\s+(\\d{4}))?`, 'g'),
    build: (m) => {
      const y = m[4] ? +m[4] : undefined;
      return { a: { d: +m[1], m: MONTHS[m[3]], y }, b: { d: +m[2], m: MONTHS[m[3]], y } };
    },
  },
  {
    // 2026-10-05 – 2026-10-09
    re: /(\d{4})-(\d{2})-(\d{2})\s*[–-]\s*(\d{4})-(\d{2})-(\d{2})/g,
    build: (m) => ({ a: { d: +m[3], m: +m[2], y: +m[1] }, b: { d: +m[6], m: +m[5], y: +m[4] } }),
  },
];

const SINGLE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => DatePart | null }[] = [
  { re: /(\d{4})-(\d{2})-(\d{2})/g, build: (m) => ({ d: +m[3], m: +m[2], y: +m[1] }) },
  { re: new RegExp(TEXT_DATE, 'g'), build: (m) => ({ d: +m[1], m: MONTHS[m[2]], y: m[3] ? +m[3] : undefined }) },
  { re: new RegExp(`${NUM_DATE}(?!\\d)`, 'g'), build: (m) => ({ d: +m[1], m: +m[2], y: m[3] ? +m[3] : undefined }) },
  { re: /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})/g, build: (m) => ({ d: +m[1], m: +m[2], y: +m[3] }) },
];

const WEEK_RE = /(?<![\d.])(\d{1,2})\.\s*(?:vyukov\w*\s+)?tyd(?:en|nu|ne|ni)\b/g;
const TIME_COLON_RE = /(?<![\d:.])([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:[–-]|do)\s*([01]?\d|2[0-3])[:.]([0-5]\d))?(?![\d])/g;
const TIME_DOT_RE = /(?:\b(?:v|ve|od|do|cas)\s+)([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])(?:\s*(?:[–-]|do)\s*([01]?\d|2[0-3])[.:]([0-5]\d))?|(?<![\d.])([01]?\d|2[0-3])\.([0-5]\d)\s*(?:h\b|hod)/g;
const WEIGHT_RE = /(\d{1,3})\s*%/;

const CATEGORY_RULES: [MilestoneCategory, RegExp][] = [
  ['exam-period', /zkouskov/],
  ['holiday', /prazdnin|volno|dekansk|rektorsk|svatek|bez vyuky|vyuka se nekona|nekona se vyuka|vanoc|velikonoc|sportovni d(en|ny)/],
  ['enrollment', /zapis|skrtan|registrac|prihlasovan|predzapis|volba predmetu|zmen[ay] zapisu/],
  ['teaching', /vyuk|vyucovani|prednaskove obdobi/],
  ['assessment', /\btest|zapoct|zkousk|pisemk|kolokvi|prezentac|referat|seminarni prac|\besej|projekt|kviz|quiz|obhajob/],
  ['deadline', /mezni termin|odevzd|deadline|nejpozdeji|uzaverk|podani|termin pro|lhut[ay]|splneni studijnich povinnost/],
  ['semester', /semestr|akademick\w* rok|zahajeni|zacatek|konec/],
  ['event', /imatrikulac|promoc|den otevrenych|ples|konference/],
];

const WEEKDAY_BEFORE_RE = /(?:^|[\s(,])(po|ut|st|ct|pa|so|ne|pondeli|utery|streda|ctvrtek|patek|sobota|nedele)\.?,?\s*$/;
const CONNECTOR_BEFORE_RE = /(?:^|\s)(nejpozdeji do|nejpozdeji|do|od|az|v|ve|dne|termin|v terminu)\s*$/;

function isValidPart(p: DatePart): boolean {
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31) return false;
  if (p.y !== undefined && (p.y < 2000 || p.y > 2100)) return false;
  return true;
}

function overlaps(spans: { start: number; end: number }[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

function findTokens(folded: string, allowWeeks: boolean): Token[] {
  const tokens: Token[] = [];
  for (const { re, build } of RANGE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(tokens, start, end)) continue;
      const built = build(m);
      if (!built || !isValidPart(built.a) || !isValidPart(built.b)) continue;
      tokens.push({ start, end, kind: 'range', a: built.a, b: built.b });
    }
  }
  for (const { re, build } of SINGLE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(tokens, start, end)) continue;
      const part = build(m);
      if (!part || !isValidPart(part)) continue;
      tokens.push({ start, end, kind: 'date', a: part });
    }
  }
  if (allowWeeks) {
    WEEK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WEEK_RE.exec(folded))) {
      const start = m.index;
      const end = start + m[0].length;
      const week = +m[1];
      if (week < 1 || week > 16 || overlaps(tokens, start, end)) continue;
      tokens.push({ start, end, kind: 'week', a: { d: 1, m: 1 }, week });
    }
  }
  tokens.sort((x, y) => x.start - y.start);

  // „od 5. 10. do 9. 10.“ / „5. 10. až 9. 10.“ → rozsah
  const merged: Token[] = [];
  for (const t of tokens) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'date' && t.kind === 'date') {
      const between = folded.slice(prev.end, t.start).trim();
      if (/^(–|-|do|az|a do)$/.test(between)) {
        merged[merged.length - 1] = { start: prev.start, end: t.end, kind: 'range', a: prev.a, b: t.a };
        continue;
      }
    }
    merged.push(t);
  }
  return merged;
}

function findTimes(folded: string, blocked: { start: number; end: number }[]): TimeToken[] {
  const times: TimeToken[] = [];
  const push = (start: number, end: number, h: string, mi: string, h2?: string, mi2?: string) => {
    if (overlaps(blocked, start, end) || overlaps(times, start, end)) return;
    times.push({ start, end, h: +h, min: +mi, h2: h2 ? +h2 : undefined, min2: mi2 ? +mi2 : undefined });
  };
  TIME_COLON_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_COLON_RE.exec(folded))) push(m.index, m.index + m[0].length, m[1], m[2], m[3], m[4]);
  TIME_DOT_RE.lastIndex = 0;
  while ((m = TIME_DOT_RE.exec(folded))) {
    if (m[1] !== undefined) {
      const offset = m[0].search(/\d/);
      push(m.index + offset, m.index + m[0].length, m[1], m[2], m[3], m[4]);
    } else if (m[5] !== undefined) {
      push(m.index, m.index + m[0].length, m[5], m[6]);
    }
  }
  return times.sort((a, b) => a.start - b.start);
}

function categorize(foldedText: string): MilestoneCategory | null {
  for (const [category, re] of CATEGORY_RULES) if (re.test(foldedText)) return category;
  return null;
}

function cleanTitle(text: string): string {
  let t = text
    .replace(/\(\s*\d{1,3}\s*%\s*\)/g, ' ')
    .replace(/\b\d{1,3}\s*%/g, ' ')
    .replace(/\(\s*(?:po|út|ut|st|čt|ct|pá|pa|so|ne|pondělí|úterý|středa|čtvrtek|pátek|sobota|neděle)\.?\s*\)/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ');
  for (let pass = 0; pass < 3; pass++) {
    t = t.replace(/^[\s:;,|–\-—/.()]+/, '').replace(/[\s:;,|–\-—/(]+$/, '');
    t = t.replace(/\s+[–\-—]\s+[–\-—]\s+/g, ' – ').replace(/\s+([,.;:])/g, '$1');
    t = t.replace(/(^|\s)(a|i|nebo|a\s+do)$/i, '').replace(/^(a|i)\s+/i, '');
  }
  t = t.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isHeaderLine(folded: string): 'zimni' | 'letni' | null {
  if (/zimni semestr|\bzs\b/.test(folded)) return 'zimni';
  if (/letni semestr|\bls\b/.test(folded)) return 'letni';
  return null;
}

export function parseScheduleText(text: string, options: ParseOptions): ParseResult {
  const normalized = text
    .replace(/[   ]/g, ' ')
    .replace(/[‐-―−]/g, '–')
    .replace(/\t+/g, ' – ')
    .replace(/[ ]{2,}/g, ' ');
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const yearMatch = /(20\d{2})\s*\/\s*(20\d{2}|\d{2})\b/.exec(normalized);
  const detectedYear = Boolean(yearMatch);
  const ayStart = yearMatch ? Number(yearMatch[1]) : academicYearStart(options.referenceDate);

  const items: ParsedItem[] = [];
  let pendingLabel: string | null = null;
  let semester: 'zimni' | 'letni' | null = null;
  let matchedLines = 0;

  const inferYear = (month: number, lineSemester: 'zimni' | 'letni' | null): number => {
    const s = lineSemester ?? semester;
    if (s === 'letni') return month >= 10 ? ayStart : ayStart + 1;
    return month >= 8 ? ayStart : ayStart + 1;
  };

  for (const line of lines) {
    const folded = foldDiacritics(line);
    const header = isHeaderLine(folded);
    const tokens = findTokens(folded, Boolean(options.teachingStart));
    const weightMatch = WEIGHT_RE.exec(line);
    const weight = weightMatch ? Math.min(100, Number(weightMatch[1])) : undefined;
    if (header) semester = header;

    if (tokens.length === 0) {
      if (options.mode === 'syllabus' && weight !== undefined) {
        const title = cleanTitle(line);
        if (title.length >= 3) {
          matchedLines++;
          const reqType = guessRequirementType(title);
          items.push({
            id: uid('parsed'),
            title,
            category: 'assessment',
            allDay: true,
            isDeadline: false,
            weight,
            requirementType: reqType,
            target: 'requirement',
            confidence: 0.75,
            sourceLine: line,
            selected: true,
          });
        }
        continue;
      }
      if (line.length <= 90 && !/[.!?]$/.test(line)) pendingLabel = cleanTitle(line);
      continue;
    }

    matchedLines++;
    const lineSemester = header;
    const times = findTimes(folded, tokens);

    // Rozšíření rozsahů o předcházející den v týdnu a spojky („do“, „od“, „v“).
    let isDeadline = false;
    const removal: { start: number; end: number }[] = [];
    for (const t of tokens) {
      let start = t.start;
      for (let guard = 0; guard < 3; guard++) {
        const before = folded.slice(0, start);
        const wd = WEEKDAY_BEFORE_RE.exec(before);
        if (wd) {
          start = before.length - wd[0].length + (wd[0].length - wd[0].trimStart().length);
          continue;
        }
        const conn = CONNECTOR_BEFORE_RE.exec(before);
        if (conn) {
          if (/do$/.test(conn[1]) || conn[1].startsWith('nejpozdeji')) isDeadline = true;
          start = before.length - conn[0].length + (conn[0].length - conn[0].trimStart().length);
          continue;
        }
        break;
      }
      removal.push({ start, end: t.end });
    }
    for (const tm of times) {
      let start = tm.start;
      const before = folded.slice(0, start);
      const conn = /(?:^|\s)(v|ve|od|do|cas)\s*$/.exec(before);
      if (conn) start = before.length - conn[0].length + (conn[0].length - conn[0].trimStart().length);
      let end = tm.end;
      const after = folded.slice(end);
      const suffix = /^\s*(h|hod\.?|hodin)\b/.exec(after);
      if (suffix) end += suffix[0].length;
      removal.push({ start, end });
    }
    removal.sort((a, b) => a.start - b.start);

    let rest = '';
    let cursor = 0;
    for (const r of removal) {
      if (r.start > cursor) rest += `${line.slice(cursor, r.start)} `;
      cursor = Math.max(cursor, r.end);
    }
    rest += line.slice(cursor);
    let title = cleanTitle(rest);
    let usedFallback = false;
    if (title.length < 3) {
      if (pendingLabel) {
        title = pendingLabel;
        usedFallback = false;
      } else {
        title = options.mode === 'syllabus' ? 'Termín z sylabu' : 'Termín';
        usedFallback = true;
      }
    }
    pendingLabel = null;

    const foldedTitle = foldDiacritics(`${title} ${line}`);
    const ruleCategory = categorize(foldDiacritics(title)) ?? categorize(foldedTitle);
    // Řádky harmonogramu výuky („4. týden: …“) jsou témata, ne samostatné povinnosti –
    // i když zmiňují test, ten bývá v podmínkách zakončení uveden s přesným datem.
    const isTopicLine =
      options.mode === 'syllabus' &&
      (/^\s*\d{1,2}\.\s*(tyden|prednaska|seminar|lekce|hodina)/.test(folded) ||
        (/\btema\b/.test(foldedTitle) && ruleCategory !== 'assessment' && ruleCategory !== 'deadline'));
    let category: MilestoneCategory = ruleCategory ?? (options.mode === 'syllabus' && weight !== undefined ? 'assessment' : 'event');
    if (isDeadline && (category === 'event' || category === 'semester')) category = 'deadline';

    const hasExplicitYear = tokens.some((t) => t.a.y !== undefined || t.b?.y !== undefined);

    // Doplnění roku zprava doleva (u „12. 11. a 10. 12. 2026“ má rok jen poslední datum).
    // Rozsahy vždy běží dopředu v čase: „21. 12. – 3. 1.“ přechází přes Nový rok.
    let carryYear: number | undefined;
    let carryMonth: number | undefined;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t.kind === 'week') continue;
      if (t.b) {
        if (t.b.y === undefined && t.a.y !== undefined) t.b.y = t.b.m >= t.a.m ? t.a.y : t.a.y + 1;
        if (t.b.y === undefined && carryYear !== undefined && carryMonth !== undefined) {
          t.b.y = t.b.m > carryMonth ? carryYear - 1 : carryYear;
        }
        if (t.a.y === undefined && t.b.y !== undefined) t.a.y = t.a.m > t.b.m ? t.b.y - 1 : t.b.y;
        if (t.a.y === undefined) {
          t.a.y = inferYear(t.a.m, lineSemester);
          t.b.y = t.b.m >= t.a.m ? t.a.y : t.a.y + 1;
        }
      } else {
        if (t.a.y === undefined && carryYear !== undefined && carryMonth !== undefined) {
          t.a.y = t.a.m > carryMonth ? carryYear - 1 : carryYear;
        }
        if (t.a.y === undefined) t.a.y = inferYear(t.a.m, lineSemester);
      }
      carryYear = t.a.y;
      carryMonth = t.a.m;
    }

    const firstTime = times[0];
    const confidenceBase = 0.55 + (ruleCategory ? 0.25 : 0) + (hasExplicitYear ? 0.05 : 0) - (usedFallback ? 0.25 : 0);

    for (const t of tokens) {
      let startKey: string;
      let endKey: string | undefined;
      let confidence = confidenceBase;
      if (t.kind === 'week') {
        if (!options.teachingStart) continue;
        const weekStart = addDays(fromDateKey(options.teachingStart), ((t.week ?? 1) - 1) * 7);
        startKey = toDateKey(weekStart);
        endKey = toDateKey(addDays(weekStart, 4));
        confidence -= 0.15;
      } else {
        const a = t.a as Required<DatePart>;
        startKey = `${a.y}-${pad2(a.m)}-${pad2(a.d)}`;
        if (t.b) {
          const b = t.b as Required<DatePart>;
          endKey = `${b.y}-${pad2(b.m)}-${pad2(b.d)}`;
          if (endKey < startKey) endKey = undefined;
        }
      }

      let start: string = startKey;
      let end: string | undefined = endKey;
      let allDay = true;
      if (firstTime && !t.b && t.kind === 'date') {
        const base = fromDateKey(startKey);
        const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), firstTime.h, firstTime.min);
        start = s.toISOString();
        allDay = false;
        if (firstTime.h2 !== undefined && firstTime.min2 !== undefined) {
          end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), firstTime.h2, firstTime.min2).toISOString();
        } else {
          end = undefined;
        }
      }

      const target: 'milestone' | 'requirement' =
        options.mode === 'syllabus' && !isTopicLine && (weight !== undefined || category === 'assessment' || category === 'deadline')
          ? 'requirement'
          : 'milestone';
      if (isTopicLine) confidence = Math.min(confidence, ruleCategory === 'assessment' ? 0.45 : 0.4);
      confidence = Math.max(0.1, Math.min(0.98, confidence));

      items.push({
        id: uid('parsed'),
        title,
        category,
        start,
        end,
        allDay,
        isDeadline: isDeadline || category === 'deadline',
        weight,
        requirementType: target === 'requirement' ? guessRequirementType(title) : undefined,
        target,
        confidence,
        sourceLine: line,
        selected: options.mode === 'syllabus' ? !isTopicLine && (target === 'requirement' || category === 'assessment') : confidence >= 0.55,
      });
    }
  }

  // Odstranění duplicit (stejný název a termín).
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = `${normalizeKey(item.title)}|${item.start ?? ''}|${item.end ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return new Date(a.start.length === 10 ? `${a.start}T00:00:00` : a.start).getTime() -
      new Date(b.start.length === 10 ? `${b.start}T00:00:00` : b.start).getTime();
  });

  return { items: unique, academicYearStart: ayStart, detectedYear, stats: { lines: lines.length, matchedLines } };
}

export const CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  semester: 'Semestr',
  teaching: 'Výuka',
  'exam-period': 'Zkouškové',
  enrollment: 'Zápis',
  holiday: 'Volno',
  deadline: 'Mezní termín',
  assessment: 'Test / hodnocení',
  event: 'Událost',
};
