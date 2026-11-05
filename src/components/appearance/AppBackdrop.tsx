/**
 * Vlastní pozadí aplikace: fotka z galerie nebo vlastní fotka pod celou
 * aplikací, ztlumená barvou podkladu, aby text zůstal dobře čitelný.
 */
import { useEffect } from 'react';
import { applyAppearance, photoUrl, resolveAppearance } from '../../lib/appearance';
import { useResolvedTheme } from '../../hooks/useAppShell';
import { useLocalImage } from '../../hooks/useLocalImage';
import { useAppStore } from '../../store/appStore';

export function useAppearanceEffect() {
  const appearance = useAppStore((s) => s.settings.appearance);
  const theme = useResolvedTheme();
  useEffect(() => {
    applyAppearance(resolveAppearance(appearance), theme);
  }, [appearance, theme]);
}

export function AppBackdrop() {
  const a = resolveAppearance(useAppStore((s) => s.settings.appearance));
  const upload = useLocalImage('background', a.background === 'upload');
  const src = a.background === 'photo' ? photoUrl(a.backgroundPhoto ?? 'hrad-vecer', 'full') : a.background === 'upload' ? upload : null;
  const on = Boolean(src);
  useEffect(() => {
    const root = document.documentElement;
    if (on) root.setAttribute('data-backdrop', 'on');
    else root.removeAttribute('data-backdrop');
  }, [on]);
  if (!src) return null;
  const dim = Math.min(0.92, Math.max(0.15, a.backgroundDim ?? 0.55));
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img src={src} alt="" className="size-full scale-105 object-cover" decoding="async" />
      <div className="absolute inset-0" style={{ background: `color-mix(in oklab, var(--canvas) ${Math.round(dim * 100)}%, transparent)` }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, transparent 40%, color-mix(in oklab, var(--canvas) 55%, transparent) 100%)' }} />
    </div>
  );
}
