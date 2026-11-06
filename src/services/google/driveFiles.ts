/**
 * Soubory předmětu na Google Disku – jen s oprávněním drive.file (aplikace
 * vidí pouze to, co sama vytvořila nebo co student vybral; ke zbytku Disku
 * přístup nemá a Google pro to nevyžaduje bezpečnostní audit):
 *  - složka „Stihnu/<předmět>“,
 *  - nahrání souboru (i velkého – po částech),
 *  - nový Google dokument, tabulka nebo prezentace,
 *  - údaje o souboru (kdy a kdo naposledy upravil, ikona, náhled).
 */
import type { Subject } from '../../types';
import { useAppStore } from '../../store/appStore';
import { googleClientIdFor, serverFlow } from '../syncCenter';
import { getAccessToken, GOOGLE_SCOPES, hasScopes, scopesForSettings, signIn } from './auth';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,mimeType,webViewLink,iconLink,thumbnailLink,modifiedTime,size,lastModifyingUser(displayName,me)';
const FOLDER = 'application/vnd.google-apps.folder';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  size?: string;
  lastModifyingUser?: { displayName?: string; me?: boolean };
}

export type GoogleDocKind = 'document' | 'spreadsheet' | 'presentation';

/** Je Disk k dispozici (Google propojený v režimu vlastních dat)? */
export function driveFilesAvailable(): boolean {
  const app = useAppStore.getState();
  return Boolean(googleClientIdFor() && app.settings.mode === 'live' && app.googleSync.live.connectedAt);
}

async function token(): Promise<string> {
  const clientId = googleClientIdFor();
  if (!clientId) throw new Error('Google zatím není nastavený.');
  const scope = GOOGLE_SCOPES.drive[0];
  if (!hasScopes([scope])) {
    const settings = useAppStore.getState().settings.google;
    await signIn({ clientId, scopes: [...new Set([...scopesForSettings(settings), scope])], serverFlow: serverFlow(), prompt: '' });
  }
  return getAccessToken(serverFlow());
}

async function api<T>(method: string, url: string, body?: BodyInit | object, headers: Record<string, string> = {}): Promise<{ data: T; response: Response }> {
  const t = await token();
  const isJson = body !== undefined && !(body instanceof Blob) && typeof body !== 'string';
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${t}`, ...(isJson ? { 'content-type': 'application/json' } : {}), ...headers },
      body: isJson ? JSON.stringify(body) : (body as BodyInit | undefined),
    });
  } catch {
    throw new Error('Google Disk teď nejde zastihnout – jste online?');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (response.status === 404) throw Object.assign(new Error('Soubor na Disku nenalezen nebo k němu aplikace nemá přístup.'), { status: 404 });
    if (response.status === 403 && /storageQuota/i.test(detail?.error?.message ?? '')) throw new Error('Google Disk je plný.');
    throw new Error(detail?.error?.message ? `Google Disk: ${detail.error.message}` : `Google Disk odpověděl chybou ${response.status}.`);
  }
  const data = (response.status === 204 ? undefined : await response.json().catch(() => undefined)) as T;
  return { data, response };
}

const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const q = `mimeType='${FOLDER}' and name='${quote(name)}' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const { data } = await api<{ files?: { id: string }[] }>('GET', `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=5`);
  if (data.files?.[0]) return data.files[0].id;
  const created = await api<{ id: string }>('POST', `${DRIVE}/files?fields=id`, { name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) });
  return created.data.id;
}

export function subjectFolderName(subject: Subject): string {
  return `${subject.code ? `${subject.code} ` : ''}${subject.name}`.replace(/[\\/]+/g, '-').trim().slice(0, 120);
}

/** Složka předmětu (vytvoří se při prvním použití a zapamatuje se). */
export async function subjectFolder(subject: Subject): Promise<string> {
  if (subject.driveFolderId) {
    try {
      const { data } = await api<{ id: string; trashed?: boolean }>('GET', `${DRIVE}/files/${encodeURIComponent(subject.driveFolderId)}?fields=id,trashed`);
      if (!data.trashed) return data.id;
    } catch {
      /* složka smazaná nebo bez přístupu – založit znovu */
    }
  }
  const root = await ensureFolder('Stihnu');
  const id = await ensureFolder(subjectFolderName(subject), root);
  const current = useAppStore.getState().subjects.find((s) => s.id === subject.id);
  if (current) useAppStore.getState().upsertSubject({ ...current, driveFolderId: id });
  return id;
}

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

const MULTIPART_LIMIT = 5 * 1024 * 1024;

/** Nahraje soubor do složky předmětu (malé najednou, velké po částech). */
export async function uploadToSubject(subject: Subject, file: File, onProgress?: (ratio: number) => void): Promise<DriveFileInfo> {
  const parent = await subjectFolder(subject);
  const meta = { name: file.name, parents: [parent] };
  const type = file.type || 'application/octet-stream';
  if (file.size <= MULTIPART_LIMIT) {
    const boundary = `stihnu${Math.random().toString(36).slice(2)}`;
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`, file, `\r\n--${boundary}--`]);
    const { data } = await api<DriveFileInfo>('POST', `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, body, { 'content-type': `multipart/related; boundary=${boundary}` });
    onProgress?.(1);
    return data;
  }
  // Po částech (resumable upload): nejdřív relace, pak obsah.
  const { response } = await api<unknown>('POST', `${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, meta, { 'x-upload-content-type': type, 'x-upload-content-length': String(file.size) });
  const session = response.headers.get('location');
  if (!session) throw new Error('Nahrávání na Disk se nepodařilo zahájit.');
  const t = await token();
  return new Promise<DriveFileInfo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', session);
    xhr.setRequestHeader('authorization', `Bearer ${t}`);
    xhr.setRequestHeader('content-type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(JSON.parse(xhr.responseText) as DriveFileInfo) : reject(new Error(`Nahrávání na Disk selhalo (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Nahrávání na Disk přerušilo spojení.'));
    xhr.send(file);
  });
}

const DOC_LABEL: Record<GoogleDocKind, string> = { document: 'Dokument', spreadsheet: 'Tabulka', presentation: 'Prezentace' };

/** Nový Google dokument / tabulka / prezentace ve složce předmětu. */
export async function createGoogleFile(subject: Subject, kind: GoogleDocKind, name?: string): Promise<DriveFileInfo> {
  const parent = await subjectFolder(subject);
  const title = name?.trim() || `${subject.name} – ${DOC_LABEL[kind].toLowerCase()}`;
  const { data } = await api<DriveFileInfo>('POST', `${DRIVE}/files?fields=${FIELDS}`, { name: title, mimeType: `application/vnd.google-apps.${kind}`, parents: [parent] });
  return data;
}

const infoCache = new Map<string, { at: number; info: DriveFileInfo | null }>();

/** Údaje o souboru (cache 5 minut); null = aplikace k němu nemá přístup. */
export async function driveFileInfo(id: string): Promise<DriveFileInfo | null> {
  const hit = infoCache.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.info;
  try {
    const { data } = await api<DriveFileInfo>('GET', `${DRIVE}/files/${encodeURIComponent(id)}?fields=${FIELDS}&supportsAllDrives=true`);
    infoCache.set(id, { at: Date.now(), info: data });
    return data;
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      infoCache.set(id, { at: Date.now(), info: null });
      return null;
    }
    throw error;
  }
}
