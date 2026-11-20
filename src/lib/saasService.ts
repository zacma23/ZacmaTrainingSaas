import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  addDaysIso,
  AuditLog,
  BillingCycle,
  NavSection,
  PaymentMethod,
  PlatformGlobalSettings,
  PlatformInvoice,
  PlatformPayment,
  PlatformRole,
  PlatformSubscription,
  RoleCode,
  SaasModuleCode,
  StaffProfile,
  StaffRecord,
  Student,
  SubscriptionPlan,
  SupportAccessSession,
  SupportTicket,
  TenantInvitation,
  TenantRecord,
  TenantStatus,
  todayIsoDate,
} from '../types/zacma';

export const DEFAULT_ZACMA_TENANT_ID = 'zacma_default';

export interface SaasModuleDefinition {
  code: SaasModuleCode;
  label: string;
  category: 'Core Academic' | 'Finance & Billing' | 'AI & Automation' | 'Operations';
  description: string;
  navSections: NavSection[];
}

export const ALL_SAAS_MODULES: SaasModuleDefinition[] = [
  {
    code: 'STUDENT_MANAGEMENT',
    label: 'Student Management',
    category: 'Core Academic',
    description: 'Student registration, enrollment records, profiles, and portal access.',
    navSections: ['students', 'registrations'],
  },
  {
    code: 'STAFF_MANAGEMENT',
    label: 'Staff Management',
    category: 'Operations',
    description: 'Staff profiles, role permissions, HR records, and portal onboarding.',
    navSections: ['staff', 'registrations'],
  },
  {
    code: 'COURSE_MANAGEMENT',
    label: 'Course Management',
    category: 'Core Academic',
    description: 'Training courses catalog, fee schedules, and instructor assignment.',
    navSections: ['courses'],
  },
  {
    code: 'FEE_MANAGEMENT',
    label: 'Fee & Online Payments',
    category: 'Finance & Billing',
    description: 'Tuition collection, Chapa online payments, installment schedules, and receipts.',
    navSections: ['payments', 'chapa', 'reminders', 'approvals', 'receipts'],
  },
  {
    code: 'ACCOUNTING',
    label: 'Accounting & Expenses',
    category: 'Finance & Billing',
    description: 'General ledger, institutional expenses, cash flow, and net income tracking.',
    navSections: ['accounting'],
  },
  {
    code: 'ATTENDANCE',
    label: 'Attendance Tracking',
    category: 'Core Academic',
    description: 'Daily student roll-call, tardiness/absence alerts, and instructor registers.',
    navSections: ['attendance'],
  },
  {
    code: 'AI_ASSISTANT',
    label: 'AI Portal Assistant',
    category: 'AI & Automation',
    description: 'Tenant-isolated role-based ZACMA AI Assistant across all authorized modules.',
    navSections: ['ai_hub'],
  },
  {
    code: 'AI_ID_SCANNING',
    label: 'AI ID OCR & QR Scanning',
    category: 'AI & Automation',
    description: 'Automated Fayda/National ID, Passport, Driving Licence OCR & QR intake.',
    navSections: ['registrations'],
  },
  {
    code: 'NOTIFICATIONS',
    label: 'SMS & Internal Messaging',
    category: 'Operations',
    description: 'SMS gateway integration, automated reminders, and internal campus messaging.',
    navSections: ['messages', 'communications'],
  },
  {
    code: 'REPORTS',
    label: 'Executive Reports & Excel',
    category: 'Finance & Billing',
    description: 'Comprehensive downloadable .xlsx financial and academic workbooks.',
    navSections: ['reports'],
  },
  {
    code: 'HR_MANAGEMENT',
    label: 'HR & Compensation Vault',
    category: 'Operations',
    description: 'Staff compensation records, employment history, and HR compliance.',
    navSections: ['staff'],
  },
  {
    code: 'INVENTORY',
    label: 'Campus Inventory & Assets',
    category: 'Operations',
    description: 'Training lab hardware, equipment tracking, and campus supplies.',
    navSections: [],
  },
  {
    code: 'CERTIFICATES',
    label: 'Training Certificates',
    category: 'Core Academic',
    description: 'Verifiable course completion certificates and graduate registry.',
    navSections: [],
  },
];

export const ALL_SAAS_MODULE_CODES: SaasModuleCode[] = ALL_SAAS_MODULES.map((m) => m.code);

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  SUPER_ADMIN: 'Super Admin (Owner)',
  PLATFORM_ADMIN: 'Platform Admin',
  PLATFORM_SUPPORT: 'Platform Support',
  PLATFORM_FINANCE: 'Platform Finance',
};

export const INSTITUTE_ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: 'Institute Admin',
  MANAGER: 'Institute Manager',
  ACCOUNTANT: 'Accountant',
  INSTRUCTOR: 'Instructor',
  RECEPTIONIST: 'Receptionist',
  HR_OFFICER: 'HR Officer',
  GENERAL_STAFF: 'General Staff',
  STUDENT: 'Student',
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_free_trial',
    code: 'FREE_TRIAL',
    name: 'Free Trial (14 Days)',
    tagline: 'Evaluate the full ZACMA training institute portal with zero commitment.',
    monthlyPriceEtb: 0,
    annualPriceEtb: 0,
    trialDays: 14,
    studentLimit: 50,
    staffLimit: 10,
    storageLimitMb: 512,
    aiMonthlyQuota: 100,
    includedModules: [
      'STUDENT_MANAGEMENT',
      'STAFF_MANAGEMENT',
      'COURSE_MANAGEMENT',
      'FEE_MANAGEMENT',
      'ATTENDANCE',
      'AI_ASSISTANT',
      'AI_ID_SCANNING',
      'NOTIFICATIONS',
    ],
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'plan_basic',
    code: 'BASIC',
    name: 'Basic Institute',
    tagline: 'Essential student management, course scheduling, and fee receipts.',
    monthlyPriceEtb: 4500,
    annualPriceEtb: 45000,
    trialDays: 14,
    studentLimit: 250,
    staffLimit: 25,
    storageLimitMb: 2048,
    aiMonthlyQuota: 300,
    includedModules: [
      'STUDENT_MANAGEMENT',
      'STAFF_MANAGEMENT',
      'COURSE_MANAGEMENT',
      'FEE_MANAGEMENT',
      'ATTENDANCE',
      'NOTIFICATIONS',
      'REPORTS',
    ],
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'plan_professional',
    code: 'PROFESSIONAL',
    name: 'Professional Institute',
    tagline: 'Full accounting, Chapa online fees, AI ID OCR scanning, and SMS alerts.',
    monthlyPriceEtb: 9500,
    annualPriceEtb: 95000,
    trialDays: 14,
    studentLimit: 1000,
    staffLimit: 80,
    storageLimitMb: 10240,
    aiMonthlyQuota: 2000,
    includedModules: [
      'STUDENT_MANAGEMENT',
      'STAFF_MANAGEMENT',
      'COURSE_MANAGEMENT',
      'FEE_MANAGEMENT',
      'ACCOUNTING',
      'ATTENDANCE',
      'AI_ASSISTANT',
      'AI_ID_SCANNING',
      'NOTIFICATIONS',
      'REPORTS',
      'HR_MANAGEMENT',
      'CERTIFICATES',
    ],
    isActive: true,
    isFeatured: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'plan_enterprise',
    code: 'ENTERPRISE',
    name: 'Enterprise Campus',
    tagline: 'Unlimited scale, custom branding, full AI suite, HR, and priority SLA.',
    monthlyPriceEtb: 18500,
    annualPriceEtb: 185000,
    trialDays: 30,
    studentLimit: 10000,
    staffLimit: 500,
    storageLimitMb: 51200,
    aiMonthlyQuota: 20000,
    includedModules: ALL_SAAS_MODULE_CODES,
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_PLATFORM_SETTINGS: PlatformGlobalSettings = {
  id: 'default',
  platformName: 'ZACMA Technology SaaS Platform',
  supportEmail: 'support@zacmatech.com',
  supportPhone: '+251 911 000 000',
  defaultCurrency: 'ETB',
  defaultLanguage: 'English (Ethiopia)',
  defaultTrialDays: 14,
  gracePeriodDays: 7,
  autoSuspendExpiredDays: 14,
  allowSelfSignupInstitutes: false,
  enforceSupportSessionReason: true,
  maxSupportSessionMinutes: 60,
  defaultAiModel: 'gemini-4-hydrogen',
  aiMonthlyTokenLimit: 2000000,
  aiDocScanLimit: 500,
  updatedAt: new Date().toISOString(),
};

