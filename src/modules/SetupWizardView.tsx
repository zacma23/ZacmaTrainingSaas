import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileCode2,
  GitBranch,
  Globe,
  Link2,
  Mail,
  MessageSquare,
  Play,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { ConfirmDialog } from '../components/PortalUI';
import { activeFirebaseDatabaseId, activeFirebaseProjectId } from '../lib/firebase';
import {
  BUNDLED_SQL_MIGRATIONS,
  COMBINED_SUPABASE_MIGRATION_SQL,
} from '../lib/supabaseMigrationsRaw';
import { applyIdempotentMigrations, MigrationExecutionStep } from '../lib/zacmaService';
import { formatDateShort } from '../types/zacma';

interface SetupStatusPayload {
  checkedAt: string;
  activeFirestore: {
    configured: boolean;
    projectId?: string;
    databaseId?: string;
  };
  supabaseConnectivity: {
    checked: boolean;
    reachable: boolean;
    detail: string;
  };
  providers: {
    ai: {
      provider: string;
      model: string;
      configured: boolean;
      envVar: string;
    };
    supabase: {
      projectRef?: string;
      url?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      urlConfigured: boolean;
      anonKeyConfigured: boolean;
      serviceRoleConfigured: boolean;
      ready: boolean;
    };
    channels: {
      inApp: { configured: boolean; status: string };
      email: { configured: boolean; provider: string; envVars: string[] };
      sms: { configured: boolean; provider: string; envVars: string[] };
      whatsapp: { configured: boolean; provider: string; envVars: string[] };
    };
    cronSecretConfigured: boolean;
  };
  sqlMigrations: Array<{ version: string; filename: string; sizeBytes: number }>;
  requiredEnvChecklist: Array<{
    key: string;
    category: string;
    requiredFor: string;
    present: boolean;
  }>;
  lastScheduledReminderRun: {
    ranAt: string;
    trigger: string;
    status: string;
    evaluatedCount: number;
  };
}

interface EnvConnectorLink {
  providerLabel: string;
  signupUrl: string;
  loginUrl: string;
  integrateUrl?: string;
  integrateLabel?: string;
}

const ENV_CONNECTOR_LINKS: Record<string, EnvConnectorLink> = {
  GEMINI_API_KEY: {
    providerLabel: 'Google AI Studio',
    signupUrl: 'https://aistudio.google.com/',
    loginUrl: 'https://aistudio.google.com/',
    integrateUrl: 'https://vercel.com/dashboard',
    integrateLabel: 'Vercel Settings',
  },
  SUPABASE_URL: {
    providerLabel: 'Supabase (mcxbwxfvalodqgbwyobo)',
    signupUrl: 'https://supabase.com/dashboard/project/mcxbwxfvalodqgbwyobo/settings/api',
    loginUrl: 'https://supabase.com/dashboard/project/mcxbwxfvalodqgbwyobo/settings/database',
    integrateUrl: 'https://vercel.com/integrations/supabase',
    integrateLabel: 'Connect to Vercel',
  },
  SUPABASE_ANON_KEY: {
    providerLabel: 'Supabase API Keys',
    signupUrl: 'https://supabase.com/dashboard/project/mcxbwxfvalodqgbwyobo/settings/api',
    loginUrl: 'https://supabase.com/dashboard/project/mcxbwxfvalodqgbwyobo/settings/api',
    integrateUrl: 'https://vercel.com/integrations/supabase',
    integrateLabel: 'Connect to Vercel',
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    providerLabel: 'Supabase API Keys',
    signupUrl: 'https://supabase.com/dashboard/project/mcxbwxfvalodqgbwyobo/settings/api',
    loginUrl: 'https://supabase.com/dashboard/project/mcxbwxfvalodqgbwyobo/settings/api',
    integrateUrl: 'https://vercel.com/integrations/supabase',
    integrateLabel: 'Connect to Vercel',
  },
  CRON_SECRET: {
    providerLabel: 'Vercel Cron',
    signupUrl: 'https://vercel.com/signup',
    loginUrl: 'https://vercel.com/dashboard',
    integrateUrl: 'https://vercel.com/dashboard',
    integrateLabel: 'Vercel Settings',
  },
  'SMTP_HOST / SMTP_USER / SMTP_PASS': {
    providerLabel: 'Resend / SMTP Email',
    signupUrl: 'https://resend.com/signup',
    loginUrl: 'https://resend.com/login',
    integrateUrl: 'https://vercel.com/integrations/resend',
    integrateLabel: 'Connect to Vercel',
  },
  'TWILIO_ACCOUNT_SID / AUTH_TOKEN': {
    providerLabel: 'Twilio SMS',
    signupUrl: 'https://www.twilio.com/try-twilio',
    loginUrl: 'https://console.twilio.com/',
  },
  'WHATSAPP_API_TOKEN / PHONE_ID': {
    providerLabel: 'Meta WhatsApp Cloud',
    signupUrl: 'https://developers.facebook.com/apps/',
    loginUrl: 'https://business.facebook.com/',
  },
};

