/**
 * Které termíny z harmonogramu fakulty se studenta týkají. Harmonogram UK
 * obsahuje i doktorské studium, přijímací řízení, programy v cizím jazyce
 * nebo instituty jako CERGE – podle pár odpovědí je skryjeme.
 */
import type { Milestone } from '../types';
import { foldDiacritics } from './text';

export type StudyLevel = 'bc' | 'nmgr' | 'mgr' | 'phd';
export type StudyForm = 'prezencni' | 'kombinovana';

export interface StudyProfile {
  level: StudyLevel;
  /** Ročník (1–6). */
  year: number;
  form: StudyForm;
  language: 'cs' | 'en';
  answeredAt: string;
}

export const LEVEL_LABEL: Record<StudyLevel, string> = {
  bc: 'Bakalářské',
  nmgr: 'Navazující magisterské',
  mgr: 'Magisterské (nenavazující)',
  phd: 'Doktorské',
};

/** Poslední ročník daného typu studia (státnice, odevzdání závěrečné práce). */
function finalYear(p: StudyProfile): boolean {
  if (p.level === 'bc') return p.year >= 3;
  if (p.level === 'nmgr') return p.year >= 2;
  if (p.level === 'mgr') return p.year >= 5;
  return p.year >= 4;
}

export interface Relevance {
  relevant: boolean;
  /** Proč se termín skrývá (pro „Zobrazit skryté“). */
  reason?: string;
}

const has = (t: string, re: RegExp) => re.test(t);

export function milestoneRelevance(m: Pick<Milestone, 'title' | 'note'>, p: StudyProfile | undefined): Relevance {
  if (!p) return { relevant: true };
  const t = foldDiacritics(`${m.title} ${m.note ?? ''}`).replace(/\s+/g, ' ');

  if (has(t, /\bcerge\b/)) return { relevant: false, reason: 'CERGE-EI (samostatný institut)' };
  if (has(t, /uchazec|prijimaci|prijimacich|prihlas(ek|ky|ku) ke studiu|den otevrenych dveri|zapis (uchazecu|prijatych|novych)/)) {
    return { relevant: false, reason: 'přijímací řízení a uchazeči' };
  }
  const doctoral = has(t, /doktor|\bphd\b|ph\. ?d|disertac/);
  const bachelorOrMaster = has(t, /bakalar|magister/);
  if (doctoral && !bachelorOrMaster && p.level !== 'phd') return { relevant: false, reason: 'doktorské studium' };
  if (p.level === 'phd' && bachelorOrMaster && !doctoral) return { relevant: false, reason: 'bakalářské a magisterské studium' };
  if (has(t, /rigoroz/)) return { relevant: false, reason: 'rigorózní řízení' };

  const foreign = has(t, /v cizim jazyce|anglick\w* jazyce|v anglictine|english|programmes?\b|taught in/);
  if (foreign && p.language === 'cs') return { relevant: false, reason: 'programy v cizím jazyce' };
  if (p.language === 'en' && has(t, /v ceskem jazyce|v cestine/)) return { relevant: false, reason: 'programy v češtině' };

  // Jen pro jeden typ studia
  const onlyBc = has(t, /bakalar/) && !has(t, /magister/);
  const onlyMgr = has(t, /magister/) && !has(t, /bakalar/);
  if (onlyBc && p.level !== 'bc') return { relevant: false, reason: 'bakalářské studium' };
  if (onlyMgr && p.level === 'bc') return { relevant: false, reason: 'magisterské studium' };
  if (onlyMgr && has(t, /navazujic/) && p.level === 'mgr') return { relevant: false, reason: 'navazující magisterské studium' };

  if (has(t, /kombinovan/) && !has(t, /prezencn/) && p.form !== 'kombinovana') return { relevant: false, reason: 'kombinovaná forma studia' };
  if (has(t, /prezencn/) && !has(t, /kombinovan/) && p.form === 'kombinovana') return { relevant: false, reason: 'prezenční forma studia' };

  // Jen pro první ročník
  if (has(t, /imatrikulac|1\. rocnik|prvni rocnik|prvak|zapis do studia|adaptacni/) && p.year > 1) return { relevant: false, reason: 'jen pro první ročník' };
  // Jen pro poslední ročník
  if (has(t, /statni zaverecn|statnic|\bszz\b|promoc|odevzdani (bakalarske|diplomove|zaverecne|disertacni)|prihlaseni ke statni|obhajob[ay] (bakalarske|diplomove|zaverecne)/) && !finalYear(p)) {
    return { relevant: false, reason: 'jen pro poslední ročník' };
  }
  return { relevant: true };
}

export interface MilestoneFilter {
  profile?: StudyProfile;
  /** Ručně skryté a ručně zobrazené termíny (přebíjí pravidla). */
  hidden?: string[];
  shown?: string[];
}

export function isMilestoneVisible(m: Milestone, f: MilestoneFilter): boolean {
  if (f.shown?.includes(m.id)) return true;
  if (f.hidden?.includes(m.id)) return false;
  return milestoneRelevance(m, f.profile).relevant;
}

/** Termíny rozdělené na viditelné a skryté (s důvodem). */
export function splitMilestones(milestones: Milestone[], f: MilestoneFilter): { visible: Milestone[]; hidden: { milestone: Milestone; reason: string }[] } {
  const visible: Milestone[] = [];
  const hidden: { milestone: Milestone; reason: string }[] = [];
  for (const m of milestones) {
    if (f.shown?.includes(m.id)) {
      visible.push(m);
      continue;
    }
    if (f.hidden?.includes(m.id)) {
      hidden.push({ milestone: m, reason: 'skryto ručně' });
      continue;
    }
    const r = milestoneRelevance(m, f.profile);
    if (r.relevant) visible.push(m);
    else hidden.push({ milestone: m, reason: r.reason ?? 'netýká se vás' });
  }
  return { visible, hidden };
}
