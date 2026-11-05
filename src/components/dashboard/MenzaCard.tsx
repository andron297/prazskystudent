/**
 * Jídelníček menzy – automaticky ta nejblíž budově, kde máš výuku
 * (nebo ta, kterou si vybereš). Studentské ceny, alergeny, víc dní dopředu.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, Leaf, RefreshCw, Soup, UtensilsCrossed } from 'lucide-react';
import type { Building, LatLng } from '../../types';
import { addDays, formatDayMonth, formatWeekdayShort, isSameDay, toDateKey } from '../../lib/dates';
import { ALLERGENS, CANTEENS, canteenById, MENZA_WEB, nearestCanteens } from '../../lib/menza';
import { useMenza, type MenzaDish } from '../../services/menza';
import { useAppStore } from '../../store/appStore';
import { Card, cn, Skeleton } from '../ui/primitives';

const price = (n?: number) => (n === undefined ? '' : `${Math.round(n)} Kč`);

function Dish({ dish }: { dish: MenzaDish }) {
  const soup = dish.kind === 'soup';
  const label = dish.label.replace(/^Menu\s*\d+\s*–\s*/i, '');
  const special = label !== dish.label ? label : null;
  return (
    <li className={cn('flex items-start gap-3 rounded-[16px] px-2.5 py-2', soup ? 'bg-surface-2/70' : '')}>
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', soup ? 'bg-sand/25 text-clay' : dish.vegetarian ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' : 'bg-accent-soft text-accent')}>
        {soup ? <Soup className="size-4" aria-hidden /> : dish.vegetarian ? <Leaf className="size-4" aria-hidden /> : <UtensilsCrossed className="size-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug">{dish.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
          <span className="font-semibold">{soup ? 'Polévka' : (dish.label.match(/^Menu\s*\d+/i)?.[0] ?? dish.label)}</span>
          {special && <span className={cn('font-bold', dish.vegetarian && 'text-emerald-700 dark:text-emerald-300')}>{special}</span>}
          {dish.kcal ? <span className="tabular">{dish.kcal} kcal</span> : null}
          {dish.allergens.length > 0 && (
            <span className="tabular" title={`Alergeny: ${dish.allergens.map((a) => `${a} ${ALLERGENS[a] ?? ''}`.trim()).join(', ')}`}>
              alergeny {dish.allergens.join(', ')}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[14px] font-bold tabular">{price(dish.student ?? dish.full)}</span>
        {dish.student !== undefined && dish.full !== undefined && dish.full !== dish.student && <span className="block text-[11px] text-subtle tabular">ostatní {price(dish.full)}</span>}
      </span>
    </li>
  );
}

export function MenzaCard({ now, building, fallback }: { now: Date; building?: Building | null; fallback?: LatLng | null }) {
  const pinned = useAppStore((s) => s.settings.menza?.canteenIds);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const near = useMemo(() => (building ? nearestCanteens(building.coords, 3) : fallback ? nearestCanteens(fallback, 3) : []), [building, fallback]);
  const auto = near[0]?.canteen.id ?? 22;
  const pinnedId = pinned?.[0];
  const canteenId = pinnedId ?? auto;
  const canteen = canteenById(canteenId);
  const from = toDateKey(now);
  const { data, error, loading } = useMenza([canteenId], from);
  const menu = data?.canteens.find((c) => c.id === canteenId);
  const days = menu?.days ?? [];
  const afternoon = now.getHours() >= 15;
  const defaultDay = days.find((d) => (afternoon ? d.date > from : d.date >= from))?.date ?? days[0]?.date;
  const [picked, setPicked] = useState<string | null>(null);
  const day = days.find((d) => d.date === picked) ?? days.find((d) => d.date === defaultDay);

  const dayLabel = (key: string) => {
    const d = new Date(`${key}T12:00:00`);
    if (isSameDay(d, now)) return 'Dnes';
    if (isSameDay(d, addDays(now, 1))) return 'Zítra';
    return `${formatWeekdayShort(d)} ${formatDayMonth(d)}`;
  };

  return (
    <Card
      data-tour="menza"
      title={
        <>
          Jídelníček <em className="italic text-moss">menzy</em>
        </>
      }
      eyebrow={
        <label className="relative inline-flex cursor-pointer items-center gap-1 hover:text-fg">
          {canteen?.name ?? 'Menza'}
          {pinnedId === undefined && near[0] && building && <span className="normal-case tracking-normal text-subtle">· nejblíž budově {building.name}</span>}
          <span aria-hidden>▾</span>
          <select
            value={pinnedId !== undefined ? String(canteenId) : 'auto'}
            onChange={(e) => updateSettings({ menza: e.target.value === 'auto' ? { canteenIds: [] } : { canteenIds: [Number(e.target.value)] } })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Vybrat menzu"
          >
            <option value="auto">Automaticky – nejblíž výuce{near[0] ? ` (${near[0].canteen.short})` : ''}</option>
            <optgroup label="Všechny menzy UK">
              {CANTEENS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      }
    >
      {days.length > 1 && (
        <div className="scrollbar-none -mx-1 mb-2 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Den">
          {days.map((d) => {
            const active = d.date === day?.date;
            return (
              <button key={d.date} type="button" role="tab" aria-selected={active} onClick={() => setPicked(d.date)} className={cn('h-8 shrink-0 rounded-full px-3 text-[12.5px] font-bold transition-colors', active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg')}>
                {dayLabel(d.date)}
              </button>
            );
          })}
        </div>
      )}

      {loading && !menu ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : error && !menu ? (
        <p className="flex items-center gap-2 text-[13.5px] text-muted">
          <RefreshCw className="size-4" aria-hidden /> {error}
        </p>
      ) : !day ? (
        <p className="text-[13.5px] text-muted">{canteen?.name ?? 'Menza'} na nejbližší dny jídelníček nevypsala (o víkendu a o prázdninách se obvykle nevaří).</p>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul key={day.date} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="space-y-1">
            {day.dishes.map((dish, i) => (
              <Dish key={`${dish.label}-${i}`} dish={dish} />
            ))}
          </motion.ul>
        </AnimatePresence>
      )}

      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-subtle">
        <span>Zdroj: Koleje a menzy UK · ceny pro studenty s průkazem</span>
        <a href={MENZA_WEB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
          Objednat a celý jídelníček <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
    </Card>
  );
}
