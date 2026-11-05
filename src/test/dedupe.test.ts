import { describe, expect, it } from 'vitest';
import type { ScheduleEvent, Subject } from '../types';
import { classesInOwnCalendar, dedupeEvents, duplicateSubjects, similarTitles } from '../lib/dedupe';

const ev = (id: string, title: string, start: string, end: string, extra: Partial<ScheduleEvent> = {}): ScheduleEvent => ({ id, title, kind: 'seminar', start, end, source: 'sis', ...extra });
const subj = (id: string, name: string, extra: Partial<Subject> = {}): Subject => ({ id, name, color: 'indigo', source: 'sis', createdAt: '', ...extra });

describe('zdvojené hodiny a předměty', () => {
  it('podobné názvy včetně zkratek', () => {
    expect(similarTitles('Sociální psychologie', 'Soc. psychologie (seminář)')).toBe(true);
    expect(similarTitles('Sociální psychologie', 'Metodologie sociálních věd')).toBe(false);
    expect(similarTitles('Žurnalistická tvorba I - přednáška', 'Žurnalistická tvorba I')).toBe(true);
    expect(similarTitles('Statistika I', 'Statistika II')).toBe(false);
  });

  it('stejná hodina ze SISu i z vlastního kalendáře → jen ta obsáhlejší, doplněná', () => {
    const sis = ev('a', 'Sociální psychologie', '2026-11-11T11:00:00Z', '2026-11-11T12:20:00Z', { subjectId: 's1', room: 'C117', buildingId: 'jinonice' });
    const mine = ev('b', 'Soc. psychologie', '2026-11-11T11:00:00Z', '2026-11-11T12:20:00Z', { source: 'google', notes: 'vzít knihu', google: { calendarId: 'x', eventId: 'y', readOnly: true } });
    const other = ev('c', 'Metodologie', '2026-11-11T11:00:00Z', '2026-11-11T12:20:00Z', { subjectId: 's2' });
    const out = dedupeEvents([mine, sis, other], [subj('s1', 'Sociální psychologie'), subj('s2', 'Metodologie sociálních věd')]);
    expect(out.map((e) => e.id).sort()).toEqual(['a', 'c']);
    expect(out.find((e) => e.id === 'a')).toMatchObject({ room: 'C117', notes: 'vzít knihu' });
  });

  it('jiný čas = jiná hodina', () => {
    const a = ev('a', 'Sociální psychologie', '2026-11-11T11:00:00Z', '2026-11-11T12:20:00Z');
    const b = ev('b', 'Sociální psychologie', '2026-11-11T13:00:00Z', '2026-11-11T14:20:00Z');
    expect(dedupeEvents([a, b])).toHaveLength(2);
  });

  it('zdvojený předmět: ponechá ten s kódem, různé kódy nechá být', () => {
    const list = duplicateSubjects([
      subj('sis', 'Sociální psychologie', { code: 'JKB007' }),
      subj('g', 'Sociální psychologie - seminář', { source: 'google' }),
      subj('m', 'sociální psychologie', { source: 'moodle' }),
      subj('j064', 'Žurnalistická tvorba I', { code: 'JKB064' }),
      subj('j076', 'Žurnalistická tvorba I - seminář psaní C', { code: 'JKB076' }),
      subj('st1', 'Statistika I'),
      subj('st2', 'Statistika II'),
    ]);
    expect(list.map((d) => [d.drop.id, d.keep.id, d.confidence])).toEqual([
      ['g', 'sis', 'maybe'],
      ['m', 'sis', 'sure'],
    ]);
  });

  it('hodina, kterou student má ve vlastním kalendáři, se do Googlu znovu nezapisuje', () => {
    const sis = ev('a', 'Sociální psychologie', '2026-11-11T11:00:00Z', '2026-11-11T12:20:00Z', { subjectId: 's1' });
    const sis2 = ev('b', 'Metodologie', '2026-11-11T13:00:00Z', '2026-11-11T14:20:00Z', { subjectId: 's2' });
    const mine = ev('g', 'Soc. psychologie', '2026-11-11T11:00:00Z', '2026-11-11T12:20:00Z', { source: 'google', kind: 'personal' });
    const set = classesInOwnCalendar([sis, sis2, mine], [subj('s1', 'Sociální psychologie'), subj('s2', 'Metodologie sociálních věd')]);
    expect([...set]).toEqual(['a']);
  });
});
