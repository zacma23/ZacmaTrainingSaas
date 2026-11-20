import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { formatDualDate, formatAddisTime } from './ethiopianCalendar';
import { ActorContext } from './zacmaService';
import {
  BroadcastAudience,
  CommunicationEventType,
  Conversation,
  Course,
  DirectoryUser,
  InternalMessage,
  NotificationChannelRule,
  NotificationType,
  PortalNotification,
  RoleCode,
  SmsDeliveryStatus,
  SmsLog,
  SmsProviderCode,
  SmsSystemConfig,
  SmsTemplate,
  StaffProfile,
  Student,
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

export function sanitizeText(raw: string, maxLen: number): string {
  return String(raw || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export const DEFAULT_SMS_CONFIG: SmsSystemConfig = {
  id: 'default',
  ownerPhoneNumber: '+251911000000',
  activeProvider: 'afromessage',
  senderId: 'ZACMA',
  smsEnabled: true,
  portalNotificationsEnabled: true,
  internalMessagingEnabled: true,
  testMode: true,
  allowStudentToInstructor: true,
  allowStudentToAdmin: true,
  allowStudentToStudent: false,
  allowAttachments: true,
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_SMS_TEMPLATES: Omit<SmsTemplate, 'updatedAt' | 'updatedBy'>[] = [
  {
    id: 'tpl_registration_approved',
    eventType: 'REGISTRATION_APPROVED',
    name: 'Student Registration Welcome',
    body: 'Hello [Student Name], welcome to ZACMA Technology Training Institute! Your registration ([Student ID]) for [Course Name] has been successfully approved on [Gregorian Date] ([Ethiopian Date] E.C.). Thank you.',
    isActive: true,
  },
  {
    id: 'tpl_payment_reminder',
    eventType: 'PAYMENT_REMINDER',
    name: 'Monthly Fee Reminder',
    body: 'Dear [Student Name], this is a reminder that your training fee for [Course Name] is due on [Due Date]. Outstanding balance: [Balance] ETB. Please contact ZACMA Technology ([Owner Phone]) for assistance.',
    isActive: true,
  },
  {
    id: 'tpl_payment_overdue',
    eventType: 'PAYMENT_OVERDUE',
    name: 'Overdue Fee Notice',
    body: 'Dear [Student Name], your installment for [Course Name] (due [Due Date]) is overdue. Unpaid amount: [Amount] ETB. Remaining balance: [Balance] ETB. Please settle promptly at ZACMA Technology.',
    isActive: true,
  },
  {
    id: 'tpl_payment_approved',
    eventType: 'PAYMENT_APPROVED',
    name: 'Payment Approval Confirmation',
    body: 'Dear [Student Name], your payment of [Amount] ETB (Receipt [Receipt Number]) for [Course Name] has been successfully confirmed. Remaining balance: [Balance] ETB. Thank you for choosing ZACMA Technology.',
    isActive: true,
  },
  {
    id: 'tpl_course_announcement',
    eventType: 'COURSE_ANNOUNCEMENT',
    name: 'Course & Schedule Update',
    body: 'ZACMA Technology Update ([Course Name]): Dear [Student Name], [Custom Message]. Check your Student Portal for full schedule details.',
    isActive: true,
  },
  {
    id: 'tpl_attendance_update',
    eventType: 'ATTENDANCE_UPDATE',
    name: 'Attendance Update Alert',
    body: 'ZACMA Attendance Notice: Dear [Student Name], your attendance for [Course Name] on [Gregorian Date] ([Ethiopian Date] E.C.) was recorded as [Custom Message].',
    isActive: false,
  },
  {
    id: 'tpl_instructor_message',
    eventType: 'INSTRUCTOR_MESSAGE',
    name: 'Instructor Direct Message Alert',
    body: 'ZACMA Portal: You have a new message from your instructor regarding [Course Name]. Sign in to your Student Portal to view and reply.',
    isActive: false,
  },
  {
    id: 'tpl_admin_announcement',
    eventType: 'ADMIN_ANNOUNCEMENT',
    name: 'Official Institute Announcement',
    body: 'ZACMA Technology Announcement: [Custom Message]. For inquiries contact [Owner Phone].',
    isActive: true,
  },
];

export const DEFAULT_CHANNEL_RULES: Omit<NotificationChannelRule, 'updatedAt'>[] = [
  {
    id: 'rule_registration_approved',
    eventType: 'REGISTRATION_APPROVED',
    label: 'Student Registration Approval',
    description: 'Triggered when an Admin approves a newly registered trainee.',
    smsEnabled: true,
    portalEnabled: true,
    internalMessageEnabled: false,
  },
  {
    id: 'rule_payment_reminder',
    eventType: 'PAYMENT_REMINDER',
    label: 'Monthly Fee Reminder',
    description: 'Triggered as scheduled installment deadlines approach.',
    smsEnabled: true,
    portalEnabled: true,
    internalMessageEnabled: false,
  },
  {
    id: 'rule_payment_overdue',
    eventType: 'PAYMENT_OVERDUE',
    label: 'Overdue Payment Alert',
    description: 'Triggered when an approved payment has not covered a past-due installment.',
    smsEnabled: true,
    portalEnabled: true,
    internalMessageEnabled: false,
  },
  {
    id: 'rule_payment_approved',
    eventType: 'PAYMENT_APPROVED',
    label: 'Payment Confirmation',
    description: 'Triggered after an Administrator approves a payment and issues an official receipt.',
    smsEnabled: true,
    portalEnabled: true,
    internalMessageEnabled: false,
  },
  {
    id: 'rule_course_announcement',
    eventType: 'COURSE_ANNOUNCEMENT',
    label: 'Course Announcement & Schedule Change',
    description: 'Course start dates, timetable updates, and completion notices.',
    smsEnabled: false,
    portalEnabled: true,
    internalMessageEnabled: true,
  },
  {
    id: 'rule_attendance_update',
    eventType: 'ATTENDANCE_UPDATE',
    label: 'Attendance Update',
    description: 'Daily attendance notifications (Absent / Late alerts to students).',
    smsEnabled: false,
    portalEnabled: true,
    internalMessageEnabled: false,
  },
  {
    id: 'rule_instructor_message',
    eventType: 'INSTRUCTOR_MESSAGE',
    label: 'Instructor Message',
    description: 'Direct or class messages sent from instructors to students.',
    smsEnabled: false,
    portalEnabled: true,
    internalMessageEnabled: true,
  },
  {
    id: 'rule_admin_announcement',
    eventType: 'ADMIN_ANNOUNCEMENT',
    label: 'Admin Announcement & Broadcast',
    description: 'System-wide or targeted announcements issued by Administration.',
    smsEnabled: false,
    portalEnabled: true,
    internalMessageEnabled: true,
  },
];

export function renderTemplateVariables(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  const nowIso = new Date().toISOString();
  const dual = formatDualDate(nowIso);
  const fullVars: Record<string, string> = {
    'Student Name': String(vars.studentName || 'Student'),
    'Student ID': String(vars.studentCode || ''),
    'Course Name': String(vars.courseName || 'your course'),
    Amount:
      vars.amount !== undefined ? Number(vars.amount).toLocaleString('en-US') : '0',
    Balance:
      vars.balance !== undefined ? Number(vars.balance).toLocaleString('en-US') : '0',
    'Due Date': String(vars.dueDate || dual.gregorian),
    'Receipt Number': String(vars.receiptNumber || ''),
    'Gregorian Date': String(vars.gregorianDate || dual.gregorian),
    'Ethiopian Date': String(vars.ethiopianDate || dual.ethiopian),
    'Owner Phone': String(vars.ownerPhone || '+251911000000'),
    'Custom Message': String(vars.customMessage || ''),
  };

  let output = template;
  for (const [key, val] of Object.entries(fullVars)) {
    output = output.split(`[${key}]`).join(val);
  }
  return sanitizeText(output, 640);
}

/**
 * Idempotently initializes SMS config, templates, channel rules, and directory entries for existing staff.
 */
export async function ensureCommunicationDefaults(
  actor: ActorContext,
  staffProfiles: StaffProfile[],
  students: Student[]
): Promise<void> {
  if (actor.role !== 'ADMIN') return;
  const now = new Date().toISOString();

  try {
    const cfgSnap = await getDoc(doc(db, 'sms_config', 'default'));
    const batch = writeBatch(db);
    let ops = 0;

    if (!cfgSnap.exists()) {
      const { id: _id, ...cfgData } = DEFAULT_SMS_CONFIG;
      batch.set(doc(db, 'sms_config', 'default'), {
        ...cfgData,
        updatedBy: actor.uid,
        updatedByName: actor.fullName.slice(0, 120),
        updatedAt: now,
      });
      ops++;
    }

    const policySnap = await getDoc(doc(db, 'communication_policy', 'default'));
    if (!policySnap.exists()) {
      batch.set(doc(db, 'communication_policy', 'default'), {
        portalNotificationsEnabled: DEFAULT_SMS_CONFIG.portalNotificationsEnabled,
        internalMessagingEnabled: DEFAULT_SMS_CONFIG.internalMessagingEnabled,
        allowStudentToInstructor: DEFAULT_SMS_CONFIG.allowStudentToInstructor,
        allowStudentToAdmin: DEFAULT_SMS_CONFIG.allowStudentToAdmin,
        allowStudentToStudent: DEFAULT_SMS_CONFIG.allowStudentToStudent,
        allowAttachments: DEFAULT_SMS_CONFIG.allowAttachments,
        updatedAt: now,
      });
      ops++;
    }

    const existingTemplates = await getDocs(query(collection(db, 'sms_templates'), limit(1)));
    if (existingTemplates.empty) {
      for (const t of DEFAULT_SMS_TEMPLATES) {
        const { id, ...data } = t;
        batch.set(doc(db, 'sms_templates', id), {
          ...data,
          updatedBy: actor.uid,
          updatedAt: now,
        });
        ops++;
      }
    }

    const existingRules = await getDocs(
      query(collection(db, 'notification_channel_rules'), limit(1))
    );
    if (existingRules.empty) {
      for (const r of DEFAULT_CHANNEL_RULES) {
        const { id, ...data } = r;
        batch.set(doc(db, 'notification_channel_rules', id), {
          ...data,
          updatedAt: now,
        });
        ops++;
      }
    }

    // Seed PII-free directory entries for all staff profiles so messaging works immediately
    const existingDir = await getDocs(collection(db, 'directory_users'));
    const existingDirIds = new Set(existingDir.docs.map((d) => d.id));
    const studentById = new Map(students.map((s) => [s.id, s]));

    for (const sp of staffProfiles) {
      if (!existingDirIds.has(sp.uid) && ops < 420) {
        const linkedStu = sp.linkedStudentId ? studentById.get(sp.linkedStudentId) : undefined;
        batch.set(
          doc(db, 'directory_users', sp.uid),
          cleanObject({
            uid: sp.uid,
            fullName: sp.fullName.slice(0, 120),
            role: sp.role,
            linkedStudentId: sp.linkedStudentId,
            studentCode: linkedStu?.studentCode,
            courseId: linkedStu?.courseId,
            courseName: linkedStu?.courseName,
            isActive: sp.isActive,
            lastSeenAt: sp.updatedAt || now,
            updatedAt: now,
          })
        );
        ops++;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }
  } catch {
    // Non-fatal: admin can re-save from Communications panel
  }
}

export async function syncOwnDirectoryPresence(
  profile: StaffProfile,
  linkedStudent?: Student
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await setDoc(
      doc(db, 'directory_users', profile.uid),
      cleanObject({
        uid: profile.uid,
        fullName: profile.fullName.slice(0, 120),
        role: profile.role,
        linkedStudentId: profile.linkedStudentId,
        studentCode: linkedStudent?.studentCode,
        courseId: linkedStudent?.courseId,
        courseName: linkedStudent?.courseName,
        isActive: profile.isActive,
        lastSeenAt: now,
        updatedAt: now,
      })
    );
  } catch {
    // Non-fatal presence heartbeat
  }
}

export async function saveSmsConfigAndPolicy(
  config: Omit<SmsSystemConfig, 'id' | 'updatedAt' | 'updatedBy' | 'updatedByName'>,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can modify SMS and communication settings.');
  }
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'sms_config', 'default'),
      cleanObject({
        ownerPhoneNumber: sanitizeText(config.ownerPhoneNumber, 30) || '+251911000000',
        activeProvider: config.activeProvider,
        senderId: config.senderId ? sanitizeText(config.senderId, 30) : undefined,
        smsEnabled: Boolean(config.smsEnabled),
        portalNotificationsEnabled: Boolean(config.portalNotificationsEnabled),
        internalMessagingEnabled: Boolean(config.internalMessagingEnabled),
        testMode: Boolean(config.testMode),
        allowStudentToInstructor: Boolean(config.allowStudentToInstructor),
        allowStudentToAdmin: Boolean(config.allowStudentToAdmin),
        allowStudentToStudent: Boolean(config.allowStudentToStudent),
        allowAttachments: Boolean(config.allowAttachments),
        updatedBy: actor.uid,
        updatedByName: actor.fullName.slice(0, 120),
        updatedAt: now,
      })
    );
    batch.set(doc(db, 'communication_policy', 'default'), {
      portalNotificationsEnabled: Boolean(config.portalNotificationsEnabled),
      internalMessagingEnabled: Boolean(config.internalMessagingEnabled),
      allowStudentToInstructor: Boolean(config.allowStudentToInstructor),
      allowStudentToAdmin: Boolean(config.allowStudentToAdmin),
      allowStudentToStudent: Boolean(config.allowStudentToStudent),
      allowAttachments: Boolean(config.allowAttachments),
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'SMS_CONFIG_UPDATED',
      entityType: 'sms_config',
      entityId: 'default',
      summary: `Updated communication settings (Provider: ${config.activeProvider}, SMS: ${config.smsEnabled ? 'ON' : 'OFF'}, Mode: ${config.testMode ? 'TEST' : 'LIVE'}).`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sms_config/default');
  }
}

export async function saveSmsTemplate(
  template: {
    id?: string;
    eventType: CommunicationEventType;
    name: string;
    body: string;
    isActive: boolean;
  },
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can manage SMS templates.');
  }
  const now = new Date().toISOString();
  const id = template.id || `tpl_${template.eventType.toLowerCase()}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'sms_templates', id), {
      eventType: template.eventType,
      name: sanitizeText(template.name, 100),
      body: sanitizeText(template.body, 640),
      isActive: Boolean(template.isActive),
      updatedBy: actor.uid,
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'SMS_TEMPLATE_SAVED',
      entityType: 'sms_template',
      entityId: id,
      summary: `Updated SMS template "${sanitizeText(template.name, 80)}" (${template.eventType}).`,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sms_templates/${id}`);
  }
}

