/**
 * Zjednodušená, ale realistická síť PID pro sandbox: tramvaje 22 a 2,
 * metro A/B/C. Jízdní doby jsou kumulativní minuty od první uvedené zastávky.
 */
import type { LatLng, TransitMode } from '../../types';

export const DEMO_STOPS: Record<string, LatLng> = {
  'Bílá Hora': { lat: 50.07568, lng: 14.32318 },
  Vypich: { lat: 50.07996, lng: 14.34562 },
  Říčanova: { lat: 50.08135, lng: 14.353 },
  'Břevnovský klášter': { lat: 50.08319, lng: 14.35878 },
  Drinopol: { lat: 50.08393, lng: 14.37108 },
  Malovanka: { lat: 50.08551, lng: 14.38229 },
  Pohořelec: { lat: 50.0878, lng: 14.3882 },
  Brusnice: { lat: 50.09307, lng: 14.39221 },
  'Pražský hrad': { lat: 50.09332, lng: 14.39824 },
  'Královský letohrádek': { lat: 50.09425, lng: 14.40476 },
  Malostranská: { lat: 50.09107, lng: 14.41006 },
  'Malostranské náměstí': { lat: 50.08799, lng: 14.40442 },
  Újezd: { lat: 50.08115, lng: 14.40476 },
  'Národní divadlo': { lat: 50.08076, lng: 14.41407 },
  'Národní třída': { lat: 50.08059, lng: 14.41992 },
  'Karlovo náměstí': { lat: 50.07529, lng: 14.41852 },
  'I. P. Pavlova': { lat: 50.07516, lng: 14.43058 },
  'Náměstí Míru': { lat: 50.07506, lng: 14.43808 },
  Petřiny: { lat: 50.08752, lng: 14.34492 },
  'Vojenská nemocnice': { lat: 50.09172, lng: 14.36007 },
  'Vozovna Střešovice': { lat: 50.09378, lng: 14.38885 },
  Ořechovka: { lat: 50.09287, lng: 14.3793 },
  Sibeliova: { lat: 50.09267, lng: 14.38419 },
  Hradčanská: { lat: 50.09743, lng: 14.40429 },
  'Chotkovy sady': { lat: 50.09506, lng: 14.40911 },
  Staroměstská: { lat: 50.08864, lng: 14.41645 },
  'Karlovy lázně': { lat: 50.08467, lng: 14.41361 },
  Myslíkova: { lat: 50.07804, lng: 14.41847 },
  'Botanická zahrada': { lat: 50.07078, lng: 14.41926 },
  Albertov: { lat: 50.06793, lng: 14.42074 },
  'Nemocnice Motol': { lat: 50.07497, lng: 14.34079 },
  'Nádraží Veleslavín': { lat: 50.09572, lng: 14.3468 },
  Bořislavka: { lat: 50.09857, lng: 14.36406 },
  Dejvická: { lat: 50.10091, lng: 14.39319 },
  Můstek: { lat: 50.08347, lng: 14.42397 },
  Muzeum: { lat: 50.07949, lng: 14.43174 },
  'Jiřího z Poděbrad': { lat: 50.07753, lng: 14.44971 },
  Flora: { lat: 50.07812, lng: 14.46137 },
  Želivského: { lat: 50.07865, lng: 14.47407 },
  'Nové Butovice': { lat: 50.05098, lng: 14.35228 },
  Jinonice: { lat: 50.05447, lng: 14.37065 },
  Radlická: { lat: 50.05851, lng: 14.38881 },
  'Smíchovské nádraží': { lat: 50.06082, lng: 14.40922 },
  Anděl: { lat: 50.07125, lng: 14.40336 },
  'Náměstí Republiky': { lat: 50.08875, lng: 14.43012 },
  Florenc: { lat: 50.09046, lng: 14.43874 },
  Křižíkova: { lat: 50.09329, lng: 14.45139 },
  Invalidovna: { lat: 50.09743, lng: 14.46428 },
  'Nádraží Holešovice': { lat: 50.10887, lng: 14.43939 },
  Vltavská: { lat: 50.09899, lng: 14.43833 },
  'Hlavní nádraží': { lat: 50.08373, lng: 14.43404 },
  Vyšehrad: { lat: 50.06116, lng: 14.43054 },
  'Pražského povstání': { lat: 50.05614, lng: 14.43423 },
  Pankrác: { lat: 50.05092, lng: 14.43952 },
  'Malý Břevnov': { lat: 50.07616, lng: 14.3327 },
  'Obora Hvězda': { lat: 50.07832, lng: 14.34173 },
  Marjánka: { lat: 50.08455, lng: 14.37559 },
  'U Kaštanu': { lat: 50.08365, lng: 14.36311 },
  'Pražské Jezulátko': { lat: 50.08566, lng: 14.40418 },
  'Tyršův dům': { lat: 50.08419, lng: 14.40447 },
  'Novoměstská radnice': { lat: 50.07752, lng: 14.4196 },
  Štěpánská: { lat: 50.0756, lng: 14.4234 },
  'Sídliště Petřiny': { lat: 50.08651, lng: 14.33951 },
  Větrník: { lat: 50.0895, lng: 14.35007 },
  'Prašný most': { lat: 50.09479, lng: 14.39488 },
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
      ['Malý Břevnov', 1],
      ['Obora Hvězda', 2],
      ['Vypich', 3],
      ['Říčanova', 4],
      ['Břevnovský klášter', 5],
      ['Marjánka', 6],
      ['Drinopol', 7],
      ['U Kaštanu', 8],
      ['Malovanka', 9],
      ['Pohořelec', 11],
      ['Brusnice', 13],
      ['Pražský hrad', 14],
      ['Královský letohrádek', 15],
      ['Malostranská', 18],
      ['Malostranské náměstí', 20],
      ['Pražské Jezulátko', 21],
      ['Tyršův dům', 22],
      ['Újezd', 23],
      ['Národní divadlo', 25],
      ['Národní třída', 27],
      ['Novoměstská radnice', 29],
      ['Karlovo náměstí', 30],
      ['Štěpánská', 32],
      ['I. P. Pavlova', 33],
      ['Náměstí Míru', 35],
    ],
    termini: ['Nádraží Hostivař', 'Bílá Hora'],
    headway: tramHeadway(6, 8, 10),
    acShare: 0.85,
    lowFloorShare: 0.95,
    realtime: true,
    vehicles: { ac: 'Škoda 15T ForCity Alfa', lowFloor: 'Tatra T3R.PLF', old: 'Tatra T3R.P' },
  },
  {
    id: 'tram-2',
    shortName: '2',
    mode: 'tram',
    stops: [
      ['Sídliště Petřiny', 0],
      ['Petřiny', 1],
      ['Větrník', 3],
      ['Vojenská nemocnice', 4],
      ['Vozovna Střešovice', 6],
      ['Ořechovka', 8],
      ['Sibeliova', 9],
      ['Prašný most', 10],
      ['Hradčanská', 12],
      ['Chotkovy sady', 14],
      ['Malostranská', 17],
      ['Staroměstská', 20],
      ['Karlovy lázně', 22],
      ['Národní divadlo', 24],
      ['Národní třída', 26],
      ['Novoměstská radnice', 28],
      ['Karlovo náměstí', 29],
      ['Botanická zahrada', 31],
      ['Albertov', 32],
    ],
    termini: ['Náměstí Bratří Synků', 'Sídliště Petřiny'],
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
  // Přestupy v metru (Můstek, Muzeum, Florenc) jsou dlouhé chodby a eskalátory.
  if (fromMode === 'metro' && toMode === 'metro') return 5;
  if (fromMode === 'metro' || toMode === 'metro') return 5;
  return 3;
}

export function linesServing(stopName: string): DemoLine[] {
  return DEMO_LINES.filter((line) => line.stops.some(([name]) => name === stopName));
}
