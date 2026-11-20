import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Download,
  Edit3,
  History,
  KeyRound,
  Plus,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { exportRowsToCsv, removeStaffProfile, saveStaffProfile } from '../lib/zacmaService';
import { saveSecurityConfig } from '../lib/securityService';
import { ConfirmDialog, EmptyState, PaginationBar } from '../components/PortalUI';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import { formatDateShort, NavSection, RoleCode, StaffProfile, todayIsoDate } from '../types/zacma';

const GENERAL_STAFF_MODULE_OPTIONS: Array<{ id: NavSection; label: string; desc: string }> = [
  { id: 'students', label: 'Student Directory', desc: 'Non-financial student roster & intake support' },
  { id: 'courses', label: 'Courses & Schedules', desc: 'Training catalog & classroom schedules' },
  { id: 'attendance', label: 'Daily Attendance', desc: 'Record & review classroom attendance' },
  { id: 'messages', label: 'Internal Messages', desc: 'Institutional internal communication' },
];

export function StaffRolesView() {
  const { profile, effectiveRole, staffProfiles, roles, students, courses, pushToast } = usePortal();
  const [editing, setEditing] = useState<StaffProfile | 'NEW' | null>(null);
  const [deleting, setDeleting] = useState<StaffProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | RoleCode>('ALL');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffProfiles.filter((member) => {
      if (roleFilter !== 'ALL' && member.role !== roleFilter) return false;
      const linkedStu = member.linkedStudentId
        ? students.find((s) => s.id === member.linkedStudentId)
        : undefined;
      const assignedCourses = courses.filter(
        (c) => c.instructorId === member.uid || c.instructorName === member.fullName
      );
      if (courseFilter !== 'ALL') {
        const matchesAssignedCourse = assignedCourses.some((c) => c.id === courseFilter);
        const matchesLinkedStudentCourse = linkedStu?.courseId === courseFilter;
        if (!matchesAssignedCourse && !matchesLinkedStudentCourse) return false;
      }
      if (dateFilter && !(member.createdAt || '').startsWith(dateFilter)) return false;
      if (!q) return true;
      return (
        member.fullName.toLowerCase().includes(q) ||
        member.uid.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        (member.phone || '').toLowerCase().includes(q) ||
        member.role.toLowerCase().includes(q) ||
        (member.createdAt || '').toLowerCase().includes(q) ||
        (linkedStu?.studentCode || '').toLowerCase().includes(q) ||
        (linkedStu?.courseName || '').toLowerCase().includes(q) ||
        assignedCourses.some(
          (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
        )
      );
    });
  }, [staffProfiles, students, courses, search, roleFilter, courseFilter, dateFilter]);

  if (effectiveRole !== 'ADMIN') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <ShieldAlert className="w-7 h-7 text-red-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Administrator Access Only</h2>
        <p className="text-xs text-slate-500 mt-1">
          Staff accounts and RBAC role assignments can only be managed by an Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModuleAiToolbar moduleKey="staff" moduleLabel="Staff & HR Operations" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Staff, Accounts &amp; Role Permissions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Assign Admin, Accountant, Instructor, General Staff, and Student Portal roles enforced directly by database security rules.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('NEW')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Add Staff Member
        </button>
      </div>

      {/* Role Permissions Reference Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {roles.map((r) => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-mono font-bold text-blue-700">{r.code}</p>
            <h3 className="text-sm font-display font-bold text-slate-900 mt-1">{r.name}</h3>
            <p className="text-xs text-slate-600 leading-relaxed mt-2">{r.description}</p>
          </div>
        ))}
      </div>

      {/* Staff Search Bar (Name, ID, Course, Date, Role) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[210px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff name, ID, email, course, date..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'ALL' | RoleCode)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Roles</option>
          <option value="ADMIN">ADMIN</option>
          <option value="ACCOUNTANT">ACCOUNTANT</option>
          <option value="INSTRUCTOR">INSTRUCTOR</option>
          <option value="GENERAL_STAFF">GENERAL_STAFF</option>
          <option value="STUDENT">STUDENT</option>
        </select>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
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
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label="Filter staff accounts by created date"
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
        />
        {(search || roleFilter !== 'ALL' || courseFilter !== 'ALL' || dateFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setRoleFilter('ALL');
              setCourseFilter('ALL');
              setDateFilter('');
            }}
            className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Staff Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredStaff.length === 0 ? (
          <EmptyState
            title="No staff accounts match your search"
            description="Adjust your name, ID, course, role, or date filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-3">Email &amp; Phone</th>
                  <th className="py-3 px-3">Assigned Role</th>
                  <th className="py-3 px-3">Account Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredStaff.map((member) => {
                  const isSelf = member.uid === profile?.uid;
                  return (
                    <tr key={member.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">
                          {member.fullName}{' '}
                          {isSelf && <span className="text-blue-700 font-normal">(You)</span>}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500">
                          {member.uid}
                          {member.createdAt ? ` · Added ${formatDateShort(member.createdAt)}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <p>{member.email}</p>
                        <p className="text-[11px] font-mono text-slate-500">{member.phone || '—'}</p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-mono font-semibold text-slate-900">{member.role}</p>
                        {member.role === 'ACCOUNTANT' && member.canExportReports && (
                          <p className="text-[11px] text-blue-700 font-medium">Excel export authorized</p>
                        )}
                        {member.role === 'GENERAL_STAFF' && member.allowedModules && member.allowedModules.length > 0 && (
                          <p className="text-[11px] text-slate-500">
                            Modules: {member.allowedModules.join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold ${
                            member.isActive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {member.isActive ? 'Active' : 'Suspended'}
                        </span>
                        {member.lastLoginAt && (
                          <p className="text-[11px] text-slate-500 font-mono">
                            Last login: {formatDateShort(member.lastLoginAt)}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditing(member)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 rounded-md"
                            aria-label={`Edit ${member.fullName}`}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => setDeleting(member)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                              aria-label={`Remove ${member.fullName}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
      </div>

      {editing && profile && (
        <StaffModal
          initial={editing === 'NEW' ? null : editing}
          students={students}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await saveStaffProfile(data, {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            });
            pushToast('success', `Saved account ${data.fullName} (${data.role}).`);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove Staff Account"
        description={`Revoke portal access for ${deleting?.fullName} (${deleting?.email})?`}
        confirmLabel="Remove Staff"
        tone="danger"
        loading={busy}
        onConfirm={async () => {
          if (!deleting || !profile) return;
          setBusy(true);
          try {
            await removeStaffProfile(deleting, {
              uid: profile.uid,
              fullName: profile.fullName,
              role: profile.role,
            });
            pushToast('info', `Removed ${deleting.fullName}.`);
            setDeleting(null);
          } catch (err) {
            pushToast('error', err instanceof Error ? err.message : 'Unable to remove staff.');
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function StaffModal({
  initial,
  students,
  onClose,
  onSave,
}: {
  initial: StaffProfile | null;
  students: Array<{ id: string; studentCode: string; fullName: string }>;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    email: string;
    fullName: string;
    phone?: string;
    role: RoleCode;
    linkedStudentId?: string;
    allowedModules?: NavSection[];
    canExportReports?: boolean;
    isActive: boolean;
    createdAt?: string;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(initial?.fullName || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [role, setRole] = useState<RoleCode>(initial?.role || 'ACCOUNTANT');
  const [linkedStudentId, setLinkedStudentId] = useState(initial?.linkedStudentId || '');
  const [allowedModules, setAllowedModules] = useState<NavSection[]>(
    initial?.allowedModules && initial.allowedModules.length > 0
      ? initial.allowedModules
      : ['students', 'courses', 'attendance', 'messages']
  );
  const [canExportReports, setCanExportReports] = useState(Boolean(initial?.canExportReports));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const toggleModule = (mod: NavSection) => {
    setAllowedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSaving(true);
    await onSave({
      id: initial?.id,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      role,
      linkedStudentId: role === 'STUDENT' ? linkedStudentId || undefined : undefined,
      allowedModules: role === 'GENERAL_STAFF' ? allowedModules : undefined,
      canExportReports: role === 'ACCOUNTANT' ? canExportReports : undefined,
      isActive,
      createdAt: initial?.createdAt,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-base font-display font-bold text-slate-900">
            {initial ? 'Edit Portal Account Role' : 'Add Portal Account'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+251 9..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Portal Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleCode)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ADMIN">ADMIN — Full Financial &amp; Governance Access</option>
              <option value="ACCOUNTANT">ACCOUNTANT — Registration &amp; Fee Collection</option>
              <option value="INSTRUCTOR">INSTRUCTOR — Classes &amp; Attendance Only</option>
              <option value="GENERAL_STAFF">GENERAL_STAFF — Campus Operations (No Finance)</option>
              <option value="STUDENT">STUDENT — Isolated Student Self-Service Portal</option>
            </select>
          </div>
          {role === 'STUDENT' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked ZACMA Student Record
              </label>
              <select
                value={linkedStudentId}
                onChange={(e) => setLinkedStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Select student to bind...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.studentCode} — {s.fullName}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Student portal access is strictly isolated to this single student record.
              </p>
            </div>
          )}
          {role === 'ACCOUNTANT' && (
            <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 space-y-1.5">
              <label className="inline-flex items-start gap-2.5 text-xs font-semibold text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canExportReports}
                  onChange={(e) => setCanExportReports(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-700"
                />
                <span>
                  Authorize Financial Excel (.xlsx) Report Exports
                  <span className="block text-[11px] font-normal text-slate-600 mt-0.5">
                    By default only Administrators can export institutional Excel workbooks. Enable this to delegate export permission with full audit tracking.
                  </span>
                </span>
              </label>
            </div>
          )}
          {role === 'GENERAL_STAFF' && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Assigned Operational Modules (Non-Financial Only)
                </p>
                <p className="text-[11px] text-slate-500">
                  Dashboard is always enabled. Financial ledgers, payments, and exports remain strictly restricted.
                </p>
              </div>
              <div className="space-y-2">
                {GENERAL_STAFF_MODULE_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={allowedModules.includes(opt.id)}
                      onChange={() => toggleModule(opt.id)}
                      className="mt-0.5 rounded border-slate-300 text-blue-700"
                    />
                    <span>
                      <span className="font-semibold text-slate-900">{opt.label}</span>
                      <span className="block text-[11px] text-slate-500">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-blue-700"
            />
            Account active
          </label>
          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2.5">
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
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
            >
              {saving ? 'Saving...' : 'Save Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AuditLogsView() {
  const { profile, effectiveRole, auditLogs, loginHistory, securityConfig, pushToast } = usePortal();
  const [subTab, setSubTab] = useState<'audit' | 'logins' | 'security'>('audit');
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const [loginSearch, setLoginSearch] = useState('');
  const [loginEventFilter, setLoginEventFilter] = useState('ALL');
  const [loginPage, setLoginPage] = useState(1);

  // Security & Session Policy form state
  const [adminTimeout, setAdminTimeout] = useState(securityConfig.adminTimeoutMinutes);
  const [userTimeout, setUserTimeout] = useState(securityConfig.userTimeoutMinutes);
  const [warningSeconds, setWarningSeconds] = useState(securityConfig.warningBeforeSeconds);
  const [maxFailed, setMaxFailed] = useState(securityConfig.maxFailedLogins);
  const [lockoutMins, setLockoutMins] = useState(securityConfig.lockoutMinutes);
  const [auditExports, setAuditExports] = useState(securityConfig.enforceAuditOnExports);
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    setAdminTimeout(securityConfig.adminTimeoutMinutes);
    setUserTimeout(securityConfig.userTimeoutMinutes);
    setWarningSeconds(securityConfig.warningBeforeSeconds);
    setMaxFailed(securityConfig.maxFailedLogins);
    setLockoutMins(securityConfig.lockoutMinutes);
    setAuditExports(securityConfig.enforceAuditOnExports);
  }, [securityConfig]);

  if (effectiveRole !== 'ADMIN') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <ShieldAlert className="w-7 h-7 text-red-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Administrator Access Only</h2>
        <p className="text-xs text-slate-500 mt-1">
          The immutable financial audit trail, login history, and session security controls are restricted to Administrators.
        </p>
      </div>
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (entityFilter !== 'ALL' && l.entityType !== entityFilter) return false;
      if (dateFilter && !(l.createdAt || '').startsWith(dateFilter)) return false;
      if (!q) return true;
      return (
        l.actorName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q) ||
        (l.createdAt || '').toLowerCase().includes(q)
      );
    });
  }, [auditLogs, search, entityFilter, dateFilter]);

  const filteredLogins = useMemo(() => {
    const q = loginSearch.trim().toLowerCase();
    return loginHistory.filter((item) => {
      if (loginEventFilter !== 'ALL' && item.eventType !== loginEventFilter) return false;
      if (!q) return true;
      return (
        item.fullName.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.role.toLowerCase().includes(q) ||
        item.eventType.toLowerCase().includes(q) ||
        (item.detail || '').toLowerCase().includes(q)
      );
    });
  }, [loginHistory, loginSearch, loginEventFilter]);

  const paginated = filtered.slice((page - 1) * 12, page * 12);
  const paginatedLogins = filteredLogins.slice((loginPage - 1) * 12, loginPage * 12);

  const handleExport = () => {
    exportRowsToCsv(
      `zacma-audit-trail-${todayIsoDate()}.csv`,
      ['Timestamp', 'Actor', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Summary'],
      filtered.map((l) => [
        l.createdAt,
        l.actorName,
        l.actorRole,
        l.action,
        l.entityType,
        l.entityId,
        l.summary,
      ])
    );
    pushToast('success', 'Audit trail exported to CSV.');
  };

  const handleSaveSecurityPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingPolicy(true);
    try {
      await saveSecurityConfig(
        {
          adminTimeoutMinutes: Number(adminTimeout) || 10,
          userTimeoutMinutes: Number(userTimeout) || 15,
          warningBeforeSeconds: Number(warningSeconds) || 60,
          maxFailedLogins: Number(maxFailed) || 5,
          lockoutMinutes: Number(lockoutMins) || 15,
          enforceAuditOnExports: auditExports,
        },
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        }
      );
      pushToast('success', 'Session timeout and security policy updated.');
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Unable to save security configuration.'
      );
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Audit Trail, Login History &amp; Session Security
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Append-only financial &amp; governance logs, authentication session history, and inactivity auto-logout controls.
          </p>
        </div>
        {subTab === 'audit' && (
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Export Audit CSV
          </button>
        )}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'audit' as const, label: `Immutable Audit Trail (${auditLogs.length})`, icon: <History className="w-3.5 h-3.5" /> },
          { id: 'logins' as const, label: `Login & Session History (${loginHistory.length})`, icon: <KeyRound className="w-3.5 h-3.5" /> },
          { id: 'security' as const, label: 'Session & Security Policy', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
              subTab === t.id
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Immutable Audit Trail */}
      {subTab === 'audit' && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search actor, action, reference, summary..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <select
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Domains</option>
              <option value="payment">Payments</option>
              <option value="financial_adjustment">Refunds &amp; Adjustments</option>
              <option value="report">Excel Report Exports</option>
              <option value="student">Students</option>
              <option value="course">Courses</option>
              <option value="expense">Expenses</option>
              <option value="attendance">Attendance</option>
              <option value="profile">Staff Roles</option>
              <option value="session">Sessions &amp; Auth</option>
              <option value="security">Security Policies</option>
            </select>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter audit logs by date"
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            />
            {(search || entityFilter !== 'ALL' || dateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setEntityFilter('ALL');
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
            {paginated.length === 0 ? (
              <EmptyState
                title="No audit events match your filter"
                description="System actions will appear here automatically."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-3">Actor</th>
                      <th className="py-3 px-3">Action</th>
                      <th className="py-3 px-4">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginated.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
                          {formatDateShort(log.createdAt)} ·{' '}
                          {new Date(log.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <p className="font-semibold text-slate-900">{log.actorName}</p>
                          <p className="text-[11px] font-mono text-slate-500">{log.actorRole}</p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <p className="font-mono font-semibold text-blue-700">{log.action}</p>
                          <p className="text-[11px] text-slate-500">{log.entityType}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-700 leading-relaxed">{log.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={page}
              pageSize={12}
              total={filtered.length}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {/* Tab 2: Login & Session History */}
      {subTab === 'logins' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={loginSearch}
                onChange={(e) => {
                  setLoginSearch(e.target.value);
                  setLoginPage(1);
                }}
                placeholder="Search user name, email, role..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <select
              value={loginEventFilter}
              onChange={(e) => {
                setLoginEventFilter(e.target.value);
                setLoginPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Session Events</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Manual Logout</option>
              <option value="SESSION_EXPIRED">Inactivity Auto-Logout</option>
              <option value="FAILED_LOGIN">Failed Login</option>
              <option value="LOCKOUT">Account Lockout</option>
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {paginatedLogins.length === 0 ? (
              <EmptyState
                title="No login history recorded yet"
                description="Sign-ins, manual logouts, and inactivity expirations will appear here automatically."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-3">Account &amp; Role</th>
                      <th className="py-3 px-3">Event</th>
                      <th className="py-3 px-3">Auth Method</th>
                      <th className="py-3 px-4">Session Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedLogins.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 whitespace-nowrap tabular-nums">
                          {formatDateShort(ev.createdAt)} ·{' '}
                          {new Date(ev.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-slate-900">{ev.fullName}</p>
                          <p className="text-[11px] text-slate-500">
                            {ev.email} · <span className="font-mono">{ev.role}</span>
                          </p>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono font-semibold">
                          <span
                            className={
                              ev.eventType === 'LOGIN'
                                ? 'text-emerald-700'
                                : ev.eventType === 'SESSION_EXPIRED' || ev.eventType === 'LOCKOUT'
                                ? 'text-red-600'
                                : 'text-slate-700'
                            }
                          >
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {ev.authMethod}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{ev.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationBar
              page={loginPage}
              pageSize={12}
              total={filteredLogins.length}
              onPageChange={setLoginPage}
            />
          </div>
        </div>
      )}

      {/* Tab 3: Session & Security Policy Configuration */}
      {subTab === 'security' && (
        <form
          onSubmit={(e) => void handleSaveSecurityPolicy(e)}
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-5"
        >
          <div className="flex items-start gap-3 pb-4 border-b border-slate-200">
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-display font-bold text-slate-900">
                Inactivity Auto-Logout &amp; Account Lockout Policy
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Controls server-side HttpOnly session TTL, role-based idle timeouts, warning countdowns, and failed login protection across all portals.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Admin &amp; Accountant Idle Timeout (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={adminTimeout}
                onChange={(e) => setAdminTimeout(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Recommended: 10 minutes for financial staff.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instructor, Staff &amp; Student Idle Timeout (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={userTimeout}
                onChange={(e) => setUserTimeout(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Recommended: 15 minutes for standard portals.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Warning Countdown (seconds)
              </label>
              <input
                type="number"
                min={15}
                max={300}
                required
                value={warningSeconds}
                onChange={(e) => setWarningSeconds(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Failed Logins
              </label>
              <input
                type="number"
                min={3}
                max={20}
                required
                value={maxFailed}
                onChange={(e) => setMaxFailed(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Temporary Lockout (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={lockoutMins}
                onChange={(e) => setLockoutMins(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={auditExports}
              onChange={(e) => setAuditExports(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-700"
            />
            <span>
              <span className="font-semibold text-slate-900">
                Enforce Immutable Audit Logging on All Excel (.xlsx) Exports
              </span>
              <span className="block text-[11px] text-slate-500">
                Records exporter identity, report type, active filters, and row count in the audit trail.
              </span>
            </span>
          </label>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
            <p className="text-[11px] text-slate-500">
              {securityConfig.updatedByName
                ? `Last updated by ${securityConfig.updatedByName} on ${formatDateShort(securityConfig.updatedAt)}`
                : 'Default ZACMA enterprise security profile active'}
            </p>
            <button
              type="submit"
              disabled={savingPolicy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {savingPolicy ? 'Saving Policy...' : 'Save Security Policy'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

