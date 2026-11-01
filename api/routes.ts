// Vercel Function (Node.js runtime, Web Request/Response API) – logika je ve sdíleném modulu server/routes.ts.
import { handleRoutes } from '../server/routes.js';

export async function POST(request: Request): Promise<Response> {
  return handleRoutes(request);
}
