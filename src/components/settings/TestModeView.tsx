/**
 * Testovací režim (jen účet správce): čas, poloha, chůze v navigaci, počasí
 * a nástroje. Platí jen v tomto zařízení a nic se nikam neposílá – ostatní
 * uživatelé ho nevidí.
 */
import { useState, type ReactNode } from 'react';
import { navigateTo } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { myBuildings } from '../../lib/campus';
import { formatTime } from '../../lib/dates';
import { forceSync, useAccount } from '../../services/account';
import { geocode, type Place } from '../../services/journey';
import { useLeaveStore } from '../../services/leaveBadge';
import { useAppStore } from '../../store/appStore';
import { useClockStore } from '../../store/clockStore';
import { upcomingEvents } from '../../store/selectors';
import { activeSimulations, useTestStore, type SimWeather } from '../../store/testStore';
import { toast, useUiStore } from '../../store/uiStore';
import { showNotification } from '../notifications/AlertsCenter';
import { GlyphTile, type GlyphName } from '../ui/Glyph';
import { Button, cn, Segmented, TextInput, Toggle } from '../ui/primitives';

function Panel({ glyph, title, status, children }: { glyph: GlyphName; title: string; status?: ReactNode; children: ReactNode }) {
  return (
    <section className="card rounded-[24px] p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-3">
        <GlyphTile name={glyph} size={40} />
        <h2 className="min-w-0 flex-1 text-[17px] font-bold">{title}</h2>
        {status}
      </header>
      {children}
    </section>
  );
}

function StatusPill({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold', on ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-surface-2 text-muted')}>{children}</span>;
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-fg ring-line-strong hover:bg-surface-2')}>
      {children}
    </button>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/* ------------------------------------------------------------------ */
/* Čas                                                                 */
/* ------------------------------------------------------------------ */

const SHIFTS: [number, string][] = [
  [-60, '−1 h'],
  [-15, '−15 min'],
  [5, '+5 min'],
  [15, '+15 min'],
  [60, '+1 h'],
  [1440, '+1 den'],
];

