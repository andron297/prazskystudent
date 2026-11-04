/**
 * Průvodce propojením – krok za krokem, velkým písmem, obyčejnou češtinou.
 * Každou službu jde přeskočit a kdykoli doplnit v Propojení.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  Check,
  ClipboardPaste,
  CloudSun,
  ExternalLink,
  FileUp,
  FlaskConical,
  GraduationCap,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Music2,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  TramFront,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { IcsSource } from '../../types';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { uid } from '../../lib/id';
import { isMoodleCalendarUrl } from '../../lib/moodleIcs';
import { MUSIC_PICKS, isSpotifyUrl } from '../../lib/music';
import { AI_KEY_PAGES, AI_NAMES, providerForKey } from '../../lib/aiProvider';
import { useConnections, type ServiceId, type ServiceStatus } from '../../hooks/useConnections';
import { importSisIcsFile } from '../../services/icsFileImport';
import { connectGoogle, refreshIcsSource } from '../../services/syncCenter';
import { useAppStore } from '../../store/appStore';
import { toast, useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';

type StepId = 'start' | 'auto' | 'location' | 'sis' | 'moodle' | 'google' | 'extras' | 'ai' | 'done';
const STEPS: StepId[] = ['start', 'auto', 'location', 'sis', 'moodle', 'google', 'extras', 'ai', 'done'];
const SKIP_ID: Partial<Record<StepId, ServiceId[]>> = { location: ['location'], sis: ['sis'], moodle: ['moodle'], google: ['google'], extras: ['music', 'notifications'], ai: ['ai'] };

export function SetupWizard() {
  const open = useUiStore((s) => s.setupOpen);
  const initial = useUiStore((s) => s.setupStep);
  const close = useUiStore((s) => s.closeSetup);
  const [step, setStep] = useState<StepId>('start');
  const [dir, setDir] = useState(1);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep((STEPS as string[]).includes(initial ?? '') ? (initial as StepId) : 'start');
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [step]);

  // Průvodce se sám otevře jen poprvé; potom je kdykoli v Propojení (a v pruhu ukázky).
  const finish = (_completed: boolean) => {
    useAppStore.getState().setSetup({ done: true });
    close();
  };
  const go = (to: StepId) => {
    setDir(STEPS.indexOf(to) >= STEPS.indexOf(step) ? 1 : -1);
    setStep(to);
  };
  const next = () => go(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)]);
  const back = () => go(STEPS[Math.max(0, STEPS.indexOf(step) - 1)]);
  const skip = () => {
    const ids = SKIP_ID[step] ?? [];
    if (ids.length) {
      const st = useAppStore.getState();
      st.setSetup({ skipped: [...new Set([...(st.meta.setupSkipped ?? []), ...ids])] });
    }
    next();
  };
  const unskip = (ids: ServiceId[]) => {
    const st = useAppStore.getState();
    st.setSetup({ skipped: (st.meta.setupSkipped ?? []).filter((x) => !ids.includes(x as ServiceId)) });
  };

  if (!open) return null;
  const index = STEPS.indexOf(step);
  const showNav = step !== 'start' && step !== 'done';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Průvodce propojením">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-canvas sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-[32px] sm:shadow-2xl">
        {/* Hlavička s průběhem */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold">Nastavení krok za krokem</p>
            <div className="mt-1.5 flex gap-1" aria-label={`Krok ${index + 1} z ${STEPS.length}`}>
              {STEPS.map((s, i) => (
                <span key={s} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= index ? 'bg-accent' : 'bg-line')} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => finish(false)} className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Zavřít průvodce (dokončíš později)">
            <X className="size-5" />
          </button>
        </div>

        <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir }} transition={{ duration: 0.2 }}>
              {step === 'start' && <StartStep onOwn={next} onDemo={() => finish(false)} />}
              {step === 'auto' && <AutoStep />}
              {step === 'location' && <LocationStep onDone={() => unskip(['location'])} />}
              {step === 'sis' && <SisStep onDone={() => unskip(['sis'])} />}
              {step === 'moodle' && <MoodleStep onDone={() => unskip(['moodle'])} />}
              {step === 'google' && <GoogleStep onDone={() => unskip(['google'])} />}
              {step === 'extras' && <ExtrasStep onDone={(ids) => unskip(ids)} />}
              {step === 'ai' && <AiStep onDone={() => unskip(['ai'])} />}
              {step === 'done' && <DoneStep onClose={() => finish(true)} onGo={(s) => go(s)} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {showNav && (
          <div className="flex items-center gap-2 border-t border-line bg-surface/80 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={back} className="inline-flex h-12 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
              <ArrowLeft className="size-4" aria-hidden /> Zpět
            </button>
            <div className="ml-auto flex items-center gap-2">
              {SKIP_ID[step] && (
                <button type="button" onClick={skip} className="inline-flex h-12 items-center rounded-full px-4 text-[15px] font-semibold text-muted hover:bg-surface-2 hover:text-fg">
                  Přeskočit
                </button>
              )}
              <button type="button" onClick={next} className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-bold text-accent-fg shadow-[0_10px_24px_-12px_var(--accent)] hover:brightness-110">
                Pokračovat <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Stavební kameny                                                     */
/* ------------------------------------------------------------------ */

function StepHead({ icon: Icon, tone = 'accent', kicker, title, children }: { icon: LucideIcon; tone?: 'accent' | 'sand' | 'sky'; kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <span className={cn('inline-flex size-14 items-center justify-center rounded-[20px]', tone === 'accent' ? 'bg-accent-soft text-accent' : tone === 'sand' ? 'bg-sand/25 text-clay' : 'bg-sky-500/12 text-sky-700 dark:text-sky-300')}>
        <Icon className="size-7" aria-hidden />
      </span>
      {kicker && <p className="eyebrow mt-4 text-subtle">{kicker}</p>}
      <h2 className="mt-1.5 font-display text-[32px] leading-[1.05] sm:text-[38px]">{title}</h2>
      {children && <p className="mt-2.5 text-[16px] leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

function NumberedSteps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 rounded-[20px] bg-surface-2/80 p-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent font-display text-[18px] text-accent-fg">{i + 1}</span>
          <span className="pt-1 text-[15.5px] leading-snug">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Success({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-[20px] bg-accent-soft p-4 text-accent ring-1 ring-inset ring-accent/25" role="status">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
        <Check className="size-4.5" aria-hidden />
      </span>
      <span className="pt-1 text-[15px] font-semibold leading-snug">{children}</span>
    </div>
  );
}

function BigButton({ icon: Icon, children, onClick, busy, variant = 'primary', autoFocus }: { icon: LucideIcon; children: ReactNode; onClick: () => void; busy?: boolean; variant?: 'primary' | 'secondary'; autoFocus?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      data-autofocus={autoFocus || undefined}
      className={cn(
        'inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[20px] px-5 text-[16px] font-bold transition disabled:opacity-70 sm:w-auto',
        variant === 'primary' ? 'bg-accent text-accent-fg shadow-[0_12px_28px_-14px_var(--accent)] hover:brightness-110' : 'bg-surface ring-1 ring-inset ring-line-strong hover:bg-surface-2',
      )}
    >
      {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
      {children}
    </button>
  );
}

function ExternalStep({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-accent underline-offset-2 hover:underline">
      {children} <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Kroky                                                               */
/* ------------------------------------------------------------------ */

function StartStep({ onOwn, onDemo }: { onOwn: () => void; onDemo: () => void }) {
  const mode = useAppStore((s) => s.settings.mode);
  const own = () => {
    if (useAppStore.getState().settings.mode === 'demo') {
      const removed = useAppStore.getState().startOwnData();
      if (removed > 0) toast.success('Ukázková data jsem uklidil – teď tu bude jen to tvoje.');
    }
    onOwn();
  };
  const demo = () => {
    useAppStore.getState().startDemo();
    onDemo();
  };
  return (
    <div>
      <StepHead icon={Sparkles} kicker="Vítej" title={<>Nastavíme to <em className="text-moss">spolu</em></>}>
        Pár jednoduchých kroků a Stihnu bude znát tvůj rozvrh, úkoly i cestu do školy. Každý krok jde přeskočit a doplnit později.
      </StepHead>
      <div className="grid gap-3">
        <button type="button" onClick={own} data-autofocus className="group flex items-start gap-4 rounded-[24px] bg-accent p-5 text-left text-accent-fg shadow-[0_16px_36px_-18px_var(--accent)] transition hover:brightness-110">
          <ShieldCheck className="mt-0.5 size-7 shrink-0" aria-hidden />
          <span>
            <span className="block text-[19px] font-bold">Nastavit moje studium</span>
            <span className="mt-1 block text-[14.5px] opacity-90">{mode === 'demo' ? 'Ukázková data se smažou a začneme s tvými.' : 'Pokračovat v nastavení tvých dat.'}</span>
          </span>
          <ArrowRight className="ml-auto mt-1 size-6 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
        </button>
        <button type="button" onClick={demo} className="flex items-start gap-4 rounded-[24px] bg-surface p-5 text-left ring-1 ring-inset ring-line-strong transition hover:bg-surface-2">
          <FlaskConical className="mt-0.5 size-7 shrink-0 text-clay" aria-hidden />
          <span>
            <span className="block text-[19px] font-bold">Jen se podívat na ukázku</span>
            <span className="mt-1 block text-[14.5px] text-muted">Vymyšlené předměty a rozvrh, ať vidíš, co aplikace umí. Poznáš ji podle pruhovaného pásu nahoře.</span>
          </span>
        </button>
      </div>
      <p className="mt-5 flex items-start gap-2 text-[13.5px] text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        Tvoje data zůstávají v tomhle prohlížeči. Nikam je neprodáváme a nic se nesdílí bez tvého kliknutí.
      </p>
    </div>
  );
}

function AutoStep() {
  const items: { icon: LucideIcon; title: string; text: string }[] = [
    { icon: CloudSun, title: 'Počasí', text: 'Předpověď na celý den a rada, co si vzít na sebe.' },
    { icon: TramFront, title: 'Doprava PID', text: 'Kudy jet, kde přestoupit, kdy vyrazit – i se živým zpožděním.' },
    { icon: MapPin, title: 'Mapa zastávek', text: 'Všechny zastávky a nástupiště v Praze s odjezdy.' },
  ];
  return (
    <div>
      <StepHead icon={Check} kicker="Hotovo bez tebe" title={<>Tohle už <em className="text-moss">funguje samo</em></>}>
        Nemusíš nic zadávat ani se nikam přihlašovat.
      </StepHead>
      <ul className="grid gap-3">
        {items.map((it) => (
          <li key={it.title} className="flex items-center gap-4 rounded-[22px] bg-surface p-4 ring-1 ring-inset ring-line">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <it.icon className="size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-bold">{it.title}</span>
              <span className="block text-[14.5px] text-muted">{it.text}</span>
            </span>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg" aria-label="Funguje">
              <Check className="size-4.5" aria-hidden />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocationStep({ onDone }: { onDone: () => void }) {
  const mode = useAppStore((s) => s.settings.mode);
  const origin = useAppStore((s) => s.settings.origin[s.settings.mode]);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const [busy, setBusy] = useState(false);
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const useGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsOk(false);
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setBusy(false);
        setGpsOk(true);
        setOrigin(mode, { ...origin, source: 'gps' });
        onDone();
      },
      () => {
        setBusy(false);
        setGpsOk(false);
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 300_000 },
    );
  };
  return (
    <div>
      <StepHead icon={LocateFixed} kicker="Cesta do školy" title={<>Odkud obvykle <em className="text-moss">vyrážíš?</em></>}>
        Podle toho spočítám, kdy vyrazit a na jakou zastávku jít.
      </StepHead>
      <BigButton icon={LocateFixed} onClick={useGps} busy={busy} autoFocus>
        Použít polohu telefonu
      </BigButton>
      {gpsOk === true && <Success>Poloha funguje – cesta se bude počítat odtud, kde zrovna jsi.</Success>}
      {gpsOk === false && (
        <p className="mt-3 rounded-[18px] bg-clay/12 p-3.5 text-[14.5px] font-semibold text-clay">
          Polohu se nepodařilo zjistit (možná je zakázaná). Nevadí – vyber místo níže.
        </p>
      )}
      <p className="mb-2.5 mt-6 text-[15px] font-bold">Nebo vyber místo</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {LOCATION_PRESETS.map((p) => {
          const active = origin.source === 'preset' && origin.presetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setOrigin(mode, { source: 'preset', presetId: p.id });
                onDone();
              }}
              aria-pressed={active}
              className={cn('flex min-h-12 items-center gap-2.5 rounded-[18px] px-4 text-left text-[15px] font-semibold ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface ring-line hover:bg-surface-2')}
            >
              <MapPin className="size-4.5 shrink-0" aria-hidden /> {p.label}
              {active && <Check className="ml-auto size-4.5" aria-hidden />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[13.5px] text-muted">Přesnou zastávku si později můžeš vybrat i na mapě v Dopravě.</p>
    </div>
  );
}

function SisStep({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ events: number; subjects: number } | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const r = await importSisIcsFile(file);
      setResult({ events: r.events, subjects: r.newSubjects });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Soubor se nepodařilo načíst.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <StepHead icon={GraduationCap} kicker="Univerzita" title={<>Rozvrh ze <em className="text-moss">SISu</em></>}>
        Jeden soubor a máš tu všechny předměty, místnosti i sylaby. Zabere to asi minutu.
      </StepHead>
      <NumberedSteps
        items={[
          <>
            Otevři <ExternalStep href="https://is.cuni.cz/studium/rozvrhng/">Rozvrh NG v SISu</ExternalStep> a přihlas se.
          </>,
          <>
            Nahoře klikni na <strong>Export</strong> → <strong>iCalendar</strong>. Stáhne se soubor <em>rozvrh.ics</em>.
          </>,
          <>Nahraj ho sem tlačítkem níže – najdeš ho ve Stažených souborech.</>,
        ]}
      />
      <div
        className="mt-4 rounded-[24px] border-2 border-dashed border-line-strong p-4 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
      >
        <BigButton icon={FileUp} onClick={() => fileRef.current?.click()} busy={busy} autoFocus>
          Nahrát soubor rozvrh.ics
        </BigButton>
        <p className="mt-2 text-[13px] text-muted">nebo ho sem přetáhni myší</p>
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
      {result && (
        <Success>
          Hotovo: {result.events} hodin v rozvrhu{result.subjects ? ` a ${result.subjects} ${result.subjects === 1 ? 'předmět' : result.subjects < 5 ? 'předměty' : 'předmětů'}` : ''}. Sylaby a povinnosti se stahují na pozadí.
        </Success>
      )}
    </div>
  );
}

function MoodleStep({ onDone }: { onDone: () => void }) {
  const existing = useAppStore((s) => s.settings.icsSources.find((x) => x.kind === 'moodle'));
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(existing ? 'Kalendář Moodlu už je propojený.' : null);
  const base = 'https://dl1.cuni.cz';
  const save = async (value: string) => {
    const trimmed = value.trim();
    if (!isMoodleCalendarUrl(trimmed)) {
      toast.error('Tohle nevypadá jako odkaz z „Exportovat kalendář“. Má obsahovat export_execute.php a authtoken.');
      return;
    }
    setBusy(true);
    const source: IcsSource = { id: existing?.id ?? uid('ics'), kind: 'moodle', url: trimmed, label: 'Kalendář Moodlu', autoRefresh: true };
    useAppStore.getState().upsertIcsSource(source);
    const r = await refreshIcsSource(source, { manual: true });
    setBusy(false);
    if (r.ok) {
      setDone(r.message);
      setUrl('');
      onDone();
    }
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      if (isMoodleCalendarUrl(text.trim())) void save(text);
    } catch {
      toast.info('Vlož odkaz do pole ručně (podrž prst / Ctrl+V).');
    }
  };
  return (
    <div>
      <StepHead icon={BookOpenCheck} kicker="Úkoly a termíny" title={<>Termíny z <em className="text-moss">Moodlu</em></>}>
        Odevzdávárny a testy se ti samy objeví v kalendáři. Bez hesla – jen jeden odkaz.
      </StepHead>
      <NumberedSteps
        items={[
          <>
            Otevři <ExternalStep href={`${base}/calendar/export.php`}>export kalendáře v Moodlu</ExternalStep>.
          </>,
          <>
            Vyber <strong>Všechny události</strong> a <strong>Nedávné a příštích 60 dní</strong>.
          </>,
          <>
            Klikni <strong>Získat URL kalendáře</strong> a odkaz zkopíruj.
          </>,
        ]}
      />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Sem vlož zkopírovaný odkaz"
          inputMode="url"
          className="h-14 flex-1 rounded-[18px] bg-surface px-4 text-[15px] ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent"
          aria-label="Odkaz na kalendář Moodlu"
        />
        <BigButton icon={ClipboardPaste} variant="secondary" onClick={() => void paste()}>
          Vložit
        </BigButton>
        <BigButton icon={Check} onClick={() => void save(url)} busy={busy}>
          Uložit
        </BigButton>
      </div>
      {done && <Success>{done}</Success>}
      <details className="mt-5 rounded-[20px] bg-surface-2/70 p-4 text-[14.5px]">
        <summary className="cursor-pointer font-bold">Chci i odevzdání a známky automaticky (klíč)</summary>
        <div className="mt-3 space-y-2 text-muted">
          <p>
            V Moodlu otevři <ExternalStep href={`${base}/user/managetoken.php`}>Bezpečnostní klíče</ExternalStep>, u „Moodle mobile web service“ klikni na <strong>Reset</strong> a potvrď. Moodle klíč
            ukáže <strong>jen jednou</strong> – zkopíruj ho a vlož v Propojení → Moodle. Aplikace Moodle v mobilu tě pak jen znovu přihlásí.
          </p>
        </div>
      </details>
    </div>
  );
}

function GoogleStep({ onDone }: { onDone: () => void }) {
  const { services } = useConnections();
  const status = services.find((s) => s.id === 'google') as ServiceStatus;
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    const ok = await connectGoogle({ reconnect: status.state === 'attention' });
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div>
      <StepHead icon={CalendarDays} tone="sky" kicker="Nepovinné" title={<>Google Kalendář <em className="text-moss">a Úkoly</em></>}>
        Rozvrh a termíny se objeví i v kalendáři v telefonu a tvoje úkoly v Google Úkolech. Změny se propisují oběma směry.
      </StepHead>
      {status.state === 'unavailable' ? (
        <div className="rounded-[20px] bg-surface-2 p-4 text-[15px]">
          <p className="font-bold">Tohle musí jednou zapnout správce aplikace.</p>
          <p className="mt-1 text-muted">Návod pro správce je v Propojení → Pro správce aplikace. Klidně tento krok přeskoč – vše ostatní funguje i bez Googlu.</p>
        </div>
      ) : status.state === 'connected' ? (
        <Success>Propojeno – {status.detail}</Success>
      ) : (
        <>
          <BigButton icon={CalendarDays} onClick={() => void connect()} busy={busy} autoFocus>
            {status.state === 'attention' ? 'Znovu potvrdit Google' : 'Propojit s Googlem'}
          </BigButton>
          <p className="mt-3 text-[13.5px] text-muted">
            Otevře se okno Googlu. Pokud uvidíš „Google tuto aplikaci neověřil“, klikni na <strong>Pokročilé → Přejít do aplikace</strong> – je to normální u školních projektů.
          </p>
        </>
      )}
      <p className="mt-5 flex items-start gap-2 text-[13.5px] text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        Stihnu vidí jen kalendáře a úkoly, které mu povolíš. Propojení můžeš kdykoli zrušit.
      </p>
    </div>
  );
}

function ExtrasStep({ onDone }: { onDone: (ids: ServiceId[]) => void }) {
  const music = useAppStore((s) => s.settings.music);
  const notify = useAppStore((s) => s.settings.notifyLeave);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [link, setLink] = useState('');
  const notifySupported = typeof window !== 'undefined' && 'Notification' in window;
  const enableNotify = async () => {
    if (!notifySupported) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      updateSettings({ notifyLeave: true });
      onDone(['notifications']);
      toast.success('Upozornění zapnutá – ozvu se 5 minut před odchodem.');
    } else {
      toast.info('Upozornění jsou v prohlížeči zakázaná. Povolit je můžeš v nastavení prohlížeče.');
    }
  };
  return (
    <div>
      <StepHead icon={Music2} tone="sand" kicker="Nepovinné" title={<>Hudba a <em className="text-moss">upozornění</em></>}>
        Vyber si hudbu na učení a na cestu a nech si říct, kdy vyrazit.
      </StepHead>
      <p className="mb-2.5 text-[15px] font-bold">Hudba ze Spotify (bez přihlašování)</p>
      <div className="grid grid-cols-2 gap-2">
        {MUSIC_PICKS.map((p) => {
          const active = music?.url === p.url;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                updateSettings({ music: { url: p.url, title: p.title } });
                onDone(['music']);
              }}
              aria-pressed={active}
              className={cn('rounded-[18px] p-3.5 text-left ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface ring-line hover:bg-surface-2')}
            >
              <span className="block text-[15px] font-bold">{p.title}</span>
              <span className={cn('text-[13px]', active ? 'opacity-90' : 'text-muted')}>{p.mood}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="…nebo vlož odkaz na svůj playlist"
          className="h-12 flex-1 rounded-[16px] bg-surface px-4 text-[14.5px] ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent"
          aria-label="Odkaz na playlist Spotify"
        />
        <button
          type="button"
          onClick={() => {
            if (!isSpotifyUrl(link)) {
              toast.error('Vlož odkaz ze Spotify (Sdílet → Kopírovat odkaz).');
              return;
            }
            updateSettings({ music: { url: link.trim(), title: 'Můj playlist' } });
            setLink('');
            onDone(['music']);
          }}
          className="h-12 rounded-[16px] bg-accent px-4 text-[14.5px] font-bold text-accent-fg"
        >
          Uložit
        </button>
      </div>
      <div className="mt-6 rounded-[22px] bg-surface p-4 ring-1 ring-inset ring-line">
        <p className="flex items-center gap-2 text-[16px] font-bold">
          <BellRing className="size-5 text-accent" aria-hidden /> Upozornit mě, kdy vyrazit
        </p>
        <p className="mt-1 text-[14px] text-muted">5 minut před odchodem a ve chvíli, kdy je čas vyrazit – s číslem linky a zastávkou. Funguje, když máš Stihnu otevřené (i na pozadí).</p>
        {notify && notifySupported && Notification.permission === 'granted' ? (
          <Success>Zapnuto.</Success>
        ) : (
          <div className="mt-3">
            <BigButton icon={BellRing} variant="secondary" onClick={() => void enableNotify()}>
              {notifySupported ? 'Zapnout upozornění' : 'Tento prohlížeč upozornění neumí'}
            </BigButton>
          </div>
        )}
      </div>
    </div>
  );
}

function AiStep({ onDone }: { onDone: () => void }) {
  const current = useAppStore((s) => s.settings.anthropicApiKey);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const serverAi = useUiStore((s) => s.server.anthropic);
  const [key, setKey] = useState('');
  const detected = providerForKey(key);
  const saved = providerForKey(current);
  const save = () => {
    if (!detected) {
      toast.error('Tenhle klíč nepoznávám. Claude začíná sk-ant-, ChatGPT sk-, Gemini AIza.');
      return;
    }
    updateSettings({ anthropicApiKey: key.trim() });
    setKey('');
    onDone();
    toast.success(`Uloženo – sylaby teď čte ${AI_NAMES[detected]}.`);
  };
  return (
    <div>
      <StepHead icon={Sparkles} kicker="Nepovinné" title={<>Chytré čtení <em className="text-moss">s AI</em></>}>
        AI přečte sylaby, stránky z Moodlu i PDF harmonogram a vytáhne z nich úkoly, váhy a termíny přesněji. Můžeš použít svoji AI – Claude, ChatGPT nebo Gemini.
      </StepHead>
      {serverAi && !saved && <Success>AI už ti zapnul správce aplikace – nemusíš nic dělat.</Success>}
      {saved && <Success>Používáš {AI_NAMES[saved]} (tvůj klíč).</Success>}
      <NumberedSteps
        items={[
          <>
            Vytvoř si klíč:{' '}
            <ExternalStep href={AI_KEY_PAGES.gemini}>Gemini (má i verzi zdarma)</ExternalStep>, <ExternalStep href={AI_KEY_PAGES.openai}>ChatGPT</ExternalStep> nebo{' '}
            <ExternalStep href={AI_KEY_PAGES.anthropic}>Claude</ExternalStep>.
          </>,
          <>Klíč zkopíruj a vlož sem. Poznám sám, od které AI je.</>,
        ]}
      />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="Vlož klíč (sk-ant-…, sk-… nebo AIza…)"
          className="h-14 flex-1 rounded-[18px] bg-surface px-4 font-mono text-[14px] ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent"
          aria-label="Klíč k AI"
        />
        <BigButton icon={Check} onClick={save}>
          {detected ? `Uložit (${AI_NAMES[detected]})` : 'Uložit'}
        </BigButton>
      </div>
      <p className="mt-4 flex items-start gap-2 text-[13.5px] text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        Klíč zůstává jen v tvém prohlížeči a posílá se jen při čtení textu. AI platíš u svého poskytovatele (Gemini má bezplatnou úroveň).
      </p>
    </div>
  );
}

function DoneStep({ onClose, onGo }: { onClose: () => void; onGo: (s: StepId) => void }) {
  const { services } = useConnections();
  const stepFor: Partial<Record<ServiceId, StepId>> = { location: 'location', sis: 'sis', moodle: 'moodle', google: 'google', music: 'extras', notifications: 'extras', ai: 'ai' };
  return (
    <div>
      <StepHead icon={PartyPopper} kicker="Hotovo" title={<>Máš <em className="text-moss">nastaveno</em></>}>
        Tady je přehled. Cokoli doplníš kdykoli v Propojení.
      </StepHead>
      <ul className="space-y-2">
        {services.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-[18px] bg-surface px-4 py-3 ring-1 ring-inset ring-line">
            <StateDot state={s.state} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold">{s.title}</span>
              <span className="block truncate text-[13px] text-muted">{s.detail}</span>
            </span>
            {stepFor[s.id] && (s.state === 'todo' || s.state === 'skipped' || s.state === 'attention') && (
              <button type="button" onClick={() => onGo(stepFor[s.id]!)} className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold text-accent hover:bg-accent-soft">
                Doplnit
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <BigButton icon={Check} onClick={onClose} autoFocus>
          Hotovo, jdu na to
        </BigButton>
      </div>
    </div>
  );
}

export function StateDot({ state }: { state: ServiceStatus['state'] }) {
  const ok = state === 'auto' || state === 'connected';
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full',
        ok ? 'bg-accent text-accent-fg' : state === 'attention' ? 'bg-amber-500 text-white' : state === 'unavailable' ? 'bg-surface-2 text-subtle' : 'bg-surface-2 text-muted ring-1 ring-inset ring-line-strong',
      )}
      aria-label={ok ? 'Funguje' : state === 'attention' ? 'Potřebuje kliknutí' : state === 'skipped' ? 'Přeskočeno' : state === 'unavailable' ? 'Nedostupné' : 'Nepropojeno'}
    >
      {ok ? <Check className="size-4.5" aria-hidden /> : state === 'attention' ? <span className="text-[15px] font-black">!</span> : <span className="size-2 rounded-full bg-current opacity-50" />}
    </span>
  );
}
