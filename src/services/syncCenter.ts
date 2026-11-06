/**
 * Centrum synchronizace – jedno místo, které drží data aktuální:
 *  - Google Kalendář + Úkoly (obousměrně) a Disk (data mezi zařízeními, export materiálů),
 *  - odebírané kalendáře iCal (rozvrh SIS, termíny Moodlu) – obnova na pozadí,
 *  - Moodle přes token (pokud je propojený) – obnova jednou za pár hodin.
 * Běží v Sandboxu (simulovaný Google, ukázková data) i v Live režimu.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AppMode, IcsSource, SyncReport, SyncService } from '../types';
import { buildIcsImport } from '../lib/icsImport';
import { parseIcs } from '../lib/ics';
import { markdownToHtml } from '../lib/markdownHtml';
import { buildMoodleIcsImport } from '../lib/moodleIcs';
import { loadBlob } from '../lib/blobStore';
import { hashString } from '../lib/id';
import { combineReports, mergeServiceState } from '../lib/sync/apply';
import { countdownMilestone } from '../lib/sync/mapping';
import { buildSnapshot, mergeSnapshots, parseSnapshot, pickSharedSettings, snapshotData, STATE_FILE_NAME } from '../lib/sync/driveState';
import { syncCalendar, syncTasks, type ServiceResult, type SyncContext } from '../lib/sync/engine';
import { GoogleAuthError, type GoogleBackend, type RemoteCalendar } from '../lib/sync/remote';
import { buildingForEvent } from '../store/selectors';
import { splitMilestones } from '../lib/relevance';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { toast, useUiStore } from '../store/uiStore';
import { createApi } from './api';
import { buildDemoMoodleIcs } from './demo/samples';
import { resolveClientId, scopesForSettings, signIn, signOut, getAccessToken, tokenState } from './google/auth';
import { backendFor, saveDemoBackend } from './google/session';
import { errorMessage } from './http';
import { syncMoodle } from './moodleSync';
import { importAllSyllabi } from './syllabusSync';

/* ------------------------------------------------------------------ */
/* Stav pro UI                                                         */
/* ------------------------------------------------------------------ */

interface SyncUiState {
  running: boolean;
  phase: string | null;
  /** Je potřeba se znovu přihlásit (vypršel token bez serverové obnovy). */
  needsAuth: boolean;
  lastError: string | null;
  massDelete: { service: 'calendar' | 'tasks'; count: number }[];
  calendars: RemoteCalendar[];
  taskLists: { id: string; title: string }[];
  icsBusy: Record<string, boolean>;
  moodleBusy: boolean;
}

export const useSyncStore = create<SyncUiState>()(() => ({
  running: false,
  phase: null,
  needsAuth: false,
  lastError: null,
  massDelete: [],
  calendars: [],
  taskLists: [],
  icsBusy: {},
  moodleBusy: false,
}));

const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://prazskystudent.vercel.app';
let suppressChangeUntil = 0;
let lastDriveFingerprint = '';

export function serverFlow(): boolean {
  return useUiStore.getState().server.googleServerFlow;
}

/* ------------------------------------------------------------------ */
/* Přihlášení                                                          */
/* ------------------------------------------------------------------ */

export function googleClientIdFor(): string {
  return resolveClientId(useAppStore.getState().settings.google.clientId, useUiStore.getState().server.googleClientId);
}

