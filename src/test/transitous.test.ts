import { describe, expect, it } from 'vitest';
import type { RideLeg } from '../types';
import { fromTransitous, type CompactItinerary } from '../services/transitous';
import { applyMargins, DEFAULT_MARGINS, planJourney, routeSteps } from '../lib/transitPlanner';

const place = (name: string, lat: number, lon: number, stopId?: string, track?: string) => ({ name, lat, lon, stopId, track });
const walk = (from: ReturnType<typeof place>, to: ReturnType<typeof place>, start: string, end: string, distance = 100) => ({ mode: 'WALK', from, to, start, end, scheduledStart: start, scheduledEnd: end, realTime: false, distance });

const START = place('Start', 50.085, 14.379);
const MAL = place('Malovanka', 50.0856, 14.3825, 'cz-PID_U362Z1P', 'A');
const MS = place('Malostranská', 50.0904, 14.4101, 'cz-PID_U360Z1P', 'A');
const KL = place('Karlovy lázně', 50.0846, 14.4135, 'cz-PID_U221Z1P', 'A');
const END = place('Cíl', 50.0843, 14.4136);

const RAW: CompactItinerary = {
  start: '2026-11-04T09:13:00Z',
  end: '2026-11-04T09:34:00Z',
  transfers: 1,
  legs: [
    walk(START, MAL, '2026-11-04T09:13:00Z', '2026-11-04T09:18:00Z', 314),
    { mode: 'TRAM', from: MAL, to: MS, start: '2026-11-04T09:19:00Z', end: '2026-11-04T09:29:00Z', scheduledStart: '2026-11-04T09:18:00Z', scheduledEnd: '2026-11-04T09:28:00Z', realTime: true, line: '22', headsign: 'Nádraží Hostivař', tripId: 't22', wheelchair: true, stops: 6 },
    walk(MS, MS, '2026-11-04T09:29:00Z', '2026-11-04T09:31:00Z', 0),
    { mode: 'TRAM', from: MS, to: KL, start: '2026-11-04T09:31:00Z', end: '2026-11-04T09:33:00Z', scheduledStart: '2026-11-04T09:31:00Z', scheduledEnd: '2026-11-04T09:33:00Z', realTime: false, line: '2', headsign: 'Náměstí Bratří Synků', tripId: 't2', stops: 2 },
    walk(KL, END, '2026-11-04T09:33:00Z', '2026-11-04T09:34:00Z', 40),
  ],
};

describe('trasy z plánovače Transitous', () => {
  it('převede itinerář: nástupiště, zpoždění, přestup, chůze', () => {
    const it = fromTransitous(RAW, 'Doma', 'Hollar')!;
    expect(it.source).toBe('transitous');
    expect(it.transfers).toBe(1);
    expect(it.walkToStopMinutes).toBe(5);
    expect(it.walkFromStopMinutes).toBe(1);
    const rides = it.legs.filter((l): l is RideLeg => l.kind === 'ride');
    expect(rides[0]).toMatchObject({ line: '22', mode: 'tram', fromStop: 'Malovanka', platform: 'A', toStop: 'Malostranská', delaySeconds: 60, isWheelchairAccessible: true, stopCount: 6 });
    expect(rides[1].delaySeconds).toBeNull();
    expect(it.legs[0]).toMatchObject({ kind: 'walk', from: 'Doma', to: 'Malovanka' });
    expect(it.legs[4]).toMatchObject({ kind: 'walk', to: 'Hollar' });
    expect(it.id).toBe('transitous:t22>t2');
  });

  it('kroky cesty i plán fungují nad převedeným itinerářem', () => {
    const it = applyMargins(fromTransitous(RAW, 'Doma', 'Hollar')!, DEFAULT_MARGINS);
    const steps = routeSteps(it, new Date('2026-11-04T09:45:00Z'), 'Hollar');
    expect(steps.find((s) => s.kind === 'transfer')?.detail).toContain('2 min na přestup');
    const plan = planJourney({ now: new Date('2026-11-04T09:00:00Z'), eventStart: new Date('2026-11-04T09:45:00Z'), bufferMinutes: 5, itineraries: [it] });
    expect(plan.recommended?.id).toBe(it.id);
  });

  it('jen chůze (budova je blízko)', () => {
    const it = fromTransitous({ start: '2026-11-04T09:30:00Z', end: '2026-11-04T09:38:00Z', transfers: 0, legs: [walk(START, END, '2026-11-04T09:30:00Z', '2026-11-04T09:38:00Z', 600)] }, 'Doma', 'Hollar')!;
    expect(it.legs).toHaveLength(1);
    expect(it.walkToStopMinutes).toBe(8);
  });
});
