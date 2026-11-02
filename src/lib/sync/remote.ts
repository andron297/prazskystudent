/**
 * Tvar dat Google API (jen pole, která aplikace používá) a rozhraní backendu.
 * Stejné rozhraní implementuje skutečný REST klient i simulovaný Google pro Sandbox a testy.
 */
import type { GoogleAccount } from '../../types';

export interface RemoteDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface RemoteEvent {
  id: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start: RemoteDateTime;
  end: RemoteDateTime;
  updated: string;
  etag?: string;
  htmlLink?: string;
  colorId?: string;
  transparency?: 'opaque' | 'transparent';
  recurringEventId?: string;
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}

export interface EventBody {
  summary: string;
  description?: string;
  location?: string;
  start: RemoteDateTime;
  end: RemoteDateTime;
  colorId?: string;
  transparency?: 'opaque' | 'transparent';
  reminders?: { useDefault: boolean; overrides?: { method: string; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
  source?: { title: string; url: string };
}

export interface RemoteCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
  backgroundColor?: string;
  timeZone?: string;
}

export interface RemoteTask {
  id: string;
  title?: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  /** RFC 3339 – Google Úkoly ukládají jen datum (čas ignorují). */
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
  parent?: string;
  updated: string;
  etag?: string;
  webViewLink?: string;
}

export interface TaskBody {
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string | null;
}

export interface RemoteTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface DriveFileRef {
  id: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface UploadParams {
  name: string;
  mimeType: string;
  content: Blob | string;
  parentId?: string;
  existingId?: string;
  /** Převést na Google dokument (např. 'application/vnd.google-apps.document'). */
  convertTo?: string;
}

export interface GoogleBackend {
  readonly kind: 'live' | 'fake';
  profile(): Promise<GoogleAccount>;
  // Kalendář
  listCalendars(): Promise<RemoteCalendar[]>;
  createCalendar(summary: string, description?: string): Promise<RemoteCalendar>;
  /** Jednotlivé výskyty (singleEvents) včetně zrušených (showDeleted). */
  listEvents(calendarId: string, range: { timeMin: string; timeMax: string }): Promise<RemoteEvent[]>;
  getEvent(calendarId: string, eventId: string): Promise<RemoteEvent | null>;
  insertEvent(calendarId: string, body: EventBody): Promise<RemoteEvent>;
  patchEvent(calendarId: string, eventId: string, body: EventBody): Promise<RemoteEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  // Úkoly
  listTaskLists(): Promise<RemoteTaskList[]>;
  createTaskList(title: string): Promise<RemoteTaskList>;
  /** Všechny úkoly seznamu včetně hotových, skrytých a smazaných. */
  listTasks(listId: string): Promise<RemoteTask[]>;
  insertTask(listId: string, body: TaskBody, parent?: string): Promise<RemoteTask>;
  patchTask(listId: string, taskId: string, body: TaskBody): Promise<RemoteTask>;
  deleteTask(listId: string, taskId: string): Promise<void>;
  // Disk
  findAppDataFile(name: string): Promise<DriveFileRef | null>;
  downloadText(fileId: string): Promise<string>;
  saveAppDataFile(name: string, content: string, existingId?: string): Promise<DriveFileRef>;
  ensureFolder(name: string, parentId?: string): Promise<string>;
  upsertFile(params: UploadParams): Promise<DriveFileRef>;
}

/** Chyba přihlášení (vypršený nebo odvolaný token) – synchronizace se zastaví a požádá o nové přihlášení. */
export class GoogleAuthError extends Error {
  constructor(message = 'Přihlášení ke Googlu vypršelo.') {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/** Chyba konkrétního požadavku (např. HTTP 404 / 403). */
export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}
