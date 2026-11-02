/**
 * Živý dopravní engine. Golemio nevyhledává trasu A → B, proto kombinujeme:
 *  1) Google Routes API (TRANSIT) – trasa včetně přestupů (pokud je klíč),
 *     obohacená o živé zpoždění/klimatizaci z Golemio odjezdových tabulí;
 *  2) Golemio „přímé spoje“ – zastávky v okolí GPS → odjezdové tabule →
 *     zastávkové časy spoje (GTFS) → spoje, které jedou až k cílové zastávce;
 *  3) odhad z vzdálenosti, když nejsou dostupné klíče ani data.
 */
import type { Building, Itinerary, JourneyLeg, LatLng, RideLeg, TransitMode, TransitResult, WalkSpeed } from '../types';
import { haversineMeters, walkingMinutes } from '../lib/geo';
import { errorMessage, requestJson } from './http';
import type { GolemioClient, GolemioDeparture, TripStopTime } from './golemio';

const MIN = 60_000;

export interface LivePlanParams {
  origin: LatLng;
  originLabel: string;
  building: Building;
  now: Date;
  eventStart: Date;
  bufferMinutes: number;
  walkSpeed: WalkSpeed;
  golemio: GolemioClient | null;
  googleKey: string;
  useGoogle: boolean;
  /** Zastávka zvolená studentem – jede se jen z ní. */
  originStop?: { name: string; coords: LatLng } | null;
}

/* ------------------------------------------------------------------ */
/* Golemio – přímé spoje                                               */
/* ------------------------------------------------------------------ */

const patternCache = new Map<string, { stopTimes: TripStopTime[]; at: number }>();
const destinationCache = new Map<string, Map<string, number>>();

async function destinationStopIds(golemio: GolemioClient, building: Building): Promise<Map<string, number>> {
  const key = `${building.id}|${building.arrivalStops.map((s) => `${s.name}:${s.walkMinutes}`).join(',')}`;
  const cached = destinationCache.get(key);
  if (cached) return cached;
  const stops = await golemio.stopsByNames(building.arrivalStops.map((s) => s.name));
  const walkByName = new Map(building.arrivalStops.map((s) => [s.name, s.walkMinutes]));
  const map = new Map<string, number>();
  for (const stop of stops) map.set(stop.id, walkByName.get(stop.name) ?? 5);
  destinationCache.set(key, map);
  return map;
}

