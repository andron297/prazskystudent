/**
 * K jakému předmětu patří úkol? Rozhoduje se lokálně (nic se nikam neposílá)
 * podle několika nezávislých stop – kód předmětu, název i se skloňováním,
 * zkratka, vyučující, slova ze sylabu a z termínů předmětu, úkoly, které už
 * student sám přiřadil, a rozvrh (úkol „na seminář“ ve dni, kdy ho má).
 * Jistý odhad se použije hned, nejistý se jen nabídne.
 */
import type { Requirement, ScheduleEvent, Subject, Task } from '../types';
import { foldDiacritics, SUBJECT_CODE_RE } from './text';

/** high = přiřadit hned, medium = nabídnout, low = nabídnout dvě možnosti. */
export type MatchConfidence = 'high' | 'medium' | 'low';

export interface SubjectGuess {
  subjectId: string;
  confidence: MatchConfidence;
  score: number;
  /** Krátké vysvětlení pro rozhraní („podle kódu JSB065“). */
  reason: string;
  /** Druhá nejpravděpodobnější možnost, když je odhad nejednoznačný. */
  alternativeId?: string;
}

const STOP = new Set(
  'a aby ale ani anebo ani bez by co do i jak jako je jen k ke kde ma na nad nebo nez o od pak po pod pro proc pred pri s se si ta tak te to u uz v ve vs z za ze zda the and of for in to with on uvod zaklady zaklad teorie praxe kurz predmet cast'.split(' '),
);
/** Slova, která nic neříkají o předmětu (obecné školní pojmy). */
const GENERIC = new Set(
  'ukol ukoly domaci napsat dodelat udelat precist nastudovat pripravit odevzdat poslat zkontrolovat projit opakovat ucit naucit zapsat esej eseje referat prezentace prace test testu zkouska zkousku zapocet zapoctu seminar seminare seminarni prednaska prednasku cviceni hodina hodinu hodiny tyden tydne zitra dnes pondeli utery streda stredu ctvrtek patek patku sobota nedele kapitola kapitolu kapitoly clanek clanky text texty otazky otazka projekt projektu vystup ukazka reflexe reserse reserze materialy material podklady poznamky'.split(
    ' ',
  ),
);
const TITLES = /^(prof|doc|dr|mgr|bc|ing|phdr|judr|mudr|rndr|paeddr|thdr|phd|csc|drsc|mba|ma|ba|msc|bsc|dis|ll|m|th)$/;

interface Tok {
  t: string;
  /** Psáno se zkracovací tečkou („soc.“) – smí se shodovat i začátkem slova. */
  abbr: boolean;
  /** Původně velkými písmeny (zkratky jako „AMO“). */
  upper: boolean;
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /[\p{L}\p{N}]+(\.)?/gu;
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/\.$/, '');
    const t = foldDiacritics(raw);
    if (t.length < 2 && !/\d/.test(t)) continue;
    out.push({ t, abbr: Boolean(m[1]) && raw.length >= 3 && raw.length <= 6, upper: raw.length >= 2 && raw === raw.toUpperCase() && /\p{L}/u.test(raw) });
  }
  return out;
}

const significant = (t: string) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t);

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Stejné slovo i v jiném pádě („statistika“ × „statistiky“, „psychologie“ × „psychologii“). */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  return commonPrefix(a, b) >= Math.max(5, min - 3);
}

function tokenMatches(text: Tok, word: string): number {
  if (sameWord(text.t, word)) return 1;
  if (text.abbr && text.t.length >= 3 && word.startsWith(text.t)) return 0.75;
  return 0;
}

/** Zkratka z počátečních písmen („Analýza mediálních obsahů“ → „amo“). */
export function acronym(name: string): string | null {
  const words = tokenize(name).filter((w) => significant(w.t) || /^(i|ii|iii|iv)$/.test(w.t));
  const letters = words.filter((w) => !/^(i|ii|iii|iv|\d+)$/.test(w.t)).map((w) => w.t[0]);
  return letters.length >= 2 ? letters.join('') : null;
}

