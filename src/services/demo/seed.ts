/**
 * Ukázková data sandboxu. Rozvrh a termíny jsou relativní k dnešku
 * (dnešní den má vždy seminář na Hollaru ve 14:00), harmonogram je
 * vázaný na kalendář aktuálního akademického roku.
 */
import type { Material, Milestone, Requirement, ScheduleEvent, Subject, SubjectColor, Task } from '../../types';
import { academicYearStart, addDays, atTime, mondayOnOrAfter, startOfDay, startOfWeek, toDateKey } from '../../lib/dates';
import { uid } from '../../lib/id';

export interface DemoSeed {
  subjects: Subject[];
  events: ScheduleEvent[];
  requirements: Requirement[];
  materials: Material[];
  milestones: Milestone[];
  tasks: Task[];
  seedDate: string;
}

interface SubjectDef {
  id: string;
  code: string;
  name: string;
  teacher: string;
  credits: number;
  completion: string;
  color: SubjectColor;
  moodleCourseId?: number;
}

export const DEMO_SUBJECTS: SubjectDef[] = [
  { id: 'demo-amo', code: 'JSB065', name: 'Analýza mediálních obsahů', teacher: 'Mgr. Tereza Vlčková, Ph.D.', credits: 6, completion: 'Z+Zk', color: 'indigo', moodleCourseId: 101 },
  { id: 'demo-ums', code: 'JSB022', name: 'Úvod do mediálních studií', teacher: 'doc. PhDr. Jan Kořínek, Ph.D.', credits: 6, completion: 'Zk', color: 'emerald', moodleCourseId: 102 },
  { id: 'demo-pol', code: 'JPB140', name: 'Politický systém ČR', teacher: 'PhDr. Alena Šindelářová, Ph.D.', credits: 5, completion: 'Z+Zk', color: 'amber' },
  { id: 'demo-stat', code: 'JSB110', name: 'Statistika pro sociální vědy', teacher: 'RNDr. Petr Hrubeš', credits: 5, completion: 'Z', color: 'sky', moodleCourseId: 103 },
  { id: 'demo-akp', code: 'JSB123', name: 'Akademické psaní', teacher: 'Mgr. Ondřej Zeman', credits: 3, completion: 'Z', color: 'rose' },
];

interface Slot {
  subjectId: string;
  kind: 'lecture' | 'seminar';
  start: [number, number];
  location: string;
}

/** Týdenní šablona (0 = pondělí). Výukové bloky FSV: 80 min + 10 min přestávka. */
export const WEEK_TEMPLATE: Record<number, Slot[]> = {
  0: [
    { subjectId: 'demo-amo', kind: 'lecture', start: [9, 30], location: 'H108 (Hollar)' },
    { subjectId: 'demo-pol', kind: 'seminar', start: [14, 0], location: 'J2011 (Jinonice)' },
  ],
  1: [
    { subjectId: 'demo-stat', kind: 'seminar', start: [9, 30], location: 'J2017 (Jinonice)' },
    { subjectId: 'demo-amo', kind: 'seminar', start: [14, 0], location: 'H212 (Hollar)' },
    { subjectId: 'demo-ums', kind: 'lecture', start: [15, 30], location: 'H108 (Hollar)' },
  ],
  2: [
    { subjectId: 'demo-pol', kind: 'lecture', start: [9, 30], location: 'J3093 (Jinonice)' },
    { subjectId: 'demo-akp', kind: 'seminar', start: [12, 30], location: 'Opletalova 26, místnost 314' },
  ],
  3: [
    { subjectId: 'demo-ums', kind: 'seminar', start: [11, 0], location: 'H201 (Hollar)' },
    { subjectId: 'demo-stat', kind: 'lecture', start: [15, 30], location: 'J3014 (Jinonice)' },
  ],
  4: [],
};

const KIND_LABEL = { lecture: 'přednáška', seminar: 'seminář' } as const;

const BUILDING_BY_LOCATION = (location: string) => (location.includes('Hollar') ? 'hollar' : location.includes('Jinonice') ? 'jinonice' : 'opletalova');

