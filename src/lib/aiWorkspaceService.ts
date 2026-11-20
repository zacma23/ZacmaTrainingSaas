import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { auth, db } from './firebase';
import {
  AiConversationRecord,
  AiFeatureType,
  AiModelId,
  AiRoleScope,
  AiSecurityAuditScenarioResult,
  AiStoredMessage,
} from '../types/zacma';

export const ZACMA_OPEN_AI_EVENT = 'zacma:open-ai';

export interface OpenAiEventDetail {
  prompt?: string;
  module?: string;
  autoSend?: boolean;
  openFullWorkspace?: boolean;
}

export function dispatchOpenAiAssistant(detail: OpenAiEventDetail) {
  window.dispatchEvent(new CustomEvent<OpenAiEventDetail>(ZACMA_OPEN_AI_EVENT, { detail }));
}

async function getBearerAuthHeader(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to use ZACMA AI Assistant.');
  }
  const token = await currentUser.getIdToken();
  return `Bearer ${token}`;
}

export interface StreamAiChatRequest {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  role: AiRoleScope;
  tenantId: string;
  tenantName: string;
  isSuperAdminMode?: boolean;
  activeModule?: string;
  modelOverride?: AiModelId;
  mode?: 'standard' | 'fast';
  context: Record<string, unknown>;
}

export interface AiResponseMeta {
  model: string;
  timestamp: string;
  verifiedRole?: AiRoleScope;
  verifiedTenantId?: string;
  strippedContextKeysCount?: number;
  usage: {
    promptTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
}

/**
 * Invokes centralized server-side Gemini streaming endpoint with verified Firebase Auth JWT.
 * Automatically falls back to non-streaming /api/ai/chat if SSE is buffered by a proxy.
 */
export async function streamAuthorizedAiChat(
  req: StreamAiChatRequest,
  callbacks: {
    onDelta: (delta: string) => void;
    onDone: (meta: AiResponseMeta) => void;
    onError: (message: string, status?: number) => void;
  },
  signal?: AbortSignal
): Promise<void> {
  let authHeader: string;
  try {
    authHeader = await getBearerAuthHeader();
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Authentication required.', 401);
    return;
  }

  try {
    const res = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(req),
      signal,
    });

    if (!res.ok) {
      let errMsg = `AI request blocked (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) errMsg = body.error;
      } catch {
        // ignore JSON parse error
      }
      callbacks.onError(errMsg, res.status);
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') || !res.body) {
      // Fallback to JSON endpoint
      const fallbackRes = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(req),
        signal,
      });
      const json = (await fallbackRes.json()) as {
        reply?: string;
        error?: string;
        model?: string;
        timestamp?: string;
        verifiedRole?: AiRoleScope;
        verifiedTenantId?: string;
        strippedContextKeysCount?: number;
        usage?: AiResponseMeta['usage'];
      };
      if (!fallbackRes.ok || !json.reply) {
        callbacks.onError(json.error || 'AI service returned an error.', fallbackRes.status);
        return;
      }
      callbacks.onDelta(json.reply);
      callbacks.onDone({
        model: json.model || 'gemini-4-hydrogen',
        timestamp: json.timestamp || new Date().toISOString(),
        verifiedRole: json.verifiedRole,
        verifiedTenantId: json.verifiedTenantId,
        strippedContextKeysCount: json.strippedContextKeysCount,
        usage: json.usage || { promptTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr) as {
            delta?: string;
            done?: boolean;
            error?: string;
            model?: string;
            timestamp?: string;
            verifiedRole?: AiRoleScope;
            verifiedTenantId?: string;
            strippedContextKeysCount?: number;
            usage?: AiResponseMeta['usage'];
          };
          if (parsed.error) {
            callbacks.onError(parsed.error);
            return;
          }
          if (parsed.delta) {
            callbacks.onDelta(parsed.delta);
          }
          if (parsed.done) {
            completed = true;
            callbacks.onDone({
              model: parsed.model || 'gemini-4-hydrogen',
              timestamp: parsed.timestamp || new Date().toISOString(),
              verifiedRole: parsed.verifiedRole,
              verifiedTenantId: parsed.verifiedTenantId,
              strippedContextKeysCount: parsed.strippedContextKeysCount,
              usage: parsed.usage || {
                promptTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                estimatedCostUsd: 0,
              },
            });
          }
        } catch {
          // ignore partial event line
        }
      }
    }

    if (!completed) {
      callbacks.onDone({
        model: req.modelOverride || 'gemini-4-hydrogen',
        timestamp: new Date().toISOString(),
        usage: { promptTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      });
    }
  } catch (err) {
    if (signal?.aborted) return;
    callbacks.onError(
      err instanceof Error ? err.message : 'Unable to reach ZACMA AI Assistant server.'
    );
  }
}

/**
 * Logs immutable AI usage & cost metrics into Firestore `ai_usage_logs`.
 */
export async function recordAiUsageLog(params: {
  tenantId: string;
  userId: string;
  userName: string;
  roleScope: string;
  moduleScope: string;
  featureType: AiFeatureType;
  modelId: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
}): Promise<void> {
  try {
    const id = `ailog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, 'ai_usage_logs', id), {
      tenantId: params.tenantId,
      userId: params.userId,
      userName: params.userName.slice(0, 120),
      roleScope: params.roleScope.slice(0, 40),
      moduleScope: params.moduleScope.slice(0, 60),
      featureType: params.featureType,
      modelId: params.modelId.slice(0, 60),
      promptTokens: Math.max(0, Math.round(params.promptTokens)),
      outputTokens: Math.max(0, Math.round(params.outputTokens)),
      totalTokens: Math.max(0, Math.round(params.totalTokens)),
      estimatedCostUsd: Math.max(0, Number(params.estimatedCostUsd.toFixed(6))),
      status: params.status,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-fatal telemetry write
  }
}

