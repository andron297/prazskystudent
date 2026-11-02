import { beforeEach, describe, expect, it } from 'vitest';
import type { Building, RideLeg, TransitMode } from '../types';
import type { StopGroup } from '../lib/stops';
import { bestAlight, platformsNear } from '../lib/stopIndex';
import { clearPatternCache, planGolemioJourneys, type PlannerSource } from '../services/golemioPlanner';
import type { GolemioDeparture, TripStopTime } from '../services/golemio';

type P = [code: string, lat: number, lng: number, gtfsId: string, lines: [string, TransitMode][]];

function group(name: string, platforms: P[]): StopGroup {
  const lines = [...new Map(platforms.flatMap((p) => p[4]).map(([l, mode]) => [l, { name: l, mode, night: false }])).values()];
  return {
    id: name,
    name,
    coords: { lat: platforms.reduce((s, p) => s + p[1], 0) / platforms.length, lng: platforms.reduce((s, p) => s + p[2], 0) / platforms.length },
    mainMode: lines[0].mode,
    lines,
    platforms: platforms.map(([code, lat, lng, gtfsId, ls]) => ({ coords: { lat, lng }, gtfsId, code, accessible: true, serves: ls.map(([line, mode]) => ({ line, mode, night: false })) })),
    accessible: true,
    search: name.toLowerCase(),
  };
}

const NOW = new Date(2026, 10, 2, 8, 0);
const START = new Date(2026, 10, 2, 9, 0);
const HOME = { lat: 50.07, lng: 14.41 };

const hollar: Building = { id: 'hollar', name: 'Hollar', locative: 'na Hollaru', faculty: 'FSV', address: '', coords: { lat: 50.0843, lng: 14.4136 }, aliases: [], arrivalStops: [] };
const kampus: Building = { id: 'kampus', name: 'Kampus', locative: 'v kampusu', faculty: 'FSV', address: '', coords: { lat: 50.0566, lng: 14.3731 }, aliases: [], arrivalStops: [] };

const GROUPS: StopGroup[] = [
  group('Domov', [
    ['A', 50.0702, 14.4101, 'D1P', [['17', 'tram'], ['9', 'tram']]],
    ['B', 50.0699, 14.4104, 'D2P', [['17', 'tram']]],
  ]),
  group('Národní divadlo', [['C', 50.08039, 14.41356, 'ND5P', [['17', 'tram']]]]),
  group('Karlovy lázně', [['A', 50.08457, 14.41347, 'KL1P', [['17', 'tram']]]]),
  group('Uzel', [
    ['A', 50.082, 14.398, 'U1P', [['9', 'tram']]],
    ['M1', 50.0822, 14.3983, 'U101P', [['B', 'metro']]],
  ]),
  group('Cíl', [['M1', 50.0547, 14.3696, 'C101P', [['B', 'metro']]]]),
];

function dep(stopName: string, stopId: string, line: string, mode: TransitMode, headsign: string, tripId: string, minute: number): GolemioDeparture {
  const t = new Date(NOW.getTime() + minute * 60_000);
  return { stopId, stopName, line, mode, headsign, tripId, scheduled: t, predicted: t, delaySeconds: 0, isAirConditioned: true, isWheelchairAccessible: true, isCanceled: false };
}

const st = (stopId: string, sec: number): TripStopTime => ({ stopId, arrivalSec: sec, departureSec: sec, sequence: 0 });

function fakeSource(departures: GolemioDeparture[], trips: Record<string, TripStopTime[]>): PlannerSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async departureBoards(o) {
      calls.push(`boards:${(o.names ?? o.ids ?? []).join(',')}`);
      const from = (o.timeFrom ?? NOW).getTime();
      const to = from + (o.minutesAfter ?? 120) * 60_000;
      return departures.filter((d) => ((o.names ?? []).includes(d.stopName) || (o.ids ?? []).includes(d.stopId)) && d.predicted.getTime() >= from && d.predicted.getTime() <= to);
    },
    async tripStopTimes(tripId) {
      calls.push(`trip:${tripId}`);
      const key = Object.keys(trips).find((k) => tripId.startsWith(k));
      if (!key) throw new Error('unknown trip');
      return trips[key];
    },
  };
}

