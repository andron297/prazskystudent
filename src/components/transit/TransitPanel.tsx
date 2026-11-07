import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRightLeft,
  Calculator,
  CircleAlert,
  CircleCheck,
  DoorOpen,
  Flag,
  Footprints,
  KeyRound,
  Mail,
  MapPin,
  MoveDown,
  Navigation,
  Navigation2,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { Building as BuildingType, Itinerary, ScheduleEvent, Subject } from '../../types';
import { formatTime, formatWeekdayShort, formatDayMonth } from '../../lib/dates';
import { googleMapsTransitUrl } from '../../lib/geo';
import { explainItinerary, minutesEarly, rideLegs, routeSteps, type RouteStep, type TransitPlan } from '../../lib/transitPlanner';
import { TRANSIT_STYLES } from '../../lib/urgency';
import type { TransitPlanState } from '../../hooks/useTransitPlan';
import { useNow } from '../../hooks/useNow';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { useUiStore } from '../../store/uiStore';
import { Button, Chip, cn, IconButton, Select, Skeleton } from '../ui/primitives';
import { DelayChip, LineBadge, VehicleFlags } from './TransitBits';
import { KIND_LABEL, transitStatusOf } from './transitStatus';
import { usePlatformLookup } from './usePlatformLookup';
import { BuildingOptions } from '../integrations/SchoolCard';

const SOURCE_LABEL: Record<string, string> = {
  demo: 'Simulace PID (ukázka)',
  transitous: 'Jízdní řád PID + živá zpoždění',
  golemio: 'PID Golemio · živě',
  google: 'Google Routes + Golemio',
  estimate: 'Odhad podle vzdálenosti',
  none: 'Bez dat',
};

const STEP_ICON: Record<RouteStep['kind'], typeof Footprints> = {
  leave: DoorOpen,
  walk: Footprints,
  platform: MoveDown,
  ride: Navigation,
  transfer: ArrowRightLeft,
  exit: Flag,
  arrive: CircleCheck,
};


function ChoiceChips({ label, value, options, onChange, suffix }: { label: string; value: number; options: number[]; onChange: (v: number) => void; suffix: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12.5px] font-semibold text-muted">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cn('h-7 rounded-full px-2.5 text-[12.5px] font-bold tabular ring-1 ring-inset transition', value === o ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-muted ring-line-strong hover:text-fg')}
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}

