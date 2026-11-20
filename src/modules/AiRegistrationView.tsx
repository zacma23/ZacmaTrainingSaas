import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileCheck2,
  FileSpreadsheet,
  Flag,
  GraduationCap,
  Lock,
  QrCode,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import {
  AppliedScanPayload,
  IdDocumentScanner,
} from '../components/IdDocumentScanner';
import { QrIdScannerModal, ZacmaQrBadgeModal } from '../components/QrIdScannerModal';
import { BulkStudentImportPanel } from '../components/BulkStudentImportPanel';
import { matchCourseFromHint, ParsedQrIdentity } from '../lib/qrIdParser';
import { DualCalendarDatePicker, DualDateDisplay } from '../components/DualCalendarDatePicker';
import { Avatar, ConfirmDialog, EmptyState, StatusLabel } from '../components/PortalUI';
import { todayAddisIsoDate } from '../lib/ethiopianCalendar';
import {
  approveStudentRegistration,
  compressImageToDataUrl,
  rejectStudentRegistration,
} from '../lib/zacmaService';
import {
  approveStaffRegistration,
  checkDuplicateIdNumber,
  correctRegistrationOcrFields,
  decryptIdVaultPayload,
  deleteIdentityDocumentRecord,
  DuplicateIdCheckResult,
  exportRegistrationsReport,
  ID_DOCUMENT_LABELS,
  logIdDocumentAccess,
  redactIdentityDocumentImages,
  rejectStaffRegistration,
  STAFF_DEPARTMENTS,
  STAFF_JOB_POSITIONS,
  submitAiStaffRegistration,
  submitAiStudentRegistration,
  updateIdVerificationDecision,
  updateRetentionDate,
  updateStaffCompensation,
} from '../lib/registrationService';
import {
  DecryptedIdVaultPayload,
  formatEtb,
  IdDocumentType,
  IdentityDocumentRecord,
  PaymentMethod,
  RoleCode,
  StaffRecord,
  Student,
  todayIsoDate,
} from '../types/zacma';

type SubTab =
  | 'register'
  | 'bulk_import'
  | 'students'
  | 'staff'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'id_vault';

const ID_TYPE_OPTIONS: IdDocumentType[] = [
  'ETHIOPIAN_FAYDA_ID',
  'NATIONAL_ID',
  'PASSPORT',
  'DRIVING_LICENCE',
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Bank Transfer',
  'Telebirr',
  'CBE Birr',
  'Check',
];

function inferPortalRoleFromPosition(position: string): Exclude<RoleCode, 'STUDENT'> {
  if (position === 'Accountant') return 'ACCOUNTANT';
  if (position === 'Instructor') return 'INSTRUCTOR';
  return 'GENERAL_STAFF';
}

