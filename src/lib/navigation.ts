/**
 * Navigace krok za krokem: z itineráře udělá fáze cesty (pěšky na zastávku,
 * jízda, pěšky do budovy) a z tvaru trasy pokyny „za 80 m odboč vlevo“.
 * Pokyny se počítají z geometrie (změna směru), názvy ulic z plánovače.
 */
import type { Itinerary, LatLng, RideLeg, WalkLeg, WalkStep } from '../types';
import { haversineMeters } from './geo';
import { bearing, cumulative, pathLength, pointAlong, turnAngle } from './polyline';

export type ManeuverType =
  | 'depart'
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'uturn'
  | 'crossing'
  | 'stairs'
  | 'stairs-up'
  | 'stairs-down'
  | 'escalator'
  | 'escalator-up'
  | 'escalator-down'
  | 'elevator'
  | 'elevator-up'
  | 'elevator-down'
  | 'arrive';

export type CrossingKind = 'zebra' | 'signals' | 'unmarked';

export interface Maneuver {
  /** Vzdálenost od začátku úseku (m). */
  at: number;
  type: ManeuverType;
  street?: string;
  /** Přechod u pokynu (samostatný, nebo spojený s odbočením). */
  crossing?: CrossingKind;
  /** Přechod je dřív než odbočení („přejděte a odbočte“). */
  crossingFirst?: boolean;
  /** Vstup do metra / výstup z metra. */
  note?: 'entrance' | 'exit';
}

/** Co je která cesta na trase (z OpenStreetMap, viz services/wayInfo). */
export interface NavWayInfo {
  k: 'crossing' | 'steps' | 'escalator' | 'elevator' | 'sidewalk' | 'footway' | 'platform' | 'passage' | 'underground' | 'road';
  sig?: 1;
  zebra?: 1;
  u?: 1;
  name?: string;
}

export type NavWayMap = Record<number, NavWayInfo>;

const VERTICAL = new Set<ManeuverType>(['stairs', 'stairs-up', 'stairs-down', 'escalator', 'escalator-up', 'escalator-down', 'elevator', 'elevator-up', 'elevator-down']);
const TURNS = new Set<ManeuverType>(['slight-left', 'left', 'sharp-left', 'slight-right', 'right', 'sharp-right', 'uturn', 'straight']);
export const isVertical = (t: ManeuverType) => VERTICAL.has(t);

/** Schody / eskalátor / výtah a směr podle pater (když je plánovač zná). */
function verticalType(step: WalkStep, info: NavWayInfo | undefined, prevLevel: number, level: number): ManeuverType | null {
  const kind = step.dir === 'ELEVATOR' || info?.k === 'elevator' ? 'elevator' : info?.k === 'escalator' ? 'escalator' : step.dir === 'STAIRS' || info?.k === 'steps' ? 'stairs' : null;
  if (!kind) return null;
  const dir = level < prevLevel ? '-down' : level > prevLevel ? '-up' : '';
  return `${kind}${dir}` as ManeuverType;
}

