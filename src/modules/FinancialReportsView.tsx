import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  Globe,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { DualCalendarDatePicker, DualDateDisplay } from '../components/DualCalendarDatePicker';
import { EmptyState, PaginationBar } from '../components/PortalUI';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import {
  computeInstitutionalFinanceSummary,
  computeStudentFinancialRows,
} from '../lib/financeAnalytics';
import {
  applyExportFilters,
  describeActiveFilters,
  downloadExcelWorkbook,
  ExcelExportFilters,
  ExcelReportKey,
  generateExcelWorkbook,
} from '../lib/excelExportService';
import { recordExcelExportAudit } from '../lib/securityService';
import {
  formatEtb,
  formatEtbCompact,
  PaymentMethod,
  StudentPaymentCategory,
} from '../types/zacma';

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'CBE Birr',
  'Telebirr',
  'Bank Transfer',
  'Check',
  'Chapa',
];

export function FinancialReportsView({
  initialStatusFilter,
}: {
  initialStatusFilter?: 'ALL' | StudentPaymentCategory;
}) {
  const {
    profile,
    effectiveRole,
    students,
    enrollments,
    installments,
    payments,
    chapaTransactions,
    expenses,
    financialAdjustments,
    courses,
    pushToast,
  } = usePortal();

  const [registrationDateFrom, setRegistrationDateFrom] = useState('');
  const [registrationDateTo, setRegistrationDateTo] = useState('');
  const [paymentDateFrom, setPaymentDateFrom] = useState('');
  const [paymentDateTo, setPaymentDateTo] = useState('');
  const [specificMonth, setSpecificMonth] = useState('');
  const [courseId, setCourseId] = useState('ALL');
  const [instructorId, setInstructorId] = useState('ALL');
  const [paymentStatus, setPaymentStatus] = useState<'ALL' | StudentPaymentCategory>(
    initialStatusFilter || 'ALL'
  );
  const [paymentMethod, setPaymentMethod] = useState<'ALL' | PaymentMethod>('ALL');
  const [showEthDatePicker, setShowEthDatePicker] = useState(false);
  const [exportingKey, setExportingKey] = useState<ExcelReportKey | null>(null);
  const [page, setPage] = useState(1);

  const canExport =
    effectiveRole === 'ADMIN' ||
    (effectiveRole === 'ACCOUNTANT' && Boolean(profile?.canExportReports));

  const instructors = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of courses) {
      if (c.instructorId && c.instructorName) {
        map.set(c.instructorId, c.instructorName);
      } else if (c.instructorName) {
        map.set(c.instructorName, c.instructorName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [courses]);

  const allStudentRows = useMemo(
    () =>
      computeStudentFinancialRows({
        students,
        enrollments,
        payments,
        installments,
        courses,
        adjustments: financialAdjustments,
      }),
    [students, enrollments, payments, installments, courses, financialAdjustments]
  );

  const activeFilters: ExcelExportFilters = useMemo(
    () => ({
      registrationDateFrom: registrationDateFrom || undefined,
      registrationDateTo: registrationDateTo || undefined,
      paymentDateFrom: paymentDateFrom || undefined,
      paymentDateTo: paymentDateTo || undefined,
      specificMonth: specificMonth || undefined,
      courseId,
      instructorId,
      paymentStatus,
      paymentMethod,
    }),
    [
      registrationDateFrom,
      registrationDateTo,
      paymentDateFrom,
      paymentDateTo,
      specificMonth,
      courseId,
      instructorId,
      paymentStatus,
      paymentMethod,
    ]
  );

  const filteredData = useMemo(
    () =>
      applyExportFilters({
        studentRows: allStudentRows,
        payments,
        chapaTransactions,
        expenses,
        adjustments: financialAdjustments,
        courses,
        generatedBy: profile?.fullName || 'ZACMA Admin',
        filters: activeFilters,
      }),
    [
      allStudentRows,
      payments,
      chapaTransactions,
      expenses,
      financialAdjustments,
      courses,
      profile?.fullName,
      activeFilters,
    ]
  );

  const filteredSummary = useMemo(
    () =>
      computeInstitutionalFinanceSummary({
        studentRows: filteredData.filteredStudents,
        payments: filteredData.filteredPayments,
        expenses: filteredData.filteredExpenses,
        adjustments: filteredData.filteredAdjustments,
      }),
    [filteredData]
  );

  const hasFilters = Boolean(
    registrationDateFrom ||
      registrationDateTo ||
      paymentDateFrom ||
      paymentDateTo ||
      specificMonth ||
      courseId !== 'ALL' ||
      instructorId !== 'ALL' ||
      paymentStatus !== 'ALL' ||
      paymentMethod !== 'ALL'
  );

  const resetFilters = () => {
    setRegistrationDateFrom('');
    setRegistrationDateTo('');
    setPaymentDateFrom('');
    setPaymentDateTo('');
    setSpecificMonth('');
    setCourseId('ALL');
    setInstructorId('ALL');
    setPaymentStatus('ALL');
    setPaymentMethod('ALL');
    setPage(1);
  };

  if (!canExport) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto">
        <ShieldAlert className="w-8 h-8 text-[#E51B23] mx-auto mb-3" />
        <h1 className="text-lg font-display font-bold text-slate-900">
          Restricted Financial Export Center
        </h1>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          Institutional Excel (.xlsx) financial reporting is strictly restricted to Administrators, or Accountants explicitly granted export authorization in Staff &amp; Roles.
        </p>
      </div>
    );
  }

  const handleExport = async (reportKey: ExcelReportKey) => {
    if (!profile) return;
    setExportingKey(reportKey);
    try {
      const result = generateExcelWorkbook(reportKey, {
        studentRows: allStudentRows,
        payments,
        chapaTransactions,
        expenses,
        adjustments: financialAdjustments,
        courses,
        generatedBy: `${profile.fullName} (${effectiveRole})`,
        filters: activeFilters,
      });
      downloadExcelWorkbook(result);
      await recordExcelExportAudit({
        reportKey,
        reportTitle: result.reportTitle,
        fileName: result.fileName,
        rowCount: result.rowCount,
        filterSummary: result.filterSummary,
        actor: {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        },
      });
      pushToast(
        'success',
        `Exported ${result.reportTitle} (${result.sheetNames.length} sheet${
          result.sheetNames.length === 1 ? '' : 's'
        }, ${result.rowCount} rows) and logged to Audit Trail.`
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Unable to generate Excel report.'
      );
    } finally {
      setExportingKey(null);
    }
  };

  const paginatedStudents = filteredData.filteredStudents.slice((page - 1) * 12, page * 12);

  const exportCatalog: Array<{
    key: ExcelReportKey;
    title: string;
    subtitle: string;
    countLabel: string;
    icon: React.ReactNode;
    accent: 'blue' | 'emerald' | 'amber' | 'red' | 'slate';
  }> = [
    {
      key: 'ALL_STUDENTS',
      title: 'Export All Students',
      subtitle: 'Complete student financial roster with dual Gregorian/Ethiopian dates and status.',
      countLabel: `${filteredData.filteredStudents.length} students`,
      icon: <Users className="w-4 h-4" />,
      accent: 'blue',
    },
    {
      key: 'FULLY_PAID',
      title: 'Export Fully Paid',
      subtitle: 'Students who completed all required tuition fees with last payment dates.',
      countLabel: `${filteredSummary.fullyPaidCount} students`,
      icon: <CheckCircle2 className="w-4 h-4" />,
      accent: 'emerald',
    },
    {
      key: 'PARTIALLY_PAID',
      title: 'Export Partially Paid',
      subtitle: 'Partial payers with remaining balance, payment history summary, and next deadline.',
      countLabel: `${filteredSummary.partiallyPaidCount} students`,
      icon: <Clock className="w-4 h-4" />,
      accent: 'blue',
    },
    {
      key: 'UNPAID',
      title: 'Export Unpaid',
      subtitle: 'Registered students with zero approved payment collected and pending deadlines.',
      countLabel: `${filteredSummary.unpaidCount} students`,
      icon: <Wallet className="w-4 h-4" />,
      accent: 'amber',
    },
    {
      key: 'OVERDUE',
      title: 'Export Overdue',
      subtitle: 'Past-due balances with days overdue, last payment date, and delinquency totals.',
      countLabel: `${filteredSummary.overdueCount} students`,
      icon: <AlertTriangle className="w-4 h-4" />,
      accent: 'red',
    },
    {
      key: 'MONTHLY_COLLECTIONS',
      title: 'Export Monthly Collections',
      subtitle: 'Month-by-month revenue, refunds, expenses, net cash flow, and approved payment sheet.',
      countLabel: `${filteredData.filteredPayments.filter((p) => p.status === 'APPROVED').length} payments`,
      icon: <TrendingUp className="w-4 h-4" />,
      accent: 'blue',
    },
    {
      key: 'COURSE_BASED',
      title: 'Export Course-Based Reports',
      subtitle: 'Per-course enrollment counts, expected fees, collections, receivables, and rate %.',
      countLabel: `${courses.length} courses`,
      icon: <BookOpen className="w-4 h-4" />,
      accent: 'slate',
    },
    {
      key: 'INSTITUTIONAL_EXPENSES',
      title: 'Export Institutional Expenses',
      subtitle: 'Operational expense ledger with categories, payment methods, and ETB totals.',
      countLabel: `${filteredData.filteredExpenses.length} entries`,
      icon: <ReceiptText className="w-4 h-4" />,
      accent: 'slate',
    },
    {
      key: 'INSTITUTIONAL_ACCOUNTING',
      title: 'Export Accounting Statement',
      subtitle: 'Income, collections, refunds/adjustments, expenses, receivables, and net balance.',
      countLabel: `Net ${formatEtbCompact(filteredSummary.netInstitutionalBalanceEtb)}`,
      icon: <Landmark className="w-4 h-4" />,
      accent: 'blue',
    },
  ];

  const chapaFiltered = filteredData.filteredChapa;
  const chapaExportCatalog: Array<{
    key: ExcelReportKey;
    title: string;
    subtitle: string;
    countLabel: string;
    icon: React.ReactNode;
    accent: 'blue' | 'emerald' | 'amber' | 'red' | 'slate';
  }> = [
    {
      key: 'CHAPA_ALL',
      title: 'All Online Payments (Chapa)',
      subtitle: 'Complete Chapa transaction ledger with references, channels, verification, and approval status.',
      countLabel: `${chapaFiltered.length} tx`,
      icon: <Globe className="w-4 h-4" />,
      accent: 'blue',
    },
    {
      key: 'CHAPA_VERIFIED',
      title: 'Verified Online Payments',
      subtitle: 'All server-verified Chapa transactions with official Chapa references and timestamps.',
      countLabel: `${chapaFiltered.filter((t) => t.paymentStatus === 'VERIFIED').length} tx`,
      icon: <ShieldCheck className="w-4 h-4" />,
      accent: 'blue',
    },
    {
      key: 'CHAPA_PENDING_APPROVAL',
      title: 'Pending Admin Approvals',
      subtitle: 'Server-verified online payments currently awaiting ZACMA Administrative approval.',
      countLabel: `${
        chapaFiltered.filter(
          (t) => t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL'
        ).length
      } tx`,
      icon: <Clock className="w-4 h-4" />,
      accent: 'amber',
    },
    {
      key: 'CHAPA_APPROVED',
      title: 'Approved Online Payments',
      subtitle: 'Officially approved Chapa payments posted to ledger with receipt numbers and approver.',
      countLabel: `${chapaFiltered.filter((t) => t.approvalStatus === 'APPROVED').length} tx`,
      icon: <CheckCircle2 className="w-4 h-4" />,
      accent: 'emerald',
    },
    {
      key: 'CHAPA_REJECTED',
      title: 'Rejected Online Payments',
      subtitle: 'Chapa transactions declined during admin review with documented rejection reasons.',
      countLabel: `${chapaFiltered.filter((t) => t.approvalStatus === 'REJECTED').length} tx`,
      icon: <XCircle className="w-4 h-4" />,
      accent: 'red',
    },
    {
      key: 'CHAPA_FAILED',
      title: 'Failed / Cancelled Payments',
      subtitle: 'Incomplete, failed, or cancelled Chapa checkout attempts excluded from revenue.',
      countLabel: `${
        chapaFiltered.filter(
          (t) => t.paymentStatus === 'FAILED' || t.paymentStatus === 'CANCELLED'
        ).length
      } tx`,
      icon: <AlertTriangle className="w-4 h-4" />,
      accent: 'slate',
    },
    {
      key: 'CHAPA_MONTHLY',
      title: 'Monthly Online Summary',
      subtitle: 'Month-by-month Chapa verified, approved, pending, rejected, and failed ETB totals.',
      countLabel: `${chapaFiltered.length} records`,
      icon: <TrendingUp className="w-4 h-4" />,
      accent: 'blue',
    },
    {
      key: 'CHAPA_STUDENT_HISTORY',
      title: 'Student Online Payment History',
      subtitle: 'Per-student Chapa online fee summary with total verified, approved, and remaining balance.',
      countLabel: `${new Set(chapaFiltered.map((t) => t.studentId)).size} students`,
      icon: <Users className="w-4 h-4" />,
      accent: 'slate',
    },
  ];

  const accentClasses = {
    blue: 'text-[#172DEB] bg-blue-50 border-blue-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    red: 'text-[#E51B23] bg-red-50 border-red-200',
    slate: 'text-slate-700 bg-slate-100 border-slate-200',
  };

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="reports" moduleLabel="Executive Reports & AI Analytics" />
      {/* Header + Primary Multi-Sheet Complete Export */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Financial Reporting &amp; Excel (.xlsx) Export Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate institutional Excel workbooks with ETB currency formatting, Excel SUM formulas, auto-filters, and dual Gregorian/Ethiopian dates. Every export is audited.
          </p>
        </div>
        <button
          type="button"
          disabled={exportingKey !== null}
          onClick={() => void handleExport('COMPLETE_FINANCIAL')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#172DEB] hover:bg-[#263FEF] rounded-lg shadow-xs disabled:opacity-60 whitespace-nowrap cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>
            {exportingKey === 'COMPLETE_FINANCIAL'
              ? 'Building Workbook...'
              : 'Export Complete Financial Report (.xlsx)'}
          </span>
        </button>
      </div>

      {/* Advanced Pre-Export Filter Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#172DEB]" />
            <h2 className="text-sm font-bold text-slate-900">Report Filters (Applied to Preview &amp; Excel Exports)</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowEthDatePicker((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#172DEB] hover:underline cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{showEthDatePicker ? 'Hide Ethiopian Date Picker' : 'Use Ethiopian Calendar Filter'}</span>
            </button>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#E51B23] hover:underline cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Registration From (Gregorian)
            </label>
            <input
              type="date"
              value={registrationDateFrom}
              onChange={(e) => {
                setRegistrationDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Registration To (Gregorian)
            </label>
            <input
              type="date"
              value={registrationDateTo}
              onChange={(e) => {
                setRegistrationDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Payment / Expense From
            </label>
            <input
              type="date"
              value={paymentDateFrom}
              onChange={(e) => {
                setPaymentDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Payment / Expense To
            </label>
            <input
              type="date"
              value={paymentDateTo}
              onChange={(e) => {
                setPaymentDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Specific Month
            </label>
            <input
              type="month"
              value={specificMonth}
              onChange={(e) => {
                setSpecificMonth(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Course</label>
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="ALL">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Instructor
            </label>
            <select
              value={instructorId}
              onChange={(e) => {
                setInstructorId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="ALL">All Instructors</option>
              {instructors.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => {
                  setPaymentStatus(e.target.value as 'ALL' | StudentPaymentCategory);
                  setPage(1);
                }}
                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">All</option>
                <option value="FULLY_PAID">Fully Paid</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="UNPAID">Unpaid</option>
                <option value="OVERDUE">Overdue</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value as 'ALL' | PaymentMethod);
                  setPage(1);
                }}
                className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">All</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Optional Dual Ethiopian/Gregorian Picker for Registration Range */}
        {showEthDatePicker && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <DualCalendarDatePicker
              label="Registration Start Date (Ethiopian / Gregorian)"
              value={registrationDateFrom || new Date().toISOString().slice(0, 10)}
              onChange={(iso) => {
                setRegistrationDateFrom(iso);
                setPage(1);
              }}
            />
            <DualCalendarDatePicker
              label="Registration End Date (Ethiopian / Gregorian)"
              value={registrationDateTo || new Date().toISOString().slice(0, 10)}
              onChange={(iso) => {
                setRegistrationDateTo(iso);
                setPage(1);
              }}
            />
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          Active Scope: <span className="font-medium text-slate-700">{describeActiveFilters(activeFilters, courses)}</span>
        </p>
      </div>

      {/* Reconciled Summary Strip for Filtered Dataset */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Matched Students</p>
          <p className="text-xl font-mono font-bold text-slate-900 tabular-nums mt-1">
            {filteredData.filteredStudents.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {filteredSummary.fullyPaidCount} Full · {filteredSummary.partiallyPaidCount} Partial ·{' '}
            {filteredSummary.unpaidCount} Unpaid
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Expected Fees</p>
          <p className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-1">
            {formatEtbCompact(filteredSummary.totalExpectedFeesEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Tuition obligation</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Net Collected</p>
          <p className="text-lg font-mono font-bold text-emerald-700 tabular-nums mt-1">
            {formatEtbCompact(filteredSummary.totalFeesCollectedEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {filteredSummary.collectionRatePercent}% collected
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Outstanding / Overdue</p>
          <p className="text-lg font-mono font-bold text-[#E51B23] tabular-nums mt-1">
            {formatEtbCompact(filteredSummary.totalOutstandingFeesEtb)}
          </p>
          <p className="text-[11px] text-[#E51B23] mt-0.5 tabular-nums">
            {filteredSummary.overdueCount} overdue ({formatEtbCompact(filteredSummary.totalOverdueAmountEtb)})
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-medium text-slate-500">Net Balance</p>
          <p className="text-lg font-mono font-bold text-[#172DEB] tabular-nums mt-1">
            {formatEtbCompact(filteredSummary.netInstitutionalBalanceEtb)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Expenses: {formatEtbCompact(filteredSummary.totalExpensesEtb)}
          </p>
        </div>
      </div>

      {/* All 9 Dedicated Exportable Excel Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {exportCatalog.map((item) => (
          <div
            key={item.key}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${accentClasses[item.accent]}`}>
                  {item.icon}
                </div>
                <span className="text-[11px] font-mono font-semibold text-slate-600 tabular-nums">
                  {item.countLabel}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-slate-900">{item.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={exportingKey !== null}
              onClick={() => void handleExport(item.key)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-[#F5F7FC] hover:bg-[#172DEB] hover:text-white border border-slate-200 hover:border-[#172DEB] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportingKey === item.key ? 'Generating .xlsx...' : 'Download Excel (.xlsx)'}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Dedicated Chapa Online Payment Excel Reports (.xlsx) Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#172DEB]" />
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900">
                Chapa Online Payment Excel Reports (.xlsx)
              </h2>
              <p className="text-xs text-slate-500">
                Audit-grade Excel exports dedicated to Chapa online gateway verification, approval queues, and student history.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
            {chapaFiltered.length} matched Chapa tx
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {chapaExportCatalog.map((item) => (
            <div
              key={item.key}
              className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center ${accentClasses[item.accent]}`}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-slate-600 tabular-nums">
                    {item.countLabel}
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-display font-bold text-slate-900">{item.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{item.subtitle}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={exportingKey !== null}
                onClick={() => void handleExport(item.key)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-[#172DEB] hover:text-white border border-slate-200 hover:border-[#172DEB] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportingKey === item.key ? 'Generating...' : 'Download .xlsx'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Live Preview Table of Matched Student Financial Records */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Live Financial Roster Preview ({filteredData.filteredStudents.length} Students)
            </h2>
            <p className="text-xs text-slate-500">
              Verify categorization and ETB figures before downloading institutional Excel workbooks.
            </p>
          </div>
        </div>

        {paginatedStudents.length === 0 ? (
          <EmptyState
            title="No student financial records match these filters"
            description="Adjust your registration date, course, instructor, or payment status filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-3">Course &amp; Instructor</th>
                  <th className="py-3 px-3">Registered (Dual)</th>
                  <th className="py-3 px-3 text-right">Total Fee</th>
                  <th className="py-3 px-3 text-right">Net Paid</th>
                  <th className="py-3 px-3 text-right">Remaining</th>
                  <th className="py-3 px-4 text-right">Payment Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginatedStudents.map((row) => (
                  <tr key={row.studentId} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{row.fullName}</p>
                      <p className="text-[11px] font-mono text-slate-500">
                        {row.studentCode} · {row.phone}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      <p className="text-slate-800 font-medium">{row.courseName}</p>
                      <p className="text-[11px] text-slate-500">{row.instructorName}</p>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <DualDateDisplay
                        isoDate={row.registrationDate}
                        ethiopianOverride={row.registrationDateEthiopian}
                      />
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatEtb(row.totalCourseFeeEtb)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {formatEtb(row.netPaidEtb)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums font-semibold ${
                        row.remainingBalanceEtb > 0 ? 'text-[#E51B23]' : 'text-emerald-700'
                      }`}
                    >
                      {formatEtb(row.remainingBalanceEtb)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          row.isOverdue
                            ? 'text-[#E51B23]'
                            : row.progressBucket === 'FULLY_PAID'
                            ? 'text-emerald-700'
                            : row.progressBucket === 'PARTIALLY_PAID'
                            ? 'text-[#172DEB]'
                            : 'text-amber-700'
                        }`}
                      >
                        {row.isOverdue
                          ? `Overdue (${row.daysOverdue}d)`
                          : row.progressBucket === 'FULLY_PAID'
                          ? 'Fully Paid'
                          : row.progressBucket === 'PARTIALLY_PAID'
                          ? 'Partially Paid'
                          : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          page={page}
          pageSize={12}
          total={filteredData.filteredStudents.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
