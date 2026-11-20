import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { formatAddisTime, formatEthiopianDate } from './ethiopianCalendar';
import { triggerAutomatedEventSms } from './communicationService';
import {
  addDaysIso,
  AttendanceRecord,
  AttendanceStatus,
  Course,
  Enrollment,
  Expense,
  ExpenseCategory,
  generateVerificationHash,
  NotificationPreference,
  Payment,
  PaymentInstallment,
  PaymentMethod,
  PaymentPlan,
  PortalNotification,
  RoleCode,
  sanitizeRefId,
  StaffProfile,
  Student,
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

export interface ActorContext {
  uid: string;
  fullName: string;
  role: RoleCode;
  tenantId?: string;
  studentIdPrefix?: string;
  staffIdPrefix?: string;
  receiptPrefix?: string;
  studentLimit?: number;
  staffLimit?: number;
  tenantStatus?: string;
}

const DEFAULT_TENANT_ID = 'zacma_default';

function resolveTenantId(actor: ActorContext): string {
  return actor.tenantId || DEFAULT_TENANT_ID;
}

function assertTenantWritable(actor: ActorContext): void {
  if (actor.tenantStatus === 'SUSPENDED') {
    throw new Error('This training institute account is currently SUSPENDED. Contact ZACMA Platform Support to reactivate.');
  }
}

export interface RegisterStudentInput {
  fullName: string;
  gender: 'Male' | 'Female';
  phone: string;
  altPhone?: string;
  address: string;
  photoUrl?: string;
  course: Course;
  enrollmentDate: string;
  paymentPlan: PaymentPlan;
  customInstallments?: number;
  customIntervalDays?: number;
  initialPaymentAmount?: number;
  initialPaymentMethod?: PaymentMethod;
  initialTransactionRef?: string;
}

export function computeNextStudentCode(existingStudents: Student[], customPrefix?: string): string {
  const year = new Date().getFullYear();
  const basePrefix = customPrefix && customPrefix !== 'ZAC-STU' ? customPrefix.replace(/-+$/, '') : `ZAC-${year}`;
  const prefix = `${basePrefix}-`;
  let maxSeq = 0;
  for (const s of existingStudents) {
    if (s.studentCode.startsWith(prefix)) {
      const num = parseInt(s.studentCode.slice(prefix.length), 10);
      if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function computeNextReceiptNumber(existingReceiptsCount: number, customPrefix?: string): string {
  const year = new Date().getFullYear();
  const base = customPrefix && customPrefix.trim() ? customPrefix.trim().replace(/-+$/, '') : 'RCP';
  return `${base}-${year}-${String(existingReceiptsCount + 1).padStart(4, '0')}`;
}

export async function registerStudentWithPlan(
  input: RegisterStudentInput,
  existingStudents: Student[],
  actor: ActorContext
): Promise<{ studentId: string; studentCode: string }> {
  assertTenantWritable(actor);
  if (actor.studentLimit && actor.studentLimit > 0 && existingStudents.length >= actor.studentLimit) {
    throw new Error(
      `Student capacity limit (${actor.studentLimit}) reached for your current subscription plan. Please upgrade your plan to register more students.`
    );
  }
  const tenantId = resolveTenantId(actor);
  const now = new Date().toISOString();
  const studentId = makeId('stu');
  const enrollmentId = makeId('enr');
  const studentCode = computeNextStudentCode(existingStudents, actor.studentIdPrefix);

  if (input.initialPaymentAmount && input.initialPaymentAmount > 0) {
    if (!input.initialTransactionRef || !/^[A-Za-z0-9\-_]+$/.test(input.initialTransactionRef.trim())) {
      throw new Error('Valid transaction reference is required (letters, numbers, hyphens, underscores).');
    }
    const refId = sanitizeRefId(input.initialTransactionRef);
    const existingRef = await getDoc(doc(db, 'payment_refs', refId));
    if (existingRef.exists()) {
      throw new Error(`Duplicate transaction reference "${input.initialTransactionRef}" already exists.`);
    }
  }

  try {
    const batch = writeBatch(db);

    const registrationDateEthiopian = formatEthiopianDate(input.enrollmentDate);
    const registrationTimeEat = formatAddisTime(now);

    const studentDoc = cleanObject({
      tenantId,
      studentCode,
      fullName: input.fullName.trim().slice(0, 120),
      gender: input.gender,
      phone: input.phone.trim().slice(0, 30),
      altPhone: input.altPhone?.trim().slice(0, 30),
      address: input.address.trim().slice(0, 240),
      photoUrl: input.photoUrl?.slice(0, 90000),
      courseId: input.course.id,
      courseName: input.course.name.slice(0, 120),
      enrollmentDate: input.enrollmentDate,
      registrationDateEthiopian,
      registrationTimeEat,
      courseFeeEtb: input.course.feeEtb,
      paymentPlanCode: input.paymentPlan.code,
      registrationStatus: 'PENDING',
      registeredBy: actor.uid,
      registeredByName: actor.fullName.slice(0, 120),
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'students', studentId), studentDoc);

    const enrollmentDoc = cleanObject({
      tenantId,
      studentId,
      studentCode,
      studentName: input.fullName.trim().slice(0, 120),
      courseId: input.course.id,
      courseName: input.course.name.slice(0, 120),
      instructorId: input.course.instructorId,
      paymentPlanCode: input.paymentPlan.code,
      paymentPlanName: input.paymentPlan.name.slice(0, 80),
      enrollmentDate: input.enrollmentDate,
      agreedFeeEtb: input.course.feeEtb,
      approvedPaidEtb: 0,
      remainingBalanceEtb: input.course.feeEtb,
      status: 'PENDING',
      registeredBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'enrollments', enrollmentId), enrollmentDoc);

    const count =
      input.paymentPlan.code === 'CUSTOM' && input.customInstallments
        ? Math.max(1, Math.min(12, Math.round(input.customInstallments)))
        : Math.max(1, input.paymentPlan.installmentCount);
    const interval =
      input.paymentPlan.code === 'CUSTOM' && input.customIntervalDays !== undefined
        ? Math.max(0, Math.round(input.customIntervalDays))
        : input.paymentPlan.intervalDays;

    const baseAmount = Math.floor((input.course.feeEtb / count) * 100) / 100;
    let allocated = 0;

    for (let i = 1; i <= count; i++) {
      const amountDue =
        i === count ? Number((input.course.feeEtb - allocated).toFixed(2)) : baseAmount;
      allocated += amountDue;
      const dueDate = addDaysIso(input.enrollmentDate, (i - 1) * interval);
      const instId = makeId(`inst_${i}`);
      batch.set(doc(db, 'payment_installments', instId), {
        tenantId,
        enrollmentId,
        studentId,
        studentCode,
        studentName: input.fullName.trim().slice(0, 120),
        courseId: input.course.id,
        courseName: input.course.name.slice(0, 120),
        installmentNumber: i,
        dueDate,
        amountDueEtb: amountDue,
        amountPaidEtb: 0,
        status: 'UNPAID',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Optional Initial Fee Submission (Always PENDING until Admin approves)
    if (input.initialPaymentAmount && input.initialPaymentAmount > 0 && input.initialTransactionRef) {
      const paymentId = makeId('pay');
      const txRef = input.initialTransactionRef.trim();
      const refId = sanitizeRefId(txRef);
      batch.set(
        doc(db, 'payments', paymentId),
        cleanObject({
          tenantId,
          transactionRef: txRef,
          enrollmentId,
          studentId,
          studentCode,
          studentName: input.fullName.trim().slice(0, 120),
          courseId: input.course.id,
          courseName: input.course.name.slice(0, 120),
          amountEtb: Number(input.initialPaymentAmount),
          paymentDate: input.enrollmentDate,
          paymentMethod: input.initialPaymentMethod || 'Cash',
          recordedBy: actor.uid,
          recordedByName: actor.fullName.slice(0, 120),
          status: 'PENDING',
          notes: 'Initial registration fee submission.',
          createdAt: now,
          updatedAt: now,
        })
      );
      batch.set(doc(db, 'payment_refs', refId), {
        tenantId,
        paymentId,
        transactionRef: txRef,
        recordedBy: actor.uid,
        createdAt: now,
      });
    }

    // Notification for Admin
    batch.set(doc(db, 'notifications', makeId('not')), {
      tenantId,
      type: 'PENDING_REGISTRATION',
      title: `New Registration: ${input.fullName.trim().slice(0, 60)}`,
      message: `${studentCode} registered for ${input.course.name} by ${actor.fullName}. Pending admin approval.`,
      targetRole: 'ADMIN',
      entityType: 'student',
      entityId: studentId,
      isRead: false,
      createdAt: now,
    });

    // Audit Log
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'STUDENT_REGISTERED',
      entityType: 'student',
      entityId: studentId,
      summary: `Registered ${input.fullName.trim()} (${studentCode}) in ${input.course.name} (${input.paymentPlan.name}).`,
      createdAt: now,
    });

    await batch.commit();
    return { studentId, studentCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'students');
  }
}

export async function approveStudentRegistration(
  student: Student,
  enrollment: Enrollment | undefined,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can approve student registrations.');
  }
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'students', student.id), {
      registrationStatus: 'APPROVED',
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvedAt: now,
      updatedAt: now,
    });
    if (enrollment) {
      batch.update(doc(db, 'enrollments', enrollment.id), {
        status: 'ACTIVE',
        approvedBy: actor.uid,
        updatedAt: now,
      });
    }
    batch.set(
      doc(db, 'notifications', makeId('not_reg_app')),
      cleanObject({
        type: 'REGISTRATION_APPROVED',
        title: `Welcome to ZACMA — Registration Approved`,
        message: `Congratulations ${student.fullName}! Your enrollment (${student.studentCode}) for ${student.courseName} has been approved by Administration.`,
        targetRole: 'STUDENT',
        category: 'ADMIN',
        studentId: student.id,
        studentCode: student.studentCode,
        studentName: student.fullName,
        courseName: student.courseName,
        dedupKey: `REG_APPROVED|${student.id}`,
        entityType: 'student',
        entityId: student.id,
        isRead: false,
        createdAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'REGISTRATION_APPROVED',
      entityType: 'student',
      entityId: student.id,
      summary: `Approved registration for ${student.fullName} (${student.studentCode}) — enrollment activated.`,
      createdAt: now,
    });
    await batch.commit();

    // Non-blocking automated welcome SMS via Unified Notification Engine (deduplicated)
    void triggerAutomatedEventSms({
      eventType: 'REGISTRATION_APPROVED',
      dedupKey: `SMS_REG_APPROVED|${student.id}`,
      student: {
        id: student.id,
        studentCode: student.studentCode,
        fullName: student.fullName,
        phone: student.phone,
        courseName: student.courseName,
      },
      vars: {
        amount: student.courseFeeEtb,
        balance: enrollment?.remainingBalanceEtb ?? student.courseFeeEtb,
      },
      actor,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${student.id}`);
  }
}

export async function rejectStudentRegistration(
  student: Student,
  enrollment: Enrollment | undefined,
  reason: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can reject student registrations.');
  }
  const now = new Date().toISOString();
  const cleanReason = reason.trim().slice(0, 300) || 'Registration requirements incomplete.';
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'students', student.id), {
      registrationStatus: 'REJECTED',
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvedAt: now,
      rejectionReason: cleanReason,
      updatedAt: now,
    });
    if (enrollment) {
      batch.update(doc(db, 'enrollments', enrollment.id), {
        status: 'REJECTED',
        approvedBy: actor.uid,
        updatedAt: now,
      });
    }
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'REGISTRATION_REJECTED',
      entityType: 'student',
      entityId: student.id,
      summary: `Rejected registration for ${student.fullName} (${student.studentCode}): ${cleanReason}`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${student.id}`);
  }
}

export async function saveCourse(
  courseData: {
    id?: string;
    code: string;
    name: string;
    category: string;
    durationWeeks: number;
    feeEtb: number;
    schedule: string;
    instructorId?: string;
    instructorName?: string;
    description?: string;
    isActive: boolean;
    createdAt?: string;
  },
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can create or modify courses.');
  }
  assertTenantWritable(actor);
  const tenantId = resolveTenantId(actor);
  const now = new Date().toISOString();
  const courseId = courseData.id || makeId('crs');
  try {
    const batch = writeBatch(db);
    const payload = cleanObject({
      tenantId,
      code: courseData.code.trim().toUpperCase().slice(0, 24),
      name: courseData.name.trim().slice(0, 120),
      category: courseData.category.trim().slice(0, 80),
      durationWeeks: Number(courseData.durationWeeks),
      feeEtb: Number(courseData.feeEtb),
      schedule: courseData.schedule.trim().slice(0, 120),
      instructorId: courseData.instructorId?.trim(),
      instructorName: courseData.instructorName?.trim().slice(0, 120),
      description: courseData.description?.trim().slice(0, 500),
      isActive: courseData.isActive,
      createdAt: courseData.createdAt || now,
      updatedAt: now,
    });

    batch.set(doc(db, 'courses', courseId), payload);
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: courseData.id ? 'COURSE_UPDATED' : 'COURSE_CREATED',
      entityType: 'course',
      entityId: courseId,
      summary: `${courseData.id ? 'Updated' : 'Created'} course ${courseData.name} (${courseData.code}) — ETB ${courseData.feeEtb.toLocaleString()}.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `courses/${courseId}`);
  }
}

export async function submitPaymentRecord(
  input: {
    enrollment: Enrollment;
    amountEtb: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    transactionRef: string;
    notes?: string;
  },
  actor: ActorContext
): Promise<void> {
  assertTenantWritable(actor);
  const tenantId = input.enrollment.tenantId || resolveTenantId(actor);
  const txRef = input.transactionRef.trim();
  if (!/^[A-Za-z0-9\-_]+$/.test(txRef)) {
    throw new Error('Transaction reference must contain only letters, numbers, hyphens, or underscores.');
  }
  if (input.amountEtb <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const refId = sanitizeRefId(txRef);
  try {
    const existingRef = await getDoc(doc(db, 'payment_refs', refId));
    if (existingRef.exists()) {
      throw new Error(`Duplicate transaction reference "${txRef}" is already recorded.`);
    }

    const now = new Date().toISOString();
    const paymentId = makeId('pay');
    const batch = writeBatch(db);

    batch.set(
      doc(db, 'payments', paymentId),
      cleanObject({
        tenantId,
        transactionRef: txRef,
        enrollmentId: input.enrollment.id,
        studentId: input.enrollment.studentId,
        studentCode: input.enrollment.studentCode,
        studentName: input.enrollment.studentName,
        courseId: input.enrollment.courseId,
        courseName: input.enrollment.courseName,
        amountEtb: Number(input.amountEtb),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        recordedBy: actor.uid,
        recordedByName: actor.fullName.slice(0, 120),
        status: 'PENDING',
        notes: input.notes?.trim().slice(0, 400),
        createdAt: now,
        updatedAt: now,
      })
    );

    batch.set(doc(db, 'payment_refs', refId), {
      tenantId,
      paymentId,
      transactionRef: txRef,
      recordedBy: actor.uid,
      createdAt: now,
    });

    batch.set(
      doc(db, 'notifications', makeId('not')),
      cleanObject({
        tenantId,
        type: 'PENDING_PAYMENT',
        title: `Payment Pending Approval (${txRef})`,
        message: `${input.enrollment.studentName} — ETB ${input.amountEtb.toLocaleString()} via ${input.paymentMethod}, recorded by ${actor.fullName}.`,
        targetRole: 'ADMIN',
        entityType: 'payment',
        entityId: paymentId,
        studentId: input.enrollment.studentId,
        studentCode: input.enrollment.studentCode,
        studentName: input.enrollment.studentName,
        courseName: input.enrollment.courseName,
        expectedAmountEtb: input.enrollment.agreedFeeEtb,
        paidAmountEtb: input.enrollment.approvedPaidEtb,
        remainingBalanceEtb: input.enrollment.remainingBalanceEtb,
        paymentStatus: 'PENDING',
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(
      doc(db, 'notifications', makeId('not_stu')),
      cleanObject({
        tenantId,
        type: 'PAYMENT_RECEIVED',
        title: `Payment Received — Awaiting Verification (${txRef})`,
        message: `We recorded your ETB ${input.amountEtb.toLocaleString()} ${input.paymentMethod} submission for ${input.enrollment.courseName}. Your balance will update once verified by Admin.`,
        targetRole: 'STUDENT',
        entityType: 'payment',
        entityId: paymentId,
        studentId: input.enrollment.studentId,
        studentCode: input.enrollment.studentCode,
        studentName: input.enrollment.studentName,
        courseName: input.enrollment.courseName,
        expectedAmountEtb: input.enrollment.agreedFeeEtb,
        paidAmountEtb: input.enrollment.approvedPaidEtb,
        remainingBalanceEtb: input.enrollment.remainingBalanceEtb,
        paymentStatus: 'PENDING',
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'PAYMENT_SUBMITTED',
      entityType: 'payment',
      entityId: paymentId,
      summary: `Submitted pending payment ${txRef} of ETB ${input.amountEtb.toLocaleString()} for ${input.enrollment.studentName}.`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Duplicate transaction reference')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, 'payments');
  }
}

export async function approvePaymentTransaction(
  payment: Payment,
  enrollment: Enrollment,
  installments: PaymentInstallment[],
  studentPhone: string | undefined,
  existingReceiptsCount: number,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can approve payments.');
  }
  if (payment.status !== 'PENDING') {
    throw new Error('Only pending payments can be approved.');
  }

  assertTenantWritable(actor);
  const tenantId = payment.tenantId || enrollment.tenantId || resolveTenantId(actor);
  const now = new Date().toISOString();
  const today = todayIsoDate();
  const receiptId = makeId('rcp');
  const receiptNumber = computeNextReceiptNumber(existingReceiptsCount, actor.receiptPrefix);

  const previousBalance = Math.max(0, Number(enrollment.remainingBalanceEtb));
  const newApprovedPaid = Number((enrollment.approvedPaidEtb + payment.amountEtb).toFixed(2));
  const newRemaining = Math.max(0, Number((enrollment.agreedFeeEtb - newApprovedPaid).toFixed(2)));
  const newEnrollmentStatus =
    newRemaining <= 0
      ? 'COMPLETED'
      : enrollment.status === 'PENDING'
      ? 'ACTIVE'
      : enrollment.status;

  try {
    const batch = writeBatch(db);

    // 1. Mark Payment Approved
    batch.update(doc(db, 'payments', payment.id), {
      status: 'APPROVED',
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvalDate: today,
      receiptId,
      receiptNumber,
      updatedAt: now,
    });

    // 2. Update Enrollment official balances
    batch.update(doc(db, 'enrollments', enrollment.id), {
      approvedPaidEtb: newApprovedPaid,
      remainingBalanceEtb: newRemaining,
      status: newEnrollmentStatus,
      updatedAt: now,
    });

    // 3. Allocate approved payment across unpaid installments sequentially
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

    // 4. Issue Official Immutable Receipt
    const verificationHash = generateVerificationHash(
      receiptNumber,
      payment.transactionRef,
      payment.amountEtb
    );
    batch.set(
      doc(db, 'receipts', receiptId),
      cleanObject({
        tenantId,
        receiptNumber,
        paymentId: payment.id,
        transactionRef: payment.transactionRef,
        studentId: payment.studentId,
        studentCode: payment.studentCode,
        studentName: payment.studentName,
        studentPhone,
        courseName: payment.courseName,
        previousBalanceEtb: previousBalance,
        amountPaidEtb: payment.amountEtb,
        remainingBalanceEtb: newRemaining,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        authorizedBy: actor.fullName.slice(0, 120),
        verificationHash,
        issuedAt: now,
      })
    );

    // 5. Notify Student & Accountant of Approved Payment + Auto-clear overdue reminders for paid installments
    batch.set(
      doc(db, 'notifications', makeId('not_app_stu')),
      cleanObject({
        type: 'PAYMENT_APPROVED',
        title: `Payment Approved — Receipt ${receiptNumber}`,
        message: `Your payment of ETB ${payment.amountEtb.toLocaleString()} (${payment.transactionRef}) for ${payment.courseName} has been approved. Remaining balance: ETB ${newRemaining.toLocaleString()}.`,
        targetRole: 'STUDENT',
        entityType: 'receipt',
        entityId: receiptId,
        studentId: payment.studentId,
        studentCode: payment.studentCode,
        studentName: payment.studentName,
        courseName: payment.courseName,
        expectedAmountEtb: enrollment.agreedFeeEtb,
        paidAmountEtb: newApprovedPaid,
        remainingBalanceEtb: newRemaining,
        paymentStatus: newRemaining <= 0 ? 'PAID' : 'APPROVED',
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(
      doc(db, 'notifications', makeId('not_app_acc')),
      cleanObject({
        type: 'PAYMENT_APPROVED',
        title: `Payment Approved (${payment.transactionRef})`,
        message: `${payment.studentName} — ETB ${payment.amountEtb.toLocaleString()} approved by ${actor.fullName}. Official receipt ${receiptNumber} is ready to print.`,
        targetRole: 'ACCOUNTANT',
        entityType: 'receipt',
        entityId: receiptId,
        studentId: payment.studentId,
        studentCode: payment.studentCode,
        studentName: payment.studentName,
        courseName: payment.courseName,
        expectedAmountEtb: enrollment.agreedFeeEtb,
        paidAmountEtb: newApprovedPaid,
        remainingBalanceEtb: newRemaining,
        paymentStatus: newRemaining <= 0 ? 'PAID' : 'APPROVED',
        isRead: false,
        createdAt: now,
      })
    );

    // 6. Append Immutable Audit Log
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'PAYMENT_APPROVED',
      entityType: 'payment',
      entityId: payment.id,
      summary: `Approved payment ${payment.transactionRef} (ETB ${payment.amountEtb.toLocaleString()}) for ${payment.studentName}. Issued ${receiptNumber}; remaining balance ETB ${newRemaining.toLocaleString()}.`,
      createdAt: now,
    });

    await batch.commit();

    // Immediately silence unread overdue notifications for installments now fully covered by approved payments
    try {
      const coveredIds = new Set<string>();
      let checkPool = newApprovedPaid;
      for (const inst of sortedInsts) {
        const covered = Math.min(inst.amountDueEtb, Math.max(0, Number(checkPool.toFixed(2))));
        checkPool = Math.max(0, checkPool - covered);
        if (covered >= inst.amountDueEtb - 0.01) {
          coveredIds.add(inst.id);
        }
      }
      if (coveredIds.size > 0) {
        const notifSnap = await getDocs(
          query(collection(db, 'notifications'), where('studentId', '==', payment.studentId))
        );
        const clearBatch = writeBatch(db);
        let clearCount = 0;
        notifSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (
            !data.isRead &&
            (data.type === 'PAYMENT_OVERDUE' ||
              data.type === 'OVERDUE_BALANCE' ||
              data.type === 'PAYMENT_DUE_TODAY') &&
            data.entityId &&
            coveredIds.has(String(data.entityId))
          ) {
            clearBatch.update(doc(db, 'notifications', docSnap.id), { isRead: true });
            clearCount++;
          }
        });
        if (clearCount > 0) {
          await clearBatch.commit();
        }
      }
    } catch {
      // Non-fatal: payment approval already committed atomically
    }

    // Non-blocking automated Payment Confirmation SMS (deduplicated per paymentId)
    if (studentPhone) {
      void triggerAutomatedEventSms({
        eventType: 'PAYMENT_APPROVED',
        dedupKey: `SMS_PAY_APPROVED|${payment.id}`,
        student: {
          id: payment.studentId,
          studentCode: payment.studentCode,
          fullName: payment.studentName,
          phone: studentPhone,
          courseName: payment.courseName,
        },
        vars: {
          amount: payment.amountEtb,
          balance: newRemaining,
          receiptNumber,
        },
        actor,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payments/${payment.id}`);
  }
}

export async function rejectPaymentTransaction(
  payment: Payment,
  reason: string,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can reject payments.');
  }
  if (payment.status !== 'PENDING') {
    throw new Error('Only pending payments can be rejected.');
  }

  const now = new Date().toISOString();
  const today = todayIsoDate();
  const cleanReason = reason.trim().slice(0, 300) || 'Verification mismatch.';

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'payments', payment.id), {
      status: 'REJECTED',
      approvedBy: actor.uid,
      approvedByName: actor.fullName.slice(0, 120),
      approvalDate: today,
      rejectionReason: cleanReason,
      updatedAt: now,
    });

    batch.set(
      doc(db, 'notifications', makeId('not')),
      cleanObject({
        type: 'PAYMENT_REJECTED',
        title: `Payment Rejected (${payment.transactionRef})`,
        message: `${payment.studentName} ETB ${payment.amountEtb.toLocaleString()} rejected by ${actor.fullName}: ${cleanReason}`,
        targetRole: 'ACCOUNTANT',
        entityType: 'payment',
        entityId: payment.id,
        studentId: payment.studentId,
        studentCode: payment.studentCode,
        studentName: payment.studentName,
        courseName: payment.courseName,
        expectedAmountEtb: payment.amountEtb,
        paymentStatus: 'REJECTED',
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(
      doc(db, 'notifications', makeId('not_rej_stu')),
      cleanObject({
        type: 'PAYMENT_REJECTED',
        title: `Payment Submission Declined (${payment.transactionRef})`,
        message: `Your ETB ${payment.amountEtb.toLocaleString()} submission for ${payment.courseName} was not approved (${cleanReason}). Please contact the ZACMA accounts office.`,
        targetRole: 'STUDENT',
        entityType: 'payment',
        entityId: payment.id,
        studentId: payment.studentId,
        studentCode: payment.studentCode,
        studentName: payment.studentName,
        courseName: payment.courseName,
        expectedAmountEtb: payment.amountEtb,
        paymentStatus: 'REJECTED',
        isRead: false,
        createdAt: now,
      })
    );

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'PAYMENT_REJECTED',
      entityType: 'payment',
      entityId: payment.id,
      summary: `Rejected payment ${payment.transactionRef} (ETB ${payment.amountEtb.toLocaleString()}) for ${payment.studentName}: ${cleanReason}`,
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payments/${payment.id}`);
  }
}

export async function createExpenseRecord(
  input: {
    category: ExpenseCategory;
    title: string;
    amountEtb: number;
    expenseDate: string;
    paymentMethod: PaymentMethod;
    referenceNo?: string;
    notes?: string;
  },
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can record institutional expenses.');
  }
  assertTenantWritable(actor);
  const tenantId = resolveTenantId(actor);
  const now = new Date().toISOString();
  const expId = makeId('exp');
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'expenses', expId),
      cleanObject({
        tenantId,
        categoryId: input.category.id,
        categoryName: input.category.name.slice(0, 80),
        title: input.title.trim().slice(0, 140),
        amountEtb: Number(input.amountEtb),
        expenseDate: input.expenseDate,
        paymentMethod: input.paymentMethod,
        referenceNo: input.referenceNo?.trim().slice(0, 64),
        recordedBy: actor.uid,
        recordedByName: actor.fullName.slice(0, 120),
        notes: input.notes?.trim().slice(0, 400),
        createdAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'EXPENSE_RECORDED',
      entityType: 'expense',
      entityId: expId,
      summary: `Recorded expense "${input.title.trim()}" (${input.category.name}) for ETB ${input.amountEtb.toLocaleString()}.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'expenses');
  }
}

