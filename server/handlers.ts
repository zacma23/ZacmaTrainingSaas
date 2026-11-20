import fs from 'fs';
import path from 'path';
import { type Content, type GenerateContentResponse, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { buildKnowledgeContextForRole } from '../src/lib/knowledgeBase.ts';
import type { AiRoleScope } from '../src/types/zacma.ts';
import { authorizeAiRequest, runAiSecurityAuditSuite } from './aiAuthGuard.ts';

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export function getAiModelName(): string {
  return process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-4-hydrogen';
}

export function resolveGeminiApiKey(): string | null {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    process.env.GOOGLE_GEMINI_API_KEY,
    process.env.GEMINI_KEY,
    process.env.API_KEY,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').trim();
    if (!cleaned || cleaned === 'MY_GEMINI_API_KEY' || cleaned.length < 10) continue;
    return cleaned;
  }
  return null;
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export const DEFAULT_SUPABASE_TARGET = {
  projectRef: 'mcxbwxfvalodqgbwyobo',
  url: 'https://mcxbwxfvalodqgbwyobo.supabase.co',
  host: 'db.mcxbwxfvalodqgbwyobo.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
};

function cleanEnvValue(raw?: string, placeholderPrefix?: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!cleaned) return null;
  if (placeholderPrefix && cleaned.startsWith(placeholderPrefix)) return null;
  return cleaned;
}

export function resolveSupabaseConfig() {
  const url =
    cleanEnvValue(process.env.SUPABASE_URL, 'https://your-project') ||
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL, 'https://your-project') ||
    cleanEnvValue(process.env.VITE_SUPABASE_URL, 'https://your-project') ||
    DEFAULT_SUPABASE_TARGET.url;

  const anonKey =
    cleanEnvValue(process.env.SUPABASE_ANON_KEY, 'your-') ||
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'your-') ||
    cleanEnvValue(process.env.VITE_SUPABASE_ANON_KEY, 'your-');

  const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY, 'your-');

  const host = cleanEnvValue(process.env.SUPABASE_DB_HOST) || DEFAULT_SUPABASE_TARGET.host;
  const port = Number(cleanEnvValue(process.env.SUPABASE_DB_PORT) || DEFAULT_SUPABASE_TARGET.port);
  const database = cleanEnvValue(process.env.SUPABASE_DB_NAME) || DEFAULT_SUPABASE_TARGET.database;
  const user = cleanEnvValue(process.env.SUPABASE_DB_USER) || DEFAULT_SUPABASE_TARGET.user;

  const refMatch = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  const projectRef = refMatch?.[1] || DEFAULT_SUPABASE_TARGET.projectRef;

  return {
    projectRef,
    url: url.replace(/\/$/, ''),
    host,
    port: Number.isFinite(port) && port > 0 ? port : 5432,
    database,
    user,
    anonKey,
    serviceRoleKey,
    urlConfigured: Boolean(url),
    anonKeyConfigured: Boolean(anonKey),
    serviceRoleConfigured: Boolean(serviceRoleKey),
    ready: Boolean(url && anonKey),
  };
}

export function getProviderReadiness() {
  const hasRealEnv = (key: string, placeholderPrefix?: string) =>
    Boolean(cleanEnvValue(process.env[key], placeholderPrefix));
  const sb = resolveSupabaseConfig();

  return {
    ai: {
      provider: 'Google Gemini (@google/genai)',
      model: getAiModelName(),
      configured: Boolean(getGeminiClient()),
      envVar: 'GEMINI_API_KEY',
    },
    supabase: {
      projectRef: sb.projectRef,
      url: sb.url,
      host: sb.host,
      port: sb.port,
      database: sb.database,
      user: sb.user,
      urlConfigured: sb.urlConfigured,
      anonKeyConfigured: sb.anonKeyConfigured,
      serviceRoleConfigured: sb.serviceRoleConfigured,
      ready: sb.ready,
    },
    channels: {
      inApp: { configured: true, status: 'ACTIVE' },
      email: {
        configured:
          hasRealEnv('SMTP_HOST') &&
          hasRealEnv('SMTP_USER') &&
          hasRealEnv('SMTP_PASS'),
        provider: process.env.SMTP_HOST ? `SMTP (${process.env.SMTP_HOST})` : 'Unconfigured',
        envVars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'],
      },
      sms: (() => {
        const afroReady = hasRealEnv('AFROMESSAGE_API_KEY');
        const geezReady = hasRealEnv('GEEZSMS_API_TOKEN');
        const twilioReady =
          hasRealEnv('TWILIO_ACCOUNT_SID') &&
          hasRealEnv('TWILIO_AUTH_TOKEN') &&
          hasRealEnv('TWILIO_FROM_NUMBER');
        const atReady =
          hasRealEnv('AFRICASTALKING_API_KEY') && hasRealEnv('AFRICASTALKING_USERNAME');
        const activeList: string[] = [];
        if (afroReady) activeList.push('AfroMessage');
        if (geezReady) activeList.push('GeezSMS');
        if (twilioReady) activeList.push('Twilio SMS');
        if (atReady) activeList.push("Africa's Talking");
        return {
          configured: activeList.length > 0,
          provider: activeList.length > 0 ? activeList.join(', ') : 'Unconfigured',
          envVars: [
            'AFROMESSAGE_API_KEY',
            'GEEZSMS_API_TOKEN',
            'TWILIO_ACCOUNT_SID',
            'AFRICASTALKING_API_KEY',
          ],
        };
      })(),
      whatsapp: {
        configured:
          hasRealEnv('WHATSAPP_API_TOKEN') &&
          hasRealEnv('WHATSAPP_PHONE_NUMBER_ID'),
        provider: hasRealEnv('WHATSAPP_API_TOKEN') ? 'Meta WhatsApp Cloud API' : 'Unconfigured',
        envVars: ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
      },
    },
    cronSecretConfigured: hasRealEnv('CRON_SECRET', 'CHANGE_ME'),
  };
}

export function listSqlMigrations(rootDir: string = process.cwd()) {
  const migDir = path.resolve(rootDir, 'supabase', 'migrations');
  if (!fs.existsSync(migDir)) return [];
  return fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((filename) => {
      const fullPath = path.join(migDir, filename);
      const stat = fs.statSync(fullPath);
      const version = filename.split('_')[0] || filename;
      return {
        version,
        filename,
        sizeBytes: stat.size,
      };
    });
}

