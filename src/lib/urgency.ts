import { DAY, HOUR } from './dates';

/* ------------------------------------------------------------------ */
/* Termíny (deadliny)                                                  */
/* ------------------------------------------------------------------ */

export type DeadlineUrgency = 'overdue' | 'critical' | 'prepare' | 'soon' | 'calm' | 'done' | 'none';

/**
 * Sémantika barev:
 *  - červená: do 24 h (nebo po termínu)
 *  - oranžová: do 3 dnů
 *  - modrá: do týdne
 *  - zelená: víc než týden
 */
export function deadlineUrgency(deadline: Date | undefined, now: Date, done = false): DeadlineUrgency {
  if (done) return 'done';
  if (!deadline) return 'none';
  const diff = deadline.getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff <= 24 * HOUR) return 'critical';
  if (diff <= 3 * DAY) return 'prepare';
  if (diff <= 7 * DAY) return 'soon';
  return 'calm';
}

export interface UrgencyStyle {
  label: string;
  chip: string;
  dot: string;
  text: string;
  bar: string;
}

export const DEADLINE_STYLES: Record<DeadlineUrgency, UrgencyStyle> = {
  overdue: {
    label: 'Po termínu',
    chip: 'bg-red-500/12 text-red-700 ring-1 ring-inset ring-red-500/25 dark:text-red-300',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    bar: 'bg-red-500',
  },
  critical: {
    label: 'Do 24 h',
    chip: 'bg-red-500/12 text-red-700 ring-1 ring-inset ring-red-500/25 dark:text-red-300',
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    bar: 'bg-red-500',
  },
  prepare: {
    label: 'Do 3 dnů',
    chip: 'bg-orange-500/12 text-orange-700 ring-1 ring-inset ring-orange-500/25 dark:text-orange-300',
    dot: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
  },
  soon: {
    label: 'Tento týden',
    chip: 'bg-sky-500/12 text-sky-700 ring-1 ring-inset ring-sky-500/25 dark:text-sky-300',
    dot: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    bar: 'bg-sky-500',
  },
  calm: {
    label: 'V klidu',
    chip: 'bg-emerald-500/12 text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  },
  done: {
    label: 'Hotovo',
    chip: 'bg-zinc-500/10 text-zinc-600 ring-1 ring-inset ring-zinc-500/20 dark:text-zinc-300',
    dot: 'bg-zinc-400',
    text: 'text-zinc-500 dark:text-zinc-400',
    bar: 'bg-zinc-400',
  },
  none: {
    label: 'Bez termínu',
    chip: 'bg-zinc-500/10 text-zinc-600 ring-1 ring-inset ring-zinc-500/20 dark:text-zinc-300',
    dot: 'bg-zinc-400',
    text: 'text-zinc-500 dark:text-zinc-400',
    bar: 'bg-zinc-400',
  },
};

/* ------------------------------------------------------------------ */
/* Doprava                                                             */
/* ------------------------------------------------------------------ */

export type TransitStatus = 'calm' | 'prepare' | 'critical' | 'missed' | 'on-site' | 'no-data' | 'idle' | 'loading';

/** Zelená > 20 min, oranžová 10–20 min, červená < 10 min do odchodu na poslední spoj. */
export function transitStatusFromSeconds(secondsToLeave: number): 'calm' | 'prepare' | 'critical' {
  if (secondsToLeave > 20 * 60) return 'calm';
  if (secondsToLeave >= 10 * 60) return 'prepare';
  return 'critical';
}

export interface TransitStyle {
  label: string;
  short: string;
  text: string;
  chip: string;
  dot: string;
  ring: string;
  gradient: string;
  countdown: string;
  pulse: boolean;
}

export const TRANSIT_STYLES: Record<TransitStatus, TransitStyle> = {
  calm: {
    label: 'V klidu',
    short: 'V klidu',
    text: 'text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-500/15 text-emerald-800 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-200',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500/25',
    gradient: 'from-emerald-400/25 via-emerald-300/10 to-transparent dark:from-emerald-500/25 dark:via-emerald-500/5',
    countdown: 'text-emerald-700 dark:text-emerald-300',
    pulse: false,
  },
  prepare: {
    label: 'Připrav se',
    short: 'Připrav se',
    text: 'text-orange-700 dark:text-orange-300',
    chip: 'bg-orange-500/15 text-orange-800 ring-1 ring-inset ring-orange-500/30 dark:text-orange-200',
    dot: 'bg-orange-500',
    ring: 'ring-orange-500/30',
    gradient: 'from-orange-400/30 via-amber-300/10 to-transparent dark:from-orange-500/25 dark:via-amber-500/5',
    countdown: 'text-orange-700 dark:text-orange-300',
    pulse: false,
  },
  critical: {
    label: 'Last call',
    short: 'Last call',
    text: 'text-red-700 dark:text-red-300',
    chip: 'bg-red-500/15 text-red-800 ring-1 ring-inset ring-red-500/35 dark:text-red-200',
    dot: 'bg-red-500',
    ring: 'ring-red-500/40',
    gradient: 'from-red-500/30 via-rose-400/10 to-transparent dark:from-red-600/30 dark:via-rose-600/5',
    countdown: 'text-red-600 dark:text-red-300',
    pulse: true,
  },
  missed: {
    label: 'Nestihneš MHD',
    short: 'Ujelo to',
    text: 'text-red-700 dark:text-red-300',
    chip: 'bg-zinc-800/90 text-white ring-1 ring-inset ring-white/10 dark:bg-white/10',
    dot: 'bg-zinc-500',
    ring: 'ring-zinc-500/30',
    gradient: 'from-zinc-400/25 via-zinc-300/10 to-transparent dark:from-zinc-600/30 dark:via-zinc-700/5',
    countdown: 'text-zinc-700 dark:text-zinc-200',
    pulse: false,
  },
  'on-site': {
    label: 'Jsi na místě',
    short: 'Na místě',
    text: 'text-sky-700 dark:text-sky-300',
    chip: 'bg-sky-500/15 text-sky-800 ring-1 ring-inset ring-sky-500/30 dark:text-sky-200',
    dot: 'bg-sky-500',
    ring: 'ring-sky-500/25',
    gradient: 'from-sky-400/25 via-sky-300/10 to-transparent dark:from-sky-500/25 dark:via-sky-500/5',
    countdown: 'text-sky-700 dark:text-sky-300',
    pulse: false,
  },
  'no-data': {
    label: 'Bez dat o spojích',
    short: 'Bez dat',
    text: 'text-zinc-600 dark:text-zinc-300',
    chip: 'bg-zinc-500/15 text-zinc-700 ring-1 ring-inset ring-zinc-500/25 dark:text-zinc-200',
    dot: 'bg-zinc-400',
    ring: 'ring-zinc-500/20',
    gradient: 'from-zinc-300/25 via-zinc-200/10 to-transparent dark:from-zinc-600/20 dark:via-zinc-700/5',
    countdown: 'text-zinc-700 dark:text-zinc-200',
    pulse: false,
  },
  idle: {
    label: 'Dnes v klidu',
    short: 'Volno',
    text: 'text-indigo-700 dark:text-indigo-300',
    chip: 'bg-indigo-500/15 text-indigo-800 ring-1 ring-inset ring-indigo-500/30 dark:text-indigo-200',
    dot: 'bg-indigo-500',
    ring: 'ring-indigo-500/20',
    gradient: 'from-indigo-400/20 via-violet-300/10 to-transparent dark:from-indigo-500/20 dark:via-violet-500/5',
    countdown: 'text-indigo-700 dark:text-indigo-300',
    pulse: false,
  },
  loading: {
    label: 'Počítám trasu…',
    short: 'Načítám',
    text: 'text-zinc-600 dark:text-zinc-300',
    chip: 'bg-zinc-500/15 text-zinc-700 ring-1 ring-inset ring-zinc-500/25 dark:text-zinc-200',
    dot: 'bg-zinc-400',
    ring: 'ring-zinc-500/20',
    gradient: 'from-zinc-300/25 via-zinc-200/10 to-transparent dark:from-zinc-600/20 dark:via-zinc-700/5',
    countdown: 'text-zinc-700 dark:text-zinc-200',
    pulse: false,
  },
};

/** Barva štítku zpoždění: 0 min zeleně, do 2 min oranžově, víc červeně, bez dat šedě. */
export function delayChipClasses(delaySeconds: number | null): string {
  if (delaySeconds === null) return 'bg-zinc-500/12 text-zinc-600 dark:text-zinc-300';
  const minutes = Math.floor(delaySeconds / 60);
  if (minutes <= 0) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (minutes <= 3) return 'bg-orange-500/15 text-orange-700 dark:text-orange-300';
  return 'bg-red-500/15 text-red-700 dark:text-red-300';
}

export function formatDelay(delaySeconds: number | null): string {
  if (delaySeconds === null) return 'dle JŘ';
  const minutes = Math.floor(delaySeconds / 60);
  if (minutes <= 0) return '0 min';
  return `+${minutes} min`;
}
