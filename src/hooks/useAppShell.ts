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
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', next === 'dark' ? '#0a0c11' : '#f3f4f8'));
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

export type View = 'dnes' | 'predmety' | 'harmonogram' | 'integrace';

const VIEWS: View[] = ['dnes', 'predmety', 'harmonogram', 'integrace'];

function parseHash(): { view: View; param?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [view, param] = raw.split('/');
  return VIEWS.includes(view as View) ? { view: view as View, param: param ? decodeURIComponent(param) : undefined } : { view: 'dnes' };
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
