/**
 * Sdílené kousky Plánu: řádek položky (seznam, detail dne) a barvy.
 */
import type { CSSProperties } from 'react';
import { CalendarClock, Flag, MapPin, MonitorPlay } from 'lucide-react';
import type { Milestone, Settings, Subject } from '../../types';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { formatDayMonth, formatTime } from '../../lib/dates';
import type { PlanItem } from '../../lib/plan';
import { CATEGORY_LABELS } from '../../lib/scheduleTextParser';
import { DEADLINE_STYLES, deadlineUrgency } from '../../lib/urgency';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';
import { Checkbox, cn } from '../ui/primitives';
import { KIND_LABEL } from '../transit/transitStatus';

export const PHASE_TINT: Partial<Record<Milestone['category'], string>> = {
  teaching: 'bg-moss/[0.13]',
  'exam-period': 'bg-rose-500/[0.13]',
  holiday: 'bg-emerald-400/[0.22]',
  enrollment: 'bg-sand/25',
};

export const PHASE_DOT: Partial<Record<Milestone['category'], string>> = {
  teaching: 'bg-moss',
  'exam-period': 'bg-rose-500',
  holiday: 'bg-emerald-500',
  enrollment: 'bg-sand',
  semester: 'bg-moss',
  deadline: 'bg-red-500',
  assessment: 'bg-clay',
  event: 'bg-sky-500',
};

export function subjectOf(item: PlanItem, byId: Map<string, Subject>): Subject | undefined {
  const id = item.kind === 'class' || item.kind === 'event' ? item.event.subjectId : item.kind === 'task' ? item.task.subjectId : item.kind === 'deadline' ? item.requirement.subjectId : item.milestone.subjectId;
  return id ? byId.get(id) : undefined;
}

/** Barva položky: předmět, kalendář Google, nebo typ. */
export function itemTone(item: PlanItem, byId: Map<string, Subject>): { bar: string; soft: string; style?: CSSProperties } {
  const subject = subjectOf(item, byId);
  if (subject) {
    const c = SUBJECT_COLOR_CLASSES[subject.color];
    return { bar: c.bar, soft: c.soft };
  }
  if ((item.kind === 'event' || item.kind === 'class') && item.event.google?.color) {
    return { bar: '', soft: 'bg-surface-2 text-fg', style: { background: item.event.google.color } };
  }
  if (item.kind === 'deadline') return { bar: 'bg-red-500', soft: 'bg-red-500/10 text-red-700 dark:text-red-300' };
  if (item.kind === 'milestone') return { bar: PHASE_DOT[item.milestone.category] ?? 'bg-moss', soft: 'bg-surface-2 text-fg' };
  return { bar: 'bg-sand', soft: 'bg-sand/20 text-fg' };
}

export function itemTitle(item: PlanItem, byId: Map<string, Subject>): string {
  if (item.kind === 'class') return byId.get(item.event.subjectId ?? '')?.name ?? item.event.title;
  if (item.kind === 'event') return item.event.title;
  if (item.kind === 'task') return item.task.title;
  if (item.kind === 'deadline') return item.requirement.title;
  return item.milestone.title;
}

/** Otevře položku: úkol a vlastní událost v editoru, výuku a termín u předmětu. */
export function openItem(item: PlanItem): void {
  const ui = useUiStore.getState();
  if (item.kind === 'task') return ui.openEditor({ type: 'task', id: item.task.id });
  if (item.kind === 'event') return ui.openEditor({ type: 'event', id: item.event.id });
  if (item.kind === 'class') return item.event.subjectId ? navigateTo('predmety', item.event.subjectId) : ui.openEditor({ type: 'event', id: item.event.id });
  if (item.kind === 'deadline') return navigateTo('predmety', item.requirement.subjectId);
}

