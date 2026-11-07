/**
 * Kde se akce z kalendáře koná: budova školy (podle učebny a adres), jinak
 * dohledané místo podle textu „Místo“ (adresa, kavárna, tělocvična…). Dohledává
 * se jen jednou a výsledek se pamatuje v tomto zařízení.
 */
import { useEffect, useState } from 'react';
import type { LatLng, ScheduleEvent, Settings } from '../types';
import { buildingForEvent } from '../store/selectors';
import { geocode } from './journey';

export interface EventPlace {
  label: string;
  coords: LatLng;
  detail?: string;
  kind: 'building' | 'place';
}

const KEY = 'stihnu:event-places';
let memo: Record<string, EventPlace | null> | null = null;

function load(): Record<string, EventPlace | null> {
  if (memo) return memo;
  try {
    memo = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, EventPlace | null>;
  } catch {
    memo = {};
  }
  return memo!;
}

function save(): void {
  try {
    const entries = Object.entries(load()).slice(-200);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* plné úložiště nevadí */
  }
}

/** Text místa, který má smysl hledat (ne „online“, „Zoom“, „Teams“…). */
export function searchableLocation(location: string | undefined): string | null {
  const text = (location ?? '').trim();
  if (text.length < 4) return null;
  if (/^(online|zoom|teams|ms teams|google meet|meet|webex|discord|distančně|doma)\b/i.test(text) || /https?:\/\//i.test(text)) return null;
  return text.slice(0, 80);
}

/** Místo akce hned (bez dohledávání): budova školy, nebo už dřív dohledané místo. */
export function knownEventPlace(event: ScheduleEvent, settings: Settings): EventPlace | null {
  if (event.online) return null;
  const { building } = buildingForEvent(event, settings);
  if (building) return { label: building.name, coords: building.coords, detail: building.address, kind: 'building' };
  const text = searchableLocation(event.location);
  return text ? (load()[text.toLowerCase()] ?? null) : null;
}

/** Dohledá místo akce podle textu (jednou; výsledek se pamatuje). */
export async function resolveEventPlace(event: ScheduleEvent, settings: Settings): Promise<EventPlace | null> {
  const known = knownEventPlace(event, settings);
  if (known) return known;
  const text = searchableLocation(event.location);
  if (!text) return null;
  const key = text.toLowerCase();
  const cache = load();
  if (key in cache) return cache[key];
  try {
    const hits = await geocode(text);
    const hit = hits.find((h) => h.kind !== 'stop') ?? hits[0];
    cache[key] = hit ? { label: hit.label, coords: hit.coords, detail: hit.detail, kind: 'place' } : null;
  } catch {
    return null;
  }
  save();
  return cache[key];
}

/** Místo akce pro komponentu (nejdřív známé, pak dohledané). */
export function useEventPlace(event: ScheduleEvent | null, settings: Settings): EventPlace | null {
  const [place, setPlace] = useState<EventPlace | null>(() => (event ? knownEventPlace(event, settings) : null));
  useEffect(() => {
    if (!event) {
      setPlace(null);
      return;
    }
    let alive = true;
    setPlace(knownEventPlace(event, settings));
    void resolveEventPlace(event, settings).then((p) => alive && setPlace(p));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, event?.location, settings.buildings, settings.locationAliases]);
  return place;
}
