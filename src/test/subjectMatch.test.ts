import { describe, expect, it } from 'vitest';
import type { Requirement, ScheduleEvent, Subject, Task } from '../types';
import { acronym, buildMatchContext, guessSubject, sameWord } from '../lib/subjectMatch';

const subj = (id: string, name: string, extra: Partial<Subject> = {}): Subject => ({ id, name, color: 'indigo', source: 'sis', createdAt: '', ...extra });
const subjects: Subject[] = [
  subj('stat', 'Statistika pro sociální vědy', { code: 'JSB110', teacher: 'doc. PhDr. Jan Novák, Ph.D.' }),
  subj('amo', 'Analýza mediálních obsahů', { code: 'JSB065' }),
  subj('pol', 'Politický systém ČR', { code: 'JPB140', syllabus: { annotation: 'Ústava, volební systém, Poslanecká sněmovna a Senát, politické strany.', importedAt: '' } }),
  subj('ums', 'Úvod do mediálních studií', { code: 'JSB022' }),
  subj('psani', 'Akademické psaní', { code: 'JSB123' }),
];
// pondělí 9. 11. 2026 – seminář AMO
const events: ScheduleEvent[] = [{ id: 'e1', subjectId: 'amo', title: 'AMO', kind: 'seminar', start: '2026-11-09T13:00:00Z', end: '2026-11-09T14:30:00Z', source: 'sis' }];
const requirements: Requirement[] = [
  { id: 'r1', subjectId: 'pol', title: 'Referát: volební systém do Senátu', type: 'presentation', weight: 30, done: false, subtasks: [], source: 'sis', createdAt: '' },
  { id: 'r2', subjectId: 'stat', title: 'Domácí úkol 4 – regresní analýza', type: 'assignment', weight: 10, done: false, subtasks: [], source: 'moodle', createdAt: '' },
];
const tasks: Task[] = [{ id: 't0', title: 'SPSS – nainstalovat', subjectId: 'stat', done: false, source: 'manual', createdAt: '', updatedAt: '' }];
const ctx = buildMatchContext({ subjects, events, requirements, tasks });
const guess = (title: string, extra: { due?: string; createdAt?: string } = {}) => guessSubject({ title, ...extra }, ctx);

describe('chytré přiřazení úkolu k předmětu', () => {
  it('skloňování a zkratky', () => {
    expect(sameWord('statistika', 'statistiky')).toBe(true);
    expect(sameWord('psychologie', 'psychologii')).toBe(true);
    expect(sameWord('statni', 'statistika')).toBe(false);
    expect(acronym('Analýza mediálních obsahů')).toBe('amo');
  });

  it('jisté případy přiřadí hned', () => {
    expect(guess('statistika – domácí úkol 5')).toMatchObject({ subjectId: 'stat', confidence: 'high' });
    expect(guess('JSB065 odevzdat kódovací knihu')).toMatchObject({ subjectId: 'amo', confidence: 'high', reason: 'podle kódu JSB065' });
    expect(guess('AMO – kódovací kniha')).toMatchObject({ subjectId: 'amo', confidence: 'high' });
    expect(guess('přečíst texty do mediálních studií')).toMatchObject({ subjectId: 'ums', confidence: 'high' });
    expect(guess('Referát o volebním systému')).toMatchObject({ subjectId: 'pol', confidence: 'high' });
    expect(guess('SPSS cvičení z regrese')?.subjectId).toBe('stat');
  });

  it('nejisté jen nabídne, nesouvisející nechá být', () => {
    expect(guess('Napsat Novákovi e-mail')).toMatchObject({ subjectId: 'stat' });
    expect(guess('Esej na seminář', { due: '2026-11-09' })).toMatchObject({ subjectId: 'amo', confidence: 'medium' });
    expect(guess('Vrátit knihy do knihovny')).toBeNull();
    expect(guess('Zaplatit kolej')).toBeNull();
    expect(guess('Koupit dárek pro mámu')).toBeNull();
  });

  it('úkol zapsaný během výuky patří spíš k ní', () => {
    expect(guess('dodělat úkol z hodiny', { createdAt: '2026-11-09T13:40:00Z' })?.subjectId).toBe('amo');
  });

  it('odmítnutý předmět už nenabízí', () => {
    expect(guessSubject({ title: 'statistika – domácí úkol 5' }, ctx, { exclude: ['stat'] })).toBeNull();
  });
});

describe('běžné zkratky a hovorové názvy předmětů', () => {
  const school = [
    subj('cj', 'Český jazyk a stylistika', { code: 'JSB001' }),
    subj('aj', 'Angličtina pro mediální studia', { code: 'JSB002' }),
    subj('mat', 'Matematika I', { code: 'JSB003' }),
    subj('dej', 'Dějiny moderní doby', { code: 'JSB004' }),
    subj('nj', 'Německý jazyk II', { code: 'JSB005' }),
    subj('soc', 'Úvod do sociologie', { code: 'JSB006' }),
  ];
  const c = buildMatchContext({ subjects: school });
  const g = (title: string) => guessSubject({ title }, c);
  it('ČJ je čeština, AJ angličtina, NJ němčina', () => {
    expect(g('ČJ – slohová práce')).toMatchObject({ subjectId: 'cj', confidence: 'high', reason: 'podle zkratky (čeština)' });
    expect(g('čj cvičení 3')?.subjectId).toBe('cj');
    expect(g('AJ slovíčka unit 5')?.subjectId).toBe('aj');
    expect(g('NJ – časování sloves')?.subjectId).toBe('nj');
    expect(g('procvičit češtinu')?.subjectId).toBe('cj');
  });
  it('hovorové názvy', () => {
    expect(g('matika příklady 12–20')?.subjectId).toBe('mat');
    expect(g('děják – referát o studené válce')?.subjectId).toBe('dej');
    expect(g('socka: přečíst Webera')?.subjectId).toBe('soc');
  });
  it('„nj“ psané malými (no jo) ani obecný text nic nepřiřadí', () => {
    expect(g('nj, zítra koupit mléko')).toBeNull();
    expect(g('zavolat babičce')).toBeNull();
  });
});
