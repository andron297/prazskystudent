import { describe, expect, it } from 'vitest';
import { milestoneRelevance, type StudyProfile } from '../lib/relevance';
import { parseScheduleText } from '../lib/scheduleTextParser';

const bc2: StudyProfile = { level: 'bc', year: 2, form: 'prezencni', language: 'cs', answeredAt: '' };
const rel = (title: string, p: StudyProfile = bc2) => milestoneRelevance({ title }, p).relevant;

describe('relevance termínů harmonogramu', () => {
  it('skryje, co se bakaláře ve 2. ročníku netýká', () => {
    expect(rel('CERGE - Doktorské studium')).toBe(false);
    expect(rel('Doktorské studium)')).toBe(false);
    expect(rel('Bakalářské a magisterské studijní programy vyučované v cizím jazyce')).toBe(false);
    expect(rel('Zápis uchazečů přijatých do bakalářského a magisterského studia')).toBe(false);
    expect(rel('Imatrikulace studentů 1. ročníku')).toBe(false);
    expect(rel('Státní závěrečné zkoušky – bakalářské studium')).toBe(false);
    expect(rel('Přijímací řízení – podávání přihlášek')).toBe(false);
  });
  it('nechá společné termíny', () => {
    expect(rel('Výuka v zimním semestru')).toBe(true);
    expect(rel('Zkouškové období ZS')).toBe(true);
    expect(rel('Rektorský sportovní den')).toBe(true);
    expect(rel('Mezní termín pro splnění studijních povinností')).toBe(true);
    expect(rel('Bakalářské a magisterské studium – zápis do 2. a vyšších ročníků')).toBe(true);
  });
  it('doktorand vidí doktorské a ne bakalářské', () => {
    const phd: StudyProfile = { ...bc2, level: 'phd' };
    expect(rel('Doktorské studium – zápis', phd)).toBe(true);
    expect(rel('Bakalářské studium – zápis', phd)).toBe(false);
  });
  it('státnice jen pro poslední ročník', () => {
    expect(rel('Státní závěrečné zkoušky', { ...bc2, year: 3 })).toBe(true);
  });
  it('„Hodnocení výuky“ není výuka', () => {
    const out = parseScheduleText('Hodnocení výuky v bakalářském studiu 1. 12. 2026 – 20. 12. 2026', { mode: 'harmonogram', referenceDate: new Date('2026-11-05T12:00:00Z') });
    expect(out.items[0]?.category).toBe('event');
  });
});
