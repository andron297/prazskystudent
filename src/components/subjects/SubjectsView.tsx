import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, BookOpen, CalendarDays, ExternalLink, GraduationCap, ListChecks, MapPin, Paperclip, Pencil, Plug, Plus, RefreshCw, ScrollText, Trash } from 'lucide-react';
import type { Subject, SubjectColor } from '../../types';
import { requirementToCalendarItem } from '../../lib/calendarExport';
import { SUBJECT_COLOR_CLASSES, SUBJECT_COLORS, nextSubjectColor } from '../../lib/colors';
import { formatDeadline, formatTime, formatWeekdayShort, formatDayMonth } from '../../lib/dates';
import { uid } from '../../lib/id';
import { sisSubjectUrl } from '../../lib/sisImport';
import { isRequirementComplete, subjectProgress } from '../../lib/progress';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { navigateTo } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent } from '../../store/selectors';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { importSyllabus, useSyllabusSync } from '../../services/syllabusSync';
import { AddToCalendar } from '../common/AddToCalendar';
import { Modal } from '../ui/overlays';
import { Button, Card, Chip, cn, EmptyState, Field, ProgressBar, ProgressRing, TextInput } from '../ui/primitives';
import { MaterialsPanel, MaterialViewer, useMaterialOpener } from './Materials';
import { RequirementCard, RequirementEditor } from './RequirementCard';

const SOURCE_BADGE: Partial<Record<Subject['source'], string>> = {
  moodle: 'Moodle',
  sis: 'SIS',
  google: 'Google',
  'ics-file': 'iCal',
  manual: 'Ručně',
  parser: 'Parser',
};

export function SubjectsView({ subjectId }: { subjectId?: string }) {
  const subjects = useAppStore((s) => s.subjects);
  const subject = subjectId ? subjects.find((s) => s.id === subjectId) : undefined;
  if (subjectId && subject) return <SubjectHub subject={subject} />;
  return <SubjectGrid />;
}

function SubjectGrid() {
  const now = useNow(60_000);
  const subjects = useAppStore((s) => s.subjects);
  const requirements = useAppStore((s) => s.requirements);
  const materials = useAppStore((s) => s.materials);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-[32px] bg-forest px-6 py-8 text-white sm:px-10 sm:py-11">
        <img src="/images/forest-1200.webp" alt="" className="absolute inset-0 size-full object-cover opacity-70" />
        <div className="photo-scrim absolute inset-0" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-white/75">{subjects.length} předmětů v semestru</p>
            <h1 className="mt-2 font-display text-[48px] leading-[0.95] sm:text-[62px]">
              Předměty <em className="text-[#e7d6b5]">a materiály</em>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="glass" icon={Plug} onClick={() => navigateTo('propojeni', 'moodle')}>
              Moodle
            </Button>
            <Button
              variant="sand"
              icon={Plus}
              onClick={() => {
                setEditorKey((k) => k + 1);
                setEditorOpen(true);
              }}
            >
              Předmět
            </Button>
          </div>
        </div>
      </header>

      {subjects.length === 0 ? (
        <EmptyState icon={BookOpen} title="Zatím žádné předměty" action={<Button variant="primary" icon={Plug} onClick={() => navigateTo('propojeni', 'sis')}>Propojit SIS</Button>}>
          Předměty se vytvoří automaticky z rozvrhu (.ics) nebo z kurzů v Moodlu.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject, index) => {
            const reqs = requirements.filter((r) => r.subjectId === subject.id);
            const progress = subjectProgress(reqs);
            const color = SUBJECT_COLOR_CLASSES[subject.color];
            const next = reqs
              .filter((r) => r.deadline && !isRequirementComplete(r) && new Date(r.deadline) > now)
              .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))[0];
            const urgency = next ? deadlineUrgency(new Date(next.deadline!), now) : 'none';
            const matCount = materials.filter((m) => m.subjectId === subject.id).length;
            return (
              <motion.button
                key={subject.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ y: -2 }}
                onClick={() => navigateTo('predmety', subject.id)}
                className="card group relative isolate flex min-w-0 flex-col overflow-hidden rounded-[26px] p-5 text-left"
              >
                <span className={cn('pointer-events-none absolute -right-10 -top-10 -z-10 size-40 rounded-full bg-gradient-to-br to-transparent blur-2xl', color.glow)} />
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {subject.code && <Chip className={color.soft}>{subject.code}</Chip>}
                    {subject.moodleCourseId && <Chip className="bg-orange-500/10 text-orange-700 dark:text-orange-300">Moodle</Chip>}
                    {!subject.moodleCourseId && SOURCE_BADGE[subject.source] && <Chip>{SOURCE_BADGE[subject.source]}</Chip>}
                  </span>
                  <ProgressRing value={progress.ratio} size={46} stroke={5} className={color.text}>
                    <span className="text-[11px] font-semibold tabular">{progress.percent}%</span>
                  </ProgressRing>
                </span>
                <span className="mt-3 font-display text-[25px] leading-[1.05] group-hover:text-accent">{subject.name}</span>
                {subject.teacher && <span className="mt-0.5 truncate text-[12.5px] text-muted">{subject.teacher}</span>}
                <span className="mt-4">
                  <ProgressBar value={progress.ratio} barClassName={color.bar} />
                  <span className="mt-1.5 flex justify-between text-xs text-muted">
                    <span>
                      {progress.percent} % splněno do {subject.completion?.includes('Zk') ? 'zkoušky' : 'zápočtu'}
                    </span>
                    <span className="tabular">
                      {progress.completed}/{progress.total} povinností
                    </span>
                  </span>
                </span>
                <span className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-xs text-muted">
                  {next ? (
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className={cn('size-2 shrink-0 rounded-full', DEADLINE_STYLES[urgency].dot)} />
                      <span className="truncate">{next.title}</span>
                      <span className={cn('shrink-0 font-medium', DEADLINE_STYLES[urgency].text)}>{formatDeadline(new Date(next.deadline!), now)}</span>
                    </span>
                  ) : (
                    <span className="flex-1">Žádný otevřený termín</span>
                  )}
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <Paperclip className="size-3.5" aria-hidden /> {matCount}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      )}
      <SubjectEditor key={editorKey} open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  );
}

