// Vercel Function – veřejné stránky předmětů v SISu (viz server/sis.ts).
import { handleSis } from '../server/sis.js';

export async function GET(request: Request): Promise<Response> {
  return handleSis(request);
}