export function AiRegistrationView() {
  const {
    profile,
    effectiveRole,
    actorContext,
    students,
    enrollments,
    courses,
    paymentPlans,
    staffRecords,
    staffCompensations,
    identityDocuments,
    pushToast,
  } = usePortal();

  const isAdmin = effectiveRole === 'ADMIN';
  const canExport = isAdmin || (effectiveRole === 'ACCOUNTANT' && Boolean(profile?.canExportReports));

  const [subTab, setSubTab] = useState<SubTab>('register');
  const [regMode, setRegMode] = useState<'STUDENT' | 'STAFF'>('STUDENT');
  const [searchQuery, setSearchQuery] = useState('');

  // Shared scanned document attachments + OCR metadata
  const [frontDocUrl, setFrontDocUrl] = useState<string | undefined>(undefined);
  const [frontDocMime, setFrontDocMime] = useState<string>('image/jpeg');
  const [backDocUrl, setBackDocUrl] = useState<string | undefined>(undefined);
  const [ocrConfidence, setOcrConfidence] = useState<'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL'>('MANUAL');
  const [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  const [ocrSummary, setOcrSummary] = useState<string>('');
  const [scannerResetKey, setScannerResetKey] = useState(0);

  // Common personal & ID form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Unspecified'>('Unspecified');
  const [nationality, setNationality] = useState('Ethiopian');
  const [address, setAddress] = useState('');
  const [idDocumentType, setIdDocumentType] = useState<IdDocumentType>('ETHIOPIAN_FAYDA_ID');
  const [idDocumentNumber, setIdDocumentNumber] = useState('');
  const [idExpiryDate, setIdExpiryDate] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>('');

  // Duplicate ID validation state
  const [dupCheck, setDupCheck] = useState<DuplicateIdCheckResult | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);

  // Student-specific form fields
  const activeCourses = useMemo(
    () => courses.filter((c) => c.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [courses]
  );
  const [courseId, setCourseId] = useState('');
  const [agreedFeeEtb, setAgreedFeeEtb] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState(todayAddisIsoDate());
  const [planCode, setPlanCode] = useState('FULL');
  const [customInstallments, setCustomInstallments] = useState('3');
  const [customIntervalDays, setCustomIntervalDays] = useState('30');
  const [initialPaymentAmount, setInitialPaymentAmount] = useState('');
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<PaymentMethod>('Cash');
  const [initialTransactionRef, setInitialTransactionRef] = useState('');

  // Staff-specific form fields
  const [department, setDepartment] = useState<string>(STAFF_DEPARTMENTS[1]);
  const [jobPosition, setJobPosition] = useState<string>(STAFF_JOB_POSITIONS[1]);
  const [portalRole, setPortalRole] = useState<Exclude<RoleCode, 'STUDENT'>>('INSTRUCTOR');
  const [employmentStartDate, setEmploymentStartDate] = useState(todayAddisIsoDate());
  const [salaryEtb, setSalaryEtb] = useState('');
  const [payFrequency, setPayFrequency] = useState<'MONTHLY' | 'BIWEEKLY' | 'CONTRACT'>('MONTHLY');
  const [compensationNotes, setCompensationNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [lastSuccessBanner, setLastSuccessBanner] = useState<{
    code: string;
    name: string;
    kind: 'STUDENT' | 'STAFF';
  } | null>(null);

  // Approval / Rejection / OCR Edit / Salary / Vault modals
  const [confirmDecision, setConfirmDecision] = useState<{
    kind: 'STUDENT' | 'STAFF';
    action: 'approve' | 'reject';
    student?: Student;
    staff?: StaffRecord;
  } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);

  const [editingOcrTarget, setEditingOcrTarget] = useState<{
    kind: 'STUDENT' | 'STAFF';
    id: string;
    code: string;
    fullName: string;
    phone: string;
    address: string;
    email: string;
    dateOfBirth: string;
    nationality: string;
    gender: 'Male' | 'Female' | 'Unspecified';
    idExpiryDate: string;
    idVaultRefId?: string;
  } | null>(null);

  const [editingSalaryStaff, setEditingSalaryStaff] = useState<StaffRecord | null>(null);
  const [inspectingVaultDoc, setInspectingVaultDoc] = useState<IdentityDocumentRecord | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrBadgeSubject, setQrBadgeSubject] = useState<
    | { kind: 'STUDENT'; student: Student }
    | { kind: 'STAFF'; staff: StaffRecord }
    | null
  >(null);
  const [lastQrLoadedNotice, setLastQrLoadedNotice] = useState<string | null>(null);

  // Initialize default course and payment plan when data loads
  useEffect(() => {
    if (!courseId && activeCourses.length > 0) {
      setCourseId(activeCourses[0].id);
      setAgreedFeeEtb(String(activeCourses[0].feeEtb));
    }
  }, [activeCourses, courseId]);

  useEffect(() => {
    if (paymentPlans.length > 0 && !paymentPlans.some((p) => p.code === planCode)) {
      setPlanCode(paymentPlans[0].code);
    }
  }, [paymentPlans, planCode]);

  const selectedCourse = useMemo(
    () => activeCourses.find((c) => c.id === courseId) || activeCourses[0] || null,
    [activeCourses, courseId]
  );

  const selectedPlan = useMemo(
    () => paymentPlans.find((p) => p.code === planCode) || paymentPlans[0] || null,
    [paymentPlans, planCode]
  );

  // Real-time duplicate ID number check (debounced 400ms)
  useEffect(() => {
    const trimmed = idDocumentNumber.trim();
    if (trimmed.length < 4) {
      setDupCheck(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCheckingDup(true);
      try {
        const res = await checkDuplicateIdNumber(idDocumentType, trimmed);
        if (!cancelled) {
          setDupCheck(res);
          if (!res.isDuplicate) setAllowDuplicateOverride(false);
        }
      } finally {
        if (!cancelled) setCheckingDup(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [idDocumentType, idDocumentNumber]);

  // Live financial preview for Student Registration
  const feeNumeric = Number(agreedFeeEtb) > 0 ? Number(agreedFeeEtb) : selectedCourse?.feeEtb || 0;
  const initPayNumeric = Math.max(0, Number(initialPaymentAmount) || 0);
  const projectedBalance = Math.max(0, feeNumeric - initPayNumeric);
  const projectedStatus =
    initPayNumeric <= 0
      ? 'UNPAID (Pending Initial Payment)'
      : projectedBalance <= 0
      ? 'FULLY PAID (Pending Admin Verification)'
      : 'PARTIALLY PAID (Pending Admin Verification)';

  const isIdExpired = Boolean(idExpiryDate && idExpiryDate < todayIsoDate());

  const handleApplyScan = useCallback(
    (payload: AppliedScanPayload) => {
      const ext = payload.extraction;
      if (ext.detectedDocumentType !== 'UNKNOWN') {
        setIdDocumentType(ext.detectedDocumentType);
      }
      if (ext.fullName) setFullName(ext.fullName);
      if (ext.dateOfBirth) setDateOfBirth(ext.dateOfBirth);
      if (ext.gender === 'Male' || ext.gender === 'Female') setGender(ext.gender);
      if (ext.nationality) setNationality(ext.nationality);
      if (ext.documentNumber) setIdDocumentNumber(ext.documentNumber);
      if (ext.documentExpiryDate) setIdExpiryDate(ext.documentExpiryDate);
      if (ext.address) setAddress(ext.address);
      if (ext.phone && !phone.trim()) setPhone(ext.phone);
      if (payload.croppedPortraitUrl) setPhotoUrl(payload.croppedPortraitUrl);

      setFrontDocUrl(payload.frontDataUrl);
      setFrontDocMime(payload.frontMimeType);
      setBackDocUrl(payload.backDataUrl);
      setOcrConfidence(ext.overallConfidence);
      setOcrWarnings(ext.warnings);
      setOcrSummary(ext.summaryNote);

      pushToast(
        'info',
        `OCR auto-filled fields (${ext.overallConfidence} clarity). Verify accuracy before submitting.`
      );
    },
    [phone, pushToast]
  );

  const handleApplyQrScan = useCallback(
    (parsed: ParsedQrIdentity) => {
      setSubTab('register');
      setLastSuccessBanner(null);

      if (parsed.registrationType) {
        setRegMode(parsed.registrationType);
      }
      if (parsed.fullName) setFullName(parsed.fullName);
      if (parsed.phone) setPhone(parsed.phone);
      if (parsed.altPhone) setAltPhone(parsed.altPhone);
      if (parsed.email) setEmail(parsed.email);
      if (parsed.dateOfBirth) setDateOfBirth(parsed.dateOfBirth);
      if (parsed.gender) setGender(parsed.gender);
      if (parsed.nationality) setNationality(parsed.nationality);
      if (parsed.address) setAddress(parsed.address);
      if (parsed.idDocumentType) setIdDocumentType(parsed.idDocumentType);
      if (parsed.idDocumentNumber) setIdDocumentNumber(parsed.idDocumentNumber);
      if (parsed.idExpiryDate) setIdExpiryDate(parsed.idExpiryDate);

      if (parsed.courseHint) {
        const matched = matchCourseFromHint(parsed.courseHint, activeCourses);
        if (matched) {
          setCourseId(matched.id);
          setAgreedFeeEtb(String(matched.feeEtb));
        }
      }
      if (parsed.department) setDepartment(parsed.department);
      if (parsed.jobPosition) {
        setJobPosition(parsed.jobPosition);
        if (!parsed.portalRole) {
          setPortalRole(inferPortalRoleFromPosition(parsed.jobPosition));
        }
      }
      if (parsed.portalRole) {
        setPortalRole(
          !isAdmin && parsed.portalRole === 'ADMIN' ? 'GENERAL_STAFF' : parsed.portalRole
        );
      }

      setOcrConfidence('HIGH');
      setOcrSummary(
        `Quick QR ID scan (${parsed.format.replace('_', ' ')}${parsed.institutionalCode ? ` · ${parsed.institutionalCode}` : ''})`
      );
      setLastQrLoadedNotice(
        `QR ID decoded (${parsed.extractedCount} field${parsed.extractedCount === 1 ? '' : 's'} populated${parsed.institutionalCode ? ` · ${parsed.institutionalCode}` : ''}). Review fields below and submit.`
      );
      pushToast(
        'success',
        `QR ID code scanned and applied to ${parsed.registrationType === 'STAFF' ? 'Staff' : 'Student'} registration form.`
      );
    },
    [activeCourses, isAdmin, pushToast]
  );

  const handleJumpToExistingQr = useCallback(
    (parsed: ParsedQrIdentity) => {
      if (parsed.matchedStudent) {
        setSearchQuery(parsed.matchedStudent.studentCode);
        setSubTab('students');
        pushToast(
          'info',
          `Located existing student ${parsed.matchedStudent.fullName} (${parsed.matchedStudent.studentCode}).`
        );
      } else if (parsed.matchedStaff) {
        setSearchQuery(parsed.matchedStaff.staffCode);
        setSubTab('staff');
        pushToast(
          'info',
          `Located existing staff member ${parsed.matchedStaff.fullName} (${parsed.matchedStaff.staffCode}).`
        );
      }
    },
    [pushToast]
  );

  const handleDocumentsChanged = useCallback(
    (docs: {
      frontDataUrl?: string;
      frontMimeType?: string;
      backDataUrl?: string;
      backMimeType?: string;
    }) => {
      setFrontDocUrl(docs.frontDataUrl);
      if (docs.frontMimeType) setFrontDocMime(docs.frontMimeType);
      setBackDocUrl(docs.backDataUrl);
    },
    []
  );

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setAltPhone('');
    setEmail('');
    setDateOfBirth('');
    setGender('Unspecified');
    setNationality('Ethiopian');
    setAddress('');
    setIdDocumentType('ETHIOPIAN_FAYDA_ID');
    setIdDocumentNumber('');
    setIdExpiryDate('');
    setPhotoUrl('');
    setFrontDocUrl(undefined);
    setBackDocUrl(undefined);
    setOcrConfidence('MANUAL');
    setOcrWarnings([]);
    setOcrSummary('');
    setLastQrLoadedNotice(null);
    setDupCheck(null);
    setAllowDuplicateOverride(false);
    setInitialPaymentAmount('');
    setInitialTransactionRef('');
    setSalaryEtb('');
    setCompensationNotes('');
    setScannerResetKey((k) => k + 1);
  };

  const handlePhotoUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoUrl(compressed);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to process photo.');
    }
  };

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!fullName.trim() || !phone.trim() || !address.trim() || !idDocumentNumber.trim()) {
      pushToast('error', 'Please complete all required identity and contact fields.');
      return;
    }

    if (dupCheck?.isDuplicate && !allowDuplicateOverride) {
      pushToast(
        'error',
        `Duplicate ID number detected (${dupCheck.existingSubjectCode}). Review or enable Admin override.`
      );
      return;
    }

    const actor = actorContext || {
      uid: profile.uid,
      fullName: profile.fullName,
      role: profile.role,
    };

    setSubmitting(true);
    try {
      if (regMode === 'STUDENT') {
        if (!selectedCourse || !selectedPlan) {
          throw new Error('Select an active training course and payment plan.');
        }
        const res = await submitAiStudentRegistration(
          {
            fullName,
            address,
            phone,
            altPhone: altPhone || undefined,
            email: email || undefined,
            dateOfBirth: dateOfBirth || undefined,
            gender,
            nationality: nationality || undefined,
            idDocumentType,
            idDocumentNumber,
            idExpiryDate: idExpiryDate || undefined,
            course: selectedCourse,
            agreedFeeEtb: feeNumeric,
            enrollmentDate,
            paymentPlan: selectedPlan,
            customInstallments: Number(customInstallments) || 3,
            customIntervalDays: Number(customIntervalDays) || 30,
            initialPaymentAmount: initPayNumeric > 0 ? initPayNumeric : undefined,
            initialPaymentMethod,
            initialTransactionRef: initPayNumeric > 0 ? initialTransactionRef : undefined,
            photoUrl: photoUrl || undefined,
            frontDocumentDataUrl: frontDocUrl,
            backDocumentDataUrl: backDocUrl,
            fileMimeType: frontDocMime,
            ocrConfidence,
            ocrWarnings,
            ocrSummary,
            allowDuplicateOverride: isAdmin && allowDuplicateOverride,
          },
          students.length,
          actor
        );

        setLastSuccessBanner({
          code: res.studentCode,
          name: fullName.trim(),
          kind: 'STUDENT',
        });
        pushToast(
          'success',
          `Student registered (${res.studentCode}) with encrypted ID vault record. Pending Admin approval.`
        );
        resetForm();
      } else {
        if (!email.trim() || !dateOfBirth.trim() || !nationality.trim()) {
          throw new Error('Staff registration requires email, date of birth, and nationality.');
        }
        const res = await submitAiStaffRegistration(
          {
            fullName,
            address,
            phone,
            email,
            dateOfBirth,
            nationality,
            gender,
            idDocumentType,
            idDocumentNumber,
            idExpiryDate: idExpiryDate || undefined,
            department,
            jobPosition,
            portalRole,
            employmentStartDate,
            salaryEtb: isAdmin && salaryEtb.trim() !== '' ? Number(salaryEtb) : undefined,
            payFrequency: isAdmin ? payFrequency : undefined,
            compensationNotes: isAdmin ? compensationNotes : undefined,
            photoUrl: photoUrl || undefined,
            frontDocumentDataUrl: frontDocUrl,
            backDocumentDataUrl: backDocUrl,
            fileMimeType: frontDocMime,
            ocrConfidence,
            ocrWarnings,
            ocrSummary,
            allowDuplicateOverride: isAdmin && allowDuplicateOverride,
          },
          staffRecords.length,
          actor
        );

        setLastSuccessBanner({
          code: res.staffCode,
          name: fullName.trim(),
          kind: 'STAFF',
        });
        pushToast(
          'success',
          `Staff member registered (${res.staffCode}) with encrypted ID vault record. Pending Admin approval.`
        );
        resetForm();
      }
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Registration submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Search & status filtering across Student + Staff registrations
  const qLower = searchQuery.trim().toLowerCase();
  const matchesStudentSearch = useCallback(
    (s: Student) => {
      if (!qLower) return true;
      return (
        s.fullName.toLowerCase().includes(qLower) ||
        s.studentCode.toLowerCase().includes(qLower) ||
        s.phone.toLowerCase().includes(qLower) ||
        (s.idNumberMasked || '').toLowerCase().includes(qLower) ||
        s.courseName.toLowerCase().includes(qLower)
      );
    },
    [qLower]
  );

  const matchesStaffSearch = useCallback(
    (st: StaffRecord) => {
      if (!qLower) return true;
      return (
        st.fullName.toLowerCase().includes(qLower) ||
        st.staffCode.toLowerCase().includes(qLower) ||
        st.phone.toLowerCase().includes(qLower) ||
        st.email.toLowerCase().includes(qLower) ||
        st.department.toLowerCase().includes(qLower) ||
        st.jobPosition.toLowerCase().includes(qLower) ||
        (st.idNumberMasked || '').toLowerCase().includes(qLower)
      );
    },
    [qLower]
  );

  const compByStaffId = useMemo(
    () => new Map(staffCompensations.map((c) => [c.staffId, c])),
    [staffCompensations]
  );

  const pendingStudents = useMemo(
    () => students.filter((s) => s.registrationStatus === 'PENDING' && matchesStudentSearch(s)),
    [students, matchesStudentSearch]
  );
  const pendingStaff = useMemo(
    () => staffRecords.filter((s) => s.registrationStatus === 'PENDING' && matchesStaffSearch(s)),
    [staffRecords, matchesStaffSearch]
  );
  const approvedStudents = useMemo(
    () => students.filter((s) => s.registrationStatus === 'APPROVED' && matchesStudentSearch(s)),
    [students, matchesStudentSearch]
  );
  const approvedStaff = useMemo(
    () => staffRecords.filter((s) => s.registrationStatus === 'APPROVED' && matchesStaffSearch(s)),
    [staffRecords, matchesStaffSearch]
  );
  const rejectedStudents = useMemo(
    () => students.filter((s) => s.registrationStatus === 'REJECTED' && matchesStudentSearch(s)),
    [students, matchesStudentSearch]
  );
  const rejectedStaff = useMemo(
    () => staffRecords.filter((s) => s.registrationStatus === 'REJECTED' && matchesStaffSearch(s)),
    [staffRecords, matchesStaffSearch]
  );

  const filteredAllStudents = useMemo(
    () => students.filter(matchesStudentSearch),
    [students, matchesStudentSearch]
  );
  const filteredAllStaff = useMemo(
    () => staffRecords.filter(matchesStaffSearch),
    [staffRecords, matchesStaffSearch]
  );
  const filteredVaultDocs = useMemo(() => {
    if (!qLower) return identityDocuments;
    return identityDocuments.filter(
      (d) =>
        d.subjectName.toLowerCase().includes(qLower) ||
        d.subjectCode.toLowerCase().includes(qLower) ||
        d.idNumberMasked.toLowerCase().includes(qLower) ||
        ID_DOCUMENT_LABELS[d.documentType].toLowerCase().includes(qLower)
    );
  }, [identityDocuments, qLower]);

  const totalPendingCount =
    students.filter((s) => s.registrationStatus === 'PENDING').length +
    staffRecords.filter((s) => s.registrationStatus === 'PENDING').length;

  const totalVaultPendingCount = identityDocuments.filter(
    (d) => d.verificationStatus === 'PENDING_REVIEW' || d.verificationStatus === 'FLAGGED'
  ).length;

  const handleConfirmDecision = async (reason?: string) => {
    if (!confirmDecision || !profile) return;
    setDecisionBusy(true);
    const actor = actorContext || {
      uid: profile.uid,
      fullName: profile.fullName,
      role: profile.role,
    };
    try {
      if (confirmDecision.kind === 'STUDENT' && confirmDecision.student) {
        const stu = confirmDecision.student;
        const enr = enrollments.find((e) => e.studentId === stu.id);
        if (confirmDecision.action === 'approve') {
          await approveStudentRegistration(stu, enr, actor);
          // Also mark vault ID as verified if attached
          if (stu.idVaultRefId) {
            const vDoc = identityDocuments.find((d) => d.id === stu.idVaultRefId);
            if (vDoc && vDoc.verificationStatus !== 'VERIFIED') {
              await updateIdVerificationDecision(vDoc, 'VERIFIED', 'Verified alongside student registration approval.', actor);
            }
          }
          pushToast('success', `Approved student ${stu.fullName} (${stu.studentCode}).`);
        } else {
          await rejectStudentRegistration(stu, enr, reason || '', actor);
          pushToast('info', `Rejected student registration for ${stu.fullName}.`);
        }
      } else if (confirmDecision.kind === 'STAFF' && confirmDecision.staff) {
        const stf = confirmDecision.staff;
        if (confirmDecision.action === 'approve') {
          await approveStaffRegistration(stf, actor);
          pushToast('success', `Approved staff ${stf.fullName} (${stf.staffCode}) and provisioned ${stf.portalRole} role.`);
        } else {
          await rejectStaffRegistration(stf, reason || '', actor);
          pushToast('info', `Rejected staff registration for ${stf.fullName}.`);
        }
      }
      setConfirmDecision(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to complete action.');
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleExportExcel = async () => {
    if (!profile || !canExport) return;
    try {
      await exportRegistrationsReport(
        {
          students: filteredAllStudents,
          staffRecords: filteredAllStaff,
          compensations: isAdmin ? staffCompensations : [],
          includeSalary: isAdmin,
        },
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        }
      );
      pushToast('success', 'Exported Student & Staff Registrations workbook (.xlsx).');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const tabs: Array<{ id: SubTab; label: string; count?: number; adminOnly?: boolean }> = [
    { id: 'register', label: 'AI Scan & Register' },
    { id: 'bulk_import', label: 'Bulk Excel Import' },
    { id: 'students', label: 'Student Registrations', count: students.length },
    { id: 'staff', label: 'Staff Registrations', count: staffRecords.length },
    { id: 'pending', label: 'Pending Approvals', count: totalPendingCount },
    {
      id: 'approved',
      label: 'Approved',
      count:
        students.filter((s) => s.registrationStatus === 'APPROVED').length +
        staffRecords.filter((s) => s.registrationStatus === 'APPROVED').length,
    },
    {
      id: 'rejected',
      label: 'Rejected',
      count:
        students.filter((s) => s.registrationStatus === 'REJECTED').length +
        staffRecords.filter((s) => s.registrationStatus === 'REJECTED').length,
    },
    {
      id: 'id_vault',
      label: 'ID Verification Vault',
      count: totalVaultPendingCount,
      adminOnly: true,
    },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            AI Student &amp; Staff Registration Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Scan Fayda ID, National ID, Passport, or Driving Licence with Gemini OCR, auto-populate forms, issue atomic institutional IDs (<span className="font-mono text-slate-700">ZAC-STU-XXXX</span> / <span className="font-mono text-slate-700">ZAC-STA-XXXX</span>), and verify identity documents in the encrypted Admin vault.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canExport && (
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              Export Registrations (.xlsx)
            </button>
          )}
          <button
            type="button"
            onClick={() => setSubTab('bulk_import')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            Bulk Excel Import
          </button>
          <button
            type="button"
            onClick={() => setQrScannerOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#172DEB] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Scan QR ID Code
          </button>
          <button
            type="button"
            onClick={() => setSubTab('register')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg transition-colors"
          >
            <ScanLine className="w-4 h-4" />
            New AI Scan Registration
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Total Student Records</p>
          <p className="text-2xl font-display font-bold text-slate-900 mt-1 tabular-nums">
            {students.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {students.filter((s) => s.registrationStatus === 'APPROVED').length} approved ·{' '}
            {students.filter((s) => s.registrationStatus === 'PENDING').length} pending
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Registered Staff Directory</p>
          <p className="text-2xl font-display font-bold text-slate-900 mt-1 tabular-nums">
            {staffRecords.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {staffRecords.filter((s) => s.registrationStatus === 'APPROVED').length} active ·{' '}
            {staffRecords.filter((s) => s.registrationStatus === 'PENDING').length} pending
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Awaiting Admin Approval</p>
          <p className="text-2xl font-display font-bold text-[#E51B23] mt-1 tabular-nums">
            {totalPendingCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Human verification strictly enforced
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">
            {isAdmin ? 'Encrypted ID Vault Records' : 'Active ZACMA Courses'}
          </p>
          <p className="text-2xl font-display font-bold text-[#172DEB] mt-1 tabular-nums">
            {isAdmin ? identityDocuments.length : activeCourses.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {isAdmin
              ? `${totalVaultPendingCount} awaiting ID verification · AES-256-GCM`
              : `${activeCourses.length} dynamic courses open`}
          </p>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {visibleTabs.map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#172DEB] text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active
                        ? 'text-blue-100'
                        : tab.id === 'pending' || tab.id === 'id_vault'
                        ? 'text-[#E51B23] font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {subTab !== 'register' && subTab !== 'bulk_import' && (
          <div className="relative min-w-[230px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, ID, ZAC-STU / ZAC-STA..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#172DEB]"
            />
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* TAB 1B: BULK STUDENT EXCEL REGISTRATION IMPORT                    */}
      {/* ================================================================= */}
      {subTab === 'bulk_import' && (
        <BulkStudentImportPanel onOpenPendingApprovals={() => setSubTab('pending')} />
      )}

      {/* ================================================================= */}
      {/* TAB 1: AI SCAN & REGISTER (STUDENT OR STAFF)                      */}
      {/* ================================================================= */}
      {subTab === 'register' && (
        <div className="space-y-6">
          {/* Registration Mode Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRegMode('STUDENT');
                  setLastSuccessBanner(null);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg border transition-colors ${
                  regMode === 'STUDENT'
                    ? 'bg-[#172DEB] text-white border-[#172DEB]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <GraduationCap className="w-4 h-4" />
                Student Registration (ZAC-STU-XXXX)
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegMode('STAFF');
                  setLastSuccessBanner(null);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg border transition-colors ${
                  regMode === 'STAFF'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Staff Registration (ZAC-STA-XXXX)
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setQrScannerOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#172DEB] bg-[#F5F7FC] hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
              >
                <QrCode className="w-4 h-4" />
                Quick Scan Student / Staff QR ID
              </button>
            </div>
          </div>

          {lastQrLoadedNotice && (
            <div className="rounded-xl border border-blue-200 bg-[#F5F7FC] px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-slate-800">
                <QrCode className="w-4 h-4 text-[#172DEB] shrink-0" />
                <span className="font-medium">{lastQrLoadedNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setLastQrLoadedNotice(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Dismiss QR notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {lastSuccessBanner && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                <div className="text-xs text-emerald-950">
                  <p className="font-bold">
                    {lastSuccessBanner.kind === 'STUDENT' ? 'Student' : 'Staff'} Registration Recorded:{' '}
                    <span className="font-mono">{lastSuccessBanner.code}</span>
                  </p>
                  <p className="text-emerald-800 mt-0.5">
                    {lastSuccessBanner.name} has been queued for Admin ID verification and approval.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('pending')}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100"
              >
                View Pending Approvals
              </button>
            </div>
          )}

          {/* Step 1: Reusable AI ID Scanner */}
          <IdDocumentScanner
            key={scannerResetKey}
            registrationType={regMode}
            onApplyExtraction={handleApplyScan}
            onDocumentsChanged={handleDocumentsChanged}
          />

          {/* Step 2: Editable Registration Form */}
          <form
            onSubmit={(e) => void handleSubmitRegistration(e)}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900">
                  {regMode === 'STUDENT'
                    ? 'Step 2 — Verify & Complete Student Registration Form'
                    : 'Step 2 — Verify & Complete Staff Registration Form'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All OCR-extracted fields remain fully editable. Review highlighted or uncertain details carefully.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-[#172DEB]">
                Next Code: {regMode === 'STUDENT' ? 'ZAC-STU-AUTO' : 'ZAC-STA-AUTO'}
              </span>
            </div>

            <div className="p-5 space-y-6">
              {/* Section A: Applicant Photo & Core Identity */}
              <div className="flex flex-col sm:flex-row items-start gap-5 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-4 shrink-0">
                  <Avatar name={fullName || (regMode === 'STUDENT' ? 'Student' : 'Staff')} src={photoUrl || undefined} size="lg" />
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-800">Profile Photograph</p>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{photoUrl ? 'Replace Photo' : 'Upload Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          void handlePhotoUpload(e.target.files?.[0] || null);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Auto-cropped from ID when detected
                    </p>
                  </div>
                </div>

                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Legal Name <span className="text-[#E51B23]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="As printed on ID document"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#172DEB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number <span className="text-[#E51B23]">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+251 9XX XXX XXX"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-[#172DEB]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address {regMode === 'STAFF' ? <span className="text-[#E51B23]">*</span> : <span className="text-slate-400 font-normal">(Optional)</span>}
                    </label>
                    <input
                      type="email"
                      required={regMode === 'STAFF'}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#172DEB]"
                    />
                  </div>
                </div>
              </div>

              {/* Section B: Demographics & Residential Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date of Birth {regMode === 'STAFF' && <span className="text-[#E51B23]">*</span>}
                  </label>
                  <input
                    type="date"
                    required={regMode === 'STAFF'}
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gender <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Unspecified')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                  >
                    <option value="Unspecified">Prefer not to specify</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nationality {regMode === 'STAFF' && <span className="text-[#E51B23]">*</span>}
                  </label>
                  <input
                    type="text"
                    required={regMode === 'STAFF'}
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    placeholder="e.g. Ethiopian"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  />
                </div>

                {regMode === 'STUDENT' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Alternate / Guardian Phone
                    </label>
                    <input
                      type="tel"
                      value={altPhone}
                      onChange={(e) => setAltPhone(e.target.value)}
                      placeholder="+251 9XX XXX XXX"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-[#172DEB]"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ID Attachment Status
                    </label>
                    <div className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-medium">
                      {frontDocUrl ? 'Encrypted Front Ready' : 'No scan attached yet'}
                      {backDocUrl ? ' + Back' : ''}
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Residential Address <span className="text-[#E51B23]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Region, City, Sub-City, Woreda / Kebele"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#172DEB]"
                  />
                </div>
              </div>

              {/* Section C: Identification Document Details & Duplicate / Expiry Validation */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#172DEB]" />
                    Identification Document Details (Encrypted at Rest in Admin Vault)
                  </p>
                  {checkingDup && (
                    <span className="text-[11px] text-slate-500">Checking duplicate ID registry...</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Document Type <span className="text-[#E51B23]">*</span>
                    </label>
                    <select
                      value={idDocumentType}
                      onChange={(e) => setIdDocumentType(e.target.value as IdDocumentType)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                    >
                      {ID_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {ID_DOCUMENT_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ID / Passport / Licence Number <span className="text-[#E51B23]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={idDocumentNumber}
                      onChange={(e) => setIdDocumentNumber(e.target.value)}
                      placeholder="Fayda FAN/FIN, Passport or Licence No."
                      className={`w-full px-3 py-2 text-sm border rounded-lg font-mono focus:outline-none ${
                        dupCheck?.isDuplicate
                          ? 'border-[#E51B23] bg-red-50/40 focus:border-[#E51B23]'
                          : 'border-slate-300 bg-white focus:border-[#172DEB]'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Document Expiry Date <span className="text-slate-400 font-normal">(If applicable)</span>
                    </label>
                    <input
                      type="date"
                      value={idExpiryDate}
                      onChange={(e) => setIdExpiryDate(e.target.value)}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none ${
                        isIdExpired
                          ? 'border-amber-500 bg-amber-50/40'
                          : 'border-slate-300 bg-white focus:border-[#172DEB]'
                      }`}
                    />
                  </div>
                </div>

                {/* Duplicate ID Alert */}
                {dupCheck?.isDuplicate && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-xs text-red-800">
                      <ShieldAlert className="w-4 h-4 text-[#E51B23] shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Duplicate Identification Number Detected</p>
                        <p className="mt-0.5">
                          This document number is already registered to{' '}
                          <strong>{dupCheck.existingSubjectName}</strong> (
                          <span className="font-mono">{dupCheck.existingSubjectCode}</span> ·{' '}
                          {dupCheck.existingSubjectType}).
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-red-900 pl-6 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowDuplicateOverride}
                          onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                          className="rounded border-red-300 text-[#E51B23]"
                        />
                        Admin Override: Allow secondary course/role registration with this ID
                      </label>
                    )}
                  </div>
                )}

                {/* Expired ID Alert */}
                {isIdExpired && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>Document Expired ({idExpiryDate}):</strong> Please request a renewed ID or verify physically before Admin approval.
                    </span>
                  </div>
                )}
              </div>

              {/* Section D: Mode-Specific Fields (Student Course & Fees vs Staff HR & Salary) */}
              {regMode === 'STUDENT' ? (
                <div className="space-y-5 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Course Enrollment &amp; Tuition Fee Configuration
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Training Course ({activeCourses.length} Active ZACMA Courses) <span className="text-[#E51B23]">*</span>
                      </label>
                      <select
                        required
                        value={courseId}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setCourseId(nextId);
                          const found = activeCourses.find((c) => c.id === nextId);
                          if (found) setAgreedFeeEtb(String(found.feeEtb));
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                      >
                        {activeCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.code}) — {formatEtb(c.feeEtb)} · {c.durationWeeks} wks
                          </option>
                        ))}
                      </select>
                      {selectedCourse && (
                        <p className="text-[11px] text-slate-500 mt-1">
                          Category: {selectedCourse.category} · Schedule: {selectedCourse.schedule}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Total Course Fee (ETB) <span className="text-[#E51B23]">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        step="0.01"
                        value={agreedFeeEtb}
                        onChange={(e) => setAgreedFeeEtb(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-[#172DEB]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DualCalendarDatePicker
                      label="Registration Date (Gregorian & Ethiopian Calendar)"
                      value={enrollmentDate}
                      onChange={setEnrollmentDate}
                      required
                    />

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Payment Plan <span className="text-[#E51B23]">*</span>
                        </label>
                        <select
                          value={planCode}
                          onChange={(e) => setPlanCode(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                        >
                          {paymentPlans.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name} ({p.installmentCount} installment{p.installmentCount > 1 ? 's' : ''})
                            </option>
                          ))}
                        </select>
                      </div>

                      {planCode === 'CUSTOM' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Installments (1-12)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={12}
                              value={customInstallments}
                              onChange={(e) => setCustomInstallments(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Interval (Days)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={customIntervalDays}
                              onChange={(e) => setCustomIntervalDays(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Initial Payment & Live Balance Summary */}
                  <div className="rounded-xl border border-slate-200 bg-[#F5F7FC] p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Initial Payment Amount (ETB)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={feeNumeric || undefined}
                          step="0.01"
                          value={initialPaymentAmount}
                          onChange={(e) => setInitialPaymentAmount(e.target.value)}
                          placeholder="0.00 (Optional)"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:border-[#172DEB]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Payment Method
                        </label>
                        <select
                          value={initialPaymentMethod}
                          onChange={(e) => setInitialPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Transaction Reference {initPayNumeric > 0 && <span className="text-[#E51B23]">*</span>}
                        </label>
                        <input
                          type="text"
                          required={initPayNumeric > 0}
                          value={initialTransactionRef}
                          onChange={(e) => setInitialTransactionRef(e.target.value)}
                          placeholder="e.g. CBE-2026-8821"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200/80 text-xs">
                      <div>
                        <span className="text-slate-500">Total Course Fee</span>
                        <p className="font-mono font-bold text-slate-900 text-sm tabular-nums mt-0.5">
                          {formatEtb(feeNumeric)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Remaining Balance (After Initial)</span>
                        <p className="font-mono font-bold text-[#172DEB] text-sm tabular-nums mt-0.5">
                          {formatEtb(projectedBalance)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Projected Payment Status</span>
                        <p className="font-semibold text-slate-900 mt-0.5">{projectedStatus}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Staff Employment, Role & Admin-Only Salary */
                <div className="space-y-5 pt-2 border-t border-slate-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Employment Details, Role Assignment &amp; Compensation
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Job Position <span className="text-[#E51B23]">*</span>
                      </label>
                      <select
                        value={jobPosition}
                        onChange={(e) => {
                          const pos = e.target.value;
                          setJobPosition(pos);
                          setPortalRole(inferPortalRoleFromPosition(pos));
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                      >
                        {STAFF_JOB_POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Department <span className="text-[#E51B23]">*</span>
                      </label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                      >
                        {STAFF_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Portal Access Role <span className="text-[#E51B23]">*</span>
                      </label>
                      <select
                        value={portalRole}
                        onChange={(e) =>
                          setPortalRole(e.target.value as Exclude<RoleCode, 'STUDENT'>)
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#172DEB]"
                      >
                        {isAdmin && <option value="ADMIN">Administrator (Full Access)</option>}
                        <option value="ACCOUNTANT">Accountant (Finance &amp; Registration)</option>
                        <option value="INSTRUCTOR">Instructor (Academic &amp; Attendance)</option>
                        <option value="GENERAL_STAFF">General Staff (Scoped Modules)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DualCalendarDatePicker
                      label="Employment Start Date (Gregorian & Ethiopian Calendar)"
                      value={employmentStartDate}
                      onChange={setEmploymentStartDate}
                      required
                    />

                    {isAdmin ? (
                      <div className="rounded-xl border border-slate-200 bg-[#F5F7FC] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-[#172DEB]" />
                            Staff Compensation (Admin-Only Isolated Collection)
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Gross Salary (ETB)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={salaryEtb}
                              onChange={(e) => setSalaryEtb(e.target.value)}
                              placeholder="e.g. 25000"
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Pay Frequency
                            </label>
                            <select
                              value={payFrequency}
                              onChange={(e) =>
                                setPayFrequency(
                                  e.target.value as 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT'
                                )
                              }
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                            >
                              <option value="MONTHLY">Monthly</option>
                              <option value="BIWEEKLY">Bi-Weekly</option>
                              <option value="CONTRACT">Contract / Per Course</option>
                            </select>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={compensationNotes}
                          onChange={(e) => setCompensationNotes(e.target.value)}
                          placeholder="Optional allowance or contract notes..."
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-2.5 text-xs text-slate-600">
                        <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-800">Salary Access Restricted</p>
                          <p className="mt-1">
                            Compensation details are stored in an isolated Admin-only collection and will be entered by an Administrator during approval.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Submit Bar */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Submitting stores ID scans encrypted with AES-256-GCM and routes the registration to Admin Approval.
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg"
                  >
                    Reset Form
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || (Boolean(dupCheck?.isDuplicate) && !allowDuplicateOverride)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {submitting
                        ? 'Encrypting & Submitting...'
                        : regMode === 'STUDENT'
                        ? 'Submit Student Registration'
                        : 'Submit Staff Registration'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: STUDENT REGISTRATIONS                                      */}
      {/* ================================================================= */}
      {subTab === 'students' && (
        <StudentRegistrationTable
          rows={filteredAllStudents}
          isAdmin={isAdmin}
          onApprove={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'approve', student: stu })}
          onReject={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'reject', student: stu })}
          onEditOcr={(stu) =>
            setEditingOcrTarget({
              kind: 'STUDENT',
              id: stu.id,
              code: stu.studentCode,
              fullName: stu.fullName,
              phone: stu.phone,
              address: stu.address,
              email: stu.email || '',
              dateOfBirth: stu.dateOfBirth || '',
              nationality: stu.nationality || '',
              gender: stu.gender,
              idExpiryDate: stu.idExpiryDate || '',
              idVaultRefId: stu.idVaultRefId,
            })
          }
          onInspectVault={(vaultId) => {
            const docRec = identityDocuments.find((d) => d.id === vaultId);
            if (docRec) setInspectingVaultDoc(docRec);
          }}
          onShowQrBadge={(stu) => setQrBadgeSubject({ kind: 'STUDENT', student: stu })}
        />
      )}

      {/* ================================================================= */}
      {/* TAB 3: STAFF REGISTRATIONS                                        */}
      {/* ================================================================= */}
      {subTab === 'staff' && (
        <StaffRegistrationTable
          rows={filteredAllStaff}
          compByStaffId={compByStaffId}
          isAdmin={isAdmin}
          onApprove={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'approve', staff: stf })}
          onReject={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'reject', staff: stf })}
          onEditOcr={(stf) =>
            setEditingOcrTarget({
              kind: 'STAFF',
              id: stf.id,
              code: stf.staffCode,
              fullName: stf.fullName,
              phone: stf.phone,
              address: stf.address,
              email: stf.email,
              dateOfBirth: stf.dateOfBirth,
              nationality: stf.nationality,
              gender: stf.gender || 'Unspecified',
              idExpiryDate: stf.idExpiryDate || '',
              idVaultRefId: stf.idVaultRefId,
            })
          }
          onEditSalary={(stf) => setEditingSalaryStaff(stf)}
          onInspectVault={(vaultId) => {
            const docRec = identityDocuments.find((d) => d.id === vaultId);
            if (docRec) setInspectingVaultDoc(docRec);
          }}
          onShowQrBadge={(stf) => setQrBadgeSubject({ kind: 'STAFF', staff: stf })}
        />
      )}

      {/* ================================================================= */}
      {/* TAB 4: PENDING APPROVALS (STUDENTS + STAFF)                       */}
      {/* ================================================================= */}
      {subTab === 'pending' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#172DEB]" />
              Pending Student Registrations ({pendingStudents.length})
            </h2>
            <StudentRegistrationTable
              rows={pendingStudents}
              isAdmin={isAdmin}
              emptyMessage="No student registrations awaiting approval."
              onApprove={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'approve', student: stu })}
              onReject={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'reject', student: stu })}
              onEditOcr={(stu) =>
                setEditingOcrTarget({
                  kind: 'STUDENT',
                  id: stu.id,
                  code: stu.studentCode,
                  fullName: stu.fullName,
                  phone: stu.phone,
                  address: stu.address,
                  email: stu.email || '',
                  dateOfBirth: stu.dateOfBirth || '',
                  nationality: stu.nationality || '',
                  gender: stu.gender,
                  idExpiryDate: stu.idExpiryDate || '',
                  idVaultRefId: stu.idVaultRefId,
                })
              }
              onInspectVault={(vaultId) => {
                const docRec = identityDocuments.find((d) => d.id === vaultId);
                if (docRec) setInspectingVaultDoc(docRec);
              }}
              onShowQrBadge={(stu) => setQrBadgeSubject({ kind: 'STUDENT', student: stu })}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-700" />
              Pending Staff Registrations ({pendingStaff.length})
            </h2>
            <StaffRegistrationTable
              rows={pendingStaff}
              compByStaffId={compByStaffId}
              isAdmin={isAdmin}
              emptyMessage="No staff registrations awaiting approval."
              onApprove={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'approve', staff: stf })}
              onReject={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'reject', staff: stf })}
              onEditOcr={(stf) =>
                setEditingOcrTarget({
                  kind: 'STAFF',
                  id: stf.id,
                  code: stf.staffCode,
                  fullName: stf.fullName,
                  phone: stf.phone,
                  address: stf.address,
                  email: stf.email,
                  dateOfBirth: stf.dateOfBirth,
                  nationality: stf.nationality,
                  gender: stf.gender || 'Unspecified',
                  idExpiryDate: stf.idExpiryDate || '',
                  idVaultRefId: stf.idVaultRefId,
                })
              }
              onEditSalary={(stf) => setEditingSalaryStaff(stf)}
              onInspectVault={(vaultId) => {
                const docRec = identityDocuments.find((d) => d.id === vaultId);
                if (docRec) setInspectingVaultDoc(docRec);
              }}
              onShowQrBadge={(stf) => setQrBadgeSubject({ kind: 'STAFF', staff: stf })}
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 5: APPROVED REGISTRATIONS                                     */}
      {/* ================================================================= */}
      {subTab === 'approved' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900">
              Approved Student Registrations ({approvedStudents.length})
            </h2>
            <StudentRegistrationTable
              rows={approvedStudents}
              isAdmin={isAdmin}
              emptyMessage="No approved student registrations match your search."
              onApprove={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'approve', student: stu })}
              onReject={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'reject', student: stu })}
              onEditOcr={(stu) =>
                setEditingOcrTarget({
                  kind: 'STUDENT',
                  id: stu.id,
                  code: stu.studentCode,
                  fullName: stu.fullName,
                  phone: stu.phone,
                  address: stu.address,
                  email: stu.email || '',
                  dateOfBirth: stu.dateOfBirth || '',
                  nationality: stu.nationality || '',
                  gender: stu.gender,
                  idExpiryDate: stu.idExpiryDate || '',
                  idVaultRefId: stu.idVaultRefId,
                })
              }
              onInspectVault={(vaultId) => {
                const docRec = identityDocuments.find((d) => d.id === vaultId);
                if (docRec) setInspectingVaultDoc(docRec);
              }}
              onShowQrBadge={(stu) => setQrBadgeSubject({ kind: 'STUDENT', student: stu })}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900">
              Approved Staff Registrations ({approvedStaff.length})
            </h2>
            <StaffRegistrationTable
              rows={approvedStaff}
              compByStaffId={compByStaffId}
              isAdmin={isAdmin}
              emptyMessage="No approved staff registrations match your search."
              onApprove={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'approve', staff: stf })}
              onReject={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'reject', staff: stf })}
              onEditOcr={(stf) =>
                setEditingOcrTarget({
                  kind: 'STAFF',
                  id: stf.id,
                  code: stf.staffCode,
                  fullName: stf.fullName,
                  phone: stf.phone,
                  address: stf.address,
                  email: stf.email,
                  dateOfBirth: stf.dateOfBirth,
                  nationality: stf.nationality,
                  gender: stf.gender || 'Unspecified',
                  idExpiryDate: stf.idExpiryDate || '',
                  idVaultRefId: stf.idVaultRefId,
                })
              }
              onEditSalary={(stf) => setEditingSalaryStaff(stf)}
              onInspectVault={(vaultId) => {
                const docRec = identityDocuments.find((d) => d.id === vaultId);
                if (docRec) setInspectingVaultDoc(docRec);
              }}
              onShowQrBadge={(stf) => setQrBadgeSubject({ kind: 'STAFF', staff: stf })}
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 6: REJECTED REGISTRATIONS                                     */}
      {/* ================================================================= */}
      {subTab === 'rejected' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900">
              Rejected Student Registrations ({rejectedStudents.length})
            </h2>
            <StudentRegistrationTable
              rows={rejectedStudents}
              isAdmin={isAdmin}
              emptyMessage="No rejected student registrations."
              onApprove={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'approve', student: stu })}
              onReject={(stu) => setConfirmDecision({ kind: 'STUDENT', action: 'reject', student: stu })}
              onEditOcr={(stu) =>
                setEditingOcrTarget({
                  kind: 'STUDENT',
                  id: stu.id,
                  code: stu.studentCode,
                  fullName: stu.fullName,
                  phone: stu.phone,
                  address: stu.address,
                  email: stu.email || '',
                  dateOfBirth: stu.dateOfBirth || '',
                  nationality: stu.nationality || '',
                  gender: stu.gender,
                  idExpiryDate: stu.idExpiryDate || '',
                  idVaultRefId: stu.idVaultRefId,
                })
              }
              onInspectVault={(vaultId) => {
                const docRec = identityDocuments.find((d) => d.id === vaultId);
                if (docRec) setInspectingVaultDoc(docRec);
              }}
              onShowQrBadge={(stu) => setQrBadgeSubject({ kind: 'STUDENT', student: stu })}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-display font-bold text-slate-900">
              Rejected Staff Registrations ({rejectedStaff.length})
            </h2>
            <StaffRegistrationTable
              rows={rejectedStaff}
              compByStaffId={compByStaffId}
              isAdmin={isAdmin}
              emptyMessage="No rejected staff registrations."
              onApprove={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'approve', staff: stf })}
              onReject={(stf) => setConfirmDecision({ kind: 'STAFF', action: 'reject', staff: stf })}
              onEditOcr={(stf) =>
                setEditingOcrTarget({
                  kind: 'STAFF',
                  id: stf.id,
                  code: stf.staffCode,
                  fullName: stf.fullName,
                  phone: stf.phone,
                  address: stf.address,
                  email: stf.email,
                  dateOfBirth: stf.dateOfBirth,
                  nationality: stf.nationality,
                  gender: stf.gender || 'Unspecified',
                  idExpiryDate: stf.idExpiryDate || '',
                  idVaultRefId: stf.idVaultRefId,
                })
              }
              onEditSalary={(stf) => setEditingSalaryStaff(stf)}
              onInspectVault={(vaultId) => {
                const docRec = identityDocuments.find((d) => d.id === vaultId);
                if (docRec) setInspectingVaultDoc(docRec);
              }}
              onShowQrBadge={(stf) => setQrBadgeSubject({ kind: 'STAFF', staff: stf })}
            />
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 7: ADMIN-ONLY ENCRYPTED ID DOCUMENT VERIFICATION & VAULT      */}
      {/* ================================================================= */}
      {subTab === 'id_vault' && isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#172DEB]" />
                Encrypted Identity Document Verification Vault (Admin Only)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every decryption, verification decision, image redaction, or deletion is recorded in the immutable audit log.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">AES-GCM-256 · Zero Public URLs</span>
          </div>

          {filteredVaultDocs.length === 0 ? (
            <EmptyState
              title="No encrypted identity documents found"
              description="Identity scans uploaded via AI Registration appear here for Admin inspection, verification, and retention lifecycle management."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Applicant</th>
                    <th className="px-4 py-3">Document Type &amp; Masked ID</th>
                    <th className="px-4 py-3">OCR &amp; Expiry</th>
                    <th className="px-4 py-3">Verification Status</th>
                    <th className="px-4 py-3">Retention Schedule</th>
                    <th className="px-4 py-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredVaultDocs.map((docRec) => {
                    const expired = Boolean(
                      docRec.documentExpiryDate && docRec.documentExpiryDate < todayIsoDate()
                    );
                    return (
                      <tr key={docRec.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{docRec.subjectName}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {docRec.subjectCode} · {docRec.subjectType}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">
                            {ID_DOCUMENT_LABELS[docRec.documentType]}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {docRec.idNumberMasked} · {docRec.isRedacted ? 'Images Redacted' : docRec.hasFrontImage ? (docRec.hasBackImage ? 'Front + Back' : 'Front Only') : 'Metadata Only'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-700">
                            OCR: {docRec.ocrConfidence}
                            {docRec.ocrWarnings && docRec.ocrWarnings.length > 0 ? (
                              <span className="text-amber-700 ml-1">
                                ({docRec.ocrWarnings.length} alert{docRec.ocrWarnings.length > 1 ? 's' : ''})
                              </span>
                            ) : null}
                          </p>
                          <p
                            className={`text-[11px] tabular-nums ${
                              expired ? 'text-[#E51B23] font-semibold' : 'text-slate-500'
                            }`}
                          >
                            {docRec.documentExpiryDate
                              ? `Exp: ${docRec.documentExpiryDate}${expired ? ' (EXPIRED)' : ''}`
                              : 'No expiry recorded'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <VerificationStatusText status={docRec.verificationStatus} />
                          {docRec.verifiedByName && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              By {docRec.verifiedByName}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">
                          {docRec.retentionDeleteAfter || 'Not scheduled'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setInspectingVaultDoc(docRec)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#172DEB] bg-blue-50 hover:bg-blue-100 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Decrypt &amp; Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODALS: APPROVAL CONFIRM, OCR CORRECTION, SALARY, VAULT INSPECTOR */}
      {/* ================================================================= */}
      <ConfirmDialog
        open={Boolean(confirmDecision)}
        title={
          confirmDecision?.action === 'approve'
            ? `Approve ${confirmDecision.kind === 'STUDENT' ? 'Student' : 'Staff'} Registration`
            : `Reject ${confirmDecision?.kind === 'STUDENT' ? 'Student' : 'Staff'} Registration`
        }
        description={
          confirmDecision?.kind === 'STUDENT' && confirmDecision.student
            ? confirmDecision.action === 'approve'
              ? `Approve ${confirmDecision.student.fullName} (${confirmDecision.student.studentCode}) for ${confirmDecision.student.courseName}? This activates their enrollment and marks their identity record verified.`
              : `Reject registration for ${confirmDecision.student.fullName} (${confirmDecision.student.studentCode})? Provide a clear reason for the audit log.`
            : confirmDecision?.staff
            ? confirmDecision.action === 'approve'
              ? `Approve staff registration for ${confirmDecision.staff.fullName} (${confirmDecision.staff.staffCode} · ${confirmDecision.staff.jobPosition}) and provision ${confirmDecision.staff.portalRole} role?`
              : `Reject staff registration for ${confirmDecision.staff.fullName} (${confirmDecision.staff.staffCode})?`
            : ''
        }
        confirmLabel={confirmDecision?.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
        tone={confirmDecision?.action === 'approve' ? 'primary' : 'danger'}
        requireReason={confirmDecision?.action === 'reject'}
        reasonLabel="Rejection Reason"
        loading={decisionBusy}
        onClose={() => setConfirmDecision(null)}
        onConfirm={(reason) => void handleConfirmDecision(reason)}
      />

      {editingOcrTarget && profile && (
        <OcrCorrectionModal
          target={editingOcrTarget}
          onClose={() => setEditingOcrTarget(null)}
          onSave={async (updated) => {
            try {
              await correctRegistrationOcrFields(
                editingOcrTarget.kind,
                editingOcrTarget.id,
                editingOcrTarget.code,
                {
                  ...updated,
                  idVaultRefId: editingOcrTarget.idVaultRefId,
                },
                {
                  uid: profile.uid,
                  fullName: profile.fullName,
                  role: profile.role,
                }
              );
              pushToast('success', `Corrected registration fields for ${editingOcrTarget.code}.`);
              setEditingOcrTarget(null);
            } catch (err) {
              pushToast('error', err instanceof Error ? err.message : 'Unable to save corrections.');
            }
          }}
        />
      )}

      {editingSalaryStaff && isAdmin && profile && (
        <StaffSalaryModal
          staff={editingSalaryStaff}
          existing={compByStaffId.get(editingSalaryStaff.id)}
          onClose={() => setEditingSalaryStaff(null)}
          onSave={async (salary, freq, notes) => {
            try {
              await updateStaffCompensation(
                editingSalaryStaff,
                salary,
                freq,
                notes,
                {
                  uid: profile.uid,
                  fullName: profile.fullName,
                  role: profile.role,
                }
              );
              pushToast('success', `Updated isolated compensation record for ${editingSalaryStaff.fullName}.`);
              setEditingSalaryStaff(null);
            } catch (err) {
              pushToast('error', err instanceof Error ? err.message : 'Unable to save salary.');
            }
          }}
        />
      )}

      {inspectingVaultDoc && isAdmin && profile && (
        <IdVaultInspectorModal
          docRecord={inspectingVaultDoc}
          actor={{
            uid: profile.uid,
            fullName: profile.fullName,
            role: profile.role,
          }}
          onClose={() => setInspectingVaultDoc(null)}
          onToast={pushToast}
        />
      )}

      <QrIdScannerModal
        open={qrScannerOpen}
        defaultMode={regMode}
        students={students}
        staffRecords={staffRecords}
        onClose={() => setQrScannerOpen(false)}
        onApplyToForm={handleApplyQrScan}
        onJumpToExisting={handleJumpToExistingQr}
      />

      <ZacmaQrBadgeModal
        subject={qrBadgeSubject}
        onClose={() => setQrBadgeSubject(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Components (Tables & Modals)
// ---------------------------------------------------------------------------

function VerificationStatusText({ status }: { status?: string }) {
  if (status === 'VERIFIED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <ShieldCheck className="w-3.5 h-3.5" />
        Verified
      </span>
    );
  }
  if (status === 'FLAGGED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <Flag className="w-3.5 h-3.5" />
        Flagged
      </span>
    );
  }
  if (status === 'REJECTED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#E51B23]">
        <XCircle className="w-3.5 h-3.5" />
        Rejected
      </span>
    );
  }
  if (status === 'PENDING_REVIEW') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#172DEB]">
        <Clock className="w-3.5 h-3.5" />
        Pending Review
      </span>
    );
  }
  return <span className="text-xs text-slate-400">Legacy / Unscanned</span>;
}

function StudentRegistrationTable({
  rows,
  isAdmin,
  emptyMessage = 'No student registrations match your search.',
  onApprove,
  onReject,
  onEditOcr,
  onInspectVault,
  onShowQrBadge,
}: {
  rows: Student[];
  isAdmin: boolean;
  emptyMessage?: string;
  onApprove: (stu: Student) => void;
  onReject: (stu: Student) => void;
  onEditOcr: (stu: Student) => void;
  onInspectVault: (vaultId: string) => void;
  onShowQrBadge?: (stu: Student) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl">
        <EmptyState title="No student records" description={emptyMessage} />
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Student &amp; Code</th>
              <th className="px-4 py-3">ID Document</th>
              <th className="px-4 py-3">Course &amp; Fee</th>
              <th className="px-4 py-3">Registration Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {rows.map((stu) => (
              <tr key={stu.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={stu.fullName} src={stu.photoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{stu.fullName}</p>
                      <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {stu.studentCode} · {stu.phone}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {stu.idDocumentType ? (
                    <div>
                      <p className="font-medium text-slate-800">
                        {ID_DOCUMENT_LABELS[stu.idDocumentType]}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {stu.idNumberMasked || '—'} ·{' '}
                        <VerificationStatusText status={stu.idVerificationStatus} />
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-400">Manual (No ID scan)</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{stu.courseName}</p>
                  <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {formatEtb(stu.courseFeeEtb)}
                    {stu.initialPaymentEtb && stu.initialPaymentEtb > 0
                      ? ` · Init: ${formatEtb(stu.initialPaymentEtb)}`
                      : ''}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <DualDateDisplay
                    isoDate={stu.enrollmentDate}
                    ethiopianOverride={stu.registrationDateEthiopian}
                    timeEat={stu.registrationTimeEat}
                  />
                </td>
                <td className="px-4 py-3">
                  <StatusLabel status={stu.registrationStatus} />
                  {stu.rejectionReason && (
                    <p className="text-[11px] text-[#E51B23] mt-0.5 max-w-[180px] truncate">
                      {stu.rejectionReason}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    {onShowQrBadge && (
                      <button
                        type="button"
                        onClick={() => onShowQrBadge(stu)}
                        className="p-1.5 text-slate-500 hover:text-[#172DEB] hover:bg-blue-50 rounded-md"
                        title="View / Download Student QR ID Card"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && stu.idVaultRefId && (
                      <button
                        type="button"
                        onClick={() => onInspectVault(stu.idVaultRefId!)}
                        className="p-1.5 text-[#172DEB] hover:bg-blue-50 rounded-md"
                        title="Decrypt & Inspect ID Document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => onEditOcr(stu)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                        title="Correct OCR / Registration Fields"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && stu.registrationStatus === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onApprove(stu)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onReject(stu)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#E51B23] border border-red-200 hover:bg-red-50 rounded-md"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffRegistrationTable({
  rows,
  compByStaffId,
  isAdmin,
  emptyMessage = 'No staff registrations match your search.',
  onApprove,
  onReject,
  onEditOcr,
  onEditSalary,
  onInspectVault,
  onShowQrBadge,
}: {
  rows: StaffRecord[];
  compByStaffId: Map<string, { salaryEtb: number; payFrequency: string }>;
  isAdmin: boolean;
  emptyMessage?: string;
  onApprove: (stf: StaffRecord) => void;
  onReject: (stf: StaffRecord) => void;
  onEditOcr: (stf: StaffRecord) => void;
  onEditSalary: (stf: StaffRecord) => void;
  onInspectVault: (vaultId: string) => void;
  onShowQrBadge?: (stf: StaffRecord) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl">
        <EmptyState title="No staff records" description={emptyMessage} />
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Staff Member</th>
              <th className="px-4 py-3">Position &amp; Role</th>
              <th className="px-4 py-3">ID Document</th>
              <th className="px-4 py-3">Start Date</th>
              {isAdmin && <th className="px-4 py-3">Salary (Admin)</th>}
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {rows.map((stf) => {
              const comp = compByStaffId.get(stf.id);
              return (
                <tr key={stf.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={stf.fullName} src={stf.photoUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{stf.fullName}</p>
                        <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                          {stf.staffCode} · {stf.phone}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{stf.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{stf.jobPosition}</p>
                    <p className="text-[11px] text-slate-500">
                      {stf.department} · <span className="font-mono text-[#172DEB]">{stf.portalRole}</span>
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {ID_DOCUMENT_LABELS[stf.idDocumentType]}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {stf.idNumberMasked} · <VerificationStatusText status={stf.idVerificationStatus} />
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <DualDateDisplay
                      isoDate={stf.employmentStartDate}
                      ethiopianOverride={stf.employmentStartDateEthiopian}
                    />
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {comp ? (
                        <button
                          type="button"
                          onClick={() => onEditSalary(stf)}
                          className="text-left hover:underline"
                        >
                          <p className="font-mono font-bold text-slate-900 tabular-nums">
                            {formatEtb(comp.salaryEtb)}
                          </p>
                          <p className="text-[10px] text-slate-500">{comp.payFrequency}</p>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEditSalary(stf)}
                          className="text-[11px] font-semibold text-[#172DEB] hover:underline"
                        >
                          + Set Salary
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <StatusLabel status={stf.registrationStatus} />
                    {stf.rejectionReason && (
                      <p className="text-[11px] text-[#E51B23] mt-0.5 max-w-[160px] truncate">
                        {stf.rejectionReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      {onShowQrBadge && (
                        <button
                          type="button"
                          onClick={() => onShowQrBadge(stf)}
                          className="p-1.5 text-slate-500 hover:text-[#172DEB] hover:bg-blue-50 rounded-md"
                          title="View / Download Staff QR ID Card"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && stf.idVaultRefId && (
                        <button
                          type="button"
                          onClick={() => onInspectVault(stf.idVaultRefId!)}
                          className="p-1.5 text-[#172DEB] hover:bg-blue-50 rounded-md"
                          title="Decrypt & Inspect Staff ID Document"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onEditOcr(stf)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          title="Correct Staff OCR / Profile Fields"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && stf.registrationStatus === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onApprove(stf)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => onReject(stf)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#E51B23] border border-red-200 hover:bg-red-50 rounded-md"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OcrCorrectionModal({
  target,
  onClose,
  onSave,
}: {
  target: {
    kind: 'STUDENT' | 'STAFF';
    id: string;
    code: string;
    fullName: string;
    phone: string;
    address: string;
    email: string;
    dateOfBirth: string;
    nationality: string;
    gender: 'Male' | 'Female' | 'Unspecified';
    idExpiryDate: string;
  };
  onClose: () => void;
  onSave: (updates: {
    fullName: string;
    phone: string;
    address: string;
    email?: string;
    dateOfBirth?: string;
    nationality?: string;
    gender: 'Male' | 'Female' | 'Unspecified';
    idExpiryDate?: string;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(target.fullName);
  const [phone, setPhone] = useState(target.phone);
  const [address, setAddress] = useState(target.address);
  const [email, setEmail] = useState(target.email);
  const [dateOfBirth, setDateOfBirth] = useState(target.dateOfBirth);
  const [nationality, setNationality] = useState(target.nationality);
  const [gender, setGender] = useState<'Male' | 'Female' | 'Unspecified'>(target.gender);
  const [idExpiryDate, setIdExpiryDate] = useState(target.idExpiryDate);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({
      fullName,
      phone,
      address,
      email: email || undefined,
      dateOfBirth: dateOfBirth || undefined,
      nationality: nationality || undefined,
      gender,
      idExpiryDate: idExpiryDate || undefined,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-display font-bold text-slate-900">
              Correct OCR / Registration Details
            </h3>
            <p className="text-xs font-mono text-slate-500">
              {target.code} · {target.kind}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Unspecified')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Unspecified">Unspecified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nationality</label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ID Expiry Date</label>
              <input
                type="date"
                value={idExpiryDate}
                onChange={(e) => setIdExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Corrections & Log Audit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StaffSalaryModal({
  staff,
  existing,
  onClose,
  onSave,
}: {
  staff: StaffRecord;
  existing?: { salaryEtb: number; payFrequency: 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT'; notes?: string };
  onClose: () => void;
  onSave: (
    salaryEtb: number,
    payFrequency: 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT',
    notes: string
  ) => Promise<void>;
}) {
  const [salary, setSalary] = useState(existing ? String(existing.salaryEtb) : '');
  const [freq, setFreq] = useState<'MONTHLY' | 'BIWEEKLY' | 'CONTRACT'>(
    existing?.payFrequency || 'MONTHLY'
  );
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salary.trim() === '' || Number(salary) < 0) return;
    setSaving(true);
    await onSave(Number(salary), freq, notes);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-display font-bold text-slate-900">
              Admin-Only Staff Compensation
            </h3>
            <p className="text-xs text-slate-500">
              {staff.fullName} ({staff.staffCode} · {staff.jobPosition})
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Salary Amount (ETB)
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pay Frequency
              </label>
              <select
                value={freq}
                onChange={(e) =>
                  setFreq(e.target.value as 'MONTHLY' | 'BIWEEKLY' | 'CONTRACT')
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="BIWEEKLY">Bi-Weekly</option>
                <option value="CONTRACT">Contract</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Compensation Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Transport allowance, contract terms, tax notes..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#172DEB] hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Salary Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IdVaultInspectorModal({
  docRecord,
  actor,
  onClose,
  onToast,
}: {
  docRecord: IdentityDocumentRecord;
  actor: { uid: string; fullName: string; role: RoleCode };
  onClose: () => void;
  onToast: (tone: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [decrypted, setDecrypted] = useState<DecryptedIdVaultPayload | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(true);
  const [showFullIdNum, setShowFullIdNum] = useState(false);

  const [notes, setNotes] = useState(docRecord.verificationNotes || '');
  const [retentionDate, setRetentionDate] = useState(docRecord.retentionDeleteAfter || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setDecrypting(true);
      setDecryptError(null);
      try {
        const plain = await decryptIdVaultPayload(
          docRecord.subjectId,
          docRecord.encryptedPayload,
          docRecord.encryptionIv
        );
        if (active) {
          setDecrypted(plain);
          void logIdDocumentAccess(docRecord, actor);
        }
      } catch (err) {
        if (active) {
          setDecryptError(
            err instanceof Error
              ? err.message
              : 'Unable to decrypt stored payload.'
          );
        }
      } finally {
        if (active) setDecrypting(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [docRecord, actor]);

  const handleDecision = async (status: 'VERIFIED' | 'FLAGGED' | 'REJECTED') => {
    setBusy(true);
    try {
      await updateIdVerificationDecision(docRecord, status, notes, actor);
      onToast('success', `Marked ID document for ${docRecord.subjectName} as ${status}.`);
      onClose();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Unable to update verification status.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRetention = async () => {
    if (!retentionDate) return;
    setBusy(true);
    try {
      await updateRetentionDate(docRecord, retentionDate, actor);
      onToast('success', `Retention review date updated to ${retentionDate}.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Failed to update retention date.');
    } finally {
      setBusy(false);
    }
  };

  const handleRedactImages = async () => {
    setBusy(true);
    try {
      await redactIdentityDocumentImages(docRecord, actor);
      onToast('info', `Raw ID scan images permanently purged for ${docRecord.subjectName}.`);
      onClose();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Redaction failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteVault = async () => {
    setBusy(true);
    try {
      await deleteIdentityDocumentRecord(docRecord, actor);
      onToast('info', `Deleted ID vault record for ${docRecord.subjectName}.`);
      onClose();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-sm font-display font-bold flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-400" />
              Admin Secure ID Document Inspector — {docRecord.subjectName}
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              {docRecord.subjectCode} · {ID_DOCUMENT_LABELS[docRecord.documentType]} · Access Logged to Audit Trail
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {decrypting ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Decrypting AES-256-GCM identity payload in memory...
            </div>
          ) : decryptError ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {decryptError}
            </div>
          ) : decrypted ? (
            <>
              {/* Decrypted Metadata Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Full Document Number</span>
                    <button
                      type="button"
                      onClick={() => setShowFullIdNum((v) => !v)}
                      className="text-[#172DEB] hover:underline inline-flex items-center gap-1"
                    >
                      {showFullIdNum ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showFullIdNum ? 'Hide' : 'Reveal'}
                    </button>
                  </div>
                  <p className="font-mono font-bold text-slate-900 mt-1 tabular-nums">
                    {showFullIdNum ? decrypted.documentNumber : docRecord.idNumberMasked}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="text-slate-500">Expiry Date &amp; OCR Clarity</span>
                  <p className="font-semibold text-slate-900 mt-1 tabular-nums">
                    {docRecord.documentExpiryDate || 'N/A'} · OCR {docRecord.ocrConfidence}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="text-slate-500">Current Verification</span>
                  <div className="mt-1">
                    <VerificationStatusText status={docRecord.verificationStatus} />
                  </div>
                </div>
              </div>

              {/* Front & Back Decrypted Attachments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Front Document Scan</p>
                  {decrypted.frontDataUrl ? (
                    decrypted.frontDataUrl.startsWith('data:application/pdf') ? (
                      <div className="h-52 flex flex-col items-center justify-center bg-white rounded-lg border border-slate-200 gap-2">
                        <FileCheck2 className="w-8 h-8 text-[#172DEB]" />
                        <a
                          href={decrypted.frontDataUrl}
                          download={`${docRecord.subjectCode}_ID_Front.pdf`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#172DEB] rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Decrypted PDF
                        </a>
                      </div>
                    ) : (
                      <img
                        src={decrypted.frontDataUrl}
                        alt="Decrypted front ID document"
                        className="w-full h-52 object-contain rounded-lg bg-white border border-slate-200"
                      />
                    )
                  ) : (
                    <div className="h-52 flex items-center justify-center bg-white rounded-lg border border-slate-200 text-xs text-slate-400">
                      {docRecord.isRedacted
                        ? 'Image permanently redacted per retention policy'
                        : 'No front scan attached'}
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Back Document Scan</p>
                  {decrypted.backDataUrl ? (
                    decrypted.backDataUrl.startsWith('data:application/pdf') ? (
                      <div className="h-52 flex flex-col items-center justify-center bg-white rounded-lg border border-slate-200 gap-2">
                        <FileCheck2 className="w-8 h-8 text-[#172DEB]" />
                        <a
                          href={decrypted.backDataUrl}
                          download={`${docRecord.subjectCode}_ID_Back.pdf`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#172DEB] rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Back PDF
                        </a>
                      </div>
                    ) : (
                      <img
                        src={decrypted.backDataUrl}
                        alt="Decrypted back ID document"
                        className="w-full h-52 object-contain rounded-lg bg-white border border-slate-200"
                      />
                    )
                  ) : (
                    <div className="h-52 flex items-center justify-center bg-white rounded-lg border border-slate-200 text-xs text-slate-400">
                      {docRecord.isRedacted
                        ? 'Image permanently redacted'
                        : 'No back scan provided'}
                    </div>
                  )}
                </div>
              </div>

              {docRecord.ocrWarnings && docRecord.ocrWarnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Recorded OCR Alerts:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {docRecord.ocrWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Verification Decision & Notes */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <label className="block text-xs font-semibold text-slate-700">
                  Admin Verification Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record physical ID check observations or discrepancy reasons..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecision('VERIFIED')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Verify Identity Document
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecision('FLAGGED')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg disabled:opacity-50"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Flag Suspicious / Discrepancy
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDecision('REJECTED')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E51B23] hover:bg-red-700 rounded-lg disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject Document
                  </button>
                </div>
              </div>

              {/* Data Retention & Privacy Controls */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-bold text-slate-800">
                  Data Retention, Redaction &amp; Deletion Controls
                </p>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-end gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Retention Review / Auto-Purge Target Date
                      </label>
                      <input
                        type="date"
                        value={retentionDate}
                        onChange={(e) => setRetentionDate(e.target.value)}
                        className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy || !retentionDate}
                      onClick={() => void handleSaveRetention()}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
                    >
                      Update Date
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!docRecord.isRedacted && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRedactImages()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-white border border-amber-300 hover:bg-amber-50 rounded-lg"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        Purge Raw Images (Redact)
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDeleteVault()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#E51B23] bg-white border border-red-200 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Vault Record
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
