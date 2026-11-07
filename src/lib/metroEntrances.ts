/**
 * Vstupy do stanic metra (z otevřených dat PID – GTFS, CC BY 4.0). Některé
 * stanice jich mají přes deset; navigace vybere ten, kterým vede pěší trasa,
 * a když trasa nemá tvar, ten nejbližší.
 */
import type { LatLng } from '../types';
import { haversineMeters } from './geo';
import { cumulative, projectOnPath } from './polyline';

export interface MetroEntrance {
  /** Označení vstupu v datech PID (E1, E2 (A)…). */
  id: string;
  lat: number;
  lng: number;
  /** Bezbariérový vstup (výtah). */
  a?: 1;
}

export interface MetroStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  platforms: string[];
  entrances: MetroEntrance[];
}

let loading: Promise<MetroStation[]> | null = null;

export function loadMetroStations(): Promise<MetroStation[]> {
  if (!loading) {
    loading = fetch('/data/metro-entrances.json')
      .then((r) => (r.ok ? (r.json() as Promise<{ stations: MetroStation[] }>) : { stations: [] }))
      .then((d) => d.stations ?? [])
      .catch(() => {
        loading = null;
        return [];
      });
  }
  return loading;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Stanice metra podle názvu zastávky a polohy nástupiště. */
export function stationFor(stations: MetroStation[], name: string, coords: LatLng): MetroStation | null {
  const n = fold(name);
  const byName = stations.filter((s) => fold(s.name) === n);
  const pool = byName.length ? byName : stations;
  let best: MetroStation | null = null;
  let bestD = Infinity;
  for (const s of pool) {
    const d = haversineMeters(coords, { lat: s.lat, lng: s.lng });
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best && bestD < (byName.length ? 900 : 400) ? best : null;
}

export interface EntranceOnPath {
  entrance: MetroEntrance;
  /** Kolik metrů od začátku trasy vstup leží. */
  along: number;
  /** Jak daleko od trasy (m). */
  offRoute: number;
}

/**
 * Kterým vstupem trasa vede: vstup nejblíž čáře trasy (do 40 m). Když
 * žádný tak blízko není (trasa je jen přímka), vrátí vstup nejblíž startu.
 */
export function entranceForPath(station: MetroStation, path: LatLng[]): EntranceOnPath | null {
  if (station.entrances.length === 0 || path.length === 0) return null;
  const cum = cumulative(path);
  let best: EntranceOnPath | null = null;
  for (const e of station.entrances) {
    const p = projectOnPath(path, { lat: e.lat, lng: e.lng }, cum);
    if (!best || p.offRoute < best.offRoute) best = { entrance: e, along: p.along, offRoute: p.offRoute };
  }
  if (best && best.offRoute <= 40) return best;
  const start = path[0];
  const nearest = [...station.entrances].sort((a, b) => haversineMeters(start, a) - haversineMeters(start, b))[0];
  return { entrance: nearest, along: haversineMeters(start, nearest), offRoute: Infinity };
}