/**
 * Returns whether a given institute navigation section is enabled for a tenant's
 * active module list. Core system views (`dashboard`, `branding`, `audit`, `setup`)
 * are always available to authorized roles.
 */
export function isNavSectionAllowedByModules(
  section: NavSection,
  enabledModules: SaasModuleCode[] | undefined
): boolean {
  if (!enabledModules || enabledModules.length === 0) return true;
  const set = new Set<SaasModuleCode>(enabledModules);
  switch (section) {
    case 'dashboard':
    case 'branding':
    case 'audit':
    case 'setup':
      return true;
    case 'ai_hub':
      return set.has('AI_ASSISTANT');
    case 'students':
      return set.has('STUDENT_MANAGEMENT');
    case 'registrations':
      return (
        set.has('AI_ID_SCANNING') ||
        set.has('STUDENT_MANAGEMENT') ||
        set.has('STAFF_MANAGEMENT')
      );
    case 'courses':
      return set.has('COURSE_MANAGEMENT');
    case 'payments':
    case 'chapa':
    case 'reminders':
    case 'approvals':
    case 'receipts':
      return set.has('FEE_MANAGEMENT');
    case 'accounting':
      return set.has('ACCOUNTING');
    case 'reports':
      return set.has('REPORTS');
    case 'attendance':
      return set.has('ATTENDANCE');
    case 'messages':
    case 'communications':
      return set.has('NOTIFICATIONS');
    case 'staff':
      return set.has('STAFF_MANAGEMENT') || set.has('HR_MANAGEMENT');
    default:
      return true;
  }
}

export function requiredModuleForNavSection(section: NavSection): SaasModuleCode | null {
  switch (section) {
    case 'ai_hub':
      return 'AI_ASSISTANT';
    case 'students':
      return 'STUDENT_MANAGEMENT';
    case 'registrations':
      return 'AI_ID_SCANNING';
    case 'courses':
      return 'COURSE_MANAGEMENT';
    case 'payments':
    case 'chapa':
    case 'reminders':
    case 'approvals':
    case 'receipts':
      return 'FEE_MANAGEMENT';
    case 'accounting':
      return 'ACCOUNTING';
    case 'reports':
      return 'REPORTS';
    case 'attendance':
      return 'ATTENDANCE';
    case 'messages':
    case 'communications':
      return 'NOTIFICATIONS';
    case 'staff':
      return 'STAFF_MANAGEMENT';
    default:
      return null;
  }
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

function makeSlug(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return clean || 'institute';
}

function makeInviteToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
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

export interface PlatformActor {
  uid: string;
  fullName: string;
  role: RoleCode;
  platformRole?: PlatformRole;
}

/**
 * Idempotently bootstraps default ZACMA SaaS platform metadata:
 * - tenants/zacma_default (preserving all legacy ZACMA records seamlessly)
 * - subscription_plans/{free_trial, basic, professional, enterprise}
 * - platform_settings/default
 * - platform_subscriptions/sub_zacma_default
 */
export async function ensurePlatformBootstrapped(actor: PlatformActor): Promise<void> {
  if (!actor.platformRole) return;
  const now = new Date().toISOString();
  const today = todayIsoDate();

  try {
    const [defaultTenantSnap, settingsSnap, plansSnap, defaultSubSnap] = await Promise.all([
      getDoc(doc(db, 'tenants', DEFAULT_ZACMA_TENANT_ID)),
      getDoc(doc(db, 'platform_settings', 'default')),
      getDocs(collection(db, 'subscription_plans')),
      getDoc(doc(db, 'platform_subscriptions', 'sub_zacma_default')),
    ]);

    const batch = writeBatch(db);
    let ops = 0;

    if (!defaultTenantSnap.exists()) {
      const zacmaTenant: Omit<TenantRecord, 'id'> = {
        tenantId: DEFAULT_ZACMA_TENANT_ID,
        name: 'ZACMA Technology Training Institute',
        shortName: 'ZACMA Tech',
        slug: 'zacma-technology',
        businessType: 'Technology & Engineering Training Institute',
        email: 'admin@zacmatech.com',
        phone: '+251 911 000 000',
        country: 'Ethiopia',
        city: 'Addis Ababa',
        address: 'Bole Sub-City, Addis Ababa, Ethiopia',
        website: 'https://zacmatech.com',
        primaryColor: '#0B2545',
        secondaryColor: '#D97706',
        studentIdPrefix: 'ZAC-STU',
        staffIdPrefix: 'ZAC-STA',
        receiptPrefix: 'RCP',
        currency: 'ETB',
        timezone: 'Africa/Addis_Ababa',
        academicYear: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
        paymentMethods: ['Cash', 'CBE Birr', 'Telebirr', 'Bank Transfer', 'Check', 'Chapa'],
        defaultLanguage: 'English (Ethiopia)',
        dateFormat: 'GREGORIAN_AND_ETHIOPIAN',
        invoiceFooterNote: 'Official ZACMA Technology Training Institute Financial Document.',
        notificationEmailEnabled: true,
        notificationSmsEnabled: true,
        notificationWhatsappEnabled: false,
        emailGatewayStatus: 'CONFIGURED',
        smsGatewayStatus: 'CONFIGURED',
        whatsappGatewayStatus: 'UNCONFIGURED',
        smsSenderLabel: 'ZACMA',
        status: 'ACTIVE',
        planId: 'plan_enterprise',
        planCode: 'ENTERPRISE',
        planName: 'Enterprise Campus',
        billingCycle: 'ANNUAL',
        monthlyPriceEtb: 0,
        annualPriceEtb: 0,
        studentLimit: 10000,
        staffLimit: 500,
        storageLimitMb: 51200,
        storageUsedMb: 120,
        aiMonthlyQuota: 20000,
        aiRequestsUsed: 0,
        enabledModules: ALL_SAAS_MODULE_CODES,
        primaryAdminUid: actor.uid,
        primaryAdminName: actor.fullName,
        primaryAdminEmail: 'zekimuluken@gmail.com',
        primaryAdminPhone: '+251 911 000 000',
        primaryAdminPosition: 'Platform Founder & Director',
        subscriptionStartDate: today,
        subscriptionExpiresAt: addDaysIso(today, 3650),
        isDefaultPlatformTenant: true,
        createdBy: actor.uid,
        createdByName: actor.fullName,
        createdAt: now,
        updatedAt: now,
      };
      batch.set(doc(db, 'tenants', DEFAULT_ZACMA_TENANT_ID), cleanObject(zacmaTenant));
      ops++;
    }

    if (!settingsSnap.exists()) {
      const { id: _id, ...settingsBody } = DEFAULT_PLATFORM_SETTINGS;
      batch.set(
        doc(db, 'platform_settings', 'default'),
        cleanObject({
          ...settingsBody,
          updatedBy: actor.uid,
          updatedByName: actor.fullName,
          updatedAt: now,
        })
      );
      ops++;
    }

    if (plansSnap.empty) {
      for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
        const { id, ...planBody } = plan;
        batch.set(
          doc(db, 'subscription_plans', id),
          cleanObject({ ...planBody, updatedAt: now })
        );
        ops++;
      }
    }

    if (!defaultSubSnap.exists()) {
      batch.set(
        doc(db, 'platform_subscriptions', 'sub_zacma_default'),
        cleanObject({
          tenantId: DEFAULT_ZACMA_TENANT_ID,
          tenantName: 'ZACMA Technology Training Institute',
          planId: 'plan_enterprise',
          planCode: 'ENTERPRISE',
          planName: 'Enterprise Campus (Platform Owner)',
          billingCycle: 'ANNUAL',
          priceEtb: 0,
          currency: 'ETB',
          status: 'ACTIVE',
          startDate: today,
          expiresAt: addDaysIso(today, 3650),
          autoRenew: true,
          notes: 'Flagship ZACMA Technology Training Institute tenant.',
          updatedBy: actor.uid,
          createdAt: now,
          updatedAt: now,
        })
      );
      ops++;
    }

    if (ops > 0) {
      await batch.commit();
    }
  } catch (error) {
    // Non-blocking bootstrap failure should not break existing portal login
    console.warn('Platform bootstrap skipped or deferred:', error);
  }
}

