/**
 * Soustředění (pomodoro): sady 25/5, 50/10 a 15/3, úkol, na kterém pracujete,
 * dnešní minuty a série dní. Časovač běží dál i mimo hlavní stránku.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Task } from '../../types';
import { plural } from '../../lib/dates';
import { FOCUS_PRESETS, focusLeft, focusSummary, phaseMinutes, presetOf, useFocusStore } from '../../store/focusStore';
import { PlaylistPlayer } from '../music/PlaylistPlayer';
import { BreathingDialog } from '../rest/RestSpots';
import { Glyph, GlyphTile } from '../ui/Glyph';
import { cn } from '../ui/primitives';

const PHASE_LABEL = { focus: 'Soustředění', short: 'Krátká pauza', long: 'Dlouhá pauza' } as const;

function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return active ? now : Date.now();
}

function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusCard({ tasks }: { tasks: Task[] }) {
  const reduce = useReducedMotion();
  const [breathing, setBreathing] = useState(false);
  const f = useFocusStore();
  const running = Boolean(f.endsAt);
  const now = useTick(running);
  const preset = presetOf(f.presetId);
  const total = phaseMinutes(preset, f.phase) * 60_000;
  const left = focusLeft(f, now);
  const progress = 1 - left / total;
  const fresh = !running && f.pausedLeft === null;
  const summary = useMemo(() => focusSummary(f.stats), [f.stats]);
  const open = useMemo(() => tasks.filter((t) => !t.done).slice(0, 30), [tasks]);
  const isBreak = f.phase !== 'focus';

  const R = 70;
  const C = 2 * Math.PI * R;

  return (
    <section className="card relative min-w-0 overflow-hidden rounded-[26px] p-4 sm:p-5" aria-label="Soustředění – pomodoro">
      <BreathingDialog open={breathing} onClose={() => setBreathing(false)} />
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b transition-colors duration-700', isBreak ? 'from-sand/30' : 'from-accent/12')} aria-hidden />
      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="mr-auto flex items-center gap-2.5">
          <GlyphTile name={isBreak ? 'hourglass' : 'timer'} size={42} />
          <div className="min-w-0">
            <p className="eyebrow text-subtle">{isBreak ? 'Pauza' : 'Pomodoro'}</p>
            <h2 className="font-display text-[23px] leading-none">{isBreak ? <>Chvíli <em className="italic text-moss">vydechněte</em></> : <>Soustředění</>}</h2>
          </div>
        </div>
        <div className="flex shrink-0 rounded-full bg-surface-2/80 p-0.5 ring-1 ring-inset ring-line" role="radiogroup" aria-label="Délka bloků">
          {FOCUS_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={f.presetId === p.id}
              title={`${p.hint}: ${p.focus} min práce, ${p.short} min pauza`}
              onClick={() => f.setPreset(p.id)}
              disabled={running}
              className={cn('rounded-full px-2.5 py-1 text-[12px] font-bold tabular transition disabled:cursor-not-allowed', f.presetId === p.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg disabled:hover:text-muted')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="relative mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="relative grid size-[168px] shrink-0 place-items-center">
          <svg viewBox="0 0 168 168" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="84" cy="84" r={R} fill="none" stroke="var(--line)" strokeWidth="9" />
            <motion.circle
              cx="84"
              cy="84"
              r={R}
              fill="none"
              stroke={isBreak ? 'var(--sand)' : 'var(--accent)'}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              animate={{ strokeDashoffset: C * (1 - Math.max(0, Math.min(1, progress))) }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: 'linear' }}
            />
          </svg>
          <div className="text-center">
            <p className="font-display text-[46px] leading-none tabular" aria-live="off">
              {fmt(left)}
            </p>
            <p className="mt-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-subtle">{PHASE_LABEL[f.phase]}</p>
          </div>
        </div>

        <div className="w-full min-w-0 flex-1">
          <div className="flex items-center justify-center gap-1.5 sm:justify-start" aria-label={`Hotovo ${f.round} z ${preset.rounds} bloků`}>
            {Array.from({ length: preset.rounds }, (_, i) => (
              <span key={i} className={cn('h-2 rounded-full transition-all duration-500', i < f.round ? 'w-6 bg-accent' : i === f.round && f.phase === 'focus' && running ? 'w-6 bg-accent/40' : 'w-2 bg-line-strong')} />
            ))}
            <span className="ml-1.5 text-[12px] font-semibold text-muted">
              {f.round}/{preset.rounds}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button
              type="button"
              onClick={() => (running ? f.pause() : f.start())}
              className={cn('inline-flex h-11 min-w-[8.5rem] items-center justify-center rounded-full px-5 text-[14.5px] font-bold shadow-[0_10px_22px_-14px_var(--accent)] transition hover:brightness-110', isBreak ? 'bg-clay text-white' : 'bg-accent text-accent-fg')}
            >
              {running ? 'Pozastavit' : fresh ? (isBreak ? 'Začít pauzu' : `Začít ${preset.focus} min`) : 'Pokračovat'}
            </button>
            <button type="button" onClick={() => f.skip()} className="h-11 rounded-full px-3.5 text-[13.5px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
              {isBreak ? 'Přeskočit pauzu' : 'Přeskočit'}
            </button>
            {(f.round > 0 || !fresh || isBreak) && (
              <button type="button" onClick={() => f.reset()} className="h-11 rounded-full px-3.5 text-[13.5px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
                Od začátku
              </button>
            )}
          </div>

          <label className="mt-3 block">
            <span className="sr-only">Na čem pracujete</span>
            <select
              value={f.focusOn?.taskId ?? ''}
              onChange={(e) => {
                const task = open.find((t) => t.id === e.target.value);
                f.setFocusOn(task ? { taskId: task.id, title: task.title } : null);
              }}
              className="h-11 w-full truncate rounded-[14px] bg-surface-2/80 px-3 text-[13.5px] font-semibold ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">{open.length ? 'Na čem pracujete? (nepovinné)' : 'Žádný otevřený úkol – prostě se soustřeďte'}</option>
              {open.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <p className="mt-2.5 text-center text-[12.5px] text-muted sm:text-left">
            Dnes <strong className="text-fg">{summary.today.minutes} min</strong> · {summary.today.blocks} {plural(summary.today.blocks, ['blok', 'bloky', 'bloků'])}
            {summary.streak > 1 ? ` · ${summary.streak} ${plural(summary.streak, ['den', 'dny', 'dní'])} v řadě` : ''}
            {summary.week > summary.today.minutes ? ` · týden ${Math.round(summary.week / 6) / 10} h` : ''}
          </p>
        </div>
      </div>

      <div className="relative mt-4 border-t border-line pt-3">
        <PlaylistPlayer compact />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={f.autoNext} onChange={(e) => f.setAutoNext(e.target.checked)} /> Pauzy a bloky navazují samy
          </label>
          <button type="button" onClick={() => setBreathing(true)} className="font-bold text-accent hover:underline">
            Dechové cvičení
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" className="size-3.5 accent-[var(--accent)]" checked={f.sound} onChange={(e) => f.setSound(e.target.checked)} /> Zvuk na konci
          </label>
        </div>
      </div>
    </section>
  );
}

/** Malý ukazatel v hlavičce, když soustředění běží (na každé stránce). */
export function FocusChip() {
  const endsAt = useFocusStore((s) => s.endsAt);
  const phase = useFocusStore((s) => s.phase);
  const now = useTick(Boolean(endsAt));
  if (!endsAt) return null;
  return (
    <a
      href="#/dnes"
      onClick={() => setTimeout(() => document.querySelector('[aria-label="Soustředění – pomodoro"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)}
      className={cn('inline-flex h-8 items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-bold tabular ring-1 ring-inset', phase === 'focus' ? 'bg-accent-soft text-accent ring-accent/25' : 'bg-sand/25 text-clay ring-sand/50')}
      title={phase === 'focus' ? 'Soustředění běží' : 'Pauza'}
    >
      <Glyph name="timer" size={17} />
      {fmt(Math.max(0, endsAt - now))}
    </a>
  );
}
