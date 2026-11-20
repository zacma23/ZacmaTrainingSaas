import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Download,
  FileText,
  Maximize2,
  Mic,
  MicOff,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
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
  exportAiTranscriptMarkdown,
  OpenAiEventDetail,
  recordAiUsageLog,
  savePrivateAiConversation,
  streamAuthorizedAiChat,
  ZACMA_OPEN_AI_EVENT,
} from '../lib/aiWorkspaceService';
import type { AiModelId, AiRoleScope, AiStoredMessage } from '../types/zacma';

interface ZacmaAiAssistantProps {
  activeModule?: string;
  isSuperAdminMode?: boolean;
  onOpenFullWorkspace?: (initialPrompt?: string) => void;
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

export function ZacmaAiAssistant({
  activeModule = 'dashboard',
  isSuperAdminMode = false,
  onOpenFullWorkspace,
}: ZacmaAiAssistantProps) {
  const {
    user,
    profile,
    effectiveRole,
    previewStudentId,
    isPlatformUser,
    isModuleEnabled,
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
    pushToast,
  } = usePortal();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AiStoredMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'standard' | 'fast'>('standard');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [drawerConvId, setDrawerConvId] = useState<string | undefined>(undefined);
  const [drawerCreatedAt, setDrawerCreatedAt] = useState<string | undefined>(undefined);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [currentModule, setCurrentModule] = useState(activeModule);
  const [attachedFile, setAttachedFile] = useState<{ fileName: string; content: string } | null>(null);
  const [isListening, setIsListening] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => {
    setCurrentModule(activeModule);
  }, [activeModule]);

