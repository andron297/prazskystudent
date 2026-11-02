/**
 * Počasí: datový model, převod odpovědi Open-Meteo, simulace pro offline režim
 * a „chytrá rada“ – co si obléct a jestli bude pršet cestou do školy a zpátky.
 */
import type { DateKey, LatLng } from '../types';
import { addDays, formatTime, isSameDay, startOfDay, toDateKey } from './dates';
import { hashString, seededRandom } from './id';

export interface HourlyWeather {
  time: Date;
  temp: number;
  feels: number;
  /** Pravděpodobnost srážek 0–100 %. */
  precipProb: number;
  /** Srážky za hodinu (mm). */
  precip: number;
  code: number;
  wind: number;
  gusts: number;
  uv: number;
  isDay: boolean;
}

export interface DailyWeather {
  date: DateKey;
  min: number;
  max: number;
  code: number;
  precipProbMax: number;
  precipSum: number;
  sunrise?: Date;
  sunset?: Date;
  uvMax: number;
}

export interface WeatherForecast {
  fetchedAt: string;
  source: 'open-meteo' | 'simulated';
  location: LatLng;
  current: { time: Date; temp: number; feels: number; code: number; wind: number; isDay: boolean };
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}

/* ------------------------------------------------------------------ */
/* Kódy WMO                                                            */
/* ------------------------------------------------------------------ */

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'heavy-rain' | 'snow' | 'sleet' | 'storm';

