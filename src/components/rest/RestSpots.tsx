/**
 * Odpočívadlo – „Chvilka klidu“ před odchodem (když je čas): dech, co si
 * nezapomenout, hudba na cestu a jízdenka. Soustředění (pomodoro) je ve
 * components/focus. Animace respektují „omezit pohyb“.
 */
import { litackaLink } from '../../lib/litacka';
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import type { Itinerary, ScheduleEvent } from '../../types';
import { vTime } from '../../lib/dates';
import { cn } from '../ui/primitives';
import { Modal } from '../ui/overlays';

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

/**
 * Než vyrazíte: věcný seznam (lítačka, klíče, za deště deštník) – jen
 * posledních 30 minut před odchodem. Dechové cvičení je zvlášť (Soustředění).
 */
export function DepartureRest({ event, itinerary, now, rain }: { event: ScheduleEvent; itinerary: Itinerary; now: Date; rain: boolean }) {
  const minutes = Math.floor((new Date(itinerary.leaveAt).getTime() - now.getTime()) / 60_000);
  const items = useMemo(() => (rain ? ['deštník', ...PACKING] : PACKING), [rain]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => setChecked({}), [event.id]);
  const litacka = useMemo(() => litackaLink(), []);
  if (minutes < 1 || minutes > 30) return null;
  return (
    <section className="card flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[22px] px-4 py-3.5" aria-label="Než vyrazíte">
      <p className="text-[14px] font-bold">
        Než vyrazíte <span className="font-semibold text-muted">· {vTime(new Date(itinerary.leaveAt))}</span>
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setChecked((c) => ({ ...c, [item]: !c[item] }))}
            aria-pressed={Boolean(checked[item])}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset transition', checked[item] ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-fg ring-line-strong hover:bg-surface-2')}
          >
            {checked[item] && <Check className="size-3.5" aria-hidden />} {item}
          </button>
        ))}
      </div>
      {litacka && (
        <a href={litacka} className="text-[12.5px] font-bold text-accent hover:underline">
          Otevřít PID Lítačku
        </a>
      )}
    </section>
  );
}

/** Dechové cvičení jako samostatná funkce (otevře se z karty Soustředění). */
export function BreathingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Dechové cvičení" description="4 s nádech, 2 s zadržet, 6 s výdech. Pár minut stačí.">
      <div className="grid place-items-center py-4">
        <BreathingCircle size={180} />
      </div>
    </Modal>
  );
}
