/**
 * Živá navigace jako v Mapách: pěšky na správnou zastávku (i nástupiště),
 * jízda s upozorněním, kdy vystoupit, a pěšky až do budovy. Poloha z GPS,
 * displej nezhasne, pokyny umí i nahlas. Bez GPS jde projít ručně.
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike } from 'maplibre-gl';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  LocateFixed,
  MoveUpLeft,
  MoveUpRight,
  Navigation2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { platformLabel } from '../../lib/transitPlanner';
import type { LatLng } from '../../types';
import { vTime, formatTime, plural } from '../../lib/dates';
import { haversineMeters } from '../../lib/geo';
import { boardingSentence, buildPhases, formatDistance, instructionText, isVertical, nextManeuver, slackMinutes, spokenInstruction, walkToStopSentence, withMetroEntrances, WALK_SPEED_MS, type Maneuver, type ManeuverType, type NavPhase, type NavWayMap, type RidePhase, type WalkPhase } from '../../lib/navigation';
import { loadMetroStations, type MetroStation } from '../../lib/metroEntrances';
import { fetchWayInfo, itineraryWayIds } from '../../services/wayInfo';
import { CrossingIcon, ElevatorIcon, EscalatorIcon, MetroIcon, StairsDownIcon, StairsIcon, StairsUpIcon } from './ManeuverIcons';
import { bearing, pathLength, pointAlong, projectOnPath } from '../../lib/polyline';
import { useResolvedTheme } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { stopCoords } from '../../lib/stops';
import { useStops } from '../../services/stops';
import { useAppStore } from '../../store/appStore';
import { useTestStore } from '../../store/testStore';
import { useUiStore, type NavigationTarget } from '../../store/uiStore';
import { cn } from '../ui/primitives';
import { LineBadge } from '../transit/TransitBits';
import { applyNature, STYLE_URL } from '../map/mapStyle';

setWorkerUrl(workerUrl);

type IconComponent = ComponentType<{ className?: string }>;

const ICON: Record<ManeuverType, IconComponent> = {
  depart: Navigation2,
  straight: ArrowUp,
  'slight-left': MoveUpLeft,
  left: CornerUpLeft,
  'sharp-left': ArrowLeft,
  'slight-right': MoveUpRight,
  right: CornerUpRight,
  'sharp-right': ArrowRight,
  uturn: Undo2,
  crossing: CrossingIcon,
  stairs: StairsIcon,
  'stairs-up': StairsUpIcon,
  'stairs-down': StairsDownIcon,
  escalator: EscalatorIcon,
  'escalator-up': (p: { className?: string }) => <EscalatorIcon {...p} dir="up" />,
  'escalator-down': (p: { className?: string }) => <EscalatorIcon {...p} dir="down" />,
  elevator: ElevatorIcon,
  'elevator-up': (p: { className?: string }) => <ElevatorIcon {...p} dir="up" />,
  'elevator-down': (p: { className?: string }) => <ElevatorIcon {...p} dir="down" />,
  arrive: Flag,
};

/** Ikona pokynu: u vstupu do metra a výstupu z něj značka metra. */
const iconFor = (m: Maneuver): IconComponent => (m.note ? MetroIcon : ICON[m.type]);

const COMPASS = ['na sever', 'na severovýchod', 'na východ', 'na jihovýchod', 'na jih', 'na jihozápad', 'na západ', 'na severozápad'];
const compassWord = (deg: number) => COMPASS[Math.round(deg / 45) % 8];

interface Fix {
  coords: LatLng;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  at: number;
}

/** Přesná poloha z GPS (jen během navigace). */
function usePrecisePosition(enabled: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<'locating' | 'ok' | 'denied' | 'unavailable'>('locating');
  const last = useRef<Fix | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const coords = { lat: p.coords.latitude, lng: p.coords.longitude };
        let heading = p.coords.heading !== null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 0.6 ? p.coords.heading : null;
        if (heading === null && last.current && haversineMeters(last.current.coords, coords) > 6) heading = bearing(last.current.coords, coords);
        const next = { coords, accuracy: p.coords.accuracy, heading: heading ?? last.current?.heading ?? null, speed: p.coords.speed, at: p.timestamp };
        last.current = next;
        setFix(next);
        setStatus('ok');
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return { fix, status };
}

/** Kompas telefonu (Android bez ptaní; iPhone po klepnutí). */
function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  useEffect(() => {
    const onAbs = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.absolute) setHeading((360 - e.alpha) % 360);
    };
    const onIos = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      if (typeof e.webkitCompassHeading === 'number') setHeading(e.webkitCompassHeading);
    };
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (typeof DOE?.requestPermission === 'function' && navigator.maxTouchPoints > 0) setNeedsPermission(true);
    window.addEventListener('deviceorientationabsolute', onAbs as EventListener);
    window.addEventListener('deviceorientation', onIos as EventListener);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbs as EventListener);
      window.removeEventListener('deviceorientation', onIos as EventListener);
    };
  }, []);
  const request = async () => {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    try {
      if ((await DOE?.requestPermission?.()) === 'granted') setNeedsPermission(false);
    } catch {
      /* uživatel odmítl */
    }
  };
  return { heading, needsPermission, request };
}