export async function planWithGolemio(params: LivePlanParams): Promise<Itinerary[]> {
  const golemio = params.golemio;
  if (!golemio) return [];
  const groups = new Map<string, { name: string; walk: number }>();
  if (params.originStop) {
    groups.set(params.originStop.name, { name: params.originStop.name, walk: walkingMinutes(params.origin, params.originStop.coords, params.walkSpeed) });
  } else {
    const nearby = await golemio.nearbyStops(params.origin, 900);
    for (const stop of nearby) {
      const walk = walkingMinutes(params.origin, stop.coords, params.walkSpeed);
      const prev = groups.get(stop.name);
      if (!prev || walk < prev.walk) groups.set(stop.name, { name: stop.name, walk });
    }
  }
  const origins = [...groups.values()].sort((a, b) => a.walk - b.walk).slice(0, 4);
  if (origins.length === 0) return [];
  const walkByOrigin = new Map(origins.map((o) => [o.name, o.walk]));

  const destinations = await destinationStopIds(golemio, params.building);
  if (destinations.size === 0) return [];

  const minutesAhead = Math.max(20, Math.min(240, Math.round((params.eventStart.getTime() - params.now.getTime()) / MIN)));
  const departures = await golemio.departureBoards({ names: origins.map((o) => o.name), minutesAfter: minutesAhead, limit: 300 });

  const byPattern = new Map<string, GolemioDeparture[]>();
  for (const dep of departures) {
    const key = `${dep.line}|${dep.headsign}|${dep.stopId}`;
    const list = byPattern.get(key) ?? [];
    list.push(dep);
    byPattern.set(key, list);
  }

  const itineraries: Itinerary[] = [];
  const patterns = [...byPattern.entries()].slice(0, 16);
  for (const [key, deps] of patterns) {
    let cached = patternCache.get(key);
    if (!cached || Date.now() - cached.at > 6 * 3_600_000) {
      try {
        cached = { stopTimes: await golemio.tripStopTimes(deps[0].tripId), at: Date.now() };
        patternCache.set(key, cached);
      } catch {
        continue;
      }
    }
    const times = cached.stopTimes;
    const originIndex = times.findIndex((t) => t.stopId === deps[0].stopId);
    if (originIndex < 0) continue;
    let destIndex = -1;
    for (let k = originIndex + 1; k < times.length; k++) {
      if (destinations.has(times[k].stopId)) {
        destIndex = k;
        break;
      }
    }
    if (destIndex < 0) continue;
    const rideSec = times[destIndex].arrivalSec - times[originIndex].departureSec;
    if (!Number.isFinite(rideSec) || rideSec <= 0) continue;
    const walkFrom = destinations.get(times[destIndex].stopId) ?? 5;
    const destName = times[destIndex].stopName ?? params.building.arrivalStops.find((s) => s.walkMinutes === walkFrom)?.name ?? 'cílová zastávka';
    for (const dep of deps) {
      const walkTo = walkByOrigin.get(dep.stopName) ?? origins[0].walk;
      const leaveAt = dep.predicted.getTime() - walkTo * MIN;
      if (leaveAt < params.now.getTime() - 30_000) continue;
      const scheduledArrival = dep.scheduled.getTime() + rideSec * 1000;
      const predictedArrival = dep.predicted.getTime() + rideSec * 1000;
      const ride: RideLeg = {
        kind: 'ride',
        line: dep.line,
        mode: dep.mode,
        headsign: dep.headsign,
        fromStop: dep.stopName,
        toStop: destName,
        platform: dep.platform,
        scheduledDeparture: dep.scheduled.toISOString(),
        predictedDeparture: dep.predicted.toISOString(),
        scheduledArrival: new Date(scheduledArrival).toISOString(),
        predictedArrival: new Date(predictedArrival).toISOString(),
        delaySeconds: dep.delaySeconds,
        isAirConditioned: dep.isAirConditioned,
        isWheelchairAccessible: dep.isWheelchairAccessible,
        tripId: dep.tripId,
        stopCount: destIndex - originIndex,
      };
      itineraries.push({
        id: `golemio:${dep.tripId}`,
        legs: [
          { kind: 'walk', minutes: walkTo, from: params.originLabel, to: dep.stopName },
          ride,
          { kind: 'walk', minutes: walkFrom, from: destName, to: params.building.name },
        ],
        leaveAt: new Date(leaveAt).toISOString(),
        departAt: dep.predicted.toISOString(),
        arriveAt: new Date(predictedArrival + walkFrom * MIN).toISOString(),
        walkToStopMinutes: walkTo,
        walkFromStopMinutes: walkFrom,
        transfers: 0,
        source: 'golemio',
      });
    }
  }
  return itineraries;
}

/* ------------------------------------------------------------------ */
/* Google Routes API (TRANSIT)                                         */
/* ------------------------------------------------------------------ */

interface RoutesStep {
  travelMode?: 'WALK' | 'TRANSIT' | string;
  staticDuration?: string;
  distanceMeters?: number;
  transitDetails?: {
    stopDetails?: {
      departureStop?: { name?: string };
      arrivalStop?: { name?: string };
      departureTime?: string;
      arrivalTime?: string;
    };
    headsign?: string;
    stopCount?: number;
    transitLine?: { name?: string; nameShort?: string; color?: string; vehicle?: { type?: string } };
  };
}

interface RoutesResponse {
  routes?: { legs?: { steps?: RoutesStep[] }[] }[];
}

function googleMode(type: string | undefined): TransitMode {
  switch (type) {
    case 'TRAM':
    case 'LIGHT_RAIL':
      return 'tram';
    case 'SUBWAY':
    case 'METRO_RAIL':
      return 'metro';
    case 'TROLLEYBUS':
      return 'trolleybus';
    case 'HEAVY_RAIL':
    case 'COMMUTER_TRAIN':
    case 'RAIL':
    case 'HIGH_SPEED_TRAIN':
    case 'LONG_DISTANCE_TRAIN':
      return 'train';
    case 'FERRY':
      return 'ferry';
    case 'FUNICULAR':
    case 'CABLE_CAR':
    case 'GONDOLA_LIFT':
      return 'funicular';
    default:
      return 'bus';
  }
}

