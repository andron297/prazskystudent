/**
 * Servisní vrstva aplikace – jediný vstupní bod pro data zvenčí.
 * `createApi(settings)` vrátí implementaci podle režimu:
 *  - Demo / Sandbox: simulace PID (zpoždění, klimatizace, přestupy),
 *    simulovaný Moodle a ukázkový iCal – vše funguje offline;
 *  - Live: Golemio, Google Routes, Moodle REST a iCal přes serverové proxy.
 * Komponenty volají jen tuto fasádu, nikdy přímo fetch.
 */
import type { AppMode, Building, LatLng, Settings, TransitResult } from '../types';
import type { ParseMode, ParsedItem } from '../lib/scheduleTextParser';
import { parseScheduleText } from '../lib/scheduleTextParser';
import { aiParseText } from './aiParser';
import { buildDemoIcs } from './demo/samples';
import { DemoMoodleClient } from './demo/moodleDemo';
import { demoNetworkCovers, planDemoItineraries } from './demo/transitSim';
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
}

export interface ServerCapabilities {
  reachable: boolean;
  golemio: boolean;
  google: boolean;
  anthropic: boolean;
}

export const NO_SERVER: ServerCapabilities = { reachable: false, golemio: false, google: false, anthropic: false };

export interface StudyApi {
  readonly mode: AppMode;
  planTransit(request: TransitRequest): Promise<TransitResult>;
  moodle(baseUrl: string, token: string): MoodleClient;
  fetchIcs(url: string): Promise<string>;
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
  };
}

export function createApi(settings: Settings, server: ServerCapabilities, now: () => Date): StudyApi {
  const canUseAi = Boolean(settings.anthropicApiKey.trim()) || server.anthropic;

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
        const itineraries = planDemoItineraries({
          origin: request.origin,
          originLabel: request.originLabel,
          building: request.building,
          nowMs,
          untilMs: Math.max(request.eventStart.getTime() + 30 * MIN, nowMs + 60 * MIN),
          walkSpeed: settings.walkSpeed,
        });
        if (itineraries.length > 0) {
          return { itineraries, source: 'demo', fetchedAt: request.now.toISOString(), warnings: [], originLabel: request.originLabel };
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
    const data = await requestJson<{ ok: boolean; serverKeys?: { golemio?: boolean; google?: boolean; anthropic?: boolean } }>('/api/health', {
      timeoutMs: 6000,
    });
    return {
      reachable: Boolean(data.ok),
      golemio: Boolean(data.serverKeys?.golemio),
      google: Boolean(data.serverKeys?.google),
      anthropic: Boolean(data.serverKeys?.anthropic),
    };
  } catch {
    return NO_SERVER;
  }
}
