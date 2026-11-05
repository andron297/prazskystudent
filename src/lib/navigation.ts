/**
 * Navigace krok za krokem: z itineráře udělá fáze cesty (pěšky na zastávku,
 * jízda, pěšky do budovy) a z tvaru trasy pokyny „za 80 m odboč vlevo“.
 * Pokyny se počítají z geometrie (změna směru), názvy ulic z plánovače.
 */
import type { Itinerary, LatLng, RideLeg, WalkLeg, WalkStep } from '../types';
import { haversineMeters } from './geo';
import { bearing, cumulative, pathLength, pointAlong, turnAngle } from './polyline';

export type ManeuverType = 'depart' | 'straight' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'uturn' | 'stairs' | 'arrive';

export interface Maneuver {
  /** Vzdálenost od začátku úseku (m). */
  at: number;
  type: ManeuverType;
  street?: string;
}

export interface WalkPhase {
  kind: 'walk';
  path: LatLng[];
  cum: number[];
  length: number;
  maneuvers: Maneuver[];
  /** Kam jdu: zastávka (s nástupištěm) nebo budova. */
  target: { name: string; coords: LatLng; platform?: string; isStop: boolean };
  /** Kdy musím být u cíle (odjezd spoje nebo začátek výuky). */
  deadline?: string;
  /** Odhad plánovače (min). */
  minutes: number;
}

export interface RidePhase {
  kind: 'ride';
  ride: RideLeg;
  path: LatLng[];
  stops: { name: string; coords: LatLng; at?: string }[];
}

export type NavPhase = WalkPhase | RidePhase;

const DIR_MAP: Record<string, ManeuverType> = {
  SLIGHTLY_LEFT: 'slight-left',
  LEFT: 'left',
  HARD_LEFT: 'sharp-left',
  SLIGHTLY_RIGHT: 'slight-right',
  RIGHT: 'right',
  HARD_RIGHT: 'sharp-right',
  UTURN_LEFT: 'uturn',
  UTURN_RIGHT: 'uturn',
  STAIRS: 'stairs',
};

function classify(angle: number): ManeuverType | null {
  const a = Math.abs(angle);
  if (a < 30) return null;
  if (a > 160) return 'uturn';
  const side = angle < 0 ? 'left' : 'right';
  if (a < 55) return `slight-${side}` as ManeuverType;
  if (a < 125) return side as ManeuverType;
  return `sharp-${side}` as ManeuverType;
}

/** Ulice podle kroků plánovače: kroky jdou za sebou, každý má svou délku. */
function streetAt(steps: WalkStep[] | undefined, along: number): string | undefined {
  if (!steps?.length) return undefined;
  let acc = 0;
  for (const st of steps) {
    acc += st.distance;
    if (along <= acc + 3) return st.street;
  }
  return steps[steps.length - 1].street;
}

/**
 * Pokyny z geometrie. Chodníky se kroutí, proto se díváme na směr 20 m před
 * a 20 m za bodem a pokyn dáme jen na skutečné odbočce: při změně ulice od
 * 30°, uprostřed cesty až od 60°. Pokyny blíž než 25 m od sebe se sloučí.
 */
export function maneuversFor(path: LatLng[], steps?: WalkStep[]): Maneuver[] {
  const cum = cumulative(path);
  const length = cum[cum.length - 1] ?? 0;
  const out: Maneuver[] = [{ at: 0, type: 'depart', street: streetAt(steps, 1) }];
  if (path.length < 2 || length < 30) {
    out.push({ at: length, type: 'arrive' });
    return out;
  }
  const at = (x: number) => pointAlong(path, Math.max(0, Math.min(length, x)), cum);
  const angleAt = (x: number) => turnAngle(bearing(at(x - 20), at(x)), bearing(at(x), at(x + 20)));

  // Kandidáti: hranice ulic podle plánovače a ostré zlomy v geometrii.
  const candidates: { x: number; boundary: boolean; street?: string; dir?: string; stairs?: boolean }[] = [];
  if (steps?.length) {
    let acc = 0;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      if (i > 0 && acc > 8 && length - acc > 8) {
        const changed = (steps[i - 1].street ?? '') !== (st.street ?? '');
        if (changed || st.dir) candidates.push({ x: acc, boundary: true, street: st.street, dir: st.dir, stairs: st.dir === 'STAIRS' });
      }
      acc += st.distance;
    }
  }
  for (let i = 1; i < path.length - 1; i++) {
    const x = cum[i];
    if (x < 15 || length - x < 15) continue;
    if (Math.abs(angleAt(x)) >= 60) candidates.push({ x, boundary: false, street: streetAt(steps, x + 5) });
  }
  candidates.sort((a, b) => a.x - b.x);

  for (const c of candidates) {
    const angle = angleAt(c.x);
    let type: ManeuverType | null = c.stairs ? 'stairs' : (c.dir && DIR_MAP[c.dir]) || null;
    if (!type) type = Math.abs(angle) >= (c.boundary ? 30 : 60) ? classify(angle) : null;
    // Změna na pojmenovanou ulici bez odbočení → „pokračuj rovně do ulice …“
    if (!type && c.boundary && c.street && c.street !== streetAt(steps, c.x - 5)) type = 'straight';
    if (!type) continue;
    const m: Maneuver = { at: c.x, type, street: c.street };
    const last = out[out.length - 1];
    if (last.type !== 'depart' && c.x - last.at < 25) {
      const weight = (t: ManeuverType) => (t === 'straight' ? 0 : t.startsWith('slight') ? 1 : t === 'stairs' ? 2 : 3);
      if (weight(type) > weight(last.type) || (!last.street && m.street)) out[out.length - 1] = { ...m, street: m.street ?? last.street };
      continue;
    }
    out.push(m);
  }
  out.push({ at: length, type: 'arrive' });
  return out;
}

