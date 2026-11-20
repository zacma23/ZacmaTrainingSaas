import crypto from 'crypto';
import type { RoleCode } from '../src/types/zacma.ts';

export const SESSION_COOKIE_NAME = 'zacma_session';

const FALLBACK_EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const envSecret =
    process.env.SESSION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.FIREBASE_APP_CHECK_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }
  return FALLBACK_EPHEMERAL_SECRET;
}

export interface SessionPayload {
  sid: string;
  uid: string;
  email: string;
  role: RoleCode;
  iat: number; // epoch ms
  exp: number; // epoch ms
  timeoutMs: number;
}

interface LockoutEntry {
  email: string;
  failedAttempts: number;
  lastFailedAt: number;
  lockedUntil: number | null;
}

// Server-side in-memory revocation & lockout registries
const revokedSessionIds = new Map<string, number>(); // sid -> expiresAt
const activeSessionById = new Map<string, SessionPayload>();
const lockoutRegistry = new Map<string, LockoutEntry>();

function pruneExpiredEntries() {
  const now = Date.now();
  for (const [sid, exp] of revokedSessionIds.entries()) {
    if (exp < now) revokedSessionIds.delete(sid);
  }
  for (const [sid, payload] of activeSessionById.entries()) {
    if (payload.exp < now) activeSessionById.delete(sid);
  }
  for (const [key, entry] of lockoutRegistry.entries()) {
    if (
      (!entry.lockedUntil || entry.lockedUntil < now) &&
      now - entry.lastFailedAt > 60 * 60 * 1000
    ) {
      lockoutRegistry.delete(key);
    }
  }
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padLen = (4 - (input.length % 4)) % 4;
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(base64, 'base64').toString('utf8');
}

function signToken(payload: SessionPayload): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (!parsed.sid || !parsed.uid || !parsed.exp) return null;
    if (Date.now() > parsed.exp) return null;
    if (revokedSessionIds.has(parsed.sid)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function buildSetCookieHeader(
  token: string,
  maxAgeSeconds: number,
  isSecure: boolean
): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isSecure) {
    attrs.push('Secure');
  }
  return attrs.join('; ');
}

export function buildClearCookieHeader(isSecure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isSecure) {
    attrs.push('Secure');
  }
  return attrs.join('; ');
}

export interface SessionHandlerResult {
  status: number;
  body: Record<string, unknown>;
  setCookie?: string;
}

const VALID_ROLES: RoleCode[] = ['ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF', 'STUDENT'];

function resolveTimeoutMs(role: RoleCode, requestedMinutes?: number): number {
  const defaultMins = role === 'ADMIN' || role === 'ACCOUNTANT' ? 10 : 15;
  const mins =
    typeof requestedMinutes === 'number' && Number.isFinite(requestedMinutes)
      ? Math.max(1, Math.min(120, Math.round(requestedMinutes)))
      : defaultMins;
  return mins * 60 * 1000;
}

export function handleSessionCreate(
  payload: {
    uid?: string;
    email?: string;
    role?: RoleCode;
    timeoutMinutes?: number;
  },
  isSecure: boolean
): SessionHandlerResult {
  pruneExpiredEntries();
  const uid = String(payload?.uid || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const role = payload?.role;

  if (!uid || !email || !role || !VALID_ROLES.includes(role)) {
    return {
      status: 400,
      body: { ok: false, error: 'Valid uid, email, and role are required to establish a session.' },
    };
  }

  // Clear any prior failed-login lockout for this email on verified sign-in
  lockoutRegistry.delete(email);

  const now = Date.now();
  const timeoutMs = resolveTimeoutMs(role, payload.timeoutMinutes);
  const sid = `zs_${crypto.randomBytes(20).toString('hex')}`;
  const session: SessionPayload = {
    sid,
    uid,
    email,
    role,
    iat: now,
    exp: now + timeoutMs,
    timeoutMs,
  };

  activeSessionById.set(sid, session);
  const token = signToken(session);

  return {
    status: 200,
    setCookie: buildSetCookieHeader(token, Math.ceil(timeoutMs / 1000), isSecure),
    body: {
      ok: true,
      sessionId: sid,
      uid,
      role,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(session.exp).toISOString(),
      timeoutSeconds: Math.round(timeoutMs / 1000),
    },
  };
}

export function handleSessionValidate(cookieHeader?: string): SessionHandlerResult {
  pruneExpiredEntries();
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return {
      status: 401,
      body: { valid: false, reason: 'NO_SESSION_COOKIE' },
    };
  }
  const session = verifyToken(token);
  if (!session) {
    return {
      status: 401,
      body: { valid: false, reason: 'SESSION_EXPIRED_OR_REVOKED' },
    };
  }
  const remainingSeconds = Math.max(0, Math.floor((session.exp - Date.now()) / 1000));
  return {
    status: 200,
    body: {
      valid: true,
      sessionId: session.sid,
      uid: session.uid,
      email: session.email,
      role: session.role,
      expiresAt: new Date(session.exp).toISOString(),
      remainingSeconds,
    },
  };
}

