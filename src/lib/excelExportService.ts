import * as XLSX from 'xlsx';
import {
  ChapaTransaction,
  Course,
  Expense,
  FinancialAdjustment,
  Payment,
  PaymentMethod,
  StudentPaymentCategory,
} from '../types/zacma';
import {
  computeCoursePerformance,
  computeInstitutionalFinanceSummary,
  computeMonthlyFinancialTrends,
  StudentFinancialRow,
} from './financeAnalytics';
import { formatAddisDateTimeDual, formatEthiopianDate, todayAddisIsoDate } from './ethiopianCalendar';

export type ExcelReportKey =
  | 'ALL_STUDENTS'
  | 'FULLY_PAID'
  | 'PARTIALLY_PAID'
  | 'UNPAID'
  | 'OVERDUE'
  | 'MONTHLY_COLLECTIONS'
  | 'COURSE_BASED'
  | 'COMPLETE_FINANCIAL'
  | 'INSTITUTIONAL_EXPENSES'
  | 'INSTITUTIONAL_ACCOUNTING'
  | 'CHAPA_ALL'
  | 'CHAPA_VERIFIED'
  | 'CHAPA_PENDING_APPROVAL'
  | 'CHAPA_APPROVED'
  | 'CHAPA_REJECTED'
  | 'CHAPA_FAILED'
  | 'CHAPA_MONTHLY'
  | 'CHAPA_STUDENT_HISTORY';

export interface ExcelExportFilters {
  registrationDateFrom?: string;
  registrationDateTo?: string;
  paymentDateFrom?: string;
  paymentDateTo?: string;
  specificMonth?: string; // YYYY-MM
  courseId?: string;
  instructorId?: string;
  paymentStatus?: 'ALL' | StudentPaymentCategory;
  paymentMethod?: 'ALL' | PaymentMethod;
}

export interface ExcelExportContext {
  studentRows: StudentFinancialRow[];
  payments: Payment[];
  chapaTransactions?: ChapaTransaction[];
  expenses: Expense[];
  adjustments: FinancialAdjustment[];
  courses: Course[];
  generatedBy: string;
  filters: ExcelExportFilters;
}

export interface ExcelWorkbookResult {
  fileName: string;
  reportTitle: string;
  rowCount: number;
  filterSummary: string;
  sheetNames: string[];
  workbook: XLSX.WorkBook;
}

const ETB_NUM_FMT = '#,##0.00 "ETB"';

export function describeActiveFilters(filters: ExcelExportFilters, courses: Course[]): string {
  const parts: string[] = [];
  if (filters.registrationDateFrom || filters.registrationDateTo) {
    parts.push(
      `Reg Date: ${filters.registrationDateFrom || 'Start'} to ${filters.registrationDateTo || 'Today'}`
    );
  }
  if (filters.paymentDateFrom || filters.paymentDateTo) {
    parts.push(
      `Pay Date: ${filters.paymentDateFrom || 'Start'} to ${filters.paymentDateTo || 'Today'}`
    );
  }
  if (filters.specificMonth) {
    parts.push(`Month: ${filters.specificMonth}`);
  }
  if (filters.courseId && filters.courseId !== 'ALL') {
    const c = courses.find((item) => item.id === filters.courseId);
    parts.push(`Course: ${c ? c.name : filters.courseId}`);
  }
  if (filters.instructorId && filters.instructorId !== 'ALL') {
    parts.push(`Instructor: ${filters.instructorId}`);
  }
  if (filters.paymentStatus && filters.paymentStatus !== 'ALL') {
    parts.push(`Status: ${filters.paymentStatus.replace('_', ' ')}`);
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
    parts.push(`Method: ${filters.paymentMethod}`);
  }
  return parts.length > 0 ? parts.join(' | ') : 'All Institutional Records (Unfiltered)';
}

