// Vercel function: POST /api/upload (token for a direct file upload) and, in local mock mode
// only, PUT /api/upload (receives the file). A thin wrapper; the logic lives in server/upload.ts.
import { getDeps } from '../server/deps.js';
import { handleUploadRoute } from '../server/upload.js';

export function POST(request: Request): Promise<Response> {
  return handleUploadRoute(request, getDeps);
}

export function PUT(request: Request): Promise<Response> {
  return handleUploadRoute(request, getDeps);
}
