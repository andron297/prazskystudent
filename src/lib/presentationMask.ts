/**
 * Režim prezentace: vaše skutečná data (časy, počty, rozvrh, termíny) zůstanou,
 * ale všechny popisky – názvy předmětů, kódy, vyučující, názvy událostí,
 * úkolů a materiálů – se na obrazovce nahradí věrohodnými vymyšlenými.
 * Uložená data se nemění; náhrady jsou pro stejné id vždy stejné.
 */
import type { Material, Requirement, ScheduleEvent, Subject, Task } from '../types';
import { hashString } from './id';

const SUBJECTS = [
  'Úvod do sociologie',
  'Dějiny moderní filozofie',
  'Ekonomie I',
  'Statistika pro sociální vědy',
  'Mediální teorie',
  'Akademické psaní',
  'Úvod do politologie',
  'Mezinárodní vztahy',
  'Psychologie osobnosti',
  'Kvantitativní metody',
  'Česká literatura 20. století',
  'Právo Evropské unie',
  'Analýza dat v Pythonu',
  'Etika a společnost',
  'Dějiny umění',
  'Lineární algebra',
  'Obecná biologie',
  'Organická chemie',
  'Anglický jazyk pro akademické účely',
  'Kulturní antropologie',
];
const TEACHERS = ['doc. Jana Malá, Ph.D.', 'Mgr. Petr Dvořák', 'prof. Eva Horáková', 'PhDr. Tomáš Beneš, Ph.D.', 'Mgr. Lucie Králová', 'doc. Martin Svoboda, Ph.D.', 'Ing. Karolína Veselá', 'Mgr. Ondřej Pokorný, Ph.D.'];
const PERSONAL = ['Schůzka s kamarádkou', 'Trénink', 'Konzultace', 'Oběd', 'Kurz jazyků', 'Brigáda', 'Kino', 'Knihovna – studovna', 'Plavání', 'Sraz projektového týmu'];
const PLACES = ['Kavárna u parku', 'Městská knihovna', 'Sportovní hala', 'Náměstí Míru', 'Kampa'];
const TASKS = ['Přečíst 3. kapitolu', 'Připravit prezentaci', 'Napsat esej', 'Zopakovat přednášky', 'Vyplnit dotazník', 'Domluvit skupinový projekt', 'Odevzdat domácí úkol', 'Projít skripta', 'Nachystat poznámky ke zkoušce', 'Přihlásit se na termín'];
const REQUIREMENTS = ['Seminární práce', 'Průběžný test', 'Prezentace', 'Esej', 'Domácí úkol', 'Referát', 'Projekt', 'Zápočtový test', 'Reflexe četby', 'Ústní zkouška'];
const MATERIALS = ['Přednáška – úvod.pdf', 'Sylabus.pdf', 'Prezentace z cvičení.pptx', 'Povinná četba.pdf', 'Zadání úkolu.docx', 'Poznámky ze semináře', 'Skripta.pdf', 'Vzorový test.pdf'];
const LETTERS = ['A', 'B', 'J', 'K', 'M', 'N', 'O', 'P', 'S', 'X'];

const pick = <T,>(list: T[], id: string, salt: string): T => list[hashString(`${salt}:${id}`) % list.length];

const cache = new WeakMap<object, unknown>();
function memo<T extends object, R>(key: T, fn: (k: T) => R): R {
  if (cache.has(key)) return cache.get(key) as R;
  const value = fn(key);
  cache.set(key, value);
  return value;
}

/** Každý předmět dostane jiný vymyšlený název (stejné id = vždy stejný název). */
function subjectNames(list: Subject[]): Map<string, string> {
  const taken = new Set<number>();
  const out = new Map<string, string>();
  for (const s of [...list].sort((a, b) => a.id.localeCompare(b.id))) {
    let i = hashString(`subject:${s.id}`) % SUBJECTS.length;
    for (let n = 0; n < SUBJECTS.length && taken.has(i); n++) i = (i + 1) % SUBJECTS.length;
    taken.add(i);
    out.set(s.id, SUBJECTS[i]);
  }
  return out;
}

export function maskSubject(s: Subject, fakeName?: string): Subject {
  const name = fakeName ?? pick(SUBJECTS, s.id, 'subject');
  const teacher = pick(TEACHERS, s.id, 'teacher');
  const code = `${pick(LETTERS, s.id, 'c1')}${pick(LETTERS, s.id, 'c2')}${pick(LETTERS, s.id, 'c3')}${100 + (hashString(`code:${s.id}`) % 900)}`;
  return {
    ...s,
    name,
    code: s.code ? code : undefined,
    teacher: s.teacher ? teacher : undefined,
    syllabus: s.syllabus
      ? {
          ...s.syllabus,
          guarantor: s.syllabus.guarantor ? teacher : undefined,
          teachers: s.syllabus.teachers?.length ? [teacher] : undefined,
          annotation: s.syllabus.annotation ? `Kurz seznamuje studenty se základy oboru ${name.toLowerCase()}.` : undefined,
          aim: undefined,
          syllabus: s.syllabus.syllabus ? '1. Úvod\n2. Základní pojmy\n3. Metody\n4. Shrnutí' : undefined,
          requirements: s.syllabus.requirements ? 'Seminární práce (40 %), průběžný test (20 %) a závěrečná zkouška (40 %).' : undefined,
          literature: undefined,
        }
      : undefined,
  };
}

export function maskState<S extends { subjects: Subject[]; events: ScheduleEvent[]; tasks: Task[]; requirements: Requirement[]; materials: Material[]; settings: { displayName: string } }>(state: S): S {
  return memo(state, (st) => {
    const subjects = memo(st.subjects, (list) => {
      const names = subjectNames(list);
      return list.map((x) => maskSubject(x, names.get(x.id)));
    });
    const subjectName = new Map(subjects.map((x) => [x.id, x.name]));
    const events = memo(st.events, (list) =>
      list.map((e) =>
        e.subjectId && subjectName.has(e.subjectId)
          ? { ...e, title: subjectName.get(e.subjectId)!, teacher: e.teacher ? pick(TEACHERS, e.subjectId, 'teacher') : undefined, notes: undefined }
          : { ...e, title: pick(PERSONAL, e.id, 'personal'), location: e.buildingId ? e.location : e.location ? pick(PLACES, e.id, 'place') : undefined, teacher: undefined, notes: undefined },
      ),
    );
    const tasks = memo(st.tasks, (list) => list.map((t) => ({ ...t, title: pick(TASKS, t.id, 'task'), notes: undefined })));
    const requirements = memo(st.requirements, (list) => list.map((r) => ({ ...r, title: pick(REQUIREMENTS, r.id, 'req'), description: undefined })));
    const materials = memo(st.materials, (list) => list.map((m) => ({ ...m, title: pick(MATERIALS, m.id, 'mat'), fileName: m.fileName ? pick(MATERIALS, m.id, 'mat') : undefined, markdown: undefined })));
    const settings = memo(st.settings, (x) => ({ ...x, displayName: '' }));
    return { ...st, subjects, events, tasks, requirements, materials, settings };
  });
}

/** Změny, které by mohly uložit vymyšlený popisek místo skutečného (v režimu prezentace se blokují). */
export function touchesText(patch: object): boolean {
  return ['title', 'name', 'notes', 'description', 'teacher', 'code', 'location', 'syllabus', 'markdown', 'fileName'].some((k) => k in patch);
}
