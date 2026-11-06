/**
 * Hlídá konec úseku soustředění na celé aplikaci (ne jen na hlavní stránce):
 * cinkne, zavibruje, pošle upozornění (když je aplikace na pozadí) a přepne
 * na pauzu nebo další soustředění. Po návratu z uspání úsek uzavře jen jednou.
 */
import { useEffect } from 'react';
import { useFocusStore } from '../store/focusStore';
import { toast } from '../store/uiStore';

function chime(kind: 'focus' | 'break'): void {
  try {
    const ctx = new AudioContext();
    const notes = kind === 'focus' ? [659.25, 783.99, 987.77] : [783.99, 659.25];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.2);
    });
    setTimeout(() => void ctx.close(), 2000);
  } catch {
    /* bez zvuku */
  }
}

async function notify(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag: 'stihnu-focus', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
    else new Notification(title, { body, tag: 'stihnu-focus' });
  } catch {
    /* prohlížeč upozornění odmítl */
  }
}

export function useFocusTicker(): void {
  const endsAt = useFocusStore((s) => s.endsAt);
  useEffect(() => {
    if (!endsAt) return;
    const check = () => {
      const s = useFocusStore.getState();
      if (!s.endsAt || Date.now() < s.endsAt) return;
      const wasFocus = s.phase === 'focus';
      const late = Date.now() - s.endsAt > 2 * 60_000;
      s.finish();
      if (late) return; // aplikace byla zavřená – jen tiše zapsat
      if (s.sound) chime(wasFocus ? 'focus' : 'break');
      try {
        navigator.vibrate?.(wasFocus ? [180, 90, 180] : [120]);
      } catch {
        /* bez vibrace */
      }
      const next = useFocusStore.getState();
      const title = wasFocus ? 'Hotovo, dejte si pauzu' : 'Pauza končí';
      const body = wasFocus ? (next.phase === 'long' ? 'Sada je hotová – dlouhá pauza.' : 'Protáhněte se a napijte se.') : 'Další blok soustředění.';
      if (document.visibilityState === 'hidden') void notify(title, body);
      else toast.success(`${title}. ${body}`);
    };
    check();
    const t = setInterval(check, 1000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endsAt]);
}
