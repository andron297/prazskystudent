/**
 * Zpětný výpočet cesty („Reverse Transit Math“).
 *
 *   příchod do učebny = začátek − rezerva
 *   nejpozdější výstup = příchod − chůze ze zastávky do budovy
 *   nejpozdější odjezd = výstup − jízda MHD (s aktuálním zpožděním)
 *   vyrazit = odjezd − chůze z GPS polohy na zastávku
 *
 * Itineráře (z dema, Golemia nebo Google Routes) už nesou predikované časy
 * včetně zpoždění; planner z nich vybere „poslední možný“ a „doporučený“ spoj.
 */
import type { Itinerary, RideLeg } from '../types';
import { formatTime } from './dates';
import { transitStatusFromSeconds, type TransitStatus } from './urgency';

export interface PlanInput {
  now: Date;
  eventStart: Date;
  bufferMinutes: number;
  comfortMinutes: number;
  itineraries: Itinerary[];
  accessibleOnly?: boolean;
  preferAirConditioned?: boolean;
}

export interface TransitPlan {
  status: TransitStatus;
  /** Kdy nejpozději být v učebně (začátek − rezerva). */
  deadline: Date;
  lastCall: Itinerary | null;
  recommended: Itinerary | null;
  /** Další stihnutelné spoje seřazené podle času odchodu. */
  upcoming: Itinerary[];
  fastestLate: Itinerary | null;
  secondsToLeave: number | null;
  secondsToDeparture: number | null;
  secondsToRecommendedLeave: number | null;
  slackMinutes: number | null;
  lateByMinutes: number | null;
}

const ms = (iso: string) => new Date(iso).getTime();

export function firstRide(it: Itinerary): RideLeg | undefined {
  return it.legs.find((l): l is RideLeg => l.kind === 'ride');
}

export function rideLegs(it: Itinerary): RideLeg[] {
  return it.legs.filter((l): l is RideLeg => l.kind === 'ride');
}

export function isAccessibleItinerary(it: Itinerary): boolean {
  const rides = rideLegs(it);
  return rides.length > 0 && rides.every((r) => r.isWheelchairAccessible === true);
}

export function planJourney(input: PlanInput): TransitPlan {
  const nowMs = input.now.getTime();
  const deadline = new Date(input.eventStart.getTime() - input.bufferMinutes * 60_000);
  const comfortDeadline = deadline.getTime() - input.comfortMinutes * 60_000;

  const pool = input.itineraries.filter(
    (it) => (!input.accessibleOnly || isAccessibleItinerary(it)) && ms(it.leaveAt) >= nowMs - 20_000,
  );

  const feasible = pool
    .filter((it) => ms(it.arriveAt) <= deadline.getTime())
    .sort((a, b) => ms(b.leaveAt) - ms(a.leaveAt) || ms(a.arriveAt) - ms(b.arriveAt));

  const empty: TransitPlan = {
    status: 'no-data',
    deadline,
    lastCall: null,
    recommended: null,
    upcoming: [],
    fastestLate: null,
    secondsToLeave: null,
    secondsToDeparture: null,
    secondsToRecommendedLeave: null,
    slackMinutes: null,
    lateByMinutes: null,
  };

  if (feasible.length === 0) {
    if (input.itineraries.length === 0) return empty;
    const fastestLate = [...pool].sort((a, b) => ms(a.arriveAt) - ms(b.arriveAt))[0] ?? null;
    return {
      ...empty,
      status: 'missed',
      fastestLate,
      lateByMinutes: fastestLate ? Math.max(1, Math.ceil((ms(fastestLate.arriveAt) - input.eventStart.getTime()) / 60_000)) : null,
    };
  }

  const lastCall = feasible[0];
  const comfortable = feasible.filter((it) => ms(it.arriveAt) <= comfortDeadline);
  let recommended: Itinerary | null = comfortable[0] ?? null;
  if (recommended && input.preferAirConditioned) {
    const base = recommended;
    const withAc = comfortable.find(
      (it) => firstRide(it)?.isAirConditioned === true && ms(base.leaveAt) - ms(it.leaveAt) <= 10 * 60_000,
    );
    if (withAc) recommended = withAc;
  }
  if (!recommended) recommended = feasible.length > 1 ? feasible[1] : lastCall;

  const secondsToLeave = (ms(lastCall.leaveAt) - nowMs) / 1000;
  const upcoming = [...feasible].sort((a, b) => ms(a.leaveAt) - ms(b.leaveAt)).slice(0, 8);

  return {
    status: transitStatusFromSeconds(secondsToLeave),
    deadline,
    lastCall,
    recommended,
    upcoming,
    fastestLate: null,
    secondsToLeave,
    secondsToDeparture: (ms(lastCall.departAt) - nowMs) / 1000,
    secondsToRecommendedLeave: (ms(recommended.leaveAt) - nowMs) / 1000,
    slackMinutes: Math.floor((deadline.getTime() - ms(lastCall.arriveAt)) / 60_000),
    lateByMinutes: null,
  };
}

