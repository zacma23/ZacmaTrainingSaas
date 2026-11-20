import {
  AiRoleScope,
  AiUsageLogRecord,
  AttendanceRecord,
  ChapaTransaction,
  Course,
  Enrollment,
  Expense,
  Payment,
  PaymentInstallment,
  PlatformPayment,
  PlatformSubscription,
  Receipt,
  RoleCode,
  StaffCompensation,
  StaffRecord,
  Student,
  SupportTicket,
  TenantRecord,
} from '../types/zacma';

export interface RoleModulePrompt {
  id: string;
  label: string;
  prompt: string;
  category: 'Analytics' | 'Drafting' | 'Guidance' | 'Academic' | 'Audit';
}

export interface RoleAiProfileMeta {
  title: string;
  subtitle: string;
  scopeSummary: string;
  restrictions: string[];
}

export const ROLE_AI_PROFILES: Record<AiRoleScope, RoleAiProfileMeta> = {
  SUPER_ADMIN: {
    title: 'ZACMA Super Admin AI',
    subtitle: 'Platform-Wide Multi-Tenant Intelligence',
    scopeSummary: 'Authorized platform institutes, subscriptions, SaaS MRR/revenue, AI usage, and support tickets.',
    restrictions: ['No raw user passwords, API keys, or encrypted ID files'],
  },
  ADMIN: {
    title: 'Institute Executive AI',
    subtitle: 'Full Institute Management & Executive Analytics',
    scopeSummary: 'This institute’s students, courses, approved revenue, expenses, Chapa, attendance, and staff.',
    restrictions: ['Strictly isolated to this institute only', 'No other institutes or ZACMA platform data'],
  },
  MANAGER: {
    title: 'Institute Operations AI',
    subtitle: 'Operational Performance & Course Analytics',
    scopeSummary: 'This institute’s courses, enrollments, attendance trends, overdue lists, and staff directory.',
    restrictions: ['No Admin-only payroll/salary vault', 'No cross-institute or platform data'],
  },
  ACCOUNTANT: {
    title: 'Accountant Finance AI',
    subtitle: 'Fee Collections, Reconciliation & Anomaly Detection',
    scopeSummary: 'This institute’s approved revenue, pending payments, overdue fees, Chapa, expenses, and duplicate flags.',
    restrictions: ['No HR salary vault', 'No Super Admin platform data', 'Cannot self-approve payments'],
  },
  INSTRUCTOR: {
    title: 'Instructor Academic AI',
    subtitle: 'Assigned Courses, Attendance, Lesson Plans & Exams',
    scopeSummary: 'Only your assigned courses, enrolled students, and class attendance patterns.',
    restrictions: ['Zero access to financial revenue, fees, expenses, or salaries', 'Assigned classes only'],
  },
  RECEPTIONIST: {
    title: 'Front-Desk Reception AI',
    subtitle: 'Admissions, AI ID/QR Registration & Inquiries',
    scopeSummary: 'Course catalog, admission intake workflows, and non-financial student directory.',
    restrictions: ['No accounting ledgers, revenue, expenses, or staff salaries'],
  },
  HR_OFFICER: {
    title: 'HR & Staff Operations AI',
    subtitle: 'Staff Onboarding, Departments & HR Documentation',
    scopeSummary: 'This institute’s staff directory, pending staff registrations, and department distribution.',
    restrictions: ['No student financial ledgers', 'No Admin-only salary compensation vault'],
  },
  GENERAL_STAFF: {
    title: 'Staff Operational AI',
    subtitle: 'Course Schedules, Directory & Portal Guidance',
    scopeSummary: 'Course catalog, non-financial student directory, and general attendance overview.',
    restrictions: ['No financial reports, fee ledgers, or staff salaries'],
  },
  STUDENT: {
    title: 'Personal Student AI Tutor',
    subtitle: 'Your Courses, Fees, Attendance & Study Companion',
    scopeSummary: 'Strictly your own student profile, enrollments, fee schedule, payments, receipts, and attendance.',
    restrictions: ['Zero visibility into other students', 'Zero access to institute-wide financials'],
  },
};

