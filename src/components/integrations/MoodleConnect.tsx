import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CircleCheck, Copy, ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, LogIn, RefreshCw, Settings2, Unplug } from 'lucide-react';
import { formatRelative } from '../../lib/dates';
import { createApi } from '../../services/api';
import { errorMessage } from '../../services/http';
import { normalizeMoodleUrl } from '../../services/moodle';
import { syncMoodle, type MoodleSyncProgress, type MoodleSyncResult, type MoodleSyncStep } from '../../services/moodleSync';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { navigateTo } from '../../hooks/useAppShell';
import { Button, Chip, cn, Field, TextInput } from '../ui/primitives';

const STEPS: { step: MoodleSyncStep; label: string }[] = [
  { step: 'site', label: 'Ověření tokenu (core_webservice_get_site_info)' },
  { step: 'courses', label: 'Zapsané předměty (core_enrol_get_users_courses)' },
  { step: 'assignments', label: 'Odevzdávárny a deadliny (mod_assign_get_assignments)' },
  { step: 'events', label: 'Testy a termíny (core_calendar_get_action_events_by_timesort)' },
  { step: 'contents', label: 'Prezentace a PDF (core_course_get_contents)' },
];

const ORDER: MoodleSyncStep[] = ['site', 'courses', 'assignments', 'events', 'contents', 'done'];

export function GuideStep({ n, icon: Icon, title, children }: { n: number; icon: typeof LogIn; title: string; children: ReactNode }) {
  return (
    <li className="glass relative min-w-0 rounded-2xl p-3.5">
      <span className="absolute right-3 top-3 font-mono text-[11px] font-semibold text-subtle">0{n}</span>
      <span className="mb-2 grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <p className="text-[13.5px] font-semibold">{title}</p>
      <div className="mt-1 text-[12.5px] leading-relaxed text-muted">{children}</div>
    </li>
  );
}