const seconds = (duration: string | undefined) => Number(/^(\d+)s$/.exec(duration ?? '')?.[1] ?? '0');

function parseGoogleRoute(route: NonNullable<RoutesResponse['routes']>[number], params: LivePlanParams): Itinerary | null {
  const steps = route.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
  const legs: JourneyLeg[] = [];
  let pendingWalk = 0;
  let lastPlace = params.originLabel;
  for (const step of steps) {
    if (step.travelMode === 'TRANSIT' && step.transitDetails?.stopDetails?.departureTime) {
      const td = step.transitDetails;
      const from = td.stopDetails?.departureStop?.name ?? 'zastávka';
      const to = td.stopDetails?.arrivalStop?.name ?? 'zastávka';
      if (pendingWalk > 0 || legs.length === 0) {
        legs.push({ kind: 'walk', minutes: Math.max(legs.length === 0 ? 1 : 0, Math.round(pendingWalk / 60)), from: lastPlace, to: from });
      }
      pendingWalk = 0;
      const dep = td.stopDetails!.departureTime!;
      const arr = td.stopDetails?.arrivalTime ?? dep;
      legs.push({
        kind: 'ride',
        line: td.transitLine?.nameShort ?? td.transitLine?.name ?? '?',
        mode: googleMode(td.transitLine?.vehicle?.type),
        headsign: td.headsign ?? '',
        fromStop: from,
        toStop: to,
        scheduledDeparture: new Date(dep).toISOString(),
        predictedDeparture: new Date(dep).toISOString(),
        scheduledArrival: new Date(arr).toISOString(),
        predictedArrival: new Date(arr).toISOString(),
        delaySeconds: null,
        isAirConditioned: null,
        isWheelchairAccessible: null,
        stopCount: td.stopCount,
        color: td.transitLine?.color,
      });
      lastPlace = to;
    } else {
      pendingWalk += seconds(step.staticDuration);
    }
  }
  const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
  if (rides.length === 0) return null;
  const walkFrom = Math.max(1, Math.round(pendingWalk / 60));
  legs.push({ kind: 'walk', minutes: walkFrom, from: lastPlace, to: params.building.name });
  const firstWalk = legs[0].kind === 'walk' ? legs[0].minutes : 0;
  const first = rides[0];
  const last = rides[rides.length - 1];
  return {
    id: `google:${rides.map((r) => `${r.line}@${r.scheduledDeparture}`).join('>')}`,
    legs,
    leaveAt: new Date(new Date(first.predictedDeparture).getTime() - firstWalk * MIN).toISOString(),
    departAt: first.predictedDeparture,
    arriveAt: new Date(new Date(last.predictedArrival).getTime() + walkFrom * MIN).toISOString(),
    walkToStopMinutes: firstWalk,
    walkFromStopMinutes: walkFrom,
    transfers: rides.length - 1,
    source: 'google',
  };
}