/** Propojení s Googlem (v Live otevře okno přihlášení – volat z kliknutí). */
export async function connectGoogle(options: { reconnect?: boolean } = {}): Promise<boolean> {
  const app = useAppStore.getState();
  const mode = app.settings.mode;
  try {
    if (mode === 'live') {
      const clientId = googleClientIdFor();
      if (!clientId) throw new Error('Chybí OAuth Client ID – vložte ho v nastavení Googlu (návod je hned u pole).');
      const info = await signIn({ clientId, scopes: scopesForSettings(app.settings.google), serverFlow: serverFlow(), prompt: options.reconnect ? '' : 'select_account' });
      const backend = await backendFor('live', serverFlow());
      const account = await backend.profile();
      app.patchGoogleSync('live', { account, connectedAt: app.googleSync.live.connectedAt ?? new Date().toISOString(), scopes: info.scopes });
      if (!info.persistent && serverFlow()) toast.info('Přihlášení platí hodinu – pro trvalou synchronizaci odeber Stihnu v účtu Google a propojte znovu.');
    } else {
      const backend = await backendFor('demo', false);
      const account = await backend.profile();
      app.patchGoogleSync('demo', { account, connectedAt: app.googleSync.demo.connectedAt ?? appNow().toISOString(), scopes: scopesForSettings(app.settings.google) });
    }
    app.updateGoogleSettings({ enabled: true });
    useSyncStore.setState({ needsAuth: false, lastError: null });
    void runGoogleSync({ manual: true });
    return true;
  } catch (error) {
    useSyncStore.setState({ lastError: errorMessage(error) });
    toast.error(errorMessage(error));
    return false;
  }
}

export async function disconnectGoogle(forget: boolean): Promise<void> {
  const app = useAppStore.getState();
  const mode = app.settings.mode;
  if (mode === 'live') await signOut(serverFlow());
  app.updateGoogleSettings({ enabled: false });
  if (forget) app.resetGoogleSync(mode);
  else app.patchGoogleSync(mode, { account: undefined, connectedAt: undefined });
  useSyncStore.setState({ needsAuth: false, massDelete: [], lastError: null });
}

/* ------------------------------------------------------------------ */
/* Google: Disk                                                        */
/* ------------------------------------------------------------------ */

function localSnapshot(mode: AppMode) {
  const s = useAppStore.getState();
  const gs = s.googleSync[mode];
  return snapshotData({
    subjects: s.subjects,
    events: s.events,
    requirements: s.requirements,
    tasks: s.tasks,
    materials: s.materials,
    milestones: s.milestones,
    tombstones: s.tombstones,
    settings: pickSharedSettings(s.settings),
    settingsUpdatedAt: s.meta.settingsUpdatedAt,
    google: mode === 'live' ? { links: gs.links, containers: gs.containers, excluded: gs.excluded } : undefined,
  });
}

async function drivePull(backend: GoogleBackend, mode: AppMode, notes: string[]): Promise<void> {
  const app = useAppStore.getState();
  const known = app.googleSync[mode].containers.driveStateFileId;
  const ref = known ? { id: known } : await backend.findAppDataFile(STATE_FILE_NAME);
  if (!ref) return;
  let text: string;
  try {
    text = await backend.downloadText(ref.id);
  } catch {
    app.patchGoogleSync(mode, { containers: { ...app.googleSync[mode].containers, driveStateFileId: undefined } });
    return;
  }
  const remote = parseSnapshot(text);
  if (!remote) return;
  app.patchGoogleSync(mode, { containers: { ...useAppStore.getState().googleSync[mode].containers, driveStateFileId: ref.id } });
  if (remote.deviceId === app.meta.deviceId && lastDriveFingerprint) return;
  const outcome = mergeSnapshots(localSnapshot(mode), remote.data);
  if (outcome.changedLocal) {
    suppressChangeUntil = Date.now() + 3000;
    useAppStore.getState().applyDriveMerge(outcome.merged);
    if (outcome.added || outcome.removed) notes.push(`Z Disku sloučeno: +${outcome.added} / −${outcome.removed} položek z jiného zařízení.`);
  }
}

