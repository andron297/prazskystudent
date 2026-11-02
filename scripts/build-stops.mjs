// Vytvoří kompaktní dataset pražských zastávek z otevřených dat PID (data.pid.cz).
// Spuštění: npm run stops  → public/data/stops-praha.json
//
// Formát (kvůli velikosti zkrácené klíče):
//   d: [směr, …]                         – tabulka konečných (směrů)
//   groups: [{ n: název, y: lat, x: lon, t: hlavní druh dopravy,
//              l: ['22:t', 'A:m', '97:tn', …]   – linky (t tram, m metro, b bus, r vlak, y trolejbus, f přívoz, u lanovka; n = noční)
//              p: [[lat, lon, gtfsId, nástupiště, bezbariérové 0/1, [indexLinky, indexSměru, …]], …] }]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://data.pid.cz/stops/json/stops.json';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'data', 'stops-praha.json');

const TYPE_CODE = { tram: 't', metro: 'm', bus: 'b', train: 'r', trolleybus: 'y', ferry: 'f', funicular: 'u' };

function mainType(value) {
  if (!value || value === 'undefined') return 'bus';
  if (value.startsWith('metro')) return 'metro';
  return value;
}

const round = (n) => Math.round(n * 1e5) / 1e5;
const collator = new Intl.Collator('cs', { numeric: true });

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`PID data: HTTP ${response.status}`);
const data = await response.json();

const directions = [];
const directionIndex = new Map();
function dirId(name) {
  let i = directionIndex.get(name);
  if (i === undefined) {
    i = directions.length;
    directions.push(name);
    directionIndex.set(name, i);
  }
  return i;
}

const groups = [];
for (const g of data.stopGroups ?? []) {
  if (g.municipality !== 'Praha') continue;
  const lineKeys = new Set();
  for (const s of g.stops ?? []) {
    for (const l of s.lines ?? []) {
      const code = TYPE_CODE[l.type];
      if (code && l.name) lineKeys.add(`${l.name}:${code}${l.isNight ? 'n' : ''}`);
    }
  }
  const lines = [...lineKeys].sort(collator.compare);
  const lineIdx = new Map(lines.map((k, i) => [k, i]));
  const platforms = [];
  for (const s of g.stops ?? []) {
    const served = [];
    for (const l of s.lines ?? []) {
      const code = TYPE_CODE[l.type];
      if (!code || !l.name) continue;
      const li = lineIdx.get(`${l.name}:${code}${l.isNight ? 'n' : ''}`);
      if (li === undefined) continue;
      served.push(li, l.direction ? dirId(l.direction) : -1);
    }
    platforms.push([round(s.lat), round(s.lon), s.gtfsIds?.[0] ?? '', s.platform ?? '', s.wheelchairAccess === 'possible' ? 1 : 0, served]);
  }
  if (platforms.length === 0) continue;
  groups.push({ n: g.name, y: round(g.avgLat), x: round(g.avgLon), t: mainType(g.mainTrafficType), l: lines, p: platforms });
}

groups.sort((a, b) => collator.compare(a.n, b.n));
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ generatedAt: data.generatedAt, source: SOURCE, d: directions, groups }));
console.log(`✓ ${groups.length} zastávek, ${directions.length} směrů → ${path.relative(root, out)}`);
