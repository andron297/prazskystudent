// Vercel Function – správa účtu (viz server/account.ts).
import { handleAccount } from '../server/account.js';

export async function POST(request: Request): Promise<Response> {
  return handleAccount(request);
}