/** Displej nezhasne, dokud navigace běží. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

function readLocalFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'cs-CZ';
    // Přednost má hlas přímo v zařízení (text se pak nikam neposílá).
    const czech = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('cs'));
    const voice = czech.find((v) => v.localService) ?? czech[0];
    if (voice) u.voice = voice;
    u.rate = 1.02;
    synth.speak(u);
  } catch {
    /* hlas není k dispozici */
  }
}

function buzz(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibrace nejsou */
  }
}

function userMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'nav-me';
  el.innerHTML =
    '<span class="nav-me-cone"></span><span class="absolute inset-0 m-auto size-[22px] rounded-full bg-[#2f6b4a]/25 animate-ping-soft"></span><span class="relative block size-[18px] rounded-full border-[3px] border-white bg-[#2f6b4a] shadow-lg"></span>';
  el.style.cssText = 'position:relative;display:grid;place-items:center;width:44px;height:44px;';
  return el;
}

function targetMarker(label: string, color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:999px;background:${color};color:#fff;font:700 12px/1 Manrope Variable,system-ui;box-shadow:0 8px 20px -8px rgb(0 0 0/.5);border:2px solid #fff;white-space:nowrap`;
  const dot = document.createElement('span');
  dot.style.cssText = 'display:grid;place-items:center;width:20px;height:20px;border-radius:999px;background:rgb(255 255 255/.25)';
  dot.textContent = '●';
  const text = document.createElement('span');
  text.textContent = label;
  el.append(dot, text);
  return el;
}

/** Body na pěší trase: přechody, schody/eskalátory/výtahy a vstup do metra (výstup z něj). */
function pointsGeoJSON(phases: NavPhase[]) {
  const features: { type: 'Feature'; properties: { kind: string }; geometry: { type: 'Point'; coordinates: [number, number] } }[] = [];
  for (const p of phases) {
    if (p.kind !== 'walk') continue;
    for (const m of p.maneuvers) {
      const kind = m.note ? m.note : m.type === 'crossing' || m.crossing ? 'crossing' : isVertical(m.type) ? 'vertical' : null;
      if (!kind) continue;
      const c = pointAlong(p.path, m.at, p.cum);
      features.push({ type: 'Feature', properties: { kind }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } });
    }
  }
  return { type: 'FeatureCollection' as const, features };
}

/** Značka vstupu do metra / výstupu z něj (jako na stanicích: M ve čtverci). */
function metroMarker(exit: boolean): HTMLElement {
  const el = document.createElement('div');
  el.title = exit ? 'Výstup z metra' : 'Vstup do metra';
  el.style.cssText = 'display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#c8102e;color:#fff;font:800 15px/1 Manrope Variable,system-ui;border:2px solid #fff;box-shadow:0 6px 16px -6px rgb(0 0 0/.55)';
  el.textContent = 'M';
  return el;
}

function routeGeoJSON(phases: NavPhase[], active: number) {
  return {
    type: 'FeatureCollection' as const,
    features: phases.map((p, i) => ({
      type: 'Feature' as const,
      properties: { kind: p.kind, active: i === active ? 1 : 0, done: i < active ? 1 : 0, color: p.kind === 'ride' ? (p.ride.color ?? '#2f6b4a') : '#2f6b4a' },
      geometry: { type: 'LineString' as const, coordinates: p.path.map((c) => [c.lng, c.lat]) },
    })),
  };
}

export function LiveNavigation() {
  const target = useUiStore((s) => s.navigation);
  if (!target) return null;
  return <NavigationScreen key={target.itinerary.id} target={target} />;
}