export interface WalkPhase {
  kind: 'walk';
  path: LatLng[];
  cum: number[];
  length: number;
  maneuvers: Maneuver[];
  /** Kam jdu: zastávka (s nástupištěm) nebo budova. */
  target: { name: string; coords: LatLng; platform?: string; isStop: boolean; mode?: RideLeg['mode'] };
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
 * Pokyny z geometrie a z mapových dat. Chodníky se kroutí, proto se díváme na
 * směr 20 m před a 20 m za bodem a pokyn dáme jen na skutečné odbočce: při
 * změně ulice od 30°, uprostřed cesty až od 60°. Pokyny blíž než 25 m od sebe
 * se sloučí. Přechody, schody, eskalátory a výtahy (podle OpenStreetMap a pater
 * z plánovače) se nikdy nezahodí; vstup do metra a výstup z něj se pojmenuje.
 */
export function maneuversFor(path: LatLng[], rawSteps?: WalkStep[], ways?: NavWayMap, context: { toMetro?: boolean; fromMetro?: boolean } = {}): Maneuver[] {
  // Pod zemí a na nástupišti nejsou ulice (název nástupiště není „ulice Můstek“).
  const steps = rawSteps?.map((st) => {
    const info = st.way ? ways?.[st.way] : undefined;
    return st.street && ((st.level ?? 0) < 0 || info?.u || info?.k === 'platform') ? { ...st, street: undefined } : st;
  });
  const cum = cumulative(path);
  const length = cum[cum.length - 1] ?? 0;
  const out: Maneuver[] = [{ at: 0, type: 'depart', street: streetAt(steps, 1) }];
  if (path.length < 2 || length < 30) {
    out.push({ at: length, type: 'arrive' });
    return out;
  }
  const at = (x: number) => pointAlong(path, Math.max(0, Math.min(length, x)), cum);
  const angleAt = (x: number) => turnAngle(bearing(at(x - 20), at(x)), bearing(at(x), at(x + 20)));
  // Délky kroků plánovače nemusí přesně sedět na délku čáry – přepočet na geometrii.
  const stepTotal = steps?.reduce((sum, st) => sum + st.distance, 0) ?? 0;
  const scale = stepTotal > 0 ? length / stepTotal : 1;

  // Kandidáti: hranice ulic podle plánovače, přechody a schody z mapy a ostré zlomy v geometrii.
  const candidates: { x: number; boundary: boolean; street?: string; dir?: string; vertical?: ManeuverType; crossing?: CrossingKind; note?: Maneuver['note'] }[] = [];
  if (steps?.length) {
    let acc = 0;
    let prevLevel = 0;
    let wasUnderground = Boolean(context.fromMetro);
    let entered = false;
    let exited = false;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const info = st.way ? ways?.[st.way] : undefined;
      const level = st.level ?? 0;
      const x = Math.min(length, acc * scale);
      const vertical = verticalType(st, info, prevLevel, level);
      const crossing: CrossingKind | undefined = info?.k === 'crossing' && st.distance >= 2 ? (info.sig ? 'signals' : info.zebra ? 'zebra' : 'unmarked') : undefined;
      const underground = level < 0 || Boolean(info?.u);
      let note: Maneuver['note'];
      if (vertical && context.toMetro && !entered && !wasUnderground && (level < 0 || info?.u)) {
        note = 'entrance';
        entered = true;
      } else if (vertical && context.fromMetro && !exited && wasUnderground && level >= 0 && !info?.u) {
        note = 'exit';
        exited = true;
      }
      if (i > 0 && x > 8 && length - x > 8) {
        const changed = (steps[i - 1].street ?? '') !== (st.street ?? '');
        if (vertical || crossing) candidates.push({ x, boundary: true, street: st.street, vertical: vertical ?? undefined, crossing, note });
        else if (changed || st.dir) candidates.push({ x, boundary: true, street: st.street, dir: st.dir });
      } else if (i === 0 && vertical && note) {
        candidates.push({ x: Math.max(1, x), boundary: true, vertical, note });
      }
      if (vertical || st.distance > 3) wasUnderground = underground;
      prevLevel = level;
      acc += st.distance;
    }
  }
  for (let i = 1; i < path.length - 1; i++) {
    const x = cum[i];
    if (x < 15 || length - x < 15) continue;
    if (Math.abs(angleAt(x)) >= 60) candidates.push({ x, boundary: false, street: streetAt(steps, (x / scale) + 5) });
  }
  candidates.sort((a, b) => a.x - b.x);

  const weight = (t: ManeuverType) => (t === 'straight' ? 0 : t.startsWith('slight') ? 1 : TURNS.has(t) ? 3 : t === 'crossing' ? 4 : VERTICAL.has(t) ? 5 : 0);
  const semantic = (t: ManeuverType) => t === 'crossing' || VERTICAL.has(t);

  for (const c of candidates) {
    const angle = angleAt(c.x);
    let type: ManeuverType | null = c.vertical ?? (c.crossing ? 'crossing' : null) ?? ((c.dir && DIR_MAP[c.dir]) || null);
    if (!type) type = Math.abs(angle) >= (c.boundary ? 30 : 60) ? classify(angle) : null;
    // Změna na pojmenovanou ulici bez odbočení → „pokračuj rovně do ulice …“
    if (!type && c.boundary && c.street && c.street !== streetAt(steps, c.x / scale - 5)) type = 'straight';
    if (!type) continue;
    const m: Maneuver = { at: c.x, type, street: VERTICAL.has(type) || type === 'crossing' ? undefined : c.street, ...(c.crossing ? { crossing: c.crossing } : {}), ...(c.note ? { note: c.note } : {}) };
    const last = out[out.length - 1];
    const gap = c.x - last.at;
    if (last.type !== 'depart' && (semantic(type) || semantic(last.type))) {
      if (gap < 8) {
        // Přechod hned u odbočení → jeden pokyn („odbočte vlevo a přejděte po přechodu“).
        if (type === 'crossing' && TURNS.has(last.type) && last.type !== 'straight') {
          out[out.length - 1] = { ...last, crossing: c.crossing };
          continue;
        }
        if (last.type === 'crossing' && TURNS.has(type) && type !== 'straight') {
          out[out.length - 1] = { ...m, at: last.at, crossing: last.crossing, crossingFirst: true };
          continue;
        }
        if (weight(type) > weight(last.type)) out[out.length - 1] = { ...m, note: m.note ?? last.note };
        continue;
      }
      out.push(m);
      continue;
    }
    if (last.type !== 'depart' && gap < 25) {
      if (weight(type) > weight(last.type) || (!last.street && m.street)) out[out.length - 1] = { ...m, street: m.street ?? last.street };
      continue;
    }
    out.push(m);
  }
  out.push({ at: length, type: 'arrive' });
  return out;
}