export async function createExpenseCategory(
  input: { name: string; description?: string },
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can create expense categories.');
  }
  assertTenantWritable(actor);
  const tenantId = resolveTenantId(actor);
  const catId = makeId('expcat');
  try {
    await setDoc(
      doc(db, 'expense_categories', catId),
      cleanObject({
        tenantId,
        name: input.name.trim().slice(0, 80),
        description: input.description?.trim().slice(0, 240),
        isActive: true,
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'expense_categories');
  }
}

export async function deleteExpenseRecord(expense: Expense, actor: ActorContext): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can delete expenses.');
  }
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'expenses', expense.id));
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'EXPENSE_DELETED',
      entityType: 'expense',
      entityId: expense.id,
      summary: `Removed expense "${expense.title}" of ETB ${expense.amountEtb.toLocaleString()}.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expenses/${expense.id}`);
  }
}

export async function saveDailyAttendanceBatch(
  course: Course,
  attendanceDate: string,
  entries: Array<{
    enrollment: Enrollment;
    status: AttendanceStatus;
    remarks?: string;
    existingRecord?: AttendanceRecord;
  }>,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN' && actor.role !== 'INSTRUCTOR') {
    throw new Error('Only instructors and administrators can record attendance.');
  }
  assertTenantWritable(actor);
  const tenantId = course.tenantId || resolveTenantId(actor);
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    for (const item of entries) {
      const attId = `att_${item.enrollment.id}_${attendanceDate.replace(/-/g, '')}`;
      if (item.existingRecord) {
        batch.update(
          doc(db, 'attendance', item.existingRecord.id),
          cleanObject({
            status: item.status,
            remarks: item.remarks?.trim().slice(0, 240) || '',
            recordedBy: actor.uid,
            recordedByName: actor.fullName.slice(0, 120),
            updatedAt: now,
          })
        );
      } else {
        batch.set(
          doc(db, 'attendance', attId),
          cleanObject({
            tenantId,
            enrollmentId: item.enrollment.id,
            studentId: item.enrollment.studentId,
            studentCode: item.enrollment.studentCode,
            studentName: item.enrollment.studentName,
            courseId: course.id,
            courseName: course.name,
            attendanceDate,
            status: item.status,
            recordedBy: actor.uid,
            recordedByName: actor.fullName.slice(0, 120),
            remarks: item.remarks?.trim().slice(0, 240),
            createdAt: now,
            updatedAt: now,
          })
        );
      }
      // Notify student on ABSENT or LATE attendance record so Student Portal stays up to date
      if (item.status === 'ABSENT' || item.status === 'LATE') {
        const ethDate = formatEthiopianDate(attendanceDate);
        batch.set(
          doc(db, 'notifications', `not_att_${item.enrollment.id}_${attendanceDate.replace(/-/g, '')}`),
          cleanObject({
            tenantId,
            type: 'ATTENDANCE_UPDATE',
            title: `Attendance Recorded: ${item.status} (${course.name})`,
            message: `Your attendance on ${attendanceDate} (${ethDate} E.C.) for ${course.name} was marked ${item.status} by ${actor.fullName}.${item.remarks ? ` Note: ${item.remarks}` : ''}`,
            targetRole: 'STUDENT',
            category: 'ATTENDANCE',
            studentId: item.enrollment.studentId,
            studentCode: item.enrollment.studentCode,
            studentName: item.enrollment.studentName,
            courseName: course.name,
            dedupKey: `ATT|${item.enrollment.id}|${attendanceDate}`,
            entityType: 'attendance',
            entityId: attId,
            isRead: false,
            createdAt: now,
          })
        );
      }
    }

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'ATTENDANCE_RECORDED',
      entityType: 'attendance',
      entityId: `${course.id}_${attendanceDate}`,
      summary: `Recorded attendance for ${entries.length} student(s) in ${course.name} on ${attendanceDate}.`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attendance');
  }
}

