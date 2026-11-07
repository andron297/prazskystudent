import { describe, expect, it } from 'vitest';
import { parseSearchMatches } from '../../server/sis';
import { clockOffsetAt } from '../store/clockStore';
import { isOwnerEmail } from '../store/testStore';

describe('SIS: výsledky hledání s názvy', () => {
  it('vezme název z odkazu u stejného kódu', () => {
    const html = `
      <table><tr class="row1">
        <td><a href="index.php?do=predmet&amp;kod=JSB022" class="link3">JSB022</a></td>
        <td><a href="index.php?do=predmet&amp;kod=JSB022" class="link3">Základy logiky</a></td><td>FSV</td>
      </tr><tr class="row2">
        <td><a href="index.php?do=predmet&amp;kod=AXLOSPE09">AXLOSPE09</a></td>
        <td><a href="index.php?do=predmet&amp;kod=AXLOSPE09">Základy logiky &amp; argumentace</a></td>
      </tr></table>`;
    expect(parseSearchMatches(html)).toEqual([
      { code: 'JSB022', name: 'Základy logiky' },
      { code: 'AXLOSPE09', name: 'Základy logiky & argumentace' },
    ]);
  });

  it('když název není odkaz, vezme buňku za kódem', () => {
    const html = `<tr><td><a href="?do=predmet&kod=OKPV10002">OKPV10002</a></td><td class="x"> Logika <b>pro učitele</b> </td></tr>`;
    expect(parseSearchMatches(html)).toEqual([{ code: 'OKPV10002', name: 'Logika pro učitele' }]);
  });

  it('bez názvu vrátí aspoň kód a dodrží limit', () => {
    const html = Array.from({ length: 12 }, (_, i) => `<a href="?redir=predmet&amp;kod=ABC${100 + i}">ABC${100 + i}</a>`).join(' ');
    const out = parseSearchMatches(html);
    expect(out).toHaveLength(8);
    expect(out[0]).toEqual({ code: 'ABC100' });
  });
});

describe('Testovací režim', () => {
  it('pozná jen účet správce (bez ohledu na velká písmena a mezery)', () => {
    expect(isOwnerEmail('andrleondrej@gmail.com')).toBe(true);
    expect(isOwnerEmail(' AndrleOndrej@Gmail.com ')).toBe(true);
    expect(isOwnerEmail('andrleondrej@gamil.com')).toBe(false);
    expect(isOwnerEmail('student@cuni.cz')).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
  });

  it('zrychlený čas běží od okamžiku zrychlení', () => {
    const s = { offsetMs: 60_000, speed: 60, speedFrom: 1_000_000 };
    expect(clockOffsetAt(s, 1_000_000)).toBe(60_000);
    // 10 s reálně = 600 s simulovaně → posun naroste o 590 s
    expect(clockOffsetAt(s, 1_010_000)).toBe(60_000 + 590_000);
    expect(clockOffsetAt({ offsetMs: 0, speed: 1, speedFrom: 0 }, 5_000)).toBe(0);
  });
});

import { readFileSync } from 'node:fs';
import { compactSteps, wayInfoFromTags } from '../../server/transit';
import { instructionText, maneuversFor, type NavWayMap } from '../lib/navigation';
import { cumulative, decodePolyline, pointAlong } from '../lib/polyline';
import { haversineMeters } from '../lib/geo';

