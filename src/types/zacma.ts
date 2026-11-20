export type PlatformRole =
  | 'SUPER_ADMIN'
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT'
  | 'PLATFORM_FINANCE';

export type RoleCode =
  | 'ADMIN'
  | 'MANAGER'
  | 'ACCOUNTANT'
  | 'INSTRUCTOR'
  | 'RECEPTIONIST'
  | 'HR_OFFICER'
  | 'GENERAL_STAFF'
  | 'STUDENT';

export type SaasModuleCode =
  | 'STUDENT_MANAGEMENT'
  | 'STAFF_MANAGEMENT'
  | 'COURSE_MANAGEMENT'
  | 'FEE_MANAGEMENT'
  | 'ACCOUNTING'
  | 'ATTENDANCE'
  | 'AI_ASSISTANT'
  | 'AI_ID_SCANNING'
  | 'NOTIFICATIONS'
  | 'REPORTS'
  | 'HR_MANAGEMENT'
  | 'INVENTORY'
  | 'CERTIFICATES';

export type SuperAdminNavSection =
  | 'sa_dashboard'
  | 'sa_add_institute'
  | 'sa_institutes'
  | 'sa_subscriptions'
  | 'sa_plans'
  | 'sa_revenue'
  | 'sa_platform_users'
  | 'sa_modules'
  | 'sa_global_settings'
  | 'sa_notifications'
  | 'sa_ai_services'
  | 'sa_ai_assistant'
  | 'sa_analytics'
  | 'sa_audit_logs'
  | 'sa_security'
  | 'sa_support';

export type TenantStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'PENDING' | 'EXPIRED';
export type BillingCycle = 'MONTHLY' | 'ANNUAL' | 'TRIAL' | 'CUSTOM';

export type PaymentPlanCode =
  | 'FULL'
  | 'MONTHLY'
  | 'TWO_MONTH'
  | 'THREE_MONTH'
  | 'SIX_MONTH'
  | 'CUSTOM';

export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type EnrollmentStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'REJECTED';
export type InstallmentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PaymentMethod = 'Cash' | 'CBE Birr' | 'Telebirr' | 'Bank Transfer' | 'Check' | 'Chapa';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export type NotificationType =
  | 'DEADLINE_APPROACHING'
  | 'OVERDUE_BALANCE'
  | 'PENDING_REGISTRATION'
  | 'PENDING_STAFF_REGISTRATION'
  | 'STAFF_REGISTRATION_APPROVED'
  | 'ID_VERIFICATION_FLAGGED'
  | 'PENDING_PAYMENT'
  | 'REJECTED_PAYMENT'
  | 'UPCOMING_PAYMENT'
  | 'PAYMENT_DUE_TODAY'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'OUTSTANDING_BALANCE'
  | 'REGISTRATION_APPROVED'
  | 'COURSE_ANNOUNCEMENT'
  | 'ATTENDANCE_UPDATE'
  | 'INSTRUCTOR_MESSAGE'
  | 'ADMIN_ANNOUNCEMENT'
  | 'SCHEDULE_CHANGE'
  | 'NEW_INTERNAL_MESSAGE'
  | 'CHAPA_PAYMENT_LINK'
  | 'CHAPA_PAYMENT_VERIFIED'
  | 'CHAPA_PAYMENT_APPROVED'
  | 'CHAPA_PAYMENT_REJECTED'
  | 'SUBSCRIPTION_EXPIRING'
  | 'INSTITUTE_PROVISIONED'
  | 'SUPPORT_SESSION_STARTED';

export type NavSection =
  | 'dashboard'
  | 'ai_hub'
  | 'registrations'
  | 'students'
  | 'courses'
  | 'payments'
  | 'chapa'
  | 'reminders'
  | 'approvals'
  | 'receipts'
  | 'accounting'
  | 'reports'
  | 'attendance'
  | 'messages'
  | 'communications'
  | 'staff'
  | 'branding'
  | 'audit'
  | 'setup';

