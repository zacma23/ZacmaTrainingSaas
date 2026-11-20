import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  GraduationCap,
  HardDrive,
  Plus,
  Receipt,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { ModuleAiToolbar } from '../../components/ModuleAiToolbar';
import {
  ALL_SAAS_MODULES,
  createPlatformInvoice,
  DEFAULT_ZACMA_TENANT_ID,
  exportPlatformAnalyticsWorkbook,
  recordPlatformPayment,
} from '../../lib/saasService';
import {
  addDaysIso,
  BillingCycle,
  formatDateShort,
  formatEtb,
  formatEtbCompact,
  PlatformInvoice,
  SuperAdminNavSection,
  todayIsoDate,
} from '../../types/zacma';

interface DashboardProps {
  onNavigate: (section: SuperAdminNavSection) => void;
}

export function SuperAdminDashboardView({ onNavigate }: DashboardProps) {
  const {
    tenants,
    platformSubscriptions,
    platformInvoices,
    platformPayments,
    allPlatformStudents,
    allPlatformStaffRecords,
    supportTickets,
    supportSessions,
  } = usePortal();

  const metrics = useMemo(() => {
    const today = todayIsoDate();
    const soon = addDaysIso(today, 30);

    const totalInstitutes = tenants.length;
    const activeInstitutes = tenants.filter((t) => t.status === 'ACTIVE').length;
    const suspendedInstitutes = tenants.filter((t) => t.status === 'SUSPENDED').length;
    const trialInstitutes = tenants.filter((t) => t.status === 'TRIAL').length;
    const pendingInstitutes = tenants.filter((t) => t.status === 'PENDING').length;
    const expiredInstitutes = tenants.filter(
      (t) => t.status === 'EXPIRED' || (t.subscriptionExpiresAt < today && !t.isDefaultPlatformTenant)
    ).length;
    const paidSubscriptions = tenants.filter(
      (t) => !t.isDefaultPlatformTenant && t.status === 'ACTIVE' && (t.monthlyPriceEtb > 0 || t.annualPriceEtb > 0)
    ).length;

    const totalPlatformRevenue = platformPayments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((acc, p) => acc + Number(p.amountEtb || 0), 0);

    const mrr = tenants
      .filter((t) => t.status === 'ACTIVE' && !t.isDefaultPlatformTenant)
      .reduce((acc, t) => {
        if (t.billingCycle === 'ANNUAL' && t.annualPriceEtb > 0) {
          return acc + t.annualPriceEtb / 12;
        }
        return acc + Number(t.monthlyPriceEtb || 0);
      }, 0);

    const upcomingRenewals = tenants.filter(
      (t) =>
        !t.isDefaultPlatformTenant &&
        t.subscriptionExpiresAt >= today &&
        t.subscriptionExpiresAt <= soon
    ).length;

    const totalStorageUsedMb = tenants.reduce((acc, t) => acc + Number(t.storageUsedMb || 0), 0);
    const totalStorageLimitMb = tenants.reduce((acc, t) => acc + Number(t.storageLimitMb || 0), 0);
    const openTickets = supportTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;
    const activeSupportCount = supportSessions.filter((s) => s.status === 'ACTIVE').length;
    const unpaidInvoicesAmount = platformInvoices
      .filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE')
      .reduce((acc, i) => acc + Number(i.amountEtb || 0), 0);

    return {
      totalInstitutes,
      activeInstitutes,
      suspendedInstitutes,
      trialInstitutes,
      pendingInstitutes,
      expiredInstitutes,
      paidSubscriptions,
      totalStudents: allPlatformStudents.length,
      totalStaff: allPlatformStaffRecords.length,
      totalPlatformRevenue,
      mrr,
      upcomingRenewals,
      totalStorageUsedMb,
      totalStorageLimitMb,
      openTickets,
      activeSupportCount,
      unpaidInvoicesAmount,
    };
  }, [
    tenants,
    platformPayments,
    platformInvoices,
    allPlatformStudents,
    allPlatformStaffRecords,
    supportTickets,
    supportSessions,
  ]);

  const instituteBreakdown = useMemo(() => {
    return tenants.slice(0, 8).map((t) => {
      const studentsCount = allPlatformStudents.filter(
        (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
      ).length;
      const staffCount = allPlatformStaffRecords.filter(
        (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
      ).length;
      return {
        name: t.shortName || t.name.slice(0, 18),
        students: studentsCount,
        staff: staffCount,
      };
    });
  }, [tenants, allPlatformStudents, allPlatformStaffRecords]);

  const statusDistribution = useMemo(() => {
    return [
      { name: 'Active', value: metrics.activeInstitutes, color: '#059669' },
      { name: 'Free Trial', value: metrics.trialInstitutes, color: '#2563EB' },
      { name: 'Suspended', value: metrics.suspendedInstitutes, color: '#DC2626' },
      { name: 'Expired / Pending', value: metrics.expiredInstitutes + metrics.pendingInstitutes, color: '#D97706' },
    ].filter((d) => d.value > 0);
  }, [metrics]);

  return (
    <div className="space-y-6">
      {/* Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            ZACMA Super Admin Control Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-tenant SaaS operations, institute provisioning, subscription billing, and platform telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('sa_add_institute')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Training Institute
          </button>
          <button
            type="button"
            onClick={() => onNavigate('sa_analytics')}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            Platform Analytics
          </button>
        </div>
      </div>

      <ModuleAiToolbar
        isSuperAdminMode
        moduleKey="sa_dashboard"
        moduleLabel="Super Admin Platform Intelligence"
      />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Registered Institutes
            </span>
            <Building2 className="w-4 h-4 text-[#0B2545]" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {metrics.totalInstitutes}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            <span className="text-emerald-700 font-semibold">{metrics.activeInstitutes} Active</span>
            {' · '}
            <span className="text-blue-700 font-semibold">{metrics.trialInstitutes} Trial</span>
            {' · '}
            <span className="text-red-600 font-semibold">{metrics.suspendedInstitutes} Suspended</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Platform Revenue (SaaS)
            </span>
            <CreditCard className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatEtbCompact(metrics.totalPlatformRevenue)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            MRR: <span className="font-semibold text-slate-800">{formatEtbCompact(metrics.mrr)}</span>
            {' · '}Pending: {formatEtbCompact(metrics.unpaidInvoicesAmount)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Students &amp; Staff
            </span>
            <GraduationCap className="w-4 h-4 text-blue-700" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {metrics.totalStudents.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            Across all tenants · <span className="font-semibold text-slate-800">{metrics.totalStaff}</span> Staff records
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Subscriptions &amp; Storage
            </span>
            <HardDrive className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {metrics.paidSubscriptions} <span className="text-sm font-medium text-slate-500">Paid</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {metrics.upcomingRenewals} renewing in 30d · {metrics.expiredInstitutes} expired ·{' '}
            {metrics.totalStorageUsedMb} MB used
          </p>
        </div>
      </div>

      {/* Secondary Operational Counters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('sa_institutes')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-3 transition-colors"
        >
          <p className="text-[11px] text-slate-500 font-medium">Pending Institutes</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{metrics.pendingInstitutes}</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sa_subscriptions')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-3 transition-colors"
        >
          <p className="text-[11px] text-slate-500 font-medium">Upcoming Renewals (30d)</p>
          <p className="text-lg font-bold text-amber-700 tabular-nums mt-0.5">{metrics.upcomingRenewals}</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sa_subscriptions')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-3 transition-colors"
        >
          <p className="text-[11px] text-slate-500 font-medium">Expired Subscriptions</p>
          <p className="text-lg font-bold text-red-700 tabular-nums mt-0.5">{metrics.expiredInstitutes}</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sa_support')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-3 transition-colors"
        >
          <p className="text-[11px] text-slate-500 font-medium">Open Support Tickets</p>
          <p className="text-lg font-bold text-blue-700 tabular-nums mt-0.5">{metrics.openTickets}</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('sa_support')}
          className="text-left bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-3 transition-colors"
        >
          <p className="text-[11px] text-slate-500 font-medium">Active Support Sessions</p>
          <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{metrics.activeSupportCount}</p>
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Students &amp; Staff per Institute</h2>
              <p className="text-[11px] text-slate-500">Live tenant population across registered institutes</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sa_institutes')}
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
            >
              Manage All <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={instituteBreakdown} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="students" name="Students" fill="#0B2545" radius={[4, 4, 0, 0]} />
                <Bar dataKey="staff" name="Staff" fill="#D97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900">Institute Account Status</h2>
          <p className="text-[11px] text-slate-500 mb-3">Active, trial, suspended, and expired breakdown</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution.length ? statusDistribution : [{ name: 'Active', value: 1, color: '#059669' }]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {(statusDistribution.length ? statusDistribution : [{ name: 'Active', value: 1, color: '#059669' }]).map(
                    (entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    )
                  )}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {statusDistribution.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
                <span className="font-semibold text-slate-900 tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Institutes & Platform Subscriptions Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Registered Training Institutes</h2>
            <p className="text-[11px] text-slate-500">
              All institutes are dynamically loaded from Firestore with strict tenant isolation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('sa_institutes')}
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            Open Full Directory
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5">Institute</th>
                <th className="px-4 py-2.5">Plan &amp; Cycle</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Students / Limit</th>
                <th className="px-4 py-2.5">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tenants.slice(0, 6).map((t) => {
                const count = allPlatformStudents.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
                ).length;
                const sub = platformSubscriptions.find((ps) => ps.tenantId === t.tenantId);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{t.tenantId} · {t.city}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{t.planName}</p>
                      <p className="text-[11px] text-slate-500">
                        {t.billingCycle} · {sub?.priceEtb ? formatEtbCompact(sub.priceEtb) : 'Platform Owner / Trial'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                          t.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : t.status === 'TRIAL'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : t.status === 'SUSPENDED'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">
                      {count} / {t.studentLimit}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">
                      {t.isDefaultPlatformTenant ? 'Perpetual' : formatDateShort(t.subscriptionExpiresAt)}
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

export function PlatformRevenueView() {
  const {
    profile,
    platformRole,
    tenants,
    platformInvoices,
    platformPayments,
    pushToast,
  } = usePortal();

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<PlatformInvoice | null>(null);
  const [invCycle, setInvCycle] = useState<BillingCycle>('MONTHLY');
  const [invAmount, setInvAmount] = useState('9500');
  const [invDueDate, setInvDueDate] = useState(addDaysIso(todayIsoDate(), 7));
  const [invNotes, setInvNotes] = useState('');

  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIsoDate());
  const [payMethod, setPayMethod] = useState<'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check'>('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const revenueStats = useMemo(() => {
    const collected = platformPayments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((acc, p) => acc + Number(p.amountEtb || 0), 0);
    const pending = platformInvoices
      .filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE')
      .reduce((acc, i) => acc + Number(i.amountEtb || 0), 0);
    const mrr = tenants
      .filter((t) => t.status === 'ACTIVE' && !t.isDefaultPlatformTenant)
      .reduce((acc, t) => acc + (t.billingCycle === 'ANNUAL' ? t.annualPriceEtb / 12 : t.monthlyPriceEtb), 0);
    return {
      collected,
      pending,
      mrr,
      arr: mrr * 12,
    };
  }, [platformPayments, platformInvoices, tenants]);

  const handleIssueInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !platformRole) return;
    const tenant = tenants.find((t) => t.tenantId === selectedTenantId);
    if (!tenant) {
      pushToast('error', 'Select a training institute first.');
      return;
    }
    setSaving(true);
    try {
      const invNo = await createPlatformInvoice(
        {
          tenant,
          planName: tenant.planName,
          billingCycle: invCycle,
          amountEtb: Number(invAmount) || 0,
          dueDate: invDueDate,
          notes: invNotes,
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      pushToast('success', `Platform subscription invoice ${invNo} issued for ${tenant.name}.`);
      setShowInvoiceModal(false);
      setInvNotes('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create invoice.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !platformRole) return;
    const tenant = tenants.find(
      (t) => t.tenantId === (selectedInvoice?.tenantId || selectedTenantId)
    );
    if (!tenant) {
      pushToast('error', 'Select a training institute.');
      return;
    }
    setSaving(true);
    try {
      await recordPlatformPayment(
        {
          tenant,
          invoice: selectedInvoice || undefined,
          planName: selectedInvoice?.planName || tenant.planName,
          amountEtb: Number(payAmount) || 0,
          paymentDate: payDate,
          paymentMethod: payMethod,
          paymentRef: payRef,
          notes: payNotes,
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      pushToast('success', `Platform subscription payment recorded for ${tenant.name}.`);
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      setPayRef('');
      setPayNotes('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to record platform payment.');
    } finally {
      setSaving(false);
    }
  };

  const openPayInvoice = (inv: PlatformInvoice) => {
    setSelectedInvoice(inv);
    setSelectedTenantId(inv.tenantId);
    setPayAmount(String(inv.amountEtb));
    setPayRef(`ZAC-SUB-${Date.now().toString().slice(-6)}`);
    setShowPaymentModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Platform Subscription Revenue</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            ZACMA SaaS billing ledger — strictly separated from individual institute student tuition revenue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedTenantId(tenants.find((t) => !t.isDefaultPlatformTenant)?.tenantId || tenants[0]?.tenantId || '');
              setShowInvoiceModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            <FileText className="w-4 h-4" />
            Issue Platform Invoice
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedInvoice(null);
              setSelectedTenantId(tenants.find((t) => !t.isDefaultPlatformTenant)?.tenantId || tenants[0]?.tenantId || '');
              setPayAmount('9500');
              setPayRef(`ZAC-SUB-${Date.now().toString().slice(-6)}`);
              setShowPaymentModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
          >
            <Receipt className="w-4 h-4" />
            Record Subscription Payment
          </button>
        </div>
      </div>

      {/* Accounting Separation Notice */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900">
          <strong>Financial Boundary Enforced:</strong> This ledger tracks exclusively B2B SaaS subscription invoices and payments from Training Institutes to ZACMA Technology. Student tuition fees collected by institutes never appear in Platform Revenue.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Collected Platform Revenue</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1.5">
            {formatEtb(revenueStats.collected)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">{platformPayments.length} settled SaaS payments</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Monthly Recurring Revenue (MRR)</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1.5">
            {formatEtb(revenueStats.mrr)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Normalized active paid tenants</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Annual Run Rate (ARR)</p>
          <p className="text-2xl font-bold text-[#0B2545] tabular-nums mt-1.5">
            {formatEtb(revenueStats.arr)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Projected 12-month SaaS billing</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Outstanding Platform Invoices</p>
          <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1.5">
            {formatEtb(revenueStats.pending)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {platformInvoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE').length} awaiting settlement
          </p>
        </div>
      </div>

      {/* Platform Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Platform Subscription Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="px-4 py-2.5">Invoice #</th>
                <th className="px-4 py-2.5">Institute</th>
                <th className="px-4 py-2.5">Plan / Cycle</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Due Date</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {platformInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No platform invoices issued yet. Click &ldquo;Issue Platform Invoice&rdquo; or onboard a paid institute.
                  </td>
                </tr>
              ) : (
                platformInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{inv.tenantName}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{inv.tenantId}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{inv.planName} · {inv.billingCycle}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatEtb(inv.amountEtb)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDateShort(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                          inv.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : inv.status === 'OVERDUE'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.status !== 'PAID' ? (
                        <button
                          type="button"
                          onClick={() => openPayInvoice(inv)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                        >
                          Record Payment
                        </button>
                      ) : (
                        <span className="text-[11px] font-mono text-slate-500">{inv.paymentRef || 'Settled'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform Payments History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Settled Platform Subscription Payments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="px-4 py-2.5">Payment Ref</th>
                <th className="px-4 py-2.5">Institute</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Method</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {platformPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No platform subscription payments recorded yet.
                  </td>
                </tr>
              ) : (
                platformPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">{p.paymentRef}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.tenantName}</td>
                    <td className="px-4 py-3 text-slate-600">{p.planName}</td>
                    <td className="px-4 py-3 text-slate-600">{p.paymentMethod}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{formatDateShort(p.paymentDate)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">
                      {formatEtb(p.amountEtb)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Platform Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleIssueInvoice}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900">Issue Platform Subscription Invoice</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Training Institute</label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => {
                    const tid = e.target.value;
                    setSelectedTenantId(tid);
                    const t = tenants.find((x) => x.tenantId === tid);
                    if (t) setInvAmount(String(t.monthlyPriceEtb || 9500));
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  required
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.tenantId}>
                      {t.name} ({t.planName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
                  <select
                    value={invCycle}
                    onChange={(e) => setInvCycle(e.target.value as BillingCycle)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (ETB)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={invDueDate}
                  onChange={(e) => setInvDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  placeholder="Optional renewal reference..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Issuing...' : 'Issue Invoice'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Platform Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordPayment}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900">
              {selectedInvoice
                ? `Settle Invoice ${selectedInvoice.invoiceNumber}`
                : 'Record Platform Subscription Payment'}
            </h3>
            <div className="space-y-3">
              {!selectedInvoice && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Institute</label>
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.tenantId}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (ETB)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) =>
                      setPayMethod(
                        e.target.value as 'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check'
                      )
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Chapa">Chapa</option>
                    <option value="Telebirr">Telebirr</option>
                    <option value="CBE Birr">CBE Birr</option>
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reference #</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional bank transfer or Chapa note"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function PlatformAnalyticsView() {
  const {
    tenants,
    platformSubscriptions,
    platformInvoices,
    platformPayments,
    allPlatformStudents,
    allPlatformStaffRecords,
    allPlatformPayments,
    allPlatformAuditLogs,
    pushToast,
  } = usePortal();

  const [dateFrom, setDateFrom] = useState(addDaysIso(todayIsoDate(), -180));
  const [dateTo, setDateTo] = useState(todayIsoDate());

  const moduleAdoptionData = useMemo(() => {
    return ALL_SAAS_MODULES.map((mod) => ({
      name: mod.label.replace(' & ', '/').slice(0, 18),
      institutes: tenants.filter((t) => (t.enabledModules || []).includes(mod.code)).length,
    })).sort((a, b) => b.institutes - a.institutes);
  }, [tenants]);

  const growthSeries = useMemo(() => {
    const byMonth = new Map<string, { month: string; institutes: number; platformRevenue: number }>();
    for (const t of tenants) {
      const m = t.createdAt.slice(0, 7);
      if (t.createdAt.slice(0, 10) < dateFrom || t.createdAt.slice(0, 10) > dateTo) continue;
      const cur = byMonth.get(m) || { month: m, institutes: 0, platformRevenue: 0 };
      cur.institutes += 1;
      byMonth.set(m, cur);
    }
    for (const p of platformPayments) {
      if (p.status !== 'COMPLETED') continue;
      const m = p.paymentDate.slice(0, 7);
      if (p.paymentDate < dateFrom || p.paymentDate > dateTo) continue;
      const cur = byMonth.get(m) || { month: m, institutes: 0, platformRevenue: 0 };
      cur.platformRevenue += Number(p.amountEtb || 0);
      byMonth.set(m, cur);
    }
    return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [tenants, platformPayments, dateFrom, dateTo]);

  const trialConversionRate = useMemo(() => {
    const nonDefault = tenants.filter((t) => !t.isDefaultPlatformTenant);
    if (nonDefault.length === 0) return 0;
    const paid = nonDefault.filter((t) => t.status === 'ACTIVE' && t.monthlyPriceEtb > 0).length;
    return Math.round((paid / nonDefault.length) * 100);
  }, [tenants]);

  const instituteTuitionVolume = useMemo(() => {
    return allPlatformPayments
      .filter((p) => p.status === 'APPROVED')
      .reduce((acc, p) => acc + Number(p.amountEtb || 0), 0);
  }, [allPlatformPayments]);

  const handleExport = () => {
    exportPlatformAnalyticsWorkbook({
      tenants,
      subscriptions: platformSubscriptions,
      invoices: platformInvoices,
      platformPayments,
      allStudents: allPlatformStudents,
      allStaffRecords: allPlatformStaffRecords,
      auditLogs: allPlatformAuditLogs,
    });
    pushToast('success', 'Downloaded ZACMA SaaS Platform Analytics workbook (.xlsx).');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Platform Analytics &amp; Reports</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Growth trends, trial-to-paid conversion, module utilization, and downloadable executive reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
          />
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
          >
            <Download className="w-4 h-4" />
            Export Excel (.xlsx)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Trial-to-Paid Conversion</p>
          <p className="text-2xl font-bold text-blue-700 tabular-nums mt-1">{trialConversionRate}%</p>
          <p className="text-[11px] text-slate-500 mt-1">Active paid tenants vs onboarded institutes</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Platform SaaS Billing</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {formatEtbCompact(
              platformPayments
                .filter((p) => p.status === 'COMPLETED')
                .reduce((acc, p) => acc + p.amountEtb, 0)
            )}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">ZACMA subscription revenue</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Institute Tuition Processed</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatEtbCompact(instituteTuitionVolume)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Aggregate student fees (separate from SaaS)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold uppercase text-slate-500">Storage Utilization</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {tenants.reduce((a, t) => a + (t.storageUsedMb || 0), 0)} MB
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            of {(tenants.reduce((a, t) => a + (t.storageLimitMb || 0), 0) / 1024).toFixed(1)} GB allocated
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Institute Onboarding &amp; Platform Revenue Trend</h2>
          <p className="text-[11px] text-slate-500 mb-4">Monthly new institutes vs settled SaaS subscription revenue</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthSeries} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#059669' }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="institutes"
                  name="New Institutes"
                  stroke="#0B2545"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="platformRevenue"
                  name="Platform Revenue (ETB)"
                  stroke="#059669"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-1">Most-Used Platform Modules</h2>
          <p className="text-[11px] text-slate-500 mb-4">Number of institutes with each SaaS module active</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={moduleAdoptionData.slice(0, 8)}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 20, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis dataKey="name" type="category" width={115} tick={{ fontSize: 10, fill: '#334155' }} />
                <Tooltip />
                <Bar dataKey="institutes" name="Institutes Enabled" fill="#2563EB" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Per-Institute Utilization Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Tenant Capacity &amp; Activity Utilization</h2>
          <span className="text-[11px] text-slate-500">{tenants.length} total institutes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="px-4 py-2.5">Institute</th>
                <th className="px-4 py-2.5 text-right">Students</th>
                <th className="px-4 py-2.5 text-right">Staff</th>
                <th className="px-4 py-2.5 text-right">Storage</th>
                <th className="px-4 py-2.5 text-right">Modules</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {tenants.map((t) => {
                const stu = allPlatformStudents.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
                ).length;
                const stf = allPlatformStaffRecords.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
                ).length;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">{t.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {stu} / {t.studentLimit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {stf} / {t.staffLimit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {t.storageUsedMb} / {t.storageLimitMb} MB
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {t.enabledModules?.length || 0} / {ALL_SAAS_MODULES.length}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                        {t.status === 'ACTIVE' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : t.status === 'SUSPENDED' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        ) : (
                          <Users className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        {t.status}
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