let lastScheduledReminderRun: {
  ranAt: string;
  trigger: 'startup' | 'interval' | 'cron' | 'manual';
  status: string;
  evaluatedCount: number;
  supabaseRpcDetail?: string;
} = {
  ranAt: new Date().toISOString(),
  trigger: 'startup',
  status: 'READY',
  evaluatedCount: 0,
};

export function recordScheduledHeartbeat() {
  lastScheduledReminderRun = {
    ...lastScheduledReminderRun,
    ranAt: new Date().toISOString(),
    trigger: 'interval',
    status: 'SCHEDULED_HEARTBEAT',
  };
}

export function handleHealth(): HandlerResult {
  return {
    status: 200,
    body: {
      status: 'ok',
      service: 'ZACMA Technology & Training Institute Portal',
      timestamp: new Date().toISOString(),
    },
  };
}

export type AiChatMode = 'standard' | 'fast';

export interface AiChatPayload {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant' | 'model'; text: string }>;
  role?: AiRoleScope;
  userName?: string;
  tenantId?: string;
  tenantName?: string;
  isSuperAdminMode?: boolean;
  activeModule?: string;
  modelOverride?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  mode?: AiChatMode;
  context?: Record<string, unknown>;
}

interface PreparedAiChat {
  ai: GoogleGenAI;
  trimmedMessage: string;
  systemInstruction: string;
  history: Content[];
  candidateModels: string[];
  verifiedRole: AiRoleScope;
  verifiedTenantId: string;
  verifiedUid: string;
  strippedKeys: string[];
}

function estimateAiCostUsd(model: string, promptTokens: number, outputTokens: number): number {
  const isLite = model.includes('lite');
  const inputRatePer1M = isLite ? 0.1 : 0.3;
  const outputRatePer1M = isLite ? 0.4 : 1.2;
  const cost = (promptTokens / 1_000_000) * inputRatePer1M + (outputTokens / 1_000_000) * outputRatePer1M;
  return Number(cost.toFixed(6));
}

function normalizeChatHistory(
  rawHistory?: Array<{ role: 'user' | 'assistant' | 'model'; text: string }>
): Content[] {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];
  const normalized: Content[] = [];

  for (const item of rawHistory.slice(-20)) {
    const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 2000) : '';
    if (!text) continue;
    const role: 'user' | 'model' = item.role === 'user' ? 'user' : 'model';

    if (normalized.length === 0 && role !== 'user') continue;

    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role && prev.parts && prev.parts[0] && 'text' in prev.parts[0]) {
      prev.parts[0].text = `${prev.parts[0].text}\n\n${text}`;
    } else {
      normalized.push({ role, parts: [{ text }] });
    }
  }

  return normalized;
}

