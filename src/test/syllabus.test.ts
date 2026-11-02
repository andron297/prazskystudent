import { describe, expect, it } from 'vitest';
import type { Requirement, Subject } from '../types';
import { splitTeacherTail, extractSubjectName } from '../lib/icsImport';
import { applyActivityToRequirement, detectMoodlePage, matchRequirement, parseMoodleActivity, parseMoodleDate } from '../lib/moodlePage';
import { linesFromItems } from '../lib/pdfText';
import { parseSisSyllabus } from '../lib/sisImport';
import { itemsToRequirements, localSyllabusItems, syllabusText } from '../lib/syllabusExtract';
import { buildDemoSisPage } from '../services/demo/samples';
import { subjectsNeedingSyllabus, sisQueryFor } from '../services/syllabusSync';

const NOW = new Date(2026, 10, 2, 12, 0);

const subject: Subject = { id: 's1', code: 'JKB096', name: 'Platformy žurnalistiky v kyberprostoru', color: 'indigo', source: 'sis', createdAt: NOW.toISOString() };

const brief = (text: string) => localSyllabusItems(text, NOW).map((i) => ({ title: i.title, type: i.requirementType, weight: i.weight, start: i.start?.slice(0, 10) }));

describe('povinnosti ze sylabu bez AI', () => {
  it('rozdělí víc složek v jedné větě a vezme termíny z dalších vět', () => {
    const items = brief('Esej (30 %), průběžné testy (20 %), závěrečná zkouška (50 %).\nPrůběžný test 12. 11. 2026 v 10:00.\nOdevzdání eseje do 15. 12. 2026.');
    expect(items).toEqual([
      { title: 'Esej', type: 'assignment', weight: 30, start: '2026-12-15' },
      { title: 'Průběžné testy', type: 'test', weight: 20, start: '2026-11-12' },
      { title: 'Závěrečná zkouška', type: 'exam', weight: 50, start: undefined },
    ]);
  });

  it('hranice („vyšší než 50 %“, „alespoň 60 %“) nejsou váhy', () => {
    const items = brief('Pro získání zápočtu je zapotřebí splnit seminární úkol a obdržet z něj hodnocení vyšší než 50 %. Seminární úkol spočívá ve skupinové prezentaci. Ke zkoušce je nutné získat alespoň 60 % bodů.');
    expect(items.every((i) => i.weight === undefined)).toBe(true);
    // „Seminární úkol spočívá ve skupinové prezentaci“ je pořád tatáž složka
    expect(items.map((i) => i.title)).toEqual(['Seminární práce', 'Zkouška']);
  });

  it('seznam s odrážkami, procenta před i za názvem, bez dat v názvu', () => {
    const items = brief('Hodnocení:\n- docházka 10 %\n- seminární práce – 40 %\n- 50 % písemná zkouška\nPísemný test 4. 11. 2026 (25 %).');
    expect(items.map((i) => [i.title, i.weight])).toEqual([
      ['Docházka', 10],
      ['Seminární práce', 40],
      ['Písemná zkouška', 50],
      ['Písemný test', 25],
    ]);
  });

  it('převod na povinnosti bez duplicit', () => {
    const items = localSyllabusItems('Esej (30 %), test (20 %), zkouška (50 %).', NOW);
    const existing: Requirement[] = [{ id: 'r0', subjectId: 's1', title: 'Esej', type: 'assignment', weight: 30, done: false, subtasks: [], source: 'manual', createdAt: NOW.toISOString() }];
    const reqs = itemsToRequirements(items, subject, existing, NOW, 'sis:JKB096');
    expect(reqs.map((r) => r.title)).toEqual(['Test', 'Zkouška']);
    expect(reqs[0]).toMatchObject({ source: 'sis', weight: 20, externalId: 'sis:JKB096:test' });
    expect(itemsToRequirements(items, subject, [...existing, ...reqs], NOW, 'sis:JKB096')).toHaveLength(0);
  });
});

