/**
 * Odpočívadla – klidná místa v aplikaci:
 *  - „Chvilka klidu“ před odchodem (když je čas): dech, co si nezapomenout,
 *    hudba na cestu, jízdenka;
 *  - „Studovna“ u úkolů: soustředění 25 min / pauza 5 min s dýcháním a hudbou.
 * Všechno lokálně, bez účtů. Animace respektují „omezit pohyb“.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Coffee, Headphones, Pause, Play, RotateCcw, Ticket, Timer } from 'lucide-react';
import type { Itinerary, ScheduleEvent, Task } from '../../types';
import { formatTime } from '../../lib/dates';
import { spotifyEmbedUrl } from '../../lib/music';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';

/* ------------------------------------------------------------------ */
/* Dýchací kruh                                                        */
/* ------------------------------------------------------------------ */

/** 4 s nádech · 2 s zadržet · 6 s výdech. */
export function BreathingCircle({ size = 132, light = false }: { size?: number; light?: boolean }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  useEffect(() => {
    const cycle = [
      ['in', 4000],
      ['hold', 2000],
      ['out', 6000],
    ] as const;
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      setPhase(cycle[i][0]);
      t = setTimeout(() => {
        i = (i + 1) % cycle.length;
        step();
      }, cycle[i][1]);
    };
    step();
    return () => clearTimeout(t);
  }, []);
  const scale = phase === 'out' ? 0.72 : 1;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      <motion.span
        className={cn('absolute inset-0 rounded-full', light ? 'bg-white/15' : 'bg-accent/10')}
        animate={reduce ? undefined : { scale: phase === 'out' ? 0.8 : 1.08 }}
        transition={{ duration: phase === 'in' ? 4 : phase === 'out' ? 6 : 0.4, ease: 'easeInOut' }}
      />
      <motion.span
        className={cn('absolute inset-[18%] rounded-full shadow-[0_0_40px_-6px_currentColor]', light ? 'bg-white/30 text-white' : 'bg-accent/25 text-accent')}
        animate={reduce ? undefined : { scale }}
        transition={{ duration: phase === 'in' ? 4 : phase === 'out' ? 6 : 0.4, ease: 'easeInOut' }}
      />
      <span className={cn('relative text-[13px] font-bold tracking-wide', light ? 'text-white' : 'text-accent')}>{phase === 'in' ? 'nádech' : phase === 'hold' ? 'drž' : 'výdech'}</span>
    </div>
  );
}

function MusicMini({ light = false }: { light?: boolean }) {
  const music = useAppStore((s) => s.settings.music);
  const openSetup = useUiStore((s) => s.openSetup);
  const embed = spotifyEmbedUrl(music?.url);
  if (!embed) {
    return (
      <button type="button" onClick={() => openSetup('extras')} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold', light ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-surface-2 text-muted hover:text-fg')}>
        <Headphones className="size-4" aria-hidden /> Přidat hudbu
      </button>
    );
  }
  return <iframe title="Hudba ze Spotify" src={embed} className="h-[80px] w-full rounded-[14px] border-0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />;
}

/* ------------------------------------------------------------------ */
/* Chvilka klidu před odchodem                                         */
/* ------------------------------------------------------------------ */

const PACKING = ['Lítačka / jízdenka', 'Klíče', 'Sluchátka', 'Nabíječka', 'Láhev s vodou'];

