import { useMemo, useSyncExternalStore } from 'react';
import { clockOffsetAt, useClockStore } from '../store/clockStore';

/* Jeden sdílený časovač pro celou aplikaci (místo setInterval v každé komponentě). */
const listeners = new Set<() => void>();
let tick = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    tick = Date.now();
    timer = setInterval(() => {
      tick = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Aktuální čas aplikace zaokrouhlený na `granularityMs` – komponenta se
 * překreslí jen při změně (např. jednou za minutu u seznamu termínů).
 */
export function useNow(granularityMs = 1000): Date {
  const offsetMs = useClockStore((s) => s.offsetMs);
  const speed = useClockStore((s) => s.speed);
  const speedFrom = useClockStore((s) => s.speedFrom);
  const clock = { offsetMs, speed, speedFrom };
  const bucket = useSyncExternalStore(
    subscribe,
    () => Math.floor((tick + clockOffsetAt(clock, tick)) / granularityMs),
    () => Math.floor((Date.now() + clockOffsetAt(clock, Date.now())) / granularityMs),
  );
  return useMemo(() => new Date(bucket * granularityMs), [bucket, granularityMs]);
}
