import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Link2,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { EmptyState, PaginationBar } from '../components/PortalUI';
import { DualDateDisplay } from '../components/DualCalendarDatePicker';
import { formatAddisDateTimeDual, formatEthiopianDate } from '../lib/ethiopianCalendar';
import { computeChapaFinancialSummary } from '../lib/financeAnalytics';
import {
  approveChapaTransaction,
  ChapaGatewayStatus,
  fetchChapaGatewayStatus,
  initializeChapaPayment,
  markChapaTransactionRefunded,
  rejectChapaTransaction,
  verifyChapaTransaction,
} from '../lib/chapaService';
import {
  ChapaApprovalStatus,
  ChapaPaymentStatus,
  ChapaTransaction,
  formatEtb,
  formatEtbCompact,
  Receipt,
} from '../types/zacma';

function ChapaPaymentStatusText({ status }: { status: ChapaPaymentStatus }) {
  const styles: Record<ChapaPaymentStatus, { label: string; cls: string }> = {
    INITIATED: { label: 'Initiated', cls: 'text-slate-600' },
    PENDING_VERIFICATION: { label: 'Pending Verify', cls: 'text-amber-700' },
    VERIFIED: { label: 'Verified (Chapa)', cls: 'text-emerald-700' },
    FAILED: { label: 'Failed', cls: 'text-[#E51B23]' },
    CANCELLED: { label: 'Cancelled', cls: 'text-slate-500' },
    REFUNDED: { label: 'Refunded', cls: 'text-amber-800' },
  };
  const cfg = styles[status] || { label: status, cls: 'text-slate-700' };
  return <span className={`font-semibold whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
}

function ChapaApprovalStatusText({ status }: { status: ChapaApprovalStatus }) {
  const styles: Record<ChapaApprovalStatus, { label: string; cls: string }> = {
    AWAITING_APPROVAL: { label: 'Awaiting Admin Approval', cls: 'text-[#172DEB]' },
    APPROVED: { label: 'Approved', cls: 'text-emerald-700' },
    REJECTED: { label: 'Rejected', cls: 'text-[#E51B23]' },
  };
  const cfg = styles[status] || { label: status, cls: 'text-slate-700' };
  return <span className={`font-semibold whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>;
}

export function ChapaPaymentsView({
  onOpenReceipt,
  onOpenReports,
}: {
  onOpenReceipt: (receipt: Receipt) => void;
  onOpenReports?: () => void;
}) {
  const {
    profile,
    effectiveRole,
    students,
    enrollments,
    installments,
    receipts,
    chapaTransactions,
    smsConfig,
    smsLogs,
    directoryUsers,
    pushToast,
  } = usePortal();

  const [subTab, setSubTab] = useState<'transactions' | 'generate_link'>('transactions');
  const [gatewayStatus, setGatewayStatus] = useState<ChapaGatewayStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Transaction table filters
  const [search, setSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'ALL' | ChapaPaymentStatus>('ALL');
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'ALL' | ChapaApprovalStatus>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'STUDENT_PORTAL' | 'PAYMENT_LINK'>('ALL');
  const [page, setPage] = useState(1);

  // Inspection / Approval Modal state
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [showRefundBox, setShowRefundBox] = useState(false);
  const [busyTxId, setBusyTxId] = useState<string | null>(null);

  // Generate Payment Link Form state
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');
  const [linkAmount, setLinkAmount] = useState('');
  const [linkEmail, setLinkEmail] = useState('');
  const [sendSms, setSendSms] = useState(true);
  const [sendInternalMessage, setSendInternalMessage] = useState(true);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [lastGeneratedLink, setLastGeneratedLink] = useState<{
    txRef: string;
    checkoutUrl: string;
    studentName: string;
    amountEtb: number;
    smsDetail?: string;
  } | null>(null);

  const isAdmin = effectiveRole === 'ADMIN';
  const isFinanceStaff = effectiveRole === 'ADMIN' || effectiveRole === 'ACCOUNTANT';

  const refreshGatewayStatus = async () => {
    setLoadingStatus(true);
    try {
      const s = await fetchChapaGatewayStatus();
      setGatewayStatus(s);
    } catch {
      setGatewayStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void refreshGatewayStatus();
  }, []);

  const chapaSummary = useMemo(
    () => computeChapaFinancialSummary(chapaTransactions),
    [chapaTransactions]
  );

  const selectedTx = useMemo(
    () => chapaTransactions.find((t) => t.id === selectedTxId) || null,
    [chapaTransactions, selectedTxId]
  );

  const eligibleEnrollments = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return enrollments
      .filter((e) => e.status !== 'REJECTED' && e.remainingBalanceEtb > 0.01)
      .filter((e) => {
        if (!q) return true;
        return (
          e.studentName.toLowerCase().includes(q) ||
          e.studentCode.toLowerCase().includes(q) ||
          e.courseName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.remainingBalanceEtb - a.remainingBalanceEtb);
  }, [enrollments, studentSearch]);

  const activeEnrollmentForLink = useMemo(
    () =>
      eligibleEnrollments.find((e) => e.id === selectedEnrollmentId) ||
      eligibleEnrollments[0] ||
      null,
    [eligibleEnrollments, selectedEnrollmentId]
  );

  const activeStudentForLink = useMemo(
    () =>
      activeEnrollmentForLink
        ? students.find((s) => s.id === activeEnrollmentForLink.studentId) || null
        : null,
    [students, activeEnrollmentForLink]
  );

  const nextInstallmentForLink = useMemo(() => {
    if (!activeEnrollmentForLink) return null;
    return (
      installments
        .filter(
          (i) =>
            i.enrollmentId === activeEnrollmentForLink.id &&
            i.status !== 'PAID' &&
            i.amountDueEtb > i.amountPaidEtb
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null
    );
  }, [installments, activeEnrollmentForLink]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chapaTransactions.filter((t) => {
      if (paymentStatusFilter !== 'ALL' && t.paymentStatus !== paymentStatusFilter) return false;
      if (approvalStatusFilter !== 'ALL' && t.approvalStatus !== approvalStatusFilter) return false;
      if (sourceFilter !== 'ALL' && t.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        t.txRef.toLowerCase().includes(q) ||
        t.studentName.toLowerCase().includes(q) ||
        t.studentCode.toLowerCase().includes(q) ||
        t.courseName.toLowerCase().includes(q) ||
        (t.chapaReference || '').toLowerCase().includes(q) ||
        (t.receiptNumber || '').toLowerCase().includes(q)
      );
    });
  }, [chapaTransactions, search, paymentStatusFilter, approvalStatusFilter, sourceFilter]);

  const paymentLinksOnly = useMemo(
    () => chapaTransactions.filter((t) => t.source === 'PAYMENT_LINK'),
    [chapaTransactions]
  );

  if (!isFinanceStaff) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto">
        <ShieldAlert className="w-8 h-8 text-[#E51B23] mx-auto mb-3" />
        <h1 className="text-lg font-display font-bold text-slate-900">
          Chapa Online Payments Restricted
        </h1>
        <p className="text-xs text-slate-600 mt-2">
          Online payment link generation and Chapa transaction approval are restricted to ZACMA Administrators and Accountants.
        </p>
      </div>
    );
  }

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast('success', `Copied ${label} to clipboard.`);
    } catch {
      pushToast('error', `Unable to copy ${label}. Please select and copy manually.`);
    }
  };

  const handleGeneratePaymentLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeEnrollmentForLink || !activeStudentForLink) return;
    const amt = Number(linkAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      pushToast('error', 'Enter a valid payment amount in ETB.');
      return;
    }
    setGeneratingLink(true);
    try {
      const result = await initializeChapaPayment(
        {
          student: activeStudentForLink,
          enrollment: activeEnrollmentForLink,
          amountEtb: amt,
          studentEmail: linkEmail.trim() || undefined,
          source: 'PAYMENT_LINK',
          sendSms,
          sendInternalMessage,
          smsConfig,
          existingSmsLogs: smsLogs,
          directoryUsers,
        },
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        }
      );
      setLastGeneratedLink({
        txRef: result.transaction.txRef,
        checkoutUrl: result.checkoutUrl,
        studentName: activeStudentForLink.fullName,
        amountEtb: amt,
        smsDetail: result.smsDetail,
      });
      setLinkAmount('');
      pushToast(
        'success',
        `Official Chapa payment link generated (${result.transaction.txRef}) and sent to ${activeStudentForLink.fullName}.`
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Unable to generate Chapa payment link.'
      );
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleVerifyTx = async (tx: ChapaTransaction) => {
    if (!profile) return;
    setBusyTxId(tx.id);
    try {
      const outcome = await verifyChapaTransaction(tx, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
      });
      if (outcome.verified) {
        pushToast('success', outcome.summary);
      } else {
        pushToast('info', outcome.summary);
      }
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Chapa verification failed.');
    } finally {
      setBusyTxId(null);
    }
  };

  const handleApproveTx = async (tx: ChapaTransaction) => {
    if (!profile || !isAdmin) return;
    const enr = enrollments.find((e) => e.id === tx.enrollmentId);
    if (!enr) {
      pushToast('error', 'Linked student enrollment record could not be found.');
      return;
    }
    const stu = students.find((s) => s.id === tx.studentId);
    setBusyTxId(tx.id);
    try {
      const res = await approveChapaTransaction({
        tx,
        enrollment: enr,
        installments,
        studentPhone: stu?.phone || tx.studentPhone,
        existingReceiptsCount: receipts.length,
        approvalNotes,
        smsConfig,
        existingSmsLogs: smsLogs,
        actor: {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        },
      });
      pushToast(
        'success',
        `Approved Chapa payment ${tx.txRef}. Official Receipt ${res.receiptNumber} issued and balance updated.`
      );
      setApprovalNotes('');
      setShowRejectBox(false);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to approve Chapa payment.');
    } finally {
      setBusyTxId(null);
    }
  };

  const handleRejectTx = async (tx: ChapaTransaction) => {
    if (!profile || !isAdmin) return;
    if (rejectionReason.trim().length < 3) {
      pushToast('error', 'Please enter a rejection reason for the audit record.');
      return;
    }
    const stu = students.find((s) => s.id === tx.studentId);
    setBusyTxId(tx.id);
    try {
      await rejectChapaTransaction({
        tx,
        reason: rejectionReason,
        studentPhone: stu?.phone || tx.studentPhone,
        smsConfig,
        existingSmsLogs: smsLogs,
        actor: {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        },
      });
      pushToast('info', `Rejected Chapa transaction ${tx.txRef}. Balance unchanged; student notified.`);
      setRejectionReason('');
      setShowRejectBox(false);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to reject transaction.');
    } finally {
      setBusyTxId(null);
    }
  };

  const handleMarkRefunded = async (tx: ChapaTransaction) => {
    if (!profile || !isAdmin) return;
    setBusyTxId(tx.id);
    try {
      await markChapaTransactionRefunded(tx, refundReason, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
      });
      pushToast('info', `Marked Chapa transaction ${tx.txRef} as REFUNDED.`);
      setRefundReason('');
      setShowRefundBox(false);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to mark transaction refunded.');
    } finally {
      setBusyTxId(null);
    }
  };

  const handleDownloadTransactionJson = (tx: ChapaTransaction) => {
    const payload = {
      institution: 'ZACMA Technology & Training Institute',
      gateway: 'Chapa Payment Gateway',
      exportedAt: new Date().toISOString(),
      transaction: tx,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tx.txRef}-record.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast('success', `Downloaded transaction record ${tx.txRef}.json.`);
  };

  const paginatedTxs = filteredTransactions.slice((page - 1) * 10, page * 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Chapa Online Payments &amp; Approval Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Official Chapa online tuition collections, student payment links, server-side verification, and mandatory Admin approval before ledger posting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenReports && (isAdmin || Boolean(profile?.canExportReports)) && (
            <button
              type="button"
              onClick={onOpenReports}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#172DEB] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Chapa Excel (.xlsx) Reports</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshGatewayStatus()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            <span>Check Gateway</span>
          </button>
        </div>
      </div>

      {/* Gateway Readiness & Webhook Configuration Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {gatewayStatus?.configured ? (
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-900">
                Chapa Gateway Status:{' '}
                <span
                  className={
                    gatewayStatus?.configured ? 'text-emerald-700' : 'text-amber-700'
                  }
                >
                  {loadingStatus
                    ? 'Checking server configuration...'
                    : gatewayStatus?.configured
                    ? `Connected (${gatewayStatus.mode} Mode)`
                    : 'Server Keys Not Configured'}
                </span>
              </p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {gatewayStatus?.configured
                ? `Official Chapa API v1 active in ETB. Public Key: ${
                    gatewayStatus.publicKeyConfigured ? 'Set' : 'Optional'
                  } · Secret Key: Set (${gatewayStatus.secretKeyPreview || 'masked'}) · Webhook Encryption Key: ${
                    gatewayStatus.encryptionKeyConfigured ? 'Set' : 'Missing'
                  }.`
                : 'Add CHAPA_PUBLIC_KEY, CHAPA_SECRET_KEY, and CHAPA_ENCRYPTION_KEY in Vercel Environment Variables (or local .env) and redeploy. Credentials are strictly server-side and never exposed to browsers.'}
            </p>
          </div>
        </div>

        {gatewayStatus?.webhookUrl && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 shrink-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Chapa Dashboard Webhook URL (POST)
            </p>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-slate-900 select-all">
                {gatewayStatus.webhookUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyText(gatewayStatus.webhookUrl, 'Webhook URL')}
                className="p-1 text-slate-500 hover:text-[#172DEB] rounded"
                title="Copy Webhook URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 6-Card Financial Separation KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Verified Online</p>
          <p className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-1">
            {formatEtbCompact(chapaSummary.totalVerifiedOnlineAmountEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {chapaSummary.verifiedCount} verified tx
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Pending Admin Approval</p>
          <p className="text-lg font-mono font-bold text-[#172DEB] tabular-nums mt-1">
            {formatEtbCompact(chapaSummary.pendingAdminApprovalAmountEtb)}
          </p>
          <p className="text-[11px] text-[#172DEB] mt-0.5 tabular-nums font-medium">
            {chapaSummary.pendingAdminApprovalCount} awaiting review
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Approved Online</p>
          <p className="text-lg font-mono font-bold text-emerald-700 tabular-nums mt-1">
            {formatEtbCompact(chapaSummary.totalApprovedOnlineAmountEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {chapaSummary.approvedCount} posted to ledger
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Rejected</p>
          <p className="text-lg font-mono font-bold text-[#E51B23] tabular-nums mt-1">
            {formatEtbCompact(chapaSummary.rejectedAmountEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {chapaSummary.rejectedCount} rejected
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Failed / Cancelled</p>
          <p className="text-lg font-mono font-bold text-slate-700 tabular-nums mt-1">
            {formatEtbCompact(chapaSummary.failedAmountEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {chapaSummary.failedCount} unsuccessful
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Refunded</p>
          <p className="text-lg font-mono font-bold text-amber-700 tabular-nums mt-1">
            {formatEtbCompact(chapaSummary.refundedAmountEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {chapaSummary.refundedCount} refunded
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('transactions')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              subTab === 'transactions'
                ? 'bg-[#172DEB] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Chapa Transactions &amp; Approval Queue</span>
            {chapaSummary.pendingAdminApprovalCount > 0 && (
              <span className="ml-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#E51B23] text-white tabular-nums">
                {chapaSummary.pendingAdminApprovalCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('generate_link')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              subTab === 'generate_link'
                ? 'bg-[#172DEB] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Generate &amp; Send Payment Link</span>
          </button>
        </div>

        <p className="text-xs text-slate-500">
          {isAdmin
            ? 'Admin Mode: Verified Chapa transactions require explicit Admin approval to update student balances & issue receipts.'
            : 'Accountant Mode: You can generate/send payment links and trigger verification; Admin approval is required for ledger posting.'}
        </p>
      </div>

      {/* TAB 1: CHAPA TRANSACTIONS & ADMIN APPROVAL TABLE */}
      {subTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search Tx Ref, student name, ID, course..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value as 'ALL' | ChapaPaymentStatus);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Gateway Statuses</option>
              <option value="VERIFIED">Verified (Chapa)</option>
              <option value="INITIATED">Initiated</option>
              <option value="PENDING_VERIFICATION">Pending Verification</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>

            <select
              value={approvalStatusFilter}
              onChange={(e) => {
                setApprovalStatusFilter(e.target.value as 'ALL' | ChapaApprovalStatus);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Approval Statuses</option>
              <option value="AWAITING_APPROVAL">Awaiting Admin Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as 'ALL' | 'STUDENT_PORTAL' | 'PAYMENT_LINK');
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Sources</option>
              <option value="STUDENT_PORTAL">Student Portal</option>
              <option value="PAYMENT_LINK">Staff Payment Link</option>
            </select>
          </div>

          {/* 11-Column Institutional Transactions Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredTransactions.length === 0 ? (
              <EmptyState
                title="No Chapa online transactions found"
                description="Transactions initiated by students in the Student Portal or generated via Payment Links appear here automatically."
                actionLabel="Generate Payment Link"
                onAction={() => setSubTab('generate_link')}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Transaction ID</th>
                      <th className="py-3 px-3">Student Name &amp; ID</th>
                      <th className="py-3 px-3">Course</th>
                      <th className="py-3 px-3 text-right">Amount</th>
                      <th className="py-3 px-2">Currency</th>
                      <th className="py-3 px-2">Method</th>
                      <th className="py-3 px-3">Transaction Status</th>
                      <th className="py-3 px-3">Approval Status</th>
                      <th className="py-3 px-3">Payment Date</th>
                      <th className="py-3 px-3">Recorded Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedTxs.map((tx) => {
                      const linkedReceipt = tx.receiptId
                        ? receipts.find((r) => r.id === tx.receiptId)
                        : undefined;
                      const isBusy = busyTxId === tx.id;
                      const canVerify =
                        tx.approvalStatus === 'AWAITING_APPROVAL' &&
                        (tx.paymentStatus === 'INITIATED' ||
                          tx.paymentStatus === 'PENDING_VERIFICATION');
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <p className="font-mono font-semibold text-slate-900">{tx.txRef}</p>
                            <p className="text-[11px] text-slate-500">
                              {tx.source === 'PAYMENT_LINK' ? 'Payment Link' : 'Student Portal'}
                              {tx.receiptNumber ? ` · ${tx.receiptNumber}` : ''}
                            </p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-semibold text-slate-900">{tx.studentName}</p>
                            <p className="text-[11px] font-mono text-slate-500">{tx.studentCode}</p>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-[160px] truncate">
                            {tx.courseName}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                            {tx.amountEtb.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-2 font-mono text-slate-600">{tx.currency}</td>
                          <td className="py-3 px-2 font-medium text-slate-700">
                            {tx.paymentMethod}
                          </td>
                          <td className="py-3 px-3">
                            <ChapaPaymentStatusText status={tx.paymentStatus} />
                          </td>
                          <td className="py-3 px-3">
                            <ChapaApprovalStatusText status={tx.approvalStatus} />
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                            {tx.paymentDate ? <DualDateDisplay isoDate={tx.paymentDate} /> : '—'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                            <DualDateDisplay isoDate={tx.createdAt.slice(0, 10)} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {canVerify && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleVerifyTx(tx)}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md disabled:opacity-50 cursor-pointer"
                                >
                                  {isBusy ? 'Checking...' : 'Verify'}
                                </button>
                              )}
                              {isAdmin &&
                                tx.paymentStatus === 'VERIFIED' &&
                                tx.approvalStatus === 'AWAITING_APPROVAL' && (
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => {
                                      setSelectedTxId(tx.id);
                                      setShowRejectBox(false);
                                      setShowRefundBox(false);
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#172DEB] hover:bg-[#263FEF] rounded-md cursor-pointer"
                                  >
                                    Review &amp; Approve
                                  </button>
                                )}
                              {linkedReceipt && (
                                <button
                                  type="button"
                                  onClick={() => onOpenReceipt(linkedReceipt)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-md cursor-pointer"
                                >
                                  <Printer className="w-3 h-3" />
                                  Receipt
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTxId(tx.id);
                                  setShowRejectBox(false);
                                  setShowRefundBox(false);
                                }}
                                className="p-1.5 text-slate-500 hover:text-[#172DEB] rounded-md cursor-pointer"
                                title="Inspect Transaction Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={page}
              pageSize={10}
              total={filteredTransactions.length}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* TAB 2: GENERATE & SEND PAYMENT LINK (ADMIN & ACCOUNTANT) */}
      {subTab === 'generate_link' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base font-display font-bold text-slate-900">
                Generate Official Chapa Payment Link
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Select a registered student with an outstanding balance, enter the ETB amount, and deliver a secure Chapa checkout link via Portal Notification, SMS, and Internal Message.
              </p>
            </div>

            {eligibleEnrollments.length === 0 ? (
              <EmptyState
                title="No students with outstanding balances"
                description="All active student enrollments are currently settled."
              />
            ) : (
              <form onSubmit={(e) => void handleGeneratePaymentLink(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Search Registered Student
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Filter by student name, ID (ZAC-...), or course..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Student &amp; Active Enrollment
                  </label>
                  <select
                    value={activeEnrollmentForLink?.id || ''}
                    onChange={(e) => {
                      setSelectedEnrollmentId(e.target.value);
                      setLinkAmount('');
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {eligibleEnrollments.map((enr) => (
                      <option key={enr.id} value={enr.id}>
                        {enr.studentCode} — {enr.studentName} ({enr.courseName}) · Balance:{' '}
                        {formatEtbCompact(enr.remainingBalanceEtb)}
                      </option>
                    ))}
                  </select>
                </div>

                {activeEnrollmentForLink && activeStudentForLink && (
                  <div className="bg-[#F5F7FC] border border-slate-200 rounded-lg p-3.5 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-[11px] text-slate-500">Course Fee</p>
                      <p className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                        {formatEtbCompact(activeEnrollmentForLink.agreedFeeEtb)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Approved Paid</p>
                      <p className="font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
                        {formatEtbCompact(activeEnrollmentForLink.approvedPaidEtb)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Outstanding</p>
                      <p className="font-mono font-bold text-[#E51B23] tabular-nums mt-0.5">
                        {formatEtbCompact(activeEnrollmentForLink.remainingBalanceEtb)}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Payment Amount (ETB) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      max={activeEnrollmentForLink?.remainingBalanceEtb || undefined}
                      required
                      value={linkAmount}
                      onChange={(e) => setLinkAmount(e.target.value)}
                      placeholder="e.g., 3000"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                    {activeEnrollmentForLink && (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setLinkAmount(String(activeEnrollmentForLink.remainingBalanceEtb))
                          }
                          className="text-[11px] font-semibold text-[#172DEB] hover:underline cursor-pointer"
                        >
                          Full Balance ({formatEtbCompact(activeEnrollmentForLink.remainingBalanceEtb)})
                        </button>
                        {nextInstallmentForLink && (
                          <button
                            type="button"
                            onClick={() =>
                              setLinkAmount(
                                String(
                                  Math.min(
                                    activeEnrollmentForLink.remainingBalanceEtb,
                                    Number(
                                      (
                                        nextInstallmentForLink.amountDueEtb -
                                        nextInstallmentForLink.amountPaidEtb
                                      ).toFixed(2)
                                    )
                                  )
                                )
                              )
                            }
                            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                          >
                            Next Installment (
                            {formatEtbCompact(
                              nextInstallmentForLink.amountDueEtb -
                                nextInstallmentForLink.amountPaidEtb
                            )}
                            )
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Student Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={linkEmail}
                      onChange={(e) => setLinkEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Phone: <span className="font-mono">{activeStudentForLink?.phone || '—'}</span>
                    </p>
                  </div>
                </div>

                {/* Delivery Channels */}
                <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-slate-800">
                    Automatic Student Delivery Channels
                  </p>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked readOnly className="rounded border-slate-300" />
                    <span>Student Portal Notification &amp; Online Fee Payment Tab (Always On)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendSms}
                      onChange={(e) => setSendSms(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>
                      Send Payment Link via SMS Gateway (
                      {smsConfig.smsEnabled
                        ? smsConfig.testMode
                          ? 'SMS Test Mode'
                          : `Live: ${smsConfig.activeProvider}`
                        : 'SMS Currently Disabled'}
                      )
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendInternalMessage}
                      onChange={(e) => setSendInternalMessage(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Send Direct Internal Portal Message (when student account is linked)</span>
                  </label>
                </div>

                {activeStudentForLink && Number(linkAmount) > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      Message Preview
                    </p>
                    <p className="leading-relaxed">
                      &ldquo;Dear {activeStudentForLink.fullName}, your ZACMA Technology training
                      fee payment link is ready. Amount: {Number(linkAmount).toLocaleString()} ETB.
                      Please complete your payment using the provided link.&rdquo;
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={generatingLink || !activeEnrollmentForLink}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#172DEB] hover:bg-[#263FEF] rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {generatingLink
                      ? 'Generating Official Chapa Checkout Link...'
                      : 'Generate Chapa Payment Link & Notify Student'}
                  </span>
                </button>
              </form>
            )}

            {lastGeneratedLink && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-bold">
                    Payment Link Generated — {lastGeneratedLink.txRef}
                  </p>
                </div>
                <p className="text-xs text-emerald-900">
                  {lastGeneratedLink.studentName} ·{' '}
                  <span className="font-mono font-bold">
                    {formatEtb(lastGeneratedLink.amountEtb)}
                  </span>
                </p>
                <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                  <code className="text-[11px] font-mono text-slate-800 truncate flex-1">
                    {lastGeneratedLink.checkoutUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyText(lastGeneratedLink.checkoutUrl, 'Chapa payment link')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-[#172DEB] text-white rounded-md shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                  <a
                    href={lastGeneratedLink.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </a>
                </div>
                {lastGeneratedLink.smsDetail && (
                  <p className="text-[11px] text-emerald-800">SMS: {lastGeneratedLink.smsDetail}</p>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Staff-Generated Payment Links Status Tracker */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Generated Payment Links Tracker ({paymentLinksOnly.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Copy checkout links or check live verification status with Chapa.
                </p>
              </div>
            </div>

            {paymentLinksOnly.length === 0 ? (
              <EmptyState
                title="No payment links generated yet"
                description="Payment links created by Administrators or Accountants will be tracked here."
              />
            ) : (
              <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
                {paymentLinksOnly.map((link) => (
                  <div key={link.id} className="p-4 space-y-2 hover:bg-slate-50/70">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          {link.studentName}{' '}
                          <span className="font-mono font-normal text-slate-500">
                            ({link.studentCode})
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {link.courseName} · Ref: <span className="font-mono">{link.txRef}</span>
                        </p>
                      </div>
                      <p className="text-sm font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatEtb(link.amountEtb)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-3">
                        <ChapaPaymentStatusText status={link.paymentStatus} />
                        <span className="text-slate-300">|</span>
                        <ChapaApprovalStatusText status={link.approvalStatus} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {link.checkoutUrl && (
                          <button
                            type="button"
                            onClick={() => void copyText(link.checkoutUrl!, 'payment link')}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Link
                          </button>
                        )}
                        {(link.paymentStatus === 'INITIATED' ||
                          link.paymentStatus === 'PENDING_VERIFICATION') && (
                          <button
                            type="button"
                            disabled={busyTxId === link.id}
                            onClick={() => void handleVerifyTx(link)}
                            className="px-2 py-1 text-[11px] font-semibold text-[#172DEB] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded cursor-pointer"
                          >
                            {busyTxId === link.id ? 'Checking...' : 'Verify Status'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedTxId(link.id)}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Created by {link.createdByName} ({link.createdByRole}) ·{' '}
                      {formatAddisDateTimeDual(link.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRANSACTION DETAILS & ADMIN APPROVAL MODAL */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono font-bold text-[#172DEB]">{selectedTx.txRef}</p>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Chapa Online Transaction Verification &amp; Approval
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTxId(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Key Status Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Amount</p>
                  <p className="text-base font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatEtb(selectedTx.amountEtb)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">
                    Gateway Status
                  </p>
                  <div className="mt-1">
                    <ChapaPaymentStatusText status={selectedTx.paymentStatus} />
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">
                    Approval Status
                  </p>
                  <div className="mt-1">
                    <ChapaApprovalStatusText status={selectedTx.approvalStatus} />
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Origin</p>
                  <p className="font-semibold text-slate-900 mt-1">
                    {selectedTx.source === 'PAYMENT_LINK' ? 'Payment Link' : 'Student Portal'}
                  </p>
                </div>
              </div>

              {/* Student Financial Snapshot */}
              {(() => {
                const enr = enrollments.find((e) => e.id === selectedTx.enrollmentId);
                return (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                    <p className="font-bold text-slate-900">Student &amp; Financial Context</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] text-slate-500">Student</p>
                        <p className="font-semibold text-slate-900">{selectedTx.studentName}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {selectedTx.studentCode}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500">Course</p>
                        <p className="font-semibold text-slate-900">{selectedTx.courseName}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {selectedTx.studentPhone || '—'}
                        </p>
                      </div>
                      {enr && (
                        <div>
                          <p className="text-[11px] text-slate-500">Live Ledger Balance</p>
                          <p className="font-mono font-bold text-[#E51B23] tabular-nums">
                            {formatEtb(enr.remainingBalanceEtb)}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            Paid {formatEtbCompact(enr.approvedPaidEtb)} /{' '}
                            {formatEtbCompact(enr.agreedFeeEtb)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Chapa Gateway Verification Metadata */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900">Server-Side Chapa Verification Record</p>
                  {selectedTx.approvalStatus === 'AWAITING_APPROVAL' &&
                    selectedTx.paymentStatus !== 'VERIFIED' && (
                      <button
                        type="button"
                        disabled={busyTxId === selectedTx.id}
                        onClick={() => void handleVerifyTx(selectedTx)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#172DEB] bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-md cursor-pointer"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${busyTxId === selectedTx.id ? 'animate-spin' : ''}`}
                        />
                        Verify with Chapa API
                      </button>
                    )}
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div>
                    <dt className="text-[11px] text-slate-500">Chapa Reference</dt>
                    <dd className="font-mono text-slate-900">
                      {selectedTx.chapaReference || 'Not yet verified'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Chapa Payment Channel</dt>
                    <dd className="text-slate-900">{selectedTx.chapaChannel || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Payment Date (Dual)</dt>
                    <dd className="text-slate-900">
                      {selectedTx.paymentDate
                        ? `${selectedTx.paymentDate} (${formatEthiopianDate(selectedTx.paymentDate)} E.C.)`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-slate-500">Verified Timestamp</dt>
                    <dd className="text-slate-900 tabular-nums">
                      {selectedTx.verifiedAt ? formatAddisDateTimeDual(selectedTx.verifiedAt) : '—'}
                    </dd>
                  </div>
                  {selectedTx.verificationProof && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] text-slate-500">HMAC Verification Proof</dt>
                      <dd className="font-mono text-[11px] text-slate-700 break-all">
                        {selectedTx.verificationProof}
                      </dd>
                    </div>
                  )}
                  {selectedTx.verificationSummary && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] text-slate-500">Verification Summary</dt>
                      <dd className="text-slate-700">{selectedTx.verificationSummary}</dd>
                    </div>
                  )}
                  {selectedTx.approvalNotes && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] text-slate-500">Admin Approval Notes</dt>
                      <dd className="text-slate-800">{selectedTx.approvalNotes}</dd>
                    </div>
                  )}
                  {selectedTx.rejectionReason && (
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] text-[#E51B23]">Rejection Reason</dt>
                      <dd className="text-[#E51B23] font-medium">{selectedTx.rejectionReason}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Admin Approval / Rejection Controls */}
              {isAdmin && selectedTx.approvalStatus === 'AWAITING_APPROVAL' && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-[#F5F7FC]">
                  <p className="font-bold text-slate-900">Administrator Approval Decision</p>
                  {selectedTx.paymentStatus !== 'VERIFIED' ? (
                    <p className="text-xs text-amber-800">
                      This transaction is currently <strong>{selectedTx.paymentStatus}</strong>. Only
                      server-verified Chapa transactions can be approved. Click{' '}
                      <strong>Verify with Chapa API</strong> above first, or reject with a reason.
                    </p>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Approval Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        placeholder="Optional verification or accounting remarks..."
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}

                  {showRejectBox && (
                    <div className="space-y-2 pt-1">
                      <label className="block text-[11px] font-semibold text-[#E51B23]">
                        Mandatory Rejection Reason *
                      </label>
                      <textarea
                        rows={2}
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="State why this online payment cannot be approved..."
                        className="w-full px-3 py-2 text-xs bg-white border border-red-300 rounded-lg"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busyTxId === selectedTx.id}
                          onClick={() => void handleRejectTx(selectedTx)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#E51B23] hover:bg-red-700 rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          Confirm Rejection
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowRejectBox(false)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={
                        busyTxId === selectedTx.id || selectedTx.paymentStatus !== 'VERIFIED'
                      }
                      onClick={() => void handleApproveTx(selectedTx)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-40 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {busyTxId === selectedTx.id
                          ? 'Posting Ledger & Receipt...'
                          : 'Approve Payment & Issue Official Receipt'}
                      </span>
                    </button>

                    {!showRejectBox && (
                      <button
                        type="button"
                        disabled={busyTxId === selectedTx.id}
                        onClick={() => setShowRejectBox(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#E51B23] bg-white border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject Payment</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Admin Mark Refunded (for approved/verified online settlements) */}
              {isAdmin &&
                selectedTx.paymentStatus === 'VERIFIED' &&
                selectedTx.approvalStatus === 'APPROVED' && (
                  <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                    {!showRefundBox ? (
                      <button
                        type="button"
                        onClick={() => setShowRefundBox(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:underline cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Mark Chapa Transaction as Refunded (Merchant Reversal)</span>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          placeholder="Reason / Chapa refund settlement reference..."
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyTxId === selectedTx.id}
                            onClick={() => void handleMarkRefunded(selectedTx)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg cursor-pointer"
                          >
                            Confirm Refund Status
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRefundBox(false)}
                            className="px-3 py-1.5 text-xs text-slate-600 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadTransactionJson(selectedTx)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Record (.json)</span>
                </button>
                {selectedTx.receiptId &&
                  (() => {
                    const rcp = receipts.find((r) => r.id === selectedTx.receiptId);
                    return rcp ? (
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(rcp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#172DEB] hover:bg-[#263FEF] rounded-lg cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Receipt ({rcp.receiptNumber})</span>
                      </button>
                    ) : null;
                  })()}
              </div>
              <button
                type="button"
                onClick={() => setSelectedTxId(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