async function drivePush(backend: GoogleBackend, mode: AppMode): Promise<void> {
  const app = useAppStore.getState();
  const data = localSnapshot(mode);
  const fingerprint = hashString(JSON.stringify(data)).toString(36);
  if (fingerprint === lastDriveFingerprint) return;
  const snapshot = buildSnapshot(data, app.meta.deviceId, new Date());
  const ref = await backend.saveAppDataFile(STATE_FILE_NAME, JSON.stringify(snapshot), app.googleSync[mode].containers.driveStateFileId);
  lastDriveFingerprint = fingerprint;
  const current = useAppStore.getState().googleSync[mode];
  useAppStore.getState().patchGoogleSync(mode, { containers: { ...current.containers, driveStateFileId: ref.id }, driveStateSyncedAt: new Date().toISOString() });
}

async function exportMaterials(backend: GoogleBackend, mode: AppMode, notes: string[]): Promise<number> {
  const app = useAppStore.getState();
  const conf = app.settings.google.drive;
  const pending = app.materials.filter((m) => (mode === 'demo' || !m.demo) && (m.kind === 'note' || m.kind === 'upload') && m.driveSyncedAt !== (m.updatedAt ?? m.createdAt));
  if (pending.length === 0) return 0;
  const gs = app.googleSync[mode];
  const root = gs.containers.driveFolderId ?? (await backend.ensureFolder(conf.folderName || 'Stihnu'));
  const folders: Record<string, string> = { ...gs.containers.subjectFolders };
  let exported = 0;
  for (const m of pending.slice(0, 25)) {
    const subject = app.subjects.find((s) => s.id === m.subjectId);
    const folderName = subject ? `${subject.code ? `${subject.code} ` : ''}${subject.name}` : 'Ostatní';
    folders[m.subjectId] = folders[m.subjectId] ?? (await backend.ensureFolder(folderName, root));
    const version = m.updatedAt ?? m.createdAt;
    if (m.kind === 'note') {
      const ref = await backend.upsertFile({
        name: m.title,
        mimeType: 'text/html',
        content: markdownToHtml(m.markdown ?? '', m.title),
        parentId: folders[m.subjectId],
        existingId: m.driveFileId,
        convertTo: 'application/vnd.google-apps.document',
      });
      useAppStore.getState().markMaterialExported(m.id, { driveFileId: ref.id, driveUrl: ref.webViewLink, version });
      exported++;
    } else if (m.blobKey) {
      const blob = await loadBlob(m.blobKey);
      if (!blob) continue;
      const ref = await backend.upsertFile({ name: m.fileName ?? m.title, mimeType: m.mimeType ?? blob.type ?? 'application/octet-stream', content: blob, parentId: folders[m.subjectId], existingId: m.driveFileId });
      useAppStore.getState().markMaterialExported(m.id, { driveFileId: ref.id, driveUrl: ref.webViewLink, version });
      exported++;
    }
  }
  const current = useAppStore.getState().googleSync[mode];
  useAppStore.getState().patchGoogleSync(mode, { containers: { ...current.containers, driveFolderId: root, subjectFolders: folders } });
  if (exported) notes.push(`Na Disk nahráno ${exported} ${exported === 1 ? 'materiál' : exported < 5 ? 'materiály' : 'materiálů'}.`);
  return exported;
}

/* ------------------------------------------------------------------ */
/* Google: hlavní běh                                                  */
/* ------------------------------------------------------------------ */

