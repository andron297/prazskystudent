/**
 * Import ze SISu bez přístupu aplikace k SISu: student otevře stránku ve svém
 * prohlížeči (přihlášený), klikne na záložku „→ Stihnu“ (nebo text zkopíruje)
 * a aplikace z textu stránky vytáhne sylabus předmětu nebo termíny zkoušek.
 */
import type { SubjectSyllabus } from '../types';
import { SUBJECT_CODE_RE } from './text';

export type SisPageKind = 'syllabus' | 'exams' | 'unknown';

export interface ExamTerm {
  id: string;
  code?: string;
  name?: string;
  start: Date;
  room?: string;
  teacher?: string;
  /** Řádek obsahoval znak přihlášení (např. „přihlášen“). */
  registered: boolean;
  raw: string;
}

export interface SisImportResult {
  kind: SisPageKind;
  subject?: { code?: string; name?: string; syllabus: SubjectSyllabus };
  exams: ExamTerm[];
}

const SECTION_ALIASES: { key: keyof SubjectSyllabus; re: RegExp }[] = [
  { key: 'annotation', re: /^(anotace|annotation)\b/i },
  { key: 'syllabus', re: /^(sylabus|syllabus)\b/i },
  { key: 'requirements', re: /^(podmínky zakončení předmětu|požadavky ke zkoušce|požadavky k zápočtu|course completion requirements|requirements to the exam)\b/i },
  { key: 'literature', re: /^(literatura|literature)\b/i },
];

/** Nadpisy dalších sekcí (ukončují předchozí sekci). */
const OTHER_SECTIONS = /^(cíl předmětu|aim of the course|metody výuky|teaching methods|vstupní požadavky|entry requirements|výsledky učení|learning outcomes|rozvrh|harmonogram|klíčová slova|keywords|registrační podmínky|registration requirements|garant|vyučující|zajišťuje|fakulta|platnost|semestr|e-kredity|rozsah, examinace|počet míst|minimální obsazenost|virtuální mobilita|stav předmětu|jazyk výuky|způsob výuky|poznámka|anglický název)\b/i;

function fieldValue(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const m = new RegExp(`^${label.source}\\s*:?\\s*(.+)$`, 'i').exec(line);
    if (m && m[1].trim()) return m[1].trim();
  }
  return undefined;
}

function cleanSection(lines: string[]): string | undefined {
  const text = lines
    .filter((l) => !/^poslední úprava:|^last update:/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : undefined;
}

export function detectSisPage(text: string, url?: string): SisPageKind {
  if (url && /do=predmet|predmety\/index\.php/i.test(url)) return 'syllabus';
  if (/(anotace|sylabus|annotation|syllabus)\s*-?\s*$/im.test(text) && /e-kredity|garant/i.test(text)) return 'syllabus';
  if (/termín(?:y)? zkouš|přihlašování na zkoušky|exam(?:ination)? dates|zápis na termín/i.test(text)) return 'exams';
  if (/\b\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}\b/.test(text) && SUBJECT_CODE_RE.test(text)) return 'exams';
  return 'unknown';
}

