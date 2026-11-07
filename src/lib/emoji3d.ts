/**
 * 3D obrázky počasí a oblečení (Microsoft Fluent Emoji 3D, licence MIT –
 * public/emoji3d/LICENSE.txt). Používají se jen u počasí; jinde vlastní ikony (ui/Glyph).
 */
import type { OutfitId } from './weather';
import { weatherKind } from './weather';

export type Emoji3DName =
  | 'billed-cap'
  | 'cloud'
  | 'cloud-with-lightning'
  | 'cloud-with-lightning-and-rain'
  | 'cloud-with-rain'
  | 'cloud-with-snow'
  | 'coat'
  | 'crescent-moon'
  | 'cup-with-straw'
  | 'fog'
  | 'gloves'
  | 'hiking-boot'
  | 'lab-coat'
  | 'lotion-bottle'
  | 'scarf'
  | 'snowflake'
  | 'sun'
  | 'sun-behind-cloud'
  | 'sun-behind-large-cloud'
  | 'sun-behind-rain-cloud'
  | 'sun-behind-small-cloud'
  | 'sunglasses'
  | 't-shirt'
  | 'umbrella-with-rain-drops'
  | 'wind-face'
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
