/** Ukázkové vstupy pro parser a iCal most (aby šlo vše vyzkoušet bez vlastních dat). */
import { addDays, academicYearStart, mondayOnOrAfter, pad2, startOfWeek } from '../../lib/dates';
import { DEMO_SUBJECTS, WEEK_TEMPLATE } from './seed';

function d(date: Date): string {
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`;
}

function dm(date: Date): string {
  return `${date.getDate()}. ${date.getMonth() + 1}.`;
}

/** Text ve stylu „Harmonogram akademického roku“ z webu fakulty (tabulka zkopírovaná z prohlížeče). */
export function sampleHarmonogram(now: Date): string {
  const ay = academicYearStart(now);
  const teaching = mondayOnOrAfter(new Date(ay, 8, 26));
  const teachingEnd = addDays(teaching, 14 * 7 + 4);
  const exam = mondayOnOrAfter(addDays(teachingEnd, 1));
  const examEnd = addDays(exam, 5 * 7 + 4);
  const summer = mondayOnOrAfter(addDays(examEnd, 1));
  const summerEnd = addDays(summer, 13 * 7 + 4);
  const enroll = mondayOnOrAfter(new Date(ay, 8, 1));
  return [
    `Harmonogram akademického roku ${ay}/${ay + 1}`,
    'Zimní semestr',
    `Zápis předmětů (1. kolo)\t${dm(enroll)} – ${d(addDays(enroll, 20))}`,
    `Výuka v zimním semestru\t${d(teaching)} – ${d(teachingEnd)}`,
    `Škrtání předmětů do ${d(addDays(teaching, 20))}`,
    `Děkanský den (výuka se nekoná): ${d(addDays(teaching, 8 * 7 + 2))}`,
    `Vánoční prázdniny: 21. 12. ${ay} – 3. 1. ${ay + 1}`,
    `Zkouškové období ZS: ${dm(exam)} – ${d(examEnd)}`,
    'Letní semestr',
    `Výuka v letním semestru: ${dm(summer)} – ${d(summerEnd)}`,
    `Rektorský sportovní den: ${d(addDays(summer, 11 * 7 + 2))}`,
    `Zkouškové období LS: ${dm(addDays(summerEnd, 3))} – 25. 9. ${ay + 1}`,
    `Mezní termín pro splnění studijních povinností: 25. 9. ${ay + 1}`,
  ].join('\n');
}

/** Text ve stylu sylabu / podmínek zakončení ze SISu. */
export function sampleSyllabus(now: Date): string {
  const ay = academicYearStart(now);
  const teaching = mondayOnOrAfter(new Date(ay, 8, 26));
  const test = addDays(teaching, 6 * 7 + 1);
  const paper = addDays(teaching, 10 * 7 + 6);
  return [
    'Podmínky zakončení předmětu',
    `Průběžný test (20 %) – ${d(test)} v 14:00`,
    `Seminární práce (40 %) – odevzdání do ${d(paper)} přes Moodle`,
    'Prezentace výzkumného designu v semináři (15 %)',
    'Závěrečná písemná zkouška (25 %)',
    'Docházka: max. 2 absence',
    '',
    'Sylabus',
    `1. týden (${dm(teaching)}): Úvod – co je obsahová analýza`,
    `4. týden (${dm(addDays(teaching, 21))}): Kódovací kniha a jednotky analýzy`,
    `7. týden (${dm(addDays(teaching, 42))}): Průběžný test, reliabilita kódování`,
  ].join('\n');
}

/** Podmínky zakončení ukázkových předmětů (termíny podle začátku výuky). */
function demoConditions(code: string, teaching: Date): string[] {
  const w = (week: number, day = 1) => d(addDays(teaching, (week - 1) * 7 + day));
  switch (code) {
    case 'JSB065':
      return [
        `Průběžný test (20 %) – ${w(7)} v 14:00`,
        `Seminární práce (40 %) – odevzdání do ${w(11, 6)} přes Moodle`,
        'Prezentace výzkumného designu v semináři (15 %)',
        'Závěrečná písemná zkouška (25 %)',
        'Docházka: max. 2 absence.',
      ];
    case 'JSB022':
      return [
        'Reflexe četby (30 %) – pět krátkých reflexí během semestru.',
        `Esej (30 %) – odevzdání do ${w(8, 6)}.`,
        'Písemná zkouška (40 %). Ke zkoušce je nutné získat alespoň 60 % bodů z průběžných částí.',
        'Aktivní účast na seminářích (max. 3 absence).',
      ];
    case 'JPB140':
      return ['Referát v semináři (25 %).', `Kolokvium ${w(9, 2)} (25 %).`, 'Zkouška (50 %).', 'Krátká písemná reflexe přečteného textu před každým seminářem.'];
    case 'JSB110':
      return ['Domácí úkoly (50 %) – čtyři úkoly odevzdávané přes Moodle.', `Zápočtový test ${w(13, 3)} v 10:00 (50 %).`, 'Docházka na cvičení je povinná (max. 2 absence).'];
    default:
      return [`Anotace odborného článku (30 %) – do ${w(5, 6)}.`, `Rešerše literatury (30 %) – do ${w(8, 6)}.`, `Závěrečná práce (40 %) – odevzdání do ${w(13, 6)}.`, 'Aktivní účast na seminářích.'];
  }
}

/** Ukázková stránka předmětu ve SISu (stejná struktura jako skutečná veřejná stránka). */
export function buildDemoSisPage(query: { code?: string; name?: string }, now: Date): { code: string; url: string; text: string; candidates: string[] } {
  const key = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const subject = DEMO_SUBJECTS.find((s) => (query.code && s.code === query.code.toUpperCase()) || (query.name && key(s.name) === key(query.name)));
  if (!subject) throw new Error(`Předmět ${query.code ?? `„${query.name}“`} v ukázkovém SISu není – skutečná data ho najdou po přepnutí na živý režim.`);
  const ay = academicYearStart(now);
  const teaching = mondayOnOrAfter(new Date(ay, 8, 26));
  const edited = `Poslední úprava: ${subject.teacher} (${d(addDays(teaching, -14))})`;
  const text = [
    'Popis předmětu',
    `${subject.name} - ${subject.code}`,
    'Anglický název:',
    subject.name,
    'Semestr:',
    'zimní',
    'E-Kredity:',
    String(subject.credits),
    'Rozsah, examinace:',
    `zimní s.:2/1, ${subject.completion} [HT]`,
    'Jazyk výuky:',
    'čeština',
    'Garant:',
    subject.teacher,
    'Vyučující:',
    subject.teacher,
    'Anotace -',
    `Kurz ${subject.name.toLowerCase()} seznamuje studenty se základními pojmy, metodami a aktuální debatou v oboru.`,
    edited,
    'Podmínky zakončení předmětu',
    ...demoConditions(subject.code, teaching),
    edited,
    'Sylabus -',
    `1. týden (${dm(teaching)}): Úvod do předmětu`,
    `6. týden (${dm(addDays(teaching, 35))}): Průběžné opakování`,
    `12. týden (${dm(addDays(teaching, 77))}): Shrnutí a příprava na zkoušku`,
    edited,
    'Literatura',
    'McQUAIL, Denis. Teorie masové komunikace. Praha: Portál, 2009.',
  ].join('\n');
  return { code: subject.code, url: `https://is.cuni.cz/studium/predmety/index.php?do=predmet&kod=${subject.code}`, text, candidates: [subject.code] };
}

