import type { Building, ScheduleEvent } from '../../types';
import type { TransitPlanState } from '../../hooks/useTransitPlan';
import { transitStatusFromSeconds, type TransitStatus } from '../../lib/urgency';

export const KIND_LABEL: Record<ScheduleEvent['kind'], string> = {
  lecture: 'Přednáška',
  seminar: 'Seminář',
  exam: 'Zkouška',
  consultation: 'Konzultace',
  personal: 'Událost',
  other: 'Výuka',
};

/** Jednotné určení stavu cesty pro hero kartu i detail (podle vybraného spoje). */
export function transitStatusOf(event: ScheduleEvent | null, building: Building | null, t: TransitPlanState, now: Date = new Date()): TransitStatus {
  if (!event) return 'idle';
  if (!building) return 'no-data';
  if (t.onSite) return 'on-site';
  if (t.tooFar) return 'idle';
  if (!t.result && (t.loading || !t.error)) return 'loading';
  if (!t.plan) return 'no-data';
  if (t.plan.status === 'missed' || t.plan.status === 'no-data') return t.plan.status;
  if (t.selected) return transitStatusFromSeconds((new Date(t.selected.leaveAt).getTime() - now.getTime()) / 1000);
  return t.plan.status;
}
