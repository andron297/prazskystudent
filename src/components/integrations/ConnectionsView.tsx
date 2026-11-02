import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookMarked,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleDot,
  CloudSun,
  Database,
  Download,
  ExternalLink,
  FlaskConical,
  GraduationCap,
  KeyRound,
  Link2,
  LoaderCircle,
  MapPin,
  Monitor,
  Moon,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  ServerCog,
  Sparkles,
  Sun,
  TramFront,
  Trash,
  Upload,
  Zap,
} from 'lucide-react';
import type { IcsSource, WalkSpeed } from '../../types';
import { formatReminder, downloadTextFile } from '../../lib/calendarExport';
import { formatRelative } from '../../lib/dates';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { uid } from '../../lib/id';
import { isMoodleCalendarUrl } from '../../lib/moodleIcs';
import { sisBookmarklet } from '../../lib/sisImport';
import { navigateTo } from '../../hooks/useAppShell';
import { testGolemioKey } from '../../services/api';
import { refreshIcsSource, runMoodleTokenSync, useSyncStore } from '../../services/syncCenter';
import { importAllSyllabi, useSyllabusSync } from '../../services/syllabusSync';
import { pickPersisted, useAppStore } from '../../store/appStore';
import { appNow, useClockStore } from '../../store/clockStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { Button, Card, Chip, cn, Field, SerifTitle, Segmented, Select, TextInput, Toggle } from '../ui/primitives';
import { BuildingsEditor } from './BuildingsEditor';
import { GoogleSection } from './GoogleSection';
import { MoodleConnect } from './MoodleConnect';

/* ------------------------------------------------------------------ */
/* Pomocné prvky                                                       */
/* ------------------------------------------------------------------ */

