// Vercel Function (Node.js runtime, Web Request/Response API) – logika je ve sdíleném modulu server/aiParse.ts.
import { handleAiParse } from '../server/aiParse.js';

export async function POST(request: Request): Promise<Response> {
  return handleAiParse(request);
}