export const MODULE_PROMPTS_BY_KEY: Record<string, RoleModulePrompt[]> = {
  dashboard: [
    {
      id: 'dash_exec',
      label: 'Executive Summary',
      category: 'Analytics',
      prompt: 'Summarize our institute performance today: active students, approved revenue, overdue fees, and top 3 priorities.',
    },
    {
      id: 'dash_risks',
      label: 'Operational Bottlenecks',
      category: 'Audit',
      prompt: 'Identify pending approvals, overdue fee risks, or low attendance patterns we should act on this week.',
    },
  ],
  students: [
    {
      id: 'stu_at_risk',
      label: 'At-Risk Students',
      category: 'Analytics',
      prompt: 'Analyze student enrollment and attendance status to highlight students who may need follow-up.',
    },
    {
      id: 'stu_welcome',
      label: 'Welcome Notice Draft',
      category: 'Drafting',
      prompt: 'Draft a professional orientation welcome message for newly approved students (for review & manual approval).',
    },
  ],
  courses: [
    {
      id: 'crs_outline',
      label: 'Generate Course Outline',
      category: 'Academic',
      prompt: 'Generate a structured 8-week syllabus and module outline for one of our active training courses.',
    },
    {
      id: 'crs_perf',
      label: 'Course Enrollment Analysis',
      category: 'Analytics',
      prompt: 'Compare enrollment counts across our courses and suggest which programs have capacity for promotion.',
    },
  ],
  payments: [
    {
      id: 'pay_overdue',
      label: 'Overdue Fee Analysis',
      category: 'Analytics',
      prompt: 'Summarize overdue student balances and list the highest-priority follow-ups from our authorized data.',
    },
    {
      id: 'pay_dups',
      label: 'Detect Duplicate Payments',
      category: 'Audit',
      prompt: 'Review our duplicate payment flags and pending submissions to spot any unusual or duplicate payment entries.',
    },
    {
      id: 'pay_reminder',
      label: 'Draft Fee Reminder',
      category: 'Drafting',
      prompt: 'Draft a polite, clear payment reminder SMS and email for students with overdue installments (for review & approval).',
    },
  ],
  accounting: [
    {
      id: 'acc_pnl',
      label: 'Revenue vs Expense Summary',
      category: 'Analytics',
      prompt: 'Provide a concise revenue vs expense financial summary using only APPROVED payments and recorded expenses.',
    },
    {
      id: 'acc_anomalies',
      label: 'Expense & Cash Flow Check',
      category: 'Audit',
      prompt: 'Review expense categories and highlight our top spending areas plus cash-flow recommendations.',
    },
  ],
  attendance: [
    {
      id: 'att_patterns',
      label: 'Attendance Trend Analysis',
      category: 'Analytics',
      prompt: 'Analyze recorded attendance rates, highlight frequent absences or late arrivals, and recommend follow-up actions.',
    },
    {
      id: 'att_notice',
      label: 'Draft Attendance Follow-up',
      category: 'Drafting',
      prompt: 'Draft a supportive attendance check-in message for students with recent absences (for review & approval).',
    },
  ],
  communications: [
    {
      id: 'comm_sms',
      label: 'Draft SMS Campaign',
      category: 'Drafting',
      prompt: 'Draft a concise 160-character SMS announcement for an upcoming schedule or fee deadline (for manual approval).',
    },
    {
      id: 'comm_email',
      label: 'Draft Campus Announcement',
      category: 'Drafting',
      prompt: 'Write a clear, professional campus announcement email covering training schedules and office hours (draft for approval).',
    },
  ],
  reports: [
    {
      id: 'rep_monthly',
      label: 'Monthly Executive Report',
      category: 'Analytics',
      prompt: 'Generate a structured Monthly Executive Report with KPI summary, fee collection health, and actionable next steps.',
    },
    {
      id: 'rep_board',
      label: 'Board Brief',
      category: 'Analytics',
      prompt: 'Produce a 1-page leadership briefing summarizing enrollment growth, collection rate, and operational priorities.',
    },
  ],
  staff: [
    {
      id: 'hr_jd',
      label: 'Draft Job Description',
      category: 'Drafting',
      prompt: 'Draft a complete job description for a Technical Training Instructor at our institute (for review & approval).',
    },
    {
      id: 'hr_summary',
      label: 'Department Coverage Summary',
      category: 'Analytics',
      prompt: 'Summarize our active staff directory by department and highlight any pending staff onboarding approvals.',
    },
  ],
  student_portal: [
    {
      id: 'sp_balance',
      label: 'My Fee Balance & Deadlines',
      category: 'Guidance',
      prompt: 'Explain my current course fee balance, approved payments, pending payments, and upcoming installment deadlines.',
    },
    {
      id: 'sp_study',
      label: 'Create Study Plan',
      category: 'Academic',
      prompt: 'Create a practical 2-week study schedule tailored to my enrolled training course so I can prepare effectively.',
    },
    {
      id: 'sp_quiz',
      label: 'Practice Quiz',
      category: 'Academic',
      prompt: 'Give me 5 practice review questions with explanations based on my enrolled training course topic.',
    },
  ],
  sa_dashboard: [
    {
      id: 'sa_health',
      label: 'Platform Health Brief',
      category: 'Analytics',
      prompt: 'Summarize platform-wide SaaS health: active vs trial institutes, MRR/revenue, expiring subscriptions, and risks.',
    },
    {
      id: 'sa_churn',
      label: 'Subscription & Churn Risk',
      category: 'Audit',
      prompt: 'Identify institutes with trials ending soon, expired subscriptions, or high AI quota consumption needing outreach.',
    },
    {
      id: 'sa_ai_cost',
      label: 'AI Usage & Cost Report',
      category: 'Analytics',
      prompt: 'Analyze platform AI usage logs, total token volume, estimated USD cost, and top consuming institutes.',
    },
  ],
};

