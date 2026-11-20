import type { IncomingMessage, ServerResponse } from 'http';
import { handleAiSecurityAudit } from '../../server/handlers.ts';

type VercelReq = IncomingMessage & {
  method?: string;
};
type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const out = await handleAiSecurityAudit(authHeader);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(out.status).json(out.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return res.status(500).json({ code: 'AI_AUDIT_ERROR', error: message });
  }
}