export function weatherKind(code: number): WeatherKind {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if (code === 61 || code === 63 || code === 80 || code === 81) return 'rain';
  if (code === 65 || code === 82) return 'heavy-rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

const LABELS: Record<number, string> = {
  0: 'Jasno',
  1: 'Skoro jasno',
  2: 'Polojasno',
  3: 'Zataženo',
  45: 'Mlha',
  48: 'Námraza',
  51: 'Slabé mrholení',
  53: 'Mrholení',
  55: 'Silné mrholení',
  56: 'Mrznoucí mrholení',
  57: 'Mrznoucí mrholení',
  61: 'Slabý déšť',
  63: 'Déšť',
  65: 'Silný déšť',
  66: 'Mrznoucí déšť',
  67: 'Mrznoucí déšť',
  71: 'Slabé sněžení',
  73: 'Sněžení',
  75: 'Husté sněžení',
  77: 'Sněhová zrna',
  80: 'Přeháňky',
  81: 'Přeháňky',
  82: 'Prudké přeháňky',
  85: 'Sněhové přeháňky',
  86: 'Sněhové přeháňky',
  95: 'Bouřka',
  96: 'Bouřka s kroupami',
  99: 'Bouřka s kroupami',
};

export function weatherLabel(code: number): string {
  return LABELS[code] ?? 'Proměnlivo';
}

export function isWet(kind: WeatherKind): boolean {
  return kind === 'drizzle' || kind === 'rain' || kind === 'heavy-rain' || kind === 'sleet' || kind === 'storm' || kind === 'snow';
}

/* ------------------------------------------------------------------ */
/* Open-Meteo                                                          */
/* ------------------------------------------------------------------ */

export function openMeteoUrl(location: LatLng): string {
  const params = new URLSearchParams({
    latitude: location.lat.toFixed(3),
    longitude: location.lng.toFixed(3),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max',
    timezone: 'Europe/Prague',
    timeformat: 'unixtime',
    forecast_days: '3',
    wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

interface OpenMeteoResponse {
  current?: { time: number; temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; is_day: number };
  hourly?: Record<string, (number | null)[]>;
  daily?: Record<string, (number | null)[]>;
}

export function parseOpenMeteo(raw: unknown, location: LatLng, fetchedAt: Date): WeatherForecast {
  const data = raw as OpenMeteoResponse;
  const h = data.hourly ?? {};
  const times = (h.time ?? []) as number[];
  const num = (arr: (number | null)[] | undefined, i: number, fallback = 0) => {
    const v = arr?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  };
  const hourly: HourlyWeather[] = times.map((t, i) => ({
    time: new Date(t * 1000),
    temp: num(h.temperature_2m, i),
    feels: num(h.apparent_temperature, i, num(h.temperature_2m, i)),
    precipProb: num(h.precipitation_probability, i),
    precip: num(h.precipitation, i),
    code: num(h.weather_code, i, 3),
    wind: num(h.wind_speed_10m, i),
    gusts: num(h.wind_gusts_10m, i, num(h.wind_speed_10m, i)),
    uv: num(h.uv_index, i),
    isDay: num(h.is_day, i, 1) === 1,
  }));
  const d = data.daily ?? {};
  const daily: DailyWeather[] = ((d.time ?? []) as number[]).map((t, i) => ({
    date: toDateKey(new Date(t * 1000)),
    min: num(d.temperature_2m_min, i),
    max: num(d.temperature_2m_max, i),
    code: num(d.weather_code, i, 3),
    precipProbMax: num(d.precipitation_probability_max, i),
    precipSum: num(d.precipitation_sum, i),
    sunrise: d.sunrise?.[i] ? new Date((d.sunrise[i] as number) * 1000) : undefined,
    sunset: d.sunset?.[i] ? new Date((d.sunset[i] as number) * 1000) : undefined,
    uvMax: num(d.uv_index_max, i),
  }));
  const c = data.current;
  const nearest = hourly.find((x) => x.time.getTime() <= fetchedAt.getTime() && x.time.getTime() + 3_600_000 > fetchedAt.getTime()) ?? hourly[0];
  return {
    fetchedAt: fetchedAt.toISOString(),
    source: 'open-meteo',
    location,
    current: c
      ? { time: new Date(c.time * 1000), temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, wind: c.wind_speed_10m, isDay: c.is_day === 1 }
      : { time: fetchedAt, temp: nearest?.temp ?? 0, feels: nearest?.feels ?? 0, code: nearest?.code ?? 3, wind: nearest?.wind ?? 0, isDay: nearest?.isDay ?? true },
    hourly,
    daily,
  };
}

/* ------------------------------------------------------------------ */
/* Simulace (offline / Sandbox bez sítě)                               */
/* ------------------------------------------------------------------ */

/** Věrohodné pražské počasí podle ročního období; odpoledne s přeháňkou (ať je vidět rada o deštníku). */
export function simulateForecast(now: Date, location: LatLng): WeatherForecast {
  const day0 = startOfDay(now);
  const month = now.getMonth();
  const seasonalMax = [2, 4, 9, 15, 20, 23, 25, 25, 20, 14, 7, 3][month];
  const seasonalMin = [-3, -2, 1, 5, 9, 12, 14, 14, 10, 6, 2, -1][month];
  const hourly: HourlyWeather[] = [];
  const daily: DailyWeather[] = [];
  for (let d = 0; d < 3; d++) {
    const day = addDays(day0, d);
    const rnd = seededRandom(hashString(toDateKey(day)));
    const shift = (rnd() - 0.5) * 4;
    const max = seasonalMax + shift;
    const min = seasonalMin + shift * 0.6;
    const showerStart = 15 + Math.floor(rnd() * 3);
    const showerLen = 2 + Math.floor(rnd() * 2);
    const wet = d === 0 || rnd() > 0.55;
    const sunrise = new Date(day.getFullYear(), day.getMonth(), day.getDate(), [7, 7, 6, 6, 5, 4, 5, 5, 6, 7, 7, 7][month], 15);
    const sunset = new Date(day.getFullYear(), day.getMonth(), day.getDate(), [16, 17, 18, 19, 20, 21, 21, 20, 19, 18, 16, 16][month], 20);
    let probMax = 0;
    let sum = 0;
    for (let hour = 0; hour < 24; hour++) {
      const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
      const curve = Math.cos(((hour - 14.5) / 24) * 2 * Math.PI);
      const temp = Math.round((min + ((curve + 1) / 2) * (max - min)) * 10) / 10;
      const inShower = wet && hour >= showerStart && hour < showerStart + showerLen;
      const nearShower = wet && hour >= showerStart - 1 && hour <= showerStart + showerLen;
      const precipProb = inShower ? 65 + Math.round(rnd() * 20) : nearShower ? 35 : Math.round(rnd() * 15);
      const precip = inShower ? Math.round((0.4 + rnd() * 1.4) * 10) / 10 : 0;
      const wind = Math.round(8 + rnd() * 14);
      const isDay = t >= sunrise && t <= sunset;
      const code = inShower ? (temp <= 1 ? 85 : precip > 1.2 ? 81 : 80) : precipProb > 30 ? 3 : rnd() > 0.6 ? 2 : isDay ? 1 : 0;
      probMax = Math.max(probMax, precipProb);
      sum += precip;
      hourly.push({ time: t, temp, feels: Math.round((temp - wind / 12 - (temp < 10 ? 1.5 : 0)) * 10) / 10, precipProb, precip, code, wind, gusts: wind + 10, uv: isDay ? Math.max(0, Math.round((seasonalMax / 6) * Math.max(0, curve) * 10) / 10) : 0, isDay });
    }
    daily.push({ date: toDateKey(day), min: Math.round(min), max: Math.round(max), code: wet ? 80 : 2, precipProbMax: probMax, precipSum: Math.round(sum * 10) / 10, sunrise, sunset, uvMax: Math.round(seasonalMax / 6) });
  }
  const current = hourly.find((x) => x.time.getTime() <= now.getTime() && x.time.getTime() + 3_600_000 > now.getTime()) ?? hourly[0];
  return {
    fetchedAt: now.toISOString(),
    source: 'simulated',
    location,
    current: { time: now, temp: current.temp, feels: current.feels, code: current.code, wind: current.wind, isDay: current.isDay },
    hourly,
    daily,
  };
}

/* ------------------------------------------------------------------ */
/* Cesty do školy a zpět                                               */
/* ------------------------------------------------------------------ */

export interface CommuteWindow {
  kind: 'to' | 'back';
  from: Date;
  to: Date;
}

export interface CommutePlan {
  windows: CommuteWindow[];
  day: 'today' | 'tomorrow' | 'none';
}

/** Okna cest podle rozvrhu: tam = před první výukou, zpět = po poslední. */
export function commuteWindows(
  events: { start: string; end: string; kind: string }[],
  now: Date,
  options: { leaveAt?: Date | null; travelMinutes?: number } = {},
): CommutePlan {
  const travel = (options.travelMinutes ?? 40) * 60_000;
  const study = events.filter((e) => e.kind !== 'personal');
  const pick = (day: Date) => study.filter((e) => isSameDay(new Date(e.start), day)).sort((a, b) => a.start.localeCompare(b.start));
  let day: CommutePlan['day'] = 'today';
  let list = pick(now).filter((e) => new Date(e.end).getTime() > now.getTime());
  if (list.length === 0) {
    list = pick(addDays(now, 1));
    day = list.length ? 'tomorrow' : 'none';
  }
  if (list.length === 0) return { windows: [], day: 'none' };
  const allToday = pick(day === 'today' ? now : addDays(now, 1));
  // Cesta tam = před nejbližší výukou, která teprve začne (ráno první, odpoledne ta další).
  const upcoming = allToday.find((e) => new Date(e.start).getTime() > now.getTime());
  const last = allToday.reduce((acc, e) => (e.end > acc.end ? e : acc), allToday[0]);
  const windows: CommuteWindow[] = [];
  if (upcoming) {
    const start = new Date(upcoming.start);
    const leave = options.leaveAt && options.leaveAt.getTime() < start.getTime() ? options.leaveAt : new Date(start.getTime() - travel);
    windows.push({ kind: 'to', from: leave, to: start });
  }
  const lastEnd = new Date(last.end);
  windows.push({ kind: 'back', from: lastEnd, to: new Date(lastEnd.getTime() + travel) });
  return { windows, day };
}

/* ------------------------------------------------------------------ */
/* Rada: oblečení a deštník                                            */
/* ------------------------------------------------------------------ */

export type OutfitId =
  | 'winter-jacket'
  | 'jacket'
  | 'light-jacket'
  | 'sweater'
  | 'tshirt'
  | 'hat'
  | 'gloves'
  | 'scarf'
  | 'umbrella'
  | 'raincoat'
  | 'boots'
  | 'sunglasses'
  | 'sunscreen'
  | 'water'
  | 'layer';

export interface OutfitItem {
  id: OutfitId;
  label: string;
}

const OUTFIT_LABEL: Record<OutfitId, string> = {
  'winter-jacket': 'Zimní bunda',
  jacket: 'Bunda',
  'light-jacket': 'Lehká bunda',
  sweater: 'Mikina',
  tshirt: 'Tričko',
  hat: 'Čepice',
  gloves: 'Rukavice',
  scarf: 'Šála',
  umbrella: 'Deštník',
  raincoat: 'Bunda s kapucí',
  boots: 'Pevné boty',
  sunglasses: 'Brýle',
  sunscreen: 'Opalovací krém',
  water: 'Voda',
  layer: 'Vrstva navíc',
};

export type ComfortLevel = 'freezing' | 'cold' | 'cool' | 'mild' | 'warm' | 'hot';

export interface CommuteWeather {
  window: CommuteWindow;
  temp: number;
  feels: number;
  precipProb: number;
  precip: number;
  code: number;
  gusts: number;
  wet: boolean;
  /** Kdy začne pršet (první mokrá hodina v okně). */
  rainFrom?: Date;
}

export interface WeatherAdvice {
  headline: string;
  level: ComfortLevel;
  outfit: OutfitItem[];
  umbrella: boolean;
  commutes: CommuteWeather[];
  tips: string[];
  /** Pocitová teplota, ze které rada vychází (po úpravě podle citlivosti). */
  basisFeels: number;
}

function hoursIn(hourly: HourlyWeather[], from: Date, to: Date): HourlyWeather[] {
  const a = from.getTime();
  const b = to.getTime();
  const list = hourly.filter((h) => h.time.getTime() + 3_600_000 > a && h.time.getTime() < b);
  if (list.length > 0) return list;
  const nearest = [...hourly].sort((x, y) => Math.abs(x.time.getTime() - a) - Math.abs(y.time.getTime() - a))[0];
  return nearest ? [nearest] : [];
}

function summarize(window: CommuteWindow, hours: HourlyWeather[]): CommuteWeather {
  const wetHour = hours.find((h) => h.precipProb >= 45 || h.precip >= 0.3 || isWet(weatherKind(h.code)));
  const worst = hours.reduce((acc, h) => (h.precipProb > acc.precipProb || (h.precipProb === acc.precipProb && h.precip > acc.precip) ? h : acc), hours[0]);
  return {
    window,
    temp: Math.round(hours.reduce((s, h) => s + h.temp, 0) / hours.length),
    feels: Math.round(Math.min(...hours.map((h) => h.feels))),
    precipProb: Math.max(...hours.map((h) => h.precipProb)),
    precip: Math.round(hours.reduce((s, h) => s + h.precip, 0) * 10) / 10,
    code: worst.code,
    gusts: Math.max(...hours.map((h) => h.gusts)),
    wet: Boolean(wetHour),
    rainFrom: wetHour ? new Date(Math.max(wetHour.time.getTime(), window.from.getTime())) : undefined,
  };
}

function comfortLevel(feels: number): ComfortLevel {
  if (feels <= -3) return 'freezing';
  if (feels <= 4) return 'cold';
  if (feels <= 10) return 'cool';
  if (feels <= 16) return 'mild';
  if (feels <= 22) return 'warm';
  return 'hot';
}

const BASE_OUTFIT: Record<ComfortLevel, OutfitId[]> = {
  freezing: ['winter-jacket', 'hat', 'gloves', 'scarf'],
  cold: ['winter-jacket', 'hat', 'gloves'],
  cool: ['jacket', 'sweater'],
  mild: ['light-jacket'],
  warm: ['tshirt', 'sweater'],
  hot: ['tshirt', 'water'],
};

const LEVEL_HEADLINE: Record<ComfortLevel, string> = {
  freezing: 'Mrzne – pořádně se obleč',
  cold: 'Zima – čepice a rukavice',
  cool: 'Chladno – vezmi si bundu',
  mild: 'Příjemně – stačí lehká bunda',
  warm: 'Teplo – tričko a mikina na večer',
  hot: 'Horko – nalehko a s vodou',
};

export function weatherAdvice(forecast: WeatherForecast, plan: CommutePlan, now: Date, feel: 'cold' | 'normal' | 'warm' = 'normal'): WeatherAdvice {
  const commutes = plan.windows.map((w) => summarize(w, hoursIn(forecast.hourly, w.from, w.to)));
  const dayHours = (() => {
    if (plan.windows.length > 0) {
      const from = plan.windows[0].from;
      const to = plan.windows[plan.windows.length - 1].to;
      return hoursIn(forecast.hourly, from, to);
    }
    const end = new Date(Math.max(now.getTime() + 6 * 3_600_000, Math.min(now.getTime() + 10 * 3_600_000, startOfDay(addDays(now, 1)).getTime())));
    return hoursIn(forecast.hourly, now, end);
  })();
  const relevant = commutes.length ? commutes.map((c) => c.feels) : dayHours.map((h) => h.feels);
  const adjust = feel === 'cold' ? -3 : feel === 'warm' ? 3 : 0;
  const basisFeels = Math.round((relevant.length ? Math.min(...relevant) : forecast.current.feels) + adjust);
  const level = comfortLevel(basisFeels);
  const outfit = new Set<OutfitId>(BASE_OUTFIT[level]);
  const tips: string[] = [];

  const wetCommutes = commutes.filter((c) => c.wet);
  const dayWet = commutes.length === 0 && dayHours.some((h) => h.precipProb >= 50 || h.precip >= 0.4);
  const maxGusts = Math.max(0, ...dayHours.map((h) => h.gusts));
  const snow = [...commutes.map((c) => c.code), ...dayHours.map((h) => h.code)].some((code) => weatherKind(code) === 'snow');
  const storm = [...commutes.map((c) => c.code), ...dayHours.map((h) => h.code)].some((code) => weatherKind(code) === 'storm');
  const heavy = dayHours.some((h) => h.precip >= 2.5);
  const umbrella = wetCommutes.length > 0 || dayWet;

  if (umbrella) {
    if (maxGusts >= 50) {
      outfit.add('raincoat');
      tips.push(`Nárazy větru až ${Math.round(maxGusts)} km/h – deštník by nepřežil, vezmi kapuci`);
    } else outfit.add('umbrella');
    if (heavy) outfit.add('boots');
  } else if (maxGusts >= 55) {
    tips.push(`Silný vítr, nárazy ${Math.round(maxGusts)} km/h`);
  }
  if (snow) outfit.add('boots');

  const uvMax = Math.max(0, ...dayHours.map((h) => h.uv));
  if (uvMax >= 6) {
    outfit.add('sunglasses');
    outfit.add('sunscreen');
    tips.push(`UV index ${Math.round(uvMax)} – chraň se před sluncem`);
  } else if (uvMax >= 4 && (level === 'warm' || level === 'hot')) {
    outfit.add('sunglasses');
  }

  const to = commutes.find((c) => c.window.kind === 'to');
  const back = commutes.find((c) => c.window.kind === 'back');
  if (to && back && to.feels - back.feels >= 5) {
    outfit.add('layer');
    tips.push(`Při cestě zpět o ${to.feels - back.feels}° chladněji`);
  } else if (!to && !back) {
    const temps = dayHours.map((h) => h.feels);
    const swing = temps.length ? Math.max(...temps) - Math.min(...temps) : 0;
    if (swing >= 7) {
      outfit.add('layer');
      tips.push(`Během dne kolísá o ${Math.round(swing)}°`);
    }
  }

  let headline = LEVEL_HEADLINE[level];
  const at = (d: Date) => formatTime(d);
  if (storm && umbrella) headline = 'Hrozí bouřky – deštník a radši pod střechu';
  else if (snow && (wetCommutes.length > 0 || dayWet)) headline = 'Sněží – pevné boty a čepice';
  else if (to?.wet && back?.wet) headline = 'Deštník na celý den – prší tam i zpátky';
  else if (to?.wet) headline = `Ráno prší – deštník už na cestu tam (${at(to.rainFrom ?? to.window.from)})`;
  else if (back?.wet) headline = `Deštník na cestu zpět – kolem ${at(back.rainFrom ?? back.window.from)} začne pršet`;
  else if (dayWet) headline = 'Dnes bude pršet – deštník s sebou';

  return {
    headline,
    level,
    outfit: [...outfit].map((id) => ({ id, label: OUTFIT_LABEL[id] })),
    umbrella,
    commutes,
    tips,
    basisFeels,
  };
}
