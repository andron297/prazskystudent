/**
 * Plánovač nad živými daty Golemia (PID). Golemio samo trasu A → B nehledá,
 * takže ji skládáme:
 *  1) nástupiště v okolí studenta (chůze k přesnému nástupišti) → odjezdové tabule;
 *  2) u každého vzoru spoje (linka + směr + nástupiště) zastávkové časy (GTFS)
 *     a z nich NEJLEPŠÍ výstup u cíle – zastávka, ze které je student v budově
 *     nejdřív (jízda + chůze), ne první, na kterou spoj dojede;
 *  3) když přímých spojů není dost, jeden přestup: na trase spoje hledáme
 *     zastávky, kde staví linky jedoucí k cíli, a tam navazující odjezdy.
 * Zastávkové časy se cachují (vzor spoje se během dne nemění), odjezdy jsou živé.
 */
import type { Building, Itinerary, LatLng, RideLeg, TransitMode, WalkSpeed } from '../types';
import { haversineMeters, walkingMinutes } from '../lib/geo';
import {
  bestAlight,
  linesServed,
  lookupPlatform,
  nearestGroups,
  platformIndex,
  platformsNear,
  platformsOf,
  stopIndexOf,
  type Alight,
  type CandidatePlatform,
  type PlatformRef,
} from '../lib/stopIndex';
import { findStop, type StopGroup } from '../lib/stops';
import type { GolemioDeparture, TripStopTime } from './golemio';

const MIN = 60_000;

export interface PlannerSource {
  departureBoards(options: { names?: string[]; ids?: string[]; timeFrom?: Date; minutesAfter?: number; limit?: number }): Promise<GolemioDeparture[]>;
  tripStopTimes(tripId: string): Promise<TripStopTime[]>;
}

export interface GolemioPlanParams {
  origin: LatLng;
  originLabel: string;
  building: Building;
  now: Date;
  eventStart: Date;
  walkSpeed: WalkSpeed;
  originStop?: { name: string; coords: LatLng } | null;
}

/* ------------------------------------------------------------------ */
/* Pomocné                                                             */
/* ------------------------------------------------------------------ */

const patternCache = new Map<string, { times: TripStopTime[]; at: number }>();
const PATTERN_TTL = 6 * 3_600_000;
const STORAGE_KEY = 'stihnu:patterns:v1';

// Vzory spojů přežijí i nové otevření aplikace (méně dotazů na Golemio).
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw) for (const [k, v] of JSON.parse(raw) as [string, { times: TripStopTime[]; at: number }][]) if (Date.now() - v.at < PATTERN_TTL) patternCache.set(k, v);
} catch {
  /* úložiště nedostupné */
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistPatterns(): void {
  if (typeof localStorage === 'undefined' || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const entries = [...patternCache.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 120);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* plné úložiště – nevadí */
    }
  }, 1500);
}

async function stopTimes(source: PlannerSource, key: string, tripId: string): Promise<TripStopTime[] | null> {
  const cached = patternCache.get(key);
  if (cached && Date.now() - cached.at < PATTERN_TTL) return cached.times;
  try {
    const times = await source.tripStopTimes(tripId);
    patternCache.set(key, { times, at: Date.now() });
    persistPatterns();
    return times;
  } catch {
    return null;
  }
}

