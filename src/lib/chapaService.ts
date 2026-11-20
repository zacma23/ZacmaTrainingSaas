import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { computeNextReceiptNumber, ActorContext } from './zacmaService';
import { dispatchSmsMessage } from './communicationService';
import {
  ChapaPaymentStatus,
  ChapaTransaction,
  ChapaTransactionSource,
  DirectoryUser,
  Enrollment,
  PaymentInstallment,
  SmsLog,
  SmsSystemConfig,
  Student,
  generateVerificationHash,
  sanitizeRefId,
  todayIsoDate,
} from '../types/zacma';

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

export interface ChapaGatewayStatus {
  configured: boolean;
  mode: 'LIVE' | 'TEST' | 'UNCONFIGURED';
  publicKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  encryptionKeyConfigured: boolean;
  webhookSecretConfigured?: boolean;
  publicKeyPreview: string | null;
  secretKeyPreview: string | null;
  webhookUrl: string;
  callbackPath: string;
  returnUrlPattern: string;
  currency: string;
  checkedAt?: string;
}

export async function fetchChapaGatewayStatus(): Promise<ChapaGatewayStatus> {
  const res = await fetch('/api/chapa/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Unable to check Chapa gateway status (HTTP ${res.status}).`);
  }
  return (await res.json()) as ChapaGatewayStatus;
}

export interface InitializeChapaPaymentInput {
  student: Student;
  enrollment: Enrollment;
  amountEtb: number;
  studentEmail?: string;
  source: ChapaTransactionSource;
  sendSms?: boolean;
  sendInternalMessage?: boolean;
  smsConfig?: SmsSystemConfig;
  existingSmsLogs?: SmsLog[];
  directoryUsers?: DirectoryUser[];
}

export interface InitializeChapaPaymentResult {
  transaction: ChapaTransaction;
  checkoutUrl: string;
  smsDetail?: string;
}

