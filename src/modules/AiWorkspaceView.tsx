import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import {
  buildAuthorizedAiContext,
  getQuickPromptsForRoleAndModule,
  ROLE_AI_PROFILES,
} from '../lib/aiContextBuilder';
import {
  deletePrivateAiConversation,
  exportAiTranscriptExcel,
  exportAiTranscriptMarkdown,
  parseConversationMessages,
  purgeOldPrivateAiConversations,
  recordAiUsageLog,
  savePrivateAiConversation,
  streamAuthorizedAiChat,
  subscribePrivateAiConversations,
} from '../lib/aiWorkspaceService';
import type {
  AiConversationRecord,
  AiModelId,
  AiRoleScope,
  AiStoredMessage,
} from '../types/zacma';

interface AiWorkspaceViewProps {
  activeModule?: string;
  isSuperAdminMode?: boolean;
  initialPrompt?: string | null;
  onConsumedInitialPrompt?: () => void;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionCtor(): (new () => BrowserSpeechRecognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function detectDraftKind(text: string): AiStoredMessage['actionDraft'] | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('draft ready for review') || lower.includes('manual approval')) {
    if (lower.includes('sms')) {
      return { kind: 'SMS', title: 'SMS Draft (Requires Human Review)', requiresApproval: true };
    }
    if (lower.includes('email') || lower.includes('subject:')) {
      return { kind: 'EMAIL', title: 'Email Draft (Requires Human Review)', requiresApproval: true };
    }
    if (lower.includes('exam') || lower.includes('quiz') || lower.includes('question')) {
      return { kind: 'EXAM', title: 'Assessment Draft (Requires Instructor Review)', requiresApproval: true };
    }
    if (lower.includes('lesson plan')) {
      return { kind: 'LESSON_PLAN', title: 'Lesson Plan Draft', requiresApproval: true };
    }
    if (lower.includes('job description')) {
      return { kind: 'JOB_DESCRIPTION', title: 'HR Job Description Draft', requiresApproval: true };
    }
    return { kind: 'ANNOUNCEMENT', title: 'Action Draft (Requires Human Approval)', requiresApproval: true };
  }
  return undefined;
}