describe('sylaby ze SISu', () => {
  it('ukázková stránka má stejnou strukturu jako skutečná a dá povinnosti', () => {
    const page = buildDemoSisPage({ code: 'JSB065' }, NOW);
    const parsed = parseSisSyllabus(page.text, page.url, NOW)!;
    expect(parsed.code).toBe('JSB065');
    expect(parsed.syllabus.credits).toBe(6);
    const items = localSyllabusItems(syllabusText(parsed.syllabus), NOW);
    expect(items.map((i) => [i.title, i.weight])).toEqual([
      ['Průběžný test', 20],
      ['Seminární práce', 40],
      ['Prezentace výzkumného designu v semináři', 15],
      ['Závěrečná písemná zkouška', 25],
      ['Docházka a aktivita', undefined],
    ]);
    expect(items[0].start).toBeTruthy();
    expect(items[1].start).toBeTruthy();
    expect(() => buildDemoSisPage({ name: 'Neexistující předmět' }, NOW)).toThrow(/ukázkovém SISu/);
  });

  it('dotaz do SISu: kód, jinak název; jen předměty bez sylabu v aktuálním režimu', () => {
    expect(sisQueryFor(subject)).toEqual({ code: 'JKB096' });
    expect(sisQueryFor({ ...subject, code: undefined })).toEqual({ name: 'Platformy žurnalistiky v kyberprostoru' });
    const withSyllabus = { ...subject, id: 's2', syllabus: { importedAt: NOW.toISOString() } };
    const demo = { ...subject, id: 's3', demo: true };
    expect(subjectsNeedingSyllabus([subject, withSyllabus, demo], 'live', NOW).map((s) => s.id)).toEqual(['s1']);
    expect(subjectsNeedingSyllabus([subject, withSyllabus, demo], 'live', NOW, true).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(subjectsNeedingSyllabus([subject, demo], 'demo', NOW).map((s) => s.id)).toEqual(['s3']);
  });

  it('jméno vyučujícího v SUMMARY se odřízne', () => {
    expect(splitTeacherTail('Platformy žurnalistiky v kyberprostoru - Jirků Jan, PhDr. Ph.D.')).toEqual({ name: 'Platformy žurnalistiky v kyberprostoru', teacher: 'Jirků Jan, PhDr. Ph.D.' });
    expect(splitTeacherTail('Dějiny 20. století - přednáška')).toEqual({ name: 'Dějiny 20. století - přednáška' });
    expect(extractSubjectName('JSB065 Analýza mediálních obsahů - Mgr. Tereza Vlčková', 'JSB065')).toBe('Analýza mediálních obsahů');
  });
});

describe('stránky z Moodlu', () => {
  const ASSIGN = [
    'Platformy žurnalistiky v kyberprostoru',
    'Seminární úkol – prezentace',
    'Otevřeno: čtvrtek, 1. října 2026, 00.00',
    'Termín odevzdání: neděle, 18. října 2026, 23.59',
    'Stav odevzdání úkolu',
    'Stav odevzdání úkolu\tOdesláno k hodnocení',
    'Stav hodnocení\tHodnoceno',
    'Zbývající čas\tÚkol byl odevzdán 1 den 2 hodiny před termínem',
    'Zpětná vazba',
    'Známka\t50,00 / 50,00',
    'Hodnoceno dne\tpondělí, 26. října 2026, 10.12',
  ].join('\n');
  const URL = 'https://dl1.cuni.cz/mod/assign/view.php?id=4321';

  it('úkol: odevzdáno, hodnoceno, známka a termín', () => {
    expect(detectMoodlePage(ASSIGN, URL)).toBe('moodle-assign');
    const page = parseMoodleActivity(ASSIGN, URL, 'JKB096: Seminární úkol – prezentace | Moodle')!;
    expect(page).toMatchObject({ kind: 'moodle-assign', title: 'Seminární úkol – prezentace', course: 'JKB096', cmid: 4321, submitted: true, status: 'Odesláno k hodnocení', graded: true, grade: '50 / 50', gradePercent: 100 });
    expect(page.due).toEqual(new Date(2026, 9, 18, 23, 59));
  });

  it('neodevzdaný úkol zůstane otevřený', () => {
    const text = 'Stav odevzdání úkolu\nStav odevzdání úkolu\tŽádný pokus\nStav hodnocení\tNehodnoceno';
    const page = parseMoodleActivity(text, URL, 'Kurz: Esej | Moodle')!;
    expect(page.submitted).toBe(false);
    expect(page.graded).toBe(false);
  });

  it('spáruje povinnost podle odkazu a odškrtne ji i se známkou', () => {
    const page = parseMoodleActivity(ASSIGN, URL, 'JKB096: Seminární úkol – prezentace | Moodle')!;
    const reqs: Requirement[] = [
      { id: 'a', subjectId: 's1', title: 'Jiný úkol', type: 'assignment', weight: 0, done: false, subtasks: [], source: 'moodle', url: 'https://dl1.cuni.cz/mod/assign/view.php?id=43210', createdAt: '' },
      { id: 'b', subjectId: 's1', title: 'Prezentace', type: 'presentation', weight: 0, done: false, subtasks: [{ id: 'x', title: 'Připravit', done: false }], source: 'moodle', url: URL, createdAt: '' },
    ];
    const match = matchRequirement(page, reqs, [subject])!;
    expect(match.id).toBe('b');
    const next = applyActivityToRequirement(match, page);
    expect(next).toMatchObject({ done: true, grade: '50 / 50', gradePercent: 100 });
    expect(next.subtasks.every((s) => s.done)).toBe(true);
    expect(next.deadline).toBe(new Date(2026, 9, 18, 23, 59).toISOString());
  });

  it('data v Moodlu česky i anglicky', () => {
    expect(parseMoodleDate('neděle, 18. října 2026, 23.59')).toEqual(new Date(2026, 9, 18, 23, 59));
    expect(parseMoodleDate('Sunday, 18 October 2026, 11:59 PM')).toEqual(new Date(2026, 9, 18, 23, 59));
    expect(parseMoodleDate('18. 10. 2026 9:30')).toEqual(new Date(2026, 9, 18, 9, 30));
  });
});

describe('PDF', () => {
  it('skládá položky do řádků podle výšky a sloupců', () => {
    const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width, height: 10 });
    const text = linesFromItems([item('Zahájení výuky', 50, 700), item('28. 9. 2026', 300, 700.5), item('Harmonogram', 50, 760), item('Zkouškové', 50, 680), item('11. 1. – 19. 2. 2027', 300, 680)]);
    expect(text).toBe('Harmonogram\nZahájení výuky   28. 9. 2026\nZkouškové   11. 1. – 19. 2. 2027');
  });
});

