import { describe, expect, it } from 'vitest';
import type { Requirement, Subject, Task } from '../types';
import { parseIcs } from '../lib/ics';
import { buildMoodleIcsImport, classifyMoodleSummary, isMoodleCalendarUrl } from '../lib/moodleIcs';
import { commuteWindows, parseOpenMeteo, simulateForecast, weatherAdvice, type HourlyWeather, type WeatherForecast } from '../lib/weather';
import { decodeStops, nearbyStops, searchStops, type RawStopsFile } from '../lib/stops';
import stopsJson from '../../public/data/stops-praha.json';
import { detectSisPage, parseSisExams, parseSisPage, sisBookmarklet } from '../lib/sisImport';
import { buildSnapshot, mergeSnapshots, type SnapshotData } from '../lib/sync/driveState';
import { keyOf, parseKey, pruneTombstones } from '../lib/sync/keys';

const NOW = new Date(2026, 10, 1, 13, 5);

/* ------------------------------------------------------------------ */
/* Počasí                                                              */
/* ------------------------------------------------------------------ */

function forecastWith(fn: (hour: number) => Partial<HourlyWeather>): WeatherForecast {
  const hourly: HourlyWeather[] = Array.from({ length: 48 }, (_, i) => {
    const time = new Date(2026, 10, 1, i);
    return { time, temp: 8, feels: 6, precipProb: 5, precip: 0, code: 2, wind: 10, gusts: 20, uv: 1, isDay: i % 24 > 7 && i % 24 < 17, ...fn(i % 24) };
  });
  return { fetchedAt: NOW.toISOString(), source: 'simulated', location: { lat: 50.08, lng: 14.42 }, current: { time: NOW, temp: 8, feels: 6, code: 2, wind: 10, isDay: true }, hourly, daily: [] };
}

const lessons = [
  { start: new Date(2026, 10, 1, 14, 0).toISOString(), end: new Date(2026, 10, 1, 15, 30).toISOString(), kind: 'seminar' },
  { start: new Date(2026, 10, 1, 15, 45).toISOString(), end: new Date(2026, 10, 1, 17, 15).toISOString(), kind: 'lecture' },
];

