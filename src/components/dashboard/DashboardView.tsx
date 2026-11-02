import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Droplets } from 'lucide-react';
import type { ScheduleEvent } from '../../types';
import { addDays, capitalize, formatDateLong, formatTime, isSameDay } from '../../lib/dates';
import { isRequirementComplete, subjectProgress } from '../../lib/progress';
import { commuteWindows, weatherAdvice, weatherLabel } from '../../lib/weather';
import { useNow } from '../../hooks/useNow';
import { useOrigin } from '../../hooks/useOrigin';
import { useTransitPlan } from '../../hooks/useTransitPlan';
import { useWeather } from '../../services/weather';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent, isTransitTarget, upcomingEvents } from '../../store/selectors';
import { OriginSheet } from '../transit/OriginSheet';
import { TransitGlance } from '../transit/TransitGlance';
import { TransitPanel } from '../transit/TransitPanel';
import { KIND_LABEL } from '../transit/transitStatus';
import { WeatherCard } from '../weather/WeatherCard';
import { WeatherIcon } from '../weather/WeatherBits';
import { MilestonesCard, StatsBand, SubjectsGlance, TasksCard, TodayTimeline, WelcomeCard } from './DashboardCards';

function greeting(hour: number): [string, string] {
  if (hour < 5) return ['Dobrou', 'noc'];
  if (hour < 10) return ['Dobré', 'ráno'];
  if (hour < 12) return ['Dobré', 'dopoledne'];
  if (hour < 18) return ['Dobré', 'odpoledne'];
  return ['Dobrý', 'večer'];
}

function heroPhoto(hour: number, wet: boolean): string {
  if (wet || hour < 10) return 'mist';
  if (hour < 16) return 'forest';
  if (hour < 20) return 'riverside';
  return 'prague';
}

