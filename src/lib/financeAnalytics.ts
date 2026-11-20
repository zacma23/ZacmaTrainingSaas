import {
  ChapaTransaction,
  Course,
  Enrollment,
  Expense,
  FinancialAdjustment,
  Payment,
  PaymentInstallment,
  PaymentMethod,
  Student,
  StudentPaymentCategory,
} from '../types/zacma';
import { formatEthiopianDate, todayAddisIsoDate } from './ethiopianCalendar';

export interface StudentFinancialRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  phone: string;
  courseId: string;
  courseName: string;
  instructorId: string;
  instructorName: string;
  registrationStatus: Student['registrationStatus'];
  enrollmentStatus: Enrollment['status'] | 'UNENROLLED';
  registrationDate: string; // YYYY-MM-DD Gregorian
  registrationDateEthiopian: string;
  paymentPlanCode: string;
  totalCourseFeeEtb: number; // Base fee + positive fee adjustments - scholarship discounts
  approvedPaymentsEtb: number;
  refundsAndReversalsEtb: number;
  netPaidEtb: number;
  remainingBalanceEtb: number;
  paymentCategory: StudentPaymentCategory; // Primary status: OVERDUE takes precedence when past due with balance
  progressBucket: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'UNPAID'; // Strictly reconciles to active/enrolled students
  isOverdue: boolean;
  daysOverdue: number;
  lastPaymentDate: string;
  lastPaymentMethod: string;
  nextDeadline: string;
  paymentMethodsUsed: PaymentMethod[];
  paymentDates: string[];
  paymentHistorySummary: string;
  approvedPaymentCount: number;
  pendingPaymentAmountEtb: number;
}

export interface InstitutionalFinanceSummary {
  totalRegisteredStudents: number;
  totalActiveStudents: number;
  totalPendingStudents: number;
  totalExpectedFeesEtb: number;
  totalFeesCollectedEtb: number; // Net approved collections minus refunds/reversals
  totalGrossApprovedPaymentsEtb: number;
  totalRefundsAndReversalsEtb: number;
  totalDiscountsEtb: number;
  totalOutstandingFeesEtb: number;
  totalOverdueAmountEtb: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  unpaidCount: number;
  overdueCount: number;
  totalExpensesEtb: number;
  totalInstitutionalIncomeEtb: number;
  netInstitutionalBalanceEtb: number;
  collectionRatePercent: number;
}

export interface CourseFinancialPerformance {
  courseId: string;
  courseCode: string;
  courseName: string;
  instructorName: string;
  studentCount: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  unpaidCount: number;
  overdueCount: number;
  expectedFeeEtb: number;
  collectedEtb: number;
  outstandingEtb: number;
  collectionRatePercent: number;
}

export interface DailyCollectionPoint {
  date: string;
  label: string;
  collectedEtb: number;
  paymentCount: number;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  monthLabel: string;
  incomeEtb: number;
  expensesEtb: number;
  refundsEtb: number;
  netEtb: number;
  paymentCount: number;
}

export interface PaymentStatusDistributionPoint {
  key: StudentPaymentCategory;
  label: string;
  count: number;
  amountEtb: number;
  color: string;
}