/** Fáze cesty z itineráře. Bez tvaru trasy se použije přímá čára (navigace „vzdušnou čarou“). */
export function buildPhases(it: Itinerary, origin: LatLng, building: { name: string; coords: LatLng }, eventStart?: string): NavPhase[] {
  const phases: NavPhase[] = [];
  let cursor: LatLng = origin;
  const legs = it.legs;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.kind === 'walk') {
      const nextRide = legs.slice(i + 1).find((l): l is RideLeg => l.kind === 'ride');
      const walk = leg as WalkLeg;
      const targetCoords = nextRide?.fromCoords ?? walk.toCoords ?? (nextRide ? undefined : building.coords);
      if (!targetCoords) continue;
      const path = walk.path && walk.path.length >= 2 ? walk.path : [walk.fromCoords ?? cursor, targetCoords];
      if (haversineMeters(path[0], path[path.length - 1]) < 5 && (walk.minutes ?? 0) === 0) {
        cursor = targetCoords;
        continue;
      }
      const cum = cumulative(path);
      phases.push({
        kind: 'walk',
        path,
        cum,
        length: pathLength(path),
        maneuvers: maneuversFor(path, walk.steps),
        target: nextRide ? { name: nextRide.fromStop, coords: targetCoords, platform: nextRide.platform, isStop: true } : { name: building.name, coords: targetCoords, isStop: false },
        deadline: nextRide ? nextRide.predictedDeparture : eventStart,
        minutes: walk.minutes,
      });
      cursor = targetCoords;
    } else {
      const ride = leg as RideLeg;
      phases.push({
        kind: 'ride',
        ride,
        path: ride.path && ride.path.length >= 2 ? ride.path : [ride.fromCoords ?? cursor, ...(ride.via?.map((v) => v.coords) ?? []), ride.toCoords ?? cursor],
        stops: [...(ride.via ?? []), ...(ride.toCoords ? [{ name: ride.toStop, coords: ride.toCoords, at: ride.predictedArrival }] : [])],
      });
      cursor = ride.toCoords ?? cursor;
    }
  }
  // Poslední úsek do budovy, pokud ho itinerář nemá (Golemio bez chůze na konci).
  const last = phases[phases.length - 1];
  if (last && last.kind === 'ride' && haversineMeters(cursor, building.coords) > 30) {
    const path = [cursor, building.coords];
    phases.push({ kind: 'walk', path, cum: cumulative(path), length: pathLength(path), maneuvers: maneuversFor(path), target: { name: building.name, coords: building.coords, isStop: false }, deadline: eventStart, minutes: 0 });
  }
  return phases;
}

/** Další pokyn a vzdálenost k němu. */
export function nextManeuver(maneuvers: Maneuver[], along: number): { maneuver: Maneuver; distance: number } {
  const next = maneuvers.find((m) => m.at > along + 4 && m.type !== 'depart') ?? maneuvers[maneuvers.length - 1];
  return { maneuver: next, distance: Math.max(0, next.at - along) };
}

const ACTION: Record<ManeuverType, string> = {
  depart: 'Vyrazte',
  straight: 'Pokračujte rovně',
  'slight-left': 'Mírně vlevo',
  left: 'Odbočte vlevo',
  'sharp-left': 'Ostře vlevo',
  'slight-right': 'Mírně vpravo',
  right: 'Odbočte vpravo',
  'sharp-right': 'Ostře vpravo',
  uturn: 'Otočte se',
  stairs: 'Schody',
  arrive: 'Jste u cíle',
};

export function formatDistance(m: number): string {
  if (m < 15) return 'teď';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Text pokynu: „Za 80 m odboč vlevo do ulice Vinohradská“. */
export function instructionText(m: Maneuver, distance: number, targetName?: string): { headline: string; detail?: string } {
  if (m.type === 'arrive') {
    return { headline: distance < 15 ? `Jste na místě${targetName ? ` – ${targetName}` : ''}` : `${formatDistance(distance)} do cíle`, detail: targetName };
  }
  const action = ACTION[m.type];
  const street = m.street ? (m.type === 'stairs' ? m.street : `do ulice ${m.street}`) : undefined;
  if (distance < 15) return { headline: `${action}${street ? ` ${street}` : ''}` };
  return { headline: `Za ${formatDistance(distance)} ${action.charAt(0).toLowerCase()}${action.slice(1)}`, detail: street ? capitalizeFirst(street) : undefined };
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const WALK_SPEED_MS: Record<'slow' | 'normal' | 'fast', number> = { slow: 1.1, normal: 1.35, fast: 1.6 };

/** Stihnu to? Rezerva v minutách (záporná = nestíhám). */
export function slackMinutes(remainingMeters: number, deadline: string | undefined, now: Date, speed: number): number | null {
  if (!deadline) return null;
  const eta = now.getTime() + (remainingMeters / speed) * 1000;
  return (new Date(deadline).getTime() - eta) / 60_000;
}
