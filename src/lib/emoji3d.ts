/**
 * 3D obrázky (Microsoft Fluent Emoji 3D, licence MIT – public/emoji3d/LICENSE.txt).
 * Názvy odpovídají souborům public/emoji3d/<název>.webp.
 */
import type { OutfitId } from './weather';
import { weatherKind } from './weather';

export type Emoji3DName =
  | 'airplane'
  | 'alarm-clock'
  | 'artist-palette'
  | 'balance-scale'
  | 'beach-with-umbrella'
  | 'bell'
  | 'bell-with-slash'
  | 'billed-cap'
  | 'birthday-cake'
  | 'books'
  | 'bottle-with-popping-cork'
  | 'brain'
  | 'briefcase'
  | 'bus'
  | 'calendar'
  | 'check-mark-button'
  | 'christmas-tree'
  | 'cityscape'
  | 'classical-building'
  | 'closed-umbrella'
  | 'cloud'
  | 'cloud-with-lightning'
  | 'cloud-with-lightning-and-rain'
  | 'cloud-with-rain'
  | 'cloud-with-snow'
  | 'coat'
  | 'cold-face'
  | 'compass'
  | 'crescent-moon'
  | 'cup-with-straw'
  | 'droplet'
  | 'fire'
  | 'fog'
  | 'fork-and-knife-with-plate'
  | 'four-leaf-clover'
  | 'gem-stone'
  | 'gloves'
  | 'glowing-star'
  | 'graduation-cap'
  | 'green-salad'
  | 'headphone'
  | 'herb'
  | 'high-voltage'
  | 'hiking-boot'
  | 'hot-beverage'
  | 'hot-face'
  | 'hourglass-done'
  | 'hourglass-not-done'
  | 'house'
  | 'hundred-points'
  | 'jeans'
  | 'key'
  | 'lab-coat'
  | 'laptop'
  | 'leaf-fluttering-in-wind'
  | 'light-bulb'
  | 'link'
  | 'locked-with-key'
  | 'lotion-bottle'
  | 'luggage'
  | 'maple-leaf'
  | 'memo'
  | 'metro'
  | 'milky-way'
  | 'mobile-phone'
  | 'musical-notes'
  | 'night-with-stars'
  | 'open-book'
  | 'party-popper'
  | 'pencil'
  | 'person-walking'
  | 'potable-water'
  | 'puzzle-piece'
  | 'rainbow'
  | 'red-heart'
  | 'robot'
  | 'rocket'
  | 'round-pushpin'
  | 'running-shoe'
  | 'school'
  | 'scarf'
  | 'seedling'
  | 'shield'
  | 'shorts'
  | 'sleeping-face'
  | 'snow-capped-mountain'
  | 'snowflake'
  | 'snowman'
  | 'sparkles'
  | 'spiral-calendar'
  | 'spiral-notepad'
  | 'star'
  | 'station'
  | 'steaming-bowl'
  | 'stethoscope'
  | 'stopwatch'
  | 'sun'
  | 'sun-behind-cloud'
  | 'sun-behind-large-cloud'
  | 'sun-behind-rain-cloud'
  | 'sun-behind-small-cloud'
  | 'sunglasses'
  | 'sunrise'
  | 'sunset'
  | 't-shirt'
  | 'teacup-without-handle'
  | 'tear-off-calendar'
  | 'test-tube'
  | 'thermometer'
  | 'ticket'
  | 'tomato'
  | 'trophy'
  | 'tram'
  | 'tram-car'
  | 'umbrella'
  | 'umbrella-with-rain-drops'
  | 'watch'
  | 'wind-face'
  | 'world-map'
  | 'wrapped-gift'
  | 'yarn';

export function emoji3dUrl(name: Emoji3DName): string {
  return `/emoji3d/${name}.webp`;
}

/** Počasí podle kódu WMO (Open-Meteo) → 3D obrázek, v noci měsíc. */
export function weather3d(code: number, isDay = true): Emoji3DName {
  switch (weatherKind(code)) {
    case 'storm':
      return 'cloud-with-lightning-and-rain';
    case 'snow':
    case 'sleet':
      return 'cloud-with-snow';
    case 'fog':
      return 'fog';
    case 'drizzle':
      return isDay ? 'sun-behind-rain-cloud' : 'cloud-with-rain';
    case 'rain':
      return isDay && (code === 80 || code === 81) ? 'sun-behind-rain-cloud' : 'cloud-with-rain';
    case 'heavy-rain':
      return 'cloud-with-rain';
    case 'clear':
      return isDay ? (code === 0 ? 'sun' : 'sun-behind-small-cloud') : 'crescent-moon';
    case 'partly':
      return isDay ? 'sun-behind-cloud' : 'cloud';
    default:
      return 'cloud';
  }
}

/** Oblečení z rady na cestu → 3D obrázek. */
export const OUTFIT_3D: Record<OutfitId, Emoji3DName> = {
  'winter-jacket': 'coat',
  jacket: 'coat',
  'light-jacket': 'lab-coat',
  sweater: 'yarn',
  tshirt: 't-shirt',
  hat: 'billed-cap',
  gloves: 'gloves',
  scarf: 'scarf',
  umbrella: 'umbrella-with-rain-drops',
  raincoat: 'wind-face',
  boots: 'hiking-boot',
  sunglasses: 'sunglasses',
  sunscreen: 'lotion-bottle',
  water: 'cup-with-straw',
  layer: 'scarf',
};

/** Symboly odpočtů: uložené emoji (zpětně kompatibilní) → 3D obrázek. */
export const COUNTDOWN_SYMBOLS: { emoji: string; name: Emoji3DName; label: string }[] = [
  { emoji: '⏳', name: 'hourglass-not-done', label: 'Přesýpací hodiny' },
  { emoji: '🎓', name: 'graduation-cap', label: 'Promoce, státnice' },
  { emoji: '📝', name: 'memo', label: 'Zkouška, test' },
  { emoji: '📚', name: 'books', label: 'Učení' },
  { emoji: '🎉', name: 'party-popper', label: 'Oslava' },
  { emoji: '🎂', name: 'birthday-cake', label: 'Narozeniny' },
  { emoji: '✈️', name: 'airplane', label: 'Cesta, Erasmus' },
  { emoji: '🧳', name: 'luggage', label: 'Odjezd' },
  { emoji: '🏖️', name: 'beach-with-umbrella', label: 'Prázdniny' },
  { emoji: '🎄', name: 'christmas-tree', label: 'Vánoce' },
  { emoji: '🏔️', name: 'snow-capped-mountain', label: 'Hory' },
  { emoji: '❤️', name: 'red-heart', label: 'Někdo blízký' },
  { emoji: '🏆', name: 'trophy', label: 'Cíl' },
  { emoji: '🎁', name: 'wrapped-gift', label: 'Dárek' },
  { emoji: '🏠', name: 'house', label: 'Domů' },
  { emoji: '💼', name: 'briefcase', label: 'Práce, stáž' },
  { emoji: '🚀', name: 'rocket', label: 'Start projektu' },
  { emoji: '☀️', name: 'sun', label: 'Léto' },
];

export function countdown3d(emoji: string | undefined): Emoji3DName {
  return COUNTDOWN_SYMBOLS.find((s) => s.emoji === emoji)?.name ?? 'hourglass-not-done';
}
