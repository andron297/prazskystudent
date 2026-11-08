/**
 * Závazné předměty: ty z rozvrhu SIS (a co student výslovně přidal). Moodle
 * jen doplňuje úkoly a materiály k těmto předmětům – nikdy nezakládá nové.
 */
import type { ScheduleEvent, Subject } from '../types';

const SIS_EVENT = new Set(['sis', 'ics-file']);

/** Předmět ze SISu nebo přidaný studentem (ne jen kurz z Moodlu). */
export function isBindingSubject(subject: Subject, events: Pick<ScheduleEvent, 'subjectId' | 'source'>[]): boolean {
  if (subject.source !== 'moodle') return true;
  return events.some((e) => e.subjectId === subject.id && SIS_EVENT.has(e.source));
}

export function bindingSubjects(subjects: Subject[], events: Pick<ScheduleEvent, 'subjectId' | 'source'>[]): Subject[] {
  return subjects.filter((s) => isBindingSubject(s, events));
}

/** Má student už rozvrh ze SISu? (Bez něj se nic nemaže – nebylo by s čím porovnat.) */
export function hasSisTimetable(subjects: Subject[], events: Pick<ScheduleEvent, 'subjectId' | 'source'>[]): boolean {
  return events.some((e) => SIS_EVENT.has(e.source) && e.subjectId) || subjects.some((s) => s.source === 'sis' || s.source === 'ics-file');
}
