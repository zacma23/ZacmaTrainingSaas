import React, { useMemo, useState } from 'react';
import {
  Check,
  CreditCard,
  FileText,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import {
  approvePaymentTransaction,
  approveStudentRegistration,
  rejectPaymentTransaction,
  rejectStudentRegistration,
  submitPaymentRecord,
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
  formatDateShort,
  formatEtb,
  Payment,
  PaymentMethod,
  Receipt,
  Student,
} from '../types/zacma';

const PAGE_SIZE = 8;

export function PaymentsView({ onOpenReceipt }: { onOpenReceipt: (receipt: Receipt) => void }) {
  const {
    profile,
    effectiveRole,
    dataLoading,
    courses,
    payments,
    receipts,
    enrollments,
    pushToast,
  } = usePortal();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showRecordModal, setShowRecordModal] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (methodFilter !== 'ALL' && p.paymentMethod !== methodFilter) return false;
      if (courseFilter !== 'ALL' && p.courseName !== courseFilter) return false;
      if (dateFilter && p.paymentDate !== dateFilter) return false;
      if (!q) return true;
      return (
        p.transactionRef.toLowerCase().includes(q) ||
        p.studentName.toLowerCase().includes(q) ||
        p.studentCode.toLowerCase().includes(q) ||
        p.courseName.toLowerCase().includes(q) ||
        p.paymentDate.toLowerCase().includes(q)
      );
    });
  }, [payments, search, statusFilter, methodFilter, courseFilter, dateFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totals = useMemo(() => {
    const approved = payments
      .filter((p) => p.status === 'APPROVED')
      .reduce((acc, p) => acc + p.amountEtb, 0);
    const pending = payments
      .filter((p) => p.status === 'PENDING')
      .reduce((acc, p) => acc + p.amountEtb, 0);
    const rejectedCount = payments.filter((p) => p.status === 'REJECTED').length;
    return { approved, pending, rejectedCount };
  }, [payments]);

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="payments" moduleLabel="Fees, Payments & Reconciliation" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Fee Payments &amp; Transaction Ledger
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            All recorded fee payments enter Pending status until verified and approved by an Administrator.
          </p>
        </div>
        {(effectiveRole === 'ADMIN' || effectiveRole === 'ACCOUNTANT') && (
          <button
            type="button"
            onClick={() => setShowRecordModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Record Student Payment
          </button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Official Approved Collections</p>
          <p className="text-xl font-mono font-bold text-emerald-700 tabular-nums mt-1">
            {formatEtb(totals.approved)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Pending Verification (Not Posted)</p>
          <p className="text-xl font-mono font-bold text-amber-700 tabular-nums mt-1">
            {formatEtb(totals.pending)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Rejected Submissions</p>
          <p className="text-xl font-mono font-bold text-red-700 tabular-nums mt-1">
            {totals.rejectedCount}
          </p>
        </div>
      </div>

      {/* Filters */}
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
              placeholder="Search name, ID, ref, course, date..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            />
          </div>
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value="ALL">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.name}>
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
            aria-label="Filter payments by date"
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
          />
          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value="ALL">All Methods</option>
            <option value="Cash">Cash</option>
            <option value="CBE Birr">CBE Birr</option>
            <option value="Telebirr">Telebirr</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="Check">Check</option>
          </select>
          {(search || courseFilter !== 'ALL' || dateFilter || methodFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCourseFilter('ALL');
                setDateFilter('');
                setMethodFilter('ALL');
                setStatusFilter('ALL');
                setPage(1);
              }}
              className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>

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
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {dataLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No payment transactions found"
            description="Submit a student fee payment or clear your filters."
            actionLabel="Record Payment"
            onAction={() => setShowRecordModal(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Transaction Ref</th>
                  <th className="py-3 px-3">Student &amp; Course</th>
                  <th className="py-3 px-3">Date &amp; Method</th>
                  <th className="py-3 px-3">Recorded / Approved By</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Amount (ETB)</th>
                  <th className="py-3 px-4 text-right">Official Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginated.map((p) => {
                  const rcp = receipts.find((r) => r.paymentId === p.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-mono font-semibold text-slate-900">{p.transactionRef}</p>
                        {p.receiptNumber && (
                          <p className="text-[11px] font-mono text-blue-700">{p.receiptNumber}</p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900">{p.studentName}</p>
                        <p className="text-[11px] text-slate-500">
                          <span className="font-mono">{p.studentCode}</span> · {p.courseName}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <DualDateDisplay isoDate={p.paymentDate} />
                        <p className="text-[11px] text-slate-500 mt-0.5">{p.paymentMethod}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <p>By: {p.recordedByName}</p>
                        {p.approvedByName && (
                          <p className="text-[11px] text-slate-500">
                            {p.status === 'APPROVED' ? 'Approved' : 'Reviewed'}: {p.approvedByName}
                          </p>
                        )}
                        {p.rejectionReason && (
                          <p className="text-[11px] text-red-600 max-w-[200px] truncate">
                            {p.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <StatusLabel status={p.status} />
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatEtb(p.amountEtb)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {p.status === 'APPROVED' && rcp ? (
                          <button
                            type="button"
                            onClick={() => onOpenReceipt(rcp)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50/70 hover:bg-blue-100 rounded-md transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print Receipt
                          </button>
                        ) : p.status === 'PENDING' ? (
                          <span className="text-[11px] text-amber-700">Awaiting Approval</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Not Issued</span>
                        )}
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
          total={filtered.length}
          onPageChange={setPage}
        />
      </div>

      {showRecordModal && profile && (
        <RecordPaymentModal
          enrollments={enrollments.filter((e) => e.status !== 'REJECTED')}
          onClose={() => setShowRecordModal(false)}
          onSubmitted={async (data) => {
            await submitPaymentRecord(data, {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            });
            pushToast(
              'success',
              `Payment ${data.transactionRef} submitted for Admin approval.`
            );
            setShowRecordModal(false);
          }}
        />
      )}
    </div>
  );
}

function RecordPaymentModal({
  enrollments,
  onClose,
  onSubmitted,
}: {
  enrollments: ReturnType<typeof usePortal>['enrollments'];
  onClose: () => void;
  onSubmitted: (data: {
    enrollment: ReturnType<typeof usePortal>['enrollments'][number];
    amountEtb: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    transactionRef: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const [enrollmentId, setEnrollmentId] = useState(enrollments[0]?.id || '');
  const [amountEtb, setAmountEtb] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayAddisIsoDate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CBE Birr');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedEnrollment = enrollments.find((e) => e.id === enrollmentId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!selectedEnrollment) {
      setErrorMsg('Please choose an enrolled student.');
      return;
    }
    const amt = Number(amountEtb);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErrorMsg('Enter a valid payment amount in ETB.');
      return;
    }
    setBusy(true);
    try {
      await onSubmitted({
        enrollment: selectedEnrollment,
        amountEtb: amt,
        paymentDate,
        paymentMethod,
        transactionRef: transactionRef.trim(),
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to record payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-display font-bold text-slate-900">
              Record Student Fee Payment
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enters Pending Approval queue · Prevents duplicate transaction references
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Student &amp; Course Enrollment <span className="text-red-600">*</span>
            </label>
            <select
              value={enrollmentId}
              onChange={(e) => setEnrollmentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {enrollments.map((enr) => (
                <option key={enr.id} value={enr.id}>
                  {enr.studentName} ({enr.studentCode}) — {enr.courseName}
                </option>
              ))}
            </select>
          </div>

          {selectedEnrollment && (
            <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div>
                <p className="text-slate-500">Agreed Fee</p>
                <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                  {formatEtb(selectedEnrollment.agreedFeeEtb)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Approved Paid</p>
                <p className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                  {formatEtb(selectedEnrollment.approvedPaidEtb)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Outstanding</p>
                <p className="font-mono font-bold text-red-700 tabular-nums mt-0.5">
                  {formatEtb(selectedEnrollment.remainingBalanceEtb)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount (ETB) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                step="0.01"
                value={amountEtb}
                onChange={(e) => setAmountEtb(e.target.value)}
                placeholder="e.g., 6000"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <DualCalendarDatePicker
              label="Payment Date"
              value={paymentDate}
              onChange={setPaymentDate}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Method <span className="text-red-600">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="CBE Birr">CBE Birr</option>
                <option value="Telebirr">Telebirr</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unique Transaction Reference <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g., CBE-2026-71802"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Bank Slip Info</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional reference details for admin verification"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Submitting...' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ApprovalsQueueView() {
  const {
    profile,
    effectiveRole,
    courses,
    payments,
    students,
    enrollments,
    installments,
    receipts,
    pushToast,
  } = usePortal();

  const [tab, setTab] = useState<'payments' | 'registrations'>('payments');
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [confirmPayment, setConfirmPayment] = useState<{
    action: 'approve' | 'reject';
    payment: Payment;
  } | null>(null);
  const [confirmStudent, setConfirmStudent] = useState<{
    action: 'approve' | 'reject';
    student: Student;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (effectiveRole !== 'ADMIN') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <ShieldAlert className="w-7 h-7 text-red-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Administrator Authorization Required</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Accountants and Instructors cannot approve student registrations or financial transactions. Switch to an Administrator account to review approvals.
        </p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const pendingPayments = payments.filter((p) => {
    if (p.status !== 'PENDING') return false;
    if (courseFilter !== 'ALL' && p.courseName !== courseFilter) return false;
    if (dateFilter && p.paymentDate !== dateFilter) return false;
    if (!q) return true;
    return (
      p.studentName.toLowerCase().includes(q) ||
      p.studentCode.toLowerCase().includes(q) ||
      p.transactionRef.toLowerCase().includes(q) ||
      p.courseName.toLowerCase().includes(q) ||
      p.paymentDate.toLowerCase().includes(q)
    );
  });
  const pendingStudents = students.filter((s) => {
    if (s.registrationStatus !== 'PENDING') return false;
    if (courseFilter !== 'ALL' && s.courseName !== courseFilter) return false;
    if (dateFilter && s.enrollmentDate !== dateFilter) return false;
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.studentCode.toLowerCase().includes(q) ||
      s.courseName.toLowerCase().includes(q) ||
      s.enrollmentDate.toLowerCase().includes(q)
    );
  });

  const executePaymentAction = async (reason?: string) => {
    if (!confirmPayment || !profile) return;
    setBusy(true);
    try {
      if (confirmPayment.action === 'approve') {
        const enr = enrollments.find((e) => e.id === confirmPayment.payment.enrollmentId);
        if (!enr) throw new Error('Associated enrollment record not found.');
        const stu = students.find((s) => s.id === confirmPayment.payment.studentId);
        await approvePaymentTransaction(
          confirmPayment.payment,
          enr,
          installments,
          stu?.phone,
          receipts.length,
          { uid: profile.uid, fullName: profile.fullName, role: profile.role }
        );
        pushToast(
          'success',
          `Approved payment ${confirmPayment.payment.transactionRef} and issued official receipt.`
        );
      } else {
        await rejectPaymentTransaction(confirmPayment.payment, reason || '', {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        });
        pushToast('info', `Rejected payment ${confirmPayment.payment.transactionRef}.`);
      }
      setConfirmPayment(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Approval action failed.');
    } finally {
      setBusy(false);
    }
  };

  const executeStudentAction = async (reason?: string) => {
    if (!confirmStudent || !profile) return;
    setBusy(true);
    try {
      const enr = enrollments.find((e) => e.studentId === confirmStudent.student.id);
      if (confirmStudent.action === 'approve') {
        await approveStudentRegistration(confirmStudent.student, enr, {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        });
        pushToast('success', `Approved registration for ${confirmStudent.student.fullName}.`);
      } else {
        await rejectStudentRegistration(confirmStudent.student, enr, reason || '', {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        });
        pushToast('info', `Rejected registration for ${confirmStudent.student.fullName}.`);
      }
      setConfirmStudent(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Admin Approval Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Maker-checker verification gate for all student registrations and fee submissions.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'payments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Payment Submissions ({pendingPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('registrations')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'registrations' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Student Registrations ({pendingStudents.length})
          </button>
        </div>
      </div>

      {/* Filter Bar (Name, ID, Course, Date) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, ref, course, date..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          />
        </div>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label="Filter pending approvals by date"
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        />
        {(search || courseFilter !== 'ALL' || dateFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCourseFilter('ALL');
              setDateFilter('');
            }}
            className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {tab === 'payments' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {pendingPayments.length === 0 ? (
            <EmptyState
              title="No pending payments awaiting approval"
              description="All accountant-submitted fee payments have been reviewed."
            />
          ) : (
            <div className="divide-y divide-slate-200">
              {pendingPayments.map((p) => {
                const enr = enrollments.find((e) => e.id === p.enrollmentId);
                return (
                  <div
                    key={p.id}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-900">
                          {p.transactionRef}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-slate-900">{p.studentName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-slate-600">{p.studentCode}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {p.courseName} · Paid via <strong>{p.paymentMethod}</strong> on{' '}
                        <DualDateDisplay isoDate={p.paymentDate} inline /> · Recorded by{' '}
                        {p.recordedByName}
                      </p>
                      {enr && (
                        <p className="text-xs text-slate-500 font-mono">
                          Current Remaining Balance: {formatEtb(enr.remainingBalanceEtb)}
                        </p>
                      )}
                      {p.notes && <p className="text-xs text-slate-500 italic">“{p.notes}”</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <div className="text-left md:text-right mr-2">
                        <p className="text-[11px] text-slate-500">Submitted Amount</p>
                        <p className="text-lg font-mono font-bold text-blue-700 tabular-nums">
                          {formatEtb(p.amountEtb)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmPayment({ action: 'approve', payment: p })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                      >
                        <Check className="w-4 h-4" />
                        Approve &amp; Issue Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPayment({ action: 'reject', payment: p })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {pendingStudents.length === 0 ? (
            <EmptyState
              title="No pending registrations"
              description="All newly registered students have been reviewed."
            />
          ) : (
            <div className="divide-y divide-slate-200">
              {pendingStudents.map((s) => (
                <div
                  key={s.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <Avatar src={s.photoUrl} name={s.fullName} size="md" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900 text-sm">{s.fullName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-mono text-blue-700 font-semibold">
                          {s.studentCode}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600">{s.gender}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {s.courseName} · Fee:{' '}
                        <span className="font-mono font-semibold text-slate-900">
                          {formatEtb(s.courseFeeEtb)}
                        </span>{' '}
                        · Plan: {s.paymentPlanCode.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-500">
                        Registered:{' '}
                        <DualDateDisplay
                          isoDate={s.enrollmentDate}
                          ethiopianOverride={s.registrationDateEthiopian}
                          timeEat={s.registrationTimeEat}
                          inline
                        />{' '}
                        · Phone: <span className="font-mono">{s.phone}</span> · {s.address} ·
                        Submitted by {s.registeredByName || 'Accountant'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmStudent({ action: 'approve', student: s })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap"
                    >
                      <Check className="w-4 h-4" />
                      Approve &amp; Activate
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmStudent({ action: 'reject', student: s })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmPayment)}
        title={
          confirmPayment?.action === 'approve'
            ? 'Confirm Official Payment Approval'
            : 'Reject Submitted Payment'
        }
        description={
          confirmPayment?.action === 'approve'
            ? `Approve ${formatEtb(confirmPayment.payment.amountEtb)} (${confirmPayment.payment.transactionRef}) for ${confirmPayment.payment.studentName}? This posts official income, updates the student's remaining balance, and issues an immutable official receipt.`
            : `Reject payment ${confirmPayment?.payment.transactionRef} for ${confirmPayment?.payment.studentName}? The Accountant will be notified with your reason.`
        }
        confirmLabel={
          confirmPayment?.action === 'approve' ? 'Approve & Issue Receipt' : 'Reject Payment'
        }
        tone={confirmPayment?.action === 'reject' ? 'danger' : 'primary'}
        requireReason={confirmPayment?.action === 'reject'}
        reasonLabel="Rejection Reason"
        reasonPlaceholder="e.g., Bank receipt amount mismatch or unverified deposit reference"
        loading={busy}
        onConfirm={(r) => void executePaymentAction(r)}
        onClose={() => setConfirmPayment(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmStudent)}
        title={
          confirmStudent?.action === 'approve'
            ? 'Approve Student Registration'
            : 'Reject Student Registration'
        }
        description={
          confirmStudent?.action === 'approve'
            ? `Activate enrollment for ${confirmStudent.student.fullName} (${confirmStudent.student.studentCode}) in ${confirmStudent.student.courseName}?`
            : `Reject registration for ${confirmStudent?.student.fullName}?`
        }
        confirmLabel={confirmStudent?.action === 'approve' ? 'Approve' : 'Reject'}
        tone={confirmStudent?.action === 'reject' ? 'danger' : 'primary'}
        requireReason={confirmStudent?.action === 'reject'}
        loading={busy}
        onConfirm={(r) => void executeStudentAction(r)}
        onClose={() => setConfirmStudent(null)}
      />
    </div>
  );
}

export function ReceiptsArchiveView({ onOpenReceipt }: { onOpenReceipt: (receipt: Receipt) => void }) {
  const { dataLoading, courses, receipts } = usePortal();
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (courseFilter !== 'ALL' && r.courseName !== courseFilter) return false;
      if (dateFilter && r.paymentDate !== dateFilter) return false;
      if (!q) return true;
      return (
        r.receiptNumber.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        r.studentCode.toLowerCase().includes(q) ||
        r.transactionRef.toLowerCase().includes(q) ||
        r.courseName.toLowerCase().includes(q) ||
        r.paymentDate.toLowerCase().includes(q)
      );
    });
  }, [receipts, search, courseFilter, dateFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
          Official Receipts Archive
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Immutable, QR-verified receipts generated strictly for Admin-approved tuition payments.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search receipt #, name, ID, course, date..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          />
        </div>
        <select
          value={courseFilter}
          onChange={(e) => {
            setCourseFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.name}>
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
          aria-label="Filter receipts by payment date"
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        />
        {(search || courseFilter !== 'ALL' || dateFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCourseFilter('ALL');
              setDateFilter('');
              setPage(1);
            }}
            className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {dataLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : paginated.length === 0 ? (
          <EmptyState
            title="No official receipts issued yet"
            description="Receipts are generated automatically when an Administrator approves a pending payment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Receipt Number</th>
                  <th className="py-3 px-3">Student &amp; Course</th>
                  <th className="py-3 px-3">Payment Date &amp; Method</th>
                  <th className="py-3 px-3 text-right">Amount Paid</th>
                  <th className="py-3 px-3 text-right">Remaining Bal.</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginated.map((rcp) => (
                  <tr key={rcp.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <p className="font-mono font-bold text-blue-700">{rcp.receiptNumber}</p>
                      <p className="text-[11px] font-mono text-slate-500">{rcp.transactionRef}</p>
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-slate-900">{rcp.studentName}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono">{rcp.studentCode}</span> · {rcp.courseName}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      <p>{formatDateShort(rcp.paymentDate)}</p>
                      <p className="text-[11px] text-slate-500">
                        {rcp.paymentMethod} · Auth: {rcp.authorizedBy}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                      {formatEtb(rcp.amountPaidEtb)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatEtb(rcp.remainingBalanceEtb)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenReceipt(rcp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View &amp; Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