async function prepareAiChat(
  payload: AiChatPayload,
  authHeader?: string
): Promise<{ ok: true; data: PreparedAiChat } | { ok: false; error: HandlerResult }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      error: {
        status: 503,
        body: {
          code: 'AI_NOT_CONFIGURED',
          error:
            'ZACMA AI Assistant is not configured on this server (GEMINI_API_KEY missing). Add GEMINI_API_KEY to your server environment variables and redeploy. All other portal modules continue operating normally.',
        },
      },
    };
  }

  const {
    message,
    history,
    role,
    tenantId,
    isSuperAdminMode,
    activeModule,
    modelOverride,
    mode,
    context,
  } = payload || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return {
      ok: false,
      error: {
        status: 400,
        body: { error: 'Message text is required.' },
      },
    };
  }

  // Enforce cryptographic auth, authoritative Firestore profile/tenant lookup,
  // multi-tenant boundary, role escalation check, prompt-injection shield & context sanitizer.
  const authDecision = await authorizeAiRequest({
    authHeader,
    requestedRole: role,
    requestedTenantId: tenantId,
    isSuperAdminMode,
    message,
    rawContext: context,
  });

  if (!authDecision.ok) {
    return {
      ok: false,
      error: {
        status: authDecision.status,
        body: {
          code: authDecision.code,
          error: authDecision.error,
        },
      },
    };
  }

  const verifiedRole = authDecision.effectiveRole;
  const safeTenantName = authDecision.verifiedTenantName.slice(0, 120);
  const safeTenantId = authDecision.verifiedTenantId.slice(0, 64);
  const safeModule = String(activeModule || 'general').slice(0, 60);
  const knowledgeText =
    verifiedRole === 'SUPER_ADMIN'
      ? 'ZACMA Super Admin Control Center governs registered training institutes, SaaS subscription tiers, platform billing, module licensing, AI token quotas, support sessions, and cross-platform analytics.'
      : buildKnowledgeContextForRole(verifiedRole);

  const rolePolicy: Record<AiRoleScope, string> = {
    SUPER_ADMIN:
      'User is a ZACMA PLATFORM SUPER ADMIN. You may analyze registered institutes, subscription status, MRR/ARR platform revenue, expiring trials, AI usage/cost telemetry, churn risk, and platform-wide operational health using ONLY the authorized platform context below. Never expose user passwords, API keys, or raw private encrypted ID documents.',
    ADMIN:
      'User is an INSTITUTE ADMIN. You may analyze this institute’s executive KPIs, approved revenue, expenses, outstanding fees, overdue students, pending payment approvals, Chapa transactions, attendance trends, staff organization, and draft executive reports or announcements — strictly for THIS institute only. Never reference other institutes or platform-level data.',
    MANAGER:
      'User is an INSTITUTE MANAGER. You may analyze this institute’s operational metrics, course enrollment health, attendance trends, overdue lists, and authorized summaries — strictly for THIS institute only. Never disclose Admin-only staff salaries or other institutes.',
    ACCOUNTANT:
      'User is an INSTITUTE ACCOUNTANT. You may analyze fee collections, overdue student balances, pending payment verifications, Chapa reconciliation, potential duplicate payments, expense anomalies, and draft polite fee reminder messages for human approval. Never fabricate amounts, never access HR salary vaults or Super Admin data, and remind that Admin approval is required to finalize payments.',
    INSTRUCTOR:
      'User is an INSTRUCTOR. STRICT SECURITY RULE: NEVER discuss, estimate, or reference any financial amounts, fees, revenue, expenses, or salaries. Focus exclusively on THIS instructor’s assigned courses, enrolled students, attendance patterns, lesson plans, quiz/exam creation, assignment ideas, and classroom notices.',
    RECEPTIONIST:
      'User is a RECEPTIONIST. Focus strictly on front-desk student registration intake, AI ID/QR scanning workflows, course catalog inquiries, admission steps, and non-financial student directory lookups. Never disclose accounting ledgers, revenue, expenses, or staff salaries.',
    HR_OFFICER:
      'User is an HR OFFICER. Focus strictly on staff registration, onboarding workflows, departmental coverage, job descriptions, HR policies, and staff directory organization. Never disclose private student financial ledgers or Admin-only payroll/compensation vaults.',
    GENERAL_STAFF:
      'User is GENERAL STAFF. Focus strictly on authorized operational workflows, course catalog information, non-financial student directory assistance, and portal navigation. Never disclose financial totals, private payment ledgers, or staff salaries.',
    STUDENT:
      'User is a STUDENT. STRICT SECURITY RULE: Discuss ONLY THIS student’s own profile, own enrolled courses, own attendance record, own fee installments, own Chapa/manual payment status, own approved receipts, study plans, and exam prep tips. NEVER reference, compare, or speculate about any other student or institute-wide totals.',
  };

  const systemInstruction = `You are "ZACMA AI ASSISTANT", the centralized role-isolated AI intelligence engine for ${safeTenantName}.

VERIFIED SECURITY BOUNDARY (ENFORCED SERVER-SIDE):
- Verified Identity: ${authDecision.verifiedName.slice(0, 80)} (UID: ${authDecision.verifiedUid})
- Verified Role Scope: ${verifiedRole}
- Verified Tenant Boundary: ${safeTenantName} (Tenant ID: ${safeTenantId})
- Active Portal Module: ${safeModule}
- Role Policy: ${rolePolicy[verifiedRole]}

ABSOLUTE SECURITY, ISOLATION & APPROVAL RULES (NEVER VIOLATE):
1. STRICT ISOLATION: Answer ONLY using records present in the Sanitized Authorized Context below. If the user asks for data outside their verified role or tenant (e.g. another student, another institute, restricted financials, HR salaries, Super Admin data), politely decline and explain that access is restricted to authorized roles.
2. ACCOUNTING ACCURACY: ONLY APPROVED payments count as official revenue or reduce student balances. Pending payments never count as paid. Respect the institute's configured currency (default ETB).
3. ZERO FABRICATION: Never invent figures, student IDs, receipt numbers, or database records. If a metric is absent from the context, state clearly that it is not available in the current authorized view.
4. HUMAN-IN-THE-LOOP APPROVAL: You are strictly read-only. You NEVER automatically send SMS/emails, approve payments, alter balances, modify records, or change roles. Whenever drafting an SMS, email, announcement, reminder, exam, lesson plan, course outline, or job description, clearly label it as a **Draft Ready for Review & Manual Approval**.
5. ZERO SECRET DISCLOSURE: Never reveal passwords, API keys, tokens, environment variables, or encrypted ID files.
6. FORMAT: Be concise, structured with clean Markdown headings/bullets/tables where helpful, accurate, and directly actionable inside the active module (${safeModule}).

OFFICIAL KNOWLEDGE CONTEXT:
${knowledgeText}

SANITIZED AUTHORIZED LIVE CONTEXT FOR ${verifiedRole} (${safeTenantId}) (JSON):
${JSON.stringify(authDecision.sanitizedContext || {}, null, 2).slice(0, 14000)}`;

  const configuredDefault =
    modelOverride === 'gemini-3.1-flash-lite' || modelOverride === 'gemini-4-hydrogen'
      ? modelOverride
      : getAiModelName() === 'gemini-3.1-flash-lite'
      ? 'gemini-3.1-flash-lite'
      : 'gemini-4-hydrogen';

  const candidateModels =
    mode === 'fast'
      ? Array.from(new Set(['gemini-3.1-flash-lite', configuredDefault]))
      : Array.from(new Set([configuredDefault, 'gemini-3.1-flash-lite']));

  return {
    ok: true,
    data: {
      ai,
      trimmedMessage: message.trim().slice(0, 3000),
      systemInstruction,
      history: normalizeChatHistory(history),
      candidateModels,
      verifiedRole,
      verifiedTenantId: safeTenantId,
      verifiedUid: authDecision.verifiedUid,
      strippedKeys: authDecision.strippedKeys,
    },
  };
}

function isModelUnavailableError(errText: string): boolean {
  const lowerErr = errText.toLowerCase();
  return (
    errText.includes('404') ||
    errText.includes('NOT_FOUND') ||
    lowerErr.includes('not found') ||
    lowerErr.includes('not supported') ||
    lowerErr.includes('unknown model') ||
    lowerErr.includes('invalid model')
  );
}

function isTransientError(errText: string): boolean {
  return errText.includes('503') || errText.includes('UNAVAILABLE') || errText.includes('429');
}

function formatAiUpstreamError(rawErr: string): string {
  try {
    const parsed = JSON.parse(rawErr) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      try {
        const inner = JSON.parse(parsed.error.message) as { error?: { message?: string } };
        if (inner?.error?.message) return inner.error.message;
      } catch {
        return parsed.error.message;
      }
    }
  } catch {
    // Keep original message if not JSON
  }
  return rawErr;
}

