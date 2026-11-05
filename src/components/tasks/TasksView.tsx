/**
 * Úkoly – jediné místo, kde je všechno, co je potřeba udělat:
 * vlastní úkoly, Google Úkoly i termíny z předmětů (SIS, Moodle, sylaby).
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, ChevronDown, GraduationCap, ListTodo, Sparkles } from 'lucide-react';
import type { Subject } from '../../types';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { plural } from '../../lib/dates';
import { buildTaskRows, DUE_GROUP_LABEL, dueGroup, groupByDue, type TaskRow } from '../../lib/taskList';
import { useNow } from '../../hooks/useNow';
import { useSubjectSuggestions } from '../../services/subjectAssist';
import { useAppStore } from '../../store/appStore';
import { subjectMap } from '../../store/selectors';
import { QuickAdd } from '../common/QuickAdd';
import { cn, EmptyState, Segmented, SerifTitle } from '../ui/primitives';
import { subjectShort, TaskRowItem } from './TaskRow';

type Grouping = 'due' | 'subject';
type Scope = 'all' | 'mine' | 'subjects';

const GROUP_TONE: Partial<Record<ReturnType<typeof dueGroup>, string>> = {
  overdue: 'text-red-700 dark:text-red-300',
  today: 'text-accent',
};

function Section({ title, count, tone, children, dot }: { title: string; count: number; tone?: string; children: React.ReactNode; dot?: string }) {
  return (
    <section>
      <h2 className={cn('flex items-center gap-2 px-2 pb-1 pt-3 text-[12px] font-black uppercase tracking-[0.12em] text-subtle', tone)}>
        {dot && <span className={cn('size-2 rounded-full', dot)} />}
        {title}
        <span className="rounded-full bg-surface-2 px-1.5 py-px text-[11px] font-bold tabular text-muted">{count}</span>
      </h2>
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}

export function TasksView() {
  const now = useNow(60_000);
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const subjects = useAppStore((s) => s.subjects);
  const byId = useMemo(() => subjectMap(subjects), [subjects]);
  const suggestions = useSubjectSuggestions();
  const [grouping, setGrouping] = useState<Grouping>('due');
  const [scope, setScope] = useState<Scope>('all');
  const [subjectFilter, setSubjectFilter] = useState<string | null | undefined>(undefined);
  const [showDone, setShowDone] = useState(false);

  const rows = useMemo(() => {
    const list = buildTaskRows(tasks, requirements, now, { includeDone: true, includeUndated: subjectFilter !== undefined, subjectId: subjectFilter });
    return list.filter((r) => (scope === 'mine' ? r.kind === 'task' : scope === 'subjects' ? r.kind === 'requirement' : true));
  }, [tasks, requirements, now, subjectFilter, scope]);
  const open = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);
  const counts = useMemo(() => {
    const all = buildTaskRows(tasks, requirements, now);
    const c = { overdue: 0, today: 0, week: 0 };
    for (const r of all) {
      const g = dueGroup(r, now);
      if (g === 'overdue') c.overdue++;
      else if (g === 'today') c.today++;
      else if (g === 'tomorrow' || g === 'week') c.week++;
    }
    return c;
  }, [tasks, requirements, now]);
  const pending = open.filter((r) => r.task && suggestions.has(r.task.id));

  const subjectsWithItems = useMemo(() => {
    const used = new Set(buildTaskRows(tasks, requirements, now).map((r) => r.subjectId ?? ''));
    return subjects.filter((s) => used.has(s.id));
  }, [tasks, requirements, subjects, now]);

  const renderRow = (row: TaskRow, hideSubject = false) => <TaskRowItem key={row.key} row={row} now={now} subjects={subjects} byId={byId} guess={row.task ? suggestions.get(row.task.id) : undefined} hideSubject={hideSubject} />;

  const bySubject = useMemo(() => {
    const groups = new Map<string, TaskRow[]>();
    for (const r of open) groups.set(r.subjectId ?? '', [...(groups.get(r.subjectId ?? '') ?? []), r]);
    const ordered: { subject?: Subject; rows: TaskRow[] }[] = subjects.filter((s) => groups.has(s.id)).map((s) => ({ subject: s, rows: groups.get(s.id)! }));
    if (groups.has('')) ordered.push({ rows: groups.get('')! });
    return ordered;
  }, [open, subjects]);

  const summary = [
    counts.overdue > 0 && `${counts.overdue} po termínu`,
    counts.today > 0 && `${counts.today} na dnešek`,
    counts.week > 0 && `${counts.week} do konce týdne`,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="px-1">
        <p className="eyebrow text-subtle">Všechno na jednom místě</p>
        <SerifTitle as="h1" className="mt-1 text-[44px] sm:text-[56px]">
          Úkoly <em className="text-moss">a termíny</em>
        </SerifTitle>
        <p className="mt-1 text-[14.5px] text-muted">{summary.length ? summary.join(' · ') : 'Nic nehoří. Hezky.'}</p>
      </header>

      <div className="card rounded-[26px] p-3 sm:p-4">
        <QuickAdd variant="hero" />
        <p className="px-2 pt-2 text-[12.5px] text-subtle">Předmět poznám sám – podle kódu, názvu, zkratky, vyučujícího nebo rozvrhu. Můžeš ho napsat i s mřížkou, třeba „#statistika“.</p>
      </div>

      {pending.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-[22px] bg-moss/10 px-4 py-3 text-[13.5px] ring-1 ring-inset ring-moss/25">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-moss" aria-hidden />
          <p>
            U {pending.length} {plural(pending.length, ['úkolu', 'úkolů', 'úkolů'])} navrhuji předmět. Stačí klepnout na správný – nebo na „Ne“.
          </p>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={grouping}
          onChange={setGrouping}
          options={[
            { value: 'due', label: 'Podle termínu', icon: CalendarClock },
            { value: 'subject', label: 'Podle předmětu', icon: GraduationCap },
          ]}
        />
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Vše' },
            { value: 'mine', label: 'Moje úkoly' },
            { value: 'subjects', label: 'Z předmětů' },
          ]}
        />
      </div>

      {subjectsWithItems.length > 0 && (
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtr podle předmětu">
          {[{ id: undefined, label: 'Všechny předměty' } as const, ...subjectsWithItems.map((s) => ({ id: s.id, label: subjectShort(s), subject: s })), { id: null, label: 'Bez předmětu' } as const].map((f) => {
            const active = subjectFilter === f.id;
            const subject = 'subject' in f ? f.subject : undefined;
            return (
              <button
                key={String(f.id)}
                type="button"
                onClick={() => setSubjectFilter(active && f.id !== undefined ? undefined : f.id)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold ring-1 ring-inset transition-colors',
                  active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-muted ring-line hover:text-fg',
                )}
              >
                {subject && <span className={cn('size-2 rounded-full', SUBJECT_COLOR_CLASSES[subject.color].dot)} />}
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="card rounded-[26px] px-2 pb-3 pt-1 sm:px-3">
        {open.length === 0 ? (
          <div className="p-3">
            <EmptyState icon={ListTodo} title={subjectFilter !== undefined || scope !== 'all' ? 'Tady nic není' : 'Čistý stůl'}>
              {subjectFilter !== undefined || scope !== 'all' ? 'Zkus jiný filtr.' : 'Napiš úkol nahoře – třeba „esej do pátku“. Termíny z předmětů se doplní samy ze SISu a Moodlu.'}
            </EmptyState>
          </div>
        ) : grouping === 'due' ? (
          groupByDue(open, now).map(({ group, rows: list }) => (
            <Section key={group} title={DUE_GROUP_LABEL[group]} count={list.length} tone={GROUP_TONE[group]}>
              {list.map((r) => renderRow(r, subjectFilter !== undefined && subjectFilter !== null))}
            </Section>
          ))
        ) : (
          bySubject.map(({ subject, rows: list }) => (
            <Section key={subject?.id ?? 'none'} title={subject ? subject.name : 'Bez předmětu'} count={list.length} dot={subject ? SUBJECT_COLOR_CLASSES[subject.color].dot : 'bg-line-strong'}>
              {list.map((r) => renderRow(r, true))}
            </Section>
          ))
        )}

        {done.length > 0 && (
          <div className="mt-2 border-t border-line pt-2">
            <button type="button" onClick={() => setShowDone((v) => !v)} className="flex w-full items-center gap-2 rounded-full px-2 py-2 text-[13px] font-bold text-muted hover:text-fg" aria-expanded={showDone}>
              <ChevronDown className={cn('size-4 transition-transform', showDone && 'rotate-180')} aria-hidden />
              Hotovo za posledních 14 dní ({done.length})
            </button>
            {showDone && <ul className="space-y-0.5">{done.map((r) => renderRow(r))}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
