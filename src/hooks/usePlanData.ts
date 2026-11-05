import { useMemo } from 'react';
import { splitMilestones } from '../lib/relevance';
import { useAppStore } from '../store/appStore';
import { useVisibleEvents } from './useVisibleEvents';

/** Data pro Plán: události bez duplicit a jen termíny harmonogramu, které se studenta týkají. */
export function usePlanData() {
  const events = useVisibleEvents();
  const tasks = useAppStore((s) => s.tasks);
  const requirements = useAppStore((s) => s.requirements);
  const allMilestones = useAppStore((s) => s.milestones);
  const profile = useAppStore((s) => s.settings.studyProfile);
  const hiddenIds = useAppStore((s) => s.settings.hiddenMilestones);
  const shownIds = useAppStore((s) => s.settings.shownMilestones);
  const { visible, hidden } = useMemo(() => splitMilestones(allMilestones, { profile, hidden: hiddenIds, shown: shownIds }), [allMilestones, profile, hiddenIds, shownIds]);
  return { events, tasks, requirements, milestones: visible, hiddenMilestones: hidden, allMilestones, profile };
}
