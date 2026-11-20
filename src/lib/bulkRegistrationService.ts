import { doc, getDoc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from './firebase';
import { todayAddisIsoDate } from './ethiopianCalendar';
import type { ActorContext } from './zacmaService';
import {
  checkDuplicateIdNumber,
  ID_DOCUMENT_LABELS,
  normalizeIdNumber,
  submitAiStudentRegistration,
} from './registrationService';
import {
  Course,
  IdDocumentType,
  PaymentMethod,
  PaymentPlan,
  sanitizeRefId,
  todayIsoDate,
} from '../types/zacma';

// ---------------------------------------------------------------------------
// Schema-Mapped Excel Template Column Specification
// Maps directly to AiStudentRegistrationInput -> students, identity_documents,
// id_number_locks, enrollments, payment_installments, payments, payment_refs.
// ---------------------------------------------------------------------------

export interface BulkTemplateColumnSpec {
  key: keyof BulkStudentRowFields;
  header: string;
  firestorePath: string;
  required: boolean;
  example: string;
  description: string;
  aliases: string[];
  colWidth: number;
}

export interface BulkStudentRowFields {
  fullName: string;
  phone: string;
  altPhone: string;
  email: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Unspecified';
  nationality: string;
  address: string;
  idDocumentType: IdDocumentType;
  idDocumentNumber: string;
  idExpiryDate: string;
  courseInput: string;
  agreedFeeEtb: string;
  enrollmentDate: string;
  paymentPlanInput: string;
  customInstallments: string;
  customIntervalDays: string;
  initialPaymentAmount: string;
  initialPaymentMethod: PaymentMethod;
  initialTransactionRef: string;
  notes: string;
}

export const BULK_TEMPLATE_COLUMNS: BulkTemplateColumnSpec[] = [
  {
    key: 'fullName',
    header: 'fullName',
    firestorePath: 'students.fullName',
    required: true,
    example: 'Abebe Bikila Tadesse',
    description: 'Student full legal name (1–120 chars).',
    aliases: ['full name', 'full legal name', 'student name', 'name', 'fullname'],
    colWidth: 26,
  },
  {
    key: 'phone',
    header: 'phone',
    firestorePath: 'students.phone',
    required: true,
    example: '+251911234567',
    description: 'Primary mobile phone number (e.g., +2519... or 09...).',
    aliases: ['phone number', 'mobile', 'tel', 'telephone', 'primary phone', 'phone'],
    colWidth: 18,
  },
  {
    key: 'altPhone',
    header: 'altPhone',
    firestorePath: 'students.altPhone',
    required: false,
    example: '+251922345678',
    description: 'Optional secondary or guardian phone number.',
    aliases: ['alt phone', 'alternative phone', 'secondary phone', 'guardian phone', 'altphone'],
    colWidth: 18,
  },
  {
    key: 'email',
    header: 'email',
    firestorePath: 'students.email',
    required: false,
    example: 'abebe.tadesse@example.com',
    description: 'Optional student email address (max 160 chars).',
    aliases: ['email address', 'e-mail', 'student email', 'email'],
    colWidth: 26,
  },
  {
    key: 'dateOfBirth',
    header: 'dateOfBirth',
    firestorePath: 'students.dateOfBirth',
    required: false,
    example: '2001-05-14',
    description: 'Date of birth in YYYY-MM-DD format.',
    aliases: ['dob', 'date of birth', 'birth date', 'birthdate', 'dateofbirth'],
    colWidth: 15,
  },
  {
    key: 'gender',
    header: 'gender',
    firestorePath: 'students.gender',
    required: false,
    example: 'Male',
    description: 'Male, Female, or Unspecified (defaults to Unspecified).',
    aliases: ['sex', 'gender'],
    colWidth: 13,
  },
  {
    key: 'nationality',
    header: 'nationality',
    firestorePath: 'students.nationality',
    required: false,
    example: 'Ethiopian',
    description: 'Nationality (defaults to Ethiopian).',
    aliases: ['country', 'citizenship', 'nationality'],
    colWidth: 15,
  },
  {
    key: 'address',
    header: 'address',
    firestorePath: 'students.address',
    required: true,
    example: 'Bole Sub-City, Woreda 03, Addis Ababa',
    description: 'Residential street / sub-city / woreda address (1–240 chars).',
    aliases: ['residential address', 'home address', 'city', 'location', 'address'],
    colWidth: 32,
  },
  {
    key: 'idDocumentType',
    header: 'idDocumentType',
    firestorePath: 'students.idDocumentType + identity_documents.documentType',
    required: true,
    example: 'ETHIOPIAN_FAYDA_ID',
    description: 'ETHIOPIAN_FAYDA_ID | NATIONAL_ID | PASSPORT | DRIVING_LICENCE',
    aliases: ['id type', 'document type', 'identification type', 'id document type', 'iddocumenttype'],
    colWidth: 22,
  },
  {
    key: 'idDocumentNumber',
    header: 'idDocumentNumber',
    firestorePath: 'identity_documents (AES-256-GCM) + id_number_locks',
    required: true,
    example: 'FAN-9045-8812-3310',
    description: 'Unique official ID / Fayda / Passport / Licence number. Encrypted at rest & SHA-256 duplicate-checked.',
    aliases: ['id number', 'document number', 'fayda id', 'national id', 'passport number', 'id no', 'iddocumentnumber'],
    colWidth: 22,
  },
  {
    key: 'idExpiryDate',
    header: 'idExpiryDate',
    firestorePath: 'students.idExpiryDate + identity_documents.documentExpiryDate',
    required: false,
    example: '2031-08-20',
    description: 'Optional document expiry date (YYYY-MM-DD). Expired IDs trigger a warning.',
    aliases: ['expiry date', 'id expiry', 'document expiry', 'id expiry date', 'idexpirydate'],
    colWidth: 15,
  },
  {
    key: 'courseInput',
    header: 'courseNameOrCode',
    firestorePath: 'students.courseId + enrollments.courseId',
    required: true,
    example: 'ZAC-AI201',
    description: 'Exact Course Code (e.g., ZAC-AI201) or Course Name (see Sheet 2).',
    aliases: ['course', 'course name', 'course code', 'program', 'training course', 'coursenameorcode', 'courseid', 'coursename'],
    colWidth: 28,
  },
  {
    key: 'agreedFeeEtb',
    header: 'agreedFeeEtb',
    firestorePath: 'students.courseFeeEtb + enrollments.agreedFeeEtb',
    required: false,
    example: '',
    description: 'Optional custom tuition fee in ETB. Leave blank to auto-use the selected course catalog fee.',
    aliases: ['course fee', 'fee', 'tuition', 'agreed fee', 'coursefeeetb', 'agreedfeeetb', 'fee etb'],
    colWidth: 16,
  },
  {
    key: 'enrollmentDate',
    header: 'enrollmentDate',
    firestorePath: 'students.enrollmentDate + enrollments.enrollmentDate',
    required: false,
    example: '2026-11-20',
    description: 'Enrollment / registration date (YYYY-MM-DD). Defaults to today (Addis Ababa EAT).',
    aliases: ['registration date', 'start date', 'enrollment date', 'enrollmentdate', 'reg date'],
    colWidth: 16,
  },
  {
    key: 'paymentPlanInput',
    header: 'paymentPlanCode',
    firestorePath: 'students.paymentPlanCode + payment_installments',
    required: false,
    example: 'MONTHLY',
    description: 'FULL | MONTHLY | TWO_MONTH | THREE_MONTH | SIX_MONTH | CUSTOM (defaults to FULL).',
    aliases: ['payment plan', 'plan', 'plan code', 'installment plan', 'paymentplancode'],
    colWidth: 18,
  },
  {
    key: 'customInstallments',
    header: 'customInstallments',
    firestorePath: 'payment_installments (count for CUSTOM plan)',
    required: false,
    example: '',
    description: 'Number of installments (1–12). Only used when paymentPlanCode is CUSTOM.',
    aliases: ['installments', 'custom installments', 'installment count', 'custominstallments'],
    colWidth: 18,
  },
  {
    key: 'customIntervalDays',
    header: 'customIntervalDays',
    firestorePath: 'payment_installments (interval for CUSTOM plan)',
    required: false,
    example: '',
    description: 'Days between installments (e.g., 30). Only used when paymentPlanCode is CUSTOM.',
    aliases: ['interval days', 'custom interval', 'custom interval days', 'customintervaldays'],
    colWidth: 18,
  },
  {
    key: 'initialPaymentAmount',
    header: 'initialPaymentAmount',
    firestorePath: 'payments.amountEtb + students.initialPaymentEtb',
    required: false,
    example: '5000',
    description: 'Optional initial fee payment in ETB (submitted as PENDING for Admin approval).',
    aliases: ['initial payment', 'down payment', 'deposit', 'paid amount', 'initialpaymentamount', 'initialpaymentetb'],
    colWidth: 20,
  },
  {
    key: 'initialPaymentMethod',
    header: 'initialPaymentMethod',
    firestorePath: 'payments.paymentMethod',
    required: false,
    example: 'Telebirr',
    description: 'Cash | Bank Transfer | Telebirr | CBE Birr | Check | Chapa (defaults to Cash).',
    aliases: ['payment method', 'method', 'initial payment method', 'initialpaymentmethod'],
    colWidth: 20,
  },
  {
    key: 'initialTransactionRef',
    header: 'initialTransactionRef',
    firestorePath: 'payments.transactionRef + payment_refs',
    required: false,
    example: 'TXN-BULK-2026-001',
    description: 'Required when initialPaymentAmount > 0. Alphanumeric, hyphens, underscores only.',
    aliases: ['transaction ref', 'tx ref', 'receipt ref', 'reference', 'reference no', 'initialtransactionref'],
    colWidth: 22,
  },
  {
    key: 'notes',
    header: 'notes',
    firestorePath: 'students.ocrConfidenceSummary + identity_documents',
    required: false,
    example: 'Batch intake Cohort Q4',
    description: 'Optional batch/intake reference note recorded in the student AI Registration metadata.',
    aliases: ['note', 'remarks', 'cohort', 'comment', 'ocr summary', 'notes'],
    colWidth: 26,
  },
];

export type BulkRowImportStatus = 'READY' | 'INVALID' | 'IMPORTING' | 'IMPORTED' | 'FAILED' | 'SKIPPED';

export interface BulkParsedStudentRow {
  rowId: string;
  rowNumber: number; // 1-based Excel row number (header = row 1, first data row = row 2)
  fields: BulkStudentRowFields;
  resolvedCourseId: string;
  resolvedCourseName: string;
  resolvedFeeEtb: number;
  resolvedPaymentPlanCode: string;
  errors: string[];
  warnings: string[];
  isDuplicateIdInDb: boolean;
  duplicateIdDbInfo?: string;
  isDuplicateIdInFile: boolean;
  isDuplicateTxRefInDb: boolean;
  isDuplicateTxRefInFile: boolean;
  selected: boolean;
  importStatus: BulkRowImportStatus;
  assignedStudentCode?: string;
  assignedStudentId?: string;
  importError?: string;
}

export interface BulkParseSummary {
  fileName: string;
  sheetName: string;
  totalRows: number;
  recognizedColumns: string[];
  unrecognizedColumns: string[];
  rows: BulkParsedStudentRow[];
}

export interface BulkImportProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  currentRowNumber?: number;
  currentStudentName?: string;
}

