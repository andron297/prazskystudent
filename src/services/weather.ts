/**
 * Počasí z Open-Meteo (zdarma, bez klíče, volá se přímo z prohlížeče).
 * Výsledek se drží 30 minut v paměti i v localStorage; bez sítě se použije
 * věrohodná simulace, aby rada na cestu fungovala vždy.
 */
import { useTestStore, type SimWeather } from '../store/testStore';
import { useEffect, useMemo, useState } from 'react';
import type { LatLng } from '../types';
import { openMeteoUrl, parseOpenMeteo, simulateForecast, type WeatherForecast } from '../lib/weather';
import { haversineMeters } from '../lib/geo';
import { appNow } from '../store/clockStore';

const CACHE_KEY = 'stihnu:weather';
const TTL = 30 * 60_000;

let memory: WeatherForecast | null = null;
let inflight: Promise<WeatherForecast> | null = null;
const listeners = new Set<(f: WeatherForecast) => void>();

function revive(raw: WeatherForecast): WeatherForecast {
  return {
    ...raw,
    current: { ...raw.current, time: new Date(raw.current.time) },
    hourly: raw.hourly.map((h) => ({ ...h, time: new Date(h.time) })),
    daily: raw.daily.map((d) => ({ ...d, sunrise: d.sunrise ? new Date(d.sunrise) : undefined, sunset: d.sunset ? new Date(d.sunset) : undefined })),
  };
}

/** Poslední stažená předpověď (do 3 hodin), ať je odkudkoli – pro úvodní animaci. */
export function lastForecast(): WeatherForecast | null {
  const ok = (f: WeatherForecast | null) => f && Date.now() - new Date(f.fetchedAt).getTime() < 3 * 3_600_000;
  if (ok(memory)) return memory;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? revive(JSON.parse(raw) as WeatherForecast) : null;
    return ok(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cached(location: LatLng): WeatherForecast | null {
  const fresh = (f: WeatherForecast | null) => f && Date.now() - new Date(f.fetchedAt).getTime() < TTL && haversineMeters(f.location, location) < 3000;
  if (fresh(memory)) return memory;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = revive(JSON.parse(raw) as WeatherForecast);
      if (fresh(parsed)) {
        memory = parsed;
        return parsed;
      }
    }
  } catch {
    /* poškozená cache */
  }
  return null;
}

export async function fetchForecast(location: LatLng, force = false): Promise<WeatherForecast> {
  if (!force) {
    const hit = cached(location);
    if (hit) return hit;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch(openMeteoUrl(location), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
      const forecast = parseOpenMeteo(await response.json(), location, new Date());
      if (forecast.hourly.length === 0) throw new Error('Prázdná předpověď');
      memory = forecast;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(forecast));
      } catch {
        /* plné úložiště */
      }
      return forecast;
    } catch {
      const simulated = simulateForecast(appNow(), location);
      memory = { ...simulated, fetchedAt: new Date(Date.now() - TTL + 5 * 60_000).toISOString() };
      return memory;
    } finally {
      inflight = null;
    }
  })();
  const result = await inflight;
  for (const l of listeners) l(result);
  return result;
}

/** Předpověď pro polohu (zaokrouhleno na ~2 km), obnova každých 30 minut. */
export function useWeather(location: LatLng, enabled = true): { forecast: WeatherForecast | null; refresh: () => void } {
  const [forecast, setForecast] = useState<WeatherForecast | null>(() => cached(location));
  const key = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = (force = false) =>
      fetchForecast(location, force).then((f) => {
        if (alive) setForecast(f);
      });
    void load();
    const listener = (f: WeatherForecast) => alive && setForecast(f);
    listeners.add(listener);
    const timer = setInterval(() => void load(), TTL);
    return () => {
      alive = false;
      listeners.delete(listener);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  // Testovací režim: simulované počasí přepíše teď i předpověď na dnešek.
  const sim = useTestStore((s) => s.weather);
  const shown = useMemo(() => (forecast && sim ? simulateWeather(forecast, sim) : forecast), [forecast, sim]);
  return { forecast: shown, refresh: () => void fetchForecast(location, true).then(setForecast) };
}

function simulateWeather(f: WeatherForecast, sim: SimWeather): WeatherForecast {
  const isDay = f.current.isDay;
  return {
    ...f,
    current: { ...f.current, code: sim.code, temp: sim.temp, feels: sim.feels, isDay },
    hourly: f.hourly.map((h) => ({ ...h, code: sim.code, temp: sim.temp, feels: sim.feels, precipProb: sim.precipProb, precip: sim.precipProb >= 50 ? 1.2 : 0 })),
  };
}
