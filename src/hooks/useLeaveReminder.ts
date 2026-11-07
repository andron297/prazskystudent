/**
 * Upozornění „Za 5 minut vyraz“ a „Vyraz teď“ – lokální notifikace přes
 * service worker (funguje, i když je Stihnuto na pozadí, dokud je otevřené).
 * Každé upozornění se pošle nejvýš jednou pro daný spoj.
 */
import { useEffect } from 'react';
import type { Itinerary, ScheduleEvent } from '../types';
import { formatTime } from '../lib/dates';
import { rideLegs } from '../lib/transitPlanner';
import { useAppStore } from '../store/appStore';

const sent = new Set<string>();

async function notify(title: string, body: string, tag: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
    else new Notification(title, { body, tag });
  } catch {
    /* prohlížeč notifikaci odmítl */
  }
}

export function leaveMessage(it: Itinerary): string {
  const first = rideLegs(it)[0];
  if (!first) return `Pěšky ${it.walkToStopMinutes} min.`;
  const platform = first.platform ? `, nástupiště ${first.platform}` : '';
  return `${first.line} směr ${first.headsign} v ${formatTime(new Date(first.predictedDeparture))} ze zastávky ${first.fromStop}${platform}.`;
}

export function useLeaveReminder(event: ScheduleEvent | null | undefined, itinerary: Itinerary | null | undefined, now: Date): void {
  const enabled = useAppStore((s) => s.settings.notifyLeave);
  const mode = useAppStore((s) => s.settings.mode);
  useEffect(() => {
    if (!enabled || mode !== 'live' || !event || !itinerary) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const leave = new Date(itinerary.leaveAt).getTime();
    const left = leave - now.getTime();
    const base = `${event.id}|${itinerary.id}`;
    if (left <= 5 * 60_000 && left > 3 * 60_000 && !sent.has(`${base}|5`)) {
      sent.add(`${base}|5`);
      void notify(`Za 5 minut vyrazte – ${event.title}`, leaveMessage(itinerary), `leave-${event.id}`);
    } else if (left <= 30_000 && left > -90_000 && !sent.has(`${base}|0`)) {
      sent.add(`${base}|0`);
      void notify(`Vyrazte teď – ${event.title}`, leaveMessage(itinerary), `leave-${event.id}`);
    }
  }, [enabled, mode, event, itinerary, now]);
}
