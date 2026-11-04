// Vercel function: POST /api/rfq. A thin wrapper; the logic lives in server/rfq.ts.
import { getDeps } from '../server/deps.js';
import { handleRfq } from '../server/rfq.js';

export function POST(request: Request): Promise<Response> {
  return handleRfq(request, getDeps);
}