export function DepartureRest({ event, itinerary, now, rain }: { event: ScheduleEvent; itinerary: Itinerary; now: Date; rain: boolean }) {
  const minutes = Math.floor((new Date(itinerary.leaveAt).getTime() - now.getTime()) / 60_000);
  const items = useMemo(() => (rain ? ['Deštník', ...PACKING] : PACKING), [rain]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => setChecked({}), [event.id]);
  if (minutes < 8 || minutes > 180) return null;
  const hours = Math.floor(minutes / 60);
  const left = hours ? `${hours} h ${minutes % 60} min` : `${minutes} minut`;
  return (
    <section className="grain relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_24px_50px_-30px_rgb(0_0_0/0.55)]" aria-label="Chvilka klidu před odchodem">
      <img src="/images/mist-1200.webp" alt="" className="absolute inset-0 -z-20 size-full animate-drift object-cover" loading="lazy" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#1b3626]/85 via-[#24412f]/70 to-[#3b2f1c]/60" />
      <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-7">
        <BreathingCircle light />
        <div className="min-w-0">
          <p className="eyebrow text-white/70">Odpočívadlo</p>
          <h3 className="mt-1 font-display text-[34px] leading-none sm:text-[40px]">
            Máte {left}. <em className="text-[#e7d6b5]">Nadechněte se.</em>
          </h3>
          <p className="mt-2 text-[14.5px] text-white/80">Vyrážíte v {formatTime(new Date(itinerary.leaveAt))} – do té doby žádný spěch.</p>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Než vyrazíte">
            {items.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setChecked((c) => ({ ...c, [item]: !c[item] }))}
                aria-pressed={Boolean(checked[item])}
                className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition', checked[item] ? 'bg-white text-[#1b3626] ring-white' : 'bg-white/10 text-white ring-white/25 hover:bg-white/20')}
              >
                {checked[item] && <Check className="size-3.5" aria-hidden />} {item}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <MusicMini light />
            <a href="https://pid.cz/aplikace-pid-litacka/" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-white/15 px-4 text-[13px] font-bold text-white ring-1 ring-inset ring-white/25 hover:bg-white/25">
              <Ticket className="size-4" aria-hidden /> Jízdenka v PID Lítačce
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Studovna – soustředění a pauzy                                      */
/* ------------------------------------------------------------------ */

const FOCUS = 25 * 60;
const BREAK = 5 * 60;

export function FocusRest({ task }: { task?: Pick<Task, 'title'> | null }) {
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [left, setLeft] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [rounds, setRounds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l > 1) return l - 1;
        // Konec úseku: jemné cinknutí a přepnutí.
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = phase === 'focus' ? 660 : 520;
          g.gain.setValueAtTime(0.08, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
          o.connect(g).connect(ctx.destination);
          o.start();
          o.stop(ctx.currentTime + 1.2);
        } catch {
          /* bez zvuku */
        }
        if (phase === 'focus') {
          setRounds((r) => r + 1);
          setPhase('break');
          return BREAK;
        }
        setPhase('focus');
        return FOCUS;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, phase]);

  const total = phase === 'focus' ? FOCUS : BREAK;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const r = 46;
  const c = 2 * Math.PI * r;

  return (
    <section className="card relative overflow-hidden rounded-[26px] p-5" aria-label="Studovna – soustředění a pauzy">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 -z-0 h-28 bg-gradient-to-b opacity-70', phase === 'focus' ? 'from-accent/15' : 'from-sand/30')} />
      <div className="relative flex items-center gap-5">
        <div className="relative grid size-28 shrink-0 place-items-center">
          {phase === 'break' && running ? (
            <BreathingCircle size={112} />
          ) : (
            <>
              <svg viewBox="0 0 104 104" className="absolute inset-0 -rotate-90" aria-hidden>
                <circle cx="52" cy="52" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
                <circle cx="52" cy="52" r={r} fill="none" stroke={phase === 'focus' ? 'var(--accent)' : '#c7a676'} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (left / total)} className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
              </svg>
              <span className="font-display text-[30px] tabular" aria-live="off">
                {mm}:{ss}
              </span>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-subtle">Odpočívadlo · studovna</p>
          <h3 className="mt-1 font-display text-[26px] leading-tight">{phase === 'focus' ? <>Soustředění</> : <>Pauza – <em className="text-moss">protáhni se</em></>}</h3>
          <p className="mt-1 truncate text-[13.5px] text-muted">{phase === 'focus' ? (task ? `Teď: ${task.title}` : '25 minut jen na jednu věc.') : 'Protáhněte se, napijte se a podívejte se z okna.'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRunning((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-[13.5px] font-bold text-accent-fg hover:brightness-110">
              {running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} {running ? 'Pozastavit' : phase === 'focus' ? 'Začít 25 min' : 'Pokračovat'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                setPhase('focus');
                setLeft(FOCUS);
              }}
              className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Začít znovu"
            >
              <RotateCcw className="size-4" />
            </button>
            {rounds > 0 && (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted">
                {phase === 'break' ? <Coffee className="size-3.5" aria-hidden /> : <Timer className="size-3.5" aria-hidden />} {rounds}× hotovo
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="relative mt-4">
        <MusicMini />
      </div>
    </section>
  );
}
