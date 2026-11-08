/**
 * Jeden řádek úkolu – stejný v Úkolech, na Dnes i u předmětu.
 * Předmět se mění klepnutím na štítek (nativní výběr, pohodlný i v mobilu).
 */
import { motion } from 'motion/react';
import { Check, Flag, Lightbulb, Plus, X } from 'lucide-react';
import type { Subject } from '../../types';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { formatDeadline } from '../../lib/dates';
import type { SubjectGuess } from '../../lib/subjectMatch';
import { dueMoment, type TaskRow } from '../../lib/taskList';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { Checkbox, cn } from '../ui/primitives';

const SOURCE_LABEL: Partial<Record<string, string>> = { moodle: 'Moodle', google: 'Google Úkoly', sis: 'SIS', ai: 'ze sylabu', parser: 'ze sylabu' };

export function subjectShort(s: Subject): string {
  return s.code && s.name.length > 22 ? s.code : s.name;
}

function SubjectChip({ row, subjects, byId }: { row: TaskRow; subjects: Subject[]; byId: Map<string, Subject> }) {
  const setTaskSubject = useAppStore((s) => s.setTaskSubject);
  const subject = row.subjectId ? byId.get(row.subjectId) : undefined;
  const color = subject ? SUBJECT_COLOR_CLASSES[subject.color] : null;
  const chip = (
    <span
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
        color ? color.soft : 'border border-dashed border-line-strong bg-surface-2 text-subtle',
      )}
    >
      {subject ? <span className={cn('size-1.5 shrink-0 rounded-full', color!.dot)} /> : <Plus className="size-3" aria-hidden />}
      <span className="truncate">{subject ? subjectShort(subject) : 'předmět'}</span>
      {row.task?.subjectAuto && <Lightbulb className="size-3 shrink-0 opacity-70" aria-label="odhad aplikace" />}
    </span>
  );
  if (row.kind !== 'task' || !row.task || subjects.length === 0) return subject ? chip : null;
  const task = row.task;
  return (
    <label className="relative inline-flex cursor-pointer" title={task.subjectAuto ? 'Předmět odhadla aplikace – klepnutím ho změníte' : 'Změnit předmět'}>
      {chip}
      <select
        value={task.subjectId ?? ''}
        onChange={(e) => setTaskSubject(task.id, e.target.value || null, 'user')}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={`Předmět úkolu ${task.title}`}
      >
        <option value="">Bez předmětu</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code ? `${s.code} · ` : ''}
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Návrh předmětu u úkolu: jedno klepnutí přijme, křížek odmítne. */
export function SuggestionBar({ taskId, guess, byId }: { taskId: string; guess: SubjectGuess; byId: Map<string, Subject> }) {
  const setTaskSubject = useAppStore((s) => s.setTaskSubject);
  const reject = useAppStore((s) => s.rejectTaskSubject);
  const options = [guess.subjectId, guess.alternativeId].filter((x): x is string => Boolean(x)).map((id) => byId.get(id)).filter((s): s is Subject => Boolean(s));
  if (options.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="inline-flex items-center gap-1 font-semibold text-moss">
        <Lightbulb className="size-3.5" aria-hidden /> Patří k předmětu
      </span>
      {options.map((s, i) => (
        <span key={s.id} className="inline-flex items-center gap-1">
          {i > 0 && <span className="-ml-1 text-subtle">, nebo</span>}
          <button
            type="button"
            onClick={() => setTaskSubject(taskId, s.id, 'user')}
            className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-bold ring-1 ring-inset transition hover:brightness-95', SUBJECT_COLOR_CLASSES[s.color].soft, SUBJECT_COLOR_CLASSES[s.color].ring)}
          >
            <Check className="size-3.5" aria-hidden /> {subjectShort(s)}
          </button>
        </span>
      ))}
      <span className="text-subtle">{options.length > 1 ? '?' : `? (${guess.reason})`}</span>
      <button
        type="button"
        onClick={() => options.forEach((s) => reject(taskId, s.id))}
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 font-semibold text-muted hover:bg-surface-2 hover:text-fg"
        aria-label="Ne, nepatří"
      >
        <X className="size-3.5" aria-hidden /> Ne
      </button>
    </div>
  );
}

export function TaskRowItem({ row, now, subjects, byId, guess, hideSubject = false }: { row: TaskRow; now: Date; subjects: Subject[]; byId: Map<string, Subject>; guess?: SubjectGuess; hideSubject?: boolean }) {
  const toggleTask = useAppStore((s) => s.toggleTask);
  const toggleRequirementDone = useAppStore((s) => s.toggleRequirementDone);
  const openEditor = useUiStore((s) => s.openEditor);
  const req = row.requirement;
  const urgency = row.due ? deadlineUrgency(new Date(dueMoment(row)), now, row.done) : 'none';
  const style = DEADLINE_STYLES[urgency];
  const hasSteps = Boolean(req && req.subtasks.length > 0);
  const source = row.task ? (row.task.source === 'google' ? SOURCE_LABEL.google : undefined) : req ? SOURCE_LABEL[req.source] : undefined;
  const dueText = row.due ? (row.dueAllDay ? formatDeadline(row.due, now).replace(/\s\d{1,2}:\d{2}$/, '') : formatDeadline(row.due, now)) : null;

  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="rounded-[18px] px-2 py-2 transition-colors hover:bg-surface-2/70">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={row.done}
          onChange={() => (row.task ? toggleTask(row.task.id) : req && toggleRequirementDone(req.id))}
          label={`${row.done ? 'Vrátit' : 'Hotovo'}: ${row.title}`}
          className="relative mt-0.5 size-[22px] rounded-full after:absolute after:-inset-3 after:content-['']"
          colorClass="bg-accent"
        />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => (row.task ? openEditor({ type: 'task', id: row.task.id }) : req && navigateTo('predmety', req.subjectId))} className="block w-full text-left">
            <span className={cn('flex items-start gap-1.5 text-[14.5px] font-semibold leading-snug', row.done && 'text-subtle line-through')}>
              {row.task?.priority === 'high' && <Flag className="mt-0.5 size-3.5 shrink-0 fill-clay text-clay" aria-label="Důležité" />}
              <span className="min-w-0">{row.title}</span>
            </span>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {!hideSubject && <SubjectChip row={row} subjects={subjects} byId={byId} />}
            {req && <span className="font-semibold text-subtle">{req.type === 'exam' ? 'Zkouška' : req.type === 'test' ? 'Test' : req.type === 'presentation' ? 'Prezentace' : 'Povinnost'}</span>}
            {hasSteps && (
              <span className="tabular">
                {req!.subtasks.filter((s) => s.done).length}/{req!.subtasks.length} kroků
              </span>
            )}
            {source && <span className="text-subtle">{source}</span>}
          </div>
          {guess && !row.done && <SuggestionBar taskId={row.task!.id} guess={guess} byId={byId} />}
        </div>
        {dueText && <span className={cn('shrink-0 pt-0.5 text-right text-[12px] font-bold tabular', row.done ? 'text-subtle' : style.text)}>{dueText}</span>}
      </div>
    </motion.li>
  );
}
