/** Sdílený vzhled mapy (podklad OpenFreeMap přebarvený do palety aplikace). */
import type { Map as MapLibreMap } from 'maplibre-gl';

export const STYLE_URL = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' } as const;
export const PRAGUE_BOUNDS: [[number, number], [number, number]] = [
  [13.95, 49.85],
  [14.95, 50.3],
];

/** Přebarvení podkladu do lesní palety aplikace. */
const NATURE: Record<'light' | 'dark', Record<string, [string, string]>> = {
  light: {
    background: ['background-color', '#efebe1'],
    park: ['fill-color', '#dde4cf'],
    landuse_park: ['fill-color', '#dde4cf'],
    landcover_wood: ['fill-color', '#d3ddc4'],
    water: ['fill-color', '#bdd2cf'],
    waterway: ['line-color', '#a9c4c0'],
    landuse_residential: ['fill-color', '#e9e4d8'],
    building: ['fill-color', '#e3dccd'],
    highway_minor: ['line-color', '#e2dccd'],
    highway_major_inner: ['line-color', '#fbf9f4'],
    highway_major_casing: ['line-color', '#d8d1c0'],
    railway: ['line-color', '#d3cbb9'],
  },
  dark: {
    background: ['background-color', '#0d1410'],
    water: ['fill-color', '#122420'],
    waterway: ['line-color', '#122420'],
    landcover_wood: ['fill-color', '#14211a'],
    landuse_park: ['fill-color', '#14211a'],
    landuse_residential: ['fill-color', '#101914'],
    building: ['fill-color', '#0c130f'],
    highway_minor: ['line-color', '#1a251f'],
    highway_major_inner: ['line-color', '#1e2b24'],
    highway_major_subtle: ['line-color', '#1a251f'],
    highway_path: ['line-color', '#162019'],
    railway: ['line-color', '#24302a'],
  },
};


/** Popisky v češtině: podklad jinak dává přednost anglickým názvům („Prague“, „Old Town“). */
function localizeLabels(map: MapLibreMap) {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const field = map.getLayoutProperty(layer.id, 'text-field');
    if (!field) continue;
    const raw = JSON.stringify(field);
    if (!/name/.test(raw) || /ref|housenumber/.test(raw)) continue;
    try {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:cs'], ['get', 'name']]);
    } catch {
      /* vrstva bez textu */
    }
  }
}

/**
 * Tramvajové koleje: podklad je kreslí stejně jako železnici (šrafované
 * pražce). Tady jsou tenká plná linka v teplém tónu – na první pohled jiné
 * než vlak.
 */
function tramTracks(map: MapLibreMap, theme: 'light' | 'dark') {
  try {
    if (map.getLayer('railway_transit_dashline')) map.setLayoutProperty('railway_transit_dashline', 'visibility', 'none');
    if (map.getLayer('railway_transit')) {
      map.setPaintProperty('railway_transit', 'line-color', theme === 'dark' ? '#5b4a3c' : '#cdb79c');
      map.setPaintProperty('railway_transit', 'line-width', ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 1.4, 19, 2.6]);
      map.setPaintProperty('railway_transit', 'line-opacity', 0.9);
    }
  } catch {
    /* jiný podklad */
  }
}

export function applyNature(map: MapLibreMap, theme: 'light' | 'dark') {
  localizeLabels(map);
  tramTracks(map, theme);
  for (const [layer, [prop, value]] of Object.entries(NATURE[theme])) {
    if (!map.getLayer(layer)) continue;
    try {
      map.setPaintProperty(layer, prop as never, value as never);
    } catch {
      /* vrstva má jiný typ */
    }
  }
}
