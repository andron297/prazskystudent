/**
 * Úvodní animace při každém otevření (asi 4 s, klepnutím se dá přeskočit):
 *  1. logo se nakreslí a ručičky hodin se natočí na aktuální čas,
 *  2. „Stihnuto – Stihnete to.“,
 *  3. tři karty „váš den“: pozdrav, co vás dnes čeká, odpočet nebo svátek,
 *  4. opona se zvedne a pod ní je hotová aplikace.
 * Jen transformace a průhlednost (plynulé i na slabším telefonu), texty až po
 * načtení písma, „omezit pohyb“ = krátká statická verze.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { vTime, calendarDayDiff, formatTime, isSameDay, plural, toDate } from '../../lib/dates';
import { nameDayText, publicHoliday } from '../../lib/czechDays';
import { visibleEvents } from '../../lib/dedupe';
import { isRequirementComplete } from '../../lib/progress';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { buildingForEvent } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';

interface Fact {
  /** Krátký štítek nad větou („Dnes“, „Termín“, „Svátek“). */
  label: string;
  text: string;
  /** Zvýraznit (termín dnes). */
  strong?: boolean;
}

function greeting(h: number): string {
  if (h < 5) return 'Dobrou noc';
  if (h < 10) return 'Dobré ráno';
  if (h < 12) return 'Dobré dopoledne';
  if (h < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

const DAY_NAMES = ['v neděli', 'v pondělí', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'];
function dayWord(d: Date, now: Date): string {
  const diff = calendarDayDiff(d, now);
  if (diff === 0) return 'dnes';
  if (diff === 1) return 'zítra';
  return ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu'][d.getDay()] ?? DAY_NAMES[0];
}

/** Pozdrav a dvě věty o dnešku: výuka nebo termín, odpočet nebo svátek. */
function dayFacts(now: Date): { hello: string; facts: Fact[] } {
  const s = useAppStore.getState();
  const name = s.settings.displayName.trim();
  const hello = name ? `${greeting(now.getHours())}, ${name}` : greeting(now.getHours());
  const facts: Fact[] = [];

  const holiday = publicHoliday(now);
  const deadline = s.requirements.find((r) => r.deadline && !isRequirementComplete(r) && isSameDay(new Date(r.deadline), now) && new Date(r.deadline) > now);
  const study = visibleEvents(s.events, s.subjects)
    .filter((e) => e.kind !== 'personal' && !e.allDay && new Date(e.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  const today = study.filter((e) => isSameDay(new Date(e.start), now));
  if (deadline) facts.push({ label: 'Termín dnes', text: `${deadline.title} – do ${formatTime(new Date(deadline.deadline!))}`, strong: true });
  if (holiday) facts.push({ label: 'Svátek', text: holiday });
  else if (today.length > 0) {
    const first = today[0];
    const building = buildingForEvent(first, s.settings).building;
    const started = new Date(first.start) <= now;
    const n = today.length;
    facts.push({
      label: 'Dnes',
      text: started ? `Právě probíhá výuka, dnes ještě ${n} ${plural(n, ['hodina', 'hodiny', 'hodin'])}` : `První výuka ${vTime(new Date(first.start))}${building ? ` · ${building.name}` : ''}`,
    });
  } else {
    const next = study[0];
    if (next && calendarDayDiff(new Date(next.start), now) <= 7) {
      const building = buildingForEvent(next, s.settings).building;
      facts.push({ label: 'Další výuka', text: `${dayWord(new Date(next.start), now)} ${vTime(new Date(next.start))}${building ? ` · ${building.name}` : ''}` });
    } else facts.push({ label: 'Dnes', text: 'Žádná výuka v rozvrhu.' });
  }

  const countdown = (s.settings.countdowns ?? [])
    .map((c) => ({ c, days: calendarDayDiff(toDate(c.at), now) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
  const nameDay = nameDayText(now);
  if (facts.length < 2) {
    if (countdown) {
      const d = countdown.days;
      facts.push({ label: 'Odpočet', text: d === 0 ? `Dnes: ${countdown.c.title}` : `${countdown.c.title} za ${d} ${plural(d, ['den', 'dny', 'dní'])}` });
    } else if (nameDay) facts.push({ label: 'Svátek', text: nameDay.replace(/^Svátek (má|mají) /, '') });
  }
  return { hello, facts: facts.slice(0, 2) };
}

/** Úhel ručičky plynule z nuly na cíl (atribut SVG transform – spolehlivé i v Safari). */
function useSweep(target: number, delay: number, duration: number, reduce: boolean): number {
  const [angle, setAngle] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      setAngle(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / duration));
      setAngle(target * ease(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, duration, reduce]);
  return angle;
}

function Mark({ minutesAngle, hoursAngle, reduce }: { minutesAngle: number; hoursAngle: number; reduce: boolean }) {
  const t = (delay: number, duration: number) => (reduce ? { duration: 0 } : { delay, duration, ease: [0.22, 1, 0.36, 1] as const });
  const hour = useSweep(hoursAngle, 300, 1100, reduce);
  const minute = useSweep(minutesAngle, 300, 1300, reduce);
  return (
    <svg viewBox="0 0 64 64" className="size-[88px] drop-shadow-[0_18px_40px_rgb(0_0_0/0.35)] sm:size-[104px]" aria-hidden>
      <defs>
        <linearGradient id="intro-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f7a55" />
          <stop offset="1" stopColor="#1b3626" />
        </linearGradient>
      </defs>
      <motion.rect width="64" height="64" rx="20" fill="url(#intro-g)" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 20 }} style={{ transformBox: 'view-box', transformOrigin: '32px 32px' }} />
      <motion.circle cx="32" cy="33" r="16" fill="none" stroke="#f1ece0" strokeOpacity="0.28" strokeWidth="4.5" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={t(0.15, 0.8)} />
      <motion.path d="M32 17a16 16 0 0 1 15.2 11" fill="none" stroke="#d4b98e" strokeWidth="4.5" strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={t(0.55, 0.5)} />
      {/* Ručičky ukážou aktuální čas (otáčí se kolem středu ciferníku 32,33). */}
      <line x1="32" y1="33" x2="32" y2="24.5" stroke="#f1ece0" strokeWidth="4.5" strokeLinecap="round" transform={`rotate(${hour.toFixed(2)} 32 33)`} />
      <line x1="32" y1="33" x2="32" y2="20.5" stroke="#f1ece0" strokeWidth="3.2" strokeLinecap="round" transform={`rotate(${minute.toFixed(2)} 32 33)`} />
      <circle cx="32" cy="33" r="2.6" fill="#f1ece0" />
      <motion.path d="M44 12c-5 0-8 3-8 7 4 0 8-2.5 8-7z" fill="#a8c79f" initial={reduce ? false : { scale: 0, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 14, delay: 0.95 }} style={{ transformBox: 'view-box', transformOrigin: '40px 16px' }} />
    </svg>
  );
}

const TOTAL_MS = 4300;
const REDUCED_MS = 1400;

/** Veřejné stránky (zásady, podmínky, o aplikaci, propojení zařízení) se otevírají bez úvodní animace. */
function openedOnPublicPage(): boolean {
  if (typeof window === 'undefined') return false;
  const where = `${window.location.pathname} ${window.location.hash}`;
  return /\/(soukromi|privacy|podminky|terms|o-aplikaci|about|pripojit)\b/.test(where);
}

export function IntroSplash() {
  const enabled = useAppStore((s) => s.settings.appearance?.intro !== false) && !openedOnPublicPage();
  const reduce = Boolean(useReducedMotion());
  const [visible, setVisible] = useState(enabled);
  const [fontsReady, setFontsReady] = useState(false);
  const [run, setRun] = useState(0);
  const now = useMemo(() => appNow(), [run]); // eslint-disable-line react-hooks/exhaustive-deps
  const { hello, facts } = useMemo(() => dayFacts(now), [now]);
  // Jedna celá otáčka navíc – ručičky se roztočí a zastaví na aktuálním čase.
  const minutesAngle = now.getMinutes() * 6 + now.getSeconds() * 0.1 + 360;
  const hoursAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * 30 + 360;

  // Ukázka z nastavení Vzhled
  const introTick = useUiStore((s) => s.introTick);
  useEffect(() => {
    if (introTick > 0) {
      setRun((r) => r + 1);
      setVisible(true);
    }
  }, [introTick]);

  // Texty až s načteným písmem (jinak by naskočily v náhradním písmu) – nejdéle 450 ms.
  useEffect(() => {
    let alive = true;
    const done = () => alive && setFontsReady(true);
    const t = setTimeout(done, 450);
    document.fonts?.ready.then(done).catch(done);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    document.getElementById('boot-splash')?.remove();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), reduce ? REDUCED_MS : TOTAL_MS);
    const skip = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setVisible(false);
    };
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [visible, reduce, run]);

  const word = 'Stihnuto';
  const rise = (delay: number) => (reduce ? { initial: false as const, animate: { opacity: 1, y: 0 } } : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={`intro-${run}`}
          className="fixed inset-0 z-[200] cursor-pointer overflow-hidden text-[#f1ece0]"
          style={{ background: 'radial-gradient(120% 90% at 50% 30%, #2f5f44 0%, #1d3a2a 45%, #0f1f16 100%)' }}
          onClick={() => setVisible(false)}
          exit={reduce ? { opacity: 0 } : { y: '-100%' }}
          transition={reduce ? { duration: 0.3 } : { duration: 0.75, ease: [0.76, 0, 0.24, 1] }}
          role="presentation"
          aria-hidden
        >
          {/* jemné světlo, které proplouvá pozadím */}
          {!reduce && (
            <motion.div
              className="pointer-events-none absolute -inset-[25%]"
              style={{ background: 'radial-gradient(38% 32% at 30% 30%, rgb(212 185 142 / 0.22), transparent 70%), radial-gradient(34% 30% at 75% 72%, rgb(168 199 159 / 0.18), transparent 70%)' }}
              initial={{ rotate: -10, scale: 1 }}
              animate={{ rotate: 8, scale: 1.08 }}
              transition={{ duration: TOTAL_MS / 1000, ease: 'easeInOut' }}
            />
          )}
          <div className="grain pointer-events-none absolute inset-0 opacity-40" />

          <div className="relative flex h-full flex-col items-center justify-center px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center">
            <Mark minutesAngle={minutesAngle} hoursAngle={hoursAngle} reduce={reduce} />

            {fontsReady && (
              <>
                <p className="mt-5 flex font-display text-[52px] leading-none tracking-tight sm:text-[64px]" aria-label={word}>
                  {word.split('').map((ch, i) => (
                    <motion.span key={i} {...rise(0.55 + i * 0.05)} className={i >= 4 ? 'italic text-[#a8c79f]' : undefined}>
                      {ch}
                    </motion.span>
                  ))}
                </p>
                <motion.p {...rise(1.05)} className="mt-2 font-display text-[24px] italic leading-tight text-[#e7d6b5] sm:text-[28px]">
                  Stihnete to.
                </motion.p>

                <motion.p {...rise(1.4)} className="mt-7 font-display text-[25px] leading-tight text-[#f6f2e8] sm:text-[28px]">
                  {hello}
                </motion.p>
                <ul className="mt-4 w-full max-w-[22rem] space-y-2 text-left">
                  {facts.map((f, i) => (
                    <motion.li
                      key={f.text}
                      {...(reduce ? { initial: false as const, animate: { opacity: 1, y: 0 } } : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay: 1.75 + i * 0.3, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } })}
                      className={f.strong ? 'rounded-[16px] bg-[#d4b98e] px-4 py-2.5 text-[#1b3626]' : 'rounded-[16px] bg-white/[0.08] px-4 py-2.5 ring-1 ring-inset ring-white/15'}
                    >
                      <span className={f.strong ? 'block text-[11px] font-black uppercase tracking-[0.14em] text-[#1b3626]/70' : 'block text-[11px] font-bold uppercase tracking-[0.14em] text-white/55'}>{f.label}</span>
                      <span className="block text-[15px] font-semibold leading-snug">{f.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </>
            )}

            {/* průběh a nenápadné „přeskočit“ */}
            <div className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2.5">
              <span className="h-[3px] w-36 overflow-hidden rounded-full bg-white/12">
                <motion.span className="block h-full origin-left rounded-full bg-[#d4b98e]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: (reduce ? REDUCED_MS : TOTAL_MS - 150) / 1000, ease: 'linear' }} />
              </span>
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.2em] text-white/45">Klepnutím přeskočíte</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
