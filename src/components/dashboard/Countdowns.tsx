/**
 * Odpočty: kolik zbývá do zkouškového, Vánoc, zkoušky nebo čehokoli vlastního.
 * Nejbližší je velký, s průběhem od chvíle, kdy jste ho přidali; posledních
 * 48 hodin běží živě. Návrhy z harmonogramu a termínů, 3D symboly.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Countdown } from '../../types';
import { vTime, addDays, calendarDayDiff, formatDayMonth, isDateKey, plural, startOfDay, toDate, toDateKey } from '../../lib/dates';
import { uid } from '../../lib/id';
import { usePlanData } from '../../hooks/usePlanData';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { toast, useUiStore } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Glyph } from '../ui/Glyph';
import { Button, cn, Field, TextInput, Toggle } from '../ui/primitives';

const NONE: Countdown[] = [];

interface Left {
  /** Velké číslo nebo slovo. */
  big: string;
  unit: string;
  past: boolean;
  /** Zbývá méně než 48 h – ukazovat i hodiny a minuty. */
  close: boolean;
  /** Podrobně „5 h 12 min“ (u blízkých). */
  detail?: string;
}

function remaining(c: Countdown, now: Date): Left {
  const target = toDate(c.at);
  const allDay = isDateKey(c.at);
  const end = allDay ? startOfDay(target) : target;
  const ms = end.getTime() - now.getTime();
  const days = calendarDayDiff(target, now);
  if (allDay ? days < 0 : ms < 0) return { big: 'Hotovo', unit: '', past: true, close: false };
  if (allDay && days === 0) return { big: 'Dnes', unit: '', past: false, close: true };
  if (ms < 48 * 3_600_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    if (h === 0) return { big: String(m), unit: plural(m, ['minuta', 'minuty', 'minut']), past: false, close: true, detail: `${m} min ${String(s).padStart(2, '0')} s` };
    return { big: String(h), unit: plural(h, ['hodina', 'hodiny', 'hodin']), past: false, close: true, detail: `${h} h ${String(m).padStart(2, '0')} min` };
  }
  if (days === 1) return { big: 'Zítra', unit: '', past: false, close: true };
  if (days > 140) {
    const weeks = Math.round(days / 7);
    return { big: String(weeks), unit: plural(weeks, ['týden', 'týdny', 'týdnů']), past: false, close: false, detail: `${days} dní` };
  }
  return { big: String(days), unit: plural(days, ['den', 'dny', 'dní']), past: false, close: false };
}

function progressOf(c: Countdown, now: Date): number {
  const start = new Date(c.createdAt).getTime();
  const end = (isDateKey(c.at) ? startOfDay(toDate(c.at)) : toDate(c.at)).getTime();
  if (!(end > start)) return 0;
  return Math.max(0, Math.min(1, (now.getTime() - start) / (end - start)));
}

function whenLabel(c: Countdown): string {
  const d = toDate(c.at);
  return `${formatDayMonth(d)}${!isDateKey(c.at) ? ` ${vTime(d)}` : ''}`;
}

export function CountdownEditor() {
  const open = useUiStore((s) => s.countdownEditor);
  const close = () => useUiStore.setState({ countdownEditor: false });
  return open ? <CountdownForm onClose={close} /> : null;
}

const PRESETS: { title: string; days: number }[] = [
  { title: 'Zkouškové období', days: 30 },
  { title: 'Státnice', days: 120 },
  { title: 'Odjezd na Erasmus', days: 90 },
  { title: 'Prázdniny', days: 60 },
  { title: 'Narozeniny', days: 45 },
  { title: 'Odevzdání práce', days: 14 },
];

