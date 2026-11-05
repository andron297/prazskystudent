/**
 * Odpočty: kolik zbývá do zkouškového, Vánoc, zkoušky nebo čehokoli
 * vlastního. Na hlavní stránce, s návrhy z harmonogramu a termínů.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, Hourglass, Plus, Trash2 } from 'lucide-react';
import type { Countdown } from '../../types';
import { addDays, calendarDayDiff, formatDayMonth, formatTime, isDateKey, plural, startOfDay, toDate, toDateKey } from '../../lib/dates';
import { uid } from '../../lib/id';
import { usePlanData } from '../../hooks/usePlanData';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Button, Card, cn, Field, TextInput, Toggle } from '../ui/primitives';

const NONE: Countdown[] = [];
const EMOJIS = ['⏳', '🎓', '📚', '📝', '🎄', '☀️', '✈️', '🎉', '🏔️', '❤️'];

function remaining(c: Countdown, now: Date): { big: string; unit: string; past: boolean } {
  const target = toDate(c.at);
  const allDay = isDateKey(c.at);
  const days = calendarDayDiff(target, now);
  if (days < 0) return { big: '✓', unit: 'proběhlo', past: true };
  if (!allDay) {
    const min = Math.round((target.getTime() - now.getTime()) / 60_000);
    if (min < 0) return { big: '✓', unit: 'proběhlo', past: true };
    if (min < 60) return { big: String(min), unit: 'min', past: false };
    if (min < 48 * 60) return { big: String(Math.floor(min / 60)), unit: plural(Math.floor(min / 60), ['hodina', 'hodiny', 'hodin']), past: false };
  }
  if (days === 0) return { big: 'Dnes', unit: '', past: false };
  if (days === 1) return { big: 'Zítra', unit: '', past: false };
  return { big: String(days), unit: plural(days, ['den', 'dny', 'dní']), past: false };
}

export function CountdownEditor() {
  const open = useUiStore((s) => s.countdownEditor);
  const close = () => useUiStore.setState({ countdownEditor: false });
  return open ? <CountdownForm onClose={close} /> : null;
}

function CountdownForm({ onClose }: { onClose: () => void }) {
  const countdowns = useAppStore((s) => s.settings.countdowns ?? NONE);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addEvent = useAppStore((s) => s.addEvent);
  const googleOn = useAppStore((s) => s.settings.google.enabled);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateKey(addDays(new Date(), 14)));
  const [time, setTime] = useState('');
  const [emoji, setEmoji] = useState('⏳');
  const [toCalendar, setToCalendar] = useState(false);

  const save = () => {
    if (!title.trim() || !date) return;
    const at = time ? new Date(`${date}T${time}:00`).toISOString() : date;
    updateSettings({ countdowns: [...countdowns, { id: uid('cd'), title: title.trim(), at, emoji, createdAt: new Date().toISOString() }] });
    if (toCalendar) {
      const start = time ? new Date(`${date}T${time}:00`) : startOfDay(new Date(`${date}T12:00:00`));
      addEvent({ title: `${emoji} ${title.trim()}`, start: start.toISOString(), end: (time ? new Date(start.getTime() + 3_600_000) : addDays(start, 1)).toISOString(), allDay: !time, kind: 'personal' });
    }
    toast.success(toCalendar ? 'Odpočet přidán a zapsán i do kalendáře.' : 'Odpočet přidán na hlavní stránku.');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nový odpočet"
      description="Zobrazí se na hlavní stránce – kolik dní zbývá."
      icon={Hourglass}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim() || !date}>
            Přidat
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Do čeho odpočítávat">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="např. Státnice, Odjezd na Erasmus, Narozeniny" autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Datum">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Čas (nepovinný)">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Symbol</p>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} aria-pressed={emoji === e} className={cn('grid size-10 place-items-center rounded-xl text-[20px] ring-1 ring-inset transition', emoji === e ? 'bg-accent-soft ring-accent' : 'ring-line hover:bg-surface-2')}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Toggle checked={toCalendar} onChange={setToCalendar} label="Zapsat i do kalendáře" description={googleOn ? 'Objeví se v Plánu i v Google Kalendáři.' : 'Objeví se v Plánu.'} />
      </div>
    </Modal>
  );
}

export function CountdownsCard() {
  const now = useNow(60_000);
  const countdowns = useAppStore((s) => s.settings.countdowns ?? NONE);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const plan = usePlanData();
  const [editing, setEditing] = useState(false);

  const list = useMemo(
    () =>
      countdowns
        .map((c) => ({ c, r: remaining(c, now) }))
        .filter(({ c, r }) => !r.past || calendarDayDiff(now, toDate(c.at)) <= 1)
        .sort((a, b) => toDate(a.c.at).getTime() - toDate(b.c.at).getTime()),
    [countdowns, now],
  );

  // Návrhy: začátek zkouškového, konec výuky, prázdniny, Vánoce a zkoušky z předmětů.
  const suggestions = useMemo(() => {
    const out: { key: string; title: string; at: string; emoji: string }[] = [];
    const today = startOfDay(now);
    for (const m of plan.milestones) {
      const start = toDate(m.start);
      if (start <= today) {
        if (m.category === 'teaching' && m.end && toDate(m.end) > today) out.push({ key: `ms-end:${m.id}`, title: `Konec: ${m.title}`, at: m.end.slice(0, 10), emoji: '📚' });
        continue;
      }
      if (m.category === 'exam-period') out.push({ key: `ms:${m.id}`, title: m.title, at: m.start.slice(0, 10), emoji: '📝' });
      if (m.category === 'holiday' && m.end) out.push({ key: `ms:${m.id}`, title: m.title, at: m.start.slice(0, 10), emoji: '☀️' });
    }
    for (const r of plan.requirements) {
      if (r.type === 'exam' && r.deadline && new Date(r.deadline) > now) out.push({ key: `req:${r.id}`, title: r.title, at: r.deadline, emoji: '🎓' });
    }
    const xmas = new Date(now.getFullYear(), 11, 24);
    if (xmas > now) out.push({ key: `xmas:${now.getFullYear()}`, title: 'Štědrý den', at: toDateKey(xmas), emoji: '🎄' });
    const used = new Set(countdowns.map((c) => c.sourceKey));
    return out.filter((s) => !used.has(s.key)).sort((a, b) => toDate(a.at).getTime() - toDate(b.at).getTime()).slice(0, 4);
  }, [plan.milestones, plan.requirements, countdowns, now]);

  const add = (s: { key: string; title: string; at: string; emoji: string }) => updateSettings({ countdowns: [...countdowns, { id: uid('cd'), title: s.title, at: s.at, emoji: s.emoji, sourceKey: s.key, createdAt: new Date().toISOString() }] });
  const remove = (id: string) => updateSettings({ countdowns: countdowns.filter((c) => c.id !== id) });

  return (
    <Card
      title="Odpočty"
      icon={Hourglass}
      action={
        <span className="flex items-center gap-1">
          {list.length > 0 && (
            <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
              {editing ? 'Hotovo' : 'Upravit'}
            </button>
          )}
          <button type="button" onClick={() => useUiStore.setState({ countdownEditor: true })} className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent hover:bg-accent/15" aria-label="Přidat odpočet">
            <Plus className="size-4" aria-hidden />
          </button>
        </span>
      }
    >
      {list.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {list.map(({ c, r }) => (
              <motion.li key={c.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative flex items-center gap-3 rounded-[20px] bg-surface-2/80 px-4 py-3">
                <span className="text-[26px] leading-none" aria-hidden>
                  {c.emoji ?? '⏳'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-display text-[32px] leading-none tabular">{r.big}</span>
                    {r.unit && <span className="text-[13px] font-semibold text-muted">{r.unit}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-semibold">{c.title}</span>
                  <span className="block text-[11.5px] text-subtle">
                    {formatDayMonth(toDate(c.at))}
                    {!isDateKey(c.at) ? ` v ${formatTime(toDate(c.at))}` : ''}
                  </span>
                </span>
                {editing && (
                  <button type="button" onClick={() => remove(c.id)} className="grid size-9 place-items-center rounded-full text-red-600 hover:bg-red-500/10" aria-label={`Smazat odpočet ${c.title}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className={cn(list.length > 0 && 'mt-3 border-t border-line pt-3')}>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">{list.length ? 'Přidat také' : 'Navrhované odpočty'}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s.key} type="button" onClick={() => add(s)} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset ring-line hover:bg-surface-2">
                <span aria-hidden>{s.emoji}</span>
                <span className="truncate">{s.title}</span>
                <span className="shrink-0 text-subtle">{formatDayMonth(toDate(s.at))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {list.length === 0 && suggestions.length === 0 && (
        <button type="button" onClick={() => useUiStore.setState({ countdownEditor: true })} className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-line-strong px-4 py-4 text-left text-[13.5px] text-muted hover:bg-surface-2">
          <CalendarPlus className="size-5 text-moss" aria-hidden /> Přidejte si odpočet – třeba do státnic nebo do odjezdu domů.
        </button>
      )}
    </Card>
  );
}