function eventFromSlot(slot: Slot, day: Date): ScheduleEvent {
  const subject = DEMO_SUBJECTS.find((s) => s.id === slot.subjectId)!;
  const start = atTime(day, slot.start[0], slot.start[1]);
  const end = new Date(start.getTime() + 80 * 60_000);
  const room = /^([A-Z]\d{3,4})/.exec(slot.location)?.[1] ?? (slot.location.includes('314') ? '314' : undefined);
  return {
    id: `demo-ev-${slot.subjectId}-${toDateKey(day)}-${slot.start.join('')}`,
    subjectId: slot.subjectId,
    title: `${subject.name} – ${KIND_LABEL[slot.kind]}`,
    kind: slot.kind,
    start: start.toISOString(),
    end: end.toISOString(),
    location: slot.location,
    room,
    buildingId: BUILDING_BY_LOCATION(slot.location),
    teacher: subject.teacher,
    source: 'demo',
  };
}

function buildEvents(today: Date): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const weekStart = startOfWeek(today);
  const todayKey = toDateKey(today);
  for (let w = -1; w <= 2; w++) {
    for (let d = 0; d < 5; d++) {
      const day = addDays(weekStart, w * 7 + d);
      if (toDateKey(day) === todayKey) continue;
      for (const slot of WEEK_TEMPLATE[d]) events.push(eventFromSlot(slot, day));
    }
  }
  // Dnešek má vždy „úterní“ sestavu – seminář na Hollaru ve 14:00 je hlavní scénář sandboxu.
  for (const slot of WEEK_TEMPLATE[1]) events.push(eventFromSlot(slot, startOfDay(today)));
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

function at(today: Date, dayOffset: number, h: number, m: number): string {
  return atTime(addDays(today, dayOffset), h, m).toISOString();
}

function tasks(items: [string, boolean][]) {
  return items.map(([title, done]) => ({ id: uid('st'), title, done }));
}

