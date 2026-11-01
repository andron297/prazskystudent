import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Lokální vývoj: stejné handlery, které na Vercelu běží jako funkce v `api/`,
 * obsluhuje Vite dev server. Díky tomu funguje Live režim i při `npm run dev`
 * bez Vercel CLI.
 */
function devApiPlugin(): Plugin {
  return {
    name: 'stihnu-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/')) {
          next();
          return;
        }
        void (async () => {
          try {
            const mod = (await server.ssrLoadModule('/server/router.ts')) as {
              routeApiRequest: (request: Request) => Promise<Response>;
            };
            const response = await mod.routeApiRequest(await toWebRequest(req));
            await sendWebResponse(res, response);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: 'dev_api_failure',
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        })();
      });
    },
  };
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = req.method ?? 'GET';
  let body: Uint8Array | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  const host = req.headers.host ?? 'localhost';
  return new Request(`http://${host}${req.url ?? '/'}`, { method, headers, body });
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const buffer = new Uint8Array(await response.arrayBuffer());
  res.end(buffer);
}

/**
 * PWA: seznam souborů buildu pro service worker, aby šla offline i líně
 * načítaná sekce, kterou uživatel ještě neotevřel. Vynechává exotické
 * znakové sady fontů (cyrilice, řečtina…), čeština je v latin/latin-ext.
 */
function precacheManifestPlugin(): Plugin {
  return {
    name: 'stihnu-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2)$/.test(file))
        .filter((file) => !/(cyrillic|greek|vietnamese|symbols)/.test(file))
        .map((file) => `/${file}`)
        .sort();
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify({ files }, null, 2) });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApiPlugin(), precacheManifestPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
