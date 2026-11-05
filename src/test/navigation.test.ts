import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Itinerary } from '../types';
import { buildPhases, instructionText, maneuversFor, nextManeuver, slackMinutes } from '../lib/navigation';
import { decodePolyline, pathLength, projectOnPath } from '../lib/polyline';

describe('navigace', () => {
  it('dekóduje polyline (přesnost 5 i 7)', () => {
    // Příklad z dokumentace Google (přesnost 5)
    const p = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
    expect(p[0].lat).toBeCloseTo(38.5, 5);
    expect(p[0].lng).toBeCloseTo(-120.2, 5);
    expect(p[2].lat).toBeCloseTo(43.252, 5);
  });

  it('pozná zatáčku vlevo a vpravo a spočítá vzdálenost k ní', () => {
    // 100 m na sever, pak 50 m na západ (vlevo), pak 50 m na sever (vpravo)
    const n = (m: number) => m / 111_320;
    const w = (m: number) => m / (111_320 * Math.cos((50.08 * Math.PI) / 180));
    const path = [
      { lat: 50.08, lng: 14.4 },
      { lat: 50.08 + n(50), lng: 14.4 },
      { lat: 50.08 + n(100), lng: 14.4 },
      { lat: 50.08 + n(100), lng: 14.4 - w(50) },
      { lat: 50.08 + n(150), lng: 14.4 - w(50) },
    ];
    const ms = maneuversFor(path, [{ distance: 100, street: 'Karmelitská' }, { distance: 50, street: 'Tržiště' }, { distance: 50 }]);
    expect(ms.map((m) => m.type)).toEqual(['depart', 'left', 'right', 'arrive']);
    expect(ms[1].street).toBe('Tržiště');
    const { maneuver, distance } = nextManeuver(ms, 20);
    expect(maneuver.type).toBe('left');
    expect(Math.round(distance)).toBeGreaterThan(70);
    expect(instructionText(maneuver, distance).headline).toMatch(/^Za 80 m odboč vlevo$/);
    expect(instructionText(maneuver, 5).headline).toBe('Odboč vlevo do ulice Tržiště');
    const proj = projectOnPath(path, { lat: 50.08 + n(60), lng: 14.4 + w(10) });
    expect(Math.round(proj.along)).toBeGreaterThanOrEqual(58);
    expect(Math.round(proj.offRoute)).toBeLessThanOrEqual(11);
    expect(pathLength(path)).toBeGreaterThan(195);
  });

  it('rezerva: stíhám / nestíhám', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    expect(slackMinutes(270, '2026-11-05T12:06:00Z', now, 1.35)).toBeCloseTo(2.67, 1);
    expect(slackMinutes(900, '2026-11-05T12:06:00Z', now, 1.35)!).toBeLessThan(0);
  });

  it('fáze cesty ze skutečné odpovědi plánovače (pokud je k dispozici)', () => {
    const file = '/tmp/stihnu-nav-fixture.json';
    if (!existsSync(file)) return;
    const it = JSON.parse(readFileSync(file, 'utf8')) as Itinerary;
    const phases = buildPhases(it, { lat: 50.0797, lng: 14.3964 }, { name: 'Hollar', coords: { lat: 50.0838, lng: 14.4136 } });
    expect(phases[0].kind).toBe('walk');
    expect(phases.some((p) => p.kind === 'ride')).toBe(true);
  });
});

import { parseDriveLink } from '../services/google/picker';

describe('odkazy na Google Disk', () => {
  it('pozná složku, dokument, tabulku i soubor', () => {
    expect(parseDriveLink('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing')).toMatchObject({ kind: 'folder', id: '1AbCdEfGhIjKlMnOp' });
    expect(parseDriveLink('https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKlMnOp')).toMatchObject({ kind: 'folder' });
    expect(parseDriveLink('docs.google.com/document/d/1xYz_abcdefghij/edit')).toMatchObject({ kind: 'document', id: '1xYz_abcdefghij' });
    expect(parseDriveLink('https://docs.google.com/spreadsheets/d/1xYz_abcdefghij/edit#gid=0')).toMatchObject({ kind: 'spreadsheet' });
    expect(parseDriveLink('https://drive.google.com/file/d/1xYz_abcdefghij/view')).toMatchObject({ kind: 'file' });
    expect(parseDriveLink('https://example.com/folders/1AbCdEfGhIjKlMnOp')).toBeNull();
    expect(parseDriveLink('nesmysl')).toBeNull();
  });
});
