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
import { WALK_RELUCTANCE } from './stopIndex';
import { transitStatusFromSeconds, type TransitStatus } from './urgency';

export interface PlanInput {
  now: Date;
  eventStart: Date;
  /** Kolik minut chce být student v budově předem – podle toho je doporučený spoj. */
  bufferMinutes: number;
  /** Nejmenší rezerva (dojít z vchodu do učebny), se kterou se to ještě stihne. */
  minMarginMinutes?: number;
  itineraries: Itinerary[];
  accessibleOnly?: boolean;
  preferAirConditioned?: boolean;
}

export interface TransitPlan {
  status: TransitStatus;
  /** Kdy být v budově podle nastavení (začátek − rezerva). */
  deadline: Date;
  /** Nejzazší příchod do budovy, kdy se to ještě stihne (začátek − minimální rezerva). */
  hardDeadline: Date;
  /** Nejpozdější spoj, kterým se to ještě stihne. */
  lastCall: Itinerary | null;
  /** Nejpozdější spoj, se kterým je student na místě s rezervou z nastavení. */
  recommended: Itinerary | null;
  /** Doporučený spoj opravdu dodrží rezervu (jinak už zbývají jen riskantnější spoje). */
  bufferMet: boolean;
  /** Doporučený a pozdější spoje, které to ještě stihnou (podle odchodu). */
  upcoming: Itinerary[];
  /** Dřívější spoje – víc času na místě (od nejpozdějšího). */
  earlier: Itinerary[];
  fastestLate: Itinerary | null;
  /** Do odchodu na doporučený spoj. */
  secondsToLeave: number | null;
  /** Do odchodu na poslední možný spoj. */
  secondsToLastCall: number | null;
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

export const DEFAULT_MIN_MARGIN = 3;

/**
 * „Nepohodlí“ spoje v minutách: chůze nad 6 min se počítá dvojnásob
 * (WALK_RELUCTANCE) a každý přestup jako 4 min. Doporučený spoj je ten, který
 * dovolí vyrazit nejpozději PO odečtení nepohodlí – ne autobus s přestupem
 * a čtvrthodinou pěšky, který ušetří dvě minuty.
 */
export function itineraryPenalty(it: Itinerary): number {
  const walk = it.legs.reduce((sum, l) => sum + (l.kind === 'walk' ? l.minutes : 0), 0);
  return Math.max(0, walk - 6) * (WALK_RELUCTANCE - 1) + it.transfers * 4;
}

/** Minuty, o které je student v budově před začátkem. */
export function minutesEarly(it: Itinerary, eventStart: Date): number {
  return Math.floor((eventStart.getTime() - ms(it.arriveAt)) / 60_000);
}

export function planJourney(input: PlanInput): TransitPlan {
  const nowMs = input.now.getTime();
  const startMs = input.eventStart.getTime();
  const buffer = Math.max(0, input.bufferMinutes);
  const minMargin = Math.min(buffer, Math.max(0, input.minMarginMinutes ?? DEFAULT_MIN_MARGIN));
  const deadline = new Date(startMs - buffer * 60_000);
  const hardDeadline = new Date(startMs - minMargin * 60_000);

  const pool = input.itineraries.filter(
    (it) => (!input.accessibleOnly || isAccessibleItinerary(it)) && ms(it.leaveAt) >= nowMs - 20_000,
  );
  // Od nejpozdějšího odchodu; při stejném odchodu dřív v cíli.
  const byLeaveDesc = (a: Itinerary, b: Itinerary) => ms(b.leaveAt) - ms(a.leaveAt) || ms(a.arriveAt) - ms(b.arriveAt);
  const reachable = pool.filter((it) => ms(it.arriveAt) <= hardDeadline.getTime());
  // Nesmyslně nepohodlné varianty (o hodně víc chůze/přestupů než nejlepší) vůbec nenabízet.
  const minPenalty = Math.min(Number.POSITIVE_INFINITY, ...reachable.map(itineraryPenalty));
  const feasible = reachable.filter((it) => itineraryPenalty(it) <= minPenalty + 8).sort(byLeaveDesc);
  const score = (it: Itinerary) => ms(it.leaveAt) - itineraryPenalty(it) * 60_000;

  const empty: TransitPlan = {
    status: 'no-data',
    deadline,
    hardDeadline,
    lastCall: null,
    recommended: null,
    bufferMet: false,
    upcoming: [],
    earlier: [],
    fastestLate: null,
    secondsToLeave: null,
    secondsToLastCall: null,
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
      lateByMinutes: fastestLate ? Math.max(1, Math.ceil((ms(fastestLate.arriveAt) - startMs) / 60_000)) : null,
    };
  }

