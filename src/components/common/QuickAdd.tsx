import { useMemo, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, CornerDownLeft, Flag, GraduationCap, ListTodo, MapPin, Sparkles, X } from 'lucide-react';
import { parseQuickAdd, type QuickAddResult } from '../../lib/quickAdd';
import type { SubjectGuess } from '../../lib/subjectMatch';
import { SUBJECT_COLOR_CLASSES } from '../../lib/colors';
import { guessForText } from '../../services/subjectAssist';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { toast } from '../../store/uiStore';
import { cn } from '../ui/primitives';

const TOKEN_ICON = { date: CalendarClock, time: CalendarClock, subject: GraduationCap, place: MapPin, priority: Flag, kind: Sparkles } as const;

/** Uloží výsledek rychlého zadání; vrací popisek pro potvrzení. */
export function saveQuickAdd(result: QuickAddResult, guess?: SubjectGuess | null): string {
  const store = useAppStore.getState();
  if (result.kind === 'task') {
    const subjectId = result.subjectId ?? (guess && guess.confidence !== 'low' ? guess.subjectId : undefined);
    store.addTask({ title: result.title, due: result.due, subjectId, subjectAuto: !result.subjectId && Boolean(subjectId), priority: result.priority });
    const subject = subjectId ? store.subjects.find((s) => s.id === subjectId) : undefined;
    return `Úkol „${result.title}“ přidán${subject ? ` k předmětu ${subject.name}` : ''}`;
  }
  store.addEvent({
    title: result.title,
    start: result.start!,
    end: result.end!,
    allDay: result.allDay,
    location: result.location,
    buildingId: result.buildingId,
    subjectId: result.subjectId,
  });
  return `Událost „${result.title}“ přidána`;
}

export function QuickAdd({ autoFocus = false, onSaved, variant = 'card', initial = '' }: { autoFocus?: boolean; onSaved?: (result: QuickAddResult) => void; variant?: 'card' | 'hero'; initial?: string }) {
  const [text, setText] = useState(initial);
  const [forced, setForced] = useState<'task' | 'event' | null>(null);
  const subjects = useAppStore((s) => s.subjects);
  const buildings = useAppStore((s) => s.settings.buildings);
  const now = useNow(60_000);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const base = parseQuickAdd(text, { now: appNow(), subjects, buildings });
    if (!forced || forced === base.kind) return base;
    // Přepnutí typu: přepočítáme s výslovným prefixem.
    return parseQuickAdd(`${forced === 'task' ? 'úkol:' : 'událost:'} ${text}`, { now: appNow(), subjects, buildings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, forced, subjects, buildings, now]);

  const [dismissedGuess, setDismissedGuess] = useState<string | null>(null);
  const guess = useMemo(() => {
    if (!parsed || parsed.kind !== 'task' || parsed.subjectId) return null;
    const g = guessForText({ title: parsed.title, due: parsed.due });
    return g && g.confidence !== 'low' && g.subjectId !== dismissedGuess ? g : null;
  }, [parsed, dismissedGuess]);
  const guessSubject = guess ? subjects.find((s) => s.id === guess.subjectId) : undefined;

  const submit = () => {
    if (!parsed) return;
    const message = saveQuickAdd(parsed, guess);
    setDismissedGuess(null);
    toast.success(message);
    setText('');
    setForced(null);
    onSaved?.(parsed);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') setText('');
  };

  const hero = variant === 'hero';
  return (
    <div>
      <div className={cn('flex items-center gap-2 rounded-full pl-4 pr-1.5 ring-1 ring-inset transition focus-within:ring-2 focus-within:ring-accent', hero ? 'h-14 bg-surface ring-line-strong' : 'h-12 bg-surface-2 ring-line')}>
        <Sparkles className="size-4 shrink-0 text-moss" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          autoFocus={autoFocus}
          placeholder="Napiš úkol nebo událost… „zítra 18:00 trénink“"
          className={cn('min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle focus-visible:outline-none', hero ? 'text-[16px]' : 'text-[14.5px]')}
          aria-label="Rychle přidat úkol nebo událost"
          enterKeyHint="done"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!parsed}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent font-bold text-accent-fg transition disabled:opacity-40', hero ? 'h-11 px-4 text-[14px]' : 'h-9 px-3.5 text-[13px]')}
        >
          <CornerDownLeft className="size-3.5" aria-hidden /> Přidat
        </button>
      </div>
      <AnimatePresence initial={false}>
        {parsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-1.5 px-1 pt-2.5">
              <button
                type="button"
                onClick={() => setForced(parsed.kind === 'task' ? 'event' : 'task')}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[12px] font-bold text-accent-fg"
                title="Přepnout úkol / událost"
              >
                {parsed.kind === 'task' ? <ListTodo className="size-3.5" aria-hidden /> : <CalendarClock className="size-3.5" aria-hidden />}
                {parsed.kind === 'task' ? 'Úkol' : parsed.allDay ? 'Celodenní' : 'Událost'}
              </button>
              <span className="truncate text-[13px] font-semibold">{parsed.title}</span>
              {parsed.tokens
                .filter((t) => t.type !== 'kind')
                .map((t) => {
                  const Icon = TOKEN_ICON[t.type];
                  return (
                    <span key={`${t.type}-${t.label}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-muted ring-1 ring-inset ring-line">
                      <Icon className="size-3" aria-hidden />
                      {t.label}
                    </span>
                  );
                })}
              {guessSubject && (
                <span className={cn('inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[12px] font-bold', SUBJECT_COLOR_CLASSES[guessSubject.color].soft)} title={`Odhad ${guess!.reason}`}>
                  <Sparkles className="size-3" aria-hidden />
                  {guessSubject.code ?? guessSubject.name}
                  <button type="button" onClick={() => setDismissedGuess(guessSubject.id)} className="grid size-4 place-items-center rounded-full hover:bg-black/10" aria-label="Bez tohoto předmětu">
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              )}
              {parsed.kind === 'event' && !parsed.tokens.some((t) => t.type === 'date') && <span className="text-[12px] text-subtle">dnes</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
