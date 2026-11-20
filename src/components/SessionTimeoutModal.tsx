import React, { useState } from 'react';
import { Clock, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { usePortal } from '../context/PortalContext';

export function SessionTimeoutModal() {
  const {
    user,
    profile,
    sessionWarningOpen,
    sessionSecondsRemaining,
    continueSession,
    signOutUser,
  } = usePortal();
  const [refreshing, setRefreshing] = useState(false);

  if (!user || !profile || !sessionWarningOpen) return null;

  const mins = Math.floor(sessionSecondsRemaining / 60);
  const secs = sessionSecondsRemaining % 60;
  const formattedCountdown = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const handleContinue = async () => {
    setRefreshing(true);
    try {
      await continueSession();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 no-print"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
      aria-describedby="session-timeout-desc"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full zacma-brand-stripe" />
        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-[#E51B23]" />
            </div>
            <div>
              <h2
                id="session-timeout-title"
                className="text-base font-display font-bold text-slate-900"
              >
                Session Expiring Due to Inactivity
              </h2>
              <p id="session-timeout-desc" className="text-xs text-slate-600 mt-1 leading-relaxed">
                Your session will expire due to inactivity. Would you like to continue?
              </p>
            </div>
          </div>

          <div className="bg-[#F5F7FC] border border-slate-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <Clock className="w-4 h-4 text-[#172DEB]" />
              <span>Automatic sign-out in</span>
            </div>
            <span className="font-mono text-2xl font-bold text-[#E51B23] tabular-nums">
              {formattedCountdown}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            For institutional financial security, ZACMA automatically ends idle sessions, revokes session tokens, and logs expiration events to the audit trail.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => void signOutUser('MANUAL')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out Now</span>
            </button>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void handleContinue()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-[#263FEF] rounded-lg disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Extending...' : 'Continue Session'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
