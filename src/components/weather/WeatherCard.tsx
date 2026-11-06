import { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { WeatherAdvice, WeatherForecast } from '../../lib/weather';
import { weatherLabel } from '../../lib/weather';
import { formatTime } from '../../lib/dates';
import { OUTFIT_3D, weather3d } from '../../lib/emoji3d';
import { Emoji3D } from '../ui/Emoji3D';
import { Card, cn } from '../ui/primitives';

/** Teplota (čára) a pravděpodobnost srážek (sloupce) na dalších 12 hodin; okna cest jako pruhy. */
function HourlyChart({ forecast, now, advice }: { forecast: WeatherForecast; now: Date; advice: WeatherAdvice }) {
  const hours = useMemo(() => {
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    return forecast.hourly.filter((h) => h.time >= start).slice(0, 13);
  }, [forecast, now]);
  if (hours.length < 4) return null;
  const W = 320;
  const H = 96;
  const top = 18;
  const bottom = 22;
  const temps = hours.map((h) => h.temp);
  const min = Math.min(...temps) - 1;
  const max = Math.max(...temps) + 1;
  const x = (i: number) => (i / (hours.length - 1)) * (W - 16) + 8;
  const y = (t: number) => top + (1 - (t - min) / Math.max(1, max - min)) * (H - top - bottom);
  const t0 = hours[0].time.getTime();
  const span = hours[hours.length - 1].time.getTime() - t0;
  const xt = (d: Date) => 8 + ((d.getTime() - t0) / span) * (W - 16);
  const path = hours.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(h.temp).toFixed(1)}`).join(' ');
  const barW = (W - 16) / (hours.length - 1) - 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label="Předpověď na dalších 12 hodin">
      {advice.commutes.map((c) => {
        const a = Math.max(8, xt(c.window.from));
        const b = Math.min(W - 8, xt(c.window.to));
        if (b <= a) return null;
        return <rect key={c.window.kind} x={a} y={4} width={Math.max(3, b - a)} height={H - bottom - 2} rx={6} className={c.wet ? 'fill-sky-500/15' : 'fill-[var(--accent-soft)]'} />;
      })}
      {hours.map((h, i) => {
        const bh = (h.precipProb / 100) * (H - top - bottom);
        return <rect key={`p${i}`} x={x(i) - barW / 2} y={H - bottom - bh} width={barW} height={bh} rx={3} className="fill-sky-500/35" />;
      })}
      <path d={path} fill="none" className="stroke-[var(--clay)]" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {hours.map((h, i) =>
        i % 3 === 0 ? (
          <g key={`l${i}`}>
            <circle cx={x(i)} cy={y(h.temp)} r={2.6} className="fill-[var(--clay)]" />
            <text x={x(i)} y={y(h.temp) - 6} textAnchor="middle" className="fill-[var(--fg)] text-[10px] font-bold">
              {Math.round(h.temp)}°
            </text>
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-[var(--subtle)] text-[10px] font-semibold">
              {h.time.getHours()}h
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}

export function WeatherCard({ forecast, advice, now, dayLabel }: { forecast: WeatherForecast | null; advice: WeatherAdvice | null; now: Date; dayLabel: string }) {
  const reduce = useReducedMotion();
  if (!forecast || !advice) {
    return (
      <Card title="Počasí" eyebrow="Na cestu">
        <div className="h-40 animate-pulse rounded-[22px] bg-surface-2" />
      </Card>
    );
  }
  const c = forecast.current;
  return (
    <section className="card relative min-w-0 overflow-hidden rounded-[26px] p-4 sm:p-5" aria-label="Počasí a co si obléct">
      <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(125_175_230/0.20),transparent)] dark:bg-[radial-gradient(closest-side,rgb(125_175_230/0.12),transparent)]" aria-hidden />
      <header className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1 text-subtle">{dayLabel}</p>
          <h2 className="font-display text-[23px] leading-none">
            Co si <em className="italic text-moss">obléct</em>
          </h2>
        </div>
        <div className="-mr-1 -mt-2 flex items-center gap-1.5">
          <Emoji3D name={weather3d(c.code, c.isDay)} size={58} eager alt={weatherLabel(c.code)} className={reduce ? undefined : 'animate-float'} />
          <div className="text-right">
            <p className="font-display text-[34px] leading-none tabular">{Math.round(c.temp)}°</p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-muted">{weatherLabel(c.code)}</p>
          </div>
        </div>
      </header>

      <p className="relative mt-3 text-[15.5px] font-semibold leading-snug">{advice.headline}</p>
      <p className="relative mt-0.5 text-[12.5px] text-muted">Pocitově {Math.round(c.feels)}° · rada počítá s {advice.basisFeels}° na cestě</p>

      <ul className="relative mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2" aria-label="Doporučené oblečení">
        {advice.outfit.map((o, i) => (
          <motion.li
            key={o.id}
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.06 * i, type: 'spring', stiffness: 380, damping: 26 }}
            className={cn('flex flex-col items-center gap-1 rounded-[18px] px-1.5 pb-2 pt-2.5 text-center ring-1 ring-inset', o.id === 'umbrella' || o.id === 'raincoat' ? 'bg-sky-500/10 ring-sky-500/25' : 'bg-surface-2/80 ring-line')}
          >
            <Emoji3D name={OUTFIT_3D[o.id]} size={42} />
            <span className="text-[11.5px] font-semibold leading-tight">{o.label}</span>
          </motion.li>
        ))}
      </ul>

      {advice.commutes.length > 0 && (
        <div className="relative mt-3 grid gap-2 sm:grid-cols-2">
          {advice.commutes.map((cw) => (
            <div key={cw.window.kind} className={cn('flex items-center gap-2.5 rounded-[18px] px-3 py-2 ring-1 ring-inset', cw.wet ? 'bg-sky-500/10 ring-sky-500/25' : 'bg-surface-2/70 ring-line')}>
              <Emoji3D name={weather3d(cw.code)} size={32} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">
                  {cw.window.kind === 'to' ? 'Cesta tam' : 'Cesta zpět'} · {formatTime(cw.window.from)}
                </span>
                <span className={cn('block truncate text-[13px] font-semibold', cw.wet && 'text-sky-800 dark:text-sky-200')}>
                  {cw.temp}° · {cw.wet ? `${cw.precipProb} % ${weatherLabel(cw.code).toLowerCase()}` : 'sucho'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="relative mt-3">
        <HourlyChart forecast={forecast} now={now} advice={advice} />
      </div>
      <div className="relative mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        {advice.tips.map((t) => (
          <span key={t}>{t}</span>
        ))}
        <span className="ml-auto text-[11px] text-subtle">{forecast.source === 'open-meteo' ? 'Open-Meteo' : 'simulace'}</span>
      </div>
    </section>
  );
}
