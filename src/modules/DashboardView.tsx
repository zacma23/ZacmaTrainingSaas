import React, { useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Printer,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePortal } from '../context/PortalContext';
import { Avatar, EmptyState, StatusLabel } from '../components/PortalUI';
import { GeneralStaffView } from './GeneralStaffView';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import {
  computeCoursePerformance,
  computeDailyCollections,
  computeInstitutionalFinanceSummary,
  computeMonthlyFinancialTrends,
  computePaymentStatusDistribution,
  computeStudentFinancialRows,
} from '../lib/financeAnalytics';
import {
  addDaysIso,
  formatDateShort,
  formatEtb,
  formatEtbCompact,
  NavSection,
  Receipt,
  StudentPaymentCategory,
  todayIsoDate,
} from '../types/zacma';

export function DashboardView({
  onNavigate,
  onOpenReceipt,
  onOpenReports,
}: {
  onNavigate: (tab: NavSection) => void;
  onOpenReceipt: (receipt: Receipt) => void;
  onOpenReports?: (statusFilter?: 'ALL' | StudentPaymentCategory) => void;
}) {
  const {
    profile,
    effectiveRole,
    courses,
    students,
    enrollments,
    installments,
    payments,
    receipts,
    expenses,
    financialAdjustments,
    attendance,
  } = usePortal();

  const today = todayIsoDate();
  const next14Days = addDaysIso(today, 14);

  // Strict General Staff non-financial operational dashboard
  if (effectiveRole === 'GENERAL_STAFF') {
    return <GeneralStaffView onNavigate={onNavigate} />;
  }

  // Strict Instructor-only non-financial dashboard (assigned courses prioritized, zero financial data)
  if (effectiveRole === 'INSTRUCTOR') {
    const explicitlyAssigned = courses.filter(
      (c) => c.instructorId === profile?.uid || c.instructorName === profile?.fullName
    );
    const myCourses =
      explicitlyAssigned.length > 0
        ? explicitlyAssigned
        : courses.filter((c) => c.isActive);
    const myCourseIds = new Set(myCourses.map((c) => c.id));
    const activeEnrollments = enrollments.filter(
      (e) => e.status === 'ACTIVE' && (explicitlyAssigned.length === 0 || myCourseIds.has(e.courseId))
    );
    const myAttendance =
      explicitlyAssigned.length > 0
        ? attendance.filter((a) => myCourseIds.has(a.courseId))
        : attendance;
    const todayAtt = myAttendance.filter((a) => a.attendanceDate === today);
    const presentToday = todayAtt.filter((a) => a.status === 'PRESENT').length;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
              Instructor Academic Workspace
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {explicitlyAssigned.length > 0
                ? 'Your assigned ZACMA courses, enrolled students, and daily attendance log.'
                : 'Active ZACMA classes, enrolled students, and daily attendance overview.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <ClipboardCheck className="w-4 h-4" />
            Record Daily Attendance
          </button>
        </div>

        <ModuleAiToolbar moduleKey="dashboard" moduleLabel="Instructor Classes & Attendance" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <p className="text-xs font-medium">
                {explicitlyAssigned.length > 0 ? 'My Assigned Courses' : 'Active Classes'}
              </p>
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-display font-bold text-slate-900 tabular-nums mt-1">
              {myCourses.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Active ZACMA training tracks</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <p className="text-xs font-medium">Enrolled Students</p>
              <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-display font-bold text-slate-900 tabular-nums mt-1">
              {activeEnrollments.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Approved for classroom attendance</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <p className="text-xs font-medium">Attendance Logged Today</p>
              <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-display font-bold text-emerald-700 tabular-nums mt-1">
              {todayAtt.length}{' '}
              <span className="text-sm font-medium text-slate-500">({presentToday} Present)</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">{formatDateShort(today)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Class Schedule &amp; Enrollment</h2>
              <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
              >
                All classes <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {myCourses.slice(0, 6).map((course) => {
                const count = activeEnrollments.filter((e) => e.courseId === course.id).length;
                return (
                  <div key={course.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{course.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{course.code}</span> · {course.schedule}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                        {count} enrolled
                      </p>
                      <p className="text-xs text-slate-500">{course.instructorName || 'Staff'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Recent Attendance Entries</h2>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
              >
                Open roster <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {myAttendance.length === 0 ? (
              <EmptyState
                title="No attendance entries yet"
                description="Start logging daily student attendance for your assigned classes."
                actionLabel="Take Attendance"
                onAction={() => onNavigate('attendance')}
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {myAttendance.slice(0, 6).map((row) => (
                  <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {row.studentName}
                      </p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{row.studentCode}</span> · {row.courseName} ·{' '}
                        {formatDateShort(row.attendanceDate)}
                      </p>
                    </div>
                    <StatusLabel status={row.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Enterprise Finance Engine (Admin & Accountant — 100% live reconciled database analytics)
  const isAdmin = effectiveRole === 'ADMIN';
  const canOpenExcel =
    isAdmin || (effectiveRole === 'ACCOUNTANT' && Boolean(profile?.canExportReports));

  const studentRows = useMemo(
    () =>
      computeStudentFinancialRows({
        students,
        enrollments,
        payments,
        installments,
        courses,
        adjustments: financialAdjustments,
        today,
      }),
    [students, enrollments, payments, installments, courses, financialAdjustments, today]
  );

  const financeSummary = useMemo(
    () =>
      computeInstitutionalFinanceSummary({
        studentRows,
        payments,
        expenses,
        adjustments: financialAdjustments,
      }),
    [studentRows, payments, expenses, financialAdjustments]
  );

  const coursePerformance = useMemo(
    () => computeCoursePerformance(courses, studentRows),
    [courses, studentRows]
  );

  const statusDistribution = useMemo(
    () => computePaymentStatusDistribution(studentRows),
    [studentRows]
  );

  const dailyCollections = useMemo(
    () => computeDailyCollections(payments, 14, today),
    [payments, today]
  );

  const monthlySeries = useMemo(() => {
    const computed = computeMonthlyFinancialTrends(payments, expenses, financialAdjustments);
    if (computed.length >= 6) return computed.slice(-6);
    // Ensure a consistent 6-month axis even when fresh databases have < 6 active months
    const byKey = new Map(computed.map((m) => [m.monthKey, m]));
    const now = new Date();
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const existing = byKey.get(key);
      if (existing) {
        out.push(existing);
      } else {
        out.push({
          monthKey: key,
          monthLabel: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          incomeEtb: 0,
          expensesEtb: 0,
          refundsEtb: 0,
          netEtb: 0,
          paymentCount: 0,
        });
      }
    }
    return out;
  }, [payments, expenses, financialAdjustments]);

  const pendingPayments = useMemo(
    () => payments.filter((p) => p.status === 'PENDING'),
    [payments]
  );
  const totalPendingAmount = useMemo(
    () => pendingPayments.reduce((acc, p) => acc + p.amountEtb, 0),
    [pendingPayments]
  );

  const upcomingDeadlines = useMemo(() => {
    return installments
      .filter((i) => i.status !== 'PAID' && i.amountDueEtb > i.amountPaidEtb && i.dueDate <= next14Days)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6);
  }, [installments, next14Days]);

  const pendingPaymentsList = useMemo(() => pendingPayments.slice(0, 4), [pendingPayments]);
  const pendingStudentsList = useMemo(
    () => students.filter((s) => s.registrationStatus === 'PENDING').slice(0, 4),
    [students]
  );

  const categoryTotals = useMemo(() => {
    const eligible = studentRows.filter((r) => r.registrationStatus !== 'REJECTED');
    const fullyPaidSum = eligible
      .filter((r) => r.progressBucket === 'FULLY_PAID')
      .reduce((s, r) => s + r.netPaidEtb, 0);
    const partialRemaining = eligible
      .filter((r) => r.progressBucket === 'PARTIALLY_PAID')
      .reduce((s, r) => s + r.remainingBalanceEtb, 0);
    const unpaidRemaining = eligible
      .filter((r) => r.progressBucket === 'UNPAID')
      .reduce((s, r) => s + r.remainingBalanceEtb, 0);
    const overdueRemaining = eligible
      .filter((r) => r.isOverdue)
      .reduce((s, r) => s + r.remainingBalanceEtb, 0);
    return { fullyPaidSum, partialRemaining, unpaidRemaining, overdueRemaining };
  }, [studentRows]);

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="dashboard" moduleLabel="Executive Dashboard" />
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            {isAdmin ? 'Central Administrative Finance Dashboard' : 'Accountant Operations Desk'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time ETB tuition collections, student payment classification, institutional expenses, and approval controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canOpenExcel && (
            <button
              type="button"
              onClick={() => (onOpenReports ? onOpenReports('ALL') : onNavigate('reports'))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel Reports (.xlsx)
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            Register Student
          </button>
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Record Payment
          </button>
        </div>
      </div>

      {/* Primary Financial Overview KPIs (Reconciled Live Database Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Registered &amp; Active Students</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-display font-bold text-slate-900 tabular-nums">
            {financeSummary.totalRegisteredStudents}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            <span className="font-semibold text-emerald-700">
              {financeSummary.totalActiveStudents} active
            </span>{' '}
            ·{' '}
            <span className="font-semibold text-amber-700">
              {financeSummary.totalPendingStudents} pending
            </span>{' '}
            · {courses.filter((c) => c.isActive).length} courses
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Total Expected Student Fees</span>
            <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {formatEtbCompact(financeSummary.totalExpectedFeesEtb)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            Collection rate:{' '}
            <span className="font-semibold text-blue-700">
              {financeSummary.collectionRatePercent}%
            </span>
            {financeSummary.totalDiscountsEtb > 0
              ? ` · Discounts: ${formatEtbCompact(financeSummary.totalDiscountsEtb)}`
              : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Total Fees Collected (Income)</span>
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-mono font-bold text-emerald-700 tabular-nums">
            {formatEtbCompact(financeSummary.totalFeesCollectedEtb)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            {pendingPayments.length > 0 ? (
              <span className="text-amber-700 font-medium">
                +{formatEtbCompact(totalPendingAmount)} pending (excluded)
              </span>
            ) : financeSummary.totalRefundsAndReversalsEtb > 0 ? (
              <span>
                Net of {formatEtbCompact(financeSummary.totalRefundsAndReversalsEtb)} refunds
              </span>
            ) : (
              <span>All submitted payments settled</span>
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-red-200 transition-colors">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Total Outstanding Fees</span>
            <span className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-mono font-bold text-red-600 tabular-nums">
            {formatEtbCompact(financeSummary.totalOutstandingFeesEtb)}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
            {financeSummary.overdueCount > 0 ? (
              <span className="font-semibold text-red-600">
                {formatEtbCompact(financeSummary.totalOverdueAmountEtb)} overdue ({financeSummary.overdueCount})
              </span>
            ) : (
              <span>No overdue student balances</span>
            )}
          </p>
        </div>
      </div>

      {/* Institutional Income, Expenses & Net Balance Strip (Admin Executive Control) */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Institutional Income</p>
              <p className="text-xl font-mono font-bold text-slate-900 tabular-nums mt-1">
                {formatEtb(financeSummary.totalInstitutionalIncomeEtb)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Verified approved tuition receipts net of reversals
              </p>
            </div>
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Institutional Expenses</p>
              <p className="text-xl font-mono font-bold text-red-600 tabular-nums mt-1">
                {formatEtb(financeSummary.totalExpensesEtb)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                {expenses.length} recorded operational voucher{expenses.length === 1 ? '' : 's'}
              </p>
            </div>
            <span className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Net Institutional Balance</p>
              <p
                className={`text-xl font-mono font-bold tabular-nums mt-1 ${
                  financeSummary.netInstitutionalBalanceEtb >= 0 ? 'text-blue-700' : 'text-red-600'
                }`}
              >
                {formatEtb(financeSummary.netInstitutionalBalanceEtb)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Institutional income minus operational expenses
              </p>
            </div>
            <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
        </div>
      )}

      {/* Automatic Student Payment Categories (Clickable -> Excel Reports Pre-Filtered) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Student Payment Classification (Auto-Categorized)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Updates automatically on every payment approval, refund, reversal, or fee adjustment.
            </p>
          </div>
          {canOpenExcel && (
            <button
              type="button"
              onClick={() => (onOpenReports ? onOpenReports('ALL') : onNavigate('reports'))}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Export all categories to Excel <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[
            {
              key: 'FULLY_PAID' as StudentPaymentCategory,
              title: 'Fully Paid',
              count: financeSummary.fullyPaidCount,
              amountLabel: `Collected: ${formatEtbCompact(categoryTotals.fullyPaidSum)}`,
              sub: 'Zero remaining tuition balance',
              countClass: 'text-emerald-700',
              borderHover: 'hover:border-emerald-300',
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" />,
            },
            {
              key: 'PARTIALLY_PAID' as StudentPaymentCategory,
              title: 'Partially Paid',
              count: financeSummary.partiallyPaidCount,
              amountLabel: `Balance: ${formatEtbCompact(categoryTotals.partialRemaining)}`,
              sub: 'Paid partially, remaining balance open',
              countClass: 'text-blue-700',
              borderHover: 'hover:border-blue-300',
              icon: <CreditCard className="w-4 h-4 text-blue-700" />,
            },
            {
              key: 'UNPAID' as StudentPaymentCategory,
              title: 'Unpaid',
              count: financeSummary.unpaidCount,
              amountLabel: `Unpaid: ${formatEtbCompact(categoryTotals.unpaidRemaining)}`,
              sub: 'No approved payment recorded yet',
              countClass: 'text-amber-700',
              borderHover: 'hover:border-amber-300',
              icon: <Clock className="w-4 h-4 text-amber-700" />,
            },
            {
              key: 'OVERDUE' as StudentPaymentCategory,
              title: 'Overdue',
              count: financeSummary.overdueCount,
              amountLabel: `Overdue: ${formatEtbCompact(categoryTotals.overdueRemaining)}`,
              sub: 'Installment deadline passed with balance',
              countClass: 'text-red-600',
              borderHover: 'hover:border-red-300',
              icon: <AlertTriangle className="w-4 h-4 text-red-600" />,
            },
          ].map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => {
                if (canOpenExcel && onOpenReports) {
                  onOpenReports(cat.key);
                } else {
                  onNavigate('payments');
                }
              }}
              className={`text-left bg-slate-50/70 border border-slate-200 ${cat.borderHover} rounded-xl p-4 transition-colors group`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">{cat.title}</span>
                {cat.icon}
              </div>
              <div className="flex items-baseline justify-between gap-2 mt-2">
                <p className={`text-2xl font-display font-bold tabular-nums ${cat.countClass}`}>
                  {cat.count}
                </p>
                <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                  {cat.amountLabel}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
                <span className="truncate">{cat.sub}</span>
                <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-700 shrink-0 ml-1" />
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Analytics Row: Monthly Income vs Expenses + Student Payment Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Monthly Approved Income vs. Operational Expenses
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                6-month institutional cash trend in ETB (net of refunds, excludes pending submissions)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-700" />
                Approved Income
              </span>
              {isAdmin && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-red-600" />
                  Expenses
                </span>
              )}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#64748B' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  formatter={(value: unknown) => formatEtb(Number(value || 0))}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 8px 24px -8px rgba(17,24,39,0.12)',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="incomeEtb"
                  name="Approved Income"
                  fill="#172DEB"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={36}
                />
                {isAdmin && (
                  <Bar
                    dataKey="expensesEtb"
                    name="Expenses"
                    fill="#E51B23"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={36}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Student Payment Status Distribution Donut Chart */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">Student Payment Status</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution across {financeSummary.totalRegisteredStudents} registered students
            </p>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution.filter((d) => d.count > 0)}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={76}
                  paddingAngle={2}
                >
                  {statusDistribution
                    .filter((d) => d.count > 0)
                    .map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value || 0)} student(s)`,
                    String(name),
                  ]}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E5E7EB',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs">
            {statusDistribution.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-600 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Collection Trend + Pending Approvals Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Daily Collection Trend (Last 14 Days)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Approved daily student tuition receipts in ETB
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-blue-700 tabular-nums">
              14-day total:{' '}
              {formatEtbCompact(dailyCollections.reduce((s, d) => s + d.collectedEtb, 0))}
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyCollections} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="zacmaDailyBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#172DEB" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#172DEB" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  formatter={(value: unknown) => formatEtb(Number(value || 0))}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #E5E7EB',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="collectedEtb"
                  name="Daily Collected"
                  stroke="#172DEB"
                  strokeWidth={2}
                  fill="url(#zacmaDailyBlue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending Approvals Panel */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Pending Approvals</h2>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {financeSummary.totalPendingStudents} registrations · {pendingPayments.length} payments
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('approvals')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap"
              >
                Review all <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {pendingPaymentsList.length === 0 && pendingStudentsList.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-900">Approval queue is clear</p>
                <p className="text-xs text-slate-500 mt-1">
                  No pending registrations or fee submissions waiting.
                </p>
              </div>
            ) : (
              <>
                {pendingPaymentsList.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        Payment · {p.studentName}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                        {p.transactionRef} · {p.paymentMethod}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-bold text-amber-700 tabular-nums">
                        {formatEtbCompact(p.amountEtb)}
                      </p>
                      <p className="text-[11px] text-slate-500">Pending</p>
                    </div>
                  </div>
                ))}
                {pendingStudentsList.map((s) => (
                  <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={s.photoUrl} name={s.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          Registration · {s.fullName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          <span className="font-mono">{s.studentCode}</span> · {s.courseName}
                        </p>
                      </div>
                    </div>
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Course-Based Financial Performance Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Course-Based Financial Performance
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Expected tuition, approved collections, outstanding balances, and student payment status per course.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('accounting')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
          >
            Full accounting ledger <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        {coursePerformance.length === 0 ? (
          <EmptyState
            title="No courses configured"
            description="Create ZACMA courses to track per-course financial performance."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Course &amp; Instructor</th>
                  <th className="py-2.5 px-3 text-right">Students</th>
                  <th className="py-2.5 px-3 text-right">Paid / Partial / Unpaid</th>
                  <th className="py-2.5 px-3 text-right">Overdue</th>
                  <th className="py-2.5 px-3 text-right">Expected Fees</th>
                  <th className="py-2.5 px-3 text-right">Collected</th>
                  <th className="py-2.5 px-3 text-right">Outstanding</th>
                  <th className="py-2.5 px-4 text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {coursePerformance.slice(0, 8).map((row) => (
                  <tr key={row.courseId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{row.courseName}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono">{row.courseCode}</span> · {row.instructorName}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {row.studentCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="text-emerald-700 font-semibold">{row.fullyPaidCount}</span> /{' '}
                      <span className="text-blue-700 font-semibold">{row.partiallyPaidCount}</span> /{' '}
                      <span className="text-amber-700 font-semibold">{row.unpaidCount}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums">
                      <span className={row.overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}>
                        {row.overdueCount}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatEtb(row.expectedFeeEtb)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-emerald-700 whitespace-nowrap">
                      {formatEtb(row.collectedEtb)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-red-600 whitespace-nowrap">
                      {formatEtb(row.outstandingEtb)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                      {row.collectionRatePercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Split: Recent Transactions + Upcoming Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Transactions</h2>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Full ledger <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Reference / Student</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Amount (ETB)</th>
                  <th className="py-2.5 px-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {payments.slice(0, 6).map((p) => {
                  const rcp = receipts.find((r) => r.paymentId === p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{p.studentName}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {p.transactionRef} · {p.paymentMethod}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateShort(p.paymentDate)}
                      </td>
                      <td className="py-3 px-3">
                        <StatusLabel status={p.status} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatEtb(p.amountEtb)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {p.status === 'APPROVED' && rcp ? (
                          <button
                            type="button"
                            onClick={() => onOpenReceipt(rcp)}
                            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-semibold whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-bold text-slate-900">Upcoming &amp; Overdue Deadlines</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              Collect fee
            </button>
          </div>
          {upcomingDeadlines.length === 0 ? (
            <EmptyState
              title="No imminent deadlines"
              description="All student installments due in the next 14 days are settled."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingDeadlines.map((inst) => {
                const isOverdue = inst.dueDate < today;
                const dueRemaining = inst.amountDueEtb - inst.amountPaidEtb;
                return (
                  <div key={inst.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {inst.studentName}{' '}
                        <span className="font-mono font-normal text-slate-500">
                          · {inst.studentCode}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {inst.courseName} · Installment #{inst.installmentNumber}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-xs font-mono font-bold tabular-nums ${
                          isOverdue ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {formatEtbCompact(dueRemaining)}
                      </p>
                      <p
                        className={`text-[11px] font-medium ${
                          isOverdue ? 'text-red-600' : 'text-amber-700'
                        }`}
                      >
                        {isOverdue
                          ? `Overdue ${formatDateShort(inst.dueDate)}`
                          : `Due ${formatDateShort(inst.dueDate)}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
