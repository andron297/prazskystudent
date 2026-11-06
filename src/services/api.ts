/**
 * Servisní vrstva aplikace – jediný vstupní bod pro data zvenčí.
 * `createApi(settings)` vrátí implementaci podle režimu:
 *  - Demo / Sandbox: simulace PID (zpoždění, klimatizace, přestupy),
 *    simulovaný Moodle a ukázkový iCal – vše funguje offline;
 *  - Live: Golemio, Google Routes, Moodle REST a iCal přes serverové proxy.
 * Komponenty volají jen tuto fasádu, nikdy přímo fetch.
 */
import type { AppMode, Building, LatLng, OriginStopPref, Settings, TransitResult } from '../types';
import type { ParseMode, ParsedItem } from '../lib/scheduleTextParser';
import { parseScheduleText } from '../lib/scheduleTextParser';
import { aiParseText } from './aiParser';
import { providerForKey } from '../lib/aiProvider';
import { buildDemoIcs, buildDemoSisPage } from './demo/samples';
import { DemoMoodleClient } from './demo/moodleDemo';
import { demoNetworkCovers, demoNetworkHasStop, planDemoItineraries } from './demo/transitSim';
import { GolemioClient } from './golemio';
import { requestJson, requestText, sleep } from './http';
import { LiveMoodleClient, type MoodleClient } from './moodle';
import { estimateItinerary, planLiveTransit, type LivePlanParams } from './routing';

export interface TransitRequest {
  origin: LatLng;
  originLabel: string;
  building: Building;
  eventStart: Date;
  now: Date;
  /** Zvolená výchozí zastávka (jinak automaticky nejbližší). */
  originStop?: OriginStopPref | null;
  /** Ruční obnovení (bez cache). */
  fresh?: boolean;
}

export interface ServerCapabilities {
  reachable: boolean;
  golemio: boolean;
  google: boolean;
  anthropic: boolean;
  /** OAuth Client ID nastavený na serveru (veřejný údaj). */
  googleClientId: string | null;
  /** Server umí obnovovat přihlášení Google (refresh token v HttpOnly cookie). */
  googleServerFlow: boolean;
  /** Účty (Supabase): veřejná adresa a veřejný klíč. */
  account: { url: string; anonKey: string } | null;
  accountSchema: 'ok' | 'missing' | 'error' | 'off';
  accountDelete: boolean;
  /** Veřejný klíč pro výběr souborů z Google Disku (Google Picker). */
  googlePickerKey: string | null;
  /** AI na serveru: klíč správce, nebo bezplatná AI z OVHcloud (`ovh`, bez klíče). */
  aiProvider: 'anthropic' | 'openai' | 'gemini' | 'ovh' | null;
  /** Veřejný kontaktní e-mail správce (zásady, podmínky). */
  contactEmail: string | null;
  /** Nová hlavní adresa aplikace při stěhování (jinak null). */
  canonicalOrigin: string | null;
}

export const NO_SERVER: ServerCapabilities = {
  reachable: false,
  golemio: false,
  google: false,
  anthropic: false,
  googleClientId: null,
  googleServerFlow: false,
  account: null,
  accountSchema: 'off',
  accountDelete: false,
  googlePickerKey: null,
  aiProvider: null,
  contactEmail: null,
  canonicalOrigin: null,
};

/** Veřejná stránka předmětu ze SISu (text od „Popis předmětu“ po „Kontakty“). */
export interface SisSubjectPage {
  code: string;
  url: string;
  text: string;
  candidates: string[];
}

export interface StudyApi {
  readonly mode: AppMode;
  planTransit(request: TransitRequest): Promise<TransitResult>;
  moodle(baseUrl: string, token: string): MoodleClient;
  fetchIcs(url: string): Promise<string>;
  fetchSisSubject(query: { code?: string; name?: string }): Promise<SisSubjectPage>;
  aiParse(text: string, mode: ParseMode, academicYearStart: number, today: Date): Promise<{ items: ParsedItem[]; engine: 'ai' | 'local' }>;
  readonly canUseAi: boolean;
}

const MIN = 60_000;

function baseParams(request: TransitRequest, settings: Settings): LivePlanParams {
  return {
    origin: request.origin,
    originLabel: request.originLabel,
    building: request.building,
    now: request.now,
    eventStart: request.eventStart,
    bufferMinutes: settings.bufferMinutes,
    walkSpeed: settings.walkSpeed,
    golemio: null,
    googleKey: settings.googleMapsApiKey,
    useGoogle: false,
    originStop: request.originStop ?? null,
    accessibleOnly: settings.accessibleOnly,
    fresh: request.fresh,
  };
}