export type IdDocumentType =
  | 'ETHIOPIAN_FAYDA_ID'
  | 'NATIONAL_ID'
  | 'PASSPORT'
  | 'DRIVING_LICENCE';

export type IdVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'REJECTED';

export type StudentPaymentCategory = 'FULLY_PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE';

export type FinancialAdjustmentType =
  | 'REFUND'
  | 'REVERSAL'
  | 'SCHOLARSHIP_DISCOUNT'
  | 'FEE_ADJUSTMENT';

export interface RoleRecord {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
  permissions?: string[];
}

export interface StaffProfile {
  id: string;
  uid: string;
  tenantId?: string;
  platformRole?: PlatformRole;
  inviteId?: string;
  email: string;
  fullName: string;
  phone?: string;
  role: RoleCode;
  linkedStudentId?: string;
  allowedModules?: NavSection[];
  canExportReports?: boolean;
  lastLoginAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialAdjustment {
  id: string;
  tenantId?: string;
  adjustmentRef: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  courseId: string;
  courseName: string;
  paymentId?: string;
  type: FinancialAdjustmentType;
  amountEtb: number;
  effectiveDate: string;
  reason: string;
  approvedBy: string;
  approvedByName: string;
  createdAt: string;
}

export interface SecurityConfig {
  id: string;
  tenantId?: string;
  adminTimeoutMinutes: number;
  userTimeoutMinutes: number;
  warningBeforeSeconds: number;
  maxFailedLogins: number;
  lockoutMinutes: number;
  enforceAuditOnExports: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string;
}

export interface LoginHistoryRecord {
  id: string;
  tenantId?: string;
  userId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  eventType: 'LOGIN' | 'LOGOUT' | 'SESSION_EXPIRED' | 'FAILED_LOGIN' | 'LOCKOUT';
  authMethod: 'EMAIL_PASSWORD' | 'GOOGLE' | 'SYSTEM';
  userAgent?: string;
  sessionId?: string;
  detail?: string;
  createdAt: string;
}

export interface Course {
  id: string;
  tenantId?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPlan {
  id: string;
  tenantId?: string;
  code: PaymentPlanCode;
  name: string;
  installmentCount: number;
  intervalDays: number;
  description?: string;
  isActive: boolean;
}

export interface Student {
  id: string;
  tenantId?: string;
  studentCode: string;
  fullName: string;
  gender: 'Male' | 'Female' | 'Unspecified';
  phone: string;
  altPhone?: string;
  email?: string;
  dateOfBirth?: string;
  nationality?: string;
  address: string;
  photoUrl?: string;
  idDocumentType?: IdDocumentType;
  idNumberMasked?: string;
  idNumberHash?: string;
  idExpiryDate?: string;
  idVaultRefId?: string;
  idVerificationStatus?: IdVerificationStatus;
  ocrConfidenceSummary?: string;
  initialPaymentEtb?: number;
  courseId: string;
  courseName: string;
  enrollmentDate: string;
  registrationDateEthiopian?: string;
  registrationTimeEat?: string;
  courseFeeEtb: number;
  paymentPlanCode: PaymentPlanCode;
  registrationStatus: RegistrationStatus;
  registeredBy: string;
  registeredByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffRecord {
  id: string;
  tenantId?: string;
  staffCode: string;
  fullName: string;
  address: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  nationality: string;
  gender?: 'Male' | 'Female' | 'Unspecified';
  idDocumentType: IdDocumentType;
  idNumberMasked?: string;
  idNumberHash?: string;
  idExpiryDate?: string;
  idVaultRefId?: string;
  idVerificationStatus?: IdVerificationStatus;
  department: string;
  jobPosition: string;
  portalRole: Exclude<RoleCode, 'STUDENT'>;
  employmentStartDate: string;
  employmentStartDateEthiopian?: string;
  photoUrl?: string;
  linkedProfileUid?: string;
  registrationStatus: RegistrationStatus;
  registeredBy: string;
  registeredByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  ocrConfidenceSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffCompensation {
  id: string;
  tenantId?: string;
  staffId: string;
  staffCode: string;
  salaryEtb: number;
  payFrequency: 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT';
  notes?: string;
  updatedBy: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityDocumentRecord {
  id: string;
  tenantId?: string;
  subjectType: 'STUDENT' | 'STAFF';
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  documentType: IdDocumentType;
  idNumberMasked: string;
  idNumberHash: string;
  documentExpiryDate?: string;
  encryptionAlg: 'AES-GCM-256';
  encryptionIv: string;
  encryptedPayload: string;
  fileMimeType?: string;
  hasFrontImage: boolean;
  hasBackImage: boolean;
  ocrConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL';
  ocrWarnings?: string[];
  verificationStatus: 'PENDING_REVIEW' | 'VERIFIED' | 'FLAGGED' | 'REJECTED';
  verificationNotes?: string;
  uploadedBy: string;
  uploadedByName: string;
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  retentionDeleteAfter?: string;
  isRedacted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedIdVaultPayload {
  documentNumber: string;
  drivingLicenceNumber?: string;
  frontDataUrl?: string;
  backDataUrl?: string;
  extractedSummary?: string;
}

export interface Enrollment {
  id: string;
  tenantId?: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  courseId: string;
  courseName: string;
  instructorId?: string;
  paymentPlanCode: PaymentPlanCode;
  paymentPlanName?: string;
  enrollmentDate: string;
  agreedFeeEtb: number;
  approvedPaidEtb: number;
  remainingBalanceEtb: number;
  status: EnrollmentStatus;
  registeredBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentInstallment {
  id: string;
  tenantId?: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  courseId: string;
  courseName: string;
  installmentNumber: number;
  dueDate: string;
  amountDueEtb: number;
  amountPaidEtb: number;
  status: InstallmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  tenantId?: string;
  transactionRef: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  courseId: string;
  courseName: string;
  amountEtb: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  recordedBy: string;
  recordedByName: string;
  status: PaymentStatus;
  approvedBy?: string;
  approvedByName?: string;
  approvalDate?: string;
  rejectionReason?: string;
  receiptId?: string;
  receiptNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChapaPaymentStatus =
  | 'INITIATED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type ChapaApprovalStatus = 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type ChapaTransactionSource = 'STUDENT_PORTAL' | 'PAYMENT_LINK';

export interface ChapaTransaction {
  id: string;
  tenantId?: string;
  txRef: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentPhone?: string;
  studentEmail?: string;
  courseId: string;
  courseName: string;
  enrollmentId: string;
  amountEtb: number;
  currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  paymentMethod: 'Chapa';
  source: ChapaTransactionSource;
  checkoutUrl?: string;
  paymentStatus: ChapaPaymentStatus;
  approvalStatus: ChapaApprovalStatus;
  chapaReference?: string;
  chapaChannel?: string;
  chapaFeeEtb?: number;
  verificationProof?: string;
  verificationSummary?: string;
  paymentDate?: string;
  verifiedAt?: string;
  expiresAt?: string;
  createdBy: string;
  createdByName: string;
  createdByRole: RoleCode;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  approvalNotes?: string;
  rejectionReason?: string;
  paymentId?: string;
  receiptId?: string;
  receiptNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Receipt {
  id: string;
  tenantId?: string;
  receiptNumber: string;
  paymentId: string;
  transactionRef: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  studentPhone?: string;
  courseName: string;
  previousBalanceEtb: number;
  amountPaidEtb: number;
  remainingBalanceEtb: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  authorizedBy: string;
  verificationHash: string;
  issuedAt: string;
}

export interface ExpenseCategory {
  id: string;
  tenantId?: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Expense {
  id: string;
  tenantId?: string;
  categoryId: string;
  categoryName: string;
  title: string;
  amountEtb: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  referenceNo?: string;
  recordedBy: string;
  recordedByName: string;
  notes?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  tenantId?: string;
  enrollmentId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  courseId: string;
  courseName: string;
  attendanceDate: string;
  status: AttendanceStatus;
  recordedBy: string;
  recordedByName: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalNotification {
  id: string;
  tenantId?: string;
  type: NotificationType;
  title: string;
  message: string;
  targetRole: RoleCode | 'ALL';
  recipientUid?: string;
  category?: string;
  actionSection?: string;
  entityType?: string;
  entityId?: string;
  studentId?: string;
  studentCode?: string;
  studentName?: string;
  courseName?: string;
  expectedAmountEtb?: number;
  paidAmountEtb?: number;
  remainingBalanceEtb?: number;
  dueDate?: string;
  paymentStatus?: string;
  dedupKey?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  upcomingLeadDays: number;
  overdueRepeatDays: number;
  updatedAt: string;
}

export interface SchemaMigration {
  id: string;
  version: string;
  name: string;
  appliedAt: string;
  appliedBy: string;
  status: 'APPLIED' | 'VERIFIED';
  notes?: string;
}

export interface AuditLog {
  id: string;
  tenantId?: string;
  actorId: string;
  actorName: string;
  actorRole: RoleCode;
  actorPlatformRole?: PlatformRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  result?: 'SUCCESS' | 'DENIED' | 'FAILED';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// SMS Gateway, Unified Notification Engine & Internal Messaging Models
// ---------------------------------------------------------------------------

export type SmsProviderCode = 'afromessage' | 'geezsms' | 'twilio' | 'africastalking';

export type CommunicationEventType =
  | 'REGISTRATION_APPROVED'
  | 'PAYMENT_REMINDER'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_APPROVED'
  | 'COURSE_ANNOUNCEMENT'
  | 'ATTENDANCE_UPDATE'
  | 'INSTRUCTOR_MESSAGE'
  | 'ADMIN_ANNOUNCEMENT';

export type SmsDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'TEST_SIMULATED';

export interface SmsSystemConfig {
  id: string;
  ownerPhoneNumber: string;
  activeProvider: SmsProviderCode;
  senderId?: string;
  smsEnabled: boolean;
  portalNotificationsEnabled: boolean;
  internalMessagingEnabled: boolean;
  testMode: boolean;
  allowStudentToInstructor: boolean;
  allowStudentToAdmin: boolean;
  allowStudentToStudent: boolean;
  allowAttachments: boolean;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string;
}

export interface CommunicationPolicy {
  id: string;
  portalNotificationsEnabled: boolean;
  internalMessagingEnabled: boolean;
  allowStudentToInstructor: boolean;
  allowStudentToAdmin: boolean;
  allowStudentToStudent: boolean;
  allowAttachments: boolean;
  updatedAt: string;
}

export interface SmsTemplate {
  id: string;
  eventType: CommunicationEventType;
  name: string;
  body: string;
  isActive: boolean;
  updatedBy?: string;
  updatedAt: string;
}

export interface SmsLog {
  id: string;
  tenantId?: string;
  dedupKey?: string;
  eventType: CommunicationEventType;
  recipientName: string;
  recipientPhone: string;
  studentId?: string;
  studentCode?: string;
  courseName?: string;
  templateId?: string;
  messageBody: string;
  provider: SmsProviderCode;
  mode: 'LIVE' | 'TEST';
  status: SmsDeliveryStatus;
  providerMessageId?: string;
  errorMessage?: string;
  retryCount: number;
  sentBy: string;
  sentByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationChannelRule {
  id: string;
  tenantId?: string;
  eventType: CommunicationEventType;
  label: string;
  description: string;
  smsEnabled: boolean;
  portalEnabled: boolean;
  internalMessageEnabled: boolean;
  updatedAt: string;
}

export interface DirectoryUser {
  id: string;
  tenantId?: string;
  uid: string;
  fullName: string;
  role: RoleCode;
  linkedStudentId?: string;
  studentCode?: string;
  courseId?: string;
  courseName?: string;
  isActive: boolean;
  lastSeenAt: string;
  updatedAt: string;
}

export type ConversationType = 'DIRECT' | 'GROUP' | 'BROADCAST';

export type BroadcastAudience =
  | 'ALL_USERS'
  | 'ALL_STUDENTS'
  | 'ALL_INSTRUCTORS'
  | 'ALL_ACCOUNTANTS'
  | 'ALL_STAFF'
  | 'COURSE'
  | 'CUSTOM';

export interface Conversation {
  id: string;
  tenantId?: string;
  type: ConversationType;
  title: string;
  description?: string;
  participantIds: string[];
  participantLabels: string[]; // "uid|Name|Role" bounded parallel list for crisp display without PII lookup
  courseId?: string;
  courseName?: string;
  broadcastAudience?: BroadcastAudience;
  createdBy: string;
  createdByName: string;
  createdByRole: RoleCode;
  lastMessageText?: string;
  lastMessageAt?: string;
  lastMessageBy?: string;
  lastMessageByName?: string;
  readByUids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface InternalMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: RoleCode;
  body: string;
  replyToId?: string;
  replyToSender?: string;
  replyToPreview?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  attachmentDataUrl?: string;
  readByUids: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ZACMA Multi-Tenant SaaS Platform Models (Super Admin Control Center)
// ---------------------------------------------------------------------------

export interface TenantRecord {
  id: string;
  tenantId: string;
  name: string;
  shortName: string;
  slug: string;
  businessType: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  website?: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  studentIdPrefix: string; // e.g., ZAC, ABC
  staffIdPrefix: string;   // e.g., ZAC, ABC
  receiptPrefix: string;   // e.g., ZAC-RCP, ABC-RCP
  currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  timezone: string;
  academicYear: string;
  paymentMethods: PaymentMethod[];
  defaultLanguage: string;
  dateFormat: 'GREGORIAN_AND_ETHIOPIAN' | 'GREGORIAN_ONLY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  invoiceFooterNote?: string;
  notificationEmailEnabled: boolean;
  notificationSmsEnabled: boolean;
  notificationWhatsappEnabled: boolean;
  emailGatewayStatus: 'CONFIGURED' | 'UNCONFIGURED';
  smsGatewayStatus: 'CONFIGURED' | 'UNCONFIGURED';
  whatsappGatewayStatus: 'CONFIGURED' | 'UNCONFIGURED';
  smsSenderLabel?: string;
  status: TenantStatus;
  planId: string;
  planCode: string;
  planName: string;
  billingCycle: BillingCycle;
  monthlyPriceEtb: number;
  annualPriceEtb: number;
  studentLimit: number;
  staffLimit: number;
  storageLimitMb: number;
  storageUsedMb: number;
  aiMonthlyQuota: number;
  aiRequestsUsed: number;
  aiMonthlyTokenLimit?: number;
  aiDocScanLimit?: number;
  enabledModules: SaasModuleCode[];
  primaryAdminUid?: string;
  primaryAdminName: string;
  primaryAdminEmail: string;
  primaryAdminPhone: string;
  primaryAdminPosition: string;
  subscriptionStartDate: string;
  trialEndsAt?: string;
  subscriptionExpiresAt: string;
  suspendedReason?: string;
  suspendedAt?: string;
  isDefaultPlatformTenant?: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  code: 'FREE_TRIAL' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE' | 'CUSTOM';
  name: string;
  tagline: string;
  monthlyPriceEtb: number;
  annualPriceEtb: number;
  trialDays: number;
  studentLimit: number;
  staffLimit: number;
  storageLimitMb: number;
  aiMonthlyQuota: number;
  includedModules: SaasModuleCode[];
  isActive: boolean;
  isFeatured?: boolean;
  updatedAt: string;
}

export interface PlatformSubscription {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string;
  planCode: string;
  planName: string;
  billingCycle: BillingCycle;
  priceEtb: number;
  currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  status: 'ACTIVE' | 'TRIAL' | 'OVERDUE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';
  startDate: string;
  trialEndsAt?: string;
  expiresAt: string;
  autoRenew: boolean;
  lastReminderSentAt?: string;
  notes?: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformInvoice {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  planName: string;
  billingCycle: BillingCycle;
  amountEtb: number;
  currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'VOID';
  paidAt?: string;
  paymentRef?: string;
  notes?: string;
  issuedBy: string;
  issuedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPayment {
  id: string;
  paymentRef: string;
  invoiceId?: string;
  invoiceNumber?: string;
  tenantId: string;
  tenantName: string;
  planName: string;
  amountEtb: number;
  currency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  paymentDate: string;
  paymentMethod: 'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check';
  status: 'COMPLETED' | 'REFUNDED';
  recordedBy: string;
  recordedByName: string;
  notes?: string;
  createdAt: string;
}

export interface TenantInvitation {
  id: string;
  token: string;
  tenantId: string;
  tenantName: string;
  email: string;
  emailLower: string;
  fullName: string;
  phone?: string;
  position?: string;
  role: RoleCode;
  status: 'PENDING' | 'CLAIMED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  claimedByUid?: string;
  claimedAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportAccessSession {
  id: string;
  tenantId: string;
  tenantName: string;
  actorUid: string;
  actorName: string;
  actorPlatformRole: PlatformRole;
  reason: string;
  status: 'ACTIVE' | 'ENDED' | 'EXPIRED';
  startedAt: string;
  expiresAt: string;
  endedAt?: string;
}

export interface PlatformGlobalSettings {
  id: string;
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  defaultCurrency: 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP';
  defaultLanguage: string;
  defaultTrialDays: number;
  gracePeriodDays: number;
  autoSuspendExpiredDays: number;
  allowSelfSignupInstitutes: boolean;
  enforceSupportSessionReason: boolean;
  maxSupportSessionMinutes: number;
  defaultAiModel?: AiModelId;
  aiMonthlyTokenLimit?: number;
  aiDocScanLimit?: number;
  updatedBy?: string;
  updatedByName?: string;
  updatedAt: string;
}

export type AiModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';

export type AiRoleScope = 'SUPER_ADMIN' | RoleCode;

export interface AiStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
  totalTokens?: number;
  estimatedCostUsd?: number;
  actionDraft?: {
    kind: 'SMS' | 'EMAIL' | 'REMINDER' | 'ANNOUNCEMENT' | 'EXAM' | 'LESSON_PLAN' | 'COURSE_OUTLINE' | 'JOB_DESCRIPTION' | 'REPORT';
    title: string;
    requiresApproval: boolean;
  };
}

export interface AiConversationRecord {
  id: string;
  tenantId: string;
  ownerUid: string;
  ownerName: string;
  roleScope: AiRoleScope;
  moduleScope: string;
  title: string;
  messagesJson: string;
  messageCount: number;
  lastMessagePreview: string;
  modelId: AiModelId;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export type AiFeatureType = 'CHAT' | 'DOCUMENT_OCR' | 'REPORT_GEN' | 'DRAFT_GEN' | 'SECURITY_AUDIT';

export interface AiUsageLogRecord {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  roleScope: string;
  moduleScope: string;
  featureType: AiFeatureType;
  modelId: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  createdAt: string;
}

export interface AiSecurityAuditScenarioResult {
  id: string;
  scenarioNumber: number;
  title: string;
  attackVector: string;
  expectedOutcome: string;
  actualOutcome: string;
  httpStatus: number;
  passed: boolean;
  sanitizedKeysRemoved?: string[];
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  category: 'BILLING' | 'TECHNICAL' | 'ONBOARDING' | 'SECURITY' | 'MODULE_UPGRADE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  description: string;
  createdBy: string;
  createdByName: string;
  assignedToName?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export function formatCurrency(amount: number, currency: string = 'ETB'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatEtb(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `ETB ${safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatEtbCompact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ETB`;
}

export function formatDateShort(isoOrDate: string | undefined): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00` : isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(baseDate: string, days: number): string {
  const d = new Date(`${baseDate.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sanitizeRefId(ref: string): string {
  return ref
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_');
}

export function generateVerificationHash(receiptNo: string, txRef: string, amount: number): string {
  const raw = `ZACMA|${receiptNo}|${txRef}|${amount.toFixed(2)}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ZAC-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}
