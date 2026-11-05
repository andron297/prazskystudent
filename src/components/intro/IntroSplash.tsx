/**
 * Úvodní animace při každém otevření aplikace (asi 2 s, klepnutím se dá
 * přeskočit): logo se nakreslí, ručička hodin se natočí na aktuální čas,
 * pozdrav a jedna věta podle toho, co vás dnes čeká.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatTime, isSameDay, plural } from '../../lib/dates';
import { nameDayText, publicHoliday } from '../../lib/czechDays';
import { visibleEvents } from '../../lib/dedupe';
import { isRequirementComplete } from '../../lib/progress';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { buildingForEvent } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';

const GENERIC = [
  'Všechno důležité na jednom místě.',
  'Tramvaje jezdí, termíny hlídáme.',
  'Hluboký nádech. Den je pod kontrolou.',
  'Káva, tramvaj, přednáška – všechno včas.',
  'Malé kroky, velké výsledky.',
  'Plán je připravený. Vy taky.',
];

function greeting(h: number): string {
  if (h < 5) return 'Dobrou noc';
  if (h < 10) return 'Dobré ráno';
  if (h < 12) return 'Dobré dopoledne';
  if (h < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

/** Jedna věta podle dne: výuka, termín, víkend, noc… */
function dayLine(now: Date): string {
  const s = useAppStore.getState();
  const h = now.getHours();
  if (h < 5) return 'Je pozdě. Zítřek je naplánovaný – dopřejte si spánek.';
  const holiday = publicHoliday(now);
  if (holiday) return `Dnes je státní svátek – ${holiday.charAt(0).toLowerCase()}${holiday.slice(1)}.`;
  const deadline = s.requirements.find((r) => r.deadline && !isRequirementComplete(r) && isSameDay(new Date(r.deadline), now) && new Date(r.deadline) > now);
  if (deadline) return `Dnes je termín: ${deadline.title}. Zvládnete to.`;
  const classes = visibleEvents(s.events, s.subjects)
    .filter((e) => e.kind !== 'personal' && !e.allDay && isSameDay(new Date(e.start), now) && new Date(e.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (classes.length > 0) {
    const first = classes[0];
    const building = buildingForEvent(first, s.settings).building;
    const n = classes.length;
    const started = new Date(first.start) <= now;
    return `Dnes ještě ${n} ${plural(n, ['hodina', 'hodiny', 'hodin'])} výuky. ${started ? 'Jedna právě probíhá' : `První v ${formatTime(new Date(first.start))}`}${building?.locative && !started ? ` ${building.locative}` : ''}.`;
  }
  const day = now.getDay();
  if (day === 0 || day === 6) return 'Víkend. Plán počká, odpočinek ne.';
  return GENERIC[Math.floor((now.getTime() / 60_000) % GENERIC.length)];
}

function Mark({ minutesAngle, hoursAngle }: { minutesAngle: number; hoursAngle: number }) {
  const draw = { duration: 0.9, ease: [0.65, 0, 0.35, 1] as const };
  return (
    <svg viewBox="0 0 64 64" className="size-[104px] drop-shadow-[0_18px_40px_rgb(0_0_0/0.35)]" aria-hidden>
      <defs>
        <linearGradient id="intro-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3f7a55" />
          <stop offset="1" stopColor="#1b3626" />
        </linearGradient>
      </defs>
      <motion.rect width="64" height="64" rx="20" fill="url(#intro-g)" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} style={{ originX: '50%', originY: '50%' }} />
      <motion.circle cx="32" cy="33" r="16" fill="none" stroke="#f1ece0" strokeOpacity="0.28" strokeWidth="4.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ ...draw, delay: 0.15 }} />
      <motion.path d="M32 17a16 16 0 0 1 15.2 11" fill="none" stroke="#d4b98e" strokeWidth="4.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.55, ease: 'easeOut' }} />
      {/* hodinová a minutová ručička se natočí na aktuální čas */}
      <motion.line x1="32" y1="33" x2="32" y2="24" stroke="#f1ece0" strokeWidth="4.5" strokeLinecap="round" initial={{ rotate: 0 }} animate={{ rotate: hoursAngle }} transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ originX: '32px', originY: '33px' }} />
      <motion.line x1="32" y1="33" x2="32" y2="21" stroke="#f1ece0" strokeWidth="3.2" strokeLinecap="round" initial={{ rotate: 0 }} animate={{ rotate: minutesAngle }} transition={{ duration: 1.3, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ originX: '32px', originY: '33px' }} />
      <motion.circle cx="32" cy="33" r="2.6" fill="#f1ece0" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.35 }} />
      <motion.path d="M44 12c-5 0-8 3-8 7 4 0 8-2.5 8-7z" fill="#a8c79f" initial={{ scale: 0, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.85 }} style={{ originX: '40px', originY: '16px' }} />
    </svg>
  );
}

