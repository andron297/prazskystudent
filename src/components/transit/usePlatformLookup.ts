import { useCallback } from 'react';
import type { RideLeg } from '../../types';
import { platformCode } from '../../lib/stops';
import { useStops } from '../../services/stops';

/** Doplní nástupiště z dat PID (Golemio ho posílá samo, simulace ne). */
export function usePlatformLookup(): (ride: RideLeg) => string | undefined {
  const { stops } = useStops();
  return useCallback((ride: RideLeg) => (stops && ride.headsign ? platformCode(stops, ride.fromStop, ride.line, ride.headsign) : undefined), [stops]);
}
