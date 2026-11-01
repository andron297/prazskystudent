import type { Building, Requirement, ScheduleEvent, Settings, Subject } from '../types';
import { resolveBuilding } from '../lib/buildings';

export function subjectMap(subjects: Subject[]): Map<string, Subject> {
  return new Map(subjects.map((s) => [s.id, s]));
}

export function buildingForEvent(event: ScheduleEvent, settings: Settings): { building?: Building; room?: string } {
  if (event.buildingId) {
    const building = settings.buildings.find((b) => b.id === event.buildingId);
    if (building) return { building, room: event.room };
  }
  const match = resolveBuilding(event.location, settings.buildings, settings.locationAliases);
  return { building: match.building, room: event.room ?? match.room };
}

/** Další událost (začíná po `now`) a právě probíhající událost. */
export function upcomingEvents(events: ScheduleEvent[], now: Date): { current?: ScheduleEvent; next?: ScheduleEvent } {
  const t = now.getTime();
  let current: ScheduleEvent | undefined;
  let next: ScheduleEvent | undefined;
  for (const e of events) {
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    if (start <= t && end > t && !current) current = e;
    if (start > t && (!next || start < new Date(next.start).getTime())) next = e;
  }
  return { current, next };
}

export function upcomingDeadlines(requirements: Requirement[], now: Date, isDone: (r: Requirement) => boolean, limit = 6): Requirement[] {
  const horizon = now.getTime() - 24 * 3_600_000;
  return requirements
    .filter((r) => r.deadline && new Date(r.deadline).getTime() >= horizon && !isDone(r))
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
    .slice(0, limit);
}