export function IntroSplash() {
  const enabled = useAppStore((s) => s.settings.appearance?.intro !== false);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(enabled);
  const now = useMemo(() => appNow(), []);
  const line = useMemo(() => dayLine(now), [now]);
  const nameDay = useMemo(() => nameDayText(now), [now]);
  const minutesAngle = now.getMinutes() * 6 + 360;
  const hoursAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;

  // Ukázka z nastavení Vzhled
  const introTick = useUiStore((s) => s.introTick);
  useEffect(() => {
    if (introTick > 0) setVisible(true);
  }, [introTick]);
  useEffect(() => {
    if (!visible || introTick === 0) return;
    const t = setTimeout(() => setVisible(false), reduced ? 900 : 2300);
    return () => clearTimeout(t);
  }, [visible, introTick, reduced]);

  useEffect(() => {
    document.getElementById('boot-splash')?.remove();
    if (!enabled) return;
    const t = setTimeout(() => setVisible(false), reduced ? 900 : 2300);
    const skip = () => setVisible(false);
    window.addEventListener('keydown', skip, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [enabled, reduced]);

  const word = 'Stihnu';
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-[200] grid cursor-pointer place-items-center overflow-hidden text-[#f1ece0]"
          style={{ background: 'radial-gradient(120% 90% at 50% 30%, #2f5f44 0%, #1d3a2a 45%, #0f1f16 100%)' }}
          onClick={() => setVisible(false)}
          exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          role="presentation"
        >
          {/* jemné světlo, které proplouvá pozadím */}
          <motion.div aria-hidden className="pointer-events-none absolute -inset-[20%] opacity-60" style={{ background: 'radial-gradient(40% 35% at 30% 30%, rgb(212 185 142 / 0.22), transparent 70%), radial-gradient(35% 30% at 75% 70%, rgb(168 199 159 / 0.18), transparent 70%)' }} initial={{ rotate: -8, scale: 1 }} animate={{ rotate: 6, scale: 1.08 }} transition={{ duration: 2.4, ease: 'easeInOut' }} />
          <div className="grain pointer-events-none absolute inset-0 opacity-50" aria-hidden />
          <div className="relative flex flex-col items-center px-8 text-center">
            <Mark minutesAngle={minutesAngle} hoursAngle={hoursAngle} />
            <p className="mt-6 flex font-display text-[54px] leading-none tracking-tight" aria-label={word}>
              {word.split('').map((ch, i) => (
                <motion.span key={i} initial={{ y: 26, opacity: 0, filter: 'blur(6px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} transition={{ delay: 0.45 + i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className={i >= 4 ? 'italic text-[#a8c79f]' : undefined}>
                  {ch}
                </motion.span>
              ))}
            </p>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.95, duration: 0.5 }} className="mt-5 font-display text-[26px] italic leading-tight text-[#e7d6b5]">
              {greeting(now.getHours())}
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15, duration: 0.5 }} className="mt-2 max-w-sm text-[15.5px] leading-relaxed text-[#f1ece0]/85">
              {line}
            </motion.p>
            {nameDay && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.35, duration: 0.5 }} className="mt-3 text-[12.5px] font-semibold uppercase tracking-[0.18em] text-[#f1ece0]/55">
                {nameDay}
              </motion.p>
            )}
          </div>
          {/* tenký průběh dole */}
          <motion.span aria-hidden className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] h-[3px] w-32 origin-left rounded-full bg-[#d4b98e]/80" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0.8 : 2.1, ease: 'linear' }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
