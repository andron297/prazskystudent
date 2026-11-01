import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FlaskConical, Plug, X, Zap } from 'lucide-react';
import type { ScheduleEvent } from '../../types';
import { capitalize, formatDateLong } from '../../lib/dates';
import { deadlineUrgency } from '../../lib/urgency';
import { isRequirementComplete } from '../../lib/progress';
import { useNow } from '../../hooks/useNow';
import { useAppStore } from '../../store/appStore';
import { buildingForEvent, upcomingEvents } from '../../store/selectors';
import { useUiStore } from '../../store/uiStore';
import { TransitHero } from '../transit/TransitHero';
import { Button, Chip } from '../ui/primitives';
import { DeadlinesCard, MilestonesCard, SubjectsProgressCard, TodaySchedule } from './DashboardCards';

function greeting(hour: number): string {
  if (hour < 5) return 'Dobrou noc';
  if (hour < 10) return 'Dobré ráno';
  if (hour < 12) return 'Dobré dopoledne';
  if (hour < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

function DemoBanner() {
  const mode = useAppStore((s) => s.settings.mode);
  const dismissed = useAppStore((s) => s.meta.welcomeDismissed);
  const dismiss = useAppStore((s) => s.dismissWelcome);
  const setMode = useAppStore((s) => s.setMode);
  const openConnect = useUiStore((s) => s.openConnect);
  if (mode !== 'demo' || dismissed) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="glass relative flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
      <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-300">
        <FlaskConical className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 pr-8 text-[13.5px] leading-relaxed">
        <p className="font-semibold">Jsi v Sandboxu – vše je hned interaktivní.</p>
        <p className="text-muted">
          Ukázková data FSV UK (Hollar, Jinonice), simulace PID se zpožděními a klimatizací (tramvaje 22 a 18, metro A/B/C) a simulovaný čas od 13:05. Odškrtávej
          podúkoly, nahrávej materiály, zkus parser i synchronizaci Moodlu.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon={Plug} onClick={() => openConnect('moodle')}>
          Propojit studium
        </Button>
        <Button size="sm" icon={Zap} onClick={() => setMode('live')}>
          Live režim
        </Button>
      </div>
      <button type="button" onClick={dismiss} className="absolute right-3 top-3 text-subtle hover:text-fg" aria-label="Skrýt">
        <X className="size-4" />
      </button>
    </motion.div>
  );
}

export function DashboardView() {
  const now = useNow(1000);
  const events = useAppStore((s) => s.events);
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const requirements = useAppStore((s) => s.requirements);
  const [targetId, setTargetId] = useState<string | null>(null);

  const minuteKey = Math.floor(now.getTime() / 60_000);
  const { next } = useMemo(() => upcomingEvents(events, new Date(minuteKey * 60_000)), [events, minuteKey]);
  const chosen = targetId ? events.find((e) => e.id === targetId && new Date(e.start).getTime() > now.getTime()) : undefined;
  const target: ScheduleEvent | null = chosen ?? next ?? null;
  const within = target && new Date(target.start).getTime() - now.getTime() < 18 * 3_600_000 ? target : null;
  const { building, room } = within ? buildingForEvent(within, settings) : { building: undefined, room: undefined };
  const subject = within?.subjectId ? subjects.find((s) => s.id === within.subjectId) : undefined;

  const urgentCount = requirements.filter((r) => {
    if (!r.deadline || isRequirementComplete(r)) return false;
    const u = deadlineUrgency(new Date(r.deadline), now);
    return u === 'critical' || u === 'prepare';
  }).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-muted">{capitalize(formatDateLong(now))}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{greeting(now.getHours())} 👋</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {urgentCount > 0 && <Chip className="bg-orange-500/12 text-orange-700 ring-1 ring-inset ring-orange-500/20 dark:text-orange-300">{urgentCount} {urgentCount === 1 ? 'termín' : urgentCount < 5 ? 'termíny' : 'termínů'} do 3 dnů</Chip>}
          <Chip>{settings.mode === 'demo' ? 'Sandbox' : 'Live data'}</Chip>
        </div>
      </header>

      <DemoBanner />

      <div className="grid gap-4 lg:grid-cols-12">
        <motion.div layout className="min-w-0 lg:col-span-8">
          <TransitHero event={within} building={building ?? null} room={room} subject={subject} nextLater={within ? null : (next ?? null)} />
        </motion.div>
        <div className="min-w-0 lg:col-span-4">
          <TodaySchedule targetId={within?.id} onSelect={(e) => setTargetId(e.id)} />
        </div>
        <div className="min-w-0 lg:col-span-5">
          <DeadlinesCard />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <SubjectsProgressCard />
        </div>
        <div className="min-w-0 lg:col-span-3">
          <MilestonesCard />
        </div>
      </div>
    </div>
  );
}
