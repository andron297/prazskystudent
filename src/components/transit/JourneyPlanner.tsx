/**
 * Vyhledávač spojení jako IDOS: odkud, kam, odjezd nebo příjezd, všechny
 * varianty s přestupy, chůzí a dobou cesty, dřívější a pozdější spoje.
 * Před přednáškou se sám nastaví na cestu do školy a průběžně obnovuje.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownUp, Building2, ChevronDown, ChevronUp, Clock, Footprints, GraduationCap, History, LoaderCircle, LocateFixed, MapPin, Navigation2, RefreshCw, Search, TrainFront, X } from 'lucide-react';
import type { Itinerary, RideLeg, WalkLeg } from '../../types';
import { calendarDayDiff, capitalize, formatDayMonth, formatDuration, formatRelative, formatTime, formatWeekdayShort, isSameDay, plural, toLocalInputValue, fromLocalInputValue } from '../../lib/dates';
import { haversineMeters } from '../../lib/geo';
import { searchStops } from '../../lib/stops';
import { modeNoun, rideLegs, platformLabel } from '../../lib/transitPlanner';
import { useNow } from '../../hooks/useNow';
import { useOrigin } from '../../hooks/useOrigin';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { geocode, planBetween, recentPlaces, rememberPlace, type JourneyResult, type Place } from '../../services/journey';
import { useStops } from '../../services/stops';
import { errorMessage } from '../../services/http';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { useJourneyStore } from '../../store/journeyStore';
import { buildingForEvent, isTransitTarget } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';
import { myBuildings } from '../../lib/campus';
import { DelayChip, LineBadge } from './TransitBits';

const KIND_ICON = { gps: LocateFixed, origin: MapPin, stop: TrainFront, address: MapPin, place: MapPin, building: Building2, recent: History } as const;

/* ------------------------------------------------------------------ */
/* Pole s našeptávačem                                                 */
/* ------------------------------------------------------------------ */