export async function initializeChapaPayment(
  input: InitializeChapaPaymentInput,
  actor: ActorContext
): Promise<InitializeChapaPaymentResult> {
  const amount = Number(input.amountEtb);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than 0 ETB.');
  }
  if (amount > input.enrollment.remainingBalanceEtb + 0.01) {
    throw new Error(
      `Payment amount (ETB ${amount.toLocaleString()}) cannot exceed outstanding balance (ETB ${input.enrollment.remainingBalanceEtb.toLocaleString()}).`
    );
  }
  if (input.source === 'PAYMENT_LINK' && actor.role !== 'ADMIN' && actor.role !== 'ACCOUNTANT') {
    throw new Error('Only Administrators and Accountants can generate student payment links.');
  }

  const returnBaseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;

  const initRes = await fetch('/api/chapa/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: input.student.id,
      studentCode: input.student.studentCode,
      studentName: input.student.fullName,
      studentEmail: input.studentEmail,
      studentPhone: input.student.phone,
      courseId: input.enrollment.courseId,
      courseName: input.enrollment.courseName,
      enrollmentId: input.enrollment.id,
      amountEtb: Number(amount.toFixed(2)),
      currency: 'ETB',
      source: input.source,
      returnBaseUrl,
    }),
  });

  const initData = (await initRes.json().catch(() => ({}))) as {
    ok?: boolean;
    txRef?: string;
    checkoutUrl?: string;
    amountEtb?: number;
    expiresAt?: string;
    error?: string;
    errorCode?: string;
  };

  if (!initRes.ok || !initData.ok || !initData.txRef || !initData.checkoutUrl) {
    throw new Error(
      initData.error ||
        'Chapa payment initialization failed. Ensure CHAPA_SECRET_KEY is configured on the server.'
    );
  }

  const now = new Date().toISOString();
  const txId = sanitizeRefId(initData.txRef);
  const txDoc: ChapaTransaction = {
    id: txId,
    txRef: initData.txRef,
    studentId: input.student.id,
    studentCode: input.student.studentCode,
    studentName: input.student.fullName.slice(0, 120),
    studentPhone: input.student.phone?.slice(0, 30),
    studentEmail: input.studentEmail?.slice(0, 160),
    courseId: input.enrollment.courseId,
    courseName: input.enrollment.courseName.slice(0, 120),
    enrollmentId: input.enrollment.id,
    amountEtb: Number(amount.toFixed(2)),
    currency: 'ETB',
    paymentMethod: 'Chapa',
    source: input.source,
    checkoutUrl: initData.checkoutUrl.slice(0, 1000),
    paymentStatus: 'INITIATED',
    approvalStatus: 'AWAITING_APPROVAL',
    expiresAt: initData.expiresAt,
    createdBy: actor.uid,
    createdByName: actor.fullName.slice(0, 120),
    createdByRole: actor.role,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const batch = writeBatch(db);
    const { id: _ignoreId, ...persistPayload } = txDoc;
    batch.set(doc(db, 'chapa_transactions', txId), cleanObject(persistPayload));

    if (input.source === 'PAYMENT_LINK') {
      const linkMsg = `Dear ${input.student.fullName}, your ZACMA Technology training fee payment link is ready. Amount: ${amount.toLocaleString()} ETB. Please complete your payment using the provided link.`;
      batch.set(
        doc(db, 'notifications', makeId('not_chapa_link')),
        cleanObject({
          type: 'CHAPA_PAYMENT_LINK',
          title: `Online Payment Link Ready — ETB ${amount.toLocaleString()}`,
          message: linkMsg.slice(0, 420),
          targetRole: 'STUDENT',
          category: 'FINANCE',
          actionSection: 'payments',
          studentId: input.student.id,
          studentCode: input.student.studentCode,
          studentName: input.student.fullName.slice(0, 120),
          courseName: input.enrollment.courseName.slice(0, 120),
          expectedAmountEtb: amount,
          remainingBalanceEtb: input.enrollment.remainingBalanceEtb,
          paymentStatus: 'INITIATED',
          dedupKey: `CHAPA_LINK|${txDoc.txRef}`,
          entityType: 'chapa_transaction',
          entityId: txId,
          isRead: false,
          createdAt: now,
        })
      );
    }

    batch.set(doc(db, 'audit_logs', makeId('aud_chapa_init')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action:
        input.source === 'PAYMENT_LINK'
          ? 'CHAPA_PAYMENT_LINK_GENERATED'
          : 'CHAPA_PAYMENT_INITIATED',
      entityType: 'chapa_transaction',
      entityId: txId,
      summary: `${
        input.source === 'PAYMENT_LINK' ? 'Generated Chapa payment link' : 'Initiated Chapa checkout'
      } ${txDoc.txRef} for ${input.student.fullName} (${input.student.studentCode}) — ETB ${amount.toLocaleString()}.`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chapa_transactions/${txId}`);
  }

  // Non-blocking SMS + Internal Messaging dispatch when staff generates a payment link
  let smsDetail: string | undefined;
  if (input.source === 'PAYMENT_LINK') {
    if (input.sendSms && input.smsConfig && input.student.phone) {
      const smsBody = `Dear ${input.student.fullName}, your ZACMA Technology training fee payment link is ready. Amount: ${amount.toLocaleString()} ETB. Please complete your payment using the provided link: ${txDoc.checkoutUrl}`;
      const smsRes = await dispatchSmsMessage(
        {
          eventType: 'PAYMENT_REMINDER',
          recipientName: input.student.fullName,
          recipientPhone: input.student.phone,
          messageBody: smsBody,
          studentId: input.student.id,
          studentCode: input.student.studentCode,
          courseName: input.enrollment.courseName,
          dedupKey: `SMS_CHAPA_LINK|${txDoc.txRef}`,
          config: input.smsConfig,
          existingLogs: input.existingSmsLogs,
        },
        actor
      );
      smsDetail = smsRes.detail;
    }

    // Optional internal message if the student has an active portal account in directoryUsers
    if (input.sendInternalMessage && input.directoryUsers) {
      const studentDir = input.directoryUsers.find(
        (u) => u.linkedStudentId === input.student.id && u.isActive
      );
      if (studentDir && studentDir.uid !== actor.uid) {
        try {
          const sortedIds = [actor.uid, studentDir.uid].sort();
          const convId = `direct_${sortedIds[0].slice(0, 24)}_${sortedIds[1].slice(0, 24)}`;
          const msgBody = `Dear ${input.student.fullName}, your ZACMA Technology training fee payment link is ready. Amount: ${amount.toLocaleString()} ETB (${input.enrollment.courseName}). Reference: ${txDoc.txRef}. Checkout link: ${txDoc.checkoutUrl}`;
          const convRef = doc(db, 'conversations', convId);
          const convSnap = await getDoc(convRef);
          const msgBatch = writeBatch(db);
          if (!convSnap.exists()) {
            msgBatch.set(convRef, {
              type: 'DIRECT',
              title: `${actor.fullName} & ${studentDir.fullName}`.slice(0, 140),
              participantIds: sortedIds,
              participantLabels: [
                `${actor.uid}|${actor.fullName.slice(0, 60)}|${actor.role}`,
                `${studentDir.uid}|${studentDir.fullName.slice(0, 60)}|${studentDir.role}`,
              ],
              createdBy: actor.uid,
              createdByName: actor.fullName.slice(0, 120),
              createdByRole: actor.role,
              lastMessageText: msgBody.slice(0, 280),
              lastMessageAt: now,
              lastMessageBy: actor.uid,
              lastMessageByName: actor.fullName.slice(0, 120),
              readByUids: [actor.uid],
              createdAt: now,
              updatedAt: now,
            });
          } else {
            msgBatch.update(convRef, {
              lastMessageText: msgBody.slice(0, 280),
              lastMessageAt: now,
              lastMessageBy: actor.uid,
              lastMessageByName: actor.fullName.slice(0, 120),
              readByUids: [actor.uid],
              updatedAt: now,
            });
          }
          msgBatch.set(doc(db, 'conversations', convId, 'messages', makeId('msg')), {
            conversationId: convId,
            senderId: actor.uid,
            senderName: actor.fullName.slice(0, 120),
            senderRole: actor.role,
            body: msgBody.slice(0, 2000),
            readByUids: [actor.uid],
            createdAt: now,
          });
          await msgBatch.commit();
        } catch {
          // Non-fatal: link is still recorded and portal notification already sent
        }
      }
    }
  }

  return {
    transaction: txDoc,
    checkoutUrl: initData.checkoutUrl,
    smsDetail,
  };
}

export interface VerifyChapaOutcome {
  verified: boolean;
  alreadyVerified?: boolean;
  paymentStatus: ChapaPaymentStatus;
  summary: string;
}

export async function verifyChapaTransaction(
  tx: ChapaTransaction,
  actor: ActorContext
): Promise<VerifyChapaOutcome> {
  // Strict idempotency: never double-verify an already verified or approved transaction
  if (tx.approvalStatus === 'APPROVED') {
    return {
      verified: true,
      alreadyVerified: true,
      paymentStatus: 'VERIFIED',
      summary: `Transaction ${tx.txRef} is already verified and approved (Receipt ${tx.receiptNumber || 'issued'}).`,
    };
  }
  if (tx.paymentStatus === 'VERIFIED') {
    return {
      verified: true,
      alreadyVerified: true,
      paymentStatus: 'VERIFIED',
      summary: `Transaction ${tx.txRef} was already verified with Chapa and is awaiting administrative approval.`,
    };
  }

  const res = await fetch('/api/chapa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txRef: tx.txRef,
      expectedAmountEtb: tx.amountEtb,
      expectedCurrency: tx.currency,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    verified?: boolean;
    paymentStatus?: ChapaPaymentStatus;
    chapaReference?: string;
    chapaChannel?: string;
    chapaFeeEtb?: number;
    paymentDate?: string;
    verifiedAt?: string;
    verificationProof?: string;
    verificationSummary?: string;
    error?: string;
  };

  if (!res.ok && res.status === 503) {
    throw new Error(
      data.error ||
        'Chapa verification requires CHAPA_SECRET_KEY configured on the server.'
    );
  }

  const now = new Date().toISOString();
  const nextStatus: ChapaPaymentStatus = data.verified
    ? 'VERIFIED'
    : data.paymentStatus || 'PENDING_VERIFICATION';
  const summary =
    data.verificationSummary ||
    data.error ||
    (nextStatus === 'VERIFIED'
      ? `Verified directly with Chapa API (${tx.txRef}).`
      : 'Payment has not yet completed at Chapa.');

  try {
    const batch = writeBatch(db);
    const updateFields = cleanObject({
      paymentStatus: nextStatus,
      chapaReference: data.chapaReference?.slice(0, 120),
      chapaChannel: data.chapaChannel?.slice(0, 80),
      chapaFeeEtb: typeof data.chapaFeeEtb === 'number' ? data.chapaFeeEtb : undefined,
      verificationProof: data.verificationProof?.slice(0, 128),
      verificationSummary: summary.slice(0, 400),
      paymentDate: data.paymentDate?.slice(0, 20),
      verifiedAt: nextStatus === 'VERIFIED' ? data.verifiedAt || now : undefined,
      updatedAt: now,
    });
    batch.update(doc(db, 'chapa_transactions', tx.id), updateFields);

    if (nextStatus === 'VERIFIED') {
      // Exact required Student notification
      batch.set(
        doc(db, 'notifications', makeId('not_chapa_ver_stu')),
        cleanObject({
          type: 'CHAPA_PAYMENT_VERIFIED',
          title: `Chapa Payment Received — Awaiting Approval`,
          message: `Your payment of ${tx.amountEtb.toLocaleString()} ETB has been received successfully and is awaiting administrative approval.`,
          targetRole: 'STUDENT',
          category: 'FINANCE',
          actionSection: 'payments',
          studentId: tx.studentId,
          studentCode: tx.studentCode,
          studentName: tx.studentName,
          courseName: tx.courseName,
          paidAmountEtb: tx.amountEtb,
          paymentStatus: 'VERIFIED',
          dedupKey: `CHAPA_VER_STU|${tx.txRef}`,
          entityType: 'chapa_transaction',
          entityId: tx.id,
          isRead: false,
          createdAt: now,
        })
      );

      // Exact required Admin notification
      batch.set(
        doc(db, 'notifications', makeId('not_chapa_ver_adm')),
        cleanObject({
          type: 'CHAPA_PAYMENT_VERIFIED',
          title: `Chapa Payment Verified — Approval Required`,
          message: `${tx.studentName} (${tx.studentCode}) completed a verified Chapa payment of ETB ${tx.amountEtb.toLocaleString()} for ${tx.courseName} (${tx.txRef}). Review and approve to update balance & issue receipt.`,
          targetRole: 'ADMIN',
          category: 'FINANCE',
          actionSection: 'chapa',
          studentId: tx.studentId,
          studentCode: tx.studentCode,
          studentName: tx.studentName,
          courseName: tx.courseName,
          paidAmountEtb: tx.amountEtb,
          paymentStatus: 'VERIFIED',
          dedupKey: `CHAPA_VER_ADM|${tx.txRef}`,
          entityType: 'chapa_transaction',
          entityId: tx.id,
          isRead: false,
          createdAt: now,
        })
      );
    }

    batch.set(doc(db, 'audit_logs', makeId('aud_chapa_ver')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: nextStatus === 'VERIFIED' ? 'CHAPA_PAYMENT_VERIFIED' : 'CHAPA_VERIFICATION_CHECKED',
      entityType: 'chapa_transaction',
      entityId: tx.id,
      summary: `Chapa verification for ${tx.txRef} (${tx.studentName}, ETB ${tx.amountEtb.toLocaleString()}): ${nextStatus}. ${summary.slice(0, 180)}`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chapa_transactions/${tx.id}`);
  }

  return {
    verified: nextStatus === 'VERIFIED',
    paymentStatus: nextStatus,
    summary,
  };
}

