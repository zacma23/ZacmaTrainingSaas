import type { IncomingMessage, ServerResponse } from 'http';
import { handleAiChat } from '../../server/handlers.ts';

type VercelReq = IncomingMessage & {
  method?: string;
  body?: Record<string, unknown> | string;
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
    let parsedBody: Record<string, unknown> = {};
    if (typeof req.body === 'string') {
      parsedBody = req.body.trim() ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body;
    }

    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const out = await handleAiChat(parsedBody as Parameters<typeof handleAiChat>[0], authHeader);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(out.status).json(out.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return res.status(500).json({ code: 'AI_HANDLER_ERROR', error: message });
  }
}
