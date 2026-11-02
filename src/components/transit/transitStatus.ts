import type { Building, ScheduleEvent } from '../../types';
import type { TransitPlanState } from '../../hooks/useTransitPlan';
import type { TransitStatus } from '../../lib/urgency';

export const KIND_LABEL: Record<ScheduleEvent['kind'], string> = {
  lecture: 'Přednáška',
  seminar: 'Seminář',
  exam: 'Zkouška',
  consultation: 'Konzultace',
  personal: 'Událost',
  other: 'Výuka',
};

/** Jednotné určení stavu cesty pro hero kartu i detail. */
export function transitStatusOf(event: ScheduleEvent | null, building: Building | null, t: TransitPlanState): TransitStatus {
  if (!event) return 'idle';
  if (!building) return 'no-data';
  if (t.onSite) return 'on-site';
  if (t.tooFar) return 'idle';
  if (!t.result && (t.loading || !t.error)) return 'loading';
  if (t.plan) return t.plan.status;
  return 'no-data';
}
