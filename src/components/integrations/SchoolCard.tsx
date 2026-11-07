/**
 * Vaše škola: fakulta (nebo jiná pražská škola), její budovy a vlastní místa.
 * Fakulta se pozná sama podle rozvrhu; změnit ji jde jedním klepnutím.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Building } from '../../types';
import { detectFaculty } from '../../lib/buildings';
import { FACULTIES, facultyBuildings, facultyById, myBuildingIds, type Faculty } from '../../lib/campus';
import { uid } from '../../lib/id';
import { geocode, type Place } from '../../services/journey';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { GlyphTile } from '../ui/Glyph';
import { cn } from '../ui/primitives';

/** Výběr fakulty: fakulty UK, pak další pražské školy. */
export function FacultyPicker({ value, suggested, onPick }: { value?: string | null; suggested?: string | null; onPick: (f: Faculty) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, Faculty[]>();
    for (const f of FACULTIES) map.set(f.school, [...(map.get(f.school) ?? []), f]);
    return [...map.entries()];
  }, []);
  return (
    <div className="space-y-3">
      {groups.map(([school, list]) => (
        <div key={school}>
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">{school}</p>
          <div className="flex flex-wrap gap-1.5">
            {list.map((f) => {
              const active = value === f.id;
              const hint = suggested === f.id && !active;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onPick(f)}
                  aria-pressed={active}
                  title={f.name}
                  className={cn(
                    'inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-[13px] font-bold ring-1 ring-inset transition',
                    active ? 'bg-accent text-accent-fg ring-accent' : hint ? 'bg-accent-soft text-accent ring-accent/40' : 'bg-surface text-muted ring-line-strong hover:text-fg',
                  )}
                >
                  {f.short}
                  {hint && <span className="text-[11px] font-bold opacity-80">· podle rozvrhu</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hledání adresy nebo místa a uložení jako vlastní budovy. */
function AddPlace({ onAdded }: { onAdded: (b: Building) => void }) {
  const upsertBuilding = useAppStore((s) => s.upsertBuilding);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    const t = setTimeout(() => {
      geocode(q, c.signal)
        .then((r) => setHits(r.slice(0, 5)))
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [text]);
  const add = (p: Place) => {
    const name = p.label.split(',')[0].trim();
    const building: Building = { id: uid('bld'), name, address: [p.label, p.detail].filter(Boolean).join(', '), coords: p.coords, aliases: [name.toLowerCase()], arrivalStops: [], custom: true, faculty: 'Vlastní' };
    upsertBuilding(building);
    onAdded(building);
    setText('');
    setHits([]);
    toast.success(`Přidáno: ${name}. V rozvrhu ho poznám podle názvu, nebo místnost přiřaďte ručně.`);
  };
  return (
    <div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Adresa nebo název budovy, např. Hybernská 3"
        className="h-11 w-full rounded-[14px] bg-surface px-3.5 text-[14px] ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent"
        aria-label="Hledat adresu budovy"
      />
      {(hits.length > 0 || loading) && (
        <ul className="mt-1.5 overflow-hidden rounded-[14px] bg-surface ring-1 ring-inset ring-line">
          {loading && hits.length === 0 && <li className="px-3.5 py-2.5 text-[13px] text-muted">Hledám…</li>}
          {hits.map((p, i) => (
            <li key={`${p.label}-${i}`}>
              <button type="button" onClick={() => add(p)} className="flex w-full flex-col px-3.5 py-2 text-left hover:bg-surface-2">
                <span className="text-[13.5px] font-semibold">{p.label}</span>
                {p.detail && <span className="text-[12px] text-muted">{p.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Výběr budov z katalogu (všechny pražské fakulty a školy) s hledáním. */
function CatalogPicker({ selected, onAdd }: { selected: Set<string>; onAdd: (b: Building) => void }) {
  const buildings = useAppStore((s) => s.settings.buildings);
  const [q, setQ] = useState('');
  const fold = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const list = buildings.filter((b) => !b.custom && !selected.has(b.id) && (!q.trim() || fold(`${b.name} ${b.faculty ?? ''} ${b.address}`).includes(fold(q.trim()))));
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Hledat budovu, fakultu nebo ulici"
        className="h-11 w-full rounded-[14px] bg-surface px-3.5 text-[14px] ring-1 ring-inset ring-line-strong outline-none focus:ring-2 focus:ring-accent"
        aria-label="Hledat budovu v katalogu"
      />
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
        {list.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onAdd(b)} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">{b.name}</span>
                <span className="block truncate text-[12px] text-muted">
                  {b.faculty ? `${b.faculty} · ` : ''}
                  {b.address}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] font-bold text-accent">Přidat</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">Nic nenalezeno – zkuste přidání podle adresy.</li>}
      </ul>
    </div>
  );
}

export function SchoolCard({ id = 'skola' }: { id?: string }) {
  const facultyId = useAppStore((s) => s.settings.faculty ?? null);
  const buildings = useAppStore((s) => s.settings.buildings);
  const myIds = useAppStore((s) => s.settings.myBuildings);
  const aliases = useAppStore((s) => s.settings.locationAliases);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const removeBuilding = useAppStore((s) => s.removeBuilding);
  const events = useVisibleEvents();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<'catalog' | 'address' | null>(null);
  const faculty = facultyById(facultyId);
  const detected = useMemo(() => detectFaculty(events, buildings, aliases), [events, buildings, aliases]);
  const ids = myBuildingIds({ myBuildings: myIds, faculty: facultyId, buildings });
  const mine = ids.map((x) => buildings.find((b) => b.id === x)).filter((b): b is Building => Boolean(b));

  const setMine = (next: string[]) => updateSettings({ myBuildings: [...new Set(next)] });
  const pick = (f: Faculty) => {
    updateSettings({ faculty: f.id, myBuildings: [...new Set([...f.buildings, ...ids.filter((x) => !(faculty?.buildings ?? []).includes(x))])] });
    setPicking(false);
    toast.success(`Vaše škola: ${f.short}. Budovy můžete níže doplnit nebo odebrat.`);
  };
  const remove = (b: Building) => {
    setMine(ids.filter((x) => x !== b.id));
    if (b.custom) removeBuilding(b.id);
  };
  const makeMain = (b: Building) => setMine([b.id, ...ids.filter((x) => x !== b.id)]);

  return (
    <section id={id} className="card scroll-mt-24 rounded-[26px] p-4 sm:p-5" aria-label="Škola a budovy">
      <header className="flex items-start gap-3">
        <GlyphTile name="building" size={46} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-subtle">Škola a budovy</p>
          <h2 className="font-display text-[26px] leading-none">{faculty ? faculty.short : <>Kde <em className="italic text-moss">studujete?</em></>}</h2>
          <p className="mt-1 text-[13px] text-muted">{faculty ? faculty.name : 'Vyberte fakultu a budovy – ukážu je na mapě, nabídnu v plánovači cest a najdu menzu poblíž.'}</p>
        </div>
        {faculty && !picking && (
          <button type="button" onClick={() => setPicking(true)} className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-accent hover:bg-accent-soft">
            Změnit fakultu
          </button>
        )}
      </header>

      {!faculty && detected && !picking && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[18px] bg-accent-soft/70 px-3.5 py-2.5 ring-1 ring-inset ring-accent/20">
          <p className="min-w-0 flex-1 text-[13px]">
            Podle rozvrhu to vypadá na <strong>{detected.faculty.short}</strong> ({detected.matches} {detected.matches === 1 ? 'hodina' : detected.matches < 5 ? 'hodiny' : 'hodin'} v jejích budovách).
          </p>
          <button type="button" onClick={() => pick(detected.faculty)} className="h-8 rounded-full bg-accent px-3.5 text-[12.5px] font-bold text-accent-fg">
            Ano, nastavit
          </button>
        </div>
      )}

      {(picking || !faculty) && (
        <div className="mt-4">
          <FacultyPicker value={facultyId} suggested={detected?.faculty.id} onPick={pick} />
          {picking && (
            <button type="button" onClick={() => setPicking(false)} className="mt-3 text-[13px] font-semibold text-muted hover:text-fg">
              Zrušit
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1.5 flex items-baseline justify-between text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">
          Moje budovy <span className="normal-case tracking-normal">{mine.length}</span>
        </p>
        {mine.length === 0 ? (
          <p className="rounded-[16px] bg-surface-2/70 px-3.5 py-3 text-[13px] text-muted">Zatím žádná budova. Vyberte fakultu nebo budovu přidejte níže.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mine.map((b, i) => (
              <li key={b.id} className="flex items-start gap-2 rounded-[16px] bg-surface-2/70 px-3.5 py-2.5 ring-1 ring-inset ring-line">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">
                    {b.name}
                    {i === 0 && <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">hlavní</span>}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{b.address}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {i > 0 && (
                    <button type="button" onClick={() => makeMain(b)} className="text-[12px] font-bold text-accent hover:underline">
                      Hlavní
                    </button>
                  )}
                  <button type="button" onClick={() => remove(b)} className="text-[12px] font-bold text-red-700 hover:underline dark:text-red-300">
                    Odebrat
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 rounded-[18px] bg-surface-2/50 p-3 ring-1 ring-inset ring-line">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[13.5px] font-bold">Přidat budovu</span>
          <button type="button" onClick={() => setAdding(adding === 'catalog' ? null : 'catalog')} aria-pressed={adding === 'catalog'} className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-bold ring-1 ring-inset', adding === 'catalog' ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface ring-line hover:bg-surface-2')}>
            Ze seznamu škol
          </button>
          <button type="button" onClick={() => setAdding(adding === 'address' ? null : 'address')} aria-pressed={adding === 'address'} className={cn('rounded-full px-3 py-1.5 text-[12.5px] font-bold ring-1 ring-inset', adding === 'address' ? 'bg-accent text-accent-fg ring-accent' : 'bg-surface ring-line hover:bg-surface-2')}>
            Podle adresy
          </button>
        </div>
        {adding === 'catalog' && (
          <div className="mt-3">
            <CatalogPicker
              selected={new Set(ids)}
              onAdd={(b) => {
                setMine([...ids, b.id]);
                toast.success(`Přidáno: ${b.name}`);
              }}
            />
          </div>
        )}
        {adding === 'address' && (
          <div className="mt-3">
            <AddPlace onAdded={(b) => setMine([...ids, b.id])} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Skupiny <option> pro výběr budovy: moje fakulta, vlastní, pak ostatní podle škol. */
export function BuildingOptions({ buildings, facultyId }: { buildings: Building[]; facultyId?: string | null }) {
  const faculty = facultyById(facultyId);
  const mine = facultyBuildings(faculty, buildings);
  const mineIds = new Set(mine.map((b) => b.id));
  const custom = buildings.filter((b) => b.custom && !mineIds.has(b.id));
  const rest = buildings.filter((b) => !b.custom && !mineIds.has(b.id));
  const bySchool = new Map<string, Building[]>();
  for (const b of rest) {
    const label = b.faculty ?? 'Další';
    bySchool.set(label, [...(bySchool.get(label) ?? []), b]);
  }
  return (
    <>
      {mine.length > 0 && (
        <optgroup label={`Moje škola – ${faculty?.short}`}>
          {mine.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
      {custom.length > 0 && (
        <optgroup label="Vaše místa">
          {custom.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
      {[...bySchool.entries()].map(([label, list]) => (
        <optgroup key={label} label={label}>
          {list.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
