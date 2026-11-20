import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  X,
  XCircle,
} from 'lucide-react';

export function StatusLabel({
  status,
}: {
  status:
    | 'APPROVED'
    | 'ACTIVE'
    | 'COMPLETED'
    | 'PAID'
    | 'PRESENT'
    | 'PENDING'
    | 'PARTIAL'
    | 'UNPAID'
    | 'LATE'
    | 'EXCUSED'
    | 'REJECTED'
    | 'OVERDUE'
    | 'ABSENT';
}) {
  const config: Record<string, { text: string; color: string; icon: React.ReactNode }> = {
    APPROVED: { text: 'Approved', color: 'text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> },
    ACTIVE: { text: 'Active', color: 'text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> },
    COMPLETED: { text: 'Settled', color: 'text-blue-700', icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> },
    PAID: { text: 'Paid', color: 'text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> },
    PRESENT: { text: 'Present', color: 'text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> },
    PENDING: { text: 'Pending', color: 'text-amber-700', icon: <Clock className="w-3.5 h-3.5 shrink-0" /> },
    PARTIAL: { text: 'Partial', color: 'text-amber-700', icon: <Clock className="w-3.5 h-3.5 shrink-0" /> },
    UNPAID: { text: 'Unpaid', color: 'text-slate-600', icon: <Clock className="w-3.5 h-3.5 shrink-0" /> },
    LATE: { text: 'Late', color: 'text-amber-700', icon: <Clock className="w-3.5 h-3.5 shrink-0" /> },
    EXCUSED: { text: 'Excused', color: 'text-blue-700', icon: <Info className="w-3.5 h-3.5 shrink-0" /> },
    REJECTED: { text: 'Rejected', color: 'text-red-700', icon: <XCircle className="w-3.5 h-3.5 shrink-0" /> },
    OVERDUE: { text: 'Overdue', color: 'text-red-700', icon: <AlertCircle className="w-3.5 h-3.5 shrink-0" /> },
    ABSENT: { text: 'Absent', color: 'text-red-700', icon: <XCircle className="w-3.5 h-3.5 shrink-0" /> },
  };
  const item = config[status] || { text: status, color: 'text-slate-600', icon: null };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${item.color}`}>
      {item.icon}
      <span>{item.text}</span>
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = 'md',
}: {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const dims =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dims} rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }
  return (
    <div
      className={`${dims} rounded-lg bg-slate-900 text-white font-semibold flex items-center justify-center shrink-0 tracking-tight`}
      aria-label={name}
    >
      {initials || 'ST'}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Enter reason...',
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  loading?: boolean;
  onConfirm: (reason?: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireReason && !reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className={tone === 'danger' ? 'h-1 w-full bg-red-600' : 'zacma-brand-stripe'} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">{description}</p>
          <form onSubmit={handleSubmit}>
            {requireReason && (
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {reasonLabel} <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={reasonPlaceholder}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (requireReason && !reason.trim())}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
                  tone === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-700 hover:bg-blue-800'
                }`}
              >
                {loading ? 'Processing...' : confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/60 text-xs text-slate-600">
      <div className="tabular-nums">
        Showing <span className="font-semibold text-slate-900">{start}</span>–
        <span className="font-semibold text-slate-900">{end}</span> of{' '}
        <span className="font-semibold text-slate-900">{total}</span> records
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Previous
        </button>
        <span className="px-2.5 py-1.5 font-mono text-slate-700 tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-4 px-4 py-3.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <div key={c} className="h-4 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-12 px-6 text-center">
      <p className="text-sm font-semibold text-slate-900 mb-1">{title}</p>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Array<{ id: string; tone: 'success' | 'error' | 'info'; message: string }>;
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm bg-white ${
            t.tone === 'error'
              ? 'border-red-200 text-red-900'
              : t.tone === 'success'
              ? 'border-emerald-200 text-emerald-950'
              : 'border-slate-200 text-slate-900'
          }`}
        >
          {t.tone === 'error' ? (
            <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          ) : t.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          )}
          <p className="flex-1 text-xs leading-relaxed font-medium">{t.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