/** Pro testy. */
export function clearPatternCache(): void {
  patternCache.clear();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const patternKey = (d: GolemioDeparture) => `${d.line}|${d.headsign}|${d.stopId}`;
const MODE_RANK: Record<TransitMode, number> = { metro: 0, train: 1, tram: 2, trolleybus: 3, bus: 4, ferry: 5, funicular: 6 };
const iso = (ms: number) => new Date(ms).toISOString();

function rideLeg(dep: GolemioDeparture, alight: Alight, originIndex: number, from: PlatformRef | undefined): RideLeg {
  const rideMs = alight.rideSec * 1000;
  return {
    kind: 'ride',
    line: dep.line,
    mode: dep.mode,
    headsign: dep.headsign,
    fromStop: dep.stopName,
    toStop: alight.candidate.group.name,
    platform: dep.platform ?? (from?.platform.code || undefined),
    toPlatform: alight.candidate.platform.code || undefined,
    scheduledDeparture: dep.scheduled.toISOString(),
    predictedDeparture: dep.predicted.toISOString(),
    scheduledArrival: iso(dep.scheduled.getTime() + rideMs),
    predictedArrival: iso(dep.predicted.getTime() + rideMs),
    delaySeconds: dep.delaySeconds,
    isAirConditioned: dep.isAirConditioned,
    isWheelchairAccessible: dep.isWheelchairAccessible,
    tripId: dep.tripId,
    stopCount: alight.index - originIndex,
    fromCoords: from?.platform.coords,
    toCoords: alight.candidate.platform.coords,
  };
}

/* ------------------------------------------------------------------ */
/* Plánování                                                           */
/* ------------------------------------------------------------------ */

export async function planGolemioJourneys(source: PlannerSource, groups: StopGroup[], params: GolemioPlanParams): Promise<Itinerary[]> {
  const index = platformIndex(groups);
  const speed = params.walkSpeed;
  const nowMs = params.now.getTime();

  // 1) Odkud – nástupiště v okolí, nebo zvolená zastávka.
  let originCands: CandidatePlatform[] = [];
  if (params.originStop) {
    const group = findStop(groups, params.originStop.name);
    if (group) originCands = platformsOf(group, params.origin, speed);
  } else {
    originCands = platformsNear(groups, params.origin, { maxMeters: 1000, walkSpeed: speed });
  }
  const originGroups = nearestGroups(originCands, params.originStop ? 1 : 6);
  if (originGroups.length === 0) return [];
  const originByGtfs = new Map(originCands.map((c) => [c.platform.gtfsId, c]));
  const walkTo = (dep: GolemioDeparture): { minutes: number; ref?: PlatformRef } => {
    const ref = lookupPlatform(index, dep.stopId);
    const cand = ref ? originByGtfs.get(ref.platform.gtfsId) : undefined;
    if (cand) return { minutes: cand.walk, ref };
    if (ref) return { minutes: walkingMinutes(params.origin, ref.platform.coords, speed), ref };
    const group = originGroups.find((g) => g.name === dep.stopName);
    return { minutes: group ? walkingMinutes(params.origin, group.coords, speed) : 5 };
  };

  // 2) Kam – nástupiště do ~1 km od budovy (+ zastávky uvedené u budovy).
  const destCands = platformsNear(groups, params.building.coords, { maxMeters: 1100, walkSpeed: speed });
  for (const stop of params.building.arrivalStops) {
    const group = findStop(groups, stop.name);
    if (!group) continue;
    for (const c of platformsOf(group, params.building.coords, speed)) {
      if (!destCands.some((d) => d.platform.gtfsId === c.platform.gtfsId)) destCands.push({ ...c, walk: Math.max(c.walk, stop.walkMinutes) });
    }
  }
  if (destCands.length === 0) return [];
  const destByGtfs = new Map(destCands.map((c) => [c.platform.gtfsId, c]));
  const destLines = linesServed(destCands);
  const destGroupNames = new Set(destCands.map((c) => c.group.name));

  // 3) Živé odjezdy z okolních zastávek.
  const minutesAhead = Math.max(20, Math.min(240, Math.round((params.eventStart.getTime() - nowMs) / MIN) + 5));
  const departures = (await source.departureBoards({ names: originGroups.map((g) => g.name), minutesAfter: minutesAhead, limit: 400 })).filter(
    (d) => d.predicted.getTime() - walkTo(d).minutes * MIN >= nowMs - 30_000,
  );
  const patterns = groupBy(departures, patternKey);

  // 4) Přímé spoje – jen linky, které u cíle staví.
  const itineraries: Itinerary[] = [];
  const direct = [...patterns.entries()].filter(([, deps]) => destLines.has(deps[0].line));
  await mapLimit(direct, 3, async ([key, deps]) => {
    const times = await stopTimes(source, key, deps[0].tripId);
    if (!times) return;
    const oi = stopIndexOf(times, deps[0].stopId);
    if (oi < 0) return;
    const alight = bestAlight(times, oi, destByGtfs);
    if (!alight) return;
    for (const dep of deps) {
      const walk = walkTo(dep);
      const ride = rideLeg(dep, alight, oi, walk.ref);
      const leave = dep.predicted.getTime() - walk.minutes * MIN;
      itineraries.push({
        id: `golemio:${dep.stopId}:${dep.tripId}`,
        legs: [
          { kind: 'walk', minutes: walk.minutes, from: params.originLabel, to: dep.stopName },
          ride,
          { kind: 'walk', minutes: alight.candidate.walk, from: ride.toStop, to: params.building.name },
        ],
        leaveAt: iso(leave),
        departAt: dep.predicted.toISOString(),
        arriveAt: iso(new Date(ride.predictedArrival).getTime() + alight.candidate.walk * MIN),
        walkToStopMinutes: walk.minutes,
        walkFromStopMinutes: alight.candidate.walk,
        transfers: 0,
        source: 'golemio',
      });
    }
  });

  // 5) Jeden přestup – když přímých spojů je málo, nebo k nim je daleko pěšky
  //    (pak se často vyplatí blízká tramvaj s přestupem).
  const startMs = params.eventStart.getTime();
  const directInTime = itineraries.filter((it) => new Date(it.arriveAt).getTime() <= startMs);
  const nearestDirectWalk = Math.min(Number.POSITIVE_INFINITY, ...directInTime.map((it) => it.walkToStopMinutes));
  if (directInTime.length < 3 || nearestDirectWalk >= 8) {
    const withTransfer = await transferJourneys({ source, index, patterns, destByGtfs, destLines, destGroupNames, originGroups, walkTo, params });
    itineraries.push(...withTransfer);
  }
  return itineraries;
}

interface TransferContext {
  source: PlannerSource;
  index: Map<string, PlatformRef>;
  patterns: Map<string, GolemioDeparture[]>;
  destByGtfs: Map<string, CandidatePlatform>;
  destLines: Set<string>;
  destGroupNames: Set<string>;
  originGroups: StopGroup[];
  walkTo: (dep: GolemioDeparture) => { minutes: number; ref?: PlatformRef };
  params: GolemioPlanParams;
}

interface HubEntry {
  deps: GolemioDeparture[];
  originIndex: number;
  hubIndex: number;
  offsetSec: number;
  coords: LatLng;
  hubStopId: string;
}

async function transferJourneys(ctx: TransferContext): Promise<Itinerary[]> {
  const { source, index, params } = ctx;
  const startMs = params.eventStart.getTime();
  const originNames = new Set(ctx.originGroups.map((g) => g.name));

  // První úsek: rychlé linky (metro, vlak, tramvaj) s nejbližšími odjezdy.
  // Linky, které jedou k cíli přímo, řeší přímé spoje – tady jen ty ostatní.
  const firstLegs = [...ctx.patterns.entries()]
    .filter(([, deps]) => !ctx.destLines.has(deps[0].line))
    .sort((a, b) => MODE_RANK[a[1][0].mode] - MODE_RANK[b[1][0].mode] || a[1][0].predicted.getTime() - b[1][0].predicted.getTime())
    .slice(0, 6);
  const loaded = await mapLimit(firstLegs, 3, async ([key, deps]) => {
    const times = await stopTimes(source, key, deps[0].tripId);
    if (!times) return null;
    const oi = stopIndexOf(times, deps[0].stopId);
    return oi < 0 ? null : { deps, times, oi };
  });

  // Přestupní uzly: zastávky na trase, kde staví linka jedoucí k cíli.
  const hubs = new Map<string, { group: StopGroup; entries: HubEntry[]; score: number }>();
  for (const leg of loaded) {
    if (!leg) continue;
    for (let k = leg.oi + 1; k < Math.min(leg.times.length, leg.oi + 45); k++) {
      const ref = lookupPlatform(index, leg.times[k].stopId);
      if (!ref || originNames.has(ref.group.name) || ctx.destGroupNames.has(ref.group.name)) continue;
      if (!ref.group.lines.some((l) => !l.night && ctx.destLines.has(l.name))) continue;
      const offsetSec = leg.times[k].arrivalSec - leg.times[leg.oi].departureSec;
      if (!Number.isFinite(offsetSec) || offsetSec <= 0) continue;
      const firstArrival = leg.deps[0].predicted.getTime() + offsetSec * 1000;
      // Odhad zbytku cesty: vzdušnou čarou k budově rychlostí MHD (~350 m/min).
      const score = firstArrival + (haversineMeters(ref.platform.coords, params.building.coords) / 350) * MIN;
      const hub = hubs.get(ref.group.name) ?? { group: ref.group, entries: [], score };
      hub.entries.push({ deps: leg.deps, originIndex: leg.oi, hubIndex: k, offsetSec, coords: ref.platform.coords, hubStopId: leg.times[k].stopId });
      hub.score = Math.min(hub.score, score);
      hubs.set(ref.group.name, hub);
    }
  }
  const bestHubs = [...hubs.values()].sort((a, b) => a.score - b.score).slice(0, 3);

  const out: Itinerary[] = [];
  await mapLimit(bestHubs, 2, async (hub) => {
    const earliest = Math.min(...hub.entries.map((e) => e.deps[0].predicted.getTime() + e.offsetSec * 1000));
    const minutesAfter = Math.max(20, Math.round((startMs - earliest) / MIN) + 10);
    let boards: GolemioDeparture[];
    try {
      // Jen nástupiště, kde staví linky k cíli – méně odjezdů, méně stránek.
      const ids = hub.group.platforms.filter((p) => p.serves.some((x) => ctx.destLines.has(x.line))).map((p) => p.gtfsId);
      boards = await source.departureBoards(ids.length ? { ids, timeFrom: new Date(earliest), minutesAfter, limit: 200 } : { names: [hub.group.name], timeFrom: new Date(earliest), minutesAfter, limit: 200 });
    } catch {
      return;
    }
    const onward = groupBy(
      boards.filter((d) => ctx.destLines.has(d.line)),
      patternKey,
    );
    const continuations: { deps: GolemioDeparture[]; alight: Alight; oi: number; ref?: PlatformRef }[] = [];
    await mapLimit([...onward.entries()], 3, async ([key, deps]) => {
      const times = await stopTimes(source, key, deps[0].tripId);
      if (!times) return;
      const oi = stopIndexOf(times, deps[0].stopId);
      if (oi < 0) return;
      const alight = bestAlight(times, oi, ctx.destByGtfs);
      if (alight) continuations.push({ deps: deps.sort((a, b) => a.predicted.getTime() - b.predicted.getTime()), alight, oi, ref: lookupPlatform(index, deps[0].stopId) });
    });
    if (continuations.length === 0) return;

    for (const entry of hub.entries) {
      for (const d1 of entry.deps) {
        const walk = ctx.walkTo(d1);
        const arrivalAtHub = d1.predicted.getTime() + entry.offsetSec * 1000;
        let best: { d2: GolemioDeparture; c: (typeof continuations)[number]; arrive: number; transfer: number } | null = null;
        for (const c of continuations) {
          if (c.deps[0].line === d1.line) continue;
          const between = c.ref ? walkingMinutes(entry.coords, c.ref.platform.coords, params.walkSpeed) : 2;
          const transfer = Math.max(2, between + (d1.mode === 'metro' || c.deps[0].mode === 'metro' ? 2 : 1));
          const d2 = c.deps.find((d) => d.predicted.getTime() >= arrivalAtHub + transfer * MIN);
          if (!d2) continue;
          const arrive = d2.predicted.getTime() + c.alight.rideSec * 1000 + c.alight.candidate.walk * MIN;
          if (!best || arrive < best.arrive) best = { d2, c, arrive, transfer };
        }
        if (!best) continue;
        const firstAlight: Alight = {
          index: entry.hubIndex,
          rideSec: entry.offsetSec,
          candidate: { group: hub.group, platform: lookupPlatform(index, entry.hubStopId)?.platform ?? hub.group.platforms[0], meters: 0, walk: 0 },
        };
        const ride1 = rideLeg(d1, firstAlight, entry.originIndex, walk.ref);
        const ride2 = rideLeg(best.d2, best.c.alight, best.c.oi, best.c.ref);
        const leave = d1.predicted.getTime() - walk.minutes * MIN;
        out.push({
          id: `golemio:${d1.stopId}:${d1.tripId}>${best.d2.tripId}`,
          legs: [
            { kind: 'walk', minutes: walk.minutes, from: params.originLabel, to: d1.stopName },
            ride1,
            { kind: 'walk', minutes: best.transfer, from: ride1.toStop, to: `${ride2.fromStop} (přestup)` },
            ride2,
            { kind: 'walk', minutes: best.c.alight.candidate.walk, from: ride2.toStop, to: params.building.name },
          ],
          leaveAt: iso(leave),
          departAt: d1.predicted.toISOString(),
          arriveAt: iso(best.arrive),
          walkToStopMinutes: walk.minutes,
          walkFromStopMinutes: best.c.alight.candidate.walk,
          transfers: 1,
          source: 'golemio',
        });
      }
    }
  });
  return out;
}
