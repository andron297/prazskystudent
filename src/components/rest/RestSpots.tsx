/**
 * Odpočívadlo – „Chvilka klidu“ před odchodem (když je čas): dech, co si
 * nezapomenout, hudba na cestu a jízdenka. Soustředění (pomodoro) je ve
 * components/focus. Animace respektují „omezit pohyb“.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import type { Itinerary, ScheduleEvent } from '../../types';
import { formatTime } from '../../lib/dates';
import { PlaylistPlayer } from '../music/PlaylistPlayer';
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

/* ------------------------------------------------------------------ */
/* Chvilka klidu před odchodem                                         */
/* ------------------------------------------------------------------ */

const PACKING = ['lítačka nebo jízdenka', 'klíče', 'sluchátka', 'nabíječka', 'láhev s vodou'];

export function DepartureRest({ event, itinerary, now, rain }: { event: ScheduleEvent; itinerary: Itinerary; now: Date; rain: boolean }) {
  const minutes = Math.floor((new Date(itinerary.leaveAt).getTime() - now.getTime()) / 60_000);
  const items = useMemo(() => (rain ? ['deštník', ...PACKING] : PACKING), [rain]);
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
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
            <PlaylistPlayer light compact />
            <a href="https://pid.cz/aplikace-pid-litacka/" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-full bg-white/15 px-4 text-[13px] font-bold text-white ring-1 ring-inset ring-white/25 hover:bg-white/25">
              Jízdenka v PID Lítačce
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
