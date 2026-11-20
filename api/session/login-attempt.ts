import type { IncomingMessage, ServerResponse } from 'http';
import { handleLoginAttempt } from '../../server/sessionManager.ts';

type VercelReq = IncomingMessage & { body?: Record<string, unknown>; method?: string };
type VercelRes = ServerResponse & { status: (code: number) => VercelRes; json: (data: unknown) => void };

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const out = handleLoginAttempt((req.body || {}) as Parameters<typeof handleLoginAttempt>[0]);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(out.status).json(out.body);
}
