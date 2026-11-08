/**
 * Kam dál: když výuka končí (nebo právě skončila), nabídne cestu na další bod
 * programu z kalendáře, nebo domů – u první možnosti rovnou s doporučeným
 * spojem. A když si student v Dopravě zvolí spoj „Pojedu tímto“ mimo výuku
 * (domů, do menzy…), ukáže ho tu s odpočtem odchodu.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigation2, X } from 'lucide-react';
import type { Itinerary, LatLng, ScheduleEvent } from '../../types';
import { formatRelative, isSameDay, vTime } from '../../lib/dates';
import { haversineMeters } from '../../lib/geo';
import { catchability, firstRideOf, rankJourneys } from '../../lib/journeyRank';
import { platformLabel } from '../../lib/transitPlanner';
import { navigateTo } from '../../hooks/useAppShell';
import { useOrigin } from '../../hooks/useOrigin';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useEventPlace, type EventPlace } from '../../services/eventPlaces';
import { planBetween } from '../../services/journey';
import { useAppStore } from '../../store/appStore';
import { appNow } from '../../store/clockStore';
import { planTripTo } from '../../store/journeyStore';
import { buildingForEvent } from '../../store/selectors';
import { useTripStore } from '../../store/tripStore';
import { toast, useUiStore } from '../../store/uiStore';
import { LineBadge } from '../transit/TransitBits';
import { Glyph, type GlyphName } from '../ui/Glyph';

interface Option {
  key: string;
  glyph: GlyphName;
  title: string;
  detail: string;
  place: EventPlace;
  arriveBy?: Date;
}

function TripLine({ it, now }: { it: Itinerary; now: Date }) {
  const ride = firstRideOf(it);
  const leave = new Date(it.leaveAt);
  return (
    <div className="space-y-1 text-[13px]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {ride ? (
          <>
            <LineBadge ride={ride} size="sm" />
            <span>
              jede <strong className="tabular">{vTime(new Date(ride.predictedDeparture))}</strong> z <strong>{ride.fromStop}</strong>
              {ride.platform ? <span className="text-muted"> · {platformLabel(ride.mode, ride.platform)}</span> : null}
            </span>
          </>
        ) : (
          <span>Pěšky celou cestu</span>
        )}
      </p>
      <p className="text-muted">
        {leave.getTime() > now.getTime() + 30_000 ? `Vyrazit ${formatRelative(leave, now)}` : 'Vyrazit hned'} · na místě {vTime(new Date(it.arriveAt))}
      </p>
    </div>
  );
}

/** Spoj zvolený v Dopravě mimo výuku (domů, do menzy…). */
function PlannedTrip({ now }: { now: Date }) {
  const adhoc = useTripStore((s) => s.adhoc);
  const origin = useOrigin();
  if (!adhoc || catchability(adhoc.itinerary, now) === 'gone') return null;
  return (
    <section className="card rounded-[22px] px-4 py-3.5" aria-label="Naplánovaná cesta">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 pt-1 text-[14.5px] font-bold">Cesta: {adhoc.label}</p>
        <button type="button" onClick={() => useTripStore.getState().clearAdhoc()} className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Zrušit naplánovanou cestu">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2.5">
        <div className="min-w-0 flex-1 basis-[220px]">
          <TripLine it={adhoc.itinerary} now={now} />
        </div>
        <button
          type="button"
          onClick={() => useUiStore.getState().startNavigation({ itinerary: adhoc.itinerary, event: null, building: null, origin: origin.coords })}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[13px] font-bold text-accent-fg hover:brightness-110"
        >
          <Navigation2 className="size-4" aria-hidden /> Navigovat
        </button>
      </div>
    </section>
  );
}