export async function handleAiChat(
  payload: AiChatPayload,
  authHeader?: string
): Promise<HandlerResult> {
  const prepared = await prepareAiChat(payload, authHeader);
  if (!prepared.ok) {
    return prepared.error;
  }

  const {
    ai,
    trimmedMessage,
    systemInstruction,
    history,
    candidateModels,
    verifiedRole,
    verifiedTenantId,
    strippedKeys,
  } = prepared.data;
  let lastError: unknown = null;

  for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
    const activeModel = candidateModels[modelIdx];
    const hasNextModel = modelIdx < candidateModels.length - 1;
    let shouldTryFallbackModel = false;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chat = ai.chats.create({
          model: activeModel,
          history,
          config: {
            systemInstruction,
            ...(activeModel.startsWith('gemini-4-')
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        const response: GenerateContentResponse = await chat.sendMessage({
          message: trimmedMessage,
        });
        const reply = response.text?.trim();
        if (!reply) {
          return {
            status: 502,
            body: { error: 'AI service returned an empty response.' },
          };
        }
        const promptTokens = response.usageMetadata?.promptTokenCount ?? Math.ceil((systemInstruction.length + trimmedMessage.length) / 4);
        const outputTokens = response.usageMetadata?.candidatesTokenCount ?? Math.ceil(reply.length / 4);
        const totalTokens = response.usageMetadata?.totalTokenCount ?? promptTokens + outputTokens;
        return {
          status: 200,
          body: {
            reply,
            model: activeModel,
            verifiedRole,
            verifiedTenantId,
            strippedContextKeysCount: strippedKeys.length,
            usage: {
              promptTokens,
              outputTokens,
              totalTokens,
              estimatedCostUsd: estimateAiCostUsd(activeModel, promptTokens, outputTokens),
            },
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        lastError = error;
        const errText = error instanceof Error ? error.message : String(error);
        if (isModelUnavailableError(errText)) {
          shouldTryFallbackModel = true;
          break;
        }
        if (isTransientError(errText)) {
          if (hasNextModel) {
            shouldTryFallbackModel = true;
            break;
          }
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 700));
            continue;
          }
        }
        break;
      }
    }

    if (!shouldTryFallbackModel) {
      break;
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error('ZACMA AI Assistant error:', errMsg);
  return {
    status: 502,
    body: {
      code: 'AI_UPSTREAM_ERROR',
      error: `AI provider request failed: ${formatAiUpstreamError(errMsg)}`,
    },
  };
}

export async function handleAiChatStream(
  payload: AiChatPayload,
  callbacks: {
    onDelta: (delta: string) => void;
    onDone: (meta: {
      model: string;
      timestamp: string;
      verifiedRole: AiRoleScope;
      verifiedTenantId: string;
      strippedContextKeysCount: number;
      usage: {
        promptTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      };
    }) => void;
    onError: (status: number, body: Record<string, unknown>) => void;
  },
  authHeader?: string
): Promise<void> {
  const prepared = await prepareAiChat(payload, authHeader);
  if (!prepared.ok) {
    callbacks.onError(prepared.error.status, prepared.error.body);
    return;
  }

  const {
    ai,
    trimmedMessage,
    systemInstruction,
    history,
    candidateModels,
    verifiedRole,
    verifiedTenantId,
    strippedKeys,
  } = prepared.data;
  let lastError: unknown = null;

  for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
    const activeModel = candidateModels[modelIdx];
    const hasNextModel = modelIdx < candidateModels.length - 1;
    let shouldTryFallbackModel = false;
    let emittedAnyChunk = false;
    let totalChars = 0;
    let finalUsage: { promptTokens?: number; outputTokens?: number; totalTokens?: number } = {};

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const chat = ai.chats.create({
          model: activeModel,
          history,
          config: {
            systemInstruction,
            ...(activeModel.startsWith('gemini-4-')
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        });
        const stream = await chat.sendMessageStream({
          message: trimmedMessage,
        });
        for await (const chunk of stream) {
          const c = chunk as GenerateContentResponse;
          if (c.usageMetadata) {
            finalUsage = {
              promptTokens: c.usageMetadata.promptTokenCount ?? finalUsage.promptTokens,
              outputTokens: c.usageMetadata.candidatesTokenCount ?? finalUsage.outputTokens,
              totalTokens: c.usageMetadata.totalTokenCount ?? finalUsage.totalTokens,
            };
          }
          const delta = c.text;
          if (delta) {
            emittedAnyChunk = true;
            totalChars += delta.length;
            callbacks.onDelta(delta);
          }
        }
        if (!emittedAnyChunk) {
          callbacks.onError(502, { error: 'AI service returned an empty response.' });
          return;
        }
        const promptTokens =
          finalUsage.promptTokens ?? Math.ceil((systemInstruction.length + trimmedMessage.length) / 4);
        const outputTokens = finalUsage.outputTokens ?? Math.ceil(totalChars / 4);
        const totalTokens = finalUsage.totalTokens ?? promptTokens + outputTokens;
        callbacks.onDone({
          model: activeModel,
          timestamp: new Date().toISOString(),
          verifiedRole,
          verifiedTenantId,
          strippedContextKeysCount: strippedKeys.length,
          usage: {
            promptTokens,
            outputTokens,
            totalTokens,
            estimatedCostUsd: estimateAiCostUsd(activeModel, promptTokens, outputTokens),
          },
        });
        return;
      } catch (error) {
        lastError = error;
        if (emittedAnyChunk) {
          break;
        }
        const errText = error instanceof Error ? error.message : String(error);
        if (isModelUnavailableError(errText)) {
          shouldTryFallbackModel = true;
          break;
        }
        if (isTransientError(errText)) {
          if (hasNextModel) {
            shouldTryFallbackModel = true;
            break;
          }
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 700));
            continue;
          }
        }
        break;
      }
    }

    if (!shouldTryFallbackModel) {
      break;
    }
  }

  const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error('ZACMA AI Assistant stream error:', errMsg);
  callbacks.onError(502, {
    code: 'AI_UPSTREAM_ERROR',
    error: `AI provider request failed: ${formatAiUpstreamError(errMsg)}`,
  });
}

export async function handleAiSecurityAudit(authHeader?: string): Promise<HandlerResult> {
  // Require verified Super Admin / Platform Staff caller for running the live audit endpoint
  const decision = await authorizeAiRequest({
    authHeader,
    requestedRole: 'SUPER_ADMIN',
    isSuperAdminMode: true,
    message: 'Run platform security isolation verification',
  });
  if (!decision.ok) {
    return {
      status: decision.status,
      body: { code: decision.code, error: decision.error },
    };
  }
  const suite = runAiSecurityAuditSuite();
  return {
    status: 200,
    body: {
      ...suite,
      verifiedByUid: decision.verifiedUid,
      verifiedByRole: decision.platformRole || 'SUPER_ADMIN',
    },
  };
}