beforeEach(() => clearPatternCache());

describe('výběr zastávek', () => {
  it('nástupiště v okolí se měří k přesnému nástupišti', () => {
    const near = platformsNear(GROUPS, hollar.coords, { maxMeters: 500 });
    expect(near[0]).toMatchObject({ group: { name: 'Karlovy lázně' }, walk: 1 });
    expect(near.find((c) => c.group.name === 'Národní divadlo')?.walk).toBeGreaterThan(5);
  });

  it('vystoupit tam, odkud je to do budovy nejrychleji – i když spoj dřív projede jinou cílovou zastávkou', () => {
    const dest = new Map(platformsNear(GROUPS, hollar.coords, { maxMeters: 1100 }).map((c) => [c.platform.gtfsId, c]));
    const times = [st('D1P', 0), st('ND5P', 600), st('KL1P', 660)];
    const alight = bestAlight(times, 0, dest)!;
    expect(alight.candidate.group.name).toBe('Karlovy lázně');
    expect(alight.index).toBe(2);
  });
});

describe('plánovač nad Golemiem', () => {
  it('přímý spoj: nejlepší výstup a chůze k nástupišti', async () => {
    const source = fakeSource(
      [dep('Domov', 'D1P', '17', 'tram', 'Vozovna Kobylisy', 't17-a', 10), dep('Domov', 'D1P', '17', 'tram', 'Vozovna Kobylisy', 't17-b', 20)],
      { 't17-': [st('D1P', 0), st('ND5P', 600), st('KL1P', 660), st('XX', 900)] },
    );
    const its = await planGolemioJourneys(source, GROUPS, { origin: HOME, originLabel: 'Doma', building: hollar, now: NOW, eventStart: START, walkSpeed: 'normal' });
    expect(its).toHaveLength(2);
    const ride = its[0].legs[1] as RideLeg;
    expect(ride).toMatchObject({ line: '17', fromStop: 'Domov', toStop: 'Karlovy lázně', toPlatform: 'A', stopCount: 2 });
    expect(ride.fromCoords).toEqual({ lat: 50.0702, lng: 14.4101 });
    expect(its[0].walkFromStopMinutes).toBe(1);
    // vzor spoje se načte jen jednou
    expect(source.calls.filter((c) => c.startsWith('trip:'))).toHaveLength(1);
  });

  it('jeden přestup, když k cíli nic nejede přímo (tramvaj → metro B)', async () => {
    const departures = [
      dep('Domov', 'D1P', '9', 'tram', 'Sídliště Řepy', 't9-a', 5),
      ...[0, 4, 8, 12, 16, 20, 24].map((m, i) => dep('Uzel', 'U101P', 'B', 'metro', 'Zličín', `mB-${i}`, 13 + m)),
    ];
    const source = fakeSource(departures, {
      't9-': [st('D1P', 0), st('U1P', 600), st('ZZ', 700)],
      'mB-': [st('U101P', 0), st('C101P', 480)],
    });
    const its = await planGolemioJourneys(source, GROUPS, { origin: HOME, originLabel: 'Doma', building: kampus, now: NOW, eventStart: START, walkSpeed: 'normal' });
    const withTransfer = its.find((it) => it.transfers === 1)!;
    expect(withTransfer).toBeTruthy();
    const rides = withTransfer.legs.filter((l): l is RideLeg => l.kind === 'ride');
    expect(rides.map((r) => `${r.line} ${r.fromStop}→${r.toStop}`)).toEqual(['9 Domov→Uzel', 'B Uzel→Cíl']);
    // tram v Uzlu v 8:15, přestup na metro 3 min (chůze + schody) → metro 8:17 už nestihne, jede 8:21
    expect(new Date(rides[1].predictedDeparture).getMinutes()).toBe(21);
    expect(withTransfer.legs[2]).toMatchObject({ kind: 'walk', minutes: 3 });
  });
});
