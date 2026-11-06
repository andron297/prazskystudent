/**
 * Vaše škola: fakulta (nebo jiná pražská škola), její budovy a vlastní místa.
 * Fakulta se pozná sama podle rozvrhu; změnit ji jde jedním klepnutím.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Building } from '../../types';
import { detectFaculty } from '../../lib/buildings';
import { FACULTIES, facultyBuildings, facultyById, type Faculty } from '../../lib/campus';
import { uid } from '../../lib/id';
import { geocode, type Place } from '../../services/journey';
import { useVisibleEvents } from '../../hooks/useVisibleEvents';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { Emoji3D } from '../ui/Emoji3D';
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

export function SchoolCard({ id = 'skola' }: { id?: string }) {
  const facultyId = useAppStore((s) => s.settings.faculty ?? null);
  const buildings = useAppStore((s) => s.settings.buildings);
  const aliases = useAppStore((s) => s.settings.locationAliases);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const removeBuilding = useAppStore((s) => s.removeBuilding);
  const events = useVisibleEvents();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const faculty = facultyById(facultyId);
  const detected = useMemo(() => detectFaculty(events, buildings, aliases), [events, buildings, aliases]);
  const mine = facultyBuildings(faculty, buildings);
  const custom = buildings.filter((b) => b.custom);

  const pick = (f: Faculty) => {
    updateSettings({ faculty: f.id });
    setPicking(false);
    toast.success(`Vaše škola: ${f.short}. Budovy se ukážou na mapě a v plánovači cest.`);
  };

  return (
    <section id={id} className="card scroll-mt-24 rounded-[26px] p-4 sm:p-5" aria-label="Vaše škola a budovy">
      <header className="flex items-start gap-3">
        <Emoji3D name="classical-building" size={46} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-subtle">Škola a budovy</p>
          <h2 className="font-display text-[26px] leading-none">{faculty ? faculty.short : <>Kde <em className="italic text-moss">studujete?</em></>}</h2>
          <p className="mt-1 text-[13px] text-muted">{faculty ? faculty.name : 'Podle fakulty ukážu vaše budovy na mapě, nabídnu je v plánovači cest a najdu menzu poblíž.'}</p>
        </div>
        {faculty && !picking && (
          <button type="button" onClick={() => setPicking(true)} className="shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-accent hover:bg-accent-soft">
            Změnit
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

      {faculty && !picking && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {mine.map((b, i) => (
            <li key={b.id} className="rounded-[16px] bg-surface-2/70 px-3.5 py-2.5 ring-1 ring-inset ring-line">
              <p className="text-[13.5px] font-bold">
                {b.name}
                {i === 0 && <span className="ml-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">hlavní</span>}
              </p>
              <p className="text-[12px] text-muted">{b.address}</p>
            </li>
          ))}
        </ul>
      )}

      {custom.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-subtle">Vaše místa</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {custom.map((b) => (
              <li key={b.id} className="flex items-start gap-2 rounded-[16px] bg-surface-2/70 px-3.5 py-2.5 ring-1 ring-inset ring-line">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold">{b.name}</span>
                  <span className="block truncate text-[12px] text-muted">{b.address}</span>
                </span>
                <button type="button" onClick={() => removeBuilding(b.id)} className="shrink-0 text-[12px] font-bold text-red-700 hover:underline dark:text-red-300">
                  Odebrat
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        {adding ? (
          <AddPlace onAdded={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-[13px] font-bold text-accent hover:underline">
            Učíte se i jinde? Přidat budovu podle adresy
          </button>
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
