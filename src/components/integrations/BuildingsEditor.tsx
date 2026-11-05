import { useState } from 'react';
import { Building, MapPin, Pencil, Plus, RotateCcw, Trash, TramFront } from 'lucide-react';
import type { ArrivalStop, Building as BuildingType } from '../../types';
import { uid } from '../../lib/id';
import { isValidLatLng } from '../../lib/geo';
import { useAppStore } from '../../store/appStore';
import { confirmAction, toast } from '../../store/uiStore';
import { Modal } from '../ui/overlays';
import { Button, Card, Chip, Field, IconButton, TextInput } from '../ui/primitives';

export function BuildingsEditor() {
  const buildings = useAppStore((s) => s.settings.buildings);
  const removeBuilding = useAppStore((s) => s.removeBuilding);
  const resetBuildings = useAppStore((s) => s.resetBuildings);
  const [editing, setEditing] = useState<BuildingType | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  const edit = (b: BuildingType | null) => {
    setEditing(b);
    setKey((k) => k + 1);
    setOpen(true);
  };

  return (
    <Card
      title="Budovy fakulty a cílové zastávky"
      icon={Building}
      action={
        <span className="flex gap-1">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => resetBuildings()} title="Obnovit výchozí budovy (vlastní zůstanou)">
            Výchozí
          </Button>
          <Button size="sm" variant="soft" icon={Plus} onClick={() => edit(null)}>
            Budova
          </Button>
        </span>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        Z lokace v rozvrhu (např. „H212“) se pozná budova a její cílové zastávky MHD s pěším přesunem – to je vstup pro zpětný výpočet odjezdu.
      </p>
      <ul className="divide-y divide-[var(--line)]">
        {buildings.map((b) => (
          <li key={b.id} className="flex items-start gap-3 py-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium">
                {b.name} {b.faculty && <span className="font-normal text-muted">· {b.faculty}</span>}
              </p>
              <p className="truncate text-xs text-muted">{b.address}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {b.arrivalStops.map((s) => (
                  <Chip key={s.name} icon={TramFront}>
                    {s.name} · {s.walkMinutes} min
                  </Chip>
                ))}
                {b.roomPattern && <Chip>místnosti {b.roomPattern.replace(/^\^|\\d\{.*$/g, '').replace(/\$$/, '') || 'vzor'}…</Chip>}
              </div>
            </div>
            <IconButton icon={Pencil} label={`Upravit ${b.name}`} size="sm" onClick={() => edit(b)} />
            <IconButton
              icon={Trash}
              label={`Smazat ${b.name}`}
              size="sm"
              tone="danger"
              onClick={async () => {
                if (await confirmAction({ title: `Smazat budovu ${b.name}?`, message: 'Rozvrhové lístky v této budově ztratí dopravní navigaci, dokud je nepřiřadíte jinam.', confirmLabel: 'Smazat', tone: 'danger' })) removeBuilding(b.id);
              }}
            />
          </li>
        ))}
      </ul>
      <BuildingModal key={key} open={open} onClose={() => setOpen(false)} building={editing} />
    </Card>
  );
}

function BuildingModal({ open, onClose, building }: { open: boolean; onClose: () => void; building: BuildingType | null }) {
  const upsertBuilding = useAppStore((s) => s.upsertBuilding);
  const [name, setName] = useState(building?.name ?? '');
  const [locative, setLocative] = useState(building?.locative ?? '');
  const [faculty, setFaculty] = useState(building?.faculty ?? '');
  const [address, setAddress] = useState(building?.address ?? '');
  const [lat, setLat] = useState(building ? String(building.coords.lat) : '50.0875');
  const [lng, setLng] = useState(building ? String(building.coords.lng) : '14.4213');
  const [aliases, setAliases] = useState((building?.aliases ?? []).join(', '));
  const [roomPattern, setRoomPattern] = useState(building?.roomPattern ?? '');
  const [stops, setStops] = useState<ArrivalStop[]>(building?.arrivalStops ?? [{ name: '', walkMinutes: 5 }]);

  const save = () => {
    const coords = { lat: Number(lat.replace(',', '.')), lng: Number(lng.replace(',', '.')) };
    if (!name.trim() || !isValidLatLng(coords)) {
      toast.error('Vyplňte název a platné souřadnice (např. 50.0843, 14.4136).');
      return;
    }
    if (roomPattern.trim()) {
      try {
        new RegExp(roomPattern.trim());
      } catch {
        toast.error('Vzor místností není platný regulární výraz.');
        return;
      }
    }
    upsertBuilding({
      id: building?.id ?? uid('bld'),
      name: name.trim(),
      locative: locative.trim() || undefined,
      faculty: faculty.trim() || undefined,
      address: address.trim(),
      coords,
      aliases: aliases
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
      roomPattern: roomPattern.trim() || undefined,
      arrivalStops: stops.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim(), walkMinutes: Math.max(0, Math.round(s.walkMinutes)) })),
      custom: building?.custom ?? true,
    });
    toast.success('Budova uložena.');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={building ? `Upravit: ${building.name}` : 'Nová budova'}
      icon={Building}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button variant="primary" onClick={save}>
            Uložit
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Název">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Hollar" />
        </Field>
        <Field label="Ve větě („Seminář … začíná“)" hint="Např. „na Hollaru“, „v Jinonicích“.">
          <TextInput value={locative} onChange={(e) => setLocative(e.target.value)} />
        </Field>
        <Field label="Fakulta">
          <TextInput value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="FSV UK" />
        </Field>
        <Field label="Adresa">
          <TextInput value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Smetanovo nábřeží 6, Praha 1" />
        </Field>
        <Field label="Zeměpisná šířka">
          <TextInput value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Zeměpisná délka">
          <TextInput value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Klíčová slova v lokaci" hint="Oddělená čárkou, bez diakritiky nevadí.">
          <TextInput value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="hollar, smetanovo nabr" />
        </Field>
        <Field label="Vzor kódu místností (regex)" hint="Např. ^H\d{1,4}$ pro H212.">
          <TextInput value={roomPattern} onChange={(e) => setRoomPattern(e.target.value)} className="font-mono" />
        </Field>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[13px] font-medium">Cílové zastávky MHD (přesný název podle PID) a pěší přesun do budovy</p>
        <ul className="space-y-2">
          {stops.map((stop, i) => (
            <li key={i} className="flex items-center gap-2">
              <TextInput value={stop.name} onChange={(e) => setStops((s) => s.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Národní divadlo" aria-label="Název zastávky" />
              <TextInput type="number" min={0} max={30} value={stop.walkMinutes} onChange={(e) => setStops((s) => s.map((x, j) => (j === i ? { ...x, walkMinutes: Number(e.target.value) } : x)))} className="w-24" aria-label="Minut pěšky" />
              <span className="text-xs text-muted">min</span>
              <IconButton icon={Trash} label="Odebrat zastávku" size="sm" tone="danger" onClick={() => setStops((s) => s.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
        <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setStops((s) => [...s, { name: '', walkMinutes: 5 }])}>
          Přidat zastávku
        </Button>
      </div>
    </Modal>
  );
}