function surnames(names: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const full of names) {
    if (!full) continue;
    for (const person of full.split(/[,;]| a /)) {
      const words = [...person.matchAll(/[\p{Lu}][\p{L}'-]+/gu)].map((m) => m[0]).filter((w) => !TITLES.test(foldDiacritics(w).replace(/\./g, '')));
      const last = words.at(-1);
      if (last && last.length >= 3) out.add(foldDiacritics(last));
    }
  }
  return [...out];
}

interface SubjectProfile {
  subject: Subject;
  code?: string;
  nameKey: string;
  nameWords: string[];
  acronym: string | null;
  surnames: string[];
  /** Slova ze sylabu, termínů a dříve přiřazených úkolů. */
  keywords: Map<string, number>;
  /** Dny v týdnu (0–6), kdy předmět mívá výuku. */
  weekdays: Set<number>;
  /** Konkrétní hodiny (pro „na příští seminář“ a úkoly psané během výuky). */
  classes: { start: number; end: number }[];
}

export interface MatchContext {
  profiles: SubjectProfile[];
  /** Ve kolika předmětech se slovo vyskytuje (vzácné slovo = silná stopa). */
  df: Map<string, number>;
}

function addWords(map: Map<string, number>, text: string | undefined, weight: number) {
  if (!text) return;
  for (const w of tokenize(text)) {
    if (!significant(w.t) || GENERIC.has(w.t) || w.t.length < 4) continue;
    map.set(w.t, Math.max(map.get(w.t) ?? 0, weight));
  }
}

export function buildMatchContext(data: { subjects: Subject[]; events?: ScheduleEvent[]; requirements?: Requirement[]; tasks?: Task[] }): MatchContext {
  const profiles: SubjectProfile[] = data.subjects.map((subject) => {
    const nameWords = tokenize(subject.name)
      .map((w) => w.t)
      .filter(significant);
    const events = (data.events ?? []).filter((e) => e.subjectId === subject.id && !e.allDay);
    const keywords = new Map<string, number>();
    const syl = subject.syllabus;
    addWords(keywords, [syl?.annotation, syl?.aim, syl?.syllabus].filter(Boolean).join(' ').slice(0, 6000), 0.5);
    for (const r of data.requirements ?? []) if (r.subjectId === subject.id) addWords(keywords, `${r.title} ${r.description ?? ''}`.slice(0, 600), 0.8);
    for (const t of data.tasks ?? []) if (t.subjectId === subject.id && !t.subjectAuto) addWords(keywords, t.title, 1);
    return {
      subject,
      code: subject.code?.toUpperCase(),
      nameKey: foldDiacritics(subject.name).replace(/[^a-z0-9]+/g, ' ').trim(),
      nameWords,
      acronym: acronym(subject.name),
      surnames: surnames([subject.teacher, syl?.guarantor, ...(syl?.teachers ?? []), ...events.map((e) => e.teacher)]),
      keywords,
      weekdays: new Set(events.map((e) => new Date(e.start).getDay())),
      classes: events.map((e) => ({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime() })),
    };
  });
  const df = new Map<string, number>();
  for (const p of profiles) {
    for (const w of new Set([...p.nameWords, ...p.keywords.keys()])) df.set(w, (df.get(w) ?? 0) + 1);
  }
  return { profiles, df };
}

const CLASS_HINT = /\b(na|do|pro|k|ke|z|ze)\s+(pristi\s+|dalsi\s+)?(seminar|prednas|cviceni|hodin|vyuk|lekc)/;

export interface MatchInput {
  title: string;
  notes?: string;
  /** Termín úkolu (DateKey nebo ISO). */
  due?: string;
  /** Kdy úkol vznikl (psaní během výuky je silná stopa). */
  createdAt?: string;
}

/** Nejlepší odhad předmětu, nebo null, když si nejsme dost jistí. */
export function guessSubject(input: MatchInput, ctx: MatchContext, opts: { exclude?: string[] } = {}): SubjectGuess | null {
  const text = `${input.title} ${input.notes ?? ''}`.slice(0, 800);
  const folded = foldDiacritics(text).replace(/[^a-z0-9]+/g, ' ');
  const toks = tokenize(text);
  const idf = (w: string) => Math.log(1 + ctx.profiles.length / Math.max(1, ctx.df.get(w) ?? 1));
  const code = SUBJECT_CODE_RE.exec(text.toUpperCase())?.[1];
  const dueDate = input.due ? new Date(input.due.length === 10 ? `${input.due}T12:00:00` : input.due) : null;
  const created = input.createdAt ? new Date(input.createdAt).getTime() : null;
  const classHint = CLASS_HINT.test(folded);

  const scored: { id: string; score: number; reason: string }[] = [];
  for (const p of ctx.profiles) {
    if (opts.exclude?.includes(p.subject.id)) continue;
    let score = 0;
    const reasons: [number, string][] = [];
    const add = (points: number, reason: string) => {
      if (points <= 0) return;
      score += points;
      reasons.push([points, reason]);
    };

    if (code && p.code === code) add(14, `podle kódu ${p.subject.code}`);
    if (p.nameKey.length >= 5 && ` ${folded} `.includes(` ${p.nameKey} `)) add(9, 'podle názvu');
    else {
      let nameScore = 0;
      let matchedWords = 0;
      for (const w of p.nameWords) {
        const best = Math.max(0, ...toks.map((t) => tokenMatches(t, w)));
        if (best > 0) {
          matchedWords++;
          nameScore += best * idf(w) * 2.6;
        }
      }
      if (matchedWords >= 2) nameScore *= 1.25;
      // Výrazné slovo, které má v názvu jen tento předmět („statistika“), stačí samo.
      if (p.nameWords.some((w) => w.length >= 7 && (ctx.df.get(w) ?? 0) === 1 && toks.some((t) => tokenMatches(t, w) === 1))) nameScore += 2;
      add(nameScore, 'podle názvu');
    }
    if (p.acronym && p.acronym.length >= 2) {
      const hit = toks.some((t) => t.t === p.acronym && (p.acronym!.length >= 3 ? t.t.length === p.acronym!.length : t.upper));
      if (hit) add(6, `podle zkratky ${p.acronym.toUpperCase()}`);
    }
    for (const s of p.surnames) {
      if (toks.some((t) => t.t.length >= s.length && commonPrefix(t.t, s) >= Math.max(4, s.length - 1))) {
        add(5 * Math.min(1, idf(s) / Math.log(1 + ctx.profiles.length) + 0.5), 'podle vyučujícího');
        break;
      }
    }
    let kw = 0;
    for (const t of toks) {
      if (!significant(t.t) || GENERIC.has(t.t) || t.t.length < 4) continue;
      for (const [w, weight] of p.keywords) {
        if (sameWord(t.t, w)) {
          kw += weight * idf(w) * 1.3;
          break;
        }
      }
    }
    add(Math.min(5, kw), 'podle sylabu a termínů předmětu');

    if (dueDate && p.weekdays.has(dueDate.getDay())) add(classHint ? 3 : 0.6, `máš ho ${['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'][dueDate.getDay()]}`);
    if (created && p.classes.some((c) => created >= c.start - 5 * 60_000 && created <= c.end + 20 * 60_000)) add(classHint ? 3.5 : 2, 'zapsáno během jeho výuky');

    if (score > 0) {
      reasons.sort((a, b) => b[0] - a[0]);
      scored.push({ id: p.subject.id, score, reason: reasons[0][1] });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best) return null;
  const runnerUp = second?.score ?? 0;
  if (best.score >= 6 && runnerUp <= best.score * 0.5) return { subjectId: best.id, confidence: 'high', score: best.score, reason: best.reason };
  if (best.score >= 3 && runnerUp <= best.score * 0.75) return { subjectId: best.id, confidence: 'medium', score: best.score, reason: best.reason };
  if (best.score >= 3 && second && second.score >= 2.5) return { subjectId: best.id, confidence: 'low', score: best.score, reason: best.reason, alternativeId: second.id };
  return null;
}
