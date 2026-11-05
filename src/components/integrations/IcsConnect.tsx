import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, CircleAlert, CircleCheck, Download, FileUp, Link2, MapPin, School } from 'lucide-react';
import type { DataSource, IcsSource } from '../../types';
import { uid } from '../../lib/id';
import { locationAliasKey } from '../../lib/buildings';
import { downloadTextFile } from '../../lib/calendarExport';
import { parseIcs } from '../../lib/ics';
import { buildIcsImport, type IcsImportPreview } from '../../lib/icsImport';
import { createApi } from '../../services/api';
import { buildDemoIcs } from '../../services/demo/samples';
import { errorMessage } from '../../services/http';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Button, Chip, cn, Field, Segmented, Select, TextInput, Toggle } from '../ui/primitives';
import { GuideStep } from './MoodleConnect';

type Source = 'sis' | 'google' | 'ics-file';

export function IcsConnect() {
  const settings = useAppStore((s) => s.settings);
  const subjects = useAppStore((s) => s.subjects);
  const events = useAppStore((s) => s.events);
  const applyIcsImport = useAppStore((s) => s.applyIcsImport);
  const setLocationAlias = useAppStore((s) => s.setLocationAlias);
  const server = useUiStore((s) => s.server);
  const closeConnect = useUiStore((s) => s.closeConnect);
  const [source, setSource] = useState<Source>('sis');
  const existingSource = settings.icsSources.find((x) => x.kind === 'sis' || x.kind === 'google');
  const [url, setUrl] = useState(existingSource?.url ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<IcsImportPreview | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [replaceDemo, setReplaceDemo] = useState(true);
  const [usedSample, setUsedSample] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasDemoEvents = events.some((e) => e.demo);

  const analyze = (text: string, origin: DataSource) => {
    const calendar = parseIcs(text);
    const result = buildIcsImport(calendar, { subjects, buildings: settings.buildings, aliases: settings.locationAliases, source: origin, now: appNow() });
    setPreview(result);
    setAliases({});
    if (result.events.length === 0) setError('V kalendáři nejsou žádné rozvrhové akce v nejbližších týdnech.');
  };

  const loadUrl = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const api = createApi(settings, server, appNow);
      const text = await api.fetchIcs(url.trim());
      setUsedSample(api.mode === 'demo');
      analyze(text, source === 'google' ? 'google' : 'sis');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (file: File) => {
    setError(null);
    setPreview(null);
    try {
      setUsedSample(false);
      analyze(await file.text(), 'ics-file');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const doImport = () => {
    if (!preview) return;
    for (const [location, buildingId] of Object.entries(aliases)) if (buildingId) setLocationAlias(location, buildingId);
    const origin: DataSource = preview.events[0]?.source ?? 'sis';
    const replaceSources: DataSource[] = [];
    if (replaceExisting && source === 'ics-file') replaceSources.push(origin);
    if (replaceDemo && hasDemoEvents) replaceSources.push('demo');
    const kind = source === 'google' ? 'google' : 'sis';
    const known = settings.icsSources.find((x) => x.url === url.trim()) ?? (replaceExisting ? settings.icsSources.find((x) => x.kind === kind) : undefined);
    const icsSource: IcsSource | undefined =
      source === 'ics-file' || usedSample
        ? undefined
        : { id: known?.id ?? uid('ics'), kind, url: url.trim(), label: preview.calendarName, autoRefresh: true, lastSync: new Date().toISOString(), itemCount: preview.events.length };
    const events = preview.events.map((e) => {
      if (e.buildingId || !e.location) return e;
      const mapped = aliases[e.location];
      return mapped ? { ...e, buildingId: mapped } : e;
    });
    applyIcsImport({
      subjects: preview.newSubjects,
      events,
      replaceSources,
      replaceSourceId: icsSource?.id,
      source: icsSource,
      demo: usedSample,
    });
    toast.success(`Importováno ${events.length} rozvrhových akcí${preview.newSubjects.length ? ` a ${preview.newSubjects.length} nových předmětů` : ''}.`);
    closeConnect();
  };

  return (
    <div className="space-y-5">
      <Segmented
        value={source}
        onChange={(v) => {
          setSource(v);
          setPreview(null);
          setError(null);
        }}
        options={[
          { value: 'sis', label: 'SIS odkaz', icon: School },
          { value: 'google', label: 'Google Kalendář', icon: CalendarDays },
          { value: 'ics-file', label: 'Soubor .ics', icon: FileUp },
        ]}
      />

      {source === 'sis' && (
        <ol className="grid gap-3 sm:grid-cols-3">
          <GuideStep n={1} icon={School} title="Otevři rozvrh v SISu">
            V modulu <strong>Rozvrh</strong> najdi export do kalendáře (iCal / .ics).
          </GuideStep>
          <GuideStep n={2} icon={Link2} title="Zkopíruj soukromý odkaz">
            Odkaz je osobní a funguje bez přihlášení – nikomu ho neposílej.
          </GuideStep>
          <GuideStep n={3} icon={MapPin} title="Vlož ho sem">
            Z lístků vytáhnu předměty, časy a místnosti (H212 → Hollar, J3014 → Jinonice).
          </GuideStep>
        </ol>
      )}
      {source === 'google' && (
        <ol className="grid gap-3 sm:grid-cols-3">
          <GuideStep n={1} icon={CalendarDays} title="Nastavení kalendáře">
            Google Kalendář → ozubené kolo → Nastavení → vyber kalendář s rozvrhem.
          </GuideStep>
          <GuideStep n={2} icon={Link2} title="Integrovat kalendář">
            Zkopíruj <strong>Tajnou adresu ve formátu iCal</strong>.
          </GuideStep>
          <GuideStep n={3} icon={MapPin} title="Vlož odkaz">
            Události s místem se namapují na budovy pro dopravní navigátor.
          </GuideStep>
        </ol>
      )}

      {source !== 'ics-file' ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={source === 'sis' ? 'Soukromý odkaz na rozvrh (.ics)' : 'Tajná adresa iCal'} className="flex-1">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder={source === 'sis' ? 'https://is.cuni.cz/…/rozvrh.ics' : 'https://calendar.google.com/calendar/ical/…/basic.ics'} inputMode="url" />
          </Field>
          <Button variant="primary" onClick={() => void loadUrl()} loading={loading} disabled={settings.mode === 'live' && !url.trim()}>
            {settings.mode === 'demo' ? 'Načíst (ukázka)' : 'Načíst kalendář'}
          </Button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line-strong px-4 py-7 text-center hover:bg-surface-2">
            <FileUp className="mb-2 size-7 text-subtle" aria-hidden />
            <span className="text-sm font-medium">Vyber exportovaný soubor .ics</span>
            <span className="mt-1 text-xs text-muted">Zpracuje se přímo v prohlížeči – nikam se neodesílá.</span>
          </button>
          <input ref={fileRef} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])} />
          <Button size="sm" variant="ghost" icon={Download} className="mt-2" onClick={() => downloadTextFile('ukazkovy-rozvrh-sis.ics', buildDemoIcs(appNow()), 'text/calendar')}>
            Stáhnout ukázkový .ics na vyzkoušení
          </Button>
        </div>
      )}

      {settings.mode === 'demo' && source !== 'ics-file' && (
        <p className="rounded-2xl bg-sand/15 px-3.5 py-2.5 text-[13px] text-clay">
          V ukázce se načte vzorový rozvrh ze SISu. S vlastními daty se kalendář stáhne přes server aplikace.
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 text-[13px] text-red-600 dark:text-red-400">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {preview && preview.events.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="glass rounded-2xl p-3">
              <p className="text-xl font-semibold tabular">{preview.events.length}</p>
              <p className="text-xs text-muted">rozvrhových akcí</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="text-xl font-semibold tabular">{preview.newSubjects.length}</p>
              <p className="text-xs text-muted">nových předmětů</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="text-xl font-semibold tabular">{preview.resolvedLocations.length}</p>
              <p className="text-xs text-muted">míst namapováno</p>
            </div>
          </div>

          {preview.newSubjects.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">Nové předměty</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.newSubjects.map((s) => (
                  <Chip key={s.id}>
                    {s.code ? `${s.code} · ` : ''}
                    {s.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">Místnosti → budovy pro dopravní navigátor</p>
            <ul className="space-y-1 text-[13px]">
              {preview.resolvedLocations.map((l) => (
                <li key={l.location} className="flex items-center gap-2">
                  <CircleCheck className="size-4 shrink-0 text-emerald-500" aria-hidden />
                  <span className="truncate">{l.location}</span>
                  <span className="text-subtle">→</span>
                  <span className="font-medium">
                    {l.building}
                    {l.room ? ` (${l.room})` : ''}
                  </span>
                </li>
              ))}
              {preview.unresolvedLocations.map((location) => (
                <li key={location} className="flex flex-wrap items-center gap-2">
                  <CircleAlert className="size-4 shrink-0 text-orange-500" aria-hidden />
                  <span className="truncate">{location}</span>
                  <Select
                    className={cn('h-8 w-56 text-xs', aliases[location] && 'ring-1 ring-emerald-500')}
                    value={aliases[location] ?? settings.locationAliases[locationAliasKey(location)] ?? ''}
                    onChange={(e) => setAliases((a) => ({ ...a, [location]: e.target.value }))}
                    aria-label={`Budova pro ${location}`}
                  >
                    <option value="">Přiřadit budovu…</option>
                    {settings.buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1 rounded-2xl border border-line p-3">
            <Toggle checked={replaceExisting} onChange={setReplaceExisting} label="Nahradit dřívější import ze stejného zdroje" description="Synchronizace: rozvrh z kalendáře je zdrojem pravdy, nic se nezdvojí." />
            {hasDemoEvents && <Toggle checked={replaceDemo} onChange={setReplaceDemo} label="Nahradit ukázkový rozvrh" description="Odstraní demo lístky; povinnosti a materiály zůstanou." />}
          </div>

          <div className="flex justify-end">
            <Button variant="primary" onClick={doImport}>
              Importovat rozvrh
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
