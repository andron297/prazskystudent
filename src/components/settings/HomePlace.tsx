/**
 * Domov: kam vede „Domů“ v kartě Kam dál po výuce. Stačí napsat adresu nebo
 * místo (koleje, ulice), případně vzít polohu telefonu.
 */
import { useState } from 'react';
import { geocode, type Place } from '../../services/journey';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { Glyph } from '../ui/Glyph';
import { Button, Card, TextInput } from '../ui/primitives';

export function HomePlace() {
  const home = useAppStore((s) => s.settings.home ?? null);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!home);

  const search = async () => {
    if (q.trim().length < 3) return;
    setBusy(true);
    try {
      const found = await geocode(q.trim());
      setResults(found.slice(0, 6));
      if (!found.length) toast.info('Nic jsem nenašel – zkuste ulici s číslem nebo název místa.');
    } catch {
      toast.error('Hledání adresy se nepovedlo.');
    } finally {
      setBusy(false);
    }
  };
  const save = (label: string, lat: number, lng: number) => {
    updateSettings({ home: { label, coords: { lat, lng } } });
    setResults([]);
    setQ('');
    setEditing(false);
    toast.success(`Domov: ${label}`);
  };
  const useGps = () => {
    if (!('geolocation' in navigator)) return toast.error('Tento prohlížeč polohu neumí.');
    navigator.geolocation.getCurrentPosition(
      (p) => save('Moje poloha (domov)', p.coords.latitude, p.coords.longitude),
      () => toast.error('Polohu se nepodařilo zjistit.'),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  return (
    <Card eyebrow="Kam dál po výuce" title={<>Domov</>}>
      {home && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <Glyph name="home" size={22} className="text-accent" />
          <span className="min-w-0 flex-1 text-[15px] font-bold">{home.label}</span>
          <Button size="sm" onClick={() => setEditing(true)}>
            Změnit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => updateSettings({ home: null })}>
            Odebrat
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13.5px] leading-relaxed text-muted">Když vám skončí výuka, nabídnu cestu na další bod programu z kalendáře, nebo domů. Domov zůstává jen ve vašem účtu (šifrovaně).</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adresa nebo místo, třeba „Kolej Hvězda“" className="min-w-0 flex-1" />
            <Button type="submit" loading={busy}>
              Najít
            </Button>
          </form>
          {results.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-[16px] ring-1 ring-inset ring-line">
              {results.map((r) => (
                <li key={`${r.label}-${r.coords.lat}`}>
                  <button type="button" onClick={() => save(r.label, r.coords.lat, r.coords.lng)} className="block w-full px-3.5 py-2.5 text-left hover:bg-surface-2">
                    <span className="block text-[14px] font-semibold">{r.label}</span>
                    {r.detail && <span className="block text-[12.5px] text-muted">{r.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={useGps} className="text-[13px] font-bold text-accent hover:underline">
            Jsem doma – použít polohu telefonu
          </button>
        </div>
      )}
    </Card>
  );
}
