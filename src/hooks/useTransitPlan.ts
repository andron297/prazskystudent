import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Building, Itinerary, ScheduleEvent, TransitResult } from '../types';
import { haversineMeters } from '../lib/geo';
import { applyMargins, dedupeByTrip, DEFAULT_MARGINS, pickItinerary, planJourney, type TransitPlan } from '../lib/transitPlanner';
import { countdownStart, previousEvent } from '../lib/transitWindow';
import { buildingForEvent } from '../store/selectors';
import { resolveChosen, useTripStore } from '../store/tripStore';
import { useWeather } from '../services/weather';
import { useVisibleEvents } from './useVisibleEvents';
import { createApi } from '../services/api';
import { errorMessage } from '../services/http';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { useUiStore } from '../store/uiStore';
import { useNow } from './useNow';
import { useOrigin, type ResolvedOrigin } from './useOrigin';

export interface TransitPlanState {
  plan: TransitPlan | null;
  /** Spoj, podle kterého se řídí odpočet (volba studenta, jinak doporučený). */
  selected: Itinerary | null;
  result: TransitResult | null;
  loading: boolean;
  error: string | null;
  origin: ResolvedOrigin;
  onSite: boolean;
  /** Událost je moc daleko na živé odjezdové tabule (Live režim). */
  tooFar: boolean;
  /** Od kdy se ukáže odpočet (nejdřív 4 h předem, po předchozí výuce). */
  windowStart: Date | null;
  refresh: () => void;
}

/** Živý (nebo simulovaný) plán cesty na danou událost, přepočítávaný v čase. */
export function useTransitPlan(event: ScheduleEvent | null, building: Building | null): TransitPlanState {
  const settings = useAppStore((s) => s.settings);
  const server = useUiStore((s) => s.server);
  const now = useNow(1000);
  const realOrigin = useOrigin();
  const events = useVisibleEvents();
  const [result, setResult] = useState<TransitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(0);
  const lastManual = useRef(0);
  const consumeManual = () => {
    const fresh = manual !== lastManual.current;
    lastManual.current = manual;
    return fresh;
  };

  const api = useMemo(
    () => createApi(settings, server, appNow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.mode, settings.golemioApiKey, settings.googleMapsApiKey, settings.anthropicApiKey, settings.walkSpeed, settings.bufferMinutes, server],
  );

  const eventStartMs = event ? new Date(event.start).getTime() : 0;
  const minutesUntil = event ? (eventStartMs - now.getTime()) / 60_000 : 0;
  const windowStart = useMemo(() => (event ? countdownStart(event, events) : null), [event, events]);
  const tooFar = settings.mode === 'live' && Boolean(windowStart && now < windowStart);
  // Po předchozí akci (nebo na jejím konci) jedu z jejího místa, pokud nevím přesnou polohu z GPS.
  const prev = useMemo(() => (event ? previousEvent(event, events) : null), [event, events]);
  const prevBuilding = prev && !prev.online ? buildingForEvent(prev, settings).building : null;
  const fromPrev =
    prevBuilding && (realOrigin.source !== 'gps' || realOrigin.usingFallback) && now.getTime() >= new Date(prev!.start).getTime() && now.getTime() <= new Date(prev!.end).getTime() + 45 * 60_000;
  const origin = useMemo<ResolvedOrigin>(
    () => (fromPrev && prevBuilding ? { ...realOrigin, coords: prevBuilding.coords, label: prevBuilding.name } : realOrigin),
    [fromPrev, prevBuilding, realOrigin],
  );
  const onSite = Boolean(building && haversineMeters(origin.coords, building.coords) < 300);
  const refreshEvery = settings.mode === 'demo' ? 15_000 : 30_000;
  const bucket = Math.floor(now.getTime() / refreshEvery);
  const originStop = settings.originStop[settings.mode];
  const originKey = `${origin.coords.lat.toFixed(4)},${origin.coords.lng.toFixed(4)}|${originStop?.name ?? ''}`;

  useEffect(() => {
    if (!event || !building || tooFar || onSite || minutesUntil < -5) {
      setResult(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .planTransit({ origin: origin.coords, originLabel: origin.label, building, eventStart: new Date(event.start), now: appNow(), originStop, fresh: consumeManual() })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Přepočet při změně události, polohy, režimu, nebo po uplynutí intervalu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.start, building?.id, building?.arrivalStops, originKey, api, bucket, manual, tooFar, onSite]);

  const prep = settings.prepMinutes ?? DEFAULT_MARGINS.prep;
  const itineraries = useMemo(() => (result ? dedupeByTrip(result.itineraries.map((it) => applyMargins(it, { ...DEFAULT_MARGINS, prep }))) : []), [result, prep]);

  // Za deště, mrazu nebo vedra doporučit méně chůze.
  const { forecast } = useWeather(origin.coords, Boolean(event));
  const badWeather = useMemo(() => {
    if (!forecast?.hourly.length || !event) return false;
    const t = eventStartMs - 30 * 60_000;
    const h = forecast.hourly.reduce((best, x) => (Math.abs(x.time.getTime() - t) < Math.abs(best.time.getTime() - t) ? x : best), forecast.hourly[0]);
    return h.precipProb >= 50 || h.feels <= -2 || h.feels >= 30;
  }, [forecast, event, eventStartMs]);

  const plan = useMemo(() => {
    if (!event || !result) return null;
    return planJourney({
      now,
      eventStart: new Date(event.start),
      bufferMinutes: settings.bufferMinutes,
      minMarginMinutes: settings.minMarginMinutes,
      itineraries,
      accessibleOnly: settings.accessibleOnly,
      preferAirConditioned: settings.preferAirConditioned,
      badWeather,
    });
  }, [event, result, itineraries, now, settings.bufferMinutes, settings.minMarginMinutes, settings.accessibleOnly, settings.preferAirConditioned, badWeather]);

  // Spoj, který si student zvolil („Pojedu tímto“) – v Dopravě nebo v detailu pod odpočtem.
  const chosenTrip = useTripStore((s) => (event ? s.byEvent[event.id] : undefined));
  const selected = useMemo(() => {
    const live = plan ? [...plan.upcoming, ...plan.earlier, ...(plan.lastCall ? [plan.lastCall] : [])] : [];
    return resolveChosen(chosenTrip, live, now) ?? pickItinerary(plan, null, now);
  }, [plan, chosenTrip, now]);

  const refresh = useCallback(() => setManual((m) => m + 1), []);
  return { plan, selected, result, loading, error, origin, onSite, tooFar, windowStart, refresh };
}
