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
