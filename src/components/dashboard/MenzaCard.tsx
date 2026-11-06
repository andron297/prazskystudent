/**
 * Jídelníček menzy: hlavní menza (výchozí Arnošta z Pardubic, jednou se
 * zeptáme), oblíbené se přepínají jedním klepnutím a nabídne se i menza
 * nejblíž dnešní výuce. Studentské ceny, alergeny, víc dní dopředu.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ExternalLink, Leaf, MapPin, RefreshCw, Route, SlidersHorizontal, Soup, Star, UtensilsCrossed } from 'lucide-react';
import type { Building, LatLng } from '../../types';
import { addDays, formatDayMonth, formatWeekdayShort, isSameDay, toDateKey } from '../../lib/dates';
import { ALLERGENS, CANTEENS, canteenById, MENZA_WEB, nearestCanteens } from '../../lib/menza';
import { formatDistance, haversineMeters, walkingMinutes } from '../../lib/geo';
import { planTripTo } from '../../store/journeyStore';
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

export const DEFAULT_CANTEEN = 9; // Menza Arnošta z Pardubic

/** Výběr oblíbených menz (až 4); první je hlavní. */
function CanteenChooser({ initial, suggested, onSave, onCancel, first }: { initial: number[]; suggested: number[]; onSave: (ids: number[]) => void; onCancel?: () => void; first?: boolean }) {
  const [sel, setSel] = useState<number[]>(initial);
  const toggle = (id: number) => setSel((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length >= 4 ? list : [...list, id]));
  const makePrimary = (id: number) => setSel((list) => [id, ...list.filter((x) => x !== id)]);
  const order = [...CANTEENS].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));
  return (
    <div className="rounded-[20px] bg-surface-2/70 p-3.5 ring-1 ring-inset ring-line">
      <p className="text-[14px] font-bold">{first ? 'Kam chodíte nejčastěji na oběd?' : 'Vaše menzy'}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">Vyberte až 4. První je hlavní – tu uvidíte hned, mezi ostatními přepnete jedním klepnutím.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {order.map((c) => {
          const i = sel.indexOf(c.id);
          const on = i !== -1;
          return (
            <span key={c.id} className={cn('inline-flex items-center rounded-full text-[12.5px] font-semibold ring-1 ring-inset transition', on ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface text-muted ring-line-strong hover:text-fg')}>
              <button type="button" onClick={() => toggle(c.id)} aria-pressed={on} className="inline-flex h-8 items-center gap-1 pl-3 pr-2.5">
                {c.short}
                {suggested.includes(c.id) && !on && <span className="text-[10.5px] font-bold text-accent">· blízko výuky</span>}
              </button>
              {on && (
                <button type="button" onClick={() => makePrimary(c.id)} className="mr-1 grid size-6 place-items-center rounded-full hover:bg-white/15" aria-label={i === 0 ? `${c.short} je hlavní` : `Nastavit ${c.short} jako hlavní`} title={i === 0 ? 'Hlavní menza' : 'Nastavit jako hlavní'}>
                  <Star className={cn('size-3.5', i === 0 && 'fill-current')} aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button type="button" disabled={sel.length === 0} onClick={() => onSave(sel)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-bold text-accent-fg hover:brightness-110 disabled:opacity-50">
          <Check className="size-4" aria-hidden /> Uložit
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-full px-3 text-[13px] font-semibold text-muted hover:text-fg">
            {first ? `Nechat ${canteenById(DEFAULT_CANTEEN)?.short}` : 'Zrušit'}
          </button>
        )}
      </div>
    </div>
  );
}

export function MenzaCard({ now, building, fallback }: { now: Date; building?: Building | null; fallback?: LatLng | null }) {
  const menza = useAppStore((s) => s.settings.menza);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const near = useMemo(() => (building ? nearestCanteens(building.coords, 3) : fallback ? nearestCanteens(fallback, 3) : []), [building, fallback]);
  const favorites = menza?.canteenIds?.length ? menza.canteenIds : [DEFAULT_CANTEEN];
  const asked = Boolean(menza?.asked);
  const [editing, setEditing] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  // Menza nejblíž dnešní výuce, pokud není mezi oblíbenými
  const nearby = building && near[0] && !favorites.includes(near[0].canteen.id) ? near[0].canteen : null;
  const ids = [...favorites.slice(0, nearby ? 3 : 4), ...(nearby ? [nearby.id] : [])];
  const canteenId = shown && ids.includes(shown) ? shown : favorites[0];
  const canteen = canteenById(canteenId);
  const from = toDateKey(now);
  const { data, error, loading } = useMenza(ids, from);
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
  const save = (list: number[]) => {
    updateSettings({ menza: { canteenIds: list, asked: true } });
    setShown(null);
    setEditing(false);
  };

  return (
    <Card
      data-tour="menza"
      title={
        <>
          Jídelníček <em className="italic text-moss">menzy</em>
        </>
      }
      eyebrow={canteen?.name ?? 'Menza'}
      action={
        asked && !editing ? (
          <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg" aria-label="Upravit oblíbené menzy" title="Oblíbené menzy">
            <SlidersHorizontal className="size-4" aria-hidden />
          </button>
        ) : undefined
      }
    >
      {(!asked || editing) && (
        <div className="mb-3">
          <CanteenChooser first={!asked} initial={favorites} suggested={near.map((n) => n.canteen.id)} onSave={save} onCancel={() => (asked ? setEditing(false) : save(favorites))} />
        </div>
      )}

      {ids.length > 1 && (
        <div className="scrollbar-none -mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Menza">
          {ids.map((id, i) => {
            const c = canteenById(id);
            const active = id === canteenId;
            const isNearby = nearby?.id === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setShown(id);
                  setPicked(null);
                }}
                className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12.5px] font-bold transition-colors', active ? 'bg-fg text-canvas' : isNearby ? 'border border-dashed border-line-strong text-muted hover:text-fg' : 'bg-surface text-muted ring-1 ring-inset ring-line hover:text-fg')}
              >
                {i === 0 && !isNearby && <Star className="size-3 fill-current" aria-hidden />}
                {isNearby && <MapPin className="size-3" aria-hidden />}
                {c?.short}
                {isNearby && <span className="font-semibold opacity-75">· u výuky</span>}
              </button>
            );
          })}
        </div>
      )}

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

      {canteen && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[16px] bg-surface-2/70 px-3 py-2 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden />
            {canteen.short}
            {building ? ` · ${formatDistance(haversineMeters(building.coords, canteen.coords))} od budovy ${building.name} (asi ${walkingMinutes(building.coords, canteen.coords)} min pěšky)` : ''}
          </span>
          <button type="button" onClick={() => planTripTo(canteen.name, canteen.coords, 'menza')} className="ml-auto inline-flex h-7 items-center gap-1 rounded-full bg-surface px-3 text-[12px] font-bold text-fg ring-1 ring-inset ring-line hover:bg-surface-2">
            <Route className="size-3.5" aria-hidden /> Trasa
          </button>
        </div>
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
