import { AiMark } from '../ui/AiMark';
import { MODE_CHOICES, normalizeModes, toggleMode } from '../../lib/transitModes';
import { activeOriginStop } from '../../hooks/useOrigin';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookMarked, CalendarDays, ChevronDown, Database, Download, ExternalLink, FlaskConical, GraduationCap, KeyRound, LoaderCircle, MapPin, MousePointerClick, Plus, RefreshCw, RotateCcw, ScrollText, ServerCog, TramFront, Trash, Upload, Zap } from 'lucide-react';
import type { IcsSource, WalkSpeed } from '../../types';
import { downloadTextFile } from '../../lib/calendarExport';
import { formatRelative } from '../../lib/dates';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { uid } from '../../lib/id';
import { isMoodleCalendarUrl } from '../../lib/moodleIcs';
import { sisBookmarklet } from '../../lib/sisImport';
import { ServiceVisual } from '../setup/ConnectionsHub';
import { ConnectionStatusLine } from '../setup/ConnectionPulse';
import { MusicPicker } from '../music/MusicPicker';
import { PlaylistPlayer } from '../music/PlaylistPlayer';
import { useConnections, type ServiceId } from '../../hooks/useConnections';
import { SettingsBack } from '../settings/SettingsBack';
import { MOODLE_SHOTS, RealScreens, SIS_SHOTS } from '../setup/RealScreens';
import { AI_NAMES, providerForKey } from '../../lib/aiProvider';
import { navigateTo } from '../../hooks/useAppShell';
import { testGolemioKey } from '../../services/api';
import { refreshIcsSource, runMoodleTokenSync, useSyncStore } from '../../services/syncCenter';
import { importAllSyllabi, useSyllabusSync } from '../../services/syllabusSync';
import { importSisIcsFile, type SisFileResult } from '../../services/icsFileImport';
import { pickPersisted, useAppStore } from '../../store/appStore';
import { appNow, useClockStore } from '../../store/clockStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { Button, Card, CardBareContext, Chip, cn, Field, Segmented, Select, TextInput, Toggle } from '../ui/primitives';
import { BuildingsEditor } from './BuildingsEditor';
import { GoogleSection } from './GoogleSection';
import { MoodleConnect } from './MoodleConnect';
import { isOwnerEmail } from '../../store/testStore';
import { useAccount } from '../../services/account';

/* ------------------------------------------------------------------ */
/* Pomocné prvky                                                       */
/* ------------------------------------------------------------------ */


export function Collapsible({ title, children, defaultOpen = false, icon: Icon }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; icon?: typeof CalendarDays }) {
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
      <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder={mode === 'demo' ? `${placeholder} (v ukázce stačí kliknout)` : placeholder} inputMode="url" className="flex-1 font-mono text-[12.5px]" />
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
          <p className="mt-1 text-[13px] text-muted">Klíč z Moodlu nepotřebujete. Moodle umí sdílet všechny termíny jako odkaz na kalendář – Stihnuto z něj průběžně vytáhne úkoly, testy a odevzdávárny. Odevzdání a známky pak přenesete záložkou „→ Stihnuto“, nebo je aplikace stáhne sama s klíčem z Moodlu (níže).</p>
        </div>
        <Steps
          items={[
            <>
              V Moodlu otevřete{' '}
              <a className="font-semibold text-accent hover:underline" href={`${base}/calendar/export.php`} target="_blank" rel="noreferrer">
                Kalendář → Exportovat kalendář
              </a>
              .
            </>,
            <>
              Zvolte <strong>Všechny události</strong> a období <strong>Předchozích a následujících 60 dnů</strong> (ve starší verzi „Nedávné a příštích 60 dní“).
            </>,
            <>
              Klikněte <strong>Získat URL kalendáře</strong>, zkopírujte odkaz a vložte ho sem.
            </>,
          ]}
        />
        <RealScreens shots={MOODLE_SHOTS} source="Skutečné obrazovky Moodlu 5 (veřejná ukázka moodledemo.net) – Moodle UK vypadá stejně." />
        <AddSource kind="moodle" placeholder={`${base}/calendar/export_execute.php?userid=…&authtoken=…`} validate={(url) => (isMoodleCalendarUrl(url) ? null : 'Tohle nevypadá jako odkaz z „Exportovat kalendář“ (má obsahovat export_execute.php a authtoken).')} />
        {sources.length > 0 && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
        )}
        <Collapsible title="Plné propojení přes klíč (odevzdání, známky, materiály)" icon={KeyRound} defaultOpen={Boolean(moodle)}>
          <div className="space-y-3 text-[13px] leading-relaxed text-muted">
            <p>
              S klíčem Stihnuto samo odškrtne odevzdané úkoly, zapíše známky a stáhne soubory z kurzů. Nový Moodle klíč v{' '}
              <a className="font-semibold text-accent hover:underline" href={`${base}/user/managetoken.php`} target="_blank" rel="noreferrer">
                Bezpečnostních klíčích
              </a>{' '}
              neukazuje – ukáže ho <strong>jen jednou, hned po kliknutí na Reset</strong> u „Moodle mobile web service“. Pak ho zkopírujte sem (aplikace Moodle v mobilu vás jen znovu přihlásí).
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

function SisFileUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SisFileResult | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const result = await importSisIcsFile(file);
      setLast(result);
      const n = result.newSubjects;
      toast.success(`Rozvrh nahrán: ${result.events} akcí${n ? `, ${n} ${n === 1 ? 'nový předmět' : n < 5 ? 'nové předměty' : 'nových předmětů'}` : ''}. Stahuji k nim sylaby…`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Soubor se nepodařilo načíst.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3">
      <div
        className="flex flex-wrap items-center gap-3 rounded-[18px] border-2 border-dashed border-line-strong p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <Button variant="primary" icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>
          Nahrát rozvrh (.ics)
        </Button>
        <span className="text-[12.5px] text-muted">nebo soubor přetáhněte sem</span>
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </div>
      {last && (
        <p className="mt-2 text-[12.5px] text-muted">
          Načteno {last.events} akcí{last.online ? ` (${last.online} online – bez cesty MHD)` : ''}.
          {last.unresolved.length > 0 && ` Neznámá místa: ${last.unresolved.slice(0, 3).join(', ')} – přiřadíte je v Dopravě.`}
        </p>
      )}
    </div>
  );
}

function SyllabiBlock() {
  const subjects = useAppStore((s) => s.subjects);
  const mode = useAppStore((s) => s.settings.mode);
  const ownKey = useAppStore((s) => Boolean(providerForKey(s.settings.anthropicApiKey)));
  const serverAi = useUiStore((s) => s.server.anthropic);
  const running = useSyllabusSync((s) => s.running);
  const progress = useSyllabusSync((s) => s.progress);
  const relevant = subjects.filter((s) => (mode === 'live' ? !s.demo : s.demo));
  const withSyllabus = relevant.filter((s) => s.syllabus).length;
  const complete = relevant.length > 0 && withSyllabus === relevant.length;
  return (
    <div className="rounded-[22px] bg-surface-2 p-4">
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <AiMark className="size-4 text-moss" aria-hidden /> Sylaby a povinnosti – samy
      </p>
      <p className="mt-1 text-[13px] text-muted">
        Po načtení rozvrhu stáhnu ke každému předmětu jeho veřejný sylabus ze SISu a z podmínek zakončení vytáhnu povinnosti, váhy a termíny.{' '}
        {ownKey || serverAi ? 'Čte je AI – zdarma, bez klíče.' : 'Teď je čtu pravidly.'}
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
    <Card id="sis" className="scroll-mt-24" eyebrow="Rozvrh, sylaby, zkoušky" title={<>SIS <em className="italic text-moss">rozvrh a sylaby</em></>}>
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[14px] font-bold">Rozvrh ze SISu</p>
          <RealScreens shots={SIS_SHOTS} source="Obrázky SISu jsou ilustrace (skutečný vzhled se může mírně lišit), poslední obrazovka je skutečné Stihnuto." className="mb-4" />
          <Steps
            items={[
              <>
                V SISu otevřete <strong>Rozvrh NG</strong> → svůj rozvrh.
              </>,
              <>
                Klikněte na <strong>Export → iCalendar</strong> – stáhne se soubor <em>rozvrh.ics</em>.
              </>,
              <>Nahrajte ho sem. Když se rozvrh změní (zápis, výměna semináře), nahrajte nový – starý se nahradí.</>,
            ]}
          />
          <SisFileUpload />
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-muted hover:text-fg">Máte místo souboru odkaz na kalendář (iCal)?</summary>
            <div className="mt-2">
              <AddSource kind="sis" placeholder="https://is.cuni.cz/…/rozvrh.ics" />
            </div>
          </details>
          {sources.length > 0 && (
            <ul className="mt-3 space-y-2">
              {sources.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
            {sources.length > 0 && (
              <>
                <span className="text-muted">Odkazy obnovovat každých</span>
                <Select value={refreshHours} onChange={(e) => updateSettings({ icsRefreshHours: Number(e.target.value) })} className="h-9 w-32">
                  {[1, 3, 6, 12, 24].map((h) => (
                    <option key={h} value={h}>
                      {h} h
                    </option>
                  ))}
                </Select>
              </>
            )}
            <Button size="sm" variant="ghost" icon={CalendarDays} onClick={() => openConnect('ics')} className="h-auto min-h-8 whitespace-normal py-1.5 text-left">
              Pokročilý import (náhled, přiřazení míst, Google)
            </Button>
          </div>
        </div>

        <SyllabiBlock />

        <div className="rounded-[22px] bg-surface-2 p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold">
            <BookMarked className="size-4 text-moss" aria-hidden /> Termíny zkoušek a stránky z Moodlu jedním klikem
          </p>
          <p className="mt-1 text-[13px] text-muted">Přetáhněte tlačítko do lišty záložek. Pak klikněte na záložku v SISu (termíny zkoušek, stránka předmětu) nebo v Moodlu (úkol, kurz) – Stihnuto si stránku přečte vaším přihlášením: odevzdané úkoly odškrtne, známky a termíny doplní. Nic se neposílá jinam.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              ref={linkRef}
              onClick={(e) => {
                e.preventDefault();
                toast.info('Tlačítko přetáhněte myší do lišty záložek prohlížeče.');
              }}
              className="inline-flex cursor-grab items-center gap-2 rounded-full bg-forest px-4 py-2 text-[13px] font-bold text-forest-fg shadow-md active:cursor-grabbing"
              draggable
            >
              <MousePointerClick className="size-4" aria-hidden /> → Stihnuto
            </a>
            <Button size="sm" variant="ghost" icon={ScrollText} onClick={() => navigateTo('import')}>
              Nebo vložit text stránky
            </Button>
            <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.open('https://is.cuni.cz/studium/', '_blank', 'noopener')}>
              Otevřít SIS
            </Button>
          </div>
        </div>

        <Button variant="secondary" icon={ScrollText} onClick={() => openConnect('parser')} className="h-auto min-h-10 max-w-full whitespace-normal py-2 text-left">
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

export function TransitSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setOriginStop = useAppStore((s) => s.setOriginStop);
  const server = useUiStore((s) => s.server);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const liveOrigin = settings.origin.live;
  const stop = activeOriginStop(settings.originStop[settings.mode], null);
  return (
    <Card id="doprava" className="scroll-mt-24" eyebrow="PID · Golemio" title={<>Doprava <em className="italic text-moss">na míru</em></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-surface-2 p-3.5">
          <MapPin className="size-5 text-moss" aria-hidden />
          <p className="min-w-0 flex-1 text-[13.5px]">{stop ? <>Jezdíte ze zastávky <strong>{stop.name}</strong></> : 'Výchozí zastávka: automaticky nejbližší'}</p>
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
          <Field label="Na místě předem" hint="Doporučený spoj">
            <Select value={settings.bufferMinutes} onChange={(e) => updateSettings({ bufferMinutes: Number(e.target.value) })}>
              {[3, 5, 7, 10, 15, 20].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nejpozději v budově" hint="Poslední možné spoje">
            <Select value={settings.minMarginMinutes ?? 3} onChange={(e) => updateSettings({ minMarginMinutes: Number(e.target.value) })}>
              {[0, 2, 3, 5].map((m) => (
                <option key={m} value={m}>
                  {m} min předem
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
          <Field label="Když poloha není k dispozici" hint="Jinak vždy podle aktuální polohy">
            <Select value={liveOrigin.presetId} onChange={(e) => setOrigin('live', { source: 'preset', presetId: e.target.value })}>
              {LOCATION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13.5px] font-bold">Čím jezdím</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Čím jezdím">
            {MODE_CHOICES.map((m) => {
              const on = normalizeModes(settings.transitModes).includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => updateSettings({ transitModes: toggleMode(settings.transitModes, m.id) })}
                  className={cn('rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition', on ? 'bg-accent-soft text-accent ring-accent/40' : 'bg-surface text-subtle line-through ring-line hover:text-fg')}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[12.5px] text-subtle">Platí pro odpočet na hlavní stránce i pro hledání v Dopravě.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
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
        <Collapsible title="Všechny budovy a cílové zastávky (pokročilé)" icon={MapPin}>
          <BuildingsEditor />
        </Collapsible>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Počasí a aplikace                                                   */
/* ------------------------------------------------------------------ */

export function WeatherSection() {
  const weather = useAppStore((s) => s.settings.weather);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return (
    <Card id="pocasi" className="scroll-mt-24" eyebrow="Open-Meteo" title={<>Počasí <em className="italic text-moss">a oblečení</em></>}>
      <div className="space-y-4">
        <Toggle checked={weather.enabled} onChange={(enabled) => updateSettings({ weather: { ...weather, enabled } })} label="Rada na cestu do školy" description="Co si obléct a jestli bude pršet cestou tam a zpátky." />
        <Field label="Jak snadno vám je zima?">
          <Segmented
            value={weather.feel}
            onChange={(feel) => updateSettings({ weather: { ...weather, feel } })}
            options={[
              { value: 'cold', label: 'Zimomřivě' },
              { value: 'normal', label: 'Normálně' },
              { value: 'warm', label: 'Otužile' },
            ]}
          />
        </Field>
      </div>
    </Card>
  );
}

export function AppSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
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
    downloadTextFile(`stihnuto-zaloha-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast.success('Záloha je stažená (bez klíčů a přístupových údajů).');
  };

  const onImport = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'stihnu') throw new Error('Soubor není záloha aplikace Stihnuto.');
      importBackup(data);
      toast.success('Záloha obnovena.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Zálohu se nepodařilo načíst.');
    }
  };

  const showDemo = async () => {
    if (await confirmAction({ title: 'Zobrazit ukázku?', message: 'Přidám vymyšlené předměty na vyzkoušení. Vaše data zůstanou; ukázka zmizí, jakmile se vrátíte k vlastním datům.', confirmLabel: 'Zobrazit ukázku' })) {
      useAppStore.getState().startDemo();
      toast.success('Ukázka je zpátky.');
    }
  };
  const deleteDemo = async () => {
    if (await confirmAction({ title: 'Smazat ukázková data?', message: 'Vaše vlastní data zůstanou.', confirmLabel: 'Smazat ukázku', tone: 'danger' })) {
      const removed = useAppStore.getState().purgeSampleData();
      toast.info(removed ? 'Ukázková data smazána.' : 'Žádná ukázková data tu nejsou.');
    }
  };
  const aiProvider = providerForKey(settings.anthropicApiKey);

  return (
    <div className="space-y-4">
      <Card id="aplikace" className="scroll-mt-24" eyebrow="Co aplikace ukazuje" title={<>Vaše data <em className="italic text-moss">a ukázka</em></>}>
        <div className="space-y-4">
          <Segmented
            value={settings.mode}
            onChange={(m) => {
              if (m === 'demo') {
                useAppStore.getState().startDemo();
                toast.info('Ukázka: vymyšlené předměty a simulovaná doprava.');
              } else {
                const removed = useAppStore.getState().startOwnData();
                toast.success(removed ? 'Moje data – ukázka je pryč.' : 'Moje data.');
              }
            }}
            options={[
              { value: 'live', label: 'Moje data', icon: Zap },
              { value: 'demo', label: 'Ukázka', icon: FlaskConical },
            ]}
          />
          <p className="text-[13.5px] leading-relaxed text-muted">Ukázka jsou vymyšlené předměty a simulovaná doprava na vyzkoušení. Moje data jsou jen vaše předměty, rozvrh a úkoly – ukázka se s nimi nikdy nemíchá.</p>
          {settings.mode === 'demo' && (
            <Toggle
              checked={settings.demoClock}
              onChange={(v) => {
                updateSettings({ demoClock: v });
                if (v) useClockStore.getState().startSimulation();
                else useClockStore.getState().switchToRealTime();
              }}
              label="Simulované hodiny ukázky (start ve 13:05)"
              description={simulated ? 'Odpočet do semináře ve 14:00 je vidět kdykoli.' : 'Běží reálný čas.'}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {settings.mode === 'live' && (
              <Button variant="ghost" icon={RotateCcw} onClick={() => void showDemo()}>
                Zobrazit ukázku
              </Button>
            )}
            <Button variant="ghost" icon={Trash} onClick={() => void deleteDemo()}>
              Smazat ukázková data
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card eyebrow="Soubor do počítače" title={<>Záloha</>}>
          <p className="text-[13.5px] leading-relaxed text-muted">Stáhne předměty, rozvrh, úkoly a nastavení do jednoho souboru – bez hesel a klíčů. S účtem se vše ukládá samo, záloha se hodí navíc.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportBackup}>
              Stáhnout zálohu
            </Button>
            <Button variant="ghost" icon={Upload} onClick={() => fileRef.current?.click()}>
              Obnovit ze zálohy
            </Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
          </div>
        </Card>

        <Card eyebrow="Čtení sylabů, stránek z Moodlu a PDF" title={<>Umělá <em className="italic text-moss">inteligence</em></>}>
          <p className="text-[13.5px] leading-relaxed text-muted">
            {server.aiProvider ? 'Funguje zdarma a bez nastavování (servery v EU). ' : ''}Pokud máte vlastní klíč, aplikace použije ten – poznám ho podle tvaru.
          </p>
          <div className="mt-3">
            <SecretField label="Vlastní AI klíč (volitelné)" value={settings.anthropicApiKey} onChange={(anthropicApiKey) => updateSettings({ anthropicApiKey })} placeholder="Claude sk-ant-…, ChatGPT sk-… nebo Gemini AIza…" hint={aiProvider ? `Používáte ${AI_NAMES[aiProvider]}.` : 'Claude, ChatGPT i Gemini.'} />
          </div>
        </Card>
      </div>

      {isOwnerEmail(useAccount.getState().user?.email) && <p className="flex items-center gap-2 px-1 text-xs text-muted">
        <ServerCog className="size-3.5 shrink-0" aria-hidden />
        {!serverChecked
          ? 'Zjišťuji serverové funkce…'
          : server.reachable
            ? `Server běží · ${[server.golemio && 'Golemio', server.google && 'Google Maps', server.googleClientId && 'Google přihlášení', server.aiProvider && 'AI'].filter(Boolean).join(', ') || 'bez serverových klíčů'}`
            : 'Server aplikace je nedostupný – vlastní data potřebují aplikaci nasazenou na Vercelu.'}
      </p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Obrazovka                                                           */
/* ------------------------------------------------------------------ */

const MAIN: { id: ServiceId; key: string; what: string }[] = [
  { id: 'sis', key: 'sis', what: 'Rozvrh, předměty, sylaby a zkoušky' },
  { id: 'moodle', key: 'moodle', what: 'Úkoly, testy a termíny z kurzů' },
  { id: 'google', key: 'google', what: 'Kalendář, Úkoly a Disk – i v telefonu' },
  { id: 'music', key: 'hudba', what: 'Playlist ze Spotify na učení a na cestu' },
];

const PILL: Record<string, { label: string; cls: string }> = {
  connected: { label: 'Propojeno', cls: 'bg-accent-soft text-accent' },
  auto: { label: 'Funguje samo', cls: 'bg-accent-soft text-accent' },
  attention: { label: 'Potřebuje 1 klik', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  todo: { label: 'Nepropojeno', cls: 'bg-surface-2 text-muted' },
  skipped: { label: 'Nepropojeno', cls: 'bg-surface-2 text-muted' },
  unavailable: { label: 'Zatím nejde', cls: 'bg-surface-2 text-subtle' },
};

function MusicPanel() {
  const music = useAppStore((s) => s.settings.music);
  return (
    <div className="space-y-3">
      {music && <PlaylistPlayer compact />}
      <MusicPicker />
      <p className="text-[12.5px] text-subtle">Bez přihlašování ke Spotify. Na telefonu se playlist otevře rovnou v aplikaci Spotify.</p>
    </div>
  );
}

/** Propojení: jen služby, které je potřeba propojit. Každá na jednom místě – rozbalením. */
export function ConnectionsView({ section }: { section?: string }) {
  const { services, done } = useConnections();
  const openSetup = useUiStore((s) => s.openSetup);
  const initial = MAIN.find((m) => m.key === section || m.id === section)?.key ?? null;
  const [open, setOpen] = useState<string | null>(initial);

  useEffect(() => {
    if (!initial) return;
    setOpen(initial);
    const t = setTimeout(() => document.getElementById(`svc-${initial}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => clearTimeout(t);
  }, [initial]);

  const status = (id: ServiceId) => services.find((x) => x.id === id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SettingsBack />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[44px] leading-none sm:text-[52px]">Propojení</h1>
          <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-muted">Odkud se berou vaše předměty, termíny a úkoly. Klepněte na službu – všechno k ní je na jednom místě.</p>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-[13px] font-bold ring-1 ring-inset ring-line">
          Propojeno {done} ze {MAIN.length}
        </span>
      </header>

      <ul className="space-y-3">
        {MAIN.map((m) => {
          const s = status(m.id);
          const isOpen = open === m.key;
          const pill = PILL[s?.state ?? 'todo'] ?? PILL.todo;
          return (
            <li key={m.key} id={`svc-${m.key}`} className={cn('card scroll-mt-24 overflow-hidden rounded-[24px]', s?.state === 'attention' && 'ring-2 ring-amber-400/70')}>
              <button type="button" onClick={() => setOpen(isOpen ? null : m.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-surface-2/50 sm:p-5">
                <span className={cn('grid size-12 shrink-0 place-items-center rounded-[16px] ring-1 ring-inset', m.id === 'google' ? 'bg-white ring-line' : 'bg-accent-soft text-accent ring-accent/15')}>
                  <ServiceVisual id={m.id} size={36} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[17px] font-bold">{s?.title ?? m.key}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-bold', pill.cls)}>{pill.label}</span>
                  </span>
                  <span className="mt-0.5 block text-[13.5px] text-muted">{s && (s.state === 'connected' || s.state === 'attention') ? s.detail : m.what}</span>
                  {s && (s.since || s.lastFlow) && <ConnectionStatusLine s={s} />}
                </span>
                <ChevronDown className={cn('size-5 shrink-0 text-subtle transition', isOpen && 'rotate-180')} aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="border-t border-line p-4 sm:p-5">
                      <CardBareContext.Provider value={true}>
                        {m.id === 'sis' && <SisSection />}
                        {m.id === 'moodle' && <MoodleSection />}
                        {m.id === 'google' && <GoogleSection />}
                        {m.id === 'music' && <MusicPanel />}
                      </CardBareContext.Provider>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <div className="card flex flex-wrap items-center gap-3 rounded-[22px] p-4">
        <p className="min-w-0 flex-1 text-[14px]">
          <strong>Raději krok za krokem?</strong> <span className="text-muted">Průvodce vás provede všemi službami za pár minut.</span>
        </p>
        <button type="button" onClick={() => openSetup('start')} className="rounded-full bg-accent px-4 py-2 text-[13.5px] font-bold text-accent-fg hover:brightness-110">
          Spustit průvodce
        </button>
      </div>

      <p className="flex items-start justify-center gap-2 pb-4 text-center text-[12.5px] leading-relaxed text-subtle">
        <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Počasí, doprava a jídelníček fungují samy – nic se propojovat nemusí. Škola a budovy, upozornění a umělá inteligence jsou v Nastavení.
      </p>
    </div>
  );
}
