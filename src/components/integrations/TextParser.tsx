import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, ClipboardPaste, Sparkles, Wand, WandSparkles } from 'lucide-react';
import type { Milestone, MilestoneCategory, Requirement, RequirementType } from '../../types';
import { milestoneToCalendarItem, requirementToCalendarItem, downloadIcs, type CalendarItem } from '../../lib/calendarExport';
import { academicYearStart, endOfDay, formatDayMonth, formatTime, fromDateKey, isDateKey, toDate } from '../../lib/dates';
import { insertGoogleEvents } from '../../lib/googleCalendar';
import { uid } from '../../lib/id';
import { defaultSubtasks, guessRequirementType, REQUIREMENT_TYPE_LABELS } from '../../lib/progress';
import { CATEGORY_LABELS, parseScheduleText, type ParseMode, type ParsedItem } from '../../lib/scheduleTextParser';
import { createApi } from '../../services/api';
import { sampleHarmonogram, sampleSyllabus } from '../../services/demo/samples';
import { errorMessage } from '../../services/http';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { toast, useUiStore } from '../../store/uiStore';
import { resolveClientId } from '../../services/google/auth';
import { Button, Checkbox, Chip, cn, Field, Segmented, Select, TextArea, TextInput } from '../ui/primitives';

function itemDateLabel(item: ParsedItem): string {
  if (!item.start) return 'bez data';
  const start = toDate(item.start);
  const startLabel = item.allDay ? formatDayMonth(start) : `${formatDayMonth(start)} ${formatTime(start)}`;
  if (!item.end) return `${startLabel} ${start.getFullYear()}`;
  const end = toDate(item.end);
  return `${startLabel} – ${item.allDay ? formatDayMonth(end) : formatTime(end)} ${end.getFullYear()}`;
}