function buildRequirements(today: Date, nowIso: string): Requirement[] {
  const r = (partial: Omit<Requirement, 'id' | 'createdAt' | 'done'> & { done?: boolean; id?: string }): Requirement => ({
    id: partial.id ?? uid('req'),
    createdAt: nowIso,
    done: partial.done ?? false,
    ...partial,
  });
  return [
    r({
      id: 'demo-req-amo-paper',
      subjectId: 'demo-amo',
      title: 'Seminární práce: rámcování migrace v TV zpravodajství',
      type: 'assignment',
      weight: 40,
      deadline: at(today, 2, 23, 59),
      source: 'moodle',
      externalId: 'moodle:assign:9001',
      url: 'https://dl1.cuni.cz/mod/assign/view.php?id=480011',
      description: 'Kvantitativní obsahová analýza 60 reportáží hlavních zpravodajských relací (rozsah 15–20 normostran).',
      subtasks: tasks([
        ['Vybrat téma a schválit u vyučující', true],
        ['Rešerše literatury (min. 8 zdrojů)', true],
        ['Sestavit kódovací knihu', true],
        ['Okódovat vzorek 60 reportáží', false],
        ['Napsat první verzi', false],
        ['Odevzdat na Moodle', false],
      ]),
    }),
    r({
      id: 'demo-req-amo-test',
      subjectId: 'demo-amo',
      title: 'Průběžný test – kvantitativní obsahová analýza',
      type: 'test',
      weight: 20,
      deadline: at(today, 7, 14, 0),
      source: 'moodle',
      externalId: 'moodle:quiz:7001',
      subtasks: tasks([
        ['Projít prezentace 1–5', true],
        ['Výpisky ke kódování a reliabilitě', false],
        ['Procvičit modelový test', false],
      ]),
    }),
    r({
      subjectId: 'demo-amo',
      title: 'Prezentace výzkumného designu',
      type: 'presentation',
      weight: 15,
      deadline: at(today, -6, 14, 0),
      source: 'manual',
      subtasks: tasks([
        ['Připravit osnovu', true],
        ['Vytvořit slidy', true],
        ['Odprezentovat v semináři', true],
      ]),
    }),
    r({
      subjectId: 'demo-amo',
      title: 'Závěrečná zkouška',
      type: 'exam',
      weight: 25,
      deadline: at(today, 72, 9, 0),
      source: 'manual',
      subtasks: tasks([
        ['Přihlásit se na termín v SISu', false],
        ['Projít okruhy ke zkoušce', false],
        ['Zopakovat materiály z Moodlu', false],
      ]),
    }),
    r({
      id: 'demo-req-ums-reflections',
      subjectId: 'demo-ums',
      title: 'Reflexe četby (5 reflexí)',
      type: 'assignment',
      weight: 30,
      deadline: at(today, 0, 23, 59),
      source: 'moodle',
      externalId: 'moodle:assign:9010',
      url: 'https://dl1.cuni.cz/mod/assign/view.php?id=480120',
      subtasks: tasks([
        ['Reflexe 1 – Teorie médií', true],
        ['Reflexe 2 – Agenda-setting', true],
        ['Reflexe 3 – Gatekeeping', true],
        ['Reflexe 4 – Framing (dnes do půlnoci)', false],
        ['Reflexe 5 – Mediální publika', false],
      ]),
    }),
    r({
      subjectId: 'demo-ums',
      title: 'Esej: Proměny zpravodajství v digitální éře',
      type: 'assignment',
      weight: 30,
      deadline: at(today, 10, 23, 59),
      source: 'manual',
      subtasks: tasks([
        ['Osnova', true],
        ['První verze', false],
        ['Korektura a citace', false],
        ['Odevzdat na Moodle', false],
      ]),
    }),
    r({
      subjectId: 'demo-ums',
      title: 'Zkouška – písemný test',
      type: 'exam',
      weight: 40,
      deadline: at(today, 60, 10, 0),
      source: 'manual',
      subtasks: tasks([
        ['Přihlásit se na termín v SISu', false],
        ['Projít okruhy ke zkoušce', false],
      ]),
    }),
    r({
      id: 'demo-req-pol-talk',
      subjectId: 'demo-pol',
      title: 'Referát: volební systém do Senátu',
      type: 'presentation',
      weight: 25,
      deadline: at(today, 1, 14, 0),
      source: 'manual',
      subtasks: tasks([
        ['Rešerše zdrojů', true],
        ['Osnova', true],
        ['Slidy', false],
        ['Nacvičit (10 min)', false],
      ]),
    }),
    r({
      subjectId: 'demo-pol',
      title: 'Kolokvium',
      type: 'test',
      weight: 25,
      deadline: at(today, 13, 14, 0),
      source: 'manual',
      subtasks: tasks([
        ['Přečíst povinnou literaturu', false],
        ['Připravit otázky do diskuse', false],
      ]),
    }),
    r({
      subjectId: 'demo-pol',
      title: 'Zkouška',
      type: 'exam',
      weight: 50,
      deadline: at(today, 65, 9, 30),
      source: 'manual',
      subtasks: tasks([['Přihlásit se na termín v SISu', false]]),
    }),
    r({
      subjectId: 'demo-stat',
      title: 'Domácí úkoly 1–3',
      type: 'assignment',
      weight: 30,
      deadline: at(today, -8, 23, 59),
      source: 'moodle',
      subtasks: tasks([
        ['DÚ 1 – Popisná statistika', true],
        ['DÚ 2 – Pravděpodobnost', true],
        ['DÚ 3 – Testy hypotéz', true],
      ]),
    }),
    r({
      id: 'demo-req-stat-hw4',
      subjectId: 'demo-stat',
      title: 'Domácí úkol 4 – regresní analýza',
      type: 'assignment',
      weight: 20,
      deadline: at(today, 4, 23, 59),
      source: 'moodle',
      externalId: 'moodle:assign:9101',
      url: 'https://dl1.cuni.cz/mod/assign/view.php?id=480301',
      subtasks: tasks([
        ['Stáhnout dataset z Moodlu', true],
        ['Odhadnout regresní model', true],
        ['Interpretovat koeficienty', false],
        ['Odevzdat PDF na Moodle', false],
      ]),
    }),
    r({
      subjectId: 'demo-stat',
      title: 'Zápočtový test',
      type: 'test',
      weight: 50,
      deadline: at(today, 20, 9, 30),
      source: 'manual',
      subtasks: tasks([
        ['Zopakovat popisnou statistiku', true],
        ['Procvičit testy hypotéz', false],
      ]),
    }),
    r({
      subjectId: 'demo-akp',
      title: 'Anotace odborného článku',
      type: 'assignment',
      weight: 30,
      deadline: at(today, -12, 23, 59),
      source: 'manual',
      done: true,
      subtasks: [],
    }),
    r({
      subjectId: 'demo-akp',
      title: 'Rešerše a bibliografie (ČSN ISO 690)',
      type: 'assignment',
      weight: 30,
      deadline: at(today, 5, 23, 59),
      source: 'manual',
      subtasks: tasks([
        ['Najít 10 zdrojů v katalogu knihovny', true],
        ['Zapsat citace', true],
        ['Zkontrolovat citační normu', false],
      ]),
    }),
    r({
      subjectId: 'demo-akp',
      title: 'Závěrečná práce',
      type: 'assignment',
      weight: 40,
      deadline: at(today, 30, 23, 59),
      source: 'manual',
      subtasks: tasks([
        ['Téma', true],
        ['Osnova', false],
        ['Text', false],
        ['Odevzdat', false],
      ]),
    }),
  ];
}

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function moodleFile(
  subjectId: string,
  section: string,
  title: string,
  fileName: string,
  mimeType: string,
  size: number,
  contextId: number,
  nowIso: string,
  requirementId?: string,
): Material {
  return {
    id: uid('mat'),
    subjectId,
    requirementId,
    kind: 'moodle-file',
    title,
    fileName,
    mimeType,
    size,
    url: `https://dl1.cuni.cz/webservice/pluginfile.php/${contextId}/mod_resource/content/1/${encodeURIComponent(fileName)}`,
    section,
    externalId: `moodle:file:${contextId}:${fileName}`,
    source: 'moodle',
    createdAt: nowIso,
  };
}

