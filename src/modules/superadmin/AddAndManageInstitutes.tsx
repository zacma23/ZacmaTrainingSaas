import React, { useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Layers,
  Palette,
  PlayCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import {
  ALL_SAAS_MODULES,
  createTenantInvitation,
  DEFAULT_SUBSCRIPTION_PLANS,
  DEFAULT_ZACMA_TENANT_ID,
  ProvisionInstituteResult,
  provisionTrainingInstitute,
  reactivateTenant,
  suspendTenant,
  updateTenantBySuperAdmin,
  updateTenantLimits,
  updateTenantModules,
  upgradeOrExtendSubscription,
} from '../../lib/saasService';
import { compressImageToDataUrl } from '../../lib/zacmaService';
import {
  addDaysIso,
  BillingCycle,
  formatDateShort,
  formatEtbCompact,
  PaymentMethod,
  SaasModuleCode,
  SuperAdminNavSection,
  TenantRecord,
  todayIsoDate,
} from '../../types/zacma';

const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'CBE Birr',
  'Telebirr',
  'Bank Transfer',
  'Check',
  'Chapa',
];

export function AddTrainingInstituteView({
  onNavigate,
}: {
  onNavigate: (section: SuperAdminNavSection) => void;
}) {
  const { profile, platformRole, subscriptionPlans, tenants, startSupportAccess, pushToast } = usePortal();
  const plans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const defaultPlan = plans.find((p) => p.code === 'PROFESSIONAL') || plans[0];

  // 1. Institute Information
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [businessType, setBusinessType] = useState('Technology & Vocational Training Institute');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+251 ');
  const [country, setCountry] = useState('Ethiopia');
  const [city, setCity] = useState('Addis Ababa');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // 2. Institute Admin Contact
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('+251 ');
  const [adminPosition, setAdminPosition] = useState('Institute Director & Administrator');

  // 3. Institute Configuration
  const [studentIdPrefix, setStudentIdPrefix] = useState('STU');
  const [staffIdPrefix, setStaffIdPrefix] = useState('STA');
  const [receiptPrefix, setReceiptPrefix] = useState('RCP');
  const [currency, setCurrency] = useState<'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP'>('ETB');
  const [timezone, setTimezone] = useState('Africa/Addis_Ababa');
  const [academicYear, setAcademicYear] = useState(`${new Date().getFullYear()}/${new Date().getFullYear() + 1}`);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    'Cash',
    'CBE Birr',
    'Telebirr',
    'Bank Transfer',
    'Chapa',
  ]);
  const [defaultLanguage, setDefaultLanguage] = useState('English (Ethiopia)');
  const [dateFormat, setDateFormat] = useState<TenantRecord['dateFormat']>('GREGORIAN_AND_ETHIOPIAN');
  const [primaryColor, setPrimaryColor] = useState('#0B2545');
  const [secondaryColor, setSecondaryColor] = useState('#D97706');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState('');
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSms, setNotifSms] = useState(true);
  const [notifWhatsapp, setNotifWhatsapp] = useState(false);

  // 4. Subscription Configuration
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlan?.id || 'plan_professional');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [trialDays, setTrialDays] = useState(defaultPlan?.trialDays ?? 14);
  const [expiresAt, setExpiresAt] = useState(addDaysIso(todayIsoDate(), 30));
  const [studentLimit, setStudentLimit] = useState(defaultPlan?.studentLimit ?? 1000);
  const [staffLimit, setStaffLimit] = useState(defaultPlan?.staffLimit ?? 80);
  const [storageLimitMb, setStorageLimitMb] = useState(defaultPlan?.storageLimitMb ?? 10240);
  const [aiMonthlyQuota, setAiMonthlyQuota] = useState(defaultPlan?.aiMonthlyQuota ?? 2000);
  const [monthlyPriceEtb, setMonthlyPriceEtb] = useState(defaultPlan?.monthlyPriceEtb ?? 9500);
  const [annualPriceEtb, setAnnualPriceEtb] = useState(defaultPlan?.annualPriceEtb ?? 95000);
  const [enabledModules, setEnabledModules] = useState<SaasModuleCode[]>(
    defaultPlan?.includedModules || ALL_SAAS_MODULES.map((m) => m.code)
  );
  const [markInitialInvoicePaid, setMarkInitialInvoicePaid] = useState(true);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check'>('Bank Transfer');

  const [submitting, setSubmitting] = useState(false);
  const [provisioned, setProvisioned] = useState<ProvisionInstituteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePlanChange = (planId: string) => {
    setSelectedPlanId(planId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setStudentLimit(plan.studentLimit);
    setStaffLimit(plan.staffLimit);
    setStorageLimitMb(plan.storageLimitMb);
    setAiMonthlyQuota(plan.aiMonthlyQuota);
    setMonthlyPriceEtb(plan.monthlyPriceEtb);
    setAnnualPriceEtb(plan.annualPriceEtb);
    setTrialDays(plan.trialDays);
    setEnabledModules(plan.includedModules);
    if (plan.code === 'FREE_TRIAL') {
      setBillingCycle('TRIAL');
      setExpiresAt(addDaysIso(startDate, plan.trialDays || 14));
    } else if (billingCycle === 'TRIAL') {
      setBillingCycle('MONTHLY');
      setExpiresAt(addDaysIso(startDate, 30));
    }
  };

  const handleCycleChange = (cycle: BillingCycle) => {
    setBillingCycle(cycle);
    if (cycle === 'TRIAL') {
      setExpiresAt(addDaysIso(startDate, trialDays || 14));
    } else if (cycle === 'ANNUAL') {
      setExpiresAt(addDaysIso(startDate, 365));
    } else {
      setExpiresAt(addDaysIso(startDate, 30));
    }
  };

  const handleNameBlur = () => {
    if (!name.trim()) return;
    const initials = name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
    if (initials && studentIdPrefix === 'STU') {
      setStudentIdPrefix(`${initials}-STU`);
      setStaffIdPrefix(`${initials}-STA`);
      setReceiptPrefix(`${initials}-RCP`);
    }
    if (!shortName.trim()) {
      setShortName(name.trim().slice(0, 28));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setLogoUrl(dataUrl);
      pushToast('success', 'Institute logo attached.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to load logo image.');
    }
  };

  const toggleModule = (code: SaasModuleCode) => {
    setEnabledModules((prev) =>
      prev.includes(code) ? prev.filter((m) => m !== code) : [...prev, code]
    );
  };

  const togglePayMethod = (method: PaymentMethod) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const handleCreateInstitute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !platformRole) return;
    if (!name.trim() || !email.trim() || !adminName.trim() || !adminEmail.trim()) {
      pushToast('error', 'Please fill all required institute and administrator contact fields.');
      return;
    }
    const plan = plans.find((p) => p.id === selectedPlanId) || defaultPlan;
    setSubmitting(true);
    try {
      const res = await provisionTrainingInstitute(
        {
          name,
          shortName: shortName || name.slice(0, 28),
          businessType,
          email,
          phone,
          country,
          city,
          address: address || `${city}, ${country}`,
          website,
          logoUrl,
          primaryAdminName: adminName,
          primaryAdminEmail: adminEmail,
          primaryAdminPhone: adminPhone,
          primaryAdminPosition: adminPosition,
          studentIdPrefix,
          staffIdPrefix,
          receiptPrefix,
          currency,
          timezone,
          academicYear,
          paymentMethods,
          defaultLanguage,
          dateFormat,
          primaryColor,
          secondaryColor,
          invoiceFooterNote,
          notificationEmailEnabled: notifEmail,
          notificationSmsEnabled: notifSms,
          notificationWhatsappEnabled: notifWhatsapp,
          planId: plan?.id || 'plan_custom',
          planCode: plan?.code || 'CUSTOM',
          planName: plan?.name || 'Custom Plan',
          billingCycle,
          monthlyPriceEtb,
          annualPriceEtb,
          subscriptionStartDate: startDate,
          trialDays,
          subscriptionExpiresAt: expiresAt,
          studentLimit,
          staffLimit,
          storageLimitMb,
          aiMonthlyQuota,
          enabledModules,
          markInitialInvoicePaid,
          initialPaymentMethod,
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      setProvisioned(res);
      pushToast('success', `Training institute "${name}" provisioned successfully (${res.tenantId}).`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Provisioning failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (provisioned) {
    const createdTenant = tenants.find((t) => t.tenantId === provisioned.tenantId);
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="bg-white border border-emerald-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Training Institute Provisioned &amp; Live</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                An isolated database tenant, default payment plans, expense categories, subscription record, and administrator onboarding invitation have been created automatically.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Unique Tenant ID</p>
              <p className="font-mono font-bold text-slate-900 mt-0.5">{provisioned.tenantId}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Admin Invite Email</p>
              <p className="font-semibold text-slate-900 mt-0.5">{adminEmail}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Platform Invoice</p>
              <p className="font-mono font-semibold text-slate-900 mt-0.5">
                {provisioned.invoiceNumber || 'Trial / Zero Balance'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Secure Institute Administrator Onboarding Link
            </label>
            <p className="text-[11px] text-slate-500">
              Share this link with <strong>{adminName}</strong> ({adminEmail}). When they sign up or sign in with this email, the portal automatically binds them as <strong>Institute Admin</strong> inside their isolated <strong>{name}</strong> workspace.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={provisioned.inviteUrl}
                className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(provisioned.inviteUrl).catch(() => undefined);
                  setCopied(true);
                  pushToast('success', 'Onboarding invite link copied to clipboard.');
                  window.setTimeout(() => setCopied(false), 2500);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setProvisioned(null);
                  setName('');
                  setShortName('');
                  setEmail('');
                  setAdminName('');
                  setAdminEmail('');
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Register Another Institute
              </button>
              <button
                type="button"
                onClick={() => onNavigate('sa_institutes')}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                View All Institutes
              </button>
            </div>
            {createdTenant && (
              <button
                type="button"
                onClick={() =>
                  void startSupportAccess(
                    createdTenant,
                    'Initial onboarding verification after institute provisioning',
                    30
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
              >
                <ExternalLink className="w-4 h-4" />
                Inspect Portal (Support Session)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreateInstitute} className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Add Training Institute</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Provision a new independent, custom-branded training institute workspace with automatic database isolation and admin invitation.
          </p>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {submitting ? 'PROVISIONING INSTITUTE...' : 'CREATE INSTITUTE'}
        </button>
      </div>

      {/* Section 1: Institute Information */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Building2 className="w-4 h-4 text-[#0B2545]" />
          <h2 className="text-sm font-bold text-slate-900">1. Institute Information</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Legal Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              placeholder="e.g., Horizon Digital Skills Academy"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Short / Brand Name *</label>
            <input
              type="text"
              required
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="e.g., Horizon Academy"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Business Type</label>
            <input
              type="text"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Official Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@institute.edu.et"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Website (Optional)</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Campus Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Sub-city, building, floor, street address"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Logo (Optional)</label>
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo preview"
                  className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  {(shortName || name || 'IN').slice(0, 2).toUpperCase()}
                </div>
              )}
              <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                <Upload className="w-3.5 h-3.5" />
                Upload Logo
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Institute Admin Contact */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <UserPlus className="w-4 h-4 text-[#0B2545]" />
          <h2 className="text-sm font-bold text-slate-900">2. Primary Institute Administrator</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Full Name *</label>
            <input
              type="text"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g., Dawit Bekele"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Login Email *</label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="director@institute.edu.et"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Admin Phone *</label>
            <input
              type="text"
              required
              value={adminPhone}
              onChange={(e) => setAdminPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Role / Position</label>
            <input
              type="text"
              value={adminPosition}
              onChange={(e) => setAdminPosition(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* Section 3: Institute Configuration & Branding */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Palette className="w-4 h-4 text-[#0B2545]" />
          <h2 className="text-sm font-bold text-slate-900">3. Institute Configuration &amp; Custom Branding</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Student ID Prefix</label>
            <input
              type="text"
              value={studentIdPrefix}
              onChange={(e) => setStudentIdPrefix(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Staff ID Prefix</label>
            <input
              type="text"
              value={staffIdPrefix}
              onChange={(e) => setStaffIdPrefix(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt Prefix</label>
            <input
              type="text"
              value={receiptPrefix}
              onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'ETB' | 'USD' | 'KES' | 'EUR' | 'GBP')}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            >
              <option value="ETB">ETB — Ethiopian Birr</option>
              <option value="USD">USD — US Dollar</option>
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            >
              <option value="Africa/Addis_Ababa">Africa/Addis_Ababa (EAT, UTC+3)</option>
              <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Academic Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Default Language</label>
            <select
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            >
              <option value="English (Ethiopia)">English (Ethiopia)</option>
              <option value="English (US)">English (US)</option>
              <option value="Amharic / English">Amharic / English</option>
              <option value="Afaan Oromo / English">Afaan Oromo / English</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Date Format</label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as TenantRecord['dateFormat'])}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            >
              <option value="GREGORIAN_AND_ETHIOPIAN">Gregorian + Ethiopian Calendar</option>
              <option value="GREGORIAN_ONLY">Gregorian Only</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Brand Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-9 rounded border border-slate-300 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Secondary Accent Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-9 rounded border border-slate-300 cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / Invoice Footer Note</label>
            <input
              type="text"
              value={invoiceFooterNote}
              onChange={(e) => setInvoiceFooterNote(e.target.value)}
              placeholder="Appears at the bottom of student payment receipts"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Accepted Tuition Payment Methods</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PAYMENT_METHODS.map((m) => (
                <label
                  key={m}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={paymentMethods.includes(m)}
                    onChange={() => togglePayMethod(m)}
                    className="rounded text-[#0B2545]"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Notification Preferences</label>
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={notifEmail} onChange={(e) => setNotifEmail(e.target.checked)} />
                Email Alerts
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={notifSms} onChange={(e) => setNotifSms(e.target.checked)} />
                SMS Gateway
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={notifWhatsapp} onChange={(e) => setNotifWhatsapp(e.target.checked)} />
                WhatsApp Cloud
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Subscription & Modules Configuration */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Layers className="w-4 h-4 text-[#0B2545]" />
          <h2 className="text-sm font-bold text-slate-900">4. Subscription Plan, Quotas &amp; Enabled Modules</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {plans.map((p) => {
            const selected = p.id === selectedPlanId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePlanChange(p.id)}
                className={`text-left p-3.5 rounded-xl border transition-colors ${
                  selected
                    ? 'border-[#0B2545] bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-900'
                }`}
              >
                <p className="text-xs font-bold">{p.name}</p>
                <p className={`text-lg font-bold tabular-nums mt-1 ${selected ? 'text-amber-400' : 'text-[#0B2545]'}`}>
                  {p.monthlyPriceEtb === 0 ? 'FREE' : `${formatEtbCompact(p.monthlyPriceEtb)}/mo`}
                </p>
                <p className={`text-[11px] mt-1 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                  Up to {p.studentLimit} students · {p.staffLimit} staff · {p.includedModules.length} modules
                </p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
            <select
              value={billingCycle}
              onChange={(e) => handleCycleChange(e.target.value as BillingCycle)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            >
              <option value="TRIAL">Free Trial</option>
              <option value="MONTHLY">Monthly Billing</option>
              <option value="ANNUAL">Annual Billing</option>
              <option value="CUSTOM">Custom Contract</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry Date</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Fee (ETB)</label>
            <input
              type="number"
              min="0"
              value={monthlyPriceEtb}
              onChange={(e) => setMonthlyPriceEtb(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Max Students Limit</label>
            <input
              type="number"
              min="1"
              value={studentLimit}
              onChange={(e) => setStudentLimit(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Max Staff Limit</label>
            <input
              type="number"
              min="1"
              value={staffLimit}
              onChange={(e) => setStaffLimit(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Limit (MB)</label>
            <input
              type="number"
              min="128"
              value={storageLimitMb}
              onChange={(e) => setStorageLimitMb(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly AI Quota</label>
            <input
              type="number"
              min="0"
              value={aiMonthlyQuota}
              onChange={(e) => setAiMonthlyQuota(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
        </div>

        {billingCycle !== 'TRIAL' && monthlyPriceEtb > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={markInitialInvoicePaid}
                onChange={(e) => setMarkInitialInvoicePaid(e.target.checked)}
              />
              Mark initial platform invoice as PAID immediately (record subscription revenue)
            </label>
            {markInitialInvoicePaid && (
              <select
                value={initialPaymentMethod}
                onChange={(e) =>
                  setInitialPaymentMethod(
                    e.target.value as 'Bank Transfer' | 'Chapa' | 'Telebirr' | 'CBE Birr' | 'Cash' | 'Check'
                  )
                }
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Chapa">Chapa</option>
                <option value="Telebirr">Telebirr</option>
                <option value="CBE Birr">CBE Birr</option>
                <option value="Cash">Cash</option>
              </select>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-800 mb-2">
            Enabled SaaS Modules ({enabledModules.length} / {ALL_SAAS_MODULES.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ALL_SAAS_MODULES.map((mod) => {
              const checked = enabledModules.includes(mod.code);
              return (
                <label
                  key={mod.code}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModule(mod.code)}
                    className="mt-0.5 rounded text-[#0B2545]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{mod.label}</p>
                    <p className="text-[10px] text-slate-500 leading-snug">{mod.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-3 text-xs font-bold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {submitting ? 'PROVISIONING INSTITUTE...' : 'CREATE INSTITUTE'}
        </button>
      </div>
    </form>
  );
}

export function AllInstitutesView({
  onNavigate,
}: {
  onNavigate: (section: SuperAdminNavSection) => void;
}) {
  const {
    profile,
    platformRole,
    tenants,
    subscriptionPlans,
    platformSubscriptions,
    platformPayments,
    tenantInvitations,
    allPlatformStudents,
    allPlatformStaffRecords,
    allPlatformPayments,
    allPlatformAuditLogs,
    startSupportAccess,
    pushToast,
  } = usePortal();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTenant, setSelectedTenant] = useState<TenantRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'edit' | 'limits' | 'modules' | 'admin' | 'logs'>('overview');

  // Support Access Modal
  const [supportTarget, setSupportTarget] = useState<TenantRecord | null>(null);
  const [supportReason, setSupportReason] = useState('');
  const [supportDuration, setSupportDuration] = useState(30);

  // Suspend Modal
  const [suspendTarget, setSuspendTarget] = useState<TenantRecord | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Upgrade Modal
  const [upgradeTarget, setUpgradeTarget] = useState<TenantRecord | null>(null);
  const [upgradePlanId, setUpgradePlanId] = useState('');
  const [upgradeCycle, setUpgradeCycle] = useState<BillingCycle>('MONTHLY');
  const [upgradeExpiry, setUpgradeExpiry] = useState(addDaysIso(todayIsoDate(), 30));
  const [upgradeApplyModules, setUpgradeApplyModules] = useState(true);
  const [upgradeGenInvoice, setUpgradeGenInvoice] = useState(true);

  // Edit / Limits / Invite form states
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPrimary, setEditPrimary] = useState('#0B2545');
  const [limitStu, setLimitStu] = useState(100);
  const [limitStf, setLimitStf] = useState(20);
  const [limitStorage, setLimitStorage] = useState(2048);
  const [limitAi, setLimitAi] = useState(500);
  const [newInviteName, setNewInviteName] = useState('');
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.tenantId.toLowerCase().includes(q) ||
        t.primaryAdminEmail.toLowerCase().includes(q) ||
        t.city.toLowerCase().includes(q)
      );
    });
  }, [tenants, search, statusFilter]);

  const openDrawer = (t: TenantRecord, tab: typeof drawerTab = 'overview') => {
    setSelectedTenant(t);
    setDrawerTab(tab);
    setEditName(t.name);
    setEditEmail(t.email);
    setEditPhone(t.phone);
    setEditCity(t.city);
    setEditPrimary(t.primaryColor);
    setLimitStu(t.studentLimit);
    setLimitStf(t.staffLimit);
    setLimitStorage(t.storageLimitMb);
    setLimitAi(t.aiMonthlyQuota);
    setNewInviteName(t.primaryAdminName);
    setNewInviteEmail(t.primaryAdminEmail);
    setGeneratedInviteUrl('');
  };

  const activeDrawerTenant = selectedTenant
    ? tenants.find((t) => t.id === selectedTenant.id) || selectedTenant
    : null;

  const handleSaveEdit = async () => {
    if (!activeDrawerTenant || !profile || !platformRole) return;
    setBusy(true);
    try {
      await updateTenantBySuperAdmin(
        activeDrawerTenant.id,
        {
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          city: editCity.trim(),
          primaryColor: editPrimary,
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole },
        `Edited core details for ${editName.trim()}`
      );
      pushToast('success', 'Institute profile updated.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLimits = async () => {
    if (!activeDrawerTenant || !profile || !platformRole) return;
    setBusy(true);
    try {
      await updateTenantLimits(
        activeDrawerTenant,
        {
          studentLimit: Number(limitStu),
          staffLimit: Number(limitStf),
          storageLimitMb: Number(limitStorage),
          aiMonthlyQuota: Number(limitAi),
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      pushToast('success', 'Institute usage limits updated.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to update limits.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDrawerModule = async (code: SaasModuleCode) => {
    if (!activeDrawerTenant || !profile || !platformRole) return;
    const current = activeDrawerTenant.enabledModules || [];
    const next = current.includes(code)
      ? current.filter((m) => m !== code)
      : [...current, code];
    try {
      await updateTenantModules(activeDrawerTenant, next, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('success', `Module ${code} ${next.includes(code) ? 'enabled' : 'disabled'} for ${activeDrawerTenant.shortName}.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Module toggle failed.');
    }
  };

  const handleCreateAdminInvite = async () => {
    if (!activeDrawerTenant || !profile || !platformRole || !newInviteEmail.trim()) return;
    setBusy(true);
    try {
      const res = await createTenantInvitation(
        {
          tenant: activeDrawerTenant,
          email: newInviteEmail,
          fullName: newInviteName || 'Institute Administrator',
          role: 'ADMIN',
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      setGeneratedInviteUrl(res.inviteUrl);
      pushToast('success', `Admin onboarding invitation issued for ${newInviteEmail}.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to create invitation.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendTarget || !profile || !platformRole) return;
    setBusy(true);
    try {
      await suspendTenant(suspendTarget, suspendReason, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('info', `${suspendTarget.name} has been suspended. All write actions are now locked.`);
      setSuspendTarget(null);
      setSuspendReason('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Suspension failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async (t: TenantRecord) => {
    if (!profile || !platformRole) return;
    try {
      await reactivateTenant(t, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: profile.role,
        platformRole,
      });
      pushToast('success', `${t.name} has been reactivated.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Reactivation failed.');
    }
  };

  const handleConfirmSupportAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportTarget) return;
    setBusy(true);
    try {
      await startSupportAccess(supportTarget, supportReason, supportDuration);
      setSupportTarget(null);
      setSupportReason('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to start support access.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeTarget || !profile || !platformRole) return;
    const plans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
    const plan = plans.find((p) => p.id === upgradePlanId) || plans[0];
    const existingSub = platformSubscriptions.find((s) => s.tenantId === upgradeTarget.tenantId);
    setBusy(true);
    try {
      await upgradeOrExtendSubscription(
        upgradeTarget,
        existingSub,
        {
          plan,
          billingCycle: upgradeCycle,
          newExpiresAt: upgradeExpiry,
          applyPlanModulesAndLimits: upgradeApplyModules,
          generateInvoice: upgradeGenInvoice,
        },
        { uid: profile.uid, fullName: profile.fullName, role: profile.role, platformRole }
      );
      pushToast('success', `Subscription updated for ${upgradeTarget.name} (${plan.name}).`);
      setUpgradeTarget(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Subscription upgrade failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">All Training Institutes</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect, edit, upgrade, suspend/reactivate, manage quotas &amp; modules, or open audited Support Access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('sa_add_institute')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Add Training Institute
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by institute name, tenant ID, city, or admin email..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
        >
          <option value="ALL">All Statuses ({tenants.length})</option>
          <option value="ACTIVE">Active</option>
          <option value="TRIAL">Free Trial</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="EXPIRED">Expired</option>
          <option value="PENDING">Pending</option>
        </select>
      </div>

      {/* Institutes Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                <th className="px-4 py-2.5">Institute &amp; Tenant ID</th>
                <th className="px-4 py-2.5">Admin Contact</th>
                <th className="px-4 py-2.5">Plan &amp; Expiry</th>
                <th className="px-4 py-2.5 text-right">Usage</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Management Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredTenants.map((t) => {
                const stuCount = allPlatformStudents.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
                ).length;
                const stfCount = allPlatformStaffRecords.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === t.tenantId
                ).length;
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {t.logoUrl ? (
                          <img src={t.logoUrl} alt={t.shortName} className="w-8 h-8 rounded object-cover border border-slate-200" />
                        ) : (
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                            style={{ backgroundColor: t.primaryColor || '#0B2545' }}
                          >
                            {(t.shortName || t.name).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-900">{t.name}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {t.tenantId} · {t.city}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{t.primaryAdminName}</p>
                      <p className="text-[11px] text-slate-500">{t.primaryAdminEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{t.planName}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        {t.isDefaultPlatformTenant ? 'Flagship Owner' : `Exp: ${formatDateShort(t.subscriptionExpiresAt)}`}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <p className="font-semibold text-slate-800">{stuCount} / {t.studentLimit} stu</p>
                      <p className="text-[11px] text-slate-500">{stfCount} / {t.staffLimit} staff</p>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openDrawer(t, 'overview')}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded"
                        >
                          Manage
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUpgradeTarget(t);
                            setUpgradePlanId(t.planId || (subscriptionPlans[0]?.id ?? 'plan_professional'));
                            setUpgradeCycle(t.billingCycle);
                            setUpgradeExpiry(addDaysIso(todayIsoDate(), t.billingCycle === 'ANNUAL' ? 365 : 30));
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded"
                        >
                          Upgrade
                        </button>
                        {!t.isDefaultPlatformTenant && (
                          t.status === 'SUSPENDED' ? (
                            <button
                              type="button"
                              onClick={() => void handleReactivate(t)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded"
                            >
                              <PlayCircle className="w-3 h-3" />
                              Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSuspendTarget(t);
                                setSuspendReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded"
                            >
                              <Ban className="w-3 h-3" />
                              Suspend
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSupportTarget(t);
                            setSupportReason('');
                            setSupportDuration(30);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          Support Access
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Institute Detail & Governance Drawer */}
      {activeDrawerTenant && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl border-l border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">{activeDrawerTenant.name}</h2>
                <p className="text-[11px] font-mono text-slate-500">
                  {activeDrawerTenant.tenantId} · {activeDrawerTenant.planName} · {activeDrawerTenant.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 pt-2 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: 'overview', label: 'Analytics & Finance' },
                  { id: 'edit', label: 'Edit Profile' },
                  { id: 'limits', label: 'Usage Limits' },
                  { id: 'modules', label: 'Modules' },
                  { id: 'admin', label: 'Administrators' },
                  { id: 'logs', label: 'Audit Logs' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDrawerTab(tab.id)}
                  className={`px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap ${
                    drawerTab === tab.id
                      ? 'border-[#0B2545] text-[#0B2545]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {drawerTab === 'overview' && (() => {
                const tStu = allPlatformStudents.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === activeDrawerTenant.tenantId
                );
                const tStf = allPlatformStaffRecords.filter(
                  (s) => (s.tenantId || DEFAULT_ZACMA_TENANT_ID) === activeDrawerTenant.tenantId
                );
                const tTuition = allPlatformPayments
                  .filter(
                    (p) =>
                      (p.tenantId || DEFAULT_ZACMA_TENANT_ID) === activeDrawerTenant.tenantId &&
                      p.status === 'APPROVED'
                  )
                  .reduce((a, p) => a + p.amountEtb, 0);
                const tSaaSPaid = platformPayments
                  .filter((p) => p.tenantId === activeDrawerTenant.tenantId && p.status === 'COMPLETED')
                  .reduce((a, p) => a + p.amountEtb, 0);

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] text-slate-500">Registered Students</p>
                        <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                          {tStu.length} <span className="text-xs font-normal text-slate-500">/ {activeDrawerTenant.studentLimit}</span>
                        </p>
                      </div>
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] text-slate-500">Registered Staff</p>
                        <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                          {tStf.length} <span className="text-xs font-normal text-slate-500">/ {activeDrawerTenant.staffLimit}</span>
                        </p>
                      </div>
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <p className="text-[11px] text-emerald-700 font-semibold">Platform Subscription Paid</p>
                        <p className="text-lg font-bold text-emerald-900 tabular-nums mt-1">
                          {formatEtbCompact(tSaaSPaid)}
                        </p>
                      </div>
                      <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-[11px] text-blue-700 font-semibold">Institute Student Tuition Collected</p>
                        <p className="text-lg font-bold text-blue-900 tabular-nums mt-1">
                          {formatEtbCompact(tTuition)}
                        </p>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                      <p className="font-bold text-slate-900">Configuration Summary</p>
                      <div className="grid grid-cols-2 gap-y-2 text-slate-600">
                        <span>Prefixes:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {activeDrawerTenant.studentIdPrefix} / {activeDrawerTenant.staffIdPrefix} / {activeDrawerTenant.receiptPrefix}
                        </span>
                        <span>Currency &amp; Timezone:</span>
                        <span className="text-slate-900">{activeDrawerTenant.currency} · {activeDrawerTenant.timezone}</span>
                        <span>Contact:</span>
                        <span className="text-slate-900">{activeDrawerTenant.email} · {activeDrawerTenant.phone}</span>
                        <span>Subscription Expires:</span>
                        <span className="text-slate-900">{formatDateShort(activeDrawerTenant.subscriptionExpiresAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {drawerTab === 'edit' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Institute Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Brand Primary Color</label>
                      <input
                        type="color"
                        value={editPrimary}
                        onChange={(e) => setEditPrimary(e.target.value)}
                        className="w-full h-9 rounded border border-slate-300 cursor-pointer"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveEdit()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Save Profile Changes
                  </button>
                </div>
              )}

              {drawerTab === 'limits' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Student Capacity Limit</label>
                      <input
                        type="number"
                        min="1"
                        value={limitStu}
                        onChange={(e) => setLimitStu(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Capacity Limit</label>
                      <input
                        type="number"
                        min="1"
                        value={limitStf}
                        onChange={(e) => setLimitStf(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Storage Limit (MB)</label>
                      <input
                        type="number"
                        min="128"
                        value={limitStorage}
                        onChange={(e) => setLimitStorage(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">AI Monthly Quota</label>
                      <input
                        type="number"
                        min="0"
                        value={limitAi}
                        onChange={(e) => setLimitAi(Number(e.target.value))}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg tabular-nums"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSaveLimits()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Update Usage Limits
                  </button>
                </div>
              )}

              {drawerTab === 'modules' && (
                <div className="space-y-2.5">
                  <p className="text-xs text-slate-500">
                    Disabling a module immediately hides it from this institute&rsquo;s navigation and blocks operations while preserving all existing database records.
                  </p>
                  {ALL_SAAS_MODULES.map((mod) => {
                    const active = (activeDrawerTenant.enabledModules || []).includes(mod.code);
                    return (
                      <div
                        key={mod.code}
                        className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-lg"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{mod.label}</p>
                          <p className="text-[11px] text-slate-500">{mod.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleToggleDrawerModule(mod.code)}
                          className={`px-3 py-1 text-[11px] font-bold rounded ${
                            active
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {active ? 'ENABLED' : 'DISABLED'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {drawerTab === 'admin' && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-[#0B2545]" />
                      Issue / Re-Send Institute Admin Onboarding Invitation
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={newInviteName}
                        onChange={(e) => setNewInviteName(e.target.value)}
                        placeholder="Administrator Full Name"
                        className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                      <input
                        type="email"
                        value={newInviteEmail}
                        onChange={(e) => setNewInviteEmail(e.target.value)}
                        placeholder="admin@institute.edu.et"
                        className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCreateAdminInvite()}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
                    >
                      Generate Onboarding Link
                    </button>
                    {generatedInviteUrl && (
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          readOnly
                          value={generatedInviteUrl}
                          className="flex-1 px-2.5 py-1.5 text-[11px] font-mono bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(generatedInviteUrl).catch(() => undefined);
                            pushToast('success', 'Invite URL copied.');
                          }}
                          className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-800 text-white rounded"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-900">Invitation History</p>
                    {tenantInvitations
                      .filter((inv) => inv.tenantId === activeDrawerTenant.tenantId)
                      .map((inv) => (
                        <div
                          key={inv.id}
                          className="p-3 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{inv.fullName} ({inv.role})</p>
                            <p className="text-[11px] text-slate-500">{inv.email}</p>
                          </div>
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700">
                            {inv.status}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {drawerTab === 'logs' && (
                <div className="space-y-2">
                  {allPlatformAuditLogs
                    .filter((l) => (l.tenantId || DEFAULT_ZACMA_TENANT_ID) === activeDrawerTenant.tenantId)
                    .slice(0, 40)
                    .map((log) => (
                      <div key={log.id} className="p-3 border border-slate-200 rounded-lg text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900">{log.action}</span>
                          <span className="text-[10px] text-slate-500 tabular-nums">
                            {log.createdAt.slice(0, 19).replace('T', ' ')}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1">{log.summary}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Actor: {log.actorName} ({log.actorPlatformRole || log.actorRole})
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suspend Confirmation Modal */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSuspend}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-red-700">Suspend Institute Account</h3>
            <p className="text-xs text-slate-600">
              Suspending <strong>{suspendTarget.name}</strong> immediately blocks write operations for all users in that tenant while preserving all data safely.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Suspension Reason *</label>
              <textarea
                required
                rows={3}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g., Overdue subscription renewal beyond grace period"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Confirm Suspension
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Authorized Support Access Modal */}
      {supportTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSupportAccess}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-amber-800">
              <ShieldCheck className="w-5 h-5" />
              <h3 className="text-sm font-bold">Start Authorized Support Access</h3>
            </div>
            <p className="text-xs text-slate-600">
              Opening support access for <strong>{supportTarget.name}</strong> creates an immutable audit record, notifies the institute administrator, and displays a persistent Support Banner with countdown timer.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Support Justification (Audit Trail) *</label>
              <textarea
                required
                minLength={5}
                rows={3}
                value={supportReason}
                onChange={(e) => setSupportReason(e.target.value)}
                placeholder="e.g., Troubleshooting course fee configuration per ticket #104"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Time Limit (Minutes)</label>
              <select
                value={supportDuration}
                onChange={(e) => setSupportDuration(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              >
                <option value={15}>15 Minutes</option>
                <option value={30}>30 Minutes (Recommended)</option>
                <option value={60}>60 Minutes</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSupportTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"
              >
                Start Audited Session
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upgrade / Extend Subscription Modal */}
      {upgradeTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmUpgrade}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900">
              Upgrade / Extend Subscription — {upgradeTarget.shortName}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subscription Plan</label>
                <select
                  value={upgradePlanId}
                  onChange={(e) => setUpgradePlanId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  {(subscriptionPlans.length ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatEtbCompact(p.monthlyPriceEtb)}/mo)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Cycle</label>
                  <select
                    value={upgradeCycle}
                    onChange={(e) => {
                      const c = e.target.value as BillingCycle;
                      setUpgradeCycle(c);
                      setUpgradeExpiry(addDaysIso(todayIsoDate(), c === 'ANNUAL' ? 365 : c === 'TRIAL' ? 14 : 30));
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                    <option value="TRIAL">Trial Extension</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Expiry Date</label>
                  <input
                    type="date"
                    value={upgradeExpiry}
                    onChange={(e) => setUpgradeExpiry(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={upgradeApplyModules}
                  onChange={(e) => setUpgradeApplyModules(e.target.checked)}
                />
                Apply plan&rsquo;s default quotas &amp; module bundle
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={upgradeGenInvoice}
                  onChange={(e) => setUpgradeGenInvoice(e.target.checked)}
                />
                Generate platform subscription invoice automatically
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setUpgradeTarget(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0B2545] hover:bg-slate-800 rounded-lg"
              >
                Save Subscription
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
