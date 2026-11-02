import { beforeEach, describe, expect, it } from 'vitest';
import type { GoogleSyncSettings, GoogleSyncState, Milestone, Requirement, ScheduleEvent, Subject, Task } from '../types';
import { applyLocalOps, emptySyncState, mergeServiceState } from '../lib/sync/apply';
import { syncCalendar, syncTasks, type SyncContext, type SyncData } from '../lib/sync/engine';
import { keyOf } from '../lib/sync/keys';
import { FakeGoogleBackend } from '../services/google/fakeBackend';

const NOW = new Date(2026, 10, 1, 13, 5);

const SETTINGS: GoogleSyncSettings = {
  enabled: true,
  clientId: '',
  auto: true,
  intervalMinutes: 15,
  conflict: 'newest',
  deletions: 'mirror',
  calendar: {
    enabled: true,
    target: 'dedicated',
    direction: 'two-way',
    push: { classes: true, exams: true, deadlines: true, milestones: true, personal: true },
    pullCalendars: [],
    rangeWeeks: 6,
    remindersClasses: [15],
    remindersDeadlines: [1440, 120],
    colors: true,
  },
  tasks: {
    enabled: true,
    target: 'dedicated',
    direction: 'two-way',
    push: { personal: true, requirements: true, subtasks: true },
    pullLists: [],
    keepCompletedDays: 14,
  },
  drive: { enabled: false, syncState: false, exportMaterials: false, folderName: 'Stihnu' },
};

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();

function seed(): SyncData & { events: ScheduleEvent[]; tasks: Task[]; requirements: Requirement[] } {
  const subject: Subject = { id: 's1', code: 'JSB012', name: 'Úvod do mediálních studií', color: 'indigo', source: 'sis', createdAt: at(1, 8) };
  const events: ScheduleEvent[] = [
    { id: 'e1', subjectId: 's1', title: 'JSB012 Seminář', kind: 'seminar', start: at(2, 14), end: at(2, 15, 30), location: 'H212 (Hollar)', room: 'H212', source: 'sis' },
    { id: 'p1', title: 'Kafe s Aničkou', kind: 'personal', start: at(3, 18), end: at(3, 19), source: 'manual', createdAt: at(1, 9), updatedAt: at(1, 9) },
  ];
  const requirements: Requirement[] = [
    {
      id: 'r1',
      subjectId: 's1',
      title: 'Esej',
      type: 'assignment',
      weight: 30,
      deadline: at(5, 23, 59),
      done: false,
      subtasks: [
        { id: 'st1', title: 'Rešerše', done: true },
        { id: 'st2', title: 'Napsat', done: false },
      ],
      source: 'moodle',
      createdAt: at(1, 8),
      updatedAt: at(1, 8),
    },
  ];
  const tasks: Task[] = [{ id: 't1', title: 'Koupit lítačku', due: '2026-11-04', done: false, source: 'manual', createdAt: at(1, 9), updatedAt: at(1, 9) }];
  const milestones: Milestone[] = [{ id: 'm1', title: 'Den boje za svobodu', category: 'holiday', start: '2026-11-17', allDay: true, source: 'parser' }];
  return { subjects: [subject], events, requirements, tasks, milestones, tombstones: {}, buildingFor: () => undefined };
}

