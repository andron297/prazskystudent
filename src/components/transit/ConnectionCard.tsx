import { motion } from 'motion/react';
import { ArrowRight, Armchair, Siren, Footprints, Repeat } from 'lucide-react';
import type { Itinerary, RideLeg } from '../../types';
import { formatDuration, formatTime } from '../../lib/dates';
import { rideLegs } from '../../lib/transitPlanner';
import { cn } from '../ui/primitives';
import { DelayChip, DepartureTime, LineBadge, VehicleFlags } from './TransitBits';

export function ConnectionCard({
  itinerary,
  variant,
  now,
  deadline,
  merged,
}: {
  itinerary: Itinerary;
  variant: 'recommended' | 'last';
  now: Date;
  deadline: Date;
  merged?: boolean;
}) {
  const rides = rideLegs(itinerary);
  const first = rides[0] as RideLeg | undefined;
  const last = rides[rides.length - 1] as RideLeg | undefined;
  const leaveInMin = Math.max(0, Math.ceil((new Date(itinerary.leaveAt).getTime() - now.getTime()) / 60_000));
  const slack = Math.floor((deadline.getTime() - new Date(itinerary.arriveAt).getTime()) / 60_000);
  const isLast = variant === 'last';
  const estimate = itinerary.source === 'estimate';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative min-w-0 rounded-[22px] bg-surface-2/80 p-3.5 sm:p-4',
        isLast ? 'ring-1 ring-inset ring-red-500/25' : 'ring-1 ring-inset ring-accent/25',
      )}
    >
      <header className="mb-2.5 flex items-center justify-between gap-2">
        <span className={cn('eyebrow inline-flex items-center gap-1.5', isLast ? 'text-red-700 dark:text-red-400' : 'text-accent')}>
          {isLast ? <Siren className="size-3.5" aria-hidden /> : <Armchair className="size-3.5" aria-hidden />}
          {merged ? 'Doporučený i poslední' : isLast ? 'Poslední možný spoj' : 'Doporučený spoj'}
        </span>
        <span className="text-[12px] font-medium text-muted tabular">vyraz {leaveInMin <= 0 ? 'teď' : `za ${formatDuration(leaveInMin)}`}</span>
      </header>

      {first && last ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {rides.map((r, i) => (
              <span key={`${r.line}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="size-3.5 text-subtle" aria-hidden />}
                {estimate ? <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold text-muted ring-1 ring-line">MHD · odhad</span> : <LineBadge ride={r} />}
              </span>
            ))}
            {!estimate && <DelayChip delaySeconds={first.delaySeconds} />}
            {!estimate && <VehicleFlags ride={first} />}
          </div>
          <p className="mt-2 truncate text-[13.5px] font-medium" title={`${first.fromStop} → ${last.toStop}`}>
            {first.fromStop} <span className="text-subtle">→</span> {last.toStop}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <div>
              <dt className="text-subtle">Odjezd</dt>
              <dd className="text-[13.5px]">
                <DepartureTime ride={first} />
              </dd>
            </div>
            <div>
              <dt className="text-subtle">V budově</dt>
              <dd className="text-[13.5px] font-semibold tabular">{formatTime(new Date(itinerary.arriveAt))}</dd>
            </div>
            <div>
              <dt className="text-subtle">Rezerva</dt>
              <dd className={cn('text-[13.5px] font-semibold tabular', slack <= 1 ? 'text-red-600 dark:text-red-400' : slack < 6 ? 'text-orange-600 dark:text-orange-400' : 'text-accent')}>
                {slack} min
              </dd>
            </div>
          </dl>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Footprints className="size-3.5" aria-hidden />
              {itinerary.walkToStopMinutes} min na zastávku
            </span>
            {itinerary.transfers > 0 && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3.5" aria-hidden />
                přestup {rides[1]?.fromStop}
              </span>
            )}
            {first.vehicleType && (
              <span title="Typ vozu z dat o polohách vozidel">
                {first.vehicleType}
                {first.vehicleNumber ? ` · ev. č. ${first.vehicleNumber}` : ''}
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">
          Pěšky {itinerary.walkToStopMinutes} min · v budově {formatTime(new Date(itinerary.arriveAt))}
        </p>
      )}
    </motion.article>
  );
}
