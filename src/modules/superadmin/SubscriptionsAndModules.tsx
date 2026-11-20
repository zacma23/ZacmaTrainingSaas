import React, { useState } from 'react';
import {
  Bell,
  Check,
  CreditCard,
  Edit3,
  Layers,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import {
  ALL_SAAS_MODULES,
  DEFAULT_SUBSCRIPTION_PLANS,
  saveSubscriptionPlan,
  sendSubscriptionExpiryReminder,
  updateTenantModules,
  upgradeOrExtendSubscription,
} from '../../lib/saasService';
import {
  addDaysIso,
  BillingCycle,
  formatDateShort,
  formatEtbCompact,
  SaasModuleCode,
  SubscriptionPlan,
  TenantRecord,
  todayIsoDate,
} from '../../types/zacma';

export function InstituteSubscriptionsView() {
  const {
    profile,
    platformRole,
    tenants,
    subscriptionPlans,
    platformSubscriptions,
    pushToast,
  } = usePortal();

  const [renewTarget, setRenewTarget] = useState<TenantRecord | null>(null);
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [expiry, setExpiry] = useState(addDaysIso(todayIsoDate(), 30));
  const [genInvoice, setGenInvoice] = useState(true);
  const [busy, setBusy] = useState(false);

  const plans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const today = todayIsoDate();

  const handleSendReminder = async (t: TenantRecord) => {
    if (!profile || !platformRole) return;
    const sub = platformSubscriptions.find((s) => s.tenantId === t.tenantId);
    try {
      await sendSubscriptionExpiryReminder(
        t,
        sub,
        `Friendly reminder from ZACMA Platform Billing: Your ${t.planName} subscription for ${t.name} is scheduled to expire on ${formatDateShort(t.subscriptionExpiresAt)}. Please settle renewal to prevent service interruption.`,
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      pushToast('success', `Expiration reminder sent to ${t.name} admin portal.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to send reminder.');
    }
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewTarget || !profile || !platformRole) return;
    const plan = plans.find((p) => p.id === planId) || plans[0];
    const sub = platformSubscriptions.find((s) => s.tenantId === renewTarget.tenantId);
    setBusy(true);
    try {
      const res = await upgradeOrExtendSubscription(
        renewTarget,
        sub,
        {
          plan,
          billingCycle: cycle,
          newExpiresAt: expiry,
          applyPlanModulesAndLimits: true,
          generateInvoice: genInvoice,
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      pushToast(
        'success',
        `Subscription renewed for ${renewTarget.name}${res.invoiceNumber ? ` (Invoice ${res.invoiceNumber})` : ''}.`
      );
      setRenewTarget(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Renewal failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Institute Subscriptions</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Monitor subscription lifecycles, renewal dates, trial expirations, and overdue alerts across all institutes.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="px-4 py-2.5">Institute</th>
                <th className="px-4 py-2.5">Current Plan</th>
                <th className="px-4 py-2.5">Billing Cycle</th>
                <th className="px-4 py-2.5 text-right">Plan Rate</th>
                <th className="px-4 py-2.5">Start / Expiry</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tenants.map((t) => {
                const isOverdue = !t.isDefaultPlatformTenant && t.subscriptionExpiresAt < today;
                const sub = platformSubscriptions.find((s) => s.tenantId === t.tenantId);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">{t.tenantId}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{t.planName}</td>
                    <td className="px-4 py-3 text-slate-600">{t.billingCycle}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {t.isDefaultPlatformTenant
                        ? 'Owner'
                        : t.billingCycle === 'TRIAL'
                        ? 'ETB 0'
                        : t.billingCycle === 'ANNUAL'
                        ? `${formatEtbCompact(t.annualPriceEtb)}/yr`
                        : `${formatEtbCompact(t.monthlyPriceEtb)}/mo`}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <p className="text-slate-600">{formatDateShort(t.subscriptionStartDate)}</p>
                      <p className={isOverdue ? 'text-red-600 font-semibold' : 'text-slate-900 font-medium'}>
                        {t.isDefaultPlatformTenant ? 'Perpetual' : `Exp: ${formatDateShort(t.subscriptionExpiresAt)}`}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                          isOverdue
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : t.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : t.status === 'TRIAL'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isOverdue ? 'OVERDUE' : t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!t.isDefaultPlatformTenant && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleSendReminder(t)}
                            title={sub?.lastReminderSentAt ? `Last sent ${sub.lastReminderSentAt.slice(0, 10)}` : 'Send reminder'}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded"
                          >
                            <Bell className="w-3 h-3" />
                            Remind
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenewTarget(t);
                              setPlanId(t.planId || plans[0].id);
                              setCycle(t.billingCycle === 'TRIAL' ? 'MONTHLY' : t.billingCycle);
                              setExpiry(addDaysIso(todayIsoDate(), t.billingCycle === 'ANNUAL' ? 365 : 30));
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Renew / Change
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {renewTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRenewSubmit}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900">Renew or Change Plan — {renewTarget.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan</label>
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatEtbCompact(p.monthlyPriceEtb)}/mo
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cycle</label>
                  <select
                    value={cycle}
                    onChange={(e) => {
                      const c = e.target.value as BillingCycle;
                      setCycle(c);
                      setExpiry(addDaysIso(todayIsoDate(), c === 'ANNUAL' ? 365 : c === 'TRIAL' ? 14 : 30));
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="TRIAL">Trial</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Expiry</label>
                  <input
                    type="date"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={genInvoice}
                  onChange={(e) => setGenInvoice(e.target.checked)}
                />
                Generate platform subscription invoice
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRenewTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
              >
                Confirm Renewal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function SubscriptionPlansView() {
  const { profile, platformRole, subscriptionPlans, pushToast } = usePortal();
  const plans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;

  const [editing, setEditing] = useState<Omit<SubscriptionPlan, 'updatedAt'> | null>(null);
  const [saving, setSaving] = useState(false);

  const openNewPlan = () => {
    setEditing({
      id: '',
      code: 'CUSTOM',
      name: 'Custom Institutional Plan',
      tagline: 'Tailored limits and modules for multi-campus training centers.',
      monthlyPriceEtb: 12000,
      annualPriceEtb: 120000,
      trialDays: 14,
      studentLimit: 1500,
      staffLimit: 100,
      storageLimitMb: 15360,
      aiMonthlyQuota: 3000,
      includedModules: ALL_SAAS_MODULES.map((m) => m.code),
      isActive: true,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !profile || !platformRole) return;
    setSaving(true);
    try {
      await saveSubscriptionPlan(editing, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('success', `Subscription plan "${editing.name}" saved.`);
      setEditing(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">SaaS Subscription Plans</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure Free Trial, Basic, Professional, Enterprise, and Custom commercial plans.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewPlan}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Create Custom Plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`bg-white rounded-xl border p-5 flex flex-col justify-between ${
              p.isFeatured ? 'border-[#0B2545] ring-1 ring-[#0B2545]/10' : 'border-slate-200'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold uppercase text-slate-500">{p.code}</span>
                {p.isFeatured && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-[#0B2545] text-white rounded">
                    POPULAR
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-slate-900 mt-1">{p.name}</h2>
              <p className="text-xs text-slate-500 mt-1 min-h-[32px]">{p.tagline}</p>

              <div className="mt-4 pb-4 border-b border-slate-100">
                <p className="text-2xl font-bold text-slate-900 tabular-nums">
                  {p.monthlyPriceEtb === 0 ? 'FREE' : formatEtbCompact(p.monthlyPriceEtb)}
                  {p.monthlyPriceEtb > 0 && <span className="text-xs font-normal text-slate-500"> /mo</span>}
                </p>
                {p.annualPriceEtb > 0 && (
                  <p className="text-[11px] text-emerald-700 font-medium tabular-nums mt-0.5">
                    Annual: {formatEtbCompact(p.annualPriceEtb)} /yr
                  </p>
                )}
              </div>

              <ul className="mt-4 space-y-2 text-xs text-slate-700">
                <li className="flex items-center justify-between">
                  <span>Max Students</span>
                  <strong className="tabular-nums">{p.studentLimit.toLocaleString()}</strong>
                </li>
                <li className="flex items-center justify-between">
                  <span>Max Staff</span>
                  <strong className="tabular-nums">{p.staffLimit.toLocaleString()}</strong>
                </li>
                <li className="flex items-center justify-between">
                  <span>Storage</span>
                  <strong className="tabular-nums">{(p.storageLimitMb / 1024).toFixed(1)} GB</strong>
                </li>
                <li className="flex items-center justify-between">
                  <span>AI Quota / Month</span>
                  <strong className="tabular-nums">{p.aiMonthlyQuota.toLocaleString()}</strong>
                </li>
                <li className="flex items-center justify-between">
                  <span>Included Modules</span>
                  <strong className="tabular-nums">{p.includedModules.length} / {ALL_SAAS_MODULES.length}</strong>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setEditing({ ...p })}
              className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Configure Plan
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#0B2545]" />
                {editing.id ? `Edit Plan: ${editing.name}` : 'Create New Subscription Plan'}
              </h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1 text-slate-500 hover:bg-slate-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Tier Code</label>
                <select
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value as SubscriptionPlan['code'] })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  <option value="FREE_TRIAL">FREE_TRIAL</option>
                  <option value="BASIC">BASIC</option>
                  <option value="PROFESSIONAL">PROFESSIONAL</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline</label>
                <input
                  type="text"
                  value={editing.tagline}
                  onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Price (ETB)</label>
                <input
                  type="number"
                  min="0"
                  value={editing.monthlyPriceEtb}
                  onChange={(e) => setEditing({ ...editing, monthlyPriceEtb: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Annual Price (ETB)</label>
                <input
                  type="number"
                  min="0"
                  value={editing.annualPriceEtb}
                  onChange={(e) => setEditing({ ...editing, annualPriceEtb: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Student Limit</label>
                <input
                  type="number"
                  min="1"
                  value={editing.studentLimit}
                  onChange={(e) => setEditing({ ...editing, studentLimit: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Limit</label>
                <input
                  type="number"
                  min="1"
                  value={editing.staffLimit}
                  onChange={(e) => setEditing({ ...editing, staffLimit: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Limit (MB)</label>
                <input
                  type="number"
                  min="128"
                  value={editing.storageLimitMb}
                  onChange={(e) => setEditing({ ...editing, storageLimitMb: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">AI Monthly Quota</label>
                <input
                  type="number"
                  min="0"
                  value={editing.aiMonthlyQuota}
                  onChange={(e) => setEditing({ ...editing, aiMonthlyQuota: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800 mb-2">Included Modules</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_SAAS_MODULES.map((m) => {
                  const checked = editing.includedModules.includes(m.code);
                  return (
                    <label
                      key={m.code}
                      className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg text-xs cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setEditing({
                            ...editing,
                            includedModules: checked
                              ? editing.includedModules.filter((c) => c !== m.code)
                              : [...editing.includedModules, m.code],
                          })
                        }
                      />
                      <span className="font-medium text-slate-800">{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
              >
                {saving ? 'Saving...' : 'Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function ServicesAndModulesView() {
  const { profile, platformRole, tenants, pushToast } = usePortal();
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenants[0]?.tenantId || '');

  const currentTenant =
    tenants.find((t) => t.tenantId === selectedTenantId) || tenants[0] || null;

  const handleToggle = async (tenant: TenantRecord, code: SaasModuleCode) => {
    if (!profile || !platformRole) return;
    const current = tenant.enabledModules || [];
    const next = current.includes(code)
      ? current.filter((m) => m !== code)
      : [...current, code];
    try {
      await updateTenantModules(tenant, next, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('success', `${code} ${next.includes(code) ? 'enabled' : 'disabled'} for ${tenant.shortName}.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to update module.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Services &amp; Modular Feature Control</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Enable or disable SaaS modules per training institute. Disabled modules hide navigation and block actions while safely preserving data.
          </p>
        </div>
        {tenants.length > 0 && (
          <select
            value={currentTenant?.tenantId || ''}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="px-3 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.tenantId}>
                {t.name} ({t.enabledModules?.length || 0}/{ALL_SAAS_MODULES.length})
              </option>
            ))}
          </select>
        )}
      </div>

      {currentTenant && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0B2545]" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">{currentTenant.name}</h2>
                <p className="text-[11px] text-slate-500">
                  Plan: {currentTenant.planName} · {currentTenant.enabledModules?.length || 0} of {ALL_SAAS_MODULES.length} modules active
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <ShieldCheck className="w-4 h-4" />
              Real-Time Enforcement
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_SAAS_MODULES.map((mod) => {
              const enabled = (currentTenant.enabledModules || []).includes(mod.code);
              return (
                <div
                  key={mod.code}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                    enabled ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {mod.category}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {enabled ? 'ACTIVE' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 mt-1">{mod.label}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{mod.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(currentTenant, mod.code)}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
                      enabled
                        ? 'bg-white border border-slate-300 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                        : 'bg-[#0B2545] text-white hover:bg-slate-800'
                    }`}
                  >
                    {enabled ? 'Disable Module' : <><Check className="w-3.5 h-3.5" /> Enable Module</>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