export function TextParser({ initialSubjectId }: { initialSubjectId?: string }) {
  const settings = useAppStore((s) => s.settings);
  const subjects = useAppStore((s) => s.subjects);
  const milestones = useAppStore((s) => s.milestones);
  const addMilestones = useAppStore((s) => s.addMilestones);
  const addRequirements = useAppStore((s) => s.addRequirements);
  const server = useUiStore((s) => s.server);
  const closeConnect = useUiStore((s) => s.closeConnect);
  const googleClientId = resolveClientId(settings.google.clientId || settings.googleOAuthClientId, server.googleClientId);
  const [mode, setMode] = useState<ParseMode>(initialSubjectId ? 'syllabus' : 'harmonogram');
  const [text, setText] = useState('');
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? subjects[0]?.id ?? '');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [engine, setEngine] = useState<'local' | 'ai'>('local');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = appNow();

  const teachingStart = useMemo(() => {
    const ay = academicYearStart(now);
    const teaching = milestones
      .filter((m) => m.category === 'teaching' && isDateKey(m.start) && fromDateKey(m.start).getFullYear() === ay)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    return teaching?.start;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones]);

  const api = useMemo(() => createApi(settings, server, appNow), [settings, server]);

  // Lokální parser běží okamžitě při psaní.
  useEffect(() => {
    if (engine === 'ai') return;
    const handle = window.setTimeout(() => {
      if (!text.trim()) {
        setItems([]);
        return;
      }
      setItems(parseScheduleText(text, { mode, referenceDate: appNow(), teachingStart }).items);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [text, mode, teachingStart, engine]);

  const stats = useMemo(() => (text.trim() ? parseScheduleText(text, { mode, referenceDate: now, teachingStart }) : null), [text, mode, teachingStart]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = items.filter((i) => i.selected);
  const update = (id: string, patch: Partial<ParsedItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const runAi = async () => {
    setAiBusy(true);
    try {
      const res = await api.aiParse(text, mode, stats?.academicYearStart ?? academicYearStart(now), now);
      setItems(res.items);
      setEngine(res.engine);
      toast.success(res.engine === 'ai' ? `AI rozpoznalo ${res.items.length} položek.` : 'AI není nastavené – použit lokální parser.');
    } catch (e) {
      toast.error(`AI parser: ${errorMessage(e)} Ponechávám výsledek lokálního parseru.`);
      setEngine('local');
    } finally {
      setAiBusy(false);
    }
  };

  const toDomain = (): { milestones: Milestone[]; requirements: Requirement[] } => {
    const ms: Milestone[] = [];
    const reqs: Requirement[] = [];
    const source = engine === 'ai' ? 'ai' : 'parser';
    for (const item of selected) {
      if (mode === 'syllabus' && item.target === 'requirement' && subjectId) {
        const type: RequirementType = item.requirementType ?? guessRequirementType(item.title);
        const dueKey = item.end ?? item.start;
        const deadline = dueKey ? (isDateKey(dueKey) ? endOfDay(fromDateKey(dueKey)) : new Date(dueKey)) : undefined;
        reqs.push({
          id: uid('req'),
          subjectId,
          title: item.title,
          type,
          weight: item.weight ?? 0,
          deadline: deadline?.toISOString(),
          done: false,
          subtasks: defaultSubtasks(type, 'parser'),
          source,
          createdAt: new Date().toISOString(),
        });
      } else if (item.start) {
        ms.push({
          id: uid('ms'),
          title: item.title,
          category: item.category,
          start: item.start,
          end: item.end,
          allDay: item.allDay,
          subjectId: mode === 'syllabus' ? subjectId || undefined : undefined,
          source,
        });
      }
    }
    return { milestones: ms, requirements: reqs };
  };

  const save = async (then: 'none' | 'ics' | 'google') => {
    const { milestones: ms, requirements: reqs } = toDomain();
    if (ms.length === 0 && reqs.length === 0) {
      toast.error(mode === 'syllabus' && !subjectId ? 'Vyber předmět, ke kterému povinnosti patří.' : 'Není co uložit – vyber položky s datem.');
      return;
    }
    setSaving(true);
    try {
      addMilestones(ms);
      addRequirements(reqs);
      const subject = subjects.find((s) => s.id === subjectId);
      const calendarItems: CalendarItem[] = [
        ...ms.map((m) => milestoneToCalendarItem(m, subject)),
        ...reqs.map((r) => requirementToCalendarItem(r, subject)).filter((x): x is CalendarItem => Boolean(x)),
      ];
      if (then === 'ics') downloadIcs(mode === 'harmonogram' ? 'harmonogram' : `sylabus-${subject?.code ?? 'predmet'}`, calendarItems, { calendarName: 'Stihnu', reminders: settings.reminders });
      if (then === 'google') {
        const n = await insertGoogleEvents(googleClientId, calendarItems, settings.reminders, server.googleServerFlow);
        toast.success(`Zapsáno do Google Kalendáře: ${n} událostí s připomínkami.`);
      }
      toast.success(`Uloženo: ${ms.length} milníků${reqs.length ? ` a ${reqs.length} povinností` : ''}.`);
      closeConnect();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v);
            setEngine('local');
          }}
          options={[
            { value: 'harmonogram', label: 'Harmonogram roku' },
            { value: 'syllabus', label: 'Sylabus předmětu' },
          ]}
        />
        <Button size="sm" variant="ghost" icon={ClipboardPaste} onClick={() => { setEngine('local'); setText(mode === 'harmonogram' ? sampleHarmonogram(now) : sampleSyllabus(now)); }}>
          Vložit ukázku
        </Button>
      </div>

      {mode === 'syllabus' && (
        <Field label="Předmět" hint="Hodnocené složky se uloží jako povinnosti s vahou a checklistem, ostatní termíny jako milníky.">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code ? `${s.code} · ` : ''}
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label={mode === 'harmonogram' ? 'Text harmonogramu z webu fakulty' : 'Text sylabu / podmínek zakončení ze SISu'}
        hint="Zkopíruj celou tabulku nebo odstavec – rozpoznám 5. 10. 2026, 5.–9. 10., 5. října, „do 18. 10.“, časy i váhy v %."
      >
        <TextArea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEngine('local');
          }}
          rows={7}
          placeholder={mode === 'harmonogram' ? 'Výuka v zimním semestru: 28. 9. 2026 – 8. 1. 2027\nZkouškové období ZS: 11. 1. – 19. 2. 2027…' : 'Průběžný test (20 %) – 12. 11. 2026 v 9:40\nSeminární práce (40 %) – do 6. 12. 2026…'}
          className="font-mono text-[12.5px]"
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5">
          {engine === 'ai' ? <Sparkles className="size-3.5 text-violet-500" aria-hidden /> : <Wand className="size-3.5" aria-hidden />}
          {stats
            ? `${engine === 'ai' ? 'AI' : 'Lokální parser'}: ${items.length} položek z ${stats.stats.lines} řádků · akademický rok ${stats.academicYearStart}/${stats.academicYearStart + 1}${stats.detectedYear ? '' : ' (odhad)'}`
            : 'Výsledky se objeví hned při vložení textu.'}
        </span>
        <Button size="sm" variant="soft" icon={WandSparkles} onClick={() => void runAi()} loading={aiBusy} disabled={!text.trim()} title={api.canUseAi ? 'Zpřesnit pomocí Claude (Anthropic API)' : 'AI není nastavené – přidej Anthropic klíč v Nastavení'}>
          {api.canUseAi ? 'Zpřesnit pomocí AI' : 'AI (nenastaveno)'}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {items.length > 0 && (
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {items.map((item) => (
              <motion.li key={item.id} layout className={cn('flex flex-wrap items-center gap-2 rounded-2xl border px-2.5 py-2', item.selected ? 'border-line-strong bg-surface' : 'border-line bg-surface-2/50 opacity-70')}>
                <Checkbox checked={item.selected} onChange={() => update(item.id, { selected: !item.selected })} label={`Vybrat ${item.title}`} />
                <span className={cn('size-2 shrink-0 rounded-full', item.confidence >= 0.75 ? 'bg-emerald-500' : item.confidence >= 0.55 ? 'bg-amber-500' : 'bg-zinc-400')} title={`Jistota rozpoznání ${Math.round(item.confidence * 100)} %`} />
                <TextInput value={item.title} onChange={(e) => update(item.id, { title: e.target.value })} className="h-8 min-w-40 flex-1 text-[13px]" aria-label="Název" title={item.sourceLine} />
                <span className="w-40 shrink-0 text-[12.5px] font-medium tabular text-muted">{itemDateLabel(item)}</span>
                {item.start && item.allDay && (
                  <TextInput type="date" value={item.start.slice(0, 10)} onChange={(e) => e.target.value && update(item.id, { start: e.target.value })} className="h-8 w-36 text-xs" aria-label="Datum" />
                )}
                {mode === 'syllabus' && (
                  <Select value={item.target} onChange={(e) => update(item.id, { target: e.target.value as ParsedItem['target'] })} className="h-8 w-32 text-xs" aria-label="Uložit jako">
                    <option value="requirement">Povinnost</option>
                    <option value="milestone">Milník</option>
                  </Select>
                )}
                {mode === 'syllabus' && item.target === 'requirement' ? (
                  <Select value={item.requirementType ?? 'other'} onChange={(e) => update(item.id, { requirementType: e.target.value as RequirementType })} className="h-8 w-32 text-xs" aria-label="Typ">
                    {Object.entries(REQUIREMENT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Select value={item.category} onChange={(e) => update(item.id, { category: e.target.value as MilestoneCategory })} className="h-8 w-36 text-xs" aria-label="Kategorie">
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
                {item.weight !== undefined && <Chip>{item.weight} %</Chip>}
                {item.isDeadline && <Chip className="bg-red-500/12 text-red-700 dark:text-red-300">mezní termín</Chip>}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          <span className="mr-auto text-[12.5px] text-muted">Vybráno {selected.length} z {items.length}</span>
          {googleClientId && (
            <Button size="sm" icon={CalendarPlus} onClick={() => void save('google')} loading={saving} disabled={selected.length === 0}>
              Uložit + Google Kalendář
            </Button>
          )}
          <Button size="sm" icon={CalendarPlus} onClick={() => void save('ics')} disabled={selected.length === 0 || saving}>
            Uložit + stáhnout .ics
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save('none')} disabled={selected.length === 0 || saving}>
            Uložit vybrané
          </Button>
        </div>
      )}
    </div>
  );
}
