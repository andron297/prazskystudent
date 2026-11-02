/**
 * Simulace PID pro sandbox: deterministické jízdní řády podle intervalů,
 * „živá“ zpoždění, která se v čase plynule mění, klimatizace a nízkopodlažnost
 * podle vozového parku a vyhledání spojení včetně jednoho přestupu.
 * Výstupem jsou stejné struktury (Itinerary), jaké vrací živé API.
 */
import type { Building, Itinerary, JourneyLeg, LatLng, RideLeg, WalkSpeed } from '../../types';
import { haversineMeters, walkingMinutes } from '../../lib/geo';
import { hashString } from '../../lib/id';
import { DEMO_LINES, DEMO_STOPS, linesServing, transferMinutes, type DemoLine } from './network';

const MIN = 60_000;

export interface SimDeparture {
  tripId: string;
  line: DemoLine;
  dir: 0 | 1;
  headsign: string;
  stopName: string;
  scheduled: number;
  predicted: number;
  delaySeconds: number | null;
  isAirConditioned: boolean | null;
  isWheelchairAccessible: boolean | null;
  vehicleType: string;
  vehicleNumber?: string;
}

/* ------------------------------------------------------------------ */
/* Jízdní řád                                                          */
/* ------------------------------------------------------------------ */

const tripCache = new Map<string, number[]>();

function localDayStart(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(day: Date): string {
  return `${day.getFullYear()}${day.getMonth() + 1}${day.getDate()}`;
}

/** Časy výjezdů z výchozí zastávky pro daný směr a den. */
function tripStarts(line: DemoLine, dir: 0 | 1, day: Date): number[] {
  const key = `${line.id}|${dir}|${dayKey(day)}`;
  const cached = tripCache.get(key);
  if (cached) return cached;
  const starts: number[] = [];
  const phase = hashString(`${line.id}:${dir}`) % 7;
  let t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 4, 30 + phase).getTime();
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 24, 30).getTime();
  while (t < end) {
    const hw = line.headway(new Date(t).getHours());
    if (hw === null) {
      t += 10 * MIN;
      continue;
    }
    starts.push(t);
    t += hw * MIN;
  }
  tripCache.set(key, starts);
  return starts;
}

export function stopSequence(line: DemoLine, dir: 0 | 1): [string, number][] {
  if (dir === 0) return line.stops;
  const total = line.stops[line.stops.length - 1][1];
  return [...line.stops].reverse().map(([name, m]) => [name, total - m] as [string, number]);
}

/* ------------------------------------------------------------------ */
/* Živé vlastnosti spoje                                               */
/* ------------------------------------------------------------------ */

function liveProps(line: DemoLine, tripId: string, tripStart: number, nowMs: number) {
  const seed = hashString(tripId);
  const inService = tripStart - nowMs <= 30 * MIN;
  let delaySeconds: number | null = null;
  if (line.realtime && inService) {
    const r = (seed & 0xffff) / 0xffff;
    let base: number;
    if (r < 0.42) base = (r / 0.42) * 35;
    else if (r < 0.8) base = 60 + ((r - 0.42) / 0.38) * 90;
    else if (r < 0.95) base = 150 + ((r - 0.8) / 0.15) * 120;
    else base = 300 + ((r - 0.95) / 0.05) * 240;
    const drift = Math.sin(nowMs / MIN / 9 + ((seed >>> 16) % 628) / 100) * 25;
    delaySeconds = Math.max(0, Math.round(base + drift));
  }
  let ac: boolean | null = null;
  let lowFloor = true;
  let vehicleType = line.vehicles.ac;
  let vehicleNumber: string | undefined;
  if (line.acShare !== null) {
    ac = (seed >>> 8) % 100 < line.acShare * 100;
    lowFloor = ac || (seed >>> 4) % 100 < line.lowFloorShare * 100;
    vehicleType = ac ? line.vehicles.ac : lowFloor ? line.vehicles.lowFloor : line.vehicles.old;
    const base = ac ? 9200 : lowFloor ? 8250 : 8400;
    vehicleNumber = String(base + (seed % 180));
  }
  return { delaySeconds, ac, lowFloor, vehicleType, vehicleNumber };
}

/* ------------------------------------------------------------------ */
/* Odjezdové tabule                                                    */
/* ------------------------------------------------------------------ */

