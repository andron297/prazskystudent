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

const pick = <T,>(list: T[], id: string, salt: string): T => list[hashString(`${salt}:${id}`) % list.length];

const cache = new WeakMap<object, unknown>();

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
  return {
    ...s,
    name,
    // Kódy předmětů zůstávají skutečné (přání studenta).
    code: s.code,
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

/** Cache podle objektu a sady ponechaných id (stabilní pole = žádné zbytečné překreslování). */
function memoKeyed<T extends object, R>(key: T, keepKey: string, fn: (k: T) => R): R {
  const hit = cache.get(key) as { key: string; value: R } | undefined;
  if (hit && hit.key === keepKey) return hit.value;
  const value = fn(key);
  cache.set(key, { key: keepKey, value });
  return value;
}

export function maskState<S extends { subjects: Subject[]; events: ScheduleEvent[]; tasks: Task[]; requirements: Requirement[]; materials: Material[]; settings: { displayName: string } }>(state: S, keep: ReadonlySet<string> = new Set()): S {
  // Položky přidané během prezentace se ukazují skutečně (klíč cache tedy zahrnuje i je).
  const keepKey = [...keep].sort().join(',');
  return memoKeyed(state, keepKey, (st) => {
    const subjects = memoKeyed(st.subjects, keepKey, (list) => {
      const names = subjectNamesFor(list);
      return list.map((x) => (keep.has(x.id) ? x : maskSubject(x, names.get(x.id))));
    });
    const subjectName = new Map(subjects.map((x) => [x.id, x.name]));
    const events = memoKeyed(st.events, `${keepKey}|${subjects.length}`, (list) =>
      list.map((e) =>
        keep.has(e.id)
          ? e
          : e.subjectId && subjectName.has(e.subjectId)
            ? { ...e, title: subjectName.get(e.subjectId)!, teacher: e.teacher ? pick(TEACHERS, e.subjectId, 'teacher') : undefined, notes: undefined }
            : { ...e, title: pick(PERSONAL, e.id, 'personal'), location: e.buildingId ? e.location : e.location ? pick(PLACES, e.id, 'place') : undefined, teacher: undefined, notes: undefined },
      ),
    );
    const tasks = memoKeyed(st.tasks, keepKey, (list) => list.map((t) => (keep.has(t.id) ? t : { ...t, title: pick(TASKS, t.id, 'task'), notes: undefined })));
    const requirements = memoKeyed(st.requirements, keepKey, (list) => list.map((r) => (keep.has(r.id) ? r : { ...r, title: pick(REQUIREMENTS, r.id, 'req'), description: undefined })));
    const materials = memoKeyed(st.materials, keepKey, (list) => list.map((m) => (keep.has(m.id) ? m : { ...m, title: pick(MATERIALS, m.id, 'mat'), fileName: m.fileName ? pick(MATERIALS, m.id, 'mat') : undefined, markdown: undefined })));
    const settings = memoKeyed(st.settings, '', (x) => ({ ...x, displayName: '' }));
    return { ...st, subjects, events, tasks, requirements, materials, settings };
  });
}

/** Vymyšlené názvy předmětů (cache podle seznamu). */
const namesCache = new WeakMap<Subject[], Map<string, string>>();
function subjectNamesFor(list: Subject[]): Map<string, string> {
  let names = namesCache.get(list);
  if (!names) {
    names = subjectNames(list);
    namesCache.set(list, names);
  }
  return names;
}

/** Změny, které by mohly uložit vymyšlený popisek místo skutečného (v režimu prezentace se blokují). */
export function touchesText(patch: object): boolean {
  return ['title', 'name', 'notes', 'description', 'teacher', 'code', 'location', 'syllabus', 'markdown', 'fileName'].some((k) => k in patch);
}
