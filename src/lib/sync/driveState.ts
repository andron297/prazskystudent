/**
 * Synchronizace všech dat mezi zařízeními přes Google Disk (skrytá složka aplikace).
 * Snímek obsahuje data bez ukázkových položek; slučuje se po položkách podle
 * `updatedAt` a výslovných smazání (tombstones), takže se nic neztratí,
 * i když se na dvou zařízeních pracovalo zároveň.
 */
import type { GoogleSyncState, Material, Milestone, Requirement, ScheduleEvent, Settings, Subject, SyncLink, Task } from '../../types';
import { hashString } from '../id';
import { keyOf } from './keys';

export const STATE_FILE_NAME = 'stihnu-state.json';

/** Nastavení, která se sdílejí mezi zařízeními (motiv, režim a poloha zůstávají v zařízení). */
export const SHARED_SETTING_KEYS = [
  'golemioApiKey',
  'googleMapsApiKey',
  'anthropicApiKey',
  'moodle',
  'icsSources',
  'icsRefreshHours',
  'bufferMinutes',
  'comfortMinutes',
  'walkSpeed',
  'accessibleOnly',
  'preferAirConditioned',
  'reminders',
  'buildings',
  'locationAliases',
  'weather',
  'displayName',
] as const satisfies readonly (keyof Settings)[];

export type SharedSettings = Partial<Pick<Settings, (typeof SHARED_SETTING_KEYS)[number]>>;

export interface SnapshotData {
  subjects: Subject[];
  events: ScheduleEvent[];
  requirements: Requirement[];
  tasks: Task[];
  materials: Material[];
  milestones: Milestone[];
  tombstones: Record<string, string>;
  settings?: SharedSettings;
  settingsUpdatedAt?: string;
  google?: Pick<GoogleSyncState, 'links' | 'containers' | 'excluded'>;
}

export interface StateSnapshot {
  format: 'stihnu-state';
  version: 1;
  savedAt: string;
  deviceId: string;
  data: SnapshotData;
}

export function pickSharedSettings(settings: Settings): SharedSettings {
  const out: Record<string, unknown> = {};
  for (const key of SHARED_SETTING_KEYS) out[key] = settings[key];
  return out as SharedSettings;
}

/** Data k uložení na Disk (bez ukázkových položek a zrcadel cizích kalendářů). */
export function snapshotData(input: SnapshotData): SnapshotData {
  return {
    subjects: input.subjects.filter((x) => !x.demo),
    events: input.events.filter((e) => !e.demo && !e.google?.readOnly),
    requirements: input.requirements.filter((r) => !r.demo),
    tasks: input.tasks.filter((t) => !t.demo),
    materials: input.materials.filter((m) => !m.demo),
    milestones: input.milestones.filter((m) => m.source !== 'demo'),
    tombstones: input.tombstones,
    settings: input.settings,
    settingsUpdatedAt: input.settingsUpdatedAt,
    google: input.google,
  };
}

export function buildSnapshot(data: SnapshotData, deviceId: string, now: Date): StateSnapshot {
  return { format: 'stihnu-state', version: 1, savedAt: now.toISOString(), deviceId, data: snapshotData(data) };
}

export function parseSnapshot(text: string): StateSnapshot | null {
  try {
    const parsed = JSON.parse(text) as StateSnapshot;
    if (parsed?.format !== 'stihnu-state' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

const EPOCH = '1970-01-01T00:00:00.000Z';

function stamp(item: { updatedAt?: string; createdAt?: string }): string {
  return item.updatedAt ?? item.createdAt ?? EPOCH;
}

function mergeCollection<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  remote: T[],
  tombstones: Record<string, string>,
  key: (item: T) => string,
): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) {
    const current = map.get(item.id);
    if (!current || stamp(item) > stamp(current)) map.set(item.id, item);
  }
  return [...map.values()].filter((item) => {
    const deletedAt = tombstones[key(item)];
    return !deletedAt || deletedAt < stamp(item);
  });
}

function mergeTombstones(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || out[k] < v) out[k] = v;
  return out;
}

function mergeLinks(a: Record<string, SyncLink> = {}, b: Record<string, SyncLink> = {}): Record<string, SyncLink> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || out[k].syncedAt < v.syncedAt) out[k] = v;
  return out;
}

function fingerprint(data: SnapshotData): string {
  const sortById = <T extends { id: string }>(list: T[]) => [...list].sort((x, y) => x.id.localeCompare(y.id));
  return hashString(
    JSON.stringify([
      sortById(data.subjects),
      sortById(data.events),
      sortById(data.requirements),
      sortById(data.tasks),
      sortById(data.materials),
      sortById(data.milestones),
      Object.entries(data.tombstones).sort(),
      data.settingsUpdatedAt ?? '',
    ]),
  ).toString(36);
}

export interface MergeOutcome {
  merged: SnapshotData;
  /** Lokální data se změnila (je co převzít z Disku). */
  changedLocal: boolean;
  /** Snímek na Disku je potřeba přepsat. */
  changedRemote: boolean;
  added: number;
  removed: number;
}

export function mergeSnapshots(local: SnapshotData, remote: SnapshotData): MergeOutcome {
  const tombstones = mergeTombstones(local.tombstones ?? {}, remote.tombstones ?? {});
  const merged: SnapshotData = {
    subjects: mergeCollection(local.subjects, remote.subjects ?? [], tombstones, (x) => keyOf.subject(x.id)),
    events: mergeCollection(local.events, remote.events ?? [], tombstones, (x) => keyOf.event(x.id)),
    requirements: mergeCollection(local.requirements, remote.requirements ?? [], tombstones, (x) => keyOf.req(x.id)),
    tasks: mergeCollection(local.tasks, remote.tasks ?? [], tombstones, (x) => keyOf.task(x.id)),
    materials: mergeCollection(local.materials, remote.materials ?? [], tombstones, (x) => keyOf.material(x.id)),
    milestones: mergeCollection(local.milestones, remote.milestones ?? [], tombstones, (x) => keyOf.ms(x.id)),
    tombstones,
  };
  const remoteSettingsNewer = (remote.settingsUpdatedAt ?? '') > (local.settingsUpdatedAt ?? '');
  merged.settings = remoteSettingsNewer ? { ...local.settings, ...remote.settings } : local.settings;
  merged.settingsUpdatedAt = remoteSettingsNewer ? remote.settingsUpdatedAt : local.settingsUpdatedAt;
  if (local.google || remote.google) {
    merged.google = {
      links: mergeLinks(remote.google?.links, local.google?.links),
      containers: { ...remote.google?.containers, ...local.google?.containers },
      excluded: [...new Set([...(local.google?.excluded ?? []), ...(remote.google?.excluded ?? [])])],
    };
  }
  const count = (d: SnapshotData) => d.subjects.length + d.events.length + d.requirements.length + d.tasks.length + d.materials.length + d.milestones.length;
  const mergedPrint = fingerprint(merged);
  return {
    merged,
    changedLocal: mergedPrint !== fingerprint(local),
    changedRemote: mergedPrint !== fingerprint({ ...remote, subjects: remote.subjects ?? [], events: remote.events ?? [], requirements: remote.requirements ?? [], tasks: remote.tasks ?? [], materials: remote.materials ?? [], milestones: remote.milestones ?? [], tombstones: remote.tombstones ?? {} }),
    added: Math.max(0, count(merged) - count(local)),
    removed: Math.max(0, count(local) - count(merged)),
  };
}
