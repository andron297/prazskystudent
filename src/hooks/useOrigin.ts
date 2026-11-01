import type { LatLng, OriginPref } from '../types';
import { findPreset } from '../lib/buildings';
import { useAppStore } from '../store/appStore';
import { useGeolocation, type GeoState } from './useGeolocation';

export interface ResolvedOrigin {
  coords: LatLng;
  label: string;
  source: OriginPref['source'];
  /** GPS byla požadovaná, ale nejsme ji schopni použít – jede se ze záložního místa. */
  usingFallback: boolean;
  geo: GeoState & { retry: () => void };
}

/** Odkud počítat cestu: GPS, uložené místo, nebo simulovaná poloha (demo). */
export function useOrigin(): ResolvedOrigin {
  const pref = useAppStore((s) => s.settings.origin[s.settings.mode]);
  const geo = useGeolocation(pref.source === 'gps');

  if (pref.source === 'gps' && geo.coords) {
    return { coords: geo.coords, label: 'Tvoje poloha', source: 'gps', usingFallback: false, geo };
  }
  if (pref.source === 'custom' && pref.custom) {
    return { coords: pref.custom.coords, label: pref.custom.label, source: 'custom', usingFallback: false, geo };
  }
  const preset = findPreset(pref.presetId);
  return {
    coords: preset.coords,
    label: preset.label,
    source: pref.source === 'gps' ? 'gps' : 'preset',
    usingFallback: pref.source === 'gps',
    geo,
  };
}