  const lastCall = feasible[0];
  const withBuffer = feasible.filter((it) => ms(it.arriveAt) <= deadline.getTime()).sort((a, b) => score(b) - score(a) || ms(a.arriveAt) - ms(b.arriveAt));
  let recommended: Itinerary | null = withBuffer[0] ?? null;
  if (recommended && input.preferAirConditioned && firstRide(recommended)?.isAirConditioned !== true) {
    const base = recommended;
    const withAc = withBuffer.find((it) => firstRide(it)?.isAirConditioned === true && ms(base.leaveAt) - ms(it.leaveAt) <= 10 * 60_000);
    if (withAc) recommended = withAc;
  }
  const bufferMet = recommended !== null;
  if (!recommended) recommended = lastCall;

  const recLeave = ms(recommended.leaveAt);
  // Doporučený + pozdější stihnutelné spoje; dřívější (zbytečně brzy na místě) zvlášť.
  const upcoming = feasible
    .filter((it) => it.id === recommended!.id || ms(it.leaveAt) > recLeave)
    .sort((a, b) => ms(a.leaveAt) - ms(b.leaveAt))
    .slice(0, 8);
  const earlier = feasible.filter((it) => it.id !== recommended!.id && ms(it.leaveAt) <= recLeave && !upcoming.includes(it)).slice(0, 6);

