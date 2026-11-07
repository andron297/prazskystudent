import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../types';
import { useTestStore } from '../store/testStore';

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable' | 'error';

export interface GeoState {
  status: GeoStatus;
  coords?: LatLng;
  accuracy?: number;
  updatedAt?: number;
  message?: string;
}

/** Sleduje polohu přes navigator.geolocation (jen když je zapnuto). */
export function useGeolocation(enabled: boolean): GeoState & { retry: () => void } {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  // Testovací režim: simulovaná poloha místo GPS.
  const sim = useTestStore((s) => s.gps);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'unavailable', message: 'Prohlížeč nepodporuje určování polohy.' });
      return;
    }
    setState((s) => ({ ...s, status: s.coords ? 'ok' : 'locating' }));
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) =>
          setState({
            status: 'ok',
            coords: { lat: position.coords.latitude, lng: position.coords.longitude },
            accuracy: position.coords.accuracy,
            updatedAt: position.timestamp,
          }),
        (error) =>
          setState((s) => ({
            ...s,
            status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error',
            message:
              error.code === error.PERMISSION_DENIED
                ? 'Přístup k poloze je zakázaný – povolte ho v prohlížeči, nebo zvolte výchozí místo.'
                : 'Polohu se nepodařilo zjistit.',
          })),
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
      );
    } catch {
      setState({ status: 'unavailable', message: 'Určování polohy není v tomto prostředí dostupné.' });
    }
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  if (enabled && sim) return { status: 'ok', coords: { lat: sim.lat, lng: sim.lng }, accuracy: 5, updatedAt: Date.now(), retry };
  return { ...state, retry };
}