describe('vložený text z Moodlu', () => {
  it('bez titulku stránky vezme název činnosti z textu', () => {
    const page = parseMoodleActivity('Platformy žurnalistiky\nEsej o médiích\nOtevřeno: čtvrtek, 1. října 2026, 00.00\nStav odevzdání úkolu\tOdesláno k hodnocení', 'https://dl1.cuni.cz/mod/assign/view.php?id=7', '')!;
    expect(page.title).toBe('Esej o médiích');
    expect(page.submitted).toBe(true);
  });
});

describe('sloučení se stávajícími povinnostmi', () => {
  it('úkol z Moodlu bez váhy dostane váhu ze sylabu, stejná složka se nepřidá znovu', async () => {
    const { mergeSyllabusItems } = await import('../lib/syllabusExtract');
    const items = localSyllabusItems('Seminární práce (40 %).\nZávěrečná písemná zkouška (25 %).\nDocházka: max. 2 absence.', NOW);
    const existing: Requirement[] = [
      { id: 'm1', subjectId: 's1', title: 'Seminární práce – odevzdání', type: 'assignment', weight: 0, done: false, subtasks: [], source: 'moodle', createdAt: '' },
      { id: 'm2', subjectId: 's1', title: 'Závěrečná zkouška', type: 'exam', weight: 25, done: false, subtasks: [], source: 'manual', createdAt: '' },
    ];
    const { created, enriched } = mergeSyllabusItems(items, subject, existing, NOW, 'sis:JKB096');
    expect(enriched).toHaveLength(1);
    expect(enriched[0]).toMatchObject({ id: 'm1', weight: 40 });
    expect(created.map((r) => r.title)).toEqual(['Docházka a aktivita']);
  });
});

describe('víc termínů u jedné složky', () => {
  it('termíny prezentací skupin se nevydávají za jeden deadline', () => {
    const items = localSyllabusItems(
      ['9. 11. 2026 - 2x studentské vystoupení (prezentace vypracování seminárního úkolu)', '23. 11. 2026 - 2x studentské vystoupení (prezentace vypracování seminárního úkolu)', '12. 10. 2026 - přednáška vyučujících'].join('\n'),
      NOW,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Studentské vystoupení', requirementType: 'presentation', start: undefined });
    expect(items[0].sourceLine).toMatch(/^Možné termíny: 9\. 11\., 23\. 11\./);
  });
});
