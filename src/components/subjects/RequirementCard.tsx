import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarCheck,
  ChevronDown,
  ExternalLink,
  Flag,
  GraduationCap,
  ListChecks,
  NotebookPen,
  Paperclip,
  Pencil,
  Plus,
  Presentation,
  Trash,
  type LucideIcon,
} from 'lucide-react';
import type { Material, Requirement, RequirementType, Subject } from '../../types';
import { requirementToCalendarItem } from '../../lib/calendarExport';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { formatDeadline, fromLocalInputValue, toLocalInputValue } from '../../lib/dates';
import { uid } from '../../lib/id';
import { defaultSubtasks, requirementProgress, REQUIREMENT_TYPE_LABELS } from '../../lib/progress';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { useAppStore } from '../../store/appStore';
import { confirmAction, toast } from '../../store/uiStore';
import { AddToCalendar } from '../common/AddToCalendar';
import { Modal } from '../ui/overlays';
import { Button, Checkbox, Chip, cn, Field, IconButton, ProgressBar, Select, TextArea, TextInput, Toggle } from '../ui/primitives';
import { materialVisual } from './materialVisual';

export const REQUIREMENT_ICON: Record<RequirementType, LucideIcon> = {
  assignment: NotebookPen,
  test: ListChecks,
  presentation: Presentation,
  exam: GraduationCap,
  attendance: CalendarCheck,
  other: Flag,
};

