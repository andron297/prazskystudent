// Vercel Function – jídelníčky menz UK (viz server/menza.ts).
import { handleMenza } from '../server/menza.js';

export async function GET(request: Request): Promise<Response> {
  return handleMenza(request);
}
