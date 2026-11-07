import { motion } from 'motion/react';
import { ArrowDown, ChevronDown, Flag, Footprints, MapPin, Navigation2 } from 'lucide-react';
import type { Building, Itinerary, RideLeg, ScheduleEvent } from '../../types';
import { calendarDayDiff, formatTime, vTime } from '../../lib/dates';
import { platformLabel, rideLegs } from '../../lib/transitPlanner';
import { TRANSIT_STYLES } from '../../lib/urgency';
import type { TransitPlanState } from '../../hooks/useTransitPlan';
import { useNow } from '../../hooks/useNow';
import { useOrigin } from '../../hooks/useOrigin';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { cn } from '../ui/primitives';
import { DelayChip, LineBadge } from './TransitBits';
import { transitStatusOf } from './transitStatus';
import { usePlatformLookup } from './usePlatformLookup';

function BigCountdown({ seconds }: { seconds: number }) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (total < 45) return <span className="font-display text-[60px] leading-none sm:text-[72px]">Teď!</span>;
  return (
    <span className="inline-flex items-baseline font-display leading-none tabular">
      {h > 0 && (
        <>
          <span className="text-[60px] sm:text-[72px]">{h}</span>
          <span className="ml-1 mr-2.5 text-2xl italic opacity-75">h</span>
        </>
      )}
      <span className="text-[60px] sm:text-[72px]">{h > 0 ? String(m).padStart(2, '0') : m}</span>
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

/** Skleněná karta na fotce: kdy vyrazit, na jakou zastávku, čím a kam. */
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
  const now = useNow(1000);
  const stop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  const origin = useOrigin();
  const startNavigation = (itinerary: Itinerary) => useUiStore.getState().startNavigation({ itinerary, event, building, origin: origin.coords });
  const platformFor = usePlatformLookup();
  const status = transitStatusOf(event, building, transit, now);
  const style = TRANSIT_STYLES[status];
  const plan = transit.plan;
  const chosen = transit.selected;
  const rides = chosen ? rideLegs(chosen) : [];
  const first = rides[0];
  const last = rides[rides.length - 1];
  const estimate = chosen?.source === 'estimate';
  const isLast = Boolean(chosen && plan?.lastCall && chosen.id === plan.lastCall.id);
  const secondsToLeave = chosen ? (new Date(chosen.leaveAt).getTime() - now.getTime()) / 1000 : 0;
  const slack = chosen && event ? Math.round((new Date(event.start).getTime() - new Date(chosen.arriveAt).getTime()) / 60_000) : 0;
  const platform = first ? (first.platform ?? platformFor(first)) : undefined;

  const rideRow = (r: RideLeg, i: number) => (
    <li key={`${r.line}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <LineBadge ride={r} size="sm" />
      <span className="min-w-0 text-white/90">
        směr <strong className="font-bold text-white">{r.headsign}</strong>
      </span>
      <span className={cn('tabular', i === 0 ? 'rounded-full bg-white/18 px-2 py-0.5 font-black text-white ring-1 ring-inset ring-white/25' : 'font-bold')}>
        {i === 0 ? `jede ${vTime(new Date(r.predictedDeparture))}` : formatTime(new Date(r.predictedDeparture))}
      </span>
      <DelayChip delaySeconds={r.delaySeconds} className="bg-white/15 text-white dark:text-white" />
    </li>
  );
  const hurry = Boolean(chosen && new Date(chosen.leaveAt).getTime() < now.getTime() - 30_000);

  return (
    <motion.section
      layout
      className="glass-photo-strong relative w-full overflow-hidden rounded-[28px] p-5 sm:p-6"
      data-tour="glance"
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
          {status === 'idle' && transit.tooFar ? 'Naplánováno' : status === 'critical' && !isLast ? 'Za chvíli vyrazte' : style.label}
        </span>
        <button
          type="button"
          onClick={onOrigin}
          className="inline-flex min-w-0 items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[12px] font-semibold text-white/90 ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
          title="Změnit, odkud jedete"
        >
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="max-w-36 truncate">{stop ? stop.name : 'Odkud jedu'}</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      </div>

      {(status === 'calm' || status === 'prepare' || status === 'critical') && chosen && plan ? (
        <div className="mt-4">
          <p className="eyebrow text-white/70">{hurry ? 'Vyrazte hned a přidejte do kroku' : isLast && !plan.bufferMet ? 'Rezerva už nevyjde · vyrazte nejpozději za' : isLast ? 'Vyrazte nejpozději za' : 'Vyrazte za'}</p>
          <div className="mt-1.5" aria-live="polite">
            <BigCountdown seconds={secondsToLeave} />
          </div>

          <ol className="mt-4 space-y-2 border-l border-white/25 pl-3.5 text-[13.5px]">
            {first ? (
              <>
                <li className="flex items-center gap-2">
                  <Footprints className="size-4 shrink-0 text-white/80" aria-hidden />
                  <span>
                    {estimate ? 'Na zastávku ' : 'Jděte na '}
                    <strong className="font-bold">{first.fromStop}</strong>
                    {platform ? <span className="text-white/80"> · {platformLabel(first?.mode, platform)}</span> : null}
                    <span className="text-white/80"> · {chosen.walkToStopMinutes} min</span>
                  </span>
                </li>
                {estimate ? (
                  <li className="text-white/85">MHD (odhad – chybí jízdní řád)</li>
                ) : (
                  rides.map(rideRow)
                )}
                <li className="flex items-center gap-2">
                  <Flag className="size-4 shrink-0 text-white/80" aria-hidden />
                  <span>
                    Vystupte <strong className="font-bold">{last.toStop}</strong>
                    <span className="text-white/80"> · {chosen.walkFromStopMinutes} min pěšky</span>
                  </span>
                </li>
              </>
            ) : (
              <li className="flex items-center gap-2">
                <Footprints className="size-4 shrink-0" aria-hidden /> Pěšky {chosen.walkToStopMinutes} min
              </li>
            )}
          </ol>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/15 pt-3 text-[12.5px] text-white/75">
            <span className="tabular">
              odchod <strong className="text-white">{formatTime(new Date(chosen.leaveAt))}</strong> · v budově <strong className="text-white">{formatTime(new Date(chosen.arriveAt))}</strong> · {slack} min předem
            </span>
            <span className="flex items-center gap-3">
              <button type="button" onClick={onDetail} className="inline-flex items-center gap-1 font-semibold text-white hover:underline">
                Jiný spoj <ArrowDown className="size-3.5" aria-hidden />
              </button>
              {!estimate && (
                <button
                  type="button"
                  onClick={() => startNavigation(chosen)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-bold text-[#1d3a2a] shadow-md transition hover:brightness-95"
                >
                  <Navigation2 className="size-4" aria-hidden /> Navigovat
                </button>
              )}
            </span>
            {plan.lastCall && plan.lastCall.id !== chosen.id && new Date(plan.lastCall.leaveAt) > new Date(chosen.leaveAt) && (
              <span className="w-full tabular text-white/70">
                Nejpozději: odchod <strong className="text-white">{formatTime(new Date(plan.lastCall.leaveAt))}</strong> · v budově {formatTime(new Date(plan.lastCall.arriveAt))}
              </span>
            )}
          </div>
        </div>
      ) : status === 'loading' ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          <div className="h-16 w-48 animate-pulse rounded-2xl bg-white/15" />
          <div className="h-4 w-64 max-w-full animate-pulse rounded-full bg-white/15" />
        </div>
      ) : status === 'missed' && plan ? (
        <div className="mt-4">
          <p className="font-display text-[40px] leading-none">Včas to nestihnete.</p>
          <p className="mt-2 text-[14px] text-white/85">
            {plan.fastestLate ? `Nejrychleji budete na místě ${vTime(new Date(plan.fastestLate.arriveAt))}${plan.lateByMinutes ? ` (o ${plan.lateByMinutes} min později)` : ''}.` : 'Žádný spoj už to nestihne.'}
          </p>
          <span className="mt-3 flex flex-wrap items-center gap-3">
            {plan.fastestLate && (
              <button type="button" onClick={() => startNavigation(plan.fastestLate!)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-bold text-[#1d3a2a] shadow-md transition hover:brightness-95">
                <Navigation2 className="size-4" aria-hidden /> Navigovat
              </button>
            )}
            <button type="button" onClick={onDetail} className="inline-flex items-center gap-1 text-[13px] font-semibold text-white hover:underline">
              Další možnosti <ArrowDown className="size-3.5" aria-hidden />
            </button>
          </span>
        </div>
      ) : status === 'on-site' ? (
        <div className="mt-4">
          <p className="font-display text-[44px] leading-none">
            Jste <em>na místě</em>
          </p>
          <p className="mt-2 text-[14px] text-white/85">Žádná MHD potřeba – stačí dojít do učebny.</p>
        </div>
      ) : event && transit.tooFar ? (
        <div className="mt-4">
          <p className="font-display text-[44px] leading-none">{formatTime(new Date(event.start))}</p>
          <p className="mt-2 text-[14px] text-white/85">{transit.windowStart ? `Spoj a odpočet odchodu ukážu ${calendarDayDiff(transit.windowStart, now) === 0 ? 'dnes' : 'zítra'} ${vTime(transit.windowStart)}.` : 'Spoj a odpočet odchodu ukážu s předstihem.'}</p>
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
          <p className="mt-2 text-[14px] text-white/85">Žádná další výuka. Užijte si to.</p>
        </div>
      )}
    </motion.section>
  );
}
