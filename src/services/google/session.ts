/**
 * Backend Googlu podle režimu: v Sandboxu simulovaný Google (uložený v prohlížeči,
 * s pár „cizími“ událostmi a úkoly pro ukázku obousměrné synchronizace),
 * v Live režimu skutečné API se sdíleným přihlášením.
 */
import type { AppMode } from '../../types';
import { addDays, atTime, startOfDay, toDateKey } from '../../lib/dates';
import type { GoogleBackend } from '../../lib/sync/remote';
import { appNow } from '../../store/clockStore';
import { getAccessToken } from './auth';
import { GoogleRestBackend } from './client';
import { FakeGoogleBackend, type FakeGoogleSnapshot } from './fakeBackend';

const SIM_KEY = 'stihnu:google-sim';
let fake: FakeGoogleBackend | null = null;
let live: GoogleRestBackend | null = null;
let liveServerFlow = false;

function czechHolidays(year: number): [string, string][] {
  return [
    [`${year}-01-01`, 'Nový rok · Den obnovy samostatného českého státu'],
    [`${year}-05-01`, 'Svátek práce'],
    [`${year}-05-08`, 'Den vítězství'],
    [`${year}-07-05`, 'Den slovanských věrozvěstů Cyrila a Metoděje'],
    [`${year}-07-06`, 'Den upálení mistra Jana Husa'],
    [`${year}-09-28`, 'Den české státnosti'],
    [`${year}-10-28`, 'Den vzniku samostatného československého státu'],
    [`${year}-11-17`, 'Den boje za svobodu a demokracii'],
    [`${year}-12-24`, 'Štědrý den'],
    [`${year}-12-25`, '1. svátek vánoční'],
    [`${year}-12-26`, '2. svátek vánoční'],
  ];
}

async function seedFake(backend: FakeGoogleBackend, now: Date): Promise<void> {
  const today = startOfDay(now);
  backend.addCalendar({ id: 'cs.czech#holiday@group.v.calendar.google.com', summary: 'Státní svátky v ČR', accessRole: 'reader', backgroundColor: '#a36f45' });
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    for (const [date, name] of czechHolidays(year)) {
      const next = new Date(`${date}T12:00:00`);
      await backend.insertEvent('cs.czech#holiday@group.v.calendar.google.com', { summary: name, start: { date }, end: { date: toDateKey(addDays(next, 1)) } });
    }
  }
  await backend.insertEvent('primary', { summary: 'Brigáda – kavárna', location: 'Kavárna Lampárna', start: { dateTime: atTime(addDays(today, 2), 16).toISOString() }, end: { dateTime: atTime(addDays(today, 2), 20).toISOString() } });
  await backend.insertEvent('primary', { summary: 'Narozeniny mámy', start: { date: toDateKey(addDays(today, 5)) }, end: { date: toDateKey(addDays(today, 6)) } });
  await backend.insertEvent('primary', { summary: 'Zubař', location: 'Bělohorská 45', start: { dateTime: atTime(addDays(today, 8), 8, 30).toISOString() }, end: { dateTime: atTime(addDays(today, 8), 9).toISOString() } });
  await backend.insertTask('@default', { title: 'Koupit dárek pro mámu', status: 'needsAction', due: `${toDateKey(addDays(today, 4))}T00:00:00.000Z` });
  await backend.insertTask('@default', { title: 'Zavolat babičce', status: 'needsAction' });
}

/** Simulovaný Google pro Sandbox (jeden pro celou aplikaci, uložený v localStorage). */
export async function demoBackend(): Promise<FakeGoogleBackend> {
  if (fake) return fake;
  const backend = new FakeGoogleBackend(appNow, { email: 'student@gmail.com', name: 'Simulovaný účet' });
  let restored = false;
  try {
    const raw = localStorage.getItem(SIM_KEY);
    if (raw) {
      backend.restore(JSON.parse(raw) as FakeGoogleSnapshot);
      restored = true;
    }
  } catch {
    restored = false;
  }
  if (!restored) {
    await seedFake(backend, appNow());
    saveDemoBackend(backend);
  }
  fake = backend;
  return backend;
}

export function saveDemoBackend(backend: FakeGoogleBackend | null = fake): void {
  if (!backend) return;
  try {
    localStorage.setItem(SIM_KEY, JSON.stringify(backend.snapshot()));
  } catch {
    /* plné úložiště – simulace poběží jen v paměti */
  }
}

export function resetDemoBackend(): void {
  fake = null;
  try {
    localStorage.removeItem(SIM_KEY);
  } catch {
    /* nic */
  }
}

export function liveBackend(serverFlow: boolean): GoogleRestBackend {
  liveServerFlow = serverFlow;
  if (!live) live = new GoogleRestBackend(() => getAccessToken(liveServerFlow));
  return live;
}

export async function backendFor(mode: AppMode, serverFlow: boolean): Promise<GoogleBackend> {
  return mode === 'demo' ? demoBackend() : liveBackend(serverFlow);
}
