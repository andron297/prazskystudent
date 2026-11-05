/**
 * Geometrie trasy: dekódování lomené čáry (Google polyline), vzdálenosti
 * podél trasy, průmět polohy na trasu a směr (azimut).
 */
import type { LatLng } from '../types';
import { haversineMeters } from './geo';

/** Dekóduje Google polyline (Transitous používá přesnost 7). */
export function decodePolyline(encoded: string, precision = 7): LatLng[] {
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push({ lat: lat / factor, lng: lng / factor });
  }
  return out;
}

/** Kumulativní vzdálenosti vrcholů od začátku (m). */
export function cumulative(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) out.push(out[i - 1] + haversineMeters(path[i - 1], path[i]));
  return out;
}

export function pathLength(path: LatLng[]): number {
  const c = cumulative(path);
  return c[c.length - 1] ?? 0;
}

/** Azimut z a do b ve stupních (0 = sever, 90 = východ). */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Změna směru v rozsahu −180…180 (kladná = doprava). */
export function turnAngle(fromBearing: number, toBearing: number): number {
  return ((toBearing - fromBearing + 540) % 360) - 180;
}

/** Bod na trase ve vzdálenosti `along` metrů od začátku. */
export function pointAlong(path: LatLng[], along: number, cum = cumulative(path)): LatLng {
  if (path.length === 0) return { lat: 0, lng: 0 };
  if (along <= 0) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= along) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (along - cum[i - 1]) / seg;
      return { lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t, lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t };
    }
  }
  return path[path.length - 1];
}

/**
 * Průmět polohy na trasu: jak daleko po trase jsem (m) a jak daleko od ní
 * (m). Lokální rovinná aproximace – na pár kilometrech přesná dost.
 */
export function projectOnPath(path: LatLng[], p: LatLng, cum = cumulative(path)): { along: number; offRoute: number; index: number } {
  if (path.length === 0) return { along: 0, offRoute: Infinity, index: 0 };
  if (path.length === 1) return { along: 0, offRoute: haversineMeters(path[0], p), index: 0 };
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110_540;
  let best = { along: 0, offRoute: Infinity, index: 0 };
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1].lng * kx;
    const ay = path[i - 1].lat * ky;
    const bx = path[i].lng * kx;
    const by = path[i].lat * ky;
    const px = p.lng * kx;
    const py = p.lat * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best.offRoute) best = { along: cum[i - 1] + (cum[i] - cum[i - 1]) * t, offRoute: d, index: i - 1 };
  }
  return best;
}
