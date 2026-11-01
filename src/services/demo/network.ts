/**
 * Zjednodušená, ale realistická síť PID pro sandbox: tramvaje 22 a 18,
 * metro A/B/C. Jízdní doby jsou kumulativní minuty od první uvedené zastávky.
 */
import type { LatLng, TransitMode } from '../../types';

export const DEMO_STOPS: Record<string, LatLng> = {
  'Bílá Hora': { lat: 50.0776, lng: 14.329 },
  Vypich: { lat: 50.0806, lng: 14.3478 },
  Říčanova: { lat: 50.0815, lng: 14.3555 },
  'Břevnovský klášter': { lat: 50.0832, lng: 14.3633 },
  Drinopol: { lat: 50.0849, lng: 14.3727 },
  Malovanka: { lat: 50.0858, lng: 14.3795 },
  Pohořelec: { lat: 50.0868, lng: 14.3909 },
  Brusnice: { lat: 50.0921, lng: 14.3934 },
  'Pražský hrad': { lat: 50.0938, lng: 14.3989 },
  'Královský letohrádek': { lat: 50.0951, lng: 14.4033 },
  Malostranská: { lat: 50.0912, lng: 14.4093 },
  'Malostranské náměstí': { lat: 50.0879, lng: 14.4045 },
  Hellichova: { lat: 50.0838, lng: 14.4048 },
  Újezd: { lat: 50.0812, lng: 14.406 },
  'Národní divadlo': { lat: 50.0811, lng: 14.4136 },
  'Národní třída': { lat: 50.0805, lng: 14.4195 },
  'Karlovo náměstí': { lat: 50.0756, lng: 14.4188 },
  'I. P. Pavlova': { lat: 50.0753, lng: 14.4307 },
  'Náměstí Míru': { lat: 50.0753, lng: 14.4378 },
  Petřiny: { lat: 50.0869, lng: 14.3449 },
  'Vojenská nemocnice': { lat: 50.0899, lng: 14.356 },
  'Vozovna Střešovice': { lat: 50.0938, lng: 14.3758 },
  Ořechovka: { lat: 50.0961, lng: 14.3833 },
  Sibeliova: { lat: 50.0985, lng: 14.3896 },
  Hradčanská: { lat: 50.0975, lng: 14.4037 },
  'Chotkovy sady': { lat: 50.0949, lng: 14.4095 },
  Staroměstská: { lat: 50.0883, lng: 14.417 },
  'Karlovy lázně': { lat: 50.0853, lng: 14.414 },
  Myslíkova: { lat: 50.0778, lng: 14.416 },
  'Botanická zahrada': { lat: 50.0707, lng: 14.4207 },
  Albertov: { lat: 50.0682, lng: 14.4228 },
  'Nemocnice Motol': { lat: 50.0748, lng: 14.341 },
  'Nádraží Veleslavín': { lat: 50.0957, lng: 14.347 },
  Bořislavka: { lat: 50.0985, lng: 14.3627 },
  Dejvická: { lat: 50.1003, lng: 14.3933 },
  Můstek: { lat: 50.0835, lng: 14.4243 },
  Muzeum: { lat: 50.0794, lng: 14.4308 },
  'Jiřího z Poděbrad': { lat: 50.0779, lng: 14.4497 },
  Flora: { lat: 50.0779, lng: 14.4623 },
  Želivského: { lat: 50.0786, lng: 14.4747 },
  'Nové Butovice': { lat: 50.0507, lng: 14.3525 },
  Jinonice: { lat: 50.0548, lng: 14.3698 },
  Radlická: { lat: 50.0579, lng: 14.3889 },
  'Smíchovské nádraží': { lat: 50.0611, lng: 14.4085 },
  Anděl: { lat: 50.071, lng: 14.404 },
  'Náměstí Republiky': { lat: 50.0893, lng: 14.431 },
  Florenc: { lat: 50.0907, lng: 14.4395 },
  Křižíkova: { lat: 50.0927, lng: 14.451 },
  Invalidovna: { lat: 50.0969, lng: 14.4637 },
  'Nádraží Holešovice': { lat: 50.1094, lng: 14.4405 },
  Vltavská: { lat: 50.1003, lng: 14.4382 },
  'Hlavní nádraží': { lat: 50.0832, lng: 14.4348 },
  Vyšehrad: { lat: 50.0627, lng: 14.4309 },
  'Pražského povstání': { lat: 50.056, lng: 14.4345 },
  Pankrác: { lat: 50.051, lng: 14.4393 },
};

export interface VehicleProfile {
  ac: string;
  lowFloor: string;
  old: string;
}

export interface DemoLine {
  id: string;
  shortName: string;
  mode: TransitMode;
  /** [zastávka, minuta od výchozí zastávky směru 0] */
  stops: [string, number][];
  /** Cílové zastávky (směr 0, směr 1) – zobrazují se jako „směr“. */
  termini: [string, string];
  /** Interval v minutách podle hodiny (null = nejede). */
  headway: (hour: number) => number | null;
  /** Pravděpodobnost klimatizovaného vozu (null = údaj se neposílá, např. metro). */
  acShare: number | null;
  lowFloorShare: number;
  /** Zda má spoj online polohu (zpoždění). Metro v datech PID jede podle JŘ. */
  realtime: boolean;
  vehicles: VehicleProfile;
}

const tramHeadway = (peak: number, day: number, evening: number) => (hour: number) => {
  if (hour < 5) return null;
  if (hour < 6) return 12;
  if (hour < 9) return peak;
  if (hour < 14) return day;
  if (hour < 19) return peak;
  if (hour < 22) return evening;
  return 15;
};

