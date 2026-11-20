import type { IncomingMessage, ServerResponse } from 'http';
import { handleCronReminders } from '../../server/handlers.ts';

type VercelReq = IncomingMessage & { headers: Record<string, string | string[] | undefined> };
type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  const authHeader =
    typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  const out = await handleCronReminders(authHeader);
  return res.status(out.status).json(out.body);
}