export interface ProvisionInstituteInput {
  // Institute Information
  name: string;
  shortName: string;
  businessType: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  website?: string;
  logoUrl?: string;
  // Admin Contact
  primaryAdminName: string;
  primaryAdminEmail: string;
  primaryAdminPhone: string;
  primaryAdminPosition: string;
  // Configuration
  studentIdPrefix: string;
  staffIdPrefix: string;
  receiptPrefix: string;
  currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  timezone: string;
  academicYear: string;
  paymentMethods: PaymentMethod[];
  defaultLanguage: string;
  dateFormat: 'GREGORIAN_AND_ETHIOPIAN' | 'GREGORIAN_ONLY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  primaryColor: string;
  secondaryColor: string;
  invoiceFooterNote?: string;
  notificationEmailEnabled: boolean;
  notificationSmsEnabled: boolean;
  notificationWhatsappEnabled: boolean;
  // Subscription
  planId: string;
  planCode: string;
  planName: string;
  billingCycle: BillingCycle;
  monthlyPriceEtb: number;
  annualPriceEtb: number;
  subscriptionStartDate: string;
  trialDays: number;
  subscriptionExpiresAt: string;
  studentLimit: number;
  staffLimit: number;
  storageLimitMb: number;
  aiMonthlyQuota: number;
  enabledModules: SaasModuleCode[];
  markInitialInvoicePaid?: boolean;
  initialPaymentMethod?: 'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check';
  initialPaymentRef?: string;
}

export interface ProvisionInstituteResult {
  tenantId: string;
  slug: string;
  invitationId: string;
  inviteToken: string;
  inviteUrl: string;
  invoiceNumber?: string;
}

/**
 * Atomically provisions a brand-new, isolated Training Institute tenant:
 * 1. Unique tenantId + tenants/{tenantId}
 * 2. Active/Trial platform_subscriptions/{subId}
 * 3. Initial platform_invoices/{invId} (+ platform_payments/{payId} if paid upfront)
 * 4. Tenant-scoped default payment_plans & expense_categories
 * 5. Secure tenant_invitations/{inviteId} with one-time claimable invite link
 * 6. Welcome notification & immutable audit_logs entry
 */
