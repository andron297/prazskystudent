/**
 * Vlastní ikony Stihnuta – kreslené na mřížce 24 × 24, jednotná tloušťka čáry,
 * zaoblené konce a jemná výplň (duotón) v barvě motivu. Žádná emoji.
 */
import type { ReactNode } from 'react';
import { cn } from './primitives';

export type GlyphName =
  | 'home'
  | 'calendar'
  | 'tram'
  | 'pin'
  | 'building'
  | 'cap'
  | 'book'
  | 'note'
  | 'bell'
  | 'spark'
  | 'weather'
  | 'lock'
  | 'key'
  | 'timer'
  | 'hourglass'
  | 'plate'
  | 'compass'
  | 'palette'
  | 'link'
  | 'phone'
  | 'route'
  | 'user'
  | 'flask'
  | 'doc'
  | 'download'
  | 'sliders'
  | 'shield'
  | 'gear'
  | 'sun'
  | 'moon'
  | 'clock'
  | 'crosshair'
  | 'walk';

/** Jemná výplň (druhý tón). */
const soft = (d: string) => <path d={d} fill="currentColor" fillOpacity={0.16} stroke="none" />;

const GLYPHS: Record<GlyphName, ReactNode> = {
  home: (
    <>
      {soft('M4.5 10.6 12 4.5l7.5 6.1V20h-15z')}
      <path d="M3.5 11.3 12 4.5l8.5 6.8" />
      <path d="M5.5 9.8V20h13V9.8" />
      <path d="M10 20v-5.2h4V20" />
    </>
  ),
  calendar: (
    <>
      {soft('M4 9h16V7.5A2.5 2.5 0 0 0 17.5 5h-11A2.5 2.5 0 0 0 4 7.5z')}
      <rect x="4" y="5" width="16" height="15.5" rx="2.6" />
      <path d="M4 9.5h16M8.5 3v4M15.5 3v4" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" strokeWidth={2.4} />
    </>
  ),
  tram: (
    <>
      {soft('M8 7.5h8a1.5 1.5 0 0 1 1.5 1.5v3H6.5V9A1.5 1.5 0 0 1 8 7.5z')}
      <rect x="5.5" y="5.5" width="13" height="13" rx="3" />
      <path d="M6.5 12h11M9 2.8 12 5.5l3-2.7M8.5 18.5 7 21M15.5 18.5 17 21" />
      <path d="M9 15.3h.01M15 15.3h.01" strokeWidth={2.6} />
    </>
  ),
  pin: (
    <>
      {soft('M12 21s-6.5-5.7-6.5-11.1a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z')}
      <path d="M12 21s-6.5-5.7-6.5-11.1a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z" />
      <circle cx="12" cy="9.8" r="2.4" />
    </>
  ),
  building: (
    <>
      {soft('M4 9.3 12 4.5l8 4.8z')}
      <path d="M3.5 9.5 12 4.5l8.5 5H3.5zM6.5 12v5.5M10.2 12v5.5M13.8 12v5.5M17.5 12v5.5M4.5 20h15M3.5 20.5h17" />
    </>
  ),
  cap: (
    <>
      {soft('M2.8 9.4 12 5l9.2 4.4L12 13.8z')}
      <path d="M2.8 9.4 12 5l9.2 4.4L12 13.8z" />
      <path d="M6.5 11.6v4c0 1.5 2.5 2.9 5.5 2.9s5.5-1.4 5.5-2.9v-4M21.2 9.4v5.4" />
    </>
  ),
  book: (
    <>
      {soft('M12 6.8C10 5.3 7 4.8 3.8 5.2v12.6c3.2-.4 6.2.1 8.2 1.6z')}
      <path d="M12 6.8C10 5.3 7 4.8 3.8 5.2v12.6c3.2-.4 6.2.1 8.2 1.6 2-1.5 5-2 8.2-1.6V5.2C17 4.8 14 5.3 12 6.8zM12 6.8v12.6" />
    </>
  ),
  note: (
    <>
      <path d="M9.5 17.5V6.6l9-1.9v10.8" />
      {soft('M9.5 9.3l9-1.9V4.7l-9 1.9z')}
      <circle cx="7.2" cy="17.6" r="2.3" />
      <circle cx="16.2" cy="15.6" r="2.3" />
    </>
  ),
  bell: (
    <>
      {soft('M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z')}
      <path d="M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14zM10 20.5a2.1 2.1 0 0 0 4 0M12 4V3" />
    </>
  ),
  spark: (
    <>
      {soft('M11 3.5c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7z')}
      <path d="M11 3.5c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7z" />
      <path d="M18.5 15.5c.2 1.6 1 2.4 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.1 2.3-.9 2.5-2.5z" />
    </>
  ),
  weather: (
    <>
      {soft('M8.2 19.5h9a3.5 3.5 0 0 0 .4-7 4.8 4.8 0 0 0-9.2-.6A3.8 3.8 0 0 0 8.2 19.5z')}
      <path d="M8.2 19.5h9a3.5 3.5 0 0 0 .4-7 4.8 4.8 0 0 0-9.2-.6A3.8 3.8 0 0 0 8.2 19.5z" />
      <path d="M6.6 9.2a3 3 0 0 1 4.8-2.6M7.8 3.5v1.2M3.3 8.3h1.2M4.6 5l.8.8" />
    </>
  ),
  lock: (
    <>
      {soft('M5.5 10.5h13v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z')}
      <rect x="5.5" y="10.5" width="13" height="10" rx="2.2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.2" />
    </>
  ),
  key: (
    <>
      {soft('M8 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z')}
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12h9M17 12v3M19.8 12v2.2" />
    </>
  ),
  timer: (
    <>
      {soft('M12 13.5V7.2a6.3 6.3 0 0 1 6.3 6.3z')}
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V9.8M10 3.5h4M12 3.5v3M18.4 6.4l1.2-1.2" />
    </>
  ),
  hourglass: (
    <>
      {soft('M12 15.2c-1.6 1-3.6 2.3-3.9 4.8h7.8c-.3-2.5-2.3-3.8-3.9-4.8z')}
      <path d="M7 3.5h10M7 20.5h10M8 3.5c0 3.8 4 5.3 4 8.5s-4 4.7-4 8.5M16 3.5c0 3.8-4 5.3-4 8.5s4 4.7 4 8.5" />
    </>
  ),
  plate: (
    <>
      {soft('M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z')}
      <circle cx="12" cy="12" r="5.5" />
      <path d="M3 4v4.5a1.5 1.5 0 0 0 3 0V4M4.5 9.5V20M21 4c-1.6.8-2.5 2.8-2.5 5.5v2.5H21M21 4v16" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      {soft('M15.4 8.6 13.4 13.4 8.6 15.4 10.6 10.6z')}
      <path d="M15.4 8.6 13.4 13.4 8.6 15.4 10.6 10.6z" />
    </>
  ),
  palette: (
    <>
      {soft('M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.3-1.7-1.3-3 0-1 .8-1.7 1.8-1.7h2.3c2.2 0 3.7-1.6 3.7-3.8C20.5 6.6 16.7 3.5 12 3.5z')}
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.3-1.7-1.3-3 0-1 .8-1.7 1.8-1.7h2.3c2.2 0 3.7-1.6 3.7-3.8C20.5 6.6 16.7 3.5 12 3.5z" />
      <path d="M8 11h.01M10.5 7.5h.01M15 7.8h.01" strokeWidth={2.8} />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  phone: (
    <>
      {soft('M8 3h8a1.5 1.5 0 0 1 1.5 1.5V7h-11V4.5A1.5 1.5 0 0 1 8 3z')}
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
      <path d="M10.5 18h3" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2" />
      {soft('M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z')}
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h5.5a3 3 0 0 0 0-6h-3a3 3 0 0 1 0-6H16" />
    </>
  ),
  user: (
    <>
      {soft('M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z')}
      <circle cx="12" cy="8.4" r="3.6" />
      <path d="M5 20c.4-3.6 3.3-6 7-6s6.6 2.4 7 6" />
    </>
  ),
  flask: (
    <>
      {soft('M7.6 15h8.8l2.3 4.2a1.3 1.3 0 0 1-1.1 1.8H6.4a1.3 1.3 0 0 1-1.1-1.8z')}
      <path d="M9.5 3.5h5M10.5 3.5v6L5.3 19.2a1.3 1.3 0 0 0 1.1 1.8h11.2a1.3 1.3 0 0 0 1.1-1.8L13.5 9.5v-6M7.6 15h8.8" />
    </>
  ),
  doc: (
    <>
      {soft('M14 3.5V8h4.5z')}
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M9 12.5h6M9 16h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
      {soft('M4.5 16.5h15v1.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z')}
      <path d="M4.5 15.5v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      {soft('M15 9.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM9 19.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z')}
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  gear: (
    <>
      {soft('M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z')}
      <path d="M10.3 3.6h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.8l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9 1.8-1.6v-1.8L4.2 9l1.7-2.9 2.3.8 1.6-.9z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  shield: (
    <>
      {soft('M12 3.5 5 6.2v5.3c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6.2z')}
      <path d="M12 3.5 5 6.2v5.3c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6.2z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  sun: (
    <>
      {soft('M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z')}
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v1.7M12 19.5v1.7M2.8 12h1.7M19.5 12h1.7M5.5 5.5l1.2 1.2M17.3 17.3l1.2 1.2M5.5 18.5l1.2-1.2M17.3 6.7l1.2-1.2" />
    </>
  ),
  moon: (
    <>
      {soft('M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z')}
      <path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z" />
      <path d="M16.5 4v2.4M15.3 5.2h2.4" />
    </>
  ),
  clock: (
    <>
      {soft('M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z')}
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  crosshair: (
    <>
      {soft('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z')}
      <circle cx="12" cy="12" r="6.8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4" />
    </>
  ),
  walk: (
    <>
      {soft('M13.2 6.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8z')}
      <circle cx="13.2" cy="4.7" r="1.9" />
      <path d="m9.4 21 2.2-6.3 2.7 2.5V21M11.6 14.7l.9-5.1M12.5 9.6 9.3 11l-1 3.2M12.5 9.6l2.2 2.6 2.9 1.1" />
    </>
  ),
};

export function Glyph({ name, size = 22, className, strokeWidth = 1.75 }: { name: GlyphName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={cn('shrink-0', className)} aria-hidden>
      {GLYPHS[name]}
    </svg>
  );
}

/** Ikona v jemné dlaždici – pro seznamy (propojení, nastavení, průvodce). */
export function GlyphTile({ name, size = 44, tone = 'accent', className }: { name: GlyphName; size?: number; tone?: 'accent' | 'muted' | 'warn' | 'light'; className?: string }) {
  const tones = {
    accent: 'bg-accent-soft text-accent ring-accent/15',
    muted: 'bg-surface-2 text-muted ring-line',
    warn: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300',
    light: 'bg-white/12 text-white ring-white/20',
  } as const;
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-[14px] ring-1 ring-inset', tones[tone], className)} style={{ width: size, height: size }}>
      <Glyph name={name} size={Math.round(size * 0.52)} />
    </span>
  );
}
