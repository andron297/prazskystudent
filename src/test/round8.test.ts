import { beforeEach, describe, expect, it } from 'vitest';
import { mergeSnapshots, type SnapshotData } from '../lib/sync/driveState';
import { useAppStore } from '../store/appStore';

const empty = (): SnapshotData => ({ subjects: [], events: [], requirements: [], tasks: [], materials: [], milestones: [], tombstones: {} });

describe('Ukládání nastavení po položkách (nic se samo nepřenastaví)', () => {
  it('sloučení vezme z každého zařízení jen novější položky', () => {
    const local: SnapshotData = { ...empty(), settings: { bufferMinutes: 10, walkSpeed: 'fast' }, settingsUpdatedAt: '2026-11-08T10:00:00Z', settingsStamps: { walkSpeed: '2026-11-08T10:00:00Z', bufferMinutes: '2026-11-01T00:00:00Z' } };
    // Telefon později obnovil rozvrh (jiná položka) – jeho staré „walkSpeed“ nesmí přepsat novější volbu.
    const remote: SnapshotData = { ...empty(), settings: { bufferMinutes: 15, walkSpeed: 'slow' }, settingsUpdatedAt: '2026-11-08T11:00:00Z', settingsStamps: { walkSpeed: '2026-11-01T00:00:00Z', bufferMinutes: '2026-11-08T11:00:00Z' } };
    const { merged } = mergeSnapshots(local, remote);
    expect(merged.settings?.walkSpeed).toBe('fast');
    expect(merged.settings?.bufferMinutes).toBe(15);
  });

  it('starší snímek bez časů po položkách nepřepíše novější lokální změnu', () => {
    const local: SnapshotData = { ...empty(), settings: { walkSpeed: 'fast' }, settingsUpdatedAt: '2026-11-08T09:00:00Z', settingsStamps: { walkSpeed: '2026-11-08T12:00:00Z' } };
    const remote: SnapshotData = { ...empty(), settings: { walkSpeed: 'slow' }, settingsUpdatedAt: '2026-11-08T11:00:00Z' };
    expect(mergeSnapshots(local, remote).merged.settings?.walkSpeed).toBe('fast');
  });

  describe('v aplikaci', () => {
    beforeEach(() => {
      useAppStore.setState((s) => ({ meta: { ...s.meta, settingsStamps: {}, settingsUpdatedAt: undefined } }));
    });

    it('každá změna nastavení dostane čas – i výchozí místo a režim', () => {
      useAppStore.getState().setOrigin('live', { source: 'preset', presetId: 'kajetanka' });
      useAppStore.getState().updateSettings({ bufferMinutes: 12 });
      const stamps = useAppStore.getState().meta.settingsStamps ?? {};
      expect(stamps.origin).toBeTruthy();
      expect(stamps.bufferMinutes).toBeTruthy();
    });

    it('převzetí z jiného zařízení nepřepíše novější lokální volbu', () => {
      useAppStore.getState().updateSettings({ walkSpeed: 'fast' });
      const localAt = useAppStore.getState().meta.settingsStamps!.walkSpeed;
      const older = new Date(new Date(localAt).getTime() - 60_000).toISOString();
      const newer = new Date(new Date(localAt).getTime() + 60_000).toISOString();
      useAppStore.getState().applyDriveMerge({ ...empty(), subjects: useAppStore.getState().subjects, events: useAppStore.getState().events, settings: { walkSpeed: 'slow', bufferMinutes: 20 }, settingsUpdatedAt: newer, settingsStamps: { walkSpeed: older, bufferMinutes: newer } });
      expect(useAppStore.getState().settings.walkSpeed).toBe('fast');
      expect(useAppStore.getState().settings.bufferMinutes).toBe(20);
      // a převzatá položka si nese čas z druhého zařízení (žádné přebíjení tam a zpět)
      expect(useAppStore.getState().meta.settingsStamps!.bufferMinutes).toBe(newer);
    });
  });
});

import { isBindingSubject } from '../lib/bindingSubjects';
import type { ScheduleEvent, Subject } from '../types';

describe('Předměty jen ze SISu', () => {
  const sisSubject: Subject = { id: 'a', code: 'JSB012', name: 'Úvod do mediálních studií', color: 'indigo', source: 'sis', createdAt: '2026-10-01T00:00:00Z' };
  const moodleOnly: Subject = { id: 'b', name: 'Kurz z Moodlu', color: 'teal', source: 'moodle', createdAt: '2026-10-01T00:00:00Z' };
  const moodleMatched: Subject = { id: 'c', code: 'JSB013', name: 'Předmět s rozvrhem', color: 'rose', source: 'moodle', createdAt: '2026-10-01T00:00:00Z' };
  const events = [{ id: 'e1', subjectId: 'c', source: 'sis' }] as unknown as ScheduleEvent[];

  it('závazný je předmět ze SISu nebo s rozvrhem ze SISu, ne jen kurz z Moodlu', () => {
    expect(isBindingSubject(sisSubject, events)).toBe(true);
    expect(isBindingSubject(moodleMatched, events)).toBe(true);
    expect(isBindingSubject(moodleOnly, events)).toBe(false);
  });

  it('úklid smaže kurzy z Moodlu mimo rozvrh (i jejich povinnosti), vlastní úkoly zůstanou', () => {
    useAppStore.setState({
      subjects: [sisSubject, moodleOnly],
      events: [{ id: 'e2', subjectId: 'a', source: 'sis', title: 'x', kind: 'lecture', start: '2026-11-09T09:00:00Z', end: '2026-11-09T10:30:00Z' }] as ScheduleEvent[],
      requirements: [{ id: 'r1', subjectId: 'b', title: 'Kvíz', type: 'test', done: false, subtasks: [], source: 'moodle', createdAt: '2026-10-01T00:00:00Z' }] as never,
      tasks: [{ id: 't1', title: 'Můj úkol', subjectId: 'b', done: false, source: 'manual', createdAt: '2026-10-01T00:00:00Z' }] as never,
    });
    expect(useAppStore.getState().pruneMoodleOnlySubjects()).toBe(1);
    const s = useAppStore.getState();
    expect(s.subjects.map((x) => x.id)).toEqual(['a']);
    expect(s.requirements).toHaveLength(0);
    expect(s.tasks[0]).toMatchObject({ id: 't1', title: 'Můj úkol' });
    expect(s.tasks[0].subjectId).toBeUndefined();
  });
});

import { usePresentationStore } from '../store/presentationStore';

describe('Režim prezentace: ukázkové položky', () => {
  it('úkol přidaný během prezentace je skutečný, dá se upravit a po vypnutí se smaže', () => {
    usePresentationStore.getState().setMasked(true);
    const id = useAppStore.getState().addTask({ title: 'Ukázkový úkol pro sál' });
    expect(usePresentationStore.getState().created.some((x) => x.id === id)).toBe(true);
    useAppStore.getState().updateTask(id, { title: 'Ukázkový úkol – upravený' });
    expect(useAppStore.getState().tasks.find((t) => t.id === id)?.title).toBe('Ukázkový úkol – upravený');
    usePresentationStore.getState().setMasked(false);
    expect(useAppStore.getState().tasks.some((t) => t.id === id)).toBe(false);
    expect(usePresentationStore.getState().created).toHaveLength(0);
  });
});
