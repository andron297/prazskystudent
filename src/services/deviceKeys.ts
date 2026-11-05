/**
 * Klíč k datům uložený v tomto zařízení (aby se nemusel pokaždé zadávat
 * záchranný kód). Uloží se zašifrovaný „klíčem zařízení“, který je v IndexedDB
 * jako nevyexportovatelný CryptoKey – jeho surovou podobu nejde z prohlížeče
 * vytáhnout ani skriptem.
 */
import { del, get, set } from 'idb-keyval';
import { exportDek, fromB64, importDek, toB64 } from '../lib/vaultCrypto';

const DEVICE_KEY = 'stihnu:device-key';
const dekKey = (userId: string) => `stihnu:dek:${userId}`;

async function deviceKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(DEVICE_KEY);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await set(DEVICE_KEY, key);
  return key;
}

export async function rememberDek(userId: string, dek: CryptoKey): Promise<void> {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await exportDek(dek)));
  await set(dekKey(userId), { iv: toB64(iv), ct: toB64(ct) });
}

export async function recallDek(userId: string): Promise<CryptoKey | null> {
  try {
    const stored = await get<{ iv: string; ct: string }>(dekKey(userId));
    if (!stored) return null;
    const key = await deviceKey();
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(stored.iv) }, key, fromB64(stored.ct));
    return importDek(new Uint8Array(raw));
  } catch {
    return null;
  }
}

export async function forgetDek(userId: string): Promise<void> {
  await del(dekKey(userId)).catch(() => undefined);
}
