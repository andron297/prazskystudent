/**
 * Simulovaný Moodle (sandbox). Odpovídá stejným tvarem jako skutečné webové
 * služby, takže demo prochází úplně stejnou synchronizační logikou.
 */
import { addDays, atTime, startOfDay } from '../../lib/dates';
import { ApiError, sleep } from '../http';
import type {
  MoodleActionEventsResponse,
  MoodleAssignmentsResponse,
  MoodleClient,
  MoodleCourse,
  MoodleSection,
  MoodleSiteInfo,
} from '../moodle';
import { normalizeMoodleUrl } from '../moodle';

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function file(contextId: number, filename: string, filesize: number, mimetype: string) {
  return {
    type: 'file',
    filename,
    filesize,
    mimetype,
    fileurl: `https://dl1.cuni.cz/webservice/pluginfile.php/${contextId}/mod_resource/content/1/${encodeURIComponent(filename)}`,
  };
}

function resource(id: number, name: string, contextId: number, filename: string, filesize: number, mimetype: string) {
  return { id, name, modname: 'resource', contents: [file(contextId, filename, filesize, mimetype)] };
}

export class DemoMoodleClient implements MoodleClient {
  readonly isDemo = true;
  readonly baseUrl: string;
  private readonly token: string;
  private readonly now: () => Date;

  constructor(baseUrl: string, token: string, now: () => Date) {
    this.baseUrl = normalizeMoodleUrl(baseUrl || 'https://dl1.cuni.cz');
    this.token = token;
    this.now = now;
  }

  private ts(dayOffset: number, h: number, m: number): number {
    return Math.floor(atTime(addDays(startOfDay(this.now()), dayOffset), h, m).getTime() / 1000);
  }

  async call<T>(wsfunction: string, params: Record<string, unknown> = {}): Promise<T> {
    await sleep(280 + Math.round(Math.random() * 420));
    if (!this.token.trim() || this.token.trim().toLowerCase() === 'invalid') {
      throw new ApiError(401, 'invalidtoken', 'Neplatný token webové služby (simulace sandboxu).');
    }
    switch (wsfunction) {
      case 'core_webservice_get_site_info':
        return this.siteInfo() as T;
      case 'core_enrol_get_users_courses':
        return this.courses() as T;
      case 'mod_assign_get_assignments':
        return this.assignments() as T;
      case 'core_calendar_get_action_events_by_timesort':
        return this.actionEvents() as T;
      case 'core_course_get_contents':
        return this.contents(Number(params.courseid)) as T;
      default:
        throw new ApiError(400, 'function_not_allowed', `Funkce ${wsfunction} není v sandboxu dostupná.`);
    }
  }

  private siteInfo(): MoodleSiteInfo {
    return {
      sitename: 'Moodle UK – sandbox',
      username: 'student',
      firstname: 'Jana',
      lastname: 'Studentová',
      fullname: 'Jana Studentová',
      userid: 4242,
      siteurl: this.baseUrl,
      release: '4.5.2',
    };
  }

  private courses(): MoodleCourse[] {
    return [
      { id: 101, shortname: 'JSB065', idnumber: 'JSB065', fullname: 'JSB065 Analýza mediálních obsahů – ZS', visible: 1 },
      { id: 102, shortname: 'JSB022', idnumber: 'JSB022', fullname: 'JSB022 Úvod do mediálních studií – ZS', visible: 1 },
      { id: 103, shortname: 'JSB110', idnumber: 'JSB110', fullname: 'JSB110 Statistika pro sociální vědy – ZS', visible: 1 },
      { id: 104, shortname: 'JSB140', idnumber: 'JSB140', fullname: 'JSB140 Mediální právo – ZS', visible: 1 },
    ];
  }

  private assignments(): MoodleAssignmentsResponse {
    return {
      courses: [
        {
          id: 101,
          assignments: [
            {
              id: 9001,
              cmid: 480011,
              course: 101,
              name: 'Seminární práce: rámcování migrace v TV zpravodajství',
              duedate: this.ts(2, 23, 59),
              intro: '<p>Kvantitativní obsahová analýza 60 reportáží hlavních zpravodajských relací (rozsah 15–20 normostran).</p>',
              introattachments: [
                {
                  filename: 'Zadani_seminarni_prace.pdf',
                  filesize: 180_000,
                  mimetype: 'application/pdf',
                  fileurl: 'https://dl1.cuni.cz/webservice/pluginfile.php/552190/mod_resource/content/1/Zadani_seminarni_prace.pdf',
                },
              ],
            },
          ],
        },
        {
          id: 102,
          assignments: [{ id: 9010, cmid: 480120, course: 102, name: 'Reflexe četby (5 reflexí)', duedate: this.ts(0, 23, 59) }],
        },
        {
          id: 103,
          assignments: [
            { id: 9101, cmid: 480301, course: 103, name: 'Domácí úkol 4 – regresní analýza', duedate: this.ts(4, 23, 59) },
            { id: 9102, cmid: 480302, course: 103, name: 'Domácí úkol 5 – logistická regrese', duedate: this.ts(11, 23, 59) },
          ],
        },
        {
          id: 104,
          assignments: [
            {
              id: 9201,
              cmid: 480401,
              course: 104,
              name: 'Případová studie: ochrana osobnosti v médiích',
              duedate: this.ts(9, 12, 0),
              intro: '<p>Analyzujte jeden soudní spor o ochranu osobnosti (3–5 normostran).</p>',
            },
          ],
        },
      ],
      warnings: [],
    };
  }

