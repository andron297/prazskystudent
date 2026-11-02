import { describe, expect, it } from 'vitest';
import { DEFAULT_BUILDINGS, LOCATION_PRESETS } from '../lib/buildings';
import { planJourney } from '../lib/transitPlanner';
import { planDemoItineraries, simulateDepartureBoard } from '../services/demo/transitSim';
import { createDemoSeed } from '../services/demo/seed';
import { DemoMoodleClient } from '../services/demo/moodleDemo';
import { syncMoodle } from '../services/moodleSync';
import { buildDemoIcs, sampleHarmonogram, sampleSyllabus } from '../services/demo/samples';
import { parseIcs } from '../lib/ics';
import { buildIcsImport } from '../lib/icsImport';
import { parseScheduleText } from '../lib/scheduleTextParser';
import { subjectProgress } from '../lib/progress';

const hollar = DEFAULT_BUILDINGS.find((b) => b.id === 'hollar')!;
const jinonice = DEFAULT_BUILDINGS.find((b) => b.id === 'jinonice')!;
const hvezda = LOCATION_PRESETS.find((p) => p.id === 'hvezda')!;
const kajetanka = LOCATION_PRESETS.find((p) => p.id === 'kajetanka')!;
const now = new Date(2026, 10, 3, 13, 5); // úterý 13:05
const eventStart = new Date(2026, 10, 3, 14, 0);

describe('simulace PID', () => {
  it('generates realistic departure boards with live data', () => {
    const board = simulateDepartureBoard('Vypich', now.getTime(), now.getTime() + 30 * 60_000, now.getTime());
    const tram22 = board.filter((d) => d.line.shortName === '22');
    expect(tram22.length).toBeGreaterThanOrEqual(6);
    expect(tram22.some((d) => d.delaySeconds !== null)).toBe(true);
    expect(tram22.every((d) => typeof d.isAirConditioned === 'boolean')).toBe(true);
  });

  it('is deterministic for the same moment', () => {
    const a = planDemoItineraries({ origin: hvezda.coords, originLabel: 'x', building: hollar, nowMs: now.getTime(), untilMs: eventStart.getTime(), walkSpeed: 'normal' });
    const b = planDemoItineraries({ origin: hvezda.coords, originLabel: 'x', building: hollar, nowMs: now.getTime(), untilMs: eventStart.getTime(), walkSpeed: 'normal' });
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it('finds a last call and recommendation from Kolej Hvězda to Hollar', () => {
    const its = planDemoItineraries({ origin: hvezda.coords, originLabel: 'Kolej Hvězda', building: hollar, nowMs: now.getTime(), untilMs: eventStart.getTime() + 30 * 60_000, walkSpeed: 'normal' });
    expect(its.length).toBeGreaterThan(3);
    const plan = planJourney({ now, eventStart, bufferMinutes: 5, itineraries: its });
    expect(plan.lastCall).not.toBeNull();
    expect(plan.recommended).not.toBeNull();
    expect(new Date(plan.lastCall!.arriveAt).getTime()).toBeLessThanOrEqual(eventStart.getTime() - 3 * 60_000);
    expect(new Date(plan.recommended!.arriveAt).getTime()).toBeLessThanOrEqual(eventStart.getTime() - 5 * 60_000);
    expect(['calm', 'prepare', 'critical']).toContain(plan.status);
  });

  it('makes tram 22 the last call from Kolej Kajetánka (live delay + AC data)', () => {
    for (const day of [2, 3, 4, 5, 6]) {
      const n = new Date(2026, 10, day, 13, 5);
      const start = new Date(2026, 10, day, 14, 0);
      const its = planDemoItineraries({ origin: kajetanka.coords, originLabel: 'Kajetánka', building: hollar, nowMs: n.getTime(), untilMs: start.getTime() + 30 * 60_000, walkSpeed: 'normal' });
      const plan = planJourney({ now: n, eventStart: start, bufferMinutes: 5, itineraries: its });
      const ride = plan.lastCall?.legs.find((l) => l.kind === 'ride');
      expect(ride && ride.kind === 'ride' ? ride.line : null).toBe('22');
      expect(ride && ride.kind === 'ride' ? ride.delaySeconds : null).not.toBeNull();
    }
  });

  it('plans transfers to Jinonice (metro B)', () => {
    const its = planDemoItineraries({ origin: hvezda.coords, originLabel: 'Kolej Hvězda', building: jinonice, nowMs: now.getTime(), untilMs: now.getTime() + 120 * 60_000, walkSpeed: 'normal' });
    expect(its.some((i) => i.transfers === 1)).toBe(true);
    expect(its.every((i) => i.legs.at(-1)?.kind === 'walk')).toBe(true);
  });
});

describe('demo data a synchronizace', () => {
  it('seeds subjects with realistic progress', () => {
    const seed = createDemoSeed(now);
    expect(seed.subjects).toHaveLength(5);
    const stat = seed.requirements.filter((r) => r.subjectId === 'demo-stat');
    expect(subjectProgress(stat).percent).toBe(65);
    const todays = seed.events.filter((e) => new Date(e.start).toDateString() === now.toDateString());
    expect(todays.some((e) => e.buildingId === 'hollar' && new Date(e.start).getHours() === 14)).toBe(true);
    expect(seed.milestones.some((m) => m.category === 'exam-period')).toBe(true);
  });

  it('syncs the simulated Moodle without duplicating seeded items', async () => {
    const seed = createDemoSeed(now);
    const client = new DemoMoodleClient('https://dl1.cuni.cz', 'abc123abc123abc123abc123abc123ab', () => now);
    const result = await syncMoodle(client, seed, now);
    expect(result.stats.courses).toBe(4);
    expect(result.stats.newSubjects).toBe(1);
    expect(result.requirements.find((r) => r.externalId === 'moodle:assign:9001')?.subtasks.filter((s) => s.done)).toHaveLength(3);
    expect(result.stats.newRequirements).toBe(3); // DÚ 5, případová studie, kvíz
    expect(result.stats.newMaterials).toBe(5);
  }, 20_000);

  it('rejects an invalid token in the sandbox', async () => {
    const client = new DemoMoodleClient('https://dl1.cuni.cz', 'invalid', () => now);
    await expect(syncMoodle(client, { subjects: [], requirements: [], materials: [] }, now)).rejects.toThrow();
  });

  it('builds a demo ICS that maps onto demo subjects', () => {
    const seed = createDemoSeed(now);
    const cal = parseIcs(buildDemoIcs(now), { windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 11, 31) });
    const preview = buildIcsImport(cal, { subjects: seed.subjects, buildings: DEFAULT_BUILDINGS, aliases: {}, source: 'sis', now });
    expect(preview.newSubjects.map((s) => s.code)).toEqual(['JSB140']);
    expect(preview.unresolvedLocations).toEqual([]);
    expect(preview.events.length).toBeGreaterThan(20);
  });

  it('parses the bundled samples', () => {
    expect(parseScheduleText(sampleHarmonogram(now), { mode: 'harmonogram', referenceDate: now }).items.length).toBe(10);
    const syl = parseScheduleText(sampleSyllabus(now), { mode: 'syllabus', referenceDate: now });
    expect(syl.items.filter((i) => i.target === 'requirement').length).toBe(4);
  });
});
