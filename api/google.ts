// Vercel Function – volitelné serverové přihlášení Google (viz server/google.ts).
import { handleGoogle } from '../server/google.js';

export async function POST(request: Request): Promise<Response> {
  return handleGoogle(request);
}
