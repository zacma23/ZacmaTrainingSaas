import type { IncomingMessage, ServerResponse } from 'http';
import { handleChapaVerify, type ChapaVerifyParams } from '../../server/chapaGateway.ts';

type VercelReq = IncomingMessage & {
  body?: ChapaVerifyParams;
  query?: Record<string, string | string[] | undefined>;
  method?: string;
};

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let params: ChapaVerifyParams = {};
  if (req.method === 'POST' && req.body) {
    params = req.body;
  } else {
    const q = req.query || {};
    const txRefRaw = q.tx_ref ?? q.txRef;
    const expectedAmountRaw = q.expectedAmountEtb ?? q.amount;
    const expectedCurrencyRaw = q.expectedCurrency ?? q.currency;
    params = {
      txRef: Array.isArray(txRefRaw) ? txRefRaw[0] : txRefRaw,
      expectedAmountEtb: expectedAmountRaw
        ? Number(Array.isArray(expectedAmountRaw) ? expectedAmountRaw[0] : expectedAmountRaw)
        : undefined,
      expectedCurrency: Array.isArray(expectedCurrencyRaw)
        ? expectedCurrencyRaw[0]
        : expectedCurrencyRaw,
    };
  }

  const out = await handleChapaVerify(params);
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
