// Vercel Function – trasy a odjezdy PID přes Transitous (viz server/transit.ts).
import { handleTransit } from '../server/transit.js';

export async function GET(request: Request): Promise<Response> {
  return handleTransit(request);
}
