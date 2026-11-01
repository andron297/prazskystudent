import type { Requirement, RequirementType } from '../types';
import { uid } from './id';

/** Váha pro povinnosti, u kterých sylabus váhu neuvádí. */
export const DEFAULT_WEIGHT = 10;

export function requirementProgress(r: Requirement): number {
  if (r.subtasks.length > 0) {
    const done = r.subtasks.filter((s) => s.done).length;
    return done / r.subtasks.length;
  }
  return r.done ? 1 : 0;
}

export function isRequirementComplete(r: Requirement): boolean {
  return requirementProgress(r) >= 1;
}

export interface SubjectProgress {
  ratio: number;
  percent: number;
  completed: number;
  total: number;
}

/** Vážený průměr splnění povinností předmětu. */
export function subjectProgress(requirements: Requirement[]): SubjectProgress {
  if (requirements.length === 0) return { ratio: 0, percent: 0, completed: 0, total: 0 };
  let weightSum = 0;
  let acc = 0;
  let completed = 0;
  for (const r of requirements) {
    const w = r.weight > 0 ? r.weight : DEFAULT_WEIGHT;
    const p = requirementProgress(r);
    weightSum += w;
    acc += w * p;
    if (p >= 1) completed++;
  }
  const ratio = weightSum > 0 ? acc / weightSum : 0;
  return { ratio, percent: Math.round(ratio * 100), completed, total: requirements.length };
}

export const REQUIREMENT_TYPE_LABELS: Record<RequirementType, string> = {
  assignment: 'Úkol / práce',
  test: 'Test',
  presentation: 'Prezentace',
  exam: 'Zkouška',
  attendance: 'Docházka',
  other: 'Jiné',
};

/** Výchozí checklist podle typu povinnosti – ať student nezačíná od nuly. */
export function defaultSubtasks(type: RequirementType, source: 'moodle' | 'manual' | 'parser' = 'manual'): { id: string; title: string; done: boolean }[] {
  const titles: Record<RequirementType, string[]> = {
    assignment: [
      'Projít zadání a hodnoticí kritéria',
      'Rešerše a podklady',
      'Napsat první verzi',
      'Korektura a citace',
      source === 'moodle' ? 'Odevzdat na Moodle' : 'Odevzdat',
    ],
    test: ['Projít prezentace z přednášek', 'Udělat výpisky', 'Procvičit modelové otázky'],
    presentation: ['Připravit osnovu', 'Vytvořit slidy', 'Nacvičit prezentaci'],
    exam: ['Přihlásit se na termín v SISu', 'Projít okruhy ke zkoušce', 'Zopakovat materiály'],
    attendance: ['Hlídat povolený počet absencí'],
    other: [],
  };
  return titles[type].map((title) => ({ id: uid('st'), title, done: false }));
}

/** Odhad typu povinnosti z názvu (Moodle, sylabus). */
export function guessRequirementType(title: string, moduleName?: string): RequirementType {
  const t = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (moduleName === 'quiz' || /\b(test|kviz|quiz|pisemk|kolokvi|midterm)/.test(t)) return 'test';
  if (/(zkousk|exam|zaverecn[aey] (pisemn|ustn))/.test(t) && !/zkouskov/.test(t)) return 'exam';
  if (/(prezentac|referat|vystoupen)/.test(t)) return 'presentation';
  if (/(dochazk|ucast|absenc)/.test(t)) return 'attendance';
  if (moduleName === 'assign' || /(prace|esej|ukol|projekt|reflex|resers|analyz|anotac|report|protokol)/.test(t)) return 'assignment';
  return 'other';
}