function buildMaterials(nowIso: string): Material[] {
  return [
    moodleFile('demo-amo', 'Týden 1 – Úvod do obsahové analýzy', '01 Úvod do obsahové analýzy', '01_Uvod_obsahova_analyza.pptx', PPTX, 2_480_000, 552101, nowIso),
    moodleFile('demo-amo', 'Týden 1 – Úvod do obsahové analýzy', 'Sylabus JSB065 – ZS', 'Sylabus_JSB065.pdf', 'application/pdf', 312_000, 552102, nowIso),
    moodleFile('demo-amo', 'Týden 4 – Kódovací kniha', '04 Kódovací kniha a jednotky analýzy', '04_Kodovaci_kniha.pptx', PPTX, 3_120_000, 552141, nowIso),
    moodleFile('demo-amo', 'Týden 4 – Kódovací kniha', 'Vzor kódovací knihy', 'Vzor_kodovaci_knihy.xlsx', XLSX, 48_000, 552142, nowIso, 'demo-req-amo-paper'),
    moodleFile('demo-amo', 'Týden 5 – Reliabilita kódování', '05 Reliabilita a interkodérská shoda', '05_Reliabilita.pdf', 'application/pdf', 1_210_000, 552151, nowIso, 'demo-req-amo-test'),
    moodleFile('demo-amo', 'Seminární práce', 'Zadání seminární práce', 'Zadani_seminarni_prace.pdf', 'application/pdf', 180_000, 552190, nowIso, 'demo-req-amo-paper'),
    {
      id: uid('mat'),
      subjectId: 'demo-amo',
      requirementId: 'demo-req-amo-paper',
      kind: 'note',
      title: 'Poznámky k seminárce',
      markdown:
        '## Výzkumné otázky\n1. Jak často se objevuje **bezpečnostní rámec**?\n2. Liší se rámcování mezi veřejnoprávní a komerční TV?\n\n## Vzorek\n- 60 reportáží (30 + 30), období září–říjen\n- jednotka analýzy: reportáž\n\n## Zbývá\n- [x] kódovací kniha\n- [ ] pilotní kódování 10 reportáží\n- [ ] spočítat Krippendorffovo alfa\n',
      source: 'manual',
      createdAt: nowIso,
    },
    {
      id: uid('mat'),
      subjectId: 'demo-amo',
      requirementId: 'demo-req-amo-paper',
      kind: 'link',
      title: 'Seminárka – pracovní verze (Google Docs)',
      url: 'https://docs.google.com/document/u/0/',
      source: 'manual',
      createdAt: nowIso,
    },
    moodleFile('demo-ums', 'Týden 1 – Úvod', 'Sylabus a podmínky zakončení', 'Sylabus_JSB022.pdf', 'application/pdf', 268_000, 553101, nowIso),
    moodleFile('demo-ums', 'Týden 3 – Agenda-setting', '03 Agenda-setting', '03_Agenda_setting.pptx', PPTX, 4_210_000, 553131, nowIso),
    moodleFile('demo-ums', 'Týden 5 – Gatekeeping a framing', '05 Gatekeeping a framing', '05_Gatekeeping_framing.pptx', PPTX, 3_840_000, 553151, nowIso, 'demo-req-ums-reflections'),
    moodleFile('demo-ums', 'Povinná četba', 'Čítanka – zimní semestr', 'Citanka_ZS.pdf', 'application/pdf', 8_620_000, 553199, nowIso),
    moodleFile('demo-stat', 'Týden 7 – Lineární regrese', '07 Lineární regrese', '07_Linearni_regrese.pdf', 'application/pdf', 2_200_000, 554171, nowIso),
    moodleFile('demo-stat', 'Týden 7 – Lineární regrese', 'Dataset pro DÚ 4', 'DU4_dataset.csv', 'text/csv', 640_000, 554172, nowIso, 'demo-req-stat-hw4'),
    {
      id: uid('mat'),
      subjectId: 'demo-pol',
      requirementId: 'demo-req-pol-talk',
      kind: 'note',
      title: 'Osnova referátu',
      markdown:
        '### Volební systém do Senátu\n- **dvoukolový většinový** systém, 81 jednomandátových obvodů\n- volí se každé 2 roky ⅓ senátorů\n- srovnání s Poslaneckou sněmovnou (poměrný systém)\n\n> Připravit graf účasti ve 2. kole.',
      source: 'manual',
      createdAt: nowIso,
    },
  ];
}

