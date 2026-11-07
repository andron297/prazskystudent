/**
 * Kdy začít ukazovat odpočet odchodu: nejdřív 4 hodiny před výukou, a když
 * je před ní jiný program (výuka, schůzka), až ke konci něj – aby se odpočty
 * nepřekrývaly. Po skončení předchozí akce se cesta počítá z jejího místa.
 */
import type { ScheduleEvent } from '../types';

export const MAX_LEAD_MINUTES = 240;

const ms = (iso: string) => new Date(iso).getTime();

/** Poslední akce téhož dne, která skončí před začátkem této. */
export function previousEvent(event: ScheduleEvent, events: ScheduleEvent[]): ScheduleEvent | null {
  const start = ms(event.start);
  const dayStart = new Date(event.start);
  dayStart.setHours(0, 0, 0, 0);
  let best: ScheduleEvent | null = null;
  for (const e of events) {
    if (e.id === event.id) continue;
    if (e.allDay) continue;
    const end = ms(e.end);
    if (end > start || end <= dayStart.getTime() || ms(e.start) >= start) continue;
    if (!best || end > ms(best.end)) best = e;
  }
  return best;
}

/** Od kdy ukazovat odpočet na tuto akci. */
export function countdownStart(event: ScheduleEvent, events: ScheduleEvent[]): Date {
  const start = ms(event.start);
  let from = start - MAX_LEAD_MINUTES * 60_000;
  const prev = previousEvent(event, events);
  // Deset minut před koncem předchozí akce už je dobré vědět, kudy dál.
  if (prev) from = Math.max(from, ms(prev.end) - 10 * 60_000);
  return new Date(Math.min(from, start - 15 * 60_000));
}
