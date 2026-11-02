/**
 * Hlavní stav aplikace (Zustand) s perzistencí do localStorage.
 * Každá změna položky nastaví `updatedAt` a každé výslovné smazání zapíše
 * tombstone – z toho žije synchronizace s Googlem i mezi zařízeními.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  AppMode,
  Building,
  DataSource,
  GoogleSyncSettings,
  GoogleSyncState,
  IcsSource,
  Material,
  Milestone,
  MoodleConnection,
  OriginPref,
  OriginStopPref,
  Requirement,
  ScheduleEvent,
  Settings,
  Subject,
  SubjectSyllabus,
  Task,
} from '../types';
import { DEFAULT_BUILDINGS, locationAliasKey, resolveBuilding } from '../lib/buildings';
import { deleteBlob } from '../lib/blobStore';
import { nextSubjectColor } from '../lib/colors';
import { calendarDayDiff, fromDateKey, shiftByDays, startOfDay, toDateKey } from '../lib/dates';
import { hashString, uid } from '../lib/id';
import { safeLocalStorage } from '../lib/persistence';
import type { ExamTerm } from '../lib/sisImport';
import { applyLocalOps, emptySyncState } from '../lib/sync/apply';
import type { SnapshotData } from '../lib/sync/driveState';
import { keyOf, pruneTombstones } from '../lib/sync/keys';
import type { LocalOp } from '../lib/sync/mapping';
import { createDemoSeed } from '../services/demo/seed';
import type { MoodleSyncResult } from '../services/moodleSync';

export const DEFAULT_GOOGLE: GoogleSyncSettings = {
  enabled: false,
  clientId: '',
  auto: true,
  intervalMinutes: 15,
  conflict: 'newest',
  deletions: 'mirror',
  calendar: {
    enabled: true,
    target: 'dedicated',
    direction: 'two-way',
    push: { classes: true, exams: true, deadlines: false, milestones: true, personal: true },
    pullCalendars: ['primary'],
    rangeWeeks: 6,
    remindersClasses: [15],
    remindersDeadlines: [1440, 120],
    colors: true,
  },
  tasks: {
    enabled: true,
    target: 'dedicated',
    direction: 'two-way',
    push: { personal: true, requirements: true, subtasks: false },
    pullLists: ['@default'],
    keepCompletedDays: 14,
  },
  drive: { enabled: true, syncState: true, exportMaterials: false, folderName: 'Stihnu' },
};

export const DEFAULT_SETTINGS: Settings = {
  mode: 'demo',
  theme: 'system',
  golemioApiKey: '',
  googleMapsApiKey: '',
  googleOAuthClientId: '',
  anthropicApiKey: '',
  moodle: null,
  icsSources: [],
  icsRefreshHours: 6,
  bufferMinutes: 5,
  prepMinutes: 3,
  comfortMinutes: 8,
  minMarginMinutes: 3,
  walkSpeed: 'normal',
  accessibleOnly: false,
  preferAirConditioned: false,
  origin: {
    demo: { source: 'preset', presetId: 'kajetanka' },
    live: { source: 'gps', presetId: 'kajetanka' },
  },
  originStop: { demo: null, live: null },
  demoClock: true,
  reminders: [1440, 120],
  buildings: DEFAULT_BUILDINGS,
  locationAliases: {},
  google: DEFAULT_GOOGLE,
  weather: { enabled: true, feel: 'normal' },
  displayName: '',
};

export interface AppData {
  subjects: Subject[];
  events: ScheduleEvent[];
  requirements: Requirement[];
  materials: Material[];
  milestones: Milestone[];
  tasks: Task[];
  /** Výslovně smazané položky (klíč → čas smazání). */
  tombstones: Record<string, string>;
}

export interface AppMeta {
  demoSeedDate?: string;
  welcomeDismissed: boolean;
  settingsUpdatedAt?: string;
  deviceId: string;
}