export async function runGoogleSync(options: { manual?: boolean; allowMassDelete?: boolean } = {}): Promise<SyncReport | null> {
  const ui = useSyncStore.getState();
  if (ui.running) return null;
  const app = useAppStore.getState();
  const mode = app.settings.mode;
  const g = app.settings.google;
  if (!g.enabled) return null;
  if (!app.googleSync[mode].connectedAt) return null;

  useSyncStore.setState({ running: true, phase: 'Připojuji se ke Googlu', lastError: null });
  const started = Date.now();
  const parts: ServiceResult[] = [];
  const services: SyncService[] = [];
  const notes: string[] = [];
  const errors: string[] = [];
  try {
    const backend = await backendFor(mode, serverFlow());
    if (mode === 'live') await getAccessToken(serverFlow());

    if (g.drive.enabled && g.drive.syncState) {
      useSyncStore.setState({ phase: 'Disk: slučuji data z ostatních zařízení' });
      try {
        await drivePull(backend, mode, notes);
        services.push('drive');
      } catch (error) {
        if (error instanceof GoogleAuthError) throw error;
        errors.push(`Disk: ${errorMessage(error)}`);
      }
    }

    const ctx = (): SyncContext => {
      const s = useAppStore.getState();
      return {
        backend,
        settings: s.settings.google,
        state: s.googleSync[mode],
        data: {
          subjects: s.subjects,
          events: s.events,
          requirements: s.requirements,
          tasks: s.tasks,
          // Jen termíny harmonogramu, které se studenta týkají (skryté se z Googlu uklidí), a odpočty.
          milestones: [
            ...splitMilestones(s.milestones, { profile: s.settings.studyProfile, hidden: s.settings.hiddenMilestones, shown: s.settings.shownMilestones }).visible,
            ...(s.settings.countdowns ?? []).map(countdownMilestone),
          ],
          tombstones: s.tombstones,
          buildingFor: (e) => buildingForEvent(e, s.settings).building,
        },
        now: mode === 'demo' ? appNow() : new Date(),
        includeDemo: mode === 'demo',
        appUrl: APP_URL,
        allowMassDelete: options.allowMassDelete,
        progress: (phase) => useSyncStore.setState({ phase }),
      };
    };

    const massDelete: SyncUiState['massDelete'] = [];
    if (g.calendar.enabled) {
      const result = await syncCalendar(ctx());
      parts.push(result);
      services.push('calendar');
      suppressChangeUntil = Date.now() + 3000;
      const s = useAppStore.getState();
      s.applySync(mode, result.ops, mergeServiceState(s.googleSync[mode], 'calendar', result));
      if (result.massDelete) massDelete.push(result.massDelete);
      useSyncStore.setState({ calendars: result.calendars ?? [] });
    }
    if (g.tasks.enabled) {
      const result = await syncTasks(ctx());
      parts.push(result);
      services.push('tasks');
      suppressChangeUntil = Date.now() + 3000;
      const s = useAppStore.getState();
      s.applySync(mode, result.ops, mergeServiceState(s.googleSync[mode], 'tasks', result));
      if (result.massDelete) massDelete.push(result.massDelete);
      useSyncStore.setState({ taskLists: result.taskLists ?? [] });
    }

    if (g.drive.enabled) {
      if (g.drive.exportMaterials) {
        useSyncStore.setState({ phase: 'Disk: nahrávám materiály' });
        try {
          await exportMaterials(backend, mode, notes);
        } catch (error) {
          if (error instanceof GoogleAuthError) throw error;
          errors.push(`Materiály: ${errorMessage(error)}`);
        }
      }
      if (g.drive.syncState) {
        useSyncStore.setState({ phase: 'Disk: ukládám zálohu' });
        try {
          await drivePush(backend, mode);
        } catch (error) {
          if (error instanceof GoogleAuthError) throw error;
          errors.push(`Disk: ${errorMessage(error)}`);
        }
      }
    }

    const report = combineReports(parts, services, started, new Date(), errors, notes);
    const current = useAppStore.getState().googleSync[mode];
    useAppStore.getState().patchGoogleSync(mode, { lastSync: report.at, history: [report, ...current.history].slice(0, 12) });
    useSyncStore.setState({ running: false, phase: null, needsAuth: false, massDelete, lastError: report.errors[0] ?? null });
    if (mode === 'demo') saveDemoBackend();
    if (options.manual) {
      const changed = report.pushed.created + report.pushed.updated + report.pushed.deleted + report.pulled.created + report.pulled.updated + report.pulled.deleted;
      if (report.errors.length) toast.error(`Synchronizace s chybami: ${report.errors[0]}`);
      else toast.success(changed ? `Synchronizováno · ${changed} ${changed === 1 ? 'změna' : changed < 5 ? 'změny' : 'změn'}` : 'Vše je aktuální ✓');
    }
    return report;
  } catch (error) {
    const auth = error instanceof GoogleAuthError;
    useSyncStore.setState({ running: false, phase: null, needsAuth: auth, lastError: errorMessage(error) });
    if (options.manual && !auth) toast.error(errorMessage(error));
    if (mode === 'demo') saveDemoBackend();
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Odebírané kalendáře (SIS, Moodle)                                   */
/* ------------------------------------------------------------------ */

export async function refreshIcsSource(source: IcsSource, options: { manual?: boolean; replaceDemo?: boolean } = {}): Promise<{ ok: boolean; count: number; message: string }> {
  useSyncStore.setState((s) => ({ icsBusy: { ...s.icsBusy, [source.id]: true } }));
  const app = useAppStore.getState();
  const mode = app.settings.mode;
  const now = appNow();
  try {
    const api = createApi(app.settings, useUiStore.getState().server, appNow);
    const text = source.kind === 'moodle' && api.mode === 'demo' ? buildDemoMoodleIcs(now) : await api.fetchIcs(source.url);
    const calendar = parseIcs(text, { windowStart: new Date(now.getTime() - 45 * 86_400_000), windowEnd: new Date(now.getTime() + 240 * 86_400_000) });
    let count = 0;
    let message = '';
    if (source.kind === 'moodle') {
      const result = buildMoodleIcsImport(calendar, { subjects: app.subjects, requirements: app.requirements, now });
      const total = app.requirements.filter((r) => r.externalId?.startsWith('moodle-ics:')).length + result.created;
      count = total;
      app.applyMoodleIcs({ subjects: result.newSubjects, requirements: result.requirements, source: { ...source, lastSync: new Date().toISOString(), lastError: undefined, itemCount: total }, demo: mode === 'demo' });
      message = result.created || result.updated ? `Moodle: ${result.created} nových, ${result.updated} změněných termínů` : 'Moodle: žádné nové termíny';
    } else {
      const preview = buildIcsImport(calendar, { subjects: app.subjects, buildings: app.settings.buildings, aliases: app.settings.locationAliases, source: source.kind === 'google' ? 'google' : 'sis', now });
      count = preview.events.length;
      app.applyIcsImport({
        subjects: preview.newSubjects,
        events: preview.events,
        replaceSourceId: source.id,
        replaceSources: options.replaceDemo ? ['demo'] : [],
        source: { ...source, label: source.label ?? preview.calendarName, lastSync: new Date().toISOString(), lastError: undefined, itemCount: count },
        demo: mode === 'demo',
      });
      message = `${source.label ?? preview.calendarName ?? 'Kalendář'}: ${count} akcí`;
      // Předmětům z rozvrhu rovnou doplnit sylaby a povinnosti z nich (na pozadí).
      if (source.kind === 'sis') setTimeout(() => void importAllSyllabi(), 400);
    }
    if (options.manual) toast.success(message);
    return { ok: true, count, message };
  } catch (error) {
    const message = errorMessage(error);
    useAppStore.getState().upsertIcsSource({ ...source, lastError: message, lastSync: source.lastSync });
    if (options.manual) toast.error(message);
    return { ok: false, count: 0, message };
  } finally {
    useSyncStore.setState((s) => ({ icsBusy: { ...s.icsBusy, [source.id]: false } }));
  }
}

/* ------------------------------------------------------------------ */
/* Moodle přes token                                                   */
/* ------------------------------------------------------------------ */

export async function runMoodleTokenSync(manual = false): Promise<boolean> {
  const app = useAppStore.getState();
  const conn = app.settings.moodle;
  if (!conn?.token || useSyncStore.getState().moodleBusy) return false;
  useSyncStore.setState({ moodleBusy: true });
  try {
    const api = createApi(app.settings, useUiStore.getState().server, appNow);
    const client = api.moodle(conn.baseUrl, conn.token);
    const result = await syncMoodle(client, { subjects: app.subjects, requirements: app.requirements, materials: app.materials }, appNow());
    useAppStore.getState().applyMoodleSync(result, conn, app.settings.mode === 'demo');
    if (manual) toast.success(`Moodle aktualizován · ${result.stats.requirements} úkolů`);
    return true;
  } catch (error) {
    if (manual) toast.error(errorMessage(error));
    return false;
  } finally {
    useSyncStore.setState({ moodleBusy: false });
  }
}

/* ------------------------------------------------------------------ */
/* Plánovač na pozadí                                                  */
/* ------------------------------------------------------------------ */

let soonTimer: ReturnType<typeof setTimeout> | null = null;
let ticking = false;
const icsFailedAt: Record<string, number> = {};

async function backgroundTick(): Promise<void> {
  if (ticking || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  ticking = true;
  try {
    const app = useAppStore.getState();
    const now = Date.now();
    const mode = app.settings.mode;
    const g = app.settings.google;
    const gs = app.googleSync[mode];
    if (g.enabled && g.auto && gs.connectedAt && !useSyncStore.getState().needsAuth) {
      const due = !gs.lastSync || now - new Date(gs.lastSync).getTime() > g.intervalMinutes * 60_000;
      const canRun = mode === 'demo' || tokenState().valid || serverFlow();
      if (due && canRun) await runGoogleSync();
      else if (due && !canRun) useSyncStore.setState({ needsAuth: true });
    }
    for (const source of app.settings.icsSources) {
      if (!source.autoRefresh) continue;
      const stale = !source.lastSync || now - new Date(source.lastSync).getTime() > app.settings.icsRefreshHours * 3_600_000;
      const backoff = icsFailedAt[source.id] && now - icsFailedAt[source.id] < 30 * 60_000;
      if (stale && !backoff) {
        const result = await refreshIcsSource(source);
        if (!result.ok) icsFailedAt[source.id] = now;
      }
    }
    const moodle = app.settings.moodle;
    if (moodle?.token && (!moodle.lastSync || now - new Date(moodle.lastSync).getTime() > 6 * 3_600_000)) await runMoodleTokenSync();
  } finally {
    ticking = false;
  }
}

/** Po lokální změně pošle data do Googlu do půl minuty (místo čekání na interval). */
function scheduleSoon(): void {
  const app = useAppStore.getState();
  const mode = app.settings.mode;
  if (!app.settings.google.enabled || !app.settings.google.auto || !app.googleSync[mode].connectedAt) return;
  if (Date.now() < suppressChangeUntil) return;
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    const canRun = mode === 'demo' || tokenState().valid || serverFlow();
    if (canRun) void runGoogleSync();
  }, 8_000);
}

export function useBackgroundSync(): void {
  useEffect(() => {
    const tick = () => void backgroundTick();
    const first = setTimeout(tick, 2500);
    const timer = setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', onVisible);
    const unsubscribe = useAppStore.subscribe((state, prev) => {
      const a = state.settings;
      const b = prev.settings;
      if (
        state.events !== prev.events ||
        state.tasks !== prev.tasks ||
        state.requirements !== prev.requirements ||
        state.milestones !== prev.milestones ||
        state.materials !== prev.materials ||
        // I odpočty a to, které termíny harmonogramu se studenta týkají
        a.countdowns !== b.countdowns ||
        a.hiddenMilestones !== b.hiddenMilestones ||
        a.shownMilestones !== b.shownMilestones ||
        a.studyProfile !== b.studyProfile
      )
        scheduleSoon();
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('online', tick);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
      if (soonTimer) clearTimeout(soonTimer);
    };
  }, []);
}
