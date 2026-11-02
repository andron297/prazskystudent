import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  CloudCog,
  ExternalLink,
  FlaskConical,
  HardDrive,
  History,
  ListChecks,
  LoaderCircle,
  LogIn,
  RefreshCw,
  Unplug,
  Wand2,
} from 'lucide-react';
import type { ConflictPolicy, GoogleSyncSettings, SyncDirection } from '../../types';
import { formatReminder } from '../../lib/calendarExport';
import { addDays, atTime, formatRelative, startOfDay, toDateKey } from '../../lib/dates';
import { DEDICATED_CALENDAR_NAME, DEDICATED_TASKLIST_NAME } from '../../lib/sync/engine';
import { connectGoogle, disconnectGoogle, googleClientIdFor, runGoogleSync, useSyncStore } from '../../services/syncCenter';
import { demoBackend } from '../../services/google/session';
import type { FakeGoogleBackend } from '../../services/google/fakeBackend';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { Menu } from '../ui/overlays';
import { Button, Card, cn, Field, Segmented, Select, TextInput, Toggle } from '../ui/primitives';

const REMINDERS = [10080, 2880, 1440, 180, 120, 60, 30, 15, 10];

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn('rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-muted ring-line-strong hover:text-fg')}
    >
      {children}
    </button>
  );
}

function DirectionPicker({ value, onChange }: { value: SyncDirection; onChange: (v: SyncDirection) => void }) {
  return (
    <Segmented
      size="sm"
      value={value}
      onChange={onChange}
      options={[
        { value: 'two-way', label: 'Obousměrně', icon: RefreshCw },
        { value: 'push', label: 'Jen zapisovat', icon: ArrowUpFromLine },
        { value: 'pull', label: 'Jen číst', icon: ArrowDownToLine },
      ]}
    />
  );
}

