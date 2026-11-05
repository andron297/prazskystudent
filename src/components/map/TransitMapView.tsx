import { useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { AnimatePresence, motion } from 'motion/react';
import { Accessibility, Check, ChevronLeft, Crosshair, Footprints, GraduationCap, LoaderCircle, MapPin, Search, Snowflake, Sparkles, X } from 'lucide-react';
import type { TransitMode } from '../../types';
import { formatTime } from '../../lib/dates';
import { formatDistance, haversineMeters, walkingMinutes } from '../../lib/geo';
import { findStop, nearbyStops, platformsToGeoJSON, searchStops, sortLines, stopsToGeoJSON, type StopGroup } from '../../lib/stops';
import { delayChipClasses, formatDelay } from '../../lib/urgency';
import { useResolvedTheme } from '../../hooks/useAppShell';
import { useNow } from '../../hooks/useNow';
import { useOrigin } from '../../hooks/useOrigin';
import { departuresFor, useStops, type DepartureBoard } from '../../services/stops';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { buildingForEvent, upcomingEvents } from '../../store/selectors';
import { toast, useUiStore } from '../../store/uiStore';
import { Button, cn, Skeleton } from '../ui/primitives';
import { LineBadge } from '../transit/TransitBits';
import { applyNature, PRAGUE_BOUNDS, STYLE_URL } from './mapStyle';

setWorkerUrl(workerUrl);

const MODE_FILTERS: { id: TransitMode; label: string }[] = [
  { id: 'metro', label: 'Metro' },
  { id: 'tram', label: 'Tram' },
  { id: 'bus', label: 'Bus' },
  { id: 'train', label: 'Vlak' },
];


/** Od tohoto přiblížení se místo středu zastávky kreslí jednotlivá nástupiště. */
const PLATFORM_ZOOM = 15.5;

function addStopLayers(map: MapLibreMap, theme: 'light' | 'dark', data: ReturnType<typeof stopsToGeoJSON>, platforms: ReturnType<typeof platformsToGeoJSON>) {
  if (!map.getSource('stops')) map.addSource('stops', { type: 'geojson', data, promoteId: 'name' });
  if (!map.getSource('platforms')) map.addSource('platforms', { type: 'geojson', data: platforms });
  const ring = theme === 'dark' ? '#0d1410' : '#ffffff';
  if (!map.getLayer('platforms-dot')) {
    map.addLayer({
      id: 'platforms-dot',
      type: 'circle',
      source: 'platforms',
      minzoom: PLATFORM_ZOOM,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], PLATFORM_ZOOM, 5, 18, 9],
        'circle-stroke-color': ring,
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'platforms-selected',
      type: 'circle',
      source: 'platforms',
      minzoom: PLATFORM_ZOOM,
      filter: ['==', ['get', 'name'], ''],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': ['interpolate', ['linear'], ['zoom'], PLATFORM_ZOOM, 8.5, 18, 13],
        'circle-stroke-color': theme === 'dark' ? '#a8c79f' : '#2b5a40',
        'circle-stroke-width': 3,
      },
    });
    map.addLayer({
      id: 'platforms-code',
      type: 'symbol',
      source: 'platforms',
      minzoom: 15.8,
      layout: {
        'text-field': ['get', 'code'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 10.5,
        'text-offset': [0, -1.25],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': theme === 'dark' ? '#f2efe6' : '#1d2a22',
        'text-halo-color': theme === 'dark' ? '#0d1410' : '#ffffff',
        'text-halo-width': 1.4,
      },
    });
  }
  if (!map.getLayer('stops-dot')) {
    map.addLayer({
      id: 'stops-dot',
      type: 'circle',
      source: 'stops',
      maxzoom: PLATFORM_ZOOM,
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['+', 1.6, ['*', ['get', 'rank'], 0.7]], 14, ['+', 4, ['*', ['get', 'rank'], 0.9]], 17, ['+', 8, ['get', 'rank']]],
        'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], theme === 'dark' ? '#a8c79f' : '#2b5a40', ['boolean', ['feature-state', 'origin'], false], '#c7a676', ring],
        'circle-stroke-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11,
          ['case', ['boolean', ['feature-state', 'selected'], false], 3, ['boolean', ['feature-state', 'origin'], false], 3, 0.6],
          15,
          ['case', ['boolean', ['feature-state', 'selected'], false], 4.5, ['boolean', ['feature-state', 'origin'], false], 4.5, 2],
        ],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.75, 13, 1],
      },
    });
  }
  if (!map.getLayer('stops-label')) {
    map.addLayer({
      id: 'stops-label',
      type: 'symbol',
      source: 'stops',
      minzoom: 13.2,
      filter: ['any', ['>=', ['get', 'rank'], 1], ['>=', ['zoom'], 15.2]],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 17, 13.5],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-max-width': 9,
        'text-optional': true,
      },
      paint: {
        'text-color': theme === 'dark' ? '#d9d3c4' : '#25332a',
        'text-halo-color': theme === 'dark' ? '#0d1410' : '#f6f3ec',
        'text-halo-width': 1.6,
      },
    });
  }
}