export function getQuickPromptsForRoleAndModule(
  role: AiRoleScope,
  activeModule?: string
): RoleModulePrompt[] {
  if (role === 'SUPER_ADMIN') {
    return MODULE_PROMPTS_BY_KEY.sa_dashboard;
  }
  if (role === 'STUDENT') {
    return MODULE_PROMPTS_BY_KEY.student_portal;
  }
  if (role === 'INSTRUCTOR') {
    return [
      {
        id: 'inst_lesson',
        label: 'Generate Lesson Plan',
        category: 'Academic',
        prompt: 'Create a detailed 2-hour practical lesson plan with objectives and lab exercises for one of my assigned courses.',
      },
      {
        id: 'inst_exam',
        label: 'Create Quiz / Exam',
        category: 'Academic',
        prompt: 'Generate a 10-question assessment (multiple choice + practical short answer) with an answer key for my assigned course.',
      },
      {
        id: 'inst_att',
        label: 'Class Attendance Insights',
        category: 'Analytics',
        prompt: 'Review attendance across my assigned courses and flag any students with repeated absences.',
      },
      {
        id: 'inst_notice',
        label: 'Draft Class Notice',
        category: 'Drafting',
        prompt: 'Draft a clear classroom reminder about upcoming lab assignments and attendance expectations (for review).',
      },
    ];
  }
  if (role === 'RECEPTIONIST') {
    return [
      {
        id: 'rec_guide',
        label: 'Registration Checklist',
        category: 'Guidance',
        prompt: 'Summarize the required documents and steps to register a new student using AI ID OCR or QR scanning.',
      },
      {
        id: 'rec_courses',
        label: 'Course Inquiry Pitch',
        category: 'Drafting',
        prompt: 'Summarize our active courses and durations so I can quickly answer prospective student inquiries at the front desk.',
      },
    ];
  }
  if (role === 'HR_OFFICER') {
    return MODULE_PROMPTS_BY_KEY.staff;
  }
  if (role === 'ACCOUNTANT') {
    return [...MODULE_PROMPTS_BY_KEY.payments, MODULE_PROMPTS_BY_KEY.accounting[0]];
  }

  const modKey = activeModule && MODULE_PROMPTS_BY_KEY[activeModule] ? activeModule : 'dashboard';
  const base = MODULE_PROMPTS_BY_KEY[modKey] || MODULE_PROMPTS_BY_KEY.dashboard;
  if (modKey !== 'dashboard') {
    return [...base, MODULE_PROMPTS_BY_KEY.dashboard[0]];
  }
  return base;
}

