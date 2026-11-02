/**
 * Klient PID Golemio API (přes `/api/golemio`):
 *  - /v2/pid/departureboards – odjezdy se zpožděním, klimatizací a bezbariérovostí
 *  - /v2/gtfs/stops – zastávky v okolí GPS polohy / podle názvu
 *  - /v2/gtfs/trips/{id} – zastávkové časy spoje (doba jízdy mezi zastávkami)
 *  - /v2/vehiclepositions/{tripId} – detail vozu (typ, evidenční číslo, zpoždění)
 */
import type { LatLng, TransitMode } from '../types';
import { haversineMeters } from '../lib/geo';
import { requestJson } from './http';

export interface GolemioDeparture {
  stopId: string;
  stopName: string;
  platform?: string;
  line: string;
  mode: TransitMode;
  headsign: string;
  tripId: string;
  scheduled: Date;
  predicted: Date;
  delaySeconds: number | null;
  isAirConditioned: boolean | null;
  isWheelchairAccessible: boolean | null;
  isCanceled: boolean;
}

export interface GolemioStop {
  id: string;
  name: string;
  coords: LatLng;
  platform?: string;
  distanceMeters?: number;
}

export interface TripStopTime {
  stopId: string;
  stopName?: string;
  arrivalSec: number;
  departureSec: number;
  sequence: number;
}

export interface VehicleInfo {
  vehicleType?: string;
  registration?: string;
  delaySeconds?: number;
  airConditioned?: boolean;
  wheelchairAccessible?: boolean;
}

interface RawDepartureBoard {
  stops?: { stop_id?: string; stop_name?: string; platform_code?: string | null }[];
  departures?: {
    departure_timestamp?: { predicted?: string; scheduled?: string };
    arrival_timestamp?: { predicted?: string; scheduled?: string };
    delay?: { is_available?: boolean; minutes?: number | null; seconds?: number | null };
    route?: { short_name?: string; type?: number };
    stop?: { id?: string; platform_code?: string | null };
    trip?: {
      id?: string;
      headsign?: string;
      is_canceled?: boolean;
      is_wheelchair_accessible?: boolean | null;
      is_air_conditioned?: boolean | null;
    };
  }[];
}

interface RawStopFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { stop_id?: string; stop_name?: string; platform_code?: string | null; location_type?: number };
}

interface RawTrip {
  stop_times?: {
    stop_id?: string;
    arrival_time?: string;
    departure_time?: string;
    stop_sequence?: number;
    stop?: { properties?: { stop_name?: string }; stop_name?: string };
  }[];
}

/** GTFS route_type → druh dopravy. */
export function gtfsRouteType(type: number | undefined): TransitMode {
  switch (type) {
    case 0:
      return 'tram';
    case 1:
      return 'metro';
    case 2:
      return 'train';
    case 4:
      return 'ferry';
    case 7:
      return 'funicular';
    case 11:
      return 'trolleybus';
    default:
      return 'bus';
  }
}

