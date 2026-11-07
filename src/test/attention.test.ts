import { describe, expect, it } from 'vitest';
import type { Requirement, Subject, Task } from '../types';
import { attentionCount, buildAttention, type AttentionInput } from '../lib/attention';

const now = new Date(2026, 10, 6, 13, 0);
const subject = { id: 's1', name: 'Mediální studia' } as Subject;
const req = (id: string, deadline: Date, done = false): Requirement => ({ id, subjectId: 's1', title: `Úkol ${id}`, type: 'assignment', weight: 0, deadline: deadline.toISOString(), done, subtasks: [], source: 'manual', createdAt: now.toISOString() });
const task = (id: string, due: string, done = false): Task => ({ id, title: `Vlastní ${id}`, due, done, source: 'manual', createdAt: now.toISOString() }) as Task;
const base = (over: Partial<AttentionInput> = {}): AttentionInput => ({ now, requirements: [], tasks: [], subjects: [subject], milestones: [], countdowns: [], connections: [], ...over });

describe('co je potřeba udělat', () => {
  it('odchod brzy je „teď“, za hodinu „dnes“', () => {
    const soon = buildAttention(base({ leave: { at: new Date(2026, 10, 6, 13, 10), title: 'Seminář', start: new Date(2026, 10, 6, 14, 0), place: 'Hollar' } }));
    expect(soon[0]).toMatchObject({ kind: 'leave', level: 'now', title: 'Vyrazte ve 13:10 (za 10 min)' });
    const later = buildAttention(base({ leave: { at: new Date(2026, 10, 6, 14, 0), title: 'Přednáška', start: new Date(2026, 10, 6, 15, 0) } }));
    expect(later[0].level).toBe('today');
    expect(buildAttention(base({ leave: { at: new Date(2026, 10, 6, 18, 0), title: 'X', start: new Date(2026, 10, 6, 19, 0) } }))).toHaveLength(0);
  });

  it('termíny: po splatnosti, dnes, tento týden; hotové a vzdálené ne', () => {
    const items = buildAttention(
      base({
        requirements: [req('late', new Date(2026, 10, 5, 23, 59)), req('today', new Date(2026, 10, 6, 23, 59)), req('soon', new Date(2026, 10, 9, 12, 0)), req('done', new Date(2026, 10, 6, 20, 0), true), req('far', new Date(2026, 11, 20, 12, 0)), req('ancient', new Date(2026, 8, 1))],
      }),
    );
    expect(items.map((i) => [i.id, i.level])).toEqual([
      ['req|late', 'now'],
      ['req|today', 'today'],
      ['req|soon', 'soon'],
    ]);
    expect(items[0].title).toBe('Po termínu: Úkol late');
    expect(items[1].detail).toBe('Mediální studia · do dnes 23:59');
    expect(items[1].action).toMatchObject({ run: 'complete-requirement', targetId: 'today' });
  });

  it('úkol na celý den platí do půlnoci', () => {
    const items = buildAttention(base({ tasks: [task('t1', '2026-11-06'), task('t2', '2026-11-05'), task('t3', '2026-11-06', true)] }));
    expect(items.map((i) => [i.id, i.level, i.kind])).toEqual([
      ['task|t2', 'now', 'overdue'],
      ['task|t1', 'today', 'task'],
    ]);
  });

  it('propojení s potížemi, chyba synchronizace, harmonogram a odpočty', () => {
    const items = buildAttention(
      base({
        connections: [
          { id: 'google', title: 'Google', state: 'attention', detail: '' },
          { id: 'sis', title: 'SIS', state: 'connected', detail: '' },
        ],
        syncError: 'Bez připojení',
        milestones: [
          { id: 'm1', title: 'Začátek zkouškového', category: 'exam', start: '2026-11-09', allDay: true, source: 'parser' },
          { id: 'm2', title: 'Imatrikulace', category: 'event', start: '2026-11-06', allDay: true, source: 'parser' },
          { id: 'm3', title: 'Daleko', category: 'event', start: '2027-01-20', allDay: true, source: 'parser' },
        ] as AttentionInput['milestones'],
        countdowns: [{ id: 'c1', title: 'Státnice', at: '2026-11-06', createdAt: '' }],
        needsProfile: true,
      }),
    );
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId['conn|google'].action?.run).toBe('reconnect-google');
    expect(byId['conn|sis']).toBeUndefined();
    expect(byId['sync|account'].level).toBe('today');
    expect(byId['ms|m1'].title).toBe('Za 3 dny: Začátek zkouškového');
    expect(byId['ms|m2'].title).toBe('Dnes: Imatrikulace');
    expect(byId['ms|m3']).toBeUndefined();
    expect(byId['cd|c1'].title).toBe('Dnes: Státnice');
    expect(items[items.length - 1].id).toBe('profile');
  });

  it('zvonek počítá jen „teď“ a „dnes“ a respektuje odložení', () => {
    const items = buildAttention(base({ requirements: [req('a', new Date(2026, 10, 6, 15, 0)), req('b', new Date(2026, 10, 8, 12, 0))] }));
    expect(attentionCount(items, {}, now)).toBe(1);
    expect(attentionCount(items, { 'req|a': new Date(2026, 10, 6, 16, 0).toISOString() }, now)).toBe(0);
    expect(attentionCount(items, { 'req|a': new Date(2026, 10, 6, 12, 0).toISOString() }, now)).toBe(1);
  });
});