export async function handleSetupStatus(rootDir: string = process.cwd()): Promise<HandlerResult> {
  const providers = getProviderReadiness();
  const sqlMigrations = listSqlMigrations(rootDir);

  const firebaseConfigPath = path.resolve(rootDir, 'firebase-applet-config.json');
  let activeFirestoreInfo: {
    configured: boolean;
    projectId?: string;
    databaseId?: string;
  } = { configured: false };

  if (process.env.VITE_FIREBASE_PROJECT_ID) {
    activeFirestoreInfo = {
      configured: true,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      databaseId: process.env.VITE_FIREBASE_DATABASE_ID || '(default)',
    };
  } else if (fs.existsSync(firebaseConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
      activeFirestoreInfo = {
        configured: Boolean(parsed.projectId && parsed.firestoreDatabaseId),
        projectId: parsed.projectId,
        databaseId: parsed.firestoreDatabaseId,
      };
    } catch {
      activeFirestoreInfo = { configured: false };
    }
  }

  const sb = resolveSupabaseConfig();
  let supabaseConnectivity: {
    checked: boolean;
    reachable: boolean;
    tablesChecked?: boolean;
    detail: string;
  } = {
    checked: false,
    reachable: false,
    detail: `Target ${sb.host}:${sb.port} (${sb.database}) configured. Add SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in server environment.`,
  };

  try {
    const headers: Record<string, string> = sb.anonKey
      ? {
          apikey: sb.anonKey,
          Authorization: `Bearer ${sb.anonKey}`,
        }
      : {};
    const healthRes = await fetch(`${sb.url}/rest/v1/`, {
      headers,
      signal: AbortSignal.timeout(4500),
    });
    const hostReachable = healthRes.ok || healthRes.status === 401 || healthRes.status === 404;
    supabaseConnectivity = {
      checked: true,
      reachable: hostReachable,
      detail: sb.anonKey
        ? healthRes.ok
          ? `Supabase REST API (${sb.projectRef}) authenticated and responded normally.`
          : `Supabase endpoint ${sb.projectRef} reachable (HTTP ${healthRes.status}).`
        : hostReachable
        ? `Supabase host ${sb.host} is reachable. Add SUPABASE_ANON_KEY & SUPABASE_SERVICE_ROLE_KEY in Vercel to enable authenticated REST/Cron queries.`
        : `Supabase host returned HTTP ${healthRes.status}.`,
    };
  } catch (err) {
    supabaseConnectivity = {
      checked: true,
      reachable: false,
      detail: err instanceof Error ? err.message : `Unable to reach ${sb.host}.`,
    };
  }

  const requiredEnvChecklist = [
    {
      key: 'GEMINI_API_KEY',
      category: 'AI Assistant',
      requiredFor: 'ZACMA AI Assistant server-side responses',
      present: providers.ai.configured,
    },
    {
      key: 'SUPABASE_URL',
      category: 'Supabase Deployment',
      requiredFor: 'External Supabase PostgreSQL project URL (Vercel deployment)',
      present: providers.supabase.urlConfigured,
    },
    {
      key: 'SUPABASE_ANON_KEY',
      category: 'Supabase Deployment',
      requiredFor: 'Supabase client public key for RLS-enforced queries',
      present: providers.supabase.anonKeyConfigured,
    },
    {
      key: 'SUPABASE_SERVICE_ROLE_KEY',
      category: 'Supabase Server Cron',
      requiredFor: 'Protected server-side scheduled reminder execution (never exposed to browser)',
      present: providers.supabase.serviceRoleConfigured,
    },
    {
      key: 'CRON_SECRET',
      category: 'Scheduled Reminders',
      requiredFor: 'Authorizes Vercel Cron calls to /api/cron/reminders',
      present: providers.cronSecretConfigured,
    },
    {
      key: 'SMTP_HOST / SMTP_USER / SMTP_PASS',
      category: 'Optional Email Delivery',
      requiredFor: 'Automated student fee reminder emails',
      present: providers.channels.email.configured,
    },
    {
      key: 'TWILIO_ACCOUNT_SID / AUTH_TOKEN',
      category: 'Optional SMS Delivery',
      requiredFor: 'Automated student fee reminder SMS alerts',
      present: providers.channels.sms.configured,
    },
    {
      key: 'WHATSAPP_API_TOKEN / PHONE_ID',
      category: 'Optional WhatsApp Delivery',
      requiredFor: 'Automated student fee reminder WhatsApp messages',
      present: providers.channels.whatsapp.configured,
    },
  ];

  return {
    status: 200,
    body: {
      checkedAt: new Date().toISOString(),
      activeFirestore: activeFirestoreInfo,
      supabaseConnectivity,
      providers,
      sqlMigrations,
      requiredEnvChecklist,
      lastScheduledReminderRun,
    },
  };
}