function hmsToSeconds(value: string | undefined): number {
  if (!value) return Number.NaN;
  const [h, m, s] = value.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export class GolemioClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  private get<T>(path: string, query: [string, string][] = []): Promise<T> {
    const params = new URLSearchParams([['path', path], ...query]);
    return requestJson<T>(`/api/golemio?${params.toString()}`, {
      headers: this.apiKey ? { 'x-golemio-key': this.apiKey } : {},
      timeoutMs: 12_000,
    });
  }

  /** Golemio vrací nejvýš 100 odjezdů na dotaz – delší okno se načte po stránkách (podle času). */
  async departureBoards(options: Parameters<GolemioClient['departureBoardsPage']>[0]): Promise<GolemioDeparture[]> {
    const wanted = options.limit ?? 100;
    if (wanted <= 100) return this.departureBoardsPage(options);
    const start = options.timeFrom ?? new Date();
    const end = start.getTime() + (options.minutesAfter ?? 120) * 60_000;
    const seen = new Set<string>();
    const out: GolemioDeparture[] = [];
    let from = start;
    for (let page = 0; page < 5 && out.length < wanted; page++) {
      const minutesAfter = Math.max(1, Math.round((end - from.getTime()) / 60_000));
      const batch = await this.departureBoardsPage({ ...options, timeFrom: from, minutesAfter, limit: 100 });
      for (const d of batch) {
        const key = `${d.tripId}|${d.stopId}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(d);
        }
      }
      if (batch.length < 100) break;
      const last = Math.max(...batch.map((d) => d.scheduled.getTime()));
      if (last >= end || last <= from.getTime()) break;
      from = new Date(last);
    }
    return out.sort((a, b) => a.predicted.getTime() - b.predicted.getTime());
  }

  private async departureBoardsPage(options: {
    names?: string[];
    ids?: string[];
    minutesBefore?: number;
    minutesAfter?: number;
    timeFrom?: Date;
    limit?: number;
  }): Promise<GolemioDeparture[]> {
    const query: [string, string][] = [];
    for (const name of options.names ?? []) query.push(['names[]', name]);
    for (const id of options.ids ?? []) query.push(['ids[]', id]);
    query.push(['minutesBefore', String(options.minutesBefore ?? 0)]);
    query.push(['minutesAfter', String(Math.min(4320, Math.max(1, Math.round(options.minutesAfter ?? 120))))]);
    if (options.timeFrom) query.push(['timeFrom', options.timeFrom.toISOString()]);
    query.push(['limit', String(options.limit ?? 100)]);
    query.push(['mode', 'departures'], ['order', 'real'], ['airCondition', 'true']);
    const raw = await this.get<RawDepartureBoard>('pid/departureboards', query);
    const stopNames = new Map((raw.stops ?? []).map((s) => [s.stop_id ?? '', s.stop_name ?? '']));
    const out: GolemioDeparture[] = [];
    for (const d of raw.departures ?? []) {
      const scheduledIso = d.departure_timestamp?.scheduled;
      if (!scheduledIso || !d.trip?.id) continue;
      const scheduled = new Date(scheduledIso);
      const available = d.delay?.is_available === true;
      const delaySeconds = available ? (d.delay?.seconds ?? (d.delay?.minutes ?? 0) * 60) : null;
      const predicted = d.departure_timestamp?.predicted
        ? new Date(d.departure_timestamp.predicted)
        : new Date(scheduled.getTime() + (delaySeconds ?? 0) * 1000);
      const stopId = d.stop?.id ?? '';
      out.push({
        stopId,
        stopName: stopNames.get(stopId) ?? '',
        platform: d.stop?.platform_code ?? undefined,
        line: d.route?.short_name ?? '?',
        mode: gtfsRouteType(d.route?.type),
        headsign: d.trip.headsign ?? '',
        tripId: d.trip.id,
        scheduled,
        predicted,
        delaySeconds,
        isAirConditioned: d.trip.is_air_conditioned ?? null,
        isWheelchairAccessible: d.trip.is_wheelchair_accessible ?? null,
        isCanceled: d.trip.is_canceled === true,
      });
    }
    return out.filter((d) => !d.isCanceled);
  }

  async nearbyStops(coords: LatLng, rangeMeters = 700): Promise<GolemioStop[]> {
    const raw = await this.get<{ features?: RawStopFeature[] }>('gtfs/stops', [
      ['latlng', `${coords.lat},${coords.lng}`],
      ['range', String(rangeMeters)],
      ['limit', '60'],
    ]);
    return (raw.features ?? [])
      .filter((f) => (f.properties?.location_type ?? 0) === 0 && f.geometry?.coordinates && f.properties?.stop_id)
      .map((f) => {
        const [lng, lat] = f.geometry!.coordinates!;
        const stopCoords = { lat, lng };
        return {
          id: f.properties!.stop_id!,
          name: f.properties!.stop_name ?? '',
          platform: f.properties!.platform_code ?? undefined,
          coords: stopCoords,
          distanceMeters: haversineMeters(coords, stopCoords),
        };
      })
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }

  async stopsByNames(names: string[]): Promise<GolemioStop[]> {
    if (names.length === 0) return [];
    const query: [string, string][] = names.map((n) => ['names[]', n]);
    query.push(['limit', '200']);
    const raw = await this.get<{ features?: RawStopFeature[] }>('gtfs/stops', query);
    const wanted = new Set(names);
    return (raw.features ?? [])
      .filter((f) => f.properties?.stop_id && wanted.has(f.properties?.stop_name ?? '') && f.geometry?.coordinates)
      .map((f) => {
        const [lng, lat] = f.geometry!.coordinates!;
        return { id: f.properties!.stop_id!, name: f.properties!.stop_name!, coords: { lat, lng }, platform: f.properties!.platform_code ?? undefined };
      });
  }

  async tripStopTimes(tripId: string): Promise<TripStopTime[]> {
    const raw = await this.get<RawTrip>(`gtfs/trips/${encodeURIComponent(tripId)}`, [
      ['includeStopTimes', 'true'],
      ['includeStops', 'true'],
    ]);
    return (raw.stop_times ?? [])
      .map((st) => ({
        stopId: st.stop_id ?? '',
        stopName: st.stop?.properties?.stop_name ?? st.stop?.stop_name,
        arrivalSec: hmsToSeconds(st.arrival_time),
        departureSec: hmsToSeconds(st.departure_time),
        sequence: st.stop_sequence ?? 0,
      }))
      .filter((st) => st.stopId && Number.isFinite(st.arrivalSec))
      .sort((a, b) => a.sequence - b.sequence);
  }

  async vehicle(tripId: string): Promise<VehicleInfo | null> {
    try {
      const raw = await this.get<{
        properties?: {
          last_position?: { delay?: { actual?: number | null } };
          trip?: {
            vehicle_registration_number?: string | number | null;
            vehicle_type?: { description_cs?: string } | null;
            air_conditioned?: boolean | null;
            wheelchair_accessible?: boolean | null;
          };
        };
      }>(`vehiclepositions/${encodeURIComponent(tripId)}`, [['includeNotTracking', 'true']]);
      const trip = raw.properties?.trip;
      if (!trip) return null;
      return {
        vehicleType: trip.vehicle_type?.description_cs ?? undefined,
        registration: trip.vehicle_registration_number != null ? String(trip.vehicle_registration_number) : undefined,
        delaySeconds: raw.properties?.last_position?.delay?.actual ?? undefined,
        airConditioned: trip.air_conditioned ?? undefined,
        wheelchairAccessible: trip.wheelchair_accessible ?? undefined,
      };
    } catch {
      return null;
    }
  }
}