const MIGRATION_DESCRIPTIONS: Record<string, string> = {
  '0001': 'Baseline ZACMA tables (courses, students, enrollments, installments, payments, receipts, expenses, attendance, audit logs) & RLS.',
  '0002': 'Automated payment reminders metadata, deduplication unique index, notification_preferences, and pg_cron SQL function.',
  '0003': 'GENERAL_STAFF & STUDENT roles, linked_student_id binding, and strict student-own RLS isolation policies.',
  '0004': 'Append-only schema_migrations registry and AI Assistant governance audit readiness.',
};

export function SetupWizardView() {
  const {
    profile,
    effectiveRole,
    roles,
    staffProfiles,
    courses,
    paymentPlans,
    students,
    enrollments,
    installments,
    payments,
    receipts,
    expenseCategories,
    expenses,
    attendance,
    persistedNotifications,
    schemaMigrations,
    auditLogs,
    pushToast,
  } = usePortal();

  const [status, setStatus] = useState<SetupStatusPayload | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [runningMigration, setRunningMigration] = useState(false);
  const [lastSteps, setLastSteps] = useState<MigrationExecutionStep[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewSqlVersion, setPreviewSqlVersion] = useState<string | null>(null);

  const handleCopySql = async (key: string, sql: string, label: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedKey(key);
      pushToast('success', `Copied ${label}. Paste directly into Supabase SQL Editor and click Run.`);
      window.setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      pushToast('error', 'Clipboard copy blocked by browser. Use Preview SQL to copy manually.');
    }
  };

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/setup/status');
      const data = await res.json();
      setStatus(data as SetupStatusPayload);
    } catch {
      pushToast('error', 'Unable to inspect server setup status (/api/setup/status).');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  if (effectiveRole !== 'ADMIN') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <ShieldAlert className="w-7 h-7 text-red-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Administrator Access Only</h2>
        <p className="text-xs text-slate-500 mt-1">
          Database integration diagnostics, migrations, and deployment readiness controls are strictly limited to Administrators.
        </p>
      </div>
    );
  }

  const appliedVersionSet = new Set(schemaMigrations.map((m) => m.version));

  const resolvedProjectId = status?.activeFirestore.projectId || activeFirebaseProjectId;
  const resolvedDatabaseId = status?.activeFirestore.databaseId || activeFirebaseDatabaseId;
  const isFirestoreConnected = Boolean(
    status?.activeFirestore.configured || (resolvedProjectId && (courses.length > 0 || staffProfiles.length > 0))
  );

  const firebaseProjectConsoleUrl = resolvedProjectId
    ? `https://console.firebase.google.com/project/${resolvedProjectId}/overview`
    : 'https://console.firebase.google.com/';
  const firebaseAuthDomainsUrl = resolvedProjectId
    ? `https://console.firebase.google.com/project/${resolvedProjectId}/authentication/settings`
    : 'https://console.firebase.google.com/';

  const connectorCards = [
    {
      id: 'firebase',
      name: 'Firebase Auth & Cloud Firestore',
      category: 'Active Cloud Database & Google Sign-In',
      connected: isFirestoreConnected,
      optional: false,
      detail: resolvedProjectId
        ? `Project ${resolvedProjectId} · DB ${resolvedDatabaseId}. Authorize your Vercel domain and inspect Firestore collections directly.`
        : 'Create or sign in to Firebase Console to manage authentication domains and Cloud Firestore.',
      icon: Database,
      signupUrl: 'https://console.firebase.google.com/',
      signupLabel: 'Open Firebase Console',
      loginUrl: firebaseAuthDomainsUrl,
      loginLabel: 'Auth Domains',
      integrateUrl: firebaseProjectConsoleUrl,
      integrateLabel: 'Project Overview',
    },
    {
      id: 'supabase',
      name: 'Supabase PostgreSQL & Auth',
      category: `Host: ${status?.providers.supabase.host || 'db.mcxbwxfvalodqgbwyobo.supabase.co'}:${status?.providers.supabase.port || 5432} · DB: ${status?.providers.supabase.database || 'postgres'} · User: ${status?.providers.supabase.user || 'postgres'}`,
      connected: Boolean(status?.providers.supabase.ready && status?.supabaseConnectivity.reachable),
      optional: false,
      detail:
        status?.supabaseConnectivity.detail ||
        'Target Supabase project mcxbwxfvalodqgbwyobo is wired. Open SQL Editor to run migrations 0001–0004 and copy your Anon/Service Role keys into Vercel Environment Variables.',
      icon: GitBranch,
      signupUrl: `https://supabase.com/dashboard/project/${status?.providers.supabase.projectRef || 'mcxbwxfvalodqgbwyobo'}/sql/new`,
      signupLabel: 'Open SQL Editor',
      loginUrl: `https://supabase.com/dashboard/project/${status?.providers.supabase.projectRef || 'mcxbwxfvalodqgbwyobo'}/settings/api`,
      loginLabel: 'API Keys',
      integrateUrl: 'https://vercel.com/integrations/supabase',
      integrateLabel: 'Connect to Vercel',
    },
    {
      id: 'vercel',
      name: 'Vercel Hosting, Secrets & Cron',
      category: 'Deployment Platform & Daily Reminder Scheduler',
      connected: Boolean(status?.providers.cronSecretConfigured),
      optional: false,
      detail:
        'Sign up or log in to Vercel to connect your GitHub repo, link Marketplace databases, manage server environment variables, and run the daily 06:00 UTC reminder cron.',
      icon: Globe,
      signupUrl: 'https://vercel.com/signup',
      signupLabel: 'Create Vercel Account',
      loginUrl: 'https://vercel.com/dashboard',
      loginLabel: 'Vercel Dashboard',
      integrateUrl: 'https://vercel.com/integrations',
      integrateLabel: 'Vercel Marketplace',
    },
    {
      id: 'gemini',
      name: 'Google AI Studio (Gemini)',
      category: 'Server-Side ZACMA AI Assistant',
      connected: Boolean(status?.providers.ai.configured),
      optional: false,
      detail:
        'Sign in with Google to Google AI Studio and link your project in Vercel Project Settings -> Environment Variables so ZACMA AI Assistant runs strictly server-side.',
      icon: Sparkles,
      signupUrl: 'https://aistudio.google.com/',
      signupLabel: 'Sign In to Google AI Studio',
      loginUrl: 'https://vercel.com/dashboard',
      loginLabel: 'Configure on Vercel',
    },
    {
      id: 'email',
      name: 'Email Connector (Resend / SMTP)',
      category: 'Automated Student Payment Reminder Emails',
      connected: Boolean(status?.providers.channels.email.configured),
      optional: true,
      detail:
        'Sign up or connect Resend directly to Vercel via Marketplace, or use your institute SMTP account for outgoing fee reminder emails.',
      icon: Mail,
      signupUrl: 'https://resend.com/signup',
      signupLabel: 'Sign Up (Resend)',
      loginUrl: 'https://resend.com/login',
      loginLabel: 'Login',
      integrateUrl: 'https://vercel.com/integrations/resend',
      integrateLabel: 'Connect to Vercel',
    },
    {
      id: 'sms',
      name: 'Twilio SMS Connector',
      category: 'Automated Student Payment Reminder SMS',
      connected: Boolean(status?.providers.channels.sms.configured),
      optional: true,
      detail:
        'Create a Twilio account or sign in to the Twilio Console to enable Ethiopian / international SMS fee deadline alerts.',
      icon: Smartphone,
      signupUrl: 'https://www.twilio.com/try-twilio',
      signupLabel: 'Create Twilio Account',
      loginUrl: 'https://console.twilio.com/',
      loginLabel: 'Twilio Console',
    },
    {
      id: 'whatsapp',
      name: 'Meta WhatsApp Cloud API',
      category: 'Automated Student WhatsApp Fee Alerts',
      connected: Boolean(status?.providers.channels.whatsapp.configured),
      optional: true,
      detail:
        'Sign up or log in to Meta for Developers and Meta Business Suite to register a WhatsApp Cloud sender for student payment notifications.',
      icon: MessageSquare,
      signupUrl: 'https://developers.facebook.com/apps/',
      signupLabel: 'Meta Developers Login',
      loginUrl: 'https://business.facebook.com/',
      loginLabel: 'Business Suite',
    },
  ];

  const collectionAudit = [
    { name: 'roles', count: roles.length },
    { name: 'profiles', count: staffProfiles.length },
    { name: 'courses', count: courses.length },
    { name: 'payment_plans', count: paymentPlans.length },
    { name: 'students', count: students.length },
    { name: 'enrollments', count: enrollments.length },
    { name: 'payment_installments', count: installments.length },
    { name: 'payments', count: payments.length },
    { name: 'receipts', count: receipts.length },
    { name: 'expense_categories', count: expenseCategories.length },
    { name: 'expenses', count: expenses.length },
    { name: 'attendance', count: attendance.length },
    { name: 'notifications', count: persistedNotifications.length },
    { name: 'audit_logs', count: auditLogs.length },
    { name: 'schema_migrations', count: schemaMigrations.length },
  ];

  const handleConfirmMigration = async () => {
    if (!profile) return;
    setRunningMigration(true);
    try {
      const steps = await applyIdempotentMigrations(
        roles.map((r) => r.id),
        schemaMigrations.map((m) => m.version),
        {
          uid: profile.uid,
          fullName: profile.fullName,
          role: profile.role,
        }
      );
      setLastSteps(steps);
      setConfirmOpen(false);
      pushToast('success', 'All 4 additive schema migrations applied and verified safely.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Migration run failed.');
    } finally {
      setRunningMigration(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Database Integration &amp; System Setup Wizard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Inspect live database connectivity, launch direct sign-up/login links for each connector and database provider, and apply safe additive schema migrations. Credentials are never exposed to the browser.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchStatus()}
            disabled={loadingStatus}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            Re-check Environment
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            <Play className="w-3.5 h-3.5" />
            Run Additive Migrations
          </button>
        </div>
      </div>

      {/* Top Diagnostics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Live Database Engine</span>
            <Database className="w-4 h-4 text-blue-700" />
          </div>
          <p className="text-base font-display font-bold text-slate-900">
            {isFirestoreConnected ? 'Cloud Firestore Connected' : 'Checking...'}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-1 truncate">
            {resolvedProjectId ? `${resolvedProjectId} · ${resolvedDatabaseId}` : 'Inspecting config...'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">ZACMA AI Assistant (Server)</span>
            <Server className="w-4 h-4 text-blue-700" />
          </div>
          <p
            className={`text-base font-display font-bold ${
              status?.providers.ai.configured ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {status?.providers.ai.configured ? 'GEMINI_API_KEY Configured' : 'Not Connected Yet'}
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-1">
            Model: {status?.providers.ai.model || 'gemini-4-hydrogen'} (Server-side only)
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">External Supabase Target</span>
            <GitBranch className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-base font-display font-bold text-slate-900">
            {status?.providers.supabase.ready
              ? status.supabaseConnectivity.reachable
                ? 'Supabase Connected'
                : 'Supabase Unreachable'
              : 'Ready to Connect'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {status?.supabaseConnectivity.detail || 'Version-controlled SQL in /supabase/migrations/'}
          </p>
        </div>
      </div>

      {/* Guided Readiness & Remaining Configuration Steps */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Guided Integration &amp; Remaining Configuration Steps
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live readiness verification across active runtime, migrations, AI Assistant, and GitHub/Vercel/Supabase deployment.
            </p>
          </div>
          {status?.lastScheduledReminderRun && (
            <span className="text-[11px] font-mono text-slate-500">
              Scheduler: {status.lastScheduledReminderRun.status} ({status.lastScheduledReminderRun.trigger})
            </span>
          )}
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          {[
            {
              step: '1. Active Cloud Database & Required Collections',
              done: isFirestoreConnected && courses.length > 0,
              detail: isFirestoreConnected
                ? `Connected to live Firestore (${resolvedProjectId} / ${resolvedDatabaseId}) with ${students.length} students, ${courses.length} courses, and ${payments.length} payments intact.`
                : 'Sign in to Firebase Console to verify your project database and authorized Vercel domains.',
              links: [
                { label: 'Firebase Console', href: firebaseProjectConsoleUrl },
                { label: 'Auth Domains', href: firebaseAuthDomainsUrl },
              ],
            },
            {
              step: '2. Additive Schema Migrations (Versions 0001–0004)',
              done:
                appliedVersionSet.has('0001') &&
                appliedVersionSet.has('0002') &&
                appliedVersionSet.has('0003') &&
                appliedVersionSet.has('0004'),
              detail:
                appliedVersionSet.size >= 4
                  ? 'All 4 additive migration versions are recorded and verified.'
                  : 'Click "Run Additive Migrations" to safely verify collections and record versions 0001–0004.',
              actionButton:
                appliedVersionSet.size < 4
                  ? { label: 'Run Migrations Now', onClick: () => setConfirmOpen(true) }
                  : undefined,
              links: [
                {
                  label: 'Open Supabase SQL Editor (mcxbwxfvalodqgbwyobo)',
                  href: `https://supabase.com/dashboard/project/${status?.providers.supabase.projectRef || 'mcxbwxfvalodqgbwyobo'}/sql/new`,
                },
              ],
            },
            {
              step: '3. Server-Side ZACMA AI Assistant (GEMINI_API_KEY)',
              done: Boolean(status?.providers.ai.configured),
              detail: status?.providers.ai.configured
                ? `Active on server using ${status.providers.ai.model}. Never exposed to browser JavaScript.`
                : 'Sign in to Google AI Studio and link GEMINI_API_KEY in Vercel Project Settings -> Environment Variables, then redeploy.',
              links: [
                { label: 'Google AI Studio', href: 'https://aistudio.google.com/' },
                { label: 'Vercel Dashboard', href: 'https://vercel.com/dashboard' },
              ],
            },
            {
              step: '4. External Supabase PostgreSQL (db.mcxbwxfvalodqgbwyobo.supabase.co:5432) & Vercel Cron',
              done:
                Boolean(status?.providers.supabase.ready) &&
                Boolean(status?.providers.cronSecretConfigured),
              detail:
                status?.providers.supabase.ready && status?.providers.cronSecretConfigured
                  ? `Connected to ${status.providers.supabase.host}:${status.providers.supabase.port}/${status.providers.supabase.database} (user: ${status.providers.supabase.user}) with CRON_SECRET active.`
                  : `Target PostgreSQL host db.mcxbwxfvalodqgbwyobo.supabase.co:5432 (database: postgres, user: postgres) is pre-configured. Add SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and CRON_SECRET in Vercel Project Settings -> Environment Variables.`,
              links: [
                {
                  label: 'Supabase API Keys',
                  href: `https://supabase.com/dashboard/project/${status?.providers.supabase.projectRef || 'mcxbwxfvalodqgbwyobo'}/settings/api`,
                },
                {
                  label: 'Supabase DB Settings',
                  href: `https://supabase.com/dashboard/project/${status?.providers.supabase.projectRef || 'mcxbwxfvalodqgbwyobo'}/settings/database`,
                },
                { label: 'Connect Supabase -> Vercel', href: 'https://vercel.com/integrations/supabase' },
              ],
            },
          ].map((row) => (
            <div key={row.step} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{row.step}</p>
                <p className="text-slate-600 mt-0.5 leading-relaxed">{row.detail}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {row.actionButton && (
                    <button
                      type="button"
                      onClick={row.actionButton.onClick}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md"
                    >
                      <Play className="w-3 h-3" />
                      {row.actionButton.label}
                    </button>
                  )}
                  {row.links.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                    >
                      {link.label}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ))}
                </div>
              </div>
              <span
                className={`text-xs font-semibold shrink-0 whitespace-nowrap ${
                  row.done ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {row.done ? 'Complete' : 'Action Needed'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Connector Accounts & Integration Hub */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-700 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Direct Connector Sign-Up, Login &amp; Integration Launchpad
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Create accounts, sign in to each database or notification provider, and authorize Vercel Marketplace connectors directly from the Admin Portal.
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 divide-y md:divide-y-0 md:gap-px bg-slate-200">
          {connectorCards.map((connector) => {
            const Icon = connector.icon;
            return (
              <div key={connector.id} className="bg-white p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-blue-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{connector.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{connector.category}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        connector.connected
                          ? 'text-emerald-700'
                          : connector.optional
                          ? 'text-slate-500'
                          : 'text-amber-700'
                      }`}
                    >
                      {connector.connected ? 'Connected' : connector.optional ? 'Optional' : 'Setup Needed'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-3 leading-relaxed">{connector.detail}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <a
                    href={connector.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
                  >
                    <UserPlus className="w-3 h-3" />
                    {connector.signupLabel}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={connector.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors"
                  >
                    {connector.loginLabel}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {connector.integrateUrl && connector.integrateLabel && (
                    <a
                      href={connector.integrateUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
                    >
                      {connector.integrateLabel}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Environment Variable Detection + Version-Controlled Migrations Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Server Environment Variables</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Presence check only — open each connector directly to create an account or configure in Vercel.
              </p>
            </div>
            <a
              href="https://vercel.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-800 shrink-0"
            >
              Vercel
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {(status?.requiredEnvChecklist || []).map((item) => {
              const linkInfo = ENV_CONNECTOR_LINKS[item.key];
              return (
                <div key={item.key} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-slate-900 truncate">{item.key}</p>
                    <p className="text-[11px] text-slate-500">{item.requiredFor}</p>
                    {linkInfo && (
                      <div className="flex flex-wrap items-center gap-2.5 mt-1.5">
                        <a
                          href={linkInfo.signupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                        >
                          Sign Up / Login ({linkInfo.providerLabel})
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        {linkInfo.integrateUrl && linkInfo.integrateLabel && (
                          <a
                            href={linkInfo.integrateUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-blue-700 hover:underline"
                          >
                            {linkInfo.integrateLabel}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {item.present ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Present
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400 font-medium shrink-0 mt-0.5">
                      <XCircle className="w-3.5 h-3.5" />
                      Unset
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-blue-700 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Version-Controlled Schema Migrations (Idempotent)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Copy and paste into Supabase SQL Editor to create all ZACMA tables, RLS policies, and reminder functions.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  void handleCopySql(
                    'ALL',
                    COMBINED_SUPABASE_MIGRATION_SQL,
                    'All 4 Supabase SQL Migrations (0001–0004)'
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
              >
                {copiedKey === 'ALL' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Copied All SQL
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy All SQL (0001–0004)
                  </>
                )}
              </button>
              <a
                href={`https://supabase.com/dashboard/project/${status?.providers.supabase.projectRef || 'mcxbwxfvalodqgbwyobo'}/sql/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
              >
                Open SQL Editor
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {BUNDLED_SQL_MIGRATIONS.map((mig) => {
              const applied = schemaMigrations.find((m) => m.version === mig.version);
              const isPreviewOpen = previewSqlVersion === mig.version;
              return (
                <div key={mig.version} className="px-5 py-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-slate-900">
                        {mig.version} · {mig.filename}
                      </p>
                      <p className="text-slate-600 mt-0.5">
                        {MIGRATION_DESCRIPTIONS[mig.version] || 'Additive ZACMA schema migration.'}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-slate-400">
                          {(mig.sizeBytes / 1024).toFixed(1)} KB SQL
                          {applied
                            ? ` · Verified by ${applied.appliedBy} on ${formatDateShort(applied.appliedAt)}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopySql(mig.version, mig.sql, mig.filename)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                        >
                          {copiedKey === mig.version ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy SQL
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewSqlVersion(isPreviewOpen ? null : mig.version)
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:underline"
                        >
                          <Eye className="w-3 h-3" />
                          {isPreviewOpen ? 'Hide SQL' : 'Preview SQL'}
                        </button>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        appliedVersionSet.has(mig.version) ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {appliedVersionSet.has(mig.version) ? 'Applied' : 'Ready to Apply'}
                    </span>
                  </div>

                  {isPreviewOpen && (
                    <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
                      {mig.sql}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>

          {lastSteps.length > 0 && (
            <div className="p-4 bg-emerald-50/70 border-t border-emerald-200 space-y-1.5 text-xs">
              <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Latest Migration Verification Output
              </p>
              {lastSteps.map((s) => (
                <p key={s.version} className="text-emerald-800">
                  <span className="font-mono font-semibold">[{s.version} {s.action}]</span> {s.detail}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Required Collections & Live Record Counts */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">
            Required Collections &amp; Live Data Preservation Audit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time verification of all institutional collections confirming zero data loss.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {collectionAudit.map((col) => (
            <div key={col.name} className="p-4 border-b border-r border-slate-100">
              <p className="text-[11px] font-mono text-slate-500 truncate">{col.name}</p>
              <p className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-1">
                {col.count}
              </p>
              <p className="text-[11px] font-medium text-emerald-700 mt-0.5">Verified intact</p>
            </div>
          ))}
        </div>
      </div>

      {/* Explicit Confirmation Dialog before running migrations */}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Additive Schema Migration"
        description="This will safely verify collections, add GENERAL_STAFF and STUDENT roles if missing, initialize default notification preferences, and record migration versions 0001–0004. No existing student, payment, receipt, or accounting records will be modified or deleted."
        confirmLabel="Apply Additive Migrations"
        loading={runningMigration}
        onConfirm={() => void handleConfirmMigration()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
