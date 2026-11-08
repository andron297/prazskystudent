import { AiMark } from '../ui/AiMark';
import { useMemo, useState } from 'react';
import { BookOpen, CalendarPlus, CircleAlert, CircleCheck, ClipboardPaste, GraduationCap, ListChecks, ScrollText } from 'lucide-react';
import type { Subject } from '../../types';
import { formatDate, formatDeadline, formatTime, formatWeekdayShort } from '../../lib/dates';
import { applyActivityToRequirement, detectMoodlePage, guessSubjectForCourse, matchRequirement, parseMoodleActivity, type MoodleActivityPage } from '../../lib/moodlePage';
import { defaultSubtasks, guessRequirementType } from '../../lib/progress';
import { parseSisPage, sisSubjectUrl } from '../../lib/sisImport';
import { syllabusText } from '../../lib/syllabusExtract';
import { addRequirementsFromText, requirementsCountText } from '../../services/syllabusSync';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Button, Card, Checkbox, Chip, cn, Field, SerifTitle, Select, TextArea, TextInput } from '../ui/primitives';

/** Import ze SISu: data ze záložky (bookmarklet), nebo vložený text stránky. */
export function ImportView() {
  const payload = useUiStore((s) => s.sisImport);
  const setSisImport = useUiStore((s) => s.setSisImport);
  const subjects = useAppStore((s) => s.subjects);
  const importSisSubject = useAppStore((s) => s.importSisSubject);
  const addExamTerms = useAppStore((s) => s.addExamTerms);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<string>('auto');

  const parsed = useMemo(() => (payload ? parseSisPage(payload.text, payload.url, appNow()) : null), [payload]);
  const moodleKind = payload ? detectMoodlePage(payload.text, payload.url) : null;
  const activity = useMemo(() => (payload && moodleKind && moodleKind !== 'moodle-course' ? parseMoodleActivity(payload.text, payload.url, payload.title) : null), [payload, moodleKind]);
  const fromMoodle = Boolean(moodleKind) || /moodle|dl\d?\.cuni\.cz/i.test(payload?.url ?? '');
  const match = parsed?.subject?.code ? subjects.find((s) => s.code?.toUpperCase() === parsed.subject!.code!.toUpperCase()) : undefined;

  const load = () => {
    if (!text.trim()) return;
    setSisImport({ url: url.trim(), title: '', text, receivedAt: new Date().toISOString(), origin: 'paste' });
    setPicked({});
  };

  const saveSyllabus = () => {
    if (!parsed?.subject) return;
    let id: string;
    if (target !== 'auto' && target !== 'new') {
      useAppStore.getState().setSubjectSyllabus(target, parsed.subject.syllabus);
      id = target;
    } else {
      id = importSisSubject(parsed.subject);
    }
    toast.success('Sylabus uložen k předmětu');
    setSisImport(null);
    navigateTo('predmety', id);
    const text = syllabusText(parsed.subject.syllabus);
    void addRequirementsFromText(id, text, `sis:${parsed.subject.code ?? id}`).then(({ requirements, engine }) => {
      if (requirements.length) toast.success(`Ze sylabu: ${requirementsCountText(requirements.length)}${engine === 'ai' ? ' (AI)' : ''}`);
    });
  };

  const addExams = () => {
    if (!parsed) return;
    const chosen = parsed.exams.filter((e) => picked[e.id] ?? e.registered);
    if (chosen.length === 0) return;
    const n = addExamTerms(chosen);
    toast.success(`${n} ${n === 1 ? 'termín přidán' : n < 5 ? 'termíny přidány' : 'termínů přidáno'} do kalendáře`);
    setSisImport(null);
    navigateTo('plan', 'rok');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="eyebrow text-subtle">Import ze SISu a Moodlu</p>
        <SerifTitle as="h1" className="mt-1 text-[44px] sm:text-[56px]">
          Co mi <em>{fromMoodle ? 'Moodle' : 'SIS'}</em> poslal
        </SerifTitle>
      </header>

      {!payload && (
        <Card title="Vložit text stránky" eyebrow="Bez záložky" icon={ClipboardPaste}>
          <p className="mb-3 text-[13.5px] text-muted">V SISu otevřete stránku předmětu nebo termíny zkoušek (v Moodlu stránku úkolu, testu či kurzu), označte vše (Ctrl+A), zkopírujte a vložte sem.</p>
          <div className="space-y-3">
            <Field label="Adresa stránky (nepovinné)">
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://is.cuni.cz/studium/predmety/…" inputMode="url" />
            </Field>
            <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Vložte text stránky…" className="min-h-48" />
            <Button variant="primary" icon={AiMark} onClick={load} disabled={!text.trim()}>
              Přečíst
            </Button>
          </div>
        </Card>
      )}

      {payload && parsed && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Chip>{payload.origin === 'paste' ? 'vložený text' : 'ze záložky'}</Chip>
            {payload.url && <span className="truncate">{payload.url}</span>}
            <button type="button" className="ml-auto font-semibold text-accent hover:underline" onClick={() => setSisImport(null)}>
              Vložit jiný
            </button>
          </div>

          {parsed.kind === 'syllabus' && parsed.subject && (
            <Card title={parsed.subject.name ?? 'Předmět'} eyebrow={parsed.subject.code ?? 'Sylabus'} icon={BookOpen}>
              <div className="flex flex-wrap gap-1.5">
                {parsed.subject.syllabus.credits && <Chip>{parsed.subject.syllabus.credits} kreditů</Chip>}
                {parsed.subject.syllabus.completion && <Chip>{parsed.subject.syllabus.completion}</Chip>}
                {parsed.subject.syllabus.semester && <Chip>{parsed.subject.syllabus.semester}</Chip>}
                {parsed.subject.syllabus.guarantor && <Chip icon={GraduationCap}>{parsed.subject.syllabus.guarantor}</Chip>}
              </div>
              {parsed.subject.syllabus.annotation && <p className="mt-3 line-clamp-4 text-[14px] leading-relaxed">{parsed.subject.syllabus.annotation}</p>}
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(['syllabus', 'requirements', 'literature'] as const).map((k) => (
                  <div key={k} className={cn('rounded-[18px] p-3 text-[12.5px]', parsed.subject!.syllabus[k] ? 'bg-accent-soft' : 'bg-surface-2 text-subtle')}>
                    <p className="font-bold">{k === 'syllabus' ? 'Sylabus' : k === 'requirements' ? 'Podmínky' : 'Literatura'}</p>
                    <p className="mt-0.5">{parsed.subject!.syllabus[k] ? `${parsed.subject!.syllabus[k]!.split('\n').length} řádků` : 'nenalezeno'}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <Field label="Uložit k předmětu" className="min-w-56 flex-1">
                  <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="auto">{match ? `${match.code} · ${match.name} (nalezeno)` : 'Nový předmět'}</option>
                    {subjects
                      .filter((s) => s.id !== match?.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code ? `${s.code} · ` : ''}
                          {s.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Button variant="primary" icon={ScrollText} onClick={saveSyllabus}>
                  Uložit sylabus
                </Button>
              </div>
              {parsed.subject.code && (
                <a href={sisSubjectUrl(parsed.subject.code)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">
                  Veřejná stránka předmětu v SISu
                </a>
              )}
            </Card>
          )}

          {parsed.exams.length > 0 && (
            <Card title="Termíny zkoušek" eyebrow={`${parsed.exams.length} nalezeno`} icon={CalendarPlus}>
              <ul className="space-y-1">
                {parsed.exams.map((e) => {
                  const checked = picked[e.id] ?? e.registered;
                  return (
                    <li key={e.id} className="flex items-center gap-3 rounded-[18px] px-2 py-2 hover:bg-surface-2">
                      <Checkbox checked={checked} onChange={() => setPicked((p) => ({ ...p, [e.id]: !checked }))} label={`Přidat termín ${e.code ?? ''}`} className="rounded-full" />
                      <span className="w-20 shrink-0 text-center">
                        <span className="block font-display text-[22px] leading-none tabular">{e.start.getDate()}. {e.start.getMonth() + 1}.</span>
                        <span className="text-[11px] font-bold text-subtle">
                          {formatWeekdayShort(e.start)} {formatTime(e.start)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{e.name ?? e.code ?? 'Zkouška'}</span>
                        <span className="text-xs text-muted">
                          {[e.code, e.room, e.teacher].filter(Boolean).join(' · ')} · {formatDate(e.start)}
                        </span>
                      </span>
                      {e.registered && <Chip className="bg-accent-soft text-accent">přihlášen</Chip>}
                    </li>
                  );
                })}
              </ul>
              <Button variant="primary" icon={CalendarPlus} className="mt-3" onClick={addExams}>
                Přidat vybrané do kalendáře
              </Button>
            </Card>
          )}

          {activity && <MoodleActivityCard page={activity} subjects={subjects} onDone={() => setSisImport(null)} />}

          {!activity && parsed.kind === 'unknown' && parsed.exams.length === 0 && (
            <SmartExtractCard text={payload.text} course={payload.title} subjects={subjects} known={moodleKind === 'moodle-course'} onDone={() => setSisImport(null)} />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Moodle: úkol nebo test                                              */
/* ------------------------------------------------------------------ */

function MoodleActivityCard({ page, subjects, onDone }: { page: MoodleActivityPage; subjects: Subject[]; onDone: () => void }) {
  const requirements = useAppStore((s) => s.requirements);
  const upsertRequirement = useAppStore((s) => s.upsertRequirement);
  const addRequirements = useAppStore((s) => s.addRequirements);
  const matched = useMemo(() => matchRequirement(page, requirements, subjects), [page, requirements, subjects]);
  const guessedSubject = guessSubjectForCourse(page.course, subjects);
  const [target, setTarget] = useState<string>(matched ? matched.id : 'new');
  const [subjectId, setSubjectId] = useState<string>(guessedSubject?.id ?? subjects[0]?.id ?? '');

  const save = () => {
    const now = appNow();
    if (target !== 'new') {
      const req = requirements.find((r) => r.id === target);
      if (!req) return;
      upsertRequirement(applyActivityToRequirement(req, page));
      toast.success(page.submitted || page.graded ? `„${req.title}“ odškrtnuto${page.grade ? ` · známka ${page.grade}` : ''}` : `„${req.title}“ aktualizováno`);
    } else {
      if (!subjectId) return;
      const type = guessRequirementType(page.title, page.kind === 'moodle-quiz' ? 'quiz' : 'assign');
      const base = {
        id: `req_moodle_page_${page.cmid ?? Date.now()}`,
        subjectId,
        title: page.title,
        type,
        weight: 0,
        done: false,
        subtasks: defaultSubtasks(type, 'moodle'),
        source: 'moodle' as const,
        externalId: page.cmid ? `moodle-page:${page.cmid}` : undefined,
        createdAt: now.toISOString(),
      };
      addRequirements([applyActivityToRequirement(base, page)]);
      toast.success(`Povinnost „${page.title}“ přidána`);
    }
    onDone();
    navigateTo('predmety', target !== 'new' ? requirements.find((r) => r.id === target)?.subjectId : subjectId);
  };

  const sorted = [...requirements].sort((a, b) => (a.id === matched?.id ? -1 : b.id === matched?.id ? 1 : a.title.localeCompare(b.title, 'cs')));
  return (
    <Card title={page.title} eyebrow={page.kind === 'moodle-quiz' ? `Test · ${page.course ?? 'Moodle'}` : `Úkol · ${page.course ?? 'Moodle'}`} icon={ListChecks}>
      <div className="flex flex-wrap gap-1.5">
        {page.submitted ? (
          <Chip icon={CircleCheck} className="bg-accent-soft text-accent">
            {page.status ?? 'Odevzdáno'}
          </Chip>
        ) : (
          <Chip className="bg-clay/15 text-clay">{page.status ?? 'Zatím neodevzdáno'}</Chip>
        )}
        {page.grade && <Chip className="bg-accent-soft text-accent">Známka {page.grade}{page.gradePercent !== undefined ? ` (${page.gradePercent} %)` : ''}</Chip>}
        {page.due && <Chip>Termín {formatDeadline(page.due, appNow())}</Chip>}
      </div>
      <p className="mt-3 text-[13px] text-muted">
        {page.submitted || page.graded ? 'Povinnost označím jako hotovou' : 'Uložím termín a odkaz'}
        {page.grade ? ' a zapíšu známku' : ''}.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Povinnost v aplikaci">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">Nová povinnost…</option>
            {sorted.map((r) => {
              const s = subjects.find((x) => x.id === r.subjectId);
              return (
                <option key={r.id} value={r.id}>
                  {r.id === matched?.id ? '(navrženo) ' : ''}
                  {r.title}
                  {s ? ` · ${s.code ?? s.name}` : ''}
                </option>
              );
            })}
          </Select>
        </Field>
        {target === 'new' && (
          <Field label="Předmět">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} · ` : ''}
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Button variant="primary" icon={CircleCheck} className="mt-4" onClick={save} disabled={target === 'new' && !subjectId}>
        Uložit stav
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Jiná stránka (kurz v Moodlu, cokoli s termíny)                       */
/* ------------------------------------------------------------------ */

function SmartExtractCard({ text, course, subjects, known, onDone }: { text: string; course: string; subjects: Subject[]; known: boolean; onDone: () => void }) {
  const guessed = guessSubjectForCourse(course.split(/\s+\|\s+/)[0]?.replace(/^Kurz:\s*/i, ''), subjects);
  const [subjectId, setSubjectId] = useState<string>(guessed?.id ?? subjects[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!subjectId) return;
    setBusy(true);
    try {
      const { requirements, engine } = await addRequirementsFromText(subjectId, text.slice(0, 30_000), `page:${subjectId}`);
      if (requirements.length) {
        toast.success(`${requirementsCountText(requirements.length)} přidáno${engine === 'ai' ? ' (AI)' : ''}`);
        onDone();
        navigateTo('predmety', subjectId);
      } else toast.info('V textu nejsou žádné nové úkoly ani termíny.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Čtení se nepodařilo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={known ? 'Stránka kurzu' : 'Neznámá stránka'} eyebrow="Úkoly a termíny z textu" icon={AiMark}>
      <p className="flex items-start gap-2 text-[14px]">
        {!known && <CircleAlert className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden />}
        {known ? 'Projdu text kurzu a vytáhnu z něj úkoly, váhy a termíny k vybranému předmětu.' : 'Tuhle stránku přesně neznám, ale zkusím z ní vytáhnout úkoly a termíny.'}
      </p>
      {subjects.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="K předmětu" className="min-w-56 flex-1">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} · ` : ''}
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" icon={AiMark} loading={busy} onClick={() => void run()}>
            Vytáhnout úkoly a termíny
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Nejdřív si přidejte předměty (rozvrh ze SISu).</p>
      )}
      <Button className="mt-3" variant="ghost" icon={ScrollText} onClick={() => useUiStore.getState().openConnect('parser')}>
        Harmonogram nebo jiný text do kalendáře
      </Button>
    </Card>
  );
}
