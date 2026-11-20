import type { IncomingMessage, ServerResponse } from 'http';
import { handleChapaStatus } from '../../server/chapaGateway.ts';

type VercelReq = IncomingMessage & {
  method?: string;
};

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

function resolveRequestOrigin(req: VercelReq): string | undefined {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (typeof host === 'string' && host) {
    return `${Array.isArray(proto) ? proto[0] : proto}://${host}`;
  }
  return undefined;
}

export default function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const out = handleChapaStatus(resolveRequestOrigin(req));
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
