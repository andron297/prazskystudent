/**
 * Úvodní animace při každém otevření (asi 4 s, klepnutím se dá přeskočit):
 *  1. logo se nakreslí a ručičky hodin se natočí na aktuální čas,
 *  2. „Stihnu – Stihnete to.“,
 *  3. tři karty „váš den“: pozdrav, co vás dnes čeká, odpočet nebo svátek,
 *  4. opona se zvedne a pod ní je hotová aplikace.
 * Jen transformace a průhlednost (plynulé i na slabším telefonu), texty až po
 * načtení písma, „omezit pohyb“ = krátká statická verze.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { calendarDayDiff, formatTime, isSameDay, plural, toDate } from '../../lib/dates';
import { nameDayText, publicHoliday } from '../../lib/czechDays';
import { visibleEvents } from '../../lib/dedupe';
import { countdown3d, type Emoji3DName } from '../../lib/emoji3d';
import { isRequirementComplete } from '../../lib/progress';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { buildingForEvent } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';
import { Emoji3D } from '../ui/Emoji3D';

interface Fact {
  emoji: Emoji3DName;
  text: string;
}

function greeting(h: number): [string, Emoji3DName] {
  if (h < 5) return ['Dobrou noc', 'night-with-stars'];
  if (h < 10) return ['Dobré ráno', 'sunrise'];
  if (h < 12) return ['Dobré dopoledne', 'sun-behind-small-cloud'];
  if (h < 18) return ['Dobré odpoledne', 'sun'];
  if (h < 21) return ['Dobrý večer', 'sunset'];
  return ['Dobrý večer', 'crescent-moon'];
}

/** Tři věty o dnešku: pozdrav, co vás čeká, odpočet nebo svátek. */
function dayFacts(now: Date): Fact[] {
  const s = useAppStore.getState();
  const [hello, helloEmoji] = greeting(now.getHours());
  const name = s.settings.displayName.trim();
  const facts: Fact[] = [{ emoji: helloEmoji, text: name ? `${hello}, ${name}` : hello }];

  const holiday = publicHoliday(now);
  const deadline = s.requirements.find((r) => r.deadline && !isRequirementComplete(r) && isSameDay(new Date(r.deadline), now) && new Date(r.deadline) > now);
  const classes = visibleEvents(s.events, s.subjects)
    .filter((e) => e.kind !== 'personal' && !e.allDay && isSameDay(new Date(e.start), now) && new Date(e.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (now.getHours() < 5) facts.push({ emoji: 'sleeping-face', text: 'Zítřek je naplánovaný. Dopřejte si spánek.' });
  else if (holiday) facts.push({ emoji: 'party-popper', text: `Dnes je svátek: ${holiday.charAt(0).toLowerCase()}${holiday.slice(1)}` });
  else if (deadline) facts.push({ emoji: 'memo', text: `Dnes termín: ${deadline.title}` });
  else if (classes.length > 0) {
    const first = classes[0];
    const building = buildingForEvent(first, s.settings).building;
    const started = new Date(first.start) <= now;
    const n = classes.length;
    facts.push({
      emoji: 'graduation-cap',
      text: started ? `Právě probíhá výuka · dnes ještě ${n} ${plural(n, ['hodina', 'hodiny', 'hodin'])}` : `První výuka v ${formatTime(new Date(first.start))}${building ? ` · ${building.name}` : ''}`,
    });
  } else if (now.getDay() === 0 || now.getDay() === 6) facts.push({ emoji: 'beach-with-umbrella', text: 'Víkend. Plán počká, odpočinek ne.' });
  else facts.push({ emoji: 'seedling', text: 'Dnes už žádná výuka – čas na vás.' });

  const countdown = (s.settings.countdowns ?? [])
    .map((c) => ({ c, days: calendarDayDiff(toDate(c.at), now) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)[0];
  const nameDay = nameDayText(now);
  if (countdown) {
    const d = countdown.days;
    facts.push({ emoji: countdown3d(countdown.c.emoji), text: d === 0 ? `Dnes: ${countdown.c.title}` : `${countdown.c.title} za ${d} ${plural(d, ['den', 'dny', 'dní'])}` });
  } else if (nameDay) facts.push({ emoji: 'wrapped-gift', text: nameDay });
  return facts.slice(0, 3);
}

function Mark({ minutesAngle, hoursAngle, reduce }: { minutesAngle: number; hoursAngle: number; reduce: boolean }) {
  const t = (delay: number, duration: number) => (reduce ? { duration: 0 } : { delay, duration, ease: [0.22, 1, 0.36, 1] as const });
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
      {/* Ručičky se otáčejí kolem středu ciferníku v souřadnicích SVG (view-box), ne kolem sebe. */}
      <motion.g initial={reduce ? false : { rotate: 0 }} animate={{ rotate: hoursAngle }} transition={t(0.3, 1.1)} style={{ transformBox: 'view-box', transformOrigin: '32px 33px' }}>
        <line x1="32" y1="33" x2="32" y2="24" stroke="#f1ece0" strokeWidth="4.5" strokeLinecap="round" />
      </motion.g>
      <motion.g initial={reduce ? false : { rotate: 0 }} animate={{ rotate: minutesAngle }} transition={t(0.3, 1.3)} style={{ transformBox: 'view-box', transformOrigin: '32px 33px' }}>
        <line x1="32" y1="33" x2="32" y2="21" stroke="#f1ece0" strokeWidth="3.2" strokeLinecap="round" />
      </motion.g>
      <circle cx="32" cy="33" r="2.6" fill="#f1ece0" />
      <motion.path d="M44 12c-5 0-8 3-8 7 4 0 8-2.5 8-7z" fill="#a8c79f" initial={reduce ? false : { scale: 0, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 14, delay: 0.95 }} style={{ transformBox: 'view-box', transformOrigin: '40px 16px' }} />
    </svg>
  );
}

const TOTAL_MS = 4300;
const REDUCED_MS = 1400;

export function IntroSplash() {
  const enabled = useAppStore((s) => s.settings.appearance?.intro !== false);
  const reduce = Boolean(useReducedMotion());
  const [visible, setVisible] = useState(enabled);
  const [fontsReady, setFontsReady] = useState(false);
  const [run, setRun] = useState(0);
  const now = useMemo(() => appNow(), [run]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts = useMemo(() => dayFacts(now), [now]);
  const minutesAngle = now.getMinutes() * 6 + 360;
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

  const word = 'Stihnu';
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

                <ul className="mt-7 w-full max-w-[22rem] space-y-2 text-left">
                  {facts.map((f, i) => (
                    <motion.li
                      key={f.text}
                      {...(reduce ? { initial: false as const, animate: { opacity: 1, y: 0 } } : { initial: { opacity: 0, y: 22, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { delay: 1.55 + i * 0.32, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } })}
                      className="flex items-center gap-3 rounded-[18px] bg-white/[0.08] px-3.5 py-2.5 ring-1 ring-inset ring-white/15"
                    >
                      <Emoji3D name={f.emoji} size={34} eager />
                      <span className="min-w-0 text-[15px] font-semibold leading-snug text-[#f6f2e8]">{f.text}</span>
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