  const aiEnabledForTenant = isSuperAdminMode || isPlatformUser || isModuleEnabled('AI_ASSISTANT');
  const aiRole: AiRoleScope = isSuperAdminMode
    ? 'SUPER_ADMIN'
    : effectiveRole || 'GENERAL_STAFF';
  const roleMeta = ROLE_AI_PROFILES[aiRole];
  const defaultModel: AiModelId = platformSettings?.defaultAiModel || 'gemini-4-hydrogen';

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
    () => getQuickPromptsForRoleAndModule(aiRole, currentModule),
    [aiRole, currentModule]
  );

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, isOpen]);

  const handleSend = useCallback(
    async (overridePrompt?: string, overrideModule?: string) => {
      const text = (overridePrompt ?? input).trim();
      if (!text || isStreaming || !user?.uid) return;

      const modScope = overrideModule || currentModule;
      setErrorMsg(null);
      if (!overridePrompt) setInput('');

      const userMsg: AiStoredMessage = {
        id: `d_${Date.now()}_u`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setIsStreaming(true);
      setStreamingText('');

      const contextPayload = buildAuthorizedAiContext({
        role: aiRole,
        activeModule: modScope,
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
          history: messages.slice(-14).map((m) => ({ role: m.role, text: m.content })),
          role: aiRole,
          tenantId: activeTenantId,
          tenantName: activeTenant?.name || 'ZACMA Technology Training Institute',
          isSuperAdminMode,
          activeModule: modScope,
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
              id: `d_${Date.now()}_a`,
              role: 'assistant',
              content: acc.trim(),
              timestamp: meta.timestamp,
              modelUsed: meta.model,
              totalTokens: meta.usage.totalTokens,
              estimatedCostUsd: meta.usage.estimatedCostUsd,
            };
            const finalMessages = [...nextMessages, assistantMsg];
            const totalTok = sessionTokens + (meta.usage.totalTokens || 0);
            setMessages(finalMessages);
            setStreamingText('');
            setIsStreaming(false);
            setSessionTokens(totalTok);

            try {
              const title = finalMessages[0]?.content.slice(0, 60) || 'Quick AI Session';
              const savedId = await savePrivateAiConversation({
                id: drawerConvId,
                tenantId: activeTenantId,
                ownerUid: user.uid,
                ownerName: profile?.fullName || user.displayName || 'Authorized User',
                roleScope: aiRole,
                moduleScope: modScope,
                title,
                messages: finalMessages,
                modelId:
                  meta.model === 'gemini-3.1-flash-lite'
                    ? 'gemini-3.1-flash-lite'
                    : 'gemini-4-hydrogen',
                totalTokens: totalTok,
                createdAt: drawerCreatedAt,
              });
              if (!drawerConvId) {
                setDrawerConvId(savedId);
                setDrawerCreatedAt(new Date().toISOString());
              }
            } catch {
              // Non-fatal
            }

            await recordAiUsageLog({
              tenantId: activeTenantId,
              userId: user.uid,
              userName: profile?.fullName || user.displayName || 'Authorized User',
              roleScope: aiRole,
              moduleScope: modScope,
              featureType: 'CHAT',
              modelId: meta.model,
              promptTokens: meta.usage.promptTokens,
              outputTokens: meta.usage.outputTokens,
              totalTokens: meta.usage.totalTokens,
              estimatedCostUsd: meta.usage.estimatedCostUsd,
              status: 'SUCCESS',
            });
          },
          onError: async (err, status) => {
            setIsStreaming(false);
            setStreamingText('');
            setErrorMsg(err);
            await recordAiUsageLog({
              tenantId: activeTenantId,
              userId: user.uid,
              userName: profile?.fullName || user.displayName || 'Authorized User',
              roleScope: aiRole,
              moduleScope: modScope,
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
      currentModule,
      messages,
      aiRole,
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
      drawerConvId,
      drawerCreatedAt,
      profile?.fullName,
    ]
  );

  // Listen to global contextual ModuleAiToolbar events
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenAiEventDetail>).detail || {};
      if (detail.openFullWorkspace && onOpenFullWorkspace) {
        onOpenFullWorkspace(detail.prompt);
        return;
      }
      if (detail.module) {
        setCurrentModule(detail.module);
      }
      setIsOpen(true);
      if (detail.prompt) {
        if (detail.autoSend) {
          setTimeout(() => {
            handleSend(detail.prompt, detail.module);
          }, 60);
        } else {
          setInput(detail.prompt);
        }
      }
    };
    window.addEventListener(ZACMA_OPEN_AI_EVENT, handler);
    return () => window.removeEventListener(ZACMA_OPEN_AI_EVENT, handler);
  }, [handleSend, onOpenFullWorkspace]);

  if (!user || !aiEnabledForTenant) return null;

  const resetChat = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingText('');
    setMessages([]);
    setDrawerConvId(undefined);
    setDrawerCreatedAt(undefined);
    setSessionTokens(0);
    setErrorMsg(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      pushToast('error', 'Upload text/CSV/Markdown files under 512 KB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setAttachedFile({ fileName: file.name, content: content.slice(0, 5000) });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleVoice = () => {
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
      if (spoken) setInput((prev) => (prev ? `${prev} ${spoken}` : spoken));
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  return (
    <>
      {/* Floating Launcher */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open ZACMA AI Assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#0B2545] hover:bg-[#172DEB] text-white shadow-lg border border-white/15 transition-all"
        >
          <Sparkles className="w-4 h-4 text-sky-300" />
          <span className="text-xs font-semibold tracking-tight">AI Assistant</span>
        </button>
      )}

      {/* Slide-Over Enterprise AI Drawer */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(430px,calc(100vw-2rem))] h-[min(640px,calc(100vh-2rem))] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-[#0B2545] text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-sky-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{roleMeta.title}</p>
                <p className="text-[10px] text-sky-200 flex items-center gap-1 truncate">
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  {aiRole.replace(/_/g, ' ')} · {currentModule}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {onOpenFullWorkspace && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenFullWorkspace();
                  }}
                  title="Open Full AI Workspace"
                  className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={resetChat}
                title="New conversation"
                className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close"
                className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-bar: Mode + Export */}
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode('standard')}
                className={`px-2 py-0.5 rounded font-semibold ${
                  mode === 'standard'
                    ? 'bg-[#0B2545] text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setMode('fast')}
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded font-semibold ${
                  mode === 'fast'
                    ? 'bg-[#172DEB] text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Zap className="w-3 h-3" />
                Fast
              </button>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  exportAiTranscriptMarkdown(
                    `${roleMeta.title} Session`,
                    messages,
                    activeTenant?.name || 'ZACMA Platform'
                  )
                }
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
              >
                <Download className="w-3 h-3" />
                Export .MD
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && !isStreaming ? (
              <div className="space-y-3 py-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                  <p className="font-semibold text-slate-900 mb-1">Strictly Isolated AI Scope</p>
                  <p>{roleMeta.scopeSummary}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    Suggested for {currentModule}
                  </p>
                  {quickPrompts.slice(0, 4).map((qp) => (
                    <button
                      key={qp.id}
                      type="button"
                      onClick={() => handleSend(qp.prompt)}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#172DEB] hover:bg-[#172DEB]/[0.03] text-xs transition-colors"
                    >
                      <span className="font-semibold text-slate-900 block">{qp.label}</span>
                      <span className="text-[11px] text-slate-500 line-clamp-1">{qp.prompt}</span>
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
                      className={`max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#172DEB] text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      {m.role === 'assistant' && (
                        <div className="mt-1.5 pt-1 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
                          <span className="tabular-nums">{m.modelUsed || 'gemini-4-hydrogen'}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(m.content);
                              setCopiedId(m.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            }}
                            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900"
                          >
                            {copiedId === m.id ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            {copiedId === m.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-[88%] rounded-xl px-3 py-2.5 text-xs leading-relaxed bg-slate-50 border border-slate-200 text-slate-800 whitespace-pre-wrap">
                      {streamingText || 'Analyzing authorized records...'}
                    </div>
                  </div>
                )}
              </>
            )}

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {errorMsg}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input Area */}
          <div className="p-2.5 border-t border-slate-200 bg-white space-y-1.5">
            {attachedFile && (
              <div className="flex items-center justify-between px-2.5 py-1 rounded bg-slate-100 text-[11px] text-slate-700">
                <span className="inline-flex items-center gap-1 truncate">
                  <FileText className="w-3 h-3 text-[#172DEB]" />
                  {attachedFile.fileName}
                </span>
                <button type="button" onClick={() => setAttachedFile(null)}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-1.5"
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
                title="Attach text/CSV file"
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={toggleVoice}
                title="Voice input"
                className={`p-2 rounded-lg border ${
                  isListening
                    ? 'border-rose-300 bg-rose-50 text-rose-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask within your authorized role..."
                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    setIsStreaming(false);
                  }}
                  className="p-2 rounded-lg bg-rose-600 text-white"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-2 rounded-lg bg-[#172DEB] hover:bg-[#1224C2] disabled:opacity-40 text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