/** Harmonogram akademického roku (typické termíny UK, odvozené od kalendáře). */
export function buildAcademicYearMilestones(ayStart: number): Milestone[] {
  const teachingStart = mondayOnOrAfter(new Date(ayStart, 8, 26));
  const teachingEnd = addDays(teachingStart, 14 * 7 + 4);
  const examStart = mondayOnOrAfter(addDays(teachingEnd, 1));
  const examEnd = addDays(examStart, 5 * 7 + 4);
  const summerStart = mondayOnOrAfter(addDays(examEnd, 1));
  const summerEnd = addDays(summerStart, 13 * 7 + 4);
  const summerExamStart = mondayOnOrAfter(addDays(summerEnd, 1));
  const summerExamEnd = new Date(ayStart + 1, 8, 25);
  const enrollmentStart = mondayOnOrAfter(new Date(ayStart, 8, 1));
  const m = (title: string, category: Milestone['category'], start: Date, end?: Date, note?: string): Milestone => ({
    id: uid('ms'),
    title,
    category,
    start: toDateKey(start),
    end: end ? toDateKey(end) : undefined,
    allDay: true,
    source: 'demo',
    note,
  });
  return [
    m('Zápis předmětů (1. kolo)', 'enrollment', enrollmentStart, addDays(enrollmentStart, 20)),
    m('Výuka v zimním semestru', 'teaching', teachingStart, teachingEnd),
    m('Zahájení akademického roku', 'semester', new Date(ayStart, 9, 1)),
    m('Škrtání předmětů (konec změn zápisu)', 'enrollment', addDays(teachingStart, 20)),
    m('Den boje za svobodu a demokracii – volno', 'holiday', new Date(ayStart, 10, 17)),
    m('Děkanský den (výuka se nekoná)', 'holiday', addDays(teachingStart, 8 * 7 + 2)),
    m('Vánoční prázdniny', 'holiday', new Date(ayStart, 11, 21), new Date(ayStart + 1, 0, 3)),
    m('Zkouškové období ZS', 'exam-period', examStart, examEnd),
    m('Mezní termín pro splnění povinností ZS', 'deadline', examEnd),
    m('Výuka v letním semestru', 'teaching', summerStart, summerEnd),
    m('Rektorský sportovní den', 'holiday', addDays(summerStart, 11 * 7 + 2)),
    m('Zkouškové období LS', 'exam-period', summerExamStart, summerExamEnd),
    m('Mezní termín pro splnění studijních povinností', 'deadline', summerExamEnd),
  ];
}

