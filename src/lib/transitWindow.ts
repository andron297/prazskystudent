/**
 * Kdy začít ukazovat odpočet odchodu: nejdřív 4 hodiny před výukou, a když
 * je před ní jiný program (výuka, schůzka), až ke konci něj – aby se odpočty
 * nepřekrývaly. Po skončení předchozí akce se cesta počítá z jejího místa.
 */
import type { Itinerary, ScheduleEvent } from '../types';

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

/**
 * Od kdy ukazovat odpočet na tuto akci. Když si student zvolil spoj, který
 * jede dřív, odpočet začne nejpozději půl hodiny před jeho odchodem.
 */
export function countdownStart(event: ScheduleEvent, events: ScheduleEvent[], chosen?: Itinerary | null): Date {
  const start = ms(event.start);
  let from = start - MAX_LEAD_MINUTES * 60_000;
  const prev = previousEvent(event, events);
  // Deset minut před koncem předchozí akce už je dobré vědět, kudy dál.
  if (prev) from = Math.max(from, ms(prev.end) - 10 * 60_000);
  from = Math.min(from, start - 15 * 60_000);
  if (chosen) from = Math.min(from, ms(chosen.leaveAt) - 30 * 60_000);
  return new Date(from);
}

/**
 * Patří spoj k této akci? Jen když s ním dorazíte nejvýš 5 hodin předem
 * (nebo nejvýš 10 minut po začátku). Spoj, který jede třeba už v noci,
 * je samostatná cesta, i když vede ke stejné budově.
 */
export function servesEvent(it: Itinerary, event: ScheduleEvent): boolean {
  const arrive = ms(it.arriveAt);
  const start = ms(event.start);
  return arrive <= start + 10 * 60_000 && arrive >= start - (MAX_LEAD_MINUTES + 60) * 60_000;
}
