import { describe, expect, it } from 'vitest';
import type { Milestone, ScheduleEvent } from '../types';
import { itemsOnDay, layoutDay, monthGrid, phaseOn, planItems } from '../lib/plan';

const ev = (id: string, start: string, end: string, extra: Partial<ScheduleEvent> = {}): ScheduleEvent => ({ id, title: id, kind: 'seminar', start, end, source: 'sis', ...extra });
const ms = (id: string, category: Milestone['category'], start: string, end?: string): Milestone => ({ id, title: id, category, start, end, allDay: true, source: 'parser' });

describe('plán', () => {
  const data = {
    events: [ev('a', '2026-11-09T08:00:00Z', '2026-11-09T09:30:00Z'), ev('b', '2026-11-09T09:00:00Z', '2026-11-09T10:00:00Z'), ev('c', '2026-11-09T12:00:00Z', '2026-11-09T13:00:00Z')],
    tasks: [{ id: 't', title: 'Esej', due: '2026-11-09', done: false, source: 'manual' as const, createdAt: '', updatedAt: '' }],
    requirements: [],
    milestones: [ms('vyuka', 'teaching', '2026-09-28', '2027-01-08'), ms('rd', 'holiday', '2026-11-17')],
  };
  it('položky dne a překrývání do sloupců', () => {
    const items = planItems(data, new Date('2026-11-09T00:00:00'), new Date('2026-11-10T00:00:00'));
    const day = itemsOnDay(items, new Date('2026-11-09T12:00:00'));
    expect(day.map((i) => i.kind).sort()).toEqual(['class', 'class', 'class', 'milestone', 'task']);
    const boxes = layoutDay(day, new Date('2026-11-09T12:00:00'));
    const a = boxes.find((b) => b.item.key === 'event:a')!;
    const b = boxes.find((x) => x.item.key === 'event:b')!;
    const c = boxes.find((x) => x.item.key === 'event:c')!;
    expect(a.cols).toBe(2);
    expect(a.col).not.toBe(b.col);
    expect(c.cols).toBe(1);
  });
  it('fáze dne: rektorský den přebíjí výuku', () => {
    expect(phaseOn(data.milestones, new Date('2026-11-16T12:00:00'))).toBe('teaching');
    expect(phaseOn(data.milestones, new Date('2026-11-17T12:00:00'))).toBe('holiday');
  });
  it('měsíční mřížka začíná pondělím', () => {
    const cells = monthGrid(new Date('2026-11-15T12:00:00'));
    expect(cells[0].getDay()).toBe(1);
    expect(cells.length % 7).toBe(0);
    expect(cells.some((d) => d.getDate() === 30 && d.getMonth() === 10)).toBe(true);
  });
});
