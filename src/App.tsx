/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  CheckCheck,
  ClipboardCheck,
  Clock,
  CreditCard,
  Database,
  FileSpreadsheet,
  FileText,
  Globe,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  Palette,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { PortalProvider, usePortal } from './context/PortalContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { ReceiptModal } from './components/ReceiptModal';
import { SessionTimeoutModal } from './components/SessionTimeoutModal';
import { ToastContainer } from './components/PortalUI';
import { StaffQuickSearch } from './components/StaffQuickSearch';
import { ZacmaAiAssistant } from './components/ZacmaAiAssistant';
import { ZacmaLogo } from './components/ZacmaLogo';
import { DashboardView } from './modules/DashboardView';
import { AiWorkspaceView } from './modules/AiWorkspaceView';
import { AiRegistrationView } from './modules/AiRegistrationView';
import { StudentsView } from './modules/StudentsView';
import { CoursesView } from './modules/CoursesView';
import {
  ApprovalsQueueView,
  PaymentsView,
  ReceiptsArchiveView,
} from './modules/PaymentsAndApprovalsView';
import { ChapaPaymentsView } from './modules/ChapaPaymentsView';
import { AccountingView } from './modules/AccountingView';
import { FinancialReportsView } from './modules/FinancialReportsView';
import { AttendanceView } from './modules/AttendanceView';
import { AuditLogsView, StaffRolesView } from './modules/StaffAndAuditView';
import { RemindersAndPreferencesView } from './modules/RemindersAndPreferencesView';
import { SetupWizardView } from './modules/SetupWizardView';
import { StudentPortalView } from './modules/StudentPortalView';
import { MessagingView } from './modules/MessagingView';
import { CommunicationsAdminView } from './modules/CommunicationsAdminView';
import { InstituteSettingsView } from './modules/InstituteSettingsView';
import { SuperAdminShell } from './modules/superadmin/SuperAdminShell';
import { markNotificationRead } from './lib/zacmaService';
import { markAllNotificationsRead } from './lib/communicationService';
import {
  ALL_SAAS_MODULES,
  DEFAULT_ZACMA_TENANT_ID,
  INSTITUTE_ROLE_LABELS,
  isNavSectionAllowedByModules,
  requiredModuleForNavSection,
} from './lib/saasService';
import { formatAddisDateTimeDual } from './lib/ethiopianCalendar';
import {
  NavSection,
  Receipt,
  RoleCode,
  StudentPaymentCategory,
  todayIsoDate,
} from './types/zacma';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
  roles: RoleCode[];
  badgeCount?: number;
}