export async function approveChapaTransaction(params: {
  tx: ChapaTransaction;
  enrollment: Enrollment;
  installments: PaymentInstallment[];
  studentPhone?: string;
  existingReceiptsCount: number;
  approvalNotes?: string;
  smsConfig?: SmsSystemConfig;
  existingSmsLogs?: SmsLog[];
  actor: ActorContext;
}): Promise<{ receiptNumber: string; paymentId: string; receiptId: string }> {
  const { tx, enrollment, installments, actor } = params;
  if (actor.role !== 'ADMIN') {
    throw new Error('Only Administrators can approve online Chapa payments.');
  }
  if (tx.paymentStatus !== 'VERIFIED') {
    throw new Error(
      'Only server-verified Chapa transactions can be approved. Click "Verify with Chapa" first.'
    );
  }
  if (tx.approvalStatus !== 'AWAITING_APPROVAL') {
    throw new Error(`This transaction has already been ${tx.approvalStatus.toLowerCase()}.`);
  }

  // Strict idempotency lock check against payment_refs
  const refLockId = sanitizeRefId(tx.txRef);
  const existingLock = await getDoc(doc(db, 'payment_refs', refLockId));
  if (existingLock.exists()) {
    throw new Error(
      `Transaction reference "${tx.txRef}" has already been posted to the official ledger. Duplicate approval blocked.`
    );
  }

  const now = new Date().toISOString();
  const today = todayIsoDate();
  const paymentDate = tx.paymentDate || today;
  const paymentId = makeId('pay_chapa');
  const receiptId = makeId('rcp');
  const receiptNumber = computeNextReceiptNumber(params.existingReceiptsCount);

  const previousBalance = Math.max(0, Number(enrollment.remainingBalanceEtb));
  const newApprovedPaid = Number((enrollment.approvedPaidEtb + tx.amountEtb).toFixed(2));
  const newRemaining = Math.max(0, Number((enrollment.agreedFeeEtb - newApprovedPaid).toFixed(2)));
  const newEnrollmentStatus =
    newRemaining <= 0
      ? 'COMPLETED'
      : enrollment.status === 'PENDING'
      ? 'ACTIVE'
      : enrollment.status;

  const verificationHash = generateVerificationHash(receiptNumber, tx.txRef, tx.amountEtb);
  const cleanNotes = params.approvalNotes?.trim().slice(0, 400);

  try {
    const batch = writeBatch(db);

    // 1. Mark Chapa Transaction Approved
    batch.update(
      doc(db, 'chapa_transactions', tx.id),
      cleanObject({
        approvalStatus: 'APPROVED',
        approvedBy: actor.uid,
        approvedByName: actor.fullName.slice(0, 120),
        approvedAt: now,
        approvalNotes: cleanNotes,
        paymentId,
        receiptId,
        receiptNumber,
        updatedAt: now,
      })
    );

    // 2. Post Official Approved Payment in unified payments ledger (method = 'Chapa')
    batch.set(
      doc(db, 'payments', paymentId),
      cleanObject({
        transactionRef: tx.txRef,
        enrollmentId: enrollment.id,
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        studentName: tx.studentName,
        courseId: tx.courseId,
        courseName: tx.courseName,
        amountEtb: tx.amountEtb,
        paymentDate,
        paymentMethod: 'Chapa',
        recordedBy: tx.createdBy,
        recordedByName: tx.createdByName,
        status: 'APPROVED',
        approvedBy: actor.uid,
        approvedByName: actor.fullName.slice(0, 120),
        approvalDate: today,
        receiptId,
        receiptNumber,
        notes: cleanNotes || `Chapa Online Payment (${tx.chapaReference || tx.txRef})`,
        createdAt: now,
        updatedAt: now,
      })
    );

    // 3. Create Unique Reference Lock (blocks duplicate approvals/replays permanently)
    batch.set(doc(db, 'payment_refs', refLockId), {
      paymentId,
      transactionRef: tx.txRef,
      recordedBy: actor.uid,
      createdAt: now,
    });

    // 4. Issue Official Immutable Receipt
    batch.set(
      doc(db, 'receipts', receiptId),
      cleanObject({
        receiptNumber,
        paymentId,
        transactionRef: tx.txRef,
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        studentName: tx.studentName,
        studentPhone: params.studentPhone || tx.studentPhone,
        courseName: tx.courseName,
        previousBalanceEtb: previousBalance,
        amountPaidEtb: tx.amountEtb,
        remainingBalanceEtb: newRemaining,
        paymentDate,
        paymentMethod: 'Chapa',
        authorizedBy: actor.fullName.slice(0, 120),
        verificationHash,
        issuedAt: now,
      })
    );

    // 5. Update Enrollment official balances (partial payments recalculate remaining cleanly)
    batch.update(doc(db, 'enrollments', enrollment.id), {
      approvedPaidEtb: newApprovedPaid,
      remainingBalanceEtb: newRemaining,
      status: newEnrollmentStatus,
      updatedAt: now,
    });

    // 6. Sequentially allocate approved amount across installments
    const sortedInsts = [...installments]
      .filter((i) => i.enrollmentId === enrollment.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    let remainingPool = newApprovedPaid;
    for (const inst of sortedInsts) {
      const paidForInst = Math.min(inst.amountDueEtb, Math.max(0, Number(remainingPool.toFixed(2))));
      remainingPool = Math.max(0, remainingPool - paidForInst);
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

    // 7. Notify Student (exact required wording) & Accountant
    batch.set(
      doc(db, 'notifications', makeId('not_chapa_app_stu')),
      cleanObject({
        type: 'CHAPA_PAYMENT_APPROVED',
        title: `Online Payment Approved — Receipt ${receiptNumber}`,
        message: `Your payment of ${tx.amountEtb.toLocaleString()} ETB has been approved by ZACMA Technology. Your payment record has been updated. Receipt: ${receiptNumber}. Remaining balance: ETB ${newRemaining.toLocaleString()}.`,
        targetRole: 'STUDENT',
        category: 'FINANCE',
        actionSection: 'payments',
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        studentName: tx.studentName,
        courseName: tx.courseName,
        expectedAmountEtb: enrollment.agreedFeeEtb,
        paidAmountEtb: newApprovedPaid,
        remainingBalanceEtb: newRemaining,
        paymentStatus: newRemaining <= 0 ? 'PAID' : 'APPROVED',
        dedupKey: `CHAPA_APP_STU|${tx.txRef}`,
        entityType: 'receipt',
        entityId: receiptId,
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(
      doc(db, 'notifications', makeId('not_chapa_app_acc')),
      cleanObject({
        type: 'CHAPA_PAYMENT_APPROVED',
        title: `Chapa Payment Approved (${tx.txRef})`,
        message: `${tx.studentName} — ETB ${tx.amountEtb.toLocaleString()} (Chapa) approved by ${actor.fullName}. Official receipt ${receiptNumber} issued.`,
        targetRole: 'ACCOUNTANT',
        category: 'FINANCE',
        actionSection: 'chapa',
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        studentName: tx.studentName,
        courseName: tx.courseName,
        expectedAmountEtb: enrollment.agreedFeeEtb,
        paidAmountEtb: newApprovedPaid,
        remainingBalanceEtb: newRemaining,
        paymentStatus: newRemaining <= 0 ? 'PAID' : 'APPROVED',
        dedupKey: `CHAPA_APP_ACC|${tx.txRef}`,
        entityType: 'receipt',
        entityId: receiptId,
        isRead: false,
        createdAt: now,
      })
    );

    // 8. Immutable Audit Log
    batch.set(doc(db, 'audit_logs', makeId('aud_chapa_app')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'CHAPA_PAYMENT_APPROVED',
      entityType: 'chapa_transaction',
      entityId: tx.id,
      summary: `Approved verified Chapa payment ${tx.txRef} (ETB ${tx.amountEtb.toLocaleString()}) for ${tx.studentName} (${tx.studentCode}). Issued Receipt ${receiptNumber}. New remaining balance: ETB ${newRemaining.toLocaleString()}.`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chapa_transactions/${tx.id}`);
  }

  // Non-blocking approval SMS to student when SMS is enabled
  const phone = params.studentPhone || tx.studentPhone;
  if (params.smsConfig && phone) {
    void dispatchSmsMessage(
      {
        eventType: 'PAYMENT_APPROVED',
        recipientName: tx.studentName,
        recipientPhone: phone,
        messageBody: `Your payment of ${tx.amountEtb.toLocaleString()} ETB has been approved by ZACMA Technology. Your payment record has been updated. Receipt: ${receiptNumber}. Remaining balance: ${newRemaining.toLocaleString()} ETB.`,
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        courseName: tx.courseName,
        dedupKey: `SMS_CHAPA_APPROVED|${tx.txRef}`,
        config: params.smsConfig,
        existingLogs: params.existingSmsLogs,
      },
      actor
    );
  }

  return { receiptNumber, paymentId, receiptId };
}

export async function rejectChapaTransaction(params: {
  tx: ChapaTransaction;
  reason: string;
  studentPhone?: string;
  smsConfig?: SmsSystemConfig;
  existingSmsLogs?: SmsLog[];
  actor: ActorContext;
}): Promise<void> {
  const { tx, actor } = params;
  if (actor.role !== 'ADMIN') {
    throw new Error('Only Administrators can reject Chapa transactions.');
  }
  if (tx.approvalStatus !== 'AWAITING_APPROVAL') {
    throw new Error(`This transaction is already ${tx.approvalStatus.toLowerCase()}.`);
  }
  const cleanReason = params.reason.trim().slice(0, 300);
  if (cleanReason.length < 3) {
    throw new Error('Please provide a clear rejection reason for the audit record.');
  }

  const now = new Date().toISOString();

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'chapa_transactions', tx.id), {
      approvalStatus: 'REJECTED',
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvedAt: now,
      rejectionReason: cleanReason,
      updatedAt: now,
    });

    batch.set(
      doc(db, 'notifications', makeId('not_chapa_rej_stu')),
      cleanObject({
        type: 'CHAPA_PAYMENT_REJECTED',
        title: `Online Payment Not Approved (${tx.txRef})`,
        message: `Your Chapa transaction of ETB ${tx.amountEtb.toLocaleString()} (${tx.txRef}) was not approved by ZACMA Technology. Reason: ${cleanReason}. Please contact the Finance Office for assistance.`,
        targetRole: 'STUDENT',
        category: 'FINANCE',
        actionSection: 'payments',
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        studentName: tx.studentName,
        courseName: tx.courseName,
        paidAmountEtb: tx.amountEtb,
        paymentStatus: 'REJECTED',
        dedupKey: `CHAPA_REJ_STU|${tx.txRef}`,
        entityType: 'chapa_transaction',
        entityId: tx.id,
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(
      doc(db, 'notifications', makeId('not_chapa_rej_acc')),
      cleanObject({
        type: 'CHAPA_PAYMENT_REJECTED',
        title: `Chapa Transaction Rejected (${tx.txRef})`,
        message: `${tx.studentName} — ETB ${tx.amountEtb.toLocaleString()} rejected by ${actor.fullName}. Reason: ${cleanReason}`,
        targetRole: 'ACCOUNTANT',
        category: 'FINANCE',
        actionSection: 'chapa',
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        studentName: tx.studentName,
        courseName: tx.courseName,
        paymentStatus: 'REJECTED',
        dedupKey: `CHAPA_REJ_ACC|${tx.txRef}`,
        entityType: 'chapa_transaction',
        entityId: tx.id,
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(doc(db, 'audit_logs', makeId('aud_chapa_rej')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'CHAPA_PAYMENT_REJECTED',
      entityType: 'chapa_transaction',
      entityId: tx.id,
      summary: `Rejected Chapa transaction ${tx.txRef} (ETB ${tx.amountEtb.toLocaleString()}) for ${tx.studentName} (${tx.studentCode}). Reason: ${cleanReason}`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chapa_transactions/${tx.id}`);
  }

  const phone = params.studentPhone || tx.studentPhone;
  if (params.smsConfig && phone) {
    void dispatchSmsMessage(
      {
        eventType: 'ADMIN_ANNOUNCEMENT',
        recipientName: tx.studentName,
        recipientPhone: phone,
        messageBody: `ZACMA Technology Notice: Your online payment (${tx.txRef}, ${tx.amountEtb.toLocaleString()} ETB) could not be approved. Reason: ${cleanReason}. Contact Finance Office for support.`,
        studentId: tx.studentId,
        studentCode: tx.studentCode,
        courseName: tx.courseName,
        dedupKey: `SMS_CHAPA_REJECTED|${tx.txRef}`,
        config: params.smsConfig,
        existingLogs: params.existingSmsLogs,
      },
      actor
    );
  }
}

export async function markChapaTransactionRefunded(
  tx: ChapaTransaction,
  reason: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only Administrators can mark a Chapa transaction as refunded.');
  }
  const now = new Date().toISOString();
  const cleanReason = reason.trim().slice(0, 360) || 'Refunded via Chapa merchant settlement.';
  try {
    await updateDoc(doc(db, 'chapa_transactions', tx.id), {
      paymentStatus: 'REFUNDED',
      approvalNotes: cleanReason,
      updatedAt: now,
    });
    await setDoc(doc(db, 'audit_logs', makeId('aud_chapa_ref')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'CHAPA_PAYMENT_REFUNDED',
      entityType: 'chapa_transaction',
      entityId: tx.id,
      summary: `Marked Chapa transaction ${tx.txRef} (ETB ${tx.amountEtb.toLocaleString()}) as REFUNDED: ${cleanReason}`,
      createdAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chapa_transactions/${tx.id}`);
  }
}
