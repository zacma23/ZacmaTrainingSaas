import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  Headphones,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import {
  DEFAULT_ZACMA_TENANT_ID,
  INSTITUTE_ROLE_LABELS,
  LegacyMigrationResult,
  migrateLegacyZacmaRecordsToTenant,
  PLATFORM_ROLE_LABELS,
  sendSubscriptionExpiryReminder,
  updateGlobalPlatformSettings,
  updateSupportTicket,
  updateTenantLimits,
  updateTenantModules,
  updateUserPlatformRole,
} from '../../lib/saasService';
import { formatAddisDateTimeDual } from '../../lib/ethiopianCalendar';
import { runBackendAiSecurityAudit } from '../../lib/aiWorkspaceService';
import {
  AiModelId,
  AiSecurityAuditScenarioResult,
  formatDateShort,
  PlatformGlobalSettings,
  PlatformRole,
  SaasModuleCode,
  StaffProfile,
  SupportTicket,
  TenantRecord,
} from '../../types/zacma';

// ============================================================================
// SECTION 7: PLATFORM USERS & INSTITUTE ADMINS
// ============================================================================
export function PlatformUsersView() {
  const {
    profile,
    platformRole,
    tenants,
    allPlatformProfiles,
    pushToast,
  } = usePortal();

  const [tab, setTab] = useState<'PLATFORM' | 'INSTITUTE_ADMINS' | 'ALL'>('PLATFORM');
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('ALL');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const tenantNameMap = useMemo(() => {
    const m = new Map<string, string>();
    tenants.forEach((t) => m.set(t.tenantId, t.name));
    return m;
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPlatformProfiles.filter((p) => {
      if (tab === 'PLATFORM' && !p.platformRole) return false;
      if (tab === 'INSTITUTE_ADMINS' && p.role !== 'ADMIN' && p.role !== 'MANAGER') return false;
      const tid = p.tenantId || DEFAULT_ZACMA_TENANT_ID;
      if (tenantFilter !== 'ALL' && tid !== tenantFilter) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.platformRole || '').toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (tenantNameMap.get(tid) || tid).toLowerCase().includes(q)
      );
    });
  }, [allPlatformProfiles, tab, search, tenantFilter, tenantNameMap]);

  const platformUsersCount = allPlatformProfiles.filter((p) => Boolean(p.platformRole)).length;
  const instituteAdminsCount = allPlatformProfiles.filter((p) => p.role === 'ADMIN').length;

  const handleAssignPlatformRole = async (target: StaffProfile, nextRole: string) => {
    if (!profile || platformRole !== 'SUPER_ADMIN') {
      pushToast('error', 'Only a Platform Super Admin can change platform roles.');
      return;
    }
    if (target.uid === profile.uid && nextRole !== 'SUPER_ADMIN') {
      pushToast('error', 'You cannot demote your own active Super Admin account.');
      return;
    }
    setUpdatingUid(target.id);
    try {
      await updateUserPlatformRole(
        target,
        nextRole ? (nextRole as PlatformRole) : null,
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
          platformRole,
        }
      );
      pushToast(
        'success',
        nextRole
          ? `Assigned ${PLATFORM_ROLE_LABELS[nextRole as PlatformRole]} to ${target.fullName}.`
          : `Revoked platform role from ${target.fullName}.`
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to update platform role.');
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900">
            Platform Users &amp; Institute Administrators
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Govern ZACMA platform-level operators (Super Admin, Platform Admin, Support, Finance) and audit Institute Administrators across all tenants.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-medium">
            Platform Operators: <span className="font-mono font-bold tabular-nums">{platformUsersCount}</span>
          </div>
          <div className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-medium">
            Institute Admins: <span className="font-mono font-bold tabular-nums">{instituteAdminsCount}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg w-fit">
          {(
            [
              { id: 'PLATFORM', label: 'ZACMA Platform Team' },
              { id: 'INSTITUTE_ADMINS', label: 'Institute Admins & Managers' },
              { id: 'ALL', label: 'All Portal Accounts' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, role..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
            />
          </div>
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-blue-700"
          >
            <option value="ALL">All Institutes</option>
            {tenants.map((t) => (
              <option key={t.tenantId} value={t.tenantId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">User Account</th>
                <th className="px-4 py-3">Assigned Institute</th>
                <th className="px-4 py-3">Institute Role</th>
                <th className="px-4 py-3">Platform Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Platform Access Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No user accounts match the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const tid = p.tenantId || DEFAULT_ZACMA_TENANT_ID;
                  const tName = tenantNameMap.get(tid) || tid;
                  const isSelf = p.uid === profile?.uid;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {p.fullName} {isSelf && <span className="text-[10px] text-blue-700 font-bold">(You)</span>}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">{p.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{tName}</p>
                        <p className="text-[10px] font-mono text-slate-400">{tid}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {INSTITUTE_ROLE_LABELS[p.role] || p.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.platformRole ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-white font-semibold text-[11px]">
                            <ShieldCheck className="w-3 h-3 text-amber-400" />
                            {PLATFORM_ROLE_LABELS[p.platformRole]}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Tenant Only</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                            p.isActive ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.isActive ? 'bg-emerald-600' : 'bg-red-600'
                            }`}
                          />
                          {p.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {platformRole === 'SUPER_ADMIN' ? (
                          <select
                            disabled={updatingUid === p.id || isSelf}
                            value={p.platformRole || ''}
                            onChange={(e) => void handleAssignPlatformRole(p, e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 disabled:opacity-50 focus:outline-none focus:border-blue-700"
                          >
                            <option value="">None (Institute User)</option>
                            <option value="SUPER_ADMIN">Super Admin (Owner)</option>
                            <option value="PLATFORM_ADMIN">Platform Admin</option>
                            <option value="PLATFORM_SUPPORT">Platform Support</option>
                            <option value="PLATFORM_FINANCE">Platform Finance</option>
                          </select>
                        ) : (
                          <span className="text-[11px] text-slate-400">Super Admin Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 9: GLOBAL PLATFORM SETTINGS
// ============================================================================
export function GlobalSettingsView() {
  const { profile, platformRole, platformSettings, pushToast } = usePortal();

  const [form, setForm] = useState<Omit<PlatformGlobalSettings, 'id' | 'updatedAt' | 'updatedBy' | 'updatedByName'>>({
    platformName: platformSettings.platformName,
    supportEmail: platformSettings.supportEmail,
    supportPhone: platformSettings.supportPhone,
    defaultCurrency: platformSettings.defaultCurrency,
    defaultLanguage: platformSettings.defaultLanguage,
    defaultTrialDays: platformSettings.defaultTrialDays,
    gracePeriodDays: platformSettings.gracePeriodDays,
    autoSuspendExpiredDays: platformSettings.autoSuspendExpiredDays,
    allowSelfSignupInstitutes: platformSettings.allowSelfSignupInstitutes,
    enforceSupportSessionReason: platformSettings.enforceSupportSessionReason,
    maxSupportSessionMinutes: platformSettings.maxSupportSessionMinutes,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      platformName: platformSettings.platformName,
      supportEmail: platformSettings.supportEmail,
      supportPhone: platformSettings.supportPhone,
      defaultCurrency: platformSettings.defaultCurrency,
      defaultLanguage: platformSettings.defaultLanguage,
      defaultTrialDays: platformSettings.defaultTrialDays,
      gracePeriodDays: platformSettings.gracePeriodDays,
      autoSuspendExpiredDays: platformSettings.autoSuspendExpiredDays,
      allowSelfSignupInstitutes: platformSettings.allowSelfSignupInstitutes,
      enforceSupportSessionReason: platformSettings.enforceSupportSessionReason,
      maxSupportSessionMinutes: platformSettings.maxSupportSessionMinutes,
    });
  }, [platformSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !platformRole) return;
    if (platformRole !== 'SUPER_ADMIN' && platformRole !== 'PLATFORM_ADMIN') {
      pushToast('error', 'Only Super Admin or Platform Admin can update global platform settings.');
      return;
    }
    setSaving(true);
    try {
      await updateGlobalPlatformSettings(form, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('success', 'Global SaaS platform settings saved and audit-logged.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to save global settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-display font-bold text-slate-900">
          Global Platform Settings
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure platform-wide SaaS defaults for new institute onboarding, subscription lifecycle rules, and support governance.
        </p>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        {/* Platform Identity & Support Contact */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Settings className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-display font-bold text-slate-900">
              Platform Identity &amp; Defaults
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SaaS Platform Brand Name
              </label>
              <input
                type="text"
                required
                value={form.platformName}
                onChange={(e) => setForm({ ...form, platformName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Platform Support Email
              </label>
              <input
                type="email"
                required
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Platform Support Phone
              </label>
              <input
                type="text"
                required
                value={form.supportPhone}
                onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Tenant Currency
              </label>
              <select
                value={form.defaultCurrency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultCurrency: e.target.value as PlatformGlobalSettings['defaultCurrency'],
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
              >
                <option value="ETB">ETB — Ethiopian Birr</option>
                <option value="USD">USD — US Dollar</option>
                <option value="KES">KES — Kenyan Shilling</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Platform Language
              </label>
              <input
                type="text"
                value={form.defaultLanguage}
                onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
          </div>
        </div>

        {/* Subscription Lifecycle & Governance Policies */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Shield className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-display font-bold text-slate-900">
              Trial, Billing Grace Period &amp; Support Access Policies
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Free Trial (Days)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={form.defaultTrialDays}
                onChange={(e) => setForm({ ...form, defaultTrialDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Renewal Grace Period (Days)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={form.gracePeriodDays}
                onChange={(e) => setForm({ ...form, gracePeriodDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Auto-Suspend Overdue (Days)
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={form.autoSuspendExpiredDays}
                onChange={(e) => setForm({ ...form, autoSuspendExpiredDays: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Max Support Session (Min)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={form.maxSupportSessionMinutes}
                onChange={(e) => setForm({ ...form, maxSupportSessionMinutes: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
          </div>

          <div className="pt-2 space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enforceSupportSessionReason}
                onChange={(e) => setForm({ ...form, enforceSupportSessionReason: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Enforce Mandatory Reason &amp; Audit Trail on All Support Access Sessions
                </p>
                <p className="text-[11px] text-slate-500">
                  Prevents silent impersonation — every support entry into a client institute requires a written ticket reason, displays a visible countdown banner, and logs to both platform and tenant audit trails.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowSelfSignupInstitutes}
                onChange={(e) => setForm({ ...form, allowSelfSignupInstitutes: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
              />
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Allow Public Self-Service Institute Registration Applications
                </p>
                <p className="text-[11px] text-slate-500">
                  When disabled, only authorized ZACMA Super Admins and Platform Admins can provision new training institutes.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-slate-500">
            Last updated: {platformSettings.updatedAt ? formatAddisDateTimeDual(platformSettings.updatedAt) : 'Default'}
            {platformSettings.updatedByName ? ` by ${platformSettings.updatedByName}` : ''}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B2545] hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Settings...' : 'Save Global Platform Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// SECTION 10: NOTIFICATION MANAGEMENT (INTEGRATION STATUS & RENEWAL NOTICES)
// ============================================================================
export function NotificationManagementView() {
  const { profile, platformRole, tenants, platformSubscriptions, pushToast } = usePortal();

  const [selectedTenantId, setSelectedTenantId] = useState<string>(
    tenants.find((t) => !t.isDefaultPlatformTenant)?.tenantId || tenants[0]?.tenantId || ''
  );
  const [noticeMessage, setNoticeMessage] = useState(
    'Important notice from ZACMA Platform Operations: Please review your upcoming subscription renewal date and verify your institute billing settings to ensure uninterrupted portal access.'
  );
  const [sending, setSending] = useState(false);

  const handleDispatchNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !platformRole) return;
    const target = tenants.find((t) => t.tenantId === selectedTenantId);
    if (!target) {
      pushToast('error', 'Select a target training institute first.');
      return;
    }
    setSending(true);
    try {
      const sub = platformSubscriptions.find((s) => s.tenantId === target.tenantId);
      await sendSubscriptionExpiryReminder(target, sub, noticeMessage, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('success', `Platform notice delivered to ${target.name} Admin portal.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to send platform notice.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-slate-900">
          Notification &amp; Gateway Management
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Monitor per-institute Email, SMS, and WhatsApp channel readiness without exposing private gateway credentials, and dispatch official platform notices.
        </p>
      </div>

      {/* Dispatch Official Platform Notice */}
      <form
        onSubmit={(e) => void handleDispatchNotice(e)}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Bell className="w-4 h-4 text-blue-700" />
          <h3 className="text-sm font-display font-bold text-slate-900">
            Send Platform Notice / Subscription Reminder to Institute Admin
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Training Institute
            </label>
            <select
              required
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
            >
              <option value="">Select institute...</option>
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Official Message (Delivered to Institute Admin Notification Center)
            </label>
            <textarea
              rows={2}
              required
              value={noticeMessage}
              onChange={(e) => setNoticeMessage(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !selectedTenantId}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sending ? 'Dispatching...' : 'Send Official Platform Notice'}</span>
          </button>
        </div>
      </form>

      {/* Channel Integration Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-display font-bold text-slate-900">
            Institute Communication Channel Status (Metadata Only — Credentials Redacted)
          </h3>
          <span className="text-[11px] font-mono text-slate-500">{tenants.length} institutes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Institute</th>
                <th className="px-4 py-3">SMS Sender ID</th>
                <th className="px-4 py-3">Email Channel</th>
                <th className="px-4 py-3">SMS Channel</th>
                <th className="px-4 py-3">WhatsApp Channel</th>
                <th className="px-4 py-3">Notifications Module</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tenants.map((t) => {
                const modOn = t.enabledModules.includes('NOTIFICATIONS');
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-[11px] text-slate-500">{t.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {t.smsSenderLabel || t.studentIdPrefix.split('-')[0]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                          t.emailGatewayStatus === 'CONFIGURED' && t.notificationEmailEnabled
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {t.emailGatewayStatus === 'CONFIGURED' && t.notificationEmailEnabled
                          ? 'Active'
                          : 'Off / Unconfigured'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                          t.smsGatewayStatus === 'CONFIGURED' && t.notificationSmsEnabled
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        {t.smsGatewayStatus === 'CONFIGURED' && t.notificationSmsEnabled
                          ? 'Active'
                          : 'Off / Unconfigured'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                          t.whatsappGatewayStatus === 'CONFIGURED' && t.notificationWhatsappEnabled
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {t.whatsappGatewayStatus === 'CONFIGURED' && t.notificationWhatsappEnabled
                          ? 'Active'
                          : 'Off / Unconfigured'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                          modOn ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {modOn ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 11: AI SERVICES CONTROL, COST TELEMETRY & 10-SCENARIO SECURITY AUDIT
// ============================================================================
export function AiServicesControlView() {
  const {
    profile,
    platformRole,
    tenants,
    platformSettings,
    allPlatformAiUsageLogs,
    pushToast,
  } = usePortal();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingQuota, setEditingQuota] = useState<{ tenant: TenantRecord; quota: number } | null>(null);
  const [defaultModel, setDefaultModel] = useState<AiModelId>(
    platformSettings.defaultAiModel || 'gemini-4-hydrogen'
  );
  const [globalTokenLimit, setGlobalTokenLimit] = useState<number>(
    platformSettings.aiMonthlyTokenLimit ?? 2000000
  );
  const [globalScanLimit, setGlobalScanLimit] = useState<number>(
    platformSettings.aiDocScanLimit ?? 500
  );
  const [savingGlobalAi, setSavingGlobalAi] = useState(false);

  const [auditRunning, setAuditRunning] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    passedCount: number;
    totalCount: number;
    allPassed: boolean;
    executedAt: string;
    scenarios: AiSecurityAuditScenarioResult[];
  } | null>(null);

  useEffect(() => {
    setDefaultModel(platformSettings.defaultAiModel || 'gemini-4-hydrogen');
    setGlobalTokenLimit(platformSettings.aiMonthlyTokenLimit ?? 2000000);
    setGlobalScanLimit(platformSettings.aiDocScanLimit ?? 500);
  }, [platformSettings]);

  const toggleAiModule = async (tenant: TenantRecord, mod: 'AI_ASSISTANT' | 'AI_ID_SCANNING') => {
    if (!profile || !platformRole) return;
    setBusyKey(`${tenant.id}_${mod}`);
    try {
      const has = tenant.enabledModules.includes(mod);
      const next: SaasModuleCode[] = has
        ? tenant.enabledModules.filter((m) => m !== mod)
        : [...tenant.enabledModules, mod];
      await updateTenantModules(tenant, next, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast(
        'success',
        `${mod === 'AI_ASSISTANT' ? 'AI Portal Assistant' : 'AI ID OCR & QR Scanning'} ${
          has ? 'disabled' : 'enabled'
        } for ${tenant.name}.`
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to update AI module.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuota || !profile || !platformRole) return;
    setBusyKey(`quota_${editingQuota.tenant.id}`);
    try {
      await updateTenantLimits(
        editingQuota.tenant,
        {
          studentLimit: editingQuota.tenant.studentLimit,
          staffLimit: editingQuota.tenant.staffLimit,
          storageLimitMb: editingQuota.tenant.storageLimitMb,
          aiMonthlyQuota: Math.max(0, Number(editingQuota.quota)),
        },
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
          platformRole,
        }
      );
      pushToast('success', `AI monthly quota updated for ${editingQuota.tenant.name}.`);
      setEditingQuota(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to update AI quota.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveGlobalAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !platformRole) return;
    setSavingGlobalAi(true);
    try {
      await updateGlobalPlatformSettings(
        {
          platformName: platformSettings.platformName,
          supportEmail: platformSettings.supportEmail,
          supportPhone: platformSettings.supportPhone,
          defaultCurrency: platformSettings.defaultCurrency,
          defaultLanguage: platformSettings.defaultLanguage,
          defaultTrialDays: platformSettings.defaultTrialDays,
          gracePeriodDays: platformSettings.gracePeriodDays,
          autoSuspendExpiredDays: platformSettings.autoSuspendExpiredDays,
          allowSelfSignupInstitutes: platformSettings.allowSelfSignupInstitutes,
          enforceSupportSessionReason: platformSettings.enforceSupportSessionReason,
          maxSupportSessionMinutes: platformSettings.maxSupportSessionMinutes,
          defaultAiModel: defaultModel,
          aiMonthlyTokenLimit: Math.max(10000, Number(globalTokenLimit)),
          aiDocScanLimit: Math.max(10, Number(globalScanLimit)),
        },
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
          platformRole,
        }
      );
      pushToast('success', `Global AI engine configured to ${defaultModel}.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to save global AI settings.');
    } finally {
      setSavingGlobalAi(false);
    }
  };

  const handleRunSecurityAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await runBackendAiSecurityAudit();
      setAuditResult(res);
      pushToast(
        res.allPassed ? 'success' : 'error',
        `Backend AI Security Audit completed: ${res.passedCount}/${res.totalCount} isolation scenarios passed.`
      );
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Failed to run backend AI security audit.'
      );
    } finally {
      setAuditRunning(false);
    }
  };

  const totalAiEnabled = tenants.filter((t) => t.enabledModules.includes('AI_ASSISTANT')).length;
  const totalOcrEnabled = tenants.filter((t) => t.enabledModules.includes('AI_ID_SCANNING')).length;
  const totalLoggedRequests = allPlatformAiUsageLogs.length;
  const totalLoggedTokens = allPlatformAiUsageLogs.reduce((s, l) => s + (l.totalTokens || 0), 0);
  const totalEstimatedCostUsd = allPlatformAiUsageLogs.reduce(
    (s, l) => s + (l.estimatedCostUsd || 0),
    0
  );
  const deniedAttemptsCount = allPlatformAiUsageLogs.filter((l) => l.status === 'DENIED').length;

  const tenantTelemetryMap = useMemo(() => {
    const map = new Map<string, { requests: number; tokens: number; costUsd: number }>();
    for (const log of allPlatformAiUsageLogs) {
      const cur = map.get(log.tenantId) || { requests: 0, tokens: 0, costUsd: 0 };
      cur.requests += 1;
      cur.tokens += log.totalTokens || 0;
      cur.costUsd += log.estimatedCostUsd || 0;
      map.set(log.tenantId, cur);
    }
    return map;
  }, [allPlatformAiUsageLogs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900">
            AI Services Control, Cost Governance &amp; Isolation Audit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Gemini models, monitor live per-institute token &amp; USD cost telemetry, enforce quotas, and execute live backend multi-tenant isolation tests.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800">
          <ShieldCheck className="w-4 h-4" />
          <span>Cryptographic JWT + Server-Side Isolation Active</span>
        </div>
      </div>

      {/* Live KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            AI Enabled Institutes
          </p>
          <p className="text-2xl font-display font-bold text-slate-900 mt-1 tabular-nums">
            {totalAiEnabled}{' '}
            <span className="text-xs font-normal text-slate-500">/ {tenants.length} · OCR: {totalOcrEnabled}</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Logged AI Requests
          </p>
          <p className="text-2xl font-display font-bold text-blue-700 mt-1 tabular-nums">
            {totalLoggedRequests.toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Total Token Volume
          </p>
          <p className="text-2xl font-display font-bold text-slate-900 mt-1 tabular-nums">
            {totalLoggedTokens.toLocaleString()}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Estimated AI Cost (USD)
          </p>
          <p className="text-2xl font-display font-bold text-emerald-700 mt-1 tabular-nums">
            ${totalEstimatedCostUsd.toFixed(4)}
            {deniedAttemptsCount > 0 && (
              <span className="ml-2 text-[11px] font-medium text-rose-600">
                ({deniedAttemptsCount} blocked)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Global Model & Token Governance */}
      <form
        onSubmit={(e) => void handleSaveGlobalAiConfig(e)}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#172DEB]" />
            <h3 className="text-sm font-display font-bold text-slate-900">
              Centralized Gemini Model &amp; Quota Defaults
            </h3>
          </div>
          <button
            type="submit"
            disabled={savingGlobalAi}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0B2545] hover:bg-[#172DEB] text-white text-xs font-semibold disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {savingGlobalAi ? 'Saving...' : 'Save AI Policy'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Platform AI Model
            </label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value as AiModelId)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-blue-700"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced Reasoning — Recommended)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (High-Speed Cost Saver)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Monthly Token Limit / Institute
            </label>
            <input
              type="number"
              min={10000}
              step={10000}
              value={globalTokenLimit}
              onChange={(e) => setGlobalTokenLimit(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Monthly Document OCR Scans / Institute
            </label>
            <input
              type="number"
              min={10}
              step={10}
              value={globalScanLimit}
              onChange={(e) => setGlobalScanLimit(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
            />
          </div>
        </div>
      </form>

      {/* Per-Tenant AI Controls & Live Telemetry Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Training Institute</th>
                <th className="px-4 py-3">AI Assistant</th>
                <th className="px-4 py-3">ID OCR &amp; QR</th>
                <th className="px-4 py-3">Monthly Quota</th>
                <th className="px-4 py-3">Logged Tokens / Cost</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tenants.map((t) => {
                const aiOn = t.enabledModules.includes('AI_ASSISTANT');
                const ocrOn = t.enabledModules.includes('AI_ID_SCANNING');
                const stats = tenantTelemetryMap.get(t.tenantId) || { requests: 0, tokens: 0, costUsd: 0 };
                const reqUsed = Math.max(t.aiRequestsUsed || 0, stats.requests);
                const pct =
                  t.aiMonthlyQuota > 0
                    ? Math.min(100, Math.round((reqUsed / t.aiMonthlyQuota) * 100))
                    : 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {t.tenantId} · {t.planName}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyKey === `${t.id}_AI_ASSISTANT`}
                        onClick={() => void toggleAiModule(t, 'AI_ASSISTANT')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          aiOn
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>{aiOn ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyKey === `${t.id}_AI_ID_SCANNING`}
                        onClick={() => void toggleAiModule(t, 'AI_ID_SCANNING')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          ocrOn
                            ? 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{ocrOn ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3 min-w-[170px]">
                      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                        <span className="text-slate-700 font-semibold tabular-nums">
                          {reqUsed.toLocaleString()}
                        </span>
                        <span className="text-slate-400 tabular-nums">
                          / {t.aiMonthlyQuota.toLocaleString()} req
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 90 ? 'bg-red-600' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-700'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] tabular-nums">
                      <p className="font-semibold text-slate-900">
                        {stats.tokens.toLocaleString()} tok
                      </p>
                      <p className="text-slate-500">${stats.costUsd.toFixed(4)} est.</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingQuota({ tenant: t, quota: t.aiMonthlyQuota })}
                        className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                      >
                        Edit Quota
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 10-Scenario Backend Security & Tenant Isolation Audit Runner */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#172DEB]" />
              <h3 className="text-sm font-display font-bold text-slate-900">
                10-Scenario Backend AI Security &amp; Data Isolation Verification
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Executes live server-side verification tests against the real authorization guard &amp; context sanitizer across student, instructor, accountant, HR, receptionist, admin, cross-tenant, prompt-injection, suspended-tenant, and unauthenticated vectors.
            </p>
          </div>
          <button
            type="button"
            disabled={auditRunning}
            onClick={() => void handleRunSecurityAudit()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#172DEB] hover:bg-[#1224C2] text-white text-xs font-semibold disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {auditRunning ? 'Running 10 Security Tests...' : 'Run Live Security Audit'}
          </button>
        </div>

        {auditResult && (
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <span className="font-semibold text-slate-900">
                Audit Result:{' '}
                <strong className={auditResult.allPassed ? 'text-emerald-700' : 'text-rose-700'}>
                  {auditResult.passedCount} / {auditResult.totalCount} Scenarios Passed
                </strong>
              </span>
              <span className="text-slate-500 tabular-nums">
                Executed {formatAddisDateTimeDual(auditResult.executedAt)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Security Test Scenario</th>
                    <th className="px-3 py-2">Expected Isolation</th>
                    <th className="px-3 py-2">Backend Enforcement Outcome</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditResult.scenarios.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono text-slate-500 tabular-nums">
                        {String(s.scenarioNumber).padStart(2, '0')}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-900">{s.title}</p>
                        <p className="text-[11px] text-slate-500">{s.attackVector}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{s.expectedOutcome}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-800">
                        {s.actualOutcome}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            s.passed ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {s.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Quota Modal */}
      {editingQuota && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSaveQuota(e)}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-900">
                Update Monthly AI Quota
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuota(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Institute: <strong>{editingQuota.tenant.name}</strong>
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly AI Requests Allowance
              </label>
              <input
                type="number"
                min={0}
                max={1000000}
                required
                value={editingQuota.quota}
                onChange={(e) =>
                  setEditingQuota({ ...editingQuota, quota: Number(e.target.value) })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingQuota(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyKey === `quota_${editingQuota.tenant.id}`}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
              >
                Save Quota
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SECTION 13: PLATFORM AUDIT LOGS (CENTRALIZED IMMUTABLE TRAIL)
// ============================================================================
export function PlatformAuditLogsView() {
  const { tenants, allPlatformAuditLogs } = usePortal();
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');

  const tenantMap = useMemo(() => {
    const m = new Map<string, string>();
    tenants.forEach((t) => m.set(t.tenantId, t.name));
    return m;
  }, [tenants]);

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    allPlatformAuditLogs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [allPlatformAuditLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPlatformAuditLogs.filter((log) => {
      const tid = log.tenantId || DEFAULT_ZACMA_TENANT_ID;
      if (tenantFilter !== 'ALL' && tid !== tenantFilter) return false;
      if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
      if (!q) return true;
      return (
        log.actorName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        (tenantMap.get(tid) || tid).toLowerCase().includes(q)
      );
    });
  }, [allPlatformAuditLogs, search, tenantFilter, actionFilter, tenantMap]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900">
            Centralized Platform Audit Logs
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable chronological trail of institute provisioning, subscription billing, module toggles, support access sessions, and financial approvals across all tenants.
          </p>
        </div>
        <div className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 tabular-nums">
          {filtered.length.toLocaleString()} events
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, summary, entity..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-700"
          />
        </div>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Training Institutes</option>
          {tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
        >
          <option value="ALL">All Event Types</option>
          {uniqueActions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>
      </div>

      {/* Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Timestamp (EAT)</th>
                <th className="px-4 py-3">Institute</th>
                <th className="px-4 py-3">Actor &amp; Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Event Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.slice(0, 200).map((log) => {
                const tid = log.tenantId || DEFAULT_ZACMA_TENANT_ID;
                const isSupport = log.action.startsWith('SUPPORT_ACCESS');
                const isSusp = log.action === 'TENANT_SUSPENDED';
                return (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500 tabular-nums">
                      {formatAddisDateTimeDual(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="font-medium text-slate-800">
                        {tenantMap.get(tid) || tid}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-900">{log.actorName}</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {log.actorPlatformRole ? `PLATFORM:${log.actorPlatformRole}` : log.actorRole}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          isSusp
                            ? 'bg-red-50 text-red-700'
                            : isSupport
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-md">{log.summary}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No audit records found matching your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 14: SECURITY, RBAC MATRIX & LEGACY TENANT MIGRATION
// ============================================================================
export function SecurityAndPermissionsView() {
  const { profile, platformRole, pushToast } = usePortal();
  const [migrating, setMigrating] = useState(false);
  const [migResult, setMigResult] = useState<LegacyMigrationResult | null>(null);

  const handleRunMigration = async () => {
    if (!profile || !platformRole) return;
    setMigrating(true);
    try {
      const res = await migrateLegacyZacmaRecordsToTenant({
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      setMigResult(res);
      pushToast(
        'success',
        res.totalUpdated > 0
          ? `Successfully tagged ${res.totalUpdated} legacy ZACMA records with tenantId='zacma_default'.`
          : 'All ZACMA records already carry explicit tenantId isolation tags.'
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Migration failed.');
    } finally {
      setMigrating(false);
    }
  };

  const platformMatrix = [
    {
      role: 'SUPER_ADMIN',
      label: PLATFORM_ROLE_LABELS.SUPER_ADMIN,
      scope: 'Full Platform Control, Provisioning, Billing, Role Governance, Global Settings, Support Access, Migration',
    },
    {
      role: 'PLATFORM_ADMIN',
      label: PLATFORM_ROLE_LABELS.PLATFORM_ADMIN,
      scope: 'Institute Provisioning, Subscriptions, Module Control, Global Settings, Audited Support Access',
    },
    {
      role: 'PLATFORM_FINANCE',
      label: PLATFORM_ROLE_LABELS.PLATFORM_FINANCE,
      scope: 'Platform Subscription Revenue, SaaS Invoicing, Payment Recording, Renewal Reminders, Platform Analytics',
    },
    {
      role: 'PLATFORM_SUPPORT',
      label: PLATFORM_ROLE_LABELS.PLATFORM_SUPPORT,
      scope: 'Institute Diagnostics, Support Tickets, Time-Limited Audited Support Access, Audit Inspection',
    },
  ];

  const instituteMatrix = [
    { role: 'ADMIN', scope: 'Full control of own institute portal, approvals, Chapa/fee approvals, staff roles, branding & plan' },
    { role: 'MANAGER', scope: 'Operational oversight, students, courses, fee review, accounting reports, attendance & messaging' },
    { role: 'ACCOUNTANT', scope: 'Student registration, tuition payments, Chapa links, reminders, receipts, ledger & SMS alerts' },
    { role: 'INSTRUCTOR', scope: 'Assigned courses, student roster (financial data isolated), attendance marking & internal messages' },
    { role: 'RECEPTIONIST', scope: 'Front-desk AI student intake, student profiles, course catalog & internal campus messaging' },
    { role: 'HR_OFFICER', scope: 'Staff onboarding, AI staff registration, staff records & HR compliance (tuition ledger isolated)' },
    { role: 'GENERAL_STAFF', scope: 'Scoped operational modules assigned by Institute Admin' },
    { role: 'STUDENT', scope: 'Strictly isolated self-service portal: own courses, installments, Chapa online pay & receipts' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-slate-900">
          Security Architecture, Two-Layer RBAC &amp; Tenant Isolation
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Database-enforced Firestore Security Rules isolate every institute by tenantId while maintaining strict separation between Platform Revenue and Student Tuition.
        </p>
      </div>

      {/* Isolation Guarantees */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-display font-bold text-slate-900">
            Database-Enforced Tenant Isolation
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Every institute query and write is verified in live Firestore Security Rules against the authenticated user&apos;s <code>tenantId</code>. Cross-institute reads and writes are denied at the database layer.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-display font-bold text-slate-900">
            Strict Financial Separation
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            ZACMA SaaS subscription billing (<code>platform_invoices</code>, <code>platform_payments</code>) is architecturally isolated from Institute Student Tuition (<code>payments</code>, <code>chapa_transactions</code>).
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-display font-bold text-slate-900">
            Audited Support Access (Zero Silent Impersonation)
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Platform support entry requires a written reason, enforces an automatic countdown expiry, displays a persistent top banner, and writes immutable logs to both ZACMA and the client institute.
          </p>
        </div>
      </div>

      {/* Two-Layer RBAC Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-display font-bold uppercase tracking-wide">
              Layer 1 — ZACMA Platform Roles
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {platformMatrix.map((row) => (
              <div key={row.role} className="p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">{row.label}</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                    {row.role}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{row.scope}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 bg-blue-700 text-white flex items-center gap-2">
            <Users className="w-4 h-4" />
            <h3 className="text-xs font-display font-bold uppercase tracking-wide">
              Layer 2 — Tenant-Scoped Institute Roles
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {instituteMatrix.map((row) => (
              <div key={row.role} className="px-4 py-3 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    {INSTITUTE_ROLE_LABELS[row.role as keyof typeof INSTITUTE_ROLE_LABELS]}
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                    {row.role}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{row.scope}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Non-Destructive Legacy ZACMA Tenant Migration Tool */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-display font-bold text-slate-900">
                Legacy ZACMA Record Tagging (`zacma_default` Tenant)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 max-w-2xl leading-relaxed">
                Safely scans all 18 operational collections and stamps <code>tenantId: &quot;zacma_default&quot;</code> onto any pre-upgrade ZACMA documents that lack a tenant tag. Zero records are deleted or overwritten.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={migrating || (platformRole !== 'SUPER_ADMIN' && platformRole !== 'PLATFORM_ADMIN')}
            onClick={() => void handleRunMigration()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0B2545] hover:bg-slate-800 text-white text-xs font-semibold rounded-lg disabled:opacity-50 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${migrating ? 'animate-spin' : ''}`} />
            <span>{migrating ? 'Scanning & Tagging...' : 'Verify & Tag Legacy ZACMA Records'}</span>
          </button>
        </div>

        {migResult && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Migration Scan Complete — {migResult.totalUpdated} document(s) tagged
              </span>
              <span className="font-mono text-[11px] text-emerald-700">
                {formatAddisDateTimeDual(migResult.completedAt)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
              {Object.entries(migResult.byCollection).map(([col, count]) => (
                <div
                  key={col}
                  className="bg-white border border-emerald-200/80 rounded px-2.5 py-1.5 text-[11px]"
                >
                  <p className="font-mono text-slate-500 truncate">{col}</p>
                  <p className="font-mono font-bold text-slate-900 tabular-nums">{count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SECTION 15: SUPPORT & ASSISTANCE (AUDITED SUPPORT SESSIONS + TICKETS)
// ============================================================================
export function SupportAndAssistanceView() {
  const {
    profile,
    platformRole,
    tenants,
    supportSessions,
    supportTickets,
    startSupportAccess,
    pushToast,
  } = usePortal();

  const [subTab, setSubTab] = useState<'TICKETS' | 'SESSIONS'>('TICKETS');
  const [launchTenantId, setLaunchTenantId] = useState('');
  const [launchReason, setLaunchReason] = useState('');
  const [launchDuration, setLaunchDuration] = useState(30);
  const [launching, setLaunching] = useState(false);

  const [editingTicket, setEditingTicket] = useState<SupportTicket | null>(null);
  const [ticketStatus, setTicketStatus] = useState<SupportTicket['status']>('IN_PROGRESS');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [savingTicket, setSavingTicket] = useState(false);

  const openTicketModal = (ticket: SupportTicket) => {
    setEditingTicket(ticket);
    setTicketStatus(ticket.status);
    setResolutionNotes(ticket.resolutionNotes || '');
  };

  const handleSaveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket || !profile || !platformRole) return;
    setSavingTicket(true);
    try {
      await updateSupportTicket(
        editingTicket.id,
        {
          status: ticketStatus,
          assignedToName: profile.fullName,
          resolutionNotes,
        },
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
          platformRole,
        }
      );
      pushToast('success', `Support ticket "${editingTicket.subject}" updated to ${ticketStatus}.`);
      setEditingTicket(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to update ticket.');
    } finally {
      setSavingTicket(false);
    }
  };

  const handleLaunchSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = tenants.find((t) => t.tenantId === launchTenantId);
    if (!target) {
      pushToast('error', 'Select an institute to open a support access session.');
      return;
    }
    setLaunching(true);
    try {
      await startSupportAccess(target, launchReason, launchDuration);
      setLaunchReason('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to start support session.');
    } finally {
      setLaunching(false);
    }
  };

  const handleSupportFromTicket = async (ticket: SupportTicket) => {
    const target = tenants.find((t) => t.tenantId === ticket.tenantId);
    if (!target) {
      pushToast('error', 'Target institute not found.');
      return;
    }
    try {
      await startSupportAccess(target, `Ticket #${ticket.id.slice(-6)}: ${ticket.subject}`, 30);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to start support session.');
    }
  };

  const openTicketsCount = supportTickets.filter(
    (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS'
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900">
            Support &amp; Authorized Institute Assistance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Resolve client institute support tickets and launch time-limited, fully audited Support Access sessions with zero silent impersonation.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('TICKETS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              subTab === 'TICKETS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Support Tickets ({openTicketsCount} open)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('SESSIONS')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
              subTab === 'SESSIONS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Support Sessions ({supportSessions.length})
          </button>
        </div>
      </div>

      {/* Quick Audited Support Access Launcher */}
      <form
        onSubmit={(e) => void handleLaunchSession(e)}
        className="bg-slate-900 text-white rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-display font-bold">
              Launch Audited Support Access Session
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Logged to support_access_sessions &amp; institute audit trail
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Target Institute
            </label>
            <select
              required
              value={launchTenantId}
              onChange={(e) => setLaunchTenantId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:border-amber-400"
            >
              <option value="">Select institute...</option>
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name} ({t.status})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Support Reason / Ticket Reference (Required)
            </label>
            <input
              type="text"
              required
              minLength={5}
              value={launchReason}
              onChange={(e) => setLaunchReason(e.target.value)}
              placeholder="e.g., Assist admin configuring Chapa online fee link"
              className="w-full px-3 py-2 text-xs bg-slate-800 border border-slate-700 text-white placeholder-slate-400 rounded-lg focus:outline-none focus:border-amber-400"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Minutes
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={launchDuration}
              onChange={(e) => setLaunchDuration(Number(e.target.value))}
              className="w-full px-2.5 py-2 text-xs font-mono bg-slate-800 border border-slate-700 text-white rounded-lg"
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={launching}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{launching ? 'Opening...' : 'Open Session'}</span>
            </button>
          </div>
        </div>
      </form>

      {subTab === 'TICKETS' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Institute &amp; Subject</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {supportTickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No institute support tickets submitted yet.
                    </td>
                  </tr>
                ) : (
                  supportTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 max-w-md">
                        <p className="font-semibold text-slate-900">{t.subject}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                          {t.description}
                        </p>
                        <p className="text-[10px] font-semibold text-blue-700 mt-1">
                          {t.tenantName} · By {t.createdByName}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                        {t.category}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                            t.priority === 'URGENT'
                              ? 'bg-red-100 text-red-700'
                              : t.priority === 'HIGH'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                            t.status === 'RESOLVED' || t.status === 'CLOSED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : t.status === 'IN_PROGRESS'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-500">
                        {formatDateShort(t.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => openTicketModal(t)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                        >
                          Update
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSupportFromTicket(t)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md cursor-pointer"
                        >
                          Support Access
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Institute</th>
                  <th className="px-4 py-3">Platform Operator</th>
                  <th className="px-4 py-3">Authorized Reason</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Expires / Ended</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {supportSessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      No authorized support access sessions recorded yet.
                    </td>
                  </tr>
                ) : (
                  supportSessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.tenantName}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{s.actorName}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          {PLATFORM_ROLE_LABELS[s.actorPlatformRole]}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-sm">{s.reason}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatAddisDateTimeDual(s.startedAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatAddisDateTimeDual(s.endedAt || s.expiresAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[10px] ${
                            s.status === 'ACTIVE'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ticket Update Modal */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSaveTicket(e)}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-900">
                Manage Support Ticket
              </h3>
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
              <p className="font-bold text-slate-900">{editingTicket.subject}</p>
              <p className="text-slate-600">{editingTicket.description}</p>
              <p className="text-[11px] text-blue-700 font-semibold">
                {editingTicket.tenantName} · Submitted by {editingTicket.createdByName}
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={ticketStatus}
                onChange={(e) => setTicketStatus(e.target.value as SupportTicket['status'])}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resolution / Support Notes (Visible to Institute Admin)
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Document troubleshooting steps or resolution..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTicket(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingTicket}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-50"
              >
                {savingTicket ? 'Saving...' : 'Save Ticket Update'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