/** Doplní k itineráři živá data z Golemia: zpoždění, klimatizaci, bezbariérovost. */
async function enrichWithGolemio(itineraries: Itinerary[], golemio: GolemioClient): Promise<Itinerary[]> {
  const stops = [...new Set(itineraries.map((it) => it.legs.find((l): l is RideLeg => l.kind === 'ride')?.fromStop).filter(Boolean))] as string[];
  if (stops.length === 0) return itineraries;
  const earliest = Math.min(...itineraries.map((it) => new Date(it.departAt).getTime()));
  const latest = Math.max(...itineraries.map((it) => new Date(it.departAt).getTime()));
  const deps = await golemio.departureBoards({
    names: stops,
    timeFrom: new Date(earliest - 10 * MIN),
    minutesAfter: Math.round((latest - earliest) / MIN) + 20,
    limit: 300,
  });
  return itineraries.map((it) => {
    const firstIndex = it.legs.findIndex((l) => l.kind === 'ride');
    const first = it.legs[firstIndex] as RideLeg | undefined;
    if (!first) return it;
    const scheduled = new Date(first.scheduledDeparture).getTime();
    const match = deps.find(
      (d) => d.line === first.line && d.stopName === first.fromStop && Math.abs(d.scheduled.getTime() - scheduled) <= 2 * MIN,
    );
    if (!match) return it;
    const shift = (match.delaySeconds ?? 0) * 1000;
    const legs = it.legs.map((leg, index) => {
      if (leg.kind !== 'ride') return leg;
      const moved: RideLeg = {
        ...leg,
        predictedDeparture: new Date(new Date(leg.scheduledDeparture).getTime() + (index === firstIndex ? shift : 0)).toISOString(),
        predictedArrival: new Date(new Date(leg.scheduledArrival).getTime() + (index === firstIndex ? shift : 0)).toISOString(),
      };
      if (index === firstIndex) {
        moved.delaySeconds = match.delaySeconds;
        moved.isAirConditioned = match.isAirConditioned;
        moved.isWheelchairAccessible = match.isWheelchairAccessible;
        moved.tripId = match.tripId;
        moved.platform = match.platform;
      }
      return moved;
    });
    const rides = legs.filter((l): l is RideLeg => l.kind === 'ride');
    const firstRide = rides[0];
    const lastRide = rides[rides.length - 1];
    // Při přestupu necháváme druhou jízdu podle JŘ; pokud zpoždění „sežere“ přestup, planner spoj vyřadí.
    const transferBroken = rides.length > 1 && new Date(firstRide.predictedArrival).getTime() > new Date(rides[1].predictedDeparture).getTime() - MIN;
    return {
      ...it,
      legs,
      departAt: firstRide.predictedDeparture,
      leaveAt: new Date(new Date(firstRide.predictedDeparture).getTime() - it.walkToStopMinutes * MIN).toISOString(),
      arriveAt: transferBroken
        ? new Date(new Date(lastRide.predictedArrival).getTime() + it.walkFromStopMinutes * MIN + 15 * MIN).toISOString()
        : new Date(new Date(lastRide.predictedArrival).getTime() + it.walkFromStopMinutes * MIN).toISOString(),
    };
  });
}

export async function planWithGoogle(input: LivePlanParams): Promise<Itinerary[]> {
  // Se zvolenou zastávkou plánujeme od ní a pěší přesun k ní přidáme na začátek.
  const stop = input.originStop;
  const preWalk = stop ? walkingMinutes(input.origin, stop.coords, input.walkSpeed) : 0;
  const params: LivePlanParams = stop ? { ...input, origin: stop.coords, originLabel: stop.name } : input;
  const deadline = params.eventStart.getTime() - params.bufferMinutes * MIN;
  const arrivalTimes = [deadline, deadline - 12 * MIN, deadline - 24 * MIN];
  const results = await Promise.all(
    arrivalTimes.map((t) =>
      requestJson<RoutesResponse>('/api/routes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(params.googleKey ? { 'x-google-key': params.googleKey } : {}) },
        body: JSON.stringify({ origin: params.origin, destination: params.building.coords, arrivalTime: new Date(t).toISOString() }),
        timeoutMs: 15_000,
      }).catch(() => ({ routes: [] }) as RoutesResponse),
    ),
  );
  const unique = new Map<string, Itinerary>();
  for (const result of results) {
    for (const route of result.routes ?? []) {
      const it = parseGoogleRoute(route, params);
      if (it && !unique.has(it.id)) unique.set(it.id, it);
    }
  }
  let itineraries = [...unique.values()];
  if (params.golemio && itineraries.length > 0) {
    try {
      itineraries = await enrichWithGolemio(itineraries, params.golemio);
    } catch {
      // Bez živých dat zůstává jízdní řád z Google.
    }
  }
  if (stop && preWalk > 0) {
    itineraries = itineraries.map((it) => ({
      ...it,
      legs: [{ kind: 'walk' as const, minutes: preWalk, from: input.originLabel, to: stop.name }, ...it.legs],
      leaveAt: new Date(new Date(it.leaveAt).getTime() - preWalk * MIN).toISOString(),
      walkToStopMinutes: it.walkToStopMinutes + preWalk,
    }));
  }
  return itineraries;
}

