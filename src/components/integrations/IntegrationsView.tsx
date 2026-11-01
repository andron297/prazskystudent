import { useRef, useState, type ReactNode } from 'react';
import {
  BellRing,
  CalendarDays,
  CircleCheck,
  CircleDot,
  Database,
  Download,
  FlaskConical,
  GraduationCap,
  KeyRound,
  Monitor,
  Moon,
  Plug,
  RotateCcw,
  ScrollText,
  ServerCog,
  Sun,
  TramFront,
  Trash,
  Upload,
  Zap,
} from 'lucide-react';
import type { WalkSpeed } from '../../types';
import { formatReminder } from '../../lib/calendarExport';
import { formatRelative } from '../../lib/dates';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { testGolemioKey } from '../../services/api';
import { pickPersisted, useAppStore } from '../../store/appStore';
import { appNow, useClockStore } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { downloadTextFile } from '../../lib/calendarExport';
import { Button, Card, Chip, cn, Field, Segmented, Select, TextInput, Toggle } from '../ui/primitives';
import { BuildingsEditor } from './BuildingsEditor';

const REMINDER_OPTIONS = [10080, 2880, 1440, 180, 120, 60, 30];

function StatusCard({ icon: Icon, title, status, ok, detail, action }: { icon: typeof Plug; title: string; status: string; ok: boolean; detail?: string; action: ReactNode }) {
  return (
    <div className="card flex min-w-0 flex-col rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-muted ring-1 ring-line">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-semibold', ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-subtle')}>
          {ok ? <CircleCheck className="size-3.5" /> : <CircleDot className="size-3.5" />}
          {status}
        </span>
      </div>
      <p className="mt-3 text-[14px] font-semibold">{title}</p>
      <p className="mt-0.5 min-h-8 text-xs leading-relaxed text-muted">{detail}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

function SecretField({ label, value, onChange, placeholder, hint, extra }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; extra?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <TextInput type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} autoComplete="off" className="font-mono" />
        <Button size="md" variant="ghost" onClick={() => setShow((s) => !s)} className="shrink-0">
          {show ? 'Skrýt' : 'Zobrazit'}
        </Button>
        {extra}
      </div>
    </Field>
  );
}