export async function provisionTrainingInstitute(
  input: ProvisionInstituteInput,
  actor: PlatformActor
): Promise<ProvisionInstituteResult> {
  if (actor.platformRole !== 'SUPER_ADMIN' && actor.platformRole !== 'PLATFORM_ADMIN') {
    throw new Error('Only Platform Administrators can register and provision new training institutes.');
  }

  const now = new Date().toISOString();
  const slug = makeSlug(input.shortName || input.name);
  const rand4 = Math.random().toString(36).slice(2, 6);
  const tenantId = `inst_${slug.replace(/-/g, '_')}_${rand4}`;
  const subId = `sub_${tenantId}`;
  const inviteId = makeId('inv');
  const inviteToken = makeInviteToken();

  const isTrial = input.billingCycle === 'TRIAL' || input.planCode === 'FREE_TRIAL';
  const tenantStatus: TenantStatus = isTrial ? 'TRIAL' : 'ACTIVE';
  const trialEndsAt = isTrial
    ? addDaysIso(input.subscriptionStartDate, Math.max(1, input.trialDays || 14))
    : undefined;
  const effectivePrice =
    isTrial
      ? 0
      : input.billingCycle === 'ANNUAL'
      ? Number(input.annualPriceEtb || 0)
      : Number(input.monthlyPriceEtb || 0);

  const cleanStuPrefix =
    input.studentIdPrefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 14) || `${slug.slice(0, 3).toUpperCase()}-STU`;
  const cleanStfPrefix =
    input.staffIdPrefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 14) || `${slug.slice(0, 3).toUpperCase()}-STA`;
  const cleanRcpPrefix =
    input.receiptPrefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 14) || `${slug.slice(0, 3).toUpperCase()}-RCP`;

  try {
    const batch = writeBatch(db);

    // 1. Tenant Master Document
    const tenantDoc: Omit<TenantRecord, 'id'> = {
      tenantId,
      name: input.name.trim().slice(0, 140),
      shortName: (input.shortName.trim() || input.name.trim().slice(0, 28)).slice(0, 48),
      slug,
      businessType: input.businessType.trim().slice(0, 80) || 'Training Institute',
      email: input.email.trim().toLowerCase().slice(0, 160),
      phone: input.phone.trim().slice(0, 32),
      country: input.country.trim().slice(0, 80) || 'Ethiopia',
      city: input.city.trim().slice(0, 80) || 'Addis Ababa',
      address: input.address.trim().slice(0, 240),
      website: input.website?.trim().slice(0, 200),
      logoUrl: input.logoUrl?.slice(0, 90000),
      primaryColor: input.primaryColor || '#0B2545',
      secondaryColor: input.secondaryColor || '#D97706',
      studentIdPrefix: cleanStuPrefix,
      staffIdPrefix: cleanStfPrefix,
      receiptPrefix: cleanRcpPrefix,
      currency: input.currency || 'ETB',
      timezone: input.timezone || 'Africa/Addis_Ababa',
      academicYear: input.academicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      paymentMethods:
        input.paymentMethods.length > 0
          ? input.paymentMethods
          : ['Cash', 'Bank Transfer', 'Telebirr', 'Chapa'],
      defaultLanguage: input.defaultLanguage || 'English (Ethiopia)',
      dateFormat: input.dateFormat || 'GREGORIAN_AND_ETHIOPIAN',
      invoiceFooterNote:
        input.invoiceFooterNote?.trim().slice(0, 240) ||
        `Official financial document issued by ${input.name.trim()}.`,
      notificationEmailEnabled: Boolean(input.notificationEmailEnabled),
      notificationSmsEnabled: Boolean(input.notificationSmsEnabled),
      notificationWhatsappEnabled: Boolean(input.notificationWhatsappEnabled),
      emailGatewayStatus: input.notificationEmailEnabled ? 'CONFIGURED' : 'UNCONFIGURED',
      smsGatewayStatus: input.notificationSmsEnabled ? 'CONFIGURED' : 'UNCONFIGURED',
      whatsappGatewayStatus: input.notificationWhatsappEnabled ? 'CONFIGURED' : 'UNCONFIGURED',
      smsSenderLabel: cleanStuPrefix.split('-')[0],
      status: tenantStatus,
      planId: input.planId,
      planCode: input.planCode,
      planName: input.planName,
      billingCycle: input.billingCycle,
      monthlyPriceEtb: Number(input.monthlyPriceEtb || 0),
      annualPriceEtb: Number(input.annualPriceEtb || 0),
      studentLimit: Math.max(1, Number(input.studentLimit || 100)),
      staffLimit: Math.max(1, Number(input.staffLimit || 20)),
      storageLimitMb: Math.max(128, Number(input.storageLimitMb || 2048)),
      storageUsedMb: 0,
      aiMonthlyQuota: Math.max(0, Number(input.aiMonthlyQuota || 0)),
      aiRequestsUsed: 0,
      enabledModules: input.enabledModules,
      primaryAdminName: input.primaryAdminName.trim().slice(0, 120),
      primaryAdminEmail: input.primaryAdminEmail.trim().toLowerCase().slice(0, 160),
      primaryAdminPhone: input.primaryAdminPhone.trim().slice(0, 32),
      primaryAdminPosition: input.primaryAdminPosition.trim().slice(0, 80) || 'Institute Administrator',
      subscriptionStartDate: input.subscriptionStartDate,
      trialEndsAt,
      subscriptionExpiresAt: input.subscriptionExpiresAt,
      isDefaultPlatformTenant: false,
      createdBy: actor.uid,
      createdByName: actor.fullName.slice(0, 120),
      createdAt: now,
      updatedAt: now,
    };
    batch.set(doc(db, 'tenants', tenantId), cleanObject(tenantDoc));

    // 2. Platform Subscription Document
    batch.set(
      doc(db, 'platform_subscriptions', subId),
      cleanObject({
        tenantId,
        tenantName: tenantDoc.name,
        planId: input.planId,
        planCode: input.planCode,
        planName: input.planName,
        billingCycle: input.billingCycle,
        priceEtb: effectivePrice,
        currency: input.currency || 'ETB',
        status: isTrial ? 'TRIAL' : 'ACTIVE',
        startDate: input.subscriptionStartDate,
        trialEndsAt,
        expiresAt: input.subscriptionExpiresAt,
        autoRenew: true,
        updatedBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      })
    );

    // 3. Initial Platform Invoice (if paid plan)
    let invoiceNumber: string | undefined;
    if (effectivePrice > 0) {
      const invId = makeId('pinv');
      invoiceNumber = `ZAC-INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      const isPaidNow = Boolean(input.markInitialInvoicePaid);
      const payRef = input.initialPaymentRef?.trim() || `ZAC-SUB-${Date.now().toString().slice(-6)}`;

      batch.set(
        doc(db, 'platform_invoices', invId),
        cleanObject({
          invoiceNumber,
          tenantId,
          tenantName: tenantDoc.name,
          subscriptionId: subId,
          planName: input.planName,
          billingCycle: input.billingCycle,
          amountEtb: effectivePrice,
          currency: input.currency || 'ETB',
          dueDate: addDaysIso(input.subscriptionStartDate, 7),
          status: isPaidNow ? 'PAID' : 'PENDING',
          paidAt: isPaidNow ? now : undefined,
          paymentRef: isPaidNow ? payRef : undefined,
          notes: `Initial ${input.billingCycle.toLowerCase()} SaaS subscription invoice for ${tenantDoc.name}.`,
          issuedBy: actor.uid,
          issuedByName: actor.fullName.slice(0, 120),
          createdAt: now,
          updatedAt: now,
        })
      );

      if (isPaidNow) {
        const payId = makeId('ppay');
        batch.set(
          doc(db, 'platform_payments', payId),
          cleanObject({
            paymentRef: payRef,
            invoiceId: invId,
            invoiceNumber,
            tenantId,
            tenantName: tenantDoc.name,
            planName: input.planName,
            amountEtb: effectivePrice,
            currency: input.currency || 'ETB',
            paymentDate: todayIsoDate(),
            paymentMethod: input.initialPaymentMethod || 'Bank Transfer',
            status: 'COMPLETED',
            recordedBy: actor.uid,
            recordedByName: actor.fullName.slice(0, 120),
            notes: 'Collected at institute provisioning.',
            createdAt: now,
          })
        );
      }
    }

    // 4. Default Tenant-Scoped Payment Plans & Expense Categories
    const defaultPlans = [
      { code: 'FULL', name: 'Full Payment (Upfront)', installmentCount: 1, intervalDays: 0, description: 'Single 100% payment upon enrollment.' },
      { code: 'MONTHLY', name: 'Monthly Installment (3x)', installmentCount: 3, intervalDays: 30, description: 'Three equal monthly installments.' },
      { code: 'TWO_MONTH', name: 'Bi-Monthly Plan (2x)', installmentCount: 2, intervalDays: 60, description: 'Two equal payments every 60 days.' },
      { code: 'CUSTOM', name: 'Custom Installment Schedule', installmentCount: 2, intervalDays: 30, description: 'Flexible custom installment count and interval.' },
    ];
    for (const p of defaultPlans) {
      batch.set(doc(db, 'payment_plans', `${tenantId}_plan_${p.code.toLowerCase()}`), {
        tenantId,
        ...p,
        isActive: true,
      });
    }

    const defaultCategories = [
      { key: 'salaries', name: 'Instructor & Staff Salaries', description: 'Monthly payroll and trainer stipends.' },
      { key: 'rent', name: 'Campus Rent & Facilities', description: 'Classrooms, labs, and administrative offices.' },
      { key: 'utilities', name: 'Utilities & Internet', description: 'Electricity, water, fiber internet, and telecom.' },
      { key: 'equipment', name: 'Lab Equipment & Supplies', description: 'Training computers, tools, and consumables.' },
      { key: 'marketing', name: 'Marketing & Admissions', description: 'Digital campaigns and enrollment outreach.' },
    ];
    for (const c of defaultCategories) {
      batch.set(doc(db, 'expense_categories', `${tenantId}_cat_${c.key}`), {
        tenantId,
        name: c.name,
        description: c.description,
        isActive: true,
      });
    }

    // 5. Secure Onboarding Invitation for the Primary Institute Admin
    const adminEmailLower = input.primaryAdminEmail.trim().toLowerCase();
    batch.set(
      doc(db, 'tenant_invitations', inviteId),
      cleanObject({
        token: inviteToken,
        tenantId,
        tenantName: tenantDoc.name,
        email: input.primaryAdminEmail.trim(),
        emailLower: adminEmailLower,
        fullName: input.primaryAdminName.trim().slice(0, 120),
        phone: input.primaryAdminPhone.trim().slice(0, 32),
        position: input.primaryAdminPosition.trim().slice(0, 80),
        role: 'ADMIN',
        status: 'PENDING',
        expiresAt: addDaysIso(todayIsoDate(), 30),
        createdBy: actor.uid,
        createdByName: actor.fullName.slice(0, 120),
        createdAt: now,
        updatedAt: now,
      })
    );

    // 6. Welcome Notification inside the new tenant + Centralized Audit Log
    batch.set(doc(db, 'notifications', makeId('not_welcome')), {
      tenantId,
      type: 'INSTITUTE_PROVISIONED',
      title: `Welcome to ${tenantDoc.name} Portal`,
      message: `Your independent training institute portal (${tenantId}) has been provisioned on the ${input.planName} plan. Configure your courses, staff, and branding to begin.`,
      targetRole: 'ADMIN',
      entityType: 'tenant',
      entityId: tenantId,
      isRead: false,
      createdAt: now,
    });

    batch.set(doc(db, 'audit_logs', makeId('aud_prov')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'INSTITUTE_PROVISIONED',
      entityType: 'tenant',
      entityId: tenantId,
      summary: `Provisioned training institute "${tenantDoc.name}" (${tenantId}) on ${input.planName} (${tenantStatus}). Admin invite issued for ${adminEmailLower}.`,
      result: 'SUCCESS',
      createdAt: now,
    });

    await batch.commit();

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteUrl = `${origin}/?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(adminEmailLower)}&tenant=${encodeURIComponent(tenantDoc.name)}`;

    return {
      tenantId,
      slug,
      invitationId: inviteId,
      inviteToken,
      inviteUrl,
      invoiceNumber,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tenants/${tenantId}`);
  }
}