describe('počasí a rada na cestu', () => {
  it('okna cest podle rozvrhu (tam / zpět)', () => {
    const plan = commuteWindows(lessons, NOW, { leaveAt: new Date(2026, 10, 1, 13, 21) });
    expect(plan.day).toBe('today');
    expect(plan.windows.map((w) => [w.kind, w.from.getHours() * 60 + w.from.getMinutes(), w.to.getHours() * 60 + w.to.getMinutes()])).toEqual([
      ['to', 13 * 60 + 21, 14 * 60],
      ['back', 17 * 60 + 15, 17 * 60 + 55],
    ]);
    // Po skončení výuky se plánuje zítřek
    expect(commuteWindows(lessons, new Date(2026, 10, 1, 18)).day).toBe('none');
  });

  it('déšť při cestě zpět → deštník a konkrétní čas', () => {
    const f = forecastWith((h) => (h >= 17 && h <= 18 ? { precipProb: 75, precip: 1.1, code: 80 } : {}));
    const advice = weatherAdvice(f, commuteWindows(lessons, NOW), NOW);
    expect(advice.umbrella).toBe(true);
    expect(advice.headline).toBe('Deštník na cestu zpět – kolem 17:15 začne pršet');
    expect(advice.commutes.find((c) => c.window.kind === 'to')!.wet).toBe(false);
    expect(advice.outfit.map((o) => o.id)).toContain('umbrella');
  });

  it('oblečení podle pocitové teploty a citlivosti na zimu', () => {
    const cold = weatherAdvice(forecastWith(() => ({ temp: 1, feels: -2 })), commuteWindows(lessons, NOW), NOW);
    expect(cold.level).toBe('cold');
    expect(cold.outfit.map((o) => o.id)).toEqual(expect.arrayContaining(['winter-jacket', 'hat', 'gloves']));
    const mild = weatherAdvice(forecastWith(() => ({ temp: 13, feels: 12 })), commuteWindows(lessons, NOW), NOW, 'normal');
    expect(mild.level).toBe('mild');
    const sensitive = weatherAdvice(forecastWith(() => ({ temp: 13, feels: 12 })), commuteWindows(lessons, NOW), NOW, 'cold');
    expect(sensitive.level).toBe('cool');
  });

  it('silný vítr: místo deštníku kapuce', () => {
    const f = forecastWith((h) => (h >= 13 ? { precipProb: 80, precip: 2, code: 63, gusts: 65 } : {}));
    const advice = weatherAdvice(f, commuteWindows(lessons, NOW), NOW);
    expect(advice.outfit.map((o) => o.id)).toContain('raincoat');
    expect(advice.outfit.map((o) => o.id)).not.toContain('umbrella');
  });

  it('převod odpovědi Open-Meteo (unixtime)', () => {
    const t0 = Math.floor(new Date(2026, 10, 1, 0).getTime() / 1000);
    const raw = {
      current: { time: t0 + 13 * 3600, temperature_2m: 9.4, apparent_temperature: 7.1, weather_code: 3, wind_speed_10m: 12, is_day: 1 },
      hourly: {
        time: [t0, t0 + 3600],
        temperature_2m: [5, 4.5],
        apparent_temperature: [3, 2.5],
        precipitation_probability: [10, null],
        precipitation: [0, 0.2],
        weather_code: [3, 61],
        wind_speed_10m: [8, 9],
        wind_gusts_10m: [15, 18],
        uv_index: [0, 0],
        is_day: [0, 0],
      },
      daily: { time: [t0], temperature_2m_max: [11], temperature_2m_min: [3], weather_code: [61], precipitation_probability_max: [70], precipitation_sum: [2.1], sunrise: [t0 + 6.9 * 3600], sunset: [t0 + 16.6 * 3600], uv_index_max: [1.2] },
    };
    const f = parseOpenMeteo(raw, { lat: 50.08, lng: 14.42 }, NOW);
    expect(f.current).toMatchObject({ temp: 9.4, feels: 7.1, code: 3 });
    expect(f.hourly[1]).toMatchObject({ precipProb: 0, precip: 0.2, code: 61 });
    expect(f.daily[0]).toMatchObject({ date: '2026-11-01', max: 11, min: 3, precipProbMax: 70 });
  });

  it('simulace je deterministická a má odpolední přeháňku', () => {
    const a = simulateForecast(NOW, { lat: 50.08, lng: 14.42 });
    const b = simulateForecast(NOW, { lat: 50.08, lng: 14.42 });
    expect(a.hourly).toHaveLength(72);
    expect(a.hourly.map((h) => h.temp)).toEqual(b.hourly.map((h) => h.temp));
    expect(a.hourly.slice(14, 21).some((h) => h.precipProb >= 60)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Moodle přes export kalendáře                                        */
/* ------------------------------------------------------------------ */

const MOODLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024042200//EN
BEGIN:VEVENT
UID:10101@dl1.cuni.cz
SUMMARY:Esej: Mediální gramotnost is due
DESCRIPTION:Odevzdejte esej v rozsahu 8–10 normostran.
CLASS:PUBLIC
LAST-MODIFIED:20261020T101010Z
DTSTAMP:20261101T120000Z
DTSTART:20261105T225900Z
DTEND:20261105T225900Z
CATEGORIES:JSB012 Úvod do mediálních studií
END:VEVENT
BEGIN:VEVENT
UID:10102@dl1.cuni.cz
SUMMARY:Průběžný test 2 opens
DTSTAMP:20261101T120000Z
DTSTART:20261110T080000Z
DTEND:20261110T080000Z
CATEGORIES:JSB065 Statistika pro sociální vědy
END:VEVENT
BEGIN:VEVENT
UID:10103@dl1.cuni.cz
SUMMARY:Průběžný test 2 closes
DTSTAMP:20261101T120000Z
DTSTART:20261112T220000Z
DTEND:20261112T220000Z
CATEGORIES:JSB065 Statistika pro sociální vědy
END:VEVENT
BEGIN:VEVENT
UID:10104@dl1.cuni.cz
SUMMARY:Termín odevzdání: Analýza titulní strany
DTSTAMP:20261101T120000Z
DTSTART:20261118T225900Z
DTEND:20261118T225900Z
CATEGORIES:Mediální analýza
END:VEVENT
BEGIN:VEVENT
UID:10105@dl1.cuni.cz
SUMMARY:Přednáška hosta (aula)
DTSTAMP:20261101T120000Z
DTSTART:20261104T150000Z
DTEND:20261104T163000Z
CATEGORIES:JSB012 Úvod do mediálních studií
END:VEVENT
END:VCALENDAR`;

describe('Moodle kalendář (bez tokenu)', () => {
  it('rozpozná termíny v češtině i angličtině', () => {
    expect(classifyMoodleSummary('Esej is due')).toEqual({ action: 'deadline', title: 'Esej' });
    expect(classifyMoodleSummary('Kvíz 3 opens')).toEqual({ action: 'open', title: 'Kvíz 3' });
    expect(classifyMoodleSummary('Termín odevzdání: Reflexe')).toEqual({ action: 'deadline', title: 'Reflexe' });
    expect(classifyMoodleSummary('Úkol 2 is due to be graded').action).toBe('grading');
    expect(isMoodleCalendarUrl('https://dl1.cuni.cz/calendar/export_execute.php?userid=123&authtoken=abc&preset_what=all&preset_time=recentupcoming')).toBe(true);
    expect(isMoodleCalendarUrl('https://dl1.cuni.cz/rss/file.php/1/abc/mod_forum/2/rss.xml')).toBe(false);
  });

  it('vytvoří povinnosti jen k předmětům z rozvrhu SIS – kurzy mimo rozvrh, otevírání a přednášky přeskočí', () => {
    const subjects: Subject[] = [{ id: 's1', code: 'JSB012', name: 'Úvod do mediálních studií', color: 'indigo', source: 'sis', createdAt: NOW.toISOString() }];
    const result = buildMoodleIcsImport(parseIcs(MOODLE_ICS, { windowStart: new Date(2026, 9, 1), windowEnd: new Date(2027, 1, 1) }), { subjects, requirements: [], now: NOW });
    // Moodle nikdy nezakládá nové předměty – závazný je rozvrh SIS.
    expect(result.newSubjects).toHaveLength(0);
    expect(result.requirements.every((r) => r.subjectId === 's1')).toBe(true);
    const essay = result.requirements.find((r) => r.title === 'Esej: Mediální gramotnost')!;
    expect(essay).toMatchObject({ subjectId: 's1', type: 'assignment', source: 'moodle', externalId: 'moodle-ics:10101@dl1.cuni.cz' });
    expect(essay.deadline).toBe('2026-11-05T22:59:00.000Z');
    expect(result.created).toBe(result.requirements.length);

    // Opakovaný import zachová odškrtnutí a nic nového nevytvoří
    const done: Requirement[] = result.requirements.map((r) => ({ ...r, done: true }));
    const again = buildMoodleIcsImport(parseIcs(MOODLE_ICS, { windowStart: new Date(2026, 9, 1), windowEnd: new Date(2027, 1, 1) }), { subjects, requirements: done, now: NOW });
    expect(again.created).toBe(0);
    expect(again.updated).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Zastávky PID                                                        */
/* ------------------------------------------------------------------ */

describe('zastávky PID', () => {
  const raw = stopsJson as unknown as RawStopsFile;
  const stops = decodeStops(raw);

  it('dataset obsahuje pražské zastávky se směry linek', () => {
    expect(stops.length).toBeGreaterThan(1200);
    const drinopol = stops.find((s) => s.name === 'Drinopol')!;
    expect(drinopol.mainMode).toBe('tram');
    expect(drinopol.lines.map((l) => l.name)).toContain('22');
    const directions = drinopol.platforms.flatMap((p) => p.serves.filter((x) => x.line === '22').map((x) => x.direction));
    expect(directions).toEqual(expect.arrayContaining(['Bílá Hora', 'Nádraží Hostivař']));
  });

  it('nejbližší zastávky od koleje Kajetánka a hledání bez diakritiky', () => {
    const near = nearbyStops(stops, { lat: 50.0862, lng: 14.3712 }, { maxMeters: 600 });
    expect(near[0].walkMinutes).toBeLessThanOrEqual(5);
    expect(near.map((s) => s.name)).toEqual(expect.arrayContaining(['Drinopol']));
    expect(searchStops(stops, 'narodni div')[0].name).toBe('Národní divadlo');
    expect(searchStops(stops, 'malostr').map((s) => s.name)).toEqual(expect.arrayContaining(['Malostranská', 'Malostranské náměstí']));
  });
});

/* ------------------------------------------------------------------ */
/* SIS                                                                  */
/* ------------------------------------------------------------------ */

const SIS_SYLLABUS = `Úvod do mediálních studií - JSB012
Anglický název: Introduction to Media Studies
Zajišťuje: Katedra mediálních studií (23-KMS)
Fakulta: Fakulta sociálních věd
Platnost: od 2019
Semestr: zimní
E-Kredity: 6
Rozsah, examinace: zimní s.:2/2, Z+Zk [HT]
Jazyk výuky: čeština (cs)
Garant: doc. PhDr. Jan Novák, Ph.D.
Vyučující: Mgr. Petra Dvořáková, doc. PhDr. Jan Novák, Ph.D.
Anotace -
Kurz uvádí do základních pojmů a teorií mediálních studií.
Poslední úprava: Mgr. Petra Dvořáková (12.09.2026)
The course introduces basic concepts of media studies.
Poslední úprava: Mgr. Petra Dvořáková (12.09.2026)
Literatura -
McQuail, D. (2010). Mass Communication Theory.
Podmínky zakončení předmětu -
Esej (30 %), průběžné testy (20 %), závěrečná zkouška (50 %).
Sylabus -
1. Co jsou média
2. Mediální instituce
Klíčová slova -
média`;

const SIS_EXAMS = `Termíny zkoušek - přihlašování
Předmět Termín Místnost Zkoušející Kapacita
JSB012 Úvod do mediálních studií 12.01.2027 09:00 H210 doc. PhDr. Jan Novák, Ph.D. 12/30 přihlášen
JSB012 Úvod do mediálních studií 19.01.2027 09:00 H210 doc. PhDr. Jan Novák, Ph.D. 5/30
JSB065 Statistika pro sociální vědy 15.01.2027 13:00 J3093 Mgr. Karel Malý 20/40`;

describe('import ze SISu', () => {
  it('sylabus předmětu', () => {
    expect(detectSisPage(SIS_SYLLABUS)).toBe('syllabus');
    const r = parseSisPage(SIS_SYLLABUS, 'https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=JSB012', NOW);
    expect(r.subject).toMatchObject({ code: 'JSB012', name: 'Úvod do mediálních studií' });
    const s = r.subject!.syllabus;
    expect(s).toMatchObject({ credits: 6, completion: 'Z+Zk', guarantor: 'doc. PhDr. Jan Novák, Ph.D.', semester: 'zimní' });
    expect(s.annotation).toBe('Kurz uvádí do základních pojmů a teorií mediálních studií.');
    expect(s.requirements).toContain('Esej (30 %)');
    expect(s.syllabus).toBe('1. Co jsou média\n2. Mediální instituce');
    expect(s.literature).toContain('McQuail');
    expect(s.teachers).toEqual(['Mgr. Petra Dvořáková', 'doc. PhDr. Jan Novák, Ph.D.']);
  });

  it('skutečná struktura stránky SISu (popisek a hodnota na samostatných řádcích)', () => {
    const real = [
      'Popis předmětu',
      'Platformy žurnalistiky v kyberprostoru - JKB096',
      'Anglický název:',
      'Platforms of Journalism in Cyberspace',
      'Semestr:',
      'zimní',
      'E-Kredity:',
      '3',
      'Rozsah, examinace:',
      'zimní s.:1/1, Z [HT]',
      'Jazyk výuky:',
      'čeština',
      'Garant:',
      'PhDr. Mgr. Bc. Jan Jirků, Ph.D.',
      'Mgr. Barbora Součková',
      'Vyučující:',
      'PhDr. Mgr. Bc. Jan Jirků, Ph.D.',
      'Mgr. Barbora Součková',
      'Rozvrh ZS Nástěnka',
      'Anotace -',
      '---češtinaangličtina',
      'Cílem předmětu je poskytnout přehled o platformách.',
      'Poslední úprava: Jirků Jan (26.11.2019)',
      'The aim of the course is to provide an overview.',
      'Poslední úprava: Jirků Jan (26.11.2019)',
      'Podmínky zakončení předmětu',
      'Kurz je zakončen zápočtem. Pro získání zápočtu je zapotřebí splnit seminární úkol.',
      'Seminární úkol spočívá ve skupinové třicetiminutové multimediální prezentaci.',
      'Poslední úprava: Jirků Jan (14.09.2026)',
      'Literatura',
      'DEUZE, Mark. Media Work. Cambridge: Polity, 2007.',
    ].join('\n');
    const r = parseSisPage(real, 'https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=JKB096', NOW);
    expect(r.kind).toBe('syllabus');
    expect(r.subject).toMatchObject({ code: 'JKB096', name: 'Platformy žurnalistiky v kyberprostoru' });
    const s = r.subject!.syllabus;
    expect(s).toMatchObject({ credits: 3, completion: 'Z', semester: 'zimní', language: 'čeština', guarantor: 'PhDr. Mgr. Bc. Jan Jirků, Ph.D.' });
    expect(s.teachers).toEqual(['PhDr. Mgr. Bc. Jan Jirků, Ph.D.', 'Mgr. Barbora Součková']);
    expect(s.annotation).toBe('Cílem předmětu je poskytnout přehled o platformách.');
    expect(s.requirements).toContain('skupinové třicetiminutové multimediální prezentaci');
    expect(s.requirements).not.toContain('Poslední úprava');
    expect(s.literature).toContain('DEUZE');
  });

  it('termíny zkoušek', () => {
    expect(detectSisPage(SIS_EXAMS)).toBe('exams');
    const exams = parseSisExams(SIS_EXAMS);
    expect(exams).toHaveLength(3);
    expect(exams[0]).toMatchObject({ code: 'JSB012', room: 'H210', registered: true });
    expect(exams[0].start.getHours()).toBe(9);
    expect(exams[1].registered).toBe(false);
    expect(exams[2]).toMatchObject({ code: 'JSB065', room: 'J3093' });
  });

  it('záložka posílá data jen do aplikace', () => {
    const js = decodeURIComponent(sisBookmarklet('https://prazskystudent.vercel.app').slice('javascript:'.length));
    expect(js).toContain("w.postMessage(d,a)");
    expect(js).toContain("var a='https://prazskystudent.vercel.app'");
  });
});

/* ------------------------------------------------------------------ */
/* Disk: slučování dat mezi zařízeními                                 */
/* ------------------------------------------------------------------ */

describe('synchronizace dat přes Google Disk', () => {
  const task = (id: string, title: string, updatedAt: string, extra: Partial<Task> = {}): Task => ({ id, title, done: false, source: 'manual', createdAt: '2026-10-01T10:00:00.000Z', updatedAt, ...extra });
  const base = (tasks: Task[], tombstones: Record<string, string> = {}): SnapshotData => ({ subjects: [], events: [], requirements: [], tasks, materials: [], milestones: [], tombstones });

  it('novější změna vyhrává, nové položky se sloučí', () => {
    const local = base([task('a', 'Lokální verze', '2026-11-01T10:00:00.000Z'), task('b', 'Jen tady', '2026-11-01T09:00:00.000Z')]);
    const remote = base([task('a', 'Novější z mobilu', '2026-11-01T11:00:00.000Z'), task('c', 'Jen v mobilu', '2026-11-01T08:00:00.000Z')]);
    const out = mergeSnapshots(local, remote);
    expect(out.merged.tasks.map((t) => t.title).sort()).toEqual(['Jen tady', 'Jen v mobilu', 'Novější z mobilu']);
    expect(out.changedLocal).toBe(true);
    expect(out.changedRemote).toBe(true);
  });

  it('smazání na jednom zařízení se promítne na druhé, pozdější úprava ho přebije', () => {
    const local = base([task('a', 'Úkol', '2026-11-01T10:00:00.000Z'), task('b', 'Upraven po smazání', '2026-11-01T12:00:00.000Z')]);
    const remote = base([], { [keyOf.task('a')]: '2026-11-01T11:00:00.000Z', [keyOf.task('b')]: '2026-11-01T11:00:00.000Z' });
    const out = mergeSnapshots(local, remote);
    expect(out.merged.tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('snímek nevynáší ukázková data ani zrcadla kalendářů', () => {
    const snap = buildSnapshot(
      {
        ...base([task('a', 'Moje', '2026-11-01T10:00:00.000Z'), task('d', 'Demo', '2026-11-01T10:00:00.000Z', { demo: true })]),
        events: [{ id: 'g', title: 'Svátek', kind: 'personal', start: '2026-11-17', end: '2026-11-18', source: 'google', google: { calendarId: 'x', eventId: 'y', readOnly: true } }],
      },
      'device-1',
      NOW,
    );
    expect(snap.data.tasks.map((t) => t.id)).toEqual(['a']);
    expect(snap.data.events).toHaveLength(0);
    expect(mergeSnapshots(snap.data, snap.data)).toMatchObject({ changedLocal: false, changedRemote: false });
  });

  it('klíče a čištění tombstones', () => {
    expect(parseKey(keyOf.sub('r1', 'st2'))).toEqual({ type: 'sub', parentId: 'r1', id: 'st2' });
    expect(parseKey('event:evt_1')).toEqual({ type: 'event', id: 'evt_1' });
    expect(Object.keys(pruneTombstones({ a: '2026-01-01T00:00:00.000Z', b: '2026-10-30T00:00:00.000Z' }, NOW))).toEqual(['b']);
  });
});