function CountdownForm({ onClose }: { onClose: () => void }) {
  const countdowns = useAppStore((s) => s.settings.countdowns ?? NONE);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addEvent = useAppStore((s) => s.addEvent);
  const googleOn = useAppStore((s) => s.settings.google.enabled);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateKey(addDays(new Date(), 14)));
  const [time, setTime] = useState('');
  const [toCalendar, setToCalendar] = useState(false);

  const save = () => {
    if (!title.trim() || !date) return;
    const at = time ? new Date(`${date}T${time}:00`).toISOString() : date;
    updateSettings({ countdowns: [...countdowns, { id: uid('cd'), title: title.trim(), at, createdAt: new Date().toISOString() }] });
    if (toCalendar) {
      const start = time ? new Date(`${date}T${time}:00`) : startOfDay(new Date(`${date}T12:00:00`));
      addEvent({ title: title.trim(), start: start.toISOString(), end: (time ? new Date(start.getTime() + 3_600_000) : addDays(start, 1)).toISOString(), allDay: !time, kind: 'personal' });
    }
    toast.success(toCalendar ? 'Odpočet přidán a zapsán i do kalendáře.' : 'Odpočet přidán na hlavní stránku.');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nový odpočet"
      description="Na hlavní stránce uvidíte, kolik zbývá – v posledních dvou dnech na minuty."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim() || !date}>
            Přidat odpočet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-[13px] font-medium">Rychlá volba</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.title}
                type="button"
                onClick={() => {
                  setTitle(p.title);
                  if (!time) setDate(toDateKey(addDays(new Date(), p.days)));
                }}
                className={cn('inline-flex items-center rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition', title === p.title ? 'bg-accent-soft text-accent ring-accent' : 'bg-surface ring-line hover:bg-surface-2')}
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>
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
        <Toggle checked={toCalendar} onChange={setToCalendar} label="Zapsat i do kalendáře" description={googleOn ? 'Objeví se v Plánu i v Google Kalendáři.' : 'Objeví se v Plánu.'} />
      </div>
    </Modal>
  );
}

function Featured({ c, left, progress, editing, onRemove }: { c: Countdown; left: Left; progress: number; editing: boolean; onRemove: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-accent/14 via-surface-2/80 to-sand/20 p-4 ring-1 ring-inset ring-line">
      <div className="flex items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-subtle">Nejbližší</p>
          <p className="line-clamp-2 text-[15.5px] font-bold leading-tight">{c.title}</p>
          <p className="text-[12.5px] text-muted">{whenLabel(c)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-[46px] leading-[0.9] tabular">{left.big}</p>
          {left.unit && <p className="text-[12.5px] font-semibold text-muted">{left.unit}</p>}
        </div>
      </div>
      {left.detail && left.close && <p className="mt-2 text-right text-[12.5px] font-bold text-accent tabular">ještě {left.detail}</p>}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.round(progress * 100)}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      {editing && (
        <button type="button" onClick={onRemove} className="mt-2 text-[12.5px] font-bold text-red-700 hover:underline dark:text-red-300">
          Smazat odpočet
        </button>
      )}
    </div>
  );
}

