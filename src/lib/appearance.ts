/**
 * Vzhled aplikace: galerie fotek (s autory a licencemi), barevné motivy,
 * vlastní barva s hlídáním kontrastu a automatická fotka podle denní doby.
 */
import type { AccentTheme, AppearanceSettings } from '../types';

/* ------------------------------------------------------------------ */
/* Galerie                                                             */
/* ------------------------------------------------------------------ */

export type PhotoTone = 'morning' | 'day' | 'evening' | 'night';

export interface GalleryPhoto {
  id: string;
  title: string;
  group: 'praha' | 'priroda';
  tone: PhotoTone;
  author: string;
  license: string;
  licenseUrl?: string;
  /** Stránka originálu (autorství a licence). */
  source: string;
}

const COMMONS = 'https://commons.wikimedia.org/wiki/File:';

export const GALLERY: GalleryPhoto[] = [
  { id: 'hrad-vecer', title: 'Pražský hrad večer', group: 'praha', tone: 'evening', author: 'Diego Delso', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: `${COMMONS}Castillo_de_Praga,_Praga,_Rep%C3%BAblica_Checa,_2022-07-01,_DD_23-25_HDR.jpg` },
  { id: 'karluv-most-noc', title: 'Hrad a Karlův most v noci', group: 'praha', tone: 'night', author: 'Diego Delso', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: `${COMMONS}Castillo_de_Praga_y_puente_Carlos,_Praga,_Rep%C3%BAblica_Checa,_2022-07-01,_DD_14-16_HDR.jpg` },
  { id: 'hrad-soumrak', title: 'Hradčany za soumraku', group: 'praha', tone: 'evening', author: 'Godot13', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: `${COMMONS}Czech-2013-Prague-Prague_Castle_at_dusk.jpg` },
  { id: 'mostecka-vez', title: 'Malostranské mostecké věže', group: 'praha', tone: 'morning', author: 'Massimo Catarinella', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: `${COMMONS}CharlesBridgeMalaStranaPragueCzechRepublic.jpg` },
  { id: 'mala-strana', title: 'Střechy Malé Strany', group: 'praha', tone: 'day', author: 'Diego Delso', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: `${COMMONS}Castillo_de_Praga,_Praga,_Rep%C3%BAblica_Checa,_2022-07-02,_DD_210.jpg` },
  { id: 'prague', title: 'Karlův most z výšky', group: 'praha', tone: 'day', author: 'Unsplash', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', source: 'https://unsplash.com' },
  { id: 'strahov', title: 'Výhled ze Strahovské zahrady', group: 'praha', tone: 'day', author: 'Darwinek', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: `${COMMONS}Praga_Strahov_Garden_panorama.jpg` },
  { id: 'vltava', title: 'Na Vltavě', group: 'praha', tone: 'day', author: 'Jacek Halicki', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: `${COMMONS}2014_Praga,_Ve%C5%82tawa.jpg` },
  { id: 'zlata-ulicka', title: 'Zlatá ulička', group: 'praha', tone: 'day', author: 'Diego Delso', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: `${COMMONS}Callej%C3%B3n_del_oro,_Praga,_Rep%C3%BAblica_Checa,_2022-07-02,_DD_139.jpg` },
  { id: 'riverside', title: 'Novotného lávka', group: 'praha', tone: 'evening', author: 'Unsplash', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', source: 'https://unsplash.com' },
  { id: 'tancici-dum', title: 'Tančící dům', group: 'praha', tone: 'night', author: 'Diego Delso', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', source: `${COMMONS}Casa_Danzante,_Praga,_Rep%C3%BAblica_Checa,_2022-07-01,_DD_01.jpg` },
  { id: 'mist', title: 'Mlha nad lesem', group: 'priroda', tone: 'morning', author: 'Unsplash', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', source: 'https://unsplash.com' },
  { id: 'forest', title: 'Les ve slunci', group: 'priroda', tone: 'day', author: 'Unsplash', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', source: 'https://unsplash.com' },
  { id: 'path', title: 'Lesní cesta', group: 'priroda', tone: 'day', author: 'Unsplash', license: 'Unsplash License', licenseUrl: 'https://unsplash.com/license', source: 'https://unsplash.com' },
];

export function galleryPhoto(id: string | undefined): GalleryPhoto | undefined {
  return GALLERY.find((p) => p.id === id);
}

export const photoUrl = (id: string, size: 'full' | 'medium' | 'thumb' = 'medium') => (size === 'full' ? `/images/${id}.webp` : size === 'medium' ? `/images/${id}-1200.webp` : `/images/${id}-360.webp`);

/** Krátký popisek autorství (licence CC BY-SA ho vyžaduje). */
export function photoCredit(p: GalleryPhoto): string {
  return p.license.startsWith('CC') ? `Foto: ${p.author}, ${p.license}` : `Foto: ${p.author}`;
}

function dayOfYear(d: Date): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
}

/** Fotka podle denní doby (a počasí); každý den jiná z dané skupiny. */
export function autoHeroPhoto(now: Date, wet: boolean): string {
  const h = now.getHours();
  if (wet) return 'mist';
  const tone: PhotoTone = h < 5 ? 'night' : h < 9 ? 'morning' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night';
  const pool = GALLERY.filter((p) => p.group === 'praha' && p.tone === tone);
  const list = pool.length ? pool : GALLERY.filter((p) => p.group === 'praha');
  return list[dayOfYear(now) % list.length].id;
}

/* ------------------------------------------------------------------ */
/* Barevné motivy                                                      */
/* ------------------------------------------------------------------ */

export interface AccentDef {
  id: AccentTheme;
  label: string;
  hint: string;
  /** Vzorník: [světlý akcent, tmavý akcent, doplňková barva]. */
  swatch: [string, string, string];
}

export const ACCENTS: AccentDef[] = [
  { id: 'les', label: 'Les', hint: 'klidná zelená', swatch: ['#2b5a40', '#a8c79f', '#c7a676'] },
  { id: 'vltava', label: 'Vltava', hint: 'říční modrá', swatch: ['#1f5873', '#9cc6da', '#c9b48a'] },
  { id: 'terakota', label: 'Střechy', hint: 'pražská terakota', swatch: ['#9a4527', '#eaa98a', '#d9b37a'] },
  { id: 'svitani', label: 'Soumrak', hint: 'švestková a růžová', swatch: ['#7d3a58', '#e3a8c0', '#d6a77c'] },
  { id: 'levandule', label: 'Levandule', hint: 'jemná fialová', swatch: ['#56468a', '#c3b8ec', '#c9a97a'] },
  { id: 'grafit', label: 'Grafit', hint: 'střídmá šedá', swatch: ['#30363a', '#d5d9d6', '#b49a6e'] },
  { id: 'vlastni', label: 'Vlastní', hint: 'vaše barva', swatch: ['#2b5a40', '#a8c79f', '#c7a676'] },
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  accent: 'les',
  heroPhoto: 'auto',
  background: 'paper',
  backgroundDim: 0.55,
  intro: true,
  headingFont: 'serif',
};

export function resolveAppearance(a: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  return { ...DEFAULT_APPEARANCE, ...(a ?? {}) };
}

/* ------------------------------------------------------------------ */
/* Vlastní barva: kontrast vůči textu na tlačítkách                     */
/* ------------------------------------------------------------------ */

type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Ztmaví/zesvětlí barvu, dokud nemá dostatečný kontrast vůči `against`. */
function ensureContrast(c: RGB, against: RGB, toward: RGB, min = 4.6): RGB {
  let out = c;
  for (let i = 0; i < 20 && contrast(out, against) < min; i++) out = mix(out, toward, 0.08);
  return out;
}

/** Odvozené barvy vlastního motivu pro světlý a tmavý režim. */
export function customAccentVars(hex: string): { light: Record<string, string>; dark: Record<string, string> } | null {
  const base = parseHex(hex);
  if (!base) return null;
  const paper: RGB = [247, 244, 236];
  const night: RGB = [11, 17, 13];
  const lightAccent = ensureContrast(base, paper, [0, 0, 0]);
  const darkAccent = ensureContrast(mix(base, [255, 255, 255], 0.25), night, [255, 255, 255], 7);
  const forest = mix(lightAccent, [8, 12, 10], 0.45);
  const forestDark = mix(base, [8, 12, 10], 0.72);
  const rgb = (c: RGB) => c.map(Math.round).join(' ');
  return {
    light: { '--accent': toHex(lightAccent), '--accent-soft': `rgb(${rgb(lightAccent)} / 0.1)`, '--forest': toHex(forest), '--moss': toHex(mix(lightAccent, [255, 255, 255], 0.3)), '--glow-1': `rgb(${rgb(lightAccent)} / 0.14)` },
    dark: { '--accent': toHex(darkAccent), '--accent-soft': `rgb(${rgb(darkAccent)} / 0.13)`, '--forest': toHex(forestDark), '--moss': toHex(mix(darkAccent, [128, 128, 128], 0.15)), '--glow-1': `rgb(${rgb(darkAccent)} / 0.09)` },
  };
}

/** Aplikuje vzhled na <html> (motiv, písmo, vlastní barvy). */
export function applyAppearance(a: AppearanceSettings, theme: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.setAttribute('data-accent', a.accent);
  root.setAttribute('data-heading', a.headingFont);
  const vars = a.accent === 'vlastni' && a.customAccent ? customAccentVars(a.customAccent) : null;
  for (const name of ['--accent', '--accent-soft', '--forest', '--moss', '--glow-1']) root.style.removeProperty(name);
  if (vars) for (const [k, v] of Object.entries(vars[theme])) root.style.setProperty(k, v);
}
