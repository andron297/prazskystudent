/**
 * Jednorázový zápis vybraných položek do Google Kalendáře (tlačítko „Do kalendáře“).
 * Používá stejné přihlášení jako synchronizace (services/google/auth).
 */
import type { CalendarItem } from './calendarExport';
import { addDays, toDateKey } from './dates';
import { GOOGLE_SCOPES, getAccessToken, hasScopes, invalidateToken, signIn } from '../services/google/auth';

function toGoogleEvent(item: CalendarItem, reminders: number[]) {
  const base = {
    summary: item.title,
    description: item.description,
    location: item.location,
    reminders: {
      useDefault: false,
      overrides: reminders.slice(0, 5).map((minutes) => ({ method: 'popup', minutes: Math.min(Math.max(0, minutes), 40_320) })),
    },
    source: { title: 'Stihnuto', url: window.location.origin },
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

async function tokenFor(clientId: string, serverFlow: boolean): Promise<string> {
  const needed = [...GOOGLE_SCOPES.calendarEvents];
  if (hasScopes(needed) || hasScopes(GOOGLE_SCOPES.calendar)) {
    try {
      return await getAccessToken(serverFlow);
    } catch {
      /* přihlásíme znovu */
    }
  }
  const info = await signIn({ clientId, scopes: needed, serverFlow: false });
  return info.token;
}

/** Vloží události do primárního kalendáře; vrací počet úspěšně vložených. */
export async function insertGoogleEvents(clientId: string, items: CalendarItem[], reminders: number[], serverFlow = false): Promise<number> {
  const token = await tokenFor(clientId, serverFlow);
  let inserted = 0;
  for (const item of items) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(toGoogleEvent(item, reminders)),
    });
    if (response.status === 401) {
      invalidateToken();
      throw new Error('Platnost přihlášení Google vypršela – zkuste to prosím znovu.');
    }
    if (!response.ok) throw new Error(`Google Kalendář odmítl událost „${item.title}“ (HTTP ${response.status}).`);
    inserted++;
  }
  return inserted;
}
