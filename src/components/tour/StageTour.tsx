/**
 * Prezentační prohlídka na plátno: jako krátká prohlídka (všechno ztmavne,
 * rozsvítí se jen jedna funkce), ale s velkým krátkým popiskem, přes celou
 * aplikaci – Dnes, Doprava, Plán, Předměty i Nastavení. Nejvýš 10 kroků.
 *
 * Když chybí, co ukázat (žádná výuka v příštích hodinách, žádný termín),
 * přidá na dobu prohlídky ukázkovou přednášku a termín – po skončení se
 * samy smažou. Ovládání: šipky, mezerník, PageUp/PageDown (klikr), Esc.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { navigateTo, type View } from '../../hooks/useAppShell';
import { myBuildings } from '../../lib/campus';
import { toDateKey } from '../../lib/dates';
import { removePresentationItems, useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { usePresentationStore } from '../../store/presentationStore';
import { isTransitTarget } from '../../store/selectors';
import { BrandMark } from '../layout/AppShell';
import { Qr } from '../presentation/PresentationMode';

interface StageStep {
  view: View;
  /** Najde zvýrazněný prvek (první viditelný). Bez něj krok jen s popiskem. */
  target?: () => HTMLElement | null;
  title: string;
  text: string;
}

const visible = (el: Element | null | undefined): el is HTMLElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const bySelector = (...selectors: string[]) => () => {
  for (const sel of selectors) for (const el of document.querySelectorAll<HTMLElement>(sel)) if (visible(el)) return el;
  return null;
};
const buttonWithText = (prefix: string) => () => [...document.querySelectorAll<HTMLElement>('main button')].find((b) => visible(b) && (b.textContent ?? '').trim().startsWith(prefix)) ?? null;

const URL = 'prazskystudent.vercel.app';

const STEPS: StageStep[] = [
  { view: 'dnes', target: bySelector('[data-tour="glance"]'), title: 'Kdy vyrazit', text: 'Odpočet do odchodu podle živých spojů a vaší rezervy.' },
  { view: 'dnes', target: bySelector('[aria-label="Termíny dnes a zítra"]'), title: 'Termíny', text: 'Co hoří dnes a zítra. Hotovo jedním klepnutím.' },
  { view: 'dnes', target: bySelector('[data-tour="brief"]'), title: 'Den v kostce', text: 'Kam, kdy a v které učebně.' },
  { view: 'dnes', target: bySelector('[data-tour="menza"]'), title: 'Menza', text: 'Jídelníček na dny dopředu, studentské ceny.' },
  { view: 'dnes', target: bySelector('[aria-label="Soustředění – pomodoro"]'), title: 'Soustředění', text: 'Pomodoro s hudbou na učení.' },
  { view: 'doprava', target: () => [...document.querySelectorAll<HTMLElement>('li')].find((li) => visible(li) && (li.textContent ?? '').includes('Pojedu tímto')) ?? null, title: 'Spojení', text: 'Jako IDOS – doporučí, čím jet a kdy vyrazit. Pak naviguje až na nástupiště.' },
  { view: 'plan', target: bySelector('main section', 'main .card'), title: 'Plán', text: 'Úkoly, kalendář a harmonogram semestru.' },
  { view: 'predmety', target: bySelector('main .grid', 'main ul'), title: 'Předměty', text: 'Ze SISu – se sylaby, povinnostmi a materiály z Moodlu.' },
  { view: 'nastaveni', target: buttonWithText('Propojení'), title: 'Propojení', text: 'SIS, Moodle a Google jednou – pak se vše hlídá samo.' },
  { view: 'dnes', title: 'Stihnuto', text: 'Zdarma, v telefonu i v počítači.' },
];