export function createApi(settings: Settings, server: ServerCapabilities, now: () => Date): StudyApi {
  const canUseAi = Boolean(providerForKey(settings.anthropicApiKey)) || server.anthropic;

  const aiParse = async (text: string, mode: ParseMode, academicYearStart: number, today: Date) => {
    if (canUseAi) {
      const items = await aiParseText(text, mode, { academicYearStart, today, anthropicKey: settings.anthropicApiKey });
      return { items, engine: 'ai' as const };
    }
    return { items: parseScheduleText(text, { mode, referenceDate: today }).items, engine: 'local' as const };
  };

  if (settings.mode === 'demo') {
    return {
      mode: 'demo',
      canUseAi,
      async planTransit(request) {
        const nowMs = request.now.getTime();
        const stopWarnings =
          request.originStop && !demoNetworkHasStop(request.originStop.name)
            ? [`Zastávka ${request.originStop.name} není v simulované síti – jedu z nejbližší. Živá data ji umí.`]
            : [];
        const itineraries = planDemoItineraries({
          origin: request.origin,
          originLabel: request.originLabel,
          building: request.building,
          nowMs,
          untilMs: Math.max(request.eventStart.getTime() + 30 * MIN, nowMs + 60 * MIN),
          walkSpeed: settings.walkSpeed,
          originStop: request.originStop ?? null,
        });
        if (itineraries.length > 0) {
          return { itineraries, source: 'demo', fetchedAt: request.now.toISOString(), warnings: stopWarnings, originLabel: request.originLabel };
        }
        const warnings = demoNetworkCovers(request.building)
          ? ['Z této polohy nevede v demo síti žádný spoj – zobrazuji odhad.']
          : [`Budova „${request.building.name}“ není v demo síti PID – zobrazuji odhad podle vzdálenosti.`];
        return {
          itineraries: [estimateItinerary(baseParams(request, settings))],
          source: 'estimate',
          fetchedAt: request.now.toISOString(),
          warnings,
          originLabel: request.originLabel,
        };
      },
      moodle(baseUrl, token) {
        return new DemoMoodleClient(baseUrl, token, now);
      },
      async fetchIcs() {
        await sleep(650);
        return buildDemoIcs(now());
      },
      async fetchSisSubject(query) {
        await sleep(450);
        return buildDemoSisPage(query, now());
      },
      aiParse,
    };
  }

  const golemio = settings.golemioApiKey.trim() || server.golemio ? new GolemioClient(settings.golemioApiKey) : null;
  const useGoogle = Boolean(settings.googleMapsApiKey.trim()) || server.google;

  return {
    mode: 'live',
    canUseAi,
    planTransit(request) {
      return planLiveTransit({ ...baseParams(request, settings), golemio, useGoogle });
    },
    moodle(baseUrl, token) {
      return new LiveMoodleClient(baseUrl, token);
    },
    fetchIcs(url) {
      return requestText(`/api/ics?url=${encodeURIComponent(url)}`, { timeoutMs: 25_000 });
    },
    fetchSisSubject(query) {
      const params = new URLSearchParams(query.code ? { kod: query.code } : { nazev: query.name ?? '' });
      return requestJson<SisSubjectPage>(`/api/sis?${params}`, { timeoutMs: 30_000 });
    },
    aiParse,
  };
}

/** Ověří Golemio klíč dotazem na odjezdy ze zastávky Národní divadlo. */
export async function testGolemioKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const client = new GolemioClient(key);
    const departures = await client.departureBoards({ names: ['Národní divadlo'], minutesAfter: 30, limit: 10 });
    const live = departures.filter((d) => d.delaySeconds !== null).length;
    return {
      ok: true,
      message: `Funguje ✓ – ${departures.length} odjezdů z Národního divadla, ${live} s online polohou.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Zjistí, zda běží serverové funkce a které klíče má server nastavené. */
export async function fetchServerCapabilities(): Promise<ServerCapabilities> {
  try {
    const data = await requestJson<{
      ok: boolean;
      serverKeys?: { golemio?: boolean; google?: boolean; anthropic?: boolean };
      google?: { clientId?: string | null; serverFlow?: boolean };
      account?: { url: string; anonKey: string } | null;
      accountSchema?: ServerCapabilities['accountSchema'];
      accountDelete?: boolean;
      googlePickerKey?: string | null;
      aiProvider?: ServerCapabilities['aiProvider'];
      contactEmail?: string | null;
      canonicalOrigin?: string | null;
    }>('/api/health', { timeoutMs: 8000 });
    return {
      reachable: Boolean(data.ok),
      golemio: Boolean(data.serverKeys?.golemio),
      google: Boolean(data.serverKeys?.google),
      anthropic: Boolean(data.serverKeys?.anthropic),
      googleClientId: data.google?.clientId ?? null,
      googleServerFlow: Boolean(data.google?.serverFlow),
      account: data.account?.url && data.account.anonKey ? data.account : null,
      accountSchema: data.accountSchema ?? 'off',
      accountDelete: Boolean(data.accountDelete),
      googlePickerKey: data.googlePickerKey ?? null,
      aiProvider: data.aiProvider ?? null,
      contactEmail: data.contactEmail ?? null,
      canonicalOrigin: typeof data.canonicalOrigin === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(data.canonicalOrigin) ? data.canonicalOrigin : null,
    };
  } catch {
    return NO_SERVER;
  }
}
