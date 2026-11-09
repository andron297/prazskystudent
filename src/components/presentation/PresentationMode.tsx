/**
 * Prezentace aplikace: průvodce na velké plátno – obří text, plynulé
 * animace, skutečné obrazovky Stihnuta. Ovládá se šipkami, mezerníkem,
 * klikrem (Page Up/Down), přejetím prstem; F = celá obrazovka, Esc = konec.
 */
import { useAppOrigin } from '../../lib/appUrl';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { BrandMark } from '../layout/AppShell';
import { cn } from '../ui/primitives';

interface Slide {
  kicker: string;
  title: ReactNode;
  points?: string[];
  image?: { src: string; phone?: boolean; alt: string };
  bg: string;
  final?: boolean;
}

const SLIDES: Slide[] = [
  {
    kicker: 'Studijní aplikace pro studenty UK',
    title: (
      <>
        Stihnu<em>to</em>
      </>
    ),
    points: ['Rozvrh, termíny, doprava a menza – v jedné aplikaci.', 'Řekne vám, kdy vyrazit, a dovede vás až na nástupiště.'],
    bg: '/images/prague-1200.webp',
  },
  {
    kicker: 'Hlavní stránka',
    title: (
      <>
        Kdy <em>vyrazit</em>
      </>
    ),
    points: ['Odpočet do odchodu se spojem, zastávkou a nástupištěm.', 'Počítá se zpožděním, vaší rezervou i s tím, co máte před tím.', 'Termíny na dnešek a zítra hned pod tím.'],
    image: { src: '/presentation/p-dnes.webp', alt: 'Hlavní stránka Stihnuta s odpočtem odchodu' },
    bg: '/images/mala-strana-1200.webp',
  },
  {
    kicker: 'Navigace',
    title: (
      <>
        Až na <em>nástupiště</em>
      </>
    ),
    points: ['Pěšky po chodnících a přechodech, ve 3D.', 'Ví, kterým vstupem do metra jít – i když jich má stanice deset.', 'Mluví celými větami: směr, konečná, kolej.'],
    image: { src: '/presentation/p-navigace.webp', phone: true, alt: 'Navigace na zastávku ve 3D' },
    bg: '/images/karluv-most-noc-1200.webp',
  },
  {
    kicker: 'Doprava',
    title: (
      <>
        Spojení <em>jako IDOS</em>
      </>
    ),
    points: ['Doporučený, nejjednodušší a nejrychlejší spoj.', 'Méně přestupů má přednost, za deště méně chůze.', '„Pojedu tímto“ – a hlavní stránka odpočítává váš spoj.'],
    image: { src: '/presentation/p-doprava.webp', alt: 'Vyhledávač spojení' },
    bg: '/images/mostecka-vez-1200.webp',
  },
  {
    kicker: 'Plán',
    title: (
      <>
        Termíny <em>nepropásnete</em>
      </>
    ),
    points: ['Rozvrh ze SISu, úkoly a testy z Moodlu, Google Kalendář i Úkoly.', 'Sylaby ze SISu – povinnosti a váhy přečte AI.', 'Vše oběma směry, i v kalendáři v telefonu.'],
    image: { src: '/presentation/p-plan.webp', alt: 'Týdenní plán' },
    bg: '/images/riverside-1200.webp',
  },
  {
    kicker: 'Soukromí',
    title: (
      <>
        Vaše data <em>jsou vaše</em>
      </>
    ),
    points: ['Šifrování přímo v zařízení – na serveru jen zašifrovaný balík.', 'Žádné reklamy, žádné sledování.', 'Otevřený zdrojový kód.'],
    image: { src: '/presentation/p-nastaveni.webp', phone: true, alt: 'Nastavení' },
    bg: '/images/forest-1200.webp',
  },
  {
    kicker: 'Vyzkoušejte',
    title: (
      <>
        Zdarma, <em>hned teď</em>
      </>
    ),
    points: ['__APP_HOST__', 'Funguje v prohlížeči i jako aplikace na ploše telefonu.'],
    bg: '/images/hrad-vecer-1200.webp',
    final: true,
  },
];

