/**
 * Šifrování dat účtu přímo v zařízení (end-to-end). Server vidí jen
 * zašifrovaný obsah – klíč k datům (DEK, AES-256-GCM) se nikdy neposílá
 * v čitelné podobě:
 *  - zabalený záchranným kódem (125 bitů náhody → HKDF),
 *  - u účtů s heslem i klíčem odvozeným z hesla (PBKDF2-SHA256, 600 000 iterací).
 * Heslo na server nejde ani k přihlášení: Supabase dostane jen odvozený
 * „přihlašovací otisk“ (jiná větev téže derivace), takže z něj klíč k datům
 * spočítat nejde.
 */

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600_000;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_LENGTH = 25;

/* ------------------------------ kódování ------------------------------- */

export function toB64(bytes: Uint8Array<ArrayBuffer>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const toHex = (bytes: Uint8Array<ArrayBuffer>) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function random(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/* ---------------------------- záchranný kód ---------------------------- */

/** 25 znaků (Crockford base32, bez I L O U) = 125 bitů náhody, po pěticích. */
export function generateRecoveryCode(): string {
  const bytes = random(RECOVERY_LENGTH);
  const chars = [...bytes].map((b) => CROCKFORD[b & 31]).join('');
  return chars.match(/.{5}/g)!.join('-');
}

/** Přepis kódu z papíru: velikost písmen, mezery, pomlčky, záměny O→0, I/L→1. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
  if (s.length !== RECOVERY_LENGTH || [...s].some((c) => !CROCKFORD.includes(c))) return null;
  return s.match(/.{5}/g)!.join('-');
}

/* -------------------------------- klíče -------------------------------- */

export async function generateDek(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportDek(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle.exportKey('raw', key));
}

export async function importDek(raw: Uint8Array<ArrayBuffer>, extractable = true): Promise<CryptoKey> {
  return subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, ['encrypt', 'decrypt']);
}

/** Klíč k zabalení DEK ze záchranného kódu (kód má dost náhody, stačí HKDF). */
export async function recoveryWrapKey(code: string): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error('Záchranný kód má 25 znaků (písmena a číslice). Zkontrolujte ho prosím.');
  const ikm = await subtle.importKey('raw', enc.encode(normalized), 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('stihnu/recovery/v1'), info: enc.encode('dek-wrap') }, ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface PasswordKeys {
  /** Posílá se do Supabase místo hesla (heslo samo server nevidí). */
  authSecret: string;
  /** Balí klíč k datům – nikdy neopustí zařízení. */
  wrapKey: CryptoKey;
}

/** Jedna pomalá derivace z hesla (sůl = e-mail), rozdělená na dvě nezávislé části. */
export async function passwordKeys(password: string, email: string, iterations = KDF_ITERATIONS): Promise<PasswordKeys> {
  const base = await subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`stihnu/v1/${email.trim().toLowerCase()}`), iterations }, base, 512));
  const authSecret = toHex(bits.slice(0, 32));
  const wrapKey = await subtle.importKey('raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { authSecret, wrapKey };
}

const DEK_AAD = enc.encode('stihnu-dek-v1');

export async function wrapDek(dek: CryptoKey, wrapKey: CryptoKey): Promise<string> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: DEK_AAD }, wrapKey, await exportDek(dek)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function unwrapDek(wrapped: string, wrapKey: CryptoKey): Promise<CryptoKey> {
  const raw = fromB64(wrapped);
  try {
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: DEK_AAD }, wrapKey, raw.slice(12));
    return importDek(new Uint8Array(plain));
  } catch {
    throw new Error('Kód nebo heslo nesedí – data se odemknout nepodařilo.');
  }
}

/* ------------------------------- obsah --------------------------------- */

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Zašifruje JSON: komprese → AES-GCM. AAD váže obsah na konkrétní účet,
 * takže zašifrovaný trezor nejde podstrčit jinému uživateli.
 */
export async function sealJson(dek: CryptoKey, value: unknown, aad: string): Promise<{ ciphertext: string; iv: string }> {
  const json = enc.encode(JSON.stringify(value));
  const compressed = typeof CompressionStream !== 'undefined';
  const body = compressed ? await gzip(json) : json;
  const payload = new Uint8Array(body.length + 1);
  payload[0] = compressed ? 1 : 0;
  payload.set(body, 1);
  const iv = random(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, dek, payload));
  return { ciphertext: toB64(ct), iv: toB64(iv) };
}

export async function openJson<T>(dek: CryptoKey, ciphertext: string, iv: string, aad: string): Promise<T> {
  let plain: Uint8Array<ArrayBuffer>;
  try {
    plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: enc.encode(aad) }, dek, fromB64(ciphertext)));
  } catch {
    throw new Error('Data účtu se nepodařilo rozšifrovat (jiný klíč nebo poškozená data).');
  }
  const body = plain.slice(1);
  const json = plain[0] === 1 ? await gunzip(body) : body;
  return JSON.parse(dec.decode(json)) as T;
}

/* ---------------------- kontrola uniklých hesel ------------------------ */

/**
 * Bylo heslo někde v úniku? (Have I Been Pwned, k-anonymita: odchází jen
 * prvních 5 znaků SHA-1 otisku, heslo ani celý otisk ne.)
 */
export async function passwordLeaked(password: string): Promise<boolean> {
  const hash = toHex(new Uint8Array(await subtle.digest('SHA-1', enc.encode(password)))).toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
    if (!response.ok) return false;
    const text = await response.text();
    return text.split('\n').some((line) => line.split(':')[0]?.trim() === hash.slice(5) && Number(line.split(':')[1]) > 0);
  } catch {
    return false;
  }
}