export async function updateTenantBySuperAdmin(
  tenantId: string,
  updates: Partial<TenantRecord>,
  actor: PlatformActor,
  auditSummary?: string
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    const { id: _id, tenantId: _tid, ...safeUpdates } = updates as Record<string, unknown>;
    batch.update(doc(db, 'tenants', tenantId), {
      ...safeUpdates,
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_ten_upd')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'TENANT_UPDATED',
      entityType: 'tenant',
      entityId: tenantId,
      summary: auditSummary || `Updated configuration for institute ${tenantId}.`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tenants/${tenantId}`);
  }
}

export async function suspendTenant(
  tenant: TenantRecord,
  reason: string,
  actor: PlatformActor
): Promise<void> {
  if (tenant.tenantId === DEFAULT_ZACMA_TENANT_ID) {
    throw new Error('The primary ZACMA Platform Owner tenant cannot be suspended.');
  }
  const cleanReason = reason.trim().slice(0, 260) || 'Administrative suspension by ZACMA Platform Owner.';
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'tenants', tenant.id), {
      status: 'SUSPENDED',
      suspendedReason: cleanReason,
      suspendedAt: now,
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_susp')), {
      tenantId: tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'TENANT_SUSPENDED',
      entityType: 'tenant',
      entityId: tenant.tenantId,
      summary: `Suspended institute "${tenant.name}" (${tenant.tenantId}): ${cleanReason}`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tenants/${tenant.id}`);
  }
}

