import React, { useEffect, useMemo, useState } from 'react';
import { Download, Save, Search } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { exportRowsToCsv, saveDailyAttendanceBatch } from '../lib/zacmaService';
import { Avatar, EmptyState, StatusLabel } from '../components/PortalUI';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import { AttendanceStatus, formatDateShort, todayIsoDate } from '../types/zacma';

const STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export function AttendanceView() {
  const {
    profile,
    effectiveRole,
    courses,
    enrollments,
    students,
    attendance,
    pushToast,
  } = usePortal();

  const [tab, setTab] = useState<'roster' | 'reports'>('roster');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [attendanceDate, setAttendanceDate] = useState(todayIsoDate());
  const [draftStatus, setDraftStatus] = useState<Record<string, AttendanceStatus>>({});
  const [draftRemarks, setDraftRemarks] = useState<Record<string, string>>({});
  const [rosterSearch, setRosterSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Report filters
  const [reportCourseFilter, setReportCourseFilter] = useState('ALL');
  const [reportStudentSearch, setReportStudentSearch] = useState('');
  const [reportDateFilter, setReportDateFilter] = useState('');

  const canMarkAttendance = effectiveRole === 'ADMIN' || effectiveRole === 'INSTRUCTOR';
  const activeCourses = useMemo(() => courses.filter((c) => c.isActive), [courses]);

  useEffect(() => {
    if (!selectedCourseId && activeCourses.length > 0) {
      setSelectedCourseId(activeCourses[0].id);
    }
  }, [activeCourses, selectedCourseId]);

  const selectedCourse = activeCourses.find((c) => c.id === selectedCourseId);

  const courseEnrollments = useMemo(
    () =>
      enrollments.filter(
        (e) =>
          e.courseId === selectedCourseId && (e.status === 'ACTIVE' || e.status === 'COMPLETED')
      ),
    [enrollments, selectedCourseId]
  );

  const visibleRosterEnrollments = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return courseEnrollments;
    return courseEnrollments.filter(
      (e) =>
        e.studentName.toLowerCase().includes(q) ||
        e.studentCode.toLowerCase().includes(q) ||
        e.courseName.toLowerCase().includes(q)
    );
  }, [courseEnrollments, rosterSearch]);

  // Sync draft state whenever selected course, date, or attendance changes
  useEffect(() => {
    const nextStatus: Record<string, AttendanceStatus> = {};
    const nextRemarks: Record<string, string> = {};
    for (const enr of courseEnrollments) {
      const existing = attendance.find(
        (a) => a.enrollmentId === enr.id && a.attendanceDate === attendanceDate
      );
      nextStatus[enr.id] = existing?.status || 'PRESENT';
      nextRemarks[enr.id] = existing?.remarks || '';
    }
    setDraftStatus(nextStatus);
    setDraftRemarks(nextRemarks);
  }, [courseEnrollments, attendance, attendanceDate]);

  const handleSaveRoster = async () => {
    if (!profile || !selectedCourse || courseEnrollments.length === 0) return;
    setSaving(true);
    try {
      const entries = courseEnrollments.map((enr) => ({
        enrollment: enr,
        status: draftStatus[enr.id] || 'PRESENT',
        remarks: draftRemarks[enr.id] || '',
        existingRecord: attendance.find(
          (a) => a.enrollmentId === enr.id && a.attendanceDate === attendanceDate
        ),
      }));
      await saveDailyAttendanceBatch(selectedCourse, attendanceDate, entries, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
      });
      pushToast(
        'success',
        `Saved attendance for ${entries.length} student(s) in ${selectedCourse.name}.`
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  // Report computations
  const filteredAttendance = useMemo(() => {
    const q = reportStudentSearch.trim().toLowerCase();
    return attendance.filter((a) => {
      if (reportCourseFilter !== 'ALL' && a.courseId !== reportCourseFilter) return false;
      if (reportDateFilter && a.attendanceDate !== reportDateFilter) return false;
      if (!q) return true;
      return (
        a.studentName.toLowerCase().includes(q) ||
        a.studentCode.toLowerCase().includes(q) ||
        a.courseName.toLowerCase().includes(q) ||
        a.attendanceDate.toLowerCase().includes(q)
      );
    });
  }, [attendance, reportCourseFilter, reportDateFilter, reportStudentSearch]);

  const studentSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        studentId: string;
        studentCode: string;
        studentName: string;
        courseName: string;
        present: number;
        late: number;
        excused: number;
        absent: number;
        total: number;
      }
    >();
    for (const row of filteredAttendance) {
      const cur = map.get(row.enrollmentId) || {
        studentId: row.studentId,
        studentCode: row.studentCode,
        studentName: row.studentName,
        courseName: row.courseName,
        present: 0,
        late: 0,
        excused: 0,
        absent: 0,
        total: 0,
      };
      cur.total += 1;
      if (row.status === 'PRESENT') cur.present += 1;
      else if (row.status === 'LATE') cur.late += 1;
      else if (row.status === 'EXCUSED') cur.excused += 1;
      else cur.absent += 1;
      map.set(row.enrollmentId, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [filteredAttendance]);

  const handleExportReport = () => {
    exportRowsToCsv(
      `zacma-attendance-report-${todayIsoDate()}.csv`,
      ['Date', 'Student ID', 'Student Name', 'Course', 'Status', 'Recorded By', 'Remarks'],
      filteredAttendance.map((a) => [
        a.attendanceDate,
        a.studentCode,
        a.studentName,
        a.courseName,
        a.status,
        a.recordedByName,
        a.remarks || '',
      ])
    );
    pushToast('success', 'Attendance report exported to CSV.');
  };

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="attendance" moduleLabel="Attendance & Classroom Analytics" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Class Attendance &amp; Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Mark daily Present, Absent, Late, and Excused attendance and review student attendance rates.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('roster')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'roster' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Daily Attendance Roster
          </button>
          <button
            type="button"
            onClick={() => setTab('reports')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'reports' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Attendance Reports
          </button>
        </div>
      </div>

      {tab === 'roster' ? (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Training Class
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 font-medium"
                >
                  {activeCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Search Student (Name / ID)
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder="Filter roster by name or ID..."
                    className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-blue-700"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Session Date
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>
            </div>

            {canMarkAttendance && courseEnrollments.length > 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveRoster()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving Roster...' : 'Save Daily Attendance'}
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {visibleRosterEnrollments.length === 0 ? (
              <EmptyState
                title={
                  courseEnrollments.length === 0
                    ? 'No active enrolled students in this class'
                    : 'No students match your roster search'
                }
                description={
                  courseEnrollments.length === 0
                    ? 'Students appear on the attendance roster once their registration is approved by an Administrator.'
                    : 'Clear the student name/ID search box to view the full class roster.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-3">Attendance Status</th>
                      <th className="py-3 px-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {visibleRosterEnrollments.map((enr) => {
                      const stu = students.find((s) => s.id === enr.studentId);
                      const current = draftStatus[enr.id] || 'PRESENT';
                      return (
                        <tr key={enr.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <Avatar src={stu?.photoUrl} name={enr.studentName} size="sm" />
                              <div>
                                <p className="font-semibold text-slate-900">{enr.studentName}</p>
                                <p className="text-[11px] font-mono text-slate-500">
                                  {enr.studentCode}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                              {STATUSES.map((st) => {
                                const active = current === st;
                                const activeStyle =
                                  st === 'PRESENT'
                                    ? 'bg-emerald-700 text-white'
                                    : st === 'ABSENT'
                                    ? 'bg-red-600 text-white'
                                    : st === 'LATE'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-blue-700 text-white';
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    disabled={!canMarkAttendance}
                                    onClick={() =>
                                      setDraftStatus((prev) => ({ ...prev, [enr.id]: st }))
                                    }
                                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                                      active
                                        ? activeStyle
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    {st.charAt(0) + st.slice(1).toLowerCase()}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              disabled={!canMarkAttendance}
                              value={draftRemarks[enr.id] || ''}
                              onChange={(e) =>
                                setDraftRemarks((prev) => ({ ...prev, [enr.id]: e.target.value }))
                              }
                              placeholder="Optional note (e.g., medical excuse, arrived late)"
                              className="w-full max-w-xs px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-700 disabled:bg-slate-50"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={reportStudentSearch}
                  onChange={(e) => setReportStudentSearch(e.target.value)}
                  placeholder="Filter by student name or ID..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>
              <select
                value={reportCourseFilter}
                onChange={(e) => setReportCourseFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
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
                value={reportDateFilter}
                onChange={(e) => setReportDateFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              />
              {reportDateFilter && (
                <button
                  type="button"
                  onClick={() => setReportDateFilter('')}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Clear date
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportReport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          {/* Per-Student Attendance Summary */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Student Attendance Summary</h3>
            </div>
            {studentSummary.length === 0 ? (
              <EmptyState
                title="No attendance records match your filters"
                description="Record daily attendance on the roster tab or clear your date filter."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-3">Course</th>
                      <th className="py-3 px-3 text-right">Present</th>
                      <th className="py-3 px-3 text-right">Late</th>
                      <th className="py-3 px-3 text-right">Excused</th>
                      <th className="py-3 px-3 text-right">Absent</th>
                      <th className="py-3 px-4 text-right">Attendance Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {studentSummary.map((row) => {
                      const rate =
                        row.total > 0
                          ? Math.round(((row.present + row.late) / row.total) * 100)
                          : 0;
                      return (
                        <tr key={`${row.studentId}_${row.courseName}`} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{row.studentName}</p>
                            <p className="text-[11px] font-mono text-slate-500">{row.studentCode}</p>
                          </td>
                          <td className="py-3 px-3 text-slate-700">{row.courseName}</td>
                          <td className="py-3 px-3 text-right font-mono text-emerald-700 tabular-nums">
                            {row.present}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-amber-700 tabular-nums">
                            {row.late}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-blue-700 tabular-nums">
                            {row.excused}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-red-700 tabular-nums">
                            {row.absent}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                            {rate}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Chronological Attendance Log */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Detailed Attendance Log</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Student</th>
                    <th className="py-2.5 px-3">Course</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Recorded By</th>
                    <th className="py-2.5 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredAttendance.slice(0, 30).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-700">
                        {formatDateShort(row.attendanceDate)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900">{row.studentName}</span>{' '}
                        <span className="font-mono text-[11px] text-slate-500">
                          · {row.studentCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.courseName}</td>
                      <td className="py-2.5 px-3">
                        <StatusLabel status={row.status} />
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.recordedByName}</td>
                      <td className="py-2.5 px-4 text-slate-500">{row.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
