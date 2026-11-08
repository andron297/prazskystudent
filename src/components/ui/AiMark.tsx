/**
 * Značka „AI“ místo hvězdiček: písmena A a I v zaobleném rámečku. Chová se
 * jako ikona z lucide-react (velikost a barva přes className).
 */
import { forwardRef, type SVGProps } from 'react';
import type { LucideIcon } from 'lucide-react';

const AiMarkBase = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean }>(function AiMark({ size = 24, strokeWidth = 2, absoluteStrokeWidth: _abs, className, ...rest }, ref) {
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
      <rect x="2.5" y="3.5" width="19" height="17" rx="5" />
      <path d="M6.8 16.2 9.6 7.8h.8l2.8 8.4" />
      <path d="M7.9 13.1h4.2" />
      <path d="M16.6 7.8v8.4" />
    </svg>
  );
});

export const AiMark = AiMarkBase as unknown as LucideIcon;
