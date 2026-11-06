/** Stav serveru: které klíče jsou nastavené na serveru (bez prozrazení hodnot). */
import { googleClientId, googleServerFlowAvailable } from './google.js';
import { json, methodNotAllowed } from './http.js';
import { serverAiProvider } from './aiParse.js';
import { accountConfig, ensureSchema, serviceKey } from './supabase.js';

export async function handleHealth(request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  return json({
    ok: true,
    time: new Date().toISOString(),
    serverKeys: {
      golemio: Boolean(process.env.GOLEMIO_API_KEY?.trim()),
      google: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
      /** Nějaká AI na serveru (Claude, ChatGPT nebo Gemini) – název pole kvůli zpětné kompatibilitě. */
      anthropic: serverAiProvider() !== null,
    },
    aiProvider: serverAiProvider(),
    google: {
      /** OAuth Client ID je veřejný údaj (posílá se i v přihlašovacím okně Googlu). */
      clientId: googleClientId() ?? null,
      serverFlow: googleServerFlowAvailable(),
    },
    proxyAllowlist: Boolean(process.env.PROXY_ALLOWED_HOSTS?.trim()),
    /** Veřejná konfigurace účtů (URL a veřejný klíč Supabase – obojí je veřejné z principu). */
    account: accountConfig(),
    accountSchema: await ensureSchema(),
    accountDelete: Boolean(serviceKey()),
    googlePickerKey: process.env.GOOGLE_PICKER_API_KEY?.trim() || null,
    /** Spotify Client ID (veřejný údaj; přihlášení přes PKCE bez tajného klíče). */
    spotifyClientId: /^[0-9a-f]{32}$/i.test(process.env.SPOTIFY_CLIENT_ID?.trim() ?? '') ? process.env.SPOTIFY_CLIENT_ID!.trim() : null,
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.PUBLIC_CONTACT_EMAIL?.trim() ?? '') ? process.env.PUBLIC_CONTACT_EMAIL!.trim() : null,
  });
}