function lineDepartures(line: DemoLine, dir: 0 | 1, stopName: string, fromMs: number, toMs: number, nowMs: number): SimDeparture[] {
  const seq = stopSequence(line, dir);
  const idx = seq.findIndex(([name]) => name === stopName);
  if (idx < 0 || idx === seq.length - 1) return [];
  const offset = seq[idx][1] * MIN;
  const out: SimDeparture[] = [];
  const firstDay = localDayStart(fromMs - 2 * 60 * MIN);
  const lastDay = localDayStart(toMs);
  for (let day = firstDay; day.getTime() <= lastDay.getTime(); day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    for (const start of tripStarts(line, dir, day)) {
      const scheduled = start + offset;
      if (scheduled < fromMs - 10 * MIN || scheduled > toMs) continue;
      const startDate = new Date(start);
      const tripId = `${line.shortName}_${dir}_${dayKey(day)}_${startDate.getHours()}${String(startDate.getMinutes()).padStart(2, '0')}`;
      const props = liveProps(line, tripId, start, nowMs);
      const predicted = scheduled + (props.delaySeconds ?? 0) * 1000;
      if (predicted < fromMs || predicted > toMs) continue;
      out.push({
        tripId,
        line,
        dir,
        headsign: line.termini[dir],
        stopName,
        scheduled,
        predicted,
        delaySeconds: props.delaySeconds,
        isAirConditioned: props.ac,
        isWheelchairAccessible: props.lowFloor,
        vehicleType: props.vehicleType,
        vehicleNumber: props.vehicleNumber,
      });
    }
  }
  return out.sort((a, b) => a.predicted - b.predicted);
}

/** Simulovaná odjezdová tabule zastávky (jako Golemio /v2/pid/departureboards). */
export function simulateDepartureBoard(stopName: string, fromMs: number, toMs: number, nowMs: number): SimDeparture[] {
  const out: SimDeparture[] = [];
  for (const line of linesServing(stopName)) {
    for (const dir of [0, 1] as const) out.push(...lineDepartures(line, dir, stopName, fromMs, toMs, nowMs));
  }
  return out.sort((a, b) => a.predicted - b.predicted);
}

/* ------------------------------------------------------------------ */
/* Vyhledání spojení                                                   */
/* ------------------------------------------------------------------ */

interface RideSpec {
  line: DemoLine;
  dir: 0 | 1;
  from: string;
  to: string;
  rideMinutes: number;
}

interface Pattern {
  originStop: string;
  walkTo: number;
  rides: RideSpec[];
  destStop: string;
  walkFrom: number;
  score: number;
}

export interface DemoPlanParams {
  origin: LatLng;
  originLabel: string;
  building: Building;
  nowMs: number;
  untilMs: number;
  walkSpeed: WalkSpeed;
  /** Zastávka zvolená studentem (musí být v demo síti). */
  originStop?: { name: string; coords: LatLng } | null;
}

export function nearbyDemoStops(origin: LatLng, walkSpeed: WalkSpeed, maxMeters = 1600) {
  return Object.entries(DEMO_STOPS)
    .map(([name, coords]) => ({
      name,
      meters: haversineMeters(origin, coords),
      walkMinutes: walkingMinutes(origin, coords, walkSpeed),
    }))
    .filter((s) => s.meters <= maxMeters)
    .sort((a, b) => a.walkMinutes - b.walkMinutes)
    .slice(0, 4);
}

export function demoNetworkHasStop(name: string): boolean {
  return Boolean(DEMO_STOPS[name]) && linesServing(name).length > 0;
}

function findPatterns(params: DemoPlanParams): Pattern[] {
  const forced = params.originStop && demoNetworkHasStop(params.originStop.name) ? params.originStop : null;
  const origins = forced
    ? [{ name: forced.name, meters: haversineMeters(params.origin, DEMO_STOPS[forced.name]), walkMinutes: walkingMinutes(params.origin, DEMO_STOPS[forced.name], params.walkSpeed) }]
    : nearbyDemoStops(params.origin, params.walkSpeed);
  const destinations = new Map(params.building.arrivalStops.filter((s) => DEMO_STOPS[s.name]).map((s) => [s.name, s.walkMinutes]));
  if (origins.length === 0 || destinations.size === 0) return [];
  const patterns: Pattern[] = [];

  for (const o of origins) {
    for (const line of linesServing(o.name)) {
      for (const dir of [0, 1] as const) {
        const seq = stopSequence(line, dir);
        const i = seq.findIndex(([n]) => n === o.name);
        if (i < 0) continue;
        for (let j = i + 1; j < seq.length; j++) {
          const [stop, minute] = seq[j];
          const ride1 = minute - seq[i][1];
          const walkFrom = destinations.get(stop);
          if (walkFrom !== undefined) {
            patterns.push({
              originStop: o.name,
              walkTo: o.walkMinutes,
              rides: [{ line, dir, from: o.name, to: stop, rideMinutes: ride1 }],
              destStop: stop,
              walkFrom,
              score: o.walkMinutes + ride1 + walkFrom + (line.headway(13) ?? 10) / 2,
            });
          }
          for (const line2 of linesServing(stop)) {
            if (line2.id === line.id) continue;
            for (const dir2 of [0, 1] as const) {
              const seq2 = stopSequence(line2, dir2);
              const k = seq2.findIndex(([n]) => n === stop);
              if (k < 0) continue;
              for (let m = k + 1; m < seq2.length; m++) {
                const [stop2, minute2] = seq2[m];
                const walkFrom2 = destinations.get(stop2);
                if (walkFrom2 === undefined) continue;
                const ride2 = minute2 - seq2[k][1];
                const transfer = transferMinutes(line.mode, line2.mode);
                patterns.push({
                  originStop: o.name,
                  walkTo: o.walkMinutes,
                  rides: [
                    { line, dir, from: o.name, to: stop, rideMinutes: ride1 },
                    { line: line2, dir: dir2, from: stop, to: stop2, rideMinutes: ride2 },
                  ],
                  destStop: stop2,
                  walkFrom: walkFrom2,
                  score:
                    o.walkMinutes + ride1 + transfer + ride2 + walkFrom2 + ((line.headway(13) ?? 10) + (line2.headway(13) ?? 10)) / 2 + 6,
                });
              }
            }
          }
        }
      }
    }
  }

  // Nejlepší varianta pro každou kombinaci linek, pak nejlepších 6 celkem.
  const best = new Map<string, Pattern>();
  for (const p of patterns) {
    const key = `${p.originStop}|${p.rides.map((r) => `${r.line.id}:${r.dir}`).join('>')}`;
    const prev = best.get(key);
    if (!prev || p.score < prev.score) best.set(key, p);
  }
  const sorted = [...best.values()].sort((a, b) => a.score - b.score);
  const fastest = sorted[0]?.score ?? 0;
  return sorted.filter((p) => p.score <= fastest + 25).slice(0, 6);
}

