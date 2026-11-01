import { describe, expect, it } from 'vitest';
import { parseDuration, parseIcs, resolveTimeZone, unfoldLines, zonedTimeToUtc } from '../lib/ics';
import { buildIcs, foldIcsLine, googleCalendarUrl } from '../lib/calendarExport';
import { buildIcsImport, detectEventKind, extractSubjectName } from '../lib/icsImport';
import { DEFAULT_BUILDINGS } from '../lib/buildings';

const SIS_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//SIS//Rozvrh//CS',
  'X-WR-CALNAME:Rozvrh SIS',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Prague',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'UID:sis-1@is.cuni.cz',
  'DTSTART;TZID=Europe/Prague:20261006T140000',
  'DTEND;TZID=Europe/Prague:20261006T152000',
  'RRULE:FREQ=WEEKLY;UNTIL=20261231T230000Z;BYDAY=TU',
  'EXDATE;TZID=Europe/Prague:20261103T140000',
  'SUMMARY:JSB065 Analýza mediálních obsahů (seminář)',
  'LOCATION:H212 (Hollar)',
  'DESCRIPTION:Vyučující: Mgr. Tomáš Bureš\\, Ph.D.\\nParalelka 21bJSB065x01',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:sis-1@is.cuni.cz',
  'RECURRENCE-ID;TZID=Europe/Prague:20261110T140000',
  'DTSTART;TZID=Europe/Prague:20261110T160000',
  'DTEND;TZID=Europe/Prague:20261110T172000',
  'SUMMARY:JSB065 Analýza mediálních obsahů (seminář)',
  'LOCATION:J3014',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:sis-2@is.cuni.cz',
  'DTSTART:20261008T073000Z',
  'DURATION:PT1H20M',
  'SUMMARY:Statistika pro sociální vědy – přednáška',
  'LOCATION:Areál Jinonice\\, posluchárna J2017',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:holiday',
  'DTSTART;VALUE=DATE:20261117',
  'DTEND;VALUE=DATE:20261118',
  'SUMMARY:Státní svátek',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const window = { windowStart: new Date('2026-09-01T00:00:00Z'), windowEnd: new Date('2027-01-31T00:00:00Z') };

