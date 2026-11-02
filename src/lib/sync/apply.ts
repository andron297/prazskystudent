/**
 * Provedení výsledku synchronizace: lokální operace nad daty a sloučení vazeb.
 * Čisté funkce – používá je store i testy.
 */
import type { GoogleSyncState, Requirement, ScheduleEvent, SyncReport, Task } from '../../types';
import type { ServiceResult } from './engine';
import type { LocalOp } from './mapping';

export interface MutableData {
  events: ScheduleEvent[];
  tasks: Task[];
  requirements: Requirement[];
}

export function applyLocalOps<T extends MutableData>(data: T, ops: LocalOp[], now: Date): T {
  if (ops.length === 0) return data;
  const events = new Map(data.events.map((e) => [e.id, e]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const reqs = new Map(data.requirements.map((r) => [r.id, r]));
  const stamp = now.toISOString();
  for (const op of ops) {
    switch (op.type) {
      case 'upsertEvent':
        events.set(op.event.id, op.event);
        break;
      case 'removeEvent':
        events.delete(op.id);
        break;
      case 'upsertTask':
        tasks.set(op.task.id, op.task);
        break;
      case 'removeTask':
        tasks.delete(op.id);
        break;
      case 'setRequirementDone': {
        const r = reqs.get(op.id);
        if (!r) break;
        const allDone = r.subtasks.length > 0 && r.subtasks.every((s) => s.done);
        const subtasks = op.done ? r.subtasks.map((s) => ({ ...s, done: true })) : allDone ? r.subtasks.map((s) => ({ ...s, done: false })) : r.subtasks;
        reqs.set(op.id, { ...r, done: op.done, subtasks, updatedAt: stamp });
        break;
      }
      case 'setRequirementDeadline': {
        const r = reqs.get(op.id);
        if (r) reqs.set(op.id, { ...r, deadline: op.deadline, updatedAt: stamp });
        break;
      }
      case 'setSubtaskDone': {
        const r = reqs.get(op.requirementId);
        if (!r) break;
        const subtasks = r.subtasks.map((s) => (s.id === op.subtaskId ? { ...s, done: op.done } : s));
        reqs.set(r.id, { ...r, subtasks, done: subtasks.length > 0 && subtasks.every((s) => s.done), updatedAt: stamp });
        break;
      }
    }
  }
  return {
    ...data,
    events: [...events.values()].sort((a, b) => a.start.localeCompare(b.start)),
    tasks: [...tasks.values()],
    requirements: [...reqs.values()],
  };
}

/** Nahradí vazby dané služby výsledkem a doplní kontejnery a výjimky. */
export function mergeServiceState(state: GoogleSyncState, service: 'calendar' | 'tasks', result: ServiceResult): GoogleSyncState {
  const links = Object.fromEntries(Object.entries(state.links).filter(([, l]) => l.service !== service));
  return {
    ...state,
    links: { ...links, ...result.links },
    containers: { ...state.containers, ...result.containers },
    excluded: [...new Set([...state.excluded, ...result.excludedAdd])],
  };
}

export function emptySyncState(): GoogleSyncState {
  return { scopes: [], links: {}, containers: {}, excluded: [], history: [] };
}

export function combineReports(parts: ServiceResult[], services: SyncReport['services'], startedAt: number, now: Date, extraErrors: string[] = [], extraNotes: string[] = []): SyncReport {
  const sum = (pick: (r: ServiceResult) => { created: number; updated: number; deleted: number }) =>
    parts.reduce((acc, r) => ({ created: acc.created + pick(r).created, updated: acc.updated + pick(r).updated, deleted: acc.deleted + pick(r).deleted }), { created: 0, updated: 0, deleted: 0 });
  const errors = [...parts.flatMap((r) => r.errors), ...extraErrors];
  return {
    at: now.toISOString(),
    ok: errors.length === 0,
    durationMs: Math.max(0, Date.now() - startedAt),
    services,
    pushed: sum((r) => r.pushed),
    pulled: sum((r) => r.pulled),
    conflicts: parts.reduce((s, r) => s + r.conflicts, 0),
    errors,
    notes: [...parts.flatMap((r) => r.notes), ...extraNotes],
  };
}
