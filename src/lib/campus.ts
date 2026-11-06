/**
 * Katalog škol, fakult a jejich budov v Praze (polohy z OpenStreetMap).
 * Budovy z katalogu zná aplikace vždy – rozvrh se tak napáruje u kohokoli.
 * Fakulta studenta určuje „moje budovy“ (mapa, menza poblíž, výchozí cíl)
 * a pozná se sama podle toho, kde se podle rozvrhu učí.
 */
import type { Building } from '../types';

export interface Faculty {
  id: string;
  /** Plný název, např. „Fakulta sociálních věd“. */
  name: string;
  /** Zkratka, např. „FSV UK“. */
  short: string;
  school: string;
  buildings: string[];
}

const B = (b: Omit<Building, 'arrivalStops'> & { arrivalStops?: Building['arrivalStops'] }): Building => ({ arrivalStops: [], ...b });

/** Všechny známé budovy. ID starších verzí (hollar, jinonice…) zůstávají kvůli uloženému párování místností. */
export const CAMPUS_BUILDINGS: Building[] = [
  B({ id: 'karolinum', name: 'Karolinum', locative: 'v Karolinu', faculty: 'UK', address: 'Ovocný trh 560/5, 116 36 Praha 1', coords: { lat: 50.08699, lng: 14.42371 }, aliases: ['karolinum', 'ovocny trh'], arrivalStops: [{ name: 'Můstek', walkMinutes: 5, lines: ['A', 'B'] }, { name: 'Náměstí Republiky', walkMinutes: 6, lines: ['B'] }] }),
  // FF UK
  B({ id: 'ff-palach', name: 'FF UK – nám. Jana Palacha', locative: 'na FF UK', faculty: 'FF UK', address: 'nám. Jana Palacha 1/2, 116 38 Praha 1', coords: { lat: 50.08898, lng: 14.41589 }, aliases: ['jana palacha', 'palachovo nam', 'ff uk', 'hlavni budova ff'], arrivalStops: [{ name: 'Staroměstská', walkMinutes: 2, lines: ['A', '2', '17', '18'] }] }),
  B({ id: 'ff-celetna', name: 'FF UK – Celetná 20', locative: 'v Celetné', faculty: 'FF UK', address: 'Celetná 562/20, 110 00 Praha 1', coords: { lat: 50.0871, lng: 14.42419 }, aliases: ['celetna 20'] }),
  // FSV UK (Jinonice sdílí s FF UK)
  B({ id: 'hollar', name: 'Hollar', locative: 'na Hollaru', faculty: 'FSV UK', address: 'Smetanovo nábřeží 995/6, 110 00 Praha 1', coords: { lat: 50.08235, lng: 14.41328 }, aliases: ['hollar', 'smetanovo nabr', 'smetanovo nabrezi'], roomPattern: '^H\\d{1,4}[A-Z]?$', arrivalStops: [{ name: 'Národní divadlo', walkMinutes: 3, lines: ['2', '9', '17', '18', '22', '23'] }, { name: 'Karlovy lázně', walkMinutes: 4, lines: ['2', '17', '18'] }, { name: 'Národní třída', walkMinutes: 7, lines: ['B'] }, { name: 'Staroměstská', walkMinutes: 9, lines: ['A'] }] }),
  B({ id: 'jinonice', name: 'Areál Jinonice', locative: 'v Jinonicích', faculty: 'FSV UK · FF UK', address: 'U Kříže 661/8, 158 00 Praha 5', coords: { lat: 50.0543, lng: 14.3686 }, aliases: ['jinonice', 'u krize'], roomPattern: '^J\\d{2,4}[A-Z]?$', arrivalStops: [{ name: 'Jinonice', walkMinutes: 7, lines: ['B'] }] }),
  B({ id: 'opletalova', name: 'Opletalova', locative: 'v Opletalově', faculty: 'FSV UK', address: 'Opletalova 1606/26, 110 00 Praha 1', coords: { lat: 50.08211, lng: 14.43114 }, aliases: ['opletalova'], arrivalStops: [{ name: 'Hlavní nádraží', walkMinutes: 5, lines: ['C'] }, { name: 'Muzeum', walkMinutes: 6, lines: ['A', 'C'] }, { name: 'Můstek', walkMinutes: 9, lines: ['A', 'B'] }] }),
  // PF UK
  B({ id: 'pf', name: 'PF UK', locative: 'na Právnické fakultě', faculty: 'PF UK', address: 'nám. Curieových 901/7, 116 40 Praha 1', coords: { lat: 50.09145, lng: 14.41699 }, aliases: ['curieovych', 'pravnicka fakulta', 'pf uk'], arrivalStops: [{ name: 'Staroměstská', walkMinutes: 6, lines: ['A', '2', '17', '18'] }] }),
  // PřF UK
  B({ id: 'albertov', name: 'PřF UK – Albertov', locative: 'na Albertově', faculty: 'PřF UK', address: 'Albertov 6, 128 00 Praha 2', coords: { lat: 50.06875, lng: 14.42428 }, aliases: ['albertov 6', 'prf uk', 'albertov'], arrivalStops: [{ name: 'Albertov', walkMinutes: 2, lines: ['7', '14', '18', '24'] }] }),
  B({ id: 'prf-benatska', name: 'PřF UK – Benátská', locative: 'v Benátské', faculty: 'PřF UK', address: 'Benátská 433/2, 128 00 Praha 2', coords: { lat: 50.07137, lng: 14.42086 }, aliases: ['benatska'] }),
  B({ id: 'prf-vinicna', name: 'PřF UK – Viničná', locative: 've Viničné', faculty: 'PřF UK', address: 'Viničná 1594/7, 128 00 Praha 2', coords: { lat: 50.07226, lng: 14.42442 }, aliases: ['vinicna'] }),
  B({ id: 'prf-hlavova', name: 'PřF UK – Hlavova', locative: 'v Hlavově', faculty: 'PřF UK', address: 'Hlavova 2030/8, 128 00 Praha 2', coords: { lat: 50.06829, lng: 14.42484 }, aliases: ['hlavova'] }),
  // MFF UK
  B({ id: 'mff-malastrana', name: 'MFF UK – Malá Strana', locative: 'na Malé Straně', faculty: 'MFF UK', address: 'Malostranské nám. 2/25, 118 00 Praha 1', coords: { lat: 50.08849, lng: 14.40319 }, aliases: ['malostranske nam', 'mala strana'], roomPattern: '^S\\d{1,2}$', arrivalStops: [{ name: 'Malostranské náměstí', walkMinutes: 1, lines: ['12', '15', '20', '22', '23'] }] }),
  B({ id: 'mff-karlov', name: 'MFF UK – Karlov', locative: 'na Karlově', faculty: 'MFF UK', address: 'Ke Karlovu 2027/3, 121 16 Praha 2', coords: { lat: 50.06953, lng: 14.42829 }, aliases: ['ke karlovu', 'karlov'], arrivalStops: [{ name: 'I. P. Pavlova', walkMinutes: 7, lines: ['C', '4', '6', '10', '16', '22'] }] }),
  B({ id: 'mff-troja', name: 'MFF UK – Troja', locative: 'v Troji', faculty: 'MFF UK', address: 'V Holešovičkách 747/2, 180 00 Praha 8', coords: { lat: 50.11478, lng: 14.449 }, aliases: ['holesovickach', 'troja'] }),
  B({ id: 'mff-karlin', name: 'MFF UK – Karlín', locative: 'v Karlíně', faculty: 'MFF UK', address: 'Sokolovská 49/83, 186 75 Praha 8', coords: { lat: 50.09397, lng: 14.45054 }, aliases: ['sokolovska 83', 'karlin'] }),
  // PedF UK
  B({ id: 'pedf-rettigove', name: 'PedF UK – Rettigové', locative: 'na Pedagogické fakultě', faculty: 'PedF UK', address: 'Magdalény Rettigové 47/4, 116 39 Praha 1', coords: { lat: 50.07972, lng: 14.42034 }, aliases: ['rettigove', 'pedf uk', 'pedagogicka fakulta'] }),
  B({ id: 'pedf-celetna', name: 'PedF UK – Celetná 13', locative: 'v Celetné', faculty: 'PedF UK', address: 'Celetná 597/13, 110 00 Praha 1', coords: { lat: 50.08721, lng: 14.42403 }, aliases: ['celetna 13'] }),
  B({ id: 'pedf-myslikova', name: 'PedF UK – Myslíkova', locative: 'v Myslíkově', faculty: 'PedF UK', address: 'Myslíkova 208/7, 110 00 Praha 1', coords: { lat: 50.0776, lng: 14.41569 }, aliases: ['myslikova'] }),
  // Lékařské fakulty v Praze
  B({ id: 'lf1-katerinska', name: '1. LF UK – Kateřinská', locative: 'v Kateřinské', faculty: '1. LF UK', address: 'Kateřinská 1660/32, 121 08 Praha 2', coords: { lat: 50.0746, lng: 14.42658 }, aliases: ['katerinska', '1. lf', '1.lf'] }),
  B({ id: 'lf1-albertov', name: '1. LF UK – Albertov 4', locative: 'na Albertově', faculty: '1. LF UK', address: 'Albertov 2048/4, 128 00 Praha 2', coords: { lat: 50.06845, lng: 14.42307 }, aliases: ['albertov 4'] }),
  B({ id: 'lf2-motol', name: '2. LF UK – Motol', locative: 'v Motole', faculty: '2. LF UK', address: 'V Úvalu 84/1, 150 06 Praha 5', coords: { lat: 50.07269, lng: 14.34051 }, aliases: ['motol', 'v uvalu', '2. lf', '2.lf'] }),
  B({ id: 'lf3-ruska', name: '3. LF UK – Ruská', locative: 'na 3. LF', faculty: '3. LF UK', address: 'Ruská 2411/87, 100 00 Praha 10', coords: { lat: 50.07398, lng: 14.47324 }, aliases: ['ruska 87', '3. lf', '3.lf', 'vinohrady'] }),
  // Další fakulty UK
  B({ id: 'ftvs', name: 'FTVS UK', locative: 'na FTVS', faculty: 'FTVS UK', address: 'José Martího 269/31, 162 52 Praha 6', coords: { lat: 50.09313, lng: 14.33507 }, aliases: ['jose martiho', 'ftvs', 'veleslavin'] }),
  B({ id: 'ktf', name: 'KTF UK', locative: 'na KTF', faculty: 'KTF UK', address: 'Thákurova 676/3, 160 00 Praha 6', coords: { lat: 50.10227, lng: 14.38719 }, aliases: ['thakurova 3', 'ktf'] }),
  B({ id: 'etf', name: 'ETF UK', locative: 'na ETF', faculty: 'ETF UK', address: 'Černá 646/9, 110 00 Praha 1', coords: { lat: 50.0789, lng: 14.41814 }, aliases: ['cerna 9', 'etf'] }),
  B({ id: 'htf', name: 'HTF UK', locative: 'na HTF', faculty: 'HTF UK', address: 'Pacovská 350/4, 140 21 Praha 4', coords: { lat: 50.04505, lng: 14.44168 }, aliases: ['pacovska', 'htf'] }),
  B({ id: 'fhs', name: 'FHS UK', locative: 'na FHS', faculty: 'FHS UK', address: 'Pátkova 2137/5, 182 00 Praha 8', coords: { lat: 50.11617, lng: 14.44223 }, aliases: ['patkova', 'fhs', 'liben'] }),
  // Další pražské školy (hlavní budovy)
  B({ id: 'cvut-dejvice', name: 'ČVUT – Dejvice', locative: 'na ČVUT v Dejvicích', faculty: 'ČVUT', address: 'Thákurova 2077/7, 160 00 Praha 6', coords: { lat: 50.10425, lng: 14.38861 }, aliases: ['thakurova 7', 'thakurova 9', 'cvut', 'fsv cvut', 'fit cvut', 'fa cvut'] }),
  B({ id: 'cvut-technicka', name: 'ČVUT – Technická 2', locative: 'na ČVUT v Technické', faculty: 'ČVUT', address: 'Technická 1902/2, 160 00 Praha 6', coords: { lat: 50.10254, lng: 14.39283 }, aliases: ['technicka 2', 'fel cvut', 'fs cvut'] }),
  B({ id: 'cvut-karlovo', name: 'ČVUT – Karlovo náměstí', locative: 'na Karlově náměstí', faculty: 'ČVUT', address: 'Karlovo nám. 293/13, 120 00 Praha 2', coords: { lat: 50.07624, lng: 14.41904 }, aliases: ['karlovo nam', 'karlovo namesti'] }),
  B({ id: 'vse-zizkov', name: 'VŠE – Žižkov', locative: 'na VŠE', faculty: 'VŠE', address: 'nám. W. Churchilla 1938/4, 130 67 Praha 3', coords: { lat: 50.08427, lng: 14.44116 }, aliases: ['churchilla', 'vse', 'rajska budova', 'italska budova'] }),
  B({ id: 'vscht', name: 'VŠCHT', locative: 'na VŠCHT', faculty: 'VŠCHT', address: 'Technická 1905/5, 166 28 Praha 6', coords: { lat: 50.10335, lng: 14.38983 }, aliases: ['technicka 5', 'vscht'] }),
  B({ id: 'czu', name: 'ČZU – Suchdol', locative: 'na ČZU', faculty: 'ČZU', address: 'Kamýcká 129, 165 00 Praha 6', coords: { lat: 50.13004, lng: 14.37391 }, aliases: ['kamycka', 'czu', 'suchdol'] }),
  B({ id: 'amu', name: 'AMU', locative: 'na AMU', faculty: 'AMU', address: 'Malostranské nám. 259/12, 118 00 Praha 1', coords: { lat: 50.08765, lng: 14.40235 }, aliases: ['amu', 'lichtenstejnsky palac', 'lichtenstejnsky'] }),
  B({ id: 'umprum', name: 'UMPRUM', locative: 'na UMPRUM', faculty: 'UMPRUM', address: 'nám. Jana Palacha 80/3, 116 93 Praha 1', coords: { lat: 50.08867, lng: 14.41498 }, aliases: ['umprum', 'vysoka skola umeleckoprumyslova'] }),
];