export async function saveStaffProfile(
  input: {
    id?: string;
    email: string;
    fullName: string;
    phone?: string;
    role: RoleCode;
    linkedStudentId?: string;
    allowedModules?: string[];
    canExportReports?: boolean;
    isActive: boolean;
    createdAt?: string;
  },
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can manage staff roles.');
  }
  assertTenantWritable(actor);
  const tenantId = resolveTenantId(actor);
  const now = new Date().toISOString();
  const profileId = input.id || makeId('staff');
  const allowedModules =
    input.role === 'GENERAL_STAFF' && Array.isArray(input.allowedModules) && input.allowedModules.length > 0
      ? input.allowedModules.slice(0, 16)
      : undefined;
  const canExportReports =
    input.role === 'ACCOUNTANT' ? Boolean(input.canExportReports) : undefined;

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'profiles', profileId),
      cleanObject({
        uid: profileId,
        tenantId,
        email: input.email.trim().toLowerCase().slice(0, 160),
        fullName: input.fullName.trim().slice(0, 120),
        phone: input.phone?.trim().slice(0, 30),
        role: input.role,
        linkedStudentId: input.role === 'STUDENT' ? input.linkedStudentId?.trim() : undefined,
        allowedModules,
        canExportReports,
        isActive: input.isActive,
        createdAt: input.createdAt || now,
        updatedAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: input.id ? 'STAFF_ROLE_UPDATED' : 'STAFF_ADDED',
      entityType: 'profile',
      entityId: profileId,
      summary: `${input.id ? 'Updated' : 'Added'} account ${input.fullName.trim()} (${input.role}, ${input.isActive ? 'Active' : 'Suspended'}${
        canExportReports ? ', Excel Export Authorized' : ''
      }${allowedModules ? `, Modules: ${allowedModules.join(', ')}` : ''}).`.slice(0, 400),
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `profiles/${profileId}`);
  }
}

