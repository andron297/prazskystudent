import { useMemo, useState } from 'react';
import { BookOpen, CalendarPlus, CircleAlert, ClipboardPaste, GraduationCap, ScrollText, Sparkles } from 'lucide-react';
import { formatDate, formatTime, formatWeekdayShort } from '../../lib/dates';
import { parseSisPage, sisSubjectUrl } from '../../lib/sisImport';
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
  };

  const addExams = () => {
    if (!parsed) return;
    const chosen = parsed.exams.filter((e) => picked[e.id] ?? e.registered);
    if (chosen.length === 0) return;
    const n = addExamTerms(chosen);
    toast.success(`${n} ${n === 1 ? 'termín přidán' : n < 5 ? 'termíny přidány' : 'termínů přidáno'} do kalendáře`);
    setSisImport(null);
    navigateTo('kalendar');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="eyebrow text-subtle">Import ze SISu</p>
        <SerifTitle as="h1" className="mt-1 text-[44px] sm:text-[56px]">
          Co mi <em>SIS</em> poslal
        </SerifTitle>
      </header>

      {!payload && (
        <Card title="Vložit text stránky" eyebrow="Bez záložky" icon={ClipboardPaste}>
          <p className="mb-3 text-[13.5px] text-muted">V SISu otevři stránku předmětu (sylabus) nebo termíny zkoušek, označ vše (Ctrl+A), zkopíruj a vlož sem.</p>
          <div className="space-y-3">
            <Field label="Adresa stránky (nepovinné)">
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://is.cuni.cz/studium/predmety/…" inputMode="url" />
            </Field>
            <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Vlož text stránky…" className="min-h-48" />
            <Button variant="primary" icon={Sparkles} onClick={load} disabled={!text.trim()}>
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

          {parsed.kind === 'unknown' && parsed.exams.length === 0 && (
            <Card>
              <p className="flex items-start gap-2 text-[14px]">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden />
                Tuhle stránku neznám. Pošli mi stránku předmětu (sylabus) nebo termínů zkoušek – nebo zkus parser harmonogramu.
              </p>
              <Button className="mt-3" variant="secondary" icon={ScrollText} onClick={() => useUiStore.getState().openConnect('parser')}>
                Otevřít parser textu
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
