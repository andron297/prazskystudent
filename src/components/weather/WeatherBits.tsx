import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudRainWind, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { OutfitId, WeatherKind } from '../../lib/weather';
import { weatherKind } from '../../lib/weather';
import { cn } from '../ui/primitives';

const ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  'heavy-rain': CloudRainWind,
  snow: CloudSnow,
  sleet: CloudSnow,
  storm: CloudLightning,
};

export function weatherIcon(code: number, isDay = true): LucideIcon {
  const kind = weatherKind(code);
  if (!isDay && kind === 'clear') return Moon;
  if (!isDay && kind === 'partly') return CloudMoon;
  return ICONS[kind];
}

export function WeatherIcon({ code, isDay = true, className }: { code: number; isDay?: boolean; className?: string }) {
  const Icon = weatherIcon(code, isDay);
  return <Icon className={cn('shrink-0', className)} aria-hidden />;
}

export const OUTFIT_EMOJI: Record<OutfitId, string> = {
  'winter-jacket': '🧥',
  jacket: '🧥',
  'light-jacket': '🧥',
  sweater: '👕',
  tshirt: '👕',
  hat: '🧢',
  gloves: '🧤',
  scarf: '🧣',
  umbrella: '☂️',
  raincoat: '🧥',
  boots: '🥾',
  sunglasses: '🕶️',
  sunscreen: '🧴',
  water: '💧',
  layer: '➕',
};
