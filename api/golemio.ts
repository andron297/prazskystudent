// Vercel Function (Node.js runtime, Web Request/Response API) – logika je ve sdíleném modulu server/golemio.ts.
import { handleGolemio } from '../server/golemio.js';

export async function GET(request: Request): Promise<Response> {
  return handleGolemio(request);
}