describe('obousměrná synchronizace s Googlem', () => {
  let backend: FakeGoogleBackend;
  let data: ReturnType<typeof seed>;
  let state: GoogleSyncState;
  let clock: Date;

  const ctx = (extra: Partial<SyncContext> = {}): SyncContext => ({
    backend,
    settings: SETTINGS,
    state,
    data,
    now: clock,
    includeDemo: true,
    appUrl: 'https://prazskystudent.vercel.app',
    ...extra,
  });

  async function runAll(extra: Partial<SyncContext> = {}) {
    const cal = await syncCalendar(ctx(extra));
    state = mergeServiceState(state, 'calendar', cal);
    data = applyLocalOps(data, cal.ops, clock);
    const tasks = await syncTasks(ctx(extra));
    state = mergeServiceState(state, 'tasks', tasks);
    data = applyLocalOps(data, tasks.ops, clock);
    return { cal, tasks };
  }

  beforeEach(() => {
    clock = new Date(NOW);
    backend = new FakeGoogleBackend(() => clock);
    data = seed();
    state = emptySyncState();
  });

  it('první synchronizace vše zapíše, druhá nic nemění', async () => {
    const { cal, tasks } = await runAll();
    expect(cal.pushed.created).toBe(4); // výuka, osobní událost, termín, svátek
    expect(tasks.pushed.created).toBe(4); // úkol, povinnost + 2 podúkoly
    expect(cal.notes.join(' ')).toContain('Stihnu · studium');
    const peek = backend.peek();
    expect(peek.events.find((e) => e.summary === 'Úvod do mediálních studií · seminář')?.colorId).toBe('9');
    expect(peek.tasks.find((t) => t.title === 'Esej · JSB012')?.due).toBe('2026-11-05T00:00:00.000Z');
    expect(peek.tasks.find((t) => t.title === 'Napsat')?.parent).toBeTruthy();

    clock = new Date(NOW.getTime() + 15 * 60_000);
    const second = await runAll();
    expect(second.cal.pushed).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(second.cal.pulled).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(second.tasks.pushed).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(second.cal.ops).toHaveLength(0);
    expect(second.tasks.ops).toHaveLength(0);
  });

  it('změna osobní události v Googlu se propíše do aplikace (a zpět se nevrací)', async () => {
    await runAll();
    const link = state.links[`calendar|${keyOf.event('p1')}`];
    backend.editEvent(state.containers.calendarId!, link.remoteId, { summary: 'Kafe s Aničkou a Petrem', location: 'Café Lounge' });
    clock = new Date(NOW.getTime() + 30 * 60_000);
    const { cal } = await runAll();
    expect(cal.pulled.updated).toBe(1);
    const p1 = data.events.find((e) => e.id === 'p1')!;
    expect(p1.title).toBe('Kafe s Aničkou a Petrem');
    expect(p1.location).toBe('Café Lounge');
    const again = await runAll();
    expect(again.cal.pushed.updated + again.cal.pulled.updated).toBe(0);
  });

  it('změna výuky v aplikaci se zapíše do Googlu', async () => {
    await runAll();
    data = { ...data, events: data.events.map((e) => (e.id === 'e1' ? { ...e, room: 'H210', start: at(2, 15), end: at(2, 16, 30) } : e)) };
    const { cal } = await runAll();
    expect(cal.pushed.updated).toBe(1);
    const remote = backend.peek().events.find((e) => e.summary?.startsWith('Úvod do mediálních studií'))!;
    expect(remote.description).toContain('H210');
    expect(new Date(remote.start.dateTime!).getHours()).toBe(15);
  });

  it('nová událost v Googlu se naimportuje a smazání v aplikaci ji smaže i v Googlu', async () => {
    await runAll();
    const calId = state.containers.calendarId!;
    await backend.insertEvent(calId, { summary: 'Trénink', start: { dateTime: at(4, 18) }, end: { dateTime: at(4, 19, 30) } });
    const { cal } = await runAll();
    expect(cal.pulled.created).toBe(1);
    const imported = data.events.find((e) => e.title === 'Trénink')!;
    expect(imported).toMatchObject({ kind: 'personal', source: 'google' });

    // smazání v aplikaci = tombstone
    data = { ...data, events: data.events.filter((e) => e.id !== imported.id), tombstones: { [keyOf.event(imported.id)]: clock.toISOString() } };
    const after = await runAll();
    expect(after.cal.pushed.deleted).toBe(1);
    expect(backend.peek().events.some((e) => e.summary === 'Trénink')).toBe(false);
  });

  it('dokončení v Google Úkolech odškrtne povinnost i podúkol', async () => {
    await runAll();
    const listId = state.containers.taskListId!;
    const subLink = state.links[`tasks|${keyOf.sub('r1', 'st2')}`];
    backend.editTask(listId, subLink.remoteId, { status: 'completed' });
    const { tasks } = await runAll();
    expect(tasks.ops).toContainEqual({ type: 'setSubtaskDone', requirementId: 'r1', subtaskId: 'st2', done: true });
    const r1 = data.requirements.find((r) => r.id === 'r1')!;
    expect(r1.subtasks.every((s) => s.done)).toBe(true);
    // Povinnost je teď hotová i lokálně → další běh to zapíše do Googlu
    const next = await runAll();
    expect(next.tasks.pushed.updated).toBe(1);
    const reqRemote = backend.peek().tasks.find((t) => t.title === 'Esej · JSB012')!;
    expect(reqRemote.status).toBe('completed');
  });

  it('osobní úkol: přesun termínu v Googlu zachová lokální čas', async () => {
    data = { ...data, tasks: [{ ...data.tasks[0], due: at(4, 17, 30) }] };
    await runAll();
    const link = state.links[`tasks|${keyOf.task('t1')}`];
    backend.editTask(state.containers.taskListId!, link.remoteId, { due: '2026-11-06T00:00:00.000Z', title: 'Koupit lítačku na celý rok' });
    await runAll();
    const t1 = data.tasks.find((t) => t.id === 't1')!;
    expect(t1.title).toBe('Koupit lítačku na celý rok');
    expect(new Date(t1.due!).getDate()).toBe(6);
    expect(new Date(t1.due!).getHours()).toBe(17);
  });

  it('konflikt: novější změna vyhrává', async () => {
    await runAll();
    const link = state.links[`calendar|${keyOf.event('p1')}`];
    clock = new Date(NOW.getTime() + 60_000);
    backend.editEvent(state.containers.calendarId!, link.remoteId, { summary: 'Starší změna v Googlu' });
    clock = new Date(NOW.getTime() + 5 * 60_000);
    data = { ...data, events: data.events.map((e) => (e.id === 'p1' ? { ...e, title: 'Novější změna v aplikaci', updatedAt: clock.toISOString() } : e)) };
    const { cal } = await runAll();
    expect(cal.conflicts).toBe(1);
    expect(backend.peek().events.some((e) => e.summary === 'Novější změna v aplikaci')).toBe(true);
    expect(data.events.find((e) => e.id === 'p1')!.title).toBe('Novější změna v aplikaci');
  });

  it('výuka smazaná v Googlu se znovu nezapisuje a v aplikaci zůstane', async () => {
    await runAll();
    const link = state.links[`calendar|${keyOf.event('e1')}`];
    await backend.deleteEvent(state.containers.calendarId!, link.remoteId);
    await runAll();
    expect(data.events.some((e) => e.id === 'e1')).toBe(true);
    expect(state.excluded).toContain(`calendar|${keyOf.event('e1')}`);
    const again = await runAll();
    expect(again.cal.pushed.created).toBe(0);
  });

  it('pojistka proti hromadnému mazání zastaralých kopií', async () => {
    const many: ScheduleEvent[] = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      subjectId: 's1',
      title: 'Přednáška',
      kind: 'lecture',
      start: at(2 + (i % 20), 9),
      end: at(2 + (i % 20), 10, 30),
      source: 'sis',
    }));
    data = { ...data, events: [...data.events, ...many] };
    await runAll();
    // Import rozvrhu vygeneroval nová ID – staré kopie jsou „zastaralé“
    data = { ...data, events: data.events.filter((e) => !e.id.startsWith('c')).concat(many.map((e) => ({ ...e, id: `n${e.id}` }))) };
    const guarded = await runAll();
    expect(guarded.cal.massDelete).toEqual({ service: 'calendar', count: 30 });
    expect(guarded.cal.pushed.deleted).toBe(0);
    const confirmed = await runAll({ allowMassDelete: true });
    expect(confirmed.cal.pushed.deleted).toBe(30);
  });

  it('ztracené vazby se obnoví podle značky – bez duplikátů', async () => {
    await runAll();
    const before = backend.peek();
    state = { ...emptySyncState(), containers: state.containers };
    const { cal, tasks } = await runAll();
    expect(cal.pushed.created).toBe(0);
    expect(tasks.pushed.created).toBe(0);
    expect(cal.pulled.created).toBe(0);
    const after = backend.peek();
    expect(after.events).toHaveLength(before.events.length);
    expect(after.tasks).toHaveLength(before.tasks.length);
  });

  it('zrcadlí vybrané kalendáře jen ke čtení', async () => {
    backend.addCalendar({ id: 'svatky', summary: 'Státní svátky v ČR', accessRole: 'reader', backgroundColor: '#a36f45' });
    await backend.insertEvent('svatky', { summary: 'Den boje za svobodu a demokracii', start: { date: '2026-11-17' }, end: { date: '2026-11-18' } });
    await runAll({ settings: { ...SETTINGS, calendar: { ...SETTINGS.calendar, pullCalendars: ['svatky'] } } });
    const mirror = data.events.find((e) => e.google?.readOnly);
    expect(mirror).toMatchObject({ title: 'Den boje za svobodu a demokracii', allDay: true, kind: 'personal' });
    expect(mirror!.google!.calendarName).toBe('Státní svátky v ČR');
    // Zrcadla se nikdy nezapisují zpět
    const again = await runAll({ settings: { ...SETTINGS, calendar: { ...SETTINGS.calendar, pullCalendars: ['svatky'] } } });
    expect(again.cal.pushed.created).toBe(0);
    // Odebrání kalendáře z výběru zrcadla smaže
    await runAll();
    expect(data.events.some((e) => e.google?.readOnly)).toBe(false);
  });

  it('aliasy: hlavní kalendář (jen ke čtení) a Moje úkoly (obousměrně)', async () => {
    await backend.insertEvent('primary', { summary: 'Brigáda', start: { dateTime: at(3, 16) }, end: { dateTime: at(3, 20) } });
    await backend.insertTask('@default', { title: 'Zavolat babičce', status: 'needsAction' });
    const settings = { ...SETTINGS, calendar: { ...SETTINGS.calendar, pullCalendars: ['primary'] }, tasks: { ...SETTINGS.tasks, pullLists: ['@default'] } };
    await runAll({ settings });
    expect(data.events.find((e) => e.title === 'Brigáda')?.google).toMatchObject({ readOnly: true, calendarId: 'primary' });
    const imported = data.tasks.find((t) => t.title === 'Zavolat babičce')!;
    expect(imported.source).toBe('google');
    // Odškrtnutí v aplikaci se propíše zpět do Moje úkoly
    data = { ...data, tasks: data.tasks.map((t) => (t.id === imported.id ? { ...t, done: true, completedAt: clock.toISOString(), updatedAt: clock.toISOString() } : t)) };
    const { tasks } = await runAll({ settings });
    expect(tasks.pushed.updated).toBe(1);
    expect(backend.peek().tasks.find((t) => t.title === 'Zavolat babičce')?.status).toBe('completed');
  });

  it('jen zápis (push): změny z Googlu se nepřebírají', async () => {
    const pushOnly = { ...SETTINGS, calendar: { ...SETTINGS.calendar, direction: 'push' as const } };
    await runAll({ settings: pushOnly });
    const calId = state.containers.calendarId!;
    await backend.insertEvent(calId, { summary: 'Cizí událost', start: { dateTime: at(6, 10) }, end: { dateTime: at(6, 11) } });
    const { cal } = await runAll({ settings: pushOnly });
    expect(cal.pulled.created).toBe(0);
    expect(data.events.some((e) => e.title === 'Cizí událost')).toBe(false);
  });
});