// ---------------------------------------------------------------------------
// Normalization & Parsing Helpers
// ---------------------------------------------------------------------------

const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Bank Transfer',
  'Telebirr',
  'CBE Birr',
  'Check',
  'Chapa',
];

function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    return String(val);
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).trim();
}

/**
 * Converts Excel serial dates (e.g., 46345), ISO strings (YYYY-MM-DD),
 * slash dates (DD/MM/YYYY or YYYY/MM/DD), or Date instances into YYYY-MM-DD.
 */
export function normalizeSpreadsheetDate(raw: unknown): { iso: string; valid: boolean } {
  if (raw === null || raw === undefined || raw === '') {
    return { iso: '', valid: true };
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { iso: raw.toISOString().slice(0, 10), valid: true };
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 10000 && raw < 90000) {
    // Excel serial date (days since 1899-12-30)
    const utcMs = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString().slice(0, 10), valid: true };
    }
  }
  const str = cellToString(raw);
  if (!str) return { iso: '', valid: true };

  // Already YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return {
        iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        valid: true,
      };
    }
    return { iso: str, valid: false };
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);
    const y = Number(dmy[3]);
    // Assume DD/MM/YYYY unless second number > 12 (MM/DD/YYYY)
    const day = p2 > 12 ? p2 : p1;
    const month = p2 > 12 ? p1 : p2;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        iso: `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        valid: true,
      };
    }
    return { iso: str, valid: false };
  }

  // Numeric string representing Excel serial
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const num = Number(str);
    if (num > 10000 && num < 90000) {
      const utcMs = Math.round((num - 25569) * 86400 * 1000);
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) {
        return { iso: d.toISOString().slice(0, 10), valid: true };
      }
    }
  }

  return { iso: str, valid: false };
}

export function normalizeGender(raw: string): 'Male' | 'Female' | 'Unspecified' {
  const v = raw.trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === 'man' || v === 'boy') return 'Male';
  if (v === 'f' || v === 'female' || v === 'woman' || v === 'girl') return 'Female';
  return 'Unspecified';
}

export function normalizeIdDocumentType(raw: string): IdDocumentType {
  const v = raw.trim().toUpperCase().replace(/[\s\-/]+/g, '_');
  if (!v) return 'ETHIOPIAN_FAYDA_ID';
  if (v.includes('FAYDA') || v === 'FAN' || v === 'FIN') return 'ETHIOPIAN_FAYDA_ID';
  if (v.includes('PASSPORT') || v === 'PP') return 'PASSPORT';
  if (v.includes('DRIV') || v.includes('LICEN') || v === 'DL') return 'DRIVING_LICENCE';
  if (v.includes('NATIONAL') || v.includes('KEBELE') || v === 'NID' || v === 'ID') {
    return 'NATIONAL_ID';
  }
  return 'ETHIOPIAN_FAYDA_ID';
}

export function normalizePaymentMethod(raw: string): PaymentMethod {
  const v = raw.trim().toLowerCase();
  if (!v) return 'Cash';
  const exact = ALLOWED_PAYMENT_METHODS.find((m) => m.toLowerCase() === v);
  if (exact) return exact;
  if (v.includes('telebirr') || v.includes('tele')) return 'Telebirr';
  if (v.includes('cbe')) return 'CBE Birr';
  if (v.includes('bank') || v.includes('transfer') || v.includes('wire')) return 'Bank Transfer';
  if (v.includes('check') || v.includes('cheque')) return 'Check';
  if (v.includes('chapa')) return 'Chapa';
  return 'Cash';
}

export function matchCourse(input: string, courses: Course[]): Course | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  const activeCourses = courses.filter((c) => c.isActive);
  const pool = activeCourses.length > 0 ? activeCourses : courses;

  // 1. Exact ID, code, or name match
  const exact = pool.find(
    (c) =>
      c.id.toLowerCase() === q ||
      c.code.toLowerCase() === q ||
      c.name.toLowerCase() === q
  );
  if (exact) return exact;

  // 2. Normalized alphanumeric match (handles "ZACAI201" or "Artificial Intelligence")
  const normQ = q.replace(/[^a-z0-9]/g, '');
  const normExact = pool.find(
    (c) =>
      c.code.toLowerCase().replace(/[^a-z0-9]/g, '') === normQ ||
      c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normQ
  );
  if (normExact) return normExact;

  // 3. Partial containment match (only if unique or strong prefix)
  const partial = pool.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      q.includes(c.name.toLowerCase()) ||
      c.code.toLowerCase().includes(q)
  );
  if (partial.length === 1) return partial[0];
  return null;
}

export function matchPaymentPlan(input: string, paymentPlans: PaymentPlan[]): PaymentPlan | null {
  const q = input.trim().toLowerCase();
  const activePlans = paymentPlans.filter((p) => p.isActive);
  const pool = activePlans.length > 0 ? activePlans : paymentPlans;
  if (!q) {
    return pool.find((p) => p.code === 'FULL') || pool[0] || null;
  }
  const exact = pool.find(
    (p) =>
      p.code.toLowerCase() === q ||
      p.name.toLowerCase() === q ||
      p.code.toLowerCase().replace(/_/g, ' ') === q
  );
  if (exact) return exact;

  if (q.includes('full') || q.includes('one') || q === '1') {
    return pool.find((p) => p.code === 'FULL') || null;
  }
  if (q.includes('two') || q === '2' || q.includes('2 month')) {
    return pool.find((p) => p.code === 'TWO_MONTH') || null;
  }
  if (q.includes('three') || q === '3' || q.includes('3 month') || q.includes('quarter')) {
    return pool.find((p) => p.code === 'THREE_MONTH') || null;
  }
  if (q.includes('six') || q === '6' || q.includes('6 month')) {
    return pool.find((p) => p.code === 'SIX_MONTH') || null;
  }
  if (q.includes('month')) {
    return pool.find((p) => p.code === 'MONTHLY') || null;
  }
  if (q.includes('custom')) {
    return pool.find((p) => p.code === 'CUSTOM') || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Download Official Excel Import Template (.xlsx)
// ---------------------------------------------------------------------------

export function downloadStudentBulkTemplate(params: {
  courses: Course[];
  paymentPlans: PaymentPlan[];
  tenantName?: string;
  studentIdPrefix?: string;
}): void {
  const { courses, paymentPlans, tenantName = 'ZACMA Technology', studentIdPrefix = 'ZAC-STU' } =
    params;
  const activeCourses = courses
    .filter((c) => c.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
  const activePlans = paymentPlans.filter((p) => p.isActive);
  const today = todayAddisIsoDate();

  const firstCourse = activeCourses[0];
  const secondCourse = activeCourses[1] || activeCourses[0];

  // Sheet 1: Student Registrations (Schema-Mapped Data Entry Sheet)
  const headers = BULK_TEMPLATE_COLUMNS.map((c) => c.header);
  const sampleRow1 = [
    'Abebe Bikila Tadesse',
    '+251911234567',
    '+251911000111',
    'abebe.tadesse@example.com',
    '2001-05-14',
    'Male',
    'Ethiopian',
    'Bole Sub-City, Woreda 03, Addis Ababa',
    'ETHIOPIAN_FAYDA_ID',
    'FAN-8842-1920-4410',
    '2032-05-14',
    firstCourse ? firstCourse.code : 'ZAC-AI201',
    '',
    today,
    activePlans.some((p) => p.code === 'MONTHLY') ? 'MONTHLY' : 'FULL',
    '',
    '',
    '5000',
    'Telebirr',
    'BULK-TXN-001',
    'Sample row 1 — replace with real student data before uploading',
  ];

  const sampleRow2 = [
    'Tigist Alemu Bekele',
    '+251922987654',
    '',
    'tigist.alemu@example.com',
    '2002-11-08',
    'Female',
    'Ethiopian',
    'Yeka Sub-City, Woreda 07, Addis Ababa',
    'PASSPORT',
    'EP4829104',
    '2030-11-08',
    secondCourse ? secondCourse.name : 'Software Development',
    '',
    today,
    'FULL',
    '',
    '',
    '0',
    'Cash',
    '',
    'Sample row 2 — replace with real student data before uploading',
  ];

  const wsStudents = XLSX.utils.aoa_to_sheet([headers, sampleRow1, sampleRow2]);
  wsStudents['!cols'] = BULK_TEMPLATE_COLUMNS.map((c) => ({ wch: c.colWidth }));

  // Sheet 2: Active Courses & Payment Plans Reference
  const refRows: Array<Array<string | number>> = [
    ['ACTIVE TRAINING COURSES (Copy exact Course Code or Course Name into column courseNameOrCode)'],
    ['Course Code', 'Course Name', 'Category', 'Duration (Weeks)', 'Standard Fee (ETB)', 'Schedule'],
    ...activeCourses.map((c) => [
      c.code,
      c.name,
      c.category,
      c.durationWeeks,
      c.feeEtb,
      c.schedule,
    ]),
    [],
    ['ACTIVE PAYMENT PLANS (Copy exact Plan Code into column paymentPlanCode)'],
    ['Plan Code', 'Plan Name', 'Installments', 'Interval (Days)', 'Description'],
    ...activePlans.map((p) => [
      p.code,
      p.name,
      p.installmentCount,
      p.intervalDays,
      p.description || '',
    ]),
    [],
    ['VALID IDENTIFICATION DOCUMENT TYPES (idDocumentType)'],
    ['Code', 'Description'],
    ['ETHIOPIAN_FAYDA_ID', ID_DOCUMENT_LABELS.ETHIOPIAN_FAYDA_ID],
    ['NATIONAL_ID', ID_DOCUMENT_LABELS.NATIONAL_ID],
    ['PASSPORT', ID_DOCUMENT_LABELS.PASSPORT],
    ['DRIVING_LICENCE', ID_DOCUMENT_LABELS.DRIVING_LICENCE],
    [],
    ['VALID PAYMENT METHODS (initialPaymentMethod)'],
    ['Method'],
    ...ALLOWED_PAYMENT_METHODS.map((m) => [m]),
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [
    { wch: 24 },
    { wch: 36 },
    { wch: 24 },
    { wch: 18 },
    { wch: 20 },
    { wch: 32 },
  ];

  // Sheet 3: Database Schema & Field Rules Guide
  const guideRows: Array<Array<string>> = [
    [`${tenantName.toUpperCase()} — BULK STUDENT REGISTRATION IMPORT GUIDE`],
    [`Institutional Student ID Prefix: ${studentIdPrefix}-XXXX (auto-allocated atomically on import)`],
    ['Approval Policy: All bulk-imported students enter PENDING status and require Admin verification & approval.'],
    [],
    ['Excel Column Header', 'Required?', 'Target Firestore Schema Field', 'Example', 'Validation & Formatting Rules'],
    ...BULK_TEMPLATE_COLUMNS.map((c) => [
      c.header,
      c.required ? 'REQUIRED' : 'Optional',
      c.firestorePath,
      c.example,
      c.description,
    ]),
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 44 },
    { wch: 26 },
    { wch: 62 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Student Registrations');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Courses & Payment Plans');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Schema & Import Guide');

  const safeSlug = tenantName
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'ZACMA';

  XLSX.writeFile(wb, `${safeSlug}_Bulk_Student_Registration_Template_${today}.xlsx`);
}

// ---------------------------------------------------------------------------
// 2. Row Validation Engine (Used on Parse + Inline Row Edits)
// ---------------------------------------------------------------------------

export function validateSingleBulkRow(
  row: BulkParsedStudentRow,
  context: {
    courses: Course[];
    paymentPlans: PaymentPlan[];
    allowDuplicateOverride?: boolean;
  }
): BulkParsedStudentRow {
  const { courses, paymentPlans, allowDuplicateOverride = false } = context;
  const f = row.fields;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required identity & contact fields (matching firestore.rules isValidStudent)
  if (!f.fullName.trim()) {
    errors.push('Full name is required.');
  } else if (f.fullName.trim().length > 120) {
    errors.push('Full name exceeds 120 characters.');
  }

  if (!f.phone.trim()) {
    errors.push('Phone number is required.');
  } else if (f.phone.trim().length > 30) {
    errors.push('Phone number exceeds 30 characters.');
  }

  if (f.altPhone.trim().length > 30) {
    errors.push('Alternate phone exceeds 30 characters.');
  }

  if (f.email.trim()) {
    if (f.email.trim().length > 160) {
      errors.push('Email exceeds 160 characters.');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      errors.push('Invalid email address format.');
    }
  }

  if (!f.address.trim()) {
    errors.push('Residential address is required.');
  } else if (f.address.trim().length > 240) {
    errors.push('Address exceeds 240 characters.');
  }

  if (!f.idDocumentNumber.trim()) {
    errors.push('ID / Fayda / Passport number is required.');
  } else if (f.idDocumentNumber.trim().length < 4) {
    errors.push('ID document number must be at least 4 characters.');
  } else if (f.idDocumentNumber.trim().length > 64) {
    errors.push('ID document number exceeds 64 characters.');
  }

  // Dates validation
  if (f.dateOfBirth.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth.trim())) {
    errors.push('Date of birth must be YYYY-MM-DD.');
  }
  if (f.idExpiryDate.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.idExpiryDate.trim())) {
      errors.push('ID expiry date must be YYYY-MM-DD.');
    } else if (f.idExpiryDate.trim() < todayIsoDate()) {
      warnings.push(`ID document expired on ${f.idExpiryDate.trim()} (will be flagged for Admin review).`);
    }
  }
  if (!f.enrollmentDate.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(f.enrollmentDate.trim())) {
    errors.push('Enrollment date must be YYYY-MM-DD.');
  }

  // Course resolution
  const matchedCourse = matchCourse(f.courseInput, courses);
  let resolvedCourseId = '';
  let resolvedCourseName = '';
  let resolvedFeeEtb = 0;

  if (!matchedCourse) {
    errors.push(
      f.courseInput.trim()
        ? `Course "${f.courseInput.trim()}" not found in active catalog.`
        : 'Course name or code is required.'
    );
  } else {
    resolvedCourseId = matchedCourse.id;
    resolvedCourseName = matchedCourse.name;
    resolvedFeeEtb = matchedCourse.feeEtb;
  }

  // Optional agreed fee override
  if (f.agreedFeeEtb.trim() !== '') {
    const parsedFee = Number(f.agreedFeeEtb.replace(/,/g, '').trim());
    if (!Number.isFinite(parsedFee) || parsedFee <= 0) {
      errors.push('Agreed fee must be a positive number (ETB).');
    } else {
      resolvedFeeEtb = parsedFee;
    }
  }

  // Payment plan resolution
  const matchedPlan = matchPaymentPlan(f.paymentPlanInput, paymentPlans);
  let resolvedPaymentPlanCode = 'FULL';
  if (!matchedPlan) {
    errors.push(`Payment plan "${f.paymentPlanInput.trim()}" is not recognized.`);
  } else {
    resolvedPaymentPlanCode = matchedPlan.code;
    if (matchedPlan.code === 'CUSTOM') {
      const inst = Number(f.customInstallments || 3);
      const days = Number(f.customIntervalDays || 30);
      if (!Number.isFinite(inst) || inst < 1 || inst > 12) {
        errors.push('Custom installments must be between 1 and 12.');
      }
      if (!Number.isFinite(days) || days < 0 || days > 365) {
        errors.push('Custom interval days must be between 0 and 365.');
      }
    }
  }

  // Initial payment validation
  const initPayRaw = f.initialPaymentAmount.replace(/,/g, '').trim();
  const initPayNum = initPayRaw === '' ? 0 : Number(initPayRaw);
  if (initPayRaw !== '' && (!Number.isFinite(initPayNum) || initPayNum < 0)) {
    errors.push('Initial payment amount must be a non-negative number.');
  } else if (initPayNum > 0) {
    if (resolvedFeeEtb > 0 && initPayNum > resolvedFeeEtb) {
      warnings.push(
        `Initial payment (${initPayNum.toLocaleString()} ETB) exceeds course fee (${resolvedFeeEtb.toLocaleString()} ETB).`
      );
    }
    const txRef = f.initialTransactionRef.trim();
    if (!txRef) {
      errors.push('Transaction reference is required when initial payment > 0.');
    } else if (!/^[A-Za-z0-9\-_]+$/.test(txRef) || txRef.length > 64) {
      errors.push('Transaction reference may only contain letters, numbers, hyphens, and underscores (max 64 chars).');
    }
  }

  // Duplicate ID checks
  if (row.isDuplicateIdInFile && !allowDuplicateOverride) {
    errors.push('Duplicate ID number appears multiple times in this spreadsheet.');
  }
  if (row.isDuplicateIdInDb) {
    if (allowDuplicateOverride) {
      warnings.push(
        `Duplicate ID override active: matches ${row.duplicateIdDbInfo || 'existing record'}.`
      );
    } else {
      errors.push(
        `Duplicate ID already registered in database (${row.duplicateIdDbInfo || 'existing lock'}).`
      );
    }
  }

  // Duplicate transaction reference checks
  if (initPayNum > 0) {
    if (row.isDuplicateTxRefInFile) {
      errors.push('Duplicate transaction reference appears multiple times in this spreadsheet.');
    }
    if (row.isDuplicateTxRefInDb) {
      errors.push(`Transaction reference "${f.initialTransactionRef.trim()}" already exists in database.`);
    }
  }

  const nextStatus: BulkRowImportStatus =
    row.importStatus === 'IMPORTED' || row.importStatus === 'IMPORTING'
      ? row.importStatus
      : errors.length === 0
      ? 'READY'
      : 'INVALID';

  return {
    ...row,
    resolvedCourseId,
    resolvedCourseName,
    resolvedFeeEtb,
    resolvedPaymentPlanCode,
    errors,
    warnings,
    importStatus: nextStatus,
    selected: row.importStatus === 'IMPORTED' ? false : errors.length === 0 ? row.selected : false,
  };
}

/**
 * Re-computes intra-file duplicates and re-validates all rows (fast, synchronous).
 */
export function revalidateAllBulkRows(
  rows: BulkParsedStudentRow[],
  context: {
    courses: Course[];
    paymentPlans: PaymentPlan[];
    allowDuplicateOverride?: boolean;
  }
): BulkParsedStudentRow[] {
  const idCounts = new Map<string, number>();
  const refCounts = new Map<string, number>();

  for (const r of rows) {
    if (r.importStatus === 'IMPORTED') continue;
    const normId = `${r.fields.idDocumentType}:${normalizeIdNumber(r.fields.idDocumentNumber)}`;
    if (r.fields.idDocumentNumber.trim()) {
      idCounts.set(normId, (idCounts.get(normId) || 0) + 1);
    }
    const initPay = Number(r.fields.initialPaymentAmount.replace(/,/g, '').trim() || 0);
    const ref = r.fields.initialTransactionRef.trim();
    if (initPay > 0 && ref) {
      const normRef = sanitizeRefId(ref);
      refCounts.set(normRef, (refCounts.get(normRef) || 0) + 1);
    }
  }

  return rows.map((r) => {
    const normId = `${r.fields.idDocumentType}:${normalizeIdNumber(r.fields.idDocumentNumber)}`;
    const initPay = Number(r.fields.initialPaymentAmount.replace(/,/g, '').trim() || 0);
    const ref = r.fields.initialTransactionRef.trim();
    const isDuplicateIdInFile = Boolean(r.fields.idDocumentNumber.trim() && (idCounts.get(normId) || 0) > 1);
    const isDuplicateTxRefInFile = Boolean(initPay > 0 && ref && (refCounts.get(sanitizeRefId(ref)) || 0) > 1);
    return validateSingleBulkRow(
      {
        ...r,
        isDuplicateIdInFile,
        isDuplicateTxRefInFile,
      },
      context
    );
  });
}

/**
 * Re-checks live Firestore duplicate locks (ID number + initial payment txRef) for a single edited row.
 */
export async function checkLiveFirestoreDuplicatesForRow(
  row: BulkParsedStudentRow
): Promise<Pick<BulkParsedStudentRow, 'isDuplicateIdInDb' | 'duplicateIdDbInfo' | 'isDuplicateTxRefInDb'>> {
  let isDuplicateIdInDb = false;
  let duplicateIdDbInfo: string | undefined;
  let isDuplicateTxRefInDb = false;

  if (row.fields.idDocumentNumber.trim().length >= 4) {
    const dup = await checkDuplicateIdNumber(row.fields.idDocumentType, row.fields.idDocumentNumber);
    if (dup.isDuplicate) {
      isDuplicateIdInDb = true;
      duplicateIdDbInfo = `${dup.existingSubjectName || 'Existing'} (${dup.existingSubjectCode || dup.existingSubjectType || 'Locked'})`;
    }
  }

  const initPay = Number(row.fields.initialPaymentAmount.replace(/,/g, '').trim() || 0);
  const txRef = row.fields.initialTransactionRef.trim();
  if (initPay > 0 && txRef && /^[A-Za-z0-9\-_]+$/.test(txRef)) {
    try {
      const snap = await getDoc(doc(db, 'payment_refs', sanitizeRefId(txRef)));
      if (snap.exists()) {
        isDuplicateTxRefInDb = true;
      }
    } catch {
      // Ignore read errors; backend/submit validation will still guard
    }
  }

  return { isDuplicateIdInDb, duplicateIdDbInfo, isDuplicateTxRefInDb };
}

// ---------------------------------------------------------------------------
// 3. Parse Uploaded Excel (.xlsx / .xls / .csv) & Run Live Validation
// ---------------------------------------------------------------------------

export async function parseAndValidateBulkStudentFile(
  file: File,
  context: {
    courses: Course[];
    paymentPlans: PaymentPlan[];
    allowDuplicateOverride?: boolean;
  }
): Promise<BulkParseSummary> {
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_BYTES) {
    throw new Error('Spreadsheet file exceeds 10 MB limit. Please split into smaller batches.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!workbook.SheetNames.length) {
    throw new Error('The uploaded workbook contains no worksheets.');
  }

  // Prefer "Student Registrations" sheet if present, otherwise first sheet
  const preferredSheetName =
    workbook.SheetNames.find((n) => n.toLowerCase().includes('student')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[preferredSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  if (matrix.length < 2) {
    throw new Error('The uploaded sheet has no student data rows below the header row.');
  }

  const rawHeaders = (matrix[0] || []).map((cell) => cellToString(cell));

  // Build column-index -> field key mapping using exact header or flexible aliases
  const colIndexToField = new Map<number, keyof BulkStudentRowFields>();
  const recognizedColumns: string[] = [];
  const unrecognizedColumns: string[] = [];

  rawHeaders.forEach((rawHeader, idx) => {
    if (!rawHeader) return;
    const norm = normalizeHeaderKey(rawHeader);
    const spec = BULK_TEMPLATE_COLUMNS.find(
      (c) =>
        normalizeHeaderKey(c.header) === norm ||
        normalizeHeaderKey(c.key) === norm ||
        c.aliases.some((alias) => normalizeHeaderKey(alias) === norm)
    );
    if (spec && !Array.from(colIndexToField.values()).includes(spec.key)) {
      colIndexToField.set(idx, spec.key);
      recognizedColumns.push(spec.header);
    } else {
      unrecognizedColumns.push(rawHeader);
    }
  });

  if (colIndexToField.size === 0) {
    throw new Error(
      'No recognized AI Registration columns found. Please download and use the official Excel import template.'
    );
  }

  const defaultToday = todayAddisIsoDate();
  const rawParsedRows: BulkParsedStudentRow[] = [];

  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const rawRow = matrix[rIdx] || [];
    // Skip completely empty rows
    const hasAnyData = rawRow.some((cell) => cellToString(cell) !== '');
    if (!hasAnyData) continue;

    const getRaw = (key: keyof BulkStudentRowFields): unknown => {
      for (const [colIdx, fieldKey] of colIndexToField.entries()) {
        if (fieldKey === key) return rawRow[colIdx];
      }
      return '';
    };

    const dobParsed = normalizeSpreadsheetDate(getRaw('dateOfBirth'));
    const expiryParsed = normalizeSpreadsheetDate(getRaw('idExpiryDate'));
    const enrollRaw = getRaw('enrollmentDate');
    const enrollParsed =
      cellToString(enrollRaw) === ''
        ? { iso: defaultToday, valid: true }
        : normalizeSpreadsheetDate(enrollRaw);

    const fields: BulkStudentRowFields = {
      fullName: cellToString(getRaw('fullName')),
      phone: cellToString(getRaw('phone')),
      altPhone: cellToString(getRaw('altPhone')),
      email: cellToString(getRaw('email')),
      dateOfBirth: dobParsed.iso,
      gender: normalizeGender(cellToString(getRaw('gender'))),
      nationality: cellToString(getRaw('nationality')) || 'Ethiopian',
      address: cellToString(getRaw('address')),
      idDocumentType: normalizeIdDocumentType(cellToString(getRaw('idDocumentType'))),
      idDocumentNumber: cellToString(getRaw('idDocumentNumber')),
      idExpiryDate: expiryParsed.iso,
      courseInput: cellToString(getRaw('courseInput')),
      agreedFeeEtb: cellToString(getRaw('agreedFeeEtb')),
      enrollmentDate: enrollParsed.iso,
      paymentPlanInput: cellToString(getRaw('paymentPlanInput')) || 'FULL',
      customInstallments: cellToString(getRaw('customInstallments')),
      customIntervalDays: cellToString(getRaw('customIntervalDays')),
      initialPaymentAmount: cellToString(getRaw('initialPaymentAmount')),
      initialPaymentMethod: normalizePaymentMethod(cellToString(getRaw('initialPaymentMethod'))),
      initialTransactionRef: cellToString(getRaw('initialTransactionRef')),
      notes: cellToString(getRaw('notes')),
    };

    rawParsedRows.push({
      rowId: `bulk_row_${rIdx + 1}_${Math.random().toString(36).slice(2, 7)}`,
      rowNumber: rIdx + 1,
      fields,
      resolvedCourseId: '',
      resolvedCourseName: '',
      resolvedFeeEtb: 0,
      resolvedPaymentPlanCode: 'FULL',
      errors: [],
      warnings: [],
      isDuplicateIdInDb: false,
      isDuplicateIdInFile: false,
      isDuplicateTxRefInDb: false,
      isDuplicateTxRefInFile: false,
      selected: true,
      importStatus: 'READY',
    });
  }

  if (rawParsedRows.length === 0) {
    throw new Error('No non-empty student rows were found in the uploaded spreadsheet.');
  }

  if (rawParsedRows.length > 500) {
    throw new Error(
      `Spreadsheet contains ${rawParsedRows.length} rows. Maximum batch size is 500 students per upload.`
    );
  }

  // Run live Firestore duplicate ID lock & payment_refs checks in bounded parallel chunks
  const CONCURRENCY = 10;
  for (let i = 0; i < rawParsedRows.length; i += CONCURRENCY) {
    const chunk = rawParsedRows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((row) => checkLiveFirestoreDuplicatesForRow(row)));
    results.forEach((res, idx) => {
      chunk[idx].isDuplicateIdInDb = res.isDuplicateIdInDb;
      chunk[idx].duplicateIdDbInfo = res.duplicateIdDbInfo;
      chunk[idx].isDuplicateTxRefInDb = res.isDuplicateTxRefInDb;
    });
  }

  const validatedRows = revalidateAllBulkRows(rawParsedRows, context);

  return {
    fileName: file.name,
    sheetName: preferredSheetName,
    totalRows: validatedRows.length,
    recognizedColumns,
    unrecognizedColumns,
    rows: validatedRows,
  };
}

// ---------------------------------------------------------------------------
// 4. Execute Sequential Bulk Import Directly into AI Registration Schema
// ---------------------------------------------------------------------------

export async function executeBulkStudentImport(params: {
  rows: BulkParsedStudentRow[];
  courses: Course[];
  paymentPlans: PaymentPlan[];
  existingStudentsCount: number;
  actor: ActorContext;
  fileName: string;
  allowDuplicateOverride?: boolean;
  onRowUpdate: (rowId: string, patch: Partial<BulkParsedStudentRow>) => void;
  onProgress: (progress: BulkImportProgress) => void;
}): Promise<{
  succeeded: number;
  failed: number;
  importedCodes: string[];
}> {
  const {
    rows,
    courses,
    paymentPlans,
    existingStudentsCount,
    actor,
    fileName,
    allowDuplicateOverride = false,
    onRowUpdate,
    onProgress,
  } = params;

  if (actor.tenantStatus === 'SUSPENDED') {
    throw new Error(
      'This institute account is currently SUSPENDED. Contact ZACMA Platform Support before importing students.'
    );
  }

  const targetRows = rows.filter(
    (r) => r.selected && r.errors.length === 0 && r.importStatus === 'READY'
  );
  if (targetRows.length === 0) {
    throw new Error('No valid selected student rows are ready to import.');
  }

  if (
    actor.studentLimit &&
    actor.studentLimit > 0 &&
    existingStudentsCount + targetRows.length > actor.studentLimit
  ) {
    const remaining = Math.max(0, actor.studentLimit - existingStudentsCount);
    throw new Error(
      `SaaS student capacity exceeded: your plan allows ${actor.studentLimit} students (${remaining} slots remaining), but ${targetRows.length} rows are selected.`
    );
  }

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const planByCode = new Map(paymentPlans.map((p) => [p.code, p]));

  let succeeded = 0;
  let failed = 0;
  const importedCodes: string[] = [];

  onProgress({
    total: targetRows.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
  });

  for (let i = 0; i < targetRows.length; i++) {
    const row = targetRows[i];
    const f = row.fields;

    onRowUpdate(row.rowId, { importStatus: 'IMPORTING', importError: undefined });
    onProgress({
      total: targetRows.length,
      completed: i,
      succeeded,
      failed,
      currentRowNumber: row.rowNumber,
      currentStudentName: f.fullName,
    });

    try {
      const course = courseById.get(row.resolvedCourseId) || matchCourse(f.courseInput, courses);
      const plan =
        planByCode.get(row.resolvedPaymentPlanCode as PaymentPlan['code']) ||
        matchPaymentPlan(f.paymentPlanInput, paymentPlans);

      if (!course || !plan) {
        throw new Error('Course or payment plan could not be resolved.');
      }

      const initPayNum = Number(f.initialPaymentAmount.replace(/,/g, '').trim() || 0);
      const agreedFeeNum =
        f.agreedFeeEtb.trim() !== '' ? Number(f.agreedFeeEtb.replace(/,/g, '').trim()) : course.feeEtb;

      const summaryNote = [
        `Excel Bulk Import (${fileName.slice(0, 48)} · Row #${row.rowNumber})`,
        f.notes.trim(),
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 240);

      const res = await submitAiStudentRegistration(
        {
          fullName: f.fullName.trim(),
          address: f.address.trim(),
          phone: f.phone.trim(),
          altPhone: f.altPhone.trim() || undefined,
          email: f.email.trim() || undefined,
          dateOfBirth: f.dateOfBirth.trim() || undefined,
          gender: f.gender,
          nationality: f.nationality.trim() || 'Ethiopian',
          idDocumentType: f.idDocumentType,
          idDocumentNumber: f.idDocumentNumber.trim(),
          idExpiryDate: f.idExpiryDate.trim() || undefined,
          course,
          agreedFeeEtb: agreedFeeNum > 0 ? agreedFeeNum : course.feeEtb,
          enrollmentDate: f.enrollmentDate.trim() || todayAddisIsoDate(),
          paymentPlan: plan,
          customInstallments: f.customInstallments ? Number(f.customInstallments) : undefined,
          customIntervalDays: f.customIntervalDays ? Number(f.customIntervalDays) : undefined,
          initialPaymentAmount: initPayNum > 0 ? initPayNum : undefined,
          initialPaymentMethod: f.initialPaymentMethod,
          initialTransactionRef: initPayNum > 0 ? f.initialTransactionRef.trim() : undefined,
          ocrConfidence: 'MANUAL',
          ocrWarnings: row.warnings,
          ocrSummary: summaryNote,
          allowDuplicateOverride: actor.role === 'ADMIN' && allowDuplicateOverride,
          suppressIndividualNotification: true,
        },
        existingStudentsCount + succeeded,
        actor
      );

      succeeded += 1;
      importedCodes.push(res.studentCode);
      onRowUpdate(row.rowId, {
        importStatus: 'IMPORTED',
        assignedStudentCode: res.studentCode,
        assignedStudentId: res.studentId,
        selected: false,
      });
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : 'Failed to import student row.';
      onRowUpdate(row.rowId, {
        importStatus: 'FAILED',
        importError: msg,
      });
    }

    onProgress({
      total: targetRows.length,
      completed: i + 1,
      succeeded,
      failed,
      currentRowNumber: row.rowNumber,
      currentStudentName: f.fullName,
    });
  }

  // Write a single consolidated Admin notification + summary audit log for the batch
  if (succeeded > 0) {
    try {
      const now = new Date().toISOString();
      const tenantId = actor.tenantId || 'zacma_default';
      const batchId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const codePreview =
        importedCodes.length <= 3
          ? importedCodes.join(', ')
          : `${importedCodes[0]} – ${importedCodes[importedCodes.length - 1]}`;

      const wb = writeBatch(db);
      wb.set(doc(db, 'notifications', `not_${batchId}`), {
        tenantId,
        type: 'PENDING_REGISTRATION',
        title: `Bulk Excel Import: ${succeeded} Student${succeeded === 1 ? '' : 's'} Pending Approval`,
        message: `${actor.fullName} imported ${succeeded} student registration${succeeded === 1 ? '' : 's'} (${codePreview}) from "${fileName.slice(0, 60)}"${failed > 0 ? ` (${failed} failed)` : ''}. Pending Admin verification & approval.`,
        targetRole: 'ADMIN',
        actionSection: 'registrations',
        entityType: 'student',
        entityId: batchId,
        isRead: false,
        createdAt: now,
      });
      wb.set(doc(db, 'audit_logs', `aud_${batchId}`), {
        tenantId,
        actorId: actor.uid,
        actorName: actor.fullName.slice(0, 120),
        actorRole: actor.role,
        action: 'BULK_STUDENT_EXCEL_IMPORT',
        entityType: 'student',
        entityId: batchId,
        summary: `Bulk Excel import from "${fileName.slice(0, 80)}": ${succeeded} registered (${codePreview}), ${failed} failed. All records encrypted in ID vault and queued as PENDING.`,
        createdAt: now,
      });
      await wb.commit();
    } catch {
      // Non-fatal: individual student records and audit logs are already committed
    }
  }

  return { succeeded, failed, importedCodes };
}

