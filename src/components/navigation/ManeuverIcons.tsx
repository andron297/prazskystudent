/**
 * Vlastní ikony pokynů, které knihovna ikon nemá: přechod (zebra), schody
 * nahoru/dolů, eskalátor, výtah a vstup do metra. Stejná mřížka 24 × 24
 * a tloušťka čáry jako ostatní ikony navigace.
 */
import type { ReactNode } from 'react';

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

/** Přechod pro chodce: pruhy zebry mezi obrubníky. */
export function CrossingIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 4.5h18M3 19.5h18" />
      <path d="M6 8v8M10 8v8M14 8v8M18 8v8" strokeWidth={2.6} />
    </Svg>
  );
}

export function StairsDownIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 7h4v4h4v4h4v4h6" />
      <path d="M17 4v8M14 9l3 3 3-3" />
    </Svg>
  );
}

export function StairsUpIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 19h4v-4h4v-4h4V7h6" />
      <path d="M8 12V4M5 7l3-3 3 3" />
    </Svg>
  );
}

export function StairsIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M3 19h4v-4h4v-4h4V7h4V3" />
    </Svg>
  );
}

/** Eskalátor: šikmý pás se zábradlím a šipkou směru. */
export function EscalatorIcon({ className, dir }: { className?: string; dir?: 'up' | 'down' }) {
  return (
    <Svg className={className}>
      <path d="M3 19h4.5l9-11H21" />
      <path d="M3 15.5h3l9-11h3" opacity={0.55} />
      {dir === 'down' && <path d="M8 6v5M5.5 8.5 8 11l2.5-2.5" />}
      {dir === 'up' && <path d="M17 18v-5M14.5 15.5 17 13l2.5 2.5" />}
    </Svg>
  );
}

/** Výtah: kabina se šipkou nahoru nebo dolů. */
export function ElevatorIcon({ className, dir }: { className?: string; dir?: 'up' | 'down' }) {
  return (
    <Svg className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M12 3v18" opacity={0.55} />
      {dir !== 'down' && <path d="m6.5 10.5 2.5-3 2.5 3" transform="translate(-1 0)" />}
      {dir !== 'up' && <path d="m12.5 13.5 2.5 3 2.5-3" transform="translate(1 0)" />}
    </Svg>
  );
}

/** Metro: písmeno M ve čtverci se zaoblenými rohy (jako značení stanic). */
export function MetroIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M7.5 16.5v-9l4.5 6 4.5-6v9" />
    </Svg>
  );
}
