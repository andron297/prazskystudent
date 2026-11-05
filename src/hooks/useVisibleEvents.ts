import { visibleEvents } from '../lib/dedupe';
import { useAppStore } from '../store/appStore';

/** Události k zobrazení: bez duplicit (stejná hodina ze SISu i z vlastního kalendáře), vždy ta obsáhlejší. */
export function useVisibleEvents() {
  const events = useAppStore((s) => s.events);
  const subjects = useAppStore((s) => s.subjects);
  return visibleEvents(events, subjects);
}
