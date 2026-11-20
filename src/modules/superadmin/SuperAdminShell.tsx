import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CreditCard,
  Headphones,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  Receipt,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { usePortal } from '../../context/PortalContext';
import { PLATFORM_ROLE_LABELS } from '../../lib/saasService';
import { ZacmaLogo } from '../../components/ZacmaLogo';
import { ZacmaAiAssistant } from '../../components/ZacmaAiAssistant';
import { AiWorkspaceView } from '../AiWorkspaceView';
import { SuperAdminNavSection } from '../../types/zacma';
import {
  PlatformAnalyticsView,
  PlatformRevenueView,
  SuperAdminDashboardView,
} from './SuperAdminDashboardAndAnalytics';
import {
  AddTrainingInstituteView,
  AllInstitutesView,
} from './AddAndManageInstitutes';
import {
  InstituteSubscriptionsView,
  ServicesAndModulesView,
  SubscriptionPlansView,
} from './SubscriptionsAndModules';
import {
  AiServicesControlView,
  GlobalSettingsView,
  NotificationManagementView,
  PlatformAuditLogsView,
  PlatformUsersView,
  SecurityAndPermissionsView,
  SupportAndAssistanceView,
} from './PlatformGovernanceViews';

interface SuperAdminNavItem {
  id: SuperAdminNavSection;
  label: string;
  group: 'Platform Overview' | 'Billing & Capabilities' | 'Governance & Support';
  icon: React.ReactNode;
  badgeCount?: number;
}