const metroHeadway = (hour: number) => {
  if (hour < 5) return null;
  if (hour < 6) return 7;
  if (hour < 9) return 3;
  if (hour < 14) return 5;
  if (hour < 19) return 3;
  if (hour < 22) return 6;
  return 8;
};

export const DEMO_LINES: DemoLine[] = [
  {
    id: 'tram-22',
    shortName: '22',
    mode: 'tram',
    stops: [
      ['Bílá Hora', 0],
      ['Vypich', 2],
      ['Říčanova', 4],
      ['Břevnovský klášter', 5],
      ['Drinopol', 7],
      ['Malovanka', 8],
      ['Pohořelec', 10],
      ['Brusnice', 12],
      ['Pražský hrad', 13],
      ['Královský letohrádek', 14],
      ['Malostranská', 17],
      ['Malostranské náměstí', 19],
      ['Hellichova', 21],
      ['Újezd', 22],
      ['Národní divadlo', 24],
      ['Národní třída', 26],
      ['Karlovo náměstí', 29],
      ['I. P. Pavlova', 32],
      ['Náměstí Míru', 34],
    ],
    termini: ['Nádraží Hostivař', 'Bílá Hora'],
    headway: tramHeadway(6, 8, 10),
    acShare: 0.85,
    lowFloorShare: 0.95,
    realtime: true,
    vehicles: { ac: 'Škoda 15T ForCity Alfa', lowFloor: 'Tatra T3R.PLF', old: 'Tatra T3R.P' },
  },
  {
    id: 'tram-18',
    shortName: '18',
    mode: 'tram',
    stops: [
      ['Petřiny', 0],
      ['Vojenská nemocnice', 3],
      ['Vozovna Střešovice', 5],
      ['Ořechovka', 7],
      ['Sibeliova', 8],
      ['Hradčanská', 10],
      ['Chotkovy sady', 12],
      ['Malostranská', 15],
      ['Staroměstská', 18],
      ['Karlovy lázně', 20],
      ['Národní divadlo', 22],
      ['Myslíkova', 24],
      ['Karlovo náměstí', 26],
      ['Botanická zahrada', 28],
      ['Albertov', 29],
    ],
    termini: ['Vozovna Pankrác', 'Petřiny'],
    headway: tramHeadway(8, 10, 12),
    acShare: 0.45,
    lowFloorShare: 0.6,
    realtime: true,
    vehicles: { ac: 'Škoda 14T', lowFloor: 'Tatra KT8D5.RN2P', old: 'Tatra T3R.P' },
  },
  {
    id: 'metro-a',
    shortName: 'A',
    mode: 'metro',
    stops: [
      ['Nemocnice Motol', 0],
      ['Petřiny', 2],
      ['Nádraží Veleslavín', 4],
      ['Bořislavka', 6],
      ['Dejvická', 8],
      ['Hradčanská', 10],
      ['Malostranská', 12],
      ['Staroměstská', 14],
      ['Můstek', 15],
      ['Muzeum', 17],
      ['Náměstí Míru', 18],
      ['Jiřího z Poděbrad', 20],
      ['Flora', 21],
      ['Želivského', 22],
    ],
    termini: ['Depo Hostivař', 'Nemocnice Motol'],
    headway: metroHeadway,
    acShare: null,
    lowFloorShare: 1,
    realtime: false,
    vehicles: { ac: 'Metro M1', lowFloor: 'Metro M1', old: 'Metro M1' },
  },
  {
    id: 'metro-b',
    shortName: 'B',
    mode: 'metro',
    stops: [
      ['Nové Butovice', 0],
      ['Jinonice', 2],
      ['Radlická', 4],
      ['Smíchovské nádraží', 6],
      ['Anděl', 8],
      ['Karlovo náměstí', 10],
      ['Národní třída', 11],
      ['Můstek', 13],
      ['Náměstí Republiky', 14],
      ['Florenc', 16],
      ['Křižíkova', 17],
      ['Invalidovna', 19],
    ],
    termini: ['Černý Most', 'Zličín'],
    headway: metroHeadway,
    acShare: null,
    lowFloorShare: 1,
    realtime: false,
    vehicles: { ac: 'Metro M1', lowFloor: 'Metro M1', old: 'Metro M1' },
  },
  {
    id: 'metro-c',
    shortName: 'C',
    mode: 'metro',
    stops: [
      ['Nádraží Holešovice', 0],
      ['Vltavská', 2],
      ['Florenc', 4],
      ['Hlavní nádraží', 5],
      ['Muzeum', 7],
      ['I. P. Pavlova', 8],
      ['Vyšehrad', 10],
      ['Pražského povstání', 12],
      ['Pankrác', 13],
    ],
    termini: ['Háje', 'Letňany'],
    headway: metroHeadway,
    acShare: null,
    lowFloorShare: 1,
    realtime: false,
    vehicles: { ac: 'Metro M1', lowFloor: 'Metro M1', old: 'Metro M1' },
  },
];

export function transferMinutes(fromMode: TransitMode, toMode: TransitMode): number {
  if (fromMode === 'metro' && toMode === 'metro') return 3;
  if (fromMode === 'metro' || toMode === 'metro') return 4;
  return 2;
}

export function linesServing(stopName: string): DemoLine[] {
  return DEMO_LINES.filter((line) => line.stops.some(([name]) => name === stopName));
}
