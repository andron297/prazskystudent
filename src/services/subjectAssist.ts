/**
 * Chytré přiřazení úkolů k předmětům. Jistý odhad se uloží hned (s možností
 * změny), nejistý se jen nabídne v Úkolech. Nic se nikam neposílá – vše běží
 * v zařízení nad tím, co už aplikace ví (rozvrh, sylaby, termíny, tvoje úkoly).
 */
import { useMemo } from 'react';
import type { Task } from '../types';
import { duplicateSubjects, type SubjectDuplicate } from '../lib/dedupe';
import { buildMatchContext, guessSubject, type MatchContext, type SubjectGuess } from '../lib/subjectMatch';
import { useAppStore, type AppState } from '../store/appStore';
import { toast } from '../store/uiStore';

let ctxCache: { key: unknown[]; ctx: MatchContext } | null = null;

/** Kontext pro odhady (přepočítá se jen při změně předmětů, rozvrhu, termínů nebo úkolů). */
export function matchContext(state: Pick<AppState, 'subjects' | 'events' | 'requirements' | 'tasks'>): MatchContext {
  const key = [state.subjects, state.events, state.requirements, state.tasks];
  if (ctxCache && ctxCache.key.every((k, i) => k === key[i])) return ctxCache.ctx;
  const ctx = buildMatchContext(state);
  ctxCache = { key, ctx };
  return ctx;
}

function candidate(t: Task): boolean {
  return !t.subjectId && !t.done && !t.notSubjects?.includes('*');
}

export function guessForTask(t: Task, ctx: MatchContext): SubjectGuess | null {
  return guessSubject({ title: t.title, notes: t.notes, due: t.due, createdAt: t.source === 'manual' ? t.createdAt : undefined }, ctx, { exclude: t.notSubjects });
}

/** Odhad pro text, který student právě píše (rychlé zadání, formulář úkolu). */
export function guessForText(input: { title: string; notes?: string; due?: string }): SubjectGuess | null {
  if (input.title.trim().length < 3) return null;
  return guessSubject({ ...input, createdAt: new Date().toISOString() }, matchContext(useAppStore.getState()));
}

const seen = new Map<string, string>();

/** Projde nové úkoly bez předmětu a jisté případy rovnou přiřadí. Vrací počet přiřazených. */
export function autoAssignSubjects(): number {
  const state = useAppStore.getState();
  if (state.subjects.length === 0) return 0;
  const todo = state.tasks.filter((t) => candidate(t) && seen.get(t.id) !== t.title + (t.notes ?? ''));
  if (todo.length === 0) return 0;
  const ctx = matchContext(state);
  let assigned = 0;
  for (const t of todo) {
    seen.set(t.id, t.title + (t.notes ?? ''));
    const guess = guessForTask(t, ctx);
    if (guess?.confidence === 'high') {
      state.setTaskSubject(t.id, guess.subjectId, 'auto');
      assigned++;
    }
  }
  return assigned;
}

/* ------------------------------------------------------------------ */
/* Zdvojené předměty                                                   */
/* ------------------------------------------------------------------ */

function subjectUsage(state: AppState): Map<string, number> {
  const usage = new Map<string, number>();
  for (const list of [state.events, state.requirements, state.tasks, state.materials] as { subjectId?: string }[][]) {
    for (const x of list) if (x.subjectId) usage.set(x.subjectId, (usage.get(x.subjectId) ?? 0) + 1);
  }
  return usage;
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

/** Jistě zdvojené předměty (stejný kód nebo úplně stejný název) sloučí hned. */
export function autoMergeSubjects(): string[] {
  const state = useAppStore.getState();
  const distinct = new Set(state.settings.distinctSubjects ?? []);
  const sure = duplicateSubjects(state.subjects, subjectUsage(state)).filter((d) => d.confidence === 'sure' && !distinct.has(pairKey(d.keep.id, d.drop.id)));
  for (const d of sure) useAppStore.getState().mergeSubjects(d.drop.id, d.keep.id);
  return sure.map((d) => d.keep.name);
}

/** Možné duplicity, na které se zeptáme (Předměty). */
export function useSubjectDuplicates(): SubjectDuplicate[] {
  const subjects = useAppStore((s) => s.subjects);
  const distinct = useAppStore((s) => s.settings.distinctSubjects);
  return useMemo(() => {
    const state = useAppStore.getState();
    const skip = new Set(distinct ?? []);
    return duplicateSubjects(subjects, subjectUsage(state)).filter((d) => d.confidence === 'maybe' && !skip.has(pairKey(d.keep.id, d.drop.id)));
  }, [subjects, distinct]);
}

export function markSubjectsDistinct(a: string, b: string): void {
  const state = useAppStore.getState();
  state.updateSettings({ distinctSubjects: [...new Set([...(state.settings.distinctSubjects ?? []), pairKey(a, b)])] });
}

let started = false;

export function startSubjectAssist(): void {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const merged = autoMergeSubjects();
      if (merged.length > 0) toast.info(`Zdvojené předměty jsou sloučené: ${[...new Set(merged)].join(', ')}.`);
      autoAssignSubjects();
    }, 400);
  };
  schedule();
  useAppStore.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks || s.subjects !== prev.subjects) schedule();
  });
}

/** Návrhy pro úkoly, u kterých si nejsme jistí (zobrazí se v Úkolech). */
export function useSubjectSuggestions(): Map<string, SubjectGuess> {
  const tasks = useAppStore((s) => s.tasks);
  const subjects = useAppStore((s) => s.subjects);
  const events = useAppStore((s) => s.events);
  const requirements = useAppStore((s) => s.requirements);
  return useMemo(() => {
    const out = new Map<string, SubjectGuess>();
    if (subjects.length === 0) return out;
    const ctx = matchContext({ tasks, subjects, events, requirements });
    for (const t of tasks) {
      if (!candidate(t)) continue;
      const guess = guessForTask(t, ctx);
      if (guess && guess.confidence !== 'high') out.set(t.id, guess);
    }
    return out;
  }, [tasks, subjects, events, requirements]);
}