export function AiWorkspaceView({
  activeModule = 'ai_hub',
  isSuperAdminMode = false,
  initialPrompt,
  onConsumedInitialPrompt,
}: AiWorkspaceViewProps) {
  const {
    user,
    profile,
    effectiveRole,
    previewStudentId,
    isPlatformUser,
    activeTenantId,
    activeTenant,
    platformSettings,
    students,
    courses,
    enrollments,
    installments,
    payments,
    chapaTransactions,
    receipts,
    expenses,
    attendance,
    staffRecords,
    staffCompensations,
    tenants,
    platformSubscriptions,
    platformPayments,
    supportTickets,
    allPlatformStudents,
    allPlatformStaffRecords,
    allPlatformAiUsageLogs,
    aiUsageLogs,
    pushToast,
  } = usePortal();

  const aiRole: AiRoleScope = isSuperAdminMode
    ? 'SUPER_ADMIN'
    : effectiveRole || 'GENERAL_STAFF';
  const roleMeta = ROLE_AI_PROFILES[aiRole];
  const defaultModel: AiModelId = platformSettings?.defaultAiModel || 'gemini-4-hydrogen';

  const [conversations, setConversations] = useState<AiConversationRecord[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedCreatedAt, setSelectedCreatedAt] = useState<string | undefined>(undefined);
  const [convTitle, setConvTitle] = useState<string>('New AI Session');
  const [messages, setMessages] = useState<AiStoredMessage[]>([]);
  const [convSearch, setConvSearch] = useState('');

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'standard' | 'fast'>('standard');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState(0);

  // Voice & File attachment state
  const [isListening, setIsListening] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ fileName: string; content: string } | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Subscribe strictly to THIS authenticated user's private conversations
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribePrivateAiConversations(
      user.uid,
      activeTenantId,
      isPlatformUser,
      (rows) => setConversations(rows)
    );
    return () => unsub();
  }, [user?.uid, activeTenantId, isPlatformUser]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const linkedStudentId = useMemo(() => {
    if (aiRole !== 'STUDENT') return undefined;
    if (previewStudentId) return previewStudentId;
    if (profile?.linkedStudentId) return profile.linkedStudentId;
    const matched = students.find(
      (s) => s.email && profile?.email && s.email.toLowerCase() === profile.email.toLowerCase()
    );
    return matched?.id;
  }, [aiRole, previewStudentId, profile?.linkedStudentId, profile?.email, students]);

  const quickPrompts = useMemo(
    () => getQuickPromptsForRoleAndModule(aiRole, activeModule),
    [aiRole, activeModule]
  );

  const filteredConversations = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.lastMessagePreview.toLowerCase().includes(q) ||
        c.moduleScope.toLowerCase().includes(q)
    );
  }, [conversations, convSearch]);

  const personalUsageStats = useMemo(() => {
    const source = isSuperAdminMode ? allPlatformAiUsageLogs : aiUsageLogs;
    const totalReq = source.length;
    const totalTokens = source.reduce((s, r) => s + (r.totalTokens || 0), 0);
    const totalCostUsd = source.reduce((s, r) => s + (r.estimatedCostUsd || 0), 0);
    return { totalReq, totalTokens, totalCostUsd };
  }, [isSuperAdminMode, allPlatformAiUsageLogs, aiUsageLogs]);

  const startNewSession = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText('');
    setSelectedConvId(null);
    setSelectedCreatedAt(undefined);
    setConvTitle('New AI Session');
    setMessages([]);
    setSessionTokens(0);
    setErrorBanner(null);
  };

  const openConversation = (conv: AiConversationRecord) => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText('');
    setSelectedConvId(conv.id);
    setSelectedCreatedAt(conv.createdAt);
    setConvTitle(conv.title);
    setMessages(parseConversationMessages(conv.messagesJson));
    setSessionTokens(conv.totalTokens || 0);
    setErrorBanner(null);
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePrivateAiConversation(convId);
      if (selectedConvId === convId) {
        startNewSession();
      }
      pushToast('info', 'Private AI conversation permanently deleted.');
    } catch {
      pushToast('error', 'Failed to delete conversation.');
    }
  };

  const handlePurgeOld = async () => {
    if (!user?.uid) return;
    try {
      const removed = await purgeOldPrivateAiConversations(user.uid, activeTenantId, 30);
      pushToast(
        'info',
        removed > 0
          ? `Purged ${removed} private conversation(s) older than 30 days.`
          : 'No conversations older than 30 days found.'
      );
    } catch {
      pushToast('error', 'Unable to run retention cleanup.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      pushToast('error', 'Please upload a text/CSV/Markdown file under 512 KB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setAttachedFile({ fileName: file.name, content: content.slice(0, 6000) });
      pushToast('success', `Attached "${file.name}" to your authorized session context.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      pushToast('info', 'Voice input is not supported in this browser.');
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const spoken = ev.results?.[0]?.[0]?.transcript || '';
      if (spoken) {
        setInput((prev) => (prev ? `${prev} ${spoken}` : spoken));
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  const sendMessage = useCallback(
    async (overridePrompt?: string) => {
      const text = (overridePrompt ?? input).trim();
      if (!text || isStreaming || !user?.uid) return;

      setErrorBanner(null);
      if (!overridePrompt) setInput('');

      const userMsg: AiStoredMessage = {
        id: `m_${Date.now()}_u`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setIsStreaming(true);
      setStreamingText('');

      const computedTitle =
        messages.length === 0 ? text.replace(/\s+/g, ' ').slice(0, 60) : convTitle;
      if (messages.length === 0) setConvTitle(computedTitle);

      const contextPayload = buildAuthorizedAiContext({
        role: aiRole,
        activeModule,
        userUid: user.uid,
        linkedStudentId,
        activeTenant,
        students,
        courses,
        enrollments,
        installments,
        payments,
        chapaTransactions,
        receipts,
        expenses,
        attendance,
        staffRecords,
        staffCompensations,
        tenants: isSuperAdminMode ? tenants : undefined,
        platformSubscriptions: isSuperAdminMode ? platformSubscriptions : undefined,
        platformPayments: isSuperAdminMode ? platformPayments : undefined,
        supportTickets: isSuperAdminMode ? supportTickets : undefined,
        allPlatformStudents: isSuperAdminMode ? allPlatformStudents : undefined,
        allPlatformStaffRecords: isSuperAdminMode ? allPlatformStaffRecords : undefined,
        allPlatformAiUsageLogs: isSuperAdminMode ? allPlatformAiUsageLogs : undefined,
        attachedFileExcerpt: attachedFile,
      });

      const controller = new AbortController();
      abortRef.current = controller;
      let acc = '';

      await streamAuthorizedAiChat(
        {
          message: text,
          history: messages.slice(-16).map((m) => ({ role: m.role, text: m.content })),
          role: aiRole,
          tenantId: activeTenantId,
          tenantName: activeTenant?.name || 'ZACMA Technology Training Institute',
          isSuperAdminMode,
          activeModule,
          modelOverride: mode === 'fast' ? 'gemini-3.1-flash-lite' : defaultModel,
          mode,
          context: contextPayload,
        },
        {
          onDelta: (delta) => {
            acc += delta;
            setStreamingText(acc);
          },
          onDone: async (meta) => {
            const assistantMsg: AiStoredMessage = {
              id: `m_${Date.now()}_a`,
              role: 'assistant',
              content: acc.trim(),
              timestamp: meta.timestamp,
              modelUsed: meta.model,
              totalTokens: meta.usage.totalTokens,
              estimatedCostUsd: meta.usage.estimatedCostUsd,
              actionDraft: detectDraftKind(acc),
            };
            const finalMessages = [...nextMessages, assistantMsg];
            const updatedTokens = sessionTokens + (meta.usage.totalTokens || 0);
            setMessages(finalMessages);
            setStreamingText('');
            setIsStreaming(false);
            setSessionTokens(updatedTokens);

            // Persist private conversation strictly owned by user.uid
            try {
              const savedId = await savePrivateAiConversation({
                id: selectedConvId || undefined,
                tenantId: activeTenantId,
                ownerUid: user.uid,
                ownerName: profile?.fullName || user.displayName || 'Authorized User',
                roleScope: aiRole,
                moduleScope: activeModule,
                title: computedTitle,
                messages: finalMessages,
                modelId:
                  meta.model === 'gemini-3.1-flash-lite'
                    ? 'gemini-3.1-flash-lite'
                    : 'gemini-4-hydrogen',
                totalTokens: updatedTokens,
                createdAt: selectedCreatedAt,
              });
              if (!selectedConvId) {
                setSelectedConvId(savedId);
                setSelectedCreatedAt(new Date().toISOString());
              }
            } catch {
              // Non-fatal persistence fallback
            }

            // Record immutable AI usage & cost log
            await recordAiUsageLog({
              tenantId: activeTenantId,
              userId: user.uid,
              userName: profile?.fullName || user.displayName || 'Authorized User',
              roleScope: aiRole,
              moduleScope: activeModule,
              featureType: assistantMsg.actionDraft ? 'DRAFT_GEN' : 'CHAT',
              modelId: meta.model,
              promptTokens: meta.usage.promptTokens,
              outputTokens: meta.usage.outputTokens,
              totalTokens: meta.usage.totalTokens,
              estimatedCostUsd: meta.usage.estimatedCostUsd,
              status: 'SUCCESS',
            });
          },
          onError: async (errMsg, status) => {
            setIsStreaming(false);
            setStreamingText('');
            setErrorBanner(errMsg);
            await recordAiUsageLog({
              tenantId: activeTenantId,
              userId: user.uid,
              userName: profile?.fullName || user.displayName || 'Authorized User',
              roleScope: aiRole,
              moduleScope: activeModule,
              featureType: 'CHAT',
              modelId: mode === 'fast' ? 'gemini-3.1-flash-lite' : defaultModel,
              promptTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              estimatedCostUsd: 0,
              status: status === 403 || status === 401 ? 'DENIED' : 'ERROR',
            });
          },
        },
        controller.signal
      );
    },
    [
      input,
      isStreaming,
      user,
      messages,
      convTitle,
      aiRole,
      activeModule,
      linkedStudentId,
      activeTenant,
      activeTenantId,
      isSuperAdminMode,
      students,
      courses,
      enrollments,
      installments,
      payments,
      chapaTransactions,
      receipts,
      expenses,
      attendance,
      staffRecords,
      staffCompensations,
      tenants,
      platformSubscriptions,
      platformPayments,
      supportTickets,
      allPlatformStudents,
      allPlatformStaffRecords,
      allPlatformAiUsageLogs,
      attachedFile,
      mode,
      defaultModel,
      sessionTokens,
      selectedConvId,
      selectedCreatedAt,
      profile?.fullName,
    ]
  );

  useEffect(() => {
    if (initialPrompt) {
      sendMessage(initialPrompt);
      onConsumedInitialPrompt?.();
    }
  }, [initialPrompt, sendMessage, onConsumedInitialPrompt]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B2545] text-white flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{roleMeta.title}</h2>
              <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Backend Verified ({aiRole.replace(/_/g, ' ')})
              </span>
            </div>
            <p className="text-xs text-slate-500">{roleMeta.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="text-right">
            <p className="text-[11px] text-slate-500">
              {isSuperAdminMode ? 'Platform AI Requests' : 'Authorized AI Requests'}
            </p>
            <p className="font-bold text-slate-900 tabular-nums">
              {personalUsageStats.totalReq.toLocaleString()} calls ·{' '}
              {personalUsageStats.totalTokens.toLocaleString()} tokens
            </p>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                mode === 'standard'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Deep Analysis
            </button>
            <button
              type="button"
              onClick={() => setMode('fast')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                mode === 'fast'
                  ? 'bg-white text-[#172DEB] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Zap className="w-3 h-3" />
              Fast
            </button>
          </div>
        </div>
      </div>

      {/* Two-Pane Enterprise Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[640px]">
        {/* Left Pane: Private History & Scope Transparency */}
        <div className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 space-y-2.5">
            <button
              type="button"
              onClick={startNewSession}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#172DEB] hover:bg-[#1224C2] text-white text-xs font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Private Conversation
            </button>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={convSearch}
                onChange={(e) => setConvSearch(e.target.value)}
                placeholder="Search your history..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[360px] lg:max-h-none">
            {filteredConversations.length === 0 ? (
              <div className="p-5 text-center text-xs text-slate-500">
                <History className="w-5 h-5 mx-auto mb-1.5 text-slate-400" />
                No saved private sessions yet. Your chats are strictly visible only to you.
              </div>
            ) : (
              filteredConversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`p-3 cursor-pointer flex items-start justify-between gap-2 transition-colors ${
                    selectedConvId === c.id ? 'bg-[#172DEB]/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{c.title}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {c.lastMessagePreview}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                      {c.messageCount} msgs · {new Date(c.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    title="Delete private conversation"
                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Privacy & Scope Footer */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Authorized Scope:</span>{' '}
                {roleMeta.scopeSummary}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
              <span className="text-[10px] text-slate-500">Owner-only Firestore isolation</span>
              <button
                type="button"
                onClick={handlePurgeOld}
                className="text-[11px] font-medium text-slate-600 hover:text-rose-600 transition-colors"
              >
                Purge &gt;30d
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Active Streaming AI Workspace */}
        <div className="lg:col-span-8 xl:col-span-9 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
          {/* Conversation Toolbar */}
          <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 truncate">{convTitle}</p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                Tenant: {isSuperAdminMode ? 'ZACMA Platform' : activeTenant?.name || activeTenantId}{' '}
                · Session Tokens: {sessionTokens.toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={messages.length === 0}
                onClick={() =>
                  exportAiTranscriptMarkdown(
                    convTitle,
                    messages,
                    activeTenant?.name || 'ZACMA Platform'
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                .MD Report
              </button>
              <button
                type="button"
                disabled={messages.length === 0}
                onClick={() => exportAiTranscriptExcel(convTitle, messages)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                .XLSX
              </button>
            </div>
          </div>

          {/* Messages Viewport */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[380px] max-h-[540px]">
            {messages.length === 0 && !isStreaming ? (
              <div className="py-8 px-4 max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-[#172DEB]/10 text-[#172DEB] flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    How can {roleMeta.title} assist you today?
                  </h3>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto">
                    Every query is authenticated with your Firebase ID token and strictly sanitized
                    on the server for your verified role ({aiRole.replace(/_/g, ' ')}).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {quickPrompts.map((qp) => (
                    <button
                      key={qp.id}
                      type="button"
                      onClick={() => sendMessage(qp.prompt)}
                      className="text-left p-3 rounded-xl border border-slate-200 hover:border-[#172DEB] hover:bg-[#172DEB]/[0.03] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-900">{qp.label}</span>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                          {qp.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2">{qp.prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#0B2545] text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-800'
                      }`}
                    >
                      {m.actionDraft && (
                        <div className="mb-2 pb-2 border-b border-amber-200 flex items-center justify-between gap-2 text-[11px] text-amber-800 font-semibold">
                          <span>{m.actionDraft.title} — Not sent automatically</span>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div
                        className={`mt-2 pt-1.5 border-t flex items-center justify-between gap-3 text-[10px] ${
                          m.role === 'user'
                            ? 'border-white/15 text-white/70'
                            : 'border-slate-200 text-slate-400'
                        }`}
                      >
                        <span className="tabular-nums">
                          {new Date(m.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {m.modelUsed ? ` · ${m.modelUsed}` : ''}
                          {m.totalTokens ? ` · ${m.totalTokens.toLocaleString()} tok` : ''}
                        </span>
                        {m.role === 'assistant' && (
                          <button
                            type="button"
                            onClick={() => handleCopy(m.id, m.content)}
                            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 font-medium"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                Copy
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed bg-slate-50 border border-slate-200 text-slate-800">
                      <div className="whitespace-pre-wrap break-words">
                        {streamingText || 'Verifying permissions & analyzing authorized records...'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {errorBanner && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
                <span>{errorBanner}</span>
                <button
                  type="button"
                  onClick={() => setErrorBanner(null)}
                  className="text-rose-500 hover:text-rose-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input Composer */}
          <div className="p-3 border-t border-slate-200 bg-white space-y-2">
            {attachedFile && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-xs text-slate-700">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <FileText className="w-3.5 h-3.5 text-[#172DEB]" />
                  Attached: <strong>{attachedFile.fileName}</strong> (read-only analysis)
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="text-slate-500 hover:text-rose-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-end gap-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.md,.json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach authorized text/CSV/Markdown file"
                className="p-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleVoiceInput}
                title={isListening ? 'Stop voice input' : 'Voice prompt input'}
                className={`p-2.5 rounded-lg border shrink-0 transition-colors ${
                  isListening
                    ? 'border-rose-300 bg-rose-50 text-rose-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={`Ask ${roleMeta.title} anything within your authorized scope...`}
                className="flex-1 resize-none px-3 py-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB] max-h-28"
              />

              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    setIsStreaming(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shrink-0"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#172DEB] hover:bg-[#1224C2] disabled:opacity-40 text-white text-xs font-semibold shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