function ServiceCard({ icon: Icon, title, enabled, onToggle, children }: { icon: typeof CalendarDays; title: string; enabled: boolean; onToggle: (v: boolean) => void; children: ReactNode }) {
  return (
    <div className={cn('rounded-[22px] p-4 ring-1 ring-inset transition', enabled ? 'bg-surface ring-line' : 'bg-surface-2/60 ring-line')}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          <span className={cn('grid size-9 place-items-center rounded-full', enabled ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-subtle')}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <span className="font-display text-[22px] leading-none">{title}</span>
        </span>
        <Toggle checked={enabled} onChange={onToggle} label={<span className="sr-only">{title}</span>} />
      </div>
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SetupGuide() {
  const g = useAppStore((s) => s.settings.google);
  const updateGoogleSettings = useAppStore((s) => s.updateGoogleSettings);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://prazskystudent.vercel.app';
  return (
    <div className="rounded-[22px] bg-surface-2 p-4">
      <p className="font-display text-[22px] leading-tight">
        Jednorázové <em className="text-moss">nastavení</em>
      </p>
      <p className="mt-1 text-[13px] text-muted">Google potřebuje vědět, že aplikace patří tobě. Zabere to asi 5 minut a dělá se jen jednou.</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
        <li>
          Otevři{' '}
          <a className="font-semibold text-accent hover:underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
            Google Cloud Console
          </a>{' '}
          a založ projekt (třeba „Stihnu“).
        </li>
        <li>
          V <strong>APIs &amp; Services → Library</strong> zapni <em>Google Calendar API</em>, <em>Google Tasks API</em> a <em>Google Drive API</em>.
        </li>
        <li>
          <strong>OAuth consent screen</strong>: typ External, stav <em>Testing</em>, do „Test users“ přidej svůj Gmail.
        </li>
        <li>
          <strong>Credentials → Create credentials → OAuth client ID</strong> → Web application. Do „Authorized JavaScript origins“ dej <code className="rounded bg-surface px-1">{origin}</code>.
        </li>
        <li>Zkopíruj Client ID sem (nebo ho nastav ve Vercelu jako VITE_GOOGLE_CLIENT_ID).</li>
      </ol>
      <Field label="OAuth Client ID" className="mt-3">
        <TextInput value={g.clientId} onChange={(e) => updateGoogleSettings({ clientId: e.target.value.trim() })} placeholder="1234567890-abc….apps.googleusercontent.com" className="font-mono text-[13px]" />
      </Field>
      <p className="mt-2 text-xs text-subtle">Volitelně: GOOGLE_CLIENT_SECRET ve Vercelu zapne trvalé přihlášení (synchronizace na pozadí bez opakovaného přihlašování).</p>
    </div>
  );
}

function DemoGooglePreview() {
  const [data, setData] = useState<ReturnType<FakeGoogleBackend['peek']>>();
  const running = useSyncStore((s) => s.running);
  useEffect(() => {
    let alive = true;
    void demoBackend().then((b) => alive && setData(b.peek()));
    return () => {
      alive = false;
    };
  }, [running]);
  const simulate = async () => {
    const backend = await demoBackend();
    const today = startOfDay(appNow());
    const peek = backend.peek();
    const target = peek.calendars.find((c) => c.summary === DEDICATED_CALENDAR_NAME) ?? peek.calendars.find((c) => c.primary);
    if (target) {
      await backend.insertEvent(target.id, { summary: 'Běh s Petrem', location: 'Ladronka', start: { dateTime: atTime(addDays(today, 1), 7, 30).toISOString() }, end: { dateTime: atTime(addDays(today, 1), 8, 30).toISOString() } });
    }
    const list = peek.lists.find((l) => l.title === DEDICATED_TASKLIST_NAME) ?? peek.lists[0];
    const open = peek.tasks.find((t) => t.listId === list?.id && t.status === 'needsAction');
    if (open && list) backend.editTask(list.id, open.id, { status: 'completed' });
    await backend.insertTask('@default', { title: 'Vyzvednout balík', status: 'needsAction', due: `${toDateKey(addDays(today, 2))}T00:00:00.000Z` });
    setData(backend.peek());
    toast.info('V simulovaném Googlu přibyla událost a úkol a jeden úkol je hotový. Synchronizuj!');
  };
  if (!data) return null;
  return (
    <div className="rounded-[22px] bg-sand/15 p-4 ring-1 ring-inset ring-sand/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-bold text-clay">
          <FlaskConical className="size-4" aria-hidden /> Simulovaný Google (Sandbox)
        </p>
        <Button size="sm" variant="sand" icon={Wand2} onClick={() => void simulate()}>
          Simulovat změnu v Googlu
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="eyebrow text-subtle">Kalendáře</p>
          <ul className="mt-1 space-y-0.5 text-[12.5px]">
            {data.calendars.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5 truncate">
                <span className="size-2 shrink-0 rounded-full" style={{ background: c.backgroundColor ?? '#888' }} />
                {c.summary} <span className="text-subtle">· {data.events.filter((e) => e.calendarId === c.id).length}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow text-subtle">Úkoly</p>
          <ul className="mt-1 space-y-0.5 text-[12.5px]">
            {data.tasks.slice(0, 6).map((t) => (
              <li key={t.id} className={cn('truncate', t.status === 'completed' && 'text-subtle line-through')}>
                {t.parent ? '↳ ' : ''}
                {t.title}
              </li>
            ))}
            {data.tasks.length > 6 && <li className="text-subtle">+ {data.tasks.length - 6} dalších</li>}
          </ul>
        </div>
        <div>
          <p className="eyebrow text-subtle">Disk</p>
          <ul className="mt-1 space-y-0.5 text-[12.5px]">
            {data.files.length === 0 && <li className="text-subtle">zatím prázdný</li>}
            {data.files.slice(0, 5).map((f) => (
              <li key={f.id} className="truncate">
                {f.appData ? '🔒 ' : f.mimeType.includes('folder') ? '📁 ' : '📄 '}
                {f.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function GoogleSection() {
  const mode = useAppStore((s) => s.settings.mode);
  const g = useAppStore((s) => s.settings.google);
  const gs = useAppStore((s) => s.googleSync[s.settings.mode]);
  const updateGoogleSettings = useAppStore((s) => s.updateGoogleSettings);
  const server = useUiStore((s) => s.server);
  const { running, phase, needsAuth, lastError, massDelete, calendars, taskLists } = useSyncStore();
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const now = useNow(30_000);
  const connected = Boolean(g.enabled && gs.connectedAt);
  const clientId = googleClientIdFor();
  const needsSetup = mode === 'live' && !clientId;
  const last = gs.history[0];

  const patch = (p: Partial<GoogleSyncSettings>) => updateGoogleSettings(p);
  const patchCal = (p: Partial<GoogleSyncSettings['calendar']>) => updateGoogleSettings({ calendar: { ...g.calendar, ...p } });
  const patchTasks = (p: Partial<GoogleSyncSettings['tasks']>) => updateGoogleSettings({ tasks: { ...g.tasks, ...p } });
  const patchDrive = (p: Partial<GoogleSyncSettings['drive']>) => updateGoogleSettings({ drive: { ...g.drive, ...p } });

  const connect = async (reconnect = false) => {
    setBusy(true);
    await connectGoogle({ reconnect });
    setBusy(false);
  };

  const writableCalendars = calendars.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer');
  const otherCalendars = calendars.filter((c) => c.summary !== DEDICATED_CALENDAR_NAME && c.id !== gs.containers.calendarId);

  return (
    <Card
      id="google"
      className="scroll-mt-24"
      eyebrow="Kalendář · Úkoly · Disk"
      title={
        <>
          Google, <em className="italic text-moss">oboustranně</em>
        </>
      }
      action={
        connected ? (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="primary" icon={running ? LoaderCircle : RefreshCw} onClick={() => void runGoogleSync({ manual: true })} disabled={running} className={running ? '[&>svg]:animate-spin' : undefined}>
              {running ? 'Synchronizuji' : 'Synchronizovat'}
            </Button>
            <Menu
              label="Odpojení"
              items={[
                { label: 'Odpojit', hint: 'Vazby zůstanou – po novém propojení nic nezdvojí', icon: Unplug, onSelect: () => void disconnectGoogle(false) },
                {
                  label: 'Odpojit a zapomenout',
                  hint: 'Smaže vazby na položky v Googlu (data v Googlu zůstanou)',
                  icon: Unplug,
                  onSelect: async () => {
                    if (await confirmAction({ title: 'Zapomenout propojení?', message: 'Při dalším propojení se položky v Googlu spárují podle značky, ale ručně upravené mohou vzniknout znovu.', confirmLabel: 'Zapomenout', tone: 'danger' })) void disconnectGoogle(true);
                  },
                },
              ]}
              trigger={(props) => (
                <button type="button" {...props} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Možnosti odpojení">
                  <ChevronDown className="size-4" />
                </button>
              )}
            />
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        {!connected && (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-[15px] leading-relaxed">
                Rozvrh, termíny i tvoje vlastní události se objeví v <strong>Google Kalendáři</strong>, úkoly v <strong>Google Úkolech</strong> a data se zálohují na <strong>Disk</strong>. Co změníš v Googlu, propíše se zpátky sem.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ChipToggle active={g.calendar.enabled} onClick={() => patchCal({ enabled: !g.calendar.enabled })}>
                  📅 Kalendář
                </ChipToggle>
                <ChipToggle active={g.tasks.enabled} onClick={() => patchTasks({ enabled: !g.tasks.enabled })}>
                  ✅ Úkoly
                </ChipToggle>
                <ChipToggle active={g.drive.enabled} onClick={() => patchDrive({ enabled: !g.drive.enabled })}>
                  💾 Disk
                </ChipToggle>
              </div>
              <Button size="lg" variant="primary" icon={busy ? LoaderCircle : LogIn} className={cn('mt-5', busy && '[&>svg]:animate-spin')} onClick={() => void connect()} disabled={busy || needsSetup || (!g.calendar.enabled && !g.tasks.enabled && !g.drive.enabled)}>
                {mode === 'demo' ? 'Propojit (simulace)' : 'Propojit s Googlem'}
              </Button>
              {mode === 'demo' ? (
                <p className="mt-2 text-xs text-subtle">V Sandboxu se propojí simulovaný Google – nic se nezapíše do tvého účtu. Naostro přepni na Live.</p>
              ) : (
                <p className="mt-2 text-xs text-subtle">
                  Aplikace žádá jen o přístup k Kalendáři, Úkolům a vlastním souborům na Disku.{server.googleServerFlow ? ' Přihlášení se drží i na pozadí.' : ''}
                </p>
              )}
            </div>
            {needsSetup ? <SetupGuide /> : mode === 'demo' ? <DemoGooglePreview /> : null}
          </div>
        )}

        {connected && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-surface-2 p-3.5">
              <span className="grid size-10 place-items-center rounded-full bg-accent font-display text-xl text-accent-fg">{(gs.account?.name ?? gs.account?.email ?? 'G').charAt(0).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">{gs.account?.name ?? 'Google účet'}</p>
                <p className="truncate text-xs text-muted">
                  {gs.account?.email}
                  {gs.lastSync ? ` · synchronizováno ${formatRelative(new Date(gs.lastSync), mode === 'demo' ? new Date() : now)}` : ''}
                </p>
              </div>
              {last && (
                <span className="flex items-center gap-2 text-xs font-semibold text-muted tabular">
                  <span title="Zapsáno do Googlu">
                    ↑ {last.pushed.created + last.pushed.updated + last.pushed.deleted}
                  </span>
                  <span title="Převzato z Googlu">
                    ↓ {last.pulled.created + last.pulled.updated + last.pulled.deleted}
                  </span>
                  {last.conflicts > 0 && <span title="Vyřešené konflikty">⚡ {last.conflicts}</span>}
                </span>
              )}
            </div>

            {running && phase && (
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden /> {phase}…
              </p>
            )}
            {needsAuth && (
              <div className="flex flex-wrap items-center gap-3 rounded-[22px] bg-amber-500/12 p-3.5 ring-1 ring-inset ring-amber-500/30">
                <CircleAlert className="size-5 text-amber-700 dark:text-amber-300" aria-hidden />
                <p className="min-w-0 flex-1 text-[13px]">Přihlášení ke Googlu vypršelo – synchronizace čeká.</p>
                <Button size="sm" variant="primary" icon={LogIn} onClick={() => void connect(true)}>
                  Přihlásit znovu
                </Button>
              </div>
            )}
            {!needsAuth && lastError && <p className="rounded-[18px] bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-300">{lastError}</p>}
            {massDelete.map((m) => (
              <div key={m.service} className="flex flex-wrap items-center gap-3 rounded-[22px] bg-amber-500/12 p-3.5 ring-1 ring-inset ring-amber-500/30">
                <CircleAlert className="size-5 text-amber-700 dark:text-amber-300" aria-hidden />
                <p className="min-w-0 flex-1 text-[13px]">
                  {m.service === 'calendar' ? 'V Kalendáři' : 'V Úkolech'} je {m.count} starých kopií (rozvrh se změnil). Smazat je z Googlu?
                </p>
                <Button size="sm" variant="primary" onClick={() => void runGoogleSync({ manual: true, allowMassDelete: true })}>
                  Smazat staré
                </Button>
                <Button size="sm" variant="ghost" onClick={() => useSyncStore.setState({ massDelete: [] })}>
                  Nechat
                </Button>
              </div>
            ))}

            <div className="grid gap-3 xl:grid-cols-3">
              <ServiceCard icon={CalendarDays} title="Kalendář" enabled={g.calendar.enabled} onToggle={(enabled) => patchCal({ enabled })}>
                <Field label="Zapisovat do">
                  <Select value={g.calendar.target} onChange={(e) => patchCal({ target: e.target.value })}>
                    <option value="dedicated">Vlastní kalendář „{DEDICATED_CALENDAR_NAME}“</option>
                    <option value="primary">Hlavní kalendář</option>
                    {writableCalendars
                      .filter((c) => !c.primary && c.summary !== DEDICATED_CALENDAR_NAME)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.summary}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold">Co zapisovat</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['classes', 'Výuka'],
                        ['exams', 'Zkoušky'],
                        ['deadlines', 'Termíny'],
                        ['milestones', 'Harmonogram'],
                        ['personal', 'Moje události'],
                      ] as const
                    ).map(([key, label]) => (
                      <ChipToggle key={key} active={g.calendar.push[key]} onClick={() => patchCal({ push: { ...g.calendar.push, [key]: !g.calendar.push[key] } })}>
                        {label}
                      </ChipToggle>
                    ))}
                  </div>
                </div>
                <DirectionPicker value={g.calendar.direction} onChange={(direction) => patchCal({ direction })} />
                <Field label="Výuku zapisovat dopředu">
                  <Select value={g.calendar.rangeWeeks} onChange={(e) => patchCal({ rangeWeeks: Number(e.target.value) })}>
                    <option value={2}>2 týdny</option>
                    <option value={6}>6 týdnů</option>
                    <option value={16}>Do konce semestru (16 týdnů)</option>
                    <option value={26}>Půl roku</option>
                  </Select>
                </Field>
                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold">Připomínka výuky</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 10, 15, 30, 60].map((m) => (
                      <ChipToggle key={m} active={g.calendar.remindersClasses.includes(m)} onClick={() => patchCal({ remindersClasses: g.calendar.remindersClasses.includes(m) ? g.calendar.remindersClasses.filter((x) => x !== m) : [...g.calendar.remindersClasses, m] })}>
                        {m === 0 ? 'Na začátku' : formatReminder(m)}
                      </ChipToggle>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold">Připomínka termínů a zkoušek</span>
                  <div className="flex flex-wrap gap-1.5">
                    {REMINDERS.filter((m) => m >= 60).map((m) => (
                      <ChipToggle key={m} active={g.calendar.remindersDeadlines.includes(m)} onClick={() => patchCal({ remindersDeadlines: g.calendar.remindersDeadlines.includes(m) ? g.calendar.remindersDeadlines.filter((x) => x !== m) : [...g.calendar.remindersDeadlines, m] })}>
                        {formatReminder(m)}
                      </ChipToggle>
                    ))}
                  </div>
                </div>
                <Toggle checked={g.calendar.colors} onChange={(colors) => patchCal({ colors })} label="Barvy předmětů" />
                {otherCalendars.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-[13px] font-semibold">Zobrazovat v aplikaci i</span>
                    <div className="flex flex-wrap gap-1.5">
                      {otherCalendars.map((c) => {
                        const value = c.primary ? 'primary' : c.id;
                        const active = g.calendar.pullCalendars.includes(value) || g.calendar.pullCalendars.includes(c.id);
                        return (
                          <ChipToggle key={c.id} active={active} onClick={() => patchCal({ pullCalendars: active ? g.calendar.pullCalendars.filter((x) => x !== value && x !== c.id) : [...g.calendar.pullCalendars, value] })}>
                            <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: c.backgroundColor ?? '#888' }} />
                            {c.primary ? 'Hlavní kalendář' : c.summary}
                          </ChipToggle>
                        );
                      })}
                    </div>
                  </div>
                )}
              </ServiceCard>

              <ServiceCard icon={ListChecks} title="Úkoly" enabled={g.tasks.enabled} onToggle={(enabled) => patchTasks({ enabled })}>
                <Field label="Seznam">
                  <Select value={g.tasks.target} onChange={(e) => patchTasks({ target: e.target.value })}>
                    <option value="dedicated">Vlastní seznam „{DEDICATED_TASKLIST_NAME}“</option>
                    <option value="@default">Moje úkoly</option>
                    {taskLists
                      .filter((l, i) => i > 0 && l.title !== DEDICATED_TASKLIST_NAME)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div>
                  <span className="mb-1.5 block text-[13px] font-semibold">Co zapisovat</span>
                  <div className="flex flex-wrap gap-1.5">
                    <ChipToggle active={g.tasks.push.personal} onClick={() => patchTasks({ push: { ...g.tasks.push, personal: !g.tasks.push.personal } })}>
                      Moje úkoly
                    </ChipToggle>
                    <ChipToggle active={g.tasks.push.requirements} onClick={() => patchTasks({ push: { ...g.tasks.push, requirements: !g.tasks.push.requirements } })}>
                      Studijní termíny
                    </ChipToggle>
                    <ChipToggle active={g.tasks.push.subtasks} onClick={() => patchTasks({ push: { ...g.tasks.push, subtasks: !g.tasks.push.subtasks } })}>
                      Podúkoly
                    </ChipToggle>
                  </div>
                </div>
                <DirectionPicker value={g.tasks.direction} onChange={(direction) => patchTasks({ direction })} />
                {taskLists.length > 1 && (
                  <div>
                    <span className="mb-1.5 block text-[13px] font-semibold">Stahovat i seznamy</span>
                    <div className="flex flex-wrap gap-1.5">
                      {taskLists
                        .filter((l) => l.title !== DEDICATED_TASKLIST_NAME && l.id !== gs.containers.taskListId)
                        .map((l, i) => {
                          const value = i === 0 && taskLists[0]?.id === l.id ? '@default' : l.id;
                          const active = g.tasks.pullLists.includes(value) || g.tasks.pullLists.includes(l.id);
                          return (
                            <ChipToggle key={l.id} active={active} onClick={() => patchTasks({ pullLists: active ? g.tasks.pullLists.filter((x) => x !== value && x !== l.id) : [...g.tasks.pullLists, value] })}>
                              {l.title}
                            </ChipToggle>
                          );
                        })}
                    </div>
                  </div>
                )}
                <Field label="Hotové úkoly z Googlu">
                  <Select value={g.tasks.keepCompletedDays} onChange={(e) => patchTasks({ keepCompletedDays: Number(e.target.value) })}>
                    <option value={0}>Nestahovat</option>
                    <option value={7}>Za poslední týden</option>
                    <option value={14}>Za 14 dní</option>
                    <option value={60}>Za 2 měsíce</option>
                  </Select>
                </Field>
              </ServiceCard>

              <ServiceCard icon={HardDrive} title="Disk" enabled={g.drive.enabled} onToggle={(enabled) => patchDrive({ enabled })}>
                <Toggle checked={g.drive.syncState} onChange={(syncState) => patchDrive({ syncState })} label="Data mezi zařízeními" description="Úkoly, předměty, poznámky i nastavení – na mobilu i v notebooku stejně." />
                <Toggle checked={g.drive.exportMaterials} onChange={(exportMaterials) => patchDrive({ exportMaterials })} label="Materiály do složky" description="Poznámky jako Google dokumenty, nahrané soubory podle předmětů." />
                {g.drive.exportMaterials && (
                  <Field label="Složka na Disku">
                    <TextInput value={g.drive.folderName} onChange={(e) => patchDrive({ folderName: e.target.value })} />
                  </Field>
                )}
                {gs.driveStateSyncedAt && <p className="text-xs text-muted">Záloha na Disku {formatRelative(new Date(gs.driveStateSyncedAt), new Date())}</p>}
              </ServiceCard>
            </div>

            <div className="rounded-[22px] bg-surface-2 p-4">
              <p className="mb-3 flex items-center gap-2 text-[13px] font-bold">
                <CloudCog className="size-4 text-moss" aria-hidden /> Pokročilé
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <Toggle checked={g.auto} onChange={(auto) => patch({ auto })} label="Automaticky na pozadí" description="Po každé změně do půl minuty a pravidelně v intervalu." />
                  <Field label="Interval">
                    <Select value={g.intervalMinutes} onChange={(e) => patch({ intervalMinutes: Number(e.target.value) })} disabled={!g.auto}>
                      {[5, 15, 30, 60, 180].map((m) => (
                        <option key={m} value={m}>
                          každých {m < 60 ? `${m} min` : `${m / 60} h`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="space-y-3">
                  <Field label="Když se změní obě strany">
                    <Segmented<ConflictPolicy>
                      size="sm"
                      value={g.conflict}
                      onChange={(conflict) => patch({ conflict })}
                      options={[
                        { value: 'newest', label: 'Novější' },
                        { value: 'app', label: 'Stihnu' },
                        { value: 'google', label: 'Google' },
                      ]}
                    />
                  </Field>
                  <Field label="Smazání" hint={g.deletions === 'mirror' ? 'Smazáno tady = smazáno v Googlu (a naopak).' : 'Smazání se nepropisuje, položka se jen odpojí.'}>
                    <Segmented
                      size="sm"
                      value={g.deletions}
                      onChange={(deletions) => patch({ deletions })}
                      options={[
                        { value: 'mirror', label: 'Promítat' },
                        { value: 'keep', label: 'Jen odpojit' },
                      ]}
                    />
                  </Field>
                </div>
              </div>
            </div>

            {gs.history.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-fg" aria-expanded={showHistory}>
                  <History className="size-4" aria-hidden /> Historie synchronizace
                  <ChevronDown className={cn('size-3.5 transition', showHistory && 'rotate-180')} aria-hidden />
                </button>
                <AnimatePresence initial={false}>
                  {showHistory && (
                    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 divide-y divide-[var(--line)] overflow-hidden rounded-[18px] bg-surface-2 text-[12.5px]">
                      {gs.history.slice(0, 8).map((r) => (
                        <li key={r.at} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3.5 py-2">
                          <span className="w-28 font-semibold tabular">{new Date(r.at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                          <span className="tabular text-muted">
                            ↑ {r.pushed.created}/{r.pushed.updated}/{r.pushed.deleted} · ↓ {r.pulled.created}/{r.pulled.updated}/{r.pulled.deleted}
                          </span>
                          <span className="text-subtle">{(r.durationMs / 1000).toFixed(1)} s</span>
                          {!r.ok && <span className="text-red-600">{r.errors[0]}</span>}
                          {r.notes.map((n) => (
                            <span key={n} className="w-full text-subtle">
                              {n}
                            </span>
                          ))}
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}
            {mode === 'demo' && <DemoGooglePreview />}
            {mode === 'live' && (
              <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-subtle hover:text-fg">
                Přístupy aplikací v účtu Google <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
