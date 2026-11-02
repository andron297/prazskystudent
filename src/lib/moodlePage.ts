/**
 * Stránky Moodlu poslané záložkou „→ Stihnu“ (text stránky, jak ho vidí
 * přihlášený student): úkol (stav odevzdání, známka, termín), test
 * (dokončené pokusy, známka) a stránka kurzu (texty s termíny).
 */
import type { Requirement, Subject } from '../types';
import { normalizeKey } from './text';

export type MoodlePageKind = 'moodle-assign' | 'moodle-quiz' | 'moodle-course';

export interface MoodleActivityPage {
  kind: 'moodle-assign' | 'moodle-quiz';
  title: string;
  course?: string;
  /** ID modulu kurzu z adresy (`view.php?id=…`). */
  cmid?: number;
  submitted: boolean;
  /** Text stavu tak, jak ho Moodle ukazuje („Odesláno k hodnocení“). */
  status?: string;
  graded: boolean;
  /** „50 / 50“ */
  grade?: string;
  gradePercent?: number;
  due?: Date;
  url?: string;
}

const MONTHS_CS = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function detectMoodlePage(text: string, url?: string): MoodlePageKind | null {
  const u = url ?? '';
  if (/\/mod\/assign\/view\.php/.test(u) || /Stav odevzdání úkolu|Submission status/.test(text)) return 'moodle-assign';
  if (/\/mod\/quiz\/view\.php/.test(u) || /Shrnutí vašich předchozích pokusů|Summary of your previous attempts/.test(text)) return 'moodle-quiz';
  if (/\/course\/view\.php/.test(u)) return 'moodle-course';
  return null;
}

/** „neděle, 15. října 2026, 23.59“, „15. 10. 2026 23:59“, „Sunday, 15 October 2026, 11:59 PM“. */
export function parseMoodleDate(value: string): Date | undefined {
  const cs = new RegExp(`(\\d{1,2})\\.\\s*(${MONTHS_CS.join('|')})\\s+(\\d{4})(?:,?\\s*(\\d{1,2})[.:](\\d{2}))?`, 'i').exec(value);
  if (cs) return new Date(+cs[3], MONTHS_CS.indexOf(cs[2].toLowerCase()), +cs[1], cs[4] ? +cs[4] : 23, cs[5] ? +cs[5] : 59);
  const num = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:,?\s*(\d{1,2})[.:](\d{2}))?/.exec(value);
  if (num) return new Date(+num[3], +num[2] - 1, +num[1], num[4] ? +num[4] : 23, num[5] ? +num[5] : 59);
  const en = new RegExp(`(\\d{1,2})\\s+(${MONTHS_EN.join('|')})\\s+(\\d{4})(?:,?\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)?)?`, 'i').exec(value);
  if (en) {
    let h = en[4] ? +en[4] : 23;
    if (en[6]?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (en[6]?.toUpperCase() === 'AM' && h === 12) h = 0;
    return new Date(+en[3], MONTHS_EN.indexOf(en[2].toLowerCase()), +en[1], h, en[5] ? +en[5] : 59);
  }
  return undefined;
}

/** Hodnota u popisku (stejný řádek za tabulátorem/dvojtečkou, jinak další řádek). */
function valueAfter(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i]);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:\t]+/, '').trim();
    const value = rest || lines[i + 1]?.trim();
    if (value && !label.test(value)) return value;
  }
  return undefined;
}

function normalizeGrade(raw: string): { grade: string; percent?: number } | undefined {
  const m = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/.exec(raw);
  if (!m) return undefined;
  const clean = (x: string) => x.replace(/[.,]0+$/, '').replace(/([.,]\d*?)0+$/, '$1');
  const a = Number(m[1].replace(',', '.'));
  const b = Number(m[2].replace(',', '.'));
  return { grade: `${clean(m[1])} / ${clean(m[2])}`, percent: b > 0 ? Math.round((a / b) * 100) : undefined };
}

/** Název činnosti a kurzu z titulku stránky („KURZ: Název úkolu | Moodle“). */
function titleParts(pageTitle: string): { course?: string; title?: string } {
  const main = pageTitle.split(/\s+\|\s+/)[0]?.trim() ?? '';
  const idx = main.indexOf(': ');
  if (idx > 0) return { course: main.slice(0, idx).trim(), title: main.slice(idx + 2).trim() };
  return { title: main || undefined };
}

/** U vloženého textu (bez titulku stránky): řádek nad „Otevřeno:“ / „Termín odevzdání:“ je název činnosti. */
function titleFromText(lines: string[]): string | undefined {
  const idx = lines.findIndex((l) => /^\s*(?:Otevřeno|Opened|Termín odevzdání|Due|Stav odevzdání úkolu|Submission status|Shrnutí vašich předchozích pokusů)\b/i.test(l));
  for (let i = idx - 1; i >= 0 && i >= idx - 3; i--) {
    const c = lines[i].trim();
    if (c.length >= 3 && c.length <= 120 && !/^(?:Hotovo|Done|Označit|Mark as done|Splněno|To do|Úkol)\b/i.test(c)) return c;
  }
  return undefined;
}

