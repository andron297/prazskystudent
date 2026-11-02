import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../lib/quickAdd';
import { DEFAULT_BUILDINGS } from '../lib/buildings';
import type { Subject } from '../types';

// Neděle 1. 11. 2026, 13:05 (Europe/Prague)
const now = new Date(2026, 10, 1, 13, 5);
const subjects: Subject[] = [
  { id: 's1', code: 'JSB012', name: 'Úvod do mediálních studií', color: 'indigo', source: 'manual', createdAt: now.toISOString() },
  { id: 's2', code: 'JSB065', name: 'Statistika pro sociální vědy', color: 'amber', source: 'manual', createdAt: now.toISOString() },
];
const ctx = { now, subjects, buildings: DEFAULT_BUILDINGS };
const local = (iso?: string) => (iso ? new Date(iso).toString().slice(0, 21) : undefined);

describe('rychlé zadání', () => {
  it('událost zítra v 18:00 s výchozí hodinou', () => {
    const r = parseQuickAdd('zítra 18:00 trénink', ctx);
    expect(r.kind).toBe('event');
    expect(r.title).toBe('Trénink');
    expect(local(r.start)).toBe('Mon Nov 02 2026 18:00');
    expect(local(r.end)).toBe('Mon Nov 02 2026 19:00');
    expect(r.tokens.map((t) => t.label)).toEqual(['zítra', '18:00']);
  });

  it('rozsah času, zkratka dne a místo s budovou', () => {
    const r = parseQuickAdd('pá 10-12 konzultace s Novákem @Hollar', ctx);
    expect(r.kind).toBe('event');
    expect(r.title).toBe('Konzultace s Novákem');
    expect(local(r.start)).toBe('Fri Nov 06 2026 10:00');
    expect(local(r.end)).toBe('Fri Nov 06 2026 12:00');
    expect(r.location).toBe('Hollar');
    expect(r.buildingId).toBe('hollar');
  });

  it('úkol s termínem „do pátku“, předmětem a prioritou', () => {
    const r = parseQuickAdd('esej do pátku #JSB012 !', ctx);
    expect(r.kind).toBe('task');
    expect(r.title).toBe('Esej');
    expect(r.due).toBe('2026-11-06');
    expect(r.subjectId).toBe('s1');
    expect(r.priority).toBe('high');
  });

  it('úkol s přesným termínem a časem', () => {
    const r = parseQuickAdd('Odevzdat kódovací knihu do 5. 11. 23:59 #stat', ctx);
    expect(r.kind).toBe('task');
    expect(r.title).toBe('Odevzdat kódovací knihu');
    expect(local(r.due)).toBe('Thu Nov 05 2026 23:59');
    expect(r.subjectId).toBe('s2');
  });

  it('úkol bez data', () => {
    const r = parseQuickAdd('koupit lítačku', ctx);
    expect(r).toMatchObject({ kind: 'task', title: 'Koupit lítačku', allDay: false });
    expect(r.due).toBeUndefined();
  });

  it('výslovný typ a celodenní událost', () => {
    const r = parseQuickAdd('událost: narozeniny Terky 14. listopadu', ctx);
    expect(r.kind).toBe('event');
    expect(r.explicitKind).toBe(true);
    expect(r.title).toBe('Narozeniny Terky');
    expect(r.allDay).toBe(true);
    expect(r.date).toBe('2026-11-14');
  });

  it('„od – do“, budova v textu a délka', () => {
    const r = parseQuickAdd('studovna v Jinonicích od 9 do 11:30', ctx);
    expect(r.kind).toBe('event');
    expect(r.buildingId).toBe('jinonice');
    expect(local(r.start)).toBe('Sun Nov 01 2026 09:00');
    expect(local(r.end)).toBe('Sun Nov 01 2026 11:30');
    const d = parseQuickAdd('ve středu ve 20 h kino na 2 h', ctx);
    expect(local(d.start)).toBe('Wed Nov 04 2026 20:00');
    expect(local(d.end)).toBe('Wed Nov 04 2026 22:00');
    expect(d.title).toBe('Kino');
  });

  it('relativní data', () => {
    expect(parseQuickAdd('zavolat babičce za 3 dny', ctx).due).toBe('2026-11-04');
    expect(parseQuickAdd('přečíst kapitolu příští týden', ctx).due).toBe('2026-11-02');
    expect(parseQuickAdd('úkol: dočíst Mannheima do příštího pátku', ctx).due).toBe('2026-11-06');
    expect(parseQuickAdd('prezentace 12.11.', ctx).date).toBe('2026-11-12');
  });
});
