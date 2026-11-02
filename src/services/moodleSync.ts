/**
 * Synchronizace Moodlu → předměty, studijní povinnosti a materiály.
 *  1. core_webservice_get_site_info – ověření tokenu, userid
 *  2. core_enrol_get_users_courses – zapsané kurzy → předměty
 *  3. mod_assign_get_assignments – odevzdávárny a jejich deadliny
 *  4. core_calendar_get_action_events_by_timesort – testy, kvízy a další úkoly
 *  5. core_course_get_contents – prezentace, PDF a odkazy z týdenních sekcí
 * Existující položky se párují stabilním `externalId`, takže opakovaná
 * synchronizace nic nezdvojí a zachová odškrtané podúkoly.
 */
import type { Material, Requirement, Subject } from '../types';
import { nextSubjectColor } from '../lib/colors';
import { uid } from '../lib/id';
import { defaultSubtasks, guessRequirementType } from '../lib/progress';
import { extractSubjectCode, normalizeKey, stripHtml, truncate } from '../lib/text';
import { applyActivityToRequirement, normalizeGrade } from '../lib/moodlePage';
import type {
  MoodleActionEventsResponse,
  MoodleAssignmentsResponse,
  MoodleClient,
  MoodleCourse,
  MoodleSection,
  MoodleSiteInfo,
} from './moodle';

interface MoodleSubmissionStatus {
  lastattempt?: { submission?: { status?: string }; teamsubmission?: { status?: string } };
  feedback?: { gradefordisplay?: string };
}

export type MoodleSyncStep = 'site' | 'courses' | 'assignments' | 'events' | 'contents' | 'done';

export interface MoodleSyncProgress {
  step: MoodleSyncStep;
  label: string;
  count?: number;
}

export interface MoodleSyncResult {
  site: MoodleSiteInfo;
  subjects: Subject[];
  requirements: Requirement[];
  materials: Material[];
  stats: {
    courses: number;
    newSubjects: number;
    requirements: number;
    newRequirements: number;
    materials: number;
    newMaterials: number;
  };
}

export interface MoodleSyncExisting {
  subjects: Subject[];
  requirements: Requirement[];
  materials: Material[];
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  zip: 'application/zip',
  mp4: 'video/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
};

export function guessMime(fileName: string): string | undefined {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext];
}

export function cleanCourseName(course: MoodleCourse, code?: string): string {
  let name = course.fullname || course.displayname || course.shortname;
  if (code) name = name.replace(code, ' ');
  name = name
    .replace(/\((?:ZS|LS)[^)]*\)/gi, ' ')
    .replace(/\s[–-]\s*(?:ZS|LS)\b.*$/i, ' ')
    .replace(/\b(?:ZS|LS)\s*\d{4}\/\d{2,4}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s–\-:|]+|[\s–\-:|]+$/g, '')
    .trim();
  return name || course.shortname;
}

export function cleanEventName(name: string): string {
  return name
    .replace(/\s+(?:je k odevzdání|is due|se otevírá|otevírá se|opens|closes|se uzavírá|uzavírá se|končí|termín odevzdání)\s*$/i, '')
    .trim();
}

function contextIdFromUrl(url: string): string | undefined {
  return /pluginfile\.php\/(\d+)\//.exec(url)?.[1];
}

function stripToken(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('token');
    return parsed.toString();
  } catch {
    return url;
  }
}

