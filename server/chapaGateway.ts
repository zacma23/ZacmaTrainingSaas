import crypto from 'crypto';

export interface ChapaHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

const CHAPA_API_BASE = 'https://api.chapa.co/v1';

// In-memory idempotency cache for webhook events (prevents duplicate processing bursts)
const processedWebhookEvents = new Map<string, { processedAt: string; status: string }>();

function isPlaceholderValue(v: string): boolean {
  const lower = v.toLowerCase();
  return (
    !v ||
    lower.includes('your_regenerated') ||
    lower.includes('replace_me') ||
    lower.includes('changeme')
  );
}

function getEnvKey(
  name: 'CHAPA_PUBLIC_KEY' | 'CHAPA_SECRET_KEY' | 'CHAPA_ENCRYPTION_KEY' | 'CHAPA_WEBHOOK_SECRET'
): string {
  const raw = (process.env[name] || '').trim();
  return isPlaceholderValue(raw) ? '' : raw;
}

function maskKeyPrefix(key: string): string | null {
  if (!key) return null;
  if (key.length <= 12) return `${key.slice(0, 4)}••••`;
  return `${key.slice(0, 14)}••••${key.slice(-4)}`;
}

function detectEnvironmentMode(secretKey: string): 'LIVE' | 'TEST' | 'UNCONFIGURED' {
  if (!secretKey) return 'UNCONFIGURED';
  if (secretKey.toUpperCase().includes('_TEST')) return 'TEST';
  if (secretKey.startsWith('CHASECK-')) return 'LIVE';
  return 'LIVE';
}

export function generateChapaTxRef(studentCode: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const cleanCode = studentCode
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(-8) || 'STU';
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `ZAC-CHAPA-${y}${m}${d}-${cleanCode}-${rand}`;
}

export function signVerificationProof(params: {
  txRef: string;
  amountEtb: number;
  currency: string;
  chapaReference: string;
  verifiedAt: string;
}): string {
  const signingSecret =
    getEnvKey('CHAPA_ENCRYPTION_KEY') ||
    getEnvKey('CHAPA_SECRET_KEY') ||
    'zacma-chapa-proof';
  const payload = `${params.txRef}|${params.amountEtb.toFixed(2)}|${params.currency}|${params.chapaReference}|${params.verifiedAt}`;
  return crypto
    .createHmac('sha256', signingSecret)
    .update(payload)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();
}

function timingSafeHexMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyChapaWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  signingSecret: string
): boolean {
  if (!signatureHeader || !signingSecret || !rawBody) return false;
  const cleanedHeader = signatureHeader.trim();
  const expectedBodyHex = crypto
    .createHmac('sha256', signingSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  if (timingSafeHexMatch(cleanedHeader, expectedBodyHex)) return true;

  // Chapa also documents Chapa-Signature as HMAC-SHA256(secret, secret) in some webhook versions
  const expectedSecretHex = crypto
    .createHmac('sha256', signingSecret)
    .update(signingSecret, 'utf8')
    .digest('hex');
  return timingSafeHexMatch(cleanedHeader, expectedSecretHex);
}

export function handleChapaStatus(origin?: string): ChapaHttpResponse {
  const publicKey = getEnvKey('CHAPA_PUBLIC_KEY');
  const secretKey = getEnvKey('CHAPA_SECRET_KEY');
  const encryptionKey = getEnvKey('CHAPA_ENCRYPTION_KEY');
  const webhookSecret = getEnvKey('CHAPA_WEBHOOK_SECRET');

  const configured = Boolean(secretKey);
  const mode = detectEnvironmentMode(secretKey);
  const baseUrl = (origin || process.env.APP_URL || '').replace(/\/+$/, '');

  return {
    status: 200,
    body: {
      configured,
      mode,
      publicKeyConfigured: Boolean(publicKey),
      secretKeyConfigured: Boolean(secretKey),
      encryptionKeyConfigured: Boolean(encryptionKey || webhookSecret),
      webhookSecretConfigured: Boolean(webhookSecret),
      publicKeyPreview: maskKeyPrefix(publicKey),
      secretKeyPreview: maskKeyPrefix(secretKey),
      webhookUrl: baseUrl ? `${baseUrl}/api/chapa/webhook` : '/api/chapa/webhook',
      callbackPath: '/api/chapa/webhook',
      returnUrlPattern: baseUrl ? `${baseUrl}/?chapa_tx_ref={tx_ref}` : '/?chapa_tx_ref={tx_ref}',
      currency: 'ETB',
      checkedAt: new Date().toISOString(),
    },
  };
}

export interface ChapaInitializePayload {
  studentId?: string;
  studentCode?: string;
  studentName?: string;
  studentEmail?: string;
  studentPhone?: string;
  courseId?: string;
  courseName?: string;
  enrollmentId?: string;
  amountEtb?: number;
  currency?: string;
  source?: 'STUDENT_PORTAL' | 'PAYMENT_LINK';
  returnBaseUrl?: string;
  txRef?: string;
}

function splitStudentName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'ZACMA', lastName: 'Student' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Student' };
  return {
    firstName: parts[0].slice(0, 50),
    lastName: parts.slice(1).join(' ').slice(0, 50),
  };
}