export async function handleCronReminders(authHeader?: string): Promise<HandlerResult> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret !== 'CHANGE_ME_RANDOM_SECRET' && cronSecret !== 'change-me-to-random-secret') {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return {
        status: 401,
        body: { error: 'Unauthorized cron trigger.' },
      };
    }
  }

  let supabaseRpcDetail = 'Supabase service role not configured; active Firestore reminder engine handles evaluation.';
  let evaluatedCount = lastScheduledReminderRun.evaluatedCount;

  // When deployed on Vercel with Supabase service role credentials, execute the protected SQL reminder function directly!
  const sb = resolveSupabaseConfig();
  if (sb.url && sb.serviceRoleKey) {
    try {
      const rpcUrl = `${sb.url}/rest/v1/rpc/process_zacma_payment_reminders`;
      const rpcRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: sb.serviceRoleKey,
          Authorization: `Bearer ${sb.serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_upcoming_lead_days: 7,
          p_overdue_repeat_days: 3,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (rpcRes.ok) {
        const rpcJson = (await rpcRes.json()) as { checked_installments?: number; reminders_created?: number };
        evaluatedCount = Number(rpcJson.checked_installments || 0);
        supabaseRpcDetail = `Supabase (${sb.projectRef}) process_zacma_payment_reminders() executed (${evaluatedCount} checked, ${rpcJson.reminders_created || 0} reminders created).`;
      } else {
        supabaseRpcDetail = `Supabase (${sb.projectRef}) RPC returned HTTP ${rpcRes.status}. Verify migration 0002 is applied.`;
      }
    } catch (err) {
      supabaseRpcDetail = err instanceof Error ? err.message : 'Supabase RPC request failed.';
    }
  }

  lastScheduledReminderRun = {
    ranAt: new Date().toISOString(),
    trigger: 'cron',
    status: 'EXECUTED',
    evaluatedCount,
    supabaseRpcDetail,
  };

  return {
    status: 200,
    body: {
      ok: true,
      message: 'Scheduled reminder check triggered.',
      run: lastScheduledReminderRun,
      providers: getProviderReadiness().channels,
    },
  };
}

export function handleDispatchExternal(payload: {
  channel?: 'email' | 'sms' | 'whatsapp';
  recipient?: string;
  subject?: string;
  body?: string;
}): HandlerResult {
  const { channel, recipient, subject, body } = payload || {};
  const channels = getProviderReadiness().channels;
  if (!channel || !recipient || !body) {
    return {
      status: 400,
      body: { error: 'channel, recipient, and body are required.' },
    };
  }
  if (channel === 'email' && !channels.email.configured) {
    return {
      status: 503,
      body: {
        delivered: false,
        status: 'PROVIDER_NOT_CONFIGURED',
        channel,
        message: `Email provider not configured. Set ${channels.email.envVars.join(', ')} in server environment variables.`,
      },
    };
  }
  if (channel === 'sms' && !channels.sms.configured) {
    return {
      status: 503,
      body: {
        delivered: false,
        status: 'PROVIDER_NOT_CONFIGURED',
        channel,
        message: `SMS provider not configured. Set ${channels.sms.envVars.join(', ')} in server environment variables.`,
      },
    };
  }
  if (channel === 'whatsapp' && !channels.whatsapp.configured) {
    return {
      status: 503,
      body: {
        delivered: false,
        status: 'PROVIDER_NOT_CONFIGURED',
        channel,
        message: `WhatsApp Cloud API not configured. Set ${channels.whatsapp.envVars.join(', ')} in server environment variables.`,
      },
    };
  }

  return {
    status: 200,
    body: {
      delivered: false,
      status: 'QUEUED_FOR_PROVIDER_WEBHOOK',
      channel,
      recipient,
      subject: subject || 'ZACMA Payment Reminder',
      message:
        'Provider credentials detected. Configure provider webhook confirmation callback to record verified external delivery.',
    },
  };
}

export function handleRecordReminderRun(payload: {
  evaluatedCount?: number;
  trigger?: 'manual' | 'cron';
}): HandlerResult {
  const { evaluatedCount, trigger } = payload || {};
  lastScheduledReminderRun = {
    ranAt: new Date().toISOString(),
    trigger: trigger === 'cron' ? 'cron' : 'manual',
    status: 'COMPLETED',
    evaluatedCount: Number(evaluatedCount || 0),
  };
  return {
    status: 200,
    body: { ok: true, run: lastScheduledReminderRun },
  };
}

// ============================================================================
// ZACMA SERVER-SIDE SMS GATEWAY ENGINE (Ethiopian Mobile +251 Support)
// Supports AfroMessage, GeezSMS, Twilio, Africa's Talking + Explicit Test Mode
// ============================================================================

export type ServerSmsProvider = 'afromessage' | 'geezsms' | 'twilio' | 'africastalking';

export function normalizeEthiopianPhone(raw: string): {
  valid: boolean;
  e164: string;
  error?: string;
} {
  const cleaned = String(raw || '').replace(/[\s\-()]/g, '').trim();
  if (!cleaned) {
    return { valid: false, e164: '', error: 'Phone number is required.' };
  }
  if (/^\+251[79]\d{8}$/.test(cleaned)) {
    return { valid: true, e164: cleaned };
  }
  if (/^251[79]\d{8}$/.test(cleaned)) {
    return { valid: true, e164: `+${cleaned}` };
  }
  if (/^0[79]\d{8}$/.test(cleaned)) {
    return { valid: true, e164: `+251${cleaned.slice(1)}` };
  }
  if (/^[79]\d{8}$/.test(cleaned)) {
    return { valid: true, e164: `+251${cleaned}` };
  }
  // Allow valid international E.164 format if non-Ethiopian
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    return { valid: true, e164: cleaned };
  }
  return {
    valid: false,
    e164: cleaned,
    error: 'Invalid mobile number format. Expected Ethiopian format (+2519XXXXXXXX / +2517XXXXXXXX or 09XXXXXXXX).',
  };
}

export function getSmsGatewayStatus() {
  const afroKey = cleanEnvValue(process.env.AFROMESSAGE_API_KEY);
  const afroIdentifier = cleanEnvValue(process.env.AFROMESSAGE_IDENTIFIER_ID);
  const afroSender = cleanEnvValue(process.env.AFROMESSAGE_SENDER_NAME);

  const geezToken = cleanEnvValue(process.env.GEEZSMS_API_TOKEN);
  const geezShortcode = cleanEnvValue(process.env.GEEZSMS_SHORTCODE_ID);

  const twilioSid = cleanEnvValue(process.env.TWILIO_ACCOUNT_SID);
  const twilioToken = cleanEnvValue(process.env.TWILIO_AUTH_TOKEN);
  const twilioFrom = cleanEnvValue(process.env.TWILIO_FROM_NUMBER);

  const atKey = cleanEnvValue(process.env.AFRICASTALKING_API_KEY);
  const atUser = cleanEnvValue(process.env.AFRICASTALKING_USERNAME);
  const atSender = cleanEnvValue(process.env.AFRICASTALKING_SENDER_ID);

  return {
    checkedAt: new Date().toISOString(),
    providers: {
      afromessage: {
        name: 'AfroMessage (Ethiopia)',
        configured: Boolean(afroKey),
        supportsEthiopia: true,
        supportsSenderId: true,
        senderHint: afroSender || (afroIdentifier ? 'Identifier configured' : 'Default'),
        requiredEnvVars: ['AFROMESSAGE_API_KEY', 'AFROMESSAGE_IDENTIFIER_ID', 'AFROMESSAGE_SENDER_NAME'],
      },
      geezsms: {
        name: 'GeezSMS (Ethiopia)',
        configured: Boolean(geezToken),
        supportsEthiopia: true,
        supportsSenderId: Boolean(geezShortcode),
        senderHint: geezShortcode || 'Default',
        requiredEnvVars: ['GEEZSMS_API_TOKEN', 'GEEZSMS_SHORTCODE_ID'],
      },
      twilio: {
        name: 'Twilio SMS (Global + Ethiopia)',
        configured: Boolean(twilioSid && twilioToken && twilioFrom),
        supportsEthiopia: true,
        supportsSenderId: true,
        senderHint: twilioFrom || 'Not set',
        requiredEnvVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
      },
      africastalking: {
        name: "Africa's Talking (East Africa)",
        configured: Boolean(atKey && atUser),
        supportsEthiopia: true,
        supportsSenderId: Boolean(atSender),
        senderHint: atSender || 'Default',
        requiredEnvVars: ['AFRICASTALKING_API_KEY', 'AFRICASTALKING_USERNAME', 'AFRICASTALKING_SENDER_ID'],
      },
    },
    anyLiveProviderConfigured: Boolean(
      afroKey || geezToken || (twilioSid && twilioToken && twilioFrom) || (atKey && atUser)
    ),
  };
}

export function handleSmsStatus(): HandlerResult {
  return {
    status: 200,
    body: getSmsGatewayStatus(),
  };
}

export async function handleSmsSend(payload: {
  provider?: ServerSmsProvider;
  to?: string;
  message?: string;
  senderId?: string;
  ownerPhoneNumber?: string;
  testMode?: boolean;
}): Promise<HandlerResult> {
  const provider: ServerSmsProvider =
    payload?.provider && ['afromessage', 'geezsms', 'twilio', 'africastalking'].includes(payload.provider)
      ? payload.provider
      : 'afromessage';
  const testMode = Boolean(payload?.testMode);
  const phoneCheck = normalizeEthiopianPhone(payload?.to || '');

  if (!phoneCheck.valid) {
    return {
      status: 400,
      body: {
        ok: false,
        status: 'FAILED',
        mode: testMode ? 'TEST' : 'LIVE',
        provider,
        error: phoneCheck.error || 'Invalid recipient mobile number.',
      },
    };
  }

  const trimmedMessage = String(payload?.message || '').trim().slice(0, 640);
  if (!trimmedMessage) {
    return {
      status: 400,
      body: {
        ok: false,
        status: 'FAILED',
        mode: testMode ? 'TEST' : 'LIVE',
        provider,
        error: 'SMS message body is required.',
      },
    };
  }

  // Explicit Sandbox Test Mode — clearly marked TEST_SIMULATED, never misreported as carrier delivery
  if (testMode) {
    return {
      status: 200,
      body: {
        ok: true,
        status: 'TEST_SIMULATED',
        mode: 'TEST',
        provider,
        normalizedPhone: phoneCheck.e164,
        providerMessageId: `TEST-${provider.toUpperCase()}-${Date.now()}`,
        detail:
          'Test mode active: message validated and logged locally without calling live carrier gateway. Disable Test Mode after configuring server SMS credentials.',
      },
    };
  }

  // LIVE GATEWAY DISPATCH
  try {
    if (provider === 'afromessage') {
      const apiKey = cleanEnvValue(process.env.AFROMESSAGE_API_KEY);
      if (!apiKey) {
        return {
          status: 503,
          body: {
            ok: false,
            status: 'FAILED',
            mode: 'LIVE',
            provider,
            code: 'PROVIDER_NOT_CONFIGURED',
            error:
              'AfroMessage is not configured on this server. Set AFROMESSAGE_API_KEY (and optional AFROMESSAGE_IDENTIFIER_ID / AFROMESSAGE_SENDER_NAME) in Vercel/server environment variables, or enable Test Mode.',
          },
        };
      }
      const identifierId = cleanEnvValue(process.env.AFROMESSAGE_IDENTIFIER_ID) || '';
      const senderName =
        cleanEnvValue(payload?.senderId) ||
        cleanEnvValue(process.env.AFROMESSAGE_SENDER_NAME) ||
        'ZACMA';

      const res = await fetch('https://api.afromessage.com/api/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: identifierId,
          sender: senderName,
          to: phoneCheck.e164,
          message: trimmedMessage,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        acknowledge?: string;
        response?: { message_id?: string; status?: string; errors?: string[] };
        message?: string;
      };
      if (res.ok && json.acknowledge === 'success') {
        return {
          status: 200,
          body: {
            ok: true,
            status: 'SENT',
            mode: 'LIVE',
            provider,
            normalizedPhone: phoneCheck.e164,
            providerMessageId: json.response?.message_id || `afro_${Date.now()}`,
            detail: 'Accepted by AfroMessage gateway for Ethiopian carrier delivery.',
          },
        };
      }
      return {
        status: 502,
        body: {
          ok: false,
          status: 'FAILED',
          mode: 'LIVE',
          provider,
          normalizedPhone: phoneCheck.e164,
          error:
            json.response?.errors?.join('; ') ||
            json.message ||
            `AfroMessage gateway returned HTTP ${res.status}.`,
        },
      };
    }

    if (provider === 'geezsms') {
      const token = cleanEnvValue(process.env.GEEZSMS_API_TOKEN);
      if (!token) {
        return {
          status: 503,
          body: {
            ok: false,
            status: 'FAILED',
            mode: 'LIVE',
            provider,
            code: 'PROVIDER_NOT_CONFIGURED',
            error:
              'GeezSMS is not configured on this server. Set GEEZSMS_API_TOKEN (and optional GEEZSMS_SHORTCODE_ID) in server environment variables, or enable Test Mode.',
          },
        };
      }
      const shortcodeId =
        cleanEnvValue(payload?.senderId) || cleanEnvValue(process.env.GEEZSMS_SHORTCODE_ID);
      const bodyParams = new URLSearchParams({
        token,
        phone: phoneCheck.e164.replace(/^\+/, ''),
        msg: trimmedMessage,
      });
      if (shortcodeId) bodyParams.set('shortcode_id', shortcodeId);

      const res = await fetch('https://api.geezsms.com/api/v1/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: boolean;
        msg?: string;
        data?: { id?: string };
      };
      if (res.ok && !json.error) {
        return {
          status: 200,
          body: {
            ok: true,
            status: 'SENT',
            mode: 'LIVE',
            provider,
            normalizedPhone: phoneCheck.e164,
            providerMessageId: json.data?.id || `geez_${Date.now()}`,
            detail: 'Accepted by GeezSMS Ethiopia gateway.',
          },
        };
      }
      return {
        status: 502,
        body: {
          ok: false,
          status: 'FAILED',
          mode: 'LIVE',
          provider,
          normalizedPhone: phoneCheck.e164,
          error: json.msg || `GeezSMS returned HTTP ${res.status}.`,
        },
      };
    }

    if (provider === 'twilio') {
      const sid = cleanEnvValue(process.env.TWILIO_ACCOUNT_SID);
      const token = cleanEnvValue(process.env.TWILIO_AUTH_TOKEN);
      const from = cleanEnvValue(process.env.TWILIO_FROM_NUMBER);
      if (!sid || !token || !from) {
        return {
          status: 503,
          body: {
            ok: false,
            status: 'FAILED',
            mode: 'LIVE',
            provider,
            code: 'PROVIDER_NOT_CONFIGURED',
            error:
              'Twilio SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in server environment variables, or enable Test Mode.',
          },
        };
      }
      const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
      const form = new URLSearchParams({
        To: phoneCheck.e164,
        From: from,
        Body: trimmedMessage,
      });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sid?: string;
        status?: string;
        message?: string;
      };
      if (res.ok && json.sid) {
        return {
          status: 200,
          body: {
            ok: true,
            status: json.status === 'delivered' ? 'DELIVERED' : 'SENT',
            mode: 'LIVE',
            provider,
            normalizedPhone: phoneCheck.e164,
            providerMessageId: json.sid,
            detail: `Accepted by Twilio (${json.status || 'queued'}).`,
          },
        };
      }
      return {
        status: 502,
        body: {
          ok: false,
          status: 'FAILED',
          mode: 'LIVE',
          provider,
          normalizedPhone: phoneCheck.e164,
          error: json.message || `Twilio returned HTTP ${res.status}.`,
        },
      };
    }

    // Africa's Talking
    const atKey = cleanEnvValue(process.env.AFRICASTALKING_API_KEY);
    const atUser = cleanEnvValue(process.env.AFRICASTALKING_USERNAME);
    if (!atKey || !atUser) {
      return {
        status: 503,
        body: {
          ok: false,
          status: 'FAILED',
          mode: 'LIVE',
          provider,
          code: 'PROVIDER_NOT_CONFIGURED',
          error:
            "Africa's Talking is not configured. Set AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME in server environment variables, or enable Test Mode.",
        },
      };
    }
    const atSender =
      cleanEnvValue(payload?.senderId) || cleanEnvValue(process.env.AFRICASTALKING_SENDER_ID);
    const form = new URLSearchParams({
      username: atUser,
      to: phoneCheck.e164,
      message: trimmedMessage,
    });
    if (atSender) form.set('from', atSender);

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey: atKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      SMSMessageData?: {
        Recipients?: Array<{ status?: string; messageId?: string; cost?: string }>;
        Message?: string;
      };
    };
    const rec = json.SMSMessageData?.Recipients?.[0];
    if (res.ok && rec && rec.status === 'Success') {
      return {
        status: 200,
        body: {
          ok: true,
          status: 'SENT',
          mode: 'LIVE',
          provider,
          normalizedPhone: phoneCheck.e164,
          providerMessageId: rec.messageId || `at_${Date.now()}`,
          detail: `Accepted by Africa's Talking (${rec.cost || 'standard rate'}).`,
        },
      };
    }
    return {
      status: 502,
      body: {
        ok: false,
        status: 'FAILED',
        mode: 'LIVE',
        provider,
        normalizedPhone: phoneCheck.e164,
        error: rec?.status || json.SMSMessageData?.Message || `Africa's Talking returned HTTP ${res.status}.`,
      },
    };
  } catch (err) {
    return {
      status: 502,
      body: {
        ok: false,
        status: 'FAILED',
        mode: 'LIVE',
        provider,
        normalizedPhone: phoneCheck.e164,
        error: err instanceof Error ? err.message : 'SMS gateway network error.',
      },
    };
  }
}

