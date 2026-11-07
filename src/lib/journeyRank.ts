/**
 * Výběr spojení: doporučený, nejjednodušší a nejrychlejší. Méně přestupů má
 * přednost před malou časovou úsporou (přestup „stojí“ 7 minut), za deště,
 * mrazu nebo vedra se víc počítá i chůze. Spoje, které už ze zastávky
 * odjely, se vůbec nenabízejí; ty, které se dají stihnout jen rychlejší
 * chůzí, se označí.
 */
import type { Itinerary, RideLeg } from '../types';

/** Kolik minut navíc „stojí“ jeden přestup. */
export const TRANSFER_MINUTES = 7;

export type Catchability = 'ok' | 'hurry' | 'gone';
export type JourneyBadge = 'recommended' | 'simplest' | 'fastest';

export interface RankContext {
  now: Date;
  /** Kdy nejpozději být v cíli (cesta na výuku); jinak se hledá co nejdřívější příjezd. */
  arriveBy?: Date | null;
  /** Čas, od kterého se hledá (odjezd „teď“ nebo zvolený čas). */
  from?: Date;
  /** Prší, mrzne nebo je vedro – chůze se počítá víc. */
  badWeather?: boolean;
}

const ms = (iso: string) => new Date(iso).getTime();

export function firstRideOf(it: Itinerary): RideLeg | undefined {
  return it.legs.find((l): l is RideLeg => l.kind === 'ride');
}

export function walkMinutesOf(it: Itinerary): number {
  return it.legs.reduce((sum, l) => sum + (l.kind === 'walk' ? l.minutes : 0), 0);
}

export function durationMinutesOf(it: Itinerary): number {
  return Math.max(0, Math.round((ms(it.arriveAt) - ms(it.leaveAt)) / 60_000));
}

/** Skutečný odjezd prvního spoje ze zastávky (se zpožděním). */
export function boardingTime(it: Itinerary): Date | null {
  const ride = firstRideOf(it);
  return ride ? new Date(ride.predictedDeparture) : null;
}

/**
 * Dá se spoj ještě stihnout?
 *  - ok: stačí vyrazit v doporučený čas (nebo později),
 *  - hurry: doporučený odchod už minul, ale rychlejší chůzí se to stihne,
 *  - gone: spoj už ze zastávky odjel (nebo na něj nejde doběhnout).
 */
export function catchability(it: Itinerary, now: Date): Catchability {
  const t = now.getTime();
  const leave = ms(it.leaveAt);
  const ride = firstRideOf(it);
  if (!ride) return leave >= t - 60_000 ? 'ok' : 'gone';
  const departure = ms(ride.predictedDeparture);
  if (departure < t - 20_000) return 'gone';
  if (leave >= t - 30_000) return 'ok';
  // Normálně mi cesta na zastávku trvá (odjezd − odchod); svižně to zvládnu asi za 70 %.
  const normal = Math.max(60_000, departure - leave);
  return departure - t >= normal * 0.7 ? 'hurry' : 'gone';
}

/** Nepohodlí v minutách: přestupy a chůze (za špatného počasí víc). */
export function comfortPenalty(it: Itinerary, badWeather = false): number {
  const walk = walkMinutesOf(it);
  const walkCost = badWeather ? Math.max(0, walk - 3) * 1.0 : Math.max(0, walk - 6) * 0.4;
  return it.transfers * TRANSFER_MINUTES + walkCost;
}

/** Celkové „skóre“ spoje (nižší = lepší). */
export function journeyScore(it: Itinerary, ctx: RankContext): number {
  const penalty = comfortPenalty(it, ctx.badWeather);
  if (ctx.arriveBy) {
    // Na výuku: rozhoduje doba cesty, pohodlí a jen mírně čekání na místě.
    const wait = Math.max(0, (ctx.arriveBy.getTime() - ms(it.arriveAt)) / 60_000);
    return durationMinutesOf(it) + penalty + wait * 0.35;
  }
  // Kamkoli: co nejdřív na místě (od zvoleného času), s ohledem na pohodlí.
  const from = (ctx.from ?? ctx.now).getTime();
  return Math.max(0, (ms(it.arriveAt) - from) / 60_000) + penalty;
}

/** Štítky pro seznam spojení. Jeden spoj může mít víc štítků. */
export function rankJourneys(list: Itinerary[], ctx: RankContext): Partial<Record<JourneyBadge, string>> {
  const pool = list.filter((it) => catchability(it, ctx.now) !== 'gone' && (!ctx.arriveBy || ms(it.arriveAt) <= ctx.arriveBy.getTime()));
  if (pool.length === 0) return {};
  const by = (f: (it: Itinerary) => number[]) =>
    [...pool].sort((a, b) => {
      const fa = f(a);
      const fb = f(b);
      for (let i = 0; i < fa.length; i++) if (fa[i] !== fb[i]) return fa[i] - fb[i];
      return 0;
    })[0];
  const recommended = by((it) => [journeyScore(it, ctx), ms(it.arriveAt)]);
  const simplest = by((it) => [it.transfers, walkMinutesOf(it), ms(it.arriveAt)]);
  const fastest = by((it) => [durationMinutesOf(it), ms(it.arriveAt)]);
  const out: Partial<Record<JourneyBadge, string>> = { recommended: recommended.id };
  // Nejjednodušší / nejrychlejší má smysl ukázat, jen když se od doporučeného liší, nebo když je v seznamu víc variant.
  if (pool.length > 1) {
    out.simplest = simplest.id;
    out.fastest = fastest.id;
  }
  return out;
}

export const BADGE_LABEL: Record<JourneyBadge, string> = {
  recommended: 'Doporučený',
  simplest: 'Nejjednodušší',
  fastest: 'Nejrychlejší',
};

/** Jeden spoj ze stejného vozu (stejná linka, zastávka a plánovaný odjezd) – pro spárování volby s živými daty. */
export function tripKey(it: Itinerary): string {
  const ride = firstRideOf(it);
  return ride ? `${ride.line}|${ride.fromStop}|${ride.scheduledDeparture.slice(0, 16)}` : `walk|${it.leaveAt.slice(0, 16)}`;
}