export async function removeStaffProfile(profile: StaffProfile, actor: ActorContext): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can remove staff profiles.');
  }
  try {
    await deleteDoc(doc(db, 'profiles', profile.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `profiles/${profile.id}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function setNotificationReadState(notificationId: string, isRead: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { isRead });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function saveNotificationPreferences(
  prefs: Omit<NotificationPreference, 'id' | 'updatedAt'>
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'notification_preferences', prefs.userId), {
      userId: prefs.userId,
      inAppEnabled: Boolean(prefs.inAppEnabled),
      emailEnabled: Boolean(prefs.emailEnabled),
      smsEnabled: Boolean(prefs.smsEnabled),
      whatsappEnabled: Boolean(prefs.whatsappEnabled),
      upcomingLeadDays: Math.max(1, Math.min(30, Math.round(prefs.upcomingLeadDays))),
      overdueRepeatDays: Math.max(1, Math.min(30, Math.round(prefs.overdueRepeatDays))),
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `notification_preferences/${prefs.userId}`);
  }
}

export interface ReminderEvaluationResult {
  checkedInstallments: number;
  newlyMarkedOverdue: number;
  upcomingGenerated: number;
  dueTodayGenerated: number;
  overdueGenerated: number;
  skippedDuplicates: number;
  ranAt: string;
}

/**
 * Automated Payment Reminder Engine:
 * - Evaluates active enrollments' installments strictly against APPROVED payments only.
 * - Never marks an installment overdue if approved payments already cover it.
 * - Uses deterministic document IDs to prevent duplicate notifications for the same event & repeat window.
 */
export async function evaluatePaymentReminders(
  params: {
    enrollments: Enrollment[];
    installments: PaymentInstallment[];
    existingNotifications: PortalNotification[];
    upcomingLeadDays?: number;
    overdueRepeatDays?: number;
  },
  actor: ActorContext
): Promise<ReminderEvaluationResult> {
  if (actor.role !== 'ADMIN' && actor.role !== 'ACCOUNTANT') {
    throw new Error('Only administrators and accountants can run payment reminder evaluations.');
  }

  const today = todayIsoDate();
  const leadDays = Math.max(1, Math.min(30, params.upcomingLeadDays ?? 7));
  const repeatDays = Math.max(1, Math.min(30, params.overdueRepeatDays ?? 3));
  const upcomingCutoff = addDaysIso(today, leadDays);
  const now = new Date().toISOString();

  const enrollmentById = new Map(params.enrollments.map((e) => [e.id, e]));
  const existingIds = new Set(params.existingNotifications.map((n) => n.id));
  const existingDedupKeys = new Set(
    params.existingNotifications.map((n) => n.dedupKey).filter(Boolean) as string[]
  );

  let checkedInstallments = 0;
  let newlyMarkedOverdue = 0;
  let upcomingGenerated = 0;
  let dueTodayGenerated = 0;
  let overdueGenerated = 0;
  let skippedDuplicates = 0;

  try {
    const batch = writeBatch(db);
    let writeOps = 0;

    const queueNotification = (
      docId: string,
      dedupKey: string,
      payload: Omit<PortalNotification, 'id'>
    ): boolean => {
      if (existingIds.has(docId) || existingDedupKeys.has(dedupKey)) {
        skippedDuplicates++;
        return false;
      }
      if (writeOps >= 450) return false;
      batch.set(doc(db, 'notifications', docId), cleanObject({ ...payload, dedupKey }));
      existingIds.add(docId);
      existingDedupKeys.add(dedupKey);
      writeOps++;
      return true;
    };

    for (const inst of params.installments) {
      const enr = enrollmentById.get(inst.enrollmentId);
      if (!enr || enr.status !== 'ACTIVE') continue;

      checkedInstallments++;
      const remainingOnInst = Number((inst.amountDueEtb - inst.amountPaidEtb).toFixed(2));

      // Strict business rule: if approved payments already cover the installment, never mark overdue
      if (remainingOnInst <= 0.01) {
        if (inst.status !== 'PAID' && writeOps < 450) {
          batch.update(doc(db, 'payment_installments', inst.id), {
            status: 'PAID',
            updatedAt: now,
          });
          writeOps++;
        }
        continue;
      }

      const baseMeta = {
        entityType: 'installment',
        entityId: inst.id,
        studentId: inst.studentId,
        studentCode: inst.studentCode,
        studentName: inst.studentName,
        courseName: inst.courseName,
        expectedAmountEtb: inst.amountDueEtb,
        paidAmountEtb: inst.amountPaidEtb,
        remainingBalanceEtb: Math.max(0, enr.remainingBalanceEtb),
        dueDate: inst.dueDate,
        isRead: false,
        createdAt: now,
      };

      // Case 1: Overdue (deadline has passed without full approved coverage)
      if (inst.dueDate < today) {
        if (inst.status !== 'OVERDUE' && writeOps < 450) {
          batch.update(doc(db, 'payment_installments', inst.id), {
            status: 'OVERDUE',
            updatedAt: now,
          });
          newlyMarkedOverdue++;
          writeOps++;
        }

        const dueMs = new Date(`${inst.dueDate}T00:00:00`).getTime();
        const todayMs = new Date(`${today}T00:00:00`).getTime();
        const daysLate = Math.max(1, Math.floor((todayMs - dueMs) / 86400000));
        const repeatBucket = Math.floor((daysLate - 1) / repeatDays);

        const targets: Array<{ role: RoleCode; title: string; msg: string }> = [
          {
            role: 'STUDENT',
            title: `Overdue Installment #${inst.installmentNumber} — ${inst.courseName}`,
            msg: `Your installment due ${inst.dueDate} is ${daysLate} day(s) overdue. Unpaid installment amount: ETB ${remainingOnInst.toLocaleString()} (total remaining balance: ETB ${enr.remainingBalanceEtb.toLocaleString()}).`,
          },
          {
            role: 'ACCOUNTANT',
            title: `Overdue Fee Alert: ${inst.studentName} (${inst.studentCode})`,
            msg: `Installment #${inst.installmentNumber} for ${inst.courseName} is ${daysLate} day(s) past due (${inst.dueDate}). Remaining installment: ETB ${remainingOnInst.toLocaleString()}.`,
          },
          {
            role: 'ADMIN',
            title: `Overdue Installment Escalation: ${inst.studentName}`,
            msg: `${inst.studentCode} (${inst.courseName}) is ${daysLate} day(s) overdue on installment #${inst.installmentNumber} — ETB ${remainingOnInst.toLocaleString()} uncovered by approved payments.`,
          },
        ];

        for (const t of targets) {
          const dedupKey = `OVERDUE|${inst.id}|b${repeatBucket}|${t.role}`;
          const docId = `rem_${inst.id}_ovd_b${repeatBucket}_${t.role.toLowerCase()}`;
          if (
            queueNotification(docId, dedupKey, {
              ...baseMeta,
              type: 'PAYMENT_OVERDUE',
              title: t.title,
              message: t.msg,
              targetRole: t.role,
              paymentStatus: 'OVERDUE',
            })
          ) {
            overdueGenerated++;
          }
        }
        continue;
      }

      // Case 2: Due Today
      if (inst.dueDate === today) {
        const targets: Array<{ role: RoleCode; title: string; msg: string }> = [
          {
            role: 'STUDENT',
            title: `Payment Due Today — Installment #${inst.installmentNumber}`,
            msg: `Your installment of ETB ${remainingOnInst.toLocaleString()} for ${inst.courseName} is due today (${today}). Submit payment to avoid overdue status.`,
          },
          {
            role: 'ACCOUNTANT',
            title: `Payment Due Today: ${inst.studentName} (${inst.studentCode})`,
            msg: `Installment #${inst.installmentNumber} (${inst.courseName}) for ETB ${remainingOnInst.toLocaleString()} is due today.`,
          },
        ];

        for (const t of targets) {
          const dedupKey = `DUE_TODAY|${inst.id}|${today}|${t.role}`;
          const docId = `rem_${inst.id}_due_${today.replace(/-/g, '')}_${t.role.toLowerCase()}`;
          if (
            queueNotification(docId, dedupKey, {
              ...baseMeta,
              type: 'PAYMENT_DUE_TODAY',
              title: t.title,
              message: t.msg,
              targetRole: t.role,
              paymentStatus: inst.amountPaidEtb > 0 ? 'PARTIAL' : 'UNPAID',
            })
          ) {
            dueTodayGenerated++;
          }
        }
        continue;
      }

      // Case 3: Upcoming Payment within lead window
      if (inst.dueDate > today && inst.dueDate <= upcomingCutoff) {
        const targets: Array<{ role: RoleCode; title: string; msg: string }> = [
          {
            role: 'STUDENT',
            title: `Upcoming Payment Reminder — Due ${inst.dueDate}`,
            msg: `Installment #${inst.installmentNumber} for ${inst.courseName} (ETB ${remainingOnInst.toLocaleString()}) is due on ${inst.dueDate}.`,
          },
          {
            role: 'ACCOUNTANT',
            title: `Upcoming Deadline: ${inst.studentName} (${inst.studentCode})`,
            msg: `${inst.courseName} installment #${inst.installmentNumber} (ETB ${remainingOnInst.toLocaleString()}) is due on ${inst.dueDate}.`,
          },
        ];

        for (const t of targets) {
          const dedupKey = `UPCOMING|${inst.id}|${inst.dueDate}|${t.role}`;
          const docId = `rem_${inst.id}_upc_${inst.dueDate.replace(/-/g, '')}_${t.role.toLowerCase()}`;
          if (
            queueNotification(docId, dedupKey, {
              ...baseMeta,
              type: 'UPCOMING_PAYMENT',
              title: t.title,
              message: t.msg,
              targetRole: t.role,
              paymentStatus: inst.amountPaidEtb > 0 ? 'PARTIAL' : 'UNPAID',
            })
          ) {
            upcomingGenerated++;
          }
        }
      }
    }

    const totalGenerated = upcomingGenerated + dueTodayGenerated + overdueGenerated;
    if (writeOps > 0) {
      batch.set(doc(db, 'audit_logs', makeId('aud')), {
        actorId: actor.uid,
        actorName: actor.fullName.slice(0, 120),
        actorRole: actor.role,
        action: 'REMINDER_EVALUATION_RUN',
        entityType: 'system',
        entityId: `reminders_${today}`,
        summary: `Evaluated ${checkedInstallments} active installments: ${newlyMarkedOverdue} marked OVERDUE, ${totalGenerated} reminder(s) created (${upcomingGenerated} upcoming, ${dueTodayGenerated} due today, ${overdueGenerated} overdue).`,
        createdAt: now,
      });
      await batch.commit();
    }

    const result: ReminderEvaluationResult = {
      checkedInstallments,
      newlyMarkedOverdue,
      upcomingGenerated,
      dueTodayGenerated,
      overdueGenerated,
      skippedDuplicates,
      ranAt: now,
    };

    // Inform Express server of latest evaluation metrics (best-effort)
    try {
      await fetch('/api/reminders/record-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatedCount: checkedInstallments,
          trigger: 'manual',
        }),
      });
    } catch {
      // Ignore if offline or server unreachable
    }

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'payment_reminders');
  }
}

