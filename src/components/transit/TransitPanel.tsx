import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calculator, CircleAlert, KeyRound, ListOrdered, Mail, MapPin, Navigation, Radio, RefreshCw } from 'lucide-react';
import type { Building as BuildingType, ScheduleEvent, Subject } from '../../types';
import { formatTime, formatWeekdayShort, formatDayMonth } from '../../lib/dates';
import { googleMapsTransitUrl } from '../../lib/geo';
import { explainItinerary, firstRide } from '../../lib/transitPlanner';
import { TRANSIT_STYLES } from '../../lib/urgency';
import type { TransitPlanState } from '../../hooks/useTransitPlan';
import { useNow } from '../../hooks/useNow';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { Button, Chip, cn, IconButton, Select, Skeleton } from '../ui/primitives';
import { ConnectionCard } from './ConnectionCard';
import { DelayChip, DepartureTime, JourneyBar, LineBadge, VehicleFlags } from './TransitBits';
import { KIND_LABEL, transitStatusOf } from './transitStatus';

const SOURCE_LABEL: Record<string, string> = {
  demo: 'Simulace PID',
  golemio: 'PID Golemio · živě',
  google: 'Google Routes + Golemio',
  estimate: 'Odhad podle vzdálenosti',
  none: 'Bez dat',
};

