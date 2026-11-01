import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Building,
  Calculator,
  ChevronDown,
  CircleAlert,
  Clock,
  KeyRound,
  ListOrdered,
  LocateFixed,
  Mail,
  MapPin,
  MapPinned,
  Navigation,
  PartyPopper,
  RefreshCw,
  Radio,
} from 'lucide-react';
import type { Building as BuildingType, ScheduleEvent, Subject } from '../../types';
import { formatCountdown, formatDuration, formatRelative, formatTime, formatWeekdayShort, formatDayMonth } from '../../lib/dates';
import { googleMapsTransitUrl } from '../../lib/geo';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { explainItinerary, firstRide, lastNounPhrase } from '../../lib/transitPlanner';
import { TRANSIT_STYLES, type TransitStatus } from '../../lib/urgency';
import { useTransitPlan } from '../../hooks/useTransitPlan';
import { useNow } from '../../hooks/useNow';
import { navigateTo } from '../../hooks/useAppShell';
import { useAppStore } from '../../store/appStore';
import { Menu } from '../ui/overlays';
import { Button, Chip, cn, IconButton, Select, Skeleton } from '../ui/primitives';
import { ConnectionCard } from './ConnectionCard';
import { DelayChip, DepartureTime, JourneyBar, LineBadge, VehicleFlags } from './TransitBits';

const KIND_LABEL: Record<ScheduleEvent['kind'], string> = {
  lecture: 'Přednáška',
  seminar: 'Seminář',
  exam: 'Zkouška',
  consultation: 'Konzultace',
  other: 'Výuka',
};

const SOURCE_LABEL: Record<string, string> = {
  demo: 'Simulace PID (sandbox)',
  golemio: 'PID Golemio · živá data',
  google: 'Google Routes + Golemio',
  estimate: 'Odhad podle vzdálenosti',
  none: 'Bez dat',
};

/** Velký odpočet ve tvaru „18 min 05 s“ (nezaměnitelný s časem odjezdu). */
function CountdownDisplay({ seconds }: { seconds: number }) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const big = 'font-mono text-[56px] tabular sm:text-[68px]';
  const unit = 'ml-1 mr-3 text-lg font-medium opacity-60 sm:text-xl';
  return (
    <span className="inline-flex flex-wrap items-baseline">
      {h > 0 && (
        <>
          <span className={big}>{h}</span>
          <span className={unit}>h</span>
        </>
      )}
      <span className={big}>{h > 0 ? String(m).padStart(2, '0') : m}</span>
      <span className={unit}>min</span>
      {h === 0 && (
        <>
          <span className="font-mono text-[40px] tabular sm:text-[48px]">{String(sec).padStart(2, '0')}</span>
          <span className={unit}>s</span>
        </>
      )}
    </span>
  );
}

function StatusDot({ status }: { status: TransitStatus }) {
  const style = TRANSIT_STYLES[status];
  return (
    <span className="relative flex size-2.5">
      {style.pulse && <span className={cn('absolute inline-flex size-full animate-ping-soft rounded-full', style.dot)} />}
      <span className={cn('relative inline-flex size-2.5 rounded-full', style.dot)} />
    </span>
  );
}

function OriginPicker() {
  const mode = useAppStore((s) => s.settings.mode);
  const pref = useAppStore((s) => s.settings.origin[s.settings.mode]);
  const setOrigin = useAppStore((s) => s.setOrigin);
  return (
    <Menu
      label="Odkud vyrážíš"
      align="start"
      items={[
        {
          label: 'Moje poloha (GPS)',
          hint: mode === 'demo' ? 'Skutečná poloha – mimo Prahu demo síť nenajde spoj' : 'Přes navigator.geolocation, aktualizuje se za chůze',
          icon: LocateFixed,
          onSelect: () => setOrigin(mode, { ...pref, source: 'gps' }),
        },
        ...LOCATION_PRESETS.map((p) => ({
          label: p.label,
          hint: mode === 'demo' ? 'Simulovaná poloha' : 'Uložené místo',
          icon: MapPin,
          onSelect: () => setOrigin(mode, { source: 'preset' as const, presetId: p.id }),
        })),
      ]}
      trigger={(props) => (
        <button type="button" {...props} className="inline-flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <MapPinned className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">změnit polohu</span>
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        </button>
      )}
    />
  );
}