export function NextPlaceCard({ now, glanceEventId }: { now: Date; glanceEventId: string | null }) {
  const events = useVisibleEvents();
  const settings = useAppStore((s) => s.settings);
  const origin = useOrigin();
  const minute = Math.floor(now.getTime() / 60_000);

  // Akce, která právě skončila (nebo za chvíli skončí).
  const prev = useMemo(() => {
    const t = minute * 60_000;
    return (
      events
        .filter((e) => !e.allDay && !e.online && new Date(e.start).getTime() <= t && new Date(e.end).getTime() <= t + 15 * 60_000 && new Date(e.end).getTime() >= t - 90 * 60_000)
        .sort((a, b) => b.end.localeCompare(a.end))[0] ?? null
    );
  }, [events, minute]);

  // Další bod programu dnes (kromě výuky, na kterou už odpočítává karta nahoře).
  const nextEvent: ScheduleEvent | null = useMemo(() => {
    const t = minute * 60_000;
    return (
      events
        .filter((e) => !e.allDay && !e.online && e.id !== glanceEventId && new Date(e.start).getTime() > t && isSameDay(new Date(e.start), new Date(t)) && (e.location || e.buildingId))
        .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
    );
  }, [events, minute, glanceEventId]);
  const nextPlace = useEventPlace(nextEvent, settings);

  const prevBuilding = prev ? buildingForEvent(prev, settings).building : null;
  const useGps = origin.source === 'gps' && !origin.usingFallback;
  const from: LatLng = useGps ? origin.coords : (prevBuilding?.coords ?? origin.coords);
  const fromLabel = useGps ? 'Vaše poloha' : (prevBuilding?.name ?? origin.label);

  const options: Option[] = [];
  if (nextEvent && nextPlace && haversineMeters(from, nextPlace.coords) > 120) {
    options.push({ key: `e:${nextEvent.id}`, glyph: 'calendar', title: nextEvent.title, detail: `${vTime(new Date(nextEvent.start))} · ${nextPlace.label}`, place: nextPlace, arriveBy: new Date(new Date(nextEvent.start).getTime() - settings.bufferMinutes * 60_000) });
  }
  if (settings.home && haversineMeters(from, settings.home.coords) > 150) {
    options.push({ key: 'home', glyph: 'home', title: 'Domů', detail: settings.home.label, place: { label: 'Domů', coords: settings.home.coords, detail: settings.home.label, kind: 'place' } });
  }
  const first = options[0];

  const [best, setBest] = useState<Itinerary | null>(null);
  const bucket = Math.floor(minute / 2);
  useEffect(() => {
    setBest(null);
    if (!prev || !first) return;
    let alive = true;
    // Na další akci: s příjezdem včas (když je dost času), jinak co nejdřív.
    const arrive = Boolean(first.arriveBy && first.arriveBy.getTime() > appNow().getTime() + 20 * 60_000);
    const time = arrive && first.arriveBy ? first.arriveBy : appNow();
    void planBetween({ from: { kind: 'origin', label: fromLabel, coords: from }, to: { kind: 'place', label: first.place.label, coords: first.place.coords }, time, arriveBy: arrive, modes: settings.transitModes })
      .then((r) => {
        if (!alive) return;
        const ranks = rankJourneys(r.itineraries, { now: appNow(), arriveBy: first.arriveBy ?? null });
        setBest(r.itineraries.find((it) => it.id === ranks.recommended) ?? null);
      })
      .catch(() => alive && setBest(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev?.id, first?.key, from.lat, from.lng, bucket]);

  return (
    <>
      <PlannedTrip now={now} />
      {prev && (options.length > 0 || !settings.home) && (
        <section className="card rounded-[24px] p-4 sm:p-5" aria-label="Kam dál">
          <h2 className="font-display text-[26px] leading-none">Kam dál</h2>
          <p className="mt-1 text-[13px] text-muted">
            {new Date(prev.end).getTime() > now.getTime() ? `${prev.title} končí ${vTime(new Date(prev.end))}.` : `${prev.title} skončila.`} Cestu počítám {useGps ? 'z vaší polohy' : `od ${fromLabel}`}.
          </p>
          {options.length > 0 && (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[18px] ring-1 ring-inset ring-line">
              {options.map((o, i) => (
                <li key={o.key} className="px-3.5 py-3">
                  <div className="flex items-center gap-3">
                    <Glyph name={o.glyph} size={20} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-bold">{o.title}</span>
                      <span className="block truncate text-[12.5px] text-muted">{o.detail}</span>
                    </span>
                    <button type="button" onClick={() => planTripTo(o.place.label, o.place.coords, o.place.detail, o.arriveBy)} className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-accent ring-1 ring-inset ring-accent/40 hover:bg-accent-soft">
                      Všechny spoje
                    </button>
                  </div>
                  {i === 0 && best && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[14px] bg-surface-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <TripLine it={best} now={now} />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          useTripStore.getState().choose({ itinerary: best, label: o.place.label, coords: o.place.coords });
                          toast.success('Cesta je naplánovaná – odpočet je nahoře na hlavní stránce.');
                        }}
                        className="rounded-full bg-fg px-3 py-1.5 text-[12.5px] font-bold text-canvas hover:opacity-90"
                      >
                        Pojedu tímto
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!settings.home && (
            <button type="button" onClick={() => navigateTo('nastaveni', 'cesta')} className="mt-3 text-[13px] font-bold text-accent hover:underline">
              Nastavit domov – pak tu bude i cesta domů
            </button>
          )}
        </section>
      )}
    </>
  );
}