export async function syncMoodle(
  client: MoodleClient,
  existing: MoodleSyncExisting,
  now: Date,
  onProgress: (p: MoodleSyncProgress) => void = () => undefined,
): Promise<MoodleSyncResult> {
  const nowIso = now.toISOString();
  onProgress({ step: 'site', label: 'Ověřuji token a účet' });
  const site = await client.call<MoodleSiteInfo>('core_webservice_get_site_info');

  onProgress({ step: 'courses', label: 'Načítám zapsané předměty' });
  const courses = await client.call<MoodleCourse[]>('core_enrol_get_users_courses', { userid: site.userid });
  const visibleCourses = courses.filter((c) => c.visible !== 0);
  onProgress({ step: 'courses', label: 'Předměty načteny', count: visibleCourses.length });

  // Kurzy → předměty
  const subjects = [...existing.subjects];
  const touchedSubjects = new Map<string, Subject>();
  const courseToSubject = new Map<number, Subject>();
  let newSubjects = 0;
  for (const course of visibleCourses) {
    const code = extractSubjectCode(course.idnumber, course.shortname, course.fullname);
    const name = cleanCourseName(course, code);
    let subject =
      subjects.find((s) => s.moodleCourseId === course.id) ??
      (code ? subjects.find((s) => s.code?.toUpperCase() === code.toUpperCase()) : undefined) ??
      subjects.find((s) => normalizeKey(s.name) === normalizeKey(name));
    const courseUrl = `${client.baseUrl}/course/view.php?id=${course.id}`;
    if (subject) {
      subject = { ...subject, moodleCourseId: course.id, moodleCourseUrl: courseUrl, code: subject.code ?? code };
      subjects[subjects.findIndex((s) => s.id === subject!.id)] = subject;
    } else {
      subject = {
        id: uid('subj'),
        code,
        name,
        color: nextSubjectColor(subjects.map((s) => s.color)),
        source: 'moodle',
        moodleCourseId: course.id,
        moodleCourseUrl: courseUrl,
        createdAt: nowIso,
      };
      subjects.push(subject);
      newSubjects++;
    }
    touchedSubjects.set(subject.id, subject);
    courseToSubject.set(course.id, subject);
  }

  const requirements = new Map<string, Requirement>();
  const byExternal = new Map(existing.requirements.filter((r) => r.externalId).map((r) => [r.externalId as string, r]));
  let newRequirements = 0;
  const upsertRequirement = (externalId: string, build: (prev?: Requirement) => Requirement) => {
    const prev = requirements.get(externalId) ?? byExternal.get(externalId);
    const next = build(prev);
    if (!prev) newRequirements++;
    requirements.set(externalId, next);
    return next;
  };

  const materials = new Map<string, Material>();
  const materialsByExternal = new Map(existing.materials.filter((m) => m.externalId).map((m) => [m.externalId as string, m]));
  let newMaterials = 0;
  const upsertMaterial = (externalId: string, build: (prev?: Material) => Material) => {
    const prev = materials.get(externalId) ?? materialsByExternal.get(externalId);
    if (!prev) newMaterials++;
    materials.set(externalId, build(prev));
  };

  // Odevzdávárny
  onProgress({ step: 'assignments', label: 'Načítám úkoly a odevzdávárny' });
  const courseIds = visibleCourses.map((c) => c.id);
  const assignmentData =
    courseIds.length > 0
      ? await client.call<MoodleAssignmentsResponse>('mod_assign_get_assignments', { courseids: courseIds })
      : { courses: [] };
  const assignInstances = new Set<number>();
  for (const course of assignmentData.courses ?? []) {
    const subject = courseToSubject.get(course.id);
    if (!subject) continue;
    for (const a of course.assignments ?? []) {
      assignInstances.add(a.id);
      const externalId = `moodle:assign:${a.id}`;
      const deadline = a.duedate > 0 ? new Date(a.duedate * 1000).toISOString() : undefined;
      const url = `${client.baseUrl}/mod/assign/view.php?id=${a.cmid}`;
      const description = a.intro ? truncate(stripHtml(a.intro), 600) : undefined;
      const req = upsertRequirement(externalId, (prev) =>
        prev
          ? { ...prev, title: a.name, deadline: deadline ?? prev.deadline, url, description: description ?? prev.description, subjectId: subject.id }
          : {
              id: uid('req'),
              subjectId: subject.id,
              title: a.name,
              type: guessRequirementType(a.name, 'assign'),
              weight: 0,
              deadline,
              done: false,
              subtasks: defaultSubtasks(guessRequirementType(a.name, 'assign'), 'moodle'),
              description,
              source: 'moodle',
              externalId,
              url,
              createdAt: nowIso,
            },
      );
      for (const att of a.introattachments ?? []) {
        const ctx = contextIdFromUrl(att.fileurl) ?? `assign${a.id}`;
        upsertMaterial(`moodle:file:${ctx}:${att.filename}`, (prev) => ({
          ...(prev ?? { id: uid('mat'), createdAt: nowIso }),
          subjectId: subject.id,
          requirementId: prev?.requirementId ?? req.id,
          kind: 'moodle-file',
          title: prev?.title ?? att.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
          fileName: att.filename,
          mimeType: att.mimetype ?? guessMime(att.filename),
          size: att.filesize,
          url: stripToken(att.fileurl),
          section: prev?.section ?? 'Zadání úkolu',
          externalId: `moodle:file:${ctx}:${att.filename}`,
          source: 'moodle',
        }));
      }
    }
  }
  // Stav odevzdání a známky – odevzdané úkoly se odškrtnou samy.
  onProgress({ step: 'assignments', label: 'Kontroluji odevzdání a známky' });
  const nowMs = now.getTime();
  const toCheck = (assignmentData.courses ?? [])
    .flatMap((c) => (courseToSubject.has(c.id) ? (c.assignments ?? []) : []))
    .filter((a) => !a.duedate || Math.abs(a.duedate * 1000 - nowMs) < 160 * 86_400_000)
    .slice(0, 40);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, toCheck.length) }, async () => {
      while (cursor < toCheck.length) {
        const a = toCheck[cursor++];
        try {
          const st = await client.call<MoodleSubmissionStatus>('mod_assign_get_submission_status', { assignid: a.id });
          const status = st.lastattempt?.submission?.status ?? st.lastattempt?.teamsubmission?.status;
          const gradeText = st.feedback?.gradefordisplay ? stripHtml(st.feedback.gradefordisplay).replace(/\s+/g, ' ').trim() : undefined;
          const externalId = `moodle:assign:${a.id}`;
          const req = requirements.get(externalId);
          if (!req) continue;
          const g = gradeText ? normalizeGrade(gradeText) : undefined;
          requirements.set(
            externalId,
            applyActivityToRequirement(req, { kind: 'moodle-assign', title: a.name, submitted: status === 'submitted', graded: Boolean(gradeText), grade: g?.grade ?? gradeText, gradePercent: g?.percent }),
          );
        } catch {
          /* úkol bez přístupu ke stavu – nevadí */
        }
      }
    }),
  );
  onProgress({ step: 'assignments', label: 'Úkoly načteny', count: assignInstances.size });

  // Testy, kvízy a další události s termínem
  onProgress({ step: 'events', label: 'Načítám testy a termíny z kalendáře' });
  const nowSec = Math.floor(now.getTime() / 1000);
  const events = await client.call<MoodleActionEventsResponse>('core_calendar_get_action_events_by_timesort', {
    timesortfrom: nowSec - 7 * 86_400,
    timesortto: nowSec + 150 * 86_400,
    limitnum: 50,
    limittononsuspendedevents: 1,
  });
  let eventCount = 0;
  for (const ev of events.events ?? []) {
    const subject = ev.course ? courseToSubject.get(ev.course.id) : undefined;
    if (!subject) continue;
    if (ev.modulename === 'assign' && ev.instance && assignInstances.has(ev.instance)) continue;
    const externalId = `moodle:${ev.modulename ?? 'event'}:${ev.instance ?? ev.id}`;
    const title = cleanEventName(ev.name);
    const deadline = new Date(ev.timestart * 1000).toISOString();
    const type = guessRequirementType(title, ev.modulename);
    eventCount++;
    upsertRequirement(externalId, (prev) =>
      prev
        ? { ...prev, deadline, url: ev.url ?? ev.action?.url ?? prev.url, subjectId: subject.id }
        : {
            id: uid('req'),
            subjectId: subject.id,
            title,
            type,
            weight: 0,
            deadline,
            done: false,
            subtasks: defaultSubtasks(type, 'moodle'),
            source: 'moodle',
            externalId,
            url: ev.url ?? ev.action?.url,
            createdAt: nowIso,
          },
    );
  }
  onProgress({ step: 'events', label: 'Termíny načteny', count: eventCount });

  // Studijní materiály z týdenních sekcí
  onProgress({ step: 'contents', label: 'Stahuji seznam studijních materiálů' });
  let fileCount = 0;
  for (const course of visibleCourses) {
    const subject = courseToSubject.get(course.id);
    if (!subject) continue;
    let sections: MoodleSection[] = [];
    try {
      sections = await client.call<MoodleSection[]>('core_course_get_contents', { courseid: course.id });
    } catch {
      continue;
    }
    for (const section of sections) {
      if (section.visible === 0) continue;
      const sectionName = section.name?.trim() || 'Obecné';
      for (const module of section.modules ?? []) {
        if (module.visible === 0) continue;
        if (module.modname === 'resource' || module.modname === 'folder') {
          for (const content of module.contents ?? []) {
            if (content.type !== 'file') continue;
            const ctx = contextIdFromUrl(content.fileurl) ?? `mod${module.id}`;
            const externalId = `moodle:file:${ctx}:${content.filename}`;
            fileCount++;
            upsertMaterial(externalId, (prev) => ({
              ...(prev ?? { id: uid('mat'), createdAt: nowIso }),
              subjectId: subject.id,
              requirementId: prev?.requirementId,
              kind: 'moodle-file',
              title: module.modname === 'folder' ? `${module.name} – ${content.filename}` : module.name,
              fileName: content.filename,
              mimeType: content.mimetype ?? guessMime(content.filename),
              size: content.filesize,
              url: stripToken(content.fileurl),
              section: sectionName,
              externalId,
              source: 'moodle',
              updatedAt: nowIso,
            }));
          }
        } else if (module.modname === 'url') {
          const content = module.contents?.find((c) => c.type === 'url');
          const target = content?.fileurl ?? module.url;
          if (!target) continue;
          const externalId = `moodle:url:${module.id}`;
          fileCount++;
          upsertMaterial(externalId, (prev) => ({
            ...(prev ?? { id: uid('mat'), createdAt: nowIso }),
            subjectId: subject.id,
            requirementId: prev?.requirementId,
            kind: 'moodle-link',
            title: module.name,
            url: target,
            section: sectionName,
            externalId,
            source: 'moodle',
            updatedAt: nowIso,
          }));
        }
      }
    }
  }
  onProgress({ step: 'contents', label: 'Materiály načteny', count: fileCount });
  onProgress({ step: 'done', label: 'Hotovo' });

  return {
    site,
    subjects: [...touchedSubjects.values()],
    requirements: [...requirements.values()],
    materials: [...materials.values()],
    stats: {
      courses: visibleCourses.length,
      newSubjects,
      requirements: requirements.size,
      newRequirements,
      materials: materials.size,
      newMaterials,
    },
  };
}