describe('Navigace: přechody, schody a vstup do metra (skutečná trasa Opletalova → Můstek)', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/walk-mustek.json', import.meta.url), 'utf8')) as {
    leg: { legGeometry: { points: string }; steps: Parameters<typeof compactSteps>[0] };
    wayTags: Record<string, Record<string, string>>;
  };
  const steps = compactSteps(fixture.leg.steps).map((st) => ({ distance: st.d, street: st.s, dir: st.dir, level: st.l, way: st.w }));
  const path = decodePolyline(fixture.leg.legGeometry.points, 7);
  const ways: NavWayMap = {};
  for (const [id, tags] of Object.entries(fixture.wayTags)) {
    const info = wayInfoFromTags(tags);
    if (info) ways[Number(id)] = info;
  }

  it('z OSM pozná chodník, přechod se zebrou, schody, eskalátor a nástupiště', () => {
    expect(ways[724274070]).toEqual({ k: 'crossing', zebra: 1 });
    expect(ways[1389568488]).toEqual({ k: 'crossing' });
    expect(ways[724274066]?.k).toBe('sidewalk');
    expect(ways[27960450]).toEqual({ k: 'steps', u: 1 });
    expect(ways[349471597]).toEqual({ k: 'escalator', u: 1 });
    expect(ways[487954656]).toMatchObject({ k: 'platform', name: 'Můstek', u: 1 });
    expect(wayInfoFromTags({ highway: 'footway', footway: 'crossing', crossing: 'traffic_signals' })).toEqual({ k: 'crossing', sig: 1 });
  });

  it('kroky si nesou patra a cesty OSM', () => {
    expect(steps.some((s) => s.level === -5)).toBe(true);
    expect(steps.filter((s) => s.way).length).toBeGreaterThan(15);
  });

  it('pokyny: přechody, vstup do metra po schodech, eskalátor a výtah dolů – ve správném pořadí', () => {
    const ms = maneuversFor(path, steps, ways, { toMetro: true });
    const crossings = ms.filter((m) => m.type === 'crossing' || m.crossing);
    expect(crossings.length).toBeGreaterThanOrEqual(1);
    const entrance = ms.find((m) => m.note === 'entrance');
    expect(entrance?.type).toBe('stairs-down');
    const escalator = ms.find((m) => m.type === 'escalator-down');
    const elevator = ms.find((m) => m.type === 'elevator-down');
    expect(escalator).toBeTruthy();
    expect(elevator).toBeTruthy();
    expect(entrance!.at).toBeLessThan(escalator!.at);
    expect(escalator!.at).toBeLessThan(elevator!.at);
    expect(ms[ms.length - 1].type).toBe('arrive');
    // Vstup do metra Můstek z Václavského náměstí u Vodičkovy (asi 540 m od startu).
    const cum = cumulative(path);
    const where = pointAlong(path, entrance!.at, cum);
    expect(haversineMeters(where, { lat: 50.0828, lng: 14.4264 })).toBeLessThan(40);
    // Nástupiště se nehlásí jako ulice.
    expect(ms.some((m) => m.street === 'Můstek')).toBe(false);
    expect(instructionText(entrance!, 60)).toEqual({ headline: 'Za 60 m sejděte do metra', detail: 'Po schodech dolů' });
    expect(instructionText(entrance!, 5).headline).toBe('Sejděte do metra');
    expect(instructionText(elevator!, 5).headline).toBe('Sjeďte výtahem dolů');
  });

  it('bez mapových dat aspoň schody podle plánovače', () => {
    const ms = maneuversFor(path, steps, undefined, { toMetro: true });
    expect(ms.some((m) => m.type === 'stairs-down' && m.note === 'entrance')).toBe(true);
    expect(ms.some((m) => m.type === 'elevator-down')).toBe(true);
  });

  it('přechod u odbočení je jeden pokyn', () => {
    expect(instructionText({ at: 100, type: 'left', crossing: 'zebra' }, 40).headline).toBe('Za 40 m odbočte vlevo a přejděte po přechodu');
    expect(instructionText({ at: 100, type: 'right', crossing: 'signals', crossingFirst: true }, 5).headline).toBe('Přejděte na semaforu a odbočte vpravo');
  });
});

import { dayPhrase, vTime } from '../lib/dates';

describe('Předložka před časem', () => {
  it('„ve“ před dvě, tři, čtyři, dvanáct až čtrnáct a dvacet až dvacet tři', () => {
    const at = (h: number, m = 30) => vTime(new Date(2026, 10, 9, h, m));
    expect(at(9)).toBe('v 9:30');
    expect(at(13)).toBe('ve 13:30');
    expect(at(14, 0)).toBe('ve 14:00');
    expect(at(11)).toBe('v 11:30');
    expect(at(20)).toBe('ve 20:30');
    expect(at(17)).toBe('v 17:30');
    expect(at(3)).toBe('ve 3:30');
  });

  it('den vůči dnešku: dnes, zítra, v pondělí, ve středu', () => {
    const now = new Date(2026, 10, 9, 23, 50); // pondělí 9. 11. 2026
    expect(dayPhrase(new Date(2026, 10, 9, 8, 0), now)).toBe('dnes');
    expect(dayPhrase(new Date(2026, 10, 10, 0, 10), now)).toBe('zítra');
    expect(dayPhrase(new Date(2026, 10, 11, 9, 0), now)).toBe('ve středu');
    expect(dayPhrase(new Date(2026, 10, 16, 9, 0), now)).toBe('v pondělí');
  });
});

