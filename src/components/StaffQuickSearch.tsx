import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileText,
  Search,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { StatusLabel } from './PortalUI';
import { formatDateShort, formatEtb, NavSection, Receipt } from '../types/zacma';

interface StaffQuickSearchProps {
  onNavigate: (tab: NavSection) => void;
  onOpenReceipt: (receipt: Receipt) => void;
}

export function StaffQuickSearch({ onNavigate, onOpenReceipt }: StaffQuickSearchProps) {
  const {
    effectiveRole,
    students,
    courses,
    payments,
    receipts,
    attendance,
    staffProfiles,
  } = usePortal();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const canViewFinance = effectiveRole === 'ADMIN' || effectiveRole === 'ACCOUNTANT';
  const isAdmin = effectiveRole === 'ADMIN';
  const restrictToApprovedStudents =
    effectiveRole === 'INSTRUCTOR' || effectiveRole === 'GENERAL_STAFF';

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 20);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const hasActiveFilter = Boolean(query.trim() || courseFilter !== 'ALL' || dateFilter);

  const selectedCourseObj = useMemo(
    () => courses.find((c) => c.id === courseFilter),
    [courses, courseFilter]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchedStudents = students
      .filter((s) => {
        if (restrictToApprovedStudents && s.registrationStatus !== 'APPROVED') return false;
        if (courseFilter !== 'ALL' && s.courseId !== courseFilter) return false;
        if (dateFilter && s.enrollmentDate !== dateFilter) return false;
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.studentCode.toLowerCase().includes(q) ||
          s.courseName.toLowerCase().includes(q) ||
          s.enrollmentDate.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);

    const matchedCourses = courses
      .filter((c) => {
        if (courseFilter !== 'ALL' && c.id !== courseFilter) return false;
        if (dateFilter && !(c.createdAt || '').startsWith(dateFilter)) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          (c.instructorName || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 5);

    const matchedAttendance = attendance
      .filter((a) => {
        if (courseFilter !== 'ALL' && a.courseId !== courseFilter) return false;
        if (dateFilter && a.attendanceDate !== dateFilter) return false;
        if (!q) return true;
        return (
          a.studentName.toLowerCase().includes(q) ||
          a.studentCode.toLowerCase().includes(q) ||
          a.courseName.toLowerCase().includes(q) ||
          a.attendanceDate.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);

    const matchedPayments = canViewFinance
      ? payments
          .filter((p) => {
            if (courseFilter !== 'ALL' && selectedCourseObj && p.courseName !== selectedCourseObj.name) {
              return false;
            }
            if (dateFilter && p.paymentDate !== dateFilter) return false;
            if (!q) return true;
            return (
              p.studentName.toLowerCase().includes(q) ||
              p.studentCode.toLowerCase().includes(q) ||
              p.transactionRef.toLowerCase().includes(q) ||
              (p.receiptNumber || '').toLowerCase().includes(q) ||
              p.courseName.toLowerCase().includes(q) ||
              p.paymentDate.toLowerCase().includes(q)
            );
          })
          .slice(0, 6)
      : [];

    const matchedReceipts = canViewFinance
      ? receipts
          .filter((r) => {
            if (courseFilter !== 'ALL' && selectedCourseObj && r.courseName !== selectedCourseObj.name) {
              return false;
            }
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
          })
          .slice(0, 5)
      : [];

    const matchedStaff = isAdmin
      ? staffProfiles
          .filter((m) => {
            if (courseFilter !== 'ALL') {
              const teachesCourse = courses.some(
                (c) => c.id === courseFilter && (c.instructorId === m.uid || c.instructorName === m.fullName)
              );
              if (!teachesCourse) return false;
            }
            if (dateFilter && !(m.createdAt || '').startsWith(dateFilter)) return false;
            if (!q) return true;
            return (
              m.fullName.toLowerCase().includes(q) ||
              m.uid.toLowerCase().includes(q) ||
              m.email.toLowerCase().includes(q) ||
              m.role.toLowerCase().includes(q)
            );
          })
          .slice(0, 5)
      : [];

    const total =
      matchedStudents.length +
      matchedCourses.length +
      matchedAttendance.length +
      matchedPayments.length +
      matchedReceipts.length +
      matchedStaff.length;

    return {
      students: matchedStudents,
      courses: matchedCourses,
      attendance: matchedAttendance,
      payments: matchedPayments,
      receipts: matchedReceipts,
      staff: matchedStaff,
      total,
    };
  }, [
    query,
    courseFilter,
    dateFilter,
    selectedCourseObj,
    students,
    courses,
    attendance,
    payments,
    receipts,
    staffProfiles,
    canViewFinance,
    isAdmin,
    restrictToApprovedStudents,
  ]);

  const clearAll = () => {
    setQuery('');
    setCourseFilter('ALL');
    setDateFilter('');
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      {/* Compact Header Trigger Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search name, ID, course, date..."
          aria-label="Global staff search by name, ID, course, and date"
          className="w-full pl-8 pr-16 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-700 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700/15 transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={clearAll}
              className="p-0.5 text-slate-400 hover:text-slate-700"
              aria-label="Clear search filters"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded">
              Ctrl K
            </kbd>
          )}
        </div>
      </div>

      {/* Expandable Multi-Filter Search Panel */}
      {open && (
        <div className="fixed sm:absolute left-3 right-3 sm:left-0 sm:right-auto top-16 sm:top-full sm:mt-2 sm:w-[540px] max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Course + Date Filter Strip */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label="Filter search by course"
              className="flex-1 min-w-[160px] px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-700"
            >
              <option value="ALL">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>

            <div className="relative flex items-center">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label="Filter search by date"
                className="pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-700"
              />
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearAll}
                className="px-2 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded-md whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>

          {/* Search Results Body */}
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100">
            {!hasActiveFilter ? (
              <div className="p-5 text-center space-y-1">
                <p className="text-xs font-semibold text-slate-800">
                  Staff Quick Search ({effectiveRole})
                </p>
                <p className="text-[11px] text-slate-500">
                  Type a student or staff name, ID (e.g. ZAC-2026-0001), course name/code, or pick a course and date above.
                </p>
              </div>
            ) : results.total === 0 ? (
              <div className="p-6 text-center">
                <p className="text-xs font-semibold text-slate-700">No matching records found</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Try clearing the course or date filter, or searching with a shorter keyword.
                </p>
              </div>
            ) : (
              <>
                {results.students.length > 0 && (
                  <div className="p-2.5">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      Students ({results.students.length})
                    </p>
                    <div className="space-y-0.5">
                      {results.students.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            onNavigate('students');
                            setOpen(false);
                          }}
                          className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {s.fullName}{' '}
                              <span className="font-mono font-normal text-blue-700">
                                ({s.studentCode})
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {s.courseName} · Enrolled {formatDateShort(s.enrollmentDate)}
                            </p>
                          </div>
                          <StatusLabel status={s.registrationStatus} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {results.courses.length > 0 && (
                  <div className="p-2.5">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3" />
                      Courses ({results.courses.length})
                    </p>
                    <div className="space-y-0.5">
                      {results.courses.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onNavigate('courses');
                            setOpen(false);
                          }}
                          className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {c.name}{' '}
                              <span className="font-mono text-blue-700 font-normal">({c.code})</span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {c.schedule} · {c.instructorName || 'Assigned Faculty'}
                            </p>
                          </div>
                          {canViewFinance && (
                            <span className="text-[11px] font-mono font-semibold text-slate-700 shrink-0">
                              {formatEtb(c.feeEtb)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {results.attendance.length > 0 && (
                  <div className="p-2.5">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <ClipboardCheck className="w-3 h-3" />
                      Attendance Logs ({results.attendance.length})
                    </p>
                    <div className="space-y-0.5">
                      {results.attendance.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            onNavigate('attendance');
                            setOpen(false);
                          }}
                          className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {a.studentName}{' '}
                              <span className="font-mono font-normal text-slate-500">
                                ({a.studentCode})
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {a.courseName} · {formatDateShort(a.attendanceDate)}
                            </p>
                          </div>
                          <StatusLabel status={a.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {canViewFinance && results.payments.length > 0 && (
                  <div className="p-2.5">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" />
                      Payments ({results.payments.length})
                    </p>
                    <div className="space-y-0.5">
                      {results.payments.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onNavigate('payments');
                            setOpen(false);
                          }}
                          className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {p.studentName}{' '}
                              <span className="font-mono font-normal text-slate-500">
                                ({p.studentCode})
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {p.transactionRef} · {p.courseName} · {formatDateShort(p.paymentDate)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-mono font-bold text-slate-900">
                              {formatEtb(p.amountEtb)}
                            </p>
                            <StatusLabel status={p.status} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {canViewFinance && results.receipts.length > 0 && (
                  <div className="p-2.5">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />
                      Official Receipts ({results.receipts.length})
                    </p>
                    <div className="space-y-0.5">
                      {results.receipts.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            onOpenReceipt(r);
                            setOpen(false);
                          }}
                          className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-blue-700 font-mono truncate">
                              {r.receiptNumber}{' '}
                              <span className="font-sans text-slate-900 font-semibold">
                                · {r.studentName}
                              </span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {r.studentCode} · {r.courseName} · {formatDateShort(r.paymentDate)}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-bold text-emerald-700 shrink-0">
                            {formatEtb(r.amountPaidEtb)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isAdmin && results.staff.length > 0 && (
                  <div className="p-2.5">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <UserCog className="w-3 h-3" />
                      Staff &amp; Portal Accounts ({results.staff.length})
                    </p>
                    <div className="space-y-0.5">
                      {results.staff.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onNavigate('staff');
                            setOpen(false);
                          }}
                          className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {m.fullName}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              {m.email} · {m.role}
                            </p>
                          </div>
                          <span className="text-[11px] font-mono font-semibold text-blue-700 shrink-0">
                            {m.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
