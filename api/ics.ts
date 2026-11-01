// Vercel Function (Node.js runtime, Web Request/Response API) – logika je ve sdíleném modulu server/ics.ts.
import { handleIcs } from '../server/ics.js';

export async function GET(request: Request): Promise<Response> {
  return handleIcs(request);
}
