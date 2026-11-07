/**
 * Jasné „je to propojené a data proudí“:
 *  - ConnectionStatusLine: u služby od kdy je propojená a kdy naposledy přišla data,
 *  - FlowBanner: nahoře v Propojení živý pás, kudy data tečou do Stihnuta,
 *  - ConnectionWatcher + CelebrationHost: velké potvrzení hned po propojení.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { formatDayMonthLong, formatRelative } from '../../lib/dates';
import { useConnections, type ServiceId, type ServiceStatus } from '../../hooks/useConnections';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { celebrate, useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';
import { BrandMark } from '../layout/AppShell';

export function LivePulse({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-50" />
      <span className="relative inline-flex size-2 rounded-full bg-accent" />
    </span>
  );
}

/** Tři „balíčky dat“, které jemně putují – data proudí. */
export function FlowDots({ active = true }: { active?: boolean }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn('size-[4px] rounded-full bg-accent', active ? 'flow-dot' : 'opacity-30')} style={active ? { animationDelay: `${i * 0.18}s` } : undefined} />
      ))}
    </span>
  );
}

const FRESH_MS = 6 * 3_600_000;

export function ConnectionStatusLine({ s }: { s: ServiceStatus }) {
  const now = useNow(30_000);
  if (s.state !== 'connected' && s.state !== 'auto') return null;
  const fresh = s.live || (s.lastFlow ? now.getTime() - new Date(s.lastFlow).getTime() < FRESH_MS : false);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
      <span className="inline-flex items-center gap-1.5 font-bold text-accent">
        <LivePulse />
        {s.live ? 'Živě' : 'Propojeno'}
        {s.since && !s.live ? <span className="font-semibold text-muted">od {formatDayMonthLong(new Date(s.since))}</span> : null}
      </span>
      {s.lastFlow && (
        <span className="inline-flex items-center gap-1.5">
          <FlowDots active={fresh} /> data {formatRelative(new Date(s.lastFlow), appNow())}
        </span>
      )}
      {s.live && (
        <span className="inline-flex items-center gap-1.5">
          <FlowDots /> data proudí
        </span>
      )}
    </div>
  );
}

/** Pás nahoře v Propojení: ikony propojených služeb → animovaná cesta → Stihnuto. */
export function FlowBanner({ visual }: { visual: (id: ServiceId) => ReactNode }) {
  const { services } = useConnections();
  const linked = services.filter((s) => s.state === 'connected' || s.state === 'auto');
  const last = linked.map((s) => s.lastFlow).filter((x): x is string => Boolean(x)).sort().pop();
  if (linked.length === 0) return null;
  return (
    <div className="card relative overflow-hidden rounded-[24px] px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-1.5">
          {linked.slice(0, 7).map((s) => (
            <span key={s.id} title={s.title} className={cn('grid size-9 place-items-center rounded-full ring-2 ring-[var(--surface)]', s.id === 'google' ? 'bg-white' : 'bg-accent-soft text-accent')}>
              {visual(s.id)}
            </span>
          ))}
        </div>
        <svg className="h-3 min-w-0 flex-1" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden>
          <line x1="0" y1="3" x2="100" y2="3" stroke="var(--line-strong)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="3" x2="100" y2="3" stroke="var(--accent)" strokeWidth="2" strokeDasharray="6 10" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="flow-line" />
        </svg>
        <BrandMark className="size-8" />
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5 font-bold text-accent">
          <LivePulse /> Data proudí
        </span>
        <span>
          {linked.length} {linked.length === 1 ? 'zdroj' : linked.length < 5 ? 'zdroje' : 'zdrojů'}
          {last ? ` · naposledy ${formatRelative(new Date(last), appNow())}` : ''}
        </span>
      </p>
    </div>
  );
}

const CELEBRATE: Partial<Record<ServiceId, [string, string]>> = {
  location: ['Výchozí místo je nastavené', 'Trasy a odjezdy počítám odsud.'],
  sis: ['Rozvrh ze SISu je propojený', 'Předměty a výuka jsou v aplikaci. Změny se stáhnou samy.'],
  moodle: ['Moodle je propojený', 'Termíny a úkoly se budou stahovat samy.'],
  google: ['Google je propojený', 'Kalendář a Úkoly se teď synchronizují oběma směry.'],
  music: ['Hudba je připravená', 'Playlist najdete u soustředění a před odchodem.'],
  notifications: ['Upozornění jsou zapnutá', 'Ozvu se, když bude čas vyrazit.'],
  ai: ['Chytré čtení je zapnuté', 'Sylaby, Moodle i PDF teď čte AI.'],
};

/** Hlídá přechody stavů: nově propojené = oslava a zápis „od kdy“. */
export function ConnectionWatcher() {
  const { services } = useConnections();
  const mode = useAppStore((s) => s.settings.mode);
  const prev = useRef<{ mode: string; states: Record<string, string> } | null>(null);
  useEffect(() => {
    const states = Object.fromEntries(services.map((s) => [s.id, s.state]));
    const before = prev.current;
    prev.current = { mode, states };
    if (!before || before.mode !== mode) return;
    const store = useAppStore.getState();
    const changed = services.filter((s) => before.states[s.id] !== s.state);
    // Hromadná změna (import zálohy, synchronizace z jiného zařízení) bez oslav.
    const quiet = changed.length > 2;
    for (const s of changed) {
      if (s.state === 'connected') {
        store.markConnected(s.id, true);
        const text = CELEBRATE[s.id];
        if (text && !quiet && mode === 'live') celebrate(text[0], text[1]);
      } else if (before.states[s.id] === 'connected' && (s.state === 'todo' || s.state === 'skipped')) {
        store.markConnected(s.id, false);
      }
    }
  }, [services, mode]);
  return null;
}

export function CelebrationHost() {
  const celebration = useUiStore((s) => s.celebration);
  useEffect(() => {
    if (!celebration) return;
    const t = setTimeout(() => useUiStore.setState({ celebration: null }), 4800);
    return () => clearTimeout(t);
  }, [celebration]);
  return createPortal(
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={celebration.id}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] mx-auto max-w-md"
          role="status"
          aria-live="polite"
        >
          <button type="button" onClick={() => useUiStore.setState({ celebration: null })} className="glass-strong flex w-full items-center gap-3.5 overflow-hidden rounded-[22px] border border-line p-3.5 text-left shadow-[0_24px_60px_-24px_rgb(0_0_0/0.45)]">
            <span className="relative grid size-12 shrink-0 place-items-center">
              <motion.span className="absolute inset-0 rounded-full bg-accent/25" initial={{ scale: 0.6, opacity: 1 }} animate={{ scale: 1.6, opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
              <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.05 }} className="grid size-12 place-items-center rounded-full bg-accent text-accent-fg">
                <Check className="size-6" strokeWidth={3} aria-hidden />
              </motion.span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold leading-tight">{celebration.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{celebration.detail}</span>
              <span className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-bold text-accent">
                <FlowDots /> data proudí
              </span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