function Tile({ icon: Icon, label, status, ok, href }: { icon: typeof CalendarDays; label: string; status: string; ok: boolean; href: string }) {
  return (
    <a href={href} className="card group flex min-w-0 flex-col gap-3 rounded-[24px] p-4 transition hover:-translate-y-0.5">
      <span className="flex items-center justify-between">
        <span className={cn('grid size-10 place-items-center rounded-full', ok ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-subtle')}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
        {ok ? <CircleCheck className="size-4 text-accent" aria-label="Propojeno" /> : <CircleDot className="size-4 text-subtle" aria-label="Nepropojeno" />}
      </span>
      <span>
        <span className="block font-display text-[22px] leading-none">{label}</span>
        <span className="mt-1 block truncate text-xs text-muted">{status}</span>
      </span>
    </a>
  );
}

function Collapsible({ title, children, defaultOpen = false, icon: Icon }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; icon?: typeof CalendarDays }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[22px] bg-surface-2/70 ring-1 ring-inset ring-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-bold" aria-expanded={open}>
        {Icon && <Icon className="size-4 text-moss" aria-hidden />}
        <span className="flex-1">{title}</span>
        <ChevronDown className={cn('size-4 text-muted transition', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 rounded-[20px] bg-surface-2 p-3.5 text-[13px] leading-relaxed">
          <span className="font-display text-[26px] leading-none text-moss">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SourceRow({ source }: { source: IcsSource }) {
  const busy = useSyncStore((s) => s.icsBusy[source.id]);
  const upsert = useAppStore((s) => s.upsertIcsSource);
  const remove = useAppStore((s) => s.removeIcsSource);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[18px] bg-surface p-3 ring-1 ring-inset ring-line">
      <span className={cn('grid size-9 place-items-center rounded-full', source.lastError ? 'bg-red-500/10 text-red-600' : 'bg-accent-soft text-accent')}>
        {source.kind === 'moodle' ? <GraduationCap className="size-4" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold">{source.label ?? (source.kind === 'moodle' ? 'Kalendář Moodlu' : 'Rozvrh SIS')}</p>
        <p className="truncate text-xs text-muted">
          {source.lastError ? <span className="text-red-600">{source.lastError}</span> : source.lastSync ? `${source.itemCount ?? 0} ${source.kind === 'moodle' ? 'termínů' : 'akcí'} · ${formatRelative(new Date(source.lastSync), new Date())}` : 'ještě nenačteno'}
        </p>
      </div>
      <Toggle checked={source.autoRefresh} onChange={(autoRefresh) => upsert({ ...source, autoRefresh })} label={<span className="text-xs text-muted">Průběžně</span>} />
      <Button size="sm" variant="ghost" icon={busy ? LoaderCircle : RefreshCw} className={busy ? '[&>svg]:animate-spin' : undefined} onClick={() => void refreshIcsSource(source, { manual: true })} disabled={busy}>
        Obnovit
      </Button>
      <button
        type="button"
        onClick={async () => {
          if (await confirmAction({ title: 'Odebrat kalendář?', message: source.kind === 'moodle' ? 'Termíny zůstanou v předmětech.' : 'Smažu i jeho rozvrhové akce.', confirmLabel: 'Odebrat', tone: 'danger' })) remove(source.id, source.kind !== 'moodle');
        }}
        className="grid size-8 place-items-center rounded-full text-subtle hover:bg-red-500/10 hover:text-red-600"
        aria-label="Odebrat kalendář"
      >
        <Trash className="size-4" />
      </button>
    </li>
  );
}

function AddSource({ kind, placeholder, validate }: { kind: IcsSource['kind']; placeholder: string; validate?: (url: string) => string | null }) {
  const mode = useAppStore((s) => s.settings.mode);
  const hasDemo = useAppStore((s) => s.events.some((e) => e.demo && e.kind !== 'personal'));
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const trimmed = url.trim();
    const problem = validate?.(trimmed);
    if (mode === 'live' && !trimmed) return;
    if (problem && mode === 'live') {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const source: IcsSource = { id: uid('ics'), kind, url: trimmed || `https://ukazka.stihnu/${kind}.ics`, label: kind === 'moodle' ? 'Kalendář Moodlu' : undefined, autoRefresh: true };
    useAppStore.getState().upsertIcsSource(source);
    const result = await refreshIcsSource(source, { manual: true, replaceDemo: kind === 'sis' && hasDemo });
    if (result.ok) setUrl('');
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder={mode === 'demo' ? `${placeholder} (v Sandboxu stačí kliknout)` : placeholder} inputMode="url" className="flex-1 font-mono text-[12.5px]" />
      <Button variant="primary" icon={busy ? LoaderCircle : Plus} className={busy ? '[&>svg]:animate-spin' : undefined} onClick={() => void add()} disabled={busy || (mode === 'live' && !url.trim())}>
        Přidat
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Moodle                                                              */
/* ------------------------------------------------------------------ */

function MoodleSection() {
  const allSources = useAppStore((s) => s.settings.icsSources);
  const sources = allSources.filter((x) => x.kind === 'moodle');
  const moodle = useAppStore((s) => s.settings.moodle);
  const moodleBusy = useSyncStore((s) => s.moodleBusy);
  const base = 'https://dl1.cuni.cz';
  return (
    <Card id="moodle" className="scroll-mt-24" eyebrow="Úkoly, testy a termíny" title={<>Moodle <em className="italic text-moss">bez starostí</em></>}>
      <div className="space-y-4">
        <div className="rounded-[22px] bg-accent-soft p-4 ring-1 ring-inset ring-accent/20">
          <p className="flex items-center gap-2 text-[14px] font-bold text-accent">
            <Zap className="size-4" aria-hidden /> Doporučeno: kalendář Moodlu – žádný token
          </p>
          <p className="mt-1 text-[13px] text-muted">RSS klíč nepotřebuješ. Moodle umí sdílet všechny termíny jako odkaz na kalendář – Stihnu z něj průběžně vytáhne úkoly, testy a odevzdávárny.</p>
        </div>
        <Steps
          items={[
            <>
              V Moodlu otevři{' '}
              <a className="font-semibold text-accent hover:underline" href={`${base}/calendar/export.php`} target="_blank" rel="noreferrer">
                Kalendář → Exportovat kalendář
              </a>
              .
            </>,
            <>
              Vyber <strong>Všechny události</strong> a období <strong>Nedávné a příští</strong> (nebo 60 dní).
            </>,
            <>
              Klikni <strong>Získat URL kalendáře</strong>, zkopíruj odkaz a vlož ho sem.
            </>,
          ]}
        />
        <AddSource kind="moodle" placeholder={`${base}/calendar/export_execute.php?userid=…&authtoken=…`} validate={(url) => (isMoodleCalendarUrl(url) ? null : 'Tohle nevypadá jako odkaz z „Exportovat kalendář“ (má obsahovat export_execute.php a authtoken).')} />
        {sources.length > 0 && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
        )}
        <Collapsible title="Plné propojení přes token (materiály, PDF, prezentace)" icon={KeyRound} defaultOpen={Boolean(moodle)}>
          <div className="space-y-3 text-[13px] leading-relaxed text-muted">
            <p>
              Token stáhne i soubory z kurzů. Najdeš ho v <strong>Předvolby → Klíče zabezpečení</strong> jako <em>Moodle mobile web service</em> – objeví se ale až poté, co se aspoň jednou přihlásíš v oficiální aplikaci Moodle v mobilu. RSS klíč na to nefunguje.
            </p>
            {moodle && (
              <div className="flex flex-wrap items-center gap-2">
                <Chip className="bg-accent-soft text-accent">Propojeno · {moodle.siteName ?? moodle.baseUrl}</Chip>
                {moodle.lastSync && <span className="text-xs">{formatRelative(new Date(moodle.lastSync), appNow())}</span>}
                <Button size="sm" variant="ghost" icon={moodleBusy ? LoaderCircle : RefreshCw} onClick={() => void runMoodleTokenSync(true)} disabled={moodleBusy}>
                  Synchronizovat
                </Button>
              </div>
            )}
            <MoodleConnect />
          </div>
        </Collapsible>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* SIS                                                                 */
/* ------------------------------------------------------------------ */

function SyllabiBlock() {
  const subjects = useAppStore((s) => s.subjects);
  const mode = useAppStore((s) => s.settings.mode);
  const ownKey = useAppStore((s) => Boolean(s.settings.anthropicApiKey.trim()));
  const serverAi = useUiStore((s) => s.server.anthropic);
  const running = useSyllabusSync((s) => s.running);
  const progress = useSyllabusSync((s) => s.progress);
  const relevant = subjects.filter((s) => (mode === 'live' ? !s.demo : s.demo));
  const withSyllabus = relevant.filter((s) => s.syllabus).length;
  const complete = relevant.length > 0 && withSyllabus === relevant.length;
  return (
    <div className="rounded-[22px] bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <Sparkles className="size-4 text-moss" aria-hidden /> Sylaby a povinnosti – samy
      </p>
      <p className="mt-1 text-[13px] text-muted">
        Po načtení rozvrhu stáhnu ke každému předmětu jeho veřejný sylabus ze SISu a z podmínek zakončení vytáhnu povinnosti, váhy a termíny.{' '}
        {ownKey || serverAi ? 'Čte je AI (Claude).' : 'Teď je čtu pravidly; s AI (klíč Anthropic v sekci Aplikace) to bude chytřejší.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="primary" icon={RefreshCw} loading={running} disabled={relevant.length === 0} onClick={() => void importAllSyllabi({ manual: true, all: complete })}>
          {running && progress ? `Stahuji ${progress.done + 1}/${progress.total}…` : complete ? 'Aktualizovat sylaby' : 'Stáhnout sylaby'}
        </Button>
        <span className="text-[12.5px] text-muted">
          {relevant.length ? `${withSyllabus}/${relevant.length} předmětů má sylabus` : 'Nejdřív načti rozvrh – předměty se vezmou z něj.'}
        </span>
      </div>
    </div>
  );
}

function SisSection() {
  const allSources = useAppStore((s) => s.settings.icsSources);
  const sources = allSources.filter((x) => x.kind !== 'moodle');
  const refreshHours = useAppStore((s) => s.settings.icsRefreshHours);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const openConnect = useUiStore((s) => s.openConnect);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://prazskystudent.vercel.app';
  useEffect(() => {
    // React by href „javascript:“ zablokoval – nastavíme ho přímo v DOM.
    linkRef.current?.setAttribute('href', sisBookmarklet(appOrigin));
  }, [appOrigin]);
  return (
    <Card id="sis" className="scroll-mt-24" eyebrow="Rozvrh, sylaby, zkoušky" title={<>SIS <em className="italic text-moss">průběžně</em></>}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[14px] font-bold">Rozvrh – obnovuje se sám</p>
          <Steps
            items={[
              <>
                V SISu otevři <strong>Rozvrh NG</strong> → svůj rozvrh.
              </>,
              <>
                Najdi <strong>Export → iCalendar</strong> a zkopíruj odkaz (je osobní, nikomu ho nedávej).
              </>,
              <>Vlož ho sem – změny v rozvrhu se propíšou samy, i do Google Kalendáře.</>,
            ]}
          />
          <div className="mt-3">
            <AddSource kind="sis" placeholder="https://is.cuni.cz/…/rozvrh.ics" />
          </div>
          {sources.length > 0 && (
            <ul className="mt-3 space-y-2">
              {sources.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-muted">Obnovovat každých</span>
            <Select value={refreshHours} onChange={(e) => updateSettings({ icsRefreshHours: Number(e.target.value) })} className="h-9 w-32">
              {[1, 3, 6, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" icon={CalendarDays} onClick={() => openConnect('ics')}>
              Pokročilý import (.ics soubor, Google)
            </Button>
          </div>
        </div>

        <SyllabiBlock />

        <div className="rounded-[22px] bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold">
            <BookMarked className="size-4 text-moss" aria-hidden /> Termíny zkoušek a stránky z Moodlu jedním klikem
          </p>
          <p className="mt-1 text-[13px] text-muted">Přetáhni tlačítko do lišty záložek. Pak klikni na záložku v SISu (termíny zkoušek, stránka předmětu) nebo v Moodlu (úkol, kurz) – Stihnu si stránku přečte tvým přihlášením: odevzdané úkoly odškrtne, známky a termíny doplní. Nic se neposílá jinam.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              ref={linkRef}
              onClick={(e) => {
                e.preventDefault();
                toast.info('Tlačítko přetáhni myší do lišty záložek prohlížeče.');
              }}
              className="inline-flex cursor-grab items-center gap-2 rounded-full bg-forest px-4 py-2 text-[13px] font-bold text-forest-fg shadow-md active:cursor-grabbing"
              draggable
            >
              <MousePointerClick className="size-4" aria-hidden /> → Stihnu
            </a>
            <Button size="sm" variant="ghost" icon={ScrollText} onClick={() => navigateTo('import')}>
              Nebo vložit text stránky
            </Button>
            <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.open('https://is.cuni.cz/studium/', '_blank', 'noopener')}>
              Otevřít SIS
            </Button>
          </div>
        </div>

        <Button variant="secondary" icon={ScrollText} onClick={() => openConnect('parser')}>
          Harmonogram fakulty a texty sylabů
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Doprava                                                             */
/* ------------------------------------------------------------------ */

function SecretField({ label, value, onChange, placeholder, hint, extra }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; extra?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <TextInput type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} autoComplete="off" className="font-mono" />
        <Button size="md" variant="ghost" onClick={() => setShow((s) => !s)} className="shrink-0">
          {show ? 'Skrýt' : 'Ukázat'}
        </Button>
        {extra}
      </div>
    </Field>
  );
}

function TransitSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setOriginStop = useAppStore((s) => s.setOriginStop);
  const server = useUiStore((s) => s.server);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const liveOrigin = settings.origin.live;
  const stop = settings.originStop[settings.mode];
  return (
    <Card id="doprava" className="scroll-mt-24" eyebrow="PID · Golemio" title={<>Doprava <em className="italic text-moss">na míru</em></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-surface-2 p-3.5">
          <MapPin className="size-5 text-moss" aria-hidden />
          <p className="min-w-0 flex-1 text-[13.5px]">{stop ? <>Jezdíš ze zastávky <strong>{stop.name}</strong></> : 'Výchozí zastávka: automaticky nejbližší'}</p>
          {stop && (
            <Button size="sm" variant="ghost" onClick={() => setOriginStop(settings.mode, null)}>
              Automaticky
            </Button>
          )}
          <Button size="sm" variant="primary" icon={TramFront} onClick={() => navigateTo('doprava')}>
            Vybrat na mapě
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rezerva v učebně">
            <Select value={settings.bufferMinutes} onChange={(e) => updateSettings({ bufferMinutes: Number(e.target.value) })}>
              {[0, 2, 3, 5, 7, 10, 15].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pohodlná rezerva">
            <Select value={settings.comfortMinutes} onChange={(e) => updateSettings({ comfortMinutes: Number(e.target.value) })}>
              {[4, 6, 8, 10, 15, 20].map((m) => (
                <option key={m} value={m}>
                  +{m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chůze">
            <Select value={settings.walkSpeed} onChange={(e) => updateSettings({ walkSpeed: e.target.value as WalkSpeed })}>
              <option value="slow">Pomalá</option>
              <option value="normal">Běžná</option>
              <option value="fast">Rychlá</option>
            </Select>
          </Field>
          <Field label="Bez GPS jedu z">
            <Select value={liveOrigin.presetId} onChange={(e) => setOrigin('live', { ...liveOrigin, presetId: e.target.value })}>
              {LOCATION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            <Toggle key="gps" checked={liveOrigin.source === 'gps'} onChange={(v) => setOrigin('live', { ...liveOrigin, source: v ? 'gps' : 'preset' })} label="GPS v Live režimu" />,
            <Toggle key="acc" checked={settings.accessibleOnly} onChange={(accessibleOnly) => updateSettings({ accessibleOnly })} label="Jen nízkopodlažní" />,
            <Toggle key="ac" checked={settings.preferAirConditioned} onChange={(preferAirConditioned) => updateSettings({ preferAirConditioned })} label="Preferovat klimatizaci" />,
          ].map((toggle) => (
            <div key={toggle.key} className="rounded-[18px] bg-surface-2 px-3.5 py-2">
              {toggle}
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <SecretField
              label="Golemio API klíč"
              value={settings.golemioApiKey}
              onChange={(golemioApiKey) => updateSettings({ golemioApiKey })}
              placeholder="eyJhbGciOi…"
              hint={
                <>
                  Zdarma na{' '}
                  <a href="https://api.golemio.cz/api-keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    api.golemio.cz
                  </a>{' '}
                  – živé odjezdy, zpoždění, klimatizace.
                </>
              }
              extra={
                <Button
                  onClick={async () => {
                    setTesting(true);
                    setTestResult(await testGolemioKey(settings.golemioApiKey));
                    setTesting(false);
                  }}
                  loading={testing}
                  disabled={!settings.golemioApiKey && !server.golemio}
                >
                  Test
                </Button>
              }
            />
            {testResult && <p className={cn('mt-1.5 text-xs', testResult.ok ? 'text-accent' : 'text-red-600 dark:text-red-400')}>{testResult.message}</p>}
          </div>
          <SecretField label="Google Maps klíč (volitelné)" value={settings.googleMapsApiKey} onChange={(googleMapsApiKey) => updateSettings({ googleMapsApiKey })} placeholder="AIza…" hint="Trasy s přestupy přes Routes API." />
        </div>
        <Collapsible title="Budovy a zastávky u nich" icon={MapPin}>
          <BuildingsEditor />
        </Collapsible>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Počasí a aplikace                                                   */
/* ------------------------------------------------------------------ */

function WeatherSection() {
  const weather = useAppStore((s) => s.settings.weather);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return (
    <Card id="pocasi" className="scroll-mt-24" eyebrow="Open-Meteo" title={<>Počasí <em className="italic text-moss">a oblečení</em></>}>
      <div className="space-y-4">
        <Toggle checked={weather.enabled} onChange={(enabled) => updateSettings({ weather: { ...weather, enabled } })} label="Rada na cestu do školy" description="Co si obléct a jestli bude pršet cestou tam a zpátky." />
        <Field label="Jak snadno ti je zima?">
          <Segmented
            value={weather.feel}
            onChange={(feel) => updateSettings({ weather: { ...weather, feel } })}
            options={[
              { value: 'cold', label: '🥶 Zimomřivě' },
              { value: 'normal', label: 'Normálně' },
              { value: 'warm', label: '🔥 Otužile' },
            ]}
          />
        </Field>
      </div>
    </Card>
  );
}

function AppSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setMode = useAppStore((s) => s.setMode);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const clearDemoData = useAppStore((s) => s.clearDemoData);
  const clearAllData = useAppStore((s) => s.clearAllData);
  const importBackup = useAppStore((s) => s.importBackup);
  const server = useUiStore((s) => s.server);
  const serverChecked = useUiStore((s) => s.serverChecked);
  const simulated = useClockStore((s) => s.simulated);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const state = useAppStore.getState();
    const { golemioApiKey: _g, googleMapsApiKey: _m, anthropicApiKey: _a, moodle, ...safeSettings } = state.settings;
    void _g;
    void _m;
    void _a;
    const payload = { app: 'stihnu', version: 2, exportedAt: new Date().toISOString(), ...pickPersisted(state), settings: { ...safeSettings, moodle: moodle ? { ...moodle, token: '' } : null } };
    downloadTextFile(`stihnu-zaloha-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast.success('Záloha stažena (bez klíčů a tokenů).');
  };

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'stihnu') throw new Error('Soubor není záloha aplikace Stihnu.');
      importBackup(data);
      toast.success('Záloha obnovena.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Zálohu se nepodařilo načíst.');
    }
  };

  return (
    <Card id="aplikace" className="scroll-mt-24" eyebrow="Vzhled, režim, data" title={<>Aplikace</>}>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Režim">
            <Segmented
              value={settings.mode}
              onChange={(m) => {
                setMode(m);
                toast.info(m === 'demo' ? 'Sandbox: simulovaná data.' : 'Live: skutečná data.');
              }}
              options={[
                { value: 'demo', label: 'Sandbox', icon: FlaskConical },
                { value: 'live', label: 'Live', icon: Zap },
              ]}
            />
          </Field>
          <Field label="Motiv">
            <Segmented
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Auto', icon: Monitor },
                { value: 'light', label: 'Světlý', icon: Sun },
                { value: 'dark', label: 'Tmavý', icon: Moon },
              ]}
            />
          </Field>
        </div>
        <Field label="Jak tě oslovit" hint="Zobrazí se v pozdravu na hlavní stránce.">
          <TextInput value={settings.displayName} onChange={(e) => updateSettings({ displayName: e.target.value })} placeholder="např. Ondro" maxLength={24} className="max-w-xs" />
        </Field>
        {settings.mode === 'demo' && (
          <Toggle
            checked={settings.demoClock}
            onChange={(v) => {
              updateSettings({ demoClock: v });
              if (v) useClockStore.getState().startSimulation();
              else useClockStore.getState().switchToRealTime();
            }}
            label="Simulované hodiny (start ve 13:05)"
            description={simulated ? 'Odpočet do semináře ve 14:00 je vidět kdykoli.' : 'Běží reálný čas.'}
          />
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Připomínky u ručně exportovaných termínů (.ics)</span>
          <div className="flex flex-wrap gap-1.5">
            {[10080, 2880, 1440, 180, 120, 60, 30].map((m) => {
              const active = settings.reminders.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateSettings({ reminders: active ? settings.reminders.filter((x) => x !== m) : [...settings.reminders, m].sort((a, b) => b - a) })}
                  className={cn('rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-muted ring-line-strong hover:text-fg')}
                >
                  {formatReminder(m)}
                </button>
              );
            })}
          </div>
        </div>
        <SecretField label="Anthropic API klíč (volitelné)" value={settings.anthropicApiKey} onChange={(anthropicApiKey) => updateSettings({ anthropicApiKey })} placeholder="sk-ant-…" hint="Přesnější čtení harmonogramů a sylabů pomocí Claude." />
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={exportBackup}>
            Záloha
          </Button>
          <Button icon={Upload} onClick={() => fileRef.current?.click()}>
            Obnovit
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
          <Button
            variant="ghost"
            icon={RotateCcw}
            onClick={async () => {
              if (await confirmAction({ title: 'Obnovit ukázku?', message: 'Sandbox se vrátí do výchozího stavu.', confirmLabel: 'Obnovit' })) {
                resetDemo(appNow());
                setMode('demo');
                toast.success('Ukázková data obnovena.');
              }
            }}
          >
            Obnovit ukázku
          </Button>
          <Button
            variant="ghost"
            icon={Trash}
            onClick={async () => {
              if (await confirmAction({ title: 'Smazat ukázková data?', message: 'Tvoje vlastní data zůstanou.', confirmLabel: 'Smazat ukázku', tone: 'danger' })) {
                clearDemoData();
                toast.info('Ukázková data smazána.');
              }
            }}
          >
            Smazat ukázku
          </Button>
          <Button
            variant="ghost"
            icon={Trash}
            className="text-red-700 hover:text-red-700"
            onClick={async () => {
              if (await confirmAction({ title: 'Smazat všechna data?', message: 'Smaže předměty, rozvrh, úkoly, materiály i milníky v tomto zařízení.', confirmLabel: 'Smazat vše', tone: 'danger' })) {
                clearAllData();
                toast.info('Data smazána.');
              }
            }}
          >
            Smazat vše
          </Button>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted">
          <ServerCog className="size-3.5" aria-hidden />
          {!serverChecked
            ? 'Zjišťuji serverové funkce…'
            : server.reachable
              ? `Server běží · ${[server.golemio && 'Golemio', server.google && 'Google Maps', server.googleClientId && 'Google přihlášení', server.anthropic && 'Claude'].filter(Boolean).join(', ') || 'bez serverových klíčů'}`
              : 'Server nedostupný – Live režim potřebuje nasazení na Vercel.'}
        </p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Obrazovka                                                           */
/* ------------------------------------------------------------------ */

export function ConnectionsView({ section }: { section?: string }) {
  const settings = useAppStore((s) => s.settings);
  const gs = useAppStore((s) => s.googleSync[s.settings.mode]);
  const server = useUiStore((s) => s.server);
  const sis = settings.icsSources.filter((s) => s.kind !== 'moodle');
  const moodleIcs = settings.icsSources.filter((s) => s.kind === 'moodle');

  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => clearTimeout(t);
  }, [section]);

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-[32px] bg-forest px-6 py-9 text-white sm:px-10 sm:py-12">
        <img src="/images/path-1200.webp" alt="" className="absolute inset-0 size-full object-cover opacity-60" />
        <div className="photo-scrim absolute inset-0" />
        <div className="relative">
          <p className="eyebrow text-white/75">Propojení</p>
          <SerifTitle as="h1" className="mt-2 text-[48px] text-white sm:text-[64px] [&_em]:text-[#e7d6b5]">
            Všechno <em>na jednom</em> místě
          </SerifTitle>
          <p className="mt-3 max-w-lg text-[15px] text-white/85">Google, Moodle, SIS a PID. Jednou propojíš – pak se o to stará Stihnu.</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile icon={CalendarDays} label="Google" ok={Boolean(settings.google.enabled && gs.connectedAt)} status={gs.connectedAt ? (gs.account?.email ?? 'propojeno') : 'Kalendář · Úkoly · Disk'} href="#/propojeni/google" />
        <Tile icon={GraduationCap} label="Moodle" ok={moodleIcs.length > 0 || Boolean(settings.moodle)} status={moodleIcs.length ? 'přes kalendář' : settings.moodle ? 'přes token' : 'nepropojeno'} href="#/propojeni/moodle" />
        <Tile icon={Link2} label="SIS" ok={sis.length > 0} status={sis.length ? `${sis.length} ${sis.length === 1 ? 'kalendář' : 'kalendáře'}` : 'rozvrh a sylaby'} href="#/propojeni/sis" />
        <Tile icon={TramFront} label="Doprava" ok={settings.mode === 'demo' || Boolean(settings.golemioApiKey) || server.golemio} status={settings.mode === 'demo' ? 'simulace PID' : settings.golemioApiKey || server.golemio ? 'živá data' : 'chybí klíč'} href="#/propojeni/doprava" />
        <Tile icon={CloudSun} label="Počasí" ok={settings.weather.enabled} status={settings.weather.enabled ? 'Open-Meteo' : 'vypnuto'} href="#/propojeni/pocasi" />
      </div>

      <GoogleSection />
      <div className="grid gap-5 xl:grid-cols-2">
        <MoodleSection />
        <SisSection />
      </div>
      <TransitSection />
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <WeatherSection />
        <AppSection />
      </div>
      <p className="flex items-center justify-center gap-2 pb-4 text-xs text-subtle">
        <Database className="size-3.5" aria-hidden /> Data jsou v tomto zařízení{gs.connectedAt && settings.google.drive.enabled ? ' a ve tvém Google Disku' : ''}. Fotky: Unsplash.
      </p>
    </div>
  );
}
