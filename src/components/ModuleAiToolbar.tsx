import React from 'react';
import { Sparkles, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { dispatchOpenAiAssistant } from '../lib/aiWorkspaceService';
import { getQuickPromptsForRoleAndModule, MODULE_PROMPTS_BY_KEY } from '../lib/aiContextBuilder';
import type { AiRoleScope } from '../types/zacma';

interface ModuleAiToolbarProps {
  moduleKey: string;
  moduleLabel: string;
  isSuperAdminMode?: boolean;
  customPrompts?: Array<{ id: string; label: string; prompt: string }>;
}

export function ModuleAiToolbar({
  moduleKey,
  moduleLabel,
  isSuperAdminMode = false,
  customPrompts,
}: ModuleAiToolbarProps) {
  const { effectiveRole, isModuleEnabled, isPlatformUser } = usePortal();

  if (!isSuperAdminMode && !isPlatformUser && !isModuleEnabled('AI_ASSISTANT')) {
    return null;
  }

  const aiRole: AiRoleScope = isSuperAdminMode
    ? 'SUPER_ADMIN'
    : effectiveRole || 'GENERAL_STAFF';

  const prompts =
    customPrompts && customPrompts.length > 0
      ? customPrompts
      : MODULE_PROMPTS_BY_KEY[moduleKey] &&
        (aiRole === 'ADMIN' || aiRole === 'MANAGER' || aiRole === 'ACCOUNTANT' || aiRole === 'SUPER_ADMIN' || aiRole === 'STUDENT')
      ? MODULE_PROMPTS_BY_KEY[moduleKey]
      : getQuickPromptsForRoleAndModule(aiRole, moduleKey);

  const visiblePrompts = prompts.slice(0, 3);

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-[#172DEB]/10 text-[#172DEB] flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-900">
              AI Assistant — {moduleLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              {aiRole.replace(/_/g, ' ')} Scope
            </span>
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            Role-isolated insights & drafts based strictly on your authorized records.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {visiblePrompts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              dispatchOpenAiAssistant({
                module: moduleKey,
                prompt: item.prompt,
                autoSend: true,
              })
            }
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-[#172DEB] hover:text-white hover:border-[#172DEB] text-slate-700 text-xs font-medium transition-colors"
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            dispatchOpenAiAssistant({
              module: moduleKey,
              autoSend: false,
            })
          }
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0B2545] hover:bg-[#172DEB] text-white text-xs font-semibold transition-colors"
        >
          Ask AI
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