export function RequirementCard({
  requirement: r,
  subject,
  materials,
  now,
  defaultOpen = false,
  onOpenMaterial,
}: {
  requirement: Requirement;
  subject: Subject;
  materials: Material[];
  now: Date;
  defaultOpen?: boolean;
  onOpenMaterial: (m: Material) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const toggleSubtask = useAppStore((s) => s.toggleSubtask);
  const addSubtask = useAppStore((s) => s.addSubtask);
  const renameSubtask = useAppStore((s) => s.renameSubtask);
  const removeSubtask = useAppStore((s) => s.removeSubtask);
  const toggleDone = useAppStore((s) => s.toggleRequirementDone);
  const removeRequirement = useAppStore((s) => s.removeRequirement);

  const progress = requirementProgress(r);
  const complete = progress >= 1;
  const deadline = r.deadline ? new Date(r.deadline) : undefined;
  const urgency = deadlineUrgency(deadline, now, complete);
  const style = DEADLINE_STYLES[urgency];
  const color = SUBJECT_COLOR_CLASSES[subject.color];
  const Icon = REQUIREMENT_ICON[r.type];
  const linked = materials.filter((m) => m.requirementId === r.id);
  const calendarItem = requirementToCalendarItem(r, subject);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    addSubtask(r.id, draft);
    setDraft('');
  };

  return (
    <motion.article layout className={cn('card overflow-hidden rounded-2xl', complete && 'opacity-80')}>
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <Checkbox
          checked={complete}
          onChange={() => {
            toggleDone(r.id);
            if (!complete) toast.success(`Hotovo: ${r.title} 🎉`);
          }}
          label={complete ? 'Označit jako nehotové' : 'Označit jako hotové'}
          colorClass={color.bar}
          className="mt-0.5"
        />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <span className={cn('min-w-0 text-[14px] font-semibold leading-snug', complete && 'line-through decoration-1')}>{r.title}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip>{REQUIREMENT_TYPE_LABELS[r.type]}</Chip>
            {r.weight > 0 && <Chip>{r.weight} % hodnocení</Chip>}
            {deadline && (
              <Chip className={style.chip}>
                {style.label} · {formatDeadline(deadline, now)}
              </Chip>
            )}
            {r.source === 'moodle' && <Chip className="bg-orange-500/10 text-orange-700 dark:text-orange-300">Moodle</Chip>}
            {linked.length > 0 && (
              <Chip icon={Paperclip}>
                {linked.length}
              </Chip>
            )}
          </span>
          {r.subtasks.length > 0 && (
            <span className="mt-2.5 flex items-center gap-2.5">
              <ProgressBar value={progress} barClassName={complete ? 'bg-emerald-500' : color.bar} label={`Splněno ${Math.round(progress * 100)} %`} />
              <span className="shrink-0 text-xs font-medium text-muted tabular">
                {r.subtasks.filter((s) => s.done).length}/{r.subtasks.length}
              </span>
            </span>
          )}
        </button>
        <IconButton icon={ChevronDown} label={open ? 'Sbalit' : 'Rozbalit'} size="sm" onClick={() => setOpen((o) => !o)} className={cn('transition-transform', open && 'rotate-180')} />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 32 }} className="overflow-hidden">
            <div className="border-t border-line bg-surface-2/50 px-3.5 pb-3.5 pt-3 sm:px-4">
              {r.description && <p className="mb-3 text-[13px] leading-relaxed text-muted">{r.description}</p>}
              <ul className="space-y-0.5">
                <AnimatePresence initial={false}>
                  {r.subtasks.map((st) => (
                    <motion.li key={st.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-surface">
                      <Checkbox checked={st.done} onChange={() => toggleSubtask(r.id, st.id)} label={st.title} colorClass={color.bar} />
                      {editingId === st.id ? (
                        <TextInput
                          autoFocus
                          defaultValue={st.title}
                          className="h-8"
                          onBlur={(e) => {
                            if (e.target.value.trim()) renameSubtask(r.id, st.id, e.target.value.trim());
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                      ) : (
                        <button type="button" onDoubleClick={() => setEditingId(st.id)} onClick={() => toggleSubtask(r.id, st.id)} className={cn('min-w-0 flex-1 text-left text-[13.5px]', st.done && 'text-subtle line-through decoration-1')}>
                          {st.title}
                        </button>
                      )}
                      <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <IconButton icon={Pencil} label="Přejmenovat" size="sm" onClick={() => setEditingId(st.id)} />
                        <IconButton icon={Trash} label="Smazat podúkol" size="sm" tone="danger" onClick={() => removeSubtask(r.id, st.id)} />
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <form onSubmit={submit} className="mt-2 flex gap-2">
                <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Přidat podúkol… (Enter)" className="h-9" aria-label="Nový podúkol" />
                <Button type="submit" size="sm" icon={Plus} disabled={!draft.trim()} className="h-9">
                  Přidat
                </Button>
              </form>

              {linked.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">Materiály k úkolu</p>
                  <div className="flex flex-wrap gap-1.5">
                    {linked.map((m) => {
                      const v = materialVisual(m);
                      return (
                        <button key={m.id} type="button" onClick={() => onOpenMaterial(m)} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-surface px-2 py-1 text-[12.5px] ring-1 ring-line hover:ring-line-strong">
                          <v.icon className={cn('size-3.5 shrink-0', v.text)} aria-hidden />
                          <span className="truncate">{m.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {calendarItem && <AddToCalendar items={[calendarItem]} filename={`termin-${r.title.slice(0, 30)}`} />}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2">
                    <ExternalLink className="size-3.5" aria-hidden /> Otevřít v Moodlu
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Pencil}
                  onClick={() => {
                    setEditKey((k) => k + 1);
                    setEditOpen(true);
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
                    if (await confirmAction({ title: `Smazat povinnost „${r.title}“?`, message: 'Smaže se i checklist podúkolů. Připojené materiály zůstanou u předmětu.', confirmLabel: 'Smazat', tone: 'danger' })) removeRequirement(r.id);
                  }}
                >
                  Smazat
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <RequirementEditor key={editKey} open={editOpen} onClose={() => setEditOpen(false)} subjectId={subject.id} requirement={r} />
    </motion.article>
  );
}

export function RequirementEditor({ open, onClose, subjectId, requirement }: { open: boolean; onClose: () => void; subjectId: string; requirement?: Requirement }) {
  const upsert = useAppStore((s) => s.upsertRequirement);
  const [title, setTitle] = useState(requirement?.title ?? '');
  const [type, setType] = useState<RequirementType>(requirement?.type ?? 'assignment');
  const [weight, setWeight] = useState(String(requirement?.weight ?? ''));
  const [deadline, setDeadline] = useState(requirement?.deadline ? toLocalInputValue(new Date(requirement.deadline)) : '');
  const [description, setDescription] = useState(requirement?.description ?? '');
  const [withChecklist, setWithChecklist] = useState(!requirement);

  const save = () => {
    if (!title.trim()) return;
    const due = deadline ? fromLocalInputValue(deadline) : null;
    upsert({
      id: requirement?.id ?? uid('req'),
      subjectId,
      title: title.trim(),
      type,
      weight: Math.max(0, Math.min(100, Number(weight) || 0)),
      deadline: due ? due.toISOString() : undefined,
      done: requirement?.done ?? false,
      subtasks: requirement?.subtasks ?? (withChecklist ? defaultSubtasks(type) : []),
      description: description.trim() || undefined,
      source: requirement?.source ?? 'manual',
      externalId: requirement?.externalId,
      url: requirement?.url,
      createdAt: requirement?.createdAt ?? new Date().toISOString(),
      demo: requirement?.demo,
    });
    toast.success(requirement ? 'Povinnost uložena.' : 'Povinnost přidána.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={requirement ? 'Upravit povinnost' : 'Nová studijní povinnost'}
      icon={ListChecks}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Název" className="sm:col-span-2">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Seminární práce" />
        </Field>
        <Field label="Typ">
          <Select value={type} onChange={(e) => setType(e.target.value as RequirementType)}>
            {Object.entries(REQUIREMENT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Váha v hodnocení (%)" hint="Prázdné = počítá se výchozí vahou 10 %.">
          <TextInput type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label="Termín" className="sm:col-span-2">
          <TextInput type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
        <Field label="Poznámka / zadání" className="sm:col-span-2">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        {!requirement && (
          <div className="sm:col-span-2">
            <Toggle checked={withChecklist} onChange={setWithChecklist} label="Vložit doporučený checklist" description="Např. u seminárky: zadání → rešerše → první verze → korektura → odevzdání." />
          </div>
        )}
      </div>
    </Modal>
  );
}
