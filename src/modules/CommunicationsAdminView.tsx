import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Megaphone,
  MessageSquare,
  Phone,
  RefreshCw,
  Save,
  Send,
  Settings,
  Shield,
  Sliders,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import {
  DEFAULT_CHANNEL_RULES,
  DEFAULT_SMS_TEMPLATES,
  dispatchSmsMessage,
  renderTemplateVariables,
  retryFailedSmsLog,
  saveNotificationChannelRule,
  saveSmsConfigAndPolicy,
  saveSmsTemplate,
  sendMultiChannelBroadcast,
} from '../lib/communicationService';
import { formatAddisDateTimeDual, formatDualDate, todayAddisIsoDate } from '../lib/ethiopianCalendar';
import { ModuleAiToolbar } from '../components/ModuleAiToolbar';
import {
  BroadcastAudience,
  CommunicationEventType,
  NotificationChannelRule,
  SmsLog,
  SmsProviderCode,
  SmsSystemConfig,
  SmsTemplate,
  addDaysIso,
} from '../types/zacma';

interface ProviderStatusItem {
  name: string;
  configured: boolean;
  supportsEthiopia: boolean;
  supportsSenderId: boolean;
  senderHint?: string;
  requiredEnvVars: string[];
}

interface GatewayStatusResponse {
  checkedAt: string;
  providers: Record<SmsProviderCode, ProviderStatusItem>;
  anyLiveProviderConfigured: boolean;
}

const TEMPLATE_VARIABLES = [
  '[Student Name]',
  '[Student ID]',
  '[Course Name]',
  '[Amount]',
  '[Balance]',
  '[Due Date]',
  '[Receipt Number]',
  '[Gregorian Date]',
  '[Ethiopian Date]',
  '[Owner Phone]',
  '[Custom Message]',
];

type CommTab = 'overview' | 'config' | 'templates' | 'history' | 'matrix' | 'broadcasts';

