/**
 * Obousměrná synchronizace s Google Kalendářem a Google Úkoly.
 *
 * Princip: každá propojená položka má vazbu (SyncLink) s otiskem lokální
 * i vzdálené podoby z poslední synchronizace. Změnu strany poznáme podle
 * změny otisku; když se změnily obě, rozhodne nastavená politika konfliktů.
 *
 * Bezpečnost mazání:
 *  - smazání v aplikaci se do Googlu promítne jen přes tombstone (výslovné smazání);
 *  - zmizelá kopie importu (např. přesunutá hodina v SISu) se smaže jen u položek,
 *    které vytvořila aplikace, a při hromadném mazání se nejdřív zeptáme;
 *  - smazání výuky v Googlu výuku v aplikaci nesmaže, jen ji přestaneme zapisovat.
 *
 * Engine nesahá do stavu aplikace – vrací operace (LocalOp), které provede store.
 */
import type {
  Building,
  GoogleSyncSettings,
  GoogleSyncState,
  LocalKey,
  Milestone,
  Requirement,
  ScheduleEvent,
  Subject,
  SyncCounts,
  SyncLink,
  Task,
} from '../../types';
import { hashString } from '../id';
import { isRequirementComplete } from '../progress';
import { classesInOwnCalendar } from '../dedupe';
import { keyOf } from './keys';
import {
  eventFieldsFromRemote,
  eventPayload,
  GOOGLE_EVENT_COLOR,
  hashPayload,
  mergeDue,
  milestonePayload,
  personalTaskPayload,
  remoteEventKey,
  remoteEventPayload,
  remoteTaskPayload,
  requirementEventPayload,
  requirementTaskPayload,
  subtaskPayload,
  taskMarkerKey,
  toEventBody,
  toTaskBody,
  type CalendarCandidate,
  type LocalOp,
  type TaskCandidate,
} from './mapping';
import { GoogleApiError, GoogleAuthError, type GoogleBackend, type RemoteCalendar, type RemoteEvent, type RemoteTask } from './remote';

export const DEDICATED_CALENDAR_NAME = 'Stihnuto · studium';
export const DEDICATED_TASKLIST_NAME = 'Stihnuto';
/** Názvy z doby, kdy se aplikace jmenovala Stihnu – existující kalendář a seznam se dál používají. */
const LEGACY_CALENDAR_NAMES = ['Stihnu · studium'];
const LEGACY_TASKLIST_NAMES = ['Stihnu'];

const DAY = 86_400_000;
const EPOCH = '1970-01-01T00:00:00.000Z';

export interface SyncData {
  subjects: Subject[];
  events: ScheduleEvent[];
  requirements: Requirement[];
  tasks: Task[];
  milestones: Milestone[];
  tombstones: Record<LocalKey, string>;
  buildingFor: (event: ScheduleEvent) => Building | undefined;
}

export interface SyncContext {
  backend: GoogleBackend;
  settings: GoogleSyncSettings;
  state: GoogleSyncState;
  data: SyncData;
  now: Date;
  /** Zahrnout ukázková data (jen v Sandboxu se simulovaným Googlem). */
  includeDemo: boolean;
  appUrl: string;
  /** Uživatel potvrdil hromadné mazání zastaralých kopií. */
  allowMassDelete?: boolean;
  progress?: (message: string) => void;
}

export interface ServiceResult {
  ops: LocalOp[];
  /** Nové vazby této služby (nahrazují předchozí vazby služby). */
  links: Record<string, SyncLink>;
  containers: Partial<GoogleSyncState['containers']>;
  excludedAdd: string[];
  pushed: SyncCounts;
  pulled: SyncCounts;
  conflicts: number;
  errors: string[];
  notes: string[];
  massDelete?: { service: 'calendar' | 'tasks'; count: number };
  /** Kalendáře / seznamy k výběru v nastavení. */
  calendars?: RemoteCalendar[];
  taskLists?: { id: string; title: string }[];
}

export function linkId(service: 'calendar' | 'tasks', key: string): string {
  return `${service}|${key}`;
}

