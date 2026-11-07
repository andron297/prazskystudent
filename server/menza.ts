/**
 * Jídelníčky menz Univerzity Karlovy (Koleje a menzy UK, systém Septim).
 * Používá stejné veřejné rozhraní jako web jídelníčků pro nepřihlášené
 * návštěvníky (anonymní relace, jen čtení). Ptáme se střídmě: relace i
 * jídelníčky se cachují a proxy přijímá jen známá ID menz a krátké období.
 */
import { HttpError, errorResponse, json, methodNotAllowed } from './http.js';
import { readTextLimited } from './security.js';

const API = 'https://kam-septim-fe.is.cuni.cz/webcarecanteenapiweb';
const USER_AGENT = 'Stihnuto/2.4 (studijni aplikace, open source; +https://github.com/andron297/prazskystudent)';

/** ID menz v Septimu → název (seznam se mění zřídka; neznámá ID proxy odmítne). */
export const CANTEENS: Record<number, string> = {
  22: 'Menza Jinonice',
  16: 'Menza Kajetánka',
  25: 'Menza Malostranská',
  1: 'Menza Jednota',
  11: 'Menza Právnická',
  12: 'Menza Albertov',
  13: 'Kavárna U Rotlevů',
  9: 'Menza Arnošta z Pardubic',
  14: 'Menza Budeč',
  26: 'Menza Na Kotli (Hradec Králové)',
  17: 'Menza Troja',
  27: 'Mephared 2 (Hradec Králové)',
  20: 'Výdejna HTF',
  15: 'Výdejna Hvězda',
};

interface RawItem {
  date?: string;
  group?: string;
  name?: string;
  price?: number;
  otherPrices?: { categoryKey?: string; price?: number }[];
  product?: { name?: string; allergens?: { shortName?: string; longName?: string }[]; nutritionalInfo?: { energy?: { totalKcal?: number } } };
}

export interface MenzaDish {
  kind: 'soup' | 'main';
  /** „Menu 3 – Vegetarián“ apod. */
  label: string;
  name: string;
  /** Cena pro studenty (Kč). */
  student?: number;
  /** Cena pro ostatní (Kč). */
  full?: number;
  allergens: string[];
  kcal?: number;
  vegetarian: boolean;
  vegan: boolean;
}

export interface MenzaCanteen {
  id: number;
  name: string;
  days: { date: string; dishes: MenzaDish[] }[];
}

let session: { token: string; at: number } | null = null;
const cache = new Map<string, { at: number; data: MenzaCanteen[] }>();
const CACHE_MS = 30 * 60_000;

async function sessionToken(force = false): Promise<string> {
  if (!force && session && Date.now() - session.at < 20 * 60_000) return session.token;
  const response = await fetch(`${API}/core/1.0/sessionStart`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': USER_AGENT },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new HttpError(502, 'menza_unavailable', 'Jídelníčky menz teď nejsou dostupné.');
  const data = JSON.parse(await readTextLimited(response, 20_000)) as { sessionToken?: string };
  if (!data.sessionToken) throw new HttpError(502, 'menza_unavailable', 'Jídelníčky menz teď nejsou dostupné.');
  session = { token: data.sessionToken, at: Date.now() };
  return session.token;
}

function normalize(raw: RawItem): MenzaDish | null {
  const name = raw.product?.name?.trim();
  if (!name) return null;
  const label = (raw.name ?? '').replace(/\s+-\s+/g, ' – ').trim();
  const lower = label.toLowerCase();
  return {
    kind: raw.group === 'Polévka' ? 'soup' : 'main',
    label: label || (raw.group ?? ''),
    name,
    student: raw.otherPrices?.find((p) => p.categoryKey === 'student')?.price,
    full: raw.price,
    allergens: (raw.product?.allergens ?? []).map((a) => a.shortName ?? '').filter(Boolean),
    kcal: raw.product?.nutritionalInfo?.energy?.totalKcal,
    vegetarian: lower.includes('vegetari') || lower.includes('vegan'),
    vegan: lower.includes('vegan'),
  };
}

async function fetchMenus(ids: number[], from: string, to: string): Promise<MenzaCanteen[]> {
  const load = async (token: string) =>
    fetch(`${API}/canteen/1.0/menuBoard?canteenIds=${ids.join(',')}&from=${from}&to=${to}`, {
      headers: { accept: 'application/json', 'x-session-token': token, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    });
  let response = await load(await sessionToken());
  if (response.status === 400 || response.status === 401 || response.status === 403) response = await load(await sessionToken(true));
  if (!response.ok) throw new HttpError(502, 'menza_unavailable', `Jídelníčky menz teď nejsou dostupné (HTTP ${response.status}).`);
  const raw = JSON.parse(await readTextLimited(response, 2_000_000)) as { canteenId?: number; menu?: RawItem[] }[];
  return ids.map((id) => {
    const entry = raw.find((c) => c.canteenId === id);
    const byDate = new Map<string, MenzaDish[]>();
    for (const item of entry?.menu ?? []) {
      const dish = normalize(item);
      if (!dish || !item.date) continue;
      byDate.set(item.date, [...(byDate.get(item.date) ?? []), dish]);
    }
    return {
      id,
      name: CANTEENS[id],
      days: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dishes]) => ({ date, dishes: dishes.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'soup' ? -1 : 1)) })),
    };
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleMenza(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('list') === '1') {
      return json({ canteens: Object.entries(CANTEENS).map(([id, name]) => ({ id: Number(id), name })) }, 200, { 'cache-control': 'public, max-age=86400' });
    }
    const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').map(Number))].filter((id) => Number.isInteger(id) && CANTEENS[id]).slice(0, 4);
    if (ids.length === 0) throw new HttpError(400, 'bad_canteen', 'Vyberte aspoň jednu menzu.');
    const today = new Date().toISOString().slice(0, 10);
    const from = DATE.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : today;
    const days = Math.min(7, Math.max(1, Number(url.searchParams.get('days') ?? '6') || 6));
    const fromDate = new Date(`${from}T12:00:00Z`);
    if (Math.abs(fromDate.getTime() - Date.now()) > 14 * 86_400_000) throw new HttpError(400, 'bad_date', 'Jídelníček je jen na nejbližší dny.');
    const to = new Date(fromDate.getTime() + (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const key = `${ids.sort((a, b) => a - b).join(',')}|${from}|${to}`;
    const hit = cache.get(key);
    const data = hit && Date.now() - hit.at < CACHE_MS ? hit.data : await fetchMenus(ids, from, to);
    if (!hit || hit.data !== data) {
      cache.set(key, { at: Date.now(), data });
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
    }
    return json({ canteens: data, source: 'Koleje a menzy UK (Septim)', fetchedAt: new Date().toISOString() }, 200, { 'cache-control': 'public, s-maxage=1800, stale-while-revalidate=3600' });
  } catch (error) {
    return errorResponse(error);
  }
}
