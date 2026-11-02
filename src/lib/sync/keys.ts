/**
 * Klíče položek pro synchronizaci a mazání (tombstones). Klíč je stabilní napříč
 * zařízeními – stejně se jmenuje lokálně, v odkazech na Google i v záloze na Disku.
 */
import type { LocalKey } from '../../types';

export type KeyType = 'event' | 'task' | 'req' | 'sub' | 'ms' | 'subject' | 'material';

export const keyOf = {
  event: (id: string): LocalKey => `event:${id}`,
  task: (id: string): LocalKey => `task:${id}`,
  req: (id: string): LocalKey => `req:${id}`,
  sub: (requirementId: string, subtaskId: string): LocalKey => `sub:${requirementId}:${subtaskId}`,
  ms: (id: string): LocalKey => `ms:${id}`,
  subject: (id: string): LocalKey => `subject:${id}`,
  material: (id: string): LocalKey => `material:${id}`,
};

export interface ParsedKey {
  type: KeyType;
  id: string;
  /** U podúkolu ID povinnosti. */
  parentId?: string;
}

export function parseKey(key: LocalKey): ParsedKey | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const type = key.slice(0, i) as KeyType;
  const rest = key.slice(i + 1);
  if (type === 'sub') {
    const j = rest.indexOf(':');
    if (j <= 0) return null;
    return { type, parentId: rest.slice(0, j), id: rest.slice(j + 1) };
  }
  if (!['event', 'task', 'req', 'ms', 'subject', 'material'].includes(type)) return null;
  return { type, id: rest };
}

/** Tombstones starší než `days` dní se zahazují (stačí, aby se smazání stihlo rozšířit). */
export function pruneTombstones(tombstones: Record<LocalKey, string>, now: Date, days = 45): Record<LocalKey, string> {
  const limit = now.getTime() - days * 86_400_000;
  const out: Record<LocalKey, string> = {};
  for (const [key, at] of Object.entries(tombstones)) if (new Date(at).getTime() >= limit) out[key] = at;
  return out;
}
