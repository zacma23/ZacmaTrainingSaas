import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Globe,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePortal } from '../context/PortalContext';
import {
  createExpenseCategory,
  createExpenseRecord,
  deleteExpenseRecord,
  exportRowsToCsv,
} from '../lib/zacmaService';
import { ConfirmDialog, EmptyState, PaginationBar, StatusLabel } from '../components/PortalUI';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import { recordFinancialAdjustment } from '../lib/securityService';
import {
  addDaysIso,
  Enrollment,
  Expense,
  FinancialAdjustmentType,
  formatDateShort,
  formatEtb,
  formatEtbCompact,
  PaymentInstallment,
  PaymentMethod,
  todayIsoDate,
} from '../types/zacma';

type PeriodFilter = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL' | 'ALL';
type AccountingTab = 'cashflow' | 'expenses' | 'adjustments' | 'by_course' | 'outstanding';

export function AccountingView({
  onOpenReports,
}: {
  onOpenReports?: () => void;
} = {}) {
  const {
    profile,
    effectiveRole,
    courses,
    enrollments,
    installments,
    payments,
    chapaTransactions,
    expenses,
    expenseCategories,
    financialAdjustments,
    pushToast,
  } = usePortal();

  const [period, setPeriod] = useState<PeriodFilter>('ALL');
  const [tab, setTab] = useState<AccountingTab>('cashflow');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCatFilter, setExpenseCatFilter] = useState('ALL');
  const [outstandingSearch, setOutstandingSearch] = useState('');
  const [adjustmentSearch, setAdjustmentSearch] = useState('');
  const [expPage, setExpPage] = useState(1);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);

  if (effectiveRole === 'INSTRUCTOR') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <ShieldAlert className="w-7 h-7 text-red-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Financial Module Restricted</h2>
        <p className="text-xs text-slate-500 mt-1">
          Instructors do not have access to accounting reports, income ledgers, or expenses.
        </p>
      </div>
    );
  }

  const isAdmin = effectiveRole === 'ADMIN';
  const today = todayIsoDate();

  const inPeriod = (dateStr: string): boolean => {
    if (period === 'ALL') return true;
    if (period === 'DAILY') return dateStr === today;
    if (period === 'WEEKLY') return dateStr >= addDaysIso(today, -7);
    if (period === 'MONTHLY') return dateStr.slice(0, 7) === today.slice(0, 7);
    if (period === 'ANNUAL') return dateStr.slice(0, 4) === today.slice(0, 4);
    return true;
  };

  // Strict financial invariant: ONLY APPROVED payments are ever counted as official income
  const periodApprovedPayments = useMemo(
    () => payments.filter((p) => p.status === 'APPROVED' && inPeriod(p.paymentDate)),
    [payments, period, today]
  );

  const periodExpenses = useMemo(
    () => expenses.filter((e) => inPeriod(e.expenseDate)),
    [expenses, period, today]
  );

  const periodAdjustments = useMemo(
    () => financialAdjustments.filter((a) => inPeriod(a.effectiveDate)),
    [financialAdjustments, period, today]
  );

  const summary = useMemo(() => {
    const grossApprovedIncome = periodApprovedPayments.reduce((acc, p) => acc + p.amountEtb, 0);
    const refundsAndReversals = periodAdjustments
      .filter((a) => a.type === 'REFUND' || a.type === 'REVERSAL')
      .reduce((acc, a) => acc + a.amountEtb, 0);
    const approvedIncome = Math.max(0, Number((grossApprovedIncome - refundsAndReversals).toFixed(2)));
    const totalExpenses = periodExpenses.reduce((acc, e) => acc + e.amountEtb, 0);
    const pendingExcluded = payments
      .filter((p) => p.status === 'PENDING' && inPeriod(p.paymentDate))
      .reduce((acc, p) => acc + p.amountEtb, 0);
    const outstandingTotal = enrollments
      .filter((e) => e.status === 'ACTIVE' || e.status === 'COMPLETED')
      .reduce((acc, e) => acc + Math.max(0, e.remainingBalanceEtb), 0);

    return {
      approvedIncome,
      grossApprovedIncome,
      refundsAndReversals,
      totalExpenses,
      netCashFlow: approvedIncome - totalExpenses,
      pendingExcluded,
      outstandingTotal,
    };
  }, [periodApprovedPayments, periodAdjustments, periodExpenses, payments, enrollments, period, today]);

  // Separate Chapa online payment reconciliation breakdown (period-scoped)
  const chapaReconciliation = useMemo(() => {
    const periodChapa = chapaTransactions.filter((t) =>
      inPeriod((t.paymentDate || t.createdAt || '').slice(0, 10))
    );
    const verifiedList = periodChapa.filter((t) => t.paymentStatus === 'VERIFIED');
    const approvedList = periodChapa.filter((t) => t.approvalStatus === 'APPROVED');
    const pendingApprovalList = periodChapa.filter(
      (t) => t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL'
    );
    const rejectedList = periodChapa.filter((t) => t.approvalStatus === 'REJECTED');
    const failedList = periodChapa.filter(
      (t) => t.paymentStatus === 'FAILED' || t.paymentStatus === 'CANCELLED'
    );
    const refundedList = periodChapa.filter((t) => t.paymentStatus === 'REFUNDED');
    const sum = (arr: typeof periodChapa) =>
      Number(arr.reduce((acc, item) => acc + item.amountEtb, 0).toFixed(2));
    return {
      totalCount: periodChapa.length,
      verifiedAmount: sum(verifiedList),
      verifiedCount: verifiedList.length,
      approvedAmount: sum(approvedList),
      approvedCount: approvedList.length,
      pendingApprovalAmount: sum(pendingApprovalList),
      pendingApprovalCount: pendingApprovalList.length,
      rejectedAmount: sum(rejectedList),
      rejectedCount: rejectedList.length,
      failedAmount: sum(failedList),
      failedCount: failedList.length,
      refundedAmount: sum(refundedList),
      refundedCount: refundedList.length,
      manualApprovedAmount: Number(
        periodApprovedPayments
          .filter((p) => p.paymentMethod !== 'Chapa')
          .reduce((acc, p) => acc + p.amountEtb, 0)
          .toFixed(2)
      ),
    };
  }, [chapaTransactions, periodApprovedPayments, period, today]);

  const cashFlowLedger = useMemo(() => {
    const rows: Array<{
      id: string;
      date: string;
      type: 'INCOME' | 'REFUND' | 'EXPENSE';
      reference: string;
      description: string;
      method: string;
      amountEtb: number;
    }> = [];

    for (const p of periodApprovedPayments) {
      rows.push({
        id: `inc_${p.id}`,
        date: p.paymentDate,
        type: 'INCOME',
        reference: p.receiptNumber || p.transactionRef,
        description: `${p.studentName} (${p.studentCode}) — ${p.courseName}`,
        method: p.paymentMethod,
        amountEtb: p.amountEtb,
      });
    }
    for (const a of periodAdjustments) {
      if (a.type !== 'REFUND' && a.type !== 'REVERSAL') continue;
      rows.push({
        id: `adj_${a.id}`,
        date: a.effectiveDate,
        type: 'REFUND',
        reference: a.adjustmentRef,
        description: `${a.type}: ${a.studentName} (${a.studentCode}) — ${a.reason}`,
        method: 'Controlled Adjustment',
        amountEtb: -a.amountEtb,
      });
    }
    for (const e of periodExpenses) {
      rows.push({
        id: `exp_${e.id}`,
        date: e.expenseDate,
        type: 'EXPENSE',
        reference: e.referenceNo || 'EXPENSE',
        description: `${e.title} (${e.categoryName})`,
        method: e.paymentMethod,
        amountEtb: -e.amountEtb,
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [periodApprovedPayments, periodAdjustments, periodExpenses]);

  const filteredAdjustments = useMemo(() => {
    const q = adjustmentSearch.trim().toLowerCase();
    return periodAdjustments.filter((a) => {
      if (!q) return true;
      return (
        a.adjustmentRef.toLowerCase().includes(q) ||
        a.studentName.toLowerCase().includes(q) ||
        a.studentCode.toLowerCase().includes(q) ||
        a.courseName.toLowerCase().includes(q) ||
        a.reason.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q)
      );
    });
  }, [periodAdjustments, adjustmentSearch]);

  const revenueByCourse = useMemo(() => {
    return courses
      .map((c) => {
        const courseEnrs = enrollments.filter(
          (e) => e.courseId === c.id && (e.status === 'ACTIVE' || e.status === 'COMPLETED')
        );
        const approvedCollected = periodApprovedPayments
          .filter((p) => p.courseId === c.id)
          .reduce((acc, p) => acc + p.amountEtb, 0);
        const agreedTotal = courseEnrs.reduce((acc, e) => acc + e.agreedFeeEtb, 0);
        const outstanding = courseEnrs.reduce((acc, e) => acc + Math.max(0, e.remainingBalanceEtb), 0);
        const rate = agreedTotal > 0 ? Math.round(((agreedTotal - outstanding) / agreedTotal) * 100) : 0;
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          shortName: c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name,
          students: courseEnrs.length,
          agreedTotal,
          approvedCollected,
          outstanding,
          rate,
        };
      })
      .sort((a, b) => b.approvedCollected - a.approvedCollected);
  }, [courses, enrollments, periodApprovedPayments]);

  const filteredExpenses = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    return periodExpenses.filter((e) => {
      if (expenseCatFilter !== 'ALL' && e.categoryId !== expenseCatFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.categoryName.toLowerCase().includes(q) ||
        (e.referenceNo || '').toLowerCase().includes(q)
      );
    });
  }, [periodExpenses, expenseSearch, expenseCatFilter]);

  const outstandingEnrollments = useMemo(() => {
    const q = outstandingSearch.trim().toLowerCase();
    return enrollments
      .filter((e) => e.status === 'ACTIVE' && e.remainingBalanceEtb > 0)
      .filter((e) => {
        if (!q) return true;
        return (
          e.studentName.toLowerCase().includes(q) ||
          e.studentCode.toLowerCase().includes(q) ||
          e.courseName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.remainingBalanceEtb - a.remainingBalanceEtb);
  }, [enrollments, outstandingSearch]);

  const handleExportCashFlow = () => {
    exportRowsToCsv(
      `zacma-cashflow-${period.toLowerCase()}-${today}.csv`,
      ['Date', 'Type', 'Reference', 'Description', 'Payment Method', 'Amount (ETB)'],
      cashFlowLedger.map((r) => [
        r.date,
        r.type,
        r.reference,
        r.description,
        r.method,
        r.amountEtb.toFixed(2),
      ])
    );
    pushToast('success', 'Exported cash-flow report to CSV.');
  };

  const handleExportOutstanding = () => {
    exportRowsToCsv(
      `zacma-outstanding-fees-${today}.csv`,
      ['Student ID', 'Student Name', 'Course', 'Agreed Fee (ETB)', 'Approved Paid (ETB)', 'Outstanding (ETB)'],
      outstandingEnrollments.map((e) => [
        e.studentCode,
        e.studentName,
        e.courseName,
        e.agreedFeeEtb.toFixed(2),
        e.approvedPaidEtb.toFixed(2),
        e.remainingBalanceEtb.toFixed(2),
      ])
    );
    pushToast('success', 'Exported outstanding balances to CSV.');
  };

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="accounting" moduleLabel="Accounting & Financial Ledger" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Accounting &amp; Financial Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Official ETB income, institutional expenses, cash-flow statements, and course revenue analytics.
          </p>
        </div>

        {/* Period Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              ['DAILY', 'Daily'],
              ['WEEKLY', 'Weekly'],
              ['MONTHLY', 'Monthly'],
              ['ANNUAL', 'Annual'],
              ['ALL', 'All-Time'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                period === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Financial Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Net Approved Income ({period.toLowerCase()})</p>
          <p className="text-xl font-mono font-bold text-emerald-700 tabular-nums mt-1.5">
            {formatEtb(summary.approvedIncome)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {summary.refundsAndReversals > 0
              ? `Refunds/Reversals: -${formatEtbCompact(summary.refundsAndReversals)} · `
              : ''}
            Pending excluded: {formatEtbCompact(summary.pendingExcluded)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Expenses ({period.toLowerCase()})</p>
          <p className="text-xl font-mono font-bold text-red-700 tabular-nums mt-1.5">
            {formatEtb(summary.totalExpenses)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {periodExpenses.length} expense voucher{periodExpenses.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Net Cash Flow</p>
          <p
            className={`text-xl font-mono font-bold tabular-nums mt-1.5 ${
              summary.netCashFlow >= 0 ? 'text-blue-700' : 'text-red-700'
            }`}
          >
            {formatEtb(summary.netCashFlow)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Approved income minus expenses</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Outstanding Tuition</p>
          <p className="text-xl font-mono font-bold text-slate-900 tabular-nums mt-1.5">
            {formatEtb(summary.outstandingTotal)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Across {outstandingEnrollments.length} active balances
          </p>
        </div>
      </div>

      {/* Chapa Online Payments Reconciliation Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#172DEB]" />
            <h2 className="text-sm font-bold text-slate-900">
              Chapa Online Payment Gateway Reconciliation ({period.toLowerCase()})
            </h2>
          </div>
          <p className="text-[11px] text-slate-500">
            Only Admin-approved Chapa transactions are posted into Official Approved Income.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <div className="bg-[#F5F7FC] border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] font-medium text-slate-500">Verified Online</p>
            <p className="text-sm font-mono font-bold text-[#172DEB] tabular-nums mt-1">
              {formatEtbCompact(chapaReconciliation.verifiedAmount)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
              {chapaReconciliation.verifiedCount} tx
            </p>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3">
            <p className="text-[11px] font-medium text-emerald-800">Approved Online</p>
            <p className="text-sm font-mono font-bold text-emerald-700 tabular-nums mt-1">
              {formatEtbCompact(chapaReconciliation.approvedAmount)}
            </p>
            <p className="text-[10px] text-emerald-700/80 mt-0.5 tabular-nums">
              {chapaReconciliation.approvedCount} posted
            </p>
          </div>
          <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3">
            <p className="text-[11px] font-medium text-amber-800">Pending Approval</p>
            <p className="text-sm font-mono font-bold text-amber-700 tabular-nums mt-1">
              {formatEtbCompact(chapaReconciliation.pendingApprovalAmount)}
            </p>
            <p className="text-[10px] text-amber-700/80 mt-0.5 tabular-nums">
              {chapaReconciliation.pendingApprovalCount} awaiting
            </p>
          </div>
          <div className="bg-red-50/60 border border-red-200 rounded-lg p-3">
            <p className="text-[11px] font-medium text-red-800">Rejected Online</p>
            <p className="text-sm font-mono font-bold text-[#E51B23] tabular-nums mt-1">
              {formatEtbCompact(chapaReconciliation.rejectedAmount)}
            </p>
            <p className="text-[10px] text-red-700/80 mt-0.5 tabular-nums">
              {chapaReconciliation.rejectedCount} rejected
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] font-medium text-slate-600">Failed / Cancelled</p>
            <p className="text-sm font-mono font-bold text-slate-700 tabular-nums mt-1">
              {formatEtbCompact(chapaReconciliation.failedAmount)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
              {chapaReconciliation.failedCount} failed
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] font-medium text-slate-600">Refunded Online</p>
            <p className="text-sm font-mono font-bold text-slate-700 tabular-nums mt-1">
              {formatEtbCompact(chapaReconciliation.refundedAmount)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
              {chapaReconciliation.refundedCount} refunded
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-white">
            <p className="text-[11px] font-medium text-slate-300">Total Approved Fees</p>
            <p className="text-sm font-mono font-bold text-white tabular-nums mt-1">
              {formatEtbCompact(summary.grossApprovedIncome)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
              Manual {formatEtbCompact(chapaReconciliation.manualApprovedAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['cashflow', 'Cash-Flow Statement'],
              ['expenses', 'Expenses & Categories'],
              ['adjustments', `Refunds & Adjustments (${periodAdjustments.length})`],
              ['by_course', 'Revenue by Course'],
              ['outstanding', 'Outstanding Student Fees'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                tab === key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenReports && (isAdmin || Boolean(profile?.canExportReports)) && (
            <button
              type="button"
              onClick={onOpenReports}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel (.xlsx) Center
            </button>
          )}
          {tab === 'cashflow' && (
            <button
              type="button"
              onClick={handleExportCashFlow}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          {tab === 'outstanding' && (
            <button
              type="button"
              onClick={handleExportOutstanding}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
          {tab === 'adjustments' && isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdjustmentModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Issue Refund / Adjustment
            </button>
          )}
          {tab === 'expenses' && isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                Add Category
              </button>
              <button
                type="button"
                onClick={() => setShowExpenseModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Expense
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab 1: Cash Flow */}
      {tab === 'cashflow' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {cashFlowLedger.length === 0 ? (
            <EmptyState
              title="No approved financial entries in this period"
              description="Switch the period selector above to view historical cash-flow movements."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Reference</th>
                    <th className="py-3 px-3">Description</th>
                    <th className="py-3 px-3">Method</th>
                    <th className="py-3 px-4 text-right">Amount (ETB)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {cashFlowLedger.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                        {formatDateShort(r.date)}
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        <span
                          className={
                            r.type === 'INCOME'
                              ? 'text-emerald-700'
                              : r.type === 'REFUND'
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }
                        >
                          {r.type === 'INCOME'
                            ? 'Approved Income'
                            : r.type === 'REFUND'
                            ? 'Refund / Reversal'
                            : 'Expense'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">{r.reference}</td>
                      <td className="py-3 px-3 text-slate-900 font-medium">{r.description}</td>
                      <td className="py-3 px-3 text-slate-600">{r.method}</td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                          r.amountEtb >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {r.amountEtb >= 0 ? '+' : ''}
                        {formatEtb(r.amountEtb)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Expenses */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={expenseSearch}
                onChange={(e) => {
                  setExpenseSearch(e.target.value);
                  setExpPage(1);
                }}
                placeholder="Search expense title, voucher ref..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <select
              value={expenseCatFilter}
              onChange={(e) => {
                setExpenseCatFilter(e.target.value);
                setExpPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Expense Categories</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <EmptyState
                title="No expenses recorded in this period"
                description="Log operational expenses to track ZACMA net cash flow accurately."
                actionLabel={isAdmin ? 'Record Expense' : undefined}
                onAction={isAdmin ? () => setShowExpenseModal(true) : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-3">Expense Title &amp; Category</th>
                      <th className="py-3 px-3">Method &amp; Ref</th>
                      <th className="py-3 px-3">Recorded By</th>
                      <th className="py-3 px-3 text-right">Amount (ETB)</th>
                      {isAdmin && <th className="py-3 px-4 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredExpenses.slice((expPage - 1) * 8, expPage * 8).map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                          {formatDateShort(exp.expenseDate)}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-900">{exp.title}</p>
                          <p className="text-[11px] text-slate-500">{exp.categoryName}</p>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          <p>{exp.paymentMethod}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {exp.referenceNo || '—'}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{exp.recordedByName}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-red-700 tabular-nums whitespace-nowrap">
                          {formatEtb(exp.amountEtb)}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setDeletingExpense(exp)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                              aria-label="Delete expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={expPage}
              pageSize={8}
              total={filteredExpenses.length}
              onPageChange={setExpPage}
            />
          </div>
        </div>
      )}

      {/* Tab 2b: Controlled Refunds, Reversals & Adjustments (Immutable Ledger) */}
      {tab === 'adjustments' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={adjustmentSearch}
                onChange={(e) => setAdjustmentSearch(e.target.value)}
                placeholder="Search ref, student, course, reason..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <p className="text-xs text-slate-500">
              Approved payments are never deleted. Refunds, reversals, and fee adjustments are recorded here and atomically recalculate balances.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredAdjustments.length === 0 ? (
              <EmptyState
                title="No financial adjustments recorded"
                description="Controlled refunds, reversals, scholarship discounts, and fee adjustments authorized by an Admin appear in this immutable ledger."
                actionLabel={isAdmin ? 'Issue Refund / Adjustment' : undefined}
                onAction={isAdmin ? () => setShowAdjustmentModal(true) : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Reference &amp; Date</th>
                      <th className="py-3 px-3">Student &amp; Course</th>
                      <th className="py-3 px-3">Adjustment Type</th>
                      <th className="py-3 px-3">Audit Reason</th>
                      <th className="py-3 px-3">Authorized By</th>
                      <th className="py-3 px-4 text-right">Amount (ETB)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAdjustments.map((adj) => (
                      <tr key={adj.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="font-mono font-semibold text-slate-900">{adj.adjustmentRef}</p>
                          <p className="text-[11px] text-slate-500">{formatDateShort(adj.effectiveDate)}</p>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-900">{adj.studentName}</p>
                          <p className="text-[11px] text-slate-500">
                            <span className="font-mono">{adj.studentCode}</span> · {adj.courseName}
                          </p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono font-semibold">
                          <span
                            className={
                              adj.type === 'REFUND' || adj.type === 'REVERSAL'
                                ? 'text-red-600'
                                : adj.type === 'SCHOLARSHIP_DISCOUNT'
                                ? 'text-emerald-700'
                                : 'text-blue-700'
                            }
                          >
                            {adj.type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700 max-w-xs">{adj.reason}</td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{adj.approvedByName}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap text-slate-900">
                          {formatEtb(adj.amountEtb)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Revenue by Course */}
      {tab === 'by_course' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4">
              Approved Tuition Revenue by Course (ETB)
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByCourse} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '0.75rem',
                      borderColor: '#E5E7EB',
                      boxShadow: '0 4px 12px rgba(17, 24, 39, 0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => formatEtb(Number(val || 0))}
                  />
                  <Bar dataKey="approvedCollected" name="Approved Revenue" fill="#172DEB" radius={[5, 5, 0, 0]} maxBarSize={42} />
                  <Bar dataKey="outstanding" name="Outstanding" fill="#E51B23" radius={[5, 5, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Course</th>
                    <th className="py-3 px-3 text-right">Active Students</th>
                    <th className="py-3 px-3 text-right">Agreed Tuition</th>
                    <th className="py-3 px-3 text-right">Approved Collected</th>
                    <th className="py-3 px-3 text-right">Outstanding</th>
                    <th className="py-3 px-4 text-right">Collection Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {revenueByCourse.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="text-[11px] font-mono text-slate-500">{row.code}</p>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{row.students}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatEtb(row.agreedTotal)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                        {formatEtb(row.approvedCollected)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-red-700">
                        {formatEtb(row.outstanding)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {row.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Outstanding Student Fees */}
      {tab === 'outstanding' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={outstandingSearch}
                onChange={(e) => setOutstandingSearch(e.target.value)}
                placeholder="Search student name, ID, or course..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {outstandingEnrollments.length === 0 ? (
              <EmptyState
                title="Zero outstanding student balances"
                description="All active student tuition obligations are settled."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-3">Course &amp; Plan</th>
                      <th className="py-3 px-3 text-right">Agreed Fee</th>
                      <th className="py-3 px-3 text-right">Approved Paid</th>
                      <th className="py-3 px-3 text-right">Outstanding (ETB)</th>
                      <th className="py-3 px-4 text-right">Installment State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {outstandingEnrollments.map((enr) => {
                      const hasOverdue = installments.some(
                        (i) =>
                          i.enrollmentId === enr.id &&
                          i.status !== 'PAID' &&
                          i.dueDate < today
                      );
                      return (
                        <tr key={enr.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{enr.studentName}</p>
                            <p className="text-[11px] font-mono text-slate-500">{enr.studentCode}</p>
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-medium text-slate-900">{enr.courseName}</p>
                            <p className="text-[11px] text-slate-500">
                              {enr.paymentPlanName || enr.paymentPlanCode}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">
                            {formatEtb(enr.agreedFeeEtb)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700">
                            {formatEtb(enr.approvedPaidEtb)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-red-700">
                            {formatEtb(enr.remainingBalanceEtb)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <StatusLabel status={hasOverdue ? 'OVERDUE' : 'PARTIAL'} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && profile && (
        <ExpenseModal
          categories={expenseCategories}
          onClose={() => setShowExpenseModal(false)}
          onSave={async (data) => {
            await createExpenseRecord(data, {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            });
            pushToast('success', `Recorded expense "${data.title}".`);
            setShowExpenseModal(false);
          }}
        />
      )}

      {/* Expense Category Modal */}
      {showCategoryModal && profile && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onSave={async (data) => {
            await createExpenseCategory(data, {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            });
            pushToast('success', `Added expense category "${data.name}".`);
            setShowCategoryModal(false);
          }}
        />
      )}

      {/* Controlled Refund / Financial Adjustment Modal (Admin Only) */}
      {showAdjustmentModal && profile && isAdmin && (
        <FinancialAdjustmentModal
          enrollments={enrollments.filter((e) => e.status !== 'REJECTED')}
          installments={installments}
          onClose={() => setShowAdjustmentModal(false)}
          onSave={async (payload) => {
            try {
              const res = await recordFinancialAdjustment(payload, {
                uid: profile.uid,
                fullName: profile.fullName,
                role: profile.role,
              });
              pushToast(
                'success',
                `Authorized ${payload.type.replace(/_/g, ' ')} (${res.adjustmentRef}). Balances recalculated.`
              );
              setShowAdjustmentModal(false);
            } catch (err) {
              pushToast(
                'error',
                err instanceof Error ? err.message : 'Unable to record financial adjustment.'
              );
              throw err;
            }
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Delete Expense Entry"
        description={`Remove expense "${deletingExpense?.title}" (${formatEtb(
          deletingExpense?.amountEtb || 0
        )})? This removal will be recorded in the immutable audit trail.`}
        confirmLabel="Delete Expense"
        tone="danger"
        loading={busy}
        onConfirm={async () => {
          if (!deletingExpense || !profile) return;
          setBusy(true);
          try {
            await deleteExpenseRecord(deletingExpense, {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            });
            pushToast('info', 'Expense removed and logged to audit trail.');
            setDeletingExpense(null);
          } catch (err) {
            pushToast('error', err instanceof Error ? err.message : 'Failed to delete expense.');
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setDeletingExpense(null)}
      />
    </div>
  );
}

function ExpenseModal({
  categories,
  onClose,
  onSave,
}: {
  categories: ReturnType<typeof usePortal>['expenseCategories'];
  onClose: () => void;
  onSave: (data: {
    category: ReturnType<typeof usePortal>['expenseCategories'][number];
    title: string;
    amountEtb: number;
    expenseDate: string;
    paymentMethod: PaymentMethod;
    referenceNo?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [title, setTitle] = useState('');
  const [amountEtb, setAmountEtb] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat || !title.trim() || Number(amountEtb) <= 0) return;
    setSaving(true);
    await onSave({
      category: cat,
      title: title.trim(),
      amountEtb: Number(amountEtb),
      expenseDate,
      paymentMethod,
      referenceNo: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-base font-display font-bold text-slate-900">Record Expense (ETB)</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Monthly Campus Electricity Bill"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (ETB)</label>
              <input
                type="number"
                required
                min={1}
                step="0.01"
                value={amountEtb}
                onChange={(e) => setAmountEtb(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="CBE Birr">CBE Birr</option>
                <option value="Telebirr">Telebirr</option>
                <option value="Check">Check</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Voucher Ref</label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: { name: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), description: description.trim() || undefined });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-base font-display font-bold text-slate-900">New Expense Category</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Category Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Software Subscriptions"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              {saving ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FinancialAdjustmentModal({
  enrollments,
  installments,
  onClose,
  onSave,
}: {
  enrollments: Enrollment[];
  installments: PaymentInstallment[];
  onClose: () => void;
  onSave: (data: {
    enrollment: Enrollment;
    installments: PaymentInstallment[];
    type: FinancialAdjustmentType;
    amountEtb: number;
    effectiveDate: string;
    reason: string;
  }) => Promise<void>;
}) {
  const [enrollmentId, setEnrollmentId] = useState(enrollments[0]?.id || '');
  const [type, setType] = useState<FinancialAdjustmentType>('REFUND');
  const [amountEtb, setAmountEtb] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayIsoDate());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedEnrollment = enrollments.find((e) => e.id === enrollmentId) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || Number(amountEtb) <= 0 || reason.trim().length < 4) return;
    setSaving(true);
    try {
      await onSave({
        enrollment: selectedEnrollment,
        installments,
        type,
        amountEtb: Number(amountEtb),
        effectiveDate,
        reason: reason.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-display font-bold text-slate-900">
              Controlled Financial Refund / Adjustment
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Immutable ledger entry — approved payments are preserved for audit compliance.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Student Enrollment
            </label>
            <select
              value={enrollmentId}
              onChange={(e) => setEnrollmentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {enrollments.map((enr) => (
                <option key={enr.id} value={enr.id}>
                  {enr.studentCode} — {enr.studentName} ({enr.courseName})
                </option>
              ))}
            </select>
            {selectedEnrollment && (
              <p className="text-[11px] font-mono text-slate-600 mt-1.5 tabular-nums">
                Agreed: {formatEtb(selectedEnrollment.agreedFeeEtb)} · Paid:{' '}
                {formatEtb(selectedEnrollment.approvedPaidEtb)} · Balance:{' '}
                {formatEtb(selectedEnrollment.remainingBalanceEtb)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Adjustment Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FinancialAdjustmentType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="REFUND">Refund (Reduces Collected)</option>
                <option value="REVERSAL">Payment Reversal (Reduces Collected)</option>
                <option value="SCHOLARSHIP_DISCOUNT">Scholarship / Discount (Reduces Fee)</option>
                <option value="FEE_ADJUSTMENT">Additional Fee Adjustment (Increases Fee)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Effective Date
              </label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (ETB)</label>
            <input
              type="number"
              required
              min={1}
              step="0.01"
              value={amountEtb}
              onChange={(e) => setAmountEtb(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mandatory Audit Justification
            </label>
            <textarea
              rows={3}
              required
              minLength={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this refund, reversal, or adjustment is authorized..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedEnrollment}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Authorizing...' : 'Authorize Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