export async function reactivateTenant(
  tenant: TenantRecord,
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'tenants', tenant.id), {
      status: 'ACTIVE',
      suspendedReason: '',
      suspendedAt: '',
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_react')), {
      tenantId: tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'TENANT_REACTIVATED',
      entityType: 'tenant',
      entityId: tenant.tenantId,
      summary: `Reactivated institute "${tenant.name}" (${tenant.tenantId}).`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tenants/${tenant.id}`);
  }
}

export async function updateTenantModules(
  tenant: TenantRecord,
  enabledModules: SaasModuleCode[],
  actor: PlatformActor
): Promise<void> {
  await updateTenantBySuperAdmin(
    tenant.id,
    { enabledModules },
    actor,
    `Updated enabled SaaS modules for ${tenant.name} (${enabledModules.length}/${ALL_SAAS_MODULE_CODES.length} active).`
  );
}

export async function updateTenantLimits(
  tenant: TenantRecord,
  limits: {
    studentLimit: number;
    staffLimit: number;
    storageLimitMb: number;
    aiMonthlyQuota: number;
  },
  actor: PlatformActor
): Promise<void> {
  await updateTenantBySuperAdmin(
    tenant.id,
    limits,
    actor,
    `Updated usage quotas for ${tenant.name}: Students=${limits.studentLimit}, Staff=${limits.staffLimit}, Storage=${limits.storageLimitMb}MB, AI=${limits.aiMonthlyQuota}/mo.`
  );
}

export async function upgradeOrExtendSubscription(
  tenant: TenantRecord,
  existingSub: PlatformSubscription | undefined,
  input: {
    plan: SubscriptionPlan;
    billingCycle: BillingCycle;
    newExpiresAt: string;
    applyPlanModulesAndLimits: boolean;
    generateInvoice: boolean;
    notes?: string;
  },
  actor: PlatformActor
): Promise<{ invoiceNumber?: string }> {
  const now = new Date().toISOString();
  const subId = existingSub?.id || `sub_${tenant.tenantId}`;
  const isTrial = input.billingCycle === 'TRIAL' || input.plan.code === 'FREE_TRIAL';
  const priceEtb = isTrial
    ? 0
    : input.billingCycle === 'ANNUAL'
    ? input.plan.annualPriceEtb
    : input.plan.monthlyPriceEtb;

  try {
    const batch = writeBatch(db);

    const tenantPatch: Record<string, unknown> = {
      status: isTrial ? 'TRIAL' : 'ACTIVE',
      planId: input.plan.id,
      planCode: input.plan.code,
      planName: input.plan.name,
      billingCycle: input.billingCycle,
      monthlyPriceEtb: input.plan.monthlyPriceEtb,
      annualPriceEtb: input.plan.annualPriceEtb,
      subscriptionExpiresAt: input.newExpiresAt,
      updatedAt: now,
    };

    if (input.applyPlanModulesAndLimits) {
      tenantPatch.studentLimit = input.plan.studentLimit;
      tenantPatch.staffLimit = input.plan.staffLimit;
      tenantPatch.storageLimitMb = input.plan.storageLimitMb;
      tenantPatch.aiMonthlyQuota = input.plan.aiMonthlyQuota;
      tenantPatch.enabledModules = input.plan.includedModules;
    }

    batch.update(doc(db, 'tenants', tenant.id), tenantPatch);

    batch.set(
      doc(db, 'platform_subscriptions', subId),
      cleanObject({
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        planId: input.plan.id,
        planCode: input.plan.code,
        planName: input.plan.name,
        billingCycle: input.billingCycle,
        priceEtb,
        currency: tenant.currency || 'ETB',
        status: isTrial ? 'TRIAL' : 'ACTIVE',
        startDate: existingSub?.startDate || todayIsoDate(),
        expiresAt: input.newExpiresAt,
        autoRenew: existingSub?.autoRenew ?? true,
        notes: input.notes?.trim().slice(0, 300),
        updatedBy: actor.uid,
        createdAt: existingSub?.createdAt || now,
        updatedAt: now,
      })
    );

    let invoiceNumber: string | undefined;
    if (input.generateInvoice && priceEtb > 0) {
      const invId = makeId('pinv');
      invoiceNumber = `ZAC-INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      batch.set(
        doc(db, 'platform_invoices', invId),
        cleanObject({
          invoiceNumber,
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          subscriptionId: subId,
          planName: input.plan.name,
          billingCycle: input.billingCycle,
          amountEtb: priceEtb,
          currency: tenant.currency || 'ETB',
          dueDate: addDaysIso(todayIsoDate(), 7),
          status: 'PENDING',
          notes: input.notes?.trim().slice(0, 300) || `Subscription renewal/upgrade to ${input.plan.name}.`,
          issuedBy: actor.uid,
          issuedByName: actor.fullName.slice(0, 120),
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    batch.set(doc(db, 'audit_logs', makeId('aud_sub_upd')), {
      tenantId: tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'SUBSCRIPTION_UPDATED',
      entityType: 'platform_subscription',
      entityId: subId,
      summary: `Updated subscription for ${tenant.name} to ${input.plan.name} (${input.billingCycle}) valid until ${input.newExpiresAt}.`,
      result: 'SUCCESS',
      createdAt: now,
    });

    await batch.commit();
    return { invoiceNumber };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `platform_subscriptions/${subId}`);
  }
}

export async function saveSubscriptionPlan(
  plan: Omit<SubscriptionPlan, 'updatedAt'>,
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  const planId = plan.id || makeId('plan');
  try {
    const batch = writeBatch(db);
    const { id: _id, ...body } = plan;
    batch.set(doc(db, 'subscription_plans', planId), {
      ...body,
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_plan')), {
      tenantId: DEFAULT_ZACMA_TENANT_ID,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'SUBSCRIPTION_PLAN_SAVED',
      entityType: 'subscription_plan',
      entityId: planId,
      summary: `Saved SaaS plan "${plan.name}" (${plan.code}) — Monthly ETB ${plan.monthlyPriceEtb.toLocaleString()}, Annual ETB ${plan.annualPriceEtb.toLocaleString()}.`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `subscription_plans/${planId}`);
  }
}

export async function createPlatformInvoice(
  input: {
    tenant: TenantRecord;
    subscriptionId?: string;
    planName: string;
    billingCycle: BillingCycle;
    amountEtb: number;
    dueDate: string;
    notes?: string;
  },
  actor: PlatformActor
): Promise<string> {
  const now = new Date().toISOString();
  const invId = makeId('pinv');
  const invoiceNumber = `ZAC-INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'platform_invoices', invId),
      cleanObject({
        invoiceNumber,
        tenantId: input.tenant.tenantId,
        tenantName: input.tenant.name,
        subscriptionId: input.subscriptionId || `sub_${input.tenant.tenantId}`,
        planName: input.planName,
        billingCycle: input.billingCycle,
        amountEtb: Number(input.amountEtb),
        currency: input.tenant.currency || 'ETB',
        dueDate: input.dueDate,
        status: 'PENDING',
        notes: input.notes?.trim().slice(0, 300),
        issuedBy: actor.uid,
        issuedByName: actor.fullName.slice(0, 120),
        createdAt: now,
        updatedAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud_pinv')), {
      tenantId: input.tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'PLATFORM_INVOICE_ISSUED',
      entityType: 'platform_invoice',
      entityId: invId,
      summary: `Issued platform invoice ${invoiceNumber} for ${input.tenant.name} — ETB ${input.amountEtb.toLocaleString()}.`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
    return invoiceNumber;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'platform_invoices');
  }
}

export async function recordPlatformPayment(
  input: {
    tenant: TenantRecord;
    invoice?: PlatformInvoice;
    planName: string;
    amountEtb: number;
    paymentDate: string;
    paymentMethod: 'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check';
    paymentRef: string;
    notes?: string;
  },
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  const payId = makeId('ppay');
  const cleanRef = input.paymentRef.trim() || `ZAC-SUB-${Date.now().toString().slice(-6)}`;
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'platform_payments', payId),
      cleanObject({
        paymentRef: cleanRef,
        invoiceId: input.invoice?.id,
        invoiceNumber: input.invoice?.invoiceNumber,
        tenantId: input.tenant.tenantId,
        tenantName: input.tenant.name,
        planName: input.planName,
        amountEtb: Number(input.amountEtb),
        currency: input.tenant.currency || 'ETB',
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        status: 'COMPLETED',
        recordedBy: actor.uid,
        recordedByName: actor.fullName.slice(0, 120),
        notes: input.notes?.trim().slice(0, 300),
        createdAt: now,
      })
    );

    if (input.invoice) {
      batch.update(doc(db, 'platform_invoices', input.invoice.id), {
        status: 'PAID',
        paidAt: now,
        paymentRef: cleanRef,
        updatedAt: now,
      });
    }

    batch.set(doc(db, 'audit_logs', makeId('aud_ppay')), {
      tenantId: input.tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'PLATFORM_PAYMENT_RECORDED',
      entityType: 'platform_payment',
      entityId: payId,
      summary: `Recorded platform subscription payment ${cleanRef} from ${input.tenant.name} — ETB ${input.amountEtb.toLocaleString()} (${input.paymentMethod}).`,
      result: 'SUCCESS',
      createdAt: now,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'platform_payments');
  }
}

export async function sendSubscriptionExpiryReminder(
  tenant: TenantRecord,
  subscription: PlatformSubscription | undefined,
  message: string,
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'notifications', makeId('not_sub_exp')), {
      tenantId: tenant.tenantId,
      type: 'SUBSCRIPTION_EXPIRING',
      title: `Subscription Renewal Notice — ${tenant.planName}`,
      message: message.trim().slice(0, 480),
      targetRole: 'ADMIN',
      entityType: 'platform_subscription',
      entityId: subscription?.id || `sub_${tenant.tenantId}`,
      isRead: false,
      createdAt: now,
    });
    if (subscription) {
      batch.update(doc(db, 'platform_subscriptions', subscription.id), {
        lastReminderSentAt: now,
        updatedAt: now,
      });
    }
    batch.set(doc(db, 'audit_logs', makeId('aud_rem')), {
      tenantId: tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'SUBSCRIPTION_REMINDER_SENT',
      entityType: 'tenant',
      entityId: tenant.tenantId,
      summary: `Sent subscription renewal reminder to ${tenant.name} (expires ${tenant.subscriptionExpiresAt}).`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }
}

export async function createTenantInvitation(
  input: {
    tenant: TenantRecord;
    email: string;
    fullName: string;
    phone?: string;
    position?: string;
    role: RoleCode;
  },
  actor: PlatformActor
): Promise<{ inviteId: string; inviteUrl: string }> {
  const now = new Date().toISOString();
  const inviteId = makeId('inv');
  const token = makeInviteToken();
  const emailLower = input.email.trim().toLowerCase();

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'tenant_invitations', inviteId),
      cleanObject({
        token,
        tenantId: input.tenant.tenantId,
        tenantName: input.tenant.name,
        email: input.email.trim(),
        emailLower,
        fullName: input.fullName.trim().slice(0, 120),
        phone: input.phone?.trim().slice(0, 32),
        position: input.position?.trim().slice(0, 80),
        role: input.role,
        status: 'PENDING',
        expiresAt: addDaysIso(todayIsoDate(), 30),
        createdBy: actor.uid,
        createdByName: actor.fullName.slice(0, 120),
        createdAt: now,
        updatedAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud_inv')), {
      tenantId: input.tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'TENANT_INVITATION_CREATED',
      entityType: 'tenant_invitation',
      entityId: inviteId,
      summary: `Issued ${input.role} invitation for ${emailLower} to join ${input.tenant.name}.`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteUrl = `${origin}/?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(emailLower)}&tenant=${encodeURIComponent(input.tenant.name)}`;
    return { inviteId, inviteUrl };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'tenant_invitations');
  }
}

export async function revokeTenantInvitation(
  invitation: TenantInvitation,
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'tenant_invitations', invitation.id), {
      status: 'REVOKED',
      updatedAt: now,
    });
    await setDoc(doc(db, 'audit_logs', makeId('aud_inv_rev')), {
      tenantId: invitation.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'TENANT_INVITATION_REVOKED',
      entityType: 'tenant_invitation',
      entityId: invitation.id,
      summary: `Revoked pending invitation for ${invitation.email} (${invitation.tenantName}).`,
      result: 'SUCCESS',
      createdAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tenant_invitations/${invitation.id}`);
  }
}

