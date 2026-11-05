import { useMemo } from 'react';
import { ArrowLeftRight, Droplets, Wind } from 'lucide-react';
import type { WeatherAdvice, WeatherForecast } from '../../lib/weather';
import { weatherLabel } from '../../lib/weather';
import { formatTime } from '../../lib/dates';
import { Card, Chip, cn } from '../ui/primitives';
import { OUTFIT_EMOJI, WeatherIcon } from './WeatherBits';

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
  if (!forecast || !advice) {
    return (
      <Card title="Počasí" eyebrow="Na cestu">
        <div className="h-48 animate-pulse rounded-[22px] bg-surface-2" />
      </Card>
    );
  }
  const c = forecast.current;
  return (
    <Card
      title={
        <>
          Co si <em className="italic text-moss">obléct</em>
        </>
      }
      eyebrow={dayLabel}
      action={
        <span className="flex items-center gap-1.5 text-muted">
          <WeatherIcon code={c.code} isDay={c.isDay} className="size-5 text-clay" />
          <span className="font-display text-[26px] leading-none text-fg tabular">{Math.round(c.temp)}°</span>
        </span>
      }
    >
      <p className="text-[15px] font-semibold leading-snug">{advice.headline}</p>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Doporučené oblečení">
        {advice.outfit.map((o) => (
          <li key={o.id} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ring-1 ring-inset', o.id === 'umbrella' || o.id === 'raincoat' ? 'bg-sky-500/12 text-sky-800 ring-sky-500/25 dark:text-sky-200' : 'bg-surface-2 ring-line')}>
            <span aria-hidden>{OUTFIT_EMOJI[o.id]}</span>
            {o.label}
          </li>
        ))}
      </ul>

      {advice.commutes.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {advice.commutes.map((cw) => (
            <div key={cw.window.kind} className={cn('rounded-[18px] p-3 ring-1 ring-inset', cw.wet ? 'bg-sky-500/10 ring-sky-500/25' : 'bg-surface-2 ring-line')}>
              <p className="eyebrow flex items-center gap-1 text-subtle">
                <ArrowLeftRight className="size-3" aria-hidden />
                {cw.window.kind === 'to' ? 'Cesta tam' : 'Cesta zpět'} · {formatTime(cw.window.from)}
              </p>
              <p className="mt-1.5 flex items-center gap-2">
                <WeatherIcon code={cw.code} className="size-5 text-clay" />
                <span className="font-display text-[24px] leading-none tabular">{cw.temp}°</span>
                <span className="text-xs text-muted">pocitově {cw.feels}°</span>
              </p>
              <p className={cn('mt-1 flex items-center gap-1 text-xs font-semibold', cw.wet ? 'text-sky-700 dark:text-sky-300' : 'text-muted')}>
                <Droplets className="size-3.5" aria-hidden />
                {cw.wet ? `${cw.precipProb} % · ${weatherLabel(cw.code).toLowerCase()}` : `sucho · ${cw.precipProb} %`}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <HourlyChart forecast={forecast} now={now} advice={advice} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {advice.tips.map((t) => (
          <Chip key={t} icon={Wind}>
            {t}
          </Chip>
        ))}
        <span className="ml-auto text-[11px] text-subtle">{forecast.source === 'open-meteo' ? 'Open-Meteo' : 'simulace'}</span>
      </div>
    </Card>
  );
}
