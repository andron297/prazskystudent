/**
 * Počasník: plastická postavička, která je oblečená podle předpovědi –
 * zimní bunda, čepice, šála, rukavice, deštník, pláštěnka, brýle nebo jen
 * tričko. Scéna za ní ukazuje oblohu (slunce, mraky, déšť, sníh, noc).
 * Kreslené ve vektoru s přechody, odlesky a stíny; jemně dýchá a mrká.
 */
import { useId, useMemo } from 'react';
import type { OutfitId, WeatherKind } from '../../lib/weather';
import { useResolvedTheme } from '../../hooks/useAppShell';
import { cn } from '../ui/primitives';

export interface WeatherAvatarProps {
  outfit: OutfitId[];
  kind: WeatherKind;
  isDay: boolean;
  /** Pocitová teplota – mráz = pára od úst, horko = kapka potu. */
  feels: number;
  windy?: boolean;
  className?: string;
  label?: string;
}

type Coat = 'winter' | 'jacket' | 'light' | 'rain' | null;

const SKY: Record<'light' | 'dark', Record<string, [string, string]>> = {
  light: {
    clear: ['#a9d6f2', '#eef7fb'],
    partly: ['#b9d4e6', '#eef4f6'],
    cloudy: ['#c9d1d9', '#eef0f2'],
    fog: ['#d6d6cf', '#f1f0eb'],
    wet: ['#9fb0c2', '#dde4ea'],
    storm: ['#7f8b9b', '#c3cbd4'],
    snow: ['#d3dee9', '#f6f8fa'],
    night: ['#1b2944', '#3d4d6c'],
  },
  dark: {
    clear: ['#21455f', '#3a6680'],
    partly: ['#26404f', '#3f5a68'],
    cloudy: ['#2a333c', '#434d57'],
    fog: ['#33352f', '#4a4c45'],
    wet: ['#1f2b38', '#38475a'],
    storm: ['#191f28', '#323b48'],
    snow: ['#2c3a48', '#4a5a6a'],
    night: ['#0b1426', '#1e2a44'],
  },
};

function skyKey(kind: WeatherKind, isDay: boolean): string {
  if (!isDay && (kind === 'clear' || kind === 'partly')) return 'night';
  if (kind === 'drizzle' || kind === 'rain' || kind === 'heavy-rain' || kind === 'sleet') return 'wet';
  return kind;
}

/** Pseudonáhodná čísla se stálým semínkem (kapky se při překreslení nehýbou). */
function seeded(n: number, seed: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(s / 233280);
  }
  return out;
}

const CLOUD = 'M17 47h31.5a11 11 0 0 0 1.4-21.9A14.5 14.5 0 0 0 22.4 21 10.6 10.6 0 0 0 17 47Z';