function markerEl(kind: 'me' | 'school'): HTMLElement {
  const el = document.createElement('div');
  if (kind === 'me') {
    el.className = 'relative grid size-7 place-items-center';
    el.innerHTML = '<span class="absolute inline-flex size-full animate-ping-soft rounded-full bg-[#c7a676]/70"></span><span class="relative size-[18px] rounded-full border-[3px] border-white bg-[#a36f45] shadow-lg"></span>';
  } else {
    el.className = 'grid size-9 place-items-center rounded-full border-[3px] border-white bg-[#2b5a40] text-white shadow-lg';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>';
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Odjezdová tabule                                                    */
/* ------------------------------------------------------------------ */

function Departures({ stop }: { stop: StopGroup }) {
  const settings = useAppStore((s) => s.settings);
  const server = useUiStore((s) => s.server);
  const now = useNow(1000);
  const [board, setBoard] = useState<DepartureBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bucket = Math.floor(now.getTime() / 30_000);

  useEffect(() => {
    let alive = true;
    departuresFor(stop, settings, server, appNow())
      .then((b) => {
        if (alive) {
          setBoard(b);
          setError(null);
        }
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop.id, settings.mode, settings.golemioApiKey, server.golemio, bucket]);

  if (error) return <p className="rounded-2xl bg-surface-2 p-3 text-[13px] text-muted">{error}</p>;
  if (!board)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  if (board.warning) return <p className="rounded-2xl bg-surface-2 p-3 text-[13px] text-muted">{board.warning}</p>;
  if (board.departures.length === 0) return <p className="rounded-2xl bg-surface-2 p-3 text-[13px] text-muted">V příští hodině odsud nic nejede.</p>;
  return (
    <ul className="divide-y divide-[var(--line)]">
      {board.departures.map((d) => {
        const mins = Math.round((d.predicted.getTime() - now.getTime()) / 60_000);
        return (
          <li key={d.id} className="flex items-center gap-2.5 py-2">
            <LineBadge ride={{ mode: d.mode, line: d.line }} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold">{d.headsign || '—'}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                {formatTime(d.predicted)}
                {d.platform && <span>· nást. {d.platform}</span>}
                {d.airConditioned && <Snowflake className="size-3 text-sky-600" aria-label="Klimatizace" />}
                {d.accessible && <Accessibility className="size-3 text-accent" aria-label="Bezbariérové" />}
              </span>
            </span>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular', delayChipClasses(d.delaySeconds))}>{formatDelay(d.delaySeconds)}</span>
            <span className="w-14 text-right font-display text-[22px] leading-none tabular">{mins <= 0 ? <span className="text-[15px] font-sans font-bold text-accent">teď</span> : `${mins}′`}</span>
          </li>
        );
      })}
      <li className="pt-2 text-right text-[10.5px] text-subtle">{board.source === 'golemio' ? 'Živě z PID Golemio' : board.source === 'transitous' ? (
                  <>
                    Jízdní řád PID se zpožděním ·{' '}
                    <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      Transitous
                    </a>
                  </>
                ) : (
                  'Simulace (ukázka)'
                )}</li>
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Hlavní obrazovka                                                    */
/* ------------------------------------------------------------------ */

export function TransitMapView() {
  const { stops, error } = useStops();
  const theme = useResolvedTheme();
  const origin = useOrigin();
  const mode = useAppStore((s) => s.settings.mode);
  const walkSpeed = useAppStore((s) => s.settings.walkSpeed);
  const originStop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  const setOriginStop = useAppStore((s) => s.setOriginStop);
  const events = useVisibleEvents();
  const settings = useAppStore((s) => s.settings);
  const focusStop = useUiStore((s) => s.focusStop);
  const setFocusStop = useUiStore((s) => s.setFocusStop);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const meMarker = useRef<Marker | null>(null);
  const schoolMarker = useRef<Marker | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<StopGroup | null>(null);
  const [query, setQuery] = useState('');
  const [modes, setModes] = useState<TransitMode[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);

  const filtered = useMemo(() => (stops ? (modes.length ? stops.filter((s) => s.lines.some((l) => !l.night && modes.includes(l.mode))) : stops) : []), [stops, modes]);
  const geojson = useMemo(() => stopsToGeoJSON(filtered), [filtered]);
  const platformGeojson = useMemo(() => platformsToGeoJSON(filtered), [filtered]);
  const near = useMemo(() => (stops ? nearbyStops(stops, origin.coords, { walkSpeed, maxMeters: 900, limit: 8, modes: modes.length ? modes : undefined }) : []), [stops, origin.coords, walkSpeed, modes]);
  const results = useMemo(() => (stops && query.trim().length >= 2 ? searchStops(stops, query, 8) : []), [stops, query]);
  const now = useNow(60_000);
  const nextEvent = useMemo(() => upcomingEvents(events, now).next, [events, now]);
  const school = nextEvent ? buildingForEvent(nextEvent, settings).building : undefined;

  // Inicializace mapy
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL[theme],
      center: [origin.coords.lng, origin.coords.lat],
      zoom: 15,
      minZoom: 10,
      maxBounds: PRAGUE_BOUNDS,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    // Střed mapy mimo panel vpravo (desktop) / dole (mobil).
    map.setPadding(window.innerWidth >= 1024 ? { top: 0, bottom: 0, left: 0, right: 400 } : { top: 110, bottom: 280, left: 0, right: 0 });
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');
    map.on('style.load', () => {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      applyNature(map, t);
      setReady(false);
      setTimeout(() => setReady(true), 0);
    });
    map.on('click', 'stops-dot', (e: MapLayerMouseEvent) => {
      const name = e.features?.[0]?.properties?.name as string | undefined;
      if (name) setFocusStop(name);
    });
    map.on('click', 'platforms-dot', (e: MapLayerMouseEvent) => {
      const name = e.features?.[0]?.properties?.name as string | undefined;
      if (name) setFocusStop(name);
    });
    for (const layer of ['stops-dot', 'platforms-dot']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }
    mapRef.current = map;
    return () => {
      meMarker.current?.remove();
      schoolMarker.current?.remove();
      meMarker.current = null;
      schoolMarker.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Přepnutí motivu = jiný podklad
  const themeRef = useRef(theme);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || themeRef.current === theme) return;
    themeRef.current = theme;
    map.setStyle(STYLE_URL[theme]);
  }, [theme]);

  // Vrstvy zastávek a data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    addStopLayers(map, theme, geojson, platformGeojson);
    (map.getSource('stops') as GeoJSONSource | undefined)?.setData(geojson);
    (map.getSource('platforms') as GeoJSONSource | undefined)?.setData(platformGeojson);
    if (originStop) map.setFeatureState({ source: 'stops', id: originStop.name }, { origin: true });
    if (selectedRef.current) map.setFeatureState({ source: 'stops', id: selectedRef.current }, { selected: true });
    map.setFilter('platforms-selected', ['==', ['get', 'name'], selectedRef.current ?? '']);
  }, [ready, geojson, platformGeojson, theme, originStop]);

  // Značky: já a škola
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!meMarker.current) meMarker.current = new Marker({ element: markerEl('me') }).setLngLat([origin.coords.lng, origin.coords.lat]).addTo(map);
    else meMarker.current.setLngLat([origin.coords.lng, origin.coords.lat]);
  }, [origin.coords.lat, origin.coords.lng]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    schoolMarker.current?.remove();
    schoolMarker.current = school ? new Marker({ element: markerEl('school') }).setLngLat([school.coords.lng, school.coords.lat]).addTo(map) : null;
  }, [school]);

  // Výběr zastávky (z mapy, hledání nebo jiné obrazovky)
  useEffect(() => {
    if (!focusStop || !stops) return;
    const found = findStop(stops, focusStop);
    setFocusStop(null);
    if (!found) return;
    select(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStop, stops]);

  function select(stop: StopGroup | null) {
    const map = mapRef.current;
    if (map && map.getSource('stops')) {
      if (selectedRef.current) map.setFeatureState({ source: 'stops', id: selectedRef.current }, { selected: false });
      if (stop) map.setFeatureState({ source: 'stops', id: stop.name }, { selected: true });
    }
    if (map?.getLayer('platforms-selected')) map.setFilter('platforms-selected', ['==', ['get', 'name'], stop?.name ?? '']);
    selectedRef.current = stop?.name ?? null;
    setSelected(stop);
    setPanelOpen(true);
    setQuery('');
    if (stop && map) map.flyTo({ center: [stop.coords.lng, stop.coords.lat], zoom: Math.max(map.getZoom(), 16), duration: 700 });
  }

  const flyToMe = () => mapRef.current?.flyTo({ center: [origin.coords.lng, origin.coords.lat], zoom: 16, duration: 700 });
  const toggleMode = (m: TransitMode) => setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const chooseOrigin = (stop: StopGroup) => {
    const map = mapRef.current;
    if (map && originStop && map.getSource('stops')) map.setFeatureState({ source: 'stops', id: originStop.name }, { origin: false });
    setOriginStop(mode, { name: stop.name, coords: stop.coords });
    toast.success(`Jedeš ze zastávky ${stop.name}`);
  };

  const selectedWalk = selected ? walkingMinutes(origin.coords, selected.coords, walkSpeed) : 0;
  const selectedDist = selected ? haversineMeters(origin.coords, selected.coords) : 0;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* MapLibre přidá kontejneru position: relative – proto obal s absolutní polohou. */}
      <div className="absolute inset-0 bg-canvas">
        <div ref={containerRef} className="h-full w-full" aria-label="Mapa zastávek PID" />
      </div>
      {!stops && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <LoaderCircle className="size-6 animate-spin text-moss" aria-hidden />
        </div>
      )}

      {/* Vyhledávání a filtry */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 sm:left-4 sm:right-auto sm:w-[360px] lg:top-4">
        <div className="glass-strong pointer-events-auto flex h-12 items-center gap-2 rounded-full border border-line px-4 shadow-[var(--card-shadow)]">
          <Search className="size-4 shrink-0 text-subtle" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat zastávku…" className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-subtle" aria-label="Hledat zastávku" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Smazat hledání" className="text-subtle hover:text-fg">
              <X className="size-4" />
            </button>
          )}
        </div>
        <AnimatePresence>
          {results.length > 0 && (
            <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong pointer-events-auto overflow-hidden rounded-[22px] border border-line p-1.5 shadow-[var(--card-shadow)]">
              {results.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => select(s)} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left hover:bg-surface-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: stopsToGeoJSON([s]).features[0].properties.color }} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {sortLines(s.lines.filter((l) => !l.night))
                        .slice(0, 4)
                        .map((l) => (
                          <LineBadge key={`${l.mode}${l.name}`} ride={{ mode: l.mode, line: l.name }} size="xs" />
                        ))}
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          {MODE_FILTERS.map((m) => {
            const active = modes.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMode(m.id)}
                className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-bold shadow-sm ring-1 ring-inset backdrop-blur-md transition', active ? 'bg-accent text-accent-fg ring-accent' : 'bg-[var(--glass-strong)] text-muted ring-line hover:text-fg')}
                aria-pressed={active}
              >
                {m.label}
              </button>
            );
          })}
          <button type="button" onClick={flyToMe} className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--glass-strong)] px-3 py-1.5 text-[12.5px] font-bold text-muted shadow-sm ring-1 ring-inset ring-line backdrop-blur-md hover:text-fg sm:ml-0">
            <Crosshair className="size-3.5" aria-hidden /> Já
          </button>
        </div>
      </div>

      {/* Panel: vybraná zastávka / okolí */}
      <AnimatePresence>
        {panelOpen && (
          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="glass-strong scrollbar-thin absolute inset-x-3 bottom-[5.6rem] z-10 max-h-[46dvh] overflow-y-auto rounded-[26px] border border-line p-4 shadow-[var(--card-shadow)] lg:bottom-4 lg:left-auto lg:right-4 lg:top-4 lg:max-h-none lg:w-[380px] lg:p-5"
          >
            {selected ? (
              <div>
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => select(null)} className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Zpět na okolí">
                    <ChevronLeft className="size-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[30px] leading-[0.95]">{selected.name}</h2>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Footprints className="size-3.5" aria-hidden /> {selectedWalk} min pěšky
                      </span>
                      <span>· {formatDistance(selectedDist)}</span>
                      {selected.accessible && (
                        <span className="inline-flex items-center gap-1 text-accent">
                          <Accessibility className="size-3.5" aria-hidden /> bezbariérová
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {sortLines(selected.lines)
                    .slice(0, 18)
                    .map((l) => (
                      <span key={`${l.mode}${l.name}`} className={cn(l.night && 'opacity-60')}>
                        <LineBadge ride={{ mode: l.mode, line: l.name }} size="xs" />
                      </span>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {originStop?.name === selected.name ? (
                    <>
                      <Button size="sm" variant="soft" icon={Check}>
                        Jedeš odsud
                      </Button>
                      <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => setOriginStop(mode, null)}>
                        Automaticky
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="primary" icon={MapPin} onClick={() => chooseOrigin(selected)}>
                      Jet odsud
                    </Button>
                  )}
                </div>
                <p className="eyebrow mb-1 mt-5 text-subtle">Odjezdy</p>
                <Departures stop={selected} />
              </div>
            ) : (
              <div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="eyebrow text-subtle">{origin.label}</p>
                    <h2 className="mt-1 font-display text-[28px] leading-none">
                      Zastávky <em className="text-moss">v okolí</em>
                    </h2>
                  </div>
                  <button type="button" onClick={() => setPanelOpen(false)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 lg:hidden" aria-label="Skrýt panel">
                    <X className="size-4" />
                  </button>
                </div>
                {originStop && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-accent-soft px-3 py-2 text-[13px]">
                    <MapPin className="size-4 text-accent" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      Jedeš ze zastávky <strong>{originStop.name}</strong>
                    </span>
                    <button type="button" onClick={() => setOriginStop(mode, null)} className="text-xs font-bold text-accent hover:underline">
                      Automaticky
                    </button>
                  </div>
                )}
                {school && nextEvent && (
                  <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
                    <GraduationCap className="size-4 text-moss" aria-hidden />
                    Další výuka: {school.name} v {formatTime(new Date(nextEvent.start))}
                  </p>
                )}
                <ul className="mt-3 space-y-1">
                  {!stops &&
                    Array.from({ length: 5 }, (_, i) => (
                      <li key={i}>
                        <Skeleton className="h-14" />
                      </li>
                    ))}
                  {near.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => select(s)} className={cn('flex w-full items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition hover:bg-surface-2', originStop?.name === s.name && 'bg-accent-soft')}>
                        <span className="grid w-9 shrink-0 text-center">
                          <span className="font-display text-[22px] leading-none tabular">{s.walkMinutes}</span>
                          <span className="text-[9.5px] font-bold uppercase tracking-wide text-subtle">min</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {sortLines(s.lines.filter((l) => !l.night))
                              .slice(0, 7)
                              .map((l) => (
                                <LineBadge key={`${l.mode}${l.name}`} ride={{ mode: l.mode, line: l.name }} size="xs" />
                              ))}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {stops && near.length === 0 && <li className="rounded-2xl bg-surface-2 p-3 text-[13px] text-muted">V okolí 900 m není žádná zastávka{modes.length ? ' s vybraným druhem dopravy' : ''}.</li>}
                </ul>
                <p className="mt-3 text-[11px] text-subtle">Data zastávek: PID (data.pid.cz) · mapa © OpenFreeMap, OpenStreetMap</p>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
      {!panelOpen && (
        <button type="button" onClick={() => setPanelOpen(true)} className="glass-strong absolute bottom-[5.6rem] left-1/2 z-10 -translate-x-1/2 rounded-full border border-line px-4 py-2 text-[13px] font-bold shadow-[var(--card-shadow)] lg:hidden">
          Zastávky v okolí
        </button>
      )}
    </div>
  );
}
