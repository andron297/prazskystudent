/**
 * Zastávky a odjezdy: dataset PID (načítá se jen jednou, až je potřeba)
 * a odjezdová tabule libovolné zastávky – živě z Golemia, v Sandboxu simulovaně.
 */
import { useEffect, useState } from 'react';
import type { Settings, TransitMode } from '../types';
import { hashString, seededRandom } from '../lib/id';
import { decodeStops, type RawStopsFile, type StopGroup } from '../lib/stops';
import { demoNetworkHasStop, simulateDepartureBoard } from './demo/transitSim';
import { GolemioClient } from './golemio';
import type { ServerCapabilities } from './api';

let loading: Promise<StopGroup[]> | null = null;
let loaded: StopGroup[] | null = null;

export function loadStops(): Promise<StopGroup[]> {
  if (loaded) return Promise.resolve(loaded);
  if (!loading) {
    loading = fetch('/data/stops-praha.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Zastávky: HTTP ${r.status}`);
        return r.json() as Promise<RawStopsFile>;
      })
      .then((raw) => {
        loaded = decodeStops(raw);
        return loaded;
      })
      .catch((error) => {
        loading = null;
        throw error;
      });
  }
  return loading;
}

export function useStops(): { stops: StopGroup[] | null; error: string | null } {
  const [stops, setStops] = useState<StopGroup[] | null>(loaded);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (loaded) return;
    let alive = true;
    loadStops()
      .then((s) => alive && setStops(s))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);
  return { stops, error };
}

export interface StopDeparture {
  id: string;
  line: string;
  mode: TransitMode;
  headsign: string;
  platform?: string;
  scheduled: Date;
  predicted: Date;
  delaySeconds: number | null;
  airConditioned: boolean | null;
  accessible: boolean | null;
  night: boolean;
}

export interface DepartureBoard {
  departures: StopDeparture[];
  source: 'golemio' | 'demo';
  warning?: string;
}

const MIN = 60_000;

function headway(mode: TransitMode, hour: number, night: boolean): number | null {
  const isNight = hour < 5 && hour >= 0;
  if (night) return isNight || hour >= 24 ? 30 : null;
  if (isNight && mode !== 'train') return null;
  const peak = (hour >= 6 && hour < 9) || (hour >= 14 && hour < 18);
  const evening = hour >= 20;
  switch (mode) {
    case 'metro':
      return peak ? 3 : evening ? 7 : 5;
    case 'tram':
      return peak ? 8 : evening ? 12 : 10;
    case 'train':
      return peak ? 30 : 60;
    case 'ferry':
      return 30;
    case 'funicular':
      return 10;
    default:
      return peak ? 10 : evening ? 20 : 15;
  }
}

/** Obecná simulace odjezdů pro zastávky mimo demo síť (podle linek a směrů z datasetu). */
function simulateGeneric(stop: StopGroup, nowMs: number, limit: number, skipLines: Set<string>): StopDeparture[] {
  const out: StopDeparture[] = [];
  const until = nowMs + 70 * MIN;
  for (const platform of stop.platforms) {
    for (const service of platform.serves) {
      if (skipLines.has(service.line)) continue;
      const seed = hashString(`${stop.name}|${service.line}|${service.direction ?? ''}`);
      const rnd = seededRandom(seed);
      const phase = Math.floor(rnd() * 12);
      let t = new Date(nowMs);
      t.setMinutes(0, 0, 0);
      let ms = t.getTime() - 60 * MIN + phase * MIN;
      let guard = 0;
      while (ms < until && guard++ < 80) {
        const hw = headway(service.mode, new Date(ms).getHours(), service.night);
        if (hw === null) {
          ms += 15 * MIN;
          continue;
        }
        if (ms >= nowMs - 60_000) {
          const r = seededRandom(hashString(`${seed}|${ms}`));
          const live = service.mode !== 'train' && r() > 0.12;
          const delay = !live ? null : service.mode === 'metro' ? 0 : Math.round(Math.max(0, r() * r() * 240 - 20));
          out.push({
            id: `${service.line}-${service.direction}-${ms}`,
            line: service.line,
            mode: service.mode,
            headsign: service.direction ?? '',
            platform: platform.code || undefined,
            scheduled: new Date(ms),
            predicted: new Date(ms + (delay ?? 0) * 1000),
            delaySeconds: delay,
            airConditioned: service.mode === 'metro' ? true : r() > 0.45,
            accessible: service.mode === 'metro' ? platform.accessible : r() > 0.2,
            night: service.night,
          });
        }
        ms += hw * MIN;
        t = new Date(ms);
      }
    }
  }
  return out.sort((a, b) => a.predicted.getTime() - b.predicted.getTime()).slice(0, limit);
}

export async function departuresFor(stop: StopGroup, settings: Settings, server: ServerCapabilities, now: Date, limit = 14): Promise<DepartureBoard> {
  if (settings.mode === 'demo') {
    const nowMs = now.getTime();
    const fromNetwork: StopDeparture[] = demoNetworkHasStop(stop.name)
      ? simulateDepartureBoard(stop.name, nowMs - 30_000, nowMs + 70 * MIN, nowMs).map((d) => ({
          id: d.tripId,
          line: d.line.shortName,
          mode: d.line.mode,
          headsign: d.headsign,
          scheduled: new Date(d.scheduled),
          predicted: new Date(d.predicted),
          delaySeconds: d.delaySeconds,
          airConditioned: d.isAirConditioned,
          accessible: d.isWheelchairAccessible,
          night: false,
        }))
      : [];
    const networkLines = new Set(fromNetwork.map((d) => d.line));
    const generic = simulateGeneric(stop, nowMs, limit * 2, networkLines);
    const departures = [...fromNetwork, ...generic].sort((a, b) => a.predicted.getTime() - b.predicted.getTime()).slice(0, limit);
    return { departures, source: 'demo' };
  }
  if (!settings.golemioApiKey.trim() && !server.golemio) {
    return { departures: [], source: 'golemio', warning: 'Pro živé odjezdy zadej Golemio API klíč (zdarma) v Propojení → Doprava.' };
  }
  const client = new GolemioClient(settings.golemioApiKey);
  const list = await client.departureBoards({ names: [stop.name], minutesAfter: 90, limit: 40 });
  const night = new Set(stop.lines.filter((l) => l.night).map((l) => l.name));
  return {
    source: 'golemio',
    departures: list.slice(0, limit).map((d) => ({
      id: `${d.tripId}-${d.stopId}`,
      line: d.line,
      mode: d.mode,
      headsign: d.headsign,
      platform: d.platform,
      scheduled: d.scheduled,
      predicted: d.predicted,
      delaySeconds: d.delaySeconds,
      airConditioned: d.isAirConditioned,
      accessible: d.isWheelchairAccessible,
      night: night.has(d.line),
    })),
  };
}
