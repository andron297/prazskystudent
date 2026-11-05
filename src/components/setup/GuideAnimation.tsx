/**
 * Animované návody k propojení: zjednodušená ilustrace obrazovky (SIS,
 * Moodle, Google) a kurzor, který ukáže, kam klepnout. Běží dokola, dá se
 * zastavit a projít po krocích. Nejde o snímky skutečných stránek – jen
 * o schéma, aby bylo jasné, co hledat.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, Pause, Play, ShieldAlert, Upload } from 'lucide-react';
import { cn } from '../ui/primitives';

interface Frame {
  caption: ReactNode;
  /** Kam míří kurzor (v % plochy ilustrace). */
  x: number;
  y: number;
  screen: (clicked: boolean) => ReactNode;
}

const MOVE_MS = 900;
const CLICK_MS = 1200;
const FRAME_MS = 3200;

function Cursor({ x, y, clicking }: { x: number; y: number; clicking: boolean }) {
  return (
    <motion.div className="pointer-events-none absolute z-20" initial={false} animate={{ left: `${x}%`, top: `${y}%` }} transition={{ duration: MOVE_MS / 1000, ease: [0.4, 0, 0.2, 1] }}>
      <AnimatePresence>
        {clicking && (
          <motion.span
            key="ripple"
            initial={{ scale: 0.2, opacity: 0.7 }}
            animate={{ scale: 1.8, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute -left-4 -top-4 size-8 rounded-full bg-accent/50"
          />
        )}
      </AnimatePresence>
      <svg width="22" height="22" viewBox="0 0 24 24" className="relative -translate-x-0.5 -translate-y-0.5 drop-shadow-[0_2px_3px_rgb(0_0_0/0.4)]" aria-hidden>
        <path d="M4 2.5 19 12l-6.6 1.4L16 21l-3 1.3-3.6-7.6L4 19.2z" fill="#fff" stroke="#17241c" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

function Window({ url, children, tone = 'light' }: { url: string; children: ReactNode; tone?: 'light' | 'stihnu' }) {
  return (
    <div className={cn('absolute inset-0 flex flex-col overflow-hidden rounded-[14px] ring-1 ring-black/10', tone === 'stihnu' ? 'bg-[#f6f3ec]' : 'bg-white')}>
      <div className="flex h-6 shrink-0 items-center gap-1.5 bg-[#ece8df] px-2">
        <span className="size-1.5 rounded-full bg-[#e2685c]" />
        <span className="size-1.5 rounded-full bg-[#e9b44c]" />
        <span className="size-1.5 rounded-full bg-[#6cbf63]" />
        <span className="ml-1.5 h-3.5 flex-1 truncate rounded bg-white px-1.5 text-[8.5px] leading-[14px] text-[#59625a]">{url}</span>
      </div>
      <div className="relative min-h-0 flex-1 text-[#1f2a22]">{children}</div>
    </div>
  );
}

const Hi = ({ on, children, className }: { on: boolean; children: ReactNode; className?: string }) => (
  <span className={cn('rounded-md transition-all duration-300', on && 'bg-[#ffe9a8] ring-2 ring-[#e0a72e]', className)}>{children}</span>
);

/* ------------------------------------------------------------------ */
/* SIS                                                                 */
/* ------------------------------------------------------------------ */

const SIS_FRAMES: Frame[] = [
  {
    caption: (
      <>
        V SISu otevřete <strong>Rozvrh NG</strong>
      </>
    ),
    x: 33,
    y: 50,
    screen: (c) => (
      <Window url="is.cuni.cz/studium">
        <div className="h-5 bg-[#18447e] px-2 text-[8.5px] font-bold leading-5 text-white">Studijní informační systém</div>
        <div className="grid grid-cols-3 gap-1.5 p-2.5 text-[8.5px] font-semibold">
          {['Předměty', 'Zápis', 'Rozvrh NG', 'Výsledky zkoušek', 'Termíny zkoušek', 'Osobní údaje'].map((t) => (
            <Hi key={t} on={t === 'Rozvrh NG' && c} className="block rounded-md bg-[#eef2f8] px-1.5 py-2.5 text-center">
              {t}
            </Hi>
          ))}
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Nahoře klikněte na <strong>Export</strong> → <strong>iCalendar</strong>
      </>
    ),
    x: 80,
    y: 48,
    screen: (c) => (
      <Window url="is.cuni.cz/studium/rozvrhng">
        <div className="flex items-center gap-1.5 border-b border-black/10 px-2 py-1.5 text-[8.5px] font-semibold">
          <span className="rounded bg-[#eef2f8] px-1.5 py-0.5">Týden</span>
          <span className="rounded bg-[#eef2f8] px-1.5 py-0.5">Semestr</span>
          <span className="ml-auto rounded bg-[#eef2f8] px-1.5 py-0.5">Tisk</span>
          <span className="relative">
            <Hi on={!c} className="block rounded bg-[#18447e] px-1.5 py-0.5 text-white">
              Export ▾
            </Hi>
            {c && (
              <span className="absolute right-0 top-5 z-10 w-24 rounded-md bg-white p-1 text-[8.5px] shadow-lg ring-1 ring-black/10">
                <span className="block rounded px-1.5 py-1 text-[#59625a]">PDF</span>
                <Hi on className="block px-1.5 py-1">
                  iCalendar
                </Hi>
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1 p-2">
          {Array.from({ length: 15 }, (_, i) => (
            <span key={i} className={cn('h-5 rounded', [1, 4, 7, 8, 12].includes(i) ? 'bg-[#d8e4f3]' : 'bg-[#f3f4f6]')} />
          ))}
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Stáhne se soubor <strong>rozvrh.ics</strong>
      </>
    ),
    x: 74,
    y: 82,
    screen: () => (
      <Window url="is.cuni.cz/studium/rozvrhng">
        <div className="grid grid-cols-5 gap-1 p-2 opacity-60">
          {Array.from({ length: 15 }, (_, i) => (
            <span key={i} className={cn('h-5 rounded', [1, 4, 7, 8, 12].includes(i) ? 'bg-[#d8e4f3]' : 'bg-[#f3f4f6]')} />
          ))}
        </div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-[#1f2a22] px-2 py-1.5 text-[9px] font-semibold text-white shadow-lg">
          <Download className="size-3" aria-hidden /> rozvrh.ics <Check className="size-3 text-[#8fd18a]" aria-hidden />
        </motion.div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Ve Stihnu klikněte na <strong>Nahrát soubor</strong> a vyberte ho
      </>
    ),
    x: 50,
    y: 60,
    screen: (c) => (
      <Window url="prazskystudent.vercel.app" tone="stihnu">
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-3">
          <span className="font-display text-[15px]">Rozvrh ze SISu</span>
          <Hi on={c} className="flex items-center gap-1.5 rounded-full bg-[#2b5a40] px-3 py-1.5 text-[9.5px] font-bold text-white">
            <Upload className="size-3" aria-hidden /> Nahrát soubor rozvrh.ics
          </Hi>
          {c && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] font-semibold text-[#2b5a40]">
              ✓ Hotovo: 24 hodin, 6 předmětů
            </motion.span>
          )}
        </div>
      </Window>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Moodle                                                              */
/* ------------------------------------------------------------------ */

const MOODLE_FRAMES: Frame[] = [
  {
    caption: (
      <>
        Otevřete <strong>Export kalendáře</strong> (odkaz výše)
      </>
    ),
    x: 30,
    y: 30,
    screen: () => (
      <Window url="dl1.cuni.cz/calendar/export.php">
        <div className="h-5 bg-[#f98012] px-2 text-[8.5px] font-bold leading-5 text-white">Moodle UK</div>
        <div className="p-2.5 text-[9px]">
          <p className="font-bold">Exportovat kalendář</p>
          <div className="mt-1.5 space-y-1 text-[#59625a]">
            <span className="block h-2 w-3/4 rounded bg-[#f1f1f1]" />
            <span className="block h-2 w-2/3 rounded bg-[#f1f1f1]" />
          </div>
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Vyberte <strong>Všechny události</strong> a <strong>Nedávné a příštích 60 dní</strong>
      </>
    ),
    x: 22,
    y: 66,
    screen: (c) => (
      <Window url="dl1.cuni.cz/calendar/export.php">
        <div className="h-5 bg-[#f98012] px-2 text-[8.5px] font-bold leading-5 text-white">Moodle UK</div>
        <div className="grid grid-cols-2 gap-2 p-2.5 text-[8.5px]">
          <div>
            <p className="font-bold">Události</p>
            <Hi on className="mt-1 flex items-center gap-1 px-1 py-0.5">
              <span className="grid size-2.5 place-items-center rounded-full border border-[#2b5a40]">
                <span className="size-1.5 rounded-full bg-[#2b5a40]" />
              </span>
              Všechny události
            </Hi>
            <span className="mt-0.5 flex items-center gap-1 px-1 text-[#8b9088]">
              <span className="size-2.5 rounded-full border border-[#8b9088]" /> Události kurzu
            </span>
          </div>
          <div>
            <p className="font-bold">Časové období</p>
            <Hi on={c} className="mt-1 flex items-center gap-1 px-1 py-0.5">
              <span className="grid size-2.5 place-items-center rounded-full border border-[#2b5a40]">{c && <span className="size-1.5 rounded-full bg-[#2b5a40]" />}</span>
              Nedávné a příštích 60 dní
            </Hi>
          </div>
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Klikněte <strong>Získat URL kalendáře</strong> a odkaz zkopírujte
      </>
    ),
    x: 30,
    y: 62,
    screen: (c) => (
      <Window url="dl1.cuni.cz/calendar/export.php">
        <div className="h-5 bg-[#f98012] px-2 text-[8.5px] font-bold leading-5 text-white">Moodle UK</div>
        <div className="space-y-1.5 p-2.5 text-[8.5px]">
          <div className="flex gap-1.5">
            <span className="rounded bg-[#f1f1f1] px-1.5 py-1">Exportovat</span>
            <Hi on={!c} className="rounded bg-[#0f6cbf] px-1.5 py-1 font-bold text-white">
              Získat URL kalendáře
            </Hi>
          </div>
          {c && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate rounded border border-black/15 px-1 py-0.5 font-mono text-[7.5px]">https://dl1.cuni.cz/calendar/export_execute.php?userid=…&authtoken=…</span>
              <Hi on className="shrink-0 rounded bg-[#0f6cbf] px-1.5 py-0.5 font-bold text-white">
                Kopírovat
              </Hi>
            </motion.div>
          )}
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Ve Stihnu ho vložte do pole a dejte <strong>Uložit</strong>
      </>
    ),
    x: 82,
    y: 52,
    screen: (c) => (
      <Window url="prazskystudent.vercel.app" tone="stihnu">
        <div className="flex h-full flex-col justify-center gap-1.5 p-3">
          <span className="font-display text-[15px]">Termíny z Moodlu</span>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 font-mono text-[7.5px] ring-1 ring-black/10">https://dl1.cuni.cz/calendar/export_execute.php?…</span>
            <Hi on={c} className="shrink-0 rounded-full bg-[#2b5a40] px-2.5 py-1 text-[9px] font-bold text-white">
              Uložit
            </Hi>
          </div>
          {c && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] font-semibold text-[#2b5a40]">
              ✓ Načteno 12 termínů
            </motion.span>
          )}
        </div>
      </Window>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Google                                                              */
/* ------------------------------------------------------------------ */

const GOOGLE_FRAMES: Frame[] = [
  {
    caption: (
      <>
        Klikněte na <strong>Propojit s Googlem</strong>
      </>
    ),
    x: 50,
    y: 58,
    screen: (c) => (
      <Window url="prazskystudent.vercel.app" tone="stihnu">
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <span className="font-display text-[15px]">Google Kalendář a Úkoly</span>
          <Hi on={c} className="flex items-center gap-1.5 rounded-full bg-[#2b5a40] px-3 py-1.5 text-[9.5px] font-bold text-white">
            <CalendarDays className="size-3" aria-hidden /> Propojit s Googlem
          </Hi>
        </div>
      </Window>
    ),
  },
  {
    caption: <>Vyberte svůj účet Google</>,
    x: 48,
    y: 52,
    screen: (c) => (
      <Window url="accounts.google.com">
        <div className="mx-auto mt-3 w-4/5 rounded-xl p-2 text-[9px] ring-1 ring-black/10">
          <p className="text-center text-[10px] font-bold">Vyberte účet</p>
          {['student@gmail.com', 'Použít jiný účet'].map((t, i) => (
            <Hi key={t} on={i === 0 && c} className="mt-1 flex items-center gap-1.5 px-1.5 py-1">
              <span className={cn('grid size-4 place-items-center rounded-full text-[7px] font-bold text-white', i === 0 ? 'bg-[#7a8a52]' : 'bg-[#c4c7c5]')}>{i === 0 ? 'S' : '+'}</span>
              {t}
            </Hi>
          ))}
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Když uvidíte varování, klikněte <strong>Pokročilé</strong> → <strong>Přejít do aplikace</strong>
      </>
    ),
    x: 30,
    y: 74,
    screen: (c) => (
      <Window url="accounts.google.com">
        <div className="p-2.5 text-[9px]">
          <p className="flex items-center gap-1 text-[10px] font-bold text-[#b3261e]">
            <ShieldAlert className="size-3.5" aria-hidden /> Google tuto aplikaci neověřil
          </p>
          <span className="mt-1.5 block h-2 w-4/5 rounded bg-[#f1f1f1]" />
          <span className="mt-1 block h-2 w-2/3 rounded bg-[#f1f1f1]" />
          <div className="mt-2 flex flex-col items-start gap-1">
            <Hi on={!c} className="px-1 text-[#0b57d0]">
              Pokročilé
            </Hi>
            {c && (
              <Hi on className="px-1 text-[#0b57d0] underline">
                Přejít do aplikace Stihnu (nebezpečné)
              </Hi>
            )}
          </div>
        </div>
      </Window>
    ),
  },
  {
    caption: (
      <>
        Povolte kalendář a úkoly a dejte <strong>Pokračovat</strong>
      </>
    ),
    x: 76,
    y: 84,
    screen: (c) => (
      <Window url="accounts.google.com">
        <div className="space-y-1 p-2.5 text-[9px]">
          <p className="text-[10px] font-bold">Stihnu chce přístup k vašemu účtu Google</p>
          {['Kalendáře', 'Úkoly'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="grid size-3 place-items-center rounded-sm bg-[#0b57d0] text-white">
                <Check className="size-2.5" aria-hidden />
              </span>
              {t}
            </span>
          ))}
          <div className="flex justify-end gap-1.5 pt-1">
            <span className="rounded-full px-2 py-0.5 text-[#0b57d0]">Zrušit</span>
            <Hi on={c} className="rounded-full bg-[#0b57d0] px-2 py-0.5 font-bold text-white">
              Pokračovat
            </Hi>
          </div>
        </div>
      </Window>
    ),
  },
];

export const GUIDES = { sis: SIS_FRAMES, moodle: MOODLE_FRAMES, google: GOOGLE_FRAMES } as const;

export function GuideAnimation({ guide, className }: { guide: keyof typeof GUIDES; className?: string }) {
  const frames = GUIDES[guide];
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<'move' | 'click' | 'after'>('move');
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setStage('move');
    const t1 = setTimeout(() => setStage('click'), CLICK_MS - 250);
    const t2 = setTimeout(() => setStage('after'), CLICK_MS + 200);
    const t3 = playing ? setTimeout(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS) : undefined;
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [index, playing, frames.length]);

  const frame = frames[index];

  return (
    <figure className={cn('overflow-hidden rounded-[22px] bg-surface-2/80 p-3 ring-1 ring-inset ring-line', className)}>
      <div className="relative aspect-[16/9] w-full">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div key={index} className="absolute inset-0" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {frame.screen(stage === 'after')}
          </motion.div>
        </AnimatePresence>
        <Cursor x={frame.x} y={frame.y} clicking={stage === 'click'} key={`c-${guide}`} />
        <span className="absolute right-1.5 top-7 z-10 rounded-full bg-black/45 px-1.5 py-0.5 text-[8.5px] font-semibold text-white">ilustrace</span>
      </div>
      <figcaption className="mt-2.5 flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-fg">{index + 1}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={index} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="min-w-0 flex-1 text-[13.5px] leading-snug">
            {frame.caption}
          </motion.span>
        </AnimatePresence>
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => setIndex((i) => (i - 1 + frames.length) % frames.length)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg" aria-label="Předchozí krok">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setPlaying((p) => !p)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg" aria-label={playing ? 'Zastavit animaci' : 'Spustit animaci'}>
            {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          </button>
          <button type="button" onClick={() => setIndex((i) => (i + 1) % frames.length)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg" aria-label="Další krok">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
