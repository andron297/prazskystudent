/**
 * Hlavní stav aplikace (Zustand) s perzistencí do localStorage.
 * Struktura je připravená na backend: viz `lib/persistence.ts` (startRemoteSync).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AppMode,
  Building,
  DataSource,
  Material,
  Milestone,
  MoodleConnection,
  IcsConnection,
  OriginPref,
  Requirement,
  ScheduleEvent,
  Settings,
  Subject,
} from '../types';
import { DEFAULT_BUILDINGS, locationAliasKey, resolveBuilding } from '../lib/buildings';
import { deleteBlob } from '../lib/blobStore';
import { calendarDayDiff, fromDateKey, shiftByDays, startOfDay, toDateKey } from '../lib/dates';
import { uid } from '../lib/id';
import { safeLocalStorage } from '../lib/persistence';
import { createDemoSeed } from '../services/demo/seed';
import type { MoodleSyncResult } from '../services/moodleSync';

export const DEFAULT_SETTINGS: Settings = {
  mode: 'demo',
  theme: 'system',
  golemioApiKey: '',
  googleMapsApiKey: '',
  googleOAuthClientId: '',
  anthropicApiKey: '',
  moodle: null,
  ics: null,
  bufferMinutes: 5,
  comfortMinutes: 8,
  walkSpeed: 'normal',
  accessibleOnly: false,
  preferAirConditioned: false,
  origin: {
    demo: { source: 'preset', presetId: 'kajetanka' },
    live: { source: 'gps', presetId: 'kajetanka' },
  },
  demoClock: true,
  reminders: [1440, 120],
  buildings: DEFAULT_BUILDINGS,
  locationAliases: {},
};

export interface AppData {
  subjects: Subject[];
  events: ScheduleEvent[];
  requirements: Requirement[];
  materials: Material[];
  milestones: Milestone[];
}

export interface AppMeta {
  demoSeedDate?: string;
  welcomeDismissed: boolean;
}

export interface IcsImportPayload {
  subjects: Subject[];
  events: ScheduleEvent[];
  replaceSources: DataSource[];
  connection?: IcsConnection | null;
  demo?: boolean;
}

export interface AppState extends AppData {
  settings: Settings;
  meta: AppMeta;

  toggleSubtask: (requirementId: string, subtaskId: string) => void;
  addSubtask: (requirementId: string, title: string) => void;
  renameSubtask: (requirementId: string, subtaskId: string, title: string) => void;
  removeSubtask: (requirementId: string, subtaskId: string) => void;
  toggleRequirementDone: (requirementId: string) => void;
  upsertRequirement: (requirement: Requirement) => void;
  addRequirements: (requirements: Requirement[]) => void;
  removeRequirement: (requirementId: string) => void;

  upsertSubject: (subject: Subject) => void;
  removeSubject: (subjectId: string) => void;

  addMaterial: (material: Material) => void;
  updateMaterial: (materialId: string, patch: Partial<Material>) => void;
  removeMaterial: (materialId: string) => void;

  upsertEvent: (event: ScheduleEvent) => void;
  removeEvent: (eventId: string) => void;

  addMilestones: (milestones: Milestone[]) => void;
  updateMilestone: (milestoneId: string, patch: Partial<Milestone>) => void;
  removeMilestone: (milestoneId: string) => void;

  applyIcsImport: (payload: IcsImportPayload) => void;
  applyMoodleSync: (result: MoodleSyncResult, connection: MoodleConnection, demo: boolean) => void;
  disconnectMoodle: () => void;
  disconnectIcs: () => void;

  updateSettings: (patch: Partial<Settings>) => void;
  setMode: (mode: AppMode) => void;
  setOrigin: (mode: AppMode, origin: OriginPref) => void;
  setLocationAlias: (location: string, buildingId: string) => void;
  upsertBuilding: (building: Building) => void;
  removeBuilding: (buildingId: string) => void;
  resetBuildings: () => void;

  rebaseDemo: (today: Date) => void;
  resetDemo: (now: Date) => void;
  clearDemoData: () => void;
  clearAllData: () => void;
  importBackup: (data: Partial<AppData> & { settings?: Partial<Settings> }) => void;
  dismissWelcome: () => void;
}

function initialData(): AppData & { meta: AppMeta } {
  const seed = createDemoSeed(new Date());
  return {
    subjects: seed.subjects,
    events: seed.events,
    requirements: seed.requirements,
    materials: seed.materials,
    milestones: seed.milestones,
    meta: { demoSeedDate: seed.seedDate, welcomeDismissed: false },
  };
}

function mapRequirement(list: Requirement[], id: string, fn: (r: Requirement) => Requirement): Requirement[] {
  return list.map((r) => (r.id === id ? fn(r) : r));
}

function upsertById<T extends { id: string }>(list: T[], items: T[]): T[] {
  const index = new Map(list.map((item, i) => [item.id, i]));
  const next = [...list];
  for (const item of items) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, next.length);
      next.push(item);
    } else {
      next[i] = item;
    }
  }
  return next;
}

const PERSIST_KEY = 'stihnu:v1';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      settings: DEFAULT_SETTINGS,

      toggleSubtask: (requirementId, subtaskId) =>
        set((s) => ({
          requirements: mapRequirement(s.requirements, requirementId, (r) => {
            const subtasks = r.subtasks.map((st) => (st.id === subtaskId ? { ...st, done: !st.done } : st));
            return { ...r, subtasks, done: subtasks.length > 0 && subtasks.every((st) => st.done) };
          }),
        })),
      addSubtask: (requirementId, title) =>
        set((s) => ({
          requirements: mapRequirement(s.requirements, requirementId, (r) => ({
            ...r,
            subtasks: [...r.subtasks, { id: uid('st'), title: title.trim(), done: false }],
            done: false,
          })),
        })),
      renameSubtask: (requirementId, subtaskId, title) =>
        set((s) => ({
          requirements: mapRequirement(s.requirements, requirementId, (r) => ({
            ...r,
            subtasks: r.subtasks.map((st) => (st.id === subtaskId ? { ...st, title } : st)),
          })),
        })),
      removeSubtask: (requirementId, subtaskId) =>
        set((s) => ({
          requirements: mapRequirement(s.requirements, requirementId, (r) => {
            const subtasks = r.subtasks.filter((st) => st.id !== subtaskId);
            return { ...r, subtasks, done: subtasks.length > 0 ? subtasks.every((st) => st.done) : r.done };
          }),
        })),
      toggleRequirementDone: (requirementId) =>
        set((s) => ({
          requirements: mapRequirement(s.requirements, requirementId, (r) => {
            if (r.subtasks.length === 0) return { ...r, done: !r.done };
            const target = !r.subtasks.every((st) => st.done);
            return { ...r, done: target, subtasks: r.subtasks.map((st) => ({ ...st, done: target })) };
          }),
        })),
      upsertRequirement: (requirement) => set((s) => ({ requirements: upsertById(s.requirements, [requirement]) })),
      addRequirements: (requirements) => set((s) => ({ requirements: upsertById(s.requirements, requirements) })),
      removeRequirement: (requirementId) =>
        set((s) => ({
          requirements: s.requirements.filter((r) => r.id !== requirementId),
          materials: s.materials.map((m) => (m.requirementId === requirementId ? { ...m, requirementId: undefined } : m)),
        })),

      upsertSubject: (subject) => set((s) => ({ subjects: upsertById(s.subjects, [subject]) })),
      removeSubject: (subjectId) => {
        const { materials } = get();
        for (const m of materials) if (m.subjectId === subjectId && m.blobKey) void deleteBlob(m.blobKey);
        set((s) => ({
          subjects: s.subjects.filter((x) => x.id !== subjectId),
          events: s.events.filter((e) => e.subjectId !== subjectId),
          requirements: s.requirements.filter((r) => r.subjectId !== subjectId),
          materials: s.materials.filter((m) => m.subjectId !== subjectId),
          milestones: s.milestones.filter((m) => m.subjectId !== subjectId),
        }));
      },

      addMaterial: (material) => set((s) => ({ materials: [...s.materials, material] })),
      updateMaterial: (materialId, patch) =>
        set((s) => ({
          materials: s.materials.map((m) => (m.id === materialId ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m)),
        })),
      removeMaterial: (materialId) => {
        const material = get().materials.find((m) => m.id === materialId);
        if (material?.blobKey) void deleteBlob(material.blobKey);
        set((s) => ({ materials: s.materials.filter((m) => m.id !== materialId) }));
      },

      upsertEvent: (event) => set((s) => ({ events: upsertById(s.events, [event]) })),
      removeEvent: (eventId) => set((s) => ({ events: s.events.filter((e) => e.id !== eventId) })),

      addMilestones: (milestones) => set((s) => ({ milestones: upsertById(s.milestones, milestones) })),
      updateMilestone: (milestoneId, patch) =>
        set((s) => ({ milestones: s.milestones.map((m) => (m.id === milestoneId ? { ...m, ...patch } : m)) })),
      removeMilestone: (milestoneId) => set((s) => ({ milestones: s.milestones.filter((m) => m.id !== milestoneId) })),

      applyIcsImport: ({ subjects, events, replaceSources, connection, demo }) =>
        set((s) => {
          const mark = <T extends object>(items: T[]) => (demo ? items.map((i) => ({ ...i, demo: true })) : items);
          const kept = s.events.filter((e) => !replaceSources.includes(e.source));
          return {
            subjects: upsertById(s.subjects, mark(subjects)),
            events: upsertById(kept, mark(events)).sort((a, b) => a.start.localeCompare(b.start)),
            settings: connection === undefined ? s.settings : { ...s.settings, ics: connection },
          };
        }),
      applyMoodleSync: (result, connection, demo) =>
        set((s) => {
          const existingReq = new Set(s.requirements.map((r) => r.id));
          const existingMat = new Set(s.materials.map((m) => m.id));
          const existingSubj = new Set(s.subjects.map((x) => x.id));
          const flag = <T extends { id: string; demo?: boolean }>(items: T[], known: Set<string>) =>
            items.map((item) => (demo && !known.has(item.id) ? { ...item, demo: true } : item));
          return {
            subjects: upsertById(s.subjects, flag(result.subjects, existingSubj)),
            requirements: upsertById(s.requirements, flag(result.requirements, existingReq)),
            materials: upsertById(s.materials, flag(result.materials, existingMat)),
            settings: {
              ...s.settings,
              moodle: {
                ...connection,
                userId: result.site.userid,
                siteName: result.site.sitename,
                fullName: result.site.fullname,
                lastSync: new Date().toISOString(),
                stats: { courses: result.stats.courses, requirements: result.stats.requirements, materials: result.stats.materials },
              },
            },
          };
        }),
      disconnectMoodle: () => set((s) => ({ settings: { ...s.settings, moodle: null } })),
      disconnectIcs: () => set((s) => ({ settings: { ...s.settings, ics: null } })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setMode: (mode) => set((s) => ({ settings: { ...s.settings, mode } })),
      setOrigin: (mode, origin) => set((s) => ({ settings: { ...s.settings, origin: { ...s.settings.origin, [mode]: origin } } })),
      setLocationAlias: (location, buildingId) =>
        set((s) => {
          const aliases = { ...s.settings.locationAliases, [locationAliasKey(location)]: buildingId };
          const events = s.events.map((e) => {
            if (!e.location || locationAliasKey(e.location) !== locationAliasKey(location)) return e;
            return { ...e, buildingId };
          });
          return { events, settings: { ...s.settings, locationAliases: aliases } };
        }),
      upsertBuilding: (building) =>
        set((s) => {
          const buildings = upsertById(s.settings.buildings, [building]);
          const events = s.events.map((e) => {
            if (e.buildingId || !e.location) return e;
            const match = resolveBuilding(e.location, buildings, s.settings.locationAliases);
            return match.building ? { ...e, buildingId: match.building.id, room: e.room ?? match.room } : e;
          });
          return { events, settings: { ...s.settings, buildings } };
        }),
      removeBuilding: (buildingId) =>
        set((s) => ({
          settings: { ...s.settings, buildings: s.settings.buildings.filter((b) => b.id !== buildingId) },
          events: s.events.map((e) => (e.buildingId === buildingId ? { ...e, buildingId: undefined } : e)),
        })),
      resetBuildings: () =>
        set((s) => {
          const custom = s.settings.buildings.filter((b) => b.custom);
          return { settings: { ...s.settings, buildings: [...DEFAULT_BUILDINGS, ...custom] } };
        }),

      rebaseDemo: (today) =>
        set((s) => {
          if (!s.meta.demoSeedDate) return {};
          const delta = calendarDayDiff(startOfDay(today), fromDateKey(s.meta.demoSeedDate));
          if (delta === 0) return {};
          return {
            events: s.events.map((e) => (e.demo ? { ...e, start: shiftByDays(e.start, delta), end: shiftByDays(e.end, delta) } : e)),
            requirements: s.requirements.map((r) => (r.demo && r.deadline ? { ...r, deadline: shiftByDays(r.deadline, delta) } : r)),
            milestones: s.milestones.map((m) =>
              m.relative ? { ...m, start: shiftByDays(m.start, delta), end: m.end ? shiftByDays(m.end, delta) : undefined } : m,
            ),
            meta: { ...s.meta, demoSeedDate: toDateKey(today) },
          };
        }),
      resetDemo: (now) => {
        for (const m of get().materials) if (m.blobKey) void deleteBlob(m.blobKey);
        const seed = createDemoSeed(now);
        set((s) => ({
          subjects: seed.subjects,
          events: seed.events,
          requirements: seed.requirements,
          materials: seed.materials,
          milestones: seed.milestones,
          meta: { ...s.meta, demoSeedDate: seed.seedDate },
          settings: { ...s.settings, moodle: null, ics: null },
        }));
      },
      clearDemoData: () =>
        set((s) => {
          const demoSubjects = new Set(s.subjects.filter((x) => x.demo).map((x) => x.id));
          return {
            subjects: s.subjects.filter((x) => !x.demo),
            events: s.events.filter((e) => !e.demo && !demoSubjects.has(e.subjectId ?? '')),
            requirements: s.requirements.filter((r) => !r.demo && !demoSubjects.has(r.subjectId)),
            materials: s.materials.filter((m) => !m.demo && !demoSubjects.has(m.subjectId)),
            milestones: s.milestones.filter((m) => m.source !== 'demo'),
            meta: { ...s.meta, demoSeedDate: undefined },
          };
        }),
      clearAllData: () => {
        for (const m of get().materials) if (m.blobKey) void deleteBlob(m.blobKey);
        set((s) => ({
          subjects: [],
          events: [],
          requirements: [],
          materials: [],
          milestones: [],
          meta: { ...s.meta, demoSeedDate: undefined },
          settings: { ...s.settings, moodle: null, ics: null },
        }));
      },
      importBackup: (data) =>
        set((s) => ({
          subjects: Array.isArray(data.subjects) ? data.subjects : s.subjects,
          events: Array.isArray(data.events) ? data.events : s.events,
          requirements: Array.isArray(data.requirements) ? data.requirements : s.requirements,
          materials: Array.isArray(data.materials) ? data.materials.filter((m) => m.kind !== 'upload') : s.materials,
          milestones: Array.isArray(data.milestones) ? data.milestones : s.milestones,
          settings: data.settings ? { ...s.settings, ...data.settings, buildings: data.settings.buildings ?? s.settings.buildings } : s.settings,
        })),
      dismissWelcome: () => set((s) => ({ meta: { ...s.meta, welcomeDismissed: true } })),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        subjects: s.subjects,
        events: s.events,
        requirements: s.requirements,
        materials: s.materials,
        milestones: s.milestones,
        settings: s.settings,
        meta: s.meta,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...p.settings,
            origin: { ...DEFAULT_SETTINGS.origin, ...p.settings?.origin },
            buildings: p.settings?.buildings?.length ? p.settings.buildings : DEFAULT_BUILDINGS,
          },
          meta: { ...current.meta, ...p.meta },
        };
      },
    },
  ),
);

/** Data pro zálohu / synchronizaci (bez API klíčů). */
export function pickPersisted(state: AppState) {
  return {
    subjects: state.subjects,
    events: state.events,
    requirements: state.requirements,
    materials: state.materials,
    milestones: state.milestones,
    meta: state.meta,
  };
}
