/**
 * Veřejné stránky předmětů v SISu (sylabus, podmínky, literatura) – stejné,
 * jaké vidí kdokoli bez přihlášení. Aplikace se poctivě identifikuje, ptá se
 * jen na jednu stránku předmětu (případně jedno hledání podle názvu) a výsledek
 * se cachuje na den, aby SIS zbytečně nezatěžovala.
 */
import { HttpError, errorResponse, json, methodNotAllowed } from './http.js';
import { readTextLimited } from './security.js';

const BASE = 'https://is.cuni.cz/studium/predmety/index.php';
const USER_AGENT = 'Stihnu/2.0 (studijni aplikace; +https://prazskystudent.vercel.app)';

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
    if (!code && (name.length < 3 || name.length > 120)) throw new HttpError(400, 'missing_subject', 'Zadej kód předmětu nebo jeho název.');

    let candidates: string[] = [];
    if (!code) {
      const page = await getPage({ do: 'search', nazev: name.slice(0, 55), match: 'substring', srch_nazev: '1', b: 'Hledej' });
      candidates = [...new Set([...page.matchAll(/(?:do|redir)=predmet&(?:amp;)?kod=([A-Z0-9]{3,12})/g)].map((m) => m[1]))].slice(0, 5);
      if (candidates.length === 0) throw new HttpError(404, 'sis_not_found', `Předmět „${name}“ jsem v SISu nenašel.`);
      code = candidates[0];
    }
    const html = await getPage({ do: 'predmet', kod: code });
    const text = subjectSection(htmlToText(html));
    if (!text.includes(code)) throw new HttpError(404, 'sis_not_found', `Předmět ${code} v SISu není.`);
    return json(
      { code, url: `${BASE}?do=predmet&kod=${code}`, text, candidates },
      200,
      { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