export async function startSupportAccessSession(
  tenant: TenantRecord,
  reason: string,
  durationMinutes: number,
  actor: PlatformActor
): Promise<SupportAccessSession> {
  if (!actor.platformRole) {
    throw new Error('Only authorized ZACMA platform personnel can initiate a support access session.');
  }
  const cleanReason = reason.trim().slice(0, 260);
  if (cleanReason.length < 5) {
    throw new Error('Please provide a clear support reason (at least 5 characters) for the audit trail.');
  }
  const safeMins = Math.max(5, Math.min(120, Math.round(durationMinutes || 30)));
  const now = new Date();
  const startedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + safeMins * 60_000).toISOString();
  const sessionId = makeId('sup');

  const session: SupportAccessSession = {
    id: sessionId,
    tenantId: tenant.tenantId,
    tenantName: tenant.name,
    actorUid: actor.uid,
    actorName: actor.fullName,
    actorPlatformRole: actor.platformRole,
    reason: cleanReason,
    status: 'ACTIVE',
    startedAt,
    expiresAt,
  };

  try {
    const batch = writeBatch(db);
    const { id: _id, ...body } = session;
    batch.set(doc(db, 'support_access_sessions', sessionId), body);
    batch.set(doc(db, 'notifications', makeId('not_sup')), {
      tenantId: tenant.tenantId,
      type: 'SUPPORT_SESSION_STARTED',
      title: `Authorized ZACMA Support Access Started`,
      message: `${actor.fullName} (${PLATFORM_ROLE_LABELS[actor.platformRole]}) opened a ${safeMins}-minute audited support session. Reason: ${cleanReason}`,
      targetRole: 'ADMIN',
      entityType: 'support_access_session',
      entityId: sessionId,
      isRead: false,
      createdAt: startedAt,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_sup_start')), {
      tenantId: tenant.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'SUPPORT_ACCESS_STARTED',
      entityType: 'support_access_session',
      entityId: sessionId,
      summary: `Started ${safeMins}-min authorized support session for ${tenant.name} (${tenant.tenantId}). Reason: ${cleanReason}`,
      result: 'SUCCESS',
      createdAt: startedAt,
    });
    await batch.commit();
    return session;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'support_access_sessions');
  }
}

export async function endSupportAccessSession(
  session: SupportAccessSession,
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'support_access_sessions', session.id), {
      status: 'ENDED',
      endedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_sup_end')), {
      tenantId: session.tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'SUPPORT_ACCESS_ENDED',
      entityType: 'support_access_session',
      entityId: session.id,
      summary: `Ended authorized support session for ${session.tenantName} (${session.tenantId}).`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `support_access_sessions/${session.id}`);
  }
}

export async function updateGlobalPlatformSettings(
  settings: Omit<PlatformGlobalSettings, 'id' | 'updatedAt' | 'updatedBy' | 'updatedByName'>,
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'platform_settings', 'default'),
      cleanObject({
        ...settings,
        updatedBy: actor.uid,
        updatedByName: actor.fullName.slice(0, 120),
        updatedAt: now,
      })
    );
    batch.set(doc(db, 'audit_logs', makeId('aud_gset')), {
      tenantId: DEFAULT_ZACMA_TENANT_ID,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'PLATFORM_SETTINGS_UPDATED',
      entityType: 'platform_settings',
      entityId: 'default',
      summary: `Updated global SaaS settings (Trial ${settings.defaultTrialDays}d, Grace ${settings.gracePeriodDays}d, Auto-Suspend ${settings.autoSuspendExpiredDays}d).`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platform_settings/default');
  }
}

export async function updateUserPlatformRole(
  targetProfile: StaffProfile,
  newPlatformRole: PlatformRole | null,
  actor: PlatformActor
): Promise<void> {
  if (actor.platformRole !== 'SUPER_ADMIN') {
    throw new Error('Only a Platform Super Admin can assign or revoke platform-level roles.');
  }
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    const updatePayload: Record<string, unknown> = {
      updatedAt: now,
    };
    if (newPlatformRole) {
      updatePayload.platformRole = newPlatformRole;
    } else {
      updatePayload.platformRole = '';
    }
    batch.update(doc(db, 'profiles', targetProfile.id), updatePayload);
    batch.set(doc(db, 'audit_logs', makeId('aud_prole')), {
      tenantId: targetProfile.tenantId || DEFAULT_ZACMA_TENANT_ID,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'PLATFORM_ROLE_UPDATED',
      entityType: 'profile',
      entityId: targetProfile.id,
      summary: newPlatformRole
        ? `Assigned platform role ${newPlatformRole} to ${targetProfile.fullName} (${targetProfile.email}).`
        : `Revoked platform role from ${targetProfile.fullName} (${targetProfile.email}).`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${targetProfile.id}`);
  }
}

export async function createSupportTicket(
  input: {
    tenantId: string;
    tenantName: string;
    subject: string;
    category: SupportTicket['category'];
    priority: SupportTicket['priority'];
    description: string;
  },
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  const ticketId = makeId('tkt');
  try {
    await setDoc(doc(db, 'support_tickets', ticketId), {
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      subject: input.subject.trim().slice(0, 160),
      category: input.category,
      priority: input.priority,
      status: 'OPEN',
      description: input.description.trim().slice(0, 1500),
      createdBy: actor.uid,
      createdByName: actor.fullName.slice(0, 120),
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'support_tickets');
  }
}

export async function updateSupportTicket(
  ticketId: string,
  updates: {
    status: SupportTicket['status'];
    assignedToName?: string;
    resolutionNotes?: string;
  },
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(
      doc(db, 'support_tickets', ticketId),
      cleanObject({
        status: updates.status,
        assignedToName: updates.assignedToName || actor.fullName,
        resolutionNotes: updates.resolutionNotes?.trim().slice(0, 1000),
        updatedAt: now,
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `support_tickets/${ticketId}`);
  }
}

/**
 * Institute Admin self-service branding & operational settings update.
 * Enforced by firestore.rules to allow ONLY non-billing branding/operational keys.
 */
export async function updateOwnInstituteBranding(
  tenantId: string,
  updates: {
    name: string;
    shortName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    website?: string;
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    studentIdPrefix: string;
    staffIdPrefix: string;
    receiptPrefix: string;
    currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
    timezone: string;
    academicYear: string;
    paymentMethods: PaymentMethod[];
    defaultLanguage: string;
    dateFormat: TenantRecord['dateFormat'];
    invoiceFooterNote?: string;
    notificationEmailEnabled: boolean;
    notificationSmsEnabled: boolean;
    notificationWhatsappEnabled: boolean;
    emailGatewayStatus: 'CONFIGURED' | 'UNCONFIGURED';
    smsGatewayStatus: 'CONFIGURED' | 'UNCONFIGURED';
    whatsappGatewayStatus: 'CONFIGURED' | 'UNCONFIGURED';
    smsSenderLabel?: string;
  },
  actor: PlatformActor
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'tenants', tenantId), {
      name: updates.name.trim().slice(0, 140),
      shortName: updates.shortName.trim().slice(0, 48),
      email: updates.email.trim().toLowerCase().slice(0, 160),
      phone: updates.phone.trim().slice(0, 32),
      address: updates.address.trim().slice(0, 240),
      city: updates.city.trim().slice(0, 80),
      country: updates.country.trim().slice(0, 80),
      website: updates.website?.trim().slice(0, 200) || '',
      logoUrl: updates.logoUrl?.slice(0, 90000) || '',
      primaryColor: updates.primaryColor,
      secondaryColor: updates.secondaryColor,
      studentIdPrefix: updates.studentIdPrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14),
      staffIdPrefix: updates.staffIdPrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14),
      receiptPrefix: updates.receiptPrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14),
      currency: updates.currency,
      timezone: updates.timezone,
      academicYear: updates.academicYear.trim().slice(0, 32),
      paymentMethods: updates.paymentMethods,
      defaultLanguage: updates.defaultLanguage,
      dateFormat: updates.dateFormat,
      invoiceFooterNote: updates.invoiceFooterNote?.trim().slice(0, 240) || '',
      notificationEmailEnabled: updates.notificationEmailEnabled,
      notificationSmsEnabled: updates.notificationSmsEnabled,
      notificationWhatsappEnabled: updates.notificationWhatsappEnabled,
      emailGatewayStatus: updates.emailGatewayStatus,
      smsGatewayStatus: updates.smsGatewayStatus,
      whatsappGatewayStatus: updates.whatsappGatewayStatus,
      smsSenderLabel: updates.smsSenderLabel?.trim().slice(0, 16) || '',
      updatedAt: now,
    });
    batch.set(doc(db, 'audit_logs', makeId('aud_brand')), {
      tenantId,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      action: 'INSTITUTE_BRANDING_UPDATED',
      entityType: 'tenant',
      entityId: tenantId,
      summary: `Updated branding and portal configuration for ${updates.name.trim()}.`,
      result: 'SUCCESS',
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tenants/${tenantId}`);
  }
}

