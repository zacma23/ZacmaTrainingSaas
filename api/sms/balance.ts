import type { IncomingMessage, ServerResponse } from 'http';
import { handleSmsBalance, type ServerSmsProvider } from '../../server/handlers.ts';

type VercelReq = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
};

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  const rawProvider = Array.isArray(req.query?.provider)
    ? req.query?.provider[0]
    : req.query?.provider;
  const out = await handleSmsBalance(rawProvider as ServerSmsProvider | undefined);
  res.status(out.status).json(out.body);
}
