import type { LatLng, OriginPref, OriginStopPref } from '../types';
import { findPreset } from '../lib/buildings';
import { haversineMeters } from '../lib/geo';
import { useAppStore } from '../store/appStore';
import { appNow } from '../store/clockStore';
import { useGeolocation, type GeoState } from './useGeolocation';

export interface ResolvedOrigin {
  coords: LatLng;
  label: string;
  source: OriginPref['source'];
  /** GPS byla požadovaná, ale nejsme ji schopni použít – jede se ze záložního místa. */
  usingFallback: boolean;
  /** Ruční volba místa (platí do této chvíle). */
  overrideUntil: Date | null;
  geo: GeoState & { retry: () => void };
}

/** Jak dlouho platí ruční volba místa nebo zastávky. */
export const OVERRIDE_HOURS = 3;
export const overrideUntil = (): string => new Date(appNow().getTime() + OVERRIDE_HOURS * 3_600_000).toISOString();

/** Platí ještě ruční volba místa? */
export function activeOverride(pref: OriginPref, now: Date = appNow()): Date | null {
  if (pref.source === 'gps' || !pref.until) return null;
  const until = new Date(pref.until);
  return until.getTime() > now.getTime() ? until : null;
}

/**
 * Odkud počítat cestu. V Live režimu vždy primárně aktuální poloha (GPS);
 * uložené místo jen když poloha není k dispozici, nebo když ho student
 * výslovně zvolil (pak platí 3 hodiny). V ukázce simulovaná poloha.
 */
export function useOrigin(): ResolvedOrigin {
  const mode = useAppStore((s) => s.settings.mode);
  const pref = useAppStore((s) => s.settings.origin[s.settings.mode]);
  const override = activeOverride(pref);
  const wantGps = mode === 'live' ? !override : pref.source === 'gps';
  const geo = useGeolocation(wantGps);

  if (wantGps && geo.coords) {
    return { coords: geo.coords, label: 'Vaše poloha', source: 'gps', usingFallback: false, overrideUntil: null, geo };
  }
  const place = pref.source === 'custom' && pref.custom ? pref.custom : findPreset(pref.presetId);
  return {
    coords: place.coords,
    label: place.label,
    source: wantGps ? 'gps' : pref.source,
    usingFallback: wantGps,
    overrideUntil: override,
    geo,
  };
}

/**
 * Ručně zvolená zastávka – platí jen chvíli (a jen poblíž výchozího místa),
 * jinak se jede z nejlepší zastávky podle aktuální polohy.
 */
export function activeOriginStop(stop: OriginStopPref | null | undefined, from: LatLng | null, now: Date = appNow()): OriginStopPref | null {
  if (!stop?.until || new Date(stop.until).getTime() <= now.getTime()) return null;
  if (from && haversineMeters(from, stop.coords) > 2000) return null;
  return stop;
}

/** Aktuálně platná ruční zastávka pro tento režim. */
export function useOriginStop(from: LatLng | null): OriginStopPref | null {
  const stop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  return activeOriginStop(stop, from);
}