import { boardingSentence, buildPhases, spokenInstruction, walkToStopSentence, withMetroEntrances, type WalkPhase } from '../lib/navigation';
import type { MetroStation } from '../lib/metroEntrances';
import type { Itinerary, RideLeg } from '../types';

describe('Navigace: vstupy do metra z dat PID a věty nahlas', () => {
  const stations = (JSON.parse(readFileSync(new URL('../../public/data/metro-entrances.json', import.meta.url), 'utf8')) as { stations: MetroStation[] }).stations;
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/walk-mustek.json', import.meta.url), 'utf8')) as { leg: { legGeometry: { points: string }; steps: Parameters<typeof compactSteps>[0] } };
  const path = decodePolyline(fixture.leg.legGeometry.points, 7);
  const steps = compactSteps(fixture.leg.steps).map((st) => ({ distance: st.d, street: st.s, dir: st.dir, level: st.l, way: st.w }));
  const ride: RideLeg = {
    kind: 'ride', line: 'B', mode: 'metro', headsign: 'Zličín', fromStop: 'Můstek', toStop: 'Jinonice', platform: '1',
    scheduledDeparture: '2026-11-09T08:20:00.000Z', predictedDeparture: '2026-11-09T08:20:00.000Z', scheduledArrival: '2026-11-09T08:35:00.000Z', predictedArrival: '2026-11-09T08:35:00.000Z',
    delaySeconds: 0, isAirConditioned: null, isWheelchairAccessible: null, tripId: 't1', fromCoords: path[path.length - 1], toCoords: { lat: 50.0453, lng: 14.3756 },
  };
  const trip: Itinerary = {
    id: 'x', source: 'transitous', leaveAt: '2026-11-09T08:08:00.000Z', departAt: ride.predictedDeparture, arriveAt: '2026-11-09T08:45:00.000Z', walkToStopMinutes: 12, walkFromStopMinutes: 5, transfers: 0,
    legs: [{ kind: 'walk', minutes: 12, from: 'Opletalova', to: 'Můstek', path, steps, fromCoords: path[0], toCoords: path[path.length - 1] }, ride],
  } as unknown as Itinerary;

  it('Můstek má v datech desítky vstupů a trasa vede vstupem E17 (Václavské náměstí u Vodičkovy)', () => {
    expect(stations.find((s) => s.name === 'Můstek')!.entrances.length).toBeGreaterThan(15);
    const phases = withMetroEntrances(buildPhases(trip, path[0], { name: 'Jinonice', coords: { lat: 50.0453, lng: 14.3756 } }), stations);
    const walk = phases[0] as WalkPhase;
    expect(walk.entrance?.id).toBe('E17');
    const m = walk.maneuvers.find((x) => x.note === 'entrance');
    expect(m?.entranceId).toBe('E17');
    expect(Math.abs((m?.at ?? 0) - walk.entrance!.along)).toBeLessThan(1);
  });

  it('bez tvaru trasy vede přes nejbližší vstup', () => {
    const bare = { ...trip, legs: [{ kind: 'walk', minutes: 12, from: 'Opletalova', to: 'Můstek', fromCoords: path[0], toCoords: path[path.length - 1] }, ride] } as unknown as Itinerary;
    const walk = withMetroEntrances(buildPhases(bare, path[0], { name: 'Jinonice', coords: { lat: 50.0453, lng: 14.3756 } }), stations)[0] as WalkPhase;
    expect(walk.path).toHaveLength(3);
    expect(walk.maneuvers.map((x) => x.type)).toEqual(['depart', 'stairs-down', 'arrive']);
  });

  it('věty nahlas: metry, směr (konečná) a kolej', () => {
    expect(spokenInstruction({ at: 0, type: 'left', street: 'Vodičkova' }, 83)).toBe('Za 80 metrů odbočte vlevo do ulice Vodičkova.');
    expect(spokenInstruction({ at: 0, type: 'crossing', crossing: 'signals' }, 5)).toBe('Přejděte na semaforu.');
    expect(spokenInstruction({ at: 0, type: 'stairs-down', note: 'entrance' }, 60)).toBe('Za 60 metrů sejděte do metra po schodech dolů.');
    expect(spokenInstruction({ at: 0, type: 'right' }, 1240)).toBe('Za 1,2 kilometru odbočte vpravo.');
    expect(walkToStopSentence({ name: 'Můstek', coords: path[0], isStop: true, platform: '1', mode: 'metro' }, ride)).toBe('Jděte do metra Můstek. Metro B směr Zličín odjíždí v 9:20 z koleje 1.');
    expect(boardingSentence(ride, true)).toBe('Jste na nástupišti. Nastupte do metra B směr Zličín, kolej 1. Vystupujete na zastávce Jinonice.');
    const tram: RideLeg = { ...ride, mode: 'tram', line: '22', headsign: 'Nádraží Hostivař', platform: 'A', fromStop: 'Drinopol', toStop: 'Národní divadlo', predictedDeparture: '2026-11-09T12:30:00.000Z' };
    expect(walkToStopSentence({ name: 'Drinopol', coords: path[0], isStop: true, platform: 'A', mode: 'tram' }, tram)).toBe('Jděte na zastávku Drinopol, nástupiště A. Tramvaj 22 směr Nádraží Hostivař odjíždí ve 13:30.');
  });
});

