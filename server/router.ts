/** Směrovač pro lokální vývoj (Vite middleware). Na Vercelu každou cestu obsluhuje soubor v `api/`. */
import { handleAiParse } from './aiParse.js';
import { handleGolemio } from './golemio.js';
import { handleGoogle } from './google.js';
import { handleHealth } from './health.js';
import { handleIcs } from './ics.js';
import { json } from './http.js';
import { handleMoodle } from './moodle.js';
import { handleRoutes } from './routes.js';
import { handleSis } from './sis.js';
import { handleTransit } from './transit.js';

const ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  '/api/golemio': handleGolemio,
  '/api/moodle': handleMoodle,
  '/api/ics': handleIcs,
  '/api/routes': handleRoutes,
  '/api/ai-parse': handleAiParse,
  '/api/health': handleHealth,
  '/api/google': handleGoogle,
  '/api/sis': handleSis,
  '/api/transit': handleTransit,
};

export async function routeApiRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const handler = ROUTES[pathname.replace(/\/+$/, '')];
  if (!handler) return json({ error: 'not_found', message: `Neznámý endpoint ${pathname}` }, 404);
  return handler(request);
}