export function SuperAdminShell() {
  const {
    profile,
    platformRole,
    setPortalMode,
    signOutUser,
    tenants,
    platformInvoices,
    supportTickets,
  } = usePortal();

  const [activeSection, setActiveSection] = useState<SuperAdminNavSection>('sa_dashboard');
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pendingInvoicesCount = useMemo(
    () => platformInvoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE').length,
    [platformInvoices]
  );

  const openTicketsCount = useMemo(
    () => supportTickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
    [supportTickets]
  );

  const navItems: SuperAdminNavItem[] = useMemo(
    () => [
      {
        id: 'sa_dashboard',
        label: '1. Platform Dashboard',
        group: 'Platform Overview',
        icon: <LayoutDashboard className="w-4 h-4" />,
      },
      {
        id: 'sa_ai_assistant',
        label: 'Super Admin AI Assistant',
        group: 'Platform Overview',
        icon: <Sparkles className="w-4 h-4" />,
      },
      {
        id: 'sa_add_institute',
        label: '2. Add Training Institute',
        group: 'Platform Overview',
        icon: <PlusCircle className="w-4 h-4" />,
      },
      {
        id: 'sa_institutes',
        label: '3. All Training Institutes',
        group: 'Platform Overview',
        icon: <Building2 className="w-4 h-4" />,
        badgeCount: tenants.length,
      },
      {
        id: 'sa_subscriptions',
        label: '4. Institute Subscriptions',
        group: 'Billing & Capabilities',
        icon: <CreditCard className="w-4 h-4" />,
      },
      {
        id: 'sa_plans',
        label: '5. Subscription Plans',
        group: 'Billing & Capabilities',
        icon: <Package className="w-4 h-4" />,
      },
      {
        id: 'sa_revenue',
        label: '6. Platform Revenue & Billing',
        group: 'Billing & Capabilities',
        icon: <Receipt className="w-4 h-4" />,
        badgeCount: pendingInvoicesCount > 0 ? pendingInvoicesCount : undefined,
      },
      {
        id: 'sa_modules',
        label: '8. Services & Modules',
        group: 'Billing & Capabilities',
        icon: <Layers className="w-4 h-4" />,
      },
      {
        id: 'sa_ai_services',
        label: '11. AI Services Control',
        group: 'Billing & Capabilities',
        icon: <Bot className="w-4 h-4" />,
      },
      {
        id: 'sa_analytics',
        label: '12. Platform Analytics',
        group: 'Billing & Capabilities',
        icon: <BarChart3 className="w-4 h-4" />,
      },
      {
        id: 'sa_platform_users',
        label: '7. Platform Users',
        group: 'Governance & Support',
        icon: <Users className="w-4 h-4" />,
      },
      {
        id: 'sa_global_settings',
        label: '9. Global Platform Settings',
        group: 'Governance & Support',
        icon: <Settings className="w-4 h-4" />,
      },
      {
        id: 'sa_notifications',
        label: '10. Notification Management',
        group: 'Governance & Support',
        icon: <Bell className="w-4 h-4" />,
      },
      {
        id: 'sa_audit_logs',
        label: '13. Platform Audit Logs',
        group: 'Governance & Support',
        icon: <History className="w-4 h-4" />,
      },
      {
        id: 'sa_security',
        label: '14. Security & Permissions',
        group: 'Governance & Support',
        icon: <Shield className="w-4 h-4" />,
      },
      {
        id: 'sa_support',
        label: '15. Support & Assistance',
        group: 'Governance & Support',
        icon: <Headphones className="w-4 h-4" />,
        badgeCount: openTicketsCount > 0 ? openTicketsCount : undefined,
      },
    ],
    [tenants.length, pendingInvoicesCount, openTicketsCount]
  );

  const groups: Array<SuperAdminNavItem['group']> = [
    'Platform Overview',
    'Billing & Capabilities',
    'Governance & Support',
  ];

  const currentItem = navItems.find((i) => i.id === activeSection);

  const SidebarContent = (
    <div className="h-full flex flex-col bg-[#0F172A] text-slate-200 select-none border-r border-slate-800">
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-blue-600 to-blue-800 shrink-0" />
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <ZacmaLogo
          variant="lockup"
          theme="dark"
          size="sm"
          framed
          subtitle="SUPER ADMIN CONTROL CENTER"
        />
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white p-1.5 rounded-lg"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Switch to ZACMA Flagship Institute Portal */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={() => setPortalMode('INSTITUTE')}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-amber-300 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Open ZACMA Institute Portal</span>
          </span>
        </button>
      </div>

      {/* Grouped 15-Section Super Admin Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {groups.map((grp) => {
          const items = navItems.filter((i) => i.group === grp);
          return (
            <div key={grp} className="space-y-1">
              <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {grp}
              </p>
              {items.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-700 text-white font-semibold shadow-xs'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span
                        className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
                          item.id === 'sa_institutes'
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-amber-500 text-slate-950'
                        }`}
                      >
                        {item.badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Signed-In Platform Operator Footer */}
      <div className="p-4 border-t border-slate-800 space-y-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-400 mb-0.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{platformRole ? PLATFORM_ROLE_LABELS[platformRole] : 'Platform Owner'}</span>
          </div>
          <p className="text-xs font-semibold text-white truncate">{profile?.fullName}</p>
          <p className="text-[11px] text-slate-400 truncate">{profile?.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOutUser()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 fixed inset-y-0 left-0 z-30 no-print">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div className="w-72 max-w-[84vw] h-full shadow-2xl">{SidebarContent}</div>
          <button
            type="button"
            aria-label="Close overlay"
            className="flex-1 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Control Center Viewport */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        <header className="h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="font-display font-extrabold text-[#0B2545] whitespace-nowrap hidden sm:inline">
                ZACMA SUPER ADMIN CONTROL CENTER
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-display font-semibold text-blue-700 truncate">
                {currentItem?.label || 'Platform Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('sa_add_institute')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B2545] hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Institute</span>
            </button>
            <button
              type="button"
              onClick={() => setPortalMode('INSTITUTE')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-700" />
              <span className="hidden md:inline">ZACMA Institute Portal</span>
              <span className="md:hidden">Institute</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1480px] w-full mx-auto">
          {activeSection === 'sa_dashboard' && (
            <SuperAdminDashboardView onNavigate={setActiveSection} />
          )}
          {activeSection === 'sa_add_institute' && (
            <AddTrainingInstituteView onNavigate={setActiveSection} />
          )}
          {activeSection === 'sa_institutes' && (
            <AllInstitutesView onNavigate={setActiveSection} />
          )}
          {activeSection === 'sa_subscriptions' && <InstituteSubscriptionsView />}
          {activeSection === 'sa_plans' && <SubscriptionPlansView />}
          {activeSection === 'sa_revenue' && <PlatformRevenueView />}
          {activeSection === 'sa_platform_users' && <PlatformUsersView />}
          {activeSection === 'sa_modules' && <ServicesAndModulesView />}
          {activeSection === 'sa_global_settings' && <GlobalSettingsView />}
          {activeSection === 'sa_notifications' && <NotificationManagementView />}
          {activeSection === 'sa_ai_services' && <AiServicesControlView />}
          {activeSection === 'sa_ai_assistant' && (
            <AiWorkspaceView
              isSuperAdminMode
              activeModule="sa_dashboard"
              initialPrompt={pendingAiPrompt}
              onConsumedInitialPrompt={() => setPendingAiPrompt(null)}
            />
          )}
          {activeSection === 'sa_analytics' && <PlatformAnalyticsView />}
          {activeSection === 'sa_audit_logs' && <PlatformAuditLogsView />}
          {activeSection === 'sa_security' && <SecurityAndPermissionsView />}
          {activeSection === 'sa_support' && <SupportAndAssistanceView />}
        </main>
      </div>
      {activeSection !== 'sa_ai_assistant' && (
        <ZacmaAiAssistant
          isSuperAdminMode
          activeModule={activeSection}
          onOpenFullWorkspace={(prompt) => {
            if (prompt) setPendingAiPrompt(prompt);
            setActiveSection('sa_ai_assistant');
          }}
        />
      )}
    </div>
  );
}
