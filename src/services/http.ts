/** Jednotné volání HTTP s časovým limitem a čitelnými chybami. */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function doFetch(input: string, options: RequestOptions): Promise<Response> {
  const { timeoutMs = 15_000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(0, init.signal?.aborted ? 'aborted' : 'timeout', init.signal?.aborted ? 'Požadavek byl zrušen.' : 'Služba neodpověděla včas.');
    }
    throw new ApiError(0, 'network', 'Nepodařilo se spojit se serverem. Jsi online?');
  } finally {
    clearTimeout(timer);
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  let message = `Server odpověděl chybou ${response.status}.`;
  try {
    const text = await response.text();
    const data = JSON.parse(text) as { error?: string; message?: string };
    if (data.error) code = data.error;
    if (data.message) message = data.message;
  } catch {
    // tělo není JSON
  }
  if (response.status === 404 && code === 'http_404') {
    message = 'API proxy není dostupná (statický hosting bez serverových funkcí?).';
    code = 'proxy_unavailable';
  }
  return new ApiError(response.status, code, message);
}

export async function requestJson<T>(input: string, options: RequestOptions = {}): Promise<T> {
  const response = await doFetch(input, options);
  if (!response.ok) throw await errorFromResponse(response);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, 'invalid_json', 'Odpověď serveru není platný JSON.');
  }
}

export async function requestText(input: string, options: RequestOptions = {}): Promise<string> {
  const response = await doFetch(input, options);
  if (!response.ok) throw await errorFromResponse(response);
  return response.text();
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return String(error);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