export function applyExportFilters(ctx: ExcelExportContext) {
  const f = ctx.filters;

  const filteredStudents = ctx.studentRows.filter((row) => {
    if (row.registrationStatus === 'REJECTED') return false;
    if (f.registrationDateFrom && row.registrationDate < f.registrationDateFrom) return false;
    if (f.registrationDateTo && row.registrationDate > f.registrationDateTo) return false;
    if (f.courseId && f.courseId !== 'ALL' && row.courseId !== f.courseId) return false;
    if (f.instructorId && f.instructorId !== 'ALL') {
      const matchId = row.instructorId === f.instructorId;
      const matchName = row.instructorName === f.instructorId;
      if (!matchId && !matchName) return false;
    }
    if (f.paymentStatus && f.paymentStatus !== 'ALL') {
      if (f.paymentStatus === 'OVERDUE' && !row.isOverdue) return false;
      if (f.paymentStatus !== 'OVERDUE' && row.progressBucket !== f.paymentStatus) return false;
    }
    if (f.paymentMethod && f.paymentMethod !== 'ALL') {
      if (!row.paymentMethodsUsed.includes(f.paymentMethod)) return false;
    }
    if (f.specificMonth) {
      const regMatch = row.registrationDate.startsWith(f.specificMonth);
      const payMatch = row.paymentDates.some((d) => d.startsWith(f.specificMonth!));
      if (!regMatch && !payMatch) return false;
    }
    if (f.paymentDateFrom || f.paymentDateTo) {
      const hasPayInRange = row.paymentDates.some((d) => {
        if (f.paymentDateFrom && d < f.paymentDateFrom) return false;
        if (f.paymentDateTo && d > f.paymentDateTo) return false;
        return true;
      });
      if (!hasPayInRange) return false;
    }
    return true;
  });

  const matchedStudentIds = new Set(filteredStudents.map((s) => s.studentId));

  const filteredPayments = ctx.payments.filter((p) => {
    if (f.courseId && f.courseId !== 'ALL' && p.courseId !== f.courseId) return false;
    if (f.paymentMethod && f.paymentMethod !== 'ALL' && p.paymentMethod !== f.paymentMethod) {
      return false;
    }
    if (f.paymentDateFrom && p.paymentDate < f.paymentDateFrom) return false;
    if (f.paymentDateTo && p.paymentDate > f.paymentDateTo) return false;
    if (f.specificMonth && !p.paymentDate.startsWith(f.specificMonth)) return false;
    if (
      (f.instructorId && f.instructorId !== 'ALL') ||
      (f.paymentStatus && f.paymentStatus !== 'ALL') ||
      f.registrationDateFrom ||
      f.registrationDateTo
    ) {
      if (!matchedStudentIds.has(p.studentId)) return false;
    }
    return true;
  });

  const filteredExpenses = ctx.expenses.filter((e) => {
    if (f.paymentMethod && f.paymentMethod !== 'ALL' && e.paymentMethod !== f.paymentMethod) {
      return false;
    }
    if (f.paymentDateFrom && e.expenseDate < f.paymentDateFrom) return false;
    if (f.paymentDateTo && e.expenseDate > f.paymentDateTo) return false;
    if (f.specificMonth && !e.expenseDate.startsWith(f.specificMonth)) return false;
    return true;
  });

  const filteredAdjustments = ctx.adjustments.filter((a) => {
    if (f.courseId && f.courseId !== 'ALL' && a.courseId !== f.courseId) return false;
    if (f.paymentDateFrom && a.effectiveDate < f.paymentDateFrom) return false;
    if (f.paymentDateTo && a.effectiveDate > f.paymentDateTo) return false;
    if (f.specificMonth && !a.effectiveDate.startsWith(f.specificMonth)) return false;
    return true;
  });

  const filteredChapa = (ctx.chapaTransactions || []).filter((t) => {
    const txDate = (t.paymentDate || t.createdAt || '').slice(0, 10);
    if (f.courseId && f.courseId !== 'ALL' && t.courseId !== f.courseId) return false;
    if (f.paymentDateFrom && txDate < f.paymentDateFrom) return false;
    if (f.paymentDateTo && txDate > f.paymentDateTo) return false;
    if (f.specificMonth && !txDate.startsWith(f.specificMonth)) return false;
    if (
      (f.instructorId && f.instructorId !== 'ALL') ||
      (f.paymentStatus && f.paymentStatus !== 'ALL') ||
      f.registrationDateFrom ||
      f.registrationDateTo
    ) {
      if (!matchedStudentIds.has(t.studentId)) return false;
    }
    return true;
  });

  return {
    filteredStudents,
    filteredPayments,
    filteredChapa,
    filteredExpenses,
    filteredAdjustments,
  };
}

function buildInstitutionalSheet(options: {
  reportTitle: string;
  generatedBy: string;
  filterSummary: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  currencyCols?: number[]; // 0-indexed column indexes formatted as ETB
  sumCols?: number[]; // 0-indexed column indexes with Excel =SUM(...) total row
}): XLSX.WorkSheet {
  const generatedDual = formatAddisDateTimeDual(new Date().toISOString());
  const colCount = Math.max(options.headers.length, 4);

  const aoa: Array<Array<string | number>> = [
    ['ZACMA TECHNOLOGY & TRAINING INSTITUTE — ENTERPRISE EDUCATIONAL FINANCE PLATFORM'],
    [options.reportTitle],
    [`Generated: ${generatedDual} (Africa/Addis_Ababa)`, `Prepared By: ${options.generatedBy}`],
    [`Active Filters: ${options.filterSummary}`],
    [], // Blank spacer row (row 5 in 1-based Excel)
    options.headers, // Row 6 (index 5)
    ...options.rows,
  ];

  const headerRowIdx = 5; // 0-based
  const dataStartIdx = 6; // 0-based
  const dataEndIdx = dataStartIdx + options.rows.length - 1;

  // Append Excel formula Totals row if sumCols provided and there is at least 1 row
  if (options.sumCols && options.sumCols.length > 0 && options.rows.length > 0) {
    const totalsRow: Array<string | number> = new Array(options.headers.length).fill('');
    totalsRow[0] = `TOTAL (${options.rows.length} Records)`;
    aoa.push(totalsRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge institutional banner rows across table width
  const lastCol = colCount - 1;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } },
  ];

  // Auto-filter on table headers
  if (options.rows.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: headerRowIdx, c: 0 },
        e: { r: dataEndIdx, c: options.headers.length - 1 },
      }),
    };
  }

  // Apply ETB currency formatting to data cells
  const currencySet = new Set(options.currencyCols || []);
  for (let r = dataStartIdx; r <= dataEndIdx; r++) {
    for (const c of currencySet) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr] && typeof ws[addr].v === 'number') {
        ws[addr].z = ETB_NUM_FMT;
      }
    }
  }

  // Inject real Excel =SUM(...) formulas in Totals row
  if (options.sumCols && options.sumCols.length > 0 && options.rows.length > 0) {
    const totalsRowIdx = dataEndIdx + 1;
    for (const c of options.sumCols) {
      const colLetter = XLSX.utils.encode_col(c);
      const startExcelRow = dataStartIdx + 1;
      const endExcelRow = dataEndIdx + 1;
      const totalVal = options.rows.reduce((sum, row) => sum + Number(row[c] || 0), 0);
      const addr = XLSX.utils.encode_cell({ r: totalsRowIdx, c });
      ws[addr] = {
        t: 'n',
        v: Number(totalVal.toFixed(2)),
        f: `SUM(${colLetter}${startExcelRow}:${colLetter}${endExcelRow})`,
        z: currencySet.has(c) ? ETB_NUM_FMT : '#,##0',
      };
    }
  }

  // Auto-fit column widths cleanly
  ws['!cols'] = options.headers.map((header, idx) => {
    let maxLen = header.length + 4;
    for (const row of options.rows) {
      const val = row[idx];
      const str = typeof val === 'number' ? `ETB ${val.toLocaleString()}` : String(val ?? '');
      if (str.length + 3 > maxLen) maxLen = str.length + 3;
    }
    return { wch: Math.min(46, Math.max(12, maxLen)) };
  });

  return ws;
}