export function parseMoodleActivity(text: string, url: string | undefined, pageTitle = ''): MoodleActivityPage | null {
  const kind = detectMoodlePage(text, url);
  if (kind !== 'moodle-assign' && kind !== 'moodle-quiz') return null;
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const cmid = Number(/[?&]id=(\d+)/.exec(url ?? '')?.[1]) || undefined;
  const parts = titleParts(pageTitle);
  if (!parts.title) parts.title = titleFromText(lines);
  const dueRaw = valueAfter(lines, /^(?:\s*)(?:Termín odevzdání|Do|Due|Uzavřeno|Closes|Zavírá se|Close)\s*:/i);
  const due = dueRaw ? parseMoodleDate(dueRaw) : undefined;

  if (kind === 'moodle-assign') {
    const status = valueAfter(lines, /Stav odevzdání úkolu|Submission status/i);
    const gradingStatus = valueAfter(lines, /Stav hodnocení|Grading status/i);
    const gradeRaw = valueAfter(lines, /^\s*(?:Známka|Grade)\b(?!\s*k\s)/i);
    const submitted = Boolean(status && /odeslán|odevzdán|submitted for grading|^submitted/i.test(status) && !/nic|žádn|no attempt|nothing/i.test(status));
    const g = gradeRaw ? normalizeGrade(gradeRaw) : undefined;
    const graded = Boolean(g) || Boolean(gradingStatus && /^hodnoceno|^graded/i.test(gradingStatus));
    return { kind, title: parts.title ?? 'Úkol z Moodlu', course: parts.course, cmid, submitted, status, graded, grade: g?.grade, gradePercent: g?.percent, due, url };
  }

  const finished = lines.some((l) => /\b(Dokončeno|Finished|Odesláno|Submitted)\b/.test(l) && !/Neodesláno|Never submitted/.test(l));
  const gradeLine = lines.find((l) => /(konečná známka|Nejvyšší známka|Highest grade|final grade)/i.test(l));
  const g = gradeLine ? normalizeGrade(gradeLine) : undefined;
  return { kind, title: parts.title ?? 'Test z Moodlu', course: parts.course, cmid, submitted: finished, status: finished ? 'Dokončeno' : undefined, graded: Boolean(g), grade: g?.grade, gradePercent: g?.percent, due, url };
}

/** Najde povinnost, ke které stránka patří: podle odkazu (cmid), pak podle názvu. */
export function matchRequirement(page: MoodleActivityPage, requirements: Requirement[], subjects: Subject[]): Requirement | undefined {
  if (page.cmid) {
    const re = new RegExp(`[?&]id=${page.cmid}(?:&|$)`);
    const byUrl = requirements.find((r) => r.url && /\/mod\/(?:assign|quiz)\//.test(r.url) && re.test(r.url));
    if (byUrl) return byUrl;
  }
  const key = normalizeKey(page.title);
  if (!key) return undefined;
  const candidates = requirements.filter((r) => normalizeKey(r.title) === key);
  if (candidates.length <= 1) return candidates[0];
  const course = page.course ? normalizeKey(page.course) : '';
  return (
    candidates.find((r) => {
      const s = subjects.find((x) => x.id === r.subjectId);
      return s && course && (normalizeKey(s.name).includes(course) || course.includes(normalizeKey(s.name)) || (s.code && course.includes(s.code.toLowerCase())));
    }) ?? candidates[0]
  );
}

/** Odhad předmětu podle názvu kurzu z titulku stránky. */
export function guessSubjectForCourse(course: string | undefined, subjects: Subject[]): Subject | undefined {
  if (!course) return undefined;
  const key = normalizeKey(course);
  return subjects.find((s) => (s.code && key.includes(s.code.toLowerCase())) || normalizeKey(s.name) === key || (key.length > 6 && (normalizeKey(s.name).includes(key) || key.includes(normalizeKey(s.name)))));
}

/** Promítne stav ze stránky Moodlu do povinnosti (odevzdáno → hotovo, známka, termín). */
export function applyActivityToRequirement(req: Requirement, page: MoodleActivityPage): Requirement {
  const next: Requirement = { ...req };
  if (page.submitted || page.graded) {
    next.done = true;
    next.subtasks = req.subtasks.map((s) => ({ ...s, done: true }));
  }
  if (page.grade) {
    next.grade = page.grade;
    next.gradePercent = page.gradePercent;
  }
  if (page.due && !req.deadline) next.deadline = page.due.toISOString();
  if (page.url && !req.url) next.url = page.url;
  return next;
}
