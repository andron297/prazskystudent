import type { SubjectColor } from '../types';

export interface SubjectColorClasses {
  dot: string;
  bar: string;
  soft: string;
  text: string;
  ring: string;
  glow: string;
  stripe: string;
}

/** Statické třídy (Tailwind je musí najít doslovně ve zdrojácích). */
export const SUBJECT_COLOR_CLASSES: Record<SubjectColor, SubjectColorClasses> = {
  indigo: {
    dot: 'bg-indigo-500',
    bar: 'bg-indigo-500',
    soft: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    text: 'text-indigo-600 dark:text-indigo-400',
    ring: 'ring-indigo-500/30',
    glow: 'from-indigo-500/20',
    stripe: 'bg-gradient-to-b from-indigo-400 to-indigo-600',
  },
  emerald: {
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500/30',
    glow: 'from-emerald-500/20',
    stripe: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
  },
  amber: {
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    soft: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500/30',
    glow: 'from-amber-500/20',
    stripe: 'bg-gradient-to-b from-amber-400 to-amber-600',
  },
  rose: {
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
    soft: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500/30',
    glow: 'from-rose-500/20',
    stripe: 'bg-gradient-to-b from-rose-400 to-rose-600',
  },
  sky: {
    dot: 'bg-sky-500',
    bar: 'bg-sky-500',
    soft: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    text: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-500/30',
    glow: 'from-sky-500/20',
    stripe: 'bg-gradient-to-b from-sky-400 to-sky-600',
  },
  violet: {
    dot: 'bg-violet-500',
    bar: 'bg-violet-500',
    soft: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    text: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500/30',
    glow: 'from-violet-500/20',
    stripe: 'bg-gradient-to-b from-violet-400 to-violet-600',
  },
  teal: {
    dot: 'bg-teal-500',
    bar: 'bg-teal-500',
    soft: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    text: 'text-teal-600 dark:text-teal-400',
    ring: 'ring-teal-500/30',
    glow: 'from-teal-500/20',
    stripe: 'bg-gradient-to-b from-teal-400 to-teal-600',
  },
  orange: {
    dot: 'bg-orange-500',
    bar: 'bg-orange-500',
    soft: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    text: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-500/30',
    glow: 'from-orange-500/20',
    stripe: 'bg-gradient-to-b from-orange-400 to-orange-600',
  },
  fuchsia: {
    dot: 'bg-fuchsia-500',
    bar: 'bg-fuchsia-500',
    soft: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
    ring: 'ring-fuchsia-500/30',
    glow: 'from-fuchsia-500/20',
    stripe: 'bg-gradient-to-b from-fuchsia-400 to-fuchsia-600',
  },
  lime: {
    dot: 'bg-lime-500',
    bar: 'bg-lime-500',
    soft: 'bg-lime-500/10 text-lime-700 dark:text-lime-300',
    text: 'text-lime-600 dark:text-lime-400',
    ring: 'ring-lime-500/30',
    glow: 'from-lime-500/20',
    stripe: 'bg-gradient-to-b from-lime-400 to-lime-600',
  },
};

export const SUBJECT_COLORS = Object.keys(SUBJECT_COLOR_CLASSES) as SubjectColor[];

/** Vybere barvu, která je zatím nejméně použitá. */
export function nextSubjectColor(used: SubjectColor[]): SubjectColor {
  const counts = new Map<SubjectColor, number>(SUBJECT_COLORS.map((c) => [c, 0]));
  for (const c of used) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best: SubjectColor = SUBJECT_COLORS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const c of SUBJECT_COLORS) {
    const n = counts.get(c) ?? 0;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/** Barvy linek PID (metro A/B/C mají oficiální barvy, tramvaje a busy jednotné). */
export function lineBadgeClasses(mode: string, line: string): string {
  if (mode === 'metro') {
    const l = line.toUpperCase();
    if (l === 'A') return 'bg-[#1a9e5b] text-white';
    if (l === 'B') return 'bg-[#e8a91a] text-zinc-900';
    if (l === 'C') return 'bg-[#d22a3f] text-white';
    return 'bg-zinc-700 text-white';
  }
  if (mode === 'tram') return 'bg-[#8e2b2b] text-white';
  if (mode === 'bus') return 'bg-[#2f6f8f] text-white';
  if (mode === 'trolleybus') return 'bg-[#7b3f8c] text-white';
  if (mode === 'train') return 'bg-[#1f4e8c] text-white';
  if (mode === 'ferry') return 'bg-[#1c7c9c] text-white';
  if (mode === 'funicular') return 'bg-[#a36f45] text-white';
  return 'bg-zinc-600 text-white';
}