  private actionEvents(): MoodleActionEventsResponse {
    return {
      events: [
        {
          id: 1,
          name: 'Průběžný test – kvantitativní obsahová analýza se otevírá',
          modulename: 'quiz',
          instance: 7001,
          timestart: this.ts(7, 14, 0),
          course: { id: 101, shortname: 'JSB065' },
          url: 'https://dl1.cuni.cz/mod/quiz/view.php?id=480015',
        },
        {
          id: 2,
          name: 'Kvíz 1 – Svoboda projevu se otevírá',
          modulename: 'quiz',
          instance: 7101,
          timestart: this.ts(6, 20, 0),
          course: { id: 104, shortname: 'JSB140' },
          url: 'https://dl1.cuni.cz/mod/quiz/view.php?id=480410',
        },
        {
          id: 3,
          name: 'Domácí úkol 4 – regresní analýza je k odevzdání',
          modulename: 'assign',
          instance: 9101,
          timestart: this.ts(4, 23, 59),
          course: { id: 103, shortname: 'JSB110' },
        },
      ],
    };
  }

  private contents(courseId: number): MoodleSection[] {
    switch (courseId) {
      case 101:
        return [
          {
            id: 1,
            name: 'Týden 1 – Úvod do obsahové analýzy',
            modules: [
              resource(11, '01 Úvod do obsahové analýzy', 552101, '01_Uvod_obsahova_analyza.pptx', 2_480_000, PPTX),
              resource(12, 'Sylabus JSB065 – ZS', 552102, 'Sylabus_JSB065.pdf', 312_000, 'application/pdf'),
            ],
          },
          {
            id: 4,
            name: 'Týden 4 – Kódovací kniha',
            modules: [
              resource(41, '04 Kódovací kniha a jednotky analýzy', 552141, '04_Kodovaci_kniha.pptx', 3_120_000, PPTX),
              resource(42, 'Vzor kódovací knihy', 552142, 'Vzor_kodovaci_knihy.xlsx', 48_000, XLSX),
            ],
          },
          {
            id: 5,
            name: 'Týden 5 – Reliabilita kódování',
            modules: [resource(51, '05 Reliabilita a interkodérská shoda', 552151, '05_Reliabilita.pdf', 1_210_000, 'application/pdf')],
          },
          {
            id: 6,
            name: 'Týden 6 – Analýza rámců',
            modules: [
              resource(61, '06 Framing: od teorie ke kódování', 552161, '06_Framing_analyza.pptx', 2_950_000, PPTX),
              { id: 62, name: 'Diskusní fórum k seminární práci', modname: 'forum' },
            ],
          },
          {
            id: 9,
            name: 'Seminární práce',
            modules: [
              { id: 480011, name: 'Odevzdávárna seminární práce', modname: 'assign' },
              resource(91, 'Zadání seminární práce', 552190, 'Zadani_seminarni_prace.pdf', 180_000, 'application/pdf'),
            ],
          },
        ];
      case 102:
        return [
          {
            id: 1,
            name: 'Týden 1 – Úvod',
            modules: [resource(111, 'Sylabus a podmínky zakončení', 553101, 'Sylabus_JSB022.pdf', 268_000, 'application/pdf')],
          },
          {
            id: 3,
            name: 'Týden 3 – Agenda-setting',
            modules: [resource(131, '03 Agenda-setting', 553131, '03_Agenda_setting.pptx', 4_210_000, PPTX)],
          },
          {
            id: 5,
            name: 'Týden 5 – Gatekeeping a framing',
            modules: [resource(151, '05 Gatekeeping a framing', 553151, '05_Gatekeeping_framing.pptx', 3_840_000, PPTX)],
          },
          {
            id: 7,
            name: 'Povinná četba',
            modules: [
              resource(171, 'Čítanka – zimní semestr', 553199, 'Citanka_ZS.pdf', 8_620_000, 'application/pdf'),
              {
                id: 172,
                name: 'Záznamy přednášek (stream)',
                modname: 'url',
                contents: [{ type: 'url', filename: 'Záznamy přednášek', fileurl: 'https://dl1.cuni.cz/mod/url/view.php?id=480199' }],
              },
            ],
          },
        ];
      case 103:
        return [
          {
            id: 7,
            name: 'Týden 7 – Lineární regrese',
            modules: [
              resource(271, '07 Lineární regrese', 554171, '07_Linearni_regrese.pdf', 2_200_000, 'application/pdf'),
              resource(272, 'Dataset pro DÚ 4', 554172, 'DU4_dataset.csv', 640_000, 'text/csv'),
            ],
          },
          {
            id: 8,
            name: 'Týden 8 – Logistická regrese',
            modules: [resource(281, '08 Logistická regrese', 554181, '08_Logisticka_regrese.pdf', 1_940_000, 'application/pdf')],
          },
        ];
      case 104:
        return [
          {
            id: 1,
            name: 'Týden 1 – Úvod do mediálního práva',
            modules: [
              resource(311, 'Sylabus JSB140', 555101, 'Sylabus_JSB140.pdf', 240_000, 'application/pdf'),
              resource(312, '01 Svoboda projevu a její meze', 555111, '01_Svoboda_projevu.pptx', 3_300_000, PPTX),
            ],
          },
        ];
      default:
        return [];
    }
  }
}
