import { describe, expect, it } from 'vitest';
import type { Itinerary, ScheduleEvent } from '../types';
import { countdownStart, servesEvent } from '../lib/transitWindow';

const ev = (id: string, start: string, end: string): ScheduleEvent => ({ id, title: id, start, end } as unknown as ScheduleEvent);
const trip = (leaveAt: string, arriveAt: string): Itinerary => ({ id: `${leaveAt}-${arriveAt}`, leaveAt, arriveAt, legs: [] } as unknown as Itinerary);

describe('Odpočet odchodu a zvolený spoj', () => {
  const lecture = ev('lecture', '2026-11-09T09:40:00+01:00', '2026-11-09T11:10:00+01:00');

  it('odpočet začne nejdřív 4 hodiny předem', () => {
    expect(countdownStart(lecture, [lecture]).toISOString()).toBe(new Date('2026-11-09T05:40:00+01:00').toISOString());
  });

  it('po předchozí akci až 10 minut před jejím koncem', () => {
    const before = ev('seminar', '2026-11-09T08:00:00+01:00', '2026-11-09T09:30:00+01:00');
    expect(countdownStart(lecture, [before, lecture]).toISOString()).toBe(new Date('2026-11-09T09:20:00+01:00').toISOString());
  });

  it('se zvoleným dřívějším spojem začne půl hodiny před jeho odchodem', () => {
    const early = trip('2026-11-09T05:00:00+01:00', '2026-11-09T05:35:00+01:00');
    expect(countdownStart(lecture, [lecture], early).toISOString()).toBe(new Date('2026-11-09T04:30:00+01:00').toISOString());
  });

  it('k výuce patří jen spoj, se kterým dorazíte včas a ne o půl dne dřív', () => {
    expect(servesEvent(trip('2026-11-09T01:08:00+01:00', '2026-11-09T01:37:00+01:00'), lecture)).toBe(false);
    expect(servesEvent(trip('2026-11-09T08:55:00+01:00', '2026-11-09T09:20:00+01:00'), lecture)).toBe(true);
    expect(servesEvent(trip('2026-11-09T09:20:00+01:00', '2026-11-09T09:48:00+01:00'), lecture)).toBe(true);
    expect(servesEvent(trip('2026-11-09T09:30:00+01:00', '2026-11-09T09:55:00+01:00'), lecture)).toBe(false);
  });
});
