/**
 * Veřejná adresa aplikace: nová adresa po stěhování (PUBLIC_CANONICAL_ORIGIN
 * na serveru), jinak ta, na které aplikace právě běží. Nikde natvrdo.
 */
import { useUiStore } from '../store/uiStore';

export function useAppOrigin(): { origin: string; host: string } {
  const canonical = useUiStore((s) => s.server.canonicalOrigin);
  const origin = canonical ?? (typeof window !== 'undefined' ? window.location.origin : 'https://stihnuto.vercel.app');
  return { origin, host: origin.replace(/^https?:\/\//, '') };
}
