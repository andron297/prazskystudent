import { describe, expect, it } from 'vitest';
import type { Itinerary, Requirement } from '../types';
import { explainItinerary, planJourney } from '../lib/transitPlanner';
import { requirementProgress, subjectProgress, guessRequirementType } from '../lib/progress';
import { DEFAULT_BUILDINGS, extractRoom, resolveBuilding } from '../lib/buildings';
import { deadlineUrgency, transitStatusFromSeconds } from '../lib/urgency';
import { formatCountdown, formatRelative, plural, shiftByDays } from '../lib/dates';
import { foldDiacritics } from '../lib/text';
import { walkingMinutes } from '../lib/geo';

const base = new Date('2026-11-03T12:05:00Z'); // 13:05 v Praze

function itinerary(id: string, leaveMin: number, departMin: number, arriveMin: number, extra: Partial<Itinerary> = {}): Itinerary {
  const at = (m: number) => new Date(base.getTime() + m * 60_000).toISOString();
  return {
    id,
    leaveAt: at(leaveMin),
    departAt: at(departMin),
    arriveAt: at(arriveMin),
    walkToStopMinutes: departMin - leaveMin,
    walkFromStopMinutes: 4,
    transfers: 0,
    source: 'demo',
    legs: [
      { kind: 'walk', minutes: departMin - leaveMin, from: 'Poloha', to: 'Vypich' },
      {
        kind: 'ride',
        line: '22',
        mode: 'tram',
        headsign: 'Nádraží Hostivař',
        fromStop: 'Vypich',
        toStop: 'Národní divadlo',
        scheduledDeparture: at(departMin - 2),
        predictedDeparture: at(departMin),
        scheduledArrival: at(arriveMin - 6),
        predictedArrival: at(arriveMin - 4),
        delaySeconds: 120,
        isAirConditioned: id !== 'b',
        isWheelchairAccessible: id !== 'c',
      },
      { kind: 'walk', minutes: 4, from: 'Národní divadlo', to: 'Hollar' },
    ],
    ...extra,
  };
}

describe('zpětný výpočet trasy', () => {
  const eventStart = new Date(base.getTime() + 55 * 60_000); // 14:00
  const its = [
    itinerary('a', 2, 8, 34),
    itinerary('b', 10, 16, 42),
    itinerary('c', 18, 24, 50), // příchod 13:55 → přesně na hraně
    itinerary('d', 26, 32, 58), // pozdě
  ];

  it('doporučí nejpozdější spoj s rezervou z nastavení, dřívější schová', () => {
    const plan = planJourney({ now: base, eventStart, bufferMinutes: 5, itineraries: its });
    expect(plan.recommended?.id).toBe('c');
    expect(plan.lastCall?.id).toBe('c');
    expect(plan.bufferMet).toBe(true);
    expect(plan.upcoming.map((i) => i.id)).toEqual(['c']);
    expect(plan.earlier.map((i) => i.id)).toEqual(['b', 'a']);
    expect(plan.status).toBe('prepare');
    expect(plan.slackMinutes).toBe(2);

    const roomy = planJourney({ now: base, eventStart, bufferMinutes: 10, itineraries: its });
    expect(roomy.recommended?.id).toBe('b');
    expect(roomy.lastCall?.id).toBe('c');
    expect(roomy.upcoming.map((i) => i.id)).toEqual(['b', 'c']);
    expect(roomy.earlier.map((i) => i.id)).toEqual(['a']);
  });

  it('když rezerva už nejde dodržet, zbývá poslední možný spoj', () => {
    const later = new Date(base.getTime() + 11 * 60_000);
    const plan = planJourney({ now: later, eventStart, bufferMinutes: 10, itineraries: its });
    expect(plan.bufferMet).toBe(false);
    expect(plan.recommended?.id).toBe('c');
    expect(planJourney({ now: base, eventStart, bufferMinutes: 10, minMarginMinutes: 0, itineraries: [...its, itinerary('e', 27, 33, 54)] }).lastCall?.id).toBe('e');
  });

  it('turns red under 10 minutes and missed when nothing fits', () => {
    const later = new Date(base.getTime() + 12 * 60_000);
    expect(planJourney({ now: later, eventStart, bufferMinutes: 5, itineraries: its }).status).toBe('critical');
    // Odchod minul o minutu, ale tramvaj jede až za 5 min – svižnou chůzí se stihne, není to „ujelo“.
    const hurry = planJourney({ now: new Date(base.getTime() + 19 * 60_000), eventStart, bufferMinutes: 5, itineraries: its });
    expect(hurry.status).toBe('critical');
    expect(hurry.recommended?.id).toBe('c');
    // Tramvaj odjíždí za 2,5 min a cesta na zastávku trvá 6 min – to už opravdu nejde.
    const missed = planJourney({ now: new Date(base.getTime() + 21.5 * 60_000), eventStart, bufferMinutes: 5, itineraries: its });
    expect(missed.status).toBe('missed');
    expect(missed.fastestLate?.id).toBe('d');
    expect(missed.lateByMinutes).toBe(3);
  });

  it('respects accessibility and AC preferences', () => {
    const plan = planJourney({ now: base, eventStart, bufferMinutes: 5, itineraries: its, accessibleOnly: true });
    expect(plan.lastCall?.id).toBe('b');
    const ac = planJourney({ now: base, eventStart, bufferMinutes: 10, itineraries: its, preferAirConditioned: true });
    expect(ac.recommended?.id).toBe('a');
  });

  it('explains the math step by step', () => {
    const steps = explainItinerary(its[2], eventStart, 5);
    expect(steps[0].label).toBe('Začátek výuky');
    expect(steps.at(-1)?.label).toContain('Vyrazit');
    expect(steps.find((s) => s.emphasis)?.detail).toContain('2 min zpoždění');
  });

  it('classifies urgency thresholds', () => {
    expect(transitStatusFromSeconds(21 * 60)).toBe('calm');
    expect(transitStatusFromSeconds(15 * 60)).toBe('prepare');
    expect(transitStatusFromSeconds(9 * 60)).toBe('critical');
  });
});