export async function saveNotificationChannelRule(
  rule: Omit<NotificationChannelRule, 'updatedAt'>,
  actor: ActorContext
): Promise<void> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can update notification channel rules.');
  }
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'notification_channel_rules', rule.id), {
      eventType: rule.eventType,
      label: sanitizeText(rule.label, 100),
      description: sanitizeText(rule.description, 240),
      smsEnabled: Boolean(rule.smsEnabled),
      portalEnabled: Boolean(rule.portalEnabled),
      internalMessageEnabled: Boolean(rule.internalMessageEnabled),
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `notification_channel_rules/${rule.id}`);
  }
}

export interface DispatchSmsInput {
  eventType: CommunicationEventType;
  recipientName: string;
  recipientPhone: string;
  messageBody: string;
  studentId?: string;
  studentCode?: string;
  courseName?: string;
  templateId?: string;
  dedupKey?: string;
  config: SmsSystemConfig;
  existingLogs?: SmsLog[];
}

export interface DispatchSmsOutcome {
  skippedDuplicate?: boolean;
  skippedDisabled?: boolean;
  ok: boolean;
  status: SmsDeliveryStatus;
  logId?: string;
  detail: string;
}

export async function dispatchSmsMessage(
  input: DispatchSmsInput,
  actor: ActorContext
): Promise<DispatchSmsOutcome> {
  if (!input.config.smsEnabled) {
    return {
      skippedDisabled: true,
      ok: false,
      status: 'FAILED',
      detail: 'SMS notifications are currently deactivated by the administrator.',
    };
  }

  // Prevent duplicate SMS for the same event
  if (input.dedupKey) {
    if (input.existingLogs?.some((l) => l.dedupKey === input.dedupKey && l.status !== 'FAILED')) {
      return {
        skippedDuplicate: true,
        ok: true,
        status: 'SENT',
        detail: 'Duplicate SMS prevented for this event.',
      };
    }
    try {
      const dupSnap = await getDocs(
        query(collection(db, 'sms_logs'), where('dedupKey', '==', input.dedupKey), limit(1))
      );
      if (!dupSnap.empty) {
        const existingData = dupSnap.docs[0].data();
        if (existingData.status !== 'FAILED') {
          return {
            skippedDuplicate: true,
            ok: true,
            status: existingData.status as SmsDeliveryStatus,
            detail: 'Duplicate SMS already recorded for this event.',
          };
        }
      }
    } catch {
      // Proceed if query check fails
    }
  }

  const now = new Date().toISOString();
  const logId = makeId('sms');
  const cleanBody = sanitizeText(input.messageBody, 640);
  const provider: SmsProviderCode = input.config.activeProvider || 'afromessage';
  const mode: 'LIVE' | 'TEST' = input.config.testMode ? 'TEST' : 'LIVE';

  let status: SmsDeliveryStatus = 'FAILED';
  let providerMessageId: string | undefined;
  let errorMessage: string | undefined;
  let normalizedPhone = sanitizeText(input.recipientPhone, 30);

  try {
    const res = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        to: input.recipientPhone,
        message: cleanBody,
        senderId: input.config.senderId,
        ownerPhoneNumber: input.config.ownerPhoneNumber,
        testMode: input.config.testMode,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: SmsDeliveryStatus;
      normalizedPhone?: string;
      providerMessageId?: string;
      error?: string;
      detail?: string;
    };
    if (data.normalizedPhone) normalizedPhone = data.normalizedPhone.slice(0, 30);
    status = data.status || (res.ok && data.ok ? (mode === 'TEST' ? 'TEST_SIMULATED' : 'SENT') : 'FAILED');
    providerMessageId = data.providerMessageId;
    errorMessage = data.error;

    await setDoc(
      doc(db, 'sms_logs', logId),
      cleanObject({
        dedupKey: input.dedupKey?.slice(0, 160),
        eventType: input.eventType,
        recipientName: sanitizeText(input.recipientName, 120),
        recipientPhone: normalizedPhone,
        studentId: input.studentId,
        studentCode: input.studentCode,
        courseName: input.courseName?.slice(0, 120),
        templateId: input.templateId,
        messageBody: cleanBody,
        provider,
        mode,
        status,
        providerMessageId: providerMessageId?.slice(0, 160),
        errorMessage: errorMessage?.slice(0, 400),
        retryCount: 0,
        sentBy: actor.uid,
        sentByName: actor.fullName.slice(0, 120),
        createdAt: now,
        updatedAt: now,
      })
    );

    return {
      ok: status === 'SENT' || status === 'DELIVERED' || status === 'TEST_SIMULATED',
      status,
      logId,
      detail: data.detail || errorMessage || `SMS status: ${status}`,
    };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Unable to reach SMS gateway endpoint.';
    try {
      await setDoc(
        doc(db, 'sms_logs', logId),
        cleanObject({
          dedupKey: input.dedupKey?.slice(0, 160),
          eventType: input.eventType,
          recipientName: sanitizeText(input.recipientName, 120),
          recipientPhone: normalizedPhone,
          studentId: input.studentId,
          studentCode: input.studentCode,
          courseName: input.courseName?.slice(0, 120),
          templateId: input.templateId,
          messageBody: cleanBody,
          provider,
          mode,
          status: 'FAILED',
          errorMessage: errorMessage.slice(0, 400),
          retryCount: 0,
          sentBy: actor.uid,
          sentByName: actor.fullName.slice(0, 120),
          createdAt: now,
          updatedAt: now,
        })
      );
    } catch {
      // Ignore secondary log write failure
    }
    return {
      ok: false,
      status: 'FAILED',
      logId,
      detail: errorMessage,
    };
  }
}