function emptyResult(): ServiceResult {
  return {
    ops: [],
    links: {},
    containers: {},
    excludedAdd: [],
    pushed: { created: 0, updated: 0, deleted: 0 },
    pulled: { created: 0, updated: 0, deleted: 0 },
    conflicts: 0,
    errors: [],
    notes: [],
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Spustí úlohy s omezenou souběžností; chyba přihlášení zastaví zbytek. */
export async function runPool(jobs: (() => Promise<void>)[], limit = 4): Promise<void> {
  let next = 0;
  let fatal: unknown = null;
  const worker = async () => {
    while (next < jobs.length && !fatal) {
      const job = jobs[next++];
      try {
        await job();
      } catch (error) {
        if (error instanceof GoogleAuthError) fatal = error;
        else throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  if (fatal) throw fatal;
}

function pushError(result: ServiceResult, label: string, error: unknown): void {
  if (error instanceof GoogleAuthError) throw error;
  if (result.errors.length < 6) result.errors.push(`${label}: ${errorText(error)}`);
  else if (result.errors.length === 6) result.errors.push('…a další chyby.');
}

function newerLocal(localUpdated: string, remoteUpdated: string | undefined): boolean {
  return Date.parse(localUpdated || EPOCH) >= Date.parse(remoteUpdated || EPOCH);
}

/* ================================================================== */
/* Google Kalendář                                                     */
/* ================================================================== */

type CalCandidate = CalendarCandidate & { kind: 'personal' | 'class' | 'deadline' | 'milestone'; localId: string };

export async function syncCalendar(ctx: SyncContext): Promise<ServiceResult> {
  const { backend, settings, state, data, now } = ctx;
  const cal = settings.calendar;
  const result = emptyResult();
  const canPush = cal.direction !== 'pull';
  const canPull = cal.direction !== 'push';
  const syncedAt = now.toISOString();

  // 1) Cílový kalendář
  ctx.progress?.('Kalendář: načítám seznam kalendářů');
  const calendars = await backend.listCalendars();
  result.calendars = calendars;
  let targetId = '';
  if (cal.target === 'dedicated') {
    const known = state.containers.calendarId ? calendars.find((c) => c.id === state.containers.calendarId) : undefined;
    const byName = calendars.find((c) => (c.summary === DEDICATED_CALENDAR_NAME || LEGACY_CALENDAR_NAMES.includes(c.summary ?? '')) && c.accessRole === 'owner');
    if (known) targetId = known.id;
    else if (byName) targetId = byName.id;
    else if (canPush) {
      const created = await backend.createCalendar(DEDICATED_CALENDAR_NAME, 'Rozvrh, termíny a vlastní události z aplikace Stihnuto.');
      targetId = created.id;
      calendars.push(created);
      result.notes.push(`Vytvořen kalendář „${DEDICATED_CALENDAR_NAME}“.`);
    }
    result.containers.calendarId = targetId || undefined;
  } else {
    targetId = cal.target;
  }
  const targetMeta = calendars.find((c) => c.id === targetId || (targetId === 'primary' && c.primary));
  const targetName = targetMeta?.summary ?? (targetId === 'primary' ? 'Hlavní kalendář' : DEDICATED_CALENDAR_NAME);

  const rangeStart = now.getTime() - 30 * DAY;
  const rangeEnd = now.getTime() + 366 * DAY;
  const inRange = (value: string | undefined) => {
    if (!value) return true;
    const t = new Date(value.length === 10 ? `${value}T12:00:00` : value).getTime();
    return t >= rangeStart && t <= rangeEnd;
  };

  // 2) Kandidáti k zápisu
  const subjects = new Map(data.subjects.map((s) => [s.id, s]));
  const eventsById = new Map(data.events.map((e) => [e.id, e]));
  const excluded = new Set(state.excluded);
  const candidates = new Map<string, CalCandidate>();
  const exists = new Set<string>();
  const classEnd = now.getTime() + Math.max(1, cal.rangeWeeks) * 7 * DAY;
  // Hodiny, které student už má ve vlastním kalendáři, podruhé nezapisujeme.
  const ownCopies = new Set([...classesInOwnCalendar(data.events, data.subjects)].map((id) => keyOf.event(id)));

  for (const e of data.events) {
    if (e.google?.readOnly) continue;
    if (e.demo && !ctx.includeDemo) continue;
    const key = keyOf.event(e.id);
    exists.add(key);
    if (excluded.has(linkId('calendar', key))) continue;
    const personal = e.kind === 'personal';
    const fromGoogle = e.source === 'google';
    if (personal) {
      if (!cal.push.personal && !fromGoogle) continue;
      if (!inRange(e.start)) continue;
    } else {
      if (e.kind === 'exam' ? !cal.push.exams : !cal.push.classes) continue;
      const start = new Date(e.start).getTime();
      if (start < now.getTime() - DAY || start > classEnd) continue;
      if (ownCopies.has(key)) continue;
    }
    const subject = e.subjectId ? subjects.get(e.subjectId) : undefined;
    candidates.set(key, {
      key,
      kind: personal ? 'personal' : 'class',
      localId: e.id,
      payload: eventPayload(e, subject, personal ? undefined : data.buildingFor(e), ctx.appUrl),
      editable: personal,
      updatedAt: e.updatedAt ?? e.createdAt ?? EPOCH,
      reminders: personal ? [30] : e.kind === 'exam' ? cal.remindersDeadlines : cal.remindersClasses,
      colorId: cal.colors && subject && !personal ? GOOGLE_EVENT_COLOR[subject.color] : undefined,
    });
  }

  for (const r of data.requirements) {
    if (r.demo && !ctx.includeDemo) continue;
    const key = keyOf.req(r.id);
    exists.add(key);
    if (!cal.push.deadlines || !r.deadline || excluded.has(linkId('calendar', key))) continue;
    const t = new Date(r.deadline).getTime();
    if (t < now.getTime() - 7 * DAY || t > rangeEnd) continue;
    const subject = subjects.get(r.subjectId);
    const payload = requirementEventPayload(r, subject, ctx.appUrl);
    if (!payload) continue;
    candidates.set(key, {
      key,
      kind: 'deadline',
      localId: r.id,
      payload,
      editable: false,
      updatedAt: r.updatedAt ?? r.createdAt ?? EPOCH,
      reminders: cal.remindersDeadlines,
      colorId: cal.colors && subject ? GOOGLE_EVENT_COLOR[subject.color] : undefined,
      transparent: true,
    });
  }

  for (const m of data.milestones) {
    if (m.source === 'demo' && !ctx.includeDemo) continue;
    const key = keyOf.ms(m.id);
    exists.add(key);
    if (!cal.push.milestones || excluded.has(linkId('calendar', key))) continue;
    const endValue = m.end ?? m.start;
    if (!inRange(m.start) && !inRange(endValue)) continue;
    const subject = m.subjectId ? subjects.get(m.subjectId) : undefined;
    candidates.set(key, {
      key,
      kind: 'milestone',
      localId: m.id,
      payload: milestonePayload(m, subject),
      editable: false,
      updatedAt: m.updatedAt ?? EPOCH,
      reminders: m.category === 'deadline' || m.category === 'enrollment' ? cal.remindersDeadlines : [],
      transparent: true,
    });
  }

  // 3) Vzdálené události cílového kalendáře
  let remoteEvents: RemoteEvent[] = [];
  if (targetId) {
    ctx.progress?.(`Kalendář: stahuji „${targetName}“`);
    remoteEvents = await backend.listEvents(targetId, { timeMin: new Date(rangeStart).toISOString(), timeMax: new Date(rangeEnd).toISOString() });
  }
  const remoteById = new Map(remoteEvents.map((ev) => [ev.id, ev]));
  const remoteByKey = new Map<string, RemoteEvent>();
  for (const ev of remoteEvents) {
    const k = remoteEventKey(ev);
    if (k && ev.status !== 'cancelled') remoteByKey.set(k, ev);
  }

  const jobs: (() => Promise<void>)[] = [];
  const handled = new Set<string>();
  const linkedRemote = new Set<string>();
  const obsolete: { id: string; link: SyncLink }[] = [];
  let appLinks = 0;
  let droppedContainer = 0;
  let removedCopies = 0;

  const queueDelete = (remoteId: string, label: string) => {
    jobs.push(async () => {
      try {
        await backend.deleteEvent(targetId, remoteId);
        result.pushed.deleted++;
      } catch (error) {
        pushError(result, label, error);
      }
    });
  };

  const queuePatch = (id: string, link: SyncLink, local: CalCandidate) => {
    jobs.push(async () => {
      try {
        const saved = await backend.patchEvent(link.container, link.remoteId, toEventBody(local, ctx.appUrl));
        result.links[id] = {
          ...link,
          localHash: hashPayload(local.payload),
          remoteHash: hashPayload(remoteEventPayload(saved)),
          remoteUpdated: saved.updated,
          at: local.payload.start,
          syncedAt,
        };
        result.pushed.updated++;
      } catch (error) {
        if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return; // mezitím smazáno – vazba zaniká
        result.links[id] = link;
        pushError(result, local.payload.summary, error);
      }
    });
  };

  const applyRemoteToPersonal = (local: CalCandidate, remote: RemoteEvent, container: string): string => {
    const current = eventsById.get(local.localId);
    if (!current) return hashPayload(local.payload);
    const updated: ScheduleEvent = {
      ...current,
      ...eventFieldsFromRemote(remote),
      google: { ...current.google, calendarId: container, eventId: remote.id, htmlLink: remote.htmlLink, calendarName: targetName },
      updatedAt: remote.updated,
    };
    result.ops.push({ type: 'upsertEvent', event: updated });
    result.pulled.updated++;
    return hashPayload(eventPayload(updated, undefined, undefined, ctx.appUrl));
  };

  // 4) Existující vazby
  for (const [id, link] of Object.entries(state.links)) {
    if (link.service !== 'calendar') continue;
    if (!targetId || link.container !== targetId) {
      droppedContainer++;
      continue;
    }
    const key = id.slice('calendar|'.length);
    handled.add(key);
    linkedRemote.add(link.remoteId);
    if (link.origin === 'app') appLinks++;
    const local = candidates.get(key);
    const localExists = exists.has(key);
    if (localExists && !local) {
      if (ownCopies.has(key) && link.origin === 'app' && canPush) {
        // Dřív zapsaná kopie hodiny, kterou student má i ve vlastním kalendáři → uklidit.
        queueDelete(link.remoteId, 'Úklid zdvojené hodiny');
        removedCopies++;
        continue;
      }
      result.links[id] = link; // mimo okno nebo vypnutá kategorie – nesahat
      continue;
    }
    let remote: RemoteEvent | null | undefined = remoteById.get(link.remoteId);
    if (!remote) {
      if (!inRange(link.at)) {
        if (localExists) result.links[id] = link;
        continue;
      }
      try {
        remote = await backend.getEvent(targetId, link.remoteId);
      } catch (error) {
        pushError(result, 'Ověření události', error);
        result.links[id] = link;
        continue;
      }
    }
    const remoteGone = !remote || remote.status === 'cancelled';

    if (remoteGone) {
      if (localExists && local) {
        if (canPull && (link.origin === 'google' || local.kind === 'personal')) {
          result.ops.push({ type: 'removeEvent', id: local.localId });
          result.pulled.deleted++;
        } else {
          result.excludedAdd.push(id);
        }
      }
      continue;
    }

    if (!localExists) {
      if (data.tombstones[key]) {
        if (canPush && settings.deletions === 'mirror') queueDelete(link.remoteId, 'Smazání události');
        else result.excludedAdd.push(linkId('calendar', `remote:${link.remoteId}`));
      } else if (link.origin === 'app') {
        obsolete.push({ id, link });
      }
      continue;
    }

    const remoteEv = remote as RemoteEvent;
    const localHash = hashPayload(local!.payload);
    const remoteHash = hashPayload(remoteEventPayload(remoteEv));
    const localChanged = localHash !== link.localHash;
    const remoteChanged = remoteHash !== link.remoteHash;
    if (!localChanged && !remoteChanged) {
      result.links[id] = link;
      continue;
    }
    let winner: 'local' | 'remote' = localChanged ? 'local' : 'remote';
    if (localChanged && remoteChanged) {
      result.conflicts++;
      if (!local!.editable) winner = 'local';
      else if (settings.conflict === 'app') winner = 'local';
      else if (settings.conflict === 'google') winner = 'remote';
      else winner = newerLocal(local!.updatedAt, remoteEv.updated) ? 'local' : 'remote';
    }
    if (winner === 'local') {
      if (canPush) queuePatch(id, link, local!);
      else result.links[id] = { ...link, localHash, remoteHash, remoteUpdated: remoteEv.updated, syncedAt };
    } else if (local!.editable && canPull) {
      const newLocalHash = applyRemoteToPersonal(local!, remoteEv, targetId);
      result.links[id] = { ...link, localHash: newLocalHash, remoteHash, remoteUpdated: remoteEv.updated, syncedAt };
    } else {
      // Výuka upravená přímo v Googlu: nepřepisujeme ji, dokud se nezmění v aplikaci.
      result.links[id] = { ...link, remoteHash, remoteUpdated: remoteEv.updated, syncedAt };
    }
  }
  if (droppedContainer > 0 && targetId) result.notes.push(`Cílový kalendář se změnil – ${droppedContainer} starých vazeb rozpojeno.`);
  if (removedCopies > 0) result.notes.push(`Zdvojené hodiny odstraněny z Google Kalendáře: ${removedCopies} (máte je ve vlastním kalendáři).`);

  // 5) Nové lokální položky → Google
  for (const [key, local] of candidates) {
    if (handled.has(key) || !targetId) continue;
    const id = linkId('calendar', key);
    const existing = remoteByKey.get(key);
    if (existing) {
      // Ztracená vazba (jiné zařízení, obnova dat) – propojit místo duplikátu.
      linkedRemote.add(existing.id);
      const link: SyncLink = {
        service: 'calendar',
        container: targetId,
        remoteId: existing.id,
        origin: local.kind === 'personal' && eventsById.get(local.localId)?.source === 'google' ? 'google' : 'app',
        localHash: hashPayload(local.payload),
        remoteHash: hashPayload(remoteEventPayload(existing)),
        remoteUpdated: existing.updated,
        at: local.payload.start,
        syncedAt,
      };
      if (hashPayload(remoteEventPayload(existing)) !== hashPayload(local.payload) && canPush) queuePatch(id, { ...link, localHash: '' }, local);
      else result.links[id] = link;
      continue;
    }
    if (!canPush) continue;
    jobs.push(async () => {
      try {
        const saved = await backend.insertEvent(targetId, toEventBody(local, ctx.appUrl));
        result.links[id] = {
          service: 'calendar',
          container: targetId,
          remoteId: saved.id,
          origin: 'app',
          localHash: hashPayload(local.payload),
          remoteHash: hashPayload(remoteEventPayload(saved)),
          remoteUpdated: saved.updated,
          at: local.payload.start,
          syncedAt,
        };
        result.pushed.created++;
      } catch (error) {
        pushError(result, local.payload.summary, error);
      }
    });
  }

  // 6) Nové události v Googlu → osobní události v aplikaci
  if (targetId) {
    for (const ev of remoteEvents) {
      if (ev.status === 'cancelled' || linkedRemote.has(ev.id)) continue;
      const markerKey = remoteEventKey(ev);
      if (markerKey) {
        // Položka ze Stihnuta bez vazby (jiné zařízení) – smažeme jen, když ji uživatel smazal.
        if (data.tombstones[markerKey] && canPush && settings.deletions === 'mirror') queueDelete(ev.id, 'Smazání události');
        continue;
      }
      if (!canPull || excluded.has(linkId('calendar', `remote:${ev.id}`))) continue;
      const localId = `gcal_${hashString(`${targetId}|${ev.id}`).toString(36)}`;
      const event: ScheduleEvent = {
        id: localId,
        kind: 'personal',
        source: 'google',
        ...eventFieldsFromRemote(ev),
        google: { calendarId: targetId, eventId: ev.id, htmlLink: ev.htmlLink, calendarName: targetName },
        createdAt: ev.updated,
        updatedAt: ev.updated,
      };
      result.ops.push({ type: 'upsertEvent', event });
      result.links[linkId('calendar', keyOf.event(localId))] = {
        service: 'calendar',
        container: targetId,
        remoteId: ev.id,
        origin: 'google',
        localHash: hashPayload(eventPayload(event, undefined, undefined, ctx.appUrl)),
        remoteHash: hashPayload(remoteEventPayload(ev)),
        remoteUpdated: ev.updated,
        at: event.start,
        syncedAt,
      };
      result.pulled.created++;
    }
  }

  // 7) Zastaralé kopie importu (s pojistkou proti hromadnému mazání)
  if (obsolete.length > 0) {
    const massive = obsolete.length >= 20 && obsolete.length > appLinks * 0.4;
    if (massive && !ctx.allowMassDelete) {
      result.massDelete = { service: 'calendar', count: obsolete.length };
      for (const o of obsolete) result.links[o.id] = o.link;
    } else if (canPush) {
      for (const o of obsolete) queueDelete(o.link.remoteId, 'Úklid staré události');
    }
  }

  ctx.progress?.(`Kalendář: zapisuji ${jobs.length} změn`);
  await runPool(jobs, 4);

  // 8) Zrcadla dalších kalendářů (jen ke čtení)
  if (canPull) {
    const mirrored = new Set<string>();
    for (const calId of cal.pullCalendars) {
      const meta = calId === 'primary' ? calendars.find((c) => c.primary) : calendars.find((c) => c.id === calId);
      if (!meta || meta.id === targetId || (targetId === 'primary' && meta.primary)) continue;
      mirrored.add(calId);
      let list: RemoteEvent[] = [];
      try {
        list = await backend.listEvents(meta.id, { timeMin: new Date(rangeStart).toISOString(), timeMax: new Date(rangeEnd).toISOString() });
      } catch (error) {
        pushError(result, `Kalendář „${meta.summary}“`, error);
        continue;
      }
      const keep = new Set<string>();
      for (const ev of list) {
        if (ev.status === 'cancelled') continue;
        const localId = `gmir_${hashString(`${calId}|${ev.id}`).toString(36)}`;
        keep.add(localId);
        const mirror: ScheduleEvent = {
          id: localId,
          kind: 'personal',
          source: 'google',
          ...eventFieldsFromRemote(ev),
          google: { calendarId: calId, eventId: ev.id, readOnly: true, calendarName: meta.summary, color: meta.backgroundColor, htmlLink: ev.htmlLink },
          createdAt: ev.updated,
          updatedAt: ev.updated,
        };
        const current = eventsById.get(localId);
        if (!current) result.pulled.created++;
        if (!current || current.updatedAt !== mirror.updatedAt || current.google?.color !== mirror.google?.color || current.google?.calendarName !== mirror.google?.calendarName) {
          if (current) result.pulled.updated++;
          result.ops.push({ type: 'upsertEvent', event: mirror });
        }
      }
      for (const e of data.events) {
        if (e.google?.readOnly && e.google.calendarId === calId && !keep.has(e.id) && inRange(e.start)) {
          result.ops.push({ type: 'removeEvent', id: e.id });
          result.pulled.deleted++;
        }
      }
    }
    for (const e of data.events) {
      if (e.google?.readOnly && !mirrored.has(e.google.calendarId)) result.ops.push({ type: 'removeEvent', id: e.id });
    }
  }

  return result;
}

/* ================================================================== */
/* Google Úkoly                                                        */
/* ================================================================== */

type TaskCand = TaskCandidate & { kind: 'personal' | 'requirement' | 'subtask'; localId: string; parentId?: string };

export async function syncTasks(ctx: SyncContext): Promise<ServiceResult> {
  const { backend, settings, state, data, now } = ctx;
  const conf = settings.tasks;
  const result = emptyResult();
  const canPush = conf.direction !== 'pull';
  const canPull = conf.direction !== 'push';
  const syncedAt = now.toISOString();

  // 1) Cílový seznam
  ctx.progress?.('Úkoly: načítám seznamy');
  const lists = await backend.listTaskLists();
  result.taskLists = lists.map((l) => ({ id: l.id, title: l.title }));
  let targetId = '';
  if (conf.target === 'dedicated') {
    const known = state.containers.taskListId ? lists.find((l) => l.id === state.containers.taskListId) : undefined;
    const byName = lists.find((l) => l.title === DEDICATED_TASKLIST_NAME || LEGACY_TASKLIST_NAMES.includes(l.title ?? ''));
    if (known) targetId = known.id;
    else if (byName) targetId = byName.id;
    else if (canPush) {
      const created = await backend.createTaskList(DEDICATED_TASKLIST_NAME);
      targetId = created.id;
      result.notes.push(`Vytvořen seznam úkolů „${DEDICATED_TASKLIST_NAME}“.`);
    }
    result.containers.taskListId = targetId || undefined;
  } else if (conf.target === '@default') {
    targetId = '@default';
  } else {
    targetId = conf.target;
  }
  // '@default' = první (výchozí) seznam „Moje úkoly“; zbytek jsou vybrané další seznamy.
  const defaultListId = lists[0]?.id;
  const sameList = (a: string, b: string) => a === b || ((a === '@default' ? defaultListId : a) === (b === '@default' ? defaultListId : b));
  const pulls = conf.pullLists
    .map((id) => (id === '@default' ? defaultListId : id))
    .filter((id): id is string => Boolean(id) && lists.some((l) => l.id === id) && !sameList(id!, targetId));
  const containers = [...new Set([targetId, ...pulls])].filter(Boolean);

  // 2) Kandidáti
  const subjects = new Map(data.subjects.map((s) => [s.id, s]));
  const tasksById = new Map(data.tasks.map((t) => [t.id, t]));
  const reqById = new Map(data.requirements.map((r) => [r.id, r]));
  const excluded = new Set(state.excluded);
  const candidates = new Map<string, TaskCand>();
  const exists = new Set<string>();
  const oldDone = now.getTime() - 30 * DAY;

  for (const t of data.tasks) {
    if (t.demo && !ctx.includeDemo) continue;
    const key = keyOf.task(t.id);
    exists.add(key);
    if (excluded.has(linkId('tasks', key))) continue;
    if (!conf.push.personal && t.source !== 'google') continue;
    if (t.done && t.completedAt && Date.parse(t.completedAt) < oldDone) continue;
    candidates.set(key, { key, kind: 'personal', localId: t.id, payload: personalTaskPayload(t), editable: 'full', updatedAt: t.updatedAt ?? t.createdAt });
  }

  for (const r of data.requirements) {
    if (r.demo && !ctx.includeDemo) continue;
    const key = keyOf.req(r.id);
    exists.add(key);
    for (const st of r.subtasks) exists.add(keyOf.sub(r.id, st.id));
    if (!conf.push.requirements || !r.deadline || excluded.has(linkId('tasks', key))) continue;
    const done = isRequirementComplete(r);
    if (done && new Date(r.deadline).getTime() < oldDone) continue;
    const subject = subjects.get(r.subjectId);
    const pushSubtasks = conf.push.subtasks && r.subtasks.length > 0;
    candidates.set(key, {
      key,
      kind: 'requirement',
      localId: r.id,
      payload: requirementTaskPayload(r, subject, !pushSubtasks, now),
      editable: 'status',
      updatedAt: r.updatedAt ?? r.createdAt,
    });
    if (pushSubtasks) {
      for (const st of r.subtasks) {
        const subKey = keyOf.sub(r.id, st.id);
        if (excluded.has(linkId('tasks', subKey))) continue;
        candidates.set(subKey, {
          key: subKey,
          kind: 'subtask',
          localId: st.id,
          parentId: r.id,
          parentKey: key,
          payload: subtaskPayload(st),
          editable: 'status',
          updatedAt: r.updatedAt ?? r.createdAt,
        });
      }
    }
  }

  // 3) Vzdálené úkoly
  const remoteByContainer = new Map<string, RemoteTask[]>();
  for (const listId of containers) {
    ctx.progress?.('Úkoly: stahuji seznam');
    try {
      remoteByContainer.set(listId, await backend.listTasks(listId));
    } catch (error) {
      pushError(result, 'Seznam úkolů', error);
      remoteByContainer.set(listId, []);
    }
  }
  const remoteIndex = new Map<string, { task: RemoteTask; list: string }>();
  const remoteByKey = new Map<string, { task: RemoteTask; list: string }>();
  for (const [list, items] of remoteByContainer) {
    for (const task of items) {
      remoteIndex.set(`${list}|${task.id}`, { task, list });
      const k = taskMarkerKey(task.notes);
      if (k && !task.deleted) remoteByKey.set(k, { task, list });
    }
  }

  const phase1: (() => Promise<void>)[] = [];
  const phase2: (() => Promise<void>)[] = [];
  const handled = new Set<string>();
  const linkedRemote = new Set<string>();
  const obsolete: { id: string; link: SyncLink }[] = [];
  let appLinks = 0;

  const queueDelete = (list: string, remoteId: string, label: string) => {
    phase1.push(async () => {
      try {
        await backend.deleteTask(list, remoteId);
        result.pushed.deleted++;
      } catch (error) {
        if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return;
        pushError(result, label, error);
      }
    });
  };

  const queuePatch = (id: string, link: SyncLink, local: TaskCand) => {
    phase1.push(async () => {
      try {
        const saved = await backend.patchTask(link.container, link.remoteId, toTaskBody(local));
        result.links[id] = { ...link, localHash: hashPayload(local.payload), remoteHash: hashPayload(remoteTaskPayload(saved)), remoteUpdated: saved.updated, syncedAt };
        result.pushed.updated++;
      } catch (error) {
        if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return;
        result.links[id] = link;
        pushError(result, local.payload.title, error);
      }
    });
  };

  /** Převezme změnu z Googlu; vrací otisk nové lokální podoby. */
  const applyRemote = (local: TaskCand, remote: RemoteTask): string => {
    const rp = remoteTaskPayload(remote);
    if (local.kind === 'personal') {
      const current = tasksById.get(local.localId);
      if (!current) return hashPayload(local.payload);
      const updated: Task = {
        ...current,
        title: rp.title || current.title,
        notes: rp.notes || undefined,
        due: mergeDue(current.due, rp.due),
        done: rp.completed,
        completedAt: rp.completed ? (remote.completed ?? current.completedAt ?? remote.updated) : undefined,
        updatedAt: remote.updated,
      };
      result.ops.push({ type: 'upsertTask', task: updated });
      result.pulled.updated++;
      return hashPayload(personalTaskPayload(updated));
    }
    if (local.kind === 'requirement') {
      const req = reqById.get(local.localId);
      if (!req) return hashPayload(local.payload);
      let next: Requirement = req;
      if (rp.completed !== local.payload.completed) {
        result.ops.push({ type: 'setRequirementDone', id: req.id, done: rp.completed });
        next = rp.completed
          ? { ...next, done: true, subtasks: next.subtasks.map((s) => ({ ...s, done: true })) }
          : { ...next, done: false, subtasks: next.subtasks.every((s) => s.done) ? next.subtasks.map((s) => ({ ...s, done: false })) : next.subtasks };
      }
      if (rp.due && rp.due !== local.payload.due && req.deadline) {
        const deadline = mergeDue(req.deadline, rp.due);
        if (deadline) {
          result.ops.push({ type: 'setRequirementDeadline', id: req.id, deadline });
          next = { ...next, deadline };
        }
      }
      result.pulled.updated++;
      const pushSubtasks = conf.push.subtasks && next.subtasks.length > 0;
      return hashPayload(requirementTaskPayload(next, subjects.get(next.subjectId), !pushSubtasks, now));
    }
    // podúkol
    if (rp.completed !== local.payload.completed && local.parentId) {
      result.ops.push({ type: 'setSubtaskDone', requirementId: local.parentId, subtaskId: local.localId, done: rp.completed });
      result.pulled.updated++;
    }
    return hashPayload({ ...local.payload, completed: rp.completed });
  };

  // 4) Existující vazby
  for (const [id, link] of Object.entries(state.links)) {
    if (link.service !== 'tasks') continue;
    if (!containers.includes(link.container)) continue;
    const key = id.slice('tasks|'.length);
    handled.add(key);
    linkedRemote.add(`${link.container}|${link.remoteId}`);
    if (link.origin === 'app') appLinks++;
    const local = candidates.get(key);
    const localExists = exists.has(key);
    if (localExists && !local) {
      result.links[id] = link;
      continue;
    }
    const remote = remoteIndex.get(`${link.container}|${link.remoteId}`)?.task;
    const remoteGone = !remote || remote.deleted === true;

    if (remoteGone) {
      if (localExists && local) {
        if (canPull && local.kind === 'personal') {
          result.ops.push({ type: 'removeTask', id: local.localId });
          result.pulled.deleted++;
        } else {
          result.excludedAdd.push(id);
        }
      }
      continue;
    }
    if (!localExists) {
      if (data.tombstones[key]) {
        if (canPush && settings.deletions === 'mirror') queueDelete(link.container, link.remoteId, 'Smazání úkolu');
        else result.excludedAdd.push(linkId('tasks', `remote:${link.remoteId}`));
      } else if (link.origin === 'app') {
        obsolete.push({ id, link });
      }
      continue;
    }
    const localHash = hashPayload(local!.payload);
    const remoteHash = hashPayload(remoteTaskPayload(remote!));
    const localChanged = localHash !== link.localHash;
    const remoteChanged = remoteHash !== link.remoteHash;
    if (!localChanged && !remoteChanged) {
      result.links[id] = link;
      continue;
    }
    let winner: 'local' | 'remote' = localChanged ? 'local' : 'remote';
    if (localChanged && remoteChanged) {
      result.conflicts++;
      if (settings.conflict === 'app') winner = 'local';
      else if (settings.conflict === 'google') winner = 'remote';
      else winner = newerLocal(local!.updatedAt, remote!.updated) ? 'local' : 'remote';
    }
    if (winner === 'local') {
      if (canPush) queuePatch(id, link, local!);
      else result.links[id] = { ...link, localHash, remoteHash, remoteUpdated: remote!.updated, syncedAt };
    } else if (canPull) {
      const newLocalHash = applyRemote(local!, remote!);
      result.links[id] = { ...link, localHash: newLocalHash, remoteHash, remoteUpdated: remote!.updated, syncedAt };
    } else {
      result.links[id] = { ...link, remoteHash, remoteUpdated: remote!.updated, syncedAt };
    }
  }

  // 5) Nové lokální položky → Google (nejdřív úkoly, pak podúkoly s rodičem)
  for (const [key, local] of candidates) {
    if (handled.has(key) || !targetId) continue;
    const id = linkId('tasks', key);
    const existing = remoteByKey.get(key);
    if (existing) {
      linkedRemote.add(`${existing.list}|${existing.task.id}`);
      const link: SyncLink = {
        service: 'tasks',
        container: existing.list,
        remoteId: existing.task.id,
        origin: local.kind === 'personal' && tasksById.get(local.localId)?.source === 'google' ? 'google' : 'app',
        localHash: hashPayload(local.payload),
        remoteHash: hashPayload(remoteTaskPayload(existing.task)),
        remoteUpdated: existing.task.updated,
        syncedAt,
      };
      if (hashPayload(remoteTaskPayload(existing.task)) !== hashPayload(local.payload) && canPush) queuePatch(id, { ...link, localHash: '' }, local);
      else result.links[id] = link;
      continue;
    }
    if (!canPush) continue;
    const job = async () => {
      let parentRemote: string | undefined;
      if (local.parentKey) {
        parentRemote = result.links[linkId('tasks', local.parentKey)]?.remoteId;
        if (!parentRemote) return; // rodič se nezapsal – podúkol počká na příště
      }
      try {
        const saved = await backend.insertTask(targetId, toTaskBody(local), parentRemote);
        result.links[id] = {
          service: 'tasks',
          container: targetId,
          remoteId: saved.id,
          origin: 'app',
          localHash: hashPayload(local.payload),
          remoteHash: hashPayload(remoteTaskPayload(saved)),
          remoteUpdated: saved.updated,
          syncedAt,
        };
        result.pushed.created++;
      } catch (error) {
        pushError(result, local.payload.title, error);
      }
    };
    (local.kind === 'subtask' ? phase2 : phase1).push(job);
  }

  // 6) Nové úkoly v Googlu → vlastní úkoly v aplikaci
  const keepDoneSince = now.getTime() - Math.max(0, conf.keepCompletedDays) * DAY;
  for (const [list, items] of remoteByContainer) {
    for (const task of items) {
      if (task.deleted || linkedRemote.has(`${list}|${task.id}`)) continue;
      const markerKey = taskMarkerKey(task.notes);
      if (markerKey) {
        if (data.tombstones[markerKey] && canPush && settings.deletions === 'mirror') queueDelete(list, task.id, 'Smazání úkolu');
        continue;
      }
      if (!canPull || excluded.has(linkId('tasks', `remote:${task.id}`))) continue;
      if (!task.title?.trim()) continue;
      if (task.status === 'completed' && Date.parse(task.completed ?? task.updated) < keepDoneSince) continue;
      const rp = remoteTaskPayload(task);
      const localId = `gtask_${hashString(`${list}|${task.id}`).toString(36)}`;
      const local: Task = {
        id: localId,
        title: rp.title,
        notes: rp.notes || undefined,
        due: rp.due || undefined,
        done: rp.completed,
        completedAt: rp.completed ? (task.completed ?? task.updated) : undefined,
        source: 'google',
        createdAt: task.updated,
        updatedAt: task.updated,
      };
      result.ops.push({ type: 'upsertTask', task: local });
      result.links[linkId('tasks', keyOf.task(localId))] = {
        service: 'tasks',
        container: list,
        remoteId: task.id,
        origin: 'google',
        localHash: hashPayload(personalTaskPayload(local)),
        remoteHash: hashPayload(rp),
        remoteUpdated: task.updated,
        syncedAt,
      };
      result.pulled.created++;
    }
  }

  // 7) Zastaralé kopie
  if (obsolete.length > 0) {
    const massive = obsolete.length >= 20 && obsolete.length > appLinks * 0.4;
    if (massive && !ctx.allowMassDelete) {
      result.massDelete = { service: 'tasks', count: obsolete.length };
      for (const o of obsolete) result.links[o.id] = o.link;
    } else if (canPush) {
      for (const o of obsolete) queueDelete(o.link.container, o.link.remoteId, 'Úklid starého úkolu');
    }
  }

  ctx.progress?.(`Úkoly: zapisuji ${phase1.length + phase2.length} změn`);
  await runPool(phase1, 4);
  await runPool(phase2, 4);
  return result;
}
