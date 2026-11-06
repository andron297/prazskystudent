import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Palette } from 'lucide-react';
import type { ScheduleEvent } from '../../types';
import { capitalize, formatDateLong, formatTime } from '../../lib/dates';
import { nameDayText, publicHoliday } from '../../lib/czechDays';
import { autoHeroPhoto, galleryPhoto, photoCredit, photoUrl, resolveAppearance } from '../../lib/appearance';
import { useLocalImage } from '../../hooks/useLocalImage';
import { navigateTo } from '../../hooks/useAppShell';
import { commuteWindows, weatherAdvice, weatherLabel } from '../../lib/weather';
import { useNow } from '../../hooks/useNow';
import { useOrigin } from '../../hooks/useOrigin';
import { useTransitPlan } from '../../hooks/useTransitPlan';
import { useLeaveReminder } from '../../hooks/useLeaveReminder';
import { DepartureRest } from '../rest/RestSpots';
import { FocusCard } from '../focus/FocusCard';
import { ViewBoundary } from '../layout/ViewBoundary';
import { useWeather } from '../../services/weather';
import { setNextLeave } from '../../services/leaveBadge';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent, isTransitTarget, upcomingEvents } from '../../store/selectors';
import { OriginSheet } from '../transit/OriginSheet';
import { TransitGlance } from '../transit/TransitGlance';
import { KIND_LABEL } from '../transit/transitStatus';
import { WeatherCard } from '../weather/WeatherCard';
import { Emoji3D } from '../ui/Emoji3D';
import { cn } from '../ui/primitives';
import { weather3d } from '../../lib/emoji3d';
import { TourOffer, WelcomeCard } from './DashboardCards';
import { CountdownsCard } from './Countdowns';
import { DayBrief } from './DayBrief';
import { MenzaCard } from './MenzaCard';

function greeting(hour: number): [string, string] {
  if (hour < 5) return ['Dobrou', 'noc'];
  if (hour < 10) return ['Dobré', 'ráno'];
  if (hour < 12) return ['Dobré', 'dopoledne'];
  if (hour < 18) return ['Dobré', 'odpoledne'];
  return ['Dobrý', 'večer'];
}