export async function retryFailedSmsLog(
  log: SmsLog,
  config: SmsSystemConfig,
  actor: ActorContext
): Promise<DispatchSmsOutcome> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can retry failed SMS deliveries.');
  }
  const now = new Date().toISOString();
  const provider: SmsProviderCode = config.activeProvider || log.provider;
  const mode: 'LIVE' | 'TEST' = config.testMode ? 'TEST' : 'LIVE';

  const res = await fetch('/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      to: log.recipientPhone,
      message: log.messageBody,
      senderId: config.senderId,
      ownerPhoneNumber: config.ownerPhoneNumber,
      testMode: config.testMode,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    status?: SmsDeliveryStatus;
    providerMessageId?: string;
    error?: string;
    detail?: string;
  };
  const nextStatus: SmsDeliveryStatus =
    data.status || (res.ok && data.ok ? (mode === 'TEST' ? 'TEST_SIMULATED' : 'SENT') : 'FAILED');

  try {
    await updateDoc(
      doc(db, 'sms_logs', log.id),
      cleanObject({
        provider,
        mode,
        status: nextStatus,
        providerMessageId: data.providerMessageId?.slice(0, 160),
        errorMessage: data.error ? data.error.slice(0, 400) : nextStatus === 'FAILED' ? 'Retry failed.' : 'Cleared on retry',
        retryCount: (log.retryCount || 0) + 1,
        updatedAt: now,
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sms_logs/${log.id}`);
  }

  return {
    ok: nextStatus === 'SENT' || nextStatus === 'DELIVERED' || nextStatus === 'TEST_SIMULATED',
    status: nextStatus,
    logId: log.id,
    detail: data.detail || data.error || `Retry completed (${nextStatus}).`,
  };
}

/**
 * Helper used by automated workflows (Registration Approval, Payment Approval)
 * to check Admin's SMS config & channel rules and dispatch deduplicated SMS if enabled.
 */
export async function triggerAutomatedEventSms(params: {
  eventType: CommunicationEventType;
  dedupKey: string;
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    phone: string;
    courseName: string;
  };
  vars: Record<string, string | number | undefined>;
  actor: ActorContext;
}): Promise<DispatchSmsOutcome | null> {
  try {
    const [cfgSnap, ruleSnap, tplSnap] = await Promise.all([
      getDoc(doc(db, 'sms_config', 'default')),
      getDoc(doc(db, 'notification_channel_rules', `rule_${params.eventType.toLowerCase()}`)),
      getDoc(doc(db, 'sms_templates', `tpl_${params.eventType.toLowerCase()}`)),
    ]);

    const config: SmsSystemConfig = cfgSnap.exists()
      ? ({ id: cfgSnap.id, ...cfgSnap.data() } as SmsSystemConfig)
      : DEFAULT_SMS_CONFIG;

    if (!config.smsEnabled) return null;

    const defaultRule = DEFAULT_CHANNEL_RULES.find((r) => r.eventType === params.eventType);
    const ruleSmsEnabled = ruleSnap.exists()
      ? Boolean(ruleSnap.data().smsEnabled)
      : Boolean(defaultRule?.smsEnabled);

    if (!ruleSmsEnabled) return null;

    const defaultTpl = DEFAULT_SMS_TEMPLATES.find((t) => t.eventType === params.eventType);
    const tplActive = tplSnap.exists() ? Boolean(tplSnap.data().isActive) : Boolean(defaultTpl?.isActive);
    if (!tplActive) return null;

    const tplBody = tplSnap.exists()
      ? String(tplSnap.data().body || defaultTpl?.body || '')
      : defaultTpl?.body || '';
    if (!tplBody) return null;

    const rendered = renderTemplateVariables(tplBody, {
      studentName: params.student.fullName,
      studentCode: params.student.studentCode,
      courseName: params.student.courseName,
      ownerPhone: config.ownerPhoneNumber,
      ...params.vars,
    });

    return await dispatchSmsMessage(
      {
        eventType: params.eventType,
        recipientName: params.student.fullName,
        recipientPhone: params.student.phone,
        messageBody: rendered,
        studentId: params.student.id,
        studentCode: params.student.studentCode,
        courseName: params.student.courseName,
        templateId: `tpl_${params.eventType.toLowerCase()}`,
        dedupKey: params.dedupKey,
        config,
      },
      params.actor
    );
  } catch {
    return null;
  }
}

/**
 * Mark all unread persisted notifications for the current user as read in one atomic batch.
 */
export async function markAllNotificationsRead(
  unreadNotifications: PortalNotification[]
): Promise<number> {
  const persistedUnread = unreadNotifications.filter(
    (n) => !n.isRead && !n.id.startsWith('live_')
  );
  if (persistedUnread.length === 0) return 0;

  try {
    const batch = writeBatch(db);
    for (const n of persistedUnread.slice(0, 450)) {
      batch.update(doc(db, 'notifications', n.id), { isRead: true });
    }
    await batch.commit();
    return persistedUnread.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

// ============================================================================
// INTERNAL MESSAGING ENGINE (1:1, Group, Admin Broadcast, Attachments)
// ============================================================================

export function makeParticipantLabel(uid: string, name: string, role: RoleCode): string {
  const cleanName = sanitizeText(name, 80).replace(/\|/g, ' ');
  return `${uid}|${cleanName}|${role}`;
}

export function parseParticipantLabel(label: string): {
  uid: string;
  name: string;
  role: RoleCode;
} {
  const parts = label.split('|');
  return {
    uid: parts[0] || '',
    name: parts[1] || 'ZACMA User',
    role: (parts[2] as RoleCode) || 'STUDENT',
  };
}

export async function startOrOpenDirectConversation(
  me: { uid: string; fullName: string; role: RoleCode },
  other: DirectoryUser
): Promise<string> {
  const sorted = [me.uid, other.uid].sort();
  const convId = `dm_${sorted[0].slice(0, 40)}_${sorted[1].slice(0, 40)}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const now = new Date().toISOString();

  try {
    const existing = await getDoc(doc(db, 'conversations', convId));
    if (existing.exists()) {
      return convId;
    }

    await setDoc(doc(db, 'conversations', convId), {
      type: 'DIRECT',
      title: `${me.fullName} & ${other.fullName}`.slice(0, 140),
      participantIds: sorted,
      participantLabels: [
        makeParticipantLabel(me.uid, me.fullName, me.role),
        makeParticipantLabel(other.uid, other.fullName, other.role),
      ],
      createdBy: me.uid,
      createdByName: me.fullName.slice(0, 120),
      createdByRole: me.role,
      readByUids: [me.uid],
      createdAt: now,
      updatedAt: now,
    });
    return convId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}`);
  }
}

export async function createGroupConversation(
  params: {
    title: string;
    description?: string;
    members: Array<{ uid: string; fullName: string; role: RoleCode }>;
    course?: Course;
  },
  actor: ActorContext
): Promise<string> {
  if (actor.role === 'STUDENT') {
    throw new Error('Only authorized ZACMA staff and administrators can create group channels.');
  }
  const now = new Date().toISOString();
  const convId = makeId('grp');

  const memberMap = new Map<string, { uid: string; fullName: string; role: RoleCode }>();
  memberMap.set(actor.uid, { uid: actor.uid, fullName: actor.fullName, role: actor.role });
  for (const m of params.members) {
    if (memberMap.size < 195) {
      memberMap.set(m.uid, m);
    }
  }
  const allMembers = Array.from(memberMap.values());

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'conversations', convId),
      cleanObject({
        type: 'GROUP',
        title: sanitizeText(params.title, 140),
        description: params.description ? sanitizeText(params.description, 300) : undefined,
        participantIds: allMembers.map((m) => m.uid),
        participantLabels: allMembers.map((m) =>
          makeParticipantLabel(m.uid, m.fullName, m.role)
        ),
        courseId: params.course?.id,
        courseName: params.course?.name.slice(0, 120),
        createdBy: actor.uid,
        createdByName: actor.fullName.slice(0, 120),
        createdByRole: actor.role,
        lastMessageText: `Group created by ${actor.fullName}`,
        lastMessageAt: now,
        lastMessageBy: actor.uid,
        lastMessageByName: actor.fullName.slice(0, 120),
        readByUids: [actor.uid],
        createdAt: now,
        updatedAt: now,
      })
    );

    batch.set(doc(db, 'audit_logs', makeId('aud')), {
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'GROUP_CHAT_CREATED',
      entityType: 'conversation',
      entityId: convId,
      summary: `Created group conversation "${sanitizeText(params.title, 80)}" with ${allMembers.length} member(s).`,
      createdAt: now,
    });

    await batch.commit();
    return convId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}`);
  }
}

export interface AttachmentPayload {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function validateAndReadAttachment(file: File): Promise<AttachmentPayload> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      reject(
        new Error(
          'Unsupported file type. Allowed formats: PDF, PNG, JPG, WEBP, DOC, DOCX, or TXT.'
        )
      );
      return;
    }
    const maxBytes = 420 * 1024; // 420KB raw -> safely under Firestore 1MB document ceiling
    if (file.size > maxBytes) {
      reject(new Error('Attachment exceeds maximum size of 420 KB. Please compress or use a smaller file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl || dataUrl.length > 640000) {
        reject(new Error('Encoded attachment is too large for safe storage.'));
        return;
      }
      resolve({
        name: sanitizeText(file.name, 160),
        type: file.type.slice(0, 100),
        size: file.size,
        dataUrl,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read selected attachment file.'));
    reader.readAsDataURL(file);
  });
}

export async function sendInternalMessage(
  params: {
    conversation: Conversation;
    body: string;
    replyTo?: InternalMessage | null;
    attachment?: AttachmentPayload | null;
  },
  actor: ActorContext
): Promise<void> {
  const cleanBody = sanitizeText(params.body, 2000);
  if (!cleanBody && !params.attachment) {
    throw new Error('Message text or an attachment is required.');
  }
  const finalBody = cleanBody || `[Attachment: ${params.attachment?.name || 'File'}]`;
  const now = new Date().toISOString();
  const msgId = makeId('msg');

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'conversations', params.conversation.id, 'messages', msgId),
      cleanObject({
        conversationId: params.conversation.id,
        senderId: actor.uid,
        senderName: actor.fullName.slice(0, 120),
        senderRole: actor.role,
        body: finalBody,
        replyToId: params.replyTo?.id,
        replyToSender: params.replyTo?.senderName?.slice(0, 120),
        replyToPreview: params.replyTo?.body?.slice(0, 180),
        attachmentName: params.attachment?.name,
        attachmentType: params.attachment?.type,
        attachmentSize: params.attachment?.size,
        attachmentDataUrl: params.attachment?.dataUrl,
        readByUids: [actor.uid],
        createdAt: now,
      })
    );

    batch.update(doc(db, 'conversations', params.conversation.id), {
      lastMessageText: finalBody.slice(0, 260),
      lastMessageAt: now,
      lastMessageBy: actor.uid,
      lastMessageByName: actor.fullName.slice(0, 120),
      readByUids: [actor.uid],
      updatedAt: now,
    });

    // Notify direct recipient via in-app notification so unread badge alerts immediately
    if (params.conversation.type === 'DIRECT') {
      const otherUid = params.conversation.participantIds.find((id) => id !== actor.uid);
      if (otherUid) {
        const otherMeta = params.conversation.participantLabels
          .map(parseParticipantLabel)
          .find((p) => p.uid === otherUid);
        const notifType: NotificationType =
          actor.role === 'INSTRUCTOR' ? 'INSTRUCTOR_MESSAGE' : 'NEW_INTERNAL_MESSAGE';
        batch.set(
          doc(db, 'notifications', makeId('not_msg')),
          cleanObject({
            type: notifType,
            title: `New message from ${actor.fullName}`,
            message: finalBody.slice(0, 260),
            targetRole: otherMeta?.role || 'ALL',
            recipientUid: otherUid,
            category: 'MESSAGES',
            actionSection: 'messages',
            entityType: 'conversation',
            entityId: params.conversation.id,
            isRead: false,
            createdAt: now,
          })
        );
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `conversations/${params.conversation.id}/messages/${msgId}`
    );
  }
}

