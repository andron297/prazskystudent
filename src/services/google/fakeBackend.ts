/**
 * Simulovaný Google (Kalendář, Úkoly, Disk) pro Sandbox a testy.
 * Chová se jako skutečné API v tom podstatném: smazané položky zůstávají
 * v seznamu se stavem „cancelled“ / deleted, každá změna posune `updated`,
 * '@default' je první seznam úkolů. Stav lze uložit a obnovit (localStorage).
 */
import type { GoogleAccount } from '../../types';
import {
  GoogleApiError,
  type DriveFileRef,
  type EventBody,
  type GoogleBackend,
  type RemoteCalendar,
  type RemoteEvent,
  type RemoteTask,
  type RemoteTaskList,
  type TaskBody,
  type UploadParams,
} from '../../lib/sync/remote';

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parentId?: string;
  appData: boolean;
  content: string;
  modifiedTime: string;
}

export interface FakeGoogleSnapshot {
  seq: number;
  lastTime: number;
  calendars: RemoteCalendar[];
  events: Record<string, RemoteEvent[]>;
  lists: RemoteTaskList[];
  tasks: Record<string, RemoteTask[]>;
  files: FakeFile[];
}

export class FakeGoogleBackend implements GoogleBackend {
  readonly kind = 'fake' as const;
  private seq = 1;
  private lastTime = 0;
  private calendars: RemoteCalendar[] = [];
  private events = new Map<string, Map<string, RemoteEvent>>();
  private lists: RemoteTaskList[] = [];
  private tasks = new Map<string, Map<string, RemoteTask>>();
  private files = new Map<string, FakeFile>();
  /** Počet volání API (pro testy a ukazatel v UI). */
  calls = 0;

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly account: GoogleAccount = { email: 'student@gmail.com', name: 'Student UK' },
  ) {
    this.calendars.push({ id: 'primary', summary: account.email ?? 'Hlavní kalendář', primary: true, accessRole: 'owner', backgroundColor: '#4d7f5e' });
    this.events.set('primary', new Map());
    this.lists.push({ id: 'list_default', title: 'Moje úkoly' });
    this.tasks.set('list_default', new Map());
  }

  /* ----------------------------- pomocné ---------------------------- */

  private tick(): string {
    this.calls++;
    const t = Math.max(this.clock().getTime(), this.lastTime + 1000);
    this.lastTime = t;
    return new Date(t).toISOString();
  }

  private nextId(prefix: string): string {
    return `${prefix}${(this.seq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  private calendarMap(calendarId: string): Map<string, RemoteEvent> {
    const id = calendarId === 'primary' ? 'primary' : calendarId;
    const map = this.events.get(id);
    if (!map) throw new GoogleApiError(404, `Kalendář ${calendarId} neexistuje.`);
    return map;
  }

  private listMap(listId: string): Map<string, RemoteTask> {
    const id = listId === '@default' ? this.lists[0]?.id : listId;
    const map = id ? this.tasks.get(id) : undefined;
    if (!map) throw new GoogleApiError(404, `Seznam úkolů ${listId} neexistuje.`);
    return map;
  }

  /* ----------------------------- profil ----------------------------- */

  async profile(): Promise<GoogleAccount> {
    this.calls++;
    return { ...this.account };
  }

  /* ---------------------------- kalendář ---------------------------- */

  async listCalendars(): Promise<RemoteCalendar[]> {
    this.calls++;
    return this.calendars.map((c) => ({ ...c }));
  }

  async createCalendar(summary: string, description?: string): Promise<RemoteCalendar> {
    this.tick();
    const cal: RemoteCalendar = { id: `${this.nextId('cal_')}@group.calendar.google.com`, summary, description, accessRole: 'owner', backgroundColor: '#2b5a40' };
    this.calendars.push(cal);
    this.events.set(cal.id, new Map());
    return { ...cal };
  }

  addCalendar(cal: RemoteCalendar): void {
    this.calendars.push(cal);
    this.events.set(cal.id, new Map());
  }

  async listEvents(calendarId: string, range: { timeMin: string; timeMax: string }): Promise<RemoteEvent[]> {
    this.calls++;
    const min = Date.parse(range.timeMin);
    const max = Date.parse(range.timeMax);
    const out: RemoteEvent[] = [];
    for (const ev of this.calendarMap(calendarId).values()) {
      const start = Date.parse(ev.start.dateTime ?? `${ev.start.date}T00:00:00`);
      const end = Date.parse(ev.end.dateTime ?? `${ev.end.date}T00:00:00`);
      if (end > min && start < max) out.push(structuredClone(ev));
    }
    return out.sort((a, b) => (a.start.dateTime ?? a.start.date ?? '').localeCompare(b.start.dateTime ?? b.start.date ?? ''));
  }

  async getEvent(calendarId: string, eventId: string): Promise<RemoteEvent | null> {
    this.calls++;
    const ev = this.calendarMap(calendarId).get(eventId);
    return ev ? structuredClone(ev) : null;
  }

  async insertEvent(calendarId: string, body: EventBody): Promise<RemoteEvent> {
    const updated = this.tick();
    const map = this.calendarMap(calendarId);
    const id = this.nextId('ev');
    const ev: RemoteEvent = {
      id,
      status: 'confirmed',
      summary: body.summary,
      description: body.description || undefined,
      location: body.location || undefined,
      start: { ...body.start },
      end: { ...body.end },
      colorId: body.colorId,
      transparency: body.transparency,
      reminders: body.reminders,
      extendedProperties: body.extendedProperties,
      updated,
      htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`,
    };
    map.set(id, ev);
    return structuredClone(ev);
  }

  async patchEvent(calendarId: string, eventId: string, body: EventBody): Promise<RemoteEvent> {
    const map = this.calendarMap(calendarId);
    const ev = map.get(eventId);
    if (!ev || ev.status === 'cancelled') throw new GoogleApiError(404, 'Událost neexistuje.');
    const updated = this.tick();
    const next: RemoteEvent = {
      ...ev,
      summary: body.summary,
      description: body.description || undefined,
      location: body.location || undefined,
      start: { ...body.start },
      end: { ...body.end },
      colorId: body.colorId ?? ev.colorId,
      transparency: body.transparency ?? ev.transparency,
      reminders: body.reminders ?? ev.reminders,
      extendedProperties: body.extendedProperties ?? ev.extendedProperties,
      updated,
    };
    map.set(eventId, next);
    return structuredClone(next);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const map = this.calendarMap(calendarId);
    const ev = map.get(eventId);
    if (!ev || ev.status === 'cancelled') throw new GoogleApiError(410, 'Událost už byla smazána.');
    map.set(eventId, { ...ev, status: 'cancelled', updated: this.tick() });
  }

  /** Úprava „uživatelem v Googlu“ (simulace změny na druhé straně). */
  editEvent(calendarId: string, eventId: string, patch: Partial<RemoteEvent>): RemoteEvent {
    const map = this.calendarMap(calendarId);
    const ev = map.get(eventId);
    if (!ev) throw new Error('Událost neexistuje');
    const next = { ...ev, ...patch, updated: this.tick() };
    map.set(eventId, next);
    return next;
  }

  /* ----------------------------- úkoly ------------------------------ */

  async listTaskLists(): Promise<RemoteTaskList[]> {
    this.calls++;
    return this.lists.map((l) => ({ ...l }));
  }

  async createTaskList(title: string): Promise<RemoteTaskList> {
    const updated = this.tick();
    const list: RemoteTaskList = { id: this.nextId('list_'), title, updated };
    this.lists.push(list);
    this.tasks.set(list.id, new Map());
    return { ...list };
  }

  async listTasks(listId: string): Promise<RemoteTask[]> {
    this.calls++;
    return [...this.listMap(listId).values()].map((t) => structuredClone(t));
  }

  async insertTask(listId: string, body: TaskBody, parent?: string): Promise<RemoteTask> {
    const updated = this.tick();
    const map = this.listMap(listId);
    if (parent && !map.has(parent)) throw new GoogleApiError(400, 'Nadřazený úkol neexistuje.');
    const id = this.nextId('t');
    const task: RemoteTask = {
      id,
      title: body.title,
      notes: body.notes,
      status: body.status,
      due: body.due ?? undefined,
      completed: body.status === 'completed' ? updated : undefined,
      parent,
      updated,
      webViewLink: `https://tasks.google.com/task/${id}`,
    };
    map.set(id, task);
    return structuredClone(task);
  }

  async patchTask(listId: string, taskId: string, body: TaskBody): Promise<RemoteTask> {
    const map = this.listMap(listId);
    const task = map.get(taskId);
    if (!task || task.deleted) throw new GoogleApiError(404, 'Úkol neexistuje.');
    const updated = this.tick();
    const next: RemoteTask = {
      ...task,
      title: body.title,
      notes: body.notes,
      status: body.status,
      due: body.due === null ? undefined : (body.due ?? task.due),
      completed: body.status === 'completed' ? (task.completed ?? updated) : undefined,
      updated,
    };
    map.set(taskId, next);
    return structuredClone(next);
  }

  async deleteTask(listId: string, taskId: string): Promise<void> {
    const map = this.listMap(listId);
    const task = map.get(taskId);
    if (!task || task.deleted) throw new GoogleApiError(404, 'Úkol neexistuje.');
    const updated = this.tick();
    map.set(taskId, { ...task, deleted: true, updated });
    // Google maže i podúkoly.
    for (const [id, child] of map) if (child.parent === taskId) map.set(id, { ...child, deleted: true, updated });
  }

  editTask(listId: string, taskId: string, patch: Partial<RemoteTask>): RemoteTask {
    const map = this.listMap(listId);
    const task = map.get(taskId);
    if (!task) throw new Error('Úkol neexistuje');
    const updated = this.tick();
    const next = { ...task, ...patch, updated };
    if (patch.status === 'completed' && !next.completed) next.completed = updated;
    if (patch.status === 'needsAction') next.completed = undefined;
    map.set(taskId, next);
    return next;
  }

  /* ------------------------------ disk ------------------------------ */

  async findAppDataFile(name: string): Promise<DriveFileRef | null> {
    this.calls++;
    for (const f of this.files.values()) if (f.appData && f.name === name) return { id: f.id, modifiedTime: f.modifiedTime };
    return null;
  }

  async downloadText(fileId: string): Promise<string> {
    this.calls++;
    const f = this.files.get(fileId);
    if (!f) throw new GoogleApiError(404, 'Soubor neexistuje.');
    return f.content;
  }

  async saveAppDataFile(name: string, content: string, existingId?: string): Promise<DriveFileRef> {
    const modifiedTime = this.tick();
    const existing = existingId ? this.files.get(existingId) : undefined;
    const id = existing?.id ?? this.nextId('file_');
    this.files.set(id, { id, name, mimeType: 'application/json', appData: true, content, modifiedTime });
    return { id, modifiedTime };
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    for (const f of this.files.values()) if (!f.appData && f.mimeType === 'application/vnd.google-apps.folder' && f.name === name && f.parentId === parentId) return f.id;
    const modifiedTime = this.tick();
    const id = this.nextId('folder_');
    this.files.set(id, { id, name, mimeType: 'application/vnd.google-apps.folder', parentId, appData: false, content: '', modifiedTime });
    return id;
  }

  async upsertFile(params: UploadParams): Promise<DriveFileRef> {
    const modifiedTime = this.tick();
    const existing = params.existingId ? this.files.get(params.existingId) : undefined;
    const id = existing?.id ?? this.nextId('file_');
    const content = typeof params.content === 'string' ? params.content : `[binární soubor ${params.content.size} B]`;
    this.files.set(id, { id, name: params.name, mimeType: params.convertTo ?? params.mimeType, parentId: params.parentId, appData: false, content, modifiedTime });
    return { id, modifiedTime, webViewLink: params.convertTo ? `https://docs.google.com/document/d/${id}/edit` : `https://drive.google.com/file/d/${id}/view` };
  }

  /* --------------------------- pro náhled UI ------------------------ */

  peek() {
    const visibleEvents = [...this.events.entries()].flatMap(([calendarId, map]) =>
      [...map.values()].filter((e) => e.status !== 'cancelled').map((e) => ({ calendarId, ...e })),
    );
    const visibleTasks = [...this.tasks.entries()].flatMap(([listId, map]) => [...map.values()].filter((t) => !t.deleted).map((t) => ({ listId, ...t })));
    const driveFiles = [...this.files.values()].map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, appData: f.appData, size: f.content.length, modifiedTime: f.modifiedTime }));
    return { calendars: this.calendars, lists: this.lists, events: visibleEvents, tasks: visibleTasks, files: driveFiles };
  }

  snapshot(): FakeGoogleSnapshot {
    return {
      seq: this.seq,
      lastTime: this.lastTime,
      calendars: this.calendars,
      events: Object.fromEntries([...this.events.entries()].map(([id, map]) => [id, [...map.values()]])),
      lists: this.lists,
      tasks: Object.fromEntries([...this.tasks.entries()].map(([id, map]) => [id, [...map.values()]])),
      files: [...this.files.values()],
    };
  }

  restore(snap: FakeGoogleSnapshot): void {
    this.seq = snap.seq;
    this.lastTime = snap.lastTime;
    this.calendars = snap.calendars;
    this.events = new Map(Object.entries(snap.events).map(([id, list]) => [id, new Map(list.map((e) => [e.id, e]))]));
    this.lists = snap.lists;
    this.tasks = new Map(Object.entries(snap.tasks).map(([id, list]) => [id, new Map(list.map((t) => [t.id, t]))]));
    this.files = new Map(snap.files.map((f) => [f.id, f]));
  }
}
