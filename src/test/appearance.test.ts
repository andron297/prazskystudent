import { describe, expect, it } from 'vitest';
import { GALLERY, autoHeroPhoto, contrast, customAccentVars, galleryPhoto, parseHex, photoCredit, resolveAppearance } from '../lib/appearance';

const at = (h: number, day = 6) => new Date(2026, 10, day, h, 0);

describe('autoHeroPhoto', () => {
  it('ráno, ve dne, večer a v noci vybírá fotky odpovídající denní doby', () => {
    expect(galleryPhoto(autoHeroPhoto(at(7), false))?.tone).toBe('morning');
    expect(galleryPhoto(autoHeroPhoto(at(13), false))?.tone).toBe('day');
    expect(galleryPhoto(autoHeroPhoto(at(19), false))?.tone).toBe('evening');
    expect(galleryPhoto(autoHeroPhoto(at(23), false))?.tone).toBe('night');
    expect(galleryPhoto(autoHeroPhoto(at(2), false))?.tone).toBe('night');
  });
  it('za deště ukáže mlhu', () => {
    expect(autoHeroPhoto(at(13), true)).toBe('mist');
  });
  it('den ode dne se denní fotky střídají', () => {
    const ids = new Set([1, 2, 3, 4, 5, 6].map((d) => autoHeroPhoto(at(12, d), false)));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('galerie', () => {
  it('každá fotka má autora, licenci a zdroj', () => {
    for (const p of GALLERY) {
      expect(p.author).toBeTruthy();
      expect(p.license).toBeTruthy();
      expect(p.source).toMatch(/^https:\/\//);
    }
  });
  it('fotky pod CC uvádějí autora i licenci', () => {
    expect(photoCredit(galleryPhoto('hrad-vecer')!)).toBe('Foto: Diego Delso, CC BY-SA 4.0');
  });
});

describe('vlastní barva', () => {
  it('rozpozná hex zápis', () => {
    expect(parseHex('#2b5a40')).toEqual([43, 90, 64]);
    expect(parseHex('abc')).toEqual([170, 187, 204]);
    expect(parseHex('zelená')).toBeNull();
  });
  it('i světlá barva dostane čitelný kontrast se světlým textem tlačítek', () => {
    const vars = customAccentVars('#ffe066')!;
    const light = parseHex(vars.light['--accent'])!;
    expect(contrast(light, [247, 244, 236])).toBeGreaterThanOrEqual(4.5);
    const dark = parseHex(vars.dark['--accent'])!;
    expect(contrast(dark, [11, 17, 13])).toBeGreaterThanOrEqual(4.5);
  });
  it('tmavá barva v tmavém režimu zesvětlí', () => {
    const vars = customAccentVars('#1a1a40')!;
    expect(contrast(parseHex(vars.dark['--accent'])!, [11, 17, 13])).toBeGreaterThanOrEqual(4.5);
  });
  it('doplní výchozí hodnoty vzhledu', () => {
    expect(resolveAppearance(undefined).accent).toBe('les');
    expect(resolveAppearance({ accent: 'vltava' } as never).heroPhoto).toBe('auto');
  });
});
