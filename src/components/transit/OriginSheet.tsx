import { useMemo } from 'react';
import { Check, LocateFixed, MapPin, Map as MapIcon, Sparkles } from 'lucide-react';
import { LOCATION_PRESETS } from '../../lib/buildings';
import { nearbyStops, sortLines } from '../../lib/stops';
import { navigateTo } from '../../hooks/useAppShell';
import { useOrigin } from '../../hooks/useOrigin';
import { useStops } from '../../services/stops';
import { useAppStore } from '../../store/appStore';
import { Modal } from '../ui/overlays';
import { Button, cn, Skeleton } from '../ui/primitives';
import { LineBadge } from './TransitBits';

/** Výběr: odkud vyrážím (poloha) a ze které zastávky chci jet. */
export function OriginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useAppStore((s) => s.settings.mode);
  const pref = useAppStore((s) => s.settings.origin[s.settings.mode]);
  const stop = useAppStore((s) => s.settings.originStop[s.settings.mode]);
  const walkSpeed = useAppStore((s) => s.settings.walkSpeed);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setOriginStop = useAppStore((s) => s.setOriginStop);
  const origin = useOrigin();
  const { stops } = useStops();
  const near = useMemo(() => (stops ? nearbyStops(stops, origin.coords, { walkSpeed, maxMeters: 1100, limit: 8 }) : null), [stops, origin.coords, walkSpeed]);

  return (
    <Modal open={open} onClose={onClose} title="Odkud jedete" icon={MapPin} size="md">
      <div className="space-y-5">
        <section>
          <p className="eyebrow mb-2 text-subtle">Výchozí místo</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOrigin(mode, { ...pref, source: 'gps' })}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition', pref.source === 'gps' ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface-2 text-muted ring-line hover:text-fg')}
            >
              <LocateFixed className="size-3.5" aria-hidden /> Moje poloha
            </button>
            {LOCATION_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOrigin(mode, { source: 'preset', presetId: p.id })}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset transition',
                  pref.source === 'preset' && pref.presetId === p.id ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface-2 text-muted ring-line hover:text-fg',
                )}
              >
                {p.label.replace(/\s*\(.*\)$/, '')}
              </button>
            ))}
          </div>
          {pref.source === 'gps' && origin.usingFallback && (
            <p className="mt-2 text-xs text-subtle">GPS {origin.geo.status === 'denied' ? 'je zakázaná' : 'zatím nemá polohu'} – počítám z místa {origin.label}.</p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="eyebrow text-subtle">Zastávka</p>
            <Button
              size="sm"
              variant="ghost"
              icon={MapIcon}
              onClick={() => {
                onClose();
                navigateTo('doprava');
              }}
            >
              Mapa
            </Button>
          </div>
          <ul className="space-y-1.5">
            <li>
              <button
                type="button"
                onClick={() => setOriginStop(mode, null)}
                className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 ring-inset transition', !stop ? 'bg-accent-soft ring-accent/30' : 'ring-line hover:bg-surface-2')}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-moss">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">Automaticky</span>
                  <span className="block text-xs text-muted">Nejrychlejší spoj z okolí</span>
                </span>
                {!stop && <Check className="size-4 text-accent" aria-hidden />}
              </button>
            </li>
            {!near &&
              Array.from({ length: 4 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-14" />
                </li>
              ))}
            {near?.map((s) => {
              const active = stop?.name === s.name;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setOriginStop(mode, { name: s.name, coords: s.coords })}
                    className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left ring-1 ring-inset transition', active ? 'bg-accent-soft ring-accent/30' : 'ring-line hover:bg-surface-2')}
                  >
                    <span className="grid w-9 shrink-0 text-center">
                      <span className="font-display text-[22px] leading-none tabular">{s.walkMinutes}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-subtle">min</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{s.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {sortLines(s.lines.filter((l) => !l.night))
                          .slice(0, 7)
                          .map((l) => (
                            <LineBadge key={`${l.mode}${l.name}`} ride={{ mode: l.mode, line: l.name }} size="xs" />
                          ))}
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {stop && !near?.some((s) => s.name === stop.name) && (
            <p className="mt-2 rounded-2xl bg-surface-2 px-3 py-2 text-xs text-muted">
              Vybraná zastávka <strong className="text-fg">{stop.name}</strong> (z mapy).
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
