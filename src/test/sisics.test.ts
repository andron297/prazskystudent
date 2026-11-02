import { describe, expect, it } from 'vitest';
import { parseIcs } from '../lib/ics';
import { buildIcsImport, sisKindFromUid } from '../lib/icsImport';
import { DEFAULT_BUILDINGS } from '../lib/buildings';
import { isTransitTarget } from '../store/selectors';

// Stejný tvar jako export z SIS Rozvrh NG (jména jsou vymyšlená).
const ev = (uid: string, start: string, end: string, location: string, summary: string, desc: string) =>
  ['BEGIN:VEVENT', `DTSTART:${start}`, `DTEND:${end}`, 'DTSTAMP:20261102T113000Z', `UID:${uid}@11230`, `LOCATION:${location}`, 'STATUS:CONFIRMED', `SUMMARY:${summary}`, `DESCRIPTION:${desc}`, 'TRANSP:OPAQUE', 'END:VEVENT'];

const SIS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Erudio//SIS - RozvrhNG//EN',
  ...ev('26aJKB064p1_2461320', '20261109T133000Z', '20261109T145000Z', 'H215 (Smetanovo nábřeží 6\\, 11001 Praha 1)', 'Žurnalistická tvorba I - přednáška - Nováková Jana\\, doc. PhDr.', 'Žurnalistická tvorba I - přednáška\\nNováková Jana\\, doc. PhDr.\\nH215 15:30 JKB064 '),
  ...ev('26aJKB076x01_2461321', '20261110T070000Z', '20261110T082000Z', 'H012 (Smetanovo nábřeží 6\\, 11001 Praha 1)', 'Žurnalistická tvorba I - seminář psaní C - Novák Petr\\, Mgr.\\, Ph.D.', 'Žurnalistická tvorba I - seminář psaní C\\nNovák Petr\\, Mgr.\\, Ph.D.\\nH012 8:00 JKB076 '),
  ...ev('26aJKB007x01_2461322', '20261111T110000Z', '20261111T122000Z', 'C117 (U Kříže 8\\, 15800 Praha)', 'Sociální psychologie - Dvořák Marek\\, Mgr. Ing.\\, Ph.D.', 'Sociální psychologie\\nDvořák Marek\\, Mgr. Ing.\\, Ph.D.\\nC117 12:00 JKB007 '),
  ...ev('26aJUPZ001x02b_2461365', '20261112T083000Z', '20261112T095000Z', 'JONLINE (Výuka probíhá online)', 'Úvod práce se zdroji na FSV UK - Malá Irena\\, PhDr.\\, Ph.D.', 'Úvod práce se zdroji na FSV UK \\nMalá Irena\\, PhDr.\\, Ph.D.\\nJONLINE 9:30 JUPZ001 '),
  'END:VCALENDAR',
].join('\r\n');

describe('rozvrh ze SISu (soubor z Rozvrhu NG)', () => {
  const now = new Date(2026, 10, 2, 12);
  const p = buildIcsImport(parseIcs(SIS), { subjects: [], buildings: DEFAULT_BUILDINGS, aliases: {}, source: 'sis', now });

  it('druh výuky z UID (p = přednáška, x = seminář)', () => {
    expect(sisKindFromUid('26aJKB064p1_2461320@11230')).toBe('lecture');
    expect(sisKindFromUid('26aJUPZ001x02b_2461365@11230')).toBe('seminar');
    expect(sisKindFromUid('abc')).toBeNull();
    expect(p.events.map((e) => e.kind)).toEqual(['lecture', 'seminar', 'seminar', 'seminar']);
  });

  it('předměty s různým kódem zůstanou oddělené, název bez vyučujících', () => {
    expect(p.newSubjects.map((s) => `${s.code} ${s.name}`)).toEqual([
      'JKB064 Žurnalistická tvorba I',
      'JKB076 Žurnalistická tvorba I - seminář psaní C',
      'JKB007 Sociální psychologie',
      'JUPZ001 Úvod práce se zdroji na FSV UK',
    ]);
    expect(p.events[0]).toMatchObject({ title: 'Žurnalistická tvorba I - přednáška', teacher: 'Nováková Jana, doc. PhDr.', buildingId: 'hollar', room: 'H215' });
    expect(p.events[2]).toMatchObject({ buildingId: 'jinonice', room: 'C117' });
  });

  it('online výuka: bez budovy, bez cesty MHD, není „neznámé místo“', () => {
    const online = p.events[3];
    expect(online).toMatchObject({ online: true, location: 'Online', buildingId: undefined });
    expect(isTransitTarget(online)).toBe(false);
    expect(p.unresolvedLocations).toEqual([]);
  });
});
