import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Building, ScheduleEvent, TransitResult } from '../types';
import { haversineMeters } from '../lib/geo';
import { planJourney, type TransitPlan } from '../lib/transitPlanner';
import { createApi } from '../services/api';
import { errorMessage } from '../services/http';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { useUiStore } from '../store/uiStore';
import { useNow } from './useNow';
import { useOrigin, type ResolvedOrigin } from './useOrigin';

export interface TransitPlanState {
  plan: TransitPlan | null;
  result: TransitResult | null;
  loading: boolean;
  error: string | null;
  origin: ResolvedOrigin;
  onSite: boolean;
  /** Událost je moc daleko na živé odjezdové tabule (Live režim). */
  tooFar: boolean;
  refresh: () => void;
}

/** Živý (nebo simulovaný) plán cesty na danou událost, přepočítávaný v čase. */
export function useTransitPlan(event: ScheduleEvent | null, building: Building | null): TransitPlanState {
  const settings = useAppStore((s) => s.settings);
  const server = useUiStore((s) => s.server);
  const now = useNow(1000);
  const origin = useOrigin();
  const [result, setResult] = useState<TransitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(0);

  const api = useMemo(
    () => createApi(settings, server, appNow),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.mode, settings.golemioApiKey, settings.googleMapsApiKey, settings.anthropicApiKey, settings.walkSpeed, settings.bufferMinutes, server],
  );

  const eventStartMs = event ? new Date(event.start).getTime() : 0;
  const minutesUntil = event ? (eventStartMs - now.getTime()) / 60_000 : 0;
  const tooFar = settings.mode === 'live' && minutesUntil > 180;
  const onSite = Boolean(building && haversineMeters(origin.coords, building.coords) < 300);
  const refreshEvery = settings.mode === 'demo' ? 15_000 : 30_000;
  const bucket = Math.floor(now.getTime() / refreshEvery);
  const originKey = `${origin.coords.lat.toFixed(4)},${origin.coords.lng.toFixed(4)}`;

  useEffect(() => {
    if (!event || !building || tooFar || onSite || minutesUntil < -5) {
      setResult(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .planTransit({ origin: origin.coords, originLabel: origin.label, building, eventStart: new Date(event.start), now: appNow() })
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

  const plan = useMemo(() => {
    if (!event || !result) return null;
    return planJourney({
      now,
      eventStart: new Date(event.start),
      bufferMinutes: settings.bufferMinutes,
      comfortMinutes: settings.comfortMinutes,
      itineraries: result.itineraries,
      accessibleOnly: settings.accessibleOnly,
      preferAirConditioned: settings.preferAirConditioned,
    });
  }, [event, result, now, settings.bufferMinutes, settings.comfortMinutes, settings.accessibleOnly, settings.preferAirConditioned]);

  const refresh = useCallback(() => setManual((m) => m + 1), []);
  return { plan, result, loading, error, origin, onSite, tooFar, refresh };
}
