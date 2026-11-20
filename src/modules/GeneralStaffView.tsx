import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Search, ShieldCheck, Users } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { EmptyState, StatusLabel } from '../components/PortalUI';
import { formatDateShort, NavSection, todayIsoDate } from '../types/zacma';

export function GeneralStaffView({ onNavigate }: { onNavigate: (tab: NavSection) => void }) {
  const { courses, students, enrollments, attendance } = usePortal();
  const today = todayIsoDate();

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  const activeCourses = courses.filter((c) => c.isActive);
  const activeStudents = students.filter((s) => s.registrationStatus === 'APPROVED');
  const pendingRegistrations = students.filter((s) => s.registrationStatus === 'PENDING');
  const todayAttendance = attendance.filter((a) => a.attendanceDate === today);
  const presentToday = todayAttendance.filter((a) => a.status === 'PRESENT').length;

  const hasFilter = Boolean(search.trim() || courseFilter !== 'ALL' || dateFilter);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCourses.filter((c) => {
      if (courseFilter !== 'ALL' && c.id !== courseFilter) return false;
      if (dateFilter && !(c.createdAt || '').startsWith(dateFilter)) {
        // Still allow courses that have attendance or enrollments on that date
        const hasActivityOnDate =
          attendance.some((a) => a.courseId === c.id && a.attendanceDate === dateFilter) ||
          activeStudents.some((s) => s.courseId === c.id && s.enrollmentDate === dateFilter);
        if (!hasActivityOnDate) return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.instructorName || '').toLowerCase().includes(q)
      );
    });
  }, [activeCourses, activeStudents, attendance, search, courseFilter, dateFilter]);

  const filteredAttendance = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendance.filter((row) => {
      if (courseFilter !== 'ALL' && row.courseId !== courseFilter) return false;
      if (dateFilter && row.attendanceDate !== dateFilter) return false;
      if (!q) return true;
      return (
        row.studentName.toLowerCase().includes(q) ||
        row.studentCode.toLowerCase().includes(q) ||
        row.courseName.toLowerCase().includes(q) ||
        row.attendanceDate.toLowerCase().includes(q)
      );
    });
  }, [attendance, search, courseFilter, dateFilter]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeStudents.filter((s) => {
      if (courseFilter !== 'ALL' && s.courseId !== courseFilter) return false;
      if (dateFilter && s.enrollmentDate !== dateFilter) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        s.courseName.toLowerCase().includes(q) ||
        s.enrollmentDate.toLowerCase().includes(q)
      );
    });
  }, [activeStudents, search, courseFilter, dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            General Staff Operations Workspace
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Campus course schedules, student directory overview, and attendance coordination. Financial records are isolated to Finance and Admin roles.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('students')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            Student Directory
          </button>
          <button
            type="button"
            onClick={() => onNavigate('courses')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Course Catalog
          </button>
        </div>
      </div>

      {/* Operational KPIs (strictly non-financial) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Active Courses</span>
            <BookOpen className="w-4 h-4 text-blue-700" />
          </div>
          <p className="text-2xl font-display font-bold text-slate-900 tabular-nums">
            {activeCourses.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Scheduled ZACMA training programs</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Active Enrolled Students</span>
            <Users className="w-4 h-4 text-blue-700" />
          </div>
          <p className="text-2xl font-display font-bold text-slate-900 tabular-nums">
            {activeStudents.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {pendingRegistrations.length} registration{pendingRegistrations.length === 1 ? '' : 's'} pending review
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Attendance Logged Today</span>
            <ClipboardCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-2xl font-display font-bold text-slate-900 tabular-nums">
            {todayAttendance.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {presentToday} present on {formatDateShort(today)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Role Access Scope</span>
            <ShieldCheck className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-base font-display font-bold text-slate-900 mt-1">Operations Only</p>
          <p className="text-xs text-slate-500 mt-1">Zero financial ledger or fee modification access</p>
        </div>
      </div>

      {/* Search by Name, ID, Course, and Date */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, student ID, course, date..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          />
        </div>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Courses</option>
          {activeCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label="Filter operations by date"
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        />
        {hasFilter && (
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

      {hasFilter && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Matching Active Students ({filteredStudents.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('students')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Open Directory <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {filteredStudents.length === 0 ? (
            <div className="px-5 py-4 text-xs text-slate-500">
              No active students match your current name, ID, course, or date filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredStudents.slice(0, 6).map((stu) => (
                <div key={stu.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{stu.fullName}</p>
                    <p className="text-[11px] text-slate-500">
                      <span className="font-mono">{stu.studentCode}</span> · {stu.courseName} · Enrolled{' '}
                      {formatDateShort(stu.enrollmentDate)}
                    </p>
                  </div>
                  <StatusLabel status={stu.registrationStatus} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Campus Schedules + Recent Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-bold text-slate-900">Campus Training Schedule</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {filteredCourses.length === 0 ? (
            <EmptyState
              title="No courses match your search"
              description="Try clearing the course or date filter above."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredCourses.slice(0, 7).map((course) => {
                const count = enrollments.filter(
                  (e) => e.courseId === course.id && e.status === 'ACTIVE'
                ).length;
                return (
                  <div key={course.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{course.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="font-mono">{course.code}</span> · {course.schedule}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                        {count} active
                      </p>
                      <p className="text-[11px] text-slate-500">{course.instructorName || 'Assigned Faculty'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent Campus Attendance</h2>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Attendance log <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {filteredAttendance.length === 0 ? (
            <EmptyState
              title="No attendance records match"
              description="Attendance entries recorded by instructors will appear here."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAttendance.slice(0, 7).map((row) => (
                <div key={row.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{row.studentName}</p>
                    <p className="text-[11px] text-slate-500">
                      <span className="font-mono">{row.studentCode}</span> · {row.courseName} ·{' '}
                      {formatDateShort(row.attendanceDate)}
                    </p>
                  </div>
                  <StatusLabel status={row.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
