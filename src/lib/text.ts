/**
 * Odstraní diakritiku a převede na malá písmena. Zachovává délku řetězce
 * (mapuje po jednotlivých UTF-16 jednotkách), takže indexy regulárních
 * výrazů nad „složeným“ textem odpovídají původnímu textu.
 */
export function foldDiacritics(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = ch.charCodeAt(0);
    if (code < 128) {
      out += ch.toLowerCase();
      continue;
    }
    const base = ch.normalize('NFD').charAt(0);
    const lower = base.toLowerCase();
    out += lower.length === 1 ? lower : base;
  }
  return out;
}

/** Normalizovaný klíč pro porovnávání názvů (bez diakritiky, interpunkce a vícenásobných mezer). */
export function normalizeKey(input: string): string {
  return foldDiacritics(input)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function truncate(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…` : input;
}

/** Odstraní HTML značky z textu (Moodle popisy) a dekóduje základní entity. */
export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Kód předmětu ve stylu SIS (např. JSB065, NPRG030, AREP00029). */
export const SUBJECT_CODE_RE = /\b([A-Z]{2,5}\d{2,6}[A-Z]?)\b/;

export function extractSubjectCode(...sources: (string | undefined | null)[]): string | undefined {
  for (const s of sources) {
    if (!s) continue;
    const m = SUBJECT_CODE_RE.exec(s);
    if (m) return m[1];
  }
  return undefined;
}
