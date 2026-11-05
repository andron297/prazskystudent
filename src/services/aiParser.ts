/** Klient pro volitelné AI vylepšení parseru (`/api/ai-parse` – Claude, ChatGPT nebo Gemini). */
import type { MilestoneCategory, RequirementType } from '../types';
import { toDateKey } from '../lib/dates';
import { uid } from '../lib/id';
import type { ParseMode, ParsedItem } from '../lib/scheduleTextParser';
import { requestJson } from './http';
import { accountAuthHeader } from './authToken';

interface AiItem {
  title: string;
  category: MilestoneCategory;
  start: string | null;
  end: string | null;
  is_deadline: boolean;
  weight_percent: number | null;
  target: 'milestone' | 'requirement';
  requirement_type: RequirementType | null;
  source_line: string;
}

function normalizeDate(value: string | null): { value?: string; allDay: boolean } {
  if (!value) return { allDay: true };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { value, allDay: true };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (m) return { value: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString(), allDay: false };
  return { allDay: true };
}

export async function aiParseText(
  text: string,
  mode: ParseMode,
  options: { academicYearStart: number; today: Date; anthropicKey?: string },
): Promise<ParsedItem[]> {
  const data = await requestJson<{ items: AiItem[] }>('/api/ai-parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.anthropicKey?.trim() ? { 'x-ai-key': options.anthropicKey.trim() } : {}),
      ...accountAuthHeader(),
    },
    body: JSON.stringify({ text, mode, academicYearStart: options.academicYearStart, today: toDateKey(options.today) }),
    timeoutMs: 75_000,
  });
  return data.items.map((item) => {
    const start = normalizeDate(item.start);
    const end = normalizeDate(item.end);
    const target = mode === 'syllabus' ? item.target : 'milestone';
    return {
      id: uid('ai'),
      title: item.title.trim() || 'Termín',
      category: item.category,
      start: start.value,
      end: end.value && start.value && end.value >= start.value ? end.value : undefined,
      allDay: start.allDay,
      isDeadline: item.is_deadline,
      weight: item.weight_percent ?? undefined,
      requirementType: target === 'requirement' ? (item.requirement_type ?? 'other') : undefined,
      target,
      confidence: 0.9,
      sourceLine: item.source_line,
      selected: true,
    } satisfies ParsedItem;
  });
}