function buildStudentSheetRows(
  mode: 'ALL' | 'FULLY_PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE',
  rows: StudentFinancialRow[]
): {
  headers: string[];
  data: Array<Array<string | number>>;
  currencyCols: number[];
  sumCols: number[];
} {
  if (mode === 'FULLY_PAID') {
    return {
      headers: [
        'Student ID',
        'Student Name',
        'Phone Number',
        'Course',
        'Total Course Fee (ETB)',
        'Total Amount Paid (ETB)',
        'Remaining Balance (ETB)',
        'Registration Date (Gregorian)',
        'Registration Date (Ethiopian)',
        'Last Payment Date',
        'Payment Status',
      ],
      currencyCols: [4, 5, 6],
      sumCols: [4, 5, 6],
      data: rows.map((r) => [
        r.studentCode,
        r.fullName,
        r.phone,
        r.courseName,
        r.totalCourseFeeEtb,
        r.netPaidEtb,
        r.remainingBalanceEtb,
        r.registrationDate,
        r.registrationDateEthiopian,
        r.lastPaymentDate || '—',
        'Fully Paid',
      ]),
    };
  }

  if (mode === 'PARTIALLY_PAID') {
    return {
      headers: [
        'Student ID',
        'Student Name',
        'Phone Number',
        'Course',
        'Total Course Fee (ETB)',
        'Amount Paid (ETB)',
        'Outstanding Balance (ETB)',
        'Next Payment Deadline',
        'Payment History Summary',
      ],
      currencyCols: [4, 5, 6],
      sumCols: [4, 5, 6],
      data: rows.map((r) => [
        r.studentCode,
        r.fullName,
        r.phone,
        r.courseName,
        r.totalCourseFeeEtb,
        r.netPaidEtb,
        r.remainingBalanceEtb,
        r.nextDeadline ? `${r.nextDeadline} (${formatEthiopianDate(r.nextDeadline)})` : '—',
        r.paymentHistorySummary,
      ]),
    };
  }

  if (mode === 'UNPAID') {
    return {
      headers: [
        'Student ID',
        'Student Name',
        'Phone Number',
        'Course',
        'Total Course Fee (ETB)',
        'Amount Paid (ETB)',
        'Outstanding Balance (ETB)',
        'Registration Date (Gregorian)',
        'Registration Date (Ethiopian)',
        'Payment Deadline',
      ],
      currencyCols: [4, 5, 6],
      sumCols: [4, 5, 6],
      data: rows.map((r) => [
        r.studentCode,
        r.fullName,
        r.phone,
        r.courseName,
        r.totalCourseFeeEtb,
        r.netPaidEtb,
        r.remainingBalanceEtb,
        r.registrationDate,
        r.registrationDateEthiopian,
        r.nextDeadline ? `${r.nextDeadline} (${formatEthiopianDate(r.nextDeadline)})` : '—',
      ]),
    };
  }

  if (mode === 'OVERDUE') {
    return {
      headers: [
        'Student ID',
        'Student Name',
        'Phone Number',
        'Course',
        'Total Course Fee (ETB)',
        'Amount Paid (ETB)',
        'Outstanding Balance (ETB)',
        'Days Overdue',
        'Last Payment Date',
        'Payment Status',
      ],
      currencyCols: [4, 5, 6],
      sumCols: [4, 5, 6],
      data: rows.map((r) => [
        r.studentCode,
        r.fullName,
        r.phone,
        r.courseName,
        r.totalCourseFeeEtb,
        r.netPaidEtb,
        r.remainingBalanceEtb,
        r.daysOverdue,
        r.lastPaymentDate || 'No payment recorded',
        'Overdue',
      ]),
    };
  }

  return {
    headers: [
      'Student ID',
      'Student Name',
      'Phone Number',
      'Course',
      'Instructor',
      'Registration Status',
      'Registration Date (Gregorian)',
      'Registration Date (Ethiopian)',
      'Total Course Fee (ETB)',
      'Net Paid (ETB)',
      'Remaining Balance (ETB)',
      'Payment Category',
      'Days Overdue',
      'Last Payment Date',
    ],
    currencyCols: [8, 9, 10],
    sumCols: [8, 9, 10],
    data: rows.map((r) => [
      r.studentCode,
      r.fullName,
      r.phone,
      r.courseName,
      r.instructorName,
      r.registrationStatus,
      r.registrationDate,
      r.registrationDateEthiopian,
      r.totalCourseFeeEtb,
      r.netPaidEtb,
      r.remainingBalanceEtb,
      r.paymentCategory.replace('_', ' '),
      r.daysOverdue,
      r.lastPaymentDate || '—',
    ]),
  };
}

