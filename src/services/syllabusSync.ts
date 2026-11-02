/**
 * Sylaby ze SISu: stáhne veřejnou stránku předmětu (podle kódu, jinak podle
 * názvu), uloží sylabus a z podmínek zakončení vytáhne povinnosti – s AI
 * (Claude), když je k dispozici, jinak lokálními pravidly. Po obnovení
 * rozvrhu ze SISu se doplní sylaby předmětům, které ho ještě nemají.
 * Do SISu chodí dotazy po jednom s pauzou, ať ho zbytečně nezatěžujeme.
 */
import { create } from 'zustand';
import type { Requirement, Subject } from '../types';
import { academicYearStart } from '../lib/dates';
import { parseSisSyllabus } from '../lib/sisImport';
import type { ParsedItem } from '../lib/scheduleTextParser';
import { localSyllabusItems, mergeSyllabusItems, syllabusText } from '../lib/syllabusExtract';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { toast, useUiStore } from '../store/uiStore';
import { createApi, type StudyApi } from './api';
import { errorMessage, sleep } from './http';

interface SyllabusSyncState {
  busy: Record<string, boolean>;
  running: boolean;
  progress: { done: number; total: number } | null;
}

export const useSyllabusSync = create<SyllabusSyncState>()(() => ({ busy: {}, running: false, progress: null }));

const STALE_MS = 45 * 86_400_000;
const MAX_PER_RUN = 20;

export function sisQueryFor(subject: Subject): { code?: string; name?: string } | null {
  const code = subject.code?.trim().toUpperCase();
  if (code && /^[A-Z0-9]{3,12}$/.test(code)) return { code };
  const name = subject.name.trim();
  return name.length >= 3 ? { name: name.slice(0, 120) } : null;
}

export interface ExtractResult {
  items: ParsedItem[];
  engine: 'ai' | 'local';
}

/** Povinnosti ze sylabu: AI (pokud je), při chybě nebo bez ní lokální pravidla. */
export async function extractSyllabusItems(text: string, api: StudyApi, now: Date): Promise<ExtractResult> {
  if (api.canUseAi) {
    try {
      const result = await api.aiParse(text, 'syllabus', academicYearStart(now), now);
      if (result.engine === 'ai') return { items: result.items, engine: 'ai' };
    } catch {
      /* AI nedostupná → lokální pravidla */
    }
  }
  return { items: localSyllabusItems(text, now), engine: 'local' };
}

/**
 * Vytáhne z textu (podmínky zakončení, stránka kurzu…) povinnosti a přidá je
 * k předmětu – jen ty, které tam ještě nejsou.
 */
export async function addRequirementsFromText(subjectId: string, text: string, sourceTag: string, api?: StudyApi): Promise<{ requirements: Requirement[]; enriched?: number; engine?: ExtractResult['engine'] }> {
  if (text.trim().length < 20) return { requirements: [] };
  const app = useAppStore.getState();
  const client = api ?? createApi(app.settings, useUiStore.getState().server, appNow);
  const now = appNow();
  const extracted = await extractSyllabusItems(text, client, now);
  const current = useAppStore.getState();
  const subject = current.subjects.find((s) => s.id === subjectId);
  if (!subject) return { requirements: [], engine: extracted.engine };
  const { created, enriched } = mergeSyllabusItems(extracted.items, subject, current.requirements, now, sourceTag);
  if (created.length || enriched.length) current.addRequirements([...enriched, ...created]);
  return { requirements: created, enriched: enriched.length, engine: extracted.engine };
}

export function requirementsCountText(n: number): string {
  return `${n} ${n === 1 ? 'povinnost' : n >= 2 && n <= 4 ? 'povinnosti' : 'povinností'}`;
}

export interface SyllabusImportResult {
  ok: boolean;
  created: number;
  requirements: Requirement[];
  engine?: 'ai' | 'local';
  message: string;
}

