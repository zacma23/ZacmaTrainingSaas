import type { IncomingMessage, ServerResponse } from 'http';
import { handleDispatchExternal } from '../../server/handlers.ts';

type VercelReq = IncomingMessage & { method?: string; body?: Record<string, unknown> };
type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const out = handleDispatchExternal(
    (req.body || {}) as Parameters<typeof handleDispatchExternal>[0]
  );
  return res.status(out.status).json(out.body);
}