export function parseSisSyllabus(text: string, url?: string, now = new Date()): SisImportResult['subject'] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Název a kód: „Úvod do mediálních studií - JSB012“
  let code = url ? /[?&]kod=([A-Z0-9]+)/i.exec(url)?.[1]?.toUpperCase() : undefined;
  let name: string | undefined;
  for (const line of lines.slice(0, 40)) {
    const m = /^(.{3,140}?)\s+[-–]\s+([A-Z]{2,5}\d{2,6}[A-Z]?)$/.exec(line);
    if (m && (!code || m[2] === code)) {
      name = m[1].trim();
      code = m[2];
      break;
    }
  }

  const syllabus: SubjectSyllabus = { importedAt: now.toISOString(), url };
  syllabus.guarantor = fieldValue(lines, /garant(?:\s*\(.*?\))?/);
  const teachers = fieldValue(lines, /vyučující/);
  if (teachers) {
    // Čárka odděluje vyučující, ale ne tituly za jménem („Jan Novák, Ph.D.“).
    syllabus.teachers = teachers
      .split(/,(?!\s*(?:Ph\.\s?D|CSc|DrSc|Th\.\s?D|MBA|M\.\s?A|LL\.\s?M|DiS|MSc|M\.\s?Sc|BA|MA|Dr\.\s?h\.\s?c)\b)\s*/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  const credits = fieldValue(lines, /e-kredity/);
  if (credits && /\d+/.test(credits)) syllabus.credits = Number(/\d+/.exec(credits)![0]);
  const scope = fieldValue(lines, /rozsah, examinace/);
  if (scope) {
    const completion = /\b(Zk|Z\+Zk|KZ|Z|Kv)\b(?:\s*\[[^\]]+\])?/.exec(scope);
    syllabus.completion = completion ? completion[0].replace(/\s*\[.*$/, '') : scope;
  }
  syllabus.semester = fieldValue(lines, /semestr/);
  syllabus.language = fieldValue(lines, /jazyk výuky/);

  // Sekce: nadpis „Anotace -“ a text až po další nadpis.
  let current: keyof SubjectSyllabus | null = null;
  const buckets: Partial<Record<keyof SubjectSyllabus, string[]>> = {};
  for (const line of lines) {
    const heading = line.replace(/\s*[-–]\s*$/, '');
    const section = SECTION_ALIASES.find((s) => s.re.test(heading) && heading.length < 60);
    if (section && (line.endsWith('-') || line.endsWith('–') || heading.length === line.length)) {
      current = section.key;
      buckets[current] = buckets[current] ?? [];
      continue;
    }
    if (OTHER_SECTIONS.test(heading) && heading.length < 60) {
      current = null;
      continue;
    }
    if (current) buckets[current]!.push(line);
  }
  for (const s of SECTION_ALIASES) {
    const value = cleanSection(buckets[s.key] ?? []);
    if (value) (syllabus as unknown as Record<string, unknown>)[s.key] = value;
  }
  return { code, name, syllabus };
}

const DATE_TIME_RE = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\s*(?:,\s*)?(\d{1,2}):(\d{2})\b/g;

export function parseSisExams(text: string): ExamTerm[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out: ExamTerm[] = [];
  let lastCode: string | undefined;
  let lastName: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codeHere = SUBJECT_CODE_RE.exec(line)?.[1];
    if (codeHere) {
      lastCode = codeHere;
      const nm = line
        .replace(codeHere, '')
        .replace(DATE_TIME_RE, '')
        .replace(/[|\t;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (nm.length > 3 && !/^\d/.test(nm)) lastName = nm.split(/\s{2,}| - /)[0];
    }
    DATE_TIME_RE.lastIndex = 0;
    const m = DATE_TIME_RE.exec(line);
    if (!m) continue;
    const start = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
    if (Number.isNaN(start.getTime())) continue;
    const room = /\b(?:místnost|učebna|room)\s*:?\s*([A-Z]{0,3}\s?\d{1,4}[A-Z]?)\b/i.exec(line)?.[1] ?? /\b([A-Z]{1,2}\d{2,4}[A-Z]?)\b(?!\d)/.exec(line.replace(codeHere ?? '§', ''))?.[1];
    const teacher = /((?:doc\.|prof\.|Mgr\.|PhDr\.|Ing\.|RNDr\.|JUDr\.|Dr\.)\s?[^,;|]{3,60})/.exec(line)?.[1]?.trim();
    out.push({
      id: `exam_${start.getTime().toString(36)}_${(codeHere ?? lastCode ?? 'x').toLowerCase()}`,
      code: codeHere ?? lastCode,
      name: lastName,
      start,
      room,
      teacher,
      registered: /přihlášen|zapsán|registered|✓|✔/i.test(line) && !/nepřihlášen|odhlásit se nelze/i.test(line),
      raw: line,
    });
  }
  // Duplicity (stejný termín a předmět)
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

export function parseSisPage(text: string, url?: string, now = new Date()): SisImportResult {
  const kind = detectSisPage(text, url);
  if (kind === 'syllabus') return { kind, subject: parseSisSyllabus(text, url, now), exams: [] };
  if (kind === 'exams') return { kind, exams: parseSisExams(text) };
  const exams = parseSisExams(text);
  return { kind: exams.length > 0 ? 'exams' : 'unknown', exams };
}

/** Veřejná stránka předmětu v SISu (sylabus) podle kódu. */
export function sisSubjectUrl(code: string): string {
  return `https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=${encodeURIComponent(code)}`;
}

/**
 * Záložka (bookmarklet): pošle text otevřené stránky SISu do aplikace.
 * Aplikace přijme zprávu jen z domén *.cuni.cz a jen po vlastním pozdravu.
 */
export function sisBookmarklet(appOrigin: string): string {
  const code = `(function(){var a='${appOrigin}',w=window.open(a+'/#/import','stihnu');if(!w){alert('Povol vyskakovací okna pro Stihnu');return}var d={type:'stihnu-sis',url:location.href,title:document.title,text:document.body.innerText.slice(0,400000)};var n=0,t=setInterval(function(){n++;try{w.postMessage(d,a)}catch(e){}if(n>40)clearInterval(t)},250);window.addEventListener('message',function(e){if(e.origin===a&&e.data==='stihnu-ok')clearInterval(t)})})();`;
  return `javascript:${encodeURIComponent(code)}`;
}