function NavigationScreen({ target }: { target: NavigationTarget }) {
  const stop = useUiStore((s) => s.stopNavigation);
  const walkSpeed = useAppStore((s) => s.settings.walkSpeed);
  const demo = useAppStore((s) => s.settings.mode === 'demo');
  const theme = useResolvedTheme();
  const now = useNow(1000);
  const speed = WALK_SPEED_MS[walkSpeed];
  const building = target.building ? { name: target.building.name, coords: target.building.coords } : { name: target.event?.title ?? 'Cíl', coords: target.origin };
  const { stops: stopData } = useStops();
  /** Co je která cesta (přechod, schody, eskalátor…) – doplní se z mapových dat po startu. */
  const [ways, setWays] = useState<NavWayMap | undefined>(undefined);
  useEffect(() => {
    const ids = itineraryWayIds(target.itinerary);
    if (ids.length === 0) return;
    let cancelled = false;
    fetchWayInfo(ids)
      .then((w) => {
        if (!cancelled) setWays(w);
      })
      .catch(() => {
        /* bez mapových dat zůstanou pokyny z geometrie */
      });
    return () => {
      cancelled = true;
    };
  }, [target.itinerary]);
  const basePhases = useMemo(() => {
    // Spoje bez souřadnic (ukázka, záložní plánovač) doplníme z dat zastávek PID.
    const legs = target.itinerary.legs.map((l) => {
      if (l.kind !== 'ride' || !stopData) return l;
      return {
        ...l,
        fromCoords: l.fromCoords ?? stopCoords(stopData, l.fromStop, { line: l.line, headsign: l.headsign, platform: l.platform }),
        toCoords: l.toCoords ?? stopCoords(stopData, l.toStop, { platform: l.toPlatform }),
      };
    });
    return buildPhases({ ...target.itinerary, legs }, target.origin, building, target.event?.start, ways);
  }, [target, stopData, ways]); // eslint-disable-line react-hooks/exhaustive-deps
  // Vstupy do metra z dat PID: pokyn „sejděte do metra“ přesně u vstupu, kterým trasa vede.
  const [stations, setStations] = useState<MetroStation[] | null>(null);
  const needsStations = basePhases.some((p) => p.kind === 'walk' && p.target.mode === 'metro');
  useEffect(() => {
    if (needsStations) void loadMetroStations().then(setStations);
  }, [needsStations]);
  const phases = useMemo(() => (stations ? withMetroEntrances(basePhases, stations) : basePhases), [basePhases, stations]);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [following, setFollowing] = useState(true);
  /** 3D pohled: náklon, budovy a mapa natočená ve směru chůze. */
  // Volby navigace se pamatují v nastavení (a tedy i v účtu na všech zařízeních).
  const prefs = useAppStore((s) => s.settings.prefs);
  const [tilt, setTilt] = useState(() => prefs?.nav3d ?? readLocalFlag('stihnu:nav-3d', true));
  const [voice, setVoice] = useState(() => prefs?.navVoice ?? readLocalFlag('stihnu:nav-voice', false));
  const [showSteps, setShowSteps] = useState(false);
  const simGps = useTestStore((s) => s.gps);
  const walkSim = useTestStore((s) => s.walkSim);
  const simWalkSpeed = useTestStore((s) => s.walkSpeed);
  const simulate = demo || walkSim;
  const { fix: realFix, status: gpsStatus } = usePrecisePosition(!simulate && !simGps);
  const gpsFix: Fix | null = simGps && !simulate ? { coords: { lat: simGps.lat, lng: simGps.lng }, accuracy: 5, heading: null, speed: 0, at: Date.now() } : realFix;
  const compass = useCompass();
  useWakeLock();

  // Ukázka: „chodec“ se pohybuje po trase (zrychleně), ať je vidět, jak navigace funguje.
  const simStart = useRef(Date.now());
  const [simTick, setSimTick] = useState(0);
  useEffect(() => {
    if (!simulate) return;
    const t = setInterval(() => setSimTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [simulate]);
  useEffect(() => {
    simStart.current = Date.now();
  }, [phaseIndex]);
  const phase = phases[Math.min(phaseIndex, phases.length - 1)] as NavPhase | undefined;
  const fix: Fix | null = useMemo(() => {
    if (!simulate || !phase) return gpsFix;
    const elapsed = (Date.now() - simStart.current) / 1000;
    const len = phase.kind === 'walk' ? phase.length : 0;
    const along = phase.kind === 'walk' ? Math.min(len, elapsed * (demo ? 4 : simWalkSpeed)) : 0;
    const rideFraction = Math.min(1, elapsed / 25);
    const coords = phase.kind === 'walk' ? pointAlong(phase.path, along, phase.cum) : pointAlong(phase.path, rideFraction * pathLength(phase.path));
    const ahead = phase.kind === 'walk' ? pointAlong(phase.path, along + 10, phase.cum) : coords;
    return { coords, accuracy: 8, heading: bearing(coords, ahead), speed: 1.4, at: Date.now() };
  }, [simulate, gpsFix, phase, simTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const heading = compass.heading ?? fix?.heading ?? null;

  // Zpět v prohlížeči / gesto zpět v telefonu navigaci zavře.
  useEffect(() => {
    history.pushState({ stihnuNav: true }, '');
    const onPop = () => stop();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [stop]);
  const close = () => {
    if (history.state?.stihnuNav) history.back();
    else stop();
  };

  /* ----------------------------- výpočty fáze ----------------------------- */

  const walk = phase?.kind === 'walk' ? (phase as WalkPhase) : null;
  const ride = phase?.kind === 'ride' ? (phase as RidePhase) : null;
  const projection = walk && fix ? projectOnPath(walk.path, fix.coords, walk.cum) : null;
  const along = projection ? projection.along : 0;
  const remaining = walk ? Math.max(0, walk.length - along) : 0;
  const offRoute = Boolean(projection && projection.offRoute > Math.max(45, (fix?.accuracy ?? 0) * 1.5));
  const next = walk ? nextManeuver(walk.maneuvers, along) : null;
  const directDistance = walk && fix ? haversineMeters(fix.coords, walk.target.coords) : null;
  const slack = walk ? slackMinutes(offRoute && directDistance ? directDistance * 1.3 : remaining, walk.deadline, now, speed) : null;

  // Jízda: kolik zastávek zbývá a kdy vystoupit.
  const rideState = useMemo(() => {
    if (!ride) return null;
    const stops = ride.stops;
    const minutesToArrival = (new Date(ride.ride.predictedArrival).getTime() - now.getTime()) / 60_000;
    if (stops.length <= 1) {
      // Bez seznamu zastávek po cestě: podle času příjezdu.
      return { left: minutesToArrival <= 2 ? 1 : 99, minutesToArrival, nextStop: stops[0], alight: stops[stops.length - 1] };
    }
    let passed = 0;
    if (fix && stops.length) {
      let best = 0;
      let bestD = Infinity;
      stops.forEach((s, i) => {
        const d = haversineMeters(fix.coords, s.coords);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      passed = bestD < 120 ? best : Math.max(0, best - 1);
    } else {
      passed = stops.filter((s) => s.at && new Date(s.at) <= now).length;
    }
    const left = Math.max(0, stops.length - passed - (fix ? 1 : 0));
    return { left, minutesToArrival, nextStop: stops[Math.min(stops.length - 1, passed + (fix ? 1 : 0))], alight: stops[stops.length - 1] };
  }, [ride, fix, now]);

  // Automatický posun mezi fázemi.
  useEffect(() => {
    if (!phase || arrived) return;
    if (walk) {
      const near = remaining < 18 || (directDistance !== null && directDistance < 22);
      if (!near) return;
      if (!walk.target.isStop) {
        setArrived(true);
        buzz([120, 60, 120]);
        if (voice) speak(`Jste u cíle, ${walk.target.name}.`);
        return;
      }
      const ridePhase = phases[phaseIndex + 1];
      const departure = ridePhase?.kind === 'ride' ? new Date(ridePhase.ride.predictedDeparture).getTime() : 0;
      if (departure && now.getTime() >= departure - 20_000) setPhaseIndex((i) => i + 1);
    } else if (ride && rideState) {
      const alight = rideState.alight;
      const atAlight = fix && alight ? haversineMeters(fix.coords, alight.coords) < 70 : false;
      const timeUp = new Date(ride.ride.predictedArrival).getTime() <= now.getTime() - 30_000;
      if ((atAlight && (fix?.speed ?? 0) < 2.5) || (timeUp && (!fix || demo || !rideState.alight))) setPhaseIndex((i) => Math.min(phases.length - 1, i + 1));
    }
  }, [phase, walk, ride, rideState, remaining, directDistance, now, arrived, phases, phaseIndex, fix, voice, demo]);

  // Hlas a vibrace u pokynů.
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    if (!walk || !next || offRoute) return;
    if (next.maneuver.type === 'arrive') return;
    // Dvakrát: s předstihem („Za sto metrů odbočte vlevo“) a na místě („Odbočte vlevo“).
    const early = `${phaseIndex}:${next.maneuver.at}:early`;
    const key = `${phaseIndex}:${next.maneuver.at}`;
    if (next.distance >= 70 && next.distance <= 160 && !spoken.current.has(early)) {
      spoken.current.add(early);
      if (voice) speak(spokenInstruction(next.maneuver, next.distance, walk.target.name));
    } else if (next.distance < 30 && !spoken.current.has(key)) {
      spoken.current.add(key);
      buzz([60]);
      if (voice) speak(spokenInstruction(next.maneuver, next.distance, walk.target.name));
    }
  }, [walk, next, offRoute, phaseIndex, voice]);
  useEffect(() => {
    if (!rideState || !ride) return;
    const key = `alight:${phaseIndex}`;
    if (rideState.left <= 1 && !spoken.current.has(key)) {
      spoken.current.add(key);
      buzz([200, 100, 200, 100, 200]);
      if (voice) speak(`Příští zastávka ${ride.ride.toStop}. Tam vystupujete, připravte se.`);
    }
  }, [rideState, ride, phaseIndex, voice]);
  useEffect(() => {
    if (!voice || !phase) return;
    if (phase.kind === 'walk') {
      const nr = phases[phaseIndex + 1];
      const pr = phases[phaseIndex - 1];
      speak(walkToStopSentence(phase.target, nr?.kind === 'ride' ? nr.ride : undefined, pr?.kind === 'ride' ? pr.ride : undefined));
    }
    if (phase.kind === 'ride') speak(boardingSentence(phase.ride));
  }, [phaseIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  // U zastávky (na nástupišti) jednou řeknout, do čeho nastoupit.
  useEffect(() => {
    if (!walk || !walk.target.isStop || !voice) return;
    const near = remaining < 18 || (directDistance !== null && directDistance < 22);
    const key = `atstop:${phaseIndex}`;
    const nr = phases[phaseIndex + 1];
    if (near && nr?.kind === 'ride' && !spoken.current.has(key)) {
      spoken.current.add(key);
      speak(boardingSentence(nr.ride, true));
    }
  }, [walk, remaining, directDistance, phaseIndex, phases, voice]);

  /* --------------------------------- mapa --------------------------------- */

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const meRef = useRef<Marker | null>(null);
  const targetRef = useRef<Marker | null>(null);
  const metroRefs = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = phases[0]?.path[0] ?? target.origin;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL[theme],
      center: [start.lng, start.lat],
      zoom: 16,
      attributionControl: false,
      pitchWithRotate: false,
    });
    map.on('style.load', () => {
      applyNature(map, theme);
      // 3D budovy z vektorových dlaždic (výška podle OpenStreetMap)
      if (map.getSource('openmaptiles') && !map.getLayer('nav-3d-buildings')) {
        map.addLayer({
          id: 'nav-3d-buildings',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14.5,
          paint: {
            'fill-extrusion-color': theme === 'dark' ? '#1c2a22' : '#e6dfd0',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14.5, 0, 15.5, ['coalesce', ['get', 'render_height'], 12]],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': theme === 'dark' ? 0.85 : 0.9,
            'fill-extrusion-vertical-gradient': true,
          },
        });
      }
      map.addSource('nav-route', { type: 'geojson', data: routeGeoJSON(phases, 0) });
      map.addLayer({ id: 'nav-ride-casing', type: 'line', source: 'nav-route', filter: ['==', ['get', 'kind'], 'ride'], paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'nav-ride', type: 'line', source: 'nav-route', filter: ['==', ['get', 'kind'], 'ride'], paint: { 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': ['case', ['==', ['get', 'done'], 1], 0.35, 1] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      map.addLayer({ id: 'nav-walk', type: 'line', source: 'nav-route', filter: ['==', ['get', 'kind'], 'walk'], paint: { 'line-color': '#2f6b4a', 'line-width': 5, 'line-dasharray': [0.2, 1.6], 'line-opacity': ['case', ['==', ['get', 'done'], 1], 0.35, 1] }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
      // Přechody (bílá kolečka s tmavým okrajem) a schody, eskalátory, výtahy (hnědé tečky).
      map.addSource('nav-points', { type: 'geojson', data: pointsGeoJSON(phases) });
      map.addLayer({ id: 'nav-crossings', type: 'circle', source: 'nav-points', filter: ['==', ['get', 'kind'], 'crossing'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 18, 6], 'circle-color': '#ffffff', 'circle-stroke-color': '#1f2a24', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'nav-vertical', type: 'circle', source: 'nav-points', filter: ['==', ['get', 'kind'], 'vertical'], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 18, 5], 'circle-color': '#a36f45', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } });
      const stops = phases.flatMap((p) => (p.kind === 'ride' ? p.stops : []));
      map.addSource('nav-stops', { type: 'geojson', data: { type: 'FeatureCollection', features: stops.map((s) => ({ type: 'Feature', properties: { name: s.name }, geometry: { type: 'Point', coordinates: [s.coords.lng, s.coords.lat] } })) } });
      map.addLayer({ id: 'nav-stops', type: 'circle', source: 'nav-stops', paint: { 'circle-radius': 4.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#2f6b4a', 'circle-stroke-width': 2.5 } });
      const all = phases.flatMap((p) => p.path);
      if (all.length > 1) {
        const lngs = all.map((c) => c.lng);
        const lats = all.map((c) => c.lat);
        const bounds: LngLatBoundsLike = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        map.fitBounds(bounds, { padding: { top: 190, bottom: 260, left: 40, right: 40 }, duration: 0, maxZoom: 17 });
      }
      setMapReady(true);
    });
    map.on('dragstart', () => setFollowing(false));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (map.getSource('nav-route') as GeoJSONSource | undefined)?.setData(routeGeoJSON(phases, phaseIndex));
    (map.getSource('nav-points') as GeoJSONSource | undefined)?.setData(pointsGeoJSON(phases));
    for (const mk of metroRefs.current) mk.remove();
    // Vstup do metra na skutečném místě (data PID), jinak tam, kde trasa klesá pod zem.
    const exact = phases.flatMap((p) => (p.kind === 'walk' && p.entrance ? [[p.entrance.lng, p.entrance.lat] as [number, number]] : []));
    const fromRoute = pointsGeoJSON(phases).features.filter((f) => f.properties.kind === 'entrance' || f.properties.kind === 'exit');
    metroRefs.current = [
      ...exact.map((c) => new Marker({ element: metroMarker(false) }).setLngLat(c).addTo(map)),
      ...fromRoute.filter((f) => f.properties.kind === 'exit' || exact.length === 0).map((f) => new Marker({ element: metroMarker(f.properties.kind === 'exit') }).setLngLat(f.geometry.coordinates).addTo(map)),
    ];
    targetRef.current?.remove();
    const p = phases[phaseIndex];
    if (p) {
      const coords = p.kind === 'walk' ? p.target.coords : p.stops[p.stops.length - 1]?.coords;
      const label = p.kind === 'walk' ? (p.target.isStop ? `${p.target.name}${p.target.platform ? ` · ${platformLabel(p.target.mode, p.target.platform)}` : ''}` : p.target.name) : `Vystupte: ${p.ride.toStop}`;
      if (coords) targetRef.current = new Marker({ element: targetMarker(label, p.kind === 'ride' ? (p.ride.color ?? '#2f6b4a') : '#a36f45'), anchor: 'left', offset: [-12, 0] }).setLngLat([coords.lng, coords.lat]).addTo(map);
    }
  }, [mapReady, phaseIndex, phases]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !fix) return;
    // Značka leží na mapě (otáčí se s ní), takže kužel směru sedí i při mapě natočené po směru chůze.
    if (!meRef.current) meRef.current = new Marker({ element: userMarker(), rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat([fix.coords.lng, fix.coords.lat]).addTo(map);
    meRef.current.setLngLat([fix.coords.lng, fix.coords.lat]);
    const cone = meRef.current.getElement().querySelector<HTMLElement>('.nav-me-cone');
    if (cone) {
      cone.style.opacity = heading === null ? '0' : '1';
      cone.style.transform = `rotate(${heading ?? 0}deg)`;
    }
    if (following) {
      // Pěšky: mapa natočená ve směru chůze a nakloněná (jako v autě), ve voze přehled.
      const course = tilt && heading !== null && !ride ? heading : 0;
      map.easeTo({ center: [fix.coords.lng, fix.coords.lat], zoom: ride ? 14.5 : tilt ? 17.6 : 17, pitch: tilt ? (ride ? 35 : 58) : 0, bearing: course, duration: 900, padding: { top: 180, bottom: 250, left: 0, right: 0 } });
    }
  }, [fix, heading, following, mapReady, ride, tilt]);

  useEffect(() => {
    if (useAppStore.getState().settings.prefs?.nav3d !== tilt) {
      const st = useAppStore.getState();
      st.updateSettings({ prefs: { ...st.settings.prefs, nav3d: tilt } });
    }
    const map = mapRef.current;
    if (map?.getLayer('nav-3d-buildings')) map.setLayoutProperty('nav-3d-buildings', 'visibility', tilt ? 'visible' : 'none');
    if (map && !tilt) map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
  }, [tilt, mapReady]);

  /* -------------------------------- vzhled -------------------------------- */

  if (!phase) return null;
  const Icon = next ? iconFor(next.maneuver) : Navigation2;
  const instruction =
    walk && next
      ? next.maneuver.type === 'arrive' && next.distance >= 15
        ? { headline: walk.target.mode === 'metro' ? (walk.entrance && walk.entrance.along < walk.length - 30 && along < walk.entrance.along ? `Jděte ke vstupu do metra ${walk.target.name}` : `Jděte na nástupiště ${walk.target.name}`) : walk.target.isStop ? `Jděte na zastávku ${walk.target.name}` : `Jděte do budovy ${walk.target.name}`, detail: `${formatDistance(next.distance)}${walk.target.platform ? ` · ${platformLabel(walk.target.mode, walk.target.platform)}` : ''}` }
        : instructionText(next.maneuver, next.distance, walk.target.name)
      : null;
  const bearingToTarget = walk && fix ? bearing(fix.coords, walk.target.coords) : null;
  const relative = bearingToTarget !== null && heading !== null ? ((bearingToTarget - heading + 540) % 360) - 180 : null;
  const deadlineDate = walk?.deadline ? new Date(walk.deadline) : null;
  const secondsLeft = deadlineDate ? Math.round((deadlineDate.getTime() - now.getTime()) / 1000) : null;
  const nextRide = walk?.target.isStop ? (phases[phaseIndex + 1] as RidePhase | undefined) : undefined;

  const slackLabel =
    slack === null
      ? null
      : slack >= 1.5
        ? { text: slack >= 120 ? 'Stíháte s velkou rezervou' : `Stíháte s rezervou ${Math.floor(slack)} min`, tone: 'bg-emerald-700 text-white' }
        : slack >= -0.5
          ? { text: 'Je to těsné – přidejte do kroku', tone: 'bg-amber-600 text-white' }
          : { text: walk?.target.isStop ? 'Tenhle spoj asi nestihnete' : 'Na začátek to asi nestihnete', tone: 'bg-red-600 text-white' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-[var(--surface)]" role="dialog" aria-modal="true" aria-label="Navigace">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {/* Horní pokyn */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={arrived ? 'arrived' : walk ? `${phaseIndex}:${offRoute ? 'off' : next?.maneuver.at}` : `ride:${rideState?.left}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-[24px] bg-[#1d3b2a] px-4 py-3.5 text-white shadow-[0_20px_40px_-20px_rgb(0_0_0/0.6)]"
            aria-live="polite"
          >
            {arrived ? (
              <>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
                  <Check className="size-7" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[26px] leading-none">Jste tam</p>
                  <p className="mt-1 text-[14px] text-white/80">{target.event ? `Výuka začíná ${vTime(new Date(target.event.start))}.` : 'Navigace je u konce.'}</p>
                </div>
              </>
            ) : walk ? (
              offRoute && relative !== null ? (
                <>
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-amber-400/25">
                    <ArrowUp className="size-7 transition-transform" style={{ transform: `rotate(${relative}deg)` }} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[19px] font-bold leading-tight">Jste mimo trasu</p>
                    <p className="mt-0.5 text-[14px] text-white/80">
                      {walk.target.name} je {formatDistance(directDistance ?? 0)} směrem, kam ukazuje šipka.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
                    <Icon className="size-7" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[21px] font-bold leading-tight">{offRoute && bearingToTarget !== null ? `Jděte ${compassWord(bearingToTarget)}` : instruction?.headline}</p>
                    {instruction?.detail && <p className="mt-0.5 truncate text-[14px] text-white/80">{instruction.detail}</p>}
                    {!fix && gpsStatus !== 'ok' && <p className="mt-0.5 text-[13px] text-amber-200">{gpsStatus === 'denied' ? 'Poloha je zakázaná – pokyny jsou jen podle mapy.' : 'Hledám vaši polohu…'}</p>}
                  </div>
                </>
              )
            ) : ride && rideState ? (
              <>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
                  <BellRing className={cn('size-6', rideState.left <= 1 && 'animate-pulse')} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[20px] font-bold leading-tight">
                    {rideState.left <= 1
                      ? 'Na příští zastávce vystupujete!'
                      : rideState.left === 99
                        ? `Vystupujete za ${Math.max(1, Math.round(rideState.minutesToArrival))} min`
                        : `Vystupujete za ${rideState.left} ${plural(rideState.left, ['zastávku', 'zastávky', 'zastávek'])}`}
                  </p>
                  <p className="mt-0.5 truncate text-[14px] text-white/80">
                    {ride.ride.toStop} · {formatTime(new Date(ride.ride.predictedArrival))}
                  </p>
                </div>
              </>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Ovládání vpravo */}
      <div className="absolute right-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+6.2rem)] flex flex-col gap-2">
        <button type="button" onClick={close} className="grid size-11 place-items-center rounded-full bg-[var(--surface)] text-fg shadow-lg ring-1 ring-line" aria-label="Ukončit navigaci">
          <X className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            const v = !voice;
            setVoice(v);
            const st = useAppStore.getState();
            st.updateSettings({ prefs: { ...st.settings.prefs, navVoice: v } });
            if (v) speak('Hlasové pokyny jsou zapnuté.');
          }}
          className={cn('grid size-11 place-items-center rounded-full shadow-lg ring-1 ring-line', voice ? 'bg-accent text-accent-fg' : 'bg-[var(--surface)] text-fg')}
          aria-label={voice ? 'Vypnout hlasové pokyny' : 'Zapnout hlasové pokyny'}
          aria-pressed={voice}
        >
          {voice ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
        </button>
        <button type="button" onClick={() => setTilt((v) => !v)} className={cn('grid size-11 place-items-center rounded-full text-[12.5px] font-black shadow-lg ring-1 ring-line', tilt ? 'bg-accent text-accent-fg' : 'bg-[var(--surface)] text-fg')} aria-label={tilt ? 'Přepnout na plochou mapu' : 'Přepnout na 3D pohled'} aria-pressed={tilt}>
          {tilt ? '3D' : '2D'}
        </button>
        {!following && (
          <button type="button" onClick={() => setFollowing(true)} className="grid size-11 place-items-center rounded-full bg-[var(--surface)] text-accent shadow-lg ring-1 ring-line" aria-label="Zpět na moji polohu">
            <LocateFixed className="size-5" aria-hidden />
          </button>
        )}
        {compass.needsPermission && compass.heading === null && (
          <button type="button" onClick={() => void compass.request()} className="rounded-full bg-[var(--surface)] px-3 py-2 text-[12px] font-bold shadow-lg ring-1 ring-line">
            Kompas
          </button>
        )}
      </div>

      {/* Spodní panel */}
      <div className="absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <motion.div layout className="glass-strong mx-auto max-w-xl rounded-[26px] border border-line p-4 shadow-[0_-10px_40px_-20px_rgb(0_0_0/0.45)]">
          {walk && !arrived && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow text-subtle">{walk.target.mode === 'metro' ? 'Jdete do metra' : walk.target.isStop ? 'Jdete na zastávku' : 'Jdete do budovy'}</p>
                  <p className="mt-0.5 truncate text-[19px] font-bold leading-tight">
                    {walk.target.name}
                    {walk.target.platform && <span className="text-muted"> · {platformLabel(walk.target.mode, walk.target.platform)}</span>}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted tabular">
                    {formatDistance(offRoute && directDistance ? directDistance : remaining)} · asi {Math.max(1, Math.round((offRoute && directDistance ? directDistance * 1.3 : remaining) / speed / 60))} min chůze
                  </p>
                </div>
                {secondsLeft !== null && (
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-subtle">{walk.target.isStop ? 'Odjezd za' : 'Začátek za'}</p>
                    <p className="font-display text-[30px] leading-none tabular">
                      {secondsLeft <= 0 ? 'teď' : secondsLeft >= 5400 ? `${Math.floor(secondsLeft / 3600)} h ${Math.round((secondsLeft % 3600) / 60)} min` : secondsLeft >= 600 ? `${Math.round(secondsLeft / 60)} min` : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                    </p>
                    <p className="text-[12px] text-muted tabular">{deadlineDate!.toDateString() === now.toDateString() ? '' : `${deadlineDate!.toLocaleDateString('cs-CZ', { weekday: 'long' })} `}{vTime(deadlineDate!)}</p>
                  </div>
                )}
              </div>
              {nextRide && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px]">
                  <LineBadge ride={nextRide.ride} size="sm" />
                  <span>
                    směr <strong>{nextRide.ride.headsign}</strong>
                  </span>
                </p>
              )}
              {slackLabel && <p className={cn('mt-2.5 inline-flex rounded-full px-3 py-1 text-[12.5px] font-bold', slackLabel.tone)}>{slackLabel.text}</p>}
              <button type="button" onClick={() => setShowSteps((v) => !v)} className="mt-2 block text-[12.5px] font-semibold text-accent hover:underline">
                {showSteps ? 'Skrýt pokyny' : 'Všechny pokyny'}
              </button>
              {showSteps && (
                <ol className="mt-1 max-h-40 space-y-1 overflow-y-auto pr-1 text-[13px]">
                  {walk.maneuvers
                    .filter((m) => m.type !== 'depart')
                    .map((m) => {
                      const MIcon = iconFor(m);
                      const passed = m.at < along - 5;
                      return (
                        <li key={m.at} className={cn('flex items-center gap-2', passed && 'opacity-45')}>
                          <MIcon className="size-4 shrink-0 text-moss" aria-hidden />
                          <span className="min-w-0 flex-1">
                            {m.type === 'arrive'
                              ? `Cíl: ${walk.target.name}${walk.target.platform ? `, ${platformLabel(walk.target.mode, walk.target.platform)}` : ''}`
                              : `${instructionText(m, 5).headline}`}
                          </span>
                          <span className="shrink-0 text-subtle tabular">{formatDistance(m.at)}</span>
                        </li>
                      );
                    })}
                </ol>
              )}
            </>
          )}

          {ride && !arrived && (
            <div>
              <div className="flex items-center gap-2">
                <LineBadge ride={ride.ride} size="md" />
                <p className="min-w-0 truncate text-[16px] font-bold">směr {ride.ride.headsign}</p>
              </div>
              <ol className="mt-3 space-y-1.5">
                {(ride.stops.length ? ride.stops : [{ name: ride.ride.toStop, coords: target.origin, at: ride.ride.predictedArrival }]).slice(-Math.min(Math.max(1, ride.stops.length), Math.max(3, Math.min(rideState?.left ?? 0, 9) + 1))).slice(0, 4).map((s, i, arr) => {
                  const isLast = i === arr.length - 1 && s.name === ride.ride.toStop;
                  return (
                    <li key={`${s.name}-${i}`} className={cn('flex items-center gap-2.5 text-[14px]', isLast ? 'font-bold' : 'text-muted')}>
                      <span className={cn('size-2.5 rounded-full ring-2', isLast ? 'bg-clay ring-clay/30' : 'bg-surface ring-line-strong')} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      {s.at && <span className="tabular">{formatTime(new Date(s.at))}</span>}
                      {isLast && <span className="rounded-full bg-clay px-2 py-px text-[11px] font-black text-white">vystupte</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {arrived && (
            <button type="button" onClick={close} className="w-full rounded-full bg-accent py-3 text-[15px] font-bold text-accent-fg">
              Hotovo
            </button>
          )}

          {!arrived && phases.length > 1 && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
              <button type="button" disabled={phaseIndex === 0} onClick={() => setPhaseIndex((i) => Math.max(0, i - 1))} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-muted disabled:opacity-30">
                <ChevronLeft className="size-4" aria-hidden /> Zpět
              </button>
              <span className="flex gap-1.5" aria-label={`Krok ${phaseIndex + 1} z ${phases.length}`}>
                {phases.map((_, i) => (
                  <span key={i} className={cn('h-1.5 rounded-full transition-all', i === phaseIndex ? 'w-6 bg-accent' : i < phaseIndex ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-line-strong')} />
                ))}
              </span>
              <button
                type="button"
                onClick={() => (phaseIndex >= phases.length - 1 ? setArrived(true) : setPhaseIndex((i) => i + 1))}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-accent"
              >
                {walk?.target.isStop ? 'Už jedu' : ride ? 'Vystupuji' : 'Jsem tam'} <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <p className="mt-2 text-center text-[11px] text-subtle">
            {demo ? 'Ukázka: poloha se jen simuluje. · ' : ''}Mapa ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
              OpenStreetMap
            </a>
            , OpenFreeMap
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
