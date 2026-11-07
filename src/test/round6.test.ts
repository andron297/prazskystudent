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
    expect(instructionText(entrance!, 60)).toEqual({ headline: 'Za 60 m vstup do metra', detail: 'Sejděte po schodech dolů' });
    expect(instructionText(entrance!, 5).headline).toBe('Vstup do metra');
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
