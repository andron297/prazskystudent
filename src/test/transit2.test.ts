import { describe, expect, it } from 'vitest';
import type { Itinerary, RideLeg } from '../types';
import { applyMargins, DEFAULT_MARGINS, pickItinerary, planJourney, routeSteps } from '../lib/transitPlanner';

const at = (h: number, m: number) => new Date(2026, 10, 2, h, m).toISOString();

function trip(id: string, mode: RideLeg['mode'], dep: [number, number], arr: [number, number]): Itinerary {
  const ride: RideLeg = {
    kind: 'ride',
    line: mode === 'metro' ? 'A' : '22',
    mode,
    headsign: mode === 'metro' ? 'Depo Hostivař' : 'Nádraží Hostivař',
    fromStop: mode === 'metro' ? 'Hradčanská' : 'Drinopol',
    toStop: 'Národní divadlo',
    platform: 'A',
    scheduledDeparture: at(...dep),
    predictedDeparture: at(...dep),
    scheduledArrival: at(...arr),
    predictedArrival: at(...arr),
    delaySeconds: 0,
    isAirConditioned: true,
    isWheelchairAccessible: true,
  };
  const depMs = new Date(at(...dep)).getTime();
  return {
    id,
    legs: [{ kind: 'walk', minutes: 4, from: 'Kolej', to: ride.fromStop }, ride, { kind: 'walk', minutes: 4, from: ride.toStop, to: 'Hollar' }],
    leaveAt: new Date(depMs - 4 * 60_000).toISOString(),
    departAt: at(...dep),
    arriveAt: new Date(new Date(at(...arr)).getTime() + 4 * 60_000).toISOString(),
    walkToStopMinutes: 4,
    walkFromStopMinutes: 4,
    transfers: 0,
    source: 'golemio',
  };
}

describe('realistické časy a výběr spoje', () => {
  it('přidá odchod z domu, předstih na zastávce a u metra cestu na nástupiště', () => {
    const tram = applyMargins(trip('t', 'tram', [13, 30], [13, 51]), DEFAULT_MARGINS);
    expect(new Date(tram.leaveAt).getHours() * 60 + new Date(tram.leaveAt).getMinutes()).toBe(13 * 60 + 30 - 4 - 3 - 1);
    const metro = applyMargins(trip('m', 'metro', [13, 30], [13, 40]), DEFAULT_MARGINS);
    expect(metro.margins).toEqual({ prep: 3, early: 1, entry: 3, exit: 2 });
    expect(new Date(metro.leaveAt).getMinutes()).toBe(30 - 4 - 3 - 1 - 3);
    expect(new Date(metro.arriveAt).getMinutes()).toBe(40 + 4 + 2);
  });

  it('vybraný spoj se drží, dokud jde stihnout; jinak doporučený', () => {
    const now = new Date(2026, 10, 2, 12, 0);
    const its = [trip('a', 'tram', [13, 10], [13, 31]), trip('b', 'tram', [13, 20], [13, 41]), trip('c', 'tram', [13, 30], [13, 51])].map((it) => applyMargins(it, DEFAULT_MARGINS));
    const plan = planJourney({ now, eventStart: new Date(2026, 10, 2, 14, 0), bufferMinutes: 5, itineraries: its });
    expect(plan.lastCall?.id).toBe('c');
    expect(pickItinerary(plan, null, now)?.id).toBe(plan.recommended?.id);
    expect(pickItinerary(plan, 'a', now)?.id).toBe('a');
    expect(pickItinerary(plan, 'neexistuje', now)?.id).toBe(plan.recommended?.id);
  });

  it('kroky cesty říkají, kam jít, čím jet a kde vystoupit', () => {
    const it = applyMargins(trip('c', 'tram', [13, 30], [13, 51]), DEFAULT_MARGINS);
    const steps = routeSteps(it, new Date(2026, 10, 2, 14, 0), 'Hollar');
    expect(steps.map((s) => s.kind)).toEqual(['leave', 'walk', 'ride', 'exit', 'arrive']);
    expect(steps[1].title).toBe('Jděte na zastávku Drinopol');
    expect(steps[1].detail).toContain('nástupiště A');
    expect(steps[2].title).toBe('Tramvaj 22 směr Nádraží Hostivař');
    expect(steps[3].title).toBe('Vystupte: Národní divadlo');
    expect(steps[4].detail).toBe('5 min do začátku');
  });
});
