import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  Clock,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { EmptyState, StatusLabel } from '../components/PortalUI';
import {
  saveNotificationPreferences,
  setNotificationReadState,
} from '../lib/zacmaService';
import {
  addDaysIso,
  formatDateShort,
  formatEtb,
  formatEtbCompact,
  NotificationType,
  todayIsoDate,
} from '../types/zacma';

interface ServerChannelStatus {
  inApp: { configured: boolean; active: boolean };
  email: { configured: boolean; provider: string };
  sms: { configured: boolean; provider: string };
  whatsapp: { configured: boolean; provider: string };
}

const CATEGORY_LABELS: Record<string, string> = {
  ALL: 'All Categories',
  UPCOMING_PAYMENT: 'Upcoming Payment',
  PAYMENT_DUE_TODAY: 'Payment Due Today',
  PAYMENT_OVERDUE: 'Payment Overdue',
  PAYMENT_RECEIVED: 'Payment Received',
  PAYMENT_APPROVED: 'Payment Approved',
  PAYMENT_REJECTED: 'Payment Rejected',
  OUTSTANDING_BALANCE: 'Outstanding Balance',
};

export function RemindersAndPreferencesView() {
  const {
    user,
    effectiveRole,
    courses,
    enrollments,
    installments,
    persistedNotifications,
    notificationPrefs,
    lastReminderRun,
    runningReminders,
    runReminderEvaluationNow,
    pushToast,
  } = usePortal();

  const [leadDays, setLeadDays] = useState(notificationPrefs?.upcomingLeadDays ?? 7);
  const [repeatDays, setRepeatDays] = useState(notificationPrefs?.overdueRepeatDays ?? 3);
  const [inAppEnabled, setInAppEnabled] = useState(notificationPrefs?.inAppEnabled ?? true);
  const [emailEnabled, setEmailEnabled] = useState(notificationPrefs?.emailEnabled ?? false);
  const [smsEnabled, setSmsEnabled] = useState(notificationPrefs?.smsEnabled ?? false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(notificationPrefs?.whatsappEnabled ?? false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [watchlistCourse, setWatchlistCourse] = useState('ALL');
  const [watchlistDate, setWatchlistDate] = useState('');
  const [channelStatus, setChannelStatus] = useState<ServerChannelStatus | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [channelTestResult, setChannelTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (notificationPrefs) {
      setLeadDays(notificationPrefs.upcomingLeadDays);
      setRepeatDays(notificationPrefs.overdueRepeatDays);
      setInAppEnabled(notificationPrefs.inAppEnabled);
      setEmailEnabled(notificationPrefs.emailEnabled);
      setSmsEnabled(notificationPrefs.smsEnabled);
      setWhatsappEnabled(notificationPrefs.whatsappEnabled);
    }
  }, [notificationPrefs]);

  useEffect(() => {
    let active = true;
    fetch('/api/setup/status')
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.providers?.channels) {
          setChannelStatus(data.providers.channels as ServerChannelStatus);
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      active = false;
    };
  }, []);

  if (effectiveRole !== 'ADMIN' && effectiveRole !== 'ACCOUNTANT') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <ShieldAlert className="w-7 h-7 text-red-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900">Finance &amp; Admin Access Only</h2>
        <p className="text-xs text-slate-500 mt-1">
          Automated payment reminders and fee deadline schedules are restricted to Administrators and Accountants.
        </p>
      </div>
    );
  }

  const today = todayIsoDate();
  const upcomingCutoff = addDaysIso(today, leadDays);

  const enrollmentById = useMemo(
    () => new Map(enrollments.map((e) => [e.id, e])),
    [enrollments]
  );

  // Live deadline classification strictly from APPROVED installment coverage
  const scheduleSummary = useMemo(() => {
    const overdue: typeof installments = [];
    const dueToday: typeof installments = [];
    const upcoming: typeof installments = [];

    for (const inst of installments) {
      const enr = enrollmentById.get(inst.enrollmentId);
      if (!enr || enr.status !== 'ACTIVE') continue;
      if (inst.amountDueEtb - inst.amountPaidEtb <= 0.01) continue;

      if (inst.dueDate < today) {
        overdue.push(inst);
      } else if (inst.dueDate === today) {
        dueToday.push(inst);
      } else if (inst.dueDate <= upcomingCutoff) {
        upcoming.push(inst);
      }
    }

    return { overdue, dueToday, upcoming };
  }, [installments, enrollmentById, today, upcomingCutoff]);

  const filteredNotifications = useMemo(() => {
    return persistedNotifications.filter((n) => {
      if (categoryFilter !== 'ALL' && n.type !== categoryFilter) return false;
      if (readFilter === 'UNREAD' && n.isRead) return false;
      if (readFilter === 'READ' && !n.isRead) return false;
      return true;
    });
  }, [persistedNotifications, categoryFilter, readFilter]);

  const handleRunEvaluation = async () => {
    const res = await runReminderEvaluationNow({
      upcomingLeadDays: leadDays,
      overdueRepeatDays: repeatDays,
    });
    if (res) {
      const created = res.upcomingGenerated + res.dueTodayGenerated + res.overdueGenerated;
      pushToast(
        'success',
        `Checked ${res.checkedInstallments} installments: ${res.newlyMarkedOverdue} marked overdue, ${created} new reminder(s) created (${res.skippedDuplicates} duplicates prevented).`
      );
    }
  };

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingPrefs(true);
    try {
      await saveNotificationPreferences({
        userId: user.uid,
        inAppEnabled,
        emailEnabled,
        smsEnabled,
        whatsappEnabled,
        upcomingLeadDays: leadDays,
        overdueRepeatDays: repeatDays,
      });
      pushToast('success', 'Notification cadence and delivery preferences saved.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to save preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleTestExternalChannel = async (channel: 'email' | 'sms' | 'whatsapp') => {
    setTestingChannel(channel);
    setChannelTestResult(null);
    try {
      const res = await fetch('/api/reminders/dispatch-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          recipient: 'admin-diagnostic-check',
          body: 'ZACMA Payment Reminder adapter verification check.',
        }),
      });
      const data = await res.json();
      setChannelTestResult(
        `[${channel.toUpperCase()} — ${data.status || 'UNKNOWN'}] ${data.message || data.error || 'No response details.'}`
      );
    } catch {
      setChannelTestResult(`[${channel.toUpperCase()}] Unable to reach backend dispatch endpoint.`);
    } finally {
      setTestingChannel(null);
    }
  };

  const priorityInstallments = [
    ...scheduleSummary.overdue.map((i) => ({ ...i, bucket: 'OVERDUE' as const })),
    ...scheduleSummary.dueToday.map((i) => ({ ...i, bucket: 'DUE_TODAY' as const })),
    ...scheduleSummary.upcoming.map((i) => ({ ...i, bucket: 'UPCOMING' as const })),
  ];

  const filteredWatchlist = useMemo(() => {
    const q = watchlistSearch.trim().toLowerCase();
    return priorityInstallments.filter((inst) => {
      if (watchlistCourse !== 'ALL' && inst.courseName !== watchlistCourse) return false;
      if (watchlistDate && inst.dueDate !== watchlistDate) return false;
      if (!q) return true;
      return (
        inst.studentName.toLowerCase().includes(q) ||
        inst.studentCode.toLowerCase().includes(q) ||
        inst.courseName.toLowerCase().includes(q) ||
        inst.dueDate.toLowerCase().includes(q)
      );
    });
  }, [priorityInstallments, watchlistSearch, watchlistCourse, watchlistDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
            Automated Payment Reminders &amp; Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Evaluates student payment schedules strictly against Admin-approved transactions. Duplicate reminders are automatically prevented.
          </p>
        </div>
        <button
          type="button"
          disabled={runningReminders}
          onClick={() => void handleRunEvaluation()}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${runningReminders ? 'animate-spin' : ''}`} />
          {runningReminders ? 'Evaluating Deadlines...' : 'Run Reminder Evaluation Now'}
        </button>
      </div>

      {/* Live Deadline Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Overdue Installments</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-mono font-bold text-red-700 tabular-nums">
            {scheduleSummary.overdue.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Uncovered by approved payments past due date
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Due Today</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-mono font-bold text-amber-700 tabular-nums">
            {scheduleSummary.dueToday.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">{formatDateShort(today)}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Upcoming (Next {leadDays} Days)</span>
            <CalendarClock className="w-4 h-4 text-blue-700" />
          </div>
          <p className="text-2xl font-mono font-bold text-slate-900 tabular-nums">
            {scheduleSummary.upcoming.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Through {formatDateShort(upcomingCutoff)}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Last Evaluation Check</span>
            <Bell className="w-4 h-4 text-emerald-700" />
          </div>
          <p className="text-sm font-semibold text-slate-900 mt-2">
            {lastReminderRun
              ? new Date(lastReminderRun.ranAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Auto-scheduled'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {lastReminderRun
              ? `${lastReminderRun.checkedInstallments} checked · ${lastReminderRun.skippedDuplicates} deduped`
              : 'Runs on login & via scheduled cron'}
          </p>
        </div>
      </div>

      {/* Priority Installments Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Active Deadline &amp; Overdue Watchlist
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Students whose payment period is approaching, due today, or overdue (approved payments only)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={watchlistSearch}
                onChange={(e) => setWatchlistSearch(e.target.value)}
                placeholder="Name, ID, course, date..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
            <select
              value={watchlistCourse}
              onChange={(e) => setWatchlistCourse(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={watchlistDate}
              onChange={(e) => setWatchlistDate(e.target.value)}
              aria-label="Filter watchlist by due date"
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
            />
            {(watchlistSearch || watchlistCourse !== 'ALL' || watchlistDate) && (
              <button
                type="button"
                onClick={() => {
                  setWatchlistSearch('');
                  setWatchlistCourse('ALL');
                  setWatchlistDate('');
                }}
                className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {filteredWatchlist.length === 0 ? (
          <EmptyState
            title={
              priorityInstallments.length === 0
                ? 'All active installments are in good standing'
                : 'No installments match your filters'
            }
            description={
              priorityInstallments.length === 0
                ? 'No overdue, due-today, or upcoming unpaid installments within your lead window.'
                : 'Clear your name, ID, course, or due date filter to view all deadlines.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Student &amp; ID</th>
                  <th className="py-3 px-3">Course / Installment</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3 text-right">Expected</th>
                  <th className="py-3 px-3 text-right">Approved Paid</th>
                  <th className="py-3 px-3 text-right">Remaining Bal.</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredWatchlist.map((inst) => {
                  const enr = enrollmentById.get(inst.enrollmentId);
                  return (
                    <tr key={inst.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{inst.studentName}</p>
                        <p className="text-[11px] font-mono text-slate-500">{inst.studentCode}</p>
                      </td>
                      <td className="py-3 px-3">
                        <p className="text-slate-900 font-medium">{inst.courseName}</p>
                        <p className="text-[11px] text-slate-500">
                          Installment #{inst.installmentNumber} · {enr?.paymentPlanCode || 'PLAN'}
                        </p>
                      </td>
                      <td
                        className={`py-3 px-3 whitespace-nowrap font-medium ${
                          inst.bucket === 'OVERDUE'
                            ? 'text-red-700'
                            : inst.bucket === 'DUE_TODAY'
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {formatDateShort(inst.dueDate)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatEtb(inst.amountDueEtb)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700">
                        {formatEtb(inst.amountPaidEtb)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-red-700">
                        {formatEtb(Math.max(0, enr?.remainingBalanceEtb ?? inst.amountDueEtb - inst.amountPaidEtb))}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <StatusLabel
                          status={
                            inst.bucket === 'OVERDUE'
                              ? 'OVERDUE'
                              : inst.bucket === 'DUE_TODAY'
                              ? 'PENDING'
                              : inst.status
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Split: Notification History + Delivery Preferences & Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Notification History */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Notification History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {filteredNotifications.length} persisted notification
                {filteredNotifications.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={readFilter}
                onChange={(e) => setReadFilter(e.target.value as 'ALL' | 'UNREAD' | 'READ')}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700"
              >
                <option value="ALL">All Statuses</option>
                <option value="UNREAD">Unread</option>
                <option value="READ">Read</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <EmptyState
                title="No notifications match this filter"
                description="Run the reminder evaluation engine or adjust your category filters."
              />
            ) : (
              filteredNotifications.slice(0, 40).map((n) => (
                <div
                  key={n.id}
                  className={`p-4 space-y-1.5 ${n.isRead ? 'bg-white' : 'bg-blue-50/30'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase mr-2">
                        {n.targetRole} · {n.type.replace(/_/g, ' ')}
                      </span>
                      <p
                        className={`text-xs font-bold mt-0.5 ${
                          n.type === 'PAYMENT_OVERDUE' ||
                          n.type === 'OVERDUE_BALANCE' ||
                          n.type === 'PAYMENT_REJECTED' ||
                          n.type === 'REJECTED_PAYMENT'
                            ? 'text-red-700'
                            : n.type === 'PAYMENT_APPROVED'
                            ? 'text-emerald-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {n.title}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">
                      {formatDateShort(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  {(n.studentName || n.dueDate || n.expectedAmountEtb !== undefined) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500 pt-0.5">
                      {n.studentName && (
                        <span>
                          {n.studentName} ({n.studentCode || 'N/A'})
                        </span>
                      )}
                      {n.courseName && <span>{n.courseName}</span>}
                      {n.expectedAmountEtb !== undefined && (
                        <span>Expected: {formatEtbCompact(n.expectedAmountEtb)}</span>
                      )}
                      {n.paidAmountEtb !== undefined && (
                        <span>Paid: {formatEtbCompact(n.paidAmountEtb)}</span>
                      )}
                      {n.remainingBalanceEtb !== undefined && (
                        <span>Remaining: {formatEtbCompact(n.remainingBalanceEtb)}</span>
                      )}
                      {n.dueDate && <span>Due: {formatDateShort(n.dueDate)}</span>}
                      {n.paymentStatus && <span>Status: {n.paymentStatus}</span>}
                    </div>
                  )}
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void setNotificationReadState(n.id, !n.isRead)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      {n.isRead ? 'Mark unread' : 'Mark read'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cadence Settings + Extensible External Channel Adapters */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={(e) => void handleSavePrefs(e)}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900">Reminder Schedule &amp; Preferences</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure lead time before deadlines and repeat cadence for overdue notices.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upcoming Lead (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={leadDays}
                  onChange={(e) => setLeadDays(Number(e.target.value) || 7)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Overdue Repeat (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={repeatDays}
                  onChange={(e) => setRepeatDays(Number(e.target.value) || 3)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-medium">In-App Portal Notifications (Active)</span>
                <input
                  type="checkbox"
                  checked={inAppEnabled}
                  onChange={(e) => setInAppEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-700">
                <span>Email Adapter Opt-In (requires SMTP env vars)</span>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-700">
                <span>SMS Adapter Opt-In (requires Twilio env vars)</span>
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-700">
                <span>WhatsApp Adapter Opt-In (requires Meta Cloud API)</span>
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-700"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingPrefs}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg"
            >
              <Save className="w-3.5 h-3.5" />
              {savingPrefs ? 'Saving Preferences...' : 'Save Preferences'}
            </button>
          </form>

          {/* Honest External Delivery Channel Diagnostics */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Delivery Channels &amp; Adapters</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                External channels never report success unless server credentials are configured and confirmed.
              </p>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-slate-900">In-App &amp; Student Portal</p>
                    <p className="text-[11px] text-slate-500">Live Firestore notifications</p>
                  </div>
                </div>
                <span className="font-semibold text-emerald-700">Active</span>
              </div>

              {(
                [
                  {
                    key: 'email' as const,
                    label: 'Email (SMTP)',
                    icon: <Mail className="w-4 h-4 text-slate-500" />,
                    configured: channelStatus?.email.configured ?? false,
                    envHint: 'SMTP_HOST, SMTP_USER',
                  },
                  {
                    key: 'sms' as const,
                    label: 'SMS Gateway (Twilio)',
                    icon: <Smartphone className="w-4 h-4 text-slate-500" />,
                    configured: channelStatus?.sms.configured ?? false,
                    envHint: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN',
                  },
                  {
                    key: 'whatsapp' as const,
                    label: 'WhatsApp Business API',
                    icon: <MessageSquare className="w-4 h-4 text-slate-500" />,
                    configured: channelStatus?.whatsapp.configured ?? false,
                    envHint: 'WHATSAPP_API_TOKEN',
                  },
                ]
              ).map((ch) => (
                <div key={ch.key} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {ch.icon}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{ch.label}</p>
                      <p className="text-[11px] font-mono text-slate-500 truncate">{ch.envHint}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[11px] font-semibold ${
                        ch.configured ? 'text-blue-700' : 'text-slate-500'
                      }`}
                    >
                      {ch.configured ? 'Env Present' : 'Not Configured'}
                    </span>
                    <button
                      type="button"
                      disabled={testingChannel === ch.key}
                      onClick={() => void handleTestExternalChannel(ch.key)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md"
                    >
                      <Send className="w-3 h-3" />
                      Check
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {channelTestResult && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 leading-relaxed">
                {channelTestResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
