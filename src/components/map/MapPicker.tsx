/**
 * Výběr místa na mapě: posunete mapu tak, aby špendlík ukazoval na cíl,
 * a potvrdíte. Adresa se dohledá sama (plánovač Transitous).
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import { LoaderCircle, MapPin } from 'lucide-react';
import type { LatLng } from '../../types';
import { useResolvedTheme } from '../../hooks/useAppShell';
import { reverseGeocode, type Place } from '../../services/journey';
import { Modal } from '../ui/overlays';
import { Button } from '../ui/primitives';
import { applyNature, STYLE_URL } from './mapStyle';

setWorkerUrl(workerUrl);

function Pin() {
  return (
    <svg viewBox="0 0 40 52" className="h-[52px] w-10 drop-shadow-[0_8px_14px_rgb(0_0_0/0.35)]" aria-hidden>
      <path d="M20 51c0 0 17-17.6 17-30.5A17 17 0 0 0 3 20.5C3 33.4 20 51 20 51z" fill="var(--accent)" stroke="#fff" strokeWidth="2.5" />
      <circle cx="20" cy="20.5" r="6.5" fill="#fff" />
    </svg>
  );
}

export default function MapPicker({ open, title, start, onPick, onClose }: { open: boolean; title: string; start: LatLng; onPick: (place: Place) => void; onClose: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const [center, setCenter] = useState<LatLng>(start);
  const [place, setPlace] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let map: MapLibreMap | null = null;
    // Mapa až po otevření okna (kontejner musí mít rozměry).
    const t = setTimeout(() => {
      if (!holder.current) return;
      map = new MapLibreMap({
        container: holder.current,
        style: STYLE_URL[theme],
        center: [start.lng, start.lat],
        zoom: 15.5,
        minZoom: 8,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.on('load', () => {
        if (!map) return;
        map.resize();
        applyNature(map, theme);
      });
      // Okno se ještě animuje – po dojetí přepočítat rozměr mapy.
      setTimeout(() => map?.resize(), 450);
      map.on('moveend', () => {
        if (!map) return;
        const c = map.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      setCenter(start);
    }, 120);
    return () => {
      clearTimeout(t);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      void reverseGeocode(center, ctrl.signal).then((p) => {
        if (!ctrl.signal.aborted) {
          setPlace(p);
          setBusy(false);
        }
      });
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, center.lat, center.lng]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={MapPin}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Zrušit
          </Button>
          <Button onClick={() => onPick(place && !busy ? { ...place, coords: center } : { kind: 'place', label: 'Místo na mapě', detail: 'vybráno na mapě', coords: center })}>Vybrat toto místo</Button>
        </div>
      }
    >
      <div className="relative h-[58vh] min-h-[300px] overflow-hidden rounded-[18px] bg-surface-2 ring-1 ring-inset ring-line">
        <div ref={holder} className="h-full w-full" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <Pin />
        </div>
      </div>
      <p className="mt-3 flex min-h-6 items-center gap-2 text-[14px]">
        {busy ? <LoaderCircle className="size-4 animate-spin text-subtle" aria-hidden /> : <MapPin className="size-4 text-accent" aria-hidden />}
        <span className="min-w-0 truncate">
          <strong>{place?.label ?? 'Posuňte mapu na cíl'}</strong>
          {place?.detail ? <span className="text-muted"> · {place.detail}</span> : null}
        </span>
      </p>
    </Modal>
  );
}