// ---------------------------------------------------------------------------
// 5. Export Validation Errors or Full Import Results Workbook (.xlsx)
// ---------------------------------------------------------------------------

export function exportBulkImportResultsWorkbook(params: {
  rows: BulkParsedStudentRow[];
  mode: 'ERRORS_ONLY' | 'ALL_RESULTS';
  tenantName?: string;
}): void {
  const { rows, mode, tenantName = 'ZACMA' } = params;
  const filtered =
    mode === 'ERRORS_ONLY'
      ? rows.filter((r) => r.errors.length > 0 || r.importStatus === 'FAILED')
      : rows;

  const dataRows = filtered.map((r) => ({
    ExcelRow: r.rowNumber,
    ImportStatus: r.importStatus,
    AssignedStudentCode: r.assignedStudentCode || '',
    ValidationOrImportError: [...r.errors, r.importError || ''].filter(Boolean).join(' | '),
    Warnings: r.warnings.join(' | '),
    fullName: r.fields.fullName,
    phone: r.fields.phone,
    altPhone: r.fields.altPhone,
    email: r.fields.email,
    dateOfBirth: r.fields.dateOfBirth,
    gender: r.fields.gender,
    nationality: r.fields.nationality,
    address: r.fields.address,
    idDocumentType: r.fields.idDocumentType,
    idDocumentNumber: r.fields.idDocumentNumber,
    idExpiryDate: r.fields.idExpiryDate,
    courseNameOrCode: r.resolvedCourseName || r.fields.courseInput,
    agreedFeeEtb: r.resolvedFeeEtb || r.fields.agreedFeeEtb,
    enrollmentDate: r.fields.enrollmentDate,
    paymentPlanCode: r.resolvedPaymentPlanCode || r.fields.paymentPlanInput,
    initialPaymentAmount: r.fields.initialPaymentAmount,
    initialPaymentMethod: r.fields.initialPaymentMethod,
    initialTransactionRef: r.fields.initialTransactionRef,
    notes: r.fields.notes,
  }));

  const ws = XLSX.utils.json_to_sheet(dataRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    mode === 'ERRORS_ONLY' ? 'Invalid Rows To Fix' : 'Bulk Import Results'
  );
  const safeSlug =
    tenantName
      .trim()
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 28) || 'ZACMA';
  const suffix = mode === 'ERRORS_ONLY' ? 'Invalid_Rows' : 'Import_Results';
  XLSX.writeFile(wb, `${safeSlug}_Bulk_Student_${suffix}_${todayAddisIsoDate()}.xlsx`);
}