export const FACULTIES: Faculty[] = [
  { id: 'ff', name: 'Filozofická fakulta', short: 'FF UK', school: 'Univerzita Karlova', buildings: ['ff-palach', 'ff-celetna', 'jinonice'] },
  { id: 'fsv', name: 'Fakulta sociálních věd', short: 'FSV UK', school: 'Univerzita Karlova', buildings: ['hollar', 'jinonice', 'opletalova'] },
  { id: 'pf', name: 'Právnická fakulta', short: 'PF UK', school: 'Univerzita Karlova', buildings: ['pf'] },
  { id: 'prf', name: 'Přírodovědecká fakulta', short: 'PřF UK', school: 'Univerzita Karlova', buildings: ['albertov', 'prf-benatska', 'prf-vinicna', 'prf-hlavova'] },
  { id: 'mff', name: 'Matematicko-fyzikální fakulta', short: 'MFF UK', school: 'Univerzita Karlova', buildings: ['mff-malastrana', 'mff-karlov', 'mff-troja', 'mff-karlin'] },
  { id: 'pedf', name: 'Pedagogická fakulta', short: 'PedF UK', school: 'Univerzita Karlova', buildings: ['pedf-rettigove', 'pedf-celetna', 'pedf-myslikova'] },
  { id: 'lf1', name: '1. lékařská fakulta', short: '1. LF UK', school: 'Univerzita Karlova', buildings: ['lf1-katerinska', 'lf1-albertov'] },
  { id: 'lf2', name: '2. lékařská fakulta', short: '2. LF UK', school: 'Univerzita Karlova', buildings: ['lf2-motol'] },
  { id: 'lf3', name: '3. lékařská fakulta', short: '3. LF UK', school: 'Univerzita Karlova', buildings: ['lf3-ruska'] },
  { id: 'ftvs', name: 'Fakulta tělesné výchovy a sportu', short: 'FTVS UK', school: 'Univerzita Karlova', buildings: ['ftvs'] },
  { id: 'ktf', name: 'Katolická teologická fakulta', short: 'KTF UK', school: 'Univerzita Karlova', buildings: ['ktf'] },
  { id: 'etf', name: 'Evangelická teologická fakulta', short: 'ETF UK', school: 'Univerzita Karlova', buildings: ['etf'] },
  { id: 'htf', name: 'Husitská teologická fakulta', short: 'HTF UK', school: 'Univerzita Karlova', buildings: ['htf'] },
  { id: 'fhs', name: 'Fakulta humanitních studií', short: 'FHS UK', school: 'Univerzita Karlova', buildings: ['fhs'] },
  { id: 'cvut', name: 'České vysoké učení technické', short: 'ČVUT', school: 'Další pražské školy', buildings: ['cvut-dejvice', 'cvut-technicka', 'cvut-karlovo'] },
  { id: 'vse', name: 'Vysoká škola ekonomická', short: 'VŠE', school: 'Další pražské školy', buildings: ['vse-zizkov'] },
  { id: 'vscht', name: 'Vysoká škola chemicko-technologická', short: 'VŠCHT', school: 'Další pražské školy', buildings: ['vscht'] },
  { id: 'czu', name: 'Česká zemědělská univerzita', short: 'ČZU', school: 'Další pražské školy', buildings: ['czu'] },
  { id: 'amu', name: 'Akademie múzických umění', short: 'AMU', school: 'Další pražské školy', buildings: ['amu'] },
  { id: 'umprum', name: 'Uměleckoprůmyslová akademie', short: 'UMPRUM', school: 'Další pražské školy', buildings: ['umprum'] },
];

