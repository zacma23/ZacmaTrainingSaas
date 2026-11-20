import type { IncomingMessage, ServerResponse } from 'http';
import { handleSmsSend } from '../../server/handlers.ts';

type VercelReq = IncomingMessage & {
  body?: Record<string, unknown>;
  method?: string;
};

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const out = await handleSmsSend((req.body || {}) as Parameters<typeof handleSmsSend>[0]);
  res.status(out.status).json(out.body);
}