/** Vlastní úkoly a osobní události studenta (ukázka obousměrné synchronizace s Googlem). */
function buildPersonal(today: Date, nowIso: string): { tasks: Task[]; events: ScheduleEvent[] } {
  const tasks: Task[] = [
    { id: 'demo-task-knihy', title: 'Vrátit knihy do knihovny v Jinonicích', due: atTime(addDays(today, 1), 17, 0).toISOString(), done: false, priority: 'high', source: 'manual', createdAt: nowIso, updatedAt: nowIso },
    { id: 'demo-task-litacka', title: 'Prodloužit lítačku', due: toDateKey(addDays(today, 3)), done: false, source: 'manual', createdAt: nowIso, updatedAt: nowIso },
    { id: 'demo-task-vedouci', title: 'Napsat vedoucí kvůli tématu práce', done: false, subjectId: 'demo-akp', source: 'manual', createdAt: nowIso, updatedAt: nowIso },
    { id: 'demo-task-kolej', title: 'Zaplatit kolej', due: toDateKey(addDays(today, -1)), done: true, completedAt: atTime(addDays(today, -1), 20, 0).toISOString(), source: 'manual', createdAt: nowIso, updatedAt: nowIso },
  ];
  const events: ScheduleEvent[] = [
    { id: 'demo-personal-volejbal', title: 'Volejbal', kind: 'personal', start: atTime(today, 19, 0).toISOString(), end: atTime(today, 20, 30).toISOString(), location: 'Hala Juliska', source: 'manual', createdAt: nowIso, updatedAt: nowIso },
    { id: 'demo-personal-kafe', title: 'Kafe s Aničkou', kind: 'personal', start: atTime(addDays(today, 1), 17, 30).toISOString(), end: atTime(addDays(today, 1), 18, 30).toISOString(), location: 'Kavárna Místo', source: 'manual', createdAt: nowIso, updatedAt: nowIso },
  ];
  return { tasks, events };
}

export function createDemoSeed(now: Date): DemoSeed {
  const today = startOfDay(now);
  const nowIso = now.toISOString();
  const mark = <T extends object>(items: T[]): T[] => items.map((item) => ({ ...item, demo: true }));
  const personal = buildPersonal(today, nowIso);
  return {
    subjects: DEMO_SUBJECTS.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      color: s.color,
      teacher: s.teacher,
      credits: s.credits,
      completion: s.completion,
      source: 'demo',
      moodleCourseId: s.moodleCourseId,
      moodleCourseUrl: s.moodleCourseId ? `https://dl1.cuni.cz/course/view.php?id=${s.moodleCourseId}` : undefined,
      createdAt: nowIso,
      demo: true,
    })),
    events: mark([...buildEvents(today), ...personal.events]).sort((a, b) => a.start.localeCompare(b.start)),
    requirements: mark(buildRequirements(today, nowIso)),
    materials: mark(buildMaterials(nowIso)),
    milestones: buildAcademicYearMilestones(academicYearStart(today)),
    tasks: mark(personal.tasks),
    seedDate: toDateKey(today),
  };
}
