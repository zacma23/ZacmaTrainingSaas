import type { IncomingMessage, ServerResponse } from 'http';
import { handleAiChatStream } from '../../../server/handlers.ts';

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

  let headersSent = false;
  const ensureSseHeaders = () => {
    if (headersSent) return;
    headersSent = true;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
  };

  try {
    let parsedBody: Record<string, unknown> = {};
    if (typeof req.body === 'string') {
      parsedBody = req.body.trim() ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    } else if (req.body && typeof req.body === 'object') {
      parsedBody = req.body;
    }

    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    await handleAiChatStream(
      parsedBody as Parameters<typeof handleAiChatStream>[0],
      {
        onDelta: (delta) => {
          ensureSseHeaders();
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        },
        onDone: (meta) => {
          ensureSseHeaders();
          res.write(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`);
          res.end();
        },
        onError: (status, body) => {
          if (!headersSent) {
            res.status(status).json(body);
          } else {
            res.write(`data: ${JSON.stringify({ error: body.error || 'AI stream interrupted' })}\n\n`);
            res.end();
          }
        },
      },
      authHeader
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    if (!headersSent) {
      res.status(500).json({ code: 'AI_HANDLER_ERROR', error: message });
    } else {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
}
