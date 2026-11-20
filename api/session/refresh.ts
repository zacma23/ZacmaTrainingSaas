import type { IncomingMessage, ServerResponse } from 'http';
import { handleSessionRefresh } from '../../server/sessionManager.ts';

type VercelReq = IncomingMessage & { body?: Record<string, unknown>; method?: string };
type VercelRes = ServerResponse & { status: (code: number) => VercelRes; json: (data: unknown) => void };

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const isSecure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  const out = handleSessionRefresh(req.headers.cookie, (req.body || {}) as { timeoutMinutes?: number }, isSecure);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  if (out.setCookie) res.setHeader('Set-Cookie', out.setCookie);
  res.status(out.status).json(out.body);
}