export function IntegrationsView() {
  const settings = useAppStore((s) => s.settings);
  const milestones = useAppStore((s) => s.milestones);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setMode = useAppStore((s) => s.setMode);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const clearDemoData = useAppStore((s) => s.clearDemoData);
  const clearAllData = useAppStore((s) => s.clearAllData);
  const importBackup = useAppStore((s) => s.importBackup);
  const openConnect = useUiStore((s) => s.openConnect);
  const server = useUiStore((s) => s.server);
  const serverChecked = useUiStore((s) => s.serverChecked);
  const simulated = useClockStore((s) => s.simulated);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = appNow();
  const liveOrigin = settings.origin.live;

  const exportBackup = () => {
    const state = useAppStore.getState();
    const { golemioApiKey: _g, googleMapsApiKey: _m, anthropicApiKey: _a, moodle, ...safeSettings } = state.settings;
    void _g;
    void _m;
    void _a;
    const payload = { app: 'stihnu', version: 1, exportedAt: new Date().toISOString(), ...pickPersisted(state), settings: { ...safeSettings, moodle: moodle ? { ...moodle, token: '' } : null } };
    downloadTextFile(`stihnu-zaloha-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast.success('Záloha stažena (bez API klíčů a tokenů).');
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
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted">SIS, Moodle, harmonogram, PID Golemio a Google Kalendář</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Integrace & nastavení</h1>
        </div>
        <Button variant="primary" icon={Plug} onClick={() => openConnect('moodle')}>
          Propojit studium
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={GraduationCap}
          title="Moodle (REST API)"
          ok={Boolean(settings.moodle)}
          status={settings.moodle ? 'Propojeno' : 'Nepropojeno'}
          detail={settings.moodle ? `${settings.moodle.siteName ?? settings.moodle.baseUrl} · ${settings.moodle.stats?.courses ?? 0} kurzů · ${settings.moodle.lastSync ? formatRelative(new Date(settings.moodle.lastSync), now) : ''}` : 'Úkoly, testy, deadliny a prezentace přes token mobilní služby.'}
          action={
            <Button size="sm" onClick={() => openConnect('moodle')}>
              {settings.moodle ? 'Synchronizovat' : 'Připojit token'}
            </Button>
          }
        />
        <StatusCard
          icon={CalendarDays}
          title="SIS / Google (iCal)"
          ok={Boolean(settings.ics)}
          status={settings.ics ? 'Propojeno' : 'Nepropojeno'}
          detail={settings.ics ? `${settings.ics.label ?? 'Kalendář'} · ${settings.ics.eventCount ?? 0} akcí` : 'Rozvrh, místnosti a budovy z privátního .ics odkazu.'}
          action={
            <Button size="sm" onClick={() => openConnect('ics')}>
              {settings.ics ? 'Načíst znovu' : 'Vložit odkaz'}
            </Button>
          }
        />
        <StatusCard
          icon={ScrollText}
          title="Harmonogram & sylaby"
          ok={milestones.length > 0}
          status={milestones.length ? `${milestones.length} milníků` : 'Prázdné'}
          detail="Chytrý parser textu z webu fakulty nebo ze SISu."
          action={
            <Button size="sm" onClick={() => openConnect('parser')}>
              Otevřít parser
            </Button>
          }
        />
        <StatusCard
          icon={TramFront}
          title="PID Golemio"
          ok={Boolean(settings.golemioApiKey) || server.golemio}
          status={settings.golemioApiKey ? 'Vlastní klíč' : server.golemio ? 'Klíč na serveru' : settings.mode === 'demo' ? 'Simulace' : 'Chybí klíč'}
          detail="Odjezdy, zpoždění na minutu, klimatizace a nízkopodlažnost."
          action={
            <Button size="sm" onClick={() => document.getElementById('api-keys')?.scrollIntoView({ behavior: 'smooth' })}>
              Nastavit klíč
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Režim aplikace" icon={FlaskConical}>
          <Segmented
            value={settings.mode}
            onChange={(m) => {
              setMode(m);
              toast.info(m === 'demo' ? 'Sandbox: simulovaná data a čas.' : 'Live: skutečný čas, GPS a API.');
            }}
            options={[
              { value: 'demo', label: 'Demo / Sandbox', icon: FlaskConical },
              { value: 'live', label: 'Live API', icon: Zap },
            ]}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {settings.mode === 'demo'
              ? 'Simulace PID (tramvaje 22 a 18, metro A/B/C) s plynule se měnícím zpožděním, klimatizací a přestupy; simulovaný Moodle a ukázkový rozvrh SIS. Funguje i offline.'
              : 'Skutečný čas a GPS, odjezdy z Golemio API, trasy s přestupy přes Google Routes API, Moodle a iCal přes serverové proxy (řeší CORS).'}
          </p>
          {settings.mode === 'demo' && (
            <div className="mt-3 rounded-2xl border border-line p-3">
              <Toggle
                checked={settings.demoClock}
                onChange={(v) => {
                  updateSettings({ demoClock: v });
                  if (v) useClockStore.getState().startSimulation();
                  else useClockStore.getState().switchToRealTime();
                }}
                label="Simulované hodiny (start ve 13:05)"
                description={simulated ? 'Odpočet k semináři ve 14:00 je tak vidět kdykoli. Čas lze posouvat v hlavičce.' : 'Běží reálný čas.'}
              />
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <ServerCog className="size-3.5" aria-hidden />
            {!serverChecked
              ? 'Zjišťuji serverové funkce…'
              : server.reachable
                ? `Serverové proxy běží · klíče na serveru: ${[server.golemio && 'Golemio', server.google && 'Google', server.anthropic && 'Anthropic'].filter(Boolean).join(', ') || 'žádné'}`
                : 'Serverové proxy nedostupné (statický hosting) – Live režim potřebuje nasazení na Vercel nebo `npm run dev`.'}
          </div>
        </Card>

        <Card title="Vzhled a připomínky" icon={BellRing}>
          <Field label="Motiv">
            <Segmented
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Systém', icon: Monitor },
                { value: 'light', label: 'Světlý', icon: Sun },
                { value: 'dark', label: 'Tmavý', icon: Moon },
              ]}
            />
          </Field>
          <div className="mt-4">
            <span className="mb-1.5 block text-[13px] font-medium">Připomínky u exportovaných termínů</span>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_OPTIONS.map((m) => {
                const active = settings.reminders.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => updateSettings({ reminders: active ? settings.reminders.filter((x) => x !== m) : [...settings.reminders, m].sort((a, b) => b - a) })}
                    className={cn('rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors', active ? 'bg-accent text-accent-fg ring-transparent' : 'bg-surface text-muted ring-line-strong hover:text-fg')}
                  >
                    {formatReminder(m)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Platí pro .ics (VALARM) i zápis přes Google Calendar API.</p>
          </div>
        </Card>
      </div>

      <Card title="API klíče" icon={KeyRound} id="api-keys">
        <p className="mb-4 text-[13px] leading-relaxed text-muted">
          Klíče se ukládají jen v tomto prohlížeči a posílají se výhradně na vlastní serverové proxy této aplikace. Alternativně je nastav jako proměnné prostředí ve Vercelu (GOLEMIO_API_KEY, GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY).
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <SecretField
              label="Golemio API klíč (PID)"
              value={settings.golemioApiKey}
              onChange={(golemioApiKey) => updateSettings({ golemioApiKey })}
              placeholder="eyJhbGciOi…"
              hint={
                <>
                  Zdarma po registraci na{' '}
                  <a href="https://api.golemio.cz/api-keys" target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    api.golemio.cz
                  </a>
                  . Používá /v2/pid/departureboards, /v2/gtfs a /v2/vehiclepositions.
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
                  Otestovat
                </Button>
              }
            />
            {testResult && <p className={cn('mt-1.5 text-xs', testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{testResult.message}</p>}
          </div>
          <SecretField
            label="Google Maps API klíč (Routes API)"
            value={settings.googleMapsApiKey}
            onChange={(googleMapsApiKey) => updateSettings({ googleMapsApiKey })}
            placeholder="AIza…"
            hint="Volitelné: trasy A → B včetně přestupů (computeRoutes, režim TRANSIT). Bez klíče se hledají přímé spoje z Golemia."
          />
          <Field label="Google OAuth Client ID (Calendar API)" hint="Volitelné: přímý zápis do Google Kalendáře s připomínkami. Typ „Webová aplikace“, povol origin této aplikace.">
            <TextInput value={settings.googleOAuthClientId} onChange={(e) => updateSettings({ googleOAuthClientId: e.target.value.trim() })} placeholder="1234-abc.apps.googleusercontent.com" className="font-mono" />
          </Field>
          <SecretField
            label="Anthropic API klíč (AI parser)"
            value={settings.anthropicApiKey}
            onChange={(anthropicApiKey) => updateSettings({ anthropicApiKey })}
            placeholder="sk-ant-…"
            hint="Volitelné: zpřesnění parseru harmonogramu a sylabů pomocí Claude. Lokální parser funguje i bez něj."
          />
        </div>
      </Card>

      <Card title="Doprava a poloha" icon={TramFront}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Rezerva v učebně" hint="Kolik minut před začátkem chceš být na místě.">
            <Select value={settings.bufferMinutes} onChange={(e) => updateSettings({ bufferMinutes: Number(e.target.value) })}>
              {[0, 2, 3, 5, 7, 10, 15].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pohodlná rezerva" hint="Navíc pro „doporučený spoj“.">
            <Select value={settings.comfortMinutes} onChange={(e) => updateSettings({ comfortMinutes: Number(e.target.value) })}>
              {[4, 6, 8, 10, 15, 20].map((m) => (
                <option key={m} value={m}>
                  +{m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rychlost chůze">
            <Select value={settings.walkSpeed} onChange={(e) => updateSettings({ walkSpeed: e.target.value as WalkSpeed })}>
              <option value="slow">Pomalá (65 m/min)</option>
              <option value="normal">Běžná (80 m/min)</option>
              <option value="fast">Rychlá (95 m/min)</option>
            </Select>
          </Field>
          <Field label="Záložní poloha (Live)" hint="Když GPS není k dispozici.">
            <Select value={liveOrigin.presetId} onChange={(e) => setOrigin('live', { ...liveOrigin, presetId: e.target.value })}>
              {LOCATION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Toggle checked={liveOrigin.source === 'gps'} onChange={(v) => setOrigin('live', { ...liveOrigin, source: v ? 'gps' : 'preset' })} label="Používat GPS (Live)" description="navigator.geolocation" />
          <Toggle checked={settings.accessibleOnly} onChange={(accessibleOnly) => updateSettings({ accessibleOnly })} label="Jen nízkopodlažní spoje" description="Bezbariérové plánování." />
          <Toggle checked={settings.preferAirConditioned} onChange={(preferAirConditioned) => updateSettings({ preferAirConditioned })} label="Preferovat klimatizaci" description="Doporučí klimatizovaný vůz, je-li k dispozici." />
        </div>
      </Card>

      <BuildingsEditor />

      <Card title="Data a záloha" icon={Database}>
        <p className="mb-3 text-[13px] leading-relaxed text-muted">
          Vše je uložené lokálně (localStorage, soubory v IndexedDB) – bez účtu. Stav je připravený na synchronizaci s vlastním backendem (VITE_SYNC_URL, viz README).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={exportBackup}>
            Exportovat zálohu
          </Button>
          <Button icon={Upload} onClick={() => fileRef.current?.click()}>
            Obnovit ze zálohy
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
          <Button
            icon={RotateCcw}
            onClick={() => {
              if (window.confirm('Obnovit ukázková data? Tvoje ručně přidaná data budou nahrazena.')) {
                resetDemo(appNow());
                setMode('demo');
                toast.success('Ukázková data obnovena.');
              }
            }}
          >
            Obnovit demo data
          </Button>
          <Button
            variant="ghost"
            icon={Trash}
            onClick={() => {
              if (window.confirm('Smazat všechna ukázková data (předměty, rozvrh, materiály z dema)?')) {
                clearDemoData();
                toast.info('Ukázková data smazána.');
              }
            }}
          >
            Smazat demo data
          </Button>
          <Button
            variant="ghost"
            icon={Trash}
            className="text-red-600 hover:text-red-600"
            onClick={() => {
              if (window.confirm('Opravdu smazat VŠECHNA data v tomto zařízení?')) {
                clearAllData();
                toast.info('Data smazána.');
              }
            }}
          >
            Smazat vše
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>verze 1.0</Chip>
          <Chip>{settings.mode === 'demo' ? 'Sandbox' : 'Live'}</Chip>
        </div>
      </Card>
    </div>
  );
}
