/**
 * Klient Moodle Web Services (REST, JSON). Volání jde přes `/api/moodle`
 * (Moodle neposílá CORS hlavičky). Typy odpovídají odpovědím Moodle 4.x.
 */
import { requestJson } from './http';

export interface MoodleSiteInfo {
  sitename: string;
  username: string;
  firstname?: string;
  lastname?: string;
  fullname: string;
  userid: number;
  siteurl: string;
  release?: string;
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname?: string;
  idnumber?: string;
  summary?: string;
  startdate?: number;
  enddate?: number;
  visible?: number;
}

export interface MoodleFile {
  filename: string;
  filepath?: string;
  filesize: number;
  fileurl: string;
  timemodified?: number;
  mimetype?: string;
  type?: string;
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  duedate: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  intro?: string;
  introattachments?: MoodleFile[];
}

export interface MoodleAssignmentsResponse {
  courses: { id: number; fullname?: string; shortname?: string; assignments: MoodleAssignment[] }[];
  warnings?: unknown[];
}

export interface MoodleActionEvent {
  id: number;
  name: string;
  description?: string;
  eventtype?: string;
  modulename?: string;
  instance?: number;
  timestart: number;
  timesort?: number;
  timeduration?: number;
  url?: string;
  course?: { id: number; fullname?: string; shortname?: string };
  action?: { name?: string; url?: string; actionable?: boolean };
}

export interface MoodleActionEventsResponse {
  events: MoodleActionEvent[];
  firstid?: number;
  lastid?: number;
}

export interface MoodleContent {
  type: 'file' | 'url' | 'content' | string;
  filename: string;
  filepath?: string;
  filesize?: number;
  fileurl: string;
  timemodified?: number;
  mimetype?: string;
}

export interface MoodleModule {
  id: number;
  name: string;
  modname: string;
  instance?: number;
  url?: string;
  visible?: number;
  contents?: MoodleContent[];
}

export interface MoodleSection {
  id: number;
  name: string;
  section?: number;
  visible?: number;
  modules: MoodleModule[];
}

export interface MoodleClient {
  readonly baseUrl: string;
  readonly isDemo: boolean;
  call<T>(wsfunction: string, params?: Record<string, unknown>): Promise<T>;
}

export function normalizeMoodleUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '').replace(/\/(login|my|user|course)(\/.*)?$/, '');
    return `${parsed.origin}${path}`;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

export class LiveMoodleClient implements MoodleClient {
  readonly isDemo = false;
  readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = normalizeMoodleUrl(baseUrl);
    this.token = token.trim();
  }

  call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    return requestJson<T>('/api/moodle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl: this.baseUrl, token: this.token, wsfunction, params }),
      timeoutMs: 25_000,
    });
  }
}

/** Odkaz na stažení souboru z Moodlu – webové služby vyžadují `token` v URL. */
export function moodleFileUrlWithToken(fileurl: string, token: string): string {
  if (!token) return fileurl;
  const separator = fileurl.includes('?') ? '&' : '?';
  return `${fileurl}${separator}token=${encodeURIComponent(token)}`;
}