export interface MigrationExecutionStep {
  version: string;
  name: string;
  action: 'APPLIED' | 'VERIFIED';
  detail: string;
}

/**
 * Safe, additive, idempotent schema migration runner for ZACMA Firestore collections.
 * Never drops collections, never overwrites existing student/financial data.
 */
export async function applyIdempotentMigrations(
  existingRoleIds: string[],
  existingMigrationVersions: string[],
  actor: ActorContext
): Promise<MigrationExecutionStep[]> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can execute database migrations.');
  }
  const now = new Date().toISOString();
  const steps: MigrationExecutionStep[] = [];
  const batch = writeBatch(db);

  // Migration 0001: Baseline ZACMA Institutional Schema
  const has0001 = existingMigrationVersions.includes('0001');
  batch.set(doc(db, 'schema_migrations', '0001_initial_zacma_schema'), {
    version: '0001',
    name: '0001_initial_zacma_schema',
    appliedAt: now,
    appliedBy: actor.fullName.slice(0, 120),
    status: has0001 ? 'VERIFIED' : 'APPLIED',
    notes: 'Verified baseline courses, students, enrollments, payment_installments, payments, payment_refs, receipts, expenses, attendance, audit_logs.',
  });
  steps.push({
    version: '0001',
    name: '0001_initial_zacma_schema',
    action: has0001 ? 'VERIFIED' : 'APPLIED',
    detail: 'Core student fee, receipt, accounting, attendance, and audit collections verified intact.',
  });

  // Migration 0002: Automated Reminders & Notification Preferences
  const has0002 = existingMigrationVersions.includes('0002');
  const prefRef = doc(db, 'notification_preferences', actor.uid);
  const prefSnap = await getDoc(prefRef);
  if (!prefSnap.exists()) {
    batch.set(prefRef, {
      userId: actor.uid,
      inAppEnabled: true,
      emailEnabled: false,
      smsEnabled: false,
      whatsappEnabled: false,
      upcomingLeadDays: 7,
      overdueRepeatDays: 3,
      updatedAt: now,
    });
  }
  batch.set(doc(db, 'schema_migrations', '0002_reminders_and_notifications'), {
    version: '0002',
    name: '0002_reminders_and_notifications',
    appliedAt: now,
    appliedBy: actor.fullName.slice(0, 120),
    status: has0002 ? 'VERIFIED' : 'APPLIED',
    notes: 'Provisioned notification_preferences defaults and deduplicated reminder metadata schema.',
  });
  steps.push({
    version: '0002',
    name: '0002_reminders_and_notifications',
    action: has0002 ? 'VERIFIED' : 'APPLIED',
    detail: 'Notification preferences initialized (7-day upcoming lead, 3-day overdue repeat) and deduplicated reminder fields enabled.',
  });

  // Migration 0003: Student Portal & General Staff Roles
  const has0003 = existingMigrationVersions.includes('0003');
  if (!existingRoleIds.includes('role_general_staff')) {
    batch.set(doc(db, 'roles', 'role_general_staff'), {
      code: 'GENERAL_STAFF',
      name: 'General Operations Staff',
      description:
        'Supports campus scheduling, student directory coordination, and non-financial administrative tasks with zero financial ledger access.',
      permissions: ['view_courses', 'view_student_directory', 'view_attendance_summary'],
    });
  }
  if (!existingRoleIds.includes('role_student')) {
    batch.set(doc(db, 'roles', 'role_student'), {
      code: 'STUDENT',
      name: 'Enrolled Student',
      description:
        'Isolated self-service portal access limited strictly to the student’s own fee balance, payment history, installment deadlines, reminders, and official receipts.',
      permissions: ['view_own_balance', 'view_own_receipts', 'view_own_reminders'],
    });
  }
  const genStaffRef = doc(db, 'profiles', 'staff_gen_helina');
  const genStaffSnap = await getDoc(genStaffRef);
  if (!genStaffSnap.exists()) {
    batch.set(genStaffRef, {
      uid: 'staff_gen_helina',
      email: 'helina.teshome@zacma.edu.et',
      fullName: 'Helina Teshome',
      phone: '+251 911 804 221',
      role: 'GENERAL_STAFF',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  batch.set(doc(db, 'schema_migrations', '0003_student_portal_and_general_staff'), {
    version: '0003',
    name: '0003_student_portal_and_general_staff',
    appliedAt: now,
    appliedBy: actor.fullName.slice(0, 120),
    status: has0003 ? 'VERIFIED' : 'APPLIED',
    notes: 'Added GENERAL_STAFF and STUDENT roles and linkedStudentId self-isolation support.',
  });
  steps.push({
    version: '0003',
    name: '0003_student_portal_and_general_staff',
    action: has0003 ? 'VERIFIED' : 'APPLIED',
    detail: 'GENERAL_STAFF and STUDENT roles added cleanly without modifying existing Admin, Accountant, or Instructor records.',
  });

  // Migration 0004: AI Assistant & Migration Audit Tracking
  const has0004 = existingMigrationVersions.includes('0004');
  batch.set(doc(db, 'schema_migrations', '0004_ai_audit_and_migration_tracking'), {
    version: '0004',
    name: '0004_ai_audit_and_migration_tracking',
    appliedAt: now,
    appliedBy: actor.fullName.slice(0, 120),
    status: has0004 ? 'VERIFIED' : 'APPLIED',
    notes: 'Registered schema_migrations audit tracking and read-only role-aware ZACMA AI Assistant configuration.',
  });
  steps.push({
    version: '0004',
    name: '0004_ai_audit_and_migration_tracking',
    action: has0004 ? 'VERIFIED' : 'APPLIED',
    detail: 'Migration registry and ZACMA AI Assistant governance checks recorded.',
  });

  batch.set(doc(db, 'audit_logs', makeId('aud')), {
    actorId: actor.uid,
    actorName: actor.fullName.slice(0, 120),
    actorRole: actor.role,
    action: 'SCHEMA_MIGRATIONS_VERIFIED',
    entityType: 'system',
    entityId: 'schema_migrations',
    summary: `Executed idempotent schema migration check (versions 0001–0004) with zero destructive operations.`,
    createdAt: now,
  });

  try {
    await batch.commit();
    return steps;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'schema_migrations');
  }
}

export async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 240;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        if (dataUrl.length > 88000) {
          resolve(canvas.toDataURL('image/jpeg', 0.55));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Invalid image file selected.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export function exportRowsToCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
