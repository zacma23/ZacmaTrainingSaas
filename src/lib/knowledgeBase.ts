import type { RoleCode } from '../types/zacma.ts';

export interface KnowledgeArticle {
  id: string;
  topic: string;
  allowedRoles: RoleCode[];
  summary: string;
  procedures: string[];
}

export const ZACMA_KNOWLEDGE_BASE: KnowledgeArticle[] = [
  {
    id: 'kb_dashboard',
    topic: 'Dashboard Navigation & Role Architecture',
    allowedRoles: ['ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF', 'STUDENT'],
    summary:
      'ZACMA Technology & Training Institute Portal uses strict Role-Based Access Control across five roles: Admin, Accountant, Instructor, General Staff, and Student.',
    procedures: [
      'Use the dark navy left sidebar to move between authorized modules. Restricted modules are automatically hidden and blocked at the database layer.',
      'Admins have access to the top-bar "View as" role preview bar to inspect Accountant, Instructor, General Staff, and Student workspaces without losing Admin status.',
      'The top-bar notification bell opens the Notification Center showing unread counts, payment deadlines, overdue alerts, and approval requests.',
    ],
  },
  {
    id: 'kb_student_registration',
    topic: 'Student Registration & Admin Approval',
    allowedRoles: ['ADMIN', 'ACCOUNTANT', 'GENERAL_STAFF'],
    summary:
      'Students are registered by Accountants or Admins with an auto-generated institutional ID (ZAC-YYYY-NNNN) and require Admin approval before becoming active enrollments.',
    procedures: [
      'Open Students > click "Register New Student".',
      'Fill Full Name, Gender, Phone, Optional Alt Phone, Address, upload a square Student Photo, select a Training Course (fee locks automatically in ETB), choose Enrollment Date and Payment Plan (Full, Monthly, Two-Month, Three-Month, Six-Month, or Custom).',
      'Optionally submit an initial registration fee payment with a unique transaction reference; it enters Pending status.',
      'An Administrator reviews pending registrations under Approvals Queue (or inline in Students) and clicks Approve & Activate or Reject with an audit reason.',
    ],
  },
  {
    id: 'kb_course_management',
    topic: 'Course Management & Tuition Fees',
    allowedRoles: ['ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF'],
    summary:
      'Admins manage ZACMA courses including Graphics Design, Digital Marketing, Computer Basics, Computer Maintenance, Web Development, Photography and Videography, Language Courses, and custom short-term training.',
    procedures: [
      'Only Admins can create or edit courses, tuition fees (ETB), schedules, durations, and assigned instructors.',
      'Accountants see course fees as read-only reference schedules and cannot modify tuition amounts.',
      'Instructors and General Staff see course schedules and enrolled student counts without financial fee details.',
    ],
  },
  {
    id: 'kb_payment_recording',
    topic: 'Recording Student Payments & Duplicate Prevention',
    allowedRoles: ['ADMIN', 'ACCOUNTANT'],
    summary:
      'Accountants and Admins record tuition payments in ETB (Cash, CBE Birr, Telebirr, Bank Transfer, Check). Every submission requires a globally unique transaction reference and starts in Pending status.',
    procedures: [
      'Open Fees & Payments > click "Record Student Payment".',
      'Choose the student enrollment to inspect live Agreed Fee, Approved Paid, and Remaining Balance.',
      'Enter the Amount in ETB, Payment Date, Payment Method, and Unique Transaction Reference (duplicates are blocked by the database).',
      'Pending payments NEVER inflate official collected income or reduce a student balance until an Admin approves them.',
    ],
  },
  {
    id: 'kb_payment_approval',
    topic: 'Maker-Checker Payment Approval Workflow',
    allowedRoles: ['ADMIN', 'ACCOUNTANT'],
    summary:
      'Only Administrators can approve or reject submitted payments. Accountants cannot approve their own transactions or modify approved records.',
    procedures: [
      'Admins open Approvals Queue > Payment Submissions tab.',
      'Verify the student, amount, payment method, and bank/transfer reference slip.',
      'Click "Approve & Issue Receipt" to atomically mark the payment Approved, update official revenue and student remaining balance, allocate covered installments, clear overdue alerts, issue an immutable receipt (RCP-YYYY-NNNN), and write an audit log.',
      'Click "Reject" with a mandatory reason if verification fails; the Accountant receives a Rejected Payment notification.',
    ],
  },
  {
    id: 'kb_receipt_generation',
    topic: 'Official Printable Receipts',
    allowedRoles: ['ADMIN', 'ACCOUNTANT', 'STUDENT'],
    summary:
      'Official QR-verified ZACMA receipts (RCP-YYYY-NNNN) are generated strictly for Approved payments and display previous balance, amount paid, remaining balance, payment method, and authorized signature.',
    procedures: [
      'Open Official Receipts (or click Print Receipt on any Approved payment row in Fees & Payments).',
      'Students access their own approved receipts inside the Student Notification & Fee Portal.',
      'Click "Print Official Receipt" to print an A4/A5 clean institutional receipt with a scannable QR verification code.',
    ],
  },
  {
    id: 'kb_accounting',
    topic: 'Accounting, Expenses & Financial Reports (ETB)',
    allowedRoles: ['ADMIN', 'ACCOUNTANT'],
    summary:
      'Accounting & Reports provides Daily, Weekly, Monthly, Annual, and All-Time Cash-Flow statements, Expense & Category management, Revenue by Course analytics, and Outstanding Student Balances in Ethiopian Birr (ETB).',
    procedures: [
      'Official income strictly sums Approved payments only; Pending payments are shown separately as excluded.',
      'Admins can add Expense Categories and record or remove operational expenses (all logged in the immutable Audit Trail).',
      'Use "Export CSV" on Cash-Flow, Outstanding Balances, Attendance, or Audit Logs for external spreadsheet reconciliation.',
    ],
  },
  {
    id: 'kb_attendance',
    topic: 'Daily Class Attendance & Reports',
    allowedRoles: ['ADMIN', 'INSTRUCTOR', 'ACCOUNTANT', 'GENERAL_STAFF'],
    summary:
      'Instructors and Admins record daily attendance (Present, Absent, Late, Excused) for active approved enrollments and generate reports by student, course, and date.',
    procedures: [
      'Open Attendance > Daily Attendance Roster tab.',
      'Select a Training Class and Session Date, mark each student Present, Absent, Late, or Excused with optional remarks, and click "Save Daily Attendance".',
      'Switch to Attendance Reports to view per-student attendance percentages and export CSV records.',
    ],
  },
  {
    id: 'kb_staff_management',
    topic: 'Employee Management & Audit Trail',
    allowedRoles: ['ADMIN'],
    summary:
      'Admins manage staff profiles across Admin, Accountant, Instructor, General Staff, and Student roles and monitor an append-only immutable Audit Trail.',
    procedures: [
      'Open Staff & Roles to add staff members, update role assignments, or suspend accounts.',
      'Open Audit Logs to search and export chronological financial and governance events; audit records cannot be edited or deleted.',
    ],
  },
  {
    id: 'kb_reminders_and_notifications',
    topic: 'Automatic Student Payment Reminders & Student Portal',
    allowedRoles: ['ADMIN', 'ACCOUNTANT', 'GENERAL_STAFF', 'STUDENT'],
    summary:
      'The automated reminder engine evaluates installment deadlines against Approved payments only, marking uncovered past-due installments as Overdue and sending deduplicated alerts without duplicating notifications.',
    procedures: [
      'Upcoming reminders trigger before the installment due date, Due Today triggers on the due date, and Overdue triggers once the deadline passes without sufficient Approved payment.',
      'Overdue reminders repeat at the configured interval (default every 3 days) and stop automatically the moment an Admin approves a payment covering the installment.',
      'Students log in to their isolated Student Portal to check upcoming due dates, overdue alerts, remaining ETB balance, payment history, and printable approved receipts.',
      'Notification Preferences allow managing In-App alerts and checking configuration readiness for optional Email, SMS, and WhatsApp delivery providers.',
    ],
  },
];

export function buildKnowledgeContextForRole(role: RoleCode): string {
  const articles = ZACMA_KNOWLEDGE_BASE.filter((a) => a.allowedRoles.includes(role));
  return articles
    .map(
      (a) =>
        `### ${a.topic}\n${a.summary}\nProcedures:\n${a.procedures.map((p) => `- ${p}`).join('\n')}`
    )
    .join('\n\n');
}