export function PlanRow({ item, byId, settings, now, compact = false }: { item: PlanItem; byId: Map<string, Subject>; settings: Settings; now: Date; compact?: boolean }) {
  const toggleTask = useAppStore((s) => s.toggleTask);
  const toggleReq = useAppStore((s) => s.toggleRequirementDone);
  const tone = itemTone(item, byId);
  const subject = subjectOf(item, byId);
  const title = itemTitle(item, byId);

  if (item.kind === 'milestone') {
    const m = item.milestone;
    const multi = item.end.getTime() - item.start.getTime() > 86_400_000;
    return (
      <div className="flex items-center gap-3 rounded-[16px] px-2.5 py-1.5">
        <span className="w-12 shrink-0 text-right text-[11.5px] font-semibold text-subtle">{multi ? 'období' : 'celý den'}</span>
        <span className={cn('size-2.5 shrink-0 rounded-full', tone.bar)} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{m.title}</span>
        <span className="hidden shrink-0 text-[11.5px] text-subtle sm:block">
          {CATEGORY_LABELS[m.category]}
          {multi ? ` · do ${formatDayMonth(new Date(item.end.getTime() - 86_400_000))}` : ''}
        </span>
      </div>
    );
  }

  if (item.kind === 'task' || item.kind === 'deadline') {
    const done = item.kind === 'task' ? item.task.done : item.done;
    const urgency = deadlineUrgency(item.kind === 'task' && item.allDay ? new Date(item.start.getTime() + 86_399_000) : item.start, now, done);
    return (
      <div className="flex items-start gap-3 rounded-[16px] px-2.5 py-2 hover:bg-surface-2/70">
        <span className={cn('w-12 shrink-0 pt-0.5 text-right text-[12px] font-bold tabular', done ? 'text-subtle' : DEADLINE_STYLES[urgency].text)}>{item.kind === 'task' && item.allDay ? '' : formatTime(item.start)}</span>
        <Checkbox
          checked={done}
          onChange={() => (item.kind === 'task' ? toggleTask(item.task.id) : toggleReq(item.requirement.id))}
          label={`${done ? 'Vrátit' : 'Hotovo'}: ${title}`}
          className="relative mt-0.5 rounded-full after:absolute after:-inset-3 after:content-['']"
        />
        <button type="button" onClick={() => openItem(item)} className="min-w-0 flex-1 text-left">
          <span className={cn('block text-[14px] font-semibold leading-snug', done && 'text-subtle line-through')}>{title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            {item.kind === 'deadline' ? (
              <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-300">
                <Flag className="size-3" aria-hidden /> Termín
              </span>
            ) : (
              <span>Úkol</span>
            )}
            {subject && <span className="font-semibold">{subject.code ?? subject.name}</span>}
          </span>
        </button>
      </div>
    );
  }

  const e = item.event;
  const past = item.end < now;
  const current = item.start <= now && item.end > now;
  const { building, room } = item.kind === 'class' ? buildingForEvent(e, settings) : { building: undefined, room: undefined };
  return (
    <button type="button" onClick={() => openItem(item)} className={cn('flex w-full items-start gap-3 rounded-[16px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2/70', past && 'opacity-50')}>
      <span className="w-12 shrink-0 pt-0.5 text-right text-[12.5px] font-bold leading-tight tabular">
        {item.kind === 'event' && item.allDay ? <span className="text-[11.5px] text-subtle">celý den</span> : formatTime(item.start)}
        {!(item.kind === 'event' && item.allDay) && !compact && <span className="block text-[11px] font-medium text-subtle">{formatTime(item.end)}</span>}
      </span>
      <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', tone.bar)} style={tone.style} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold">{title}</span>
          {current && <span className="shrink-0 rounded-full bg-accent px-2 py-px text-[10.5px] font-black text-accent-fg">teď</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
          {item.kind === 'class' && <span>{KIND_LABEL[e.kind]}</span>}
          {e.online ? (
            <span className="inline-flex items-center gap-1">
              <MonitorPlay className="size-3" aria-hidden /> online
            </span>
          ) : (building || e.location) ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {building ? `${building.name}${room ? ` · ${room}` : ''}` : e.location}
            </span>
          ) : null}
          {e.google?.calendarName && <span className="inline-flex items-center gap-1 text-subtle"><CalendarClock className="size-3" aria-hidden />{e.google.calendarName}</span>}
        </span>
      </span>
    </button>
  );
}
