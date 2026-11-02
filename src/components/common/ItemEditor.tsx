import { useEffect, useState } from 'react';
import { CalendarClock, ExternalLink, ListTodo, Sparkles, Trash } from 'lucide-react';
import type { ScheduleEvent, Task } from '../../types';
import { addDays, fromLocalInputValue, isDateKey, startOfDay, toDateKey, toLocalInputValue } from '../../lib/dates';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { confirmAction, toast, useUiStore } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Button, Field, Segmented, Select, TextArea, TextInput, Toggle } from '../ui/primitives';
import { QuickAdd } from './QuickAdd';

/* ------------------------------------------------------------------ */
/* Úkol                                                                */
/* ------------------------------------------------------------------ */

function TaskForm({ task, onClose }: { task?: Task; onClose: () => void }) {
  const subjects = useAppStore((s) => s.subjects);
  const addTask = useAppStore((s) => s.addTask);
  const updateTask = useAppStore((s) => s.updateTask);
  const removeTask = useAppStore((s) => s.removeTask);
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [date, setDate] = useState(task?.due ? (isDateKey(task.due) ? task.due : toDateKey(new Date(task.due))) : '');
  const [time, setTime] = useState(task?.due && !isDateKey(task.due) ? toLocalInputValue(new Date(task.due)).slice(11) : '');
  const [subjectId, setSubjectId] = useState(task?.subjectId ?? '');
  const [priority, setPriority] = useState(task?.priority === 'high');
  const [done, setDone] = useState(task?.done ?? false);

  const save = () => {
    if (!title.trim()) return;
    const due = date ? (time ? fromLocalInputValue(`${date}T${time}`)?.toISOString() : date) : undefined;
    if (task) {
      updateTask(task.id, {
        title: title.trim(),
        notes: notes.trim() || undefined,
        due,
        subjectId: subjectId || undefined,
        priority: priority ? 'high' : undefined,
        done,
        completedAt: done ? (task.completedAt ?? new Date().toISOString()) : undefined,
      });
    } else {
      addTask({ title, notes, due, subjectId: subjectId || undefined, priority: priority ? 'high' : undefined });
    }
    toast.success(task ? 'Úkol uložen' : 'Úkol přidán');
    onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Úkol">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Co je potřeba udělat" autoFocus />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Termín">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Čas (nepovinný)">
          <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[0, 1, 2, 7].map((d) => (
          <button key={d} type="button" onClick={() => setDate(toDateKey(addDays(appNow(), d)))} className="rounded-full bg-surface-2 px-3 py-1 text-[12.5px] font-semibold text-muted ring-1 ring-inset ring-line hover:text-fg">
            {d === 0 ? 'Dnes' : d === 1 ? 'Zítra' : d === 2 ? 'Pozítří' : 'Za týden'}
          </button>
        ))}
        {date && (
          <button type="button" onClick={() => setDate('')} className="rounded-full px-3 py-1 text-[12.5px] font-semibold text-subtle hover:text-fg">
            Bez termínu
          </button>
        )}
      </div>
      <Field label="Předmět">
        <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Bez předmětu</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code ? `${s.code} · ` : ''}
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Poznámka">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
      </Field>
      <Toggle checked={priority} onChange={setPriority} label="Důležité" />
      {task && <Toggle checked={done} onChange={setDone} label="Hotovo" />}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {task ? (
          <Button
            variant="ghost"
            icon={Trash}
            className="text-red-700 hover:text-red-700"
            onClick={async () => {
              if (await confirmAction({ title: 'Smazat úkol?', message: 'Smaže se i z Google Úkolů, pokud je propojený.', confirmLabel: 'Smazat', tone: 'danger' })) {
                removeTask(task.id);
                onClose();
              }
            }}
          >
            Smazat
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          {task ? 'Uložit' : 'Přidat úkol'}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Událost                                                             */
/* ------------------------------------------------------------------ */

function EventForm({ event, onClose }: { event?: ScheduleEvent; onClose: () => void }) {
  const subjects = useAppStore((s) => s.subjects);
  const buildings = useAppStore((s) => s.settings.buildings);
  const addEvent = useAppStore((s) => s.addEvent);
  const updateEvent = useAppStore((s) => s.updateEvent);
  const removeEvent = useAppStore((s) => s.removeEvent);
  const base = appNow();
  const defaultStart = new Date(base.getFullYear(), base.getMonth(), base.getDate(), base.getHours() + 1, 0);
  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [start, setStart] = useState(toLocalInputValue(event ? new Date(event.start) : defaultStart));
  const [end, setEnd] = useState(toLocalInputValue(event ? new Date(event.end) : new Date(defaultStart.getTime() + 3_600_000)));
  const [day, setDay] = useState(toDateKey(event ? new Date(event.start) : base));
  const [location, setLocation] = useState(event?.location ?? '');
  const [buildingId, setBuildingId] = useState(event?.buildingId ?? '');
  const [subjectId, setSubjectId] = useState(event?.subjectId ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const readOnly = Boolean(event?.google?.readOnly);
  const study = event && event.kind !== 'personal';

  const save = () => {
    if (!title.trim()) return;
    let startIso: string;
    let endIso: string;
    if (allDay) {
      const d = new Date(`${day}T00:00`);
      startIso = startOfDay(d).toISOString();
      endIso = startOfDay(addDays(d, 1)).toISOString();
    } else {
      const s = fromLocalInputValue(start);
      let e = fromLocalInputValue(end);
      if (!s) return;
      if (!e || e <= s) e = new Date(s.getTime() + 3_600_000);
      startIso = s.toISOString();
      endIso = e.toISOString();
    }
    const patch = {
      title: title.trim(),
      start: startIso,
      end: endIso,
      allDay: allDay || undefined,
      location: location.trim() || undefined,
      buildingId: buildingId || undefined,
      subjectId: subjectId || undefined,
      notes: notes.trim() || undefined,
    };
    if (event) updateEvent(event.id, patch);
    else addEvent(patch);
    toast.success(event ? 'Událost uložena' : 'Událost přidána');
    onClose();
  };

  if (readOnly && event) {
    return (
      <div className="space-y-3 text-[14px]">
        <p className="font-display text-2xl">{event.title}</p>
        <p className="text-muted">
          {event.allDay ? new Date(event.start).toLocaleDateString('cs-CZ') : `${new Date(event.start).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${new Date(event.end).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' })}`}
          {event.location ? ` · ${event.location}` : ''}
        </p>
        {event.notes && <p className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-3 text-muted">{event.notes}</p>}
        <p className="text-xs text-subtle">Z kalendáře „{event.google?.calendarName}“ – upravuje se v Googlu.</p>
        {event.google?.htmlLink && (
          <a href={event.google.htmlLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
            <ExternalLink className="size-3.5" aria-hidden /> Otevřít v Google Kalendáři
          </a>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Název">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Trénink, Konzultace…" autoFocus={!event} />
      </Field>
      {!study && <Toggle checked={allDay} onChange={setAllDay} label="Celý den" />}
      {allDay ? (
        <Field label="Den">
          <TextInput type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Začátek">
            <TextInput
              type="datetime-local"
              value={start}
              onChange={(e) => {
                const prev = fromLocalInputValue(start);
                const prevEnd = fromLocalInputValue(end);
                setStart(e.target.value);
                const next = fromLocalInputValue(e.target.value);
                if (prev && prevEnd && next) setEnd(toLocalInputValue(new Date(next.getTime() + (prevEnd.getTime() - prev.getTime()))));
              }}
            />
          </Field>
          <Field label="Konec">
            <TextInput type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Místo">
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresa nebo místo" />
        </Field>
        <Field label="Budova (pro MHD)" hint="Vyber, a Stihnu spočítá cestu.">
          <Select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
            <option value="">Žádná</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!study && (
        <Field label="Předmět">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Bez předmětu</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code ? `${s.code} · ` : ''}
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Poznámka">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {event ? (
          <Button
            variant="ghost"
            icon={Trash}
            className="text-red-700 hover:text-red-700"
            onClick={async () => {
              if (await confirmAction({ title: 'Smazat událost?', message: 'Smaže se i z Google Kalendáře, pokud je propojený.', confirmLabel: 'Smazat', tone: 'danger' })) {
                removeEvent(event.id);
                onClose();
              }
            }}
          >
            Smazat
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          {event ? 'Uložit' : 'Přidat událost'}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Modální okno                                                        */
/* ------------------------------------------------------------------ */

export function ItemEditor() {
  const editor = useUiStore((s) => s.editor);
  const close = useUiStore((s) => s.closeEditor);
  const tasks = useAppStore((s) => s.tasks);
  const events = useAppStore((s) => s.events);
  const [mode, setMode] = useState<'quick' | 'task' | 'event'>('quick');
  const [example, setExample] = useState<{ text: string; n: number } | null>(null);

  useEffect(() => {
    if (editor) setMode(editor.type === 'quick' ? 'quick' : editor.type);
  }, [editor]);

  const task = editor?.type === 'task' && editor.id ? tasks.find((t) => t.id === editor.id) : undefined;
  const event = editor?.type === 'event' && editor.id ? events.find((e) => e.id === editor.id) : undefined;
  const editing = Boolean(task || event);
  const title = task ? 'Úkol' : event ? (event.kind === 'personal' ? 'Událost' : 'Výuka') : 'Přidat';

  return (
    <Modal open={Boolean(editor)} onClose={close} title={title} icon={mode === 'event' ? CalendarClock : mode === 'task' ? ListTodo : Sparkles} size="md">
      {!editing && (
        <Segmented
          className="mb-4"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'quick', label: 'Rychle', icon: Sparkles },
            { value: 'task', label: 'Úkol', icon: ListTodo },
            { value: 'event', label: 'Událost', icon: CalendarClock },
          ]}
        />
      )}
      {mode === 'quick' && !editing && (
        <div className="space-y-4">
          <QuickAdd key={example?.n ?? 0} autoFocus variant="hero" initial={example?.text ?? (editor?.type === 'quick' ? (editor.text ?? '') : '')} onSaved={close} />
          <p className="eyebrow text-subtle">Zkus třeba</p>
          <ul className="grid gap-1.5 text-[13px] text-muted sm:grid-cols-2">
            {['zítra 18:00 trénink @Strahov', 'esej do pátku #JSB065 !', 'pá 10–12 konzultace na Hollaru', 'koupit lítačku za 3 dny'].map((ex, i) => (
              <li key={ex}>
                <button type="button" onClick={() => setExample({ text: ex, n: (example?.n ?? 0) + i + 1 })} className="w-full rounded-2xl bg-surface-2 px-3 py-2 text-left font-medium transition hover:bg-accent-soft hover:text-fg">
                  „{ex}“
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mode === 'task' && <TaskForm key={task?.id ?? 'new-task'} task={task} onClose={close} />}
      {mode === 'event' && <EventForm key={event?.id ?? 'new-event'} event={event} onClose={close} />}
    </Modal>
  );
}