function SubjectHub({ subject }: { subject: Subject }) {
  const now = useNow(30_000);
  const allRequirements = useAppStore((s) => s.requirements);
  const allMaterials = useAppStore((s) => s.materials);
  const allEvents = useAppStore((s) => s.events);
  const settings = useAppStore((s) => s.settings);
  const removeSubject = useAppStore((s) => s.removeSubject);
  const openConnect = useUiStore((s) => s.openConnect);
  const { open: openMaterial, viewer, closeViewer } = useMaterialOpener();
  const [reqEditor, setReqEditor] = useState(false);
  const [reqKey, setReqKey] = useState(0);
  const [subjEditor, setSubjEditor] = useState(false);
  const [subjKey, setSubjKey] = useState(0);

  const requirements = useMemo(
    () =>
      allRequirements
        .filter((r) => r.subjectId === subject.id)
        .sort((a, b) => Number(isRequirementComplete(a)) - Number(isRequirementComplete(b)) || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')),
    [allRequirements, subject.id],
  );
  const materials = allMaterials.filter((m) => m.subjectId === subject.id);
  const upcomingClasses = allEvents.filter((e) => e.subjectId === subject.id && new Date(e.end) > now).slice(0, 5);
  const progress = subjectProgress(requirements);
  const color = SUBJECT_COLOR_CLASSES[subject.color];
  const firstOpen = requirements.find((r) => !isRequirementComplete(r))?.id;
  const calendarItems = requirements.map((r) => requirementToCalendarItem(r, subject)).filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => navigateTo('predmety')} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Všechny předměty
      </button>

      <section className="card relative isolate overflow-hidden rounded-[30px] p-5 sm:p-7">
        <span className={cn('pointer-events-none absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-gradient-to-br to-transparent blur-3xl', color.glow)} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProgressRing value={progress.ratio} size={96} stroke={9} className={color.text}>
            <span className="text-center">
              <span className="block text-xl font-semibold tabular">{progress.percent}%</span>
              <span className="block text-[10px] uppercase tracking-wide text-muted">splněno</span>
            </span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {subject.code && <Chip className={color.soft}>{subject.code}</Chip>}
              {subject.credits && <Chip>{subject.credits} kr.</Chip>}
              {subject.completion && <Chip>{subject.completion}</Chip>}
            </div>
            <h1 className="mt-2 font-display text-[34px] leading-[1.02] sm:text-[42px]">{subject.name}</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              {subject.teacher ?? 'Vyučující neuveden'} · {progress.completed}/{progress.total} povinností hotovo · {progress.percent} % do{' '}
              {subject.completion?.includes('Zk') ? 'zkoušky' : 'zápočtu'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            {subject.moodleCourseUrl && (
              <a href={subject.moodleCourseUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2">
                <ExternalLink className="size-3.5" aria-hidden /> Kurz v Moodlu
              </a>
            )}
            {subject.code && (
              <a href={sisSubjectUrl(subject.code)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2">
                <ExternalLink className="size-3.5" aria-hidden /> Předmět v SISu
              </a>
            )}
            <Button
              size="sm"
              icon={Pencil}
              onClick={() => {
                setSubjKey((k) => k + 1);
                setSubjEditor(true);
              }}
            >
              Upravit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash}
              className="text-red-600 hover:text-red-600"
              onClick={async () => {
                if (await confirmAction({ title: `Smazat předmět „${subject.name}“?`, message: 'Smaže i jeho rozvrhové lístky, povinnosti a materiály.', confirmLabel: 'Smazat předmět', tone: 'danger' })) {
                  removeSubject(subject.id);
                  navigateTo('predmety');
                  toast.info('Předmět smazán.');
                }
              }}
            >
              Smazat
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-[26px] leading-none">
              <ListChecks className="size-5 text-moss" aria-hidden /> Povinnosti
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={ScrollText} onClick={() => openConnect('parser', subject.id)}>
                Vložit sylabus
              </Button>
              <AddToCalendar items={calendarItems} filename={`terminy-${subject.code ?? 'predmet'}`} label="Termíny do kalendáře" />
              <Button
                size="sm"
                variant="soft"
                icon={Plus}
                onClick={() => {
                  setReqKey((k) => k + 1);
                  setReqEditor(true);
                }}
              >
                Povinnost
              </Button>
            </div>
          </div>
          {requirements.length === 0 ? (
            <EmptyState icon={GraduationCap} title="Žádné povinnosti">
              Přidej je ručně, nebo vlož text sylabu – parser rozpozná testy, seminárky a jejich váhy.
            </EmptyState>
          ) : (
            requirements.map((r) => <RequirementCard key={r.id} requirement={r} subject={subject} materials={materials} now={now} defaultOpen={r.id === firstOpen} onOpenMaterial={openMaterial} />)
          )}
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-5">
          <SyllabusCard subject={subject} />
          <MaterialsPanel subject={subject} materials={materials} requirements={requirements} onOpen={openMaterial} />
          <Card title="Nejbližší výuka" icon={CalendarDays}>
            {upcomingClasses.length === 0 ? (
              <p className="text-sm text-muted">V rozvrhu nejsou žádné další hodiny.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingClasses.map((e) => {
                  const start = new Date(e.start);
                  const { building, room } = buildingForEvent(e, settings);
                  return (
                    <li key={e.id} className="flex items-center gap-3 text-[13px]">
                      <span className="w-20 shrink-0 font-medium tabular">
                        {formatWeekdayShort(start)} {formatDayMonth(start)}
                      </span>
                      <span className="w-12 shrink-0 font-mono text-muted tabular">{formatTime(start)}</span>
                      <span className="flex min-w-0 items-center gap-1 truncate text-muted">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {building ? `${building.name}${room ? ` ${room}` : ''}` : (e.location ?? '—')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <RequirementEditor key={`req-${reqKey}`} open={reqEditor} onClose={() => setReqEditor(false)} subjectId={subject.id} />
      <SubjectEditor key={`subj-${subjKey}`} open={subjEditor} onClose={() => setSubjEditor(false)} subject={subject} />
      <MaterialViewer material={viewer} onClose={closeViewer} />
    </div>
  );
}

export function SubjectEditor({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject }) {
  const subjects = useAppStore((s) => s.subjects);
  const upsertSubject = useAppStore((s) => s.upsertSubject);
  const [name, setName] = useState(subject?.name ?? '');
  const [code, setCode] = useState(subject?.code ?? '');
  const [teacher, setTeacher] = useState(subject?.teacher ?? '');
  const [credits, setCredits] = useState(subject?.credits ? String(subject.credits) : '');
  const [completion, setCompletion] = useState(subject?.completion ?? '');
  const [color, setColor] = useState<SubjectColor>(subject?.color ?? nextSubjectColor(subjects.map((s) => s.color)));

  const save = () => {
    if (!name.trim()) return;
    upsertSubject({
      ...(subject ?? { id: uid('subj'), source: 'manual' as const, createdAt: new Date().toISOString() }),
      name: name.trim(),
      code: code.trim().toUpperCase() || undefined,
      teacher: teacher.trim() || undefined,
      credits: Number(credits) || undefined,
      completion: completion.trim() || undefined,
      color,
    });
    toast.success(subject ? 'Předmět uložen.' : 'Předmět přidán.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? 'Upravit předmět' : 'Nový předmět'}
      icon={BookOpen}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Název předmětu" className="sm:col-span-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Úvod do mediálních studií" />
        </Field>
        <Field label="Kód (SIS)">
          <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="JSB022" />
        </Field>
        <Field label="Zakončení">
          <TextInput value={completion} onChange={(e) => setCompletion(e.target.value)} placeholder="Z+Zk" />
        </Field>
        <Field label="Vyučující">
          <TextInput value={teacher} onChange={(e) => setTeacher(e.target.value)} />
        </Field>
        <Field label="Kredity">
          <TextInput type="number" min={0} max={30} value={credits} onChange={(e) => setCredits(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium">Barva</span>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Barva ${c}`}
                aria-pressed={color === c}
                className={cn('size-8 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition-transform hover:scale-110', SUBJECT_COLOR_CLASSES[c].dot, color === c && 'ring-2 ring-[var(--fg)]')}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Sylabus ze SISu                                                     */
/* ------------------------------------------------------------------ */

const SYLLABUS_PARTS: { key: 'annotation' | 'aim' | 'requirements' | 'syllabus' | 'literature'; label: string }[] = [
  { key: 'annotation', label: 'Anotace' },
  { key: 'aim', label: 'Cíl předmětu' },
  { key: 'requirements', label: 'Podmínky zakončení' },
  { key: 'syllabus', label: 'Sylabus' },
  { key: 'literature', label: 'Literatura' },
];

function SyllabusFetchButton({ subject, variant = 'primary' }: { subject: Subject; variant?: 'primary' | 'ghost' }) {
  const busy = useSyllabusSync((s) => Boolean(s.busy[subject.id]));
  return (
    <Button size="sm" variant={variant} icon={RefreshCw} loading={busy} onClick={() => void importSyllabus(subject.id, { manual: true })}>
      {busy ? 'Stahuji ze SISu…' : subject.syllabus ? 'Aktualizovat ze SISu' : 'Stáhnout ze SISu'}
    </Button>
  );
}

function SyllabusCard({ subject }: { subject: Subject }) {
  const [open, setOpen] = useState<string | null>('requirements');
  const syllabus = subject.syllabus;
  if (!syllabus) {
    return (
      <Card title="Sylabus" eyebrow="Ze SISu" icon={ScrollText}>
        <p className="text-[13px] text-muted">
          Stáhnu veřejnou stránku předmětu ze SISu{subject.code ? ` (${subject.code})` : ' (podle názvu)'} a z podmínek zakončení vytáhnu povinnosti, váhy a termíny.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SyllabusFetchButton subject={subject} />
          {subject.code && (
            <a href={sisSubjectUrl(subject.code)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-muted hover:text-ink">
              <ExternalLink className="size-3.5" aria-hidden /> Otevřít v SISu
            </a>
          )}
        </div>
      </Card>
    );
  }
  return (
    <Card title="Sylabus" eyebrow={syllabus.guarantor ? `Garant: ${syllabus.guarantor}` : 'Ze SISu'} icon={ScrollText}>
      <div className="flex flex-wrap gap-1.5">
        {syllabus.credits ? <Chip>{syllabus.credits} kreditů</Chip> : null}
        {syllabus.completion && <Chip>{syllabus.completion}</Chip>}
        {syllabus.semester && <Chip>{syllabus.semester}</Chip>}
        {syllabus.language && <Chip>{syllabus.language}</Chip>}
      </div>
      <ul className="mt-3 divide-y divide-[var(--line)]">
        {SYLLABUS_PARTS.filter((p) => syllabus[p.key]).map((p) => (
          <li key={p.key}>
            <button type="button" onClick={() => setOpen((o) => (o === p.key ? null : p.key))} className="flex w-full items-center justify-between py-2.5 text-left text-[13.5px] font-bold" aria-expanded={open === p.key}>
              {p.label}
              <span className="text-xs font-semibold text-subtle">{open === p.key ? 'skrýt' : 'zobrazit'}</span>
            </button>
            {open === p.key && <p className="whitespace-pre-line pb-3 text-[13px] leading-relaxed text-muted">{syllabus[p.key]}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-subtle">
          Načteno {new Date(syllabus.importedAt).toLocaleDateString('cs-CZ')}
          {syllabus.url && (
            <>
              {' · '}
              <a href={syllabus.url} target="_blank" rel="noreferrer" className="font-semibold underline-offset-2 hover:underline">
                SIS
              </a>
            </>
          )}
        </p>
        <SyllabusFetchButton subject={subject} variant="ghost" />
      </div>
    </Card>
  );
}