/** Fáze cesty z itineráře. Bez tvaru trasy se použije přímá čára (navigace „vzdušnou čarou“). */
export function buildPhases(it: Itinerary, origin: LatLng, building: { name: string; coords: LatLng }, eventStart?: string, ways?: NavWayMap): NavPhase[] {
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
        maneuvers: maneuversFor(path, walk.steps, ways, {
          toMetro: nextRide?.mode === 'metro',
          fromMetro: (legs.slice(0, i).reverse().find((l): l is RideLeg => l.kind === 'ride') ?? null)?.mode === 'metro',
        }),
        target: nextRide ? { name: nextRide.fromStop, coords: targetCoords, platform: nextRide.platform, isStop: true, mode: nextRide.mode } : { name: building.name, coords: targetCoords, isStop: false },
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

/** Pokyn jako sloveso (malým písmenem): „odbočte vlevo“, „sejděte po schodech“. */
const PHRASE: Record<ManeuverType, string> = {
  depart: 'vyrazte',
  straight: 'pokračujte rovně',
  'slight-left': 'mírně vlevo',
  left: 'odbočte vlevo',
  'sharp-left': 'ostře vlevo',
  'slight-right': 'mírně vpravo',
  right: 'odbočte vpravo',
  'sharp-right': 'ostře vpravo',
  uturn: 'otočte se',
  crossing: 'přejděte po přechodu',
  stairs: 'pokračujte po schodech',
  'stairs-up': 'vyjděte po schodech nahoru',
  'stairs-down': 'sejděte po schodech dolů',
  escalator: 'pokračujte eskalátorem',
  'escalator-up': 'vyjeďte eskalátorem nahoru',
  'escalator-down': 'sjeďte eskalátorem dolů',
  elevator: 'pokračujte výtahem',
  'elevator-up': 'vyjeďte výtahem nahoru',
  'elevator-down': 'sjeďte výtahem dolů',
  arrive: 'jste u cíle',
};

const CROSSING_PHRASE: Record<CrossingKind, string> = {
  zebra: 'přejděte po přechodu',
  signals: 'přejděte na semaforu',
  unmarked: 'přejděte silnici',
};

function phrase(m: Maneuver): string {
  if (m.type === 'crossing') return CROSSING_PHRASE[m.crossing ?? 'zebra'];
  const base = PHRASE[m.type];
  if (!m.crossing) return base;
  return m.crossingFirst ? `${CROSSING_PHRASE[m.crossing]} a ${base}` : `${base} a ${CROSSING_PHRASE[m.crossing]}`;
}

export function formatDistance(m: number): string {
  if (m < 15) return 'teď';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Text pokynu: „Za 80 m odbočte vlevo do ulice Vinohradská“, „Vstup do metra“, „Přejděte po přechodu“. */
export function instructionText(m: Maneuver, distance: number, targetName?: string): { headline: string; detail?: string } {
  if (m.type === 'arrive') {
    return { headline: distance < 15 ? `Jste na místě${targetName ? ` – ${targetName}` : ''}` : `${formatDistance(distance)} do cíle`, detail: targetName };
  }
  const action = phrase(m);
  if (m.note) {
    const place = m.note === 'entrance' ? 'vstup do metra' : 'výstup z metra';
    return distance < 15 ? { headline: capitalizeFirst(place), detail: capitalizeFirst(action) } : { headline: `Za ${formatDistance(distance)} ${place}`, detail: capitalizeFirst(action) };
  }
  const street = m.street && TURNS.has(m.type) ? `do ulice ${m.street}` : undefined;
  if (distance < 15) return { headline: `${capitalizeFirst(action)}${street ? ` ${street}` : ''}` };
  return { headline: `Za ${formatDistance(distance)} ${action}`, detail: street ? capitalizeFirst(street) : undefined };
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
