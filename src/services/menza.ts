/**
 * Jídelníčky menz UK přes náš server (/api/menza). Drží se 30 minut v paměti
 * i v localStorage, takže karta se ukáže hned i bez sítě (poslední známý stav).
 */
import { useEffect, useState } from 'react';
import { requestJson } from './http';

export interface MenzaDish {
  kind: 'soup' | 'main';
  label: string;
  name: string;
  student?: number;
  full?: number;
  allergens: string[];
  kcal?: number;
  vegetarian: boolean;
  vegan: boolean;
}

export interface MenzaCanteenMenu {
  id: number;
  name: string;
  days: { date: string; dishes: MenzaDish[] }[];
}

interface MenzaResponse {
  canteens: MenzaCanteenMenu[];
  source: string;
  fetchedAt: string;
}

const TTL = 30 * 60_000;
const memory = new Map<string, MenzaResponse>();

function storageKey(key: string) {
  return `stihnu:menza:${key}`;
}

function cached(key: string, maxAge: number): MenzaResponse | null {
  const fresh = (r: MenzaResponse | null | undefined) => r && Date.now() - new Date(r.fetchedAt).getTime() < maxAge;
  const hit = memory.get(key);
  if (fresh(hit)) return hit!;
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (raw) {
      const parsed = JSON.parse(raw) as MenzaResponse;
      if (fresh(parsed)) {
        memory.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    /* nedostupné úložiště */
  }
  return null;
}

export async function fetchMenza(ids: number[], from: string, days = 14): Promise<MenzaResponse> {
  const key = `${[...ids].sort((a, b) => a - b).join(',')}|${from}|${days}`;
  const hit = cached(key, TTL);
  if (hit) return hit;
  const data = await requestJson<MenzaResponse>(`/api/menza?ids=${ids.join(',')}&from=${from}&days=${days}`, { timeoutMs: 15_000 });
  memory.set(key, data);
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(data));
  } catch {
    /* plné úložiště nevadí */
  }
  return data;
}

export function useMenza(ids: number[], from: string, enabled = true): { data: MenzaResponse | null; error: string | null; loading: boolean } {
  const idsKey = ids.join(',');
  const [state, setState] = useState<{ data: MenzaResponse | null; error: string | null; loading: boolean }>(() => ({ data: cached(`${[...ids].sort((a, b) => a - b).join(',')}|${from}|14`, 24 * 3_600_000), error: null, loading: false }));
  useEffect(() => {
    if (!enabled || !idsKey) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetchMenza(idsKey.split(',').map(Number), from)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error: Error) => alive && setState((s) => ({ data: s.data, error: error.message || 'Jídelníček se nepodařilo načíst.', loading: false })));
    return () => {
      alive = false;
    };
  }, [idsKey, from, enabled]);
  return state;
}
