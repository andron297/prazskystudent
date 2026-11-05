/**
 * Vlastní fotky (úvodní fotka, pozadí) – jen v tomto zařízení, v IndexedDB.
 * Před uložením se zmenší (max. 2400 px) a překreslí, čímž zmizí i údaje
 * z fotoaparátu včetně polohy (EXIF).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { deleteBlob, loadBlob, saveBlob } from '../lib/blobStore';

export const IMAGE_KEYS = { hero: 'appearance:hero', background: 'appearance:background' } as const;
export type ImageSlot = keyof typeof IMAGE_KEYS;

let version = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

const MAX_SIDE = 2400;

export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Vyberte prosím obrázek (JPG, PNG nebo WebP).');
  if (file.size > 30 * 1024 * 1024) throw new Error('Obrázek je moc velký (víc než 30 MB).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Tento formát se nepodařilo otevřít – zkuste JPG nebo PNG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Obrázek se nepodařilo zpracovat.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode('image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.88);
  if (!blob) throw new Error('Obrázek se nepodařilo zpracovat.');
  return blob;
}

export async function storeImage(slot: ImageSlot, file: File): Promise<void> {
  const blob = await prepareImage(file);
  await saveBlob(IMAGE_KEYS[slot], blob);
  bump();
}

export async function removeImage(slot: ImageSlot): Promise<void> {
  await deleteBlob(IMAGE_KEYS[slot]);
  bump();
}

/** Adresa (blob:) vlastní fotky. `undefined` = načítá se, `null` = žádná není. */
export function useLocalImage(slot: ImageSlot, enabled = true): string | null | undefined {
  const v = useSyncExternalStore(subscribe, () => version);
  const [url, setUrl] = useState<string | null | undefined>(enabled ? undefined : null);
  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let alive = true;
    let created: string | null = null;
    void loadBlob(IMAGE_KEYS[slot]).then((blob) => {
      if (!alive) return;
      if (!blob) {
        setUrl(null);
        return;
      }
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [slot, enabled, v]);
  return url;
}