export async function handleSmsBalance(provider?: ServerSmsProvider): Promise<HandlerResult> {
  const statusInfo = getSmsGatewayStatus();
  const target: ServerSmsProvider = provider || 'afromessage';
  const info = statusInfo.providers[target];

  if (!info.configured) {
    return {
      status: 200,
      body: {
        available: false,
        provider: target,
        balanceLabel: 'Awaiting Credentials',
        detail: `Set ${info.requiredEnvVars.join(', ')} in server environment variables to query live ${info.name} credit balance.`,
      },
    };
  }

  try {
    if (target === 'twilio') {
      const sid = cleanEnvValue(process.env.TWILIO_ACCOUNT_SID)!;
      const token = cleanEnvValue(process.env.TWILIO_AUTH_TOKEN)!;
      const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
        headers: { Authorization: `Basic ${authHeader}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const j = (await res.json()) as { balance?: string; currency?: string };
        return {
          status: 200,
          body: {
            available: true,
            provider: target,
            balanceLabel: `${j.currency || 'USD'} ${Number(j.balance || 0).toFixed(2)}`,
            detail: 'Live Twilio account balance verified.',
          },
        };
      }
    }
    if (target === 'africastalking') {
      const key = cleanEnvValue(process.env.AFRICASTALKING_API_KEY)!;
      const user = cleanEnvValue(process.env.AFRICASTALKING_USERNAME)!;
      const res = await fetch(
        `https://api.africastalking.com/version1/user?username=${encodeURIComponent(user)}`,
        {
          headers: { apiKey: key, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (res.ok) {
        const j = (await res.json()) as { UserData?: { balance?: string } };
        return {
          status: 200,
          body: {
            available: true,
            provider: target,
            balanceLabel: j.UserData?.balance || 'Active',
            detail: "Live Africa's Talking balance verified.",
          },
        };
      }
    }
  } catch {
    // Non-fatal fallback
  }

  return {
    status: 200,
    body: {
      available: true,
      provider: target,
      balanceLabel: 'Credentials Active',
      detail: `${info.name} credentials are configured on the server. Check provider dashboard for detailed credit breakdown.`,
    },
  };
}
