/** Přístupový token účtu Stihnuto pro vlastní API (bez závislostí – kvůli cyklickým importům). */
let token: string | null = null;

export function setAccountToken(next: string | null): void {
  token = next;
}

export function accountAuthHeader(): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function hasAccountToken(): boolean {
  return Boolean(token);
}
