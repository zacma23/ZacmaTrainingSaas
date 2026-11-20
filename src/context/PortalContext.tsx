import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import {
  activeFirebaseProjectId,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { ensureSeededDatabase } from '../lib/seedData';
import { ActorContext, evaluatePaymentReminders, ReminderEvaluationResult } from '../lib/zacmaService';
import {
  DEFAULT_CHANNEL_RULES,
  DEFAULT_SMS_CONFIG,
  DEFAULT_SMS_TEMPLATES,
  ensureCommunicationDefaults,
  syncOwnDirectoryPresence,
} from '../lib/communicationService';
import {
  DEFAULT_SECURITY_CONFIG,
  recordLoginHistoryEvent,
} from '../lib/securityService';
import { ensureCanonicalZacmaCourses } from '../lib/registrationService';
import {
  DEFAULT_PLATFORM_SETTINGS,
  DEFAULT_ZACMA_TENANT_ID,
  endSupportAccessSession,
  ensurePlatformBootstrapped,
  migrateLegacyZacmaRecordsToTenant,
  startSupportAccessSession,
} from '../lib/saasService';
import {
  AiUsageLogRecord,
  AttendanceRecord,
  AuditLog,
  ChapaTransaction,
  CommunicationPolicy,
  Conversation,
  Course,
  DirectoryUser,
  Enrollment,
  Expense,
  ExpenseCategory,
  FinancialAdjustment,
  IdentityDocumentRecord,
  LoginHistoryRecord,
  NavSection,
  NotificationChannelRule,
  NotificationPreference,
  Payment,
  PaymentInstallment,
  PaymentPlan,
  PlatformGlobalSettings,
  PlatformInvoice,
  PlatformPayment,
  PlatformRole,
  PlatformSubscription,
  PortalNotification,
  Receipt,
  RoleCode,
  RoleRecord,
  SaasModuleCode,
  SchemaMigration,
  SecurityConfig,
  SmsLog,
  SmsSystemConfig,
  SmsTemplate,
  StaffCompensation,
  StaffProfile,
  StaffRecord,
  Student,
  SubscriptionPlan,
  SupportAccessSession,
  SupportTicket,
  TenantInvitation,
  TenantRecord,
  todayIsoDate,
  addDaysIso,
} from '../types/zacma';

const BOOTSTRAP_ADMIN_EMAIL = 'zekimuluken@gmail.com';

interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface PortalContextValue {
  user: User | null;
  profile: StaffProfile | null;
  actualRole: RoleCode | null;
  effectiveRole: RoleCode | null;
  previewRole: RoleCode | null;
  setPreviewRole: (role: RoleCode | null) => void;
  previewStudentId: string | null;
  setPreviewStudentId: (studentId: string | null) => void;
  authLoading: boolean;
  dataLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: (portalType?: 'STAFF' | 'STUDENT') => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (params: {
    fullName: string;
    email: string;
    password: string;
    portalType: 'STAFF' | 'STUDENT';
  }) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  signOutUser: (reason?: 'MANUAL' | 'INACTIVITY_TIMEOUT') => Promise<void>;

  // Multi-Tenant SaaS Platform & Super Admin State
  isPlatformUser: boolean;
  platformRole: PlatformRole | null;
  portalMode: 'SUPER_ADMIN' | 'INSTITUTE';
  setPortalMode: (mode: 'SUPER_ADMIN' | 'INSTITUTE') => void;
  activeTenantId: string;
  activeTenant: TenantRecord | null;
  tenants: TenantRecord[];
  subscriptionPlans: SubscriptionPlan[];
  platformSubscriptions: PlatformSubscription[];
  platformInvoices: PlatformInvoice[];
  platformPayments: PlatformPayment[];
  tenantInvitations: TenantInvitation[];
  supportSessions: SupportAccessSession[];
  activeSupportSession: SupportAccessSession | null;
  startSupportAccess: (tenant: TenantRecord, reason: string, durationMinutes?: number) => Promise<void>;
  endSupportAccess: () => Promise<void>;
  platformSettings: PlatformGlobalSettings;
  supportTickets: SupportTicket[];
  isModuleEnabled: (moduleCode: SaasModuleCode) => boolean;
  canWriteInTenant: boolean;
  actorContext: ActorContext | null;
  allPlatformStudents: Student[];
  allPlatformStaffRecords: StaffRecord[];
  allPlatformPayments: Payment[];
  allPlatformProfiles: StaffProfile[];
  allPlatformAuditLogs: AuditLog[];
  allPlatformCourses: Course[];
  allPlatformAiUsageLogs: AiUsageLogRecord[];
  aiUsageLogs: AiUsageLogRecord[];

  sessionWarningOpen: boolean;
  sessionSecondsRemaining: number;
  sessionExpiredNotice: string | null;
  clearSessionExpiredNotice: () => void;
  continueSession: () => Promise<void>;

  roles: RoleRecord[];
  staffProfiles: StaffProfile[];
  staffRecords: StaffRecord[];
  staffCompensations: StaffCompensation[];
  identityDocuments: IdentityDocumentRecord[];
  courses: Course[];
  paymentPlans: PaymentPlan[];
  students: Student[];
  enrollments: Enrollment[];
  installments: PaymentInstallment[];
  payments: Payment[];
  chapaTransactions: ChapaTransaction[];
  receipts: Receipt[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  financialAdjustments: FinancialAdjustment[];
  attendance: AttendanceRecord[];
  notifications: PortalNotification[];
  persistedNotifications: PortalNotification[];
  notificationPrefs: NotificationPreference | null;
  schemaMigrations: SchemaMigration[];
  auditLogs: AuditLog[];
  securityConfig: SecurityConfig;
  loginHistory: LoginHistoryRecord[];

  smsConfig: SmsSystemConfig;
  communicationPolicy: CommunicationPolicy;
  smsTemplates: SmsTemplate[];
  smsLogs: SmsLog[];
  channelRules: NotificationChannelRule[];
  directoryUsers: DirectoryUser[];
  conversations: Conversation[];
  unreadMessagesCount: number;

  lastReminderRun: ReminderEvaluationResult | null;
  runningReminders: boolean;
  runReminderEvaluationNow: (options?: { upcomingLeadDays?: number; overdueRepeatDays?: number }) => Promise<ReminderEvaluationResult | null>;

  toasts: ToastMessage[];
  pushToast: (tone: 'success' | 'error' | 'info', message: string) => void;
  dismissToast: (id: string) => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [previewRole, setPreviewRole] = useState<RoleCode | null>(null);
  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Multi-Tenant SaaS Platform state
  const [portalMode, setPortalMode] = useState<'SUPER_ADMIN' | 'INSTITUTE'>('INSTITUTE');
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [platformSubscriptions, setPlatformSubscriptions] = useState<PlatformSubscription[]>([]);
  const [platformInvoices, setPlatformInvoices] = useState<PlatformInvoice[]>([]);
  const [platformPayments, setPlatformPayments] = useState<PlatformPayment[]>([]);
  const [tenantInvitations, setTenantInvitations] = useState<TenantInvitation[]>([]);
  const [supportSessions, setSupportSessions] = useState<SupportAccessSession[]>([]);
  const [activeSupportSession, setActiveSupportSession] = useState<SupportAccessSession | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformGlobalSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const legacyMigrationCheckedRef = useRef(false);

  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [staffRecords, setStaffRecords] = useState<StaffRecord[]>([]);
  const [staffCompensations, setStaffCompensations] = useState<StaffCompensation[]>([]);
  const [identityDocuments, setIdentityDocuments] = useState<IdentityDocumentRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [chapaTransactions, setChapaTransactions] = useState<ChapaTransaction[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [financialAdjustments, setFinancialAdjustments] = useState<FinancialAdjustment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [persistedNotifications, setPersistedNotifications] = useState<PortalNotification[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference | null>(null);
  const [schemaMigrations, setSchemaMigrations] = useState<SchemaMigration[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aiUsageLogs, setAiUsageLogs] = useState<AiUsageLogRecord[]>([]);
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(DEFAULT_SECURITY_CONFIG);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryRecord[]>([]);

  const [sessionWarningOpen, setSessionWarningOpen] = useState(false);
  const [sessionSecondsRemaining, setSessionSecondsRemaining] = useState(60);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  const [smsConfig, setSmsConfig] = useState<SmsSystemConfig>(DEFAULT_SMS_CONFIG);
  const [communicationPolicy, setCommunicationPolicy] = useState<CommunicationPolicy>({
    id: 'default',
    portalNotificationsEnabled: DEFAULT_SMS_CONFIG.portalNotificationsEnabled,
    internalMessagingEnabled: DEFAULT_SMS_CONFIG.internalMessagingEnabled,
    allowStudentToInstructor: DEFAULT_SMS_CONFIG.allowStudentToInstructor,
    allowStudentToAdmin: DEFAULT_SMS_CONFIG.allowStudentToAdmin,
    allowStudentToStudent: DEFAULT_SMS_CONFIG.allowStudentToStudent,
    allowAttachments: DEFAULT_SMS_CONFIG.allowAttachments,
    updatedAt: DEFAULT_SMS_CONFIG.updatedAt,
  });
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>(
    DEFAULT_SMS_TEMPLATES.map((t) => ({ ...t, updatedAt: DEFAULT_SMS_CONFIG.updatedAt }))
  );
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [channelRules, setChannelRules] = useState<NotificationChannelRule[]>(
    DEFAULT_CHANNEL_RULES.map((r) => ({ ...r, updatedAt: DEFAULT_SMS_CONFIG.updatedAt }))
  );
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [lastReminderRun, setLastReminderRun] = useState<ReminderEvaluationResult | null>(null);
  const [runningReminders, setRunningReminders] = useState(false);
  const autoReminderRanRef = useRef(false);
  const commDefaultsEnsuredRef = useRef(false);
  const canonicalCoursesSyncedRef = useRef(false);
  const sessionEstablishedUidRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | undefined>(undefined);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionWarningOpenRef = useRef<boolean>(false);
  const signingOutRef = useRef<boolean>(false);

  const pushToast = (tone: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    // Capture any redirect sign-in errors (e.g., mobile popup fallback)
    getRedirectResult(auth).catch((err) => {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/unauthorized-domain') {
        const host = window.location.hostname;
        setAuthError(
          `UNAUTHORIZED_DOMAIN|${host}|${activeFirebaseProjectId}`
        );
      } else if (err instanceof Error && err.message) {
        setAuthError(err.message);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthError(null);
      if (!firebaseUser) {
        setProfile(null);
        setPreviewRole(null);
        setAuthLoading(false);
        setDataLoading(false);
        return;
      }

      setAuthLoading(true);
      try {
        const profileRef = doc(db, 'profiles', firebaseUser.uid);
        const snap = await getDoc(profileRef);
        const now = new Date().toISOString();
        const isBootstrap =
          firebaseUser.emailVerified &&
          (firebaseUser.email || '').toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

        // Read optional first-time sign-up intent (INSTRUCTOR or STUDENT only; enforced by Firestore rules)
        let pendingIntent: { fullName?: string; role?: 'INSTRUCTOR' | 'STUDENT' } | null = null;
        try {
          const rawIntent = window.sessionStorage.getItem('zacma_pending_auth_intent');
          if (rawIntent) {
            pendingIntent = JSON.parse(rawIntent);
            window.sessionStorage.removeItem('zacma_pending_auth_intent');
          }
        } catch {
          pendingIntent = null;
        }

        let resolved: StaffProfile;
        if (snap.exists()) {
          const d = snap.data();
          const resolvedPlatformRole: PlatformRole | undefined = isBootstrap
            ? 'SUPER_ADMIN'
            : (d.platformRole as PlatformRole | undefined) || undefined;
          const resolvedTenantId = (d.tenantId as string | undefined) || DEFAULT_ZACMA_TENANT_ID;

          // Ensure bootstrap super admin profile has platformRole & tenantId persisted
          if (isBootstrap && (d.platformRole !== 'SUPER_ADMIN' || !d.tenantId)) {
            await setDoc(
              profileRef,
              {
                platformRole: 'SUPER_ADMIN',
                tenantId: resolvedTenantId,
                role: 'ADMIN',
                updatedAt: now,
              },
              { merge: true }
            ).catch(() => undefined);
          }

          resolved = {
            id: snap.id,
            uid: d.uid || firebaseUser.uid,
            tenantId: resolvedTenantId,
            platformRole: resolvedPlatformRole,
            inviteId: d.inviteId,
            email: d.email || firebaseUser.email || '',
            fullName: d.fullName || firebaseUser.displayName || 'ZACMA User',
            phone: d.phone,
            role: isBootstrap ? 'ADMIN' : (d.role as RoleCode),
            linkedStudentId: d.linkedStudentId,
            allowedModules: Array.isArray(d.allowedModules)
              ? (d.allowedModules as NavSection[])
              : undefined,
            canExportReports: typeof d.canExportReports === 'boolean' ? d.canExportReports : undefined,
            lastLoginAt: d.lastLoginAt,
            isActive: d.isActive ?? true,
            createdAt: d.createdAt || now,
            updatedAt: d.updatedAt || now,
          };
        } else {
          // Check if this user has a pending Institute Admin / Staff invitation
          let claimedInvite: TenantInvitation | null = null;
          const userEmailLower = (firebaseUser.email || '').trim().toLowerCase();
          if (userEmailLower && !isBootstrap) {
            try {
              const invSnap = await getDocs(
                query(
                  collection(db, 'tenant_invitations'),
                  where('emailLower', '==', userEmailLower),
                  where('status', '==', 'PENDING')
                )
              );
              if (!invSnap.empty) {
                const firstDoc = invSnap.docs[0];
                claimedInvite = { id: firstDoc.id, ...firstDoc.data() } as TenantInvitation;
              }
            } catch {
              claimedInvite = null;
            }
          }

          if (claimedInvite) {
            const resolvedName = (
              pendingIntent?.fullName?.trim() ||
              claimedInvite.fullName ||
              firebaseUser.displayName ||
              userEmailLower.split('@')[0]
            ).slice(0, 120);

            const invitedProfile: Record<string, unknown> = {
              uid: firebaseUser.uid,
              tenantId: claimedInvite.tenantId,
              inviteId: claimedInvite.id,
              email: firebaseUser.email || claimedInvite.email,
              fullName: resolvedName,
              phone: claimedInvite.phone || undefined,
              role: claimedInvite.role,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            if (!invitedProfile.phone) delete invitedProfile.phone;

            await setDoc(profileRef, invitedProfile);
            await updateDoc(doc(db, 'tenant_invitations', claimedInvite.id), {
              status: 'CLAIMED',
              claimedByUid: firebaseUser.uid,
              claimedAt: now,
              updatedAt: now,
            }).catch(() => undefined);

            resolved = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              tenantId: claimedInvite.tenantId,
              inviteId: claimedInvite.id,
              email: firebaseUser.email || claimedInvite.email,
              fullName: resolvedName,
              phone: claimedInvite.phone,
              role: claimedInvite.role,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            pushToast('success', `Welcome to ${claimedInvite.tenantName}! Your ${claimedInvite.role} portal is ready.`);
          } else {
            const allowedSelfRoles: Array<'INSTRUCTOR' | 'STUDENT'> = [
              'INSTRUCTOR',
              'STUDENT',
            ];
            const requestedSelfRole =
              pendingIntent?.role && allowedSelfRoles.includes(pendingIntent.role)
                ? pendingIntent.role
                : 'INSTRUCTOR';
            const initialRole: RoleCode = isBootstrap ? 'ADMIN' : requestedSelfRole;
            const resolvedName = (
              pendingIntent?.fullName?.trim() ||
              firebaseUser.displayName ||
              firebaseUser.email?.split('@')[0] ||
              (initialRole === 'STUDENT' ? 'ZACMA Student' : 'ZACMA Staff')
            ).slice(0, 120);

            const newProfile: Record<string, unknown> = {
              uid: firebaseUser.uid,
              tenantId: DEFAULT_ZACMA_TENANT_ID,
              email: firebaseUser.email || '',
              fullName: resolvedName,
              role: initialRole,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
            if (isBootstrap) {
              newProfile.platformRole = 'SUPER_ADMIN';
            }
            await setDoc(profileRef, newProfile);
            resolved = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              tenantId: DEFAULT_ZACMA_TENANT_ID,
              platformRole: isBootstrap ? 'SUPER_ADMIN' : undefined,
              email: firebaseUser.email || '',
              fullName: resolvedName,
              role: initialRole,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            };
          }
        }

        setProfile(resolved);

        if (resolved.platformRole) {
          setPortalMode('SUPER_ADMIN');
          await ensurePlatformBootstrapped({
            uid: resolved.uid,
            fullName: resolved.fullName,
            role: resolved.role,
            platformRole: resolved.platformRole,
          });
        } else {
          setPortalMode('INSTITUTE');
        }

        if (resolved.role === 'ADMIN' && (resolved.tenantId || DEFAULT_ZACMA_TENANT_ID) === DEFAULT_ZACMA_TENANT_ID) {
          await ensureSeededDatabase(resolved.uid, resolved.fullName);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to load portal profile.';
        setAuthError(msg);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const platformRole: PlatformRole | null = profile?.platformRole ?? null;
  const isPlatformUser = Boolean(platformRole);
  const actualRole: RoleCode | null = profile?.role ?? null;
  const effectiveRole: RoleCode | null =
    actualRole === 'ADMIN' && previewRole ? previewRole : actualRole;

  const activeTenantId: string = useMemo(() => {
    if (activeSupportSession) return activeSupportSession.tenantId;
    return profile?.tenantId || DEFAULT_ZACMA_TENANT_ID;
  }, [activeSupportSession, profile?.tenantId]);

  const activeTenant: TenantRecord | null = useMemo(() => {
    const found = tenants.find((t) => t.tenantId === activeTenantId || t.id === activeTenantId);
    if (found) return found;
    return null;
  }, [tenants, activeTenantId]);

  const isModuleEnabled = useCallback(
    (moduleCode: SaasModuleCode): boolean => {
      if (!activeTenant) return true;
      if (!activeTenant.enabledModules || activeTenant.enabledModules.length === 0) return true;
      return activeTenant.enabledModules.includes(moduleCode);
    },
    [activeTenant]
  );

  const canWriteInTenant = useMemo(() => {
    if (!activeTenant) return true;
    return activeTenant.status !== 'SUSPENDED';
  }, [activeTenant]);

  const actorContext: ActorContext | null = useMemo(() => {
    if (!profile || !actualRole) return null;
    return {
      uid: profile.uid,
      fullName: profile.fullName,
      role: actualRole,
      tenantId: activeTenantId,
      studentIdPrefix: activeTenant?.studentIdPrefix,
      staffIdPrefix: activeTenant?.staffIdPrefix,
      receiptPrefix: activeTenant?.receiptPrefix,
      studentLimit: activeTenant?.studentLimit,
      staffLimit: activeTenant?.staffLimit,
      tenantStatus: activeTenant?.status,
    };
  }, [profile, actualRole, activeTenantId, activeTenant]);

  const startSupportAccess = useCallback(
    async (tenant: TenantRecord, reason: string, durationMinutes = 30) => {
      if (!profile || !platformRole) {
        throw new Error('Only authorized platform staff can open a support session.');
      }
      const session = await startSupportAccessSession(tenant, reason, durationMinutes, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      setActiveSupportSession(session);
      setPreviewRole(null);
      setPortalMode('INSTITUTE');
      pushToast('info', `Authorized Support Access opened for ${tenant.name} (${durationMinutes} min).`);
    },
    [profile, platformRole]
  );

  const endSupportAccess = useCallback(async () => {
    if (activeSupportSession && profile && platformRole) {
      await endSupportAccessSession(activeSupportSession, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      }).catch(() => undefined);
      pushToast('info', `Support session for ${activeSupportSession.tenantName} ended.`);
    }
    setActiveSupportSession(null);
    if (isPlatformUser) {
      setPortalMode('SUPER_ADMIN');
    }
  }, [activeSupportSession, profile, platformRole, isPlatformUser]);

  // Auto-end support access session when time limit expires
  useEffect(() => {
    if (!activeSupportSession) return;
    const msLeft = new Date(activeSupportSession.expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      void endSupportAccess();
      return;
    }
    const t = window.setTimeout(() => {
      pushToast('info', `Support access session for ${activeSupportSession.tenantName} expired automatically.`);
      void endSupportAccess();
    }, msLeft);
    return () => window.clearTimeout(t);
  }, [activeSupportSession, endSupportAccess]);

  useEffect(() => {
    if (!user || !profile || !actualRole) return;

    setDataLoading(true);
    const unsubs: Array<() => void> = [];
    const userTenantId = profile.tenantId || DEFAULT_ZACMA_TENANT_ID;

    // Platform users read across tenants (enforced by firestore.rules); institute users query strictly their tenantId
    const subscribe = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortFn?: (a: T, b: T) => number,
      forceUnscoped = false
    ) => {
      const refOrQuery =
        isPlatformUser || forceUnscoped
          ? collection(db, colName)
          : query(collection(db, colName), where('tenantId', '==', userTenantId));
      const unsub = onSnapshot(
        refOrQuery,
        (snapshot) => {
          const rows = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as T);
          if (sortFn) rows.sort(sortFn);
          setter(rows);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, colName);
        }
      );
      unsubs.push(unsub);
    };

    // Multi-Tenant SaaS Platform Subscriptions
    if (isPlatformUser) {
      subscribe<TenantRecord>('tenants', setTenants, (a, b) => b.createdAt.localeCompare(a.createdAt), true);
      subscribe<SubscriptionPlan>('subscription_plans', setSubscriptionPlans, (a, b) => a.monthlyPriceEtb - b.monthlyPriceEtb, true);
      subscribe<PlatformSubscription>('platform_subscriptions', setPlatformSubscriptions, (a, b) => b.updatedAt.localeCompare(a.updatedAt), true);
      subscribe<PlatformInvoice>('platform_invoices', setPlatformInvoices, (a, b) => b.createdAt.localeCompare(a.createdAt), true);
      subscribe<PlatformPayment>('platform_payments', setPlatformPayments, (a, b) => b.createdAt.localeCompare(a.createdAt), true);
      subscribe<TenantInvitation>('tenant_invitations', setTenantInvitations, (a, b) => b.createdAt.localeCompare(a.createdAt), true);
      subscribe<SupportAccessSession>('support_access_sessions', setSupportSessions, (a, b) => b.startedAt.localeCompare(a.startedAt), true);
      subscribe<SupportTicket>('support_tickets', setSupportTickets, (a, b) => b.createdAt.localeCompare(a.createdAt), true);

      const platSetUnsub = onSnapshot(
        doc(db, 'platform_settings', 'default'),
        (snap) => {
          if (snap.exists()) {
            setPlatformSettings({ id: snap.id, ...snap.data() } as PlatformGlobalSettings);
          } else {
            setPlatformSettings(DEFAULT_PLATFORM_SETTINGS);
          }
        },
        () => setPlatformSettings(DEFAULT_PLATFORM_SETTINGS)
      );
      unsubs.push(platSetUnsub);
    } else {
      // Institute user: subscribe strictly to their own tenant doc, plans catalog, and tenant-scoped subscription/invoices/tickets
      const myTenantUnsub = onSnapshot(
        doc(db, 'tenants', userTenantId),
        (snap) => {
          if (snap.exists()) {
            setTenants([{ id: snap.id, ...snap.data() } as TenantRecord]);
          } else {
            setTenants([]);
          }
        },
        () => setTenants([])
      );
      unsubs.push(myTenantUnsub);

      subscribe<SubscriptionPlan>('subscription_plans', setSubscriptionPlans, (a, b) => a.monthlyPriceEtb - b.monthlyPriceEtb, true);

      if (actualRole === 'ADMIN' || actualRole === 'MANAGER' || actualRole === 'ACCOUNTANT') {
        subscribe<PlatformSubscription>('platform_subscriptions', setPlatformSubscriptions, (a, b) => b.updatedAt.localeCompare(a.updatedAt));
        subscribe<PlatformInvoice>('platform_invoices', setPlatformInvoices, (a, b) => b.createdAt.localeCompare(a.createdAt));
        subscribe<SupportTicket>('support_tickets', setSupportTickets, (a, b) => b.createdAt.localeCompare(a.createdAt));
      } else {
        setPlatformSubscriptions([]);
        setPlatformInvoices([]);
        setSupportTickets([]);
      }
      setPlatformPayments([]);
      setTenantInvitations([]);
      setSupportSessions([]);
    }

    // Always subscribe to own notification preferences
    const prefUnsub = onSnapshot(
      doc(db, 'notification_preferences', user.uid),
      (snap) => {
        if (snap.exists()) {
          setNotificationPrefs({ id: snap.id, ...snap.data() } as NotificationPreference);
        } else {
          setNotificationPrefs({
            id: user.uid,
            userId: user.uid,
            inAppEnabled: true,
            emailEnabled: false,
            smsEnabled: false,
            whatsappEnabled: false,
            upcomingLeadDays: 7,
            overdueRepeatDays: 3,
            updatedAt: new Date().toISOString(),
          });
        }
      },
      () => {
        // Non-fatal fallback
      }
    );
    unsubs.push(prefUnsub);

    // Communication policy (PII-free flags readable by all signed-in users)
    const policyUnsub = onSnapshot(
      doc(db, 'communication_policy', 'default'),
      (snap) => {
        if (snap.exists()) {
          setCommunicationPolicy({ id: snap.id, ...snap.data() } as CommunicationPolicy);
        }
      },
      () => {
        // Non-fatal fallback to defaults
      }
    );
    unsubs.push(policyUnsub);

    // Security & session timeout configuration (readable by all signed-in users)
    const secCfgUnsub = onSnapshot(
      doc(db, 'security_config', 'default'),
      (snap) => {
        if (snap.exists()) {
          setSecurityConfig({ id: snap.id, ...snap.data() } as SecurityConfig);
        } else {
          setSecurityConfig(DEFAULT_SECURITY_CONFIG);
        }
      },
      () => {
        setSecurityConfig(DEFAULT_SECURITY_CONFIG);
      }
    );
    unsubs.push(secCfgUnsub);

    // Login history (Admin reads all; non-admin reads strictly own)
    const loginHistQuery =
      actualRole === 'ADMIN'
        ? collection(db, 'login_history')
        : query(collection(db, 'login_history'), where('userId', '==', user.uid));
    const loginHistUnsub = onSnapshot(
      loginHistQuery,
      (snapshot) => {
        const rows = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as LoginHistoryRecord
        );
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setLoginHistory(rows);
      },
      () => {
        // Non-fatal
      }
    );
    unsubs.push(loginHistUnsub);

    // AI Usage & Cost Logs (Platform staff reads all; Institute Admin reads own tenant; other users read strictly own)
    const aiUsageQuery = isPlatformUser
      ? collection(db, 'ai_usage_logs')
      : actualRole === 'ADMIN'
      ? query(collection(db, 'ai_usage_logs'), where('tenantId', '==', userTenantId))
      : query(
          collection(db, 'ai_usage_logs'),
          where('userId', '==', user.uid),
          where('tenantId', '==', userTenantId)
        );
    const aiUsageUnsub = onSnapshot(
      aiUsageQuery,
      (snapshot) => {
        const rows = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as AiUsageLogRecord
        );
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setAiUsageLogs(rows);
      },
      () => {
        setAiUsageLogs([]);
      }
    );
    unsubs.push(aiUsageUnsub);

    // PII-free Messaging Directory (Platform reads all; Institute reads scoped by tenantId)
    const dirQuery = isPlatformUser
      ? collection(db, 'directory_users')
      : actualRole === 'ADMIN'
      ? query(collection(db, 'directory_users'), where('tenantId', '==', userTenantId))
      : query(
          collection(db, 'directory_users'),
          where('tenantId', '==', userTenantId),
          where('isActive', '==', true)
        );
    const dirUnsub = onSnapshot(
      dirQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as DirectoryUser);
        rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setDirectoryUsers(rows);
      },
      () => {
        // Non-fatal if collection not yet seeded
      }
    );
    unsubs.push(dirUnsub);

    // Real-time Internal Conversations (Strictly matching Firestore security rules)
    if (actualRole === 'ADMIN') {
      subscribe<Conversation>('conversations', setConversations, (a, b) =>
        (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)
      );
    } else {
      const convBuckets = new Map<string, Map<string, Conversation>>();
      const emitMergedConversations = () => {
        const merged = new Map<string, Conversation>();
        convBuckets.forEach((bucket) => {
          bucket.forEach((conv, id) => merged.set(id, conv));
        });
        const list = Array.from(merged.values());
        list.sort((a, b) =>
          (b.lastMessageAt || b.updatedAt).localeCompare(a.lastMessageAt || a.updatedAt)
        );
        setConversations(list);
      };

      const addConvQuery = (key: string, q: ReturnType<typeof query>) => {
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const bucket = new Map<string, Conversation>();
            snapshot.docs.forEach((d) => {
              bucket.set(d.id, { id: d.id, ...(d.data() as Record<string, unknown>) } as Conversation);
            });
            convBuckets.set(key, bucket);
            emitMergedConversations();
          },
          () => {
            // Non-fatal fallback
          }
        );
        unsubs.push(unsub);
      };

      addConvQuery(
        'direct_and_group',
        query(collection(db, 'conversations'), where('participantIds', 'array-contains', user.uid))
      );
      addConvQuery(
        'bcast_all',
        query(
          collection(db, 'conversations'),
          where('type', '==', 'BROADCAST'),
          where('broadcastAudience', '==', 'ALL_USERS')
        )
      );
      if (actualRole === 'STUDENT') {
        addConvQuery(
          'bcast_students',
          query(
            collection(db, 'conversations'),
            where('type', '==', 'BROADCAST'),
            where('broadcastAudience', '==', 'ALL_STUDENTS')
          )
        );
      } else {
        addConvQuery(
          'bcast_staff',
          query(
            collection(db, 'conversations'),
            where('type', '==', 'BROADCAST'),
            where('broadcastAudience', '==', 'ALL_STAFF')
          )
        );
        if (actualRole === 'INSTRUCTOR') {
          addConvQuery(
            'bcast_instructors',
            query(
              collection(db, 'conversations'),
              where('type', '==', 'BROADCAST'),
              where('broadcastAudience', '==', 'ALL_INSTRUCTORS')
            )
          );
        }
        if (actualRole === 'ACCOUNTANT') {
          addConvQuery(
            'bcast_accountants',
            query(
              collection(db, 'conversations'),
              where('type', '==', 'BROADCAST'),
              where('broadcastAudience', '==', 'ALL_ACCOUNTANTS')
            )
          );
        }
      }
    }

    // STRICT ISOLATED STUDENT ROLE SUBSCRIPTIONS (Only their own studentId records)
    if (actualRole === 'STUDENT') {
      const linkedId = profile.linkedStudentId;
      subscribe<Course>('courses', setCourses, (a, b) => a.name.localeCompare(b.name));
      setRoles([]);
      setPaymentPlans([]);
      setExpenseCategories([]);
      setExpenses([]);
      setAttendance([]);
      setStaffProfiles([profile]);
      setStaffRecords([]);
      setStaffCompensations([]);
      setIdentityDocuments([]);
      setAuditLogs([]);
      setSchemaMigrations([]);
      setSmsLogs([]);

      // Merge student's notifications across studentId, recipientUid, and targetRole == 'ALL'
      const stuNotifBuckets = new Map<string, Map<string, PortalNotification>>();
      const emitStudentNotifications = () => {
        const merged = new Map<string, PortalNotification>();
        stuNotifBuckets.forEach((b) => {
          b.forEach((n, id) => merged.set(id, n));
        });
        const list = Array.from(merged.values());
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setPersistedNotifications(list);
      };
      const addStudentNotifQuery = (key: string, q: ReturnType<typeof query>) => {
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const b = new Map<string, PortalNotification>();
            snapshot.docs.forEach((d) => {
              b.set(d.id, { id: d.id, ...(d.data() as Record<string, unknown>) } as PortalNotification);
            });
            stuNotifBuckets.set(key, b);
            emitStudentNotifications();
          },
          () => {
            // Non-fatal fallback
          }
        );
        unsubs.push(unsub);
      };

      addStudentNotifQuery(
        'by_uid',
        query(collection(db, 'notifications'), where('recipientUid', '==', user.uid))
      );
      addStudentNotifQuery(
        'by_all',
        query(collection(db, 'notifications'), where('targetRole', '==', 'ALL'))
      );

      if (linkedId) {
        const stuUnsub = onSnapshot(
          doc(db, 'students', linkedId),
          (snap) => {
            setStudents(snap.exists() ? [{ id: snap.id, ...snap.data() } as Student] : []);
          },
          (error) => handleFirestoreError(error, OperationType.GET, `students/${linkedId}`)
        );
        unsubs.push(stuUnsub);

        const subscribeOwn = <T extends { id: string }>(
          colName: string,
          setter: React.Dispatch<React.SetStateAction<T[]>>,
          sortFn?: (a: T, b: T) => number
        ) => {
          const q = query(collection(db, colName), where('studentId', '==', linkedId));
          const unsub = onSnapshot(
            q,
            (snapshot) => {
              const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
              if (sortFn) rows.sort(sortFn);
              setter(rows);
            },
            (error) => handleFirestoreError(error, OperationType.LIST, colName)
          );
          unsubs.push(unsub);
        };

        subscribeOwn<Enrollment>('enrollments', setEnrollments, (a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        subscribeOwn<PaymentInstallment>('payment_installments', setInstallments, (a, b) =>
          a.dueDate.localeCompare(b.dueDate)
        );
        subscribeOwn<Payment>('payments', setPayments, (a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        subscribeOwn<ChapaTransaction>('chapa_transactions', setChapaTransactions, (a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        subscribeOwn<Receipt>('receipts', setReceipts, (a, b) =>
          b.issuedAt.localeCompare(a.issuedAt)
        );
        subscribeOwn<AttendanceRecord>('attendance', setAttendance, (a, b) =>
          b.attendanceDate.localeCompare(a.attendanceDate)
        );
        subscribeOwn<FinancialAdjustment>('financial_adjustments', setFinancialAdjustments, (a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
        addStudentNotifQuery(
          'by_student',
          query(collection(db, 'notifications'), where('studentId', '==', linkedId))
        );
      } else {
        setStudents([]);
        setEnrollments([]);
        setInstallments([]);
        setPayments([]);
        setChapaTransactions([]);
        setReceipts([]);
        setAttendance([]);
        setFinancialAdjustments([]);
      }

      const timer = window.setTimeout(() => setDataLoading(false), 350);
      return () => {
        window.clearTimeout(timer);
        unsubs.forEach((u) => u());
      };
    }

    // Core staff collections (readable by Admin, Manager, Accountant, Instructor, Receptionist, HR Officer, General Staff)
    subscribe<RoleRecord>('roles', setRoles, undefined, true);
    subscribe<Course>('courses', setCourses, (a, b) => a.name.localeCompare(b.name));
    subscribe<Student>('students', setStudents, (a, b) =>
      b.studentCode.localeCompare(a.studentCode)
    );
    subscribe<Enrollment>('enrollments', setEnrollments, (a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    subscribe<AttendanceRecord>('attendance', setAttendance, (a, b) =>
      b.attendanceDate.localeCompare(a.attendanceDate)
    );
    subscribe<PortalNotification>('notifications', setPersistedNotifications, (a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const rulesUnsub = onSnapshot(
      collection(db, 'notification_channel_rules'),
      (snapshot) => {
        if (!snapshot.empty) {
          const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificationChannelRule);
          rows.sort((a, b) => a.label.localeCompare(b.label));
          setChannelRules(rows);
        }
      },
      () => {
        // Keep defaults
      }
    );
    unsubs.push(rulesUnsub);

    // Finance-restricted collections (Strictly excluded for Instructors, HR, Receptionist, General Staff)
    if (actualRole === 'ADMIN' || actualRole === 'MANAGER' || actualRole === 'ACCOUNTANT' || isPlatformUser) {
      subscribe<PaymentPlan>('payment_plans', setPaymentPlans, (a, b) =>
        a.installmentCount - b.installmentCount
      );
      subscribe<PaymentInstallment>('payment_installments', setInstallments, (a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      );
      subscribe<Payment>('payments', setPayments, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      subscribe<ChapaTransaction>('chapa_transactions', setChapaTransactions, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      subscribe<Receipt>('receipts', setReceipts, (a, b) =>
        b.issuedAt.localeCompare(a.issuedAt)
      );
      subscribe<ExpenseCategory>('expense_categories', setExpenseCategories, (a, b) =>
        a.name.localeCompare(b.name)
      );
      subscribe<Expense>('expenses', setExpenses, (a, b) =>
        b.expenseDate.localeCompare(a.expenseDate)
      );
      subscribe<FinancialAdjustment>('financial_adjustments', setFinancialAdjustments, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      // SMS configuration, templates, and logs (Finance staff read; Admin manages)
      const smsCfgUnsub = onSnapshot(
        doc(db, 'sms_config', 'default'),
        (snap) => {
          if (snap.exists()) {
            setSmsConfig({ id: snap.id, ...snap.data() } as SmsSystemConfig);
          }
        },
        () => {
          // Keep defaults
        }
      );
      unsubs.push(smsCfgUnsub);

      const smsTplUnsub = onSnapshot(
        collection(db, 'sms_templates'),
        (snapshot) => {
          if (!snapshot.empty) {
            const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SmsTemplate);
            rows.sort((a, b) => a.name.localeCompare(b.name));
            setSmsTemplates(rows);
          }
        },
        () => {
          // Keep defaults
        }
      );
      unsubs.push(smsTplUnsub);

      subscribe<SmsLog>('sms_logs', setSmsLogs, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    } else {
      setPaymentPlans([]);
      setInstallments([]);
      setPayments([]);
      setChapaTransactions([]);
      setReceipts([]);
      setExpenseCategories([]);
      setExpenses([]);
      setFinancialAdjustments([]);
      setSmsLogs([]);
    }

    // Admin-only collections (Staff directory PII, Encrypted ID Vault, Salary Isolation, Audit Trail)
    if (actualRole === 'ADMIN' || isPlatformUser) {
      subscribe<StaffProfile>('profiles', setStaffProfiles, (a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
      subscribe<StaffRecord>('staff_records', setStaffRecords, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      subscribe<StaffCompensation>('staff_compensation', setStaffCompensations, (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
      );
      subscribe<IdentityDocumentRecord>('identity_documents', setIdentityDocuments, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      subscribe<AuditLog>('audit_logs', setAuditLogs, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      subscribe<SchemaMigration>('schema_migrations', setSchemaMigrations, (a, b) =>
        a.version.localeCompare(b.version),
        true
      );
    } else if (actualRole === 'MANAGER' || actualRole === 'HR_OFFICER') {
      subscribe<StaffProfile>('profiles', setStaffProfiles, (a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
      subscribe<StaffRecord>('staff_records', setStaffRecords, (a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      setStaffCompensations([]);
      setIdentityDocuments([]);
      setAuditLogs([]);
      setSchemaMigrations([]);
    } else if (actualRole === 'ACCOUNTANT') {
      setStaffProfiles([profile]);
      setStaffCompensations([]);
      setIdentityDocuments([]);
      setAuditLogs([]);
      setSchemaMigrations([]);
      const ownStaffQuery = query(
        collection(db, 'staff_records'),
        where('registeredBy', '==', user.uid)
      );
      const ownStaffUnsub = onSnapshot(
        ownStaffQuery,
        (snapshot) => {
          const rows = snapshot.docs.map(
            (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as StaffRecord
          );
          rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setStaffRecords(rows);
        },
        () => {
          // Non-fatal fallback
        }
      );
      unsubs.push(ownStaffUnsub);
    } else {
      setStaffProfiles([profile]);
      setStaffRecords([]);
      setStaffCompensations([]);
      setIdentityDocuments([]);
      setAuditLogs([]);
      setSchemaMigrations([]);
    }

    const timer = window.setTimeout(() => setDataLoading(false), 350);

    return () => {
      window.clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [user, profile, actualRole, isPlatformUser]);

  // Idempotent background legacy ZACMA tagging when Super Admin signs in so all pre-existing docs carry tenantId='zacma_default'
  useEffect(() => {
    if (
      !dataLoading &&
      isPlatformUser &&
      profile &&
      !legacyMigrationCheckedRef.current &&
      (students.some((s) => !s.tenantId) || courses.some((c) => !c.tenantId))
    ) {
      legacyMigrationCheckedRef.current = true;
      void migrateLegacyZacmaRecordsToTenant({
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole: profile.platformRole,
      }).catch(() => undefined);
    }
  }, [dataLoading, isPlatformUser, profile, students, courses]);

  // Tenant-scoped projections: Institute modules always read strictly activeTenantId records,
  // while Super Admin Control Center reads allPlatform* aggregates.
  const belongsToActiveTenant = useCallback(
    (row: { tenantId?: string }) => (row.tenantId || DEFAULT_ZACMA_TENANT_ID) === activeTenantId,
    [activeTenantId]
  );

  const scopedStaffProfiles = useMemo(() => staffProfiles.filter(belongsToActiveTenant), [staffProfiles, belongsToActiveTenant]);
  const scopedStaffRecords = useMemo(() => staffRecords.filter(belongsToActiveTenant), [staffRecords, belongsToActiveTenant]);
  const scopedStaffCompensations = useMemo(() => staffCompensations.filter(belongsToActiveTenant), [staffCompensations, belongsToActiveTenant]);
  const scopedIdentityDocuments = useMemo(() => identityDocuments.filter(belongsToActiveTenant), [identityDocuments, belongsToActiveTenant]);
  const scopedCourses = useMemo(() => courses.filter(belongsToActiveTenant), [courses, belongsToActiveTenant]);
  const scopedPaymentPlans = useMemo(() => paymentPlans.filter(belongsToActiveTenant), [paymentPlans, belongsToActiveTenant]);
  const scopedStudents = useMemo(() => students.filter(belongsToActiveTenant), [students, belongsToActiveTenant]);
  const scopedEnrollments = useMemo(() => enrollments.filter(belongsToActiveTenant), [enrollments, belongsToActiveTenant]);
  const scopedInstallments = useMemo(() => installments.filter(belongsToActiveTenant), [installments, belongsToActiveTenant]);
  const scopedPayments = useMemo(() => payments.filter(belongsToActiveTenant), [payments, belongsToActiveTenant]);
  const scopedChapaTransactions = useMemo(() => chapaTransactions.filter(belongsToActiveTenant), [chapaTransactions, belongsToActiveTenant]);
  const scopedReceipts = useMemo(() => receipts.filter(belongsToActiveTenant), [receipts, belongsToActiveTenant]);
  const scopedExpenseCategories = useMemo(() => expenseCategories.filter(belongsToActiveTenant), [expenseCategories, belongsToActiveTenant]);
  const scopedExpenses = useMemo(() => expenses.filter(belongsToActiveTenant), [expenses, belongsToActiveTenant]);
  const scopedFinancialAdjustments = useMemo(() => financialAdjustments.filter(belongsToActiveTenant), [financialAdjustments, belongsToActiveTenant]);
  const scopedAttendance = useMemo(() => attendance.filter(belongsToActiveTenant), [attendance, belongsToActiveTenant]);
  const scopedPersistedNotifications = useMemo(() => persistedNotifications.filter(belongsToActiveTenant), [persistedNotifications, belongsToActiveTenant]);
  const scopedAuditLogs = useMemo(() => auditLogs.filter(belongsToActiveTenant), [auditLogs, belongsToActiveTenant]);
  const scopedSmsLogs = useMemo(() => smsLogs.filter(belongsToActiveTenant), [smsLogs, belongsToActiveTenant]);
  const scopedDirectoryUsers = useMemo(() => directoryUsers.filter(belongsToActiveTenant), [directoryUsers, belongsToActiveTenant]);
  const scopedConversations = useMemo(() => conversations.filter(belongsToActiveTenant), [conversations, belongsToActiveTenant]);

  // Sync own PII-free presence into directory_users on login and every 3 minutes
  useEffect(() => {
    if (!user || !profile) return;
    const linkedStudent = profile.linkedStudentId
      ? scopedStudents.find((s) => s.id === profile.linkedStudentId)
      : undefined;
    void syncOwnDirectoryPresence(profile, linkedStudent);
    const interval = window.setInterval(() => {
      void syncOwnDirectoryPresence(profile, linkedStudent);
    }, 180_000);
    return () => window.clearInterval(interval);
  }, [user, profile, scopedStudents]);

  // Idempotently initialize SMS defaults, templates, channel rules & staff directory once per Admin session
  useEffect(() => {
    if (
      !dataLoading &&
      !commDefaultsEnsuredRef.current &&
      profile &&
      actualRole === 'ADMIN' &&
      activeTenantId === DEFAULT_ZACMA_TENANT_ID &&
      scopedStaffProfiles.length > 0
    ) {
      commDefaultsEnsuredRef.current = true;
      void ensureCommunicationDefaults(
        { uid: profile.uid, fullName: profile.fullName, role: actualRole },
        scopedStaffProfiles,
        scopedStudents
      );
    }
  }, [dataLoading, profile, actualRole, activeTenantId, scopedStaffProfiles, scopedStudents]);

  // Idempotently ensure all 18 canonical ZACMA Technology courses exist for the flagship ZACMA tenant only
  useEffect(() => {
    if (
      !dataLoading &&
      !canonicalCoursesSyncedRef.current &&
      profile &&
      actualRole === 'ADMIN' &&
      activeTenantId === DEFAULT_ZACMA_TENANT_ID
    ) {
      canonicalCoursesSyncedRef.current = true;
      void ensureCanonicalZacmaCourses(scopedCourses, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: actualRole,
        tenantId: DEFAULT_ZACMA_TENANT_ID,
      });
    }
  }, [dataLoading, profile, actualRole, activeTenantId, scopedCourses]);

  const unreadMessagesCount = useMemo(() => {
    if (!user) return 0;
    return scopedConversations.filter(
      (c) => Boolean(c.lastMessageAt) && !c.readByUids.includes(user.uid)
    ).length;
  }, [scopedConversations, user]);

  // Default preview student when Admin switches to STUDENT preview
  useEffect(() => {
    if (actualRole === 'ADMIN' && previewRole === 'STUDENT' && !previewStudentId && students.length > 0) {
      const preferred =
        students.find((s) => s.studentCode === 'ZAC-2026-0002') ||
        students.find((s) => s.registrationStatus === 'APPROVED') ||
        students[0];
      if (preferred) setPreviewStudentId(preferred.id);
    }
  }, [actualRole, previewRole, previewStudentId, students]);

  const runReminderEvaluationNow = useCallback(
    async (options?: { upcomingLeadDays?: number; overdueRepeatDays?: number }) => {
      if (!profile || (actualRole !== 'ADMIN' && actualRole !== 'ACCOUNTANT')) {
        return null;
      }
      setRunningReminders(true);
      try {
        const result = await evaluatePaymentReminders(
          {
            enrollments,
            installments,
            existingNotifications: persistedNotifications,
            upcomingLeadDays: options?.upcomingLeadDays ?? notificationPrefs?.upcomingLeadDays ?? 7,
            overdueRepeatDays: options?.overdueRepeatDays ?? notificationPrefs?.overdueRepeatDays ?? 3,
          },
          {
            uid: profile.uid,
            fullName: profile.fullName,
            role: actualRole,
          }
        );
        setLastReminderRun(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to evaluate payment reminders.';
        pushToast('error', msg);
        return null;
      } finally {
        setRunningReminders(false);
      }
    },
    [profile, actualRole, enrollments, installments, persistedNotifications, notificationPrefs]
  );

  // Automatic deduplicated background reminder evaluation once per Admin/Accountant session
  useEffect(() => {
    if (
      !dataLoading &&
      !autoReminderRanRef.current &&
      profile &&
      (actualRole === 'ADMIN' || actualRole === 'ACCOUNTANT') &&
      installments.length > 0 &&
      enrollments.length > 0
    ) {
      autoReminderRanRef.current = true;
      void runReminderEvaluationNow();
    }
  }, [dataLoading, profile, actualRole, installments.length, enrollments.length, runReminderEvaluationNow]);

  // Merge live dynamic financial/approval alerts with persisted notifications scoped to effectiveRole
  const notifications = useMemo(() => {
    if (!effectiveRole) return [];
    const today = todayIsoDate();
    const soon = addDaysIso(today, 7);
    const liveAlerts: PortalNotification[] = [];

    if (effectiveRole === 'ADMIN') {
      const pendingStu = students.filter((s) => s.registrationStatus === 'PENDING');
      if (pendingStu.length > 0) {
        liveAlerts.push({
          id: 'live_pending_reg',
          type: 'PENDING_REGISTRATION',
          title: `${pendingStu.length} Pending Registration Approval${pendingStu.length > 1 ? 's' : ''}`,
          message: pendingStu
            .slice(0, 3)
            .map((s) => `${s.fullName} (${s.studentCode})`)
            .join(', '),
          targetRole: 'ADMIN',
          actionSection: 'registrations',
          entityType: 'student',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      const pendingStaff = staffRecords.filter((s) => s.registrationStatus === 'PENDING');
      if (pendingStaff.length > 0) {
        liveAlerts.push({
          id: 'live_pending_staff_reg',
          type: 'PENDING_STAFF_REGISTRATION',
          title: `${pendingStaff.length} Pending Staff Registration${pendingStaff.length > 1 ? 's' : ''}`,
          message: pendingStaff
            .slice(0, 3)
            .map((s) => `${s.fullName} (${s.staffCode} · ${s.jobPosition})`)
            .join(', '),
          targetRole: 'ADMIN',
          actionSection: 'registrations',
          entityType: 'staff',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      const pendingPay = payments.filter((p) => p.status === 'PENDING');
      if (pendingPay.length > 0) {
        const sum = pendingPay.reduce((acc, p) => acc + p.amountEtb, 0);
        liveAlerts.push({
          id: 'live_pending_pay',
          type: 'PENDING_PAYMENT',
          title: `${pendingPay.length} Pending Payment Approval${pendingPay.length > 1 ? 's' : ''}`,
          message: `ETB ${sum.toLocaleString()} awaiting verification before official ledger posting.`,
          targetRole: 'ADMIN',
          entityType: 'payment',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      const verifiedChapaPending = chapaTransactions.filter(
        (t) => t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL'
      );
      if (verifiedChapaPending.length > 0) {
        const sum = verifiedChapaPending.reduce((acc, t) => acc + t.amountEtb, 0);
        liveAlerts.push({
          id: 'live_pending_chapa',
          type: 'CHAPA_PAYMENT_VERIFIED',
          title: `${verifiedChapaPending.length} Verified Chapa Payment${verifiedChapaPending.length > 1 ? 's' : ''} Awaiting Approval`,
          message: `ETB ${sum.toLocaleString()} verified via Chapa API — review and approve in Chapa Online Payments.`,
          targetRole: 'ADMIN',
          actionSection: 'chapa',
          entityType: 'chapa_transaction',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (effectiveRole === 'ADMIN' || effectiveRole === 'ACCOUNTANT') {
      const overdue = installments.filter(
        (i) => i.status !== 'PAID' && i.dueDate < today && i.amountDueEtb > i.amountPaidEtb
      );
      if (overdue.length > 0) {
        liveAlerts.push({
          id: 'live_overdue',
          type: 'OVERDUE_BALANCE',
          title: `${overdue.length} Overdue Installment${overdue.length > 1 ? 's' : ''}`,
          message: overdue
            .slice(0, 3)
            .map((i) => `${i.studentName} (ETB ${(i.amountDueEtb - i.amountPaidEtb).toLocaleString()})`)
            .join(', '),
          targetRole: effectiveRole,
          entityType: 'installment',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      const upcoming = installments.filter(
        (i) =>
          i.status !== 'PAID' &&
          i.dueDate >= today &&
          i.dueDate <= soon &&
          i.amountDueEtb > i.amountPaidEtb
      );
      if (upcoming.length > 0) {
        liveAlerts.push({
          id: 'live_upcoming',
          type: 'DEADLINE_APPROACHING',
          title: `${upcoming.length} Payment Deadline${upcoming.length > 1 ? 's' : ''} Within 7 Days`,
          message: upcoming
            .slice(0, 3)
            .map((i) => `${i.studentName} due ${i.dueDate}`)
            .join(', '),
          targetRole: effectiveRole,
          entityType: 'installment',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const filteredPersisted = persistedNotifications.filter((n) => {
      if (n.recipientUid) {
        return user ? n.recipientUid === user.uid : false;
      }
      if (effectiveRole === 'INSTRUCTOR' || effectiveRole === 'GENERAL_STAFF') {
        return n.targetRole === effectiveRole || n.targetRole === 'ALL';
      }
      if (effectiveRole === 'STUDENT') {
        const activeStuId =
          actualRole === 'ADMIN' && previewRole === 'STUDENT'
            ? previewStudentId
            : profile?.linkedStudentId;
        if (n.targetRole === 'ALL') return true;
        return n.targetRole === 'STUDENT' && (!activeStuId || !n.studentId || n.studentId === activeStuId);
      }
      return n.targetRole === 'ALL' || n.targetRole === effectiveRole;
    });

    return [...liveAlerts, ...filteredPersisted];
  }, [
    effectiveRole,
    actualRole,
    previewRole,
    previewStudentId,
    profile?.linkedStudentId,
    user,
    students,
    staffRecords,
    payments,
    chapaTransactions,
    installments,
    persistedNotifications,
  ]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const formatEmailAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (code === 'auth/operation-not-allowed') {
      return `EMAIL_PASSWORD_DISABLED|${activeFirebaseProjectId}`;
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      return 'Invalid email address or password. Please verify your credentials or click "Forgot password?".';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email address already exists. Switch to "Sign In" or use Google Sign-In.';
    }
    if (code === 'auth/weak-password') {
      return 'Password is too weak. Please choose at least 6 characters.';
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many failed sign-in attempts. Please wait a few minutes or reset your password.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network error while reaching Firebase Authentication. Please check your connection and retry.';
    }
    return rawMsg || 'Authentication failed. Please try again.';
  };

  const signInWithGoogle = async (portalType: 'STAFF' | 'STUDENT' = 'STAFF') => {
    setAuthError(null);
    try {
      window.sessionStorage.setItem(
        'zacma_pending_auth_intent',
        JSON.stringify({ role: portalType === 'STUDENT' ? 'STUDENT' : 'INSTRUCTOR' })
      );
    } catch {
      // Ignore storage error
    }
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const rawMsg = err instanceof Error ? err.message : String(err);

      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleAuthProvider);
          return;
        } catch (redirectErr) {
          const rCode = (redirectErr as { code?: string })?.code || '';
          if (rCode === 'auth/unauthorized-domain') {
            setAuthError(`UNAUTHORIZED_DOMAIN|${window.location.hostname}|${activeFirebaseProjectId}`);
            return;
          }
        }
      }

      if (code === 'auth/unauthorized-domain' || rawMsg.includes('auth/unauthorized-domain')) {
        const host = window.location.hostname;
        setAuthError(`UNAUTHORIZED_DOMAIN|${host}|${activeFirebaseProjectId}`);
        pushToast(
          'error',
          `Domain "${host}" is not authorized in Firebase project "${activeFirebaseProjectId}".`
        );
        return;
      }

      const msg =
        code === 'auth/popup-closed-by-user'
          ? 'Sign-in popup was closed before completing authentication.'
          : rawMsg || 'Sign-in failed. Please allow popups and try again.';
      setAuthError(msg);
      pushToast('error', msg);
    }
  };

  const clearSessionExpiredNotice = useCallback(() => {
    setSessionExpiredNotice(null);
  }, []);

  const signInWithEmail = async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    setSessionExpiredNotice(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setAuthError('Please enter both your email address and password.');
      return false;
    }

    // Check server-side failed-login lockout before authenticating
    try {
      const checkRes = await fetch('/api/session/login-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: trimmedEmail,
          action: 'check',
          maxFailedLogins: securityConfig.maxFailedLogins,
          lockoutMinutes: securityConfig.lockoutMinutes,
        }),
      });
      if (checkRes.status === 429) {
        const lockData = (await checkRes.json().catch(() => ({}))) as { error?: string };
        const lockMsg =
          lockData.error ||
          'Account temporarily locked after repeated failed sign-in attempts. Please wait and try again.';
        setAuthError(lockMsg);
        pushToast('error', lockMsg);
        return false;
      }
    } catch {
      // Proceed if session endpoint is unreachable
    }

    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
      void fetch('/api/session/login-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmedEmail, action: 'success' }),
      }).catch(() => undefined);
      return true;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      let msg = formatEmailAuthError(err);

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        try {
          const failRes = await fetch('/api/session/login-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              email: trimmedEmail,
              action: 'fail',
              maxFailedLogins: securityConfig.maxFailedLogins,
              lockoutMinutes: securityConfig.lockoutMinutes,
            }),
          });
          const failData = (await failRes.json().catch(() => ({}))) as {
            locked?: boolean;
            remainingAttempts?: number;
            error?: string;
          };
          if (failData.locked && failData.error) {
            msg = failData.error;
          } else if (typeof failData.remainingAttempts === 'number' && failData.remainingAttempts <= 2) {
            msg = `${msg} (${failData.remainingAttempts} attempt${
              failData.remainingAttempts === 1 ? '' : 's'
            } remaining before temporary lockout.)`;
          }
        } catch {
          // Ignore network error on lockout telemetry
        }
      }

      setAuthError(msg);
      if (!msg.startsWith('EMAIL_PASSWORD_DISABLED|')) {
        pushToast('error', msg);
      }
      return false;
    }
  };

  const signUpWithEmail = async (params: {
    fullName: string;
    email: string;
    password: string;
    portalType: 'STAFF' | 'STUDENT';
  }): Promise<boolean> => {
    setAuthError(null);
    const trimmedName = params.fullName.trim();
    const trimmedEmail = params.email.trim();
    if (trimmedName.length < 2) {
      setAuthError('Please enter your full name (at least 2 characters).');
      return false;
    }
    if (!trimmedEmail) {
      setAuthError('Please enter a valid email address.');
      return false;
    }
    if (params.password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return false;
    }

    const desiredRole: 'INSTRUCTOR' | 'STUDENT' =
      params.portalType === 'STUDENT' ? 'STUDENT' : 'INSTRUCTOR';

    try {
      window.sessionStorage.setItem(
        'zacma_pending_auth_intent',
        JSON.stringify({ fullName: trimmedName.slice(0, 120), role: desiredRole })
      );
    } catch {
      // Ignore storage error
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, params.password);
      await updateProfile(cred.user, { displayName: trimmedName.slice(0, 120) }).catch(() => undefined);
      pushToast(
        'success',
        params.portalType === 'STUDENT'
          ? 'Student account created. Welcome to the ZACMA Student Portal.'
          : 'Instructor account created. Welcome to the ZACMA Portal.'
      );
      return true;
    } catch (err) {
      try {
        window.sessionStorage.removeItem('zacma_pending_auth_intent');
      } catch {
        // Ignore
      }
      const msg = formatEmailAuthError(err);
      setAuthError(msg);
      if (!msg.startsWith('EMAIL_PASSWORD_DISABLED|')) {
        pushToast('error', msg);
      }
      return false;
    }
  };

  const sendPasswordReset = async (email: string): Promise<boolean> => {
    setAuthError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('Enter your registered email address first to receive a password reset link.');
      return false;
    }
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      pushToast('success', `Password reset link sent to ${trimmedEmail}. Check your inbox.`);
      return true;
    } catch (err) {
      const msg = formatEmailAuthError(err);
      setAuthError(msg);
      return false;
    }
  };

  const signOutUser = useCallback(
    async (reason: 'MANUAL' | 'INACTIVITY_TIMEOUT' = 'MANUAL') => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      try {
        const currentProfile = profile;
        const currentSessionId = activeSessionIdRef.current;

        if (currentProfile) {
          await recordLoginHistoryEvent({
            userId: currentProfile.uid,
            email: currentProfile.email,
            fullName: currentProfile.fullName,
            role: currentProfile.role,
            eventType: reason === 'INACTIVITY_TIMEOUT' ? 'SESSION_EXPIRED' : 'LOGOUT',
            authMethod: 'SYSTEM',
            sessionId: currentSessionId,
            detail:
              reason === 'INACTIVITY_TIMEOUT'
                ? 'Session automatically terminated due to inactivity timeout policy.'
                : 'User signed out and server session token was invalidated.',
          });
        }

        await fetch('/api/session/logout', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => undefined);

        await signOut(auth);
        setSessionWarningOpen(false);
        sessionWarningOpenRef.current = false;
        setPreviewRole(null);
        setPreviewStudentId(null);
        autoReminderRanRef.current = false;
        commDefaultsEnsuredRef.current = false;
        sessionEstablishedUidRef.current = null;
        activeSessionIdRef.current = undefined;

        if (reason === 'INACTIVITY_TIMEOUT') {
          setSessionExpiredNotice(
            'You were automatically signed out due to inactivity to protect institutional financial records. Please sign in again.'
          );
        }

        // Prevent browser back-button navigation into stale protected state
        try {
          window.sessionStorage.removeItem('zacma_pending_auth_intent');
          window.history.replaceState({ zacmaLoggedOut: true }, '', window.location.pathname);
        } catch {
          // Ignore history restriction
        }
      } finally {
        signingOutRef.current = false;
      }
    },
    [profile]
  );

  // Establish signed HttpOnly server session cookie + record login audit event on verified sign-in
  useEffect(() => {
    if (!user || !profile || !actualRole) return;
    if (sessionEstablishedUidRef.current === user.uid) return;
    sessionEstablishedUidRef.current = user.uid;
    lastActivityRef.current = Date.now();
    setSessionExpiredNotice(null);

    const timeoutMinutes =
      actualRole === 'ADMIN' || actualRole === 'ACCOUNTANT'
        ? securityConfig.adminTimeoutMinutes
        : securityConfig.userTimeoutMinutes;

    const providerId = user.providerData?.[0]?.providerId || '';
    const authMethod: 'GOOGLE' | 'EMAIL_PASSWORD' =
      providerId === 'google.com' ? 'GOOGLE' : 'EMAIL_PASSWORD';

    void (async () => {
      let sid: string | undefined;
      try {
        const res = await fetch('/api/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            uid: profile.uid,
            email: profile.email,
            role: actualRole,
            timeoutMinutes,
          }),
        });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as { sessionId?: string };
          sid = data.sessionId;
          activeSessionIdRef.current = sid;
        }
      } catch {
        // Non-fatal fallback
      }

      const now = new Date().toISOString();
      void setDoc(
        doc(db, 'profiles', profile.uid),
        { lastLoginAt: now, updatedAt: now },
        { merge: true }
      ).catch(() => undefined);

      await recordLoginHistoryEvent({
        userId: profile.uid,
        email: profile.email,
        fullName: profile.fullName,
        role: actualRole,
        eventType: 'LOGIN',
        authMethod,
        sessionId: sid,
        detail: `Signed in via ${authMethod === 'GOOGLE' ? 'Google OAuth' : 'Email & Password'} (Inactivity timeout: ${timeoutMinutes} min).`,
      });
    })();
  }, [user, profile, actualRole, securityConfig.adminTimeoutMinutes, securityConfig.userTimeoutMinutes]);

  const continueSession = useCallback(async () => {
    lastActivityRef.current = Date.now();
    sessionWarningOpenRef.current = false;
    setSessionWarningOpen(false);
    const timeoutMinutes =
      actualRole === 'ADMIN' || actualRole === 'ACCOUNTANT'
        ? securityConfig.adminTimeoutMinutes
        : securityConfig.userTimeoutMinutes;
    try {
      const res = await fetch('/api/session/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timeoutMinutes }),
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { sessionId?: string };
        if (data.sessionId) activeSessionIdRef.current = data.sessionId;
      }
    } catch {
      // Non-fatal
    }
    pushToast('info', 'Session extended securely.');
  }, [actualRole, securityConfig.adminTimeoutMinutes, securityConfig.userTimeoutMinutes]);

  // Role-based Inactivity Monitoring & Automatic Logout
  useEffect(() => {
    if (!user || !profile || !actualRole) {
      setSessionWarningOpen(false);
      sessionWarningOpenRef.current = false;
      return;
    }

    const timeoutMinutes =
      actualRole === 'ADMIN' || actualRole === 'ACCOUNTANT'
        ? securityConfig.adminTimeoutMinutes
        : securityConfig.userTimeoutMinutes;
    const totalTimeoutMs = Math.max(60_000, timeoutMinutes * 60 * 1000);
    const warningMs = Math.min(
      Math.max(15_000, securityConfig.warningBeforeSeconds * 1000),
      Math.floor(totalTimeoutMs / 2)
    );

    lastActivityRef.current = Date.now();
    let lastThrottle = 0;

    const recordActivity = () => {
      if (sessionWarningOpenRef.current) return; // Require explicit click on Continue Session once warning opens
      const now = Date.now();
      if (now - lastThrottle < 2000) return;
      lastThrottle = now;
      lastActivityRef.current = now;
    };

    const events: Array<keyof WindowEventMap> = [
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
      'pointerdown',
    ];
    events.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const ticker = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remainingMs = totalTimeoutMs - elapsed;

      if (remainingMs <= 0) {
        window.clearInterval(ticker);
        void signOutUser('INACTIVITY_TIMEOUT');
        return;
      }

      if (remainingMs <= warningMs) {
        if (!sessionWarningOpenRef.current) {
          sessionWarningOpenRef.current = true;
          setSessionWarningOpen(true);
        }
        setSessionSecondsRemaining(Math.max(1, Math.ceil(remainingMs / 1000)));
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, recordActivity));
      window.clearInterval(ticker);
    };
  }, [
    user,
    profile,
    actualRole,
    securityConfig.adminTimeoutMinutes,
    securityConfig.userTimeoutMinutes,
    securityConfig.warningBeforeSeconds,
    signOutUser,
  ]);

  return (
    <PortalContext.Provider
      value={{
        user,
        profile,
        actualRole,
        effectiveRole,
        previewRole,
        setPreviewRole,
        previewStudentId,
        setPreviewStudentId,
        authLoading,
        dataLoading,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOutUser,
        isPlatformUser,
        platformRole,
        portalMode,
        setPortalMode,
        activeTenantId,
        activeTenant,
        tenants,
        subscriptionPlans,
        platformSubscriptions,
        platformInvoices,
        platformPayments,
        tenantInvitations,
        supportSessions,
        activeSupportSession,
        startSupportAccess,
        endSupportAccess,
        platformSettings,
        supportTickets,
        isModuleEnabled,
        canWriteInTenant,
        actorContext,
        allPlatformStudents: students,
        allPlatformStaffRecords: staffRecords,
        allPlatformPayments: payments,
        allPlatformProfiles: staffProfiles,
        allPlatformAuditLogs: auditLogs,
        allPlatformCourses: courses,
        allPlatformAiUsageLogs: aiUsageLogs,
        aiUsageLogs: aiUsageLogs.filter((l) => l.tenantId === activeTenantId),
        sessionWarningOpen,
        sessionSecondsRemaining,
        sessionExpiredNotice,
        clearSessionExpiredNotice,
        continueSession,
        roles,
        staffProfiles: scopedStaffProfiles,
        staffRecords: scopedStaffRecords,
        staffCompensations: scopedStaffCompensations,
        identityDocuments: scopedIdentityDocuments,
        courses: scopedCourses,
        paymentPlans: scopedPaymentPlans,
        students: scopedStudents,
        enrollments: scopedEnrollments,
        installments: scopedInstallments,
        payments: scopedPayments,
        chapaTransactions: scopedChapaTransactions,
        receipts: scopedReceipts,
        expenseCategories: scopedExpenseCategories,
        expenses: scopedExpenses,
        financialAdjustments: scopedFinancialAdjustments,
        attendance: scopedAttendance,
        notifications,
        persistedNotifications: scopedPersistedNotifications,
        notificationPrefs,
        schemaMigrations,
        auditLogs: scopedAuditLogs,
        securityConfig,
        loginHistory,
        smsConfig,
        communicationPolicy,
        smsTemplates,
        smsLogs: scopedSmsLogs,
        channelRules,
        directoryUsers: scopedDirectoryUsers,
        conversations: scopedConversations,
        unreadMessagesCount,
        lastReminderRun,
        runningReminders,
        runReminderEvaluationNow,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}
