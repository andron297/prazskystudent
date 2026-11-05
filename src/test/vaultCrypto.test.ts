import { describe, expect, it } from 'vitest';
import { generateDek, generateRecoveryCode, normalizeRecoveryCode, openJson, passwordKeys, recoveryWrapKey, sealJson, unwrapDek, wrapDek, exportDek } from '../lib/vaultCrypto';

describe('šifrování účtu (end-to-end)', () => {
  it('záchranný kód: 25 znaků, odolný proti překlepům při přepisu', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
    expect(normalizeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
    expect(normalizeRecoveryCode('OOOOO-IIIII-LLLLL-UUUUU-00000')).toBe('00000-11111-11111-VVVVV-00000');
    expect(normalizeRecoveryCode('krátký')).toBeNull();
  });

  it('klíč k datům se odemkne jen správným kódem', async () => {
    const dek = await generateDek();
    const code = generateRecoveryCode();
    const wrapped = await wrapDek(dek, await recoveryWrapKey(code));
    const back = await unwrapDek(wrapped, await recoveryWrapKey(code));
    expect(await exportDek(back)).toEqual(await exportDek(dek));
    await expect(unwrapDek(wrapped, await recoveryWrapKey(generateRecoveryCode()))).rejects.toThrow(/nesedí/);
  });

  it('heslo: přihlašovací otisk a klíč jsou různé a server heslo nevidí', async () => {
    const a = await passwordKeys('správné koně baterie sponka', 'Student@Example.cz', 2000);
    const b = await passwordKeys('správné koně baterie sponka', 'student@example.cz', 2000);
    expect(a.authSecret).toBe(b.authSecret);
    expect(a.authSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(a.authSecret).not.toContain('kon');
    const dek = await generateDek();
    const wrapped = await wrapDek(dek, a.wrapKey);
    expect(await exportDek(await unwrapDek(wrapped, b.wrapKey))).toEqual(await exportDek(dek));
    const other = await passwordKeys('jiné heslo', 'student@example.cz', 2000);
    await expect(unwrapDek(wrapped, other.wrapKey)).rejects.toThrow();
  });

  it('trezor: šifruje, komprimuje a je svázaný s účtem', async () => {
    const dek = await generateDek();
    const data = { subjects: [{ id: 's1', name: 'Sociální psychologie' }], tasks: Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, title: 'Esej' })) };
    const sealed = await sealJson(dek, data, 'user-1');
    expect(sealed.ciphertext).not.toContain('psychologie');
    expect(await openJson(dek, sealed.ciphertext, sealed.iv, 'user-1')).toEqual(data);
    await expect(openJson(dek, sealed.ciphertext, sealed.iv, 'user-2')).rejects.toThrow(/rozšifrovat/);
  });
});
