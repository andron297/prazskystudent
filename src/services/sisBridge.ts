/**
 * Most ze SISu: záložka (bookmarklet) otevře aplikaci na #/import a pošle
 * text otevřené stránky přes postMessage. Přijímáme jen zprávy z domén
 * Univerzity Karlovy (*.cuni.cz) a jen se správným tvarem dat.
 */
import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';

export interface SisPayload {
  url: string;
  title: string;
  text: string;
  receivedAt: string;
  origin: string;
}

export function isTrustedSisOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (url.hostname === 'cuni.cz' || url.hostname.endsWith('.cuni.cz'));
  } catch {
    return false;
  }
}

export function useSisBridge(): void {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string; title?: string; text?: string } | null;
      if (!data || data.type !== 'stihnu-sis' || typeof data.text !== 'string') return;
      if (!isTrustedSisOrigin(event.origin)) return;
      try {
        (event.source as Window | null)?.postMessage('stihnu-ok', event.origin);
      } catch {
        /* okno SISu mezitím zavřené */
      }
      const ui = useUiStore.getState();
      if (ui.sisImport && ui.sisImport.text === data.text) return;
      ui.setSisImport({
        url: String(data.url ?? ''),
        title: String(data.title ?? ''),
        text: data.text.slice(0, 400_000),
        receivedAt: new Date().toISOString(),
        origin: event.origin,
      });
      if (!window.location.hash.startsWith('#/import')) window.location.hash = '/import';
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
