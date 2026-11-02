/**
 * Skutečný Google backend: REST volání Calendar v3, Tasks v1 a Drive v3
 * přímo z prohlížeče (CORS povoleno), s obnovou tokenu a opakováním při limitech.
 */
import type { GoogleAccount } from '../../types';
import {
  GoogleApiError,
  GoogleAuthError,
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
import { fetchProfile, invalidateToken } from './auth';

const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

export class GoogleRestBackend implements GoogleBackend {
  readonly kind = 'live' as const;

  constructor(private readonly token: () => Promise<string>) {}

  private async request<T>(method: string, url: string, body?: unknown, init: { raw?: boolean; headers?: Record<string, string>; rawBody?: BodyInit } = {}): Promise<T> {
    let authRetry = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const token = await this.token();
      const response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...init.headers,
        },
        body: init.rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
      if (response.status === 401) {
        if (authRetry) throw new GoogleAuthError();
        authRetry = true;
        invalidateToken();
        continue;
      }
      if (response.status === 429 || response.status >= 500 || (response.status === 403 && (await isRateLimit(response.clone())))) {
        await sleep(600 * 2 ** attempt + Math.random() * 300);
        continue;
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        const message = (detail as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${response.status}`;
        throw new GoogleApiError(response.status, message);
      }
      if (response.status === 204) return undefined as T;
      return (init.raw ? await response.text() : await response.json()) as T;
    }
    throw new GoogleApiError(429, 'Google API je přetížené – zkusím to později.');
  }

  async profile(): Promise<GoogleAccount> {
    return fetchProfile(await this.token());
  }

  /* ---------------------------- kalendář ---------------------------- */

  async listCalendars(): Promise<RemoteCalendar[]> {
    const out: RemoteCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const data = await this.request<{ items?: RemoteCalendar[]; nextPageToken?: string }>('GET', `${CAL}/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${enc(pageToken)}` : ''}`);
      out.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  async createCalendar(summary: string, description?: string): Promise<RemoteCalendar> {
    const cal = await this.request<{ id: string; summary: string; description?: string; timeZone?: string }>('POST', `${CAL}/calendars`, { summary, description, timeZone: 'Europe/Prague' });
    // Barva v seznamu kalendářů (lesní zelená)
    await this.request('PATCH', `${CAL}/users/me/calendarList/${enc(cal.id)}?colorRgbFormat=true`, { backgroundColor: '#2b5a40', foregroundColor: '#ffffff' }).catch(() => undefined);
    return { ...cal, accessRole: 'owner', backgroundColor: '#2b5a40' };
  }

  async listEvents(calendarId: string, range: { timeMin: string; timeMax: string }): Promise<RemoteEvent[]> {
    const out: RemoteEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '2500', timeMin: range.timeMin, timeMax: range.timeMax });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.request<{ items?: RemoteEvent[]; nextPageToken?: string }>('GET', `${CAL}/calendars/${enc(calendarId)}/events?${params.toString()}`);
      out.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  async getEvent(calendarId: string, eventId: string): Promise<RemoteEvent | null> {
    try {
      return await this.request<RemoteEvent>('GET', `${CAL}/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
    } catch (error) {
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return null;
      throw error;
    }
  }

  insertEvent(calendarId: string, body: EventBody): Promise<RemoteEvent> {
    return this.request<RemoteEvent>('POST', `${CAL}/calendars/${enc(calendarId)}/events`, body);
  }

  patchEvent(calendarId: string, eventId: string, body: EventBody): Promise<RemoteEvent> {
    return this.request<RemoteEvent>('PATCH', `${CAL}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, body);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.request('DELETE', `${CAL}/calendars/${enc(calendarId)}/events/${enc(eventId)}`);
  }

  /* ----------------------------- úkoly ------------------------------ */

  async listTaskLists(): Promise<RemoteTaskList[]> {
    const data = await this.request<{ items?: RemoteTaskList[] }>('GET', `${TASKS}/users/@me/lists?maxResults=100`);
    return data.items ?? [];
  }

  createTaskList(title: string): Promise<RemoteTaskList> {
    return this.request<RemoteTaskList>('POST', `${TASKS}/users/@me/lists`, { title });
  }

  async listTasks(listId: string): Promise<RemoteTask[]> {
    const out: RemoteTask[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', showDeleted: 'true', maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.request<{ items?: RemoteTask[]; nextPageToken?: string }>('GET', `${TASKS}/lists/${enc(listId)}/tasks?${params.toString()}`);
      out.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  insertTask(listId: string, body: TaskBody, parent?: string): Promise<RemoteTask> {
    const { due, ...rest } = body;
    return this.request<RemoteTask>('POST', `${TASKS}/lists/${enc(listId)}/tasks${parent ? `?parent=${enc(parent)}` : ''}`, due ? { ...rest, due } : rest);
  }

  patchTask(listId: string, taskId: string, body: TaskBody): Promise<RemoteTask> {
    return this.request<RemoteTask>('PATCH', `${TASKS}/lists/${enc(listId)}/tasks/${enc(taskId)}`, { ...body, completed: body.status === 'completed' ? undefined : null });
  }

  async deleteTask(listId: string, taskId: string): Promise<void> {
    await this.request('DELETE', `${TASKS}/lists/${enc(listId)}/tasks/${enc(taskId)}`);
  }

  /* ------------------------------ disk ------------------------------ */

  async findAppDataFile(name: string): Promise<DriveFileRef | null> {
    const q = `name='${name.replace(/'/g, "\\'")}' and trashed=false`;
    const data = await this.request<{ files?: DriveFileRef[] }>('GET', `${DRIVE}/files?spaces=appDataFolder&q=${enc(q)}&fields=${enc('files(id,modifiedTime)')}&pageSize=10`);
    return data.files?.[0] ?? null;
  }

  downloadText(fileId: string): Promise<string> {
    return this.request<string>('GET', `${DRIVE}/files/${enc(fileId)}?alt=media`, undefined, { raw: true });
  }

  async saveAppDataFile(name: string, content: string, existingId?: string): Promise<DriveFileRef> {
    if (existingId) {
      try {
        return await this.request<DriveFileRef>('PATCH', `${UPLOAD}/files/${enc(existingId)}?uploadType=media&fields=id,modifiedTime`, undefined, {
          rawBody: content,
          headers: { 'content-type': 'application/json' },
        });
      } catch (error) {
        if (!(error instanceof GoogleApiError && error.status === 404)) throw error;
      }
    }
    return this.multipart('POST', `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, { name, parents: ['appDataFolder'], mimeType: 'application/json' }, content, 'application/json');
  }

  async ensureFolder(name: string, parentId?: string): Promise<string> {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const found = await this.request<{ files?: { id: string }[] }>('GET', `${DRIVE}/files?q=${enc(q)}&fields=${enc('files(id)')}&pageSize=5`);
    if (found.files?.[0]) return found.files[0].id;
    const created = await this.request<{ id: string }>('POST', `${DRIVE}/files?fields=id`, { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined });
    return created.id;
  }

  async upsertFile(params: UploadParams): Promise<DriveFileRef> {
    const meta: Record<string, unknown> = { name: params.name };
    if (params.convertTo) meta.mimeType = params.convertTo;
    const fields = 'id,modifiedTime,webViewLink';
    if (params.existingId) {
      try {
        return await this.multipart('PATCH', `${UPLOAD}/files/${enc(params.existingId)}?uploadType=multipart&fields=${fields}`, meta, params.content, params.mimeType);
      } catch (error) {
        if (!(error instanceof GoogleApiError && error.status === 404)) throw error;
      }
    }
    return this.multipart('POST', `${UPLOAD}/files?uploadType=multipart&fields=${fields}`, { ...meta, parents: params.parentId ? [params.parentId] : undefined }, params.content, params.mimeType);
  }

  private multipart(method: string, url: string, meta: Record<string, unknown>, content: Blob | string, mimeType: string): Promise<DriveFileRef> {
    const boundary = `stihnu${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    return this.request<DriveFileRef>(method, url, undefined, { rawBody: body, headers: { 'content-type': `multipart/related; boundary=${boundary}` } });
  }
}

async function isRateLimit(response: Response): Promise<boolean> {
  try {
    const data = (await response.json()) as { error?: { errors?: { reason?: string }[] } };
    return Boolean(data.error?.errors?.some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded'));
  } catch {
    return false;
  }
}
