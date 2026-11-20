import type { IncomingMessage, ServerResponse } from 'http';
import { handleScanIdDocument, type ScanIdRequestBody } from '../../server/idScanner.ts';

type VercelReq = IncomingMessage & {
  method?: string;
  body?: Record<string, unknown> | string;
};
type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req: VercelReq, res: VercelRes) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
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

    const out = await handleScanIdDocument(parsedBody as ScanIdRequestBody);
    return res.status(out.status).json(out.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return res.status(500).json({ code: 'SCAN_HANDLER_ERROR', error: message });
  }
}