export interface LegacyMigrationResult {
  totalUpdated: number;
  byCollection: Record<string, number>;
  completedAt: string;
}

/**
 * Safely stamps `tenantId: 'zacma_default'` on any pre-existing ZACMA documents
 * that were created prior to the multi-tenant SaaS upgrade. Non-destructive.
 */
export async function migrateLegacyZacmaRecordsToTenant(
  actor: PlatformActor
): Promise<LegacyMigrationResult> {
  if (actor.platformRole !== 'SUPER_ADMIN' && actor.platformRole !== 'PLATFORM_ADMIN') {
    throw new Error('Only Super Admins can execute legacy tenant migration.');
  }

  const targetCollections = [
    'profiles',
    'courses',
    'payment_plans',
    'students',
    'enrollments',
    'payment_installments',
    'payments',
    'expense_categories',
    'expenses',
    'attendance',
    'notifications',
    'chapa_transactions',
    'staff_records',
    'staff_compensation',
    'identity_documents',
    'directory_users',
    'conversations',
    'sms_logs',
  ];

  const byCollection: Record<string, number> = {};
  let totalUpdated = 0;

  for (const colName of targetCollections) {
    try {
      const snap = await getDocs(collection(db, colName));
      const docsToPatch = snap.docs.filter((d) => !d.data().tenantId);
      if (docsToPatch.length === 0) {
        byCollection[colName] = 0;
        continue;
      }

      // Commit in chunks of 400
      for (let i = 0; i < docsToPatch.length; i += 400) {
        const chunk = docsToPatch.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const d of chunk) {
          batch.update(doc(db, colName, d.id), { tenantId: DEFAULT_ZACMA_TENANT_ID });
        }
        await batch.commit();
      }
      byCollection[colName] = docsToPatch.length;
      totalUpdated += docsToPatch.length;
    } catch {
      byCollection[colName] = 0;
    }
  }

  const completedAt = new Date().toISOString();
  try {
    await setDoc(doc(db, 'schema_migrations', `mig_multitenant_${Date.now()}`), {
      version: '3.0.0-saas',
      name: 'Legacy ZACMA Multi-Tenant Tagging (zacma_default)',
      appliedAt: completedAt,
      appliedBy: actor.fullName,
      status: 'APPLIED',
      notes: `Stamped tenantId='zacma_default' onto ${totalUpdated} pre-existing ZACMA documents.`,
    });
    await setDoc(doc(db, 'audit_logs', makeId('aud_mig')), {
      tenantId: DEFAULT_ZACMA_TENANT_ID,
      actorId: actor.uid,
      actorName: actor.fullName.slice(0, 120),
      actorRole: actor.role,
      actorPlatformRole: actor.platformRole,
      action: 'LEGACY_TENANT_MIGRATION_COMPLETED',
      entityType: 'schema_migration',
      entityId: DEFAULT_ZACMA_TENANT_ID,
      summary: `Tagged ${totalUpdated} legacy ZACMA records with tenantId='zacma_default'. Zero records removed.`,
      result: 'SUCCESS',
      createdAt: completedAt,
    });
  } catch {
    // Non-fatal
  }

  return { totalUpdated, byCollection, completedAt };
}

/**
 * Generates and downloads a multi-sheet Platform Executive Analytics Workbook (.xlsx)
 * with strictly separated Platform Subscription Revenue vs Institute Tuition Overview.
 */
export function exportPlatformAnalyticsWorkbook(params: {
  tenants: TenantRecord[];
  subscriptions: PlatformSubscription[];
  invoices: PlatformInvoice[];
  platformPayments: PlatformPayment[];
  allStudents: Student[];
  allStaffRecords: StaffRecord[];
  auditLogs: AuditLog[];
}): void {
  const wb = XLSX.utils.book_new();

  const tenantRows = params.tenants.map((t) => {
    const stuCount = params.allStudents.filter(
      (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
    ).length;
    const stfCount = params.allStaffRecords.filter(
      (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
    ).length;
    return {
      'Tenant ID': t.tenantId,
      'Institute Name': t.name,
      Status: t.status,
      Plan: t.planName,
      'Billing Cycle': t.billingCycle,
      'Monthly Price (ETB)': t.monthlyPriceEtb,
      'Students Registered': stuCount,
      'Student Limit': t.studentLimit,
      'Staff Registered': stfCount,
      'Staff Limit': t.staffLimit,
      'Storage Used (MB)': t.storageUsedMb,
      'Storage Limit (MB)': t.storageLimitMb,
      'Enabled Modules': t.enabledModules.length,
      'Admin Email': t.primaryAdminEmail,
      City: t.city,
      Country: t.country,
      'Subscription Expires': t.subscriptionExpiresAt,
      'Created At': t.createdAt.slice(0, 10),
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tenantRows), 'Registered Institutes');

  const paymentRows = params.platformPayments.map((p) => ({
    'Payment Ref': p.paymentRef,
    'Invoice #': p.invoiceNumber || '—',
    Institute: p.tenantName,
    'Tenant ID': p.tenantId,
    Plan: p.planName,
    'Amount (ETB)': p.amountEtb,
    Currency: p.currency,
    Method: p.paymentMethod,
    'Payment Date': p.paymentDate,
    Status: p.status,
    'Recorded By': p.recordedByName,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(paymentRows.length ? paymentRows : [{ Info: 'No platform payments yet' }]),
    'Platform Revenue'
  );

  const invoiceRows = params.invoices.map((inv) => ({
    'Invoice #': inv.invoiceNumber,
    Institute: inv.tenantName,
    Plan: inv.planName,
    Cycle: inv.billingCycle,
    'Amount (ETB)': inv.amountEtb,
    'Due Date': inv.dueDate,
    Status: inv.status,
    'Paid At': inv.paidAt ? inv.paidAt.slice(0, 10) : '—',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(invoiceRows.length ? invoiceRows : [{ Info: 'No platform invoices yet' }]),
    'Platform Invoices'
  );

  const auditRows = params.auditLogs.slice(0, 500).map((a) => ({
    Timestamp: a.createdAt,
    Tenant: a.tenantId || DEFAULT_ZACMA_TENANT_ID,
    Actor: a.actorName,
    Role: a.actorPlatformRole || a.actorRole,
    Action: a.action,
    Entity: `${a.entityType}:${a.entityId}`,
    Summary: a.summary,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(auditRows.length ? auditRows : [{ Info: 'No audit logs' }]),
    'Platform Audit Trail'
  );

  XLSX.writeFile(wb, `ZACMA_SaaS_Platform_Analytics_${todayIsoDate()}.xlsx`);
}