export interface AiContextSourceData {
  role: AiRoleScope;
  activeModule: string;
  userUid: string;
  linkedStudentId?: string;
  activeTenant: TenantRecord | null;
  // Institute-scoped arrays
  students: Student[];
  courses: Course[];
  enrollments: Enrollment[];
  installments: PaymentInstallment[];
  payments: Payment[];
  chapaTransactions: ChapaTransaction[];
  receipts: Receipt[];
  expenses: Expense[];
  attendance: AttendanceRecord[];
  staffRecords: StaffRecord[];
  staffCompensations: StaffCompensation[];
  // Platform-wide arrays (ONLY read when role === 'SUPER_ADMIN')
  tenants?: TenantRecord[];
  platformSubscriptions?: PlatformSubscription[];
  platformPayments?: PlatformPayment[];
  supportTickets?: SupportTicket[];
  allPlatformStudents?: Student[];
  allPlatformStaffRecords?: StaffRecord[];
  allPlatformAiUsageLogs?: AiUsageLogRecord[];
  attachedFileExcerpt?: { fileName: string; content: string } | null;
}

function detectDuplicatePaymentFlags(payments: Payment[]) {
  const buckets = new Map<string, Payment[]>();
  for (const p of payments) {
    if (p.status === 'REJECTED') continue;
    const key = `${p.studentId}|${p.amountEtb}|${(p.paymentDate || '').slice(0, 10)}`;
    const list = buckets.get(key) || [];
    list.push(p);
    buckets.set(key, list);
  }
  const flags: Array<{
    studentName: string;
    amountEtb: number;
    paymentDate: string;
    count: number;
    references: string[];
  }> = [];
  buckets.forEach((list) => {
    if (list.length > 1) {
      flags.push({
        studentName: list[0].studentName,
        amountEtb: list[0].amountEtb,
        paymentDate: list[0].paymentDate,
        count: list.length,
        references: list.map((x) => x.transactionRef).slice(0, 5),
      });
    }
  });
  return flags.slice(0, 15);
}

/**
 * Builds the MINIMUM strictly authorized JSON context for the active user's role & module.
 * This client-side scoping is paired with independent server-side verification & sanitization
 * in `/server/aiAuthGuard.ts`.
 */