describe('progress předmětů', () => {
  const req = (weight: number, subtasks: boolean[], done = false): Requirement => ({
    id: Math.random().toString(),
    subjectId: 's',
    title: 'x',
    type: 'assignment',
    weight,
    done,
    subtasks: subtasks.map((d, i) => ({ id: String(i), title: String(i), done: d })),
    source: 'manual',
    createdAt: base.toISOString(),
  });

  it('computes requirement progress from subtasks', () => {
    expect(requirementProgress(req(40, [true, true, true, false, false, false]))).toBe(0.5);
    expect(requirementProgress(req(10, [], true))).toBe(1);
  });

  it('computes weighted subject progress', () => {
    const p = subjectProgress([req(40, [true, true, true, false, false, false]), req(20, [true, false, false]), req(15, [], true), req(25, [false])]);
    expect(p.percent).toBe(42);
    expect(p.completed).toBe(1);
  });

  it('guesses requirement types', () => {
    expect(guessRequirementType('Průběžný test')).toBe('test');
    expect(guessRequirementType('Seminární práce')).toBe('assignment');
    expect(guessRequirementType('Referát: volební systém')).toBe('presentation');
    expect(guessRequirementType('Závěrečná zkouška')).toBe('exam');
    expect(guessRequirementType('Zkouškové období')).not.toBe('exam');
  });
});

describe('budovy a lokace', () => {
  it('extracts room codes', () => {
    expect(extractRoom('H212 (Hollar)')).toBe('H212');
    expect(extractRoom('Areál Jinonice, posluchárna J2017')).toBe('J2017');
  });

  it('resolves buildings by alias, room pattern and custom mapping', () => {
    expect(resolveBuilding('Smetanovo nábř. 6, H108', DEFAULT_BUILDINGS).building?.id).toBe('hollar');
    expect(resolveBuilding('J3093', DEFAULT_BUILDINGS)).toMatchObject({ room: 'J3093', matchedBy: 'room' });
    expect(resolveBuilding('Učebna 314', DEFAULT_BUILDINGS).building).toBeUndefined();
    expect(resolveBuilding('Učebna 314', DEFAULT_BUILDINGS, { 'ucebna 314': 'opletalova' }).building?.id).toBe('opletalova');
  });
});

describe('pomocné funkce', () => {
  it('formats Czech relative times and countdowns', () => {
    const now = new Date(2026, 10, 3, 13, 5);
    expect(formatRelative(new Date(2026, 10, 3, 14, 0), now)).toBe('za 55 min');
    expect(formatRelative(new Date(2026, 10, 4, 9, 30), now)).toBe('zítra v 9:30');
    expect(formatRelative(new Date(2026, 10, 8, 9, 30), now)).toBe('za 5 dní');
    expect(formatCountdown(492)).toBe('08:12');
    expect(formatCountdown(3723)).toBe('1:02:03');
    expect(plural(3, ['den', 'dny', 'dní'])).toBe('dny');
  });

  it('classifies deadline urgency', () => {
    const now = new Date(2026, 10, 3, 12, 0);
    expect(deadlineUrgency(new Date(2026, 10, 3, 23, 59), now)).toBe('critical');
    expect(deadlineUrgency(new Date(2026, 10, 5, 23, 59), now)).toBe('prepare');
    expect(deadlineUrgency(new Date(2026, 10, 8, 23, 59), now)).toBe('soon');
    expect(deadlineUrgency(new Date(2026, 10, 20, 23, 59), now)).toBe('calm');
    expect(deadlineUrgency(new Date(2026, 10, 2, 23, 59), now)).toBe('overdue');
  });

  it('shifts dates by days keeping wall time across DST', () => {
    const iso = new Date(2026, 9, 20, 14, 0).toISOString();
    const shifted = new Date(shiftByDays(iso, 14));
    expect(shifted.getHours()).toBe(14);
    expect(shiftByDays('2026-10-31', 1)).toBe('2026-11-01');
  });

  it('folds diacritics preserving length', () => {
    const s = 'Příliš žluťoučký kůň – Říjen';
    expect(foldDiacritics(s)).toBe('prilis zlutoucky kun – rijen');
    expect(foldDiacritics(s).length).toBe(s.length);
  });

  it('estimates walking time', () => {
    const m = walkingMinutes({ lat: 50.0818, lng: 14.3422 }, { lat: 50.0806, lng: 14.3478 });
    expect(m).toBeGreaterThanOrEqual(5);
    expect(m).toBeLessThanOrEqual(9);
  });
});