export function MoodleConnect() {
  const settings = useAppStore((s) => s.settings);
  const subjects = useAppStore((s) => s.subjects);
  const requirements = useAppStore((s) => s.requirements);
  const materials = useAppStore((s) => s.materials);
  const applyMoodleSync = useAppStore((s) => s.applyMoodleSync);
  const disconnectMoodle = useAppStore((s) => s.disconnectMoodle);
  const server = useUiStore((s) => s.server);
  const closeConnect = useUiStore((s) => s.closeConnect);
  const [baseUrl, setBaseUrl] = useState(settings.moodle?.baseUrl ?? 'https://dl1.cuni.cz');
  const [token, setToken] = useState(settings.moodle?.token ?? (settings.mode === 'demo' ? 'demo0000demo0000demo0000demo0000' : ''));
  const [reveal, setReveal] = useState(false);
  const [progress, setProgress] = useState<MoodleSyncProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MoodleSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalized = normalizeMoodleUrl(baseUrl || 'https://dl1.cuni.cz');
  const currentStep = progress.at(-1)?.step;

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress([]);
    try {
      const api = createApi(settings, server, appNow);
      const client = api.moodle(normalized, token);
      const res = await syncMoodle(client, { subjects, requirements, materials }, appNow(), (p) => setProgress((prev) => [...prev, p]));
      applyMoodleSync(res, { baseUrl: normalized, token: token.trim() }, client.isDemo);
      setResult(res);
      toast.success(`Moodle synchronizován: ${res.stats.courses} předmětů, ${res.stats.newRequirements} nových úkolů, ${res.stats.newMaterials} nových materiálů.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const stepState = (step: MoodleSyncStep): 'done' | 'active' | 'pending' => {
    if (result) return 'done';
    if (!currentStep) return 'pending';
    const ci = ORDER.indexOf(currentStep);
    const si = ORDER.indexOf(step);
    if (si < ci) return 'done';
    if (si === ci) return running ? 'active' : 'done';
    return 'pending';
  };
  const countFor = (step: MoodleSyncStep) => [...progress].reverse().find((p) => p.step === step && p.count !== undefined)?.count;

  return (
    <div className="space-y-5">
      <ol className="grid gap-3 sm:grid-cols-3">
        <GuideStep n={1} icon={LogIn} title="Otevři Moodle">
          Přihlas se do Moodlu své fakulty (na UK typicky{' '}
          <a href={normalized} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
            {normalized.replace(/^https:\/\//, '')}
          </a>
          ).
        </GuideStep>
        <GuideStep n={2} icon={Settings2} title="Předvolby → Klíče zabezpečení">
          Profil vpravo nahoře → <strong>Předvolby</strong> → <strong>Klíče zabezpečení</strong>.{' '}
          <a href={`${normalized}/user/managetoken.php`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
            Otevřít přímo <ExternalLink className="size-3" />
          </a>
        </GuideStep>
        <GuideStep n={3} icon={Copy} title="Zkopíruj klíč">
          U služby <strong>Moodle mobile web service</strong> zkopíruj klíč (32 znaků) a vlož ho níže.
        </GuideStep>
      </ol>

      {settings.mode === 'demo' && (
        <p className="rounded-2xl bg-violet-500/10 px-3.5 py-2.5 text-[13px] text-violet-800 dark:text-violet-200">
          Sandbox: odpovědi Moodlu jsou simulované (stejný formát jako skutečné API), takže si celý tok vyzkoušíš bez účtu. Token „invalid“ nasimuluje chybu.
        </p>
      )}

      {settings.moodle && !result && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5">
          <div className="min-w-0 text-[13px]">
            <p className="flex items-center gap-1.5 font-semibold">
              <CircleCheck className="size-4 text-emerald-500" aria-hidden />
              Propojeno: {settings.moodle.siteName ?? settings.moodle.baseUrl}
            </p>
            <p className="text-muted">
              {settings.moodle.fullName ? `${settings.moodle.fullName} · ` : ''}
              {settings.moodle.lastSync ? `poslední synchronizace ${formatRelative(new Date(settings.moodle.lastSync), appNow())}` : ''}
            </p>
          </div>
          <Button size="sm" variant="ghost" icon={Unplug} onClick={() => disconnectMoodle()}>
            Odpojit
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
        <Field label="Adresa Moodlu">
          <TextInput value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://dl1.cuni.cz" inputMode="url" />
        </Field>
        <Field label="Klíč (wstoken)" hint="Zůstává jen v tomto prohlížeči; na server jde jen jako parametr volání Moodle API.">
          <div className="relative">
            <TextInput type={reveal ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="32 znaků, např. 1a2b3c…" className="pr-10 font-mono" autoComplete="off" />
            <button type="button" onClick={() => setReveal((r) => !r)} className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-fg" aria-label={reveal ? 'Skrýt klíč' : 'Zobrazit klíč'}>
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={settings.moodle ? RefreshCw : KeyRound} onClick={() => void run()} loading={running} disabled={!token.trim()}>
          {settings.moodle ? 'Synchronizovat znovu' : 'Připojit a načíst studium'}
        </Button>
        {error && <span className="text-[13px] text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {(running || progress.length > 0) && (
        <ul className="space-y-1.5 rounded-2xl border border-line p-3">
          {STEPS.map(({ step, label }) => {
            const state = stepState(step);
            const count = countFor(step);
            return (
              <motion.li key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('flex items-center gap-2.5 text-[13px]', state === 'pending' && 'text-subtle')}>
                {state === 'done' ? <CircleCheck className="size-4 text-emerald-500" aria-hidden /> : state === 'active' ? <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden /> : <span className="size-4 rounded-full border border-line-strong" />}
                <span className="min-w-0 flex-1">{label}</span>
                {count !== undefined && <Chip>{count}</Chip>}
              </motion.li>
            );
          })}
        </ul>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4">
          <p className="font-semibold">Hotovo – vítej, {result.site.firstname ?? result.site.fullname}! 🎓</p>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {[
              { n: result.stats.courses, label: 'předmětů', extra: result.stats.newSubjects ? `${result.stats.newSubjects} nový` : 'spárováno' },
              { n: result.stats.requirements, label: 'úkolů a testů', extra: `${result.stats.newRequirements} nových` },
              { n: result.stats.materials, label: 'materiálů', extra: `${result.stats.newMaterials} nových` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface p-2.5 ring-1 ring-line">
                <p className="text-xl font-semibold tabular">{s.n}</p>
                <p className="text-xs text-muted">{s.label}</p>
                <p className="text-[11px] text-subtle">{s.extra}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                closeConnect();
                navigateTo('predmety');
              }}
            >
              Zobrazit předměty
            </Button>
            <Button size="sm" variant="ghost" onClick={closeConnect}>
              Zavřít
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