export function handleSessionRefresh(
  cookieHeader: string | undefined,
  body: { timeoutMinutes?: number } | undefined,
  isSecure: boolean
): SessionHandlerResult {
  pruneExpiredEntries();
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  const existing = token ? verifyToken(token) : null;
  if (!existing) {
    return {
      status: 401,
      setCookie: buildClearCookieHeader(isSecure),
      body: { ok: false, error: 'Session is expired or invalid. Please sign in again.' },
    };
  }

  // Rotate session ID on refresh to prevent fixation
  revokedSessionIds.set(existing.sid, existing.exp);
  activeSessionById.delete(existing.sid);

  const now = Date.now();
  const timeoutMs =
    typeof body?.timeoutMinutes === 'number'
      ? resolveTimeoutMs(existing.role, body.timeoutMinutes)
      : existing.timeoutMs;
  const newSid = `zs_${crypto.randomBytes(20).toString('hex')}`;
  const rotated: SessionPayload = {
    sid: newSid,
    uid: existing.uid,
    email: existing.email,
    role: existing.role,
    iat: now,
    exp: now + timeoutMs,
    timeoutMs,
  };
  activeSessionById.set(newSid, rotated);
  const newToken = signToken(rotated);

  return {
    status: 200,
    setCookie: buildSetCookieHeader(newToken, Math.ceil(timeoutMs / 1000), isSecure),
    body: {
      ok: true,
      sessionId: newSid,
      expiresAt: new Date(rotated.exp).toISOString(),
      timeoutSeconds: Math.round(timeoutMs / 1000),
    },
  };
}

export function handleSessionLogout(
  cookieHeader: string | undefined,
  isSecure: boolean
): SessionHandlerResult {
  pruneExpiredEntries();
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    const parsed = verifyToken(token);
    if (parsed) {
      revokedSessionIds.set(parsed.sid, parsed.exp);
      activeSessionById.delete(parsed.sid);
    }
  }
  return {
    status: 200,
    setCookie: buildClearCookieHeader(isSecure),
    body: {
      ok: true,
      loggedOut: true,
      timestamp: new Date().toISOString(),
    },
  };
}

export function handleLoginAttempt(payload: {
  email?: string;
  action?: 'check' | 'fail' | 'success';
  maxFailedLogins?: number;
  lockoutMinutes?: number;
}): SessionHandlerResult {
  pruneExpiredEntries();
  const email = String(payload?.email || '').trim().toLowerCase();
  const action = payload?.action || 'check';
  const maxFailed = Math.max(3, Math.min(20, Number(payload?.maxFailedLogins || 5)));
  const lockoutMinutes = Math.max(1, Math.min(120, Number(payload?.lockoutMinutes || 15)));

  if (!email) {
    return {
      status: 400,
      body: { ok: false, error: 'Email is required.' },
    };
  }

  const now = Date.now();
  const existing = lockoutRegistry.get(email);

  if (action === 'success') {
    lockoutRegistry.delete(email);
    return {
      status: 200,
      body: { locked: false, failedAttempts: 0, remainingAttempts: maxFailed },
    };
  }

  if (existing && existing.lockedUntil && existing.lockedUntil > now) {
    const remainingSeconds = Math.ceil((existing.lockedUntil - now) / 1000);
    return {
      status: 429,
      body: {
        locked: true,
        failedAttempts: existing.failedAttempts,
        remainingAttempts: 0,
        lockedUntil: new Date(existing.lockedUntil).toISOString(),
        remainingSeconds,
        error: `Account temporarily locked after repeated failed sign-in attempts. Try again in ${Math.ceil(remainingSeconds / 60)} minute(s).`,
      },
    };
  }

  if (action === 'check') {
    const attempts = existing && (!existing.lockedUntil || existing.lockedUntil <= now) ? existing.failedAttempts : 0;
    return {
      status: 200,
      body: {
        locked: false,
        failedAttempts: attempts,
        remainingAttempts: Math.max(0, maxFailed - attempts),
      },
    };
  }

  // action === 'fail'
  const priorCount = existing && (!existing.lockedUntil || existing.lockedUntil <= now) ? existing.failedAttempts : 0;
  const nextCount = priorCount + 1;
  const isNowLocked = nextCount >= maxFailed;
  const lockedUntil = isNowLocked ? now + lockoutMinutes * 60 * 1000 : null;

  lockoutRegistry.set(email, {
    email,
    failedAttempts: nextCount,
    lastFailedAt: now,
    lockedUntil,
  });

  return {
    status: isNowLocked ? 429 : 200,
    body: {
      locked: isNowLocked,
      failedAttempts: nextCount,
      remainingAttempts: Math.max(0, maxFailed - nextCount),
      lockedUntil: lockedUntil ? new Date(lockedUntil).toISOString() : null,
      remainingSeconds: lockedUntil ? Math.ceil((lockedUntil - now) / 1000) : 0,
      error: isNowLocked
        ? `Account temporarily locked for ${lockoutMinutes} minutes after ${nextCount} failed sign-in attempts.`
        : undefined,
    },
  };
}
