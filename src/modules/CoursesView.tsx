import React, { useMemo, useState } from 'react';
import { Calendar, Clock, Edit3, Plus, Search, Sparkles, Users, X } from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { saveCourse } from '../lib/zacmaService';
import {
  CANONICAL_ZACMA_COURSES,
  ensureCanonicalZacmaCourses,
} from '../lib/registrationService';
import { EmptyState, TableSkeleton } from '../components/PortalUI';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import { Course, formatEtb } from '../types/zacma';

export function CoursesView() {
  const {
    profile,
    effectiveRole,
    dataLoading,
    courses,
    enrollments,
    staffProfiles,
    pushToast,
  } = usePortal();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [editingCourse, setEditingCourse] = useState<Course | 'NEW' | null>(null);
  const [syncingCanonical, setSyncingCanonical] = useState(false);

  const isAdmin = effectiveRole === 'ADMIN';
  const isInstructor = effectiveRole === 'INSTRUCTOR';

  const missingCanonicalCount = useMemo(() => {
    const names = new Set(courses.map((c) => c.name.trim().toLowerCase()));
    const ids = new Set(courses.map((c) => c.id));
    return CANONICAL_ZACMA_COURSES.filter(
      (c) => !ids.has(c.id) && !names.has(c.name.trim().toLowerCase())
    ).length;
  }, [courses]);

  const categories = useMemo(() => {
    return Array.from(new Set(courses.map((c) => c.category))).sort();
  }, [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.instructorName || '').toLowerCase().includes(q)
      );
    });
  }, [courses, search, categoryFilter]);

  const instructors = useMemo(
    () => staffProfiles.filter((s) => s.role === 'INSTRUCTOR' && s.isActive),
    [staffProfiles]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            {isInstructor ? 'Assigned Training Classes' : 'Course & Tuition Fee Catalog'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin
              ? 'Manage ZACMA training programs, ETB tuition fees, class schedules, and assigned instructors.'
              : isInstructor
              ? 'View training tracks, weekly schedules, and enrolled cohorts.'
              : 'Read-only institutional course catalog and locked tuition fee schedules.'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {missingCanonicalCount > 0 && profile && (
              <button
                type="button"
                disabled={syncingCanonical}
                onClick={async () => {
                  setSyncingCanonical(true);
                  try {
                    const added = await ensureCanonicalZacmaCourses(courses, {
                      uid: profile.uid,
                      fullName: profile.fullName,
                      role: profile.role,
                    });
                    pushToast(
                      'success',
                      added > 0
                        ? `Added ${added} missing ZACMA Technology courses to the catalog.`
                        : 'All 18 canonical ZACMA courses are already active.'
                    );
                  } catch (err) {
                    pushToast(
                      'error',
                      err instanceof Error ? err.message : 'Unable to sync ZACMA courses.'
                    );
                  } finally {
                    setSyncingCanonical(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#172DEB] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {syncingCanonical
                  ? 'Syncing...'
                  : `Sync ${missingCanonicalCount} ZACMA Course${missingCanonicalCount > 1 ? 's' : ''}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditingCourse('NEW')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add New Course
            </button>
          </div>
        )}
      </div>

      <ModuleAiToolbar moduleKey="courses" moduleLabel="Courses & Curriculum" />

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search course name, code, instructor..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {dataLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl">
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState
            title="No courses found"
            description="Try clearing your filter or add a new ZACMA training course."
            actionLabel={isAdmin ? 'Create Course' : undefined}
            onAction={isAdmin ? () => setEditingCourse('NEW') : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((course) => {
            const activeCount = enrollments.filter(
              (e) => e.courseId === course.id && (e.status === 'ACTIVE' || e.status === 'COMPLETED')
            ).length;
            const pendingCount = enrollments.filter(
              (e) => e.courseId === course.id && e.status === 'PENDING'
            ).length;

            return (
              <div
                key={course.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono font-semibold text-blue-700">{course.code}</span> ·{' '}
                        {course.category}
                      </p>
                      <h3 className="text-base font-display font-bold text-slate-900 mt-1">
                        {course.name}
                      </h3>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setEditingCourse(course)}
                        className="p-1.5 text-slate-400 hover:text-blue-700 rounded-md transition-colors"
                        aria-label={`Edit ${course.name}`}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {course.description && (
                    <p className="text-xs text-slate-600 leading-relaxed mt-2.5 line-clamp-2">
                      {course.description}
                    </p>
                  )}

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{course.schedule}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {course.durationWeeks} weeks · Instructor:{' '}
                        <span className="font-medium text-slate-900">
                          {course.instructorName || 'Unassigned'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="tabular-nums">
                        {activeCount} active student{activeCount === 1 ? '' : 's'}
                        {!isInstructor && pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {!isInstructor && (
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-slate-500">Standard Tuition Fee</p>
                      <p className="text-base font-mono font-bold text-slate-900 tabular-nums">
                        {formatEtb(course.feeEtb)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        course.isActive ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {course.isActive ? 'Active' : 'Archived'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingCourse && profile && (
        <CourseFormModal
          initial={editingCourse === 'NEW' ? null : editingCourse}
          instructors={instructors}
          onClose={() => setEditingCourse(null)}
          onSaved={async (payload) => {
            try {
              await saveCourse(payload, {
                uid: profile.uid,
                fullName: profile.fullName,
                role: profile.role,
              });
              pushToast(
                'success',
                payload.id ? `Updated course ${payload.name}.` : `Created course ${payload.name}.`
              );
              setEditingCourse(null);
            } catch (err) {
              pushToast('error', err instanceof Error ? err.message : 'Failed to save course.');
            }
          }}
        />
      )}
    </div>
  );
}

function CourseFormModal({
  initial,
  instructors,
  onClose,
  onSaved,
}: {
  initial: Course | null;
  instructors: ReturnType<typeof usePortal>['staffProfiles'];
  onClose: () => void;
  onSaved: (payload: {
    id?: string;
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
    createdAt?: string;
  }) => Promise<void>;
}) {
  const [code, setCode] = useState(initial?.code || 'ZAC-CT201');
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState(initial?.category || 'Short-Term Training');
  const [durationWeeks, setDurationWeeks] = useState(String(initial?.durationWeeks || 8));
  const [feeEtb, setFeeEtb] = useState(String(initial?.feeEtb || 10000));
  const [schedule, setSchedule] = useState(initial?.schedule || 'Mon, Wed, Fri · 14:00–16:30');
  const [instructorId, setInstructorId] = useState(initial?.instructorId || instructors[0]?.uid || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || Number(feeEtb) <= 0) return;
    setSaving(true);
    const chosenInstructor = instructors.find((i) => i.uid === instructorId);
    await onSaved({
      id: initial?.id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category: category.trim(),
      durationWeeks: Math.max(1, Number(durationWeeks)),
      feeEtb: Number(feeEtb),
      schedule: schedule.trim(),
      instructorId: chosenInstructor?.uid || initial?.instructorId,
      instructorName: chosenInstructor?.fullName || initial?.instructorName,
      description: description.trim(),
      isActive,
      createdAt: initial?.createdAt,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-base font-display font-bold text-slate-900">
            {initial ? 'Edit Training Course' : 'Create Training Course'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Course Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Course Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Mobile App Development"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Duration (Weeks)
              </label>
              <input
                type="number"
                required
                min={1}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tuition Fee (ETB)
              </label>
              <input
                type="number"
                required
                min={1}
                step="0.01"
                value={feeEtb}
                onChange={(e) => setFeeEtb(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Class Schedule</label>
              <input
                type="text"
                required
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Instructor
              </label>
              <select
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Unassigned</option>
                {instructors.map((inst) => (
                  <option key={inst.uid} value={inst.uid}>
                    {inst.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            Course open for student enrollment
          </label>

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
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