/* ------------------------------------------------------------------ */
/* Odhad bez dat                                                       */
/* ------------------------------------------------------------------ */

export function estimateItinerary(params: LivePlanParams): Itinerary {
  const deadline = params.eventStart.getTime() - params.bufferMinutes * MIN;
  const meters = haversineMeters(params.origin, params.building.coords);
  if (meters < 1500) {
    const minutes = walkingMinutes(params.origin, params.building.coords, params.walkSpeed);
    const leaveAt = deadline - minutes * MIN;
    return {
      id: 'estimate:walk',
      legs: [{ kind: 'walk', minutes, from: params.originLabel, to: params.building.name, distanceMeters: Math.round(meters) }],
      leaveAt: new Date(leaveAt).toISOString(),
      departAt: new Date(leaveAt).toISOString(),
      arriveAt: new Date(deadline).toISOString(),
      walkToStopMinutes: minutes,
      walkFromStopMinutes: 0,
      transfers: 0,
      source: 'estimate',
    };
  }
  const walkTo = 6;
  const walkFrom = params.building.arrivalStops[0]?.walkMinutes ?? 5;
  const ride = Math.round((meters * 1.35) / 300);
  const wait = 4;
  const arriveStop = deadline - walkFrom * MIN;
  const depart = arriveStop - ride * MIN;
  const leaveAt = depart - (walkTo + wait) * MIN;
  return {
    id: 'estimate:transit',
    legs: [
      { kind: 'walk', minutes: walkTo + wait, from: params.originLabel, to: 'nejbližší zastávka' },
      {
        kind: 'ride',
        line: 'MHD',
        mode: 'bus',
        headsign: 'odhad bez jízdního řádu',
        fromStop: 'nejbližší zastávka',
        toStop: params.building.arrivalStops[0]?.name ?? params.building.name,
        scheduledDeparture: new Date(depart).toISOString(),
        predictedDeparture: new Date(depart).toISOString(),
        scheduledArrival: new Date(arriveStop).toISOString(),
        predictedArrival: new Date(arriveStop).toISOString(),
        delaySeconds: null,
        isAirConditioned: null,
        isWheelchairAccessible: null,
      },
      { kind: 'walk', minutes: walkFrom, from: params.building.arrivalStops[0]?.name ?? 'zastávka', to: params.building.name },
    ],
    leaveAt: new Date(leaveAt).toISOString(),
    departAt: new Date(depart).toISOString(),
    arriveAt: new Date(deadline).toISOString(),
    walkToStopMinutes: walkTo + wait,
    walkFromStopMinutes: walkFrom,
    transfers: 0,
    source: 'estimate',
  };
}

/* ------------------------------------------------------------------ */
/* Orchestrace                                                         */
/* ------------------------------------------------------------------ */

export async function planLiveTransit(params: LivePlanParams): Promise<TransitResult> {
  const warnings: string[] = [];
  const fetchedAt = new Date().toISOString();
  if (params.useGoogle) {
    try {
      const its = await planWithGoogle(params);
      if (its.length > 0) {
        if (!params.golemio) warnings.push('Bez Golemio klíče jedu podle jízdního řádu (bez živého zpoždění).');
        return { itineraries: its, source: 'google', fetchedAt, warnings, originLabel: params.originLabel };
      }
      warnings.push('Google Routes nenašlo spojení – zkouším přímé spoje z Golemia.');
    } catch (error) {
      warnings.push(`Google Routes: ${errorMessage(error)}`);
    }
  }
  if (params.golemio) {
    try {
      const its = await planWithGolemio(params);
      if (its.length > 0) return { itineraries: its, source: 'golemio', fetchedAt, warnings, originLabel: params.originLabel };
      warnings.push('V okolí není přímý spoj k budově – přidej Google Maps klíč pro trasy s přestupem.');
    } catch (error) {
      warnings.push(`Golemio: ${errorMessage(error)}`);
    }
  } else {
    warnings.push('Chybí Golemio API klíč – zobrazuji jen odhad podle vzdálenosti.');
  }
  return { itineraries: [estimateItinerary(params)], source: 'estimate', fetchedAt, warnings, originLabel: params.originLabel };
}
