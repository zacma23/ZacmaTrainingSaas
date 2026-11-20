import type { IncomingMessage, ServerResponse } from 'http';
import { handleChapaWebhook } from '../../server/chapaGateway.ts';

type VercelReq = IncomingMessage & {
  body?: unknown;
  rawBody?: string | Buffer;
  method?: string;
};

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

async function readRawBody(req: VercelReq): Promise<string> {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const rawBody = await readRawBody(req);
  const out = await handleChapaWebhook(
    rawBody,
    req.headers as Record<string, string | string[] | undefined>
  );
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
