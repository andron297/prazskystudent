import type { LatLng, WalkSpeed } from '../types';

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rychlost chůze v metrech za minutu. */
/** Rychlost chůze včetně semaforů a přechodů (realisticky, ne „sportovně“). */
export const WALK_SPEED_M_PER_MIN: Record<WalkSpeed, number> = {
  slow: 62,
  normal: 75,
  fast: 88,
};

/** Ulice nevedou vzdušnou čarou – koeficient zajížďky pro pěší přesun. */
export const WALK_DETOUR_FACTOR = 1.3;

export function walkingMinutes(a: LatLng, b: LatLng, speed: WalkSpeed = 'normal'): number {
  const meters = haversineMeters(a, b) * WALK_DETOUR_FACTOR;
  return Math.max(1, Math.ceil(meters / WALK_SPEED_M_PER_MIN[speed]));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function isValidLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Odkaz do Google Map s navigací MHD. */
export function googleMapsTransitUrl(destination: LatLng, origin?: LatLng | null): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'transit',
  });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