/** Detail cesty: poslední a doporučený spoj, výpočet, další spoje, plán B. */
export function TransitPanel({
  event,
  building,
  room,
  subject,
  transit,
  onOrigin,
}: {
  event: ScheduleEvent | null;
  building: BuildingType | null;
  room?: string;
  subject?: Subject;
  transit: TransitPlanState;
  onOrigin: () => void;
}) {
  const now = useNow(1000);
  const settings = useAppStore((s) => s.settings);
  const setLocationAlias = useAppStore((s) => s.setLocationAlias);
  const stop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  const [showMath, setShowMath] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { plan, result, loading, error, origin, refresh } = transit;
  const status = transitStatusOf(event, building, transit);
  const style = TRANSIT_STYLES[status];
  const eventStart = event ? new Date(event.start) : null;
  const lastCall = plan?.lastCall ?? null;
  const recommended = plan?.recommended ?? null;
  const merged = Boolean(lastCall && recommended && lastCall.id === recommended.id);
  const updatedAgo = result ? Math.max(0, Math.round((now.getTime() - new Date(result.fetchedAt).getTime()) / 1000)) : null;

  if (!event) return null;

  return (
    <section id="cesta" className="card relative isolate scroll-mt-24 overflow-hidden rounded-[26px]" aria-label="Detail cesty">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b opacity-70 transition-colors duration-700', style.gradient)} />
      <div className="p-4 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-subtle">
              {KIND_LABEL[event.kind]} · {formatTime(new Date(event.start))}–{formatTime(new Date(event.end))}
            </p>
            <h2 className="mt-1 font-display text-[26px] leading-none">
              Cesta <em className="text-moss">{building?.locative ?? (building ? `do budovy ${building.name}` : 'na výuku')}</em>
            </h2>
            <p className="mt-1.5 truncate text-[13px] text-muted">
              {subject?.name ?? event.title}
              {building ? ` · ${building.name}${room ? ` ${room}` : ''}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {building && (
              <a
                href={googleMapsTransitUrl(building.coords, origin.coords)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                title="Otevřít v Google Mapách"
                aria-label="Otevřít trasu v Google Mapách"
              >
                <Navigation className="size-4" />
              </a>
            )}
            <IconButton icon={RefreshCw} label="Obnovit spoje" size="sm" onClick={refresh} className={cn('rounded-full', loading && 'animate-spin')} />
          </div>
        </header>

        <div className="mt-4">
          {status === 'loading' && (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-36 rounded-[22px]" />
              <Skeleton className="h-36 rounded-[22px]" />
            </div>
          )}

          {!building && (
            <div className="rounded-[22px] bg-surface-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CircleAlert className="size-4 text-clay" aria-hidden />
                Neznám místo „{event.location ?? 'neuvedeno'}“
              </p>
              {event.location && (
                <Select className="mt-3 max-w-xs" defaultValue="" onChange={(e) => e.target.value && setLocationAlias(event.location!, e.target.value)} aria-label="Přiřadit budovu">
                  <option value="" disabled>
                    Vyber budovu…
                  </option>
                  {settings.buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} – {b.address}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          {status === 'idle' && transit.tooFar && eventStart && (
            <p className="rounded-[22px] bg-surface-2 p-4 text-sm text-muted">
              {formatWeekdayShort(eventStart)} {formatDayMonth(eventStart)} v {formatTime(eventStart)} – odjezdy PID sahají jen pár hodin dopředu, spoje dopočítám 3 hodiny předem.
            </p>
          )}

          {status === 'on-site' && <p className="rounded-[22px] bg-surface-2 p-4 text-sm text-muted">Jsi u budovy – žádná MHD potřeba.</p>}

          {(status === 'calm' || status === 'prepare' || status === 'critical') && lastCall && eventStart && plan && (
            <div className="space-y-4">
              <JourneyBar itinerary={lastCall} eventStart={eventStart} now={now} />
              <div className="grid gap-3 md:grid-cols-2">
                {recommended && !merged && <ConnectionCard itinerary={recommended} variant="recommended" now={now} deadline={plan.deadline} />}
                <ConnectionCard itinerary={lastCall} variant="last" now={now} deadline={plan.deadline} merged={merged} />
                {merged && <div className="flex items-center rounded-[22px] bg-surface-2 p-4 text-[13px] text-muted">Poslední spoj má i pohodlnou rezervu – dřívější netřeba.</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" icon={Calculator} onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}>
                  Jak to počítám
                </Button>
                <Button size="sm" variant="ghost" icon={ListOrdered} onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
                  Další spoje ({plan.upcoming.length})
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {showMath && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ol className="rounded-[22px] bg-surface-2 p-4">
                      {explainItinerary(lastCall, eventStart, settings.bufferMinutes).map((step, i) => (
                        <li key={i} className="flex items-baseline gap-3 py-1 text-[13px]">
                          <span className={cn('w-12 shrink-0 tabular', step.emphasis ? 'font-bold text-fg' : 'text-muted')}>{formatTime(step.time)}</span>
                          <span className={cn(step.emphasis && 'font-semibold')}>
                            {i > 0 && <span className="mr-1 text-subtle">−</span>}
                            {step.label}
                            {step.detail && <span className="block text-xs font-normal text-subtle">{step.detail}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </motion.div>
                )}
                {showMore && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="divide-y divide-[var(--line)] rounded-[22px] bg-surface-2">
                      {plan.upcoming.map((it) => {
                        const r = firstRide(it);
                        if (!r) return null;
                        const slack = Math.floor((plan.deadline.getTime() - new Date(it.arriveAt).getTime()) / 60_000);
                        return (
                          <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-[13px]">
                            <span className="w-12 font-semibold tabular">{formatTime(new Date(it.leaveAt))}</span>
                            <span className="flex items-center gap-1">
                              {it.legs.map((l, i) => (l.kind === 'ride' ? <LineBadge key={i} ride={l} size="sm" /> : null))}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted">
                              {r.fromStop} <DepartureTime ride={r} className="ml-1 text-fg" />
                            </span>
                            <DelayChip delaySeconds={r.delaySeconds} />
                            <VehicleFlags ride={r} />
                            <span className="ml-auto text-xs text-muted tabular">rezerva {slack} min</span>
                            {it.id === lastCall.id && <Chip className="bg-red-500/12 text-red-700 dark:text-red-300">poslední</Chip>}
                            {recommended && it.id === recommended.id && !merged && <Chip className="bg-accent-soft text-accent">doporučený</Chip>}
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {status === 'missed' && plan && eventStart && (
            <div className="rounded-[22px] bg-surface-2 p-4">
              <p className="font-display text-2xl">MHD už to včas nestihne</p>
              {plan.fastestLate && (
                <p className="mt-1 text-sm text-muted">
                  Nejrychleji v <strong className="text-fg tabular">{formatTime(new Date(plan.fastestLate.arriveAt))}</strong>
                  {plan.lateByMinutes ? ` – asi ${plan.lateByMinutes} min po začátku` : ''}.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2"
                  href={`mailto:?subject=${encodeURIComponent(`Pozdní příchod – ${subject?.name ?? event.title}`)}&body=${encodeURIComponent(`Dobrý den,\n\nomlouvám se, dnes na ${KIND_LABEL[event.kind].toLowerCase()} od ${formatTime(eventStart)} dorazím přibližně o ${plan.lateByMinutes ?? 10} minut později kvůli dopravě.\n\nDěkuji za pochopení.`)}`}
                >
                  <Mail className="size-3.5" aria-hidden /> Napsat omluvu
                </a>
                {building && (
                  <a className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-semibold hover:bg-surface-2" href={googleMapsTransitUrl(building.coords, origin.coords)} target="_blank" rel="noreferrer">
                    <Navigation className="size-3.5" aria-hidden /> Alternativy
                  </a>
                )}
              </div>
            </div>
          )}

          {status === 'no-data' && building && (
            <div className="rounded-[22px] bg-surface-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CircleAlert className="size-4 text-clay" aria-hidden />
                {error ?? 'Nemám data o spojích pro tuto cestu.'}
              </p>
              {result?.warnings.map((w) => (
                <p key={w} className="mt-1 text-[13px] text-muted">
                  {w}
                </p>
              ))}
              <Button size="sm" className="mt-3" icon={KeyRound} onClick={() => navigateTo('propojeni', 'doprava')}>
                Nastavit dopravu
              </Button>
            </div>
          )}
        </div>

        {building && (
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12px] text-muted">
            <button type="button" onClick={onOrigin} className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-1.5 py-0.5 font-semibold hover:bg-surface-2 hover:text-fg">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {origin.label}
                {stop ? ` → ${stop.name}` : ''}
                {origin.usingFallback && origin.geo.status !== 'ok' ? ' · bez GPS' : ''}
              </span>
            </button>
            <span className="inline-flex items-center gap-1.5">
              <Radio className={cn('size-3.5', result?.source === 'golemio' || result?.source === 'google' ? 'text-emerald-500' : '')} aria-hidden />
              {SOURCE_LABEL[result?.source ?? 'none']}
              {updatedAgo !== null ? ` · před ${updatedAgo} s` : ''}
            </span>
            {result?.warnings.length && status !== 'no-data' ? <span className="w-full text-[11.5px] text-clay">{result.warnings[0]}</span> : null}
          </footer>
        )}
      </div>
    </section>
  );
}