function PlaceField({ label, value, onChange, placeholder, base }: { label: string; value: Place | null; onChange: (p: Place) => void; placeholder: string; base: Place[] }) {
  const { stops } = useStops();
  const buildings = useAppStore((s) => s.settings.buildings);
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 3) {
      setRemote([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      geocode(q, ctrl.signal)
        .then((r) => setRemote(r.filter((p) => p.kind !== 'stop')))
        .catch(() => setRemote([]))
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const suggestions = useMemo<Place[]>(() => {
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [...base, ...recentPlaces().map((p) => ({ ...p, kind: 'recent' as const }))].slice(0, 9);
    const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const fq = fold(q);
    const b = buildings
      .filter((x) => fold(`${x.name} ${x.address} ${x.aliases.join(' ')}`).includes(fq))
      .slice(0, 3)
      .map<Place>((x) => ({ kind: 'building', label: x.name, detail: x.address, coords: x.coords }));
    const s = stops ? searchStops(stops, q, 5).map<Place>((x) => ({ kind: 'stop', label: x.name, detail: 'zastávka', coords: x.coords })) : [];
    return [...b, ...s, ...remote].slice(0, 10);
  }, [text, base, buildings, stops, remote]);

  const pick = (p: Place) => {
    onChange(p);
    rememberPlace(p);
    setText('');
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <label className="flex h-12 items-center gap-2.5 rounded-[16px] bg-surface px-3.5 ring-1 ring-inset ring-line-strong focus-within:ring-2 focus-within:ring-accent">
        <span className="w-10 shrink-0 text-[11px] font-black uppercase tracking-[0.1em] text-subtle">{label}</span>
        <input
          ref={inputRef}
          value={focused ? text : (value?.label ?? '')}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setText('');
          }}
          onBlur={() => setTimeout(() => setFocused(false), 160)}
          placeholder={value ? value.label : placeholder}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-subtle"
          aria-label={label}
          autoComplete="off"
        />
        {loading && focused && <LoaderCircle className="size-4 animate-spin text-subtle" aria-hidden />}
      </label>
      <AnimatePresence>
        {focused && suggestions.length > 0 && (
          <motion.ul initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass-strong absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-[18px] border border-line p-1.5 shadow-[var(--card-shadow)]">
            {suggestions.map((p, i) => {
              const Icon = KIND_ICON[p.kind];
              return (
                <li key={`${p.kind}-${p.label}-${i}`}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2">
                    <Icon className={cn('size-4 shrink-0', p.kind === 'gps' ? 'text-accent' : 'text-muted')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{p.label}</span>
                      {p.detail && <span className="block truncate text-[12px] text-subtle">{p.detail}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Karta spojení                                                        */
/* ------------------------------------------------------------------ */

function LegBar({ it }: { it: Itinerary }) {
  const start = new Date(it.leaveAt).getTime();
  const total = Math.max(1, new Date(it.arriveAt).getTime() - start);
  let walkCursor = start;
  return (
    <div className="flex h-7 w-full items-center gap-[3px]">
      {it.legs.map((l, i) => {
        if (l.kind === 'walk') {
          const dur = l.minutes * 60_000;
          walkCursor += dur;
          if (l.minutes < 1) return null;
          return (
            <span key={i} className="flex h-full min-w-[22px] items-center justify-center gap-0.5 rounded-lg bg-surface-2 text-[10.5px] font-bold text-muted" style={{ flex: `${Math.max(dur / total, 0.06)} 0 0` }} title={`Pěšky ${l.minutes} min`}>
              <Footprints className="size-3" aria-hidden />
              {l.minutes}
            </span>
          );
        }
        const dur = new Date(l.predictedArrival).getTime() - new Date(l.predictedDeparture).getTime();
        walkCursor = new Date(l.predictedArrival).getTime();
        return (
          <span key={i} className="flex h-full min-w-[40px] items-center rounded-lg" style={{ flex: `${Math.max(dur / total, 0.12)} 0 0`, background: l.color ? `${l.color}22` : 'var(--accent-soft)' }}>
            <LineBadge ride={l} size="xs" />
          </span>
        );
      })}
    </div>
  );
}

function stepsOf(it: Itinerary) {
  return it.legs.filter((l) => l.kind === 'ride' || (l as WalkLeg).minutes > 0);
}

function ItineraryCard({ it, selected, onSelect, now, badge }: { it: Itinerary; selected: boolean; onSelect: () => void; now: Date; badge?: string }) {
  const [open, setOpen] = useState(false);
  const rides = rideLegs(it);
  const first = rides[0];
  const leave = new Date(it.leaveAt);
  const arrive = new Date(it.arriveAt);
  const minutes = Math.round((arrive.getTime() - leave.getTime()) / 60_000);
  const walk = it.legs.filter((l): l is WalkLeg => l.kind === 'walk').reduce((s, l) => s + l.minutes, 0);
  const past = leave.getTime() < now.getTime() - 60_000;
  const startNav = () => {
    const origin = useJourneyStore.getState().from;
    if (!origin) return;
    useUiStore.getState().startNavigation({ itinerary: it, event: null, building: null, origin });
  };
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: past ? 0.5 : 1, y: 0 }} className={cn('rounded-[20px] ring-1 ring-inset transition-colors', selected ? 'bg-accent-soft ring-accent/40' : 'bg-surface ring-line hover:ring-line-strong')}>
      <button type="button" onClick={onSelect} className="block w-full px-4 pb-3 pt-3.5 text-left">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-[26px] leading-none tabular">{formatTime(leave)}</span>
          <span className="text-muted">→</span>
          <span className="font-display text-[26px] leading-none tabular">{formatTime(arrive)}</span>
          <span className="ml-auto text-[13px] font-bold tabular">{formatDuration(minutes)}</span>
        </span>
        <span className="mt-2.5 block">
          <LegBar it={it} />
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          {badge && <span className="rounded-full bg-accent px-2 py-px text-[10.5px] font-black text-accent-fg">{badge}</span>}
          {first ? (
            <span>
              {modeNoun(first.mode).charAt(0).toUpperCase() + modeNoun(first.mode).slice(1)} {first.line} z <strong className="text-fg">{first.fromStop}</strong>
              {first.platform ? ` (${platformLabel(first.mode, first.platform)})` : ''} v {formatTime(new Date(first.predictedDeparture))}
            </span>
          ) : (
            <span>Celou cestu pěšky</span>
          )}
          {first && <DelayChip delaySeconds={first.delaySeconds} />}
          <span>· {it.transfers === 0 ? 'bez přestupu' : `${it.transfers} ${plural(it.transfers, ['přestup', 'přestupy', 'přestupů'])}`}</span>
          <span>· {walk} min pěšky</span>
          {!past && <span className="font-semibold text-accent">· vyrazit {formatRelative(leave, now)}</span>}
        </span>
      </button>
      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg" aria-expanded={open}>
          {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />} Podrobnosti
        </button>
        <button type="button" onClick={startNav} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-bold text-accent-fg hover:brightness-110">
          <Navigation2 className="size-3.5" aria-hidden /> Navigovat
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-3">
            {stepsOf(it).map((l, i) =>
              l.kind === 'walk' ? (
                <li key={i} className="flex gap-3 border-l-2 border-dashed border-line-strong py-2 pl-3 text-[13px] text-muted">
                  <Footprints className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Pěšky {l.minutes} min{l.distanceMeters ? ` (${Math.round(l.distanceMeters / 10) * 10} m)` : ''} → <strong className="text-fg">{l.to}</strong>
                  </span>
                </li>
              ) : (
                <RideStep key={i} ride={l} />
              ),
            )}
          </motion.ol>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function RideStep({ ride }: { ride: RideLeg }) {
  const [stopsOpen, setStopsOpen] = useState(false);
  const via = ride.via ?? [];
  return (
    <li className="border-l-2 py-2 pl-3" style={{ borderColor: ride.color ?? 'var(--accent)' }}>
      <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <LineBadge ride={ride} size="sm" />
        <span>
          směr <strong>{ride.headsign}</strong>
        </span>
        <DelayChip delaySeconds={ride.delaySeconds} />
      </p>
      <p className="mt-1 text-[13px]">
        <strong className="tabular">{formatTime(new Date(ride.predictedDeparture))}</strong> {ride.fromStop}
        {ride.platform ? <span className="text-muted"> · {platformLabel(ride.mode, ride.platform)}</span> : null}
      </p>
      {via.length > 0 && (
        <button type="button" onClick={() => setStopsOpen((v) => !v)} className="my-0.5 text-[12px] font-semibold text-accent hover:underline">
          {stopsOpen ? 'Skrýt zastávky' : `${via.length} ${plural(via.length, ['zastávka', 'zastávky', 'zastávek'])} po cestě`}
        </button>
      )}
      {stopsOpen && (
        <ul className="my-1 space-y-0.5 text-[12px] text-muted">
          {via.map((v, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-10 shrink-0 tabular">{v.at ? formatTime(new Date(v.at)) : ''}</span>
              {v.name}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px]">
        <strong className="tabular">{formatTime(new Date(ride.predictedArrival))}</strong> {ride.toStop} <span className="text-muted">· vystoupit</span>
      </p>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Volba času: čitelný text, pod ním nativní výběr data a času          */
/* ------------------------------------------------------------------ */

function friendlyWhen(d: Date, now: Date): string {
  const day = calendarDayDiff(d, now);
  const prefix = day === 0 ? 'Dnes' : day === 1 ? 'Zítra' : day === -1 ? 'Včera' : `${capitalize(formatWeekdayShort(d))} ${formatDayMonth(d)}`;
  return `${prefix} ${formatTime(d)}`;
}

function TimeChooser({ value, onChange, now, label }: { value: string; onChange: (v: string) => void; now: Date; label: string }) {
  const date = fromLocalInputValue(value);
  // Průhledné nativní pole leží přes čitelný text: na mobilu otevře systémový výběr,
  // na počítači ho otevře showPicker().
  return (
    <span className="relative flex min-w-0 flex-1">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            /* starší prohlížeč – nativní pole funguje i tak */
          }
        }}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
      <span className="pointer-events-none inline-flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13.5px] font-bold ring-1 ring-inset ring-line peer-hover:bg-surface-2 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
        <Clock className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="truncate tabular">{date ? friendlyWhen(date, now) : 'Zvolit čas'}</span>
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Vyhledávač                                                          */
/* ------------------------------------------------------------------ */

export function JourneyPlanner({ active = true }: { active?: boolean }) {
  const now = useNow(30_000);
  const origin = useOrigin();
  const settings = useAppStore((s) => s.settings);
  const events = useVisibleEvents();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [arriveBy, setArriveBy] = useState(false);
  const [timeMode, setTimeMode] = useState<'now' | 'set'>('now');
  const [timeValue, setTimeValue] = useState(() => toLocalInputValue(appNow()));
  const [result, setResult] = useState<JourneyResult | null>(null);
  const [extra, setExtra] = useState<{ before: Itinerary[]; after: Itinerary[]; prev?: string; next?: string }>({ before: [], after: [] });
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lecture, setLecture] = useState<string | null>(null);
  const selected = useJourneyStore((s) => s.selected);
  const touched = useRef(false);

  const myPlace: Place = useMemo(
    () => ({ kind: origin.source === 'gps' && !origin.usingFallback ? 'gps' : 'origin', label: origin.source === 'gps' && !origin.usingFallback ? 'Moje poloha' : origin.label, detail: origin.source === 'gps' ? 'podle GPS' : 'výchozí místo', coords: origin.coords }),
    [origin.coords, origin.label, origin.source, origin.usingFallback],
  );

  // Nadcházející výuka (do 24 h) – rychlé „Na přednášku“
  const lectures = useMemo(() => {
    const t = now.getTime();
    return events
      .filter((e) => isTransitTarget(e) && new Date(e.start).getTime() > t + 5 * 60_000 && new Date(e.start).getTime() < t + 24 * 3_600_000)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({ e, b: buildingForEvent(e, settings).building, subject: useAppStore.getState().subjects.find((s) => s.id === e.subjectId) }))
      .filter((x) => x.b)
      .slice(0, 3);
  }, [events, now, settings]);

  const base = useMemo<Place[]>(() => {
    const fromLectures = lectures.map((l) => l.b!);
    const mine = myBuildings(settings);
    const school = [...new Map([...fromLectures, ...mine].map((b) => [b.id, b])).values()].slice(0, 6).map<Place>((b) => ({ kind: 'building', label: b.name, detail: b.address, coords: b.coords }));
    return [myPlace, ...school];
  }, [myPlace, lectures, settings]);

  const queryTime = useCallback(() => (timeMode === 'now' ? appNow() : (fromLocalInputValue(timeValue) ?? appNow())), [timeMode, timeValue]);

  const search = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!from || !to) return;
      if (haversineMeters(from.coords, to.coords) < 50) {
        setError('Start a cíl jsou skoro na stejném místě.');
        setStatus('error');
        return;
      }
      if (!opts.silent) setStatus('loading');
      setError(null);
      try {
        const r = await planBetween({ from, to, time: queryTime(), arriveBy, wheelchair: settings.accessibleOnly });
        setResult(r);
        setExtra({ before: [], after: [], prev: r.previous, next: r.next });
        setStatus('idle');
        useJourneyStore.setState((s) => ({ from: from.coords, to: to.coords, toIsSchool: to.kind === 'building', selected: s.selected && r.itineraries.some((x) => x.id === s.selected!.id) ? r.itineraries.find((x) => x.id === s.selected!.id)! : (r.itineraries[0] ?? null) }));
      } catch (e) {
        setStatus('error');
        setError(errorMessage(e));
      }
    },
    [from, to, arriveBy, queryTime, settings.accessibleOnly],
  );

  // Požadavek odjinud (např. „Trasa“ u menzy): cíl je dané místo, odjezd teď.
  const request = useJourneyStore((s) => s.request);
  useEffect(() => {
    if (!request) return;
    touched.current = true;
    setFrom(myPlace);
    setTo({ kind: 'place', label: request.label, detail: request.detail, coords: request.coords });
    if (request.arriveBy) {
      setArriveBy(true);
      setTimeMode('set');
      setTimeValue(toLocalInputValue(new Date(request.arriveBy)));
    } else {
      setArriveBy(false);
      setTimeMode('now');
    }
    setLecture(null);
    useJourneyStore.setState({ request: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Výchozí nastavení: odkud = moje poloha; když se blíží přednáška, kam = škola s příjezdem včas.
  useEffect(() => {
    if (touched.current || useJourneyStore.getState().request) return;
    setFrom(myPlace);
    const l = lectures[0];
    if (l && new Date(l.e.start).getTime() - now.getTime() < 3 * 3_600_000) {
      setTo({ kind: 'building', label: l.b!.name, detail: l.b!.address, coords: l.b!.coords });
      setArriveBy(true);
      setTimeMode('set');
      setTimeValue(toLocalInputValue(new Date(new Date(l.e.start).getTime() - settings.bufferMinutes * 60_000)));
      setLecture(l.e.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPlace.coords.lat, myPlace.coords.lng, lectures.length]);

  useEffect(() => {
    if (from && to) void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.label, from?.coords.lat, to?.label, to?.coords.lat, arriveBy, timeMode, timeValue]);

  // Živé obnovování (zpoždění) – každou minutu, když je vyhledávač vidět.
  useEffect(() => {
    if (!from || !to || !active) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void search({ silent: true });
    }, 60_000);
    return () => clearInterval(t);
  }, [from, to, search, active]);

  const loadMore = async (dir: 'prev' | 'next') => {
    if (!from || !to) return;
    const cursor = dir === 'prev' ? extra.prev : extra.next;
    if (!cursor) return;
    try {
      const r = await planBetween({ from, to, time: queryTime(), arriveBy, cursor, wheelchair: settings.accessibleOnly });
      setExtra((x) => (dir === 'prev' ? { ...x, before: [...r.itineraries, ...x.before], prev: r.previous } : { ...x, after: [...x.after, ...r.itineraries], next: r.next }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const list = useMemo(() => {
    const seen = new Set<string>();
    return [...extra.before, ...(result?.itineraries ?? []), ...extra.after]
      .filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
      .sort((a, b) => a.leaveAt.localeCompare(b.leaveAt));
  }, [result, extra]);

  const lectureEvent = lecture ? events.find((e) => e.id === lecture) : undefined;
  const fastest = list.length ? list.reduce((best, it) => (new Date(it.arriveAt).getTime() - new Date(it.leaveAt).getTime() < new Date(best.arriveAt).getTime() - new Date(best.leaveAt).getTime() ? it : best), list[0]) : null;
  const deadline = lectureEvent ? new Date(lectureEvent.start).getTime() - settings.bufferMinutes * 60_000 : null;
  const recommended = deadline ? [...list].reverse().find((it) => new Date(it.arriveAt).getTime() <= deadline && new Date(it.leaveAt).getTime() >= now.getTime()) : null;

  const swap = () => {
    touched.current = true;
    setFrom(to);
    setTo(from);
    setLecture(null);
  };

  return (
    <div className="space-y-3">
      <div className="relative space-y-2">
        <PlaceField label="Odkud" value={from} onChange={(p) => { touched.current = true; setFrom(p); }} placeholder="Zastávka, adresa, místo…" base={base} />
        <PlaceField label="Kam" value={to} onChange={(p) => { touched.current = true; setTo(p); setLecture(null); }} placeholder="Kam chcete jet?" base={base.slice(1).concat(myPlace)} />
        <button type="button" onClick={swap} className="absolute right-3 top-[38px] z-20 grid size-8 place-items-center rounded-full bg-surface text-muted shadow ring-1 ring-line hover:text-fg" aria-label="Prohodit odkud a kam">
          <ArrowDownUp className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-full bg-surface-2 p-1 ring-1 ring-inset ring-line">
          {(['odjezd', 'prijezd'] as const).map((m) => {
            const active = (m === 'prijezd') === arriveBy;
            return (
              <button key={m} type="button" onClick={() => { touched.current = true; setArriveBy(m === 'prijezd'); if (m === 'prijezd') setTimeMode('set'); }} className={cn('h-8 rounded-full px-3 text-[12.5px] font-bold transition-colors', active ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg')}>
                {m === 'odjezd' ? 'Odjezd' : 'Příjezd'}
              </button>
            );
          })}
        </div>
        {timeMode === 'now' && !arriveBy ? (
          <button type="button" onClick={() => setTimeMode('set')} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold ring-1 ring-inset ring-line hover:bg-surface-2">
            <Clock className="size-4" aria-hidden /> Teď
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <TimeChooser value={timeValue} now={now} label={arriveBy ? 'Čas příjezdu' : 'Čas odjezdu'} onChange={(v) => { touched.current = true; setTimeValue(v); }} />
            {!arriveBy && (
              <button type="button" onClick={() => setTimeMode('now')} className="h-10 shrink-0 rounded-full px-2.5 text-[12.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
                Teď
              </button>
            )}
          </span>
        )}
        <button type="button" onClick={() => void search()} className="ml-auto grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg hover:brightness-110" aria-label="Hledat spojení">
          {status === 'loading' ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
        </button>
      </div>

      {lectures.length > 0 && (
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {lectures.map(({ e, b, subject }) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                touched.current = true;
                setFrom(myPlace);
                setTo({ kind: 'building', label: b!.name, detail: b!.address, coords: b!.coords });
                setArriveBy(true);
                setTimeMode('set');
                setTimeValue(toLocalInputValue(new Date(new Date(e.start).getTime() - settings.bufferMinutes * 60_000)));
                setLecture(e.id);
              }}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition', lecture === e.id ? 'bg-accent-soft text-accent ring-accent/40' : 'bg-surface text-muted ring-line hover:text-fg')}
            >
              <GraduationCap className="size-3.5" aria-hidden />
              {isSameDay(new Date(e.start), now) ? '' : 'Zítra '}
              {formatTime(new Date(e.start))} · {subject?.code ?? subject?.name ?? e.title} ({b!.name})
            </button>
          ))}
        </div>
      )}

      {lectureEvent && deadline && (
        <p className="rounded-[16px] bg-accent-soft px-3.5 py-2.5 text-[13px] text-accent">
          Na přednášku v {formatTime(new Date(lectureEvent.start))} – chcete být na místě {settings.bufferMinutes} min předem, tedy do {formatTime(new Date(deadline))}.
        </p>
      )}

      {status === 'error' && error && <p className="rounded-[16px] bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-300">{error}</p>}

      {!to && (
        <p className="px-1 text-[13.5px] text-muted">Zadejte, kam chcete jet – zastávku, adresu, budovu školy nebo třeba „Národní knihovna“.</p>
      )}

      {to && (
        <div>
          {extra.prev && (
            <button type="button" onClick={() => void loadMore('prev')} className="mb-2 w-full rounded-full py-2 text-[12.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
              Dřívější spoje
            </button>
          )}
          {status === 'loading' && list.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-28 rounded-[20px]" />
              ))}
            </div>
          ) : list.length === 0 && status === 'idle' && result ? (
            <p className="rounded-[16px] bg-surface-2 px-3.5 py-3 text-[13.5px] text-muted">Pro zvolený čas plánovač nenašel žádné spojení. Zkuste jiný čas.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((it) => (
                <ItineraryCard
                  key={it.id}
                  it={it}
                  now={now}
                  selected={selected?.id === it.id}
                  onSelect={() => useJourneyStore.setState((s) => ({ selected: it, focusTick: s.focusTick + 1 }))}
                  badge={recommended?.id === it.id ? 'Doporučený' : fastest?.id === it.id && list.length > 2 ? 'Nejrychlejší' : undefined}
                />
              ))}
            </ul>
          )}
          {extra.next && list.length > 0 && (
            <button type="button" onClick={() => void loadMore('next')} className="mt-2 w-full rounded-full py-2 text-[12.5px] font-bold text-muted hover:bg-surface-2 hover:text-fg">
              Pozdější spoje
            </button>
          )}
          {result && (
            <p className="mt-2 flex items-center gap-1.5 px-1 text-[11.5px] text-subtle">
              <RefreshCw className="size-3" aria-hidden /> Živě se zpožděním, obnoveno {formatRelative(new Date(result.fetchedAt), new Date())}. Data: Transitous, PID.
            </p>
          )}
        </div>
      )}
      {from && to && (
        <button type="button" onClick={() => { touched.current = true; setTo(null); setResult(null); useJourneyStore.setState({ selected: null }); }} className="inline-flex items-center gap-1 px-1 text-[12px] font-semibold text-subtle hover:text-fg">
          <X className="size-3.5" aria-hidden /> Nové hledání
        </button>
      )}
    </div>
  );
}