function daysBetweenIso(earlierIso: string, laterIso: string): number {
  const a = new Date(`${earlierIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${laterIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

export function computeStudentFinancialRows(params: {
  students: Student[];
  enrollments: Enrollment[];
  payments: Payment[];
  installments: PaymentInstallment[];
  courses: Course[];
  adjustments?: FinancialAdjustment[];
  today?: string;
}): StudentFinancialRow[] {
  const today = params.today || todayAddisIsoDate();
  const adjustments = params.adjustments || [];

  const courseById = new Map(params.courses.map((c) => [c.id, c]));

  const enrollmentsByStudent = new Map<string, Enrollment[]>();
  for (const e of params.enrollments) {
    const list = enrollmentsByStudent.get(e.studentId) || [];
    list.push(e);
    enrollmentsByStudent.set(e.studentId, list);
  }

  const paymentsByStudent = new Map<string, Payment[]>();
  for (const p of params.payments) {
    const list = paymentsByStudent.get(p.studentId) || [];
    list.push(p);
    paymentsByStudent.set(p.studentId, list);
  }

  const installmentsByStudent = new Map<string, PaymentInstallment[]>();
  for (const inst of params.installments) {
    const list = installmentsByStudent.get(inst.studentId) || [];
    list.push(inst);
    installmentsByStudent.set(inst.studentId, list);
  }

  const adjustmentsByStudent = new Map<string, FinancialAdjustment[]>();
  for (const adj of adjustments) {
    const list = adjustmentsByStudent.get(adj.studentId) || [];
    list.push(adj);
    adjustmentsByStudent.set(adj.studentId, list);
  }

  return params.students.map((stu) => {
    const stuEnrollments = (enrollmentsByStudent.get(stu.id) || []).filter(
      (e) => e.status !== 'REJECTED'
    );
    const primaryEnrollment = stuEnrollments[0];
    const course = courseById.get(stu.courseId);

    const stuPayments = paymentsByStudent.get(stu.id) || [];
    const approvedPayments = stuPayments
      .filter((p) => p.status === 'APPROVED')
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    const pendingPayments = stuPayments.filter((p) => p.status === 'PENDING');

    const stuAdjustments = adjustmentsByStudent.get(stu.id) || [];
    const refundsAndReversalsEtb = stuAdjustments
      .filter((a) => a.type === 'REFUND' || a.type === 'REVERSAL')
      .reduce((sum, a) => sum + Number(a.amountEtb || 0), 0);
    const discountsEtb = stuAdjustments
      .filter((a) => a.type === 'SCHOLARSHIP_DISCOUNT')
      .reduce((sum, a) => sum + Number(a.amountEtb || 0), 0);
    const feeAdjustmentsEtb = stuAdjustments
      .filter((a) => a.type === 'FEE_ADJUSTMENT')
      .reduce((sum, a) => sum + Number(a.amountEtb || 0), 0);

    // Base agreed fee from enrollment (if active/completed/pending) else student courseFeeEtb
    const rawAgreedFee =
      stuEnrollments.length > 0
        ? stuEnrollments.reduce((sum, e) => sum + Number(e.agreedFeeEtb || 0), 0)
        : Number(stu.courseFeeEtb || 0);

    // Note: when adjustments are recorded via recordFinancialAdjustment, enrollment.agreedFeeEtb
    // and enrollment.approvedPaidEtb are updated atomically. To avoid double counting while
    // remaining accurate if historical enrollments exist, compute directly from payments & adjustments:
    const approvedPaymentsEtb = approvedPayments.reduce(
      (sum, p) => sum + Number(p.amountEtb || 0),
      0
    );

    const enrollmentApprovedPaid = stuEnrollments.reduce(
      (sum, e) => sum + Number(e.approvedPaidEtb || 0),
      0
    );

    // Reconcile net collected: prefer approved payments minus refunds when payments exist,
    // otherwise fall back to enrollmentApprovedPaid (for seeded records without individual payment rows).
    const netPaidEtb =
      approvedPayments.length > 0 || refundsAndReversalsEtb > 0
        ? Math.max(0, Number((approvedPaymentsEtb - refundsAndReversalsEtb).toFixed(2)))
        : Math.max(0, Number(enrollmentApprovedPaid.toFixed(2)));

    // Agreed fee: if enrollment was already updated by discounts/adjustments, rawAgreedFee already reflects it;
    // clamp to non-negative.
    const totalCourseFeeEtb =
      stuEnrollments.length > 0
        ? Math.max(0, Number(rawAgreedFee.toFixed(2)))
        : Math.max(0, Number((rawAgreedFee + feeAdjustmentsEtb - discountsEtb).toFixed(2)));

    const remainingBalanceEtb = Math.max(
      0,
      Number((totalCourseFeeEtb - netPaidEtb).toFixed(2))
    );

    // Evaluate installments for overdue & next deadline
    const stuInsts = (installmentsByStudent.get(stu.id) || []).sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate)
    );
    const unpaidInsts = stuInsts.filter(
      (i) => i.status !== 'PAID' && i.amountDueEtb - i.amountPaidEtb > 0.01
    );
    const overdueInsts = unpaidInsts.filter((i) => i.dueDate < today);
    const isOverdue = remainingBalanceEtb > 0.01 && overdueInsts.length > 0;
    const daysOverdue = isOverdue ? daysBetweenIso(overdueInsts[0].dueDate, today) : 0;

    const nextUpcoming = unpaidInsts.find((i) => i.dueDate >= today);
    const nextDeadline = overdueInsts[0]?.dueDate || nextUpcoming?.dueDate || '';

    let progressBucket: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'UNPAID';
    if (totalCourseFeeEtb > 0 && remainingBalanceEtb <= 0.01) {
      progressBucket = 'FULLY_PAID';
    } else if (netPaidEtb > 0.01) {
      progressBucket = 'PARTIALLY_PAID';
    } else {
      progressBucket = 'UNPAID';
    }

    const paymentCategory: StudentPaymentCategory = isOverdue ? 'OVERDUE' : progressBucket;

    const lastPayment = approvedPayments[0];
    const paymentMethodsUsed = Array.from(
      new Set(approvedPayments.map((p) => p.paymentMethod))
    );
    const paymentDates = approvedPayments.map((p) => p.paymentDate);

    const paymentHistorySummary =
      approvedPayments.length === 0
        ? 'No approved payments yet'
        : approvedPayments
            .slice(0, 4)
            .map(
              (p) =>
                `${p.paymentDate}: ETB ${p.amountEtb.toLocaleString()} (${p.paymentMethod}, ${p.transactionRef})`
            )
            .join(' | ') +
          (approvedPayments.length > 4 ? ` (+${approvedPayments.length - 4} more)` : '');

    return {
      studentId: stu.id,
      studentCode: stu.studentCode,
      fullName: stu.fullName,
      phone: stu.phone,
      courseId: stu.courseId,
      courseName: stu.courseName,
      instructorId: course?.instructorId || primaryEnrollment?.instructorId || '',
      instructorName: course?.instructorName || 'Unassigned',
      registrationStatus: stu.registrationStatus,
      enrollmentStatus: primaryEnrollment?.status || 'UNENROLLED',
      registrationDate: stu.enrollmentDate,
      registrationDateEthiopian:
        stu.registrationDateEthiopian || formatEthiopianDate(stu.enrollmentDate),
      paymentPlanCode: stu.paymentPlanCode,
      totalCourseFeeEtb,
      approvedPaymentsEtb: Number(approvedPaymentsEtb.toFixed(2)),
      refundsAndReversalsEtb: Number(refundsAndReversalsEtb.toFixed(2)),
      netPaidEtb,
      remainingBalanceEtb,
      paymentCategory,
      progressBucket,
      isOverdue,
      daysOverdue,
      lastPaymentDate: lastPayment?.paymentDate || '',
      lastPaymentMethod: lastPayment?.paymentMethod || '',
      nextDeadline,
      paymentMethodsUsed,
      paymentDates,
      paymentHistorySummary,
      approvedPaymentCount: approvedPayments.length,
      pendingPaymentAmountEtb: Number(
        pendingPayments.reduce((s, p) => s + Number(p.amountEtb || 0), 0).toFixed(2)
      ),
    };
  });
}

export function computeInstitutionalFinanceSummary(params: {
  studentRows: StudentFinancialRow[];
  payments: Payment[];
  expenses: Expense[];
  adjustments?: FinancialAdjustment[];
}): InstitutionalFinanceSummary {
  const adjustments = params.adjustments || [];
  const eligibleRows = params.studentRows.filter((r) => r.registrationStatus !== 'REJECTED');
  const activeRows = eligibleRows.filter(
    (r) =>
      r.registrationStatus === 'APPROVED' &&
      (r.enrollmentStatus === 'ACTIVE' || r.enrollmentStatus === 'COMPLETED')
  );

  const totalRegisteredStudents = eligibleRows.length;
  const totalActiveStudents = activeRows.length;
  const totalPendingStudents = eligibleRows.filter((r) => r.registrationStatus === 'PENDING').length;

  const totalExpectedFeesEtb = Number(
    eligibleRows.reduce((s, r) => s + r.totalCourseFeeEtb, 0).toFixed(2)
  );
  const totalGrossApprovedPaymentsEtb = Number(
    params.payments
      .filter((p) => p.status === 'APPROVED')
      .reduce((s, p) => s + Number(p.amountEtb || 0), 0)
      .toFixed(2)
  );
  const totalRefundsAndReversalsEtb = Number(
    adjustments
      .filter((a) => a.type === 'REFUND' || a.type === 'REVERSAL')
      .reduce((s, a) => s + Number(a.amountEtb || 0), 0)
      .toFixed(2)
  );
  const totalDiscountsEtb = Number(
    adjustments
      .filter((a) => a.type === 'SCHOLARSHIP_DISCOUNT')
      .reduce((s, a) => s + Number(a.amountEtb || 0), 0)
      .toFixed(2)
  );

  const totalFeesCollectedEtb = Math.max(
    0,
    Number((totalGrossApprovedPaymentsEtb - totalRefundsAndReversalsEtb).toFixed(2))
  );
  const totalOutstandingFeesEtb = Number(
    eligibleRows.reduce((s, r) => s + r.remainingBalanceEtb, 0).toFixed(2)
  );
  const totalOverdueAmountEtb = Number(
    eligibleRows
      .filter((r) => r.isOverdue)
      .reduce((s, r) => s + r.remainingBalanceEtb, 0)
      .toFixed(2)
  );

  const fullyPaidCount = eligibleRows.filter((r) => r.progressBucket === 'FULLY_PAID').length;
  const partiallyPaidCount = eligibleRows.filter(
    (r) => r.progressBucket === 'PARTIALLY_PAID'
  ).length;
  const unpaidCount = eligibleRows.filter((r) => r.progressBucket === 'UNPAID').length;
  const overdueCount = eligibleRows.filter((r) => r.isOverdue).length;

  const totalExpensesEtb = Number(
    params.expenses.reduce((s, e) => s + Number(e.amountEtb || 0), 0).toFixed(2)
  );
  const totalInstitutionalIncomeEtb = totalFeesCollectedEtb;
  const netInstitutionalBalanceEtb = Number(
    (totalInstitutionalIncomeEtb - totalExpensesEtb).toFixed(2)
  );
  const collectionRatePercent =
    totalExpectedFeesEtb > 0
      ? Number(((totalFeesCollectedEtb / totalExpectedFeesEtb) * 100).toFixed(1))
      : 0;

  return {
    totalRegisteredStudents,
    totalActiveStudents,
    totalPendingStudents,
    totalExpectedFeesEtb,
    totalFeesCollectedEtb,
    totalGrossApprovedPaymentsEtb,
    totalRefundsAndReversalsEtb,
    totalDiscountsEtb,
    totalOutstandingFeesEtb,
    totalOverdueAmountEtb,
    fullyPaidCount,
    partiallyPaidCount,
    unpaidCount,
    overdueCount,
    totalExpensesEtb,
    totalInstitutionalIncomeEtb,
    netInstitutionalBalanceEtb,
    collectionRatePercent,
  };
}

export function computeCoursePerformance(
  courses: Course[],
  studentRows: StudentFinancialRow[]
): CourseFinancialPerformance[] {
  const eligible = studentRows.filter((r) => r.registrationStatus !== 'REJECTED');
  return courses
    .map((c) => {
      const rows = eligible.filter((r) => r.courseId === c.id);
      const expectedFeeEtb = Number(
        rows.reduce((s, r) => s + r.totalCourseFeeEtb, 0).toFixed(2)
      );
      const collectedEtb = Number(rows.reduce((s, r) => s + r.netPaidEtb, 0).toFixed(2));
      const outstandingEtb = Number(
        rows.reduce((s, r) => s + r.remainingBalanceEtb, 0).toFixed(2)
      );
      return {
        courseId: c.id,
        courseCode: c.code,
        courseName: c.name,
        instructorName: c.instructorName || 'Unassigned',
        studentCount: rows.length,
        fullyPaidCount: rows.filter((r) => r.progressBucket === 'FULLY_PAID').length,
        partiallyPaidCount: rows.filter((r) => r.progressBucket === 'PARTIALLY_PAID').length,
        unpaidCount: rows.filter((r) => r.progressBucket === 'UNPAID').length,
        overdueCount: rows.filter((r) => r.isOverdue).length,
        expectedFeeEtb,
        collectedEtb,
        outstandingEtb,
        collectionRatePercent:
          expectedFeeEtb > 0 ? Number(((collectedEtb / expectedFeeEtb) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.expectedFeeEtb - a.expectedFeeEtb);
}

export function computeDailyCollections(
  payments: Payment[],
  days = 14,
  today?: string
): DailyCollectionPoint[] {
  const endDateStr = today || todayAddisIsoDate();
  const endDate = new Date(`${endDateStr}T00:00:00Z`);
  const approved = payments.filter((p) => p.status === 'APPROVED');

  const map = new Map<string, { amount: number; count: number }>();
  for (const p of approved) {
    const key = p.paymentDate.slice(0, 10);
    const cur = map.get(key) || { amount: 0, count: 0 };
    cur.amount += Number(p.amountEtb || 0);
    cur.count += 1;
    map.set(key, cur);
  }

  const out: DailyCollectionPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate.getTime() - i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const hit = map.get(iso) || { amount: 0, count: 0 };
    out.push({
      date: iso,
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      collectedEtb: Number(hit.amount.toFixed(2)),
      paymentCount: hit.count,
    });
  }
  return out;
}

export function computeMonthlyFinancialTrends(
  payments: Payment[],
  expenses: Expense[],
  adjustments: FinancialAdjustment[] = []
): MonthlyTrendPoint[] {
  const bucket = new Map<
    string,
    { income: number; expenses: number; refunds: number; paymentCount: number }
  >();

  const ensure = (key: string) => {
    const cur = bucket.get(key) || { income: 0, expenses: 0, refunds: 0, paymentCount: 0 };
    bucket.set(key, cur);
    return cur;
  };

  for (const p of payments) {
    if (p.status !== 'APPROVED') continue;
    const key = (p.paymentDate || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const b = ensure(key);
    b.income += Number(p.amountEtb || 0);
    b.paymentCount += 1;
  }

  for (const e of expenses) {
    const key = (e.expenseDate || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const b = ensure(key);
    b.expenses += Number(e.amountEtb || 0);
  }

  for (const a of adjustments) {
    if (a.type !== 'REFUND' && a.type !== 'REVERSAL') continue;
    const key = (a.effectiveDate || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const b = ensure(key);
    b.refunds += Number(a.amountEtb || 0);
  }

  return Array.from(bucket.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, val]) => {
      const [y, m] = monthKey.split('-').map(Number);
      const label = new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
      const netIncome = Math.max(0, Number((val.income - val.refunds).toFixed(2)));
      return {
        monthKey,
        monthLabel: label,
        incomeEtb: netIncome,
        expensesEtb: Number(val.expenses.toFixed(2)),
        refundsEtb: Number(val.refunds.toFixed(2)),
        netEtb: Number((netIncome - val.expenses).toFixed(2)),
        paymentCount: val.paymentCount,
      };
    });
}

export function computePaymentStatusDistribution(
  studentRows: StudentFinancialRow[]
): PaymentStatusDistributionPoint[] {
  const eligible = studentRows.filter((r) => r.registrationStatus !== 'REJECTED');
  const fullyPaid = eligible.filter((r) => r.progressBucket === 'FULLY_PAID');
  const partiallyPaid = eligible.filter(
    (r) => r.progressBucket === 'PARTIALLY_PAID' && !r.isOverdue
  );
  const unpaid = eligible.filter((r) => r.progressBucket === 'UNPAID' && !r.isOverdue);
  const overdue = eligible.filter((r) => r.isOverdue);

  return [
    {
      key: 'FULLY_PAID',
      label: 'Fully Paid',
      count: fullyPaid.length,
      amountEtb: Number(fullyPaid.reduce((s, r) => s + r.netPaidEtb, 0).toFixed(2)),
      color: '#16A34A',
    },
    {
      key: 'PARTIALLY_PAID',
      label: 'Partially Paid',
      count: partiallyPaid.length,
      amountEtb: Number(partiallyPaid.reduce((s, r) => s + r.remainingBalanceEtb, 0).toFixed(2)),
      color: '#172DEB',
    },
    {
      key: 'UNPAID',
      label: 'Unpaid',
      count: unpaid.length,
      amountEtb: Number(unpaid.reduce((s, r) => s + r.remainingBalanceEtb, 0).toFixed(2)),
      color: '#D97706',
    },
    {
      key: 'OVERDUE',
      label: 'Overdue',
      count: overdue.length,
      amountEtb: Number(overdue.reduce((s, r) => s + r.remainingBalanceEtb, 0).toFixed(2)),
      color: '#E51B23',
    },
  ];
}

export interface ChapaFinancialSummary {
  totalTransactionsCount: number;
  totalVerifiedOnlineAmountEtb: number;
  verifiedCount: number;
  totalApprovedOnlineAmountEtb: number;
  approvedCount: number;
  pendingAdminApprovalAmountEtb: number;
  pendingAdminApprovalCount: number;
  rejectedAmountEtb: number;
  rejectedCount: number;
  failedAmountEtb: number;
  failedCount: number;
  refundedAmountEtb: number;
  refundedCount: number;
  initiatedOrPendingVerifyCount: number;
}

export function computeChapaFinancialSummary(
  chapaTransactions: ChapaTransaction[]
): ChapaFinancialSummary {
  const sum = (list: ChapaTransaction[]) =>
    Number(list.reduce((acc, t) => acc + Number(t.amountEtb || 0), 0).toFixed(2));

  const verified = chapaTransactions.filter((t) => t.paymentStatus === 'VERIFIED');
  const approved = chapaTransactions.filter((t) => t.approvalStatus === 'APPROVED');
  const pendingApproval = chapaTransactions.filter(
    (t) => t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL'
  );
  const rejected = chapaTransactions.filter((t) => t.approvalStatus === 'REJECTED');
  const failed = chapaTransactions.filter(
    (t) => t.paymentStatus === 'FAILED' || t.paymentStatus === 'CANCELLED'
  );
  const refunded = chapaTransactions.filter((t) => t.paymentStatus === 'REFUNDED');
  const inFlight = chapaTransactions.filter(
    (t) => t.paymentStatus === 'INITIATED' || t.paymentStatus === 'PENDING_VERIFICATION'
  );

  return {
    totalTransactionsCount: chapaTransactions.length,
    totalVerifiedOnlineAmountEtb: sum(verified),
    verifiedCount: verified.length,
    totalApprovedOnlineAmountEtb: sum(approved),
    approvedCount: approved.length,
    pendingAdminApprovalAmountEtb: sum(pendingApproval),
    pendingAdminApprovalCount: pendingApproval.length,
    rejectedAmountEtb: sum(rejected),
    rejectedCount: rejected.length,
    failedAmountEtb: sum(failed),
    failedCount: failed.length,
    refundedAmountEtb: sum(refunded),
    refundedCount: refunded.length,
    initiatedOrPendingVerifyCount: inFlight.length,
  };
}