function PortalShell() {
  const {
    user,
    profile,
    actualRole,
    effectiveRole,
    previewRole,
    setPreviewRole,
    authLoading,
    signOutUser,
    isPlatformUser,
    portalMode,
    setPortalMode,
    activeTenant,
    activeTenantId,
    activeSupportSession,
    endSupportAccess,
    students,
    staffRecords,
    installments,
    payments,
    chapaTransactions,
    notifications,
    unreadMessagesCount,
    pushToast,
    toasts,
    dismissToast,
  } = usePortal();

  const [activeTab, setActiveTab] = useState<NavSection>('dashboard');
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);
  const [reportStatusFilter, setReportStatusFilter] = useState<'ALL' | StudentPaymentCategory>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'ALL' | 'FINANCE' | 'MESSAGES' | 'ANNOUNCEMENTS'>('ALL');
  const [markingAllNotifs, setMarkingAllNotifs] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [supportCountdown, setSupportCountdown] = useState<string>('');

  useEffect(() => {
    if (!activeSupportSession) {
      setSupportCountdown('');
      return;
    }
    const updateTimer = () => {
      const diffSec = Math.max(
        0,
        Math.floor((new Date(activeSupportSession.expiresAt).getTime() - Date.now()) / 1000)
      );
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      setSupportCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    };
    updateTimer();
    const id = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(id);
  }, [activeSupportSession]);

  const openReportsWithFilter = (status?: 'ALL' | StudentPaymentCategory) => {
    setReportStatusFilter(status || 'ALL');
    setActiveTab('reports');
  };

  const pendingRegistrationsCount = useMemo(() => {
    const pStu = students.filter((s) => s.registrationStatus === 'PENDING').length;
    const pStf = staffRecords.filter((s) => s.registrationStatus === 'PENDING').length;
    return pStu + pStf;
  }, [students, staffRecords]);

  const pendingApprovalsCount = useMemo(() => {
    const pStu = students.filter((s) => s.registrationStatus === 'PENDING').length;
    const pPay = payments.filter((p) => p.status === 'PENDING').length;
    return pStu + pPay;
  }, [students, payments]);

  const pendingChapaApprovalsCount = useMemo(
    () =>
      chapaTransactions.filter(
        (t) => t.paymentStatus === 'VERIFIED' && t.approvalStatus === 'AWAITING_APPROVAL'
      ).length,
    [chapaTransactions]
  );

  const overdueInstallmentsCount = useMemo(() => {
    const today = todayIsoDate();
    return installments.filter(
      (i) => i.status !== 'PAID' && i.dueDate < today && i.amountDueEtb > i.amountPaidEtb
    ).length;
  }, [installments]);

  const navItems: NavItem[] = useMemo(() => {
    const all: NavItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INSTRUCTOR', 'RECEPTIONIST', 'HR_OFFICER', 'GENERAL_STAFF'],
      },
      {
        id: 'ai_hub',
        label: 'AI Assistant',
        icon: <Sparkles className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INSTRUCTOR', 'RECEPTIONIST', 'HR_OFFICER', 'GENERAL_STAFF'],
      },
      {
        id: 'registrations',
        label: 'AI Registration & ID',
        icon: <ScanLine className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'RECEPTIONIST', 'HR_OFFICER'],
        badgeCount: pendingRegistrationsCount,
      },
      {
        id: 'students',
        label: 'Students',
        icon: <Users className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INSTRUCTOR', 'RECEPTIONIST', 'GENERAL_STAFF'],
      },
      {
        id: 'courses',
        label: 'Courses',
        icon: <BookOpen className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INSTRUCTOR', 'RECEPTIONIST', 'GENERAL_STAFF'],
      },
      {
        id: 'payments',
        label: 'Fees & Payments',
        icon: <CreditCard className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
      },
      {
        id: 'chapa',
        label: 'Chapa Online Payments',
        icon: <Globe className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
        badgeCount: pendingChapaApprovalsCount,
      },
      {
        id: 'reminders',
        label: 'Payment Reminders',
        icon: <BellRing className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
        badgeCount: overdueInstallmentsCount,
      },
      {
        id: 'approvals',
        label: 'Approvals Queue',
        icon: <ShieldCheck className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER'],
        badgeCount: pendingApprovalsCount,
      },
      {
        id: 'receipts',
        label: 'Official Receipts',
        icon: <FileText className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
      },
      {
        id: 'accounting',
        label: 'Accounting & Ledger',
        icon: <BarChart3 className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
      },
      {
        id: 'reports',
        label: 'Excel Reports (.xlsx)',
        icon: <FileSpreadsheet className="w-4 h-4" />,
        roles:
          effectiveRole === 'ACCOUNTANT' && profile?.canExportReports
            ? ['ADMIN', 'MANAGER', 'ACCOUNTANT']
            : ['ADMIN', 'MANAGER'],
      },
      {
        id: 'attendance',
        label: 'Attendance',
        icon: <ClipboardCheck className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF'],
      },
      {
        id: 'messages',
        label: 'Internal Messages',
        icon: <MessageSquare className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'INSTRUCTOR', 'RECEPTIONIST', 'HR_OFFICER', 'GENERAL_STAFF'],
        badgeCount: unreadMessagesCount,
      },
      {
        id: 'communications',
        label: 'SMS & Broadcasts',
        icon: <Smartphone className="w-4 h-4" />,
        roles: ['ADMIN', 'MANAGER', 'ACCOUNTANT'],
      },
      {
        id: 'staff',
        label: 'Staff & Roles',
        icon: <UserCog className="w-4 h-4" />,
        roles: ['ADMIN', 'HR_OFFICER'],
      },
      {
        id: 'branding',
        label: 'Branding & Plan',
        icon: <Palette className="w-4 h-4" />,
        roles: ['ADMIN'],
      },
      {
        id: 'audit',
        label: 'Audit & Security',
        icon: <History className="w-4 h-4" />,
        roles: ['ADMIN'],
      },
      {
        id: 'setup',
        label: 'System Setup',
        icon: <Database className="w-4 h-4" />,
        roles: ['ADMIN'],
      },
    ];
    if (!effectiveRole) return [];
    const roleFiltered = all
      .filter((item) => item.roles.includes(effectiveRole))
      .filter((item) => isNavSectionAllowedByModules(item.id, activeTenant?.enabledModules));
    if (
      effectiveRole === 'GENERAL_STAFF' &&
      profile?.allowedModules &&
      profile.allowedModules.length > 0
    ) {
      const allowedSet = new Set<NavSection>(['dashboard', ...profile.allowedModules]);
      return roleFiltered.filter((item) => allowedSet.has(item.id));
    }
    return roleFiltered;
  }, [
    effectiveRole,
    profile?.allowedModules,
    profile?.canExportReports,
    activeTenant?.enabledModules,
    pendingRegistrationsCount,
    pendingApprovalsCount,
    pendingChapaApprovalsCount,
    overdueInstallmentsCount,
    unreadMessagesCount,
  ]);

  // Redirect to dashboard if effectiveRole switches away from a restricted tab
  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((item) => item.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [navItems, activeTab]);

  // Prevent browser back-button / bfcache restoration of protected pages after logout
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && !user) {
        window.location.reload();
      }
    };
    const handlePopState = () => {
      if (!user) {
        window.history.replaceState(null, '', '/');
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-10 py-9 text-center max-w-xs w-full space-y-5">
          <div className="flex justify-center">
            <ZacmaLogo variant="mark" size="xl" framed />
          </div>
          <div>
            <p className="font-display font-extrabold text-sm tracking-tight text-slate-900">
              ZACMA <span className="text-blue-700">TECHNOLOGY</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Loading secure portal workspace...</p>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full w-2/5 zacma-brand-stripe rounded-full animate-zacma-loader" />
          </div>
        </div>
      </div>
    );
  }

  if (!user || !profile || !effectiveRole) {
    return (
      <>
        <LoginScreen />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // ZACMA Super Admin Control Center Mode (Platform Owner)
  if (isPlatformUser && portalMode === 'SUPER_ADMIN' && !activeSupportSession) {
    return (
      <>
        <SuperAdminShell />
        <SessionTimeoutModal />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Strictly isolated Student Self-Service Portal (completely separate from employee sidebar & dashboards)
  if (effectiveRole === 'STUDENT') {
    return (
      <>
        <StudentPortalView onOpenReceipt={setActiveReceipt} />
        <ZacmaAiAssistant activeModule="student_portal" />
        <SessionTimeoutModal />
        <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const currentNav = navItems.find((n) => n.id === activeTab);
  const isCustomTenant = activeTenantId !== DEFAULT_ZACMA_TENANT_ID;
  const brandPrimary = activeTenant?.primaryColor || '#0B2545';
  const brandSecondary = activeTenant?.secondaryColor || '#D97706';
  const brandDisplayName = activeTenant?.shortName || activeTenant?.name || 'ZACMA Technology';
  const brandFullName = activeTenant?.name || 'ZACMA Technology';
  const isTabAllowedByPlan = isNavSectionAllowedByModules(activeTab, activeTenant?.enabledModules);
  const missingModuleCode = requiredModuleForNavSection(activeTab);
  const missingModuleDef = missingModuleCode
    ? ALL_SAAS_MODULES.find((m) => m.code === missingModuleCode)
    : null;

  const SidebarContent = (
    <div className="h-full flex flex-col bg-slate-900 text-slate-200 select-none border-r border-slate-800/80">
      {/* Dynamic Tenant Accent Stripe */}
      {isCustomTenant ? (
        <div
          className="h-1 w-full shrink-0"
          style={{
            background: `linear-gradient(90deg, ${brandPrimary}, ${brandSecondary})`,
          }}
        />
      ) : (
        <div className="h-1 w-full zacma-brand-stripe shrink-0" />
      )}
      {/* Brand Block */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        {!isCustomTenant && !activeTenant?.logoUrl ? (
          <ZacmaLogo variant="lockup" theme="dark" size="sm" framed subtitle="& Training Institute" />
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            {activeTenant?.logoUrl ? (
              <img
                src={activeTenant.logoUrl}
                alt={brandFullName}
                className="w-9 h-9 rounded-lg object-contain bg-white p-1 shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center font-display font-extrabold text-xs text-white shrink-0"
                style={{ backgroundColor: brandSecondary }}
              >
                {brandDisplayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-display font-extrabold text-white truncate">
                {brandDisplayName}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {activeTenant?.planName || 'Training Institute Portal'}
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white p-1.5 rounded-lg"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Super Admin Quick Return Button */}
      {isPlatformUser && !activeSupportSession && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setPortalMode('SUPER_ADMIN')}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Super Admin Control Center</span>
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              style={isActive && isCustomTenant ? { backgroundColor: brandPrimary } : undefined}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? isCustomTenant
                    ? 'text-white font-semibold shadow-sm'
                    : 'bg-blue-700 text-white font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {item.badgeCount !== undefined && item.badgeCount > 0 && (
                <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white tabular-nums">
                  {item.badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Signed-In Staff Footer */}
      <div className="p-4 border-t border-slate-800 space-y-3 shrink-0">
        {actualRole === 'ADMIN' && (
          <div className="md:hidden space-y-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              View Portal As
            </label>
            <select
              value={effectiveRole}
              onChange={(e) => {
                const next = e.target.value as RoleCode;
                setPreviewRole(next === 'ADMIN' ? null : next);
                setMobileMenuOpen(false);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 text-white rounded-lg"
            >
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="INSTRUCTOR">Instructor</option>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="HR_OFFICER">HR Officer</option>
              <option value="GENERAL_STAFF">General Staff</option>
              <option value="STUDENT">Student Portal</option>
            </select>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">{profile.fullName}</p>
          <p className="text-[11px] text-slate-400 truncate">
            {INSTITUTE_ROLE_LABELS[effectiveRole] || effectiveRole} · {profile.email}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Fixed Navy Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 fixed inset-y-0 left-0 z-30 no-print">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div className="w-64 max-w-[80vw] h-full shadow-2xl">{SidebarContent}</div>
          <button
            type="button"
            aria-label="Close overlay"
            className="flex-1 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Persistent Authorized Support Access Countdown Banner */}
        {activeSupportSession && (
          <div className="bg-amber-500 text-slate-950 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold border-b border-amber-600 no-print">
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="w-4 h-4 shrink-0" />
              <span className="truncate">
                AUTHORIZED SUPPORT ACCESS: <strong>{activeSupportSession.tenantName}</strong> — Reason:{' '}
                <span className="font-normal">{activeSupportSession.reason}</span>
              </span>
              {supportCountdown && (
                <span className="font-mono px-2 py-0.5 rounded bg-slate-950 text-amber-300 text-[11px] tabular-nums shrink-0">
                  Expires in {supportCountdown}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void endSupportAccess()}
              className="px-3 py-1 rounded-md bg-slate-950 hover:bg-slate-800 text-white text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              End Support Session &amp; Return to Super Admin
            </button>
          </div>
        )}

        {/* Suspended Tenant Read-Only Lock Banner */}
        {activeTenant?.status === 'SUSPENDED' && (
          <div className="bg-red-600 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Account Suspended (Read-Only Mode):</strong>{' '}
                {activeTenant.suspendedReason ||
                  'This institute portal has been temporarily suspended by ZACMA Platform Operations. New registrations and financial writes are disabled.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('branding')}
              className="px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-white font-semibold whitespace-nowrap cursor-pointer"
            >
              Contact Support
            </button>
          </div>
        )}

        {/* Top Bar */}
        <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {!isCustomTenant && !activeTenant?.logoUrl ? (
              <ZacmaLogo variant="mark" size="sm" className="lg:hidden" />
            ) : activeTenant?.logoUrl ? (
              <img
                src={activeTenant.logoUrl}
                alt={brandDisplayName}
                className="w-7 h-7 rounded object-contain lg:hidden"
              />
            ) : null}
            <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
              <span className="font-display font-bold text-slate-900 whitespace-nowrap hidden xl:inline">
                {brandDisplayName}
              </span>
              <span className="hidden xl:inline text-slate-300">/</span>
              <span className="font-display font-semibold text-blue-700 truncate">
                {currentNav?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Unified Staff Search (Name, ID, Course, Date) */}
          <StaffQuickSearch onNavigate={setActiveTab} onOpenReceipt={setActiveReceipt} />

          <div className="flex items-center gap-3 shrink-0">
            {/* Admin Role-Preview Selector */}
            {actualRole === 'ADMIN' && (
              <div className="hidden md:flex items-center gap-2 text-xs">
                <span className="text-slate-500 whitespace-nowrap">View as:</span>
                <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg">
                  {(
                    [
                      { code: 'ADMIN', label: 'Admin' },
                      { code: 'MANAGER', label: 'Manager' },
                      { code: 'ACCOUNTANT', label: 'Accountant' },
                      { code: 'INSTRUCTOR', label: 'Instructor' },
                      { code: 'GENERAL_STAFF', label: 'Staff' },
                      { code: 'STUDENT', label: 'Student' },
                    ] as Array<{ code: RoleCode; label: string }>
                  ).map((item) => {
                    const active = effectiveRole === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => setPreviewRole(item.code === 'ADMIN' ? null : item.code)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Open notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Active Role Preview Banner */}
        {actualRole === 'ADMIN' && previewRole && (
          <div className="bg-slate-900 text-slate-100 px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
            <span>
              Previewing portal workspace as <strong>{INSTITUTE_ROLE_LABELS[previewRole] || previewRole}</strong>. Financial navigation and role actions reflect this role.
            </span>
            <button
              type="button"
              onClick={() => setPreviewRole(null)}
              className="text-blue-400 hover:text-blue-300 font-semibold whitespace-nowrap"
            >
              Return to Admin View
            </button>
          </div>
        )}

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {!isTabAllowedByPlan ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 max-w-lg mx-auto text-center space-y-4 mt-8">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-display font-bold text-slate-900">
                Module Not Included in Current Plan
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>{missingModuleDef?.label || 'This module'}</strong> is not currently enabled on your{' '}
                <strong>{activeTenant?.planName || 'current'}</strong> subscription. Your existing records are safely preserved.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Return to Dashboard
                </button>
                {effectiveRole === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('branding')}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    Request Plan Upgrade
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  onNavigate={setActiveTab}
                  onOpenReceipt={setActiveReceipt}
                  onOpenReports={openReportsWithFilter}
                />
              )}
              {activeTab === 'ai_hub' && (
                <AiWorkspaceView
                  activeModule="ai_hub"
                  initialPrompt={pendingAiPrompt}
                  onConsumedInitialPrompt={() => setPendingAiPrompt(null)}
                />
              )}
              {activeTab === 'registrations' && <AiRegistrationView />}
              {activeTab === 'students' && (
                <StudentsView onOpenAiRegistration={() => setActiveTab('registrations')} />
              )}
              {activeTab === 'courses' && <CoursesView />}
              {activeTab === 'payments' && <PaymentsView onOpenReceipt={setActiveReceipt} />}
              {activeTab === 'chapa' && (
                <ChapaPaymentsView
                  onOpenReceipt={setActiveReceipt}
                  onOpenReports={() => openReportsWithFilter('ALL')}
                />
              )}
              {activeTab === 'reminders' && <RemindersAndPreferencesView />}
              {activeTab === 'approvals' && <ApprovalsQueueView />}
              {activeTab === 'receipts' && <ReceiptsArchiveView onOpenReceipt={setActiveReceipt} />}
              {activeTab === 'accounting' && (
                <AccountingView onOpenReports={() => openReportsWithFilter('ALL')} />
              )}
              {activeTab === 'reports' && (
                <FinancialReportsView
                  key={reportStatusFilter}
                  initialStatusFilter={reportStatusFilter}
                />
              )}
              {activeTab === 'attendance' && <AttendanceView />}
              {activeTab === 'messages' && (
                <MessagingView
                  onOpenAdminBroadcast={
                    effectiveRole === 'ADMIN' ? () => setActiveTab('communications') : undefined
                  }
                />
              )}
              {activeTab === 'communications' && <CommunicationsAdminView />}
              {activeTab === 'staff' && <StaffRolesView />}
              {activeTab === 'branding' && <InstituteSettingsView />}
              {activeTab === 'audit' && <AuditLogsView />}
              {activeTab === 'setup' && <SetupWizardView />}
            </>
          )}
        </main>
      </div>

      {/* Notification Slide-Over Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 flex justify-end no-print">
          <button
            type="button"
            aria-label="Close notifications overlay"
            className="flex-1 bg-slate-950/40"
            onClick={() => setNotifOpen(false)}
          />
          <div className="w-full max-w-md bg-white border-l border-slate-200 h-full flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900">
                  Portal Notifications
                </h2>
                <p className="text-xs text-slate-500">
                  {unreadCount} unread alert{unreadCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notifications.some((n) => !n.isRead && !n.id.startsWith('live_')) && (
                  <button
                    type="button"
                    disabled={markingAllNotifs}
                    onClick={async () => {
                      setMarkingAllNotifs(true);
                      try {
                        const c = await markAllNotificationsRead(notifications);
                        if (c > 0) pushToast('success', `Marked ${c} notification(s) as read.`);
                      } finally {
                        setMarkingAllNotifs(false);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#172DEB] bg-blue-50 hover:bg-blue-100 rounded-md disabled:opacity-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-4 py-2 bg-[#F5F7FC] border-b border-slate-200 flex items-center gap-1.5">
              {(['ALL', 'FINANCE', 'MESSAGES', 'ANNOUNCEMENTS'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setNotifFilter(cat)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition ${
                    notifFilter === cat
                      ? 'bg-[#172DEB] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat === 'ALL'
                    ? 'All'
                    : cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {(() => {
                const visible = notifications.filter((n) => {
                  if (notifFilter === 'ALL') return true;
                  if (notifFilter === 'MESSAGES') {
                    return n.type === 'NEW_INTERNAL_MESSAGE' || n.type === 'INSTRUCTOR_MESSAGE';
                  }
                  if (notifFilter === 'ANNOUNCEMENTS') {
                    return (
                      n.type === 'ADMIN_ANNOUNCEMENT' ||
                      n.type === 'COURSE_ANNOUNCEMENT' ||
                      n.type === 'SCHEDULE_CHANGE'
                    );
                  }
                  return (
                    n.type.includes('PAYMENT') ||
                    n.type.includes('BALANCE') ||
                    n.type.includes('DEADLINE') ||
                    n.type.includes('REGISTRATION')
                  );
                });
                if (visible.length === 0) {
                  return (
                    <div className="p-10 text-center text-xs text-slate-500">
                      All caught up — no notifications in this filter.
                    </div>
                  );
                }
                return visible.map((n) => {
                  const isLive = n.id.startsWith('live_');
                  const toneColor =
                    n.type === 'OVERDUE_BALANCE' ||
                    n.type === 'REJECTED_PAYMENT' ||
                    n.type === 'PAYMENT_OVERDUE' ||
                    n.type === 'CHAPA_PAYMENT_REJECTED'
                      ? 'text-[#E51B23]'
                      : n.type === 'DEADLINE_APPROACHING'
                      ? 'text-amber-700'
                      : 'text-[#172DEB]';

                  return (
                    <div
                      key={n.id}
                      className={`p-4 space-y-1.5 ${n.isRead ? 'bg-white' : 'bg-[#F5F7FC]/90'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-xs font-bold ${toneColor}`}>{n.title}</p>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap tabular-nums">
                          {formatAddisDateTimeDual(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              n.actionSection === 'registrations' ||
                              n.type === 'PENDING_STAFF_REGISTRATION' ||
                              n.type === 'STAFF_REGISTRATION_APPROVED' ||
                              n.type === 'ID_VERIFICATION_FLAGGED'
                            ) {
                              setActiveTab('registrations');
                            } else if (
                              n.actionSection === 'chapa' ||
                              n.type.startsWith('CHAPA_')
                            ) {
                              setActiveTab('chapa');
                            } else if (
                              n.actionSection === 'messages' ||
                              n.type === 'NEW_INTERNAL_MESSAGE' ||
                              n.type === 'INSTRUCTOR_MESSAGE'
                            ) {
                              setActiveTab('messages');
                            } else if (
                              n.type === 'ADMIN_ANNOUNCEMENT' ||
                              n.type === 'COURSE_ANNOUNCEMENT'
                            ) {
                              setActiveTab(effectiveRole === 'ADMIN' ? 'communications' : 'messages');
                            } else if (n.type === 'PENDING_PAYMENT' || n.type === 'PENDING_REGISTRATION') {
                              setActiveTab(effectiveRole === 'ADMIN' ? 'approvals' : 'students');
                            } else if (n.type === 'REJECTED_PAYMENT' || n.type === 'PAYMENT_REJECTED') {
                              setActiveTab('payments');
                            } else if (
                              n.type === 'PAYMENT_OVERDUE' ||
                              n.type === 'PAYMENT_DUE_TODAY' ||
                              n.type === 'UPCOMING_PAYMENT' ||
                              n.type === 'OVERDUE_BALANCE' ||
                              n.type === 'DEADLINE_APPROACHING'
                            ) {
                              setActiveTab('reminders');
                            } else {
                              setActiveTab('dashboard');
                            }
                            setNotifOpen(false);
                          }}
                          className="text-[11px] font-semibold text-[#172DEB] hover:underline"
                        >
                          Open module
                        </button>
                        {!isLive && !n.isRead && (
                          <button
                            type="button"
                            onClick={() => void markNotificationRead(n.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-900"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'ai_hub' && (
        <ZacmaAiAssistant
          activeModule={activeTab}
          onOpenFullWorkspace={(prompt) => {
            if (prompt) setPendingAiPrompt(prompt);
            setActiveTab('ai_hub');
          }}
        />
      )}
      <SessionTimeoutModal />
      <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PortalProvider>
        <PortalShell />
      </PortalProvider>
    </ErrorBoundary>
  );
}
