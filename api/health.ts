// Vercel Function (Node.js runtime, Web Request/Response API) – logika je ve sdíleném modulu server/health.ts.
import { handleHealth } from '../server/health.js';

export async function GET(request: Request): Promise<Response> {
  return handleHealth(request);
}
