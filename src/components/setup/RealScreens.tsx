/**
 * Snímky obrazovky k návodům (u Moodlu skutečné, u Googlu věrné ilustrace –
 * vždy s popiskem zdroje): očíslované kroky jsou vyznačené přímo na snímku.
 * Na telefonu se dají posouvat do strany a klepnutím zvětšit na celou obrazovku.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../ui/primitives';

export interface RealShot {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: ReactNode;
}

export const MOODLE_SHOTS: RealShot[] = [
  {
    src: '/guides/moodle-calendar.webp',
    width: 1100,
    height: 708,
    alt: 'Moodle – stránka Kalendář, pod kalendářem zvýrazněný odkaz Import nebo export kalendářů',
    caption: (
      <>
        V Moodlu otevřete <strong>Kalendář</strong> a pod ním klikněte na <strong>Import nebo export kalendářů</strong>, pak na <strong>Exportovat kalendář</strong>.
      </>
    ),
  },
  {
    src: '/guides/moodle-export-form.webp',
    width: 1100,
    height: 882,
    alt: 'Moodle – formulář Exportovat kalendář se zvolenými možnostmi Všechny události a Předchozích a následujících 60 dnů',
    caption: (
      <>
        Zvolte <strong>Všechny události</strong> (1) a <strong>Předchozích a následujících 60 dnů</strong> (2), pak klikněte na <strong>Získat URL kalendáře</strong> (3).
      </>
    ),
  },
  {
    src: '/guides/moodle-export-url.webp',
    width: 1100,
    height: 317,
    alt: 'Moodle – pod formulářem se objeví URL kalendáře a tlačítko Zkopírovat adresu URL',
    caption: (
      <>
        Pod formulářem se objeví adresa. Klikněte na <strong>Zkopírovat adresu URL</strong> (4) a vložte ji do Stihnuta.
      </>
    ),
  },
];

export function RealScreens({ shots, source, className }: { shots: RealShot[]; source: ReactNode; className?: string }) {
  const [zoom, setZoom] = useState<RealShot | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom]);
  return (
    <div className={className}>
      <div className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1">
        {shots.map((s, i) => (
          <figure key={s.src} className={cn('min-w-0 shrink-0 snap-start', shots.length > 1 ? 'w-[86%] sm:w-[78%]' : 'w-full')}>
            <button type="button" onClick={() => setZoom(s)} className="block w-full overflow-hidden rounded-[16px] bg-white ring-1 ring-line transition hover:ring-accent" aria-label={`Zvětšit snímek: ${s.alt}`}>
              <img src={s.src} width={s.width} height={s.height} alt={s.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
            </button>
            <figcaption className="mt-2 flex gap-2 text-[13.5px] leading-snug text-muted">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#e8590c] text-[12px] font-black text-white">{i + 1}</span>
              <span>{s.caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-subtle">{source}</p>
      {zoom &&
        createPortal(
          <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Zvětšený snímek" onClick={() => setZoom(null)}>
            <img src={zoom.src} alt={zoom.alt} className="max-h-[88dvh] max-w-full rounded-[12px] bg-white object-contain shadow-2xl" />
            <button type="button" onClick={() => setZoom(null)} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 px-4 py-2 text-[14px] font-bold text-white ring-1 ring-white/30">
              Zavřít
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** SIS: kde je export rozvrhu a kam ho nahrát (ilustrace SISu, skutečná obrazovka Stihnuta). */
export const SIS_SHOTS: RealShot[] = [
  {
    src: '/guides/sis-1.webp',
    width: 1520,
    height: 678,
    alt: 'Ilustrace SISu – moduly, zvýrazněný Rozvrh NG',
    caption: (
      <>
        Přihlaste se do <strong>SISu</strong> a otevřete <strong>Rozvrh NG</strong> (1).
      </>
    ),
  },
  {
    src: '/guides/sis-2.webp',
    width: 1520,
    height: 714,
    alt: 'Ilustrace Rozvrhu NG – tlačítko Export a volba iCalendar (.ics)',
    caption: (
      <>
        Klikněte na <strong>Export</strong> (2) a zvolte <strong>iCalendar (.ics)</strong> (3). Stáhne se soubor s rozvrhem.
      </>
    ),
  },
  {
    src: '/guides/sis-3.webp',
    width: 1440,
    height: 550,
    alt: 'Stihnuto – tlačítko Nahrát rozvrh (.ics)',
    caption: (
      <>
        Ve Stihnutu klikněte na <strong>Nahrát rozvrh (.ics)</strong> (4) a vyberte stažený soubor. Předměty, místnosti i sylaby se doplní samy.
      </>
    ),
  },
];