  const secondsToLeave = (recLeave - nowMs) / 1000;
  const secondsToLastCall = (ms(lastCall.leaveAt) - nowMs) / 1000;
  // Stav (barvy, „vyraz“) se řídí doporučeným spojem; když ujel, posledním možným.
  return {
    status: transitStatusFromSeconds(secondsToLeave),
    deadline,
    hardDeadline,
    lastCall,
    recommended,
    bufferMet,
    upcoming,
    earlier,
    fastestLate: null,
    secondsToLeave,
    secondsToLastCall,
    secondsToDeparture: (ms(recommended.departAt) - nowMs) / 1000,
    secondsToRecommendedLeave: secondsToLeave,
    slackMinutes: Math.floor((hardDeadline.getTime() - ms(lastCall.arriveAt)) / 60_000),
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
  const m = it.margins ?? { prep: 0, early: 0, entry: 0, exit: 0 };
  const depMs = new Date(first.predictedDeparture).getTime();
  if (m.entry > 0) steps.push({ label: `Z ulice na nástupiště metra (${m.entry} min)`, time: new Date(depMs - (m.early + m.entry) * MIN_MS) });
  if (m.early > 0 && m.entry === 0) steps.push({ label: `Na zastávce s předstihem ${m.early} min`, time: new Date(depMs - m.early * MIN_MS) });
  steps.push({
    label: `Chůze ${it.walkToStopMinutes} min na zastávku ${first.fromStop}`,
    time: new Date(depMs - (m.early + m.entry + it.walkToStopMinutes) * MIN_MS),
  });
  steps.push({
    label: m.prep > 0 ? `Vyrazit – ${m.prep} min na obutí a cestu z domu` : 'Vyrazit',
    time: new Date(it.leaveAt),
    emphasis: true,
  });
  return steps;
}

const MIN_MS = 60_000;

/* ------------------------------------------------------------------ */
/* Realistické rezervy                                                 */
/* ------------------------------------------------------------------ */

export interface Margins {
  /** Odchod z domu (obout, zamknout, schody). */
  prep: number;
  /** Být na zastávce před odjezdem. */
  early: number;
  /** Metro: z ulice na nástupiště. */
  metroEntry: number;
  /** Metro: z nástupiště na ulici. */
  metroExit: number;
}

export const DEFAULT_MARGINS: Margins = { prep: 3, early: 1, metroEntry: 3, metroExit: 2 };

/**
 * Jízdní řád počítá s odjezdem „na minutu“. Reálně člověk potřebuje vyjít z domu,
 * být na zastávce chvíli předem a u metra sejít na nástupiště (a pak zase nahoru).
 * Google Routes chůzi ve stanicích už započítává, tam metro nepřidáváme.
 */
export function applyMargins(it: Itinerary, margins: Margins): Itinerary {
  if (it.margins) return it;
  const rides = rideLegs(it);
  const first = rides[0];
  const last = rides[rides.length - 1];
  const entry = first?.mode === 'metro' && it.source !== 'google' ? margins.metroEntry : 0;
  const exit = last?.mode === 'metro' && it.source !== 'google' ? margins.metroExit : 0;
  const early = first && it.source !== 'estimate' ? margins.early : 0;
  const prep = margins.prep;
  return {
    ...it,
    leaveAt: new Date(ms(it.leaveAt) - (prep + early + entry) * MIN_MS).toISOString(),
    arriveAt: new Date(ms(it.arriveAt) + exit * MIN_MS).toISOString(),
    margins: { prep, early, entry, exit },
  };
}

/**
 * Stejný fyzický spoj (stejné tripId) bývá dostupný z více zastávek v okolí.
 * Necháme jen variantu, se kterou se dá vyrazit nejpozději (nejkratší chůze).
 */
export function dedupeByTrip(itineraries: Itinerary[]): Itinerary[] {
  const best = new Map<string, Itinerary>();
  const rest: Itinerary[] = [];
  for (const it of itineraries) {
    const trips = rideLegs(it).map((r) => r.tripId);
    if (trips.length === 0 || trips.some((t) => !t)) {
      rest.push(it);
      continue;
    }
    const key = trips.join('>');
    const prev = best.get(key);
    if (!prev || ms(it.leaveAt) > ms(prev.leaveAt) || (ms(it.leaveAt) === ms(prev.leaveAt) && ms(it.arriveAt) < ms(prev.arriveAt))) best.set(key, it);
  }
  return [...best.values(), ...rest];
}

/* ------------------------------------------------------------------ */
/* Výběr spoje                                                         */
/* ------------------------------------------------------------------ */

/** Vybraný spoj: volba uživatele, pokud je stále stihnutelná, jinak doporučený. */
export function pickItinerary(plan: TransitPlan | null, selectedId: string | null | undefined, now: Date): Itinerary | null {
  if (!plan || !plan.lastCall) return null;
  if (selectedId) {
    const chosen = plan.upcoming.find((it) => it.id === selectedId) ?? plan.earlier.find((it) => it.id === selectedId) ?? (plan.lastCall.id === selectedId ? plan.lastCall : undefined);
    if (chosen && ms(chosen.leaveAt) >= now.getTime() - 20_000) return chosen;
  }
  return plan.recommended ?? plan.lastCall;
}

/* ------------------------------------------------------------------ */
/* Cesta krok za krokem                                                */
/* ------------------------------------------------------------------ */

export interface RouteStep {
  kind: 'leave' | 'walk' | 'platform' | 'ride' | 'transfer' | 'exit' | 'arrive';
  time: Date;
  title: string;
  detail?: string;
  ride?: RideLeg;
}

/** Srozumitelný popis: kam jít, čím jet, kde vystoupit a kdy budeš na místě. */
export function routeSteps(it: Itinerary, eventStart: Date, buildingName: string, platformFor?: (ride: RideLeg) => string | undefined): RouteStep[] {
  const m = it.margins ?? { prep: 0, early: 0, entry: 0, exit: 0 };
  const steps: RouteStep[] = [];
  const leave = ms(it.leaveAt);
  const rides = rideLegs(it);
  if (rides.length === 0) {
    steps.push({ kind: 'leave', time: new Date(leave), title: 'Vyrazte', detail: m.prep ? `${m.prep} min na odchod z domu` : undefined });
    steps.push({ kind: 'walk', time: new Date(leave + m.prep * MIN_MS), title: `Pěšky do budovy ${buildingName}`, detail: `${it.walkToStopMinutes} min` });
    steps.push({ kind: 'arrive', time: new Date(it.arriveAt), title: `Na místě · ${buildingName}` });
    return steps;
  }
  const first = rides[0];
  const estimate = it.source === 'estimate';
  steps.push({ kind: 'leave', time: new Date(leave), title: m.prep ? 'Obujte se a vyrazte' : 'Vyrazte', detail: m.prep ? `${m.prep} min na odchod z domu` : undefined });
  const platform = first.platform ?? platformFor?.(first);
  steps.push({
    kind: 'walk',
    time: new Date(leave + m.prep * MIN_MS),
    title: `Jděte na zastávku ${first.fromStop}`,
    detail: [`${it.walkToStopMinutes} min pěšky`, platform ? `nástupiště ${platform}` : null].filter(Boolean).join(' · '),
  });
  if (m.entry > 0) {
    const depMs = new Date(first.predictedDeparture).getTime();
    steps.push({ kind: 'platform', time: new Date(depMs - (m.entry + m.early) * MIN_MS), title: 'Sejděte na nástupiště metra', detail: `${m.entry} min eskalátory` });
  }
  rides.forEach((r, i) => {
    if (i > 0) {
      const transferWalk = it.legs.find((l, li) => l.kind === 'walk' && li > it.legs.indexOf(rides[i - 1]) && li < it.legs.indexOf(r));
      steps.push({
        kind: 'transfer',
        time: new Date(rides[i - 1].predictedArrival),
        title: `Přestupte na ${modeNoun(r.mode)} ${r.line}`,
        detail: [r.fromStop, r.platform ? `nástupiště ${r.platform}` : null, transferWalk && transferWalk.kind === 'walk' ? `${transferWalk.minutes} min na přestupte` : null].filter(Boolean).join(' · '),
      });
    }
    const rideMin = Math.round((ms(r.predictedArrival) - ms(r.predictedDeparture)) / MIN_MS);
    steps.push({
      kind: 'ride',
      time: new Date(r.predictedDeparture),
      title: estimate ? 'Jeďte MHD (odhad bez jízdního řádu)' : `${capitalizeFirst(modeNoun(r.mode))} ${r.line} směr ${r.headsign}`,
      detail: estimate ? `asi ${rideMin} min` : [`${rideMin} min jízdy`, r.stopCount ? `${r.stopCount} ${r.stopCount === 1 ? 'zastávka' : r.stopCount < 5 ? 'zastávky' : 'zastávek'}` : null].filter(Boolean).join(' · '),
      ride: r,
    });
  });
  const last = rides[rides.length - 1];
  steps.push({
    kind: 'exit',
    time: new Date(last.predictedArrival),
    title: `Vystupte: ${last.toStop}`,
    detail: [m.exit ? `${m.exit} min z metra na ulici` : null, `${it.walkFromStopMinutes} min pěšky do budovy`].filter(Boolean).join(' · '),
  });
  const slack = Math.round((eventStart.getTime() - ms(it.arriveAt)) / MIN_MS);
  steps.push({ kind: 'arrive', time: new Date(it.arriveAt), title: `Na místě · ${buildingName}`, detail: `${slack} min do začátku` });
  return steps;
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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
