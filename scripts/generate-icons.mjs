// Vygeneruje PNG ikony PWA ze SVG (vyžaduje Playwright s Chromiem). Spuštění: npm run icons
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

// Playwright se načítá přes require, aby fungoval i globálně nainstalovaný (NODE_PATH).
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Chybí Playwright – nainstaluj ho: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  { svg: 'public/icons/icon.svg', out: 'public/icons/icon-192.png', size: 192 },
  { svg: 'public/icons/icon.svg', out: 'public/icons/icon-512.png', size: 512 },
  { svg: 'public/icons/maskable.svg', out: 'public/icons/maskable-512.png', size: 512 },
  { svg: 'public/icons/maskable.svg', out: 'public/icons/apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const svg = await readFile(path.join(root, t.svg), 'utf8');
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  await writeFile(path.join(root, t.out), png);
  console.log('✓', t.out);
}
await browser.close();
