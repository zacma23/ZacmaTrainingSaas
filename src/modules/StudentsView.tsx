import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  Plus,
  ScanLine,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import {
  approveStudentRegistration,
  compressImageToDataUrl,
  computeNextStudentCode,
  registerStudentWithPlan,
  rejectStudentRegistration,
} from '../lib/zacmaService';
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  PaginationBar,
  StatusLabel,
  TableSkeleton,
} from '../components/PortalUI';
import { DualCalendarDatePicker, DualDateDisplay } from '../components/DualCalendarDatePicker';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import { todayAddisIsoDate } from '../lib/ethiopianCalendar';
import {
  addDaysIso,
  formatEtb,
  PaymentMethod,
  Student,
} from '../types/zacma';

const PAGE_SIZE = 8;

export function StudentsView({
  onOpenAiRegistration,
}: {
  onOpenAiRegistration?: () => void;
} = {}) {
  const {
    profile,
    effectiveRole,
    dataLoading,
    students,
    enrollments,
    courses,
    paymentPlans,
    installments,
    pushToast,
  } = usePortal();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'approve' | 'reject';
    student: Student;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const isNonFinanceStaff = effectiveRole === 'INSTRUCTOR' || effectiveRole === 'GENERAL_STAFF';
  const canRegister = effectiveRole === 'ADMIN' || effectiveRole === 'ACCOUNTANT';
  const canApprove = effectiveRole === 'ADMIN';

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (isNonFinanceStaff && s.registrationStatus !== 'APPROVED') return false;
      if (statusFilter !== 'ALL' && s.registrationStatus !== statusFilter) return false;
      if (courseFilter !== 'ALL' && s.courseId !== courseFilter) return false;
      if (dateFilter && s.enrollmentDate !== dateFilter) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.courseName.toLowerCase().includes(q) ||
        s.enrollmentDate.toLowerCase().includes(q)
      );
    });
  }, [students, search, statusFilter, courseFilter, dateFilter, isNonFinanceStaff]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, page]);

  const handleConfirmApproval = async (reason?: string) => {
    if (!confirmAction || !profile) return;
    setActionBusy(true);
    try {
      const enr = enrollments.find((e) => e.studentId === confirmAction.student.id);
      if (confirmAction.type === 'approve') {
        await approveStudentRegistration(confirmAction.student, enr, {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        });
        pushToast('success', `Approved registration for ${confirmAction.student.fullName}.`);
      } else {
        await rejectStudentRegistration(confirmAction.student, enr, reason || '', {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        });
        pushToast('info', `Rejected registration for ${confirmAction.student.fullName}.`);
      }
      setConfirmAction(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="students" moduleLabel="Student Management" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            {isNonFinanceStaff ? 'Enrolled Students Directory' : 'Student Management & Registrations'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isNonFinanceStaff
              ? 'Active students approved for ZACMA courses. Financial records are isolated to Finance and Admin roles.'
              : 'Register trainees with unique institutional IDs, payment plans, and admin approval controls.'}
          </p>
        </div>
        {canRegister && (
          <div className="flex flex-wrap items-center gap-2">
            {onOpenAiRegistration && (
              <button
                type="button"
                onClick={onOpenAiRegistration}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#172DEB] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
              >
                <ScanLine className="w-4 h-4" />
                AI Scan ID &amp; Register
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRegisterModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Register New Student
            </button>
          </div>
        )}
      </div>

      {/* Filter Toolbar (Name, ID, Course, Enrollment Date) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, ID, course, date..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700"
            />
          </div>

          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-blue-700"
          >
            <option value="ALL">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter students by enrollment date"
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-blue-700"
          />

          {(search || courseFilter !== 'ALL' || dateFilter || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCourseFilter('ALL');
                setDateFilter('');
                setStatusFilter('ALL');
                setPage(1);
              }}
              className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>

        {!isNonFinanceStaff && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Student Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {dataLoading ? (
          <TableSkeleton rows={6} cols={isNonFinanceStaff ? 5 : 7} />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No student records match your filters"
            description="Adjust your search query or register a new student to begin enrollment."
            actionLabel={canRegister ? 'Register Student' : undefined}
            onAction={canRegister ? () => setShowRegisterModal(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-3">Course &amp; Enrolled</th>
                  <th className="py-3 px-3">Contact</th>
                  {!isNonFinanceStaff && <th className="py-3 px-3 text-right">Course Fee</th>}
                  {!isNonFinanceStaff && <th className="py-3 px-3 text-right">Balance (ETB)</th>}
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginated.map((student) => {
                  const enr = enrollments.find((e) => e.studentId === student.id);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar src={student.photoUrl} name={student.fullName} size="md" />
                          <div>
                            <p className="font-semibold text-slate-900">{student.fullName}</p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {student.studentCode} · {student.gender}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-slate-900">{student.courseName}</p>
                        <div className="mt-0.5 text-[11px]">
                          <DualDateDisplay
                            isoDate={student.enrollmentDate}
                            ethiopianOverride={student.registrationDateEthiopian}
                            timeEat={student.registrationTimeEat}
                          />
                        </div>
                        {!isNonFinanceStaff && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Plan: {student.paymentPlanCode.replace('_', ' ')}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <p className="font-mono text-[11px] text-slate-800">{student.phone}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {student.address}
                        </p>
                      </td>
                      {!isNonFinanceStaff && (
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatEtb(student.courseFeeEtb)}
                        </td>
                      )}
                      {!isNonFinanceStaff && (
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              (enr?.remainingBalanceEtb ?? student.courseFeeEtb) > 0
                                ? 'text-red-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {formatEtb(enr?.remainingBalanceEtb ?? student.courseFeeEtb)}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-3">
                        <StatusLabel status={student.registrationStatus} />
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedStudent(student)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                          {canApprove && student.registrationStatus === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: 'approve', student })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmAction({ type: 'reject', student })}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md transition-colors"
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
        )}
        <PaginationBar
          page={page}
          pageSize={PAGE_SIZE}
          total={filteredStudents.length}
          onPageChange={setPage}
        />
      </div>

      {/* Register Student Modal */}
      {showRegisterModal && (
        <RegisterStudentModal
          nextCode={computeNextStudentCode(students)}
          courses={courses.filter((c) => c.isActive)}
          paymentPlans={paymentPlans.filter((p) => p.isActive)}
          existingStudents={students}
          onClose={() => setShowRegisterModal(false)}
        />
      )}

      {/* Student Detail Drawer */}
      {selectedStudent && (
        <StudentProfileModal
          student={selectedStudent}
          enrollment={enrollments.find((e) => e.studentId === selectedStudent.id)}
          installments={installments.filter((i) => i.studentId === selectedStudent.id)}
          hideFinancials={isNonFinanceStaff}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {/* Approve / Reject Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction?.type === 'approve'
            ? 'Approve Student Registration'
            : 'Reject Student Registration'
        }
        description={
          confirmAction?.type === 'approve'
            ? `Approve ${confirmAction.student.fullName} (${confirmAction.student.studentCode}) for ${confirmAction.student.courseName}? This activates their enrollment for attendance and fee tracking.`
            : `Reject registration for ${confirmAction?.student.fullName} (${confirmAction?.student.studentCode})? Provide a clear audit reason below.`
        }
        confirmLabel={confirmAction?.type === 'approve' ? 'Approve & Activate' : 'Reject Registration'}
        tone={confirmAction?.type === 'reject' ? 'danger' : 'primary'}
        requireReason={confirmAction?.type === 'reject'}
        reasonLabel="Rejection Reason"
        reasonPlaceholder="e.g., Missing identification details or duplicate application"
        loading={actionBusy}
        onConfirm={(reason) => void handleConfirmApproval(reason)}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}

function RegisterStudentModal({
  nextCode,
  courses,
  paymentPlans,
  existingStudents,
  onClose,
}: {
  nextCode: string;
  courses: ReturnType<typeof usePortal>['courses'];
  paymentPlans: ReturnType<typeof usePortal>['paymentPlans'];
  existingStudents: Student[];
  onClose: () => void;
}) {
  const { profile, pushToast } = usePortal();
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Female');
  const [phone, setPhone] = useState('+251 ');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [enrollmentDate, setEnrollmentDate] = useState(todayAddisIsoDate());
  const [planCode, setPlanCode] = useState(paymentPlans[1]?.code || paymentPlans[0]?.code || 'FULL');
  const [customInstallments, setCustomInstallments] = useState(2);
  const [customIntervalDays, setCustomIntervalDays] = useState(45);
  const [includeInitialFee, setIncludeInitialFee] = useState(false);
  const [initialAmount, setInitialAmount] = useState('');
  const [initialMethod, setInitialMethod] = useState<PaymentMethod>('Cash');
  const [initialRef, setInitialRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const selectedPlan = paymentPlans.find((p) => p.code === planCode);

  const schedulePreview = useMemo(() => {
    if (!selectedCourse || !selectedPlan) return [];
    const count =
      selectedPlan.code === 'CUSTOM'
        ? Math.max(1, Math.min(12, customInstallments))
        : selectedPlan.installmentCount;
    const interval =
      selectedPlan.code === 'CUSTOM' ? Math.max(0, customIntervalDays) : selectedPlan.intervalDays;
    const base = Math.floor((selectedCourse.feeEtb / count) * 100) / 100;
    let sum = 0;
    return Array.from({ length: count }).map((_, idx) => {
      const amt = idx === count - 1 ? Number((selectedCourse.feeEtb - sum).toFixed(2)) : base;
      sum += amt;
      return {
        num: idx + 1,
        dueDate: addDaysIso(enrollmentDate, idx * interval),
        amount: amt,
      };
    });
  }, [selectedCourse, selectedPlan, customInstallments, customIntervalDays, enrollmentDate]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoUrl(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process photo.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!profile || !selectedCourse || !selectedPlan) {
      setErrorMsg('Please select a valid course and payment plan.');
      return;
    }
    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      setErrorMsg('Full name, phone number, and address are required.');
      return;
    }
    if (includeInitialFee) {
      const amt = Number(initialAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setErrorMsg('Initial fee amount must be greater than zero.');
        return;
      }
      if (!initialRef.trim()) {
        setErrorMsg('Transaction reference is required for initial fee submission.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await registerStudentWithPlan(
        {
          fullName,
          gender,
          phone,
          altPhone: altPhone.trim() || undefined,
          address,
          photoUrl,
          course: selectedCourse,
          enrollmentDate,
          paymentPlan: selectedPlan,
          customInstallments,
          customIntervalDays,
          initialPaymentAmount: includeInitialFee ? Number(initialAmount) : undefined,
          initialPaymentMethod: includeInitialFee ? initialMethod : undefined,
          initialTransactionRef: includeInitialFee ? initialRef.trim() : undefined,
        },
        existingStudents,
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        }
      );
      pushToast(
        'success',
        `Registered ${fullName.trim()} (${result.studentCode}) — submitted for Admin approval.`
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-display font-bold text-slate-900">
              Register New Student
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-Assigned ID: <span className="font-mono font-semibold text-blue-700">{nextCode}</span> · Requires Admin Approval
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close registration modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Photo & Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
            <div className="sm:col-span-3 flex flex-col items-center gap-2.5">
              <Avatar src={photoUrl} name={fullName || 'New Student'} size="lg" />
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="hidden"
                />
              </label>
              <span className="text-[11px] text-slate-400 text-center">Square portrait</span>
            </div>

            <div className="sm:col-span-9 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Dawit Bekele Tadesse"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gender <span className="text-red-600">*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Male' | 'Female')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <DualCalendarDatePicker
                  label="Registration / Enrollment Date"
                  value={enrollmentDate}
                  onChange={setEnrollmentDate}
                  required
                  helperText="Enter in either Gregorian or Ethiopian calendar. Both dates and Addis Ababa (EAT) registration time are saved automatically."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number <span className="text-red-600">*</span>
                </label>
                <input
                  type="tel"
                  required
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251 911 000 000"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alternative Phone
                </label>
                <input
                  type="tel"
                  maxLength={30}
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-blue-700"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Residential Address <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={240}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Sub-city, Woreda, City"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
                />
              </div>
            </div>
          </div>

          {/* Course & Payment Plan */}
          <div className="pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Training Course <span className="text-red-600">*</span>
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {formatEtb(c.feeEtb)}
                  </option>
                ))}
              </select>
              {selectedCourse && (
                <p className="text-xs text-slate-500 mt-1">
                  Locked Institutional Fee:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {formatEtb(selectedCourse.feeEtb)}
                  </span>{' '}
                  · {selectedCourse.durationWeeks} weeks
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Plan <span className="text-red-600">*</span>
              </label>
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value as typeof planCode)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
              >
                {paymentPlans.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {planCode === 'CUSTOM' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Installment Count (1–12)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={customInstallments}
                    onChange={(e) => setCustomInstallments(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Interval Between Payments (Days)
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={180}
                    value={customIntervalDays}
                    onChange={(e) => setCustomIntervalDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {/* Installment Schedule Preview */}
          {schedulePreview.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-700 mb-2.5">
                Generated Installment Schedule ({schedulePreview.length} installment
                {schedulePreview.length > 1 ? 's' : ''})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {schedulePreview.map((item) => (
                  <div
                    key={item.num}
                    className="bg-white border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="text-slate-600">
                      <span className="font-semibold text-slate-800">#{item.num}</span>
                      <div className="text-[11px] mt-0.5">
                        <DualDateDisplay isoDate={item.dueDate} />
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatEtb(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Initial Fee Submission */}
          <div className="pt-5 border-t border-slate-200">
            <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={includeInitialFee}
                onChange={(e) => setIncludeInitialFee(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <span>Submit initial registration / tuition fee payment for Admin approval</span>
            </label>

            {includeInitialFee && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount Paid (ETB) <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value)}
                    placeholder={String(schedulePreview[0]?.amount || '')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={initialMethod}
                    onChange={(e) => setInitialMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="CBE Birr">CBE Birr</option>
                    <option value="Telebirr">Telebirr</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unique Transaction Ref <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={initialRef}
                    onChange={(e) => setInitialRef(e.target.value)}
                    placeholder="e.g., CBE-2026-44021"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Submitting Registration...' : 'Submit for Admin Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentProfileModal({
  student,
  enrollment,
  installments,
  hideFinancials,
  onClose,
}: {
  student: Student;
  enrollment?: ReturnType<typeof usePortal>['enrollments'][number];
  installments: ReturnType<typeof usePortal>['installments'];
  hideFinancials: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <Avatar src={student.photoUrl} name={student.fullName} size="md" />
            <div>
              <h3 className="text-base font-display font-bold text-slate-900">
                {student.fullName}
              </h3>
              <p className="text-xs font-mono text-slate-500">
                {student.studentCode} · {student.courseName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-slate-500">Status</p>
              <div className="mt-1">
                <StatusLabel status={student.registrationStatus} />
              </div>
            </div>
            <div>
              <p className="text-slate-500">Gender</p>
              <p className="font-semibold text-slate-900 mt-1">{student.gender}</p>
            </div>
            <div>
              <p className="text-slate-500">Registration Date (Dual)</p>
              <div className="mt-1">
                <DualDateDisplay
                  isoDate={student.enrollmentDate}
                  ethiopianOverride={student.registrationDateEthiopian}
                  timeEat={student.registrationTimeEat}
                  compact={false}
                />
              </div>
            </div>
            <div>
              <p className="text-slate-500">Primary Phone</p>
              <p className="font-mono font-semibold text-slate-900 mt-1">{student.phone}</p>
            </div>
            <div>
              <p className="text-slate-500">Alternative Phone</p>
              <p className="font-mono text-slate-700 mt-1">{student.altPhone || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Registered By</p>
              <p className="font-medium text-slate-900 mt-1">{student.registeredByName || 'Staff'}</p>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <p className="text-slate-500">Address</p>
              <p className="font-medium text-slate-900 mt-1">{student.address}</p>
            </div>
            {student.rejectionReason && (
              <div className="col-span-2 sm:col-span-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
                <p className="font-semibold">Rejection Note</p>
                <p className="mt-0.5">{student.rejectionReason}</p>
              </div>
            )}
          </div>

          {!hideFinancials && enrollment && (
            <>
              <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[11px] text-slate-500">Agreed Tuition</p>
                  <p className="text-sm font-mono font-bold text-slate-900 tabular-nums mt-1">
                    {formatEtb(enrollment.agreedFeeEtb)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[11px] text-slate-500">Approved Paid</p>
                  <p className="text-sm font-mono font-bold text-emerald-700 tabular-nums mt-1">
                    {formatEtb(enrollment.approvedPaidEtb)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[11px] text-slate-500">Remaining Balance</p>
                  <p className="text-sm font-mono font-bold text-red-700 tabular-nums mt-1">
                    {formatEtb(enrollment.remainingBalanceEtb)}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-900 mb-2.5">Installment Schedule</h4>
                {installments.length === 0 ? (
                  <p className="text-xs text-slate-500">No scheduled installments recorded.</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Due Date</th>
                          <th className="py-2 px-3 text-right">Due</th>
                          <th className="py-2 px-3 text-right">Paid</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {installments.map((inst) => (
                          <tr key={inst.id}>
                            <td className="py-2 px-3 font-mono">{inst.installmentNumber}</td>
                            <td className="py-2 px-3">
                              <DualDateDisplay isoDate={inst.dueDate} />
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums">
                              {formatEtb(inst.amountDueEtb)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                              {formatEtb(inst.amountPaidEtb)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <StatusLabel status={inst.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
