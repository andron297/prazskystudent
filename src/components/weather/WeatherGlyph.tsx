/**
 * Ikony počasí kreslené na míru: plastické slunce, měsíc, mraky, kapky,
 * vločky a blesk s přechody a odlesky (místo plochých ikon).
 */
import { useId } from 'react';
import { weatherKind, type WeatherKind } from '../../lib/weather';
import { cn } from '../ui/primitives';

const CLOUD = 'M17 47h31.5a11 11 0 0 0 1.4-21.9A14.5 14.5 0 0 0 22.4 21 10.6 10.6 0 0 0 17 47Z';
const CLOUD_SMALL = 'M33 33h17a7 7 0 0 0 .9-13.9 9.4 9.4 0 0 0-17.6-2.6A6.9 6.9 0 0 0 33 33Z';

function Defs({ p }: { p: string }) {
  return (
    <defs>
      <radialGradient id={`${p}sun`} cx="38%" cy="34%" r="70%">
        <stop offset="0" stopColor="#fff6c8" />
        <stop offset="0.45" stopColor="#ffcf4d" />
        <stop offset="1" stopColor="#ef8f24" />
      </radialGradient>
      <radialGradient id={`${p}halo`} cx="50%" cy="50%" r="50%">
        <stop offset="0.35" stopColor="#ffc94a" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffc94a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${p}moon`} cx="35%" cy="30%" r="80%">
        <stop offset="0" stopColor="#fffdf4" />
        <stop offset="0.6" stopColor="#ece4c8" />
        <stop offset="1" stopColor="#bdb391" />
      </radialGradient>
      <linearGradient id={`${p}cloud`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.65" stopColor="#eef2f6" />
        <stop offset="1" stopColor="#c9d3de" />
      </linearGradient>
      <linearGradient id={`${p}cloudDark`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c3ccd7" />
        <stop offset="0.6" stopColor="#97a3b2" />
        <stop offset="1" stopColor="#6d7a8b" />
      </linearGradient>
      <linearGradient id={`${p}drop`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a9dcff" />
        <stop offset="1" stopColor="#2f86e0" />
      </linearGradient>
      <linearGradient id={`${p}bolt`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff3a3" />
        <stop offset="1" stopColor="#ffb21c" />
      </linearGradient>
      <filter id={`${p}soft`} x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#1d2b3a" floodOpacity="0.22" />
      </filter>
    </defs>
  );
}

function Sun({ p, cx = 32, cy = 30, r = 13, animated }: { p: string; cx?: number; cy?: number; r?: number; animated?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r * 1.85} fill={`url(#${p}halo)`} className={animated ? 'wa-glow' : undefined} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${p}sun)`} filter={`url(#${p}soft)`} />
      <ellipse cx={cx - r * 0.35} cy={cy - r * 0.4} rx={r * 0.38} ry={r * 0.22} fill="#fff" opacity="0.55" transform={`rotate(-30 ${cx - r * 0.35} ${cy - r * 0.4})`} />
    </g>
  );
}

function MoonShape({ p, cx = 32, cy = 29, r = 13 }: { p: string; cx?: number; cy?: number; r?: number }) {
  const mask = `${p}moonmask`;
  return (
    <g filter={`url(#${p}soft)`}>
      <mask id={mask}>
        <rect width="64" height="64" fill="#fff" />
        <circle cx={cx + r * 0.55} cy={cy - r * 0.35} r={r * 0.92} fill="#000" />
      </mask>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${p}moon)`} mask={`url(#${mask})`} />
      <circle cx={cx - r * 0.45} cy={cy + r * 0.25} r={r * 0.13} fill="#b9ae8a" opacity="0.5" mask={`url(#${mask})`} />
    </g>
  );
}

function Cloud({ p, dark, small, className }: { p: string; dark?: boolean; small?: boolean; className?: string }) {
  return (
    <g filter={`url(#${p}soft)`} className={className}>
      <path d={small ? CLOUD_SMALL : CLOUD} fill={`url(#${p}${dark ? 'cloudDark' : 'cloud'})`} />
      {!small && <path d="M22.4 21a14.5 14.5 0 0 1 20-2.6" stroke="#fff" strokeOpacity={dark ? 0.35 : 0.9} strokeWidth="2" strokeLinecap="round" fill="none" />}
    </g>
  );
}

function Drops({ p, count, animated }: { p: string; count: number; animated?: boolean }) {
  const xs = count === 2 ? [26, 40] : count === 3 ? [22, 33, 44] : [19, 28, 37, 46];
  return (
    <g>
      {xs.map((x, i) => (
        <path key={i} d={`M${x} ${50 + (i % 2) * 3}c0 0-3.2 4.3-3.2 6.2a3.2 3.2 0 0 0 6.4 0c0-1.9-3.2-6.2-3.2-6.2Z`} fill={`url(#${p}drop)`} transform={`rotate(12 ${x} 54)`} className={animated ? 'wa-drip' : undefined} style={animated ? { animationDelay: `${i * 0.27}s` } : undefined} />
      ))}
    </g>
  );
}

function Flakes({ count, animated }: { count: number; animated?: boolean }) {
  const xs = count === 2 ? [25, 41] : [20, 32, 44];
  return (
    <g>
      {xs.map((x, i) => (
        <g key={i} className={animated ? 'wa-flake' : undefined} style={animated ? { animationDelay: `${i * 0.5}s` } : undefined} transform={`translate(${x} ${55 + (i % 2) * 3})`}>
          <path d="M0-3.6V3.6M-3.1-1.8 3.1 1.8M-3.1 1.8 3.1-1.8" stroke="#7fa7d6" strokeWidth="1.5" strokeLinecap="round" />
          <circle r="1.1" fill="#fff" />
        </g>
      ))}
    </g>
  );
}

export function WeatherGlyph({ code, isDay = true, className, animated = false, title }: { code: number; isDay?: boolean; className?: string; animated?: boolean; title?: string }) {
  const kind: WeatherKind = weatherKind(code);
  const p = `wg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={cn('shrink-0', className)} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <Defs p={p} />
      {kind === 'clear' && (isDay ? <Sun p={p} animated={animated} /> : <MoonShape p={p} />)}
      {kind === 'partly' && (
        <>
          {isDay ? <Sun p={p} cx={24} cy={23} r={11} animated={animated} /> : <MoonShape p={p} cx={24} cy={23} r={11} />}
          <g transform="translate(6 6)">
            <Cloud p={p} className={animated ? 'wa-float' : undefined} />
          </g>
        </>
      )}
      {kind === 'cloudy' && (
        <>
          <g transform="translate(10 -6) scale(0.8)">
            <Cloud p={p} dark />
          </g>
          <g transform="translate(0 4)">
            <Cloud p={p} className={animated ? 'wa-float' : undefined} />
          </g>
        </>
      )}
      {kind === 'fog' && (
        <>
          <g transform="translate(0 -4)">
            <Cloud p={p} />
          </g>
          {[46, 52, 58].map((y, i) => (
            <rect key={y} x={12 + i * 3} y={y} width={40 - i * 6} height="3" rx="1.5" fill="#b8c2cc" opacity={0.9 - i * 0.2} />
          ))}
        </>
      )}
      {(kind === 'drizzle' || kind === 'rain' || kind === 'heavy-rain' || kind === 'storm' || kind === 'sleet' || kind === 'snow') && (
        <>
          {kind === 'drizzle' && isDay && <Sun p={p} cx={44} cy={18} r={9} animated={animated} />}
          <g transform="translate(0 -6)">
            <Cloud p={p} dark={kind === 'heavy-rain' || kind === 'storm'} />
          </g>
          {kind === 'drizzle' && <Drops p={p} count={2} animated={animated} />}
          {kind === 'rain' && <Drops p={p} count={3} animated={animated} />}
          {kind === 'heavy-rain' && <Drops p={p} count={4} animated={animated} />}
          {kind === 'snow' && <Flakes count={3} animated={animated} />}
          {kind === 'sleet' && (
            <>
              <Drops p={p} count={2} animated={animated} />
              <g transform="translate(6 2)">
                <Flakes count={2} animated={animated} />
              </g>
            </>
          )}
          {kind === 'storm' && <path d="M34 40 25 54h7l-3 10 11-15h-7l4-9Z" fill={`url(#${p}bolt)`} stroke="#d98a00" strokeWidth="0.8" strokeLinejoin="round" filter={`url(#${p}soft)`} />}
        </>
      )}
    </svg>
  );
}