/** Detail cesty: krok za krokem, výběr spoje, rezerva v cíli a čas na odchod z domu. */
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
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setLocationAlias = useAppStore((s) => s.setLocationAlias);
  const stop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  const selectTrip = useUiStore((s) => s.selectTrip);
  const platformFor = usePlatformLookup();
  const [showMath, setShowMath] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { plan, selected, result, loading, error, origin, refresh } = transit;
  const status = transitStatusOf(event, building, transit, now);
  const style = TRANSIT_STYLES[status];
  const eventStart = event ? new Date(event.start) : null;
  const updatedAgo = result ? Math.max(0, Math.round((now.getTime() - new Date(result.fetchedAt).getTime()) / 1000)) : null;

  if (!event) return null;

  const options: Itinerary[] = plan ? plan.upcoming : [];
  const earlier: Itinerary[] = plan ? [...plan.earlier].reverse() : [];
  const minMargin = Math.min(settings.bufferMinutes, settings.minMarginMinutes ?? 3);
  const active = status === 'calm' || status === 'prepare' || status === 'critical';

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
            {selected && selected.source !== 'estimate' && active && (
              <Button size="sm" variant="primary" icon={Navigation2} onClick={() => useUiStore.getState().startNavigation({ itinerary: selected, event, building, origin: origin.coords })}>
                Navigovat
              </Button>
            )}
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


        {building && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-[18px] bg-surface-2/70 px-3 py-2.5">
            <ChoiceChips label="Na místě předem" value={settings.bufferMinutes} options={[3, 5, 10, 15]} suffix=" min" onChange={(bufferMinutes) => updateSettings({ bufferMinutes })} />
            <ChoiceChips label="Odchod z domu" value={settings.prepMinutes ?? 3} options={[0, 3, 5, 8]} suffix=" min" onChange={(prepMinutes) => updateSettings({ prepMinutes })} />
          </div>
        )}

        <div className="mt-4">
          {status === 'loading' && (
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-40 rounded-[22px]" />
              <Skeleton className="h-40 rounded-[22px]" />
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
                    Vyberte budovu…
                  </option>
                  <BuildingOptions buildings={settings.buildings} facultyId={settings.faculty} />
                </Select>
              )}
            </div>
          )}

          {status === 'idle' && transit.tooFar && eventStart && (
            <p className="rounded-[22px] bg-surface-2 p-4 text-sm text-muted">
              {formatWeekdayShort(eventStart)} {formatDayMonth(eventStart)} v {formatTime(eventStart)} – odjezdy PID sahají jen pár hodin dopředu, spoje dopočítám 3 hodiny předem.
            </p>
          )}

          {status === 'on-site' && <p className="rounded-[22px] bg-surface-2 p-4 text-sm text-muted">Jste u budovy – žádná MHD potřeba.</p>}

          {active && selected && eventStart && plan && building && (
            <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
              {/* Vybraná cesta krok za krokem */}
              <div>
                <p className="eyebrow mb-2 text-subtle">
                  {selected.id === plan.recommended?.id && plan.bufferMet ? 'Doporučený spoj' : selected.id === plan.lastCall?.id ? 'Poslední možný spoj' : 'Váš spoj'}
                </p>
                {!plan.bufferMet && (
                  <p className="mb-2 rounded-[14px] bg-clay/12 px-3 py-2 text-[12.5px] font-semibold text-clay">
                    S rezervou {settings.bufferMinutes} min už to nestihnete – tohle jsou poslední spoje, které to ještě zvládnou.
                  </p>
                )}
                <ol className="relative space-y-0.5 before:absolute before:bottom-3 before:left-[3.55rem] before:top-3 before:w-px before:bg-line">
                  {routeSteps(selected, eventStart, building.name, platformFor).map((step, i) => {
                    const Icon = STEP_ICON[step.kind];
                    const strong = step.kind === 'leave' || step.kind === 'ride' || step.kind === 'arrive';
                    return (
                      <li key={i} className="flex items-start gap-3 py-1.5">
                        <span className={cn('w-11 shrink-0 pt-0.5 text-right text-[13px] tabular', strong ? 'font-bold' : 'text-muted')}>{formatTime(step.time)}</span>
                        <span className={cn('relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-[var(--surface)]', step.kind === 'ride' ? 'bg-accent text-accent-fg' : step.kind === 'arrive' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 pt-0.5">
                          <span className={cn('flex flex-wrap items-center gap-1.5 text-[14px]', strong ? 'font-bold' : 'font-semibold')}>
                            {step.ride && selected.source !== 'estimate' && <LineBadge ride={step.ride} size="sm" />}
                            {step.title}
                          </span>
                          {(step.detail || step.ride) && (
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                              {step.detail}
                              {step.ride && selected.source !== 'estimate' && <DelayChip delaySeconds={step.ride.delaySeconds} />}
                              {step.ride && selected.source !== 'estimate' && <VehicleFlags ride={step.ride} />}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <Button size="sm" variant="ghost" icon={Calculator} className="mt-2" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}>
                  Jak to počítám
                </Button>
                <AnimatePresence initial={false}>
                  {showMath && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <ol className="mt-1 rounded-[22px] bg-surface-2 p-4">
                        {explainItinerary(selected, eventStart, settings.bufferMinutes).map((step, i) => (
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
                </AnimatePresence>
              </div>

              {/* Výběr spoje */}
              <div>
                <p className="eyebrow mb-2 text-subtle">Vyberte spoj</p>
                <ul className="space-y-1.5" role="radiogroup" aria-label="Spoje">
                  {options.map((it) => (
                    <li key={it.id}>
                      <ConnectionOption it={it} plan={plan} selected={it.id === selected.id} eventStart={eventStart} now={now} buffer={settings.bufferMinutes} minMargin={minMargin} onSelect={() => selectTrip(event.id, it.id)} />
                    </li>
                  ))}
                </ul>
                {earlier.length > 0 && (
                  <>
                    <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 w-full rounded-full py-1.5 text-[12.5px] font-semibold text-muted hover:bg-surface-2 hover:text-fg" aria-expanded={showAll}>
                      {showAll ? 'Skrýt dřívější spoje' : `Dřívější spoje – víc času na místě (${earlier.length})`}
                    </button>
                    {showAll && (
                      <ul className="mt-1.5 space-y-1.5" role="radiogroup" aria-label="Dřívější spoje">
                        {earlier.map((it) => (
                          <li key={it.id}>
                            <ConnectionOption it={it} plan={plan} selected={it.id === selected.id} eventStart={eventStart} now={now} buffer={settings.bufferMinutes} minMargin={minMargin} onSelect={() => selectTrip(event.id, it.id)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <p className="mt-2 text-[11.5px] leading-snug text-subtle">
                  Doporučený = nejpozdější spoj, se kterým jste v budově aspoň {settings.bufferMinutes} min předem. Poslední možný = v budově aspoň {minMargin} min předem.
                </p>
                {options.length <= 1 && selected.source === 'estimate' && (
                  <p className="mt-2 rounded-[18px] bg-surface-2 p-3 text-[12.5px] text-muted">Bez dat PID je tohle jen odhad podle vzdálenosti. S živými daty tu uvidíte konkrétní spoje na výběr.</p>
                )}
              </div>
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
              <Button size="sm" className="mt-3" icon={KeyRound} onClick={() => navigateTo('nastaveni', 'cesta')}>
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
              <Radio className={cn('size-3.5', result?.source === 'golemio' || result?.source === 'google' || result?.source === 'transitous' ? 'text-emerald-500' : '')} aria-hidden />
              {SOURCE_LABEL[result?.source ?? 'none']}
              {updatedAgo !== null ? ` · před ${updatedAgo} s` : ''}
              {result?.source === 'transitous' && (
                <>
                  {' · '}
                  <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    trasy: Transitous
                  </a>
                </>
              )}
            </span>
            {result?.warnings.length && status !== 'no-data' ? <span className="w-full text-[11.5px] text-clay">{result.warnings[0]}</span> : null}
          </footer>
        )}
      </div>
    </section>
  );
}

function ConnectionOption({
  it,
  plan,
  selected,
  eventStart,
  now,
  buffer,
  minMargin,
  onSelect,
}: {
  it: Itinerary;
  plan: TransitPlan;
  selected: boolean;
  eventStart: Date;
  now: Date;
  buffer: number;
  minMargin: number;
  onSelect: () => void;
}) {
  const rides = rideLegs(it);
  const first = rides[0];
  const slack = minutesEarly(it, eventStart);
  const leaveIn = Math.max(0, Math.round((new Date(it.leaveAt).getTime() - now.getTime()) / 60_000));
  const isRecommended = it.id === plan.recommended?.id && plan.bufferMet;
  const isLast = it.id === plan.lastCall?.id;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('flex w-full items-center gap-3 rounded-[18px] px-3 py-2.5 text-left ring-1 ring-inset transition', selected ? 'bg-accent-soft ring-accent/40' : 'ring-line hover:bg-surface-2')}
    >
      <span className="w-14 shrink-0">
        <span className="block font-display text-[24px] leading-none tabular">{formatTime(new Date(it.leaveAt))}</span>
        <span className="text-[11px] font-semibold text-subtle">za {leaveIn} min</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          {it.source === 'estimate' ? <span className="rounded-md bg-surface-2 px-1.5 text-[11px] font-bold text-muted">MHD · odhad</span> : rides.map((r, i) => <LineBadge key={i} ride={r} size="sm" />)}
          {first && it.source !== 'estimate' && <DelayChip delaySeconds={first.delaySeconds} />}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
          {first ? `${first.fromStop} ${formatTime(new Date(first.predictedDeparture))}` : 'pěšky'}
          {rides.length > 1 ? ` · přestupte ${rides.slice(1).map((r) => r.fromStop).join(', ')}` : ''} → v budově {formatTime(new Date(it.arriveAt))}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn('text-[12px] font-bold tabular', slack < Math.max(1, minMargin) ? 'text-red-700 dark:text-red-300' : slack < buffer ? 'text-clay' : 'text-accent')}>{slack} min předem</span>
        {isRecommended && <Chip className="bg-accent-soft text-accent">doporučený</Chip>}
        {isLast && !isRecommended && <Chip className="bg-red-500/12 text-red-700 dark:text-red-300">poslední možný</Chip>}
      </span>
    </button>
  );
}
