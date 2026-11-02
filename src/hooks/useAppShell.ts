import { useCallback, useEffect, useState } from 'react';
import type { ThemePref } from '../types';

/* ------------------------------------------------------------------ */
/* Motiv                                                               */
/* ------------------------------------------------------------------ */

function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function useThemeEffect(pref: ThemePref): 'light' | 'dark' {
  const [resolved, setResolved] = useState(() => resolveTheme(pref));
  useEffect(() => {
    const apply = () => {
      const next = resolveTheme(pref);
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', next === 'dark' ? '#0b110d' : '#eeeae0'));
    };
    apply();
    if (pref !== 'system') return;
    let media: MediaQueryList | null = null;
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', apply);
    } catch {
      media = null;
    }
    return () => media?.removeEventListener('change', apply);
  }, [pref]);
  return resolved;
}

/* ------------------------------------------------------------------ */
/* Hash routing (#/dnes, #/predmety/<id>, #/harmonogram, #/integrace)  */
/* ------------------------------------------------------------------ */

export type View = 'dnes' | 'doprava' | 'predmety' | 'kalendar' | 'propojeni' | 'import';

const VIEWS: View[] = ['dnes', 'doprava', 'predmety', 'kalendar', 'propojeni', 'import'];
/** Staré adresy z první verze. */
const ALIASES: Record<string, View> = { harmonogram: 'kalendar', integrace: 'propojeni', nastaveni: 'propojeni', mapa: 'doprava' };

function parseHash(): { view: View; param?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [first, param] = raw.split('/');
  const view = (ALIASES[first] ?? first) as View;
  return VIEWS.includes(view) ? { view, param: param ? decodeURIComponent(param) : undefined } : { view: 'dnes' };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((view: View, param?: string) => {
    window.location.hash = `/${view}${param ? `/${encodeURIComponent(param)}` : ''}`;
  }, []);
  return { ...route, navigate };
}

export function navigateTo(view: View, param?: string): void {
  window.location.hash = `/${view}${param ? `/${encodeURIComponent(param)}` : ''}`;
}

/** Skutečně použitý motiv (sleduje atribut data-theme na <html>). */
export function useResolvedTheme(): 'light' | 'dark' {
  const read = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  const [theme, setTheme] = useState<'light' | 'dark'>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
