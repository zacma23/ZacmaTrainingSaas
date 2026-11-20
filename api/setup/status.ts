import type { IncomingMessage, ServerResponse } from 'http';
import { handleSetupStatus } from '../../server/handlers.ts';

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default async function handler(_req: IncomingMessage, res: VercelRes) {
  const out = await handleSetupStatus(process.cwd());
  return res.status(out.status).json(out.body);
}
