/**
 * Veřejné stránky předmětů v SISu (sylabus, podmínky, literatura) – stejné,
 * jaké vidí kdokoli bez přihlášení. Aplikace se poctivě identifikuje, ptá se
 * jen na jednu stránku předmětu (případně jedno hledání podle názvu) a výsledek
 * se cachuje na den, aby SIS zbytečně nezatěžovala.
 */
import { HttpError, errorResponse, json, methodNotAllowed } from './http.js';
import { readTextLimited } from './security.js';

const BASE = 'https://is.cuni.cz/studium/predmety/index.php';
const USER_AGENT = 'Stihnuto/2.0 (studijni aplikace; +https://prazskystudent.vercel.app)';

async function getPage(params: Record<string, string>): Promise<string> {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' }, signal: AbortSignal.timeout(12_000), redirect: 'follow' });
  if (!response.ok) throw new HttpError(502, 'sis_http_error', `SIS odpověděl chybou HTTP ${response.status}.`);
  const finalUrl = new URL(response.url);
  if (finalUrl.hostname !== 'is.cuni.cz') throw new HttpError(502, 'sis_redirect', 'SIS přesměroval mimo is.cuni.cz.');
  return readTextLimited(response, 2_000_000);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** HTML → čitelný text po řádcích (stejně jako innerText v prohlížeči). */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table|th|ul|ol)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? m;
    });
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export interface SisMatch {
  code: string;
  name?: string;
}

const oneLine = (html: string) => htmlToText(html).replace(/\s+/g, ' ').trim();

/**
 * Výsledky hledání v SISu: kódy předmětů v pořadí, jak je SIS vrátil, a k nim
 * název (text odkazu, nebo buňka hned za kódem).
 */
export function parseSearchMatches(html: string, limit = 8): SisMatch[] {
  const names = new Map<string, string | undefined>();
  const anchor = /<a\b[^>]*?(?:do|redir)=predmet&(?:amp;)?kod=([A-Z0-9]{3,12})\b[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(anchor)) {
    const code = m[1];
    if (!names.has(code)) names.set(code, undefined);
    const text = oneLine(m[2]);
    if (!names.get(code) && text && text.toUpperCase() !== code && text.length <= 160) names.set(code, text);
  }
  for (const [code, name] of names) {
    if (name) continue;
    const cell = new RegExp(`kod=${code}\\b[^>]*>[\\s\\S]*?<\\/a>\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`).exec(html)?.[1];
    const text = cell ? oneLine(cell) : '';
    if (text && text.length <= 160 && !/^[A-Z0-9]{3,12}$/.test(text)) names.set(code, text);
  }
  return [...names].slice(0, limit).map(([code, name]) => (name ? { code, name } : { code }));
}

function subjectSection(text: string): string {
  const start = text.indexOf('Popis předmětu');
  const end = text.indexOf('\nKontakty', Math.max(0, start));
  return text.slice(start >= 0 ? start : 0, end > 0 ? end : undefined);
}

export async function handleSis(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const params = new URL(request.url).searchParams;
    let code = (params.get('kod') ?? '').trim().toUpperCase();
    const name = (params.get('nazev') ?? '').trim();
    if (code && !/^[A-Z0-9]{3,12}$/.test(code)) throw new HttpError(400, 'bad_code', 'Neplatný kód předmětu.');
    if (!code && (name.length < 3 || name.length > 120)) throw new HttpError(400, 'missing_subject', 'Zadejte kód předmětu nebo jeho název.');

    let matches: SisMatch[] = [];
    if (!code) {
      const page = await getPage({ do: 'search', nazev: name.slice(0, 55), match: 'substring', srch_nazev: '1', b: 'Hledej' });
      matches = parseSearchMatches(page);
      if (matches.length === 0) throw new HttpError(404, 'sis_not_found', `Předmět „${name}“ jsem v SISu nenašel.`);
      code = matches[0].code;
    }
    const candidates = matches.map((m) => m.code);
    const html = await getPage({ do: 'predmet', kod: code });
    const text = subjectSection(htmlToText(html));
    if (!text.includes(code)) throw new HttpError(404, 'sis_not_found', `Předmět ${code} v SISu není.`);
    return json(
      { code, url: `${BASE}?do=predmet&kod=${code}`, text, candidates, matches },
      200,
      { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
