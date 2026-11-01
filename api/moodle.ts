// Vercel Function (Node.js runtime, Web Request/Response API) – logika je ve sdíleném modulu server/moodle.ts.
import { handleMoodle } from '../server/moodle.js';

export async function POST(request: Request): Promise<Response> {
  return handleMoodle(request);
}