export async function importSyllabus(subjectId: string, options: { manual?: boolean } = {}): Promise<SyllabusImportResult> {
  const app = useAppStore.getState();
  const subject = app.subjects.find((s) => s.id === subjectId);
  const query = subject ? sisQueryFor(subject) : null;
  if (!subject || !query) return { ok: false, created: 0, requirements: [], message: 'Předmět nemá kód ani název pro vyhledání v SISu.' };
  useSyllabusSync.setState((s) => ({ busy: { ...s.busy, [subjectId]: true } }));
  try {
    const api = createApi(app.settings, useUiStore.getState().server, appNow);
    const page = await api.fetchSisSubject(query);
    const parsed = parseSisSyllabus(page.text, page.url, appNow());
    if (!parsed) throw new Error('Stránku předmětu v SISu se nepodařilo přečíst.');
    const store = useAppStore.getState();
    store.setSubjectSyllabus(subjectId, parsed.syllabus);
    const latest = useAppStore.getState().subjects.find((s) => s.id === subjectId) ?? subject;
    if (!latest.code && (parsed.code ?? page.code)) store.upsertSubject({ ...latest, code: parsed.code ?? page.code });

    const text = syllabusText(parsed.syllabus);
    const { requirements, enriched = 0, engine } = await addRequirementsFromText(subjectId, text, `sis:${parsed.code ?? page.code}`, api);
    const created = requirements.length;
    const details = [
      created ? `${created} ${created === 1 ? 'nová povinnost' : created < 5 ? 'nové povinnosti' : 'nových povinností'}` : '',
      enriched ? `${enriched}× doplněna váha či termín` : '',
    ].filter(Boolean);
    const message = details.length
      ? `${subject.name}: sylabus stažen, ${details.join(', ')}${engine === 'ai' ? ' (AI)' : ''}`
      : `${subject.name}: sylabus stažen${text ? ', povinnosti sedí' : ''}`;
    if (options.manual) toast.success(message);
    return { ok: true, created, requirements, engine, message };
  } catch (error) {
    const message = errorMessage(error);
    if (options.manual) toast.error(message);
    return { ok: false, created: 0, requirements: [], message };
  } finally {
    useSyllabusSync.setState((s) => {
      const busy = { ...s.busy };
      delete busy[subjectId];
      return { busy };
    });
  }
}

/** Předměty, kterým chybí (nebo zastaral) sylabus – v aktuálním režimu. */
export function subjectsNeedingSyllabus(subjects: Subject[], mode: 'demo' | 'live', now: Date, all = false): Subject[] {
  return subjects.filter((s) => {
    if (mode === 'live' ? s.demo : !s.demo) return false;
    if (!sisQueryFor(s)) return false;
    if (all || !s.syllabus) return true;
    return now.getTime() - new Date(s.syllabus.importedAt).getTime() > STALE_MS;
  });
}

export async function importAllSyllabi(options: { manual?: boolean; all?: boolean } = {}): Promise<{ subjects: number; created: number; failed: number }> {
  if (useSyllabusSync.getState().running) return { subjects: 0, created: 0, failed: 0 };
  const app = useAppStore.getState();
  const targets = subjectsNeedingSyllabus(app.subjects, app.settings.mode, appNow(), options.all).slice(0, MAX_PER_RUN);
  if (targets.length === 0) {
    if (options.manual) toast.info('Všechny předměty už sylabus mají.');
    return { subjects: 0, created: 0, failed: 0 };
  }
  useSyllabusSync.setState({ running: true, progress: { done: 0, total: targets.length } });
  let created = 0;
  let failed = 0;
  let ai = false;
  let lastError = '';
  try {
    for (const [i, subject] of targets.entries()) {
      if (i > 0) await sleep(app.settings.mode === 'live' ? 1200 : 150);
      const result = await importSyllabus(subject.id);
      if (!result.ok) {
        failed++;
        lastError = result.message;
      }
      created += result.created;
      ai ||= result.engine === 'ai';
      useSyllabusSync.setState({ progress: { done: i + 1, total: targets.length } });
    }
  } finally {
    useSyllabusSync.setState({ running: false, progress: null });
  }
  const ok = targets.length - failed;
  if (options.manual || created > 0) {
    const text = `Sylaby ze SISu: ${ok}/${targets.length} předmětů · ${created} ${created === 1 ? 'povinnost' : created < 5 && created > 0 ? 'povinnosti' : 'povinností'}${ai ? ' (vytáhla AI)' : ''}`;
    if (failed && options.manual) toast.error(`${text}. ${lastError}`);
    else toast.success(text);
  }
  return { subjects: ok, created, failed };
}