export function facultyById(id: string | undefined | null): Faculty | undefined {
  return id ? FACULTIES.find((f) => f.id === id) : undefined;
}

/** Budovy fakulty v pořadí katalogu (první = hlavní). */
export function facultyBuildings(faculty: Faculty | undefined, buildings: Building[]): Building[] {
  if (!faculty) return [];
  return faculty.buildings.map((id) => buildings.find((b) => b.id === id)).filter((b): b is Building => Boolean(b));
}

/**
 * Doplní do uložených budov ty z katalogu, které tam ještě nejsou (nové verze aplikace),
 * a starší výchozí budovy srovná s katalogem; ruční úpravy a vlastní budovy zůstávají.
 */
export function withCampus(saved: Building[] | undefined): Building[] {
  const list = Array.isArray(saved) ? saved : [];
  const byId = new Map(list.map((b) => [b.id, b]));
  const out: Building[] = CAMPUS_BUILDINGS.map((c) => {
    const own = byId.get(c.id);
    if (!own) return c;
    // Starší verze měla jen orientační souřadnice – vlastní úpravy (jiný název, aliasy) zachovat.
    return own.custom ? own : { ...c, aliases: [...new Set([...c.aliases, ...own.aliases])], arrivalStops: own.arrivalStops?.length ? own.arrivalStops : c.arrivalStops };
  });
  for (const b of list) if (!CAMPUS_BUILDINGS.some((c) => c.id === b.id)) out.push(b);
  return out;
}

/** Střed Prahy (Můstek) – výchozí pohled, když nevíme nic lepšího. */
export const PRAGUE_CENTER = { lat: 50.08385, lng: 14.42345 };
