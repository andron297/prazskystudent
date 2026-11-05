/**
 * Český kalendář: kdo má svátek a státní svátky (včetně Velikonoc).
 * Jména podle občanského kalendáře – data z knihovny namedays-cs
 * (© Roman Ožana, licence MIT).
 */
import NAMES from '../data/namedays.json';

const names = NAMES as Record<string, string | string[]>;
const pad = (n: number) => String(n).padStart(2, '0');

/** Jména, která mají daný den svátek (prázdné pole o státních svátcích bez jména). */
export function nameDay(d: Date): string[] {
  const v = names[`${pad(d.getMonth() + 1)}-${pad(d.getDate())}`];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Velikonoční neděle (gregoriánský kalendář, anonymní algoritmus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED: Record<string, string> = {
  '01-01': 'Den obnovy samostatného českého státu a Nový rok',
  '05-01': 'Svátek práce',
  '05-08': 'Den vítězství',
  '07-05': 'Den slovanských věrozvěstů Cyrila a Metoděje',
  '07-06': 'Den upálení mistra Jana Husa',
  '09-28': 'Den české státnosti',
  '10-28': 'Den vzniku samostatného československého státu',
  '11-17': 'Den boje za svobodu a demokracii a Mezinárodní den studentstva',
  '12-24': 'Štědrý den',
  '12-25': '1. svátek vánoční',
  '12-26': '2. svátek vánoční',
};

/** Státní svátek nebo ostatní svátek v ČR (den volna), jinak null. */
export function publicHoliday(d: Date): string | null {
  const fixed = FIXED[`${pad(d.getMonth() + 1)}-${pad(d.getDate())}`];
  if (fixed) return fixed;
  const easter = easterSunday(d.getFullYear());
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - easter.getTime()) / 86_400_000);
  if (diff === -2) return 'Velký pátek';
  if (diff === 1) return 'Velikonoční pondělí';
  return null;
}

/** „Svátek má Karina“ / „Svátek mají Adam a Eva“. */
export function nameDayText(d: Date): string | null {
  const list = nameDay(d);
  if (list.length === 0) return null;
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} a ${list[list.length - 1]}`;
  return `Svátek ${list.length === 1 ? 'má' : 'mají'} ${joined}`;
}