export interface IcsImportPayload {
  subjects: Subject[];
  events: ScheduleEvent[];
  /** Nahradit dosavadní události tohoto zdroje (ID zdroje iCal), nebo všech uvedených typů zdroje. */
  replaceSourceId?: string;
  replaceSources?: DataSource[];
  source?: IcsSource;
  demo?: boolean;
}

export interface NewTaskInput {
  title: string;
  notes?: string;
  due?: string;
  subjectId?: string;
  priority?: 'high';
}

export interface NewEventInput {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  buildingId?: string;
  notes?: string;
  subjectId?: string;
  kind?: ScheduleEvent['kind'];
}

export interface AppState extends AppData {
  settings: Settings;
  meta: AppMeta;
  googleSync: Record<AppMode, GoogleSyncState>;

  // Povinnosti
  toggleSubtask: (requirementId: string, subtaskId: string) => void;
  addSubtask: (requirementId: string, title: string) => void;
  renameSubtask: (requirementId: string, subtaskId: string, title: string) => void;
  removeSubtask: (requirementId: string, subtaskId: string) => void;
  toggleRequirementDone: (requirementId: string) => void;
  upsertRequirement: (requirement: Requirement) => void;
  addRequirements: (requirements: Requirement[]) => void;
  removeRequirement: (requirementId: string) => void;

  // Předměty
  upsertSubject: (subject: Subject) => void;
  removeSubject: (subjectId: string) => void;
  setSubjectSyllabus: (subjectId: string, syllabus: SubjectSyllabus) => void;
  importSisSubject: (input: { code?: string; name?: string; syllabus: SubjectSyllabus }) => string;

  // Materiály
  addMaterial: (material: Material) => void;
  updateMaterial: (materialId: string, patch: Partial<Material>) => void;
  removeMaterial: (materialId: string) => void;
  /** Zapíše odkaz na kopii v Disku (bez změny `updatedAt`). */
  markMaterialExported: (materialId: string, ref: { driveFileId: string; driveUrl?: string; version: string }) => void;

  // Události
  upsertEvent: (event: ScheduleEvent) => void;
  addEvent: (input: NewEventInput) => string;
  updateEvent: (eventId: string, patch: Partial<ScheduleEvent>) => void;
  removeEvent: (eventId: string) => void;
  addExamTerms: (terms: ExamTerm[]) => number;

  // Vlastní úkoly
  addTask: (input: NewTaskInput) => string;
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  toggleTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;

  // Harmonogram
  addMilestones: (milestones: Milestone[]) => void;
  updateMilestone: (milestoneId: string, patch: Partial<Milestone>) => void;
  removeMilestone: (milestoneId: string) => void;

  // Importy
  applyIcsImport: (payload: IcsImportPayload) => void;
  applyMoodleSync: (result: MoodleSyncResult, connection: MoodleConnection, demo: boolean) => void;
  applyMoodleIcs: (payload: { subjects: Subject[]; requirements: Requirement[]; source: IcsSource; demo?: boolean }) => void;
  disconnectMoodle: () => void;
  upsertIcsSource: (source: IcsSource) => void;
  removeIcsSource: (sourceId: string, removeItems: boolean) => void;

  // Synchronizace
  applySync: (mode: AppMode, ops: LocalOp[], state: GoogleSyncState) => void;
  patchGoogleSync: (mode: AppMode, patch: Partial<GoogleSyncState>) => void;
  resetGoogleSync: (mode: AppMode) => void;
  applyDriveMerge: (merged: SnapshotData) => void;
  updateGoogleSettings: (patch: Partial<GoogleSyncSettings>) => void;

  // Nastavení
  updateSettings: (patch: Partial<Settings>) => void;
  setMode: (mode: AppMode) => void;
  setOrigin: (mode: AppMode, origin: OriginPref) => void;
  setOriginStop: (mode: AppMode, stop: OriginStopPref | null) => void;
  setLocationAlias: (location: string, buildingId: string) => void;
  upsertBuilding: (building: Building) => void;
  removeBuilding: (buildingId: string) => void;
  resetBuildings: () => void;

