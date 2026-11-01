/** Stav serveru: které klíče jsou nastavené na serveru (bez prozrazení hodnot). */
import { json, methodNotAllowed } from './http.js';

export async function handleHealth(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  return json({
    ok: true,
    time: new Date().toISOString(),
    serverKeys: {
      golemio: Boolean(process.env.GOLEMIO_API_KEY?.trim()),
      google: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    },
    proxyAllowlist: Boolean(process.env.PROXY_ALLOWED_HOSTS?.trim()),
  });
}