/** Ukázková přednáška a termín, když v datech nic není (po prohlídce se smažou). */
function prepareDemo(): void {
  const st = useAppStore.getState();
  const now = appNow();
  const track = usePresentationStore.getState().track;
  const soon = st.events.some((e) => isTransitTarget(e) && new Date(e.start).getTime() > now.getTime() + 15 * 60_000 && new Date(e.start).getTime() < now.getTime() + 4 * 3_600_000);
  const building = myBuildings(st.settings)[0];
  if (!soon && building) {
    const start = new Date(Math.ceil((now.getTime() + 75 * 60_000) / (5 * 60_000)) * 5 * 60_000);
    const id = st.addEvent({ title: 'Ukázková přednáška', kind: 'lecture', start: start.toISOString(), end: new Date(start.getTime() + 90 * 60_000).toISOString(), buildingId: building.id, location: building.name });
    track('event', id, 'tour');
  }
  const today = toDateKey(now);
  const hasDeadline = st.tasks.some((t) => !t.done && t.due?.slice(0, 10) === today) || st.requirements.some((r) => !r.done && r.deadline && toDateKey(new Date(r.deadline)) === today);
  if (!hasDeadline) {
    const id = st.addTask({ title: 'Odevzdat seminární práci', due: today });
    track('task', id, 'tour');
  }
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function StageTour() {
  const active = usePresentationStore((s) => s.stage);
  if (!active) return null;
  return <StageOverlay />;
}

function StageOverlay() {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const touch = useRef<number | null>(null);
  const step = STEPS[index];

  const close = useCallback(() => {
    usePresentationStore.getState().setStage(false);
    removePresentationItems('tour');
    navigateTo('dnes');
  }, []);

  useEffect(() => {
    prepareDemo();
    document.documentElement.classList.add('stage-tour');
    return () => document.documentElement.classList.remove('stage-tour');
  }, []);

  const measure = useCallback(() => {
    const el = step.target?.();
    setVp({ w: window.innerWidth, h: window.innerHeight });
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 12;
    const top = Math.max(8, r.top - pad);
    const bottom = Math.min(window.innerHeight - 8, r.bottom + pad);
    setBox({ top, left: Math.max(8, r.left - pad), width: Math.min(window.innerWidth - 16, r.width + pad * 2), height: Math.max(48, bottom - top) });
  }, [step]);

  useLayoutEffect(() => {
    setBox(null);
    navigateTo(step.view);
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Obrazovka se musí načíst (a Doprava najít spojení) – zkusit vícekrát.
    const scroll = () => {
      const el = step.target?.();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const tall = r.height > window.innerHeight * 0.5;
      el.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center' });
    };
    for (const ms of [350, 800]) timers.push(setTimeout(scroll, ms));
    for (const ms of [450, 900, 1400, 2200]) timers.push(setTimeout(measure, ms));
    return () => timers.forEach(clearTimeout);
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
    };
  }, [measure]);

  const go = useCallback(
    (d: number) => {
      if (index + d >= STEPS.length) return close();
      setIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + d)));
    },
    [index, close],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, close]);

  const final = index === STEPS.length - 1;
  const small = vp.w < 640;
  // Popisek tam, kde je víc místa (pod zvýrazněním, nebo nad ním).
  const center = box ? box.top + box.height / 2 : vp.h / 2;
  const captionAtBottom = center < vp.h / 2;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Prezentační prohlídka"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <div className="absolute inset-0" onClick={() => go(1)} aria-hidden />
      {box && !final ? (
        <motion.div
          key="spot"
          className="pointer-events-none absolute rounded-[30px] ring-[3px] ring-white"
          initial={false}
          animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
          style={{ boxShadow: '0 0 0 9999px rgb(8 16 11 / 0.74), 0 0 60px 8px rgb(212 185 142 / 0.35)' }}
        />
      ) : (
        <motion.div key="shade" className="pointer-events-none absolute inset-0 bg-[#0b1710]/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      )}

      <AnimatePresence mode="wait">
        {final ? (
          <motion.div key="final" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center text-[#f6f2e8]">
            <BrandMark className="size-20 sm:size-24" live />
            <p className="font-display text-[56px] leading-none sm:text-[96px]">
              Stih<em className="italic text-[#a8c79f]">nuto</em>
            </p>
            <p className="max-w-2xl text-[20px] text-white/80 sm:text-[28px]">{step.text}</p>
            <Qr text={`https://${URL}`} />
            <p className="text-[22px] font-bold tracking-wide sm:text-[30px]">{URL}</p>
          </motion.div>
        ) : (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: captionAtBottom ? 24 : -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-x-0 flex justify-center px-4"
            style={captionAtBottom ? { bottom: small ? 84 : 40 } : { top: small ? 20 : 32 }}
          >
            <div className="max-w-[min(880px,94vw)] rounded-[30px] bg-[#f6f2e8] px-6 py-5 text-center text-[#14231a] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] sm:px-10 sm:py-7">
              <p className="text-[13px] font-black uppercase tracking-[0.2em] text-[#2b5a40]/70 sm:text-[15px]">
                {index + 1} / {STEPS.length - 1}
              </p>
              <p className="mt-1 font-display text-[40px] leading-[1.02] sm:text-[68px]">{step.title}</p>
              <p className="mt-2 text-[18px] leading-snug text-[#14231a]/75 sm:text-[26px]">{step.text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ovládání (pro myš; klikr a šipky fungují vždy) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 sm:bottom-5 sm:right-5">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} className="grid size-11 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25 disabled:opacity-30" aria-label="Předchozí krok">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={() => go(1)} className="grid size-11 place-items-center rounded-full bg-[#e7d6b5] text-[#1d3a2a] hover:brightness-105" aria-label={final ? 'Ukončit' : 'Další krok'}>
          {final ? <X className="size-5" aria-hidden /> : <ArrowRight className="size-5" aria-hidden />}
        </button>
        <button type="button" onClick={close} className="grid size-11 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25" aria-label="Ukončit prohlídku (Esc)">
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
