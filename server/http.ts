/** Sdílené pomocníky pro serverové handlery (Web Request/Response API). */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return json({ error: 'timeout', message: 'Vzdálená služba neodpověděla včas.' }, 504);
  }
  const message = error instanceof Error ? error.message : String(error);
  return json({ error: 'internal_error', message: `Neočekávaná chyba serveru: ${message}` }, 500);
}

export function methodNotAllowed(allowed: string[]): Response {
  return json({ error: 'method_not_allowed', message: `Povolené metody: ${allowed.join(', ')}` }, 405, {
    allow: allowed.join(', '),
  });
}

export async function readJsonBody<T>(request: Request, maxBytes = 200_000): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > maxBytes) throw new HttpError(413, 'payload_too_large', 'Požadavek je příliš velký.');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'payload_too_large', 'Požadavek je příliš velký.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Tělo požadavku není platný JSON.');
  }
}

/** Hodnota hlavičky nebo proměnné prostředí (klíč zadaný uživatelem má přednost). */
export function pickKey(request: Request, header: string, envName: string): string | undefined {
  const fromHeader = request.headers.get(header)?.trim();
  if (fromHeader) return fromHeader;
  const fromEnv = process.env[envName]?.trim();
  return fromEnv || undefined;
}