export function TransitHero({
  event,
  building,
  room,
  subject,
  nextLater,
}: {
  event: ScheduleEvent | null;
  building: BuildingType | null;
  room?: string;
  subject?: Subject;
  nextLater?: ScheduleEvent | null;
}) {
  const now = useNow(1000);
  const settings = useAppStore((s) => s.settings);
  const setLocationAlias = useAppStore((s) => s.setLocationAlias);
  const { plan, result, loading, error, origin, onSite, tooFar, refresh } = useTransitPlan(event, building);
  const [showMath, setShowMath] = useState(false);
  const [showMore, setShowMore] = useState(false);

  let status: TransitStatus;
  if (!event) status = 'idle';
  else if (!building) status = 'no-data';
  else if (onSite) status = 'on-site';
  else if (tooFar) status = 'idle';
  else if (!result && (loading || !error)) status = 'loading';
  else if (plan) status = plan.status;
  else status = 'no-data';

  const style = TRANSIT_STYLES[status];
  const eventStart = event ? new Date(event.start) : null;
  const lastCall = plan?.lastCall ?? null;
  const recommended = plan?.recommended ?? null;
  const merged = Boolean(lastCall && recommended && lastCall.id === recommended.id);
  const ride = lastCall ? firstRide(lastCall) : undefined;
  const secondsToLeave = plan?.secondsToLeave ?? null;
  const depMinutes = plan?.secondsToDeparture != null ? Math.max(0, Math.ceil(plan.secondsToDeparture / 60)) : null;
  const updatedAgo = result ? Math.max(0, Math.round((now.getTime() - new Date(result.fetchedAt).getTime()) / 1000)) : null;

  const headline = event && eventStart
    ? `${KIND_LABEL[event.kind]} ${building?.locative ?? (building ? `(${building.name})` : '')} začíná ${formatRelative(eventStart, now)}`.replace(/\s+/g, ' ')
    : 'Dnes už nic nehoří';

  return (
    <section className="card relative isolate overflow-hidden rounded-[28px]" aria-label="Doprava na další výuku">
      <div className={cn('pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br transition-colors duration-700', style.gradient)} />
      <div className="pointer-events-none absolute -right-28 -top-32 -z-10 size-80 rounded-full bg-white/40 blur-3xl dark:bg-white/5" />

      <div className="p-4 sm:p-6">
        {/* Hlavička */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-semibold', style.chip)}>
            <StatusDot status={status} />
            {status === 'idle' && tooFar ? 'Naplánováno' : style.label}
          </span>
          <div className="flex items-center gap-1">
            {building && origin && (
              <a
                href={googleMapsTransitUrl(building.coords, origin.coords)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                title="Otevřít trasu v Google Mapách"
                aria-label="Otevřít trasu v Google Mapách"
              >
                <Navigation className="size-4" />
              </a>
            )}
            <IconButton icon={RefreshCw} label="Obnovit spoje" size="sm" onClick={refresh} className={loading ? 'animate-spin' : undefined} />
          </div>
        </div>

        {/* Událost */}
        {event && eventStart ? (
          <div className="mt-3">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
              Další · {formatTime(eventStart)}–{formatTime(new Date(event.end))}
              {subject?.code ? ` · ${subject.code}` : ''}
            </p>
            <h1 className="mt-1 text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{headline}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted">
              <span className="font-medium text-fg">{subject?.name ?? event.title}</span>
              {building && (
                <span className="inline-flex items-center gap-1">
                  <Building className="size-3.5" aria-hidden />
                  {building.name}
                  {room ? ` · ${room}` : ''} · {building.address.split(',')[0]}
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
              <PartyPopper className="size-6 text-indigo-500" aria-hidden />
              Žádná další výuka v rozvrhu
            </h1>
            <p className="mt-1 text-sm text-muted">Propoj rozvrh ze SISu nebo Google Kalendáře a odpočet se objeví sám.</p>
          </div>
        )}

        {/* Hlavní stav */}
        <div className="mt-5">
          {status === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
              <div className="grid gap-3 md:grid-cols-2">
                <Skeleton className="h-36" />
                <Skeleton className="h-36" />
              </div>
            </div>
          )}

          {event && !building && (
            <div className="glass rounded-2xl p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CircleAlert className="size-4 text-orange-500" aria-hidden />
                Neznám místo konání „{event.location ?? 'neuvedeno'}“
              </p>
              <p className="mt-1 text-[13px] text-muted">Přiřaď budovu – zapamatuju si to pro všechny lístky se stejnou lokací.</p>
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

          {status === 'on-site' && eventStart && (
            <div className="glass rounded-2xl p-4">
              <p className="text-2xl font-semibold tracking-tight">Jsi na místě 👌</p>
              <p className="mt-1 text-sm text-muted">
                {room ? `Učebna ${room}` : building?.name} · začíná {formatRelative(eventStart, now)}. Žádná MHD potřeba.
              </p>
            </div>
          )}

          {status === 'idle' && tooFar && eventStart && (
            <div className="glass rounded-2xl p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="size-4 text-indigo-500" aria-hidden />
                {formatWeekdayShort(eventStart)} {formatDayMonth(eventStart)} v {formatTime(eventStart)} – spoje dopočítám 3 hodiny předem
              </p>
              <p className="mt-1 text-[13px] text-muted">Živé odjezdové tabule PID sahají jen pár hodin dopředu. Do té doby máš klid.</p>
            </div>
          )}

          {(status === 'calm' || status === 'prepare' || status === 'critical') && lastCall && ride && eventStart && plan && (
            <div>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Vyraz nejpozději za</p>
                  <motion.p
                    key={status}
                    initial={{ scale: 0.96, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn('font-semibold leading-none tracking-tight', style.countdown)}
                    aria-label={secondsToLeave !== null && secondsToLeave < 45 ? 'Vyraz teď' : `Vyraz za ${formatCountdown(secondsToLeave ?? 0)}`}
                  >
                    {secondsToLeave !== null && secondsToLeave < 45 ? <span className="text-[56px] sm:text-[68px]">TEĎ!</span> : <CountdownDisplay seconds={secondsToLeave ?? 0} />}
                  </motion.p>
                </div>
                <div className="pb-1.5 text-[13px] text-muted">
                  <p>
                    odchod v <span className="font-semibold text-fg tabular">{formatTime(new Date(lastCall.leaveAt))}</span>
                  </p>
                  <p>
                    v budově <span className="font-semibold text-fg tabular">{formatTime(new Date(lastCall.arriveAt))}</span> (rezerva {settings.bufferMinutes} min)
                  </p>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed">
                <strong className="font-semibold">
                  {lastNounPhrase(ride.mode)} {lastCall.source === 'estimate' ? '' : ride.line}
                </strong>
                {', '}
                {ride.mode === 'tram' ? 'kterou' : 'kterým'} to stihneš, ti jede{' '}
                <strong className="font-semibold tabular">{depMinutes !== null && depMinutes <= 0 ? 'právě teď' : `za ${formatDuration(depMinutes ?? 0)}`}</strong>{' '}
                {ride.mode === 'metro' ? 'ze stanice' : 'ze zastávky'} <strong className="font-semibold">{ride.fromStop}</strong>
                {lastCall.walkToStopMinutes > 0 && <span className="text-muted"> (pěšky {lastCall.walkToStopMinutes} min)</span>}.
              </p>

              <div className="mt-4">
                <JourneyBar itinerary={lastCall} eventStart={eventStart} now={now} />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {recommended && !merged && <ConnectionCard itinerary={recommended} variant="recommended" now={now} deadline={plan.deadline} />}
                <ConnectionCard itinerary={lastCall} variant="last" now={now} deadline={plan.deadline} merged={merged} />
                {merged && (
                  <div className="glass flex items-center rounded-2xl p-4 text-[13px] text-muted">
                    Poslední spoj má zároveň pohodlnou rezervu – dřívější spoj už není potřeba.
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
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
                    <div className="glass mt-2 rounded-2xl p-3 sm:p-4">
                      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Zpětný výpočet od začátku výuky</p>
                      <ol>
                        {explainItinerary(lastCall, eventStart, settings.bufferMinutes).map((step, i) => (
                          <li key={i} className="flex items-baseline gap-3 py-1 text-[13px]">
                            <span className={cn('w-12 shrink-0 font-mono tabular', step.emphasis ? 'font-semibold text-fg' : 'text-muted')}>{formatTime(step.time)}</span>
                            <span className={cn(step.emphasis && 'font-semibold')}>
                              {i > 0 && <span className="mr-1 text-subtle">−</span>}
                              {step.label}
                              {step.detail && <span className="block text-xs font-normal text-subtle">{step.detail}</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </motion.div>
                )}
                {showMore && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <ul className="glass mt-2 divide-y divide-[var(--line)] rounded-2xl">
                      {plan.upcoming.map((it) => {
                        const r = firstRide(it);
                        if (!r) return null;
                        const slack = Math.floor((plan.deadline.getTime() - new Date(it.arriveAt).getTime()) / 60_000);
                        return (
                          <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-[13px]">
                            <span className="w-14 font-mono text-subtle tabular">{formatTime(new Date(it.leaveAt))}</span>
                            <span className="flex items-center gap-1">
                              {it.legs.filter((l) => l.kind === 'ride').map((l, i) => (l.kind === 'ride' ? <LineBadge key={i} ride={l} size="sm" /> : null))}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-muted">
                              {r.fromStop} <DepartureTime ride={r} className="ml-1 text-fg" />
                            </span>
                            <DelayChip delaySeconds={r.delaySeconds} />
                            <VehicleFlags ride={r} />
                            <span className="ml-auto text-xs text-muted tabular">
                              v budově {formatTime(new Date(it.arriveAt))} · rezerva {slack} min
                            </span>
                            {it.id === lastCall.id && <Chip className="bg-red-500/12 text-red-700 dark:text-red-300">poslední</Chip>}
                            {recommended && it.id === recommended.id && !merged && <Chip className="bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">doporučený</Chip>}
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
            <div className="glass rounded-2xl p-4">
              <p className="text-xl font-semibold tracking-tight">MHD už to včas nestihneš 😬</p>
              {plan.fastestLate ? (
                <p className="mt-1 text-sm text-muted">
                  Nejrychleji dorazíš v <strong className="text-fg tabular">{formatTime(new Date(plan.fastestLate.arriveAt))}</strong>
                  {plan.lateByMinutes ? ` – zhruba ${plan.lateByMinutes} min po začátku` : ''}
                  {firstRide(plan.fastestLate) && plan.fastestLate.source !== 'estimate' ? ` (linka ${firstRide(plan.fastestLate)!.line} z ${firstRide(plan.fastestLate)!.fromStop})` : ''}.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Do začátku už nejede žádný vhodný spoj.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2"
                  href={`mailto:?subject=${encodeURIComponent(`Pozdní příchod – ${subject?.name ?? event?.title ?? 'výuka'}`)}&body=${encodeURIComponent(`Dobrý den,\n\nomlouvám se, dnes na ${KIND_LABEL[event!.kind].toLowerCase()} od ${formatTime(eventStart)} dorazím přibližně o ${plan.lateByMinutes ?? 10} minut později kvůli dopravě.\n\nDěkuji za pochopení.`)}`}
                >
                  <Mail className="size-3.5" aria-hidden /> Napsat omluvu
                </a>
                {building && (
                  <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium hover:bg-surface-2" href={googleMapsTransitUrl(building.coords, origin.coords)} target="_blank" rel="noreferrer">
                    <Navigation className="size-3.5" aria-hidden /> Alternativy v Mapách
                  </a>
                )}
              </div>
            </div>
          )}

          {status === 'no-data' && building && event && (
            <div className="glass rounded-2xl p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CircleAlert className="size-4 text-orange-500" aria-hidden />
                {error ?? 'Nemám data o spojích pro tuto cestu.'}
              </p>
              {result?.warnings.map((w) => (
                <p key={w} className="mt-1 text-[13px] text-muted">
                  {w}
                </p>
              ))}
              <Button size="sm" className="mt-3" icon={KeyRound} onClick={() => navigateTo('integrace')}>
                Nastavit API klíče
              </Button>
            </div>
          )}

          {status === 'idle' && !event && nextLater && (
            <p className="text-sm text-muted">
              Nejbližší: <strong className="text-fg">{nextLater.title}</strong> – {formatWeekdayShort(new Date(nextLater.start))} {formatDayMonth(new Date(nextLater.start))} v {formatTime(new Date(nextLater.start))}
            </p>
          )}
        </div>

        {/* Patička: poloha a zdroj dat */}
        {event && building && (
          <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12px] text-muted">
            <div className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {origin.label}
                {settings.mode === 'demo' && origin.source !== 'gps' ? ' (simulace)' : ''}
                {origin.usingFallback && origin.geo.status !== 'ok' ? ` · GPS: ${origin.geo.status === 'denied' ? 'zakázáno' : origin.geo.status === 'locating' ? 'hledám…' : 'nedostupné'}` : ''}
                {origin.source === 'gps' && origin.geo.accuracy ? ` · ±${Math.round(origin.geo.accuracy)} m` : ''}
              </span>
              <OriginPicker />
            </div>
            <div className="flex items-center gap-1.5">
              <Radio className={cn('size-3.5', result?.source === 'golemio' || result?.source === 'google' ? 'text-emerald-500' : '')} aria-hidden />
              <span>
                {SOURCE_LABEL[result?.source ?? 'none']}
                {updatedAgo !== null ? ` · před ${updatedAgo} s` : ''}
              </span>
            </div>
          </footer>
        )}
      </div>
    </section>
  );
}