export interface MathStep {
  label: string;
  detail?: string;
  time: Date;
  emphasis?: boolean;
}

/** Rozpis zpětného výpočtu pro „Jak to počítám“. */
export function explainItinerary(it: Itinerary, eventStart: Date, bufferMinutes: number): MathStep[] {
  const rides = rideLegs(it);
  const first = rides[0];
  const last = rides[rides.length - 1];
  const steps: MathStep[] = [
    { label: 'Začátek výuky', time: eventStart },
    {
      label: `V učebně s rezervou ${bufferMinutes} min`,
      time: new Date(eventStart.getTime() - bufferMinutes * 60_000),
    },
  ];
  if (!first || !last) return steps;
  steps.push({
    label: `Příchod do budovy (chůze ${it.walkFromStopMinutes} min ze zastávky ${last.toStop})`,
    time: new Date(it.arriveAt),
  });
  steps.push({ label: `Výstup ${last.toStop}`, time: new Date(last.predictedArrival) });
  const delay = first.delaySeconds;
  steps.push({
    label: `Odjezd ${modeLabel(first.mode)} ${first.line} ze zastávky ${first.fromStop}`,
    detail:
      delay === null
        ? `jízdní řád ${formatTime(new Date(first.scheduledDeparture))}, bez online polohy`
        : delay >= 60
          ? `jízdní řád ${formatTime(new Date(first.scheduledDeparture))} + ${Math.floor(delay / 60)} min zpoždění`
          : 'jede načas',
    time: new Date(first.predictedDeparture),
    emphasis: true,
  });
  steps.push({
    label: `Vyrazit (chůze ${it.walkToStopMinutes} min na zastávku ${first.fromStop})`,
    time: new Date(it.leaveAt),
    emphasis: true,
  });
  return steps;
}

export function modeLabel(mode: string): string {
  switch (mode) {
    case 'tram':
      return 'tramvaje';
    case 'metro':
      return 'metra';
    case 'bus':
      return 'autobusu';
    case 'train':
      return 'vlaku';
    case 'trolleybus':
      return 'trolejbusu';
    case 'ferry':
      return 'přívozu';
    default:
      return 'spoje';
  }
}

export function modeNoun(mode: string): string {
  switch (mode) {
    case 'tram':
      return 'tramvaj';
    case 'metro':
      return 'metro';
    case 'bus':
      return 'autobus';
    case 'train':
      return 'vlak';
    case 'trolleybus':
      return 'trolejbus';
    case 'ferry':
      return 'přívoz';
    default:
      return 'spoj';
  }
}

/** „Poslední tramvaj“, „Poslední metro“, „Poslední autobus“… */
export function lastNounPhrase(mode: string): string {
  switch (mode) {
    case 'tram':
      return 'Poslední tramvaj';
    case 'metro':
      return 'Poslední metro';
    case 'bus':
      return 'Poslední autobus';
    case 'train':
      return 'Poslední vlak';
    case 'trolleybus':
      return 'Poslední trolejbus';
    case 'ferry':
      return 'Poslední přívoz';
    default:
      return 'Poslední spoj';
  }
}
