/**
 * Text z PDF (harmonogram akademického roku, sylabus) přímo v prohlížeči –
 * soubor nikam neodchází. pdf.js (legacy build kvůli starším Safari) se
 * načte až při prvním nahrání, hlavní balík aplikace nezvětšuje.
 */

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Part {
  x: number;
  w: number;
  s: string;
}

/** Položky textu ze stránky PDF → řádky (podle výšky na stránce, zleva doprava). */
export function linesFromItems(items: unknown[]): string {
  const rows: { y: number; parts: Part[] }[] = [];
  for (const raw of items) {
    const it = raw as Partial<PdfTextItem>;
    if (typeof it.str !== 'string' || !Array.isArray(it.transform) || !it.str.trim()) continue;
    const x = it.transform[4] ?? 0;
    const y = it.transform[5] ?? 0;
    const tolerance = Math.max(2, (it.height || 10) * 0.45);
    let row = rows.find((r) => Math.abs(r.y - y) <= tolerance);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, w: it.width ?? 0, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      let line = '';
      let end = Number.NEGATIVE_INFINITY;
      for (const p of row.parts) {
        if (line) {
          const gap = p.x - end;
          // široká mezera = další sloupec tabulky
          line += gap > 14 ? '   ' : gap > 1 && !line.endsWith(' ') && !p.s.startsWith(' ') ? ' ' : '';
        }
        line += p.s;
        end = p.x + p.w;
      }
      return line.replace(/\s+$/, '').replace(/ {4,}/g, '   ');
    })
    .filter((l) => l.trim())
    .join('\n');
}

export async function pdfToText(file: Blob, maxPages = 40): Promise<string> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(linesFromItems(content.items));
      page.cleanup();
    }
    return pages.join('\n\n').trim();
  } finally {
    void task.destroy();
  }
}
