import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { ActorContext } from './zacmaService';
import {
  Enrollment,
  FinancialAdjustmentType,
  LoginHistoryRecord,
  PaymentInstallment,
  RoleCode,
  SecurityConfig,
  todayIsoDate,
} from '../types/zacma';

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  id: 'default',
  adminTimeoutMinutes: 10,
  userTimeoutMinutes: 15,
  warningBeforeSeconds: 60,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
  enforceAuditOnExports: true,
  updatedAt: new Date().toISOString(),
};

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function cleanObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

export async function saveSecurityConfig(
  input: Omit<SecurityConfig, 'id' | 'updatedAt' | 'updatedBy' | 'updatedByName'>,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can update security and session timeout policies.');
  }
  const now = new Date().toISOString();
  const sanitized = {
    adminTimeoutMinutes: Math.max(1, Math.min(120, Math.round(input.adminTimeoutMinutes))),
    userTimeoutMinutes: Math.max(1, Math.min(120, Math.round(input.userTimeoutMinutes))),
    warningBeforeSeconds: Math.max(15, Math.min(300, Math.round(input.warningBeforeSeconds))),
    maxFailedLogins: Math.max(3, Math.min(20, Math.round(input.maxFailedLogins))),
    lockoutMinutes: Math.max(1, Math.min(120, Math.round(input.lockoutMinutes))),
    enforceAuditOnExports: Boolean(input.enforceAuditOnExports),
    updatedBy: actor.uid,
    updatedByName: actor.fullName.slice(0, 120),
    updatedAt: now,
  };

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'security_config', 'default'), sanitized);
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'SECURITY_POLICY_UPDATED',
      entityType: 'security',
      entityId: 'default',
      summary: `Updated session & lockout policy: Admin/Accountant timeout ${sanitized.adminTimeoutMinutes}m, Standard user timeout ${sanitized.userTimeoutMinutes}m, Lockout ${sanitized.maxFailedLogins} failures -> ${sanitized.lockoutMinutes}m.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'security_config/default');
  }
}

export async function recordLoginHistoryEvent(params: {
  userId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  eventType: LoginHistoryRecord['eventType'];
  authMethod: LoginHistoryRecord['authMethod'];
  sessionId?: string;
  detail?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const entryId = makeId('auth');
  const ua =
    typeof navigator !== 'undefined' && navigator.userAgent
      ? navigator.userAgent.slice(0, 220)
      : 'Browser';

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'login_history', entryId),
      cleanObject({
        userId: params.userId,
        email: params.email.slice(0, 160),
        fullName: params.fullName.slice(0, 120),
        role: params.role,
        eventType: params.eventType,
        authMethod: params.authMethod,
        userAgent: ua,
        sessionId: params.sessionId?.slice(0, 128),
        detail: params.detail?.slice(0, 300),
        createdAt: now,
      })
    );

    const actionMap: Record<LoginHistoryRecord['eventType'], string> = {
      LOGIN: 'USER_LOGIN',
      LOGOUT: 'USER_LOGOUT',
      SESSION_EXPIRED: 'SESSION_EXPIRED',
      FAILED_LOGIN: 'FAILED_LOGIN',
      LOCKOUT: 'ACCOUNT_LOCKED',
    };

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: params.userId,
      actorName: params.fullName.slice(0, 120),
      actorRole: params.role,
      action: actionMap[params.eventType],
      entityType: 'session',
      entityId: params.sessionId || entryId,
      summary: (
        params.detail ||
        `${params.fullName} (${params.role}) — ${params.eventType} via ${params.authMethod}.`
      ).slice(0, 400),
      createdAt: now,
    });

    await batch.commit();
  } catch {
    // Non-fatal: never block login/logout UX if audit logging fails transiently
  }
}

export async function recordExcelExportAudit(params: {
  reportKey: string;
  reportTitle: string;
  fileName: string;
  rowCount: number;
  filterSummary: string;
  actor: ActorContext;
}): Promise<void> {
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'audit_logs', makeId('aud')), {
      actorId: params.actor.uid,
      actorName: params.actor.fullName.slice(0, 120),
      actorRole: params.actor.role,
      action: 'EXCEL_REPORT_EXPORTED',
      entityType: 'report',
      entityId: params.reportKey.slice(0, 128),
      summary: `Exported "${params.reportTitle}" (${params.fileName}, ${params.rowCount} rows). Filters: ${params.filterSummary}`.slice(
        0,
        400
      ),
      createdAt: now,
    });
  } catch {
    // Do not crash export download if audit logging fails
  }
}

/**
 * Controlled Financial Adjustment (Refund, Reversal, Scholarship Discount, or Fee Adjustment).
 * Approved payments are NEVER deleted; instead an immutable adjustment record is appended and
 * the enrollment's official balance & installment allocations are recalculated atomically.
 */
export async function recordFinancialAdjustment(
  input: {
    enrollment: Enrollment;
    installments: PaymentInstallment[];
    type: FinancialAdjustmentType;
    amountEtb: number;
    effectiveDate: string;
    reason: string;
    paymentId?: string;
  },
  actor: ActorContext
): Promise<{ adjustmentRef: string }> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can authorize financial refunds, reversals, or adjustments.');
  }
  const amount = Number(input.amountEtb);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Adjustment amount must be greater than zero ETB.');
  }
  const reason = input.reason.trim();
  if (reason.length < 4) {
    throw new Error('Please provide a clear audit reason (minimum 4 characters).');
  }

  if (
    (input.type === 'REFUND' || input.type === 'REVERSAL') &&
    amount > input.enrollment.approvedPaidEtb + 0.01
  ) {
    throw new Error(
      `Refund/reversal amount (ETB ${amount.toLocaleString()}) cannot exceed approved paid total (ETB ${input.enrollment.approvedPaidEtb.toLocaleString()}).`
    );
  }
  if (
    input.type === 'SCHOLARSHIP_DISCOUNT' &&
    amount >= input.enrollment.agreedFeeEtb
  ) {
    throw new Error('Scholarship discount must be less than the total agreed course fee.');
  }

  const now = new Date().toISOString();
  const today = todayIsoDate();
  const adjustmentId = makeId('adj');
  const adjustmentRef = `ADJ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

  let nextAgreedFee = Number(input.enrollment.agreedFeeEtb);
  let nextApprovedPaid = Number(input.enrollment.approvedPaidEtb);

  if (input.type === 'REFUND' || input.type === 'REVERSAL') {
    nextApprovedPaid = Math.max(0, Number((nextApprovedPaid - amount).toFixed(2)));
  } else if (input.type === 'SCHOLARSHIP_DISCOUNT') {
    nextAgreedFee = Math.max(1, Number((nextAgreedFee - amount).toFixed(2)));
  } else if (input.type === 'FEE_ADJUSTMENT') {
    nextAgreedFee = Number((nextAgreedFee + amount).toFixed(2));
  }

  const nextRemaining = Math.max(0, Number((nextAgreedFee - nextApprovedPaid).toFixed(2)));
  const nextStatus =
    nextRemaining <= 0.01
      ? 'COMPLETED'
      : input.enrollment.status === 'COMPLETED'
      ? 'ACTIVE'
      : input.enrollment.status;

  try {
    const batch = writeBatch(db);

    batch.set(
      doc(db, 'financial_adjustments', adjustmentId),
      cleanObject({
        adjustmentRef,
        enrollmentId: input.enrollment.id,
        studentId: input.enrollment.studentId,
        studentCode: input.enrollment.studentCode,
        studentName: input.enrollment.studentName,
        courseId: input.enrollment.courseId,
        courseName: input.enrollment.courseName,
        paymentId: input.paymentId,
        type: input.type,
        amountEtb: Number(amount.toFixed(2)),
        effectiveDate: input.effectiveDate || today,
        reason: reason.slice(0, 400),
        approvedBy: actor.uid,
        approvedByName: actor.fullName.slice(0, 120),
        createdAt: now,
      })
    );

    batch.update(doc(db, 'enrollments', input.enrollment.id), {
      agreedFeeEtb: nextAgreedFee,
      approvedPaidEtb: nextApprovedPaid,
      remainingBalanceEtb: nextRemaining,
      status: nextStatus,
      updatedAt: now,
    });

    // Re-allocate installments sequentially against updated net paid balance
    const sortedInsts = [...input.installments]
      .filter((i) => i.enrollmentId === input.enrollment.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    let pool = nextApprovedPaid;
    for (const inst of sortedInsts) {
      const paidForInst = Math.min(inst.amountDueEtb, Math.max(0, Number(pool.toFixed(2))));
      pool = Math.max(0, pool - paidForInst);
      let status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE' = 'UNPAID';
      if (paidForInst >= inst.amountDueEtb - 0.01) {
        status = 'PAID';
      } else if (paidForInst > 0) {
        status = 'PARTIAL';
      } else if (inst.dueDate < today) {
        status = 'OVERDUE';
      }
      if (paidForInst !== inst.amountPaidEtb || status !== inst.status) {
        batch.update(doc(db, 'payment_installments', inst.id), {
          amountPaidEtb: Number(paidForInst.toFixed(2)),
          status,
          updatedAt: now,
        });
      }
    }

    batch.set(
      doc(db, 'notifications', makeId('not_adj')),
      cleanObject({
        type: 'OUTSTANDING_BALANCE',
        title: `Account Financial Adjustment (${adjustmentRef})`,
        message: `${input.type.replace('_', ' ')} of ETB ${amount.toLocaleString()} applied to ${input.enrollment.courseName}. Updated remaining balance: ETB ${nextRemaining.toLocaleString()}.`,
        targetRole: 'STUDENT',
        category: 'PAYMENTS',
        entityType: 'financial_adjustment',
        entityId: adjustmentId,
        studentId: input.enrollment.studentId,
        studentCode: input.enrollment.studentCode,
        studentName: input.enrollment.studentName,
        courseName: input.enrollment.courseName,
        expectedAmountEtb: nextAgreedFee,
        paidAmountEtb: nextApprovedPaid,
        remainingBalanceEtb: nextRemaining,
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: `FINANCIAL_${input.type}`,
      entityType: 'financial_adjustment',
      entityId: adjustmentId,
      summary: `${input.type} ${adjustmentRef} (ETB ${amount.toLocaleString()}) for ${input.enrollment.studentName} (${input.enrollment.studentCode}). Reason: ${reason}. New remaining balance: ETB ${nextRemaining.toLocaleString()}.`.slice(
        0,
        400
      ),
      createdAt: now,
    });

    await batch.commit();
    return { adjustmentRef };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'financial_adjustments');
    throw error;
  }
}