function icsDate(date: Date, h: number, m: number): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(h)}${pad2(m)}00`;
}

/** Ukázkový export rozvrhu (iCal) ve stylu SISu – týdenní RRULE v pásmu Europe/Prague. */
export function buildDemoIcs(now: Date): string {
  const monday = addDays(startOfWeek(now), -7);
  const ay = academicYearStart(now);
  const teaching = mondayOnOrAfter(new Date(ay, 8, 26));
  const teachingEnd = addDays(teaching, 14 * 7 + 4);
  const minimum = addDays(monday, 12 * 7);
  const until = teachingEnd > minimum ? teachingEnd : minimum;
  const untilStr = `${until.getFullYear()}${pad2(until.getMonth() + 1)}${pad2(until.getDate())}T225959Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Univerzita Karlova//SIS Rozvrh//CS',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Můj rozvrh (SIS)',
    'X-WR-TIMEZONE:Europe/Prague',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Prague',
    'BEGIN:STANDARD',
    'DTSTART:19701025T030000',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700329T020000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ];
  const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR'];
  let n = 0;
  for (let day = 0; day < 5; day++) {
    for (const slot of WEEK_TEMPLATE[day]) {
      const subject = DEMO_SUBJECTS.find((s) => s.id === slot.subjectId)!;
      const date = addDays(monday, day);
      const [h, m] = slot.start;
      const endMin = h * 60 + m + 80;
      lines.push(
        'BEGIN:VEVENT',
        `UID:sis-demo-${++n}@is.cuni.cz`,
        `DTSTART;TZID=Europe/Prague:${icsDate(date, h, m)}`,
        `DTEND;TZID=Europe/Prague:${icsDate(date, Math.floor(endMin / 60), endMin % 60)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${weekdays[day]};UNTIL=${untilStr}`,
        `SUMMARY:${subject.code} ${subject.name} (${slot.kind === 'lecture' ? 'přednáška' : 'seminář'})`,
        `LOCATION:${slot.location.replace(/,/g, '\\,')}`,
        `DESCRIPTION:Vyučující: ${subject.teacher.replace(/,/g, '\\,')}`,
        'END:VEVENT',
      );
    }
  }
  const thursday = addDays(monday, 3);
  lines.push(
    'BEGIN:VEVENT',
    'UID:sis-demo-law@is.cuni.cz',
    `DTSTART;TZID=Europe/Prague:${icsDate(thursday, 17, 0)}`,
    `DTEND;TZID=Europe/Prague:${icsDate(thursday, 18, 20)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=${untilStr}`,
    'SUMMARY:JSB140 Mediální právo (přednáška)',
    'LOCATION:H108 (Hollar)',
    'DESCRIPTION:Vyučující: JUDr. Martina Skálová',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}

function icsUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}00Z`;
}

/** Ukázkový export kalendáře Moodlu (Kalendář → Exportovat → URL kalendáře). */
export function buildDemoMoodleIcs(now: Date): string {
  const day = (d: number, h: number, m: number) => {
    const t = addDays(now, d);
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), h, m);
  };
  const items: [string, string, Date, string][] = [
    ['9001', 'Reflexe přednášky 6 is due', day(2, 23, 59), 'JSB022 Úvod do mediálních studií'],
    ['9002', 'Kvíz: Popisná statistika opens', day(4, 8, 0), 'JSB110 Statistika pro sociální vědy'],
    ['9003', 'Kvíz: Popisná statistika closes', day(6, 22, 0), 'JSB110 Statistika pro sociální vědy'],
    ['9004', 'Návrh kódovací knihy is due', day(9, 12, 0), 'JSB065 Analýza mediálních obsahů'],
  ];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024042200//EN'];
  for (const [id, summary, at, course] of items) {
    lines.push('BEGIN:VEVENT', `UID:${id}@dl1.cuni.cz`, `SUMMARY:${summary}`, `DTSTAMP:${icsUtc(now)}`, `DTSTART:${icsUtc(at)}`, `DTEND:${icsUtc(at)}`, `CATEGORIES:${course}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