export function DashboardView() {
  const now = useNow(1000);
  const events = useVisibleEvents();
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const tasks = useAppStore((s) => s.tasks);
  const [targetId] = useState<string | null>(null);
  const [originOpen, setOriginOpen] = useState(false);

  // Cíl cesty: vybraná výuka, jinak nejbližší.
  const minuteKey = Math.floor(now.getTime() / 60_000);
  const { next } = useMemo(() => upcomingEvents(events, new Date(minuteKey * 60_000)), [events, minuteKey]);
  const chosen = targetId ? events.find((e) => e.id === targetId && new Date(e.start).getTime() > now.getTime()) : undefined;
  const target: ScheduleEvent | null = chosen ?? next ?? null;
  const within = target && new Date(target.start).getTime() - now.getTime() < 18 * 3_600_000 ? target : null;
  const { building } = within ? buildingForEvent(within, settings) : { building: undefined };
  const subject = within?.subjectId ? subjects.find((s) => s.id === within.subjectId) : undefined;
  const transit = useTransitPlan(within, building ?? null);
  useLeaveReminder(within, transit.selected, now);
  // Odpočet na ikoně aplikace a v záložce prohlížeče.
  const leaveAt = transit.selected && transit.selected.source !== 'estimate' ? transit.selected.leaveAt : null;
  useEffect(() => setNextLeave(leaveAt), [leaveAt]);

  // Budova, kde student učí nejčastěji (pro menzu, když dnes nic nemá).
  const mainBuilding = useMemo(() => {
    const counts = new Map<string, number>();
    const t = minuteKey * 60_000;
    for (const e of events) {
      if (!isTransitTarget(e) || new Date(e.start).getTime() < t - 7 * 86_400_000 || new Date(e.start).getTime() > t + 14 * 86_400_000) continue;
      const b = buildingForEvent(e, settings).building;
      if (b) counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? settings.buildings.find((b) => b.id === top[0]) ?? null : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, settings.buildings, Math.floor(minuteKey / 60)]);

  // Počasí a rada na cestu
  const origin = useOrigin();
  const { forecast } = useWeather(origin.coords, settings.weather.enabled);
  const plan = useMemo(
    () => commuteWindows(events.filter(isTransitTarget), new Date(minuteKey * 60_000), { leaveAt: transit.selected ? new Date(transit.selected.leaveAt) : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, minuteKey, transit.selected?.leaveAt],
  );
  const advice = useMemo(() => (forecast ? weatherAdvice(forecast, plan, new Date(minuteKey * 60_000), settings.weather.feel) : null), [forecast, plan, minuteKey, settings.weather.feel]);

  const [g1, g2] = greeting(now.getHours());
  const name = settings.displayName.trim() || undefined;
  const wetSoon = Boolean(advice?.umbrella);
  // Fotka v úvodu podle Vzhledu: automaticky (denní doba, déšť), z galerie, nebo vlastní
  const look = resolveAppearance(settings.appearance);
  const wetNow = wetSoon && forecast?.current.code !== undefined && forecast.current.code >= 51;
  const heroUpload = useLocalImage('hero', look.heroPhoto === 'upload');
  const heroId = look.heroPhoto === 'upload' ? (heroUpload === null ? autoHeroPhoto(now, wetNow) : null) : look.heroPhoto === 'auto' || !galleryPhoto(look.heroPhoto) ? autoHeroPhoto(now, wetNow) : look.heroPhoto;
  const heroCredit = heroId ? galleryPhoto(heroId) : undefined;
  const rainCommute = advice?.commutes.find((c) => c.wet);

  const goToTransit = () => navigateTo('doprava');
  const nameDay = nameDayText(now);
  const holiday = publicHoliday(now);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero s fotkou */}
      <section className="grain relative isolate overflow-hidden rounded-[32px] bg-forest text-white shadow-[0_30px_60px_-35px_rgb(0_0_0/0.6)]">
        {heroId ? (
          <img
            key={heroId}
            src={photoUrl(heroId, 'medium')}
            srcSet={`${photoUrl(heroId, 'medium')} 1200w, ${photoUrl(heroId, 'full')} 1920w`}
            sizes="(min-width: 1320px) 1280px, 100vw"
            alt=""
            className="absolute inset-0 -z-20 size-full animate-drift object-cover"
            fetchPriority="high"
          />
        ) : heroUpload ? (
          <img src={heroUpload} alt="" className="absolute inset-0 -z-20 size-full animate-drift object-cover" />
        ) : null}
        <div className="photo-scrim absolute inset-0 -z-10" />
        <a href="#/vzhled" className="glass-photo absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full transition hover:scale-105 sm:right-5 sm:top-5 lg:left-6 lg:right-auto lg:top-6" aria-label="Upravit vzhled – barvy, fotky, pozadí" title="Vzhled">
          <Palette className="size-4" aria-hidden />
        </a>
        {heroCredit && (
          <a href={heroCredit.source} target="_blank" rel="noreferrer" className="absolute bottom-1.5 right-4 z-10 text-[10px] font-medium text-white/45 transition hover:text-white/85">
            {photoCredit(heroCredit)}
          </a>
        )}
        <div className={within ? 'grid gap-5 p-5 pt-4 sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-10 lg:p-10' : 'p-5 pt-4 sm:p-8 lg:p-10'}>
          <div className={cn('min-w-0', within ? 'lg:pt-16' : 'lg:pt-10')}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-12 lg:pr-0">
              <span className="font-display text-[38px] leading-none tabular text-white sm:text-[46px]" aria-label={`Je ${formatTime(now)}`}>
                {formatTime(now)}
              </span>
              <span className="eyebrow text-white/80">{capitalize(formatDateLong(now))}</span>
            </div>
            {(nameDay || holiday) && (
              <p className="mt-1.5 text-[13px] font-semibold text-white/75">
                {holiday ? <span className="text-[#e7d6b5]">{holiday}</span> : null}
                {holiday && nameDay ? ' · ' : ''}
                {nameDay}
              </p>
            )}
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 font-display text-[46px] leading-[0.92] tracking-tight sm:mt-4 sm:text-[76px] lg:text-[88px]">
              {g1} <em className="text-[#e7d6b5]">{g2}</em>
              {name ? <span className="block text-[0.55em] text-white/90">{name}</span> : null}
            </motion.h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85 sm:mt-4">
              {within
                ? `${KIND_LABEL[within.kind]}${building?.locative ? ` ${building.locative}` : ''} v ${formatTime(new Date(within.start))}${subject ? ` · ${subject.name}` : ''}`
                : 'Dnes už žádná výuka – čas na vás.'}
            </p>
            {forecast && (
              <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
                <span className="glass-photo inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3.5 text-[13px] font-semibold">
                  <Emoji3D name={weather3d(forecast.current.code, forecast.current.isDay)} size={24} className="-my-1" eager />
                  {Math.round(forecast.current.temp)}° · {weatherLabel(forecast.current.code)}
                </span>
                {rainCommute ? (
                  <span className="glass-photo inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3.5 text-[13px] font-semibold">
                    <Emoji3D name={weather3d(rainCommute.code)} size={24} className="-my-1" eager />
                    {rainCommute.precipProb} % déšť {rainCommute.window.kind === 'to' ? 'cestou tam' : 'cestou zpět'}
                  </span>
                ) : (
                  advice && <span className="glass-photo rounded-full px-3.5 py-1.5 text-[13px] font-semibold">{advice.outfit.slice(0, 2).map((o) => o.label).join(' + ')}</span>
                )}
              </div>
            )}
          </div>
          {within && <TransitGlance event={within} building={building ?? null} transit={transit} onOrigin={() => setOriginOpen(true)} onDetail={goToTransit} />}
        </div>
      </section>

      <WelcomeCard />
      <TourOffer />

      {within && transit.selected && <DepartureRest event={within} itinerary={transit.selected} now={now} rain={Boolean(advice?.umbrella)} />}

      {/* Telefon: jeden sloupec v pořadí podle důležitosti. Počítač: dva nezávislé sloupce bez děr. */}
      <div className="flex flex-col gap-4 sm:gap-5 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="contents lg:col-span-7 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-1 min-w-0 lg:order-none">
            <ViewBoundary compact label="Přehled dne">
              <DayBrief now={now} target={within} itinerary={transit.selected ?? null} />
            </ViewBoundary>
          </div>
          <div className="order-3 min-w-0 lg:order-none">
            <ViewBoundary compact label="Menza">
              <MenzaCard now={now} building={building ?? mainBuilding} fallback={origin.coords} />
            </ViewBoundary>
          </div>
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <div className="order-2 min-w-0 lg:order-none">
            <ViewBoundary compact label="Počasí">
              <WeatherCard forecast={forecast} advice={advice} now={now} dayLabel={plan.day === 'tomorrow' ? 'Zítra do školy' : plan.day === 'today' ? 'Dnes do školy' : 'Dnes'} />
            </ViewBoundary>
          </div>
          <div className="order-4 min-w-0 lg:order-none">
            <ViewBoundary compact label="Odpočty">
              <CountdownsCard />
            </ViewBoundary>
          </div>
          <div className="order-5 min-w-0 lg:order-none">
            <ViewBoundary compact label="Soustředění">
              <FocusCard tasks={tasks} />
            </ViewBoundary>
          </div>
        </div>
      </div>

      <OriginSheet open={originOpen} onClose={() => setOriginOpen(false)} />
    </div>
  );
}