export function generateExcelWorkbook(
  reportKey: ExcelReportKey,
  ctx: ExcelExportContext
): ExcelWorkbookResult {
  const today = todayAddisIsoDate();
  const filterSummary = describeActiveFilters(ctx.filters, ctx.courses);
  const {
    filteredStudents,
    filteredPayments,
    filteredChapa,
    filteredExpenses,
    filteredAdjustments,
  } = applyExportFilters(ctx);

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: `ZACMA Financial Report — ${reportKey}`,
    Subject: 'Enterprise Educational Finance Report',
    Author: ctx.generatedBy,
    Company: 'ZACMA Technology & Training Institute',
    CreatedDate: new Date(),
  };

  const fullyPaidRows = filteredStudents.filter((r) => r.progressBucket === 'FULLY_PAID');
  const partiallyPaidRows = filteredStudents.filter((r) => r.progressBucket === 'PARTIALLY_PAID');
  const unpaidRows = filteredStudents.filter((r) => r.progressBucket === 'UNPAID');
  const overdueRows = filteredStudents.filter((r) => r.isOverdue);
  const approvedPayments = filteredPayments.filter((p) => p.status === 'APPROVED');

  const summary = computeInstitutionalFinanceSummary({
    studentRows: filteredStudents,
    payments: filteredPayments,
    expenses: filteredExpenses,
    adjustments: filteredAdjustments,
  });

  const addSheet = (name: string, ws: XLSX.WorkSheet) => {
    const safeName = name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ');
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  };

  let reportTitle = 'ZACMA Institutional Financial Report';
  let fileSlug = 'financial-report';
  let rowCount = 0;

  if (reportKey === 'ALL_STUDENTS') {
    reportTitle = 'All Students Financial Roster';
    fileSlug = 'all-students-financial-roster';
    const spec = buildStudentSheetRows('ALL', filteredStudents);
    addSheet(
      'All Students',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: spec.headers,
        rows: spec.data,
        currencyCols: spec.currencyCols,
        sumCols: spec.sumCols,
      })
    );
    rowCount = spec.data.length;
  } else if (reportKey === 'FULLY_PAID') {
    reportTitle = 'Fully Paid Students Report';
    fileSlug = 'fully-paid-students';
    const spec = buildStudentSheetRows('FULLY_PAID', fullyPaidRows);
    addSheet(
      'Fully Paid Students',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: spec.headers,
        rows: spec.data,
        currencyCols: spec.currencyCols,
        sumCols: spec.sumCols,
      })
    );
    rowCount = spec.data.length;
  } else if (reportKey === 'PARTIALLY_PAID') {
    reportTitle = 'Partially Paid Students Report';
    fileSlug = 'partially-paid-students';
    const spec = buildStudentSheetRows('PARTIALLY_PAID', partiallyPaidRows);
    addSheet(
      'Partially Paid Students',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: spec.headers,
        rows: spec.data,
        currencyCols: spec.currencyCols,
        sumCols: spec.sumCols,
      })
    );
    rowCount = spec.data.length;
  } else if (reportKey === 'UNPAID') {
    reportTitle = 'Unpaid Students Report';
    fileSlug = 'unpaid-students';
    const spec = buildStudentSheetRows('UNPAID', unpaidRows);
    addSheet(
      'Unpaid Students',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: spec.headers,
        rows: spec.data,
        currencyCols: spec.currencyCols,
        sumCols: spec.sumCols,
      })
    );
    rowCount = spec.data.length;
  } else if (reportKey === 'OVERDUE') {
    reportTitle = 'Overdue Students Delinquency Report';
    fileSlug = 'overdue-students';
    const spec = buildStudentSheetRows('OVERDUE', overdueRows);
    addSheet(
      'Overdue Students',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: spec.headers,
        rows: spec.data,
        currencyCols: spec.currencyCols,
        sumCols: spec.sumCols,
      })
    );
    rowCount = spec.data.length;
  } else if (reportKey === 'MONTHLY_COLLECTIONS') {
    reportTitle = 'Monthly Collections & Cash Flow Report';
    fileSlug = 'monthly-collections';
    const monthly = computeMonthlyFinancialTrends(
      filteredPayments,
      filteredExpenses,
      filteredAdjustments
    );
    addSheet(
      'Monthly Summary',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Month (YYYY-MM)',
          'Label',
          'Approved Payments Count',
          'Net Tuition Income (ETB)',
          'Refunds & Reversals (ETB)',
          'Institutional Expenses (ETB)',
          'Net Cash Flow (ETB)',
        ],
        rows: monthly.map((m) => [
          m.monthKey,
          m.monthLabel,
          m.paymentCount,
          m.incomeEtb,
          m.refundsEtb,
          m.expensesEtb,
          m.netEtb,
        ]),
        currencyCols: [3, 4, 5, 6],
        sumCols: [2, 3, 4, 5, 6],
      })
    );
    addSheet(
      'Approved Payments',
      buildInstitutionalSheet({
        reportTitle: 'Approved Payment Transactions Detail',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Transaction Ref',
          'Receipt No.',
          'Student ID',
          'Student Name',
          'Course',
          'Payment Date (Gregorian)',
          'Payment Date (Ethiopian)',
          'Method',
          'Amount (ETB)',
          'Recorded By',
          'Approved By',
        ],
        rows: approvedPayments.map((p) => [
          p.transactionRef,
          p.receiptNumber || '—',
          p.studentCode,
          p.studentName,
          p.courseName,
          p.paymentDate,
          formatEthiopianDate(p.paymentDate),
          p.paymentMethod,
          p.amountEtb,
          p.recordedByName,
          p.approvedByName || '—',
        ]),
        currencyCols: [8],
        sumCols: [8],
      })
    );
    rowCount = monthly.length + approvedPayments.length;
  } else if (reportKey === 'COURSE_BASED') {
    reportTitle = 'Course-Based Financial Performance Report';
    fileSlug = 'course-financial-performance';
    const coursePerf = computeCoursePerformance(ctx.courses, filteredStudents);
    addSheet(
      'Course Performance',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Course Code',
          'Course Name',
          'Instructor',
          'Students',
          'Fully Paid',
          'Partially Paid',
          'Unpaid',
          'Overdue',
          'Expected Tuition (ETB)',
          'Net Collected (ETB)',
          'Outstanding Balance (ETB)',
          'Collection Rate (%)',
        ],
        rows: coursePerf.map((c) => [
          c.courseCode,
          c.courseName,
          c.instructorName,
          c.studentCount,
          c.fullyPaidCount,
          c.partiallyPaidCount,
          c.unpaidCount,
          c.overdueCount,
          c.expectedFeeEtb,
          c.collectedEtb,
          c.outstandingEtb,
          c.collectionRatePercent,
        ]),
        currencyCols: [8, 9, 10],
        sumCols: [3, 4, 5, 6, 7, 8, 9, 10],
      })
    );
    rowCount = coursePerf.length;
  } else if (reportKey === 'INSTITUTIONAL_EXPENSES') {
    reportTitle = 'Institutional Expenses Ledger';
    fileSlug = 'institutional-expenses';
    addSheet(
      'Expenses Ledger',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Date (Gregorian)',
          'Date (Ethiopian)',
          'Category',
          'Title / Description',
          'Payment Method',
          'Reference No.',
          'Amount (ETB)',
          'Recorded By',
          'Notes',
        ],
        rows: filteredExpenses.map((e) => [
          e.expenseDate,
          formatEthiopianDate(e.expenseDate),
          e.categoryName,
          e.title,
          e.paymentMethod,
          e.referenceNo || '—',
          e.amountEtb,
          e.recordedByName,
          e.notes || '',
        ]),
        currencyCols: [6],
        sumCols: [6],
      })
    );
    rowCount = filteredExpenses.length;
  } else if (reportKey === 'INSTITUTIONAL_ACCOUNTING') {
    reportTitle = 'Institutional Accounting Statement & Ledger';
    fileSlug = 'institutional-accounting-statement';

    const acctRows: Array<Array<string | number>> = [
      ['Total Registered Students (Non-Rejected)', summary.totalRegisteredStudents, 'Students'],
      ['Total Active / Enrolled Students', summary.totalActiveStudents, 'Students'],
      ['Total Expected Student Fees (ETB)', summary.totalExpectedFeesEtb, 'Receivable Base'],
      ['Gross Approved Fee Collections (ETB)', summary.totalGrossApprovedPaymentsEtb, 'Inflow'],
      ['Refunds & Payment Reversals (ETB)', summary.totalRefundsAndReversalsEtb, 'Contra-Revenue'],
      ['Net Institutional Fee Income (ETB)', summary.totalInstitutionalIncomeEtb, 'Net Revenue'],
      ['Total Institutional Expenses (ETB)', summary.totalExpensesEtb, 'Operating Outflow'],
      ['Net Institutional Balance (ETB)', summary.netInstitutionalBalanceEtb, 'Net Surplus / Deficit'],
      ['Total Outstanding Student Receivables (ETB)', summary.totalOutstandingFeesEtb, 'Accounts Receivable'],
      ['Total Overdue Receivables (ETB)', summary.totalOverdueAmountEtb, 'Past-Due Receivable'],
      ['Collection Rate (%)', summary.collectionRatePercent, 'Performance KPI'],
    ];

    addSheet(
      'Accounting Statement',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: ['Financial Metric', 'Value', 'Classification'],
        rows: acctRows,
        currencyCols: [],
      })
    );

    addSheet(
      'Approved Collections',
      buildInstitutionalSheet({
        reportTitle: 'Approved Student Fee Collections',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Date (Gregorian)',
          'Date (Ethiopian)',
          'Ref',
          'Receipt',
          'Student ID',
          'Student Name',
          'Course',
          'Method',
          'Amount (ETB)',
        ],
        rows: approvedPayments.map((p) => [
          p.paymentDate,
          formatEthiopianDate(p.paymentDate),
          p.transactionRef,
          p.receiptNumber || '—',
          p.studentCode,
          p.studentName,
          p.courseName,
          p.paymentMethod,
          p.amountEtb,
        ]),
        currencyCols: [8],
        sumCols: [8],
      })
    );

    addSheet(
      'Refunds & Adjustments',
      buildInstitutionalSheet({
        reportTitle: 'Controlled Financial Refunds, Reversals & Adjustments',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Ref',
          'Effective Date',
          'Type',
          'Student ID',
          'Student Name',
          'Course',
          'Amount (ETB)',
          'Reason',
          'Approved By',
        ],
        rows: filteredAdjustments.map((a) => [
          a.adjustmentRef,
          a.effectiveDate,
          a.type,
          a.studentCode,
          a.studentName,
          a.courseName,
          a.amountEtb,
          a.reason,
          a.approvedByName,
        ]),
        currencyCols: [6],
        sumCols: [6],
      })
    );

    addSheet(
      'Expenses',
      buildInstitutionalSheet({
        reportTitle: 'Institutional Expenses',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: ['Date', 'Category', 'Title', 'Method', 'Reference', 'Amount (ETB)', 'Recorded By'],
        rows: filteredExpenses.map((e) => [
          e.expenseDate,
          e.categoryName,
          e.title,
          e.paymentMethod,
          e.referenceNo || '—',
          e.amountEtb,
          e.recordedByName,
        ]),
        currencyCols: [5],
        sumCols: [5],
      })
    );
    rowCount = approvedPayments.length + filteredAdjustments.length + filteredExpenses.length;
  } else if (
    reportKey === 'CHAPA_ALL' ||
    reportKey === 'CHAPA_VERIFIED' ||
    reportKey === 'CHAPA_PENDING_APPROVAL' ||
    reportKey === 'CHAPA_APPROVED' ||
    reportKey === 'CHAPA_REJECTED' ||
    reportKey === 'CHAPA_FAILED'
  ) {
    const filterMap: Record<
      | 'CHAPA_ALL'
      | 'CHAPA_VERIFIED'
      | 'CHAPA_PENDING_APPROVAL'
      | 'CHAPA_APPROVED'
      | 'CHAPA_REJECTED'
      | 'CHAPA_FAILED',
      { title: string; slug: string; sheet: string; list: ChapaTransaction[] }
    > = {
      CHAPA_ALL: {
        title: 'All Chapa Online Payment Transactions',
        slug: 'chapa-all-transactions',
        sheet: 'All Chapa Transactions',
        list: filteredChapa,
      },
      CHAPA_VERIFIED: {
        title: 'Chapa Verified Online Transactions',
        slug: 'chapa-verified-transactions',
        sheet: 'Verified Chapa',
        list: filteredChapa.filter((t) => t.paymentStatus === 'VERIFIED'),
      },
      CHAPA_PENDING_APPROVAL: {
        title: 'Chapa Transactions Pending Administrative Approval',
        slug: 'chapa-pending-approval',
        sheet: 'Pending Admin Approval',
        list: filteredChapa.filter(
          (t) => t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL'
        ),
      },
      CHAPA_APPROVED: {
        title: 'Chapa Approved Online Payments',
        slug: 'chapa-approved-payments',
        sheet: 'Approved Chapa',
        list: filteredChapa.filter((t) => t.approvalStatus === 'APPROVED'),
      },
      CHAPA_REJECTED: {
        title: 'Chapa Rejected Online Transactions',
        slug: 'chapa-rejected-transactions',
        sheet: 'Rejected Chapa',
        list: filteredChapa.filter((t) => t.approvalStatus === 'REJECTED'),
      },
      CHAPA_FAILED: {
        title: 'Chapa Failed & Cancelled Transactions',
        slug: 'chapa-failed-transactions',
        sheet: 'Failed Chapa',
        list: filteredChapa.filter(
          (t) => t.paymentStatus === 'FAILED' || t.paymentStatus === 'CANCELLED'
        ),
      },
    };
    const spec = filterMap[reportKey];
    reportTitle = spec.title;
    fileSlug = spec.slug;
    addSheet(
      spec.sheet,
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Transaction ID (tx_ref)',
          'Chapa Reference',
          'Student ID',
          'Student Name',
          'Course',
          'Amount (ETB)',
          'Currency',
          'Payment Method',
          'Source',
          'Gateway Status',
          'Approval Status',
          'Receipt Number',
          'Payment Date (Gregorian)',
          'Payment Date (Ethiopian)',
          'Recorded At',
          'Approved By',
          'Notes / Rejection Reason',
        ],
        rows: spec.list.map((t) => {
          const payDate = t.paymentDate || t.createdAt.slice(0, 10);
          return [
            t.txRef,
            t.chapaReference || '—',
            t.studentCode,
            t.studentName,
            t.courseName,
            t.amountEtb,
            t.currency,
            t.paymentMethod,
            t.source === 'PAYMENT_LINK' ? 'Payment Link' : 'Student Portal',
            t.paymentStatus,
            t.approvalStatus,
            t.receiptNumber || '—',
            payDate,
            formatEthiopianDate(payDate),
            t.createdAt,
            t.approvedByName || '—',
            t.rejectionReason || t.approvalNotes || '',
          ];
        }),
        currencyCols: [5],
        sumCols: [5],
      })
    );
    rowCount = spec.list.length;
  } else if (reportKey === 'CHAPA_MONTHLY') {
    reportTitle = 'Monthly Chapa Online Collections Report';
    fileSlug = 'chapa-monthly-online-collections';
    const monthMap = new Map<
      string,
      {
        txCount: number;
        verifiedEtb: number;
        approvedEtb: number;
        pendingEtb: number;
        rejectedEtb: number;
        failedEtb: number;
      }
    >();
    for (const t of filteredChapa) {
      const mKey = (t.paymentDate || t.createdAt || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mKey)) continue;
      const cur = monthMap.get(mKey) || {
        txCount: 0,
        verifiedEtb: 0,
        approvedEtb: 0,
        pendingEtb: 0,
        rejectedEtb: 0,
        failedEtb: 0,
      };
      cur.txCount += 1;
      if (t.paymentStatus === 'VERIFIED') cur.verifiedEtb += t.amountEtb;
      if (t.approvalStatus === 'APPROVED') cur.approvedEtb += t.amountEtb;
      if (t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL') {
        cur.pendingEtb += t.amountEtb;
      }
      if (t.approvalStatus === 'REJECTED') cur.rejectedEtb += t.amountEtb;
      if (t.paymentStatus === 'FAILED' || t.paymentStatus === 'CANCELLED') {
        cur.failedEtb += t.amountEtb;
      }
      monthMap.set(mKey, cur);
    }
    const monthlyRows = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, v]) => [
        monthKey,
        v.txCount,
        Number(v.verifiedEtb.toFixed(2)),
        Number(v.approvedEtb.toFixed(2)),
        Number(v.pendingEtb.toFixed(2)),
        Number(v.rejectedEtb.toFixed(2)),
        Number(v.failedEtb.toFixed(2)),
      ]);
    addSheet(
      'Monthly Chapa Summary',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Month (YYYY-MM)',
          'Total Transactions',
          'Verified Online (ETB)',
          'Approved Online (ETB)',
          'Pending Approval (ETB)',
          'Rejected (ETB)',
          'Failed / Cancelled (ETB)',
        ],
        rows: monthlyRows,
        currencyCols: [2, 3, 4, 5, 6],
        sumCols: [1, 2, 3, 4, 5, 6],
      })
    );
    rowCount = monthlyRows.length;
  } else if (reportKey === 'CHAPA_STUDENT_HISTORY') {
    reportTitle = 'Student-Based Chapa Online Payment History';
    fileSlug = 'chapa-student-payment-history';
    const byStudent = new Map<
      string,
      {
        studentCode: string;
        studentName: string;
        courseName: string;
        totalAttempts: number;
        verifiedEtb: number;
        approvedEtb: number;
        pendingEtb: number;
        lastDate: string;
        receipts: string[];
      }
    >();
    for (const t of filteredChapa) {
      const cur = byStudent.get(t.studentId) || {
        studentCode: t.studentCode,
        studentName: t.studentName,
        courseName: t.courseName,
        totalAttempts: 0,
        verifiedEtb: 0,
        approvedEtb: 0,
        pendingEtb: 0,
        lastDate: '',
        receipts: [],
      };
      cur.totalAttempts += 1;
      if (t.paymentStatus === 'VERIFIED') cur.verifiedEtb += t.amountEtb;
      if (t.approvalStatus === 'APPROVED') cur.approvedEtb += t.amountEtb;
      if (t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL') {
        cur.pendingEtb += t.amountEtb;
      }
      const d = t.paymentDate || t.createdAt.slice(0, 10);
      if (d > cur.lastDate) cur.lastDate = d;
      if (t.receiptNumber) cur.receipts.push(t.receiptNumber);
      byStudent.set(t.studentId, cur);
    }
    const stuRows = Array.from(byStudent.values())
      .sort((a, b) => b.approvedEtb - a.approvedEtb)
      .map((s) => [
        s.studentCode,
        s.studentName,
        s.courseName,
        s.totalAttempts,
        Number(s.verifiedEtb.toFixed(2)),
        Number(s.approvedEtb.toFixed(2)),
        Number(s.pendingEtb.toFixed(2)),
        s.lastDate || '—',
        s.receipts.join(', ') || '—',
      ]);
    addSheet(
      'Student Online History',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Student ID',
          'Student Name',
          'Course',
          'Total Chapa Attempts',
          'Verified Online (ETB)',
          'Approved Online (ETB)',
          'Pending Approval (ETB)',
          'Last Online Date',
          'Issued Receipts',
        ],
        rows: stuRows,
        currencyCols: [4, 5, 6],
        sumCols: [3, 4, 5, 6],
      })
    );
    rowCount = stuRows.length;
  } else {
    // COMPLETE_FINANCIAL — Full Executive Multi-Sheet Institutional Workbook
    reportTitle = 'Complete Institutional Financial Report';
    fileSlug = 'complete-institutional-financial-report';

    const execSummaryRows: Array<Array<string | number>> = [
      ['Total Registered Students', summary.totalRegisteredStudents],
      ['Total Active Students', summary.totalActiveStudents],
      ['Fully Paid Students', summary.fullyPaidCount],
      ['Partially Paid Students', summary.partiallyPaidCount],
      ['Unpaid Students', summary.unpaidCount],
      ['Overdue Students', summary.overdueCount],
      ['Total Expected Student Fees (ETB)', summary.totalExpectedFeesEtb],
      ['Gross Approved Fee Collections (ETB)', summary.totalGrossApprovedPaymentsEtb],
      ['Total Refunds & Reversals (ETB)', summary.totalRefundsAndReversalsEtb],
      ['Net Fees Collected / Income (ETB)', summary.totalFeesCollectedEtb],
      ['Total Outstanding Fees (ETB)', summary.totalOutstandingFeesEtb],
      ['Total Overdue Balance (ETB)', summary.totalOverdueAmountEtb],
      ['Total Institutional Expenses (ETB)', summary.totalExpensesEtb],
      ['Net Institutional Balance (ETB)', summary.netInstitutionalBalanceEtb],
      ['Fee Collection Rate (%)', summary.collectionRatePercent],
    ];

    addSheet(
      'Executive Summary',
      buildInstitutionalSheet({
        reportTitle,
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: ['Key Financial Metric', 'Value'],
        rows: execSummaryRows,
      })
    );

    const allSpec = buildStudentSheetRows('ALL', filteredStudents);
    addSheet(
      'All Students',
      buildInstitutionalSheet({
        reportTitle: 'All Registered Students — Financial Summary',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: allSpec.headers,
        rows: allSpec.data,
        currencyCols: allSpec.currencyCols,
        sumCols: allSpec.sumCols,
      })
    );

    const fpSpec = buildStudentSheetRows('FULLY_PAID', fullyPaidRows);
    addSheet(
      'Fully Paid',
      buildInstitutionalSheet({
        reportTitle: 'Fully Paid Students',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: fpSpec.headers,
        rows: fpSpec.data,
        currencyCols: fpSpec.currencyCols,
        sumCols: fpSpec.sumCols,
      })
    );

    const ppSpec = buildStudentSheetRows('PARTIALLY_PAID', partiallyPaidRows);
    addSheet(
      'Partially Paid',
      buildInstitutionalSheet({
        reportTitle: 'Partially Paid Students',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: ppSpec.headers,
        rows: ppSpec.data,
        currencyCols: ppSpec.currencyCols,
        sumCols: ppSpec.sumCols,
      })
    );

    const unSpec = buildStudentSheetRows('UNPAID', unpaidRows);
    addSheet(
      'Unpaid',
      buildInstitutionalSheet({
        reportTitle: 'Unpaid Students',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: unSpec.headers,
        rows: unSpec.data,
        currencyCols: unSpec.currencyCols,
        sumCols: unSpec.sumCols,
      })
    );

    const ovSpec = buildStudentSheetRows('OVERDUE', overdueRows);
    addSheet(
      'Overdue',
      buildInstitutionalSheet({
        reportTitle: 'Overdue Students',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: ovSpec.headers,
        rows: ovSpec.data,
        currencyCols: ovSpec.currencyCols,
        sumCols: ovSpec.sumCols,
      })
    );

    const coursePerf = computeCoursePerformance(ctx.courses, filteredStudents);
    addSheet(
      'Course Performance',
      buildInstitutionalSheet({
        reportTitle: 'Course Financial Performance',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Course Code',
          'Course Name',
          'Instructor',
          'Students',
          'Fully Paid',
          'Partially Paid',
          'Unpaid',
          'Overdue',
          'Expected (ETB)',
          'Collected (ETB)',
          'Outstanding (ETB)',
          'Rate (%)',
        ],
        rows: coursePerf.map((c) => [
          c.courseCode,
          c.courseName,
          c.instructorName,
          c.studentCount,
          c.fullyPaidCount,
          c.partiallyPaidCount,
          c.unpaidCount,
          c.overdueCount,
          c.expectedFeeEtb,
          c.collectedEtb,
          c.outstandingEtb,
          c.collectionRatePercent,
        ]),
        currencyCols: [8, 9, 10],
        sumCols: [3, 4, 5, 6, 7, 8, 9, 10],
      })
    );

    addSheet(
      'Approved Payments',
      buildInstitutionalSheet({
        reportTitle: 'Approved Payment Transactions',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Transaction Ref',
          'Receipt No.',
          'Student ID',
          'Student Name',
          'Course',
          'Date (Gregorian)',
          'Date (Ethiopian)',
          'Method',
          'Amount (ETB)',
          'Recorded By',
          'Approved By',
        ],
        rows: approvedPayments.map((p) => [
          p.transactionRef,
          p.receiptNumber || '—',
          p.studentCode,
          p.studentName,
          p.courseName,
          p.paymentDate,
          formatEthiopianDate(p.paymentDate),
          p.paymentMethod,
          p.amountEtb,
          p.recordedByName,
          p.approvedByName || '—',
        ]),
        currencyCols: [8],
        sumCols: [8],
      })
    );

    addSheet(
      'Refunds & Adjustments',
      buildInstitutionalSheet({
        reportTitle: 'Financial Refunds, Reversals & Adjustments',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Adjustment Ref',
          'Effective Date',
          'Type',
          'Student ID',
          'Student Name',
          'Course',
          'Amount (ETB)',
          'Reason',
          'Approved By',
        ],
        rows: filteredAdjustments.map((a) => [
          a.adjustmentRef,
          a.effectiveDate,
          a.type,
          a.studentCode,
          a.studentName,
          a.courseName,
          a.amountEtb,
          a.reason,
          a.approvedByName,
        ]),
        currencyCols: [6],
        sumCols: [6],
      })
    );

    addSheet(
      'Institutional Expenses',
      buildInstitutionalSheet({
        reportTitle: 'Institutional Expenses',
        generatedBy: ctx.generatedBy,
        filterSummary,
        headers: [
          'Date (Gregorian)',
          'Date (Ethiopian)',
          'Category',
          'Title',
          'Method',
          'Ref',
          'Amount (ETB)',
          'Recorded By',
        ],
        rows: filteredExpenses.map((e) => [
          e.expenseDate,
          formatEthiopianDate(e.expenseDate),
          e.categoryName,
          e.title,
          e.paymentMethod,
          e.referenceNo || '—',
          e.amountEtb,
          e.recordedByName,
        ]),
        currencyCols: [6],
        sumCols: [6],
      })
    );

    rowCount =
      filteredStudents.length +
      approvedPayments.length +
      filteredAdjustments.length +
      filteredExpenses.length;

    const allChapa = ctx.chapaTransactions || [];
    if (allChapa.length > 0) {
      addSheet(
        'Chapa Online Payments',
        buildInstitutionalSheet({
          reportTitle: 'Chapa Online Payment Gateway Ledger',
          generatedBy: ctx.generatedBy,
          filterSummary,
          headers: [
            'Transaction ID',
            'Chapa Reference',
            'Student ID',
            'Student Name',
            'Course',
            'Amount (ETB)',
            'Currency',
            'Payment Method',
            'Source',
            'Gateway Status',
            'Approval Status',
            'Payment Date',
            'Recorded Date',
            'Receipt No.',
          ],
          rows: allChapa.map((t) => [
            t.txRef,
            t.chapaReference || '—',
            t.studentCode,
            t.studentName,
            t.courseName,
            t.amountEtb,
            t.currency,
            t.paymentMethod,
            t.source === 'PAYMENT_LINK' ? 'Payment Link' : 'Student Portal',
            t.paymentStatus,
            t.approvalStatus,
            t.paymentDate || '—',
            t.createdAt.slice(0, 10),
            t.receiptNumber || '—',
          ]),
          currencyCols: [5],
          sumCols: [5],
        })
      );
      rowCount += allChapa.length;
    }
  }

  return {
    fileName: `ZACMA-${fileSlug}-${today}.xlsx`,
    reportTitle,
    rowCount,
    filterSummary,
    sheetNames: wb.SheetNames,
    workbook: wb,
  };
}

export function downloadExcelWorkbook(result: ExcelWorkbookResult): void {
  const buffer = XLSX.write(result.workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
