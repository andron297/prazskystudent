import { Accessibility, Bus, CableCar, Footprints, Hourglass, Ship, Snowflake, TrainFront, TrainFrontTunnel, TramFront, type LucideIcon } from 'lucide-react';
import type { Itinerary, RideLeg, TransitMode } from '../../types';
import { lineBadgeClasses } from '../../lib/colors';
import { formatTime } from '../../lib/dates';
import { delayChipClasses, formatDelay } from '../../lib/urgency';
import { cn } from '../ui/primitives';

export const MODE_ICON: Record<TransitMode, LucideIcon> = {
  tram: TramFront,
  metro: TrainFrontTunnel,
  bus: Bus,
  trolleybus: Bus,
  train: TrainFront,
  ferry: Ship,
  funicular: CableCar,
};

export function LineBadge({ ride, size = 'md' }: { ride: Pick<RideLeg, 'mode' | 'line'>; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const Icon = MODE_ICON[ride.mode] ?? Bus;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 font-bold tabular',
        lineBadgeClasses(ride.mode, ride.line),
        size === 'xs' && 'h-5 min-w-5 justify-center rounded-md px-1 text-[11px]',
        size === 'sm' && 'h-6 rounded-lg px-1.5 text-xs',
        size === 'md' && 'h-7 rounded-lg px-2 text-[13px] shadow-sm',
        size === 'lg' && 'h-9 rounded-xl px-2.5 text-base shadow-sm',
      )}
      title={`${ride.mode === 'metro' ? 'Metro' : ride.mode === 'tram' ? 'Tramvaj' : ride.mode === 'train' ? 'Vlak' : 'Linka'} ${ride.line}`}
    >
      {size !== 'xs' && <Icon className={size === 'lg' ? 'size-4' : 'size-3.5'} aria-hidden />}
      {ride.line}
    </span>
  );
}

export function DelayChip({ delaySeconds, className }: { delaySeconds: number | null; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold tabular', delayChipClasses(delaySeconds), className)}
      title={delaySeconds === null ? 'Spoj nemá online polohu – jede se podle jízdního řádu' : `Aktuální zpoždění ${delaySeconds} s`}
    >
      {formatDelay(delaySeconds)}
    </span>
  );
}

export function VehicleFlags({ ride, showLabels = false }: { ride: RideLeg; showLabels?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ride.isAirConditioned === true && (
        <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/12 px-1.5 py-0.5 text-[11.5px] font-medium text-sky-700 dark:text-sky-300" title="Klimatizovaný vůz">
          <Snowflake className="size-3.5" aria-hidden />
          {showLabels && 'Klimatizace'}
          <span className="sr-only">Klimatizace</span>
        </span>
      )}
      {ride.isAirConditioned === false && showLabels && (
        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-500/10 px-1.5 py-0.5 text-[11.5px] text-muted" title="Vůz bez klimatizace">
          <Snowflake className="size-3.5 opacity-40" aria-hidden />
          bez klimy
        </span>
      )}
      {ride.isWheelchairAccessible === true && (
        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/12 px-1.5 py-0.5 text-[11.5px] font-medium text-indigo-700 dark:text-indigo-300" title="Nízkopodlažní / bezbariérový spoj">
          <Accessibility className="size-3.5" aria-hidden />
          {showLabels && 'Nízkopodlažní'}
          <span className="sr-only">Nízkopodlažní spoj</span>
        </span>
      )}
    </span>
  );
}

/** Časy odjezdu s přeškrtnutým jízdním řádem při zpoždění. */
export function DepartureTime({ ride, className }: { ride: RideLeg; className?: string }) {
  const scheduled = new Date(ride.scheduledDeparture);
  const predicted = new Date(ride.predictedDeparture);
  const late = predicted.getTime() - scheduled.getTime() >= 60_000;
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 tabular', className)}>
      {late && <span className="text-subtle line-through decoration-1">{formatTime(scheduled)}</span>}
      <span className="font-semibold">{formatTime(predicted)}</span>
    </span>
  );
}

const SEGMENT_STYLE: Record<string, string> = {
  walk: 'bg-[repeating-linear-gradient(90deg,var(--line-strong)_0_4px,transparent_4px_8px)]',
  wait: 'bg-[repeating-linear-gradient(135deg,var(--line)_0_5px,transparent_5px_10px)]',
  buffer: 'bg-emerald-500/25',
};

/** Proporcionální pruh cesty: chůze → čekání → jízda → chůze → rezerva. */
export function JourneyBar({ itinerary, eventStart, now }: { itinerary: Itinerary; eventStart: Date; now: Date }) {
  const start = Math.min(now.getTime(), new Date(itinerary.leaveAt).getTime());
  const end = eventStart.getTime();
  const total = Math.max(1, end - start);
  type Segment = { kind: 'walk' | 'wait' | 'ride' | 'buffer' | 'idle'; from: number; to: number; ride?: RideLeg; label: string };
  const segments: Segment[] = [];
  const leave = new Date(itinerary.leaveAt).getTime();
  if (leave > start) segments.push({ kind: 'idle', from: start, to: leave, label: 'Čas do odchodu' });
  let cursor = leave;
  for (const leg of itinerary.legs) {
    if (leg.kind === 'walk') {
      const to = cursor + leg.minutes * 60_000;
      segments.push({ kind: 'walk', from: cursor, to, label: `Chůze ${leg.minutes} min` });
      cursor = to;
    } else {
      const dep = new Date(leg.predictedDeparture).getTime();
      if (dep > cursor + 30_000) segments.push({ kind: 'wait', from: cursor, to: dep, label: 'Čekání na zastávce' });
      const arr = new Date(leg.predictedArrival).getTime();
      segments.push({ kind: 'ride', from: Math.max(cursor, dep), to: arr, ride: leg, label: `${leg.line}: ${leg.fromStop} → ${leg.toStop}` });
      cursor = arr;
    }
  }
  if (end > cursor) segments.push({ kind: 'buffer', from: cursor, to: end, label: 'Rezerva před začátkem' });

  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2/70 ring-1 ring-inset ring-line">
        {segments.map((s, i) => {
          const width = ((s.to - s.from) / total) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={i}
              title={s.label}
              style={{ width: `${width}%` }}
              className={cn(
                'h-full border-r border-[var(--surface)] last:border-r-0',
                s.kind === 'ride' && s.ride ? lineBadgeClasses(s.ride.mode, s.ride.line).split(' ')[0] : SEGMENT_STYLE[s.kind],
                s.kind === 'idle' && 'bg-transparent',
              )}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3.5" aria-hidden /> chůze {itinerary.walkToStopMinutes} + {itinerary.walkFromStopMinutes} min
        </span>
        {itinerary.legs
          .filter((l): l is RideLeg => l.kind === 'ride')
          .map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className={cn('size-2 rounded-full', lineBadgeClasses(r.mode, r.line).split(' ')[0])} />
              {r.line} · {Math.round((new Date(r.predictedArrival).getTime() - new Date(r.predictedDeparture).getTime()) / 60_000)} min
            </span>
          ))}
        <span className="inline-flex items-center gap-1">
          <Hourglass className="size-3.5" aria-hidden /> rezerva {Math.max(0, Math.round((end - new Date(itinerary.arriveAt).getTime()) / 60_000))} min
        </span>
      </div>
    </div>
  );
}