export function CountdownsCard() {
  const countdowns = useAppStore((s) => s.settings.countdowns ?? NONE);
  // Živé sekundy jen tehdy, když něco končí do dvou dnů.
  const anyClose = countdowns.some((c) => !isDateKey(c.at) && toDate(c.at).getTime() - Date.now() < 48 * 3_600_000 && toDate(c.at).getTime() > Date.now());
  const now = useNow(anyClose ? 1000 : 60_000);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const plan = usePlanData();
  const [editing, setEditing] = useState(false);

  const list = useMemo(
    () =>
      countdowns
        .map((c) => ({ c, r: remaining(c, now), p: progressOf(c, now) }))
        .filter(({ c, r }) => !r.past || calendarDayDiff(now, toDate(c.at)) <= 1)
        .sort((a, b) => toDate(a.c.at).getTime() - toDate(b.c.at).getTime()),
    [countdowns, now],
  );

  // Návrhy: začátek zkouškového, konec výuky, prázdniny, Vánoce a zkoušky z předmětů.
  const suggestions = useMemo(() => {
    const out: { key: string; title: string; at: string }[] = [];
    const today = startOfDay(now);
    for (const m of plan.milestones) {
      const start = toDate(m.start);
      if (start <= today) {
        if (m.category === 'teaching' && m.end && toDate(m.end) > today) out.push({ key: `ms-end:${m.id}`, title: `Konec: ${m.title}`, at: m.end.slice(0, 10) });
        continue;
      }
      if (m.category === 'exam-period') out.push({ key: `ms:${m.id}`, title: m.title, at: m.start.slice(0, 10) });
      if (m.category === 'holiday' && m.end) out.push({ key: `ms:${m.id}`, title: m.title, at: m.start.slice(0, 10) });
    }
    for (const r of plan.requirements) {
      if (r.type === 'exam' && r.deadline && new Date(r.deadline) > now) out.push({ key: `req:${r.id}`, title: r.title, at: r.deadline });
    }
    const xmas = new Date(now.getFullYear(), 11, 24);
    if (xmas > now) out.push({ key: `xmas:${now.getFullYear()}`, title: 'Štědrý den', at: toDateKey(xmas) });
    const used = new Set(countdowns.map((c) => c.sourceKey));
    return out.filter((s) => !used.has(s.key)).sort((a, b) => toDate(a.at).getTime() - toDate(b.at).getTime()).slice(0, 4);
  }, [plan.milestones, plan.requirements, countdowns, now]);

  const add = (s: { key: string; title: string; at: string }) => updateSettings({ countdowns: [...countdowns, { id: uid('cd'), title: s.title, at: s.at, sourceKey: s.key, createdAt: new Date().toISOString() }] });
  const remove = (id: string) => updateSettings({ countdowns: countdowns.filter((c) => c.id !== id) });
  const [first, ...rest] = list;

  return (
    <section className="card min-w-0 rounded-[26px] p-4 sm:p-5" aria-label="Odpočty">
      <header className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-[23px] leading-none">
          <Glyph name="hourglass" size={20} className="text-moss" /> Odpočty
        </h2>
        <span className="flex items-center gap-1">
          {list.length > 0 && (
            <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
              {editing ? 'Hotovo' : 'Upravit'}
            </button>
          )}
          <button type="button" onClick={() => useUiStore.setState({ countdownEditor: true })} className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[12.5px] font-bold text-accent hover:bg-accent/15">
            Přidat
          </button>
        </span>
      </header>

      {first && <Featured c={first.c} left={first.r} progress={first.p} editing={editing} onRemove={() => remove(first.c.id)} />}

      {rest.length > 0 && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {rest.map(({ c, r }) => (
              <motion.li key={c.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="flex items-center gap-3 rounded-[18px] bg-surface-2/70 px-3 py-2.5 ring-1 ring-inset ring-line">
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[13.5px] font-semibold leading-snug">{c.title}</span>
                  <span className="block text-[11.5px] text-subtle">{whenLabel(c)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[26px] leading-none tabular">{r.big}</span>
                  {r.unit && <span className="block text-[11px] font-semibold text-muted">{r.unit}</span>}
                </span>
                {editing && (
                  <button type="button" onClick={() => remove(c.id)} className="shrink-0 rounded-full px-2 py-1 text-[12px] font-bold text-red-700 hover:bg-red-500/10 dark:text-red-300" aria-label={`Smazat odpočet ${c.title}`}>
                    Smazat
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
                <span className="truncate">{s.title}</span>
                <span className="shrink-0 text-subtle">{formatDayMonth(toDate(s.at))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {list.length === 0 && suggestions.length === 0 && (
        <button type="button" onClick={() => useUiStore.setState({ countdownEditor: true })} className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-line-strong px-4 py-4 text-left text-[13.5px] text-muted hover:bg-surface-2">
          Přidejte si odpočet – třeba do státnic nebo do odjezdu domů.
        </button>
      )}
    </section>
  );
}