export function buildAuthorizedAiContext(data: AiContextSourceData): Record<string, unknown> {
  const { role, activeModule, activeTenant, attachedFileExcerpt } = data;
  const currency = activeTenant?.currency || 'ETB';
  const instituteInfo = {
    name: activeTenant?.name || 'ZACMA Technology Training Institute',
    currency,
    academicYear: activeTenant?.academicYear || '2025/2026',
    status: activeTenant?.status || 'ACTIVE',
  };

  const fileBlock = attachedFileExcerpt
    ? {
        attachedFileExcerpt: {
          fileName: attachedFileExcerpt.fileName.slice(0, 120),
          content: attachedFileExcerpt.content.slice(0, 4500),
        },
      }
    : {};

  // 1. SUPER ADMIN (Platform-Wide SaaS Owner)
  if (role === 'SUPER_ADMIN') {
    const tenants = data.tenants || [];
    const subs = data.platformSubscriptions || [];
    const platPays = data.platformPayments || [];
    const tickets = data.supportTickets || [];
    const aiLogs = data.allPlatformAiUsageLogs || [];
    const totalPlatformRevenue = platPays
      .filter((p) => p.status === 'COMPLETED')
      .reduce((s, p) => s + p.amountEtb, 0);
    const mrr = tenants
      .filter((t) => t.status === 'ACTIVE')
      .reduce((s, t) => s + (t.monthlyPriceEtb || 0), 0);
    const totalTokens = aiLogs.reduce((s, l) => s + (l.totalTokens || 0), 0);
    const totalAiCostUsd = Number(
      aiLogs.reduce((s, l) => s + (l.estimatedCostUsd || 0), 0).toFixed(4)
    );

    return {
      scope: 'ZACMA_SUPER_ADMIN_PLATFORM',
      activeModule,
      platformSummary: {
        totalInstitutes: tenants.length,
        activeInstitutes: tenants.filter((t) => t.status === 'ACTIVE').length,
        trialInstitutes: tenants.filter((t) => t.status === 'TRIAL').length,
        suspendedInstitutes: tenants.filter((t) => t.status === 'SUSPENDED').length,
        expiredInstitutes: tenants.filter((t) => t.status === 'EXPIRED').length,
        totalStudentsAcrossPlatform: (data.allPlatformStudents || []).length,
        totalStaffAcrossPlatform: (data.allPlatformStaffRecords || []).length,
        estimatedMrrEtb: mrr,
        totalCollectedPlatformRevenueEtb: totalPlatformRevenue,
      },
      institutesSummary: tenants.slice(0, 25).map((t) => ({
        tenantId: t.tenantId,
        name: t.name,
        status: t.status,
        planName: t.planName,
        expiresAt: t.subscriptionExpiresAt,
        aiRequestsUsed: t.aiRequestsUsed,
        aiMonthlyQuota: t.aiMonthlyQuota,
      })),
      subscriptionsSummary: {
        total: subs.length,
        active: subs.filter((s) => s.status === 'ACTIVE').length,
        trial: subs.filter((s) => s.status === 'TRIAL').length,
        overdueOrExpired: subs.filter((s) => s.status === 'OVERDUE' || s.status === 'EXPIRED').length,
      },
      aiUsageSummary: {
        loggedRequests: aiLogs.length,
        totalTokens,
        estimatedCostUsd: totalAiCostUsd,
      },
      supportTicketsSummary: {
        open: tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
        urgent: tickets.filter((t) => t.priority === 'URGENT' && t.status !== 'CLOSED').length,
      },
      ...fileBlock,
    };
  }

  // 2. STUDENT (Own Linked Student Record ONLY)
  if (role === 'STUDENT') {
    const sid = data.linkedStudentId;
    const me = data.students.find((s) => s.id === sid);
    const myEnrollments = data.enrollments.filter((e) => e.studentId === sid);
    const myInstallments = data.installments.filter((i) => i.studentId === sid);
    const myPayments = data.payments.filter((p) => p.studentId === sid);
    const myReceipts = data.receipts.filter((r) => r.studentId === sid);
    const myAttendance = data.attendance.filter((a) => a.studentId === sid);

    return {
      scope: 'STUDENT_SELF_ONLY',
      activeModule,
      instituteInfo,
      myStudentProfile: me
        ? {
            id: me.id,
            studentId: me.studentId,
            fullName: me.fullName,
            registrationStatus: me.registrationStatus,
          }
        : null,
      myEnrollments: myEnrollments.map((e) => ({
        studentId: e.studentId,
        courseName: e.courseName,
        totalFeeEtb: e.totalFeeEtb,
        amountPaidEtb: e.amountPaidEtb,
        pendingAmountEtb: e.pendingAmountEtb,
        remainingBalanceEtb: e.remainingBalanceEtb,
        status: e.status,
      })),
      myInstallments: myInstallments.slice(0, 20).map((i) => ({
        studentId: i.studentId,
        courseName: i.courseName,
        label: i.label,
        dueDate: i.dueDate,
        amountEtb: i.amountEtb,
        paidAmountEtb: i.paidAmountEtb,
        status: i.status,
      })),
      myPayments: myPayments.slice(0, 20).map((p) => ({
        studentId: p.studentId,
        courseName: p.courseName,
        amountEtb: p.amountEtb,
        method: p.method,
        status: p.status,
        paymentDate: p.paymentDate,
        receiptNumber: p.receiptNumber,
      })),
      myReceipts: myReceipts.slice(0, 15).map((r) => ({
        studentId: r.studentId,
        receiptNumber: r.receiptNumber,
        amountEtb: r.amountEtb,
        courseName: r.courseName,
        approvedAt: r.approvedAt,
      })),
      myAttendance: myAttendance.slice(0, 30).map((a) => ({
        studentId: a.studentId,
        courseName: a.courseName,
        date: a.date,
        status: a.status,
      })),
      ...fileBlock,
    };
  }

  // 3. INSTRUCTOR (Assigned Courses & Non-Financial Student/Attendance ONLY)
  if (role === 'INSTRUCTOR') {
    const myCourses = data.courses.filter((c) => c.instructorId === data.userUid);
    const effectiveCourses = myCourses.length > 0 ? myCourses : data.courses.filter((c) => c.isActive);
    const courseIds = new Set(effectiveCourses.map((c) => c.id));
    const classEnrollments = data.enrollments.filter((e) => courseIds.has(e.courseId));
    const classStudentIds = new Set(classEnrollments.map((e) => e.studentId));
    const classAttendance = data.attendance.filter((a) => courseIds.has(a.courseId));

    const presentCount = classAttendance.filter((a) => a.status === 'PRESENT').length;
    const absentCount = classAttendance.filter((a) => a.status === 'ABSENT').length;
    const lateCount = classAttendance.filter((a) => a.status === 'LATE').length;

    return {
      scope: 'INSTRUCTOR_ACADEMIC_ONLY',
      activeModule,
      instituteInfo,
      assignedCourses: effectiveCourses.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        durationWeeks: c.durationWeeks,
        enrolledCount: classEnrollments.filter((e) => e.courseId === c.id).length,
      })),
      assignedStudents: data.students
        .filter((s) => classStudentIds.has(s.id))
        .slice(0, 40)
        .map((s) => ({
          studentId: s.studentId,
          fullName: s.fullName,
          status: s.registrationStatus,
        })),
      assignedAttendanceSummary: {
        totalRecords: classAttendance.length,
        presentCount,
        absentCount,
        lateCount,
        attendanceRatePercent:
          classAttendance.length > 0 ? Math.round((presentCount / classAttendance.length) * 100) : 0,
      },
      ...fileBlock,
    };
  }

  // 4. RECEPTIONIST (Front-desk courses & non-financial student directory)
  if (role === 'RECEPTIONIST') {
    return {
      scope: 'RECEPTIONIST_ADMISSIONS_ONLY',
      activeModule,
      instituteInfo,
      coursesCatalog: data.courses
        .filter((c) => c.isActive)
        .map((c) => ({
          code: c.code,
          name: c.name,
          durationWeeks: c.durationWeeks,
          standardFeeEtb: c.standardFeeEtb,
        })),
      studentDirectory: data.students.slice(0, 40).map((s) => ({
        studentId: s.studentId,
        fullName: s.fullName,
        phone: s.phone,
        registrationStatus: s.registrationStatus,
      })),
      pendingRegistrationsCount: data.students.filter((s) => s.registrationStatus === 'PENDING').length,
      ...fileBlock,
    };
  }

  // 5. HR OFFICER (Staff directory & departments; NO salaries, NO student finance)
  if (role === 'HR_OFFICER') {
    const deptCounts: Record<string, number> = {};
    for (const s of data.staffRecords) {
      const dept = s.department || 'General';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    }
    return {
      scope: 'HR_OFFICER_STAFF_ONLY',
      activeModule,
      instituteInfo,
      staffDirectorySummary: data.staffRecords.slice(0, 40).map((s) => ({
        staffId: s.staffId,
        fullName: s.fullName,
        roleTitle: s.roleTitle,
        department: s.department,
        employmentType: s.employmentType,
        approvalStatus: s.approvalStatus,
      })),
      pendingStaffRegistrations: data.staffRecords.filter((s) => s.approvalStatus === 'PENDING').length,
      departmentBreakdown: deptCounts,
      ...fileBlock,
    };
  }

  // 6. GENERAL STAFF (Non-financial directory & courses)
  if (role === 'GENERAL_STAFF') {
    return {
      scope: 'GENERAL_STAFF_OPERATIONS_ONLY',
      activeModule,
      instituteInfo,
      coursesCatalog: data.courses.map((c) => ({
        code: c.code,
        name: c.name,
        durationWeeks: c.durationWeeks,
      })),
      studentDirectory: data.students.slice(0, 30).map((s) => ({
        studentId: s.studentId,
        fullName: s.fullName,
        registrationStatus: s.registrationStatus,
      })),
      attendanceSummary: {
        totalRecords: data.attendance.length,
        present: data.attendance.filter((a) => a.status === 'PRESENT').length,
        absent: data.attendance.filter((a) => a.status === 'ABSENT').length,
      },
      ...fileBlock,
    };
  }

  // Shared authorized financial metrics for ACCOUNTANT, MANAGER, ADMIN
  const approvedPayments = data.payments.filter((p) => p.status === 'APPROVED');
  const pendingPayments = data.payments.filter((p) => p.status === 'PENDING');
  const approvedRevenue = approvedPayments.reduce((s, p) => s + p.amountEtb, 0);
  const pendingAmount = pendingPayments.reduce((s, p) => s + p.amountEtb, 0);
  const totalExpenses = data.expenses.reduce((s, e) => s + e.amountEtb, 0);
  const outstandingBalance = data.enrollments
    .filter((e) => e.status === 'ACTIVE' || e.status === 'COMPLETED')
    .reduce((s, e) => s + Math.max(0, e.remainingBalanceEtb), 0);
  const overdueInstallments = data.installments.filter((i) => i.status === 'OVERDUE');

  const expenseByCategory: Record<string, number> = {};
  for (const exp of data.expenses) {
    expenseByCategory[exp.categoryName] = (expenseByCategory[exp.categoryName] || 0) + exp.amountEtb;
  }

  const overdueStudentsList = overdueInstallments.slice(0, 20).map((i) => ({
    studentName: i.studentName,
    courseName: i.courseName,
    dueDate: i.dueDate,
    unpaidAmount: Math.max(0, i.amountEtb - i.paidAmountEtb),
  }));

  const duplicatePaymentFlags = detectDuplicatePaymentFlags(data.payments);

  const chapaSummary = {
    totalTransactions: data.chapaTransactions.length,
    pendingVerification: data.chapaTransactions.filter(
      (t) => t.gatewayStatus === 'SUCCESS' && t.approvalStatus === 'PENDING_APPROVAL'
    ).length,
    approvedTotal: data.chapaTransactions
      .filter((t) => t.approvalStatus === 'APPROVED')
      .reduce((s, t) => s + t.amountEtb, 0),
  };

  // 7. ACCOUNTANT (Institute Financial Data — NO HR salaries, NO Super Admin)
  if (role === 'ACCOUNTANT') {
    return {
      scope: 'ACCOUNTANT_INSTITUTE_FINANCE',
      activeModule,
      instituteInfo,
      financialSummary: {
        currency,
        approvedRevenue,
        pendingPaymentsAmount: pendingAmount,
        pendingPaymentsCount: pendingPayments.length,
        totalExpenses,
        netIncome: approvedRevenue - totalExpenses,
        totalOutstandingBalances: outstandingBalance,
        overdueInstallmentsCount: overdueInstallments.length,
      },
      expensesSummary: { totalExpenses, byCategory: expenseByCategory },
      overdueStudents: overdueStudentsList,
      pendingApprovals: {
        pendingPaymentsCount: pendingPayments.length,
        sample: pendingPayments.slice(0, 10).map((p) => ({
          studentName: p.studentName,
          amountEtb: p.amountEtb,
          method: p.method,
          paymentDate: p.paymentDate,
        })),
      },
      chapaSummary,
      duplicatePaymentFlags,
      coursesSummary: data.courses.map((c) => ({
        name: c.name,
        standardFeeEtb: c.standardFeeEtb,
        enrolledCount: data.enrollments.filter((e) => e.courseId === c.id).length,
      })),
      ...fileBlock,
    };
  }

  // 8. MANAGER & 9. ADMIN (Full Own-Institute Management; Admin includes optional staff compensation aggregate)
  const presentAtt = data.attendance.filter((a) => a.status === 'PRESENT').length;
  const baseExecContext: Record<string, unknown> = {
    scope: role === 'ADMIN' ? 'ADMIN_FULL_INSTITUTE' : 'MANAGER_INSTITUTE_OPERATIONS',
    activeModule,
    instituteInfo,
    dashboardMetrics: {
      totalStudents: data.students.length,
      approvedStudents: data.students.filter((s) => s.registrationStatus === 'APPROVED').length,
      pendingStudents: data.students.filter((s) => s.registrationStatus === 'PENDING').length,
      activeCourses: data.courses.filter((c) => c.isActive).length,
      activeStaff: data.staffRecords.filter((s) => s.approvalStatus === 'APPROVED').length,
    },
    financialSummary: {
      currency,
      approvedRevenue,
      pendingPaymentsAmount: pendingAmount,
      pendingPaymentsCount: pendingPayments.length,
      totalExpenses,
      netIncome: approvedRevenue - totalExpenses,
      totalOutstandingBalances: outstandingBalance,
      overdueInstallmentsCount: overdueInstallments.length,
    },
    expensesSummary: { totalExpenses, byCategory: expenseByCategory },
    overdueStudents: overdueStudentsList,
    pendingApprovals: {
      pendingStudents: data.students.filter((s) => s.registrationStatus === 'PENDING').length,
      pendingPayments: pendingPayments.length,
      pendingStaff: data.staffRecords.filter((s) => s.approvalStatus === 'PENDING').length,
    },
    chapaSummary,
    duplicatePaymentFlags,
    coursesSummary: data.courses.map((c) => ({
      code: c.code,
      name: c.name,
      standardFeeEtb: c.standardFeeEtb,
      enrolledCount: data.enrollments.filter((e) => e.courseId === c.id).length,
    })),
    attendanceSummary: {
      totalRecords: data.attendance.length,
      presentCount: presentAtt,
      absentCount: data.attendance.filter((a) => a.status === 'ABSENT').length,
      attendanceRatePercent:
        data.attendance.length > 0 ? Math.round((presentAtt / data.attendance.length) * 100) : 0,
    },
    staffDirectorySummary: {
      total: data.staffRecords.length,
      approved: data.staffRecords.filter((s) => s.approvalStatus === 'APPROVED').length,
      pending: data.staffRecords.filter((s) => s.approvalStatus === 'PENDING').length,
    },
    ...fileBlock,
  };

  if (role === 'ADMIN' && data.staffCompensations.length > 0) {
    baseExecContext.staffCompensationSummary = {
      configuredStaffCount: data.staffCompensations.length,
      totalMonthlyBasePayroll: data.staffCompensations.reduce(
        (s, c) => s + (c.baseSalaryAmount || 0),
        0
      ),
    };
  }

  return baseExecContext;
}