function rideLeg(dep: SimDeparture, spec: RideSpec): RideLeg {
  const delayMs = (dep.delaySeconds ?? 0) * 1000;
  const scheduledArrival = dep.scheduled + spec.rideMinutes * MIN;
  return {
    kind: 'ride',
    line: spec.line.shortName,
    mode: spec.line.mode,
    headsign: dep.headsign,
    fromStop: spec.from,
    toStop: spec.to,
    scheduledDeparture: new Date(dep.scheduled).toISOString(),
    predictedDeparture: new Date(dep.predicted).toISOString(),
    scheduledArrival: new Date(scheduledArrival).toISOString(),
    predictedArrival: new Date(scheduledArrival + delayMs).toISOString(),
    delaySeconds: dep.delaySeconds,
    isAirConditioned: dep.isAirConditioned,
    isWheelchairAccessible: dep.isWheelchairAccessible,
    tripId: dep.tripId,
    vehicleType: dep.vehicleType,
    vehicleNumber: dep.vehicleNumber,
  };
}

/** Spojení z polohy do budovy, která vyrážejí od teď do `untilMs`. */
export function planDemoItineraries(params: DemoPlanParams): Itinerary[] {
  const patterns = findPatterns(params);
  const itineraries: Itinerary[] = [];
  for (const p of patterns) {
    const first = p.rides[0];
    const fromMs = params.nowMs + p.walkTo * MIN - 30_000;
    const deps = lineDepartures(first.line, first.dir, first.from, fromMs, params.untilMs, params.nowMs);
    for (const dep of deps) {
      const legs: JourneyLeg[] = [{ kind: 'walk', minutes: p.walkTo, from: params.originLabel, to: first.from }];
      const leg1 = rideLeg(dep, first);
      legs.push(leg1);
      let arrival = new Date(leg1.predictedArrival).getTime();
      let ok = true;
      if (p.rides.length > 1) {
        const second = p.rides[1];
        const transfer = transferMinutes(first.line.mode, second.line.mode);
        const earliest = arrival + transfer * MIN;
        const next = lineDepartures(second.line, second.dir, second.from, earliest, earliest + 45 * MIN, params.nowMs)[0];
        if (!next) ok = false;
        else {
          legs.push({ kind: 'walk', minutes: transfer, from: second.from, to: `${second.from} (přestup)` });
          const leg2 = rideLeg(next, second);
          legs.push(leg2);
          arrival = new Date(leg2.predictedArrival).getTime();
        }
      }
      if (!ok) continue;
      legs.push({ kind: 'walk', minutes: p.walkFrom, from: p.destStop, to: params.building.name });
      const arriveAt = arrival + p.walkFrom * MIN;
      const leaveAt = dep.predicted - p.walkTo * MIN;
      itineraries.push({
        id: `demo:${p.originStop}:${p.rides.map((r) => r.line.id).join('>')}:${dep.tripId}`,
        legs,
        leaveAt: new Date(leaveAt).toISOString(),
        departAt: new Date(dep.predicted).toISOString(),
        arriveAt: new Date(arriveAt).toISOString(),
        walkToStopMinutes: p.walkTo,
        walkFromStopMinutes: p.walkFrom,
        transfers: p.rides.length - 1,
        source: 'demo',
      });
    }
  }
  return itineraries.sort((a, b) => a.leaveAt.localeCompare(b.leaveAt));
}

export function demoNetworkCovers(building: Building): boolean {
  return building.arrivalStops.some((s) => Boolean(DEMO_STOPS[s.name]));
}

export const DEMO_LINE_COUNT = DEMO_LINES.length;
