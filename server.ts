import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  handleAiChat,
  handleAiChatStream,
  handleAiSecurityAudit,
  handleCronReminders,
  handleDispatchExternal,
  handleHealth,
  handleRecordReminderRun,
  handleSetupStatus,
  handleSmsBalance,
  handleSmsSend,
  handleSmsStatus,
  recordScheduledHeartbeat,
  type ServerSmsProvider,
} from './server/handlers.ts';
import {
  handleLoginAttempt,
  handleSessionCreate,
  handleSessionLogout,
  handleSessionRefresh,
  handleSessionValidate,
} from './server/sessionManager.ts';
import {
  handleChapaInitialize,
  handleChapaStatus,
  handleChapaVerify,
  handleChapaWebhook,
} from './server/chapaGateway.ts';
import { handleScanIdDocument } from './server/idScanner.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

async function createApp() {
  const app = express();
  app.use(
    express.json({
      limit: '15mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    })
  );

  app.get('/api/health', (_req: Request, res: Response) => {
    const out = handleHealth();
    res.status(out.status).json(out.body);
  });

  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const out = await handleAiChat(req.body, req.headers.authorization);
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  app.post('/api/ai/security-audit', async (req: Request, res: Response) => {
    const out = await handleAiSecurityAudit(req.headers.authorization);
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  app.post('/api/ai/scan-id', async (req: Request, res: Response) => {
    const out = await handleScanIdDocument(req.body || {});
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(out.status).json(out.body);
  });

  app.post('/api/ai/chat/stream', async (req: Request, res: Response) => {
    let headersSent = false;
    const ensureSseHeaders = () => {
      if (headersSent) return;
      headersSent = true;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    };

    await handleAiChatStream(
      req.body,
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
      req.headers.authorization
    );
  });

  app.get('/api/setup/status', async (_req: Request, res: Response) => {
    const out = await handleSetupStatus(__dirname);
    res.status(out.status).json(out.body);
  });

  app.get('/api/cron/reminders', async (req: Request, res: Response) => {
    const out = await handleCronReminders(req.headers.authorization);
    res.status(out.status).json(out.body);
  });

  app.post('/api/reminders/dispatch-external', (req: Request, res: Response) => {
    const out = handleDispatchExternal(req.body);
    res.status(out.status).json(out.body);
  });

  app.post('/api/reminders/record-run', (req: Request, res: Response) => {
    const out = handleRecordReminderRun(req.body);
    res.status(out.status).json(out.body);
  });

  app.get('/api/sms/status', (_req: Request, res: Response) => {
    const out = handleSmsStatus();
    res.status(out.status).json(out.body);
  });

  app.get('/api/sms/balance', async (req: Request, res: Response) => {
    const provider = typeof req.query.provider === 'string'
      ? (req.query.provider as ServerSmsProvider)
      : undefined;
    const out = await handleSmsBalance(provider);
    res.status(out.status).json(out.body);
  });

  app.post('/api/sms/send', async (req: Request, res: Response) => {
    const out = await handleSmsSend(req.body);
    res.status(out.status).json(out.body);
  });

  // Enterprise Session Management & Account Lockout Routes (HttpOnly signed cookies + no-store)
  const isSecureReq = (req: Request) =>
    process.env.NODE_ENV === 'production' ||
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https';

  const applySessionHeaders = (res: Response, setCookie?: string) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }
  };

  app.post('/api/session/create', (req: Request, res: Response) => {
    const out = handleSessionCreate(req.body || {}, isSecureReq(req));
    applySessionHeaders(res, out.setCookie);
    res.status(out.status).json(out.body);
  });

  app.get('/api/session/validate', (req: Request, res: Response) => {
    const out = handleSessionValidate(req.headers.cookie);
    applySessionHeaders(res, out.setCookie);
    res.status(out.status).json(out.body);
  });

  app.post('/api/session/refresh', (req: Request, res: Response) => {
    const out = handleSessionRefresh(req.headers.cookie, req.body || {}, isSecureReq(req));
    applySessionHeaders(res, out.setCookie);
    res.status(out.status).json(out.body);
  });

  app.post('/api/session/logout', (req: Request, res: Response) => {
    const out = handleSessionLogout(req.headers.cookie, isSecureReq(req));
    applySessionHeaders(res, out.setCookie);
    res.status(out.status).json(out.body);
  });

  app.post('/api/session/login-attempt', (req: Request, res: Response) => {
    const out = handleLoginAttempt(req.body || {});
    applySessionHeaders(res);
    res.status(out.status).json(out.body);
  });

  // Chapa Payment Gateway Server-Side Proxy & Webhook Routes
  const getOrigin = (req: Request): string => {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
    return `${proto}://${host}`;
  };

  app.get('/api/chapa/status', (req: Request, res: Response) => {
    const out = handleChapaStatus(getOrigin(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  app.post('/api/chapa/initialize', async (req: Request, res: Response) => {
    const out = await handleChapaInitialize(req.body || {}, getOrigin(req));
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  app.get('/api/chapa/verify', async (req: Request, res: Response) => {
    const txRef = typeof req.query.tx_ref === 'string'
      ? req.query.tx_ref
      : typeof req.query.txRef === 'string'
      ? req.query.txRef
      : undefined;
    const expectedAmountRaw = req.query.expectedAmountEtb ?? req.query.amount;
    const expectedAmountEtb =
      typeof expectedAmountRaw === 'string' && expectedAmountRaw !== ''
        ? Number(expectedAmountRaw)
        : undefined;
    const expectedCurrency =
      typeof req.query.expectedCurrency === 'string'
        ? req.query.expectedCurrency
        : typeof req.query.currency === 'string'
        ? req.query.currency
        : undefined;
    const out = await handleChapaVerify({ txRef, expectedAmountEtb, expectedCurrency });
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  app.post('/api/chapa/verify', async (req: Request, res: Response) => {
    const out = await handleChapaVerify(req.body || {});
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  app.post('/api/chapa/webhook', async (req: Request, res: Response) => {
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body || {});
    const out = await handleChapaWebhook(
      rawBody,
      req.headers as Record<string, string | string[] | undefined>
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  });

  const httpServer = http.createServer(app);

  // Mount Vite middleware in development or serve built dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled =
      process.env.DISABLE_HMR === 'true' || Boolean(process.env.K_SERVICE);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : true,
        watch: hmrDisabled ? null : undefined,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Server-side background heartbeat (runs independently of open browser tabs)
  setInterval(() => {
    recordScheduledHeartbeat();
  }, 1000 * 60 * 30);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ZACMA Portal server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start ZACMA Portal server:', err);
  process.exit(1);
});