export function CommunicationsAdminView({ initialTab = 'overview' }: { initialTab?: CommTab }) {
  const {
    profile,
    actualRole,
    students,
    courses,
    installments,
    enrollments,
    smsConfig,
    smsTemplates,
    smsLogs,
    channelRules,
    directoryUsers,
    conversations,
    pushToast,
  } = usePortal();

  const [activeTab, setActiveTab] = useState<CommTab>(initialTab);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatusResponse | null>(null);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);

  // Config form state synced with Firestore smsConfig
  const [cfgForm, setCfgForm] = useState<
    Omit<SmsSystemConfig, 'id' | 'updatedAt' | 'updatedBy' | 'updatedByName'>
  >({
    ownerPhoneNumber: smsConfig.ownerPhoneNumber,
    activeProvider: smsConfig.activeProvider,
    senderId: smsConfig.senderId || 'ZACMA',
    smsEnabled: smsConfig.smsEnabled,
    portalNotificationsEnabled: smsConfig.portalNotificationsEnabled,
    internalMessagingEnabled: smsConfig.internalMessagingEnabled,
    testMode: smsConfig.testMode,
    allowStudentToInstructor: smsConfig.allowStudentToInstructor,
    allowStudentToAdmin: smsConfig.allowStudentToAdmin,
    allowStudentToStudent: smsConfig.allowStudentToStudent,
    allowAttachments: smsConfig.allowAttachments,
  });
  const [savingCfg, setSavingCfg] = useState(false);

  // Template editor state
  const [selectedTplId, setSelectedTplId] = useState<string>(
    smsTemplates[0]?.id || DEFAULT_SMS_TEMPLATES[0].id
  );
  const [tplName, setTplName] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplActive, setTplActive] = useState(true);
  const [savingTpl, setSavingTpl] = useState(false);

  // Quick Send SMS state
  const [quickStudentId, setQuickStudentId] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickEventType, setQuickEventType] = useState<CommunicationEventType>('ADMIN_ANNOUNCEMENT');
  const [quickBody, setQuickBody] = useState('');
  const [sendingQuick, setSendingQuick] = useState(false);
  const [runningBatchFeeSms, setRunningBatchFeeSms] = useState(false);

  // History filters & retry state
  const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | 'SENT' | 'TEST_SIMULATED' | 'FAILED'>('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);

  // Broadcast composer state
  const [bcastTitle, setBcastTitle] = useState('');
  const [bcastBody, setBcastBody] = useState('');
  const [bcastAudience, setBcastAudience] = useState<BroadcastAudience>('ALL_STUDENTS');
  const [bcastCourseId, setBcastCourseId] = useState('');
  const [bcastEventType, setBcastEventType] = useState<'ADMIN_ANNOUNCEMENT' | 'COURSE_ANNOUNCEMENT'>('ADMIN_ANNOUNCEMENT');
  const [bcastSelectedUids, setBcastSelectedUids] = useState<string[]>([]);
  const [bcastChannelMsg, setBcastChannelMsg] = useState(true);
  const [bcastChannelPortal, setBcastChannelPortal] = useState(true);
  const [bcastChannelSms, setBcastChannelSms] = useState(false);
  const [sendingBcast, setSendingBcast] = useState(false);

  const isAdmin = actualRole === 'ADMIN';

  useEffect(() => {
    setCfgForm({
      ownerPhoneNumber: smsConfig.ownerPhoneNumber,
      activeProvider: smsConfig.activeProvider,
      senderId: smsConfig.senderId || 'ZACMA',
      smsEnabled: smsConfig.smsEnabled,
      portalNotificationsEnabled: smsConfig.portalNotificationsEnabled,
      internalMessagingEnabled: smsConfig.internalMessagingEnabled,
      testMode: smsConfig.testMode,
      allowStudentToInstructor: smsConfig.allowStudentToInstructor,
      allowStudentToAdmin: smsConfig.allowStudentToAdmin,
      allowStudentToStudent: smsConfig.allowStudentToStudent,
      allowAttachments: smsConfig.allowAttachments,
    });
  }, [smsConfig]);

  const activeTemplate: SmsTemplate | undefined = useMemo(
    () => smsTemplates.find((t) => t.id === selectedTplId) || smsTemplates[0],
    [smsTemplates, selectedTplId]
  );

  useEffect(() => {
    if (activeTemplate) {
      setTplName(activeTemplate.name);
      setTplBody(activeTemplate.body);
      setTplActive(activeTemplate.isActive);
    }
  }, [activeTemplate]);

  // Fetch backend SMS gateway readiness (no secrets exposed)
  const loadGatewayStatus = async () => {
    try {
      const res = await fetch('/api/sms/status');
      if (res.ok) {
        const data = (await res.json()) as GatewayStatusResponse;
        setGatewayStatus(data);
      }
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    void loadGatewayStatus();
  }, []);

  const checkBalance = async () => {
    setCheckingBalance(true);
    setBalanceInfo(null);
    try {
      const res = await fetch(`/api/sms/balance?provider=${cfgForm.activeProvider}`);
      const data = (await res.json()) as {
        ok?: boolean;
        balance?: string;
        configured?: boolean;
        detail?: string;
      };
      setBalanceInfo(
        data.balance
          ? `Live Balance: ${data.balance}`
          : data.detail || 'Check your provider console for live credit balance.'
      );
    } catch {
      setBalanceInfo('Unable to reach /api/sms/balance endpoint.');
    } finally {
      setCheckingBalance(false);
    }
  };

  // SMS Statistics
  const stats = useMemo(() => {
    let sentLive = 0;
    let simulated = 0;
    let failed = 0;
    let pending = 0;
    for (const l of smsLogs) {
      if (l.status === 'SENT' || l.status === 'DELIVERED') sentLive++;
      else if (l.status === 'TEST_SIMULATED') simulated++;
      else if (l.status === 'FAILED') failed++;
      else pending++;
    }
    return { total: smsLogs.length, sentLive, simulated, failed, pending };
  }, [smsLogs]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return smsLogs.filter((l) => {
      if (logStatusFilter === 'SENT' && l.status !== 'SENT' && l.status !== 'DELIVERED') return false;
      if (logStatusFilter === 'TEST_SIMULATED' && l.status !== 'TEST_SIMULATED') return false;
      if (logStatusFilter === 'FAILED' && l.status !== 'FAILED') return false;
      if (!q) return true;
      return (
        l.recipientName.toLowerCase().includes(q) ||
        l.recipientPhone.toLowerCase().includes(q) ||
        l.messageBody.toLowerCase().includes(q) ||
        (l.studentCode || '').toLowerCase().includes(q)
      );
    });
  }, [smsLogs, logStatusFilter, logSearch]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !actualRole || !isAdmin) return;
    setSavingCfg(true);
    try {
      await saveSmsConfigAndPolicy(cfgForm, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: actualRole,
      });
      pushToast('success', 'SMS & Communication settings saved.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to save configuration.');
    } finally {
      setSavingCfg(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !actualRole || !activeTemplate || !isAdmin) return;
    setSavingTpl(true);
    try {
      await saveSmsTemplate(
        {
          id: activeTemplate.id,
          eventType: activeTemplate.eventType,
          name: tplName,
          body: tplBody,
          isActive: tplActive,
        },
        { uid: profile.uid, fullName: profile.fullName, role: actualRole }
      );
      pushToast('success', `Template "${tplName}" updated.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to save template.');
    } finally {
      setSavingTpl(false);
    }
  };

  const handleToggleRule = async (
    rule: NotificationChannelRule,
    field: 'smsEnabled' | 'portalEnabled' | 'internalMessageEnabled'
  ) => {
    if (!profile || !actualRole || !isAdmin) return;
    try {
      await saveNotificationChannelRule(
        { ...rule, [field]: !rule[field] },
        { uid: profile.uid, fullName: profile.fullName, role: actualRole }
      );
      pushToast('success', `Updated channel routing for ${rule.label}.`);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to update rule.');
    }
  };

  const handleQuickSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !actualRole) return;
    if (!quickPhone.trim() || !quickBody.trim()) {
      pushToast('error', 'Recipient phone number and message text are required.');
      return;
    }
    setSendingQuick(true);
    try {
      const selectedStu = students.find((s) => s.id === quickStudentId);
      const outcome = await dispatchSmsMessage(
        {
          eventType: quickEventType,
          recipientName: quickName.trim() || selectedStu?.fullName || 'ZACMA Recipient',
          recipientPhone: quickPhone.trim(),
          messageBody: quickBody.trim(),
          studentId: selectedStu?.id,
          studentCode: selectedStu?.studentCode,
          courseName: selectedStu?.courseName,
          config: smsConfig,
          existingLogs: smsLogs,
        },
        { uid: profile.uid, fullName: profile.fullName, role: actualRole }
      );
      if (outcome.ok) {
        pushToast('success', outcome.detail);
        setQuickBody('');
      } else {
        pushToast('error', outcome.detail);
      }
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to dispatch SMS.');
    } finally {
      setSendingQuick(false);
    }
  };

  const handleBatchFeeSms = async (mode: 'OVERDUE' | 'UPCOMING') => {
    if (!profile || !actualRole) return;
    setRunningBatchFeeSms(true);
    try {
      const today = todayAddisIsoDate();
      const soon = addDaysIso(today, 7);
      const targetInstallments = installments.filter((inst) => {
        if (inst.status === 'PAID' || inst.amountDueEtb <= inst.amountPaidEtb) return false;
        return mode === 'OVERDUE'
          ? inst.dueDate < today
          : inst.dueDate >= today && inst.dueDate <= soon;
      });

      const eventType: CommunicationEventType =
        mode === 'OVERDUE' ? 'PAYMENT_OVERDUE' : 'PAYMENT_REMINDER';
      const tpl =
        smsTemplates.find((t) => t.eventType === eventType) ||
        DEFAULT_SMS_TEMPLATES.find((t) => t.eventType === eventType);
      const studentMap = new Map(students.map((s) => [s.id, s]));
      const enrollmentMap = new Map(enrollments.map((e) => [e.id, e]));

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const inst of targetInstallments.slice(0, 40)) {
        const stu = studentMap.get(inst.studentId);
        if (!stu || !stu.phone) continue;
        const enr = enrollmentMap.get(inst.enrollmentId);
        const unpaid = Math.max(0, inst.amountDueEtb - inst.amountPaidEtb);
        const dualDue = formatDualDate(inst.dueDate, false);
        const rendered = renderTemplateVariables(tpl?.body || '', {
          studentName: stu.fullName,
          studentCode: stu.studentCode,
          courseName: inst.courseName,
          amount: unpaid,
          balance: enr?.remainingBalanceEtb ?? unpaid,
          dueDate: `${dualDue.gregorian} (${dualDue.ethiopian} E.C.)`,
          ownerPhone: smsConfig.ownerPhoneNumber,
        });

        const outcome = await dispatchSmsMessage(
          {
            eventType,
            recipientName: stu.fullName,
            recipientPhone: stu.phone,
            messageBody: rendered,
            studentId: stu.id,
            studentCode: stu.studentCode,
            courseName: inst.courseName,
            templateId: `tpl_${eventType.toLowerCase()}`,
            dedupKey: `${eventType}|${inst.id}|${today}`,
            config: smsConfig,
            existingLogs: smsLogs,
          },
          { uid: profile.uid, fullName: profile.fullName, role: actualRole }
        );
        if (outcome.skippedDuplicate) skipped++;
        else if (outcome.ok) sent++;
        else failed++;
      }

      pushToast(
        failed > 0 && sent === 0 ? 'error' : 'success',
        `${mode === 'OVERDUE' ? 'Overdue' : 'Upcoming'} fee SMS batch finished: ${sent} dispatched, ${skipped} duplicates prevented, ${failed} failed.`
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Batch SMS trigger failed.');
    } finally {
      setRunningBatchFeeSms(false);
    }
  };

  const handleRetryLog = async (log: SmsLog) => {
    if (!profile || !actualRole || !isAdmin) return;
    setRetryingLogId(log.id);
    try {
      const outcome = await retryFailedSmsLog(log, smsConfig, {
        uid: profile.uid,
        fullName: profile.fullName,
        role: actualRole,
      });
      pushToast(outcome.ok ? 'success' : 'error', outcome.detail);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetryingLogId(null);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !actualRole || !isAdmin) return;
    if (!bcastChannelMsg && !bcastChannelPortal && !bcastChannelSms) {
      pushToast('error', 'Select at least one delivery channel (Internal Message, Portal, or SMS).');
      return;
    }
    if (bcastAudience === 'COURSE' && !bcastCourseId) {
      pushToast('error', 'Please choose a target training course.');
      return;
    }

    setSendingBcast(true);
    try {
      const selectedCourse = courses.find((c) => c.id === bcastCourseId);
      const selectedUsers =
        bcastAudience === 'CUSTOM'
          ? directoryUsers.filter((u) => bcastSelectedUids.includes(u.uid))
          : bcastAudience === 'COURSE'
          ? directoryUsers.filter(
              (u) =>
                u.courseId === bcastCourseId ||
                (selectedCourse?.instructorId && u.uid === selectedCourse.instructorId)
            )
          : undefined;

      const targetStudentsForSms =
        bcastAudience === 'ALL_STUDENTS' || bcastAudience === 'ALL_USERS'
          ? students.filter((s) => s.registrationStatus === 'APPROVED')
          : bcastAudience === 'COURSE'
          ? students.filter(
              (s) => s.courseId === bcastCourseId && s.registrationStatus === 'APPROVED'
            )
          : bcastAudience === 'CUSTOM'
          ? students.filter((s) =>
              directoryUsers.some(
                (u) => bcastSelectedUids.includes(u.uid) && u.linkedStudentId === s.id
              )
            )
          : [];

      const res = await sendMultiChannelBroadcast(
        {
          title: bcastTitle,
          body: bcastBody,
          audience: bcastAudience,
          course: selectedCourse,
          selectedUsers,
          targetStudentsForSms,
          sendInternalMessage: bcastChannelMsg,
          sendPortalNotification: bcastChannelPortal,
          sendSms: bcastChannelSms,
          eventType: bcastEventType,
          smsConfig,
        },
        { uid: profile.uid, fullName: profile.fullName, role: actualRole }
      );

      pushToast(
        'success',
        `Broadcast dispatched — Portal alerts: ${res.portalNotifsCreated}, SMS sent: ${res.smsSent}${
          res.smsFailed > 0 ? `, SMS failed: ${res.smsFailed}` : ''
        }.`
      );
      setBcastTitle('');
      setBcastBody('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to send broadcast.');
    } finally {
      setSendingBcast(false);
    }
  };

  const sampleRenderedTemplate = useMemo(() => {
    const dualToday = formatDualDate(todayAddisIsoDate(), false);
    return renderTemplateVariables(tplBody, {
      studentName: 'Abebe Bikila',
      studentCode: 'ZAC-2026-0042',
      courseName: courses[0]?.name || 'Full-Stack Web Development',
      amount: 4500,
      balance: 9000,
      dueDate: `${dualToday.gregorian} (${dualToday.ethiopian} E.C.)`,
      receiptNumber: 'ZAC-REC-2026-0018',
      gregorianDate: dualToday.gregorian,
      ethiopianDate: dualToday.ethiopian,
      ownerPhone: cfgForm.ownerPhoneNumber,
      customMessage: 'Orientation begins Monday at 9:00 AM EAT in Lab 2.',
    });
  }, [tplBody, courses, cfgForm.ownerPhoneNumber]);

  const effectiveRules =
    channelRules.length > 0
      ? channelRules
      : DEFAULT_CHANNEL_RULES.map((r) => ({ ...r, updatedAt: '' }));

  return (
    <div className="space-y-5">
      <ModuleAiToolbar moduleKey="communications" moduleLabel="SMS & Campus Communications" />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[#172DEB]" />
            <span>Communications & SMS Control Center</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Ethiopian SMS gateway delivery, editable templates, 3-channel routing, and
            multi-channel broadcasts.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={`px-2.5 py-1 rounded-md font-semibold border ${
              smsConfig.smsEnabled
                ? smsConfig.testMode
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {smsConfig.smsEnabled
              ? smsConfig.testMode
                ? `SMS Active · Test Mode (${smsConfig.activeProvider})`
                : `SMS Active · Live Mode (${smsConfig.activeProvider})`
              : 'SMS Paused'}
          </span>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
        {(
          [
            ['overview', 'Overview & Gateway', Wallet],
            ['config', 'SMS Configuration', Settings],
            ['templates', 'SMS Templates', MessageSquare],
            ['history', 'SMS History & Send', Send],
            ['matrix', 'Channel Matrix', Sliders],
            ['broadcasts', 'Broadcasts & Permissions', Megaphone],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
              activeTab === id
                ? 'bg-[#172DEB] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & GATEWAY */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Live SMS Delivered</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                {stats.sentLive}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Carrier-dispatched messages across Ethiopian networks
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Test Mode Simulated</span>
                <Clock className="w-4 h-4 text-[#172DEB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                {stats.simulated}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Logged dry-run messages validated against +251 rules
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Failed Deliveries</span>
                <AlertTriangle className="w-4 h-4 text-[#E51B23]" />
              </div>
              <div className="text-2xl font-bold text-[#E51B23] mt-2 tabular-nums">
                {stats.failed}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Available for one-click retry in SMS History
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Active Message Threads</span>
                <MessageSquare className="w-4 h-4 text-[#172DEB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2 tabular-nums">
                {conversations.length}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Direct, group, and broadcast channels in ZACMA Portal
              </p>
            </div>
          </div>

          {/* Gateway Readiness Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Server-Side SMS Gateway Readiness (Ethiopian +251 Support)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  API credentials are read strictly from backend environment variables — never
                  stored in browser code or Firestore.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadGatewayStatus()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Status</span>
                </button>
                <button
                  type="button"
                  disabled={checkingBalance}
                  onClick={() => void checkBalance()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{checkingBalance ? 'Checking...' : 'Check Gateway Balance'}</span>
                </button>
              </div>
            </div>

            {balanceInfo && (
              <div className="px-3.5 py-2.5 rounded-lg bg-[#F5F7FC] border border-slate-200 text-xs text-slate-800 font-medium">
                {balanceInfo}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gatewayStatus?.providers &&
                (Object.entries(gatewayStatus.providers) as Array<
                  [SmsProviderCode, ProviderStatusItem]
                >).map(([code, p]) => {
                  const isSelected = smsConfig.activeProvider === code;
                  return (
                    <div
                      key={code}
                      className={`rounded-lg border p-3.5 ${
                        isSelected
                          ? 'border-[#172DEB] bg-[#F5F7FC]/70'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {p.name} {isSelected ? '· Active' : ''}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            p.configured ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {p.configured ? 'Env Configured' : 'Needs Server Env Vars'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {p.supportsEthiopia ? 'Supports +251 Ethiopian numbers' : 'Global SMS'}
                        {p.supportsSenderId ? ' · Custom Sender ID supported' : ''}
                      </p>
                      <div className="text-[11px] text-slate-500 mt-2 font-mono">
                        Env: {p.requiredEnvVars.join(', ')}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SMS CONFIGURATION */}
      {activeTab === 'config' && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 max-w-3xl"
        >
          <div>
            <h3 className="text-base font-bold text-slate-900">SMS Gateway & Channel Settings</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure ZACMA&apos;s official contact phone number, active Ethiopian SMS provider,
              Sender ID, and delivery mode.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                System Owner Official Phone Number <span className="text-[#E51B23]">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={cfgForm.ownerPhoneNumber}
                  onChange={(e) =>
                    setCfgForm((prev) => ({ ...prev, ownerPhoneNumber: e.target.value }))
                  }
                  placeholder="+251911000000"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Used as the institute contact number in SMS templates and authorized sending number
                where supported.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SMS Gateway Provider
              </label>
              <select
                disabled={!isAdmin}
                value={cfgForm.activeProvider}
                onChange={(e) =>
                  setCfgForm((prev) => ({
                    ...prev,
                    activeProvider: e.target.value as SmsProviderCode,
                  }))
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="afromessage">AfroMessage (Ethiopia — Ethio Telecom / Safaricom)</option>
                <option value="geezsms">GeezSMS (Ethiopia)</option>
                <option value="twilio">Twilio Global SMS</option>
                <option value="africastalking">Africa&apos;s Talking</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Authorized Sender ID (Where Supported)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={cfgForm.senderId || ''}
                onChange={(e) => setCfgForm((prev) => ({ ...prev, senderId: e.target.value }))}
                placeholder="ZACMA"
                maxLength={24}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Alphanumeric Sender IDs must be registered with your SMS gateway provider.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Delivery Mode
              </label>
              <select
                disabled={!isAdmin}
                value={cfgForm.testMode ? 'TEST' : 'LIVE'}
                onChange={(e) =>
                  setCfgForm((prev) => ({ ...prev, testMode: e.target.value === 'TEST' }))
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="TEST">Test Mode (Validate +251 numbers & log simulated deliveries)</option>
                <option value="LIVE">Live Carrier Mode (Send real SMS via server API credentials)</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Master Channel Activation
            </span>

            {(
              [
                [
                  'smsEnabled',
                  'Automated & Manual SMS Notifications',
                  'Allow ZACMA to dispatch SMS reminders, confirmations, and announcements.',
                ],
                [
                  'portalNotificationsEnabled',
                  'Student & Staff Portal Notification Center',
                  'Deliver real-time persisted alerts inside the ZACMA portal.',
                ],
                [
                  'internalMessagingEnabled',
                  'Internal Messaging System',
                  'Enable 1:1 chats, course groups, and administration broadcasts.',
                ],
              ] as const
            ).map(([field, title, desc]) => (
              <label
                key={field}
                className="flex items-start justify-between gap-4 p-3 rounded-lg border border-slate-200 bg-[#F5F7FC]/50 cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">{title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
                </div>
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={cfgForm[field]}
                  onChange={(e) =>
                    setCfgForm((prev) => ({ ...prev, [field]: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#172DEB]"
                />
              </label>
            ))}
          </div>

          {isAdmin ? (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingCfg}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingCfg ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Only ZACMA Administrators can modify gateway configuration settings.
            </p>
          )}
        </form>
      )}

      {/* TAB 3: SMS TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-[#F5F7FC]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Message Templates ({smsTemplates.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {smsTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedTplId(tpl.id)}
                  className={`w-full text-left px-4 py-3 transition ${
                    tpl.id === activeTemplate?.id
                      ? 'bg-[#172DEB]/8 border-r-2 border-[#172DEB]'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">{tpl.name}</span>
                    <span
                      className={`text-[10px] font-semibold ${
                        tpl.isActive ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {tpl.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {tpl.eventType}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSaveTemplate}
            className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit SMS Template</h3>
                <p className="text-xs text-slate-500">
                  Event trigger: <span className="font-mono">{activeTemplate?.eventType}</span>
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={tplActive}
                  onChange={(e) => setTplActive(e.target.checked)}
                  className="rounded border-slate-300 text-[#172DEB]"
                />
                <span>Template Active</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Template Name
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Message Body</label>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {tplBody.length} / 640 chars ({Math.max(1, Math.ceil(tplBody.length / 160))} SMS
                  segment{tplBody.length > 160 ? 's' : ''})
                </span>
              </div>
              <textarea
                rows={4}
                required
                disabled={!isAdmin}
                maxLength={640}
                value={tplBody}
                onChange={(e) => setTplBody(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setTplBody((prev) => `${prev}${prev.endsWith(' ') ? '' : ' '}${v}`)}
                    className="px-2 py-0.5 text-[11px] font-mono rounded border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#172DEB] hover:text-[#172DEB]"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Rendered Preview */}
            <div className="rounded-lg border border-slate-200 bg-[#F5F7FC] p-3.5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#172DEB]">
                Live SMS Preview (Dual-Calendar Ready)
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{sampleRenderedTemplate}</p>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingTpl}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingTpl ? 'Saving...' : 'Save Template'}</span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* TAB 4: SMS HISTORY & QUICK SEND */}
      {activeTab === 'history' && (
        <div className="space-y-5">
          {/* Quick Send + Batch Triggers */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleQuickSendSms}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
            >
              <h3 className="text-sm font-bold text-slate-900">Send Individual / Test SMS</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pick Registered Student (Optional)
                  </label>
                  <select
                    value={quickStudentId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setQuickStudentId(id);
                      const s = students.find((st) => st.id === id);
                      if (s) {
                        setQuickName(s.fullName);
                        setQuickPhone(s.phone);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">Manual phone entry</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.studentCode}) — {s.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ethiopian Mobile Number <span className="text-[#E51B23]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    placeholder="+251911223344 or 0911223344"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Student or guardian name"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Load Template (Optional)
                  </label>
                  <select
                    value={quickEventType}
                    onChange={(e) => {
                      const ev = e.target.value as CommunicationEventType;
                      setQuickEventType(ev);
                      const tpl = smsTemplates.find((t) => t.eventType === ev);
                      const stu = students.find((s) => s.id === quickStudentId);
                      if (tpl) {
                        setQuickBody(
                          renderTemplateVariables(tpl.body, {
                            studentName: stu?.fullName || quickName || 'Student',
                            studentCode: stu?.studentCode || '',
                            courseName: stu?.courseName || '',
                            ownerPhone: smsConfig.ownerPhoneNumber,
                          })
                        );
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {smsTemplates.map((t) => (
                      <option key={t.id} value={t.eventType}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Message Text <span className="text-[#E51B23]">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={640}
                  value={quickBody}
                  onChange={(e) => setQuickBody(e.target.value)}
                  placeholder="Write SMS content to send..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  Mode: <strong>{smsConfig.testMode ? 'TEST (Simulated)' : 'LIVE Carrier'}</strong>{' '}
                  via {smsConfig.activeProvider}
                </span>
                <button
                  type="submit"
                  disabled={sendingQuick}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingQuick ? 'Sending...' : 'Dispatch SMS'}</span>
                </button>
              </div>
            </form>

            {/* Automated Fee Batch SMS Card */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Automated Fee Reminder SMS Dispatch
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Scan active installment schedules and send deduplicated SMS reminders using your
                  active templates. Duplicate protection prevents sending the same notice twice in
                  the same day.
                </p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={runningBatchFeeSms}
                  onClick={() => void handleBatchFeeSms('UPCOMING')}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
                >
                  <Bell className="w-4 h-4" />
                  <span>Send Upcoming Fee Reminders (Next 7 Days)</span>
                </button>

                <button
                  type="button"
                  disabled={runningBatchFeeSms}
                  onClick={() => void handleBatchFeeSms('OVERDUE')}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#E51B23] text-white hover:bg-[#c8161d] disabled:opacity-50"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Send Overdue Balance SMS Notices</span>
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Logs Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                SMS Delivery History ({filteredLogs.length})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Search recipient, phone, or text..."
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
                <select
                  value={logStatusFilter}
                  onChange={(e) =>
                    setLogStatusFilter(e.target.value as typeof logStatusFilter)
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SENT">Delivered / Sent</option>
                  <option value="TEST_SIMULATED">Test Simulated</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F5F7FC] border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Date & Time (EAT / E.C.)</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Event & Message</th>
                    <th className="py-2.5 px-4">Gateway</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No SMS delivery logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.slice(0, 80).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap tabular-nums">
                          {formatAddisDateTimeDual(log.createdAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{log.recipientName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {log.recipientPhone}
                            {log.studentCode ? ` · ${log.studentCode}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-[#172DEB]">
                            {log.eventType.replace(/_/g, ' ')}
                          </div>
                          <p className="text-slate-700 line-clamp-2 mt-0.5">{log.messageBody}</p>
                          {log.errorMessage && log.status === 'FAILED' && (
                            <p className="text-[11px] text-[#E51B23] mt-0.5">{log.errorMessage}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div className="font-medium capitalize">{log.provider}</div>
                          <div className="text-[10px] text-slate-400">{log.mode}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[11px] font-semibold ${
                              log.status === 'SENT' || log.status === 'DELIVERED'
                                ? 'text-emerald-700'
                                : log.status === 'TEST_SIMULATED'
                                ? 'text-[#172DEB]'
                                : 'text-[#E51B23]'
                            }`}
                          >
                            {log.status}
                          </span>
                          {log.retryCount > 0 && (
                            <div className="text-[10px] text-slate-400">
                              Retries: {log.retryCount}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {log.status === 'FAILED' && isAdmin && (
                            <button
                              type="button"
                              disabled={retryingLogId === log.id}
                              onClick={() => void handleRetryLog(log)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-[#E51B23] text-[#E51B23] hover:bg-red-50 disabled:opacity-50"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>{retryingLogId === log.id ? 'Retrying...' : 'Retry'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: UNIFIED 3-CHANNEL MATRIX */}
      {activeTab === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              Unified Multi-Channel Notification Routing Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Independently enable or disable SMS, Portal Notification, and Internal Messaging for
              every ZACMA system event.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F7FC] border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-5">System Event</th>
                  <th className="py-3 px-4 text-center">SMS</th>
                  <th className="py-3 px-4 text-center">Portal Notification</th>
                  <th className="py-3 px-4 text-center">Internal Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {effectiveRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-slate-900">{rule.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{rule.description}</div>
                    </td>
                    {(['smsEnabled', 'portalEnabled', 'internalMessageEnabled'] as const).map(
                      (field) => (
                        <td key={field} className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            disabled={!isAdmin}
                            checked={rule[field]}
                            onChange={() => void handleToggleRule(rule, field)}
                            className="h-4 w-4 rounded border-slate-300 text-[#172DEB] cursor-pointer"
                          />
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: MULTI-CHANNEL BROADCASTS & ROLE PERMISSIONS */}
      {activeTab === 'broadcasts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Broadcast Composer */}
          <form
            onSubmit={handleSendBroadcast}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#E51B23]" />
                <span>Multi-Channel Announcement & Broadcast Composer</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Reach students, instructors, accountants, or a specific course across Internal
                Messages, Portal Notifications, and SMS in one action.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Audience
                </label>
                <select
                  disabled={!isAdmin}
                  value={bcastAudience}
                  onChange={(e) => setBcastAudience(e.target.value as BroadcastAudience)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="ALL_STUDENTS">All Registered Students</option>
                  <option value="COURSE">Specific Training Course</option>
                  <option value="ALL_INSTRUCTORS">All Instructors</option>
                  <option value="ALL_ACCOUNTANTS">All Accountants</option>
                  <option value="ALL_STAFF">All Staff Members</option>
                  <option value="ALL_USERS">All Portal Users (Staff + Students)</option>
                  <option value="CUSTOM">Selected Individual Users</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Announcement Category
                </label>
                <select
                  disabled={!isAdmin}
                  value={bcastEventType}
                  onChange={(e) =>
                    setBcastEventType(
                      e.target.value as 'ADMIN_ANNOUNCEMENT' | 'COURSE_ANNOUNCEMENT'
                    )
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="ADMIN_ANNOUNCEMENT">Official Admin Announcement</option>
                  <option value="COURSE_ANNOUNCEMENT">Course / Schedule Notification</option>
                </select>
              </div>
            </div>

            {bcastAudience === 'COURSE' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Course <span className="text-[#E51B23]">*</span>
                </label>
                <select
                  required
                  value={bcastCourseId}
                  onChange={(e) => setBcastCourseId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">Choose course...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {bcastAudience === 'CUSTOM' && (
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {directoryUsers.map((u) => {
                  const checked = bcastSelectedUids.includes(u.uid);
                  return (
                    <label
                      key={u.uid}
                      className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setBcastSelectedUids((prev) =>
                              checked ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                            )
                          }
                          className="rounded border-slate-300 text-[#172DEB]"
                        />
                        <span className="font-medium text-slate-800">{u.fullName}</span>
                      </span>
                      <span className="text-[11px] text-slate-500">{u.role}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Announcement Title <span className="text-[#E51B23]">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={bcastTitle}
                onChange={(e) => setBcastTitle(e.target.value)}
                placeholder="e.g., Upcoming Class Schedule & Orientation Update"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Message Content <span className="text-[#E51B23]">*</span>
              </label>
              <textarea
                rows={4}
                required
                disabled={!isAdmin}
                value={bcastBody}
                onChange={(e) => setBcastBody(e.target.value)}
                placeholder="Enter official announcement details..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-[#F5F7FC] p-3.5 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Delivery Channels
              </div>
              <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-800">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bcastChannelMsg}
                    onChange={(e) => setBcastChannelMsg(e.target.checked)}
                    className="rounded border-slate-300 text-[#172DEB]"
                  />
                  <span>Internal Broadcast Thread</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bcastChannelPortal}
                    onChange={(e) => setBcastChannelPortal(e.target.checked)}
                    className="rounded border-slate-300 text-[#172DEB]"
                  />
                  <span>Portal Notification Center</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bcastChannelSms}
                    onChange={(e) => setBcastChannelSms(e.target.checked)}
                    className="rounded border-slate-300 text-[#172DEB]"
                  />
                  <span>Automated SMS (Eligible Students)</span>
                </label>
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={sendingBcast}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#E51B23] text-white hover:bg-[#c8161d] disabled:opacity-50"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>{sendingBcast ? 'Publishing...' : 'Publish Broadcast'}</span>
                </button>
              </div>
            )}
          </form>

          {/* Role Messaging Permissions */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#172DEB]" />
                <span>Messaging Role Permissions</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Control who students may message directly. Staff and Administration always maintain
                strict private channel isolation.
              </p>
            </div>

            <div className="space-y-2.5">
              {(
                [
                  [
                    'allowStudentToInstructor',
                    'Students → Instructors',
                    'Allow trainees to send direct messages to course instructors.',
                  ],
                  [
                    'allowStudentToAdmin',
                    'Students → Administration & Finance',
                    'Allow trainees to reach Administration and Accounting support.',
                  ],
                  [
                    'allowStudentToStudent',
                    'Students → Students',
                    'Allow direct peer messaging between students.',
                  ],
                  [
                    'allowAttachments',
                    'File & Document Attachments',
                    'Permit validated PDF, image, and document uploads in chats.',
                  ],
                ] as const
              ).map(([field, label, desc]) => (
                <label
                  key={field}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-[#F5F7FC]/50 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={cfgForm[field]}
                    onChange={(e) =>
                      setCfgForm((prev) => ({ ...prev, [field]: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#172DEB]"
                  />
                </label>
              ))}
            </div>

            {isAdmin && (
              <button
                type="button"
                disabled={savingCfg}
                onClick={(e) => void handleSaveConfig(e)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingCfg ? 'Saving Permissions...' : 'Save Role Permissions'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