export function DashboardView() {
  const now = useNow(1000);
  const events = useAppStore((s) => s.events);
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const account = useAppStore((s) => s.googleSync[s.settings.mode].account);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [originOpen, setOriginOpen] = useState(false);

  // Cíl cesty: vybraná výuka, jinak nejbližší.
  const minuteKey = Math.floor(now.getTime() / 60_000);
  const { next } = useMemo(() => upcomingEvents(events, new Date(minuteKey * 60_000)), [events, minuteKey]);
  const chosen = targetId ? events.find((e) => e.id === targetId && new Date(e.start).getTime() > now.getTime()) : undefined;
  const target: ScheduleEvent | null = chosen ?? next ?? null;
  const within = target && new Date(target.start).getTime() - now.getTime() < 18 * 3_600_000 ? target : null;
  const { building, room } = within ? buildingForEvent(within, settings) : { building: undefined, room: undefined };
  const subject = within?.subjectId ? subjects.find((s) => s.id === within.subjectId) : undefined;
  const transit = useTransitPlan(within, building ?? null);

  // Počasí a rada na cestu
  const origin = useOrigin();
  const { forecast } = useWeather(origin.coords, settings.weather.enabled);
  const plan = useMemo(
    () => commuteWindows(events.filter(isTransitTarget), new Date(minuteKey * 60_000), { leaveAt: transit.selected ? new Date(transit.selected.leaveAt) : null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, minuteKey, transit.selected?.leaveAt],
  );
  const advice = useMemo(() => (forecast ? weatherAdvice(forecast, plan, new Date(minuteKey * 60_000), settings.weather.feel) : null), [forecast, plan, minuteKey, settings.weather.feel]);

  // Den pro časovou osu: dnes, a když je dnes hotovo, zítřek.
  const todayHasMore = events.some((e) => isSameDay(new Date(e.start), now) && new Date(e.end) > now);
  const timelineDay = todayHasMore || now.getHours() < 12 ? now : addDays(now, 1);
  const timelineLabel = isSameDay(timelineDay, now) ? 'Dnes' : 'Zítra';

  // Statistiky
  const todayClasses = events.filter((e) => isSameDay(new Date(e.start), now) && e.kind !== 'personal');
  const classMinutes = todayClasses.reduce((sum, e) => sum + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60_000, 0);
  const openToday = tasks.filter((t) => !t.done && t.due && new Date(t.due.length === 10 ? `${t.due}T12:00` : t.due) <= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)).length;
  const deadlines3 = requirements.filter((r) => r.deadline && !isRequirementComplete(r) && new Date(r.deadline).getTime() - now.getTime() <= 3 * 86_400_000 && new Date(r.deadline) > now).length;
  const avg = subjects.length ? Math.round(subjects.reduce((sum, s) => sum + subjectProgress(requirements.filter((r) => r.subjectId === s.id)).percent, 0) / subjects.length) : 0;

  const [g1, g2] = greeting(now.getHours());
  const name = settings.displayName.trim() || undefined;
  const wetSoon = Boolean(advice?.umbrella);
  const photo = heroPhoto(now.getHours(), wetSoon && forecast?.current.code !== undefined && forecast.current.code >= 51);
  const rainCommute = advice?.commutes.find((c) => c.wet);

  const scrollToDetail = () => document.getElementById('cesta')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero s fotkou */}
      <section className="grain relative isolate overflow-hidden rounded-[32px] bg-forest text-white shadow-[0_30px_60px_-35px_rgb(0_0_0/0.6)]">
        <img
          src={`/images/${photo}-1200.webp`}
          srcSet={`/images/${photo}-1200.webp 1200w, /images/${photo}.webp 1920w`}
          sizes="(min-width: 1320px) 1280px, 100vw"
          alt=""
          className="absolute inset-0 -z-20 size-full animate-drift object-cover"
          fetchPriority="high"
        />
        <div className="photo-scrim absolute inset-0 -z-10" />
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-10 lg:p-10">
          <div className="min-w-0 pt-6 lg:pt-16">
            <p className="eyebrow text-white/75">{capitalize(formatDateLong(now))}</p>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-2 font-display text-[54px] leading-[0.92] tracking-tight sm:text-[76px] lg:text-[88px]">
              {g1} <em className="text-[#e7d6b5]">{g2}</em>
              {name ? <span className="block text-[0.55em] text-white/90">{name}</span> : null}
            </motion.h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
              {within
                ? `${KIND_LABEL[within.kind]}${building?.locative ? ` ${building.locative}` : ''} v ${formatTime(new Date(within.start))}${subject ? ` · ${subject.name}` : ''}`
                : account?.name
                  ? 'Dnes už žádná výuka.'
                  : 'Dnes už žádná výuka – čas na sebe.'}
            </p>
            {forecast && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="glass-photo inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold">
                  <WeatherIcon code={forecast.current.code} isDay={forecast.current.isDay} className="size-4" />
                  {Math.round(forecast.current.temp)}° · {weatherLabel(forecast.current.code)}
                </span>
                {rainCommute ? (
                  <span className="glass-photo inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold">
                    <Droplets className="size-4" aria-hidden />☂ {rainCommute.precipProb} % {rainCommute.window.kind === 'to' ? 'cestou tam' : 'cestou zpět'}
                  </span>
                ) : (
                  advice && <span className="glass-photo rounded-full px-3.5 py-1.5 text-[13px] font-semibold">{advice.outfit.slice(0, 2).map((o) => o.label).join(' + ')}</span>
                )}
              </div>
            )}
          </div>
          <TransitGlance event={within} building={building ?? null} transit={transit} onOrigin={() => setOriginOpen(true)} onDetail={scrollToDetail} />
        </div>
      </section>

      <WelcomeCard />

      <StatsBand
        stats={[
          { value: String(openToday + todayClasses.filter((e) => new Date(e.end) > now).length), label: 'Dnes na tobě', hint: `${todayClasses.length} ${todayClasses.length === 1 ? 'hodina' : todayClasses.length < 5 && todayClasses.length > 0 ? 'hodiny' : 'hodin'} výuky · ${openToday} úkolů` },
          { value: String(deadlines3), label: 'Termíny do 3 dnů', hint: deadlines3 ? 'Nic nenechávej na poslední chvíli' : 'V klidu' },
          { value: classMinutes ? `${Math.round((classMinutes / 60) * 10) / 10}`.replace('.', ',') : '0', label: 'Hodin ve škole', hint: todayClasses[0] ? `od ${formatTime(new Date(todayClasses[0].start))}` : 'Dnes bez výuky' },
          { value: `${avg} %`, label: 'Semestr hotový', hint: `${subjects.length} předmětů` },
        ]}
      />

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <TodayTimeline day={timelineDay} label={timelineLabel} targetId={within?.id} onSelect={(e) => setTargetId(e.id)} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <TasksCard />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <WeatherCard forecast={forecast} advice={advice} now={now} dayLabel={plan.day === 'tomorrow' ? 'Zítra do školy' : plan.day === 'today' ? 'Dnes do školy' : 'Dnes'} />
        </div>
        <div className="min-w-0 lg:col-span-7">
          {within ? (
            <TransitPanel event={within} building={building ?? null} room={room} subject={subject} transit={transit} onOrigin={() => setOriginOpen(true)} />
          ) : (
            <SubjectsGlance />
          )}
        </div>
        {within && (
          <div className="min-w-0 lg:col-span-7">
            <SubjectsGlance />
          </div>
        )}
        <div className={within ? 'min-w-0 lg:col-span-5' : 'min-w-0 lg:col-span-12'}>
          <MilestonesCard />
        </div>
      </div>

      <OriginSheet open={originOpen} onClose={() => setOriginOpen(false)} />
    </div>
  );
}