function TimePanel() {
  const demo = useAppStore((s) => s.settings.mode === 'demo');
  const events = useAppStore((s) => s.events);
  const simulated = useClockStore((s) => s.simulated);
  const speed = useClockStore((s) => s.speed);
  const leaveAt = useLeaveStore((s) => s.leaveAt);
  const saveClock = useTestStore((s) => s.saveClock);
  const now = useNow(1000);
  const [value, setValue] = useState(() => toLocalInput(now));
  const clock = useClockStore.getState;
  const apply = (fn: () => void) => {
    fn();
    saveClock();
  };
  const next = upcomingEvents(events, now).next;
  const nextStart = next ? new Date(next.start) : null;
  const leave = leaveAt ? new Date(leaveAt) : null;
  const jumps: { label: string; at: Date }[] = [];
  if (nextStart) {
    jumps.push({ label: '3 h před další výukou', at: new Date(nextStart.getTime() - 3 * 3_600_000) });
    jumps.push({ label: '45 min před další výukou', at: new Date(nextStart.getTime() - 45 * 60_000) });
  }
  if (leave && leave.getTime() > now.getTime()) jumps.push({ label: '2 min před odchodem', at: new Date(leave.getTime() - 2 * 60_000) });
  const morning = new Date(now);
  morning.setDate(morning.getDate() + 1);
  morning.setHours(7, 30, 0, 0);
  jumps.push({ label: 'Zítra 7:30', at: morning });
  const evening = new Date(now);
  evening.setHours(evening.getHours() >= 20 ? 24 + 20 : 20, 0, 0, 0);
  jumps.push({ label: 'Večer 20:00', at: evening });

  if (demo) {
    return (
      <Panel glyph="clock" title="Čas">
        <p className="text-[14px] leading-relaxed text-muted">V ukázce běží její vlastní hodiny – ovládáte je v pruhu Ukázka nahoře. Simulovaný čas pro vlastní data zapnete po přepnutí na Moje data.</p>
      </Panel>
    );
  }

  return (
    <Panel glyph="clock" title="Čas" status={<StatusPill on={simulated}>{simulated ? (speed > 1 ? `simulovaný · ${speed}×` : 'simulovaný') : 'reálný'}</StatusPill>}>
      <p className="font-display text-[40px] leading-none tabular">
        {formatTime(now)}
        <span className="text-[24px] text-subtle">:{pad(now.getSeconds())}</span>
      </p>
      <p className="mt-1 text-[13px] text-muted">{now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {SHIFTS.map(([m, label]) => (
          <Chip key={m} onClick={() => apply(() => clock().shiftMinutes(m))}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {jumps.map((j) => (
          <Chip key={j.label} onClick={() => apply(() => clock().setNow(j.at))}>
            {j.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0">
          <span className="mb-1 block text-[12.5px] font-semibold text-muted">Přesný čas</span>
          <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 rounded-full bg-surface-2 px-3.5 text-[14px] ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-accent" />
        </label>
        <Button
          onClick={() => {
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return toast.error('Neplatný čas.');
            apply(() => clock().setNow(d));
          }}
        >
          Nastavit
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13.5px] font-semibold">Rychlost</span>
        <Segmented
          value={String(speed)}
          onChange={(v) => apply(() => clock().setSpeed(Number(v)))}
          size="sm"
          options={[
            { value: '1', label: '1×' },
            { value: '10', label: '10×' },
            { value: '60', label: '60×' },
          ]}
        />
      </div>
      <p className="mt-1.5 text-[12px] text-subtle">60× = minuta za sekundu. Po načtení stránky simulovaný čas pokračuje, dokud ho nevypnete.</p>

      {simulated && (
        <Button variant="ghost" className="mt-3" onClick={() => apply(() => clock().switchToRealTime())}>
          Zpět na reálný čas
        </Button>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Poloha                                                              */
/* ------------------------------------------------------------------ */

function GpsPanel() {
  const gps = useTestStore((s) => s.gps);
  const setGps = useTestStore((s) => s.setGps);
  const settings = useAppStore((s) => s.settings);
  const buildings = myBuildings(settings);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      const found = await geocode(q.trim());
      setResults(found.slice(0, 6));
      if (found.length === 0) toast.info('Nic jsem nenašel.');
    } catch {
      toast.error('Hledání adresy se nepovedlo.');
    } finally {
      setBusy(false);
    }
  };
  const pick = (label: string, lat: number, lng: number) => {
    setGps({ label, lat, lng });
    setResults([]);
    toast.success(`Poloha: ${label}`);
  };
  const near = (lat: number, lng: number) => Boolean(gps && Math.abs(gps.lat - lat) < 1e-5 && Math.abs(gps.lng - lng) < 1e-5);

  return (
    <Panel glyph="crosshair" title="Poloha" status={<StatusPill on={Boolean(gps)}>{gps ? 'simulovaná' : 'skutečná'}</StatusPill>}>
      <p className="text-[13.5px] leading-relaxed text-muted">
        {gps ? (
          <>
            Aplikace si myslí, že jste: <strong className="text-fg">{gps.label}</strong> ({gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}). Platí pro výchozí místo cesty, navigaci, menzu i počasí.
          </>
        ) : (
          'Vyberte místo – nahradí GPS všude v aplikaci (výchozí místo cesty, navigace, menza, počasí).'
        )}
      </p>
      {buildings.length > 0 && (
        <>
          <p className="eyebrow mb-1.5 mt-4 text-subtle">Moje budovy</p>
          <div className="flex flex-wrap gap-1.5">
            {buildings.map((b) => (
              <Chip key={b.id} active={near(b.coords.lat, b.coords.lng)} onClick={() => pick(b.name, b.coords.lat, b.coords.lng)}>
                {b.name}
              </Chip>
            ))}
          </div>
        </>
      )}
      <p className="eyebrow mb-1.5 mt-4 text-subtle">Praha</p>
      <div className="flex flex-wrap gap-1.5">
        {LOCATION_PRESETS.map((p) => (
          <Chip key={p.id} active={near(p.coords.lat, p.coords.lng)} onClick={() => pick(p.label, p.coords.lat, p.coords.lng)}>
            {p.label}
          </Chip>
        ))}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adresa, zastávka nebo místo" className="min-w-0 flex-1" />
        <Button type="submit" loading={busy}>
          Najít
        </Button>
      </form>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-[16px] ring-1 ring-inset ring-line">
          {results.map((r) => (
            <li key={`${r.label}-${r.coords.lat}`}>
              <button type="button" onClick={() => pick(r.label, r.coords.lat, r.coords.lng)} className="block w-full px-3.5 py-2.5 text-left hover:bg-surface-2">
                <span className="block text-[14px] font-semibold">{r.label}</span>
                {r.detail && <span className="block text-[12.5px] text-muted">{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {gps && (
        <Button variant="ghost" className="mt-3" onClick={() => setGps(null)}>
          Zpět na skutečnou polohu
        </Button>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Chůze v navigaci                                                    */
/* ------------------------------------------------------------------ */

function WalkPanel() {
  const walkSim = useTestStore((s) => s.walkSim);
  const walkSpeed = useTestStore((s) => s.walkSpeed);
  const setWalkSim = useTestStore((s) => s.setWalkSim);
  return (
    <Panel glyph="walk" title="Chůze v navigaci" status={<StatusPill on={walkSim}>{walkSim ? 'simulovaná' : 'podle GPS'}</StatusPill>}>
      <Toggle checked={walkSim} onChange={(v) => setWalkSim(v)} label="Chodec jde po trase sám" description="Navigace se pohybuje po skutečné pěší trase – vyzkoušíte pokyny, přechody i vstupy do metra bez chození." />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13.5px] font-semibold">Rychlost chůze</span>
        <Segmented
          value={String(walkSpeed)}
          onChange={(v) => setWalkSim(walkSim, Number(v))}
          size="sm"
          options={[
            { value: '1.4', label: 'Běžná' },
            { value: '4', label: '3× rychleji' },
            { value: '12', label: 'Přetočit' },
          ]}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Počasí                                                              */
/* ------------------------------------------------------------------ */

const WEATHER_PRESETS: SimWeather[] = [
  { code: 0, temp: 24, feels: 25, precipProb: 0, label: 'Jasno, 24 °C' },
  { code: 3, temp: 12, feels: 10, precipProb: 10, label: 'Zataženo, 12 °C' },
  { code: 63, temp: 9, feels: 6, precipProb: 90, label: 'Déšť, 9 °C' },
  { code: 95, temp: 19, feels: 19, precipProb: 85, label: 'Bouřka, 19 °C' },
  { code: 73, temp: -2, feels: -6, precipProb: 80, label: 'Sněžení, −2 °C' },
  { code: 1, temp: -11, feels: -16, precipProb: 0, label: 'Mráz, −11 °C' },
  { code: 0, temp: 33, feels: 35, precipProb: 0, label: 'Vedro, 33 °C' },
  { code: 45, temp: 6, feels: 3, precipProb: 20, label: 'Mlha, 6 °C' },
];

function WeatherPanel() {
  const weather = useTestStore((s) => s.weather);
  const setWeather = useTestStore((s) => s.setWeather);
  return (
    <Panel glyph="weather" title="Počasí" status={<StatusPill on={Boolean(weather)}>{weather ? weather.label : 'skutečné'}</StatusPill>}>
      <p className="text-[13.5px] leading-relaxed text-muted">Nahradí předpověď na celý den – karta počasí, rada k oblečení a fotka na hlavní stránce se přizpůsobí.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {WEATHER_PRESETS.map((w) => (
          <Chip key={w.label} active={weather?.label === w.label} onClick={() => setWeather(w)}>
            {w.label}
          </Chip>
        ))}
      </div>
      {weather && (
        <Button variant="ghost" className="mt-3" onClick={() => setWeather(null)}>
          Zpět na skutečné počasí
        </Button>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Nástroje                                                            */
/* ------------------------------------------------------------------ */

async function clearCachesAndReload() {
  try {
    if ('caches' in window) for (const key of await caches.keys()) await caches.delete(key);
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    for (const r of regs) await r.unregister();
  } finally {
    window.location.reload();
  }
}

function ToolsPanel() {
  const accountStatus = useAccount((s) => s.status);
  const server = useUiStore((s) => s.server);
  const mode = useAppStore((s) => s.settings.mode);
  const subjects = useAppStore((s) => s.subjects.length);
  const events = useAppStore((s) => s.events.length);
  const tasks = useAppStore((s) => s.tasks.length + s.requirements.length);
  const tour = () => {
    navigateTo('dnes');
    setTimeout(() => useUiStore.getState().startTour(), 350);
  };
  const notify = async () => {
    if (!('Notification' in window)) return toast.error('Tento prohlížeč upozornění neumí.');
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return toast.error('Upozornění nejsou povolená.');
    await showNotification('Stihnuto · test', `Zkušební upozornění ${formatTime(new Date())}`, `stihnuto-test-${Date.now()}`);
  };
  const rows: [string, string][] = [
    ['Režim', mode === 'demo' ? 'ukázka' : 'moje data'],
    ['Účet', accountStatus],
    ['Server', server.reachable ? 'dostupný' : 'nedostupný'],
    ['Účty na serveru', server.account ? (server.accountSchema === 'ok' ? 'připravené' : 'chybí databáze') : 'vypnuté'],
    ['AI', server.aiProvider ?? 'žádná'],
    ['Google', server.googleServerFlow ? 'trvalé přihlášení' : server.googleClientId ? 'jen v prohlížeči' : 'nenastaveno'],
    ['Data', `${subjects} předmětů · ${events} událostí · ${tasks} úkolů a termínů`],
  ];
  return (
    <Panel glyph="sliders" title="Nástroje">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => useUiStore.setState((s) => ({ introTick: s.introTick + 1 }))}>Přehrát úvodní animaci</Button>
        <Button onClick={tour}>Krátká prohlídka</Button>
        <Button onClick={() => useUiStore.getState().openSetup('start')}>Průvodce nastavením</Button>
        <Button onClick={() => void notify()}>Zkušební upozornění</Button>
        {accountStatus === 'ready' && (
          <Button onClick={() => void forceSync().then(() => toast.success('Účet je synchronizovaný.'), (e: unknown) => toast.error(e instanceof Error ? e.message : 'Synchronizace se nepovedla.'))}>Synchronizovat účet</Button>
        )}
        <Button variant="ghost" onClick={() => void clearCachesAndReload()}>
          Vymazat mezipaměť a načíst znovu
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-4 gap-y-1.5 rounded-[16px] bg-surface-2 p-3.5 text-[13px] sm:grid-cols-[auto_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-muted">{k}</dt>
            <dd className="min-w-0 break-words font-mono text-[12.5px]">{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Stránka                                                             */
/* ------------------------------------------------------------------ */

export function TestModeView() {
  const tests = useTestStore();
  const sims = activeSimulations(tests);
  return (
    <div className="space-y-4">
      <div className={cn('flex flex-wrap items-center gap-3 rounded-[22px] p-4 ring-1 ring-inset', sims.length ? 'bg-amber-500/10 ring-amber-500/30' : 'bg-surface-2 ring-line')}>
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
          <strong>{sims.length ? `Běží simulace: ${sims.join(', ')}.` : 'Nic se nesimuluje.'}</strong> Jen pro váš účet a jen v tomto zařízení – nic se nikam neposílá a ostatní uživatelé nic z toho nevidí.
        </p>
        {sims.length > 0 && (
          <Button
            variant="primary"
            onClick={() => {
              tests.reset();
              toast.success('Všechny simulace jsou vypnuté.');
            }}
          >
            Vypnout vše
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TimePanel />
        <GpsPanel />
        <WalkPanel />
        <WeatherPanel />
      </div>
      <ToolsPanel />
    </div>
  );
}
