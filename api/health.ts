import type { IncomingMessage, ServerResponse } from 'http';
import { handleHealth } from '../server/handlers.ts';

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default function handler(_req: IncomingMessage, res: VercelRes) {
  const out = handleHealth();
  res.status(out.status).json(out.body);
}