export async function markConversationRead(
  conversation: Conversation,
  myUid: string
): Promise<void> {
  if (conversation.readByUids.includes(myUid)) return;
  const nextRead = Array.from(new Set([...conversation.readByUids, myUid])).slice(0, 200);
  try {
    await updateDoc(doc(db, 'conversations', conversation.id), {
      readByUids: nextRead,
      updatedAt: conversation.updatedAt || new Date().toISOString(),
    });
  } catch {
    // Non-fatal read receipt update
  }
}

/**
 * Multi-Channel Admin Broadcast / Course Announcement:
 * Sends simultaneously to Internal Messaging (Broadcast thread), Portal Notification Center,
 * and/or Automated SMS (deduplicated) according to the Admin's chosen channels!
 */
export async function sendMultiChannelBroadcast(
  params: {
    title: string;
    body: string;
    audience: BroadcastAudience;
    course?: Course;
    selectedUsers?: DirectoryUser[];
    targetStudentsForSms?: Student[];
    sendInternalMessage: boolean;
    sendPortalNotification: boolean;
    sendSms: boolean;
    eventType: 'ADMIN_ANNOUNCEMENT' | 'COURSE_ANNOUNCEMENT';
    smsConfig: SmsSystemConfig;
  },
  actor: ActorContext
): Promise<{
  conversationId?: string;
  portalNotifsCreated: number;
  smsSent: number;
  smsFailed: number;
}> {
  if (actor.role !== 'ADMIN') {
    throw new Error('Only administrators can issue system broadcasts and announcements.');
  }

  const now = new Date().toISOString();
  const cleanTitle = sanitizeText(params.title, 130);
  const cleanBody = sanitizeText(params.body, 1800);
  if (!cleanTitle || !cleanBody) {
    throw new Error('Announcement title and message body are required.');
  }

  const batch = writeBatch(db);
  let conversationId: string | undefined;
  let portalNotifsCreated = 0;

  const participantIds = new Set<string>([actor.uid]);
  const participantLabels = new Map<string, string>();
  participantLabels.set(actor.uid, makeParticipantLabel(actor.uid, actor.fullName, actor.role));

  if (params.selectedUsers) {
    for (const u of params.selectedUsers) {
      if (participantIds.size < 195) {
        participantIds.add(u.uid);
        participantLabels.set(u.uid, makeParticipantLabel(u.uid, u.fullName, u.role));
      }
    }
  }

  // 1. Internal Broadcast Thread
  if (params.sendInternalMessage) {
    conversationId = makeId('bcast');
    const msgId = makeId('msg');

    batch.set(
      doc(db, 'conversations', conversationId),
      cleanObject({
        type: 'BROADCAST',
        title: cleanTitle,
        description: `Broadcast to ${params.course ? params.course.name : params.audience.replace(/_/g, ' ')}`,
        participantIds: Array.from(participantIds),
        participantLabels: Array.from(participantLabels.values()),
        courseId: params.course?.id,
        courseName: params.course?.name.slice(0, 120),
        broadcastAudience: params.audience,
        createdBy: actor.uid,
        createdByName: actor.fullName.slice(0, 120),
        createdByRole: actor.role,
        lastMessageText: cleanBody.slice(0, 260),
        lastMessageAt: now,
        lastMessageBy: actor.uid,
        lastMessageByName: actor.fullName.slice(0, 120),
        readByUids: [actor.uid],
        createdAt: now,
        updatedAt: now,
      })
    );

    batch.set(doc(db, 'conversations', conversationId, 'messages', msgId), {
      conversationId,
      senderId: actor.uid,
      senderName: actor.fullName.slice(0, 120),
      senderRole: actor.role,
      body: cleanBody,
      readByUids: [actor.uid],
      createdAt: now,
    });
  }

  // 2. Portal Notifications
  if (params.sendPortalNotification) {
    const notifType: NotificationType =
      params.eventType === 'COURSE_ANNOUNCEMENT' ? 'COURSE_ANNOUNCEMENT' : 'ADMIN_ANNOUNCEMENT';
    const category = params.eventType === 'COURSE_ANNOUNCEMENT' ? 'COURSES' : 'ADMIN';

    if (params.audience === 'COURSE' && params.targetStudentsForSms && params.targetStudentsForSms.length > 0) {
      for (const stu of params.targetStudentsForSms.slice(0, 200)) {
        batch.set(
          doc(db, 'notifications', makeId('not_ann')),
          cleanObject({
            type: notifType,
            title: cleanTitle,
            message: cleanBody.slice(0, 400),
            targetRole: 'STUDENT',
            studentId: stu.id,
            studentCode: stu.studentCode,
            studentName: stu.fullName,
            courseName: params.course?.name || stu.courseName,
            category,
            actionSection: 'messages',
            entityType: 'broadcast',
            entityId: conversationId,
            isRead: false,
            createdAt: now,
          })
        );
        portalNotifsCreated++;
      }
    } else if (params.audience === 'ALL_STUDENTS' && params.targetStudentsForSms && params.targetStudentsForSms.length > 0) {
      for (const stu of params.targetStudentsForSms.slice(0, 200)) {
        batch.set(
          doc(db, 'notifications', makeId('not_ann')),
          cleanObject({
            type: notifType,
            title: cleanTitle,
            message: cleanBody.slice(0, 400),
            targetRole: 'STUDENT',
            studentId: stu.id,
            studentCode: stu.studentCode,
            studentName: stu.fullName,
            courseName: stu.courseName,
            category,
            actionSection: 'messages',
            entityType: 'broadcast',
            entityId: conversationId,
            isRead: false,
            createdAt: now,
          })
        );
        portalNotifsCreated++;
      }
    } else if (params.audience === 'CUSTOM' && params.selectedUsers && params.selectedUsers.length > 0) {
      for (const u of params.selectedUsers.slice(0, 150)) {
        batch.set(
          doc(db, 'notifications', makeId('not_ann')),
          cleanObject({
            type: notifType,
            title: cleanTitle,
            message: cleanBody.slice(0, 400),
            targetRole: u.role,
            recipientUid: u.uid,
            studentId: u.linkedStudentId,
            category,
            actionSection: 'messages',
            entityType: 'broadcast',
            entityId: conversationId,
            isRead: false,
            createdAt: now,
          })
        );
        portalNotifsCreated++;
      }
    } else {
      const targetRoleMap: Record<BroadcastAudience, RoleCode | 'ALL'> = {
        ALL_USERS: 'ALL',
        ALL_STUDENTS: 'STUDENT',
        ALL_INSTRUCTORS: 'INSTRUCTOR',
        ALL_ACCOUNTANTS: 'ACCOUNTANT',
        ALL_STAFF: 'ALL',
        COURSE: 'STUDENT',
        CUSTOM: 'ALL',
      };
      batch.set(
        doc(db, 'notifications', makeId('not_ann')),
        cleanObject({
          type: notifType,
          title: cleanTitle,
          message: cleanBody.slice(0, 400),
          targetRole: targetRoleMap[params.audience],
          courseName: params.course?.name,
          category,
          actionSection: 'messages',
          entityType: 'broadcast',
          entityId: conversationId,
          isRead: false,
          createdAt: now,
        })
      );
      portalNotifsCreated++;
    }
  }

  batch.set(doc(db, 'audit_logs', makeId('aud')), {
    actorId: actor.uid,
    actorName: actor.fullName.slice(0, 120),
    actorRole: actor.role,
    action: 'BROADCAST_SENT',
    entityType: 'broadcast',
    entityId: conversationId || makeId('ann'),
    summary: `Issued announcement "${cleanTitle.slice(0, 80)}" to ${params.course ? params.course.name : params.audience} (Channels: ${[params.sendInternalMessage && 'Message', params.sendPortalNotification && 'Portal', params.sendSms && 'SMS'].filter(Boolean).join(', ')}).`,
    createdAt: now,
  });

  await batch.commit();

  // 3. SMS Dispatch (for student recipients with mobile numbers)
  let smsSent = 0;
  let smsFailed = 0;
  if (params.sendSms && params.smsConfig.smsEnabled && params.targetStudentsForSms?.length) {
    const batchKey = `BCAST_${Date.now()}`;
    for (const stu of params.targetStudentsForSms.slice(0, 50)) {
      if (!stu.phone) continue;
      const bodyWithHeader = `ZACMA Technology — ${cleanTitle}: ${cleanBody}`.slice(0, 640);
      const outcome = await dispatchSmsMessage(
        {
          eventType: params.eventType,
          recipientName: stu.fullName,
          recipientPhone: stu.phone,
          messageBody: bodyWithHeader,
          studentId: stu.id,
          studentCode: stu.studentCode,
          courseName: params.course?.name || stu.courseName,
          dedupKey: `${batchKey}|${stu.id}`,
          config: params.smsConfig,
        },
        actor
      );
      if (outcome.ok) smsSent++;
      else smsFailed++;
    }
  }

  return {
    conversationId,
    portalNotifsCreated,
    smsSent,
    smsFailed,
  };
}

export function isUserRecentlyOnline(lastSeenAt?: string): boolean {
  if (!lastSeenAt) return false;
  const ms = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms <= 10 * 60 * 1000; // active within last 10 minutes
}

export function formatMessageTimestamp(iso?: string): string {
  if (!iso) return '';
  return formatAddisTime(iso);
}
