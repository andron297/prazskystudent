import { describe, expect, it } from 'vitest';
import { parseScheduleText } from '../lib/scheduleTextParser';

const HARMONOGRAM = `Harmonogram akademického roku 2026/2027
Zápis předmětů (1. kolo): 7. 9. – 20. 9. 2026
Zahájení akademického roku: 1. 10. 2026
Výuka v zimním semestru\t28. 9. 2026 – 8. 1. 2027
Škrtání předmětů do 18. 10. 2026
Děkanský den (výuka se nekoná): st 25. 11. 2026
Vánoční prázdniny: 21. 12. 2026 – 3. 1. 2027
Zkouškové období ZS: 11. 1. – 19. 2. 2027
Výuka v letním semestru: 22. 2. – 28. 5. 2027
Rektorský den: 12. května 2027
Zkouškové období LS: 31. 5. – 30. 9.
Mezní termín pro splnění studijních povinností: 30. 9.`;

describe('parser harmonogramu', () => {
  const result = parseScheduleText(HARMONOGRAM, { mode: 'harmonogram', referenceDate: new Date(2026, 10, 1) });
  const byTitle = (t: string) => result.items.find((i) => i.title.startsWith(t));

  it('detects academic year', () => {
    expect(result.academicYearStart).toBe(2026);
    expect(result.detectedYear).toBe(true);
  });

  it('parses ranges across years', () => {
    expect(byTitle('Zápis předmětů')).toMatchObject({ start: '2026-09-07', end: '2026-09-20', category: 'enrollment' });
    expect(byTitle('Výuka v zimním')).toMatchObject({ start: '2026-09-28', end: '2027-01-08', category: 'teaching' });
    expect(byTitle('Vánoční prázdniny')).toMatchObject({ start: '2026-12-21', end: '2027-01-03', category: 'holiday' });
    expect(byTitle('Zkouškové období ZS')).toMatchObject({ start: '2027-01-11', end: '2027-02-19', category: 'exam-period' });
    expect(byTitle('Zkouškové období LS')).toMatchObject({ start: '2027-05-31', end: '2027-09-30', category: 'exam-period' });
  });

  it('parses single dates, deadlines and Czech month names', () => {
    expect(byTitle('Škrtání předmětů')).toMatchObject({ start: '2026-10-18', isDeadline: true });
    expect(byTitle('Děkanský den')).toMatchObject({ start: '2026-11-25', category: 'holiday' });
    expect(byTitle('Děkanský den')?.title).toBe('Děkanský den (výuka se nekoná)');
    expect(byTitle('Rektorský den')).toMatchObject({ start: '2027-05-12', category: 'holiday' });
    expect(byTitle('Mezní termín')).toMatchObject({ start: '2027-09-30', category: 'deadline' });
    expect(byTitle('Zahájení akademického roku')).toMatchObject({ start: '2026-10-01', category: 'semester' });
  });

  it('selects confident items by default', () => {
    expect(result.items.length).toBe(11);
    expect(result.items.every((i) => i.selected)).toBe(true);
  });

  it('handles label lines followed by date-only lines and multiple dates per line', () => {
    const r = parseScheduleText('Zimní semestr\n28. 9. 2026 – 19. 2. 2027\nZápočtové testy: 12. 11. a 10. 12. 2026', {
      mode: 'harmonogram',
      referenceDate: new Date(2026, 10, 1),
    });
    expect(r.items[0]).toMatchObject({ title: 'Zimní semestr', start: '2026-09-28', end: '2027-02-19' });
    const tests = r.items.filter((i) => i.title === 'Zápočtové testy');
    expect(tests.map((t) => t.start)).toEqual(['2026-11-12', '2026-12-10']);
  });

  it('infers year without explicit academic year and parses od–do / day ranges', () => {
    const r = parseScheduleText('Imatrikulace od 5. 10. do 9. 10.\nSportovní dny 14.–16. 4.', {
      mode: 'harmonogram',
      referenceDate: new Date(2026, 10, 1),
    });
    expect(r.items[0]).toMatchObject({ start: '2026-10-05', end: '2026-10-09', category: 'event' });
    expect(r.items[1]).toMatchObject({ start: '2027-04-14', end: '2027-04-16', category: 'holiday' });
  });
});

const SYLLABUS = `Podmínky zakončení předmětu:
Průběžný test (20 %) – 12. 11. 2026 v 9:40
Seminární práce (40 %) – odevzdání do 6. 12. 2026 přes Moodle
Prezentace v semináři (10 %)
Závěrečná písemná zkouška (30 %)
1. týden (5. 10.): Úvod do předmětu`;

describe('parser sylabu', () => {
  const r = parseScheduleText(SYLLABUS, { mode: 'syllabus', referenceDate: new Date(2026, 10, 1) });
  const byTitle = (t: string) => r.items.find((i) => i.title.startsWith(t));

  it('extracts weighted requirements with dates and times', () => {
    const test = byTitle('Průběžný test');
    expect(test).toMatchObject({ weight: 20, target: 'requirement', requirementType: 'test', allDay: false });
    expect(new Date(test!.start!).getHours()).toBe(9);
    expect(new Date(test!.start!).getMinutes()).toBe(40);
    expect(byTitle('Seminární práce')).toMatchObject({
      weight: 40,
      start: '2026-12-06',
      isDeadline: true,
      requirementType: 'assignment',
    });
  });

  it('keeps undated weighted components', () => {
    expect(byTitle('Prezentace v semináři')).toMatchObject({ weight: 10, requirementType: 'presentation' });
    expect(byTitle('Prezentace v semináři')?.start).toBeUndefined();
    expect(byTitle('Závěrečná písemná zkouška')).toMatchObject({ weight: 30, requirementType: 'exam' });
  });

  it('marks topic lines as low-confidence milestones', () => {
    const topic = r.items.find((i) => i.title.includes('Úvod do předmětu'));
    expect(topic).toMatchObject({ target: 'milestone', selected: false, start: '2026-10-05' });
  });

  it('converts teaching weeks when the semester start is known', () => {
    const withWeeks = parseScheduleText('Zápočtový test: 7. týden', {
      mode: 'syllabus',
      referenceDate: new Date(2026, 10, 1),
      teachingStart: '2026-09-28',
    });
    expect(withWeeks.items[0]).toMatchObject({ start: '2026-11-09', end: '2026-11-13', target: 'requirement' });
  });
});
