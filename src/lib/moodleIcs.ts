/**
 * Moodle bez tokenu: export kalendáře Moodlu (Kalendář → Exportovat kalendář →
 * Získat URL kalendáře) je iCal se všemi termíny odevzdání, testy a událostmi kurzů.
 * Převádíme ho na povinnosti předmětů – stejné, jaké vytváří plné propojení přes token.
 */
import type { Requirement, Subject } from '../types';
import type { IcsCalendar, IcsEvent } from './ics';
import { findSubject, extractSubjectName } from './icsImport';
import { hashString } from './id';
import { defaultSubtasks, guessRequirementType } from './progress';
import { extractSubjectCode, foldDiacritics, normalizeKey, stripHtml, truncate } from './text';

export type MoodleEventAction = 'deadline' | 'open' | 'grading' | 'event';

const SUFFIXES: { re: RegExp; action: MoodleEventAction }[] = [
  { re: /\s+is due to be graded$/i, action: 'grading' },
  { re: /\s*[-–]\s*hodnocení(?: je)? splatné$/i, action: 'grading' },
  { re: /\s+is due$/i, action: 'deadline' },
  { re: /\s*\((?:due|termín)\)$/i, action: 'deadline' },
  { re: /\s+closes$/i, action: 'deadline' },
  { re: /\s+opens$/i, action: 'open' },
  { re: /\s*[-–]\s*termín odevzdání$/i, action: 'deadline' },
  { re: /\s+má termín odevzdání$/i, action: 'deadline' },
  { re: /\s+(?:je|jsou) splatn[éýáí]$/i, action: 'deadline' },
  { re: /\s+(?:se )?(?:uzavírá|zavírá|končí)$/i, action: 'deadline' },
  { re: /\s+(?:se )?(?:otevírá|začíná)$/i, action: 'open' },
];

const PREFIXES: { re: RegExp; action: MoodleEventAction }[] = [
  { re: /^termín odevzdání(?: úkolu)?\s*[:–-]?\s*/i, action: 'deadline' },
  { re: /^(?:uzavření|uzávěrka|konec|zavření)(?: testu| úkolu| kvízu)?\s*[:–-]?\s*/i, action: 'deadline' },
  { re: /^(?:otevření|začátek)(?: testu| úkolu| kvízu)?\s*[:–-]?\s*/i, action: 'open' },
  { re: /^odevzdání\s*[:–-]\s*/i, action: 'deadline' },
  { re: /^due\s*:\s*/i, action: 'deadline' },
];

/** Rozpozná typ události Moodlu z názvu a vrátí čistý název aktivity. */
export function classifyMoodleSummary(summary: string): { action: MoodleEventAction; title: string } {
  const text = summary.trim();
  for (const { re, action } of SUFFIXES) if (re.test(text)) return { action, title: text.replace(re, '').trim() };
  for (const { re, action } of PREFIXES) if (re.test(text)) return { action, title: text.replace(re, '').trim() };
  return { action: 'event', title: text };
}

const OBLIGATION_RE = /(test|zkous|kviz|quiz|prezentac|odevzd|esej|projekt|ukol|assign|seminarn|referat|kolokvi|pisemk|deadline|uzaverk)/;

export interface MoodleIcsContext {
  subjects: Subject[];
  requirements: Requirement[];
  now: Date;
}

export interface MoodleIcsResult {
  newSubjects: Subject[];
  /** Nové i aktualizované povinnosti (celé objekty). */
  requirements: Requirement[];
  created: number;
  updated: number;
  skipped: number;
  courses: string[];
}

function sameish(a: string, b: string): boolean {
  const x = normalizeKey(a);
  const y = normalizeKey(b);
  return x === y || (x.length > 5 && y.length > 5 && (x.includes(y) || y.includes(x)));
}

export function buildMoodleIcsImport(calendar: IcsCalendar, ctx: MoodleIcsContext): MoodleIcsResult {
  const known = [...ctx.subjects];
  const newSubjects: Subject[] = [];
  const out = new Map<string, Requirement>();
  const courses = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const nowIso = ctx.now.toISOString();
  const oldest = ctx.now.getTime() - 60 * 86_400_000;

  // Jen předměty z rozvrhu SIS (nebo přidané studentem) – Moodle nové předměty nezakládá.
  const subjectFor = (ev: IcsEvent): Subject | null => {
    const course = ev.categories[0]?.trim() ?? '';
    if (!course) return null;
    const code = extractSubjectCode(course, ev.summary, ev.description);
    const name = extractSubjectName(course, code);
    const subject = findSubject(known, code, name);
    if (!subject) return null;
    courses.add(course);
    return subject;
  };

  for (const ev of calendar.events) {
    const { action, title } = classifyMoodleSummary(ev.summary);
    if (action === 'open' || action === 'grading') {
      skipped++;
      continue;
    }
    const folded = foldDiacritics(`${ev.summary} ${ev.description ?? ''}`);
    if (action === 'event' && !OBLIGATION_RE.test(folded)) {
      skipped++;
      continue;
    }
    if (ev.start.getTime() < oldest) {
      skipped++;
      continue;
    }
    const subject = subjectFor(ev);
    if (!subject) {
      // Kurz mimo rozvrh SIS – ignorovat.
      skipped++;
      continue;
    }
    const externalId = `moodle-ics:${ev.uid}`;
    const deadline = ev.start.toISOString();
    const existing =
      ctx.requirements.find((r) => r.externalId === externalId) ??
      ctx.requirements.find(
        (r) =>
          r.subjectId === subject.id &&
          r.source === 'moodle' &&
          r.deadline !== undefined &&
          Math.abs(new Date(r.deadline).getTime() - ev.start.getTime()) < 36 * 3_600_000 &&
          sameish(r.title, title),
      );
    const description = ev.description ? truncate(stripHtml(ev.description), 600) : undefined;
    if (existing) {
      const changed = existing.deadline !== deadline || (existing.externalId === externalId && existing.title !== title);
      if (changed) {
        out.set(existing.id, {
          ...existing,
          title: existing.externalId === externalId ? title : existing.title,
          deadline,
          description: existing.description ?? description,
          url: existing.url ?? ev.url,
          updatedAt: nowIso,
        });
        updated++;
      }
      continue;
    }
    const type = guessRequirementType(title, /test|kviz|quiz/.test(folded) ? 'quiz' : action === 'deadline' ? 'assign' : undefined);
    out.set(`req_mi_${hashString(ev.uid).toString(36)}`, {
      id: `req_mi_${hashString(ev.uid).toString(36)}`,
      subjectId: subject.id,
      title,
      type,
      weight: 0,
      deadline,
      done: false,
      subtasks: defaultSubtasks(type, 'moodle'),
      description,
      source: 'moodle',
      externalId,
      url: ev.url,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    created++;
  }

  return { newSubjects, requirements: [...out.values()], created, updated, skipped, courses: [...courses] };
}

/** Rozpozná odkaz na export kalendáře Moodlu. */
export function isMoodleCalendarUrl(url: string): boolean {
  return /\/calendar\/export_execute\.php\?/i.test(url) && /authtoken=/i.test(url);
}