describe('ICS lexer', () => {
  it('unfolds continuation lines', () => {
    expect(unfoldLines('SUMMARY:Ahoj\r\n  světe\r\nX:1')).toEqual(['SUMMARY:Ahoj světe', 'X:1']);
  });

  it('parses durations', () => {
    expect(parseDuration('PT1H20M')).toBe(80 * 60_000);
    expect(parseDuration('P1D')).toBe(86_400_000);
    expect(parseDuration('P2W')).toBe(14 * 86_400_000);
  });

  it('resolves time zones incl. Windows names', () => {
    expect(resolveTimeZone('Europe/Prague')).toBe('Europe/Prague');
    expect(resolveTimeZone('Central Europe Standard Time')).toBe('Europe/Prague');
    expect(resolveTimeZone('/freeassociation.sourceforge.net/Tzfile/Europe/Prague')).toBe('Europe/Prague');
    expect(resolveTimeZone('Mars/Olympus')).toBeNull();
  });

  it('converts zoned wall time across DST', () => {
    expect(zonedTimeToUtc(2026, 10, 20, 14, 0, 0, 'Europe/Prague').toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(zonedTimeToUtc(2026, 10, 27, 14, 0, 0, 'Europe/Prague').toISOString()).toBe('2026-10-27T13:00:00.000Z');
  });
});

describe('ICS parser', () => {
  const cal = parseIcs(SIS_ICS, window);
  const seminars = cal.events.filter((e) => e.uid === 'sis-1@is.cuni.cz');

  it('reads calendar metadata', () => {
    expect(cal.name).toBe('Rozvrh SIS');
  });

  it('expands weekly RRULE with EXDATE and override', () => {
    // 6. 10. – 29. 12. = 13 úterků, 3. 11. vyjmut → 12
    expect(seminars).toHaveLength(12);
    expect(seminars.some((e) => e.start.toISOString().startsWith('2026-11-03'))).toBe(false);
    const moved = seminars.find((e) => e.start.toISOString().startsWith('2026-11-10'));
    expect(moved?.location).toBe('J3014');
    expect(moved?.start.getHours()).toBe(16);
  });

  it('keeps local wall time across the DST switch', () => {
    const regular = seminars.filter((e) => !e.start.toISOString().startsWith('2026-11-10'));
    for (const e of regular) expect(e.start.getHours()).toBe(14);
    expect(seminars[0].end.getTime() - seminars[0].start.getTime()).toBe(80 * 60_000);
  });

  it('unescapes text and handles DURATION / all-day events', () => {
    const lecture = cal.events.find((e) => e.uid === 'sis-2@is.cuni.cz');
    expect(lecture?.location).toBe('Areál Jinonice, posluchárna J2017');
    expect(lecture && lecture.end.getTime() - lecture.start.getTime()).toBe(80 * 60_000);
    const holiday = cal.events.find((e) => e.uid === 'holiday');
    expect(holiday?.allDay).toBe(true);
    expect(seminars[0].description).toContain('Bureš, Ph.D.');
  });

  it('rejects non-calendar input', () => {
    expect(() => parseIcs('<html>nope</html>')).toThrow();
  });
});

describe('ICS → rozvrh', () => {
  it('maps subjects, kinds, rooms and buildings', () => {
    const cal = parseIcs(SIS_ICS, window);
    const preview = buildIcsImport(cal, {
      subjects: [],
      buildings: DEFAULT_BUILDINGS,
      aliases: {},
      source: 'sis',
      now: new Date('2026-10-05T12:00:00Z'),
    });
    expect(preview.newSubjects.map((s) => s.code ?? s.name).sort()).toEqual(['JSB065', 'Statistika pro sociální vědy']);
    const seminar = preview.events.find((e) => e.room === 'H212');
    expect(seminar?.buildingId).toBe('hollar');
    expect(seminar?.kind).toBe('seminar');
    const moved = preview.events.find((e) => e.room === 'J3014');
    expect(moved?.buildingId).toBe('jinonice');
    const lecture = preview.events.find((e) => e.title.startsWith('Statistika'));
    expect(lecture?.buildingId).toBe('jinonice');
    expect(lecture?.kind).toBe('lecture');
    expect(preview.skipped).toBeGreaterThanOrEqual(1);
  });

  it('extracts clean subject names', () => {
    expect(extractSubjectName('JSB065 Analýza mediálních obsahů (seminář)', 'JSB065')).toBe('Analýza mediálních obsahů');
    expect(extractSubjectName('Statistika pro sociální vědy – přednáška')).toBe('Statistika pro sociální vědy');
    expect(detectEventKind('Úvod do studia (přednáška)')).toBe('lecture');
    expect(detectEventKind('Zápočtový test')).toBe('exam');
  });
});

describe('ICS export', () => {
  it('folds long lines at 75 octets', () => {
    const line = `DESCRIPTION:${'Příliš žluťoučký kůň úpěl ďábelské ódy. '.repeat(4)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('builds a round-trippable calendar with alarms', () => {
    const text = buildIcs(
      [
        { id: 'a', title: 'Seminární práce; verze 1', start: new Date('2026-11-04T22:29:00Z'), end: new Date('2026-11-04T22:59:00Z'), allDay: false },
        { id: 'b', title: 'Zkouškové období', start: new Date(2027, 0, 11), end: new Date(2027, 1, 19), allDay: true },
      ],
      { calendarName: 'Stihnu', reminders: [1440, 120] },
    );
    expect(text).toContain('TRIGGER:-PT1440M');
    expect(text).toContain('DTEND;VALUE=DATE:20270220');
    const parsed = parseIcs(text, window);
    expect(parsed.events.find((e) => e.uid === 'a@stihnu.app')?.summary).toBe('Seminární práce; verze 1');
  });

  it('creates Google Calendar template links', () => {
    const url = googleCalendarUrl({ id: 'x', title: 'Test', start: new Date('2026-11-12T08:40:00Z'), allDay: false });
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20261112T084000Z%2F20261112T094000Z');
  });
});