export function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  }, [text]);
  return <div className="size-[min(34vh,320px)] overflow-hidden rounded-[24px] bg-white p-3 shadow-2xl [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function PresentationMode({ onClose }: { onClose: () => void }) {
  const app = useAppOrigin();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const touch = useRef<number | null>(null);
  const slide = SLIDES[index];
  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.max(0, Math.min(SLIDES.length - 1, i + delta));
        setDir(delta);
        return next;
      });
    },
    [setIndex],
  );
  const fullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Escape') onClose();
      else if (e.key.toLowerCase() === 'f') fullscreen();
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(SLIDES.length - 1);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [go, onClose]);

  // Obrázky dalšího snímku načíst předem (plynulé přechody i na pomalé síti).
  useEffect(() => {
    const next = SLIDES[index + 1];
    if (next?.image) new Image().src = next.image.src;
    if (next) new Image().src = next.bg;
  }, [index]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] overflow-hidden bg-[#0b110d] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Prezentace aplikace"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.div key={index} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
          <motion.img src={slide.bg} alt="" className="absolute inset-0 size-full object-cover" initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 6, ease: 'easeOut' }} />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b110d]/95 via-[#0b110d]/75 to-[#0b110d]/35" />
        </motion.div>
      </AnimatePresence>

      <div className="relative z-10 flex h-full flex-col px-[6vw] py-[5vh]">
        <div className="flex items-center gap-3">
          <BrandMark className="size-12" />
          <span className="font-display text-[34px] leading-none">
            Stihnu<em className="text-[#a8c79f]">to</em>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={fullscreen} className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 hover:bg-white/20" aria-label="Celá obrazovka (F)" title="Celá obrazovka (F)">
              <Expand className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 hover:bg-white/20" aria-label="Ukončit prezentaci (Esc)" title="Ukončit (Esc)">
              <X className="size-5" aria-hidden />
            </button>
          </span>
        </div>

        <div className={cn('grid min-h-0 flex-1 items-center gap-[4vw]', slide.image || slide.final ? 'lg:grid-cols-[1.05fr_1fr]' : '')}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={`t${index}`}
              initial={{ opacity: 0, x: 60 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 * dir }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              <p className="text-[clamp(16px,1.6vw,24px)] font-bold uppercase tracking-[0.18em] text-[#e7d6b5]">{slide.kicker}</p>
              <h2 className="mt-[1.5vh] font-display text-[clamp(56px,8.5vw,148px)] leading-[0.9] [&_em]:text-[#a8c79f]">{slide.title}</h2>
              {slide.points && (
                <ul className="mt-[4vh] space-y-[1.6vh]">
                  {slide.points.map((p, i) => (
                    <motion.li
                      key={p}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + i * 0.12, duration: 0.5 }}
                      className={cn('flex gap-4 text-[clamp(20px,2.3vw,38px)] leading-snug text-white/90', slide.final && i === 0 && 'font-bold text-white')}
                    >
                      {!slide.final && <span className="mt-[0.55em] size-3 shrink-0 rounded-full bg-[#a8c79f]" aria-hidden />}
                      {p === '__APP_HOST__' ? app.host : p}
                    </motion.li>
                  ))}
                </ul>
              )}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {slide.image ? (
              <motion.div
                key={`i${index}`}
                initial={{ opacity: 0, y: 40, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                className="hidden min-h-0 justify-center lg:flex"
              >
                {slide.image.phone ? (
                  <div className="rounded-[44px] bg-[#1c1f1d] p-3 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/15">
                    <img src={slide.image.src} alt={slide.image.alt} className="h-[62vh] w-auto rounded-[34px]" />
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[22px] bg-[#1c1f1d] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] ring-1 ring-white/15">
                    <div className="flex h-7 items-center gap-1.5 bg-[#2a2e2b] px-3">
                      <i className="size-2.5 rounded-full bg-white/25" />
                      <i className="size-2.5 rounded-full bg-white/25" />
                      <i className="size-2.5 rounded-full bg-white/25" />
                    </div>
                    <img src={slide.image.src} alt={slide.image.alt} className="block max-h-[58vh] w-auto" />
                  </div>
                )}
              </motion.div>
            ) : slide.final ? (
              <motion.div key="qr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="flex justify-center">
                <Qr text={app.origin} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-4">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} className="grid size-12 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 hover:bg-white/20 disabled:opacity-30" aria-label="Předchozí">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <div className="flex flex-1 items-center gap-2">
            {SLIDES.map((_, i) => (
              <button key={i} type="button" onClick={() => setIndex(i)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15" aria-label={`Snímek ${i + 1}`}>
                <motion.span className="block h-full rounded-full bg-[#e7d6b5]" initial={false} animate={{ width: i <= index ? '100%' : '0%' }} transition={{ duration: 0.5 }} />
              </button>
            ))}
          </div>
          <span className="tabular text-[15px] text-white/70">
            {index + 1} / {SLIDES.length}
          </span>
          <button type="button" onClick={() => go(1)} disabled={index === SLIDES.length - 1} className="grid size-12 place-items-center rounded-full bg-[#e7d6b5] text-[#1d3a2a] hover:brightness-105 disabled:opacity-30" aria-label="Další">
            <ChevronRight className="size-6" aria-hidden />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