export function WeatherAvatar({ outfit, kind, isDay, feels, windy, className, label }: WeatherAvatarProps) {
  const theme = useResolvedTheme();
  const p = `wa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const has = (id: OutfitId) => outfit.includes(id);
  const wet = kind === 'drizzle' || kind === 'rain' || kind === 'heavy-rain' || kind === 'storm' || kind === 'sleet';
  const snowing = kind === 'snow' || kind === 'sleet';
  const coat: Coat = has('raincoat') ? 'rain' : has('winter-jacket') ? 'winter' : has('jacket') ? 'jacket' : has('light-jacket') ? 'light' : null;
  const umbrella = has('umbrella');
  const hood = coat === 'rain' && !umbrella;
  const beanie = has('hat') && !hood;
  const scarf = has('scarf');
  const gloves = has('gloves');
  const sweater = has('sweater') || has('layer');
  const boots = has('boots') || snowing;
  const shades = has('sunglasses') && isDay;
  const bottle = has('water');
  const cold = feels <= 2;
  const hot = feels >= 26;
  const night = !isDay;
  const [skyTop, skyBottom] = SKY[theme][skyKey(kind, isDay)];

  const drops = useMemo(() => {
    const n = kind === 'heavy-rain' || kind === 'storm' ? 26 : kind === 'rain' ? 18 : kind === 'sleet' ? 12 : 9;
    const r = seeded(n * 3, 7);
    return Array.from({ length: n }, (_, i) => ({ x: 8 + r[i * 3] * 204, y: 10 + r[(i * 3 + 4) % (n * 3)] * 200, d: 0.55 + r[i * 3 + 1] * 0.5, delay: -r[i * 3 + 2] * 2 }));
  }, [kind]);
  const flakes = useMemo(() => {
    const r = seeded(54, 11);
    return Array.from({ length: 18 }, (_, i) => ({ x: 8 + r[i * 3] * 204, y: 8 + r[(i * 3 + 4) % 54] * 205, s: 1.6 + r[i * 3 + 1] * 2.2, d: 3.2 + r[i * 3 + 1] * 3, delay: -r[i * 3 + 2] * 6 }));
  }, []);
  const stars = useMemo(() => {
    const r = seeded(30, 3);
    return Array.from({ length: 10 }, (_, i) => ({ x: 12 + r[i * 3] * 196, y: 10 + r[i * 3 + 1] * 80, s: 0.7 + r[i * 3 + 2] * 1.1, delay: -r[i * 3 + 2] * 3 }));
  }, []);

  // Barvy oblečení
  const coatColor = coat === 'winter' ? ['#2f5a44', '#1c3a2b'] : coat === 'jacket' ? ['#3b5a73', '#243c50'] : coat === 'light' ? ['#8a9a5b', '#66753f'] : coat === 'rain' ? ['#f2c14b', '#d69a1c'] : null;
  const topColor = sweater ? ['#c98a5a', '#a1663c'] : ['#efe6d2', '#d3c6a8'];
  const sleeve = coatColor ?? (sweater ? topColor : null);
  const scarfColor = ['#c1543a', '#93371f'];
  const skin = ['#f7d6bb', '#e7b08c', '#cf9068'];
  const hair = '#3b2a20';

  // Pravá ruka drží deštník, jinak volně podél těla
  const rightHand = umbrella ? { x: 150, y: 152 } : { x: 148, y: 184 };
  const leftHand = { x: 72, y: 184 };

  return (
    <svg viewBox="0 0 220 240" className={cn('select-none', className)} role="img" aria-label={label ?? 'Počasník oblečený podle předpovědi'}>
      <defs>
        <linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBottom} />
        </linearGradient>
        <radialGradient id={`${p}skin`} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor={skin[0]} />
          <stop offset="0.6" stopColor={skin[1]} />
          <stop offset="1" stopColor={skin[2]} />
        </radialGradient>
        <radialGradient id={`${p}sun`} cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.45" stopColor="#ffcf4d" />
          <stop offset="1" stopColor="#ef8f24" />
        </radialGradient>
        <radialGradient id={`${p}halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0.3" stopColor="#ffd25e" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ffd25e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${p}moon`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fffdf4" />
          <stop offset="0.6" stopColor="#ece4c8" />
          <stop offset="1" stopColor="#bdb391" />
        </radialGradient>
        <linearGradient id={`${p}cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme === 'dark' ? '#e4e9ef' : '#ffffff'} />
          <stop offset="0.7" stopColor={theme === 'dark' ? '#c9d1db' : '#edf1f5'} />
          <stop offset="1" stopColor={theme === 'dark' ? '#97a3b1' : '#c6d0db'} />
        </linearGradient>
        <linearGradient id={`${p}cloudDark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9c3cf" />
          <stop offset="0.6" stopColor="#8e9aa9" />
          <stop offset="1" stopColor="#687586" />
        </linearGradient>
        <linearGradient id={`${p}coat`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={coatColor?.[0] ?? topColor[0]} />
          <stop offset="0.55" stopColor={coatColor?.[0] ?? topColor[0]} />
          <stop offset="1" stopColor={coatColor?.[1] ?? topColor[1]} />
        </linearGradient>
        <linearGradient id={`${p}top`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={topColor[0]} />
          <stop offset="1" stopColor={topColor[1]} />
        </linearGradient>
        <linearGradient id={`${p}sleeve`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={sleeve?.[0] ?? skin[1]} />
          <stop offset="1" stopColor={sleeve?.[1] ?? skin[2]} />
        </linearGradient>
        <linearGradient id={`${p}jeans`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#40546c" />
          <stop offset="1" stopColor="#2a394b" />
        </linearGradient>
        <linearGradient id={`${p}scarf`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={scarfColor[0]} />
          <stop offset="1" stopColor={scarfColor[1]} />
        </linearGradient>
        <linearGradient id={`${p}umbrella`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--accent) 70%, black)" />
        </linearGradient>
        <linearGradient id={`${p}gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${p}shadow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#0d1a12" stopOpacity="0.38" />
          <stop offset="1" stopColor="#0d1a12" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${p}ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme === 'dark' ? '#2a3530' : '#e3dccd'} />
          <stop offset="1" stopColor={theme === 'dark' ? '#1b2420' : '#d4cbb8'} />
        </linearGradient>
        <filter id={`${p}soft`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#0d1a12" floodOpacity="0.25" />
        </filter>
        <clipPath id={`${p}frame`}>
          <rect width="220" height="240" rx="28" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${p}frame)`}>
        {/* Obloha */}
        <rect width="220" height="240" fill={`url(#${p}sky)`} />
        {night && stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff" className="wa-twinkle" style={{ animationDelay: `${s.delay}s` }} />)}
        {(kind === 'clear' || kind === 'partly' || kind === 'drizzle') &&
          (isDay ? (
            <g>
              <circle cx="174" cy="46" r="40" fill={`url(#${p}halo)`} className="wa-glow" />
              <circle cx="174" cy="46" r="21" fill={`url(#${p}sun)`} filter={`url(#${p}soft)`} />
              <ellipse cx="166" cy="38" rx="8" ry="4.5" fill="#fff" opacity="0.55" transform="rotate(-30 166 38)" />
            </g>
          ) : (
            <g filter={`url(#${p}soft)`}>
              <mask id={`${p}moonmask`}>
                <rect width="220" height="240" fill="#fff" />
                <circle cx="185" cy="38" r="17" fill="#000" />
              </mask>
              <circle cx="174" cy="46" r="18" fill={`url(#${p}moon)`} mask={`url(#${p}moonmask)`} />
            </g>
          ))}
        {kind !== 'clear' && (
          <g className="wa-float">
            <g transform="translate(-6 4) scale(1.5)" filter={`url(#${p}soft)`}>
              <path d={CLOUD} fill={`url(#${p}${kind === 'storm' || kind === 'heavy-rain' ? 'cloudDark' : 'cloud'})`} />
            </g>
            {kind !== 'partly' && (
              <g transform="translate(118 -2) scale(1.25)" filter={`url(#${p}soft)`}>
                <path d={CLOUD} fill={`url(#${p}${kind === 'storm' || kind === 'heavy-rain' || kind === 'rain' ? 'cloudDark' : 'cloud'})`} />
              </g>
            )}
          </g>
        )}
        {kind === 'storm' && <path d="M168 62 156 84h9l-4 14 14-20h-9l5-16Z" fill="#ffd34d" stroke="#e09a00" strokeWidth="1" strokeLinejoin="round" className="wa-flash" />}
        {kind === 'fog' && [150, 166, 182].map((y, i) => <rect key={y} x={-10 + i * 12} y={y} width={240} height="7" rx="3.5" fill="#fff" opacity={0.28 - i * 0.05} className="wa-float" />)}

        {/* Déšť a sníh za postavou */}
        {wet &&
          drops.map((d, i) => (
            <line key={i} x1={d.x} y1={d.y - 8} x2={d.x - 4} y2={d.y + 8} stroke={theme === 'dark' ? '#8fc6ff' : '#4f8fd6'} strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" className="wa-rain" style={{ animationDuration: `${d.d}s`, animationDelay: `${d.delay}s` }} />
          ))}
        {snowing &&
          flakes.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.s} fill="#fff" opacity="0.9" className="wa-snow" style={{ animationDuration: `${f.d}s`, animationDelay: `${f.delay}s` }} />)}

        {/* Zem */}
        <ellipse cx="110" cy="252" rx="150" ry="36" fill={`url(#${p}ground)`} />
        {wet && <ellipse cx="148" cy="228" rx="26" ry="4" fill={theme === 'dark' ? '#5f86b0' : '#9fbfe0'} opacity="0.45" />}
        <ellipse cx="110" cy="224" rx="46" ry="7" fill={`url(#${p}shadow)`} />

        {/* Postava */}
        <g className="wa-breathe">
          {/* Kapuce za hlavou (mikina) */}
          {sweater && !coat && <path d="M86 122c0-14 10-22 24-22s24 8 24 22v6H86z" fill={`url(#${p}top)`} />}
          {hood && <path d="M68 96c0-28 18-46 42-46s42 18 42 46c0 14-6 26-14 32H82c-8-6-14-18-14-32Z" fill={`url(#${p}coat)`} filter={`url(#${p}soft)`} />}

          {/* Nohy a boty */}
          <path d="M92 182h18l-1 34h-15z" fill={`url(#${p}jeans)`} />
          <path d="M110 182h18l-2 34h-15z" fill={`url(#${p}jeans)`} />
          <path d="M110 186v28" stroke="#1d2836" strokeOpacity="0.35" strokeWidth="1.2" />
          {boots ? (
            <g filter={`url(#${p}soft)`}>
              <path d="M90 204h20v14c0 3-2 5-5 5H86c-3 0-5-2-5-4 0-3 3-5 9-6z" fill="#6b4329" />
              <path d="M110 204h20v9c6 1 9 3 9 6 0 2-2 4-5 4h-19c-3 0-5-2-5-5z" fill="#5b3822" />
              <path d="M90 204h20v4H90zm20 0h20v4h-20z" fill="#8a5a3a" />
            </g>
          ) : (
            <g filter={`url(#${p}soft)`}>
              <path d="M93 212h16v5c0 3-2 5-5 5H86c-3 0-5-2-4-4 1-3 5-4 11-6z" fill="#f4f1ea" />
              <path d="M111 212h16c6 2 10 3 11 6 1 2-1 4-4 4h-18c-3 0-5-2-5-5z" fill="#f4f1ea" />
              <path d="M82 219h27v3H86c-2 0-4-1-4-3zm29 0h27c0 2-2 3-4 3h-23z" fill="#d6cfbf" />
              <path d="M96 214l8-1m12 1 8-1" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {/* Trup */}
          <path d="M80 140c0-11 8-17 18-18h24c10 1 18 7 18 18l-4 46c-16 5-36 5-52 0z" fill={`url(#${p}top)`} filter={`url(#${p}soft)`} />
          {!coat && !sweater && <path d="M101 122c2 6 16 6 18 0" fill="none" stroke="#c2b38f" strokeWidth="2" strokeLinecap="round" />}
          {sweater && !coat && (
            <g>
              <rect x="94" y="160" width="32" height="16" rx="6" fill="#000" opacity="0.1" />
              <path d="M104 126v14m12-14v14" stroke="#efe6d2" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M84 182c16 5 36 5 52 0l-.6 4c-16 5-35 5-51 0z" fill="#000" opacity="0.12" />
            </g>
          )}
          {coat && (
            <g>
              {coat === 'winter' ? (
                <path d="M76 142c0-13 9-20 21-21h26c12 1 21 8 21 21l-4 47c-18 6-42 6-60 0z" fill={`url(#${p}coat)`} filter={`url(#${p}soft)`} />
              ) : (
                <path d="M79 141c0-11 8-18 19-19h24c11 1 19 8 19 19l-4 46c-17 5-37 5-54 0z" fill={`url(#${p}coat)`} filter={`url(#${p}soft)`} />
              )}
              {/* Rozepnutý předek u lehčích bund */}
              {(coat === 'light' || coat === 'jacket') && <path d="M104 124h12l-1 64h-10z" fill={`url(#${p}top)`} />}
              <path d="M110 124v64" stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" />
              {coat === 'winter' && [146, 160, 174].map((y) => <path key={y} d={`M80 ${y}c18 4 42 4 60 0`} fill="none" stroke="#000" strokeOpacity="0.16" strokeWidth="1.4" />)}
              {coat === 'winter' && <path d="M94 118c4-3 28-3 32 0l2 10c-8 4-28 4-36 0z" fill={`url(#${p}coat)`} />}
              {coat === 'jacket' && <path d="M98 122l6 10 6-8 6 8 6-10" fill="none" stroke="#000" strokeOpacity="0.2" strokeWidth="1.4" strokeLinejoin="round" />}
              {coat === 'rain' && [140, 154, 168].map((y) => <rect key={y} x="112.5" y={y} width="5" height="2.4" rx="1.2" fill="#7a5410" opacity="0.6" />)}
              {/* Lesk látky */}
              <path d="M86 140c2-8 7-12 13-13l-5 50c-3-1-6-2-8-3z" fill={`url(#${p}gloss)`} opacity={coat === 'rain' || coat === 'winter' ? 0.9 : 0.45} />
            </g>
          )}

          {/* Šála */}
          {scarf && (
            <g filter={`url(#${p}soft)`}>
              <path d="M90 118c6-4 34-4 40 0 2 4 2 9 0 12-8 3-32 3-40 0-2-3-2-8 0-12z" fill={`url(#${p}scarf)`} />
              <g className={windy ? 'wa-sway-fast' : 'wa-sway'}>
                <path d="M96 126h13l-2 34H95z" fill={`url(#${p}scarf)`} />
                <path d="M95 138h13m-13 9h12" stroke="#f1e2c4" strokeWidth="2.4" />
                <path d="M96 160v5m3-5v5m3-5v5m3-5v5" stroke={scarfColor[1]} strokeWidth="1.4" strokeLinecap="round" />
              </g>
            </g>
          )}

          {/* Paže */}
          <path d={`M86 132c-8 4-12 12-13 22l-1 ${leftHand.y - 154}`} fill="none" stroke={`url(#${p}sleeve)`} strokeWidth="15" strokeLinecap="round" />
          {umbrella ? (
            <path d={`M134 132c8 2 14 8 16 ${rightHand.y - 132}`} fill="none" stroke={`url(#${p}sleeve)`} strokeWidth="15" strokeLinecap="round" />
          ) : (
            <path d={`M134 132c8 4 12 12 13 22l1 ${rightHand.y - 154}`} fill="none" stroke={`url(#${p}sleeve)`} strokeWidth="15" strokeLinecap="round" />
          )}
          {/* Krátké rukávy trička: předloktí holé */}
          {!sleeve && (
            <>
              <path d="M86 131c-5 3-8 7-9 12" fill="none" stroke={`url(#${p}top)`} strokeWidth="15.5" strokeLinecap="round" />
              <path d="M134 131c5 3 8 7 9 12" fill="none" stroke={`url(#${p}top)`} strokeWidth="15.5" strokeLinecap="round" />
            </>
          )}
          {/* Ruce / rukavice */}
          {[leftHand, rightHand].map((h, i) => (
            <circle key={i} cx={h.x} cy={h.y} r={gloves ? 8 : 7} fill={gloves ? `url(#${p}scarf)` : `url(#${p}skin)`} />
          ))}
          {bottle && (
            <g>
              <rect x={leftHand.x - 6} y={leftHand.y - 22} width="12" height="26" rx="4" fill="#9fd3f0" opacity="0.85" />
              <rect x={leftHand.x - 4} y={leftHand.y - 26} width="8" height="5" rx="1.5" fill="var(--accent)" />
              <rect x={leftHand.x - 3.5} y={leftHand.y - 18} width="2.5" height="16" rx="1.2" fill="#fff" opacity="0.6" />
            </g>
          )}

          {/* Krk a hlava */}
          {!scarf && coat !== 'winter' && <rect x="103" y="112" width="14" height="14" rx="5" fill={skin[2]} />}
          <path d="M74 92c0-24 16-40 36-40s36 16 36 40c0 6-1 10-3 14H77c-2-4-3-8-3-14z" fill={hair} />
          <circle cx="110" cy="92" r="33" fill={`url(#${p}skin)`} />
          <circle cx="77.5" cy="96" r="5.5" fill={skin[1]} />
          <circle cx="142.5" cy="96" r="5.5" fill={skin[1]} />
          {/* Vlasy vpředu */}
          {!beanie && !hood && <path d="M77 86c2-20 16-31 33-31 18 0 31 11 33 29-10-8-22-11-33-9-6-5-18-5-33 11z" fill={hair} />}
          {(beanie || hood) && <path d="M80 86c6-6 14-8 22-6 8-4 26-4 38 6-2-6-6-10-10-12H90c-4 2-8 6-10 12z" fill={hair} />}

          {/* Obličej */}
          <g className="wa-blink">
            <ellipse cx="98.5" cy="97" rx="3.6" ry="4.4" fill="#2a1f19" />
            <ellipse cx="121.5" cy="97" rx="3.6" ry="4.4" fill="#2a1f19" />
            <circle cx="99.8" cy="95.4" r="1.2" fill="#fff" />
            <circle cx="122.8" cy="95.4" r="1.2" fill="#fff" />
          </g>
          <path d="M93 88c3-2 7-2 10 0m14 0c3-2 7-2 10 0" fill="none" stroke={hair} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
          <ellipse cx="91" cy="106" rx="6" ry="3.4" fill="#f08e7c" opacity={cold ? 0.55 : 0.32} />
          <ellipse cx="129" cy="106" rx="6" ry="3.4" fill="#f08e7c" opacity={cold ? 0.55 : 0.32} />
          {cold ? <ellipse cx="110" cy="110" rx="3.4" ry="3" fill="#8f4a3c" /> : <path d="M103 107c3 4 11 4 14 0" fill="none" stroke="#8f4a3c" strokeWidth="2.2" strokeLinecap="round" />}
          <ellipse cx="104" cy="80" rx="9" ry="5" fill="#fff" opacity="0.25" />

          {/* Brýle */}
          {shades && (
            <g>
              <rect x="88" y="91" width="19" height="12" rx="5" fill="#1c2227" />
              <rect x="113" y="91" width="19" height="12" rx="5" fill="#1c2227" />
              <path d="M107 95h6" stroke="#1c2227" strokeWidth="2.4" />
              <path d="M91 94l6 6m19-6 6 6" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          )}

          {/* Čepice s bambulí */}
          {beanie && (
            <g filter={`url(#${p}soft)`}>
              <path d="M76 88c0-22 15-36 34-36s34 14 34 36z" fill="#e9dcc0" />
              <path d="M74 84h72v10c-20 4-52 4-72 0z" fill="#d8c7a2" />
              {[80, 88, 96, 104, 112, 120, 128, 136].map((x) => (
                <path key={x} d={`M${x} 85v8`} stroke="#c2ae86" strokeWidth="1.4" strokeLinecap="round" />
              ))}
              <circle cx="110" cy="50" r="10" fill="#f4ead6" />
              <circle cx="107" cy="47" r="4" fill="#fff" opacity="0.7" />
              <path d="M88 66c6-8 14-12 22-12" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" fill="none" />
            </g>
          )}
          {/* Kapuce pláštěnky kolem obličeje */}
          {hood && <path d="M74 98c0-26 16-42 36-42s36 16 36 42c-6-22-20-32-36-32s-30 10-36 32z" fill={`url(#${p}coat)`} />}

          {/* Pára od úst v mrazu, kapka potu v horku */}
          {cold && (
            <g className="wa-puff">
              <circle cx="128" cy="114" r="5" fill="#fff" opacity="0.75" />
              <circle cx="136" cy="110" r="6.5" fill="#fff" opacity="0.6" />
              <circle cx="145" cy="106" r="5" fill="#fff" opacity="0.45" />
            </g>
          )}
          {hot && <path d="M140 74c0 0-4 5-4 7.4a4 4 0 0 0 8 0c0-2.4-4-7.4-4-7.4z" fill="#8fd0ff" stroke="#4f9ad6" strokeWidth="0.8" />}
        </g>

        {/* Deštník */}
        {umbrella && (
          <g transform={`translate(${rightHand.x} ${rightHand.y}) rotate(-12)`}>
            <path d="M0 0v-122" stroke="#4a4038" strokeWidth="3" strokeLinecap="round" />
            <path d="M0 0c0 6 -8 6 -8 0" fill="none" stroke="#4a4038" strokeWidth="3.2" strokeLinecap="round" transform="translate(0 4)" />
            <g filter={`url(#${p}soft)`}>
              <path d="M-66 -96c4-30 32-50 66-50s62 20 66 50c-7-5-15-5-22 0-7-5-15-5-22 0-7-5-15-5-22 0-7-5-15-5-22 0-7-5-15-5-22 0-7-5-15-5-22 0z" fill={`url(#${p}umbrella)`} />
              <path d="M0 -146c-14 10-22 30-22 50m22-50c14 10 22 30 22 50" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1.4" />
              <path d="M-56 -104c8-22 28-36 50-38" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round" />
            </g>
            <circle cx="0" cy="-148" r="3" fill="#4a4038" />
            {wet &&
              [-64, 64].map((x, i) => (
                <path key={x} d={`M${x} ${i ? -92 : -92}c0 0-2.6 3.4-2.6 5a2.6 2.6 0 0 0 5.2 0c0-1.6-2.6-5-2.6-5z`} fill={theme === 'dark' ? '#8fc6ff' : '#5b9be0'} className="wa-drip" style={{ animationDelay: `${i * 0.6}s` }} />
              ))}
          </g>
        )}

        {/* Sníh i před postavou (hloubka) */}
        {snowing &&
          flakes.slice(0, 6).map((f, i) => <circle key={i} cx={(f.x + 60) % 210} cy={(f.y + 90) % 210} r={f.s + 0.6} fill="#fff" className="wa-snow" style={{ animationDuration: `${f.d * 0.8}s`, animationDelay: `${f.delay}s` }} />)}
      </g>
    </svg>
  );
}