/**
 * Subscribes strictly to the authenticated user's own private AI conversations.
 */
export function subscribePrivateAiConversations(
  ownerUid: string,
  tenantId: string,
  isPlatformUser: boolean,
  onUpdate: (items: AiConversationRecord[]) => void
): () => void {
  const q = isPlatformUser
    ? query(collection(db, 'ai_conversations'), where('ownerUid', '==', ownerUid))
    : query(
        collection(db, 'ai_conversations'),
        where('ownerUid', '==', ownerUid),
        where('tenantId', '==', tenantId)
      );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as AiConversationRecord
      );
      rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onUpdate(rows);
    },
    () => {
      onUpdate([]);
    }
  );
}

export async function savePrivateAiConversation(params: {
  id?: string;
  tenantId: string;
  ownerUid: string;
  ownerName: string;
  roleScope: AiRoleScope;
  moduleScope: string;
  title: string;
  messages: AiStoredMessage[];
  modelId: AiModelId;
  totalTokens: number;
  createdAt?: string;
}): Promise<string> {
  const id = params.id || `aiconv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const boundedMessages = params.messages.slice(-40);
  let serialized = JSON.stringify(boundedMessages);
  while (serialized.length > 85000 && boundedMessages.length > 2) {
    boundedMessages.shift();
    serialized = JSON.stringify(boundedMessages);
  }
  const lastMsg = boundedMessages[boundedMessages.length - 1];
  const preview = (lastMsg?.content || 'Conversation started').replace(/\s+/g, ' ').slice(0, 180);

  await setDoc(doc(db, 'ai_conversations', id), {
    tenantId: params.tenantId,
    ownerUid: params.ownerUid,
    ownerName: params.ownerName.slice(0, 120),
    roleScope: params.roleScope,
    moduleScope: params.moduleScope.slice(0, 60),
    title: (params.title || 'New AI Session').slice(0, 140),
    messagesJson: serialized,
    messageCount: boundedMessages.length,
    lastMessagePreview: preview,
    modelId: params.modelId,
    totalTokens: Math.max(0, Math.round(params.totalTokens)),
    createdAt: params.createdAt || now,
    updatedAt: now,
  });

  return id;
}

export async function deletePrivateAiConversation(conversationId: string): Promise<void> {
  await deleteDoc(doc(db, 'ai_conversations', conversationId));
}

export async function purgeOldPrivateAiConversations(
  ownerUid: string,
  tenantId: string,
  olderThanDays: number
): Promise<number> {
  const cutoffIso = new Date(Date.now() - olderThanDays * 86400000).toISOString();
  const q = query(
    collection(db, 'ai_conversations'),
    where('ownerUid', '==', ownerUid),
    where('tenantId', '==', tenantId)
  );
  const snap = await getDocs(q);
  let deleted = 0;
  for (const d of snap.docs) {
    const data = d.data() as { updatedAt?: string };
    if (data.updatedAt && data.updatedAt < cutoffIso) {
      await deleteDoc(doc(db, 'ai_conversations', d.id));
      deleted += 1;
    }
  }
  return deleted;
}

export function parseConversationMessages(messagesJson: string): AiStoredMessage[] {
  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? (parsed as AiStoredMessage[]) : [];
  } catch {
    return [];
  }
}

export function exportAiTranscriptMarkdown(title: string, messages: AiStoredMessage[], instituteName: string) {
  const lines: string[] = [
    `# ${title}`,
    `Institute: ${instituteName}`,
    `Exported: ${new Date().toLocaleString()}`,
    '',
    '---',
    '',
  ];
  for (const m of messages) {
    lines.push(`## ${m.role === 'user' ? 'User' : 'ZACMA AI Assistant'} (${new Date(m.timestamp).toLocaleTimeString()})`);
    lines.push('');
    lines.push(m.content);
    lines.push('');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'zacma-ai-report'}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAiTranscriptExcel(title: string, messages: AiStoredMessage[]) {
  const rows = messages.map((m, idx) => ({
    Turn: idx + 1,
    Speaker: m.role === 'user' ? 'User' : 'ZACMA AI Assistant',
    Timestamp: m.timestamp,
    Model: m.modelUsed || '',
    Tokens: m.totalTokens || 0,
    Content: m.content,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'AI Transcript');
  XLSX.writeFile(
    wb,
    `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'zacma-ai-report'}.xlsx`
  );
}

/**
 * Calls the verified backend 10-scenario AI Security Isolation Audit endpoint (Super Admin only).
 */
export async function runBackendAiSecurityAudit(): Promise<{
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  executedAt: string;
  scenarios: AiSecurityAuditScenarioResult[];
}> {
  const authHeader = await getBearerAuthHeader();
  const res = await fetch('/api/ai/security-audit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || `Security audit failed (HTTP ${res.status})`);
  }
  return body;
}