import { maskState } from '../lib/presentationMask';
import { useAppStore as appStore } from '../store/appStore';
import { usePresentationStore } from '../store/presentationStore';

describe('Režim prezentace', () => {
  it('vymyslí popisky, ale nechá časy a strukturu; stejný vstup = stejný výstup', () => {
    const st = appStore.getState();
    const base = {
      ...st,
      subjects: [{ id: 's1', name: 'Tajný předmět', code: 'JSB022', teacher: 'Doc. Skutečný', color: 'indigo', source: 'manual', createdAt: '', updatedAt: '' }],
      events: [
        { id: 'e1', subjectId: 's1', title: 'Tajný předmět – přednáška', start: '2026-11-09T08:30:00.000Z', end: '2026-11-09T10:00:00.000Z', kind: 'lecture', source: 'manual', createdAt: '', updatedAt: '' },
        { id: 'e2', title: 'Rande s Petrou', location: 'Kavárna Slavia', start: '2026-11-09T17:00:00.000Z', end: '2026-11-09T18:00:00.000Z', kind: 'personal', source: 'manual', createdAt: '', updatedAt: '' },
      ],
      tasks: [{ id: 't1', title: 'Koupit dárek mámě', notes: 'soukromé', done: false, source: 'manual', createdAt: '', updatedAt: '' }],
      settings: { ...st.settings, displayName: 'Ondro' },
    } as unknown as ReturnType<typeof appStore.getState>;
    const m = maskState(base);
    expect(maskState(base)).toBe(m);
    expect(m.subjects[0].name).not.toBe('Tajný předmět');
    expect(m.subjects[0].code).not.toBe('JSB022');
    expect(m.events[0].title).toBe(m.subjects[0].name);
    expect(m.events[0].start).toBe(base.events[0].start);
    expect(m.events[1].title).not.toContain('Petr');
    expect(m.events[1].location).not.toContain('Slavia');
    expect(m.tasks[0].title).not.toContain('dárek');
    expect(m.tasks[0].notes).toBeUndefined();
    expect(m.settings.displayName).toBe('');
    expect(base.subjects[0].name).toBe('Tajný předmět');
  });

  it('v režimu prezentace se neukládají změny textů, odškrtnutí ano', () => {
    const id = appStore.getState().addTask({ title: 'Skutečný úkol' } as never);
    usePresentationStore.getState().setMasked(true);
    appStore.getState().updateTask(id, { title: 'Přečíst 3. kapitolu' });
    appStore.getState().toggleTask(id);
    usePresentationStore.getState().setMasked(false);
    const t = appStore.getState().tasks.find((x) => x.id === id)!;
    expect(t.title).toBe('Skutečný úkol');
    expect(t.done).toBe(true);
  });
});
