/** Vlastní nahrané soubory se ukládají do IndexedDB (localStorage by na ně nestačil). */
import { createStore, del, get, set, type UseStore } from 'idb-keyval';

let store: UseStore | null = null;

function getStore(): UseStore {
  if (!store) store = createStore('stihnu-files', 'blobs');
  return store;
}

export async function saveBlob(key: string, blob: Blob): Promise<void> {
  await set(key, blob, getStore());
}

export async function loadBlob(key: string): Promise<Blob | undefined> {
  try {
    return await get<Blob>(key, getStore());
  } catch {
    return undefined;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    await del(key, getStore());
  } catch {
    // soubor už neexistuje
  }
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
