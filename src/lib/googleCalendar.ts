/**
 * Zápis do Google Kalendáře přes Google Calendar API (OAuth – Google Identity
 * Services, token model). Umožňuje nastavit připomínky, což přímý odkaz neumí.
 * Vyžaduje OAuth Client ID (typ „Webová aplikace“) s povoleným originem aplikace.
 */
import type { CalendarItem } from './calendarExport';
import { addDays, toDateKey } from './dates';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleIdentity {
  accounts?: {
    oauth2?: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
let scriptPromise: Promise<void> | null = null;
let cachedToken: { token: string; expiresAt: number; clientId: string } | null = null;

function loadIdentityScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Nepodařilo se načíst přihlášení Google.'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export async function getGoogleAccessToken(clientId: string): Promise<string> {
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  await loadIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services nejsou dostupné.');
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description ?? 'Přihlášení ke Google Kalendáři se nezdařilo.'));
          return;
        }
        cachedToken = { token: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000, clientId };
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error.message ?? 'Okno přihlášení Google bylo zavřeno.')),
    });
    client.requestAccessToken({ prompt: cachedToken ? '' : 'consent' });
  });
}

function toGoogleEvent(item: CalendarItem, reminders: number[]) {
  const base = {
    summary: item.title,
    description: item.description,
    location: item.location,
    reminders: {
      useDefault: false,
      overrides: reminders.slice(0, 5).map((minutes) => ({ method: 'popup', minutes: Math.min(Math.max(0, minutes), 40_320) })),
    },
    source: { title: 'Stihnu', url: window.location.origin },
  };
  if (item.allDay) {
    return { ...base, start: { date: toDateKey(item.start) }, end: { date: toDateKey(addDays(item.end ?? item.start, 1)) } };
  }
  const end = item.end ?? new Date(item.start.getTime() + 3_600_000);
  return {
    ...base,
    start: { dateTime: item.start.toISOString(), timeZone: 'Europe/Prague' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Prague' },
  };
}

/** Vloží události do primárního kalendáře; vrací počet úspěšně vložených. */
export async function insertGoogleEvents(clientId: string, items: CalendarItem[], reminders: number[]): Promise<number> {
  const token = await getGoogleAccessToken(clientId);
  let inserted = 0;
  for (const item of items) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(toGoogleEvent(item, reminders)),
    });
    if (response.status === 401) {
      cachedToken = null;
      throw new Error('Platnost přihlášení Google vypršela – zkus to prosím znovu.');
    }
    if (!response.ok) throw new Error(`Google Kalendář odmítl událost „${item.title}“ (HTTP ${response.status}).`);
    inserted++;
  }
  return inserted;
}
