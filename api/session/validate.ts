import type { IncomingMessage, ServerResponse } from 'http';
import { handleSessionValidate } from '../../server/sessionManager.ts';

type VercelReq = IncomingMessage & { method?: string };
type VercelRes = ServerResponse & { status: (code: number) => VercelRes; json: (data: unknown) => void };

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const out = handleSessionValidate(req.headers.cookie);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(out.status).json(out.body);
}