  // Data
  rebaseDemo: (today: Date) => void;
  resetDemo: (now: Date) => void;
  clearDemoData: () => void;
  clearAllData: () => void;
  importBackup: (data: Partial<AppData> & { settings?: Partial<Settings> }) => void;
  dismissWelcome: () => void;
}

const nowIso = () => new Date().toISOString();

function initialData(): AppData & { meta: AppMeta } {
  const seed = createDemoSeed(new Date());
  return {
    subjects: seed.subjects,
    events: seed.events,
    requirements: seed.requirements,
    materials: seed.materials,
    milestones: seed.milestones,
    tasks: seed.tasks,
    tombstones: {},
    meta: { demoSeedDate: seed.seedDate, welcomeDismissed: false, deviceId: uid('dev') },
  };
}

function mapRequirement(list: Requirement[], id: string, fn: (r: Requirement) => Requirement): Requirement[] {
  return list.map((r) => (r.id === id ? { ...fn(r), updatedAt: nowIso() } : r));
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

function tomb(tombstones: Record<string, string>, keys: string[]): Record<string, string> {
  if (keys.length === 0) return tombstones;
  const at = nowIso();
  const next = { ...tombstones };
  for (const k of keys) next[k] = at;
  return next;
}

const PERSIST_KEY = 'stihnu:v1';

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      settings: DEFAULT_SETTINGS,
      googleSync: { demo: emptySyncState(), live: emptySyncState() },

      /* ------------------------------ povinnosti ------------------------------ */

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
          tombstones: tomb(s.tombstones, [keyOf.sub(requirementId, subtaskId)]),
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
      upsertRequirement: (requirement) => set((s) => ({ requirements: upsertById(s.requirements, [{ ...requirement, updatedAt: nowIso() }]) })),
      addRequirements: (requirements) => set((s) => ({ requirements: upsertById(s.requirements, requirements.map((r) => ({ ...r, updatedAt: r.updatedAt ?? nowIso() }))) })),
      removeRequirement: (requirementId) =>
        set((s) => {
          const req = s.requirements.find((r) => r.id === requirementId);
          return {
            tombstones: tomb(s.tombstones, [keyOf.req(requirementId), ...(req?.subtasks.map((st) => keyOf.sub(requirementId, st.id)) ?? [])]),
            requirements: s.requirements.filter((r) => r.id !== requirementId),
            materials: s.materials.map((m) => (m.requirementId === requirementId ? { ...m, requirementId: undefined, updatedAt: nowIso() } : m)),
          };
        }),

      /* ------------------------------- předměty ------------------------------- */

      upsertSubject: (subject) => set((s) => ({ subjects: upsertById(s.subjects, [{ ...subject, updatedAt: nowIso() }]) })),
      removeSubject: (subjectId) => {
        const { materials } = get();
        for (const m of materials) if (m.subjectId === subjectId && m.blobKey) void deleteBlob(m.blobKey);
        set((s) => {
          const keys = [
            keyOf.subject(subjectId),
            ...s.events.filter((e) => e.subjectId === subjectId).map((e) => keyOf.event(e.id)),
            ...s.requirements.filter((r) => r.subjectId === subjectId).map((r) => keyOf.req(r.id)),
            ...s.materials.filter((m) => m.subjectId === subjectId).map((m) => keyOf.material(m.id)),
            ...s.milestones.filter((m) => m.subjectId === subjectId).map((m) => keyOf.ms(m.id)),
          ];
          return {
            tombstones: tomb(s.tombstones, keys),
            subjects: s.subjects.filter((x) => x.id !== subjectId),
            events: s.events.filter((e) => e.subjectId !== subjectId),
            requirements: s.requirements.filter((r) => r.subjectId !== subjectId),
            materials: s.materials.filter((m) => m.subjectId !== subjectId),
            milestones: s.milestones.filter((m) => m.subjectId !== subjectId),
            tasks: s.tasks.map((t) => (t.subjectId === subjectId ? { ...t, subjectId: undefined, updatedAt: nowIso() } : t)),
          };
        });
      },
      setSubjectSyllabus: (subjectId, syllabus) =>
        set((s) => ({
          subjects: s.subjects.map((x) =>
            x.id === subjectId
              ? {
                  ...x,
                  syllabus,
                  credits: x.credits ?? syllabus.credits,
                  completion: x.completion ?? syllabus.completion,
                  teacher: x.teacher ?? syllabus.guarantor,
                  updatedAt: nowIso(),
                }
              : x,
          ),
        })),
      importSisSubject: ({ code, name, syllabus }) => {
        const s = get();
        const existing =
          (code ? s.subjects.find((x) => x.code?.toUpperCase() === code.toUpperCase()) : undefined) ??
          (name ? s.subjects.find((x) => x.name.toLowerCase() === name.toLowerCase()) : undefined);
        if (existing) {
          get().setSubjectSyllabus(existing.id, syllabus);
          return existing.id;
        }
        const id = `subj_sis_${hashString(code ?? name ?? uid()).toString(36)}`;
        const subject: Subject = {
          id,
          code,
          name: name ?? code ?? 'Předmět ze SISu',
          color: nextSubjectColor(s.subjects.map((x) => x.color)),
          teacher: syllabus.guarantor,
          credits: syllabus.credits,
          completion: syllabus.completion,
          source: 'sis',
          syllabus,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        set((st) => ({ subjects: [...st.subjects, subject] }));
        return id;
      },

      /* ------------------------------- materiály ------------------------------ */

      addMaterial: (material) => set((s) => ({ materials: [...s.materials, { ...material, updatedAt: material.updatedAt ?? nowIso() }] })),
      updateMaterial: (materialId, patch) =>
        set((s) => ({
          materials: s.materials.map((m) => (m.id === materialId ? { ...m, ...patch, updatedAt: nowIso() } : m)),
        })),
      markMaterialExported: (materialId, ref) =>
        set((s) => ({
          materials: s.materials.map((m) => (m.id === materialId ? { ...m, driveFileId: ref.driveFileId, driveUrl: ref.driveUrl ?? m.driveUrl, driveSyncedAt: ref.version } : m)),
        })),
      removeMaterial: (materialId) => {
        const material = get().materials.find((m) => m.id === materialId);
        if (material?.blobKey) void deleteBlob(material.blobKey);
        set((s) => ({ tombstones: tomb(s.tombstones, [keyOf.material(materialId)]), materials: s.materials.filter((m) => m.id !== materialId) }));
      },

      /* -------------------------------- události ------------------------------ */

      upsertEvent: (event) => set((s) => ({ events: upsertById(s.events, [{ ...event, updatedAt: nowIso() }]).sort((a, b) => a.start.localeCompare(b.start)) })),
      addEvent: (input) => {
        const id = uid('evt');
        const stamp = nowIso();
        const event: ScheduleEvent = {
          id,
          title: input.title.trim() || 'Nová událost',
          kind: input.kind ?? 'personal',
          start: input.start,
          end: input.end,
          allDay: input.allDay || undefined,
          location: input.location?.trim() || undefined,
          buildingId: input.buildingId,
          notes: input.notes?.trim() || undefined,
          subjectId: input.subjectId,
          source: 'manual',
          createdAt: stamp,
          updatedAt: stamp,
        };
        set((s) => ({ events: [...s.events, event].sort((a, b) => a.start.localeCompare(b.start)) }));
        return id;
      },
      updateEvent: (eventId, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === eventId ? { ...e, ...patch, updatedAt: nowIso() } : e)).sort((a, b) => a.start.localeCompare(b.start)),
        })),
      removeEvent: (eventId) => set((s) => ({ tombstones: tomb(s.tombstones, [keyOf.event(eventId)]), events: s.events.filter((e) => e.id !== eventId) })),
      addExamTerms: (terms) => {
        const s = get();
        const stamp = nowIso();
        const events: ScheduleEvent[] = terms.map((t) => {
          const subject = t.code ? s.subjects.find((x) => x.code?.toUpperCase() === t.code!.toUpperCase()) : undefined;
          const match = resolveBuilding(t.room, s.settings.buildings, s.settings.locationAliases);
          return {
            id: `exam_${hashString(`${t.code ?? ''}|${t.start.toISOString()}`).toString(36)}`,
            subjectId: subject?.id,
            title: `Zkouška ${subject?.name ?? t.name ?? t.code ?? ''}`.trim(),
            kind: 'exam',
            start: t.start.toISOString(),
            end: new Date(t.start.getTime() + 2 * 3_600_000).toISOString(),
            location: t.room,
            room: match.room ?? t.room,
            buildingId: match.building?.id,
            teacher: t.teacher,
            source: 'sis',
            createdAt: stamp,
            updatedAt: stamp,
          };
        });
        set((st) => ({ events: upsertById(st.events, events).sort((a, b) => a.start.localeCompare(b.start)) }));
        return events.length;
      },

      /* ------------------------------ vlastní úkoly --------------------------- */

      addTask: (input) => {
        const id = uid('tsk');
        const stamp = nowIso();
        const task: Task = {
          id,
          title: input.title.trim() || 'Nový úkol',
          notes: input.notes?.trim() || undefined,
          due: input.due,
          subjectId: input.subjectId,
          priority: input.priority,
          done: false,
          source: 'manual',
          createdAt: stamp,
          updatedAt: stamp,
        };
        set((s) => ({ tasks: [task, ...s.tasks] }));
        return id;
      },
      updateTask: (taskId, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...patch, updatedAt: nowIso() } : t)) })),
      toggleTask: (taskId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done, completedAt: !t.done ? nowIso() : undefined, updatedAt: nowIso() } : t)),
        })),
      removeTask: (taskId) => set((s) => ({ tombstones: tomb(s.tombstones, [keyOf.task(taskId)]), tasks: s.tasks.filter((t) => t.id !== taskId) })),

      /* ------------------------------- harmonogram ---------------------------- */

      addMilestones: (milestones) => set((s) => ({ milestones: upsertById(s.milestones, milestones.map((m) => ({ ...m, updatedAt: nowIso() }))) })),
      updateMilestone: (milestoneId, patch) =>
        set((s) => ({ milestones: s.milestones.map((m) => (m.id === milestoneId ? { ...m, ...patch, updatedAt: nowIso() } : m)) })),
      removeMilestone: (milestoneId) => set((s) => ({ tombstones: tomb(s.tombstones, [keyOf.ms(milestoneId)]), milestones: s.milestones.filter((m) => m.id !== milestoneId) })),

      /* --------------------------------- importy ------------------------------ */

      applyIcsImport: ({ subjects, events, replaceSourceId, replaceSources = [], source, demo }) =>
        set((s) => {
          const stamp = nowIso();
          const mark = <T extends object>(items: T[]) => items.map((i) => ({ ...i, updatedAt: stamp, ...(demo ? { demo: true } : {}) }));
          const tagged = source ? events.map((e) => ({ ...e, icsSourceId: source.id })) : events;
          const kept = s.events.filter((e) => {
            if (replaceSourceId && e.icsSourceId === replaceSourceId) return false;
            if (replaceSources.includes(e.source) && e.kind !== 'personal') return false;
            return true;
          });
          const sources = source ? upsertById(s.settings.icsSources, [source]) : s.settings.icsSources;
          return {
            subjects: upsertById(s.subjects, mark(subjects)),
            events: upsertById(kept, mark(tagged)).sort((a, b) => a.start.localeCompare(b.start)),
            settings: source ? { ...s.settings, icsSources: sources } : s.settings,
          };
        }),
      applyMoodleSync: (result, connection, demo) =>
        set((s) => {
          const existingReq = new Set(s.requirements.map((r) => r.id));
          const existingMat = new Set(s.materials.map((m) => m.id));
          const existingSubj = new Set(s.subjects.map((x) => x.id));
          const stamp = nowIso();
          const flag = <T extends { id: string; demo?: boolean }>(items: T[], known: Set<string>) =>
            items.map((item) => ({ ...item, updatedAt: stamp, ...(demo && !known.has(item.id) ? { demo: true } : {}) }));
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
                lastSync: stamp,
                stats: { courses: result.stats.courses, requirements: result.stats.requirements, materials: result.stats.materials },
              },
            },
          };
        }),
      applyMoodleIcs: ({ subjects, requirements, source, demo }) =>
        set((s) => {
          const mark = <T extends object>(items: T[]) => (demo ? items.map((i) => ({ ...i, demo: true })) : items);
          return {
            subjects: upsertById(s.subjects, mark(subjects)),
            requirements: upsertById(s.requirements, mark(requirements)),
            settings: { ...s.settings, icsSources: upsertById(s.settings.icsSources, [source]) },
          };
        }),
      disconnectMoodle: () => set((s) => ({ settings: { ...s.settings, moodle: null } })),
      upsertIcsSource: (source) => set((s) => ({ settings: { ...s.settings, icsSources: upsertById(s.settings.icsSources, [source]) }, meta: { ...s.meta, settingsUpdatedAt: nowIso() } })),
      removeIcsSource: (sourceId, removeItems) =>
        set((s) => ({
          settings: { ...s.settings, icsSources: s.settings.icsSources.filter((x) => x.id !== sourceId) },
          events: removeItems ? s.events.filter((e) => e.icsSourceId !== sourceId) : s.events,
          meta: { ...s.meta, settingsUpdatedAt: nowIso() },
        })),

      /* ------------------------------ synchronizace --------------------------- */

      applySync: (mode, ops, state) =>
        set((s) => {
          const data = applyLocalOps({ events: s.events, tasks: s.tasks, requirements: s.requirements }, ops, new Date());
          // Položky ze simulovaného Googlu v Sandboxu označíme jako ukázkové.
          const demoMark = mode === 'demo';
          const known = new Set([...s.events.map((e) => e.id), ...s.tasks.map((t) => t.id)]);
          return {
            events: demoMark ? data.events.map((e) => (!known.has(e.id) ? { ...e, demo: true } : e)) : data.events,
            tasks: demoMark ? data.tasks.map((t) => (!known.has(t.id) ? { ...t, demo: true } : t)) : data.tasks,
            requirements: data.requirements,
            googleSync: { ...s.googleSync, [mode]: state },
          };
        }),
      patchGoogleSync: (mode, patch) => set((s) => ({ googleSync: { ...s.googleSync, [mode]: { ...s.googleSync[mode], ...patch } } })),
      resetGoogleSync: (mode) => set((s) => ({ googleSync: { ...s.googleSync, [mode]: emptySyncState() } })),
      applyDriveMerge: (merged) =>
        set((s) => {
          const keepDemo = <T extends { demo?: boolean }>(list: T[]) => list.filter((x) => x.demo);
          const mirrors = s.events.filter((e) => e.google?.readOnly);
          const settings = merged.settings && (merged.settingsUpdatedAt ?? '') > (s.meta.settingsUpdatedAt ?? '') ? { ...s.settings, ...merged.settings } : s.settings;
          const live = s.googleSync.live;
          return {
            subjects: [...keepDemo(s.subjects), ...merged.subjects],
            events: [...keepDemo(s.events), ...mirrors, ...merged.events].sort((a, b) => a.start.localeCompare(b.start)),
            requirements: [...keepDemo(s.requirements), ...merged.requirements],
            tasks: [...keepDemo(s.tasks), ...merged.tasks],
            materials: [...keepDemo(s.materials), ...merged.materials],
            milestones: [...s.milestones.filter((m) => m.source === 'demo'), ...merged.milestones],
            tombstones: pruneTombstones(merged.tombstones, new Date()),
            settings,
            meta: { ...s.meta, settingsUpdatedAt: merged.settingsUpdatedAt ?? s.meta.settingsUpdatedAt },
            googleSync: merged.google
              ? { ...s.googleSync, live: { ...live, links: merged.google.links, containers: { ...merged.google.containers, ...live.containers }, excluded: merged.google.excluded } }
              : s.googleSync,
          };
        }),
      updateGoogleSettings: (patch) => set((s) => ({ settings: { ...s.settings, google: { ...s.settings.google, ...patch } } })),

      /* -------------------------------- nastavení ----------------------------- */

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, meta: { ...s.meta, settingsUpdatedAt: nowIso() } })),
      setMode: (mode) => set((s) => ({ settings: { ...s.settings, mode } })),
      setOrigin: (mode, origin) => set((s) => ({ settings: { ...s.settings, origin: { ...s.settings.origin, [mode]: origin } } })),
      setOriginStop: (mode, stop) => set((s) => ({ settings: { ...s.settings, originStop: { ...s.settings.originStop, [mode]: stop } } })),
      setLocationAlias: (location, buildingId) =>
        set((s) => {
          const aliases = { ...s.settings.locationAliases, [locationAliasKey(location)]: buildingId };
          const events = s.events.map((e) => {
            if (!e.location || locationAliasKey(e.location) !== locationAliasKey(location)) return e;
            return { ...e, buildingId, updatedAt: nowIso() };
          });
          return { events, settings: { ...s.settings, locationAliases: aliases }, meta: { ...s.meta, settingsUpdatedAt: nowIso() } };
        }),
      upsertBuilding: (building) =>
        set((s) => {
          const buildings = upsertById(s.settings.buildings, [building]);
          const events = s.events.map((e) => {
            if (e.buildingId || !e.location) return e;
            const match = resolveBuilding(e.location, buildings, s.settings.locationAliases);
            return match.building ? { ...e, buildingId: match.building.id, room: e.room ?? match.room, updatedAt: nowIso() } : e;
          });
          return { events, settings: { ...s.settings, buildings }, meta: { ...s.meta, settingsUpdatedAt: nowIso() } };
        }),
      removeBuilding: (buildingId) =>
        set((s) => ({
          settings: { ...s.settings, buildings: s.settings.buildings.filter((b) => b.id !== buildingId) },
          events: s.events.map((e) => (e.buildingId === buildingId ? { ...e, buildingId: undefined } : e)),
          meta: { ...s.meta, settingsUpdatedAt: nowIso() },
        })),
      resetBuildings: () =>
        set((s) => {
          const custom = s.settings.buildings.filter((b) => b.custom);
          return { settings: { ...s.settings, buildings: [...DEFAULT_BUILDINGS, ...custom] }, meta: { ...s.meta, settingsUpdatedAt: nowIso() } };
        }),

      /* ---------------------------------- data -------------------------------- */

      rebaseDemo: (today) =>
        set((s) => {
          if (!s.meta.demoSeedDate) return {};
          const delta = calendarDayDiff(startOfDay(today), fromDateKey(s.meta.demoSeedDate));
          if (delta === 0) return {};
          return {
            events: s.events.map((e) => (e.demo ? { ...e, start: shiftByDays(e.start, delta), end: shiftByDays(e.end, delta) } : e)),
            requirements: s.requirements.map((r) => (r.demo && r.deadline ? { ...r, deadline: shiftByDays(r.deadline, delta) } : r)),
            tasks: s.tasks.map((t) =>
              t.demo ? { ...t, due: t.due ? shiftByDays(t.due, delta) : undefined, completedAt: t.completedAt ? shiftByDays(t.completedAt, delta) : undefined } : t,
            ),
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
          tasks: seed.tasks,
          tombstones: {},
          meta: { ...s.meta, demoSeedDate: seed.seedDate },
          settings: { ...s.settings, moodle: null, icsSources: [] },
          googleSync: { ...s.googleSync, demo: emptySyncState() },
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
            tasks: s.tasks.filter((t) => !t.demo).map((t) => (t.subjectId && demoSubjects.has(t.subjectId) ? { ...t, subjectId: undefined } : t)),
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
          tasks: [],
          tombstones: {},
          meta: { ...s.meta, demoSeedDate: undefined },
          settings: { ...s.settings, moodle: null, icsSources: [] },
          googleSync: { demo: emptySyncState(), live: emptySyncState() },
        }));
      },
      importBackup: (data) =>
        set((s) => ({
          subjects: Array.isArray(data.subjects) ? data.subjects : s.subjects,
          events: Array.isArray(data.events) ? data.events : s.events,
          requirements: Array.isArray(data.requirements) ? data.requirements : s.requirements,
          materials: Array.isArray(data.materials) ? data.materials.filter((m) => m.kind !== 'upload') : s.materials,
          milestones: Array.isArray(data.milestones) ? data.milestones : s.milestones,
          tasks: Array.isArray(data.tasks) ? data.tasks : s.tasks,
          settings: data.settings ? mergeSettings(s.settings, data.settings) : s.settings,
        })),
      dismissWelcome: () => set((s) => ({ meta: { ...s.meta, welcomeDismissed: true } })),
    }),
    {
      name: PERSIST_KEY,
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        subjects: s.subjects,
        events: s.events,
        requirements: s.requirements,
        materials: s.materials,
        milestones: s.milestones,
        tasks: s.tasks,
        tombstones: s.tombstones,
        settings: s.settings,
        meta: s.meta,
        googleSync: s.googleSync,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown> & { settings?: Record<string, unknown> };
        if (version < 2) {
          const settings = { ...(p.settings ?? {}) } as Record<string, unknown> & { ics?: { url: string; label?: string; lastSync?: string; eventCount?: number } | null };
          if (settings.ics && !settings.icsSources) {
            settings.icsSources = [
              { id: 'sis', kind: 'sis', url: settings.ics.url, label: settings.ics.label, autoRefresh: true, lastSync: settings.ics.lastSync, itemCount: settings.ics.eventCount },
            ] satisfies IcsSource[];
          }
          delete settings.ics;
          p.settings = settings;
          p.tasks = Array.isArray(p.tasks) ? p.tasks : [];
          p.tombstones = p.tombstones ?? {};
        }
        return p as unknown as AppState;
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          tasks: Array.isArray(p.tasks) ? p.tasks : current.tasks,
          tombstones: p.tombstones ?? {},
          settings: mergeSettings(DEFAULT_SETTINGS, p.settings ?? {}),
          meta: { ...current.meta, ...p.meta, deviceId: p.meta?.deviceId ?? current.meta.deviceId },
          googleSync: {
            demo: { ...emptySyncState(), ...p.googleSync?.demo },
            live: { ...emptySyncState(), ...p.googleSync?.live },
          },
        };
      },
    },
  ),
);

/** Sloučí uložené nastavení s výchozím (včetně vnořených objektů nových verzí). */
export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const g = patch.google;
  return {
    ...base,
    ...patch,
    origin: { ...base.origin, ...patch.origin },
    originStop: { ...base.originStop, ...patch.originStop },
    buildings: patch.buildings?.length ? patch.buildings : base.buildings,
    icsSources: Array.isArray(patch.icsSources) ? patch.icsSources : base.icsSources,
    weather: { ...base.weather, ...patch.weather },
    google: g
      ? {
          ...base.google,
          ...g,
          calendar: { ...base.google.calendar, ...g.calendar, push: { ...base.google.calendar.push, ...g.calendar?.push } },
          tasks: { ...base.google.tasks, ...g.tasks, push: { ...base.google.tasks.push, ...g.tasks?.push } },
          drive: { ...base.google.drive, ...g.drive },
        }
      : base.google,
  };
}

/** Data pro zálohu (bez API klíčů). */
export function pickPersisted(state: AppState) {
  return {
    subjects: state.subjects,
    events: state.events,
    requirements: state.requirements,
    materials: state.materials,
    milestones: state.milestones,
    tasks: state.tasks,
    meta: state.meta,
  };
}
