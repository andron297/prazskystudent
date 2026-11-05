/**
 * Menzy Univerzity Karlovy (Koleje a menzy UK). Polohy jsou orientační –
 * slouží jen k tomu, aby se nabídla menza nejblíž budově, kde máš výuku.
 */
import type { LatLng } from '../types';
import { haversineMeters } from './geo';

export interface Canteen {
  id: number;
  name: string;
  short: string;
  coords: LatLng;
}

export const CANTEENS: Canteen[] = [
  { id: 22, name: 'Menza Jinonice', short: 'Jinonice', coords: { lat: 50.0546, lng: 14.3709 } },
  { id: 16, name: 'Menza Kajetánka', short: 'Kajetánka', coords: { lat: 50.0851, lng: 14.3632 } },
  { id: 25, name: 'Menza Malostranská', short: 'Malostranská', coords: { lat: 50.088, lng: 14.4034 } },
  { id: 1, name: 'Menza Jednota', short: 'Jednota', coords: { lat: 50.0822, lng: 14.4334 } },
  { id: 11, name: 'Menza Právnická', short: 'Právnická', coords: { lat: 50.0914, lng: 14.417 } },
  { id: 12, name: 'Menza Albertov', short: 'Albertov', coords: { lat: 50.0672, lng: 14.4232 } },
  { id: 13, name: 'Kavárna U Rotlevů', short: 'U Rotlevů', coords: { lat: 50.0866, lng: 14.4232 } },
  { id: 9, name: 'Menza Arnošta z Pardubic', short: 'Arnošta z Pardubic', coords: { lat: 50.0805, lng: 14.4165 } },
  { id: 14, name: 'Menza Budeč', short: 'Budeč', coords: { lat: 50.0718, lng: 14.4384 } },
  { id: 17, name: 'Menza Troja', short: 'Troja', coords: { lat: 50.1182, lng: 14.4392 } },
  { id: 15, name: 'Výdejna Hvězda', short: 'Hvězda', coords: { lat: 50.0807, lng: 14.3348 } },
  { id: 20, name: 'Výdejna HTF', short: 'HTF', coords: { lat: 50.0393, lng: 14.4475 } },
  { id: 26, name: 'Menza Na Kotli (Hradec Králové)', short: 'Na Kotli', coords: { lat: 50.2008, lng: 15.8237 } },
  { id: 27, name: 'Mephared 2 (Hradec Králové)', short: 'Mephared 2', coords: { lat: 50.2051, lng: 15.8114 } },
];

export const MENZA_WEB = 'https://kam-septim-fe.is.cuni.cz/';

/** Menzy seřazené podle vzdálenosti od místa. */
export function nearestCanteens(point: LatLng, limit = 3): { canteen: Canteen; meters: number }[] {
  return CANTEENS.map((canteen) => ({ canteen, meters: haversineMeters(point, canteen.coords) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}

export function canteenById(id: number): Canteen | undefined {
  return CANTEENS.find((c) => c.id === id);
}

/** Alergeny podle přílohy II nařízení EU 1169/2011 (čísla, která uvádí menza). */
export const ALLERGENS: Record<string, string> = {
  '1': 'lepek',
  '2': 'korýši',
  '3': 'vejce',
  '4': 'ryby',
  '5': 'arašídy',
  '6': 'sója',
  '7': 'mléko',
  '8': 'skořápkové plody',
  '9': 'celer',
  '10': 'hořčice',
  '11': 'sezam',
  '12': 'oxid siřičitý a siřičitany',
  '13': 'vlčí bob',
  '14': 'měkkýši',
};