function normalizeEthiopianPhoneForChapa(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('251') && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  if ((digits.startsWith('09') || digits.startsWith('07')) && digits.length === 10) {
    return digits;
  }
  if ((digits.startsWith('9') || digits.startsWith('7')) && digits.length === 9) {
    return `0${digits}`;
  }
  return undefined;
}

function sanitizeCustomizationText(text: string, maxLen: number): string {
  // Chapa customization title/description allow letters, numbers, hyphens, underscores, spaces, and dots
  const cleaned = text.replace(/[^A-Za-z0-9\-_.\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen) || 'ZACMA Training Fee';
}

export async function handleChapaInitialize(
  body: ChapaInitializePayload,
  requestOrigin?: string
): Promise<ChapaHttpResponse> {
  const secretKey = getEnvKey('CHAPA_SECRET_KEY');
  if (!secretKey) {
    return {
      status: 503,
      body: {
        errorCode: 'CHAPA_NOT_CONFIGURED',
        error:
          'Chapa Payment Gateway credentials (CHAPA_SECRET_KEY) are not configured on the server. Add CHAPA_PUBLIC_KEY, CHAPA_SECRET_KEY, and CHAPA_ENCRYPTION_KEY in your Vercel environment variables and redeploy.',
      },
    };
  }

  const studentId = String(body.studentId || '').trim();
  const studentCode = String(body.studentCode || '').trim();
  const studentName = String(body.studentName || '').trim();
  const courseName = String(body.courseName || 'Training Course').trim();
  const amountEtb = Number(body.amountEtb);
  const currency = String(body.currency || 'ETB').trim().toUpperCase();

  if (!studentId || !studentCode || !studentName) {
    return {
      status: 400,
      body: { error: 'Student ID, Student Code, and Student Name are required to initialize Chapa payment.' },
    };
  }
  if (!Number.isFinite(amountEtb) || amountEtb <= 0) {
    return {
      status: 400,
      body: { error: 'Payment amount must be a positive number in ETB.' },
    };
  }
  if (currency !== 'ETB') {
    return {
      status: 400,
      body: { error: 'Only ETB currency is supported for ZACMA Technology student fee payments.' },
    };
  }

  const txRef =
    body.txRef && /^[A-Za-z0-9\-_]{8,64}$/.test(body.txRef.trim())
      ? body.txRef.trim()
      : generateChapaTxRef(studentCode);

  const safeOrigin = (body.returnBaseUrl || requestOrigin || process.env.APP_URL || 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );
  const callbackUrl = `${safeOrigin}/api/chapa/webhook`;
  const returnUrl = `${safeOrigin}/?chapa_tx_ref=${encodeURIComponent(txRef)}`;

  const { firstName, lastName } = splitStudentName(studentName);
  const fallbackEmail = `${studentCode.toLowerCase().replace(/[^a-z0-9]/g, '') || 'student'}@students.zacma.edu.et`;
  const email =
    body.studentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.studentEmail.trim())
      ? body.studentEmail.trim()
      : fallbackEmail;
  const phoneNumber = normalizeEthiopianPhoneForChapa(body.studentPhone);

  const chapaPayload: Record<string, unknown> = {
    amount: amountEtb.toFixed(2),
    currency: 'ETB',
    email,
    first_name: firstName,
    last_name: lastName,
    tx_ref: txRef,
    callback_url: callbackUrl,
    return_url: returnUrl,
    customization: {
      title: sanitizeCustomizationText('ZACMA Tech Fee', 16),
      description: sanitizeCustomizationText(`${studentCode} ${courseName}`, 80),
    },
    meta: {
      studentId,
      studentCode,
      courseId: body.courseId || '',
      enrollmentId: body.enrollmentId || '',
      source: body.source || 'STUDENT_PORTAL',
    },
  };
  if (phoneNumber) {
    chapaPayload.phone_number = phoneNumber;
  }

  try {
    const resp = await fetch(`${CHAPA_API_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chapaPayload),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      status?: string;
      message?: string | Record<string, unknown>;
      data?: { checkout_url?: string };
    };

    const checkoutUrl = data?.data?.checkout_url;
    if (!resp.ok || data?.status !== 'success' || !checkoutUrl) {
      const msg =
        typeof data?.message === 'string'
          ? data.message
          : data?.message
          ? JSON.stringify(data.message)
          : `Chapa gateway rejected initialization (HTTP ${resp.status}).`;
      return {
        status: resp.status >= 400 && resp.status < 600 ? resp.status : 502,
        body: {
          errorCode: 'CHAPA_INITIALIZE_FAILED',
          error: msg,
          txRef,
        },
      };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    return {
      status: 200,
      body: {
        ok: true,
        txRef,
        checkoutUrl,
        amountEtb: Number(amountEtb.toFixed(2)),
        currency: 'ETB',
        mode: detectEnvironmentMode(secretKey),
        callbackUrl,
        returnUrl,
        expiresAt,
        initializedAt: now.toISOString(),
      },
    };
  } catch (err) {
    return {
      status: 502,
      body: {
        errorCode: 'CHAPA_NETWORK_ERROR',
        error:
          err instanceof Error
            ? `Unable to reach Chapa API: ${err.message}`
            : 'Network error communicating with Chapa API.',
      },
    };
  }
}

export interface ChapaVerifyParams {
  txRef?: string;
  expectedAmountEtb?: number;
  expectedCurrency?: string;
}

export async function handleChapaVerify(params: ChapaVerifyParams): Promise<ChapaHttpResponse> {
  const secretKey = getEnvKey('CHAPA_SECRET_KEY');
  if (!secretKey) {
    return {
      status: 503,
      body: {
        errorCode: 'CHAPA_NOT_CONFIGURED',
        error:
          'Chapa Payment Gateway secret key (CHAPA_SECRET_KEY) is not configured on the server. Configure server environment variables before verifying transactions.',
      },
    };
  }

  const txRef = String(params.txRef || '').trim();
  if (!txRef || !/^[A-Za-z0-9\-_]{6,64}$/.test(txRef)) {
    return {
      status: 400,
      body: { error: 'A valid txRef is required for Chapa verification.' },
    };
  }

  try {
    const resp = await fetch(`${CHAPA_API_BASE}/transaction/verify/${encodeURIComponent(txRef)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const json = (await resp.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      data?: {
        tx_ref?: string;
        reference?: string;
        amount?: string | number;
        currency?: string;
        status?: string;
        method?: string;
        charge?: string | number;
        created_at?: string;
        updated_at?: string;
        first_name?: string;
        last_name?: string;
        email?: string;
      };
    };

    const verifiedAt = new Date().toISOString();

    if (!resp.ok || !json?.data) {
      const msg = json?.message || `Chapa verification returned HTTP ${resp.status}.`;
      return {
        status: resp.status === 404 ? 404 : 502,
        body: {
          verified: false,
          paymentStatus: resp.status === 404 ? 'PENDING_VERIFICATION' : 'FAILED',
          txRef,
          error: msg,
          verifiedAt,
        },
      };
    }

    const d = json.data;
    const rawStatus = String(d.status || '').toLowerCase();
    const verifiedAmount = Number(d.amount);
    const verifiedCurrency = String(d.currency || 'ETB').toUpperCase();
    const returnedTxRef = String(d.tx_ref || txRef);
    const chapaReference = String(d.reference || txRef);
    const chapaChannel = d.method ? String(d.method) : 'Chapa Online';

    // Validate strict financial integrity
    const mismatchReasons: string[] = [];
    if (returnedTxRef !== txRef) {
      mismatchReasons.push(`Transaction reference mismatch (${returnedTxRef} !== ${txRef}).`);
    }
    const expectedCurrency = (params.expectedCurrency || 'ETB').toUpperCase();
    if (verifiedCurrency !== expectedCurrency) {
      mismatchReasons.push(`Currency mismatch (${verifiedCurrency} !== ${expectedCurrency}).`);
    }
    if (
      typeof params.expectedAmountEtb === 'number' &&
      Number.isFinite(params.expectedAmountEtb) &&
      params.expectedAmountEtb > 0
    ) {
      if (!Number.isFinite(verifiedAmount) || Math.abs(verifiedAmount - params.expectedAmountEtb) > 0.01) {
        mismatchReasons.push(
          `Paid amount (${verifiedAmount} ETB) does not match expected amount (${params.expectedAmountEtb} ETB).`
        );
      }
    }

    if (rawStatus === 'success' && mismatchReasons.length === 0) {
      const proof = signVerificationProof({
        txRef: returnedTxRef,
        amountEtb: verifiedAmount,
        currency: verifiedCurrency,
        chapaReference,
        verifiedAt,
      });

      return {
        status: 200,
        body: {
          verified: true,
          paymentStatus: 'VERIFIED',
          txRef: returnedTxRef,
          amountEtb: verifiedAmount,
          currency: verifiedCurrency,
          chapaReference,
          chapaChannel,
          chapaFeeEtb: Number.isFinite(Number(d.charge)) ? Number(Number(d.charge).toFixed(2)) : 0,
          paymentDate: (d.updated_at || d.created_at || verifiedAt).slice(0, 10),
          verifiedAt,
          verificationProof: proof,
          verificationSummary: `Verified directly with Chapa API (${chapaReference}, ${verifiedAmount.toFixed(2)} ${verifiedCurrency}, channel: ${chapaChannel}).`,
        },
      };
    }

    if (rawStatus === 'pending' || rawStatus === 'created') {
      return {
        status: 200,
        body: {
          verified: false,
          paymentStatus: 'PENDING_VERIFICATION',
          txRef: returnedTxRef,
          amountEtb: Number.isFinite(verifiedAmount) ? verifiedAmount : undefined,
          currency: verifiedCurrency,
          chapaReference,
          chapaChannel,
          verifiedAt,
          verificationSummary: 'Payment is still pending confirmation at Chapa.',
        },
      };
    }

    const mappedStatus =
      rawStatus === 'cancelled' || rawStatus === 'canceled'
        ? 'CANCELLED'
        : rawStatus === 'refunded'
        ? 'REFUNDED'
        : 'FAILED';

    return {
      status: 200,
      body: {
        verified: false,
        paymentStatus: mappedStatus,
        txRef: returnedTxRef,
        amountEtb: Number.isFinite(verifiedAmount) ? verifiedAmount : undefined,
        currency: verifiedCurrency,
        chapaReference,
        chapaChannel,
        verifiedAt,
        mismatchReasons,
        verificationSummary:
          mismatchReasons.length > 0
            ? `Verification rejected: ${mismatchReasons.join(' ')}`
            : `Chapa reported transaction status "${rawStatus || 'failed'}".`,
      },
    };
  } catch (err) {
    return {
      status: 502,
      body: {
        verified: false,
        paymentStatus: 'PENDING_VERIFICATION',
        txRef,
        error:
          err instanceof Error
            ? `Chapa verification network error: ${err.message}`
            : 'Unable to contact Chapa verification endpoint.',
      },
    };
  }
}

export async function handleChapaWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): Promise<ChapaHttpResponse> {
  const webhookSecret = getEnvKey('CHAPA_WEBHOOK_SECRET');
  const encryptionKey = getEnvKey('CHAPA_ENCRYPTION_KEY');
  const signingSecret = webhookSecret || encryptionKey;
  const secretKey = getEnvKey('CHAPA_SECRET_KEY');

  if (!signingSecret) {
    return {
      status: 503,
      body: {
        errorCode: 'CHAPA_WEBHOOK_KEY_MISSING',
        error:
          'CHAPA_ENCRYPTION_KEY (or CHAPA_WEBHOOK_SECRET) is not configured on the server; webhook signature cannot be verified.',
      },
    };
  }

  const getHeader = (name: string): string | undefined => {
    const val = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0];
    return typeof val === 'string' ? val : undefined;
  };

  // Chapa sends either `Chapa-Signature` or `x-chapa-signature`
  const signature = getHeader('chapa-signature') || getHeader('x-chapa-signature');
  const validSignature = verifyChapaWebhookSignature(rawBody, signature, signingSecret);

  if (!validSignature) {
    return {
      status: 401,
      body: {
        errorCode: 'INVALID_WEBHOOK_SIGNATURE',
        error: 'Invalid or missing Chapa HMAC-SHA256 webhook signature.',
      },
    };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody || '{}') as Record<string, unknown>;
  } catch {
    return {
      status: 400,
      body: { error: 'Invalid JSON payload in Chapa webhook.' },
    };
  }

  const txRef = String(payload.tx_ref || payload.trx_ref || '').trim();
  const eventType = String(payload.event || payload.status || 'unknown').trim();
  if (!txRef) {
    return {
      status: 400,
      body: { error: 'Webhook payload missing tx_ref.' },
    };
  }

  const dedupKey = `${txRef}:${eventType.toLowerCase()}`;
  const existing = processedWebhookEvents.get(dedupKey);
  if (existing) {
    return {
      status: 200,
      body: {
        ok: true,
        duplicate: true,
        txRef,
        event: eventType,
        processedAt: existing.processedAt,
        message: 'Duplicate webhook safely ignored (idempotent).',
      },
    };
  }

  // Re-verify directly against Chapa API whenever secret key is available
  let verificationResult: Record<string, unknown> | null = null;
  if (secretKey) {
    const verifyRes = await handleChapaVerify({ txRef });
    verificationResult = verifyRes.body;
  }

  const processedAt = new Date().toISOString();
  processedWebhookEvents.set(dedupKey, {
    processedAt,
    status: String(verificationResult?.paymentStatus || eventType),
  });

  // Cap cache size to prevent unbounded memory growth
  if (processedWebhookEvents.size > 5000) {
    const oldestKey = processedWebhookEvents.keys().next().value;
    if (oldestKey) processedWebhookEvents.delete(oldestKey);
  }

  return {
    status: 200,
    body: {
      ok: true,
      duplicate: false,
      txRef,
      event: eventType,
      processedAt,
      verification: verificationResult,
    },
  };
}
