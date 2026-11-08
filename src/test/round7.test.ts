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

  it('po předchozí výuce od jejího začátku (odpočty se nepřekrývají)', () => {
    const before = ev('seminar', '2026-11-09T08:00:00+01:00', '2026-11-09T09:30:00+01:00');
    expect(countdownStart(lecture, [before, lecture]).toISOString()).toBe(new Date('2026-11-09T08:00:00+01:00').toISOString());
  });

  it('krátké nebo online akce předtím odpočet neodkládají (žádné „ve 13:45“ u výuky ve 14:00)', () => {
    const at14 = ev('hollar', '2026-11-09T14:00:00+01:00', '2026-11-09T15:30:00+01:00');
    const point = ev('moodle', '2026-11-09T13:59:00+01:00', '2026-11-09T13:59:00+01:00');
    const online = { ...ev('online', '2026-11-09T12:20:00+01:00', '2026-11-09T13:55:00+01:00'), online: true } as ScheduleEvent;
    expect(countdownStart(at14, [point, online, at14]).toISOString()).toBe(new Date('2026-11-09T10:00:00+01:00').toISOString());
  });

  it('vždy aspoň hodinu předem', () => {
    const at14 = ev('hollar', '2026-11-09T14:00:00+01:00', '2026-11-09T15:30:00+01:00');
    const right = ev('seminar', '2026-11-09T13:30:00+01:00', '2026-11-09T13:55:00+01:00');
    expect(countdownStart(at14, [right, at14]).toISOString()).toBe(new Date('2026-11-09T13:00:00+01:00').toISOString());
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

import { spokenDistance, spokenInstruction, walkToStopSentence } from '../lib/navigation';
import type { RideLeg } from '../types';

describe('Hlasová navigace – čeština', () => {
  it('vzdálenost slovy ve 4. pádě (za čtyřicet metrů, ne za čtyřiceti)', () => {
    expect(spokenDistance(42)).toBe('čtyřicet metrů');
    expect(spokenDistance(150)).toBe('sto padesát metrů');
    expect(spokenDistance(204)).toBe('dvě stě metrů');
    expect(spokenDistance(620)).toBe('šest set metrů');
    expect(spokenDistance(1500)).toBe('jeden a půl kilometru');
    expect(spokenDistance(2100)).toBe('dva kilometry');
  });

  it('celé věty: odbočení, eskalátor do metra, na místě bez vzdálenosti', () => {
    expect(spokenInstruction({ at: 0, type: 'slight-left' }, 120)).toBe('Za sto dvacet metrů odbočte mírně vlevo.');
    expect(spokenInstruction({ at: 0, type: 'escalator-down', note: 'entrance' }, 40)).toBe('Za čtyřicet metrů sjeďte eskalátorem do metra.');
    expect(spokenInstruction({ at: 0, type: 'right', street: 'Spálená' }, 12)).toBe('Odbočte vpravo do ulice Spálená.');
  });

  it('přestup v metru', () => {
    const b = { kind: 'ride', mode: 'metro', line: 'B', headsign: 'Zličín', platform: '2', predictedDeparture: '2026-11-09T13:31:00+01:00', toStop: 'Anděl' } as unknown as RideLeg;
    const a = { kind: 'ride', mode: 'metro', line: 'A' } as unknown as RideLeg;
    expect(walkToStopSentence({ name: 'Můstek', isStop: true } as never, b, a)).toBe('Přestupte na metro B směr Zličín. Odjíždí ve 13:31 z koleje 2.');
  });
});
