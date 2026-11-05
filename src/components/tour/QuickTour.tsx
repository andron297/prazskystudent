/**
 * Krátká prohlídka aplikace: postupně zvýrazní hlavní části obrazovky Dnes
 * a jednou dvěma větami řekne, k čemu jsou. Šipkami, Esc, nebo tlačítky.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpenText, X } from 'lucide-react';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';

interface TourStep {
  /** Hodnoty atributu data-tour; použije se první viditelný prvek. */
  targets: string[];
  title: string;
  text: string;
}

const STEPS: TourStep[] = [
  {
    targets: ['glance'],
    title: 'Kdy vyrazit',
    text: 'Odpočet do odchodu, zastávka, nástupiště a spoj. Počítá s vaší rezervou. Tlačítkem Navigovat vás aplikace dovede až na zastávku.',
  },
  {
    targets: ['brief'],
    title: 'Den v kostce',
    text: 'Kam jdete (budova a učebna), kdy vám to jede a co máte k dnešním předmětům. Večer se přepne na zítřek a úkoly na další dny.',
  },
  {
    targets: ['tasks'],
    title: 'Úkoly a termíny',
    text: 'Všechno na jednom místě – vlastní úkoly, Google Úkoly i termíny z Moodlu a SISu. Předmět k úkolu aplikace pozná sama.',
  },
  {
    targets: ['menza'],
    title: 'Jídelníček menzy',
    text: 'Menza nejblíž budově, kde máte výuku, se studentskými cenami. Jinou menzu vyberete klepnutím na její název.',
  },
  {
    targets: ['nav', 'nav-mobile'],
    title: 'Hlavní menu',
    text: 'Úkoly, doprava a mapa zastávek, předměty s materiály a kalendář s harmonogramem akademického roku.',
  },
  {
    targets: ['add'],
    title: 'Rychle přidat',
    text: 'Napište třeba „esej do pátku“ nebo „zítra 18:00 trénink“. Datum, čas i předmět aplikace pozná z textu.',
  },
  {
    targets: ['connections', 'account'],
    title: 'Propojení a účet',
    text: 'Tady propojíte SIS, Moodle a Google a spravujete účet. Data se šifrují a synchronizují mezi vašimi zařízeními.',
  },
];

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

function findTarget(step: TourStep): HTMLElement | null {
  for (const t of step.targets) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${t}"]`)) if (visible(el)) return el;
  }
  return null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function QuickTour() {
  const active = useUiStore((s) => s.tour);
  if (!active) return null;
  return <TourOverlay />;
}

function TourOverlay() {
  const close = useCallback(() => {
    useUiStore.setState({ tour: false });
    useAppStore.getState().markTourSeen();
  }, []);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Prohlídka běží na obrazovce Dnes; kroky bez viditelného prvku se vynechají.
  useEffect(() => {
    if (!/^#\/?(dnes)?$/.test(window.location.hash) && window.location.hash !== '') navigateTo('dnes');
    const t = setTimeout(() => setSteps(STEPS.filter((s) => findTarget(s))), 450);
    return () => clearTimeout(t);
  }, []);

  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = findTarget(step);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const vh = window.innerHeight;
    const top = Math.max(8, r.top - pad);
    const bottom = Math.min(vh - 8, r.bottom + pad);
    setBox({ top, left: Math.max(8, r.left - pad), width: Math.min(window.innerWidth - 16, r.width + pad * 2), height: Math.max(40, bottom - top) });
    setViewport({ w: window.innerWidth, h: vh });
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    const el = findTarget(step);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fixed = getComputedStyle(el).position === 'fixed' || el.closest('header, nav')?.matches('.sticky, .fixed, [class*="fixed"]');
    if (!fixed) {
      const tall = r.height > window.innerHeight * 0.55;
      el.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center' });
    }
    measure();
    const t1 = setTimeout(measure, 380);
    const t2 = setTimeout(measure, 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const next = useCallback(() => (index >= steps.length - 1 ? close() : setIndex((i) => i + 1)), [index, steps.length, close]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, next, back]);

  if (steps.length === 0) return null;

  const cardW = Math.min(360, viewport.w - 32);
  const below = box ? viewport.h - (box.top + box.height) > 210 : true;
  const cardTop = box ? box.top + box.height + 12 : viewport.h / 2;
  const cardLeft = box ? Math.min(Math.max(16, box.left + box.width / 2 - cardW / 2), viewport.w - cardW - 16) : (viewport.w - cardW) / 2;
  const roomAbove = box ? box.top > 210 : false;
  const placeBottom = !below && !roomAbove;

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Prohlídka aplikace">
      <div className="absolute inset-0" onClick={next} aria-hidden />
      {box && (
        <motion.div
          className="pointer-events-none absolute rounded-[26px] ring-2 ring-white/85"
          initial={false}
          animate={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          transition={{ type: 'spring', stiffness: 260, damping: 32 }}
          style={{ boxShadow: '0 0 0 9999px rgb(9 18 12 / 0.64)' }}
        />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: below ? 8 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute rounded-[22px] bg-[var(--surface)] p-4 shadow-[0_24px_50px_-20px_rgb(0_0_0/0.6)] ring-1 ring-line"
          style={{
            width: cardW,
            left: cardLeft,
            ...(placeBottom ? { bottom: 16 } : below ? { top: cardTop } : { bottom: viewport.h - (box ? box.top : viewport.h / 2) + 12 }),
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow text-subtle">
              {index + 1} z {steps.length}
            </p>
            <button type="button" onClick={close} className="-m-1 grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Ukončit prohlídku">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 font-display text-[24px] leading-tight">{step.title}</p>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{step.text}</p>
          <div className="mt-4 flex items-center justify-between gap-2">
            {index === 0 ? (
              <button
                type="button"
                onClick={() => {
                  close();
                  navigateTo('pruvodce');
                }}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
              >
                <BookOpenText className="size-4" aria-hidden /> Podrobný průvodce
              </button>
            ) : (
              <button type="button" onClick={back} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
                <ArrowLeft className="size-4" aria-hidden /> Zpět
              </button>
            )}
            <button type="button" onClick={next} autoFocus className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-[14px] font-bold text-accent-fg hover:brightness-110">
              {index >= steps.length - 1 ? 'Hotovo' : 'Další'} {index < steps.length - 1 && <ArrowRight className="size-4" aria-hidden />}
            </button>
          </div>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={i === index ? 'h-1.5 w-5 rounded-full bg-accent' : 'size-1.5 rounded-full bg-line-strong'} />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
