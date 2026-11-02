import { motion } from 'motion/react';
import { ArrowDown, ChevronDown, MapPin } from 'lucide-react';
import type { Building, ScheduleEvent } from '../../types';
import { formatDuration, formatTime } from '../../lib/dates';
import { firstRide, rideLegs } from '../../lib/transitPlanner';
import { TRANSIT_STYLES } from '../../lib/urgency';
import type { TransitPlanState } from '../../hooks/useTransitPlan';
import { useAppStore } from '../../store/appStore';
import { cn } from '../ui/primitives';
import { DelayChip, LineBadge } from './TransitBits';
import { transitStatusOf } from './transitStatus';

function BigCountdown({ seconds }: { seconds: number }) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (total < 45) return <span className="font-display text-[64px] leading-none sm:text-[76px]">Teď!</span>;
  return (
    <span className="inline-flex items-baseline font-display leading-none tabular">
      {h > 0 && (
        <>
          <span className="text-[64px] sm:text-[76px]">{h}</span>
          <span className="ml-1 mr-2.5 text-2xl italic opacity-75">h</span>
        </>
      )}
      <span className="text-[64px] sm:text-[76px]">{h > 0 ? String(m).padStart(2, '0') : m}</span>
      <span className="ml-1 mr-2.5 text-2xl italic opacity-75">min</span>
      {h === 0 && (
        <>
          <span className="text-[34px] opacity-90 sm:text-[40px]">{String(s).padStart(2, '0')}</span>
          <span className="ml-1 text-lg italic opacity-60">s</span>
        </>
      )}
    </span>
  );
}

/** Skleněná karta na fotce: kdy vyrazit, čím a odkud. */
export function TransitGlance({
  event,
  building,
  transit,
  onOrigin,
  onDetail,
}: {
  event: ScheduleEvent | null;
  building: Building | null;
  transit: TransitPlanState;
  onOrigin: () => void;
  onDetail: () => void;
}) {
  const stop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  const status = transitStatusOf(event, building, transit);
  const style = TRANSIT_STYLES[status];
  const plan = transit.plan;
  const last = plan?.lastCall ?? null;
  const ride = last ? firstRide(last) : undefined;
  const rides = last ? rideLegs(last) : [];
  const estimate = last?.source === 'estimate';
  const depMinutes = plan?.secondsToDeparture != null ? Math.max(0, Math.ceil(plan.secondsToDeparture / 60)) : null;
  const originLabel = stop?.name ?? (ride && !estimate ? ride.fromStop : transit.origin.label);

  return (
    <motion.section
      layout
      className="glass-photo-strong relative w-full overflow-hidden rounded-[28px] p-5 sm:p-6"
      aria-label="Kdy vyrazit"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-bold', style.glass)}>
          <span className="relative flex size-2">
            {style.pulse && <span className="absolute inline-flex size-full animate-ping-soft rounded-full bg-white" />}
            <span className="relative inline-flex size-2 rounded-full bg-white" />
          </span>
          {status === 'idle' && transit.tooFar ? 'Naplánováno' : style.label}
        </span>
        <button
          type="button"
          onClick={onOrigin}
          className="inline-flex min-w-0 items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[12px] font-semibold text-white/90 ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
          title="Změnit, odkud jedeš"
        >
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="max-w-36 truncate">{stop ? stop.name : 'Odkud jedu'}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </div>

      {(status === 'calm' || status === 'prepare' || status === 'critical') && last && plan ? (
        <div className="mt-4">
          <p className="eyebrow text-white/70">Vyraz nejpozději za</p>
          <div className="mt-1.5" aria-live="polite">
            <BigCountdown seconds={plan.secondsToLeave ?? 0} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
            {estimate ? (
              <span className="rounded-lg bg-white/15 px-2 py-0.5 text-xs font-bold">MHD · odhad</span>
            ) : (
              rides.map((r, i) => (
                <span key={`${r.line}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-white/50">→</span>}
                  <LineBadge ride={r} size="sm" />
                </span>
              ))
            )}
            {ride && !estimate && (
              <span className="min-w-0 text-white/90">
                <strong className="font-bold text-white">{originLabel}</strong> · odjezd {depMinutes !== null && depMinutes <= 0 ? 'právě teď' : `za ${formatDuration(depMinutes ?? 0)}`}
              </span>
            )}
            {ride && !estimate && <DelayChip delaySeconds={ride.delaySeconds} className="bg-white/15 text-white dark:text-white" />}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/15 pt-3 text-[12.5px] text-white/75">
            <span className="tabular">
              odchod <strong className="text-white">{formatTime(new Date(last.leaveAt))}</strong> · v budově <strong className="text-white">{formatTime(new Date(last.arriveAt))}</strong>
            </span>
            <button type="button" onClick={onDetail} className="inline-flex items-center gap-1 font-semibold text-white hover:underline">
              Celá cesta <ArrowDown className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : status === 'loading' ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <div className="h-16 w-48 animate-pulse rounded-2xl bg-white/15" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded-full bg-white/15" />
        </div>
      ) : status === 'missed' && plan ? (
        <div className="mt-4">
          <p className="font-display text-[40px] leading-none">Ujelo to.</p>
          <p className="mt-2 text-[14px] text-white/85">
            {plan.fastestLate ? `Nejdřív dorazíš v ${formatTime(new Date(plan.fastestLate.arriveAt))}${plan.lateByMinutes ? ` (+${plan.lateByMinutes} min)` : ''}.` : 'Žádný spoj už to nestihne.'}
          </p>
          <button type="button" onClick={onDetail} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-white hover:underline">
            Co teď <ArrowDown className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : status === 'on-site' ? (
        <div className="mt-4">
          <p className="font-display text-[44px] leading-none">
            Jsi <em>na místě</em>
          </p>
          <p className="mt-2 text-[14px] text-white/85">Žádná MHD potřeba – stačí dojít do učebny.</p>
        </div>
      ) : event && transit.tooFar ? (
        <div className="mt-4">
          <p className="font-display text-[44px] leading-none">{formatTime(new Date(event.start))}</p>
          <p className="mt-2 text-[14px] text-white/85">Spoje dopočítám 3 hodiny předem. Do té doby máš klid.</p>
        </div>
      ) : event && !building ? (
        <div className="mt-4">
          <p className="font-display text-[34px] leading-tight">Kde to je?</p>
          <p className="mt-2 text-[14px] text-white/85">Neznám místo „{event.location ?? 'neuvedeno'}“.</p>
          <button type="button" onClick={onDetail} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-white hover:underline">
            Přiřadit budovu <ArrowDown className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : event ? (
        <div className="mt-4">
          <p className="font-display text-[34px] leading-tight">Bez dat o spojích</p>
          <button type="button" onClick={onDetail} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-white hover:underline">
            Detail <ArrowDown className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="font-display text-[44px] leading-none">
            Dnes <em>volno</em>
          </p>
          <p className="mt-2 text-[14px] text-white/85">Žádná další výuka. Užij si to.</p>
        </div>
      )}

    </motion.section>
  );
}
