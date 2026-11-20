import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CornerUpLeft,
  Download,
  FileText,
  Megaphone,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { usePortal } from '../context/PortalContext';
import { db } from '../lib/firebase';
import {
  AttachmentPayload,
  createGroupConversation,
  formatMessageTimestamp,
  isUserRecentlyOnline,
  markConversationRead,
  parseParticipantLabel,
  sendInternalMessage,
  startOrOpenDirectConversation,
  validateAndReadAttachment,
} from '../lib/communicationService';
import { formatDualDate } from '../lib/ethiopianCalendar';
import { Conversation, DirectoryUser, InternalMessage, RoleCode } from '../types/zacma';

const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Accountant',
  INSTRUCTOR: 'Instructor',
  RECEPTIONIST: 'Receptionist',
  HR_OFFICER: 'HR Officer',
  GENERAL_STAFF: 'Staff',
  STUDENT: 'Student',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ZU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getConversationDisplayMeta(
  conv: Conversation,
  myUid: string,
  directoryByUid: Map<string, DirectoryUser>
): { title: string; subtitle: string; initials: string; online: boolean; roleLabel?: string } {
  if (conv.type === 'DIRECT') {
    const otherUid = conv.participantIds.find((uid) => uid !== myUid) || myUid;
    const dirUser = directoryByUid.get(otherUid);
    const parsed = conv.participantLabels
      .map(parseParticipantLabel)
      .find((p) => p.uid === otherUid);
    const name = dirUser?.fullName || parsed?.name || conv.title;
    const role = dirUser?.role || parsed?.role;
    return {
      title: name,
      subtitle: dirUser?.courseName
        ? `${ROLE_LABELS[dirUser.role]} · ${dirUser.courseName}`
        : role
        ? ROLE_LABELS[role]
        : 'Direct Message',
      initials: getInitials(name),
      online: isUserRecentlyOnline(dirUser?.lastSeenAt),
      roleLabel: role ? ROLE_LABELS[role] : undefined,
    };
  }
  if (conv.type === 'BROADCAST') {
    return {
      title: conv.title,
      subtitle: conv.courseName
        ? `Broadcast · ${conv.courseName}`
        : `Broadcast · ${(conv.broadcastAudience || 'ALL_USERS').replace(/_/g, ' ')}`,
      initials: 'BC',
      online: false,
      roleLabel: 'Broadcast',
    };
  }
  return {
    title: conv.title,
    subtitle: conv.courseName
      ? `Course Group · ${conv.participantIds.length} members`
      : `Group · ${conv.participantIds.length} members`,
    initials: getInitials(conv.title),
    online: false,
    roleLabel: 'Group',
  };
}

interface MessagingViewProps {
  embedded?: boolean;
  onOpenAdminBroadcast?: () => void;
}

export function MessagingView({ embedded = false, onOpenAdminBroadcast }: MessagingViewProps) {
  const {
    user,
    profile,
    actualRole,
    effectiveRole,
    courses,
    communicationPolicy,
    directoryUsers,
    conversations,
    pushToast,
  } = usePortal();

  const [filterTab, setFilterTab] = useState<'ALL' | 'DIRECT' | 'GROUP' | 'BROADCAST'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [replyTo, setReplyTo] = useState<InternalMessage | null>(null);
  const [attachment, setAttachment] = useState<AttachmentPayload | null>(null);
  const [sending, setSending] = useState(false);

  const [showNewDirectModal, setShowNewDirectModal] = useState(false);
  const [directSearch, setDirectSearch] = useState('');
  const [startingDirectUid, setStartingDirectUid] = useState<string | null>(null);

  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupCourseId, setGroupCourseId] = useState('');
  const [groupSelectedUids, setGroupSelectedUids] = useState<string[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const myUid = user?.uid || '';
  const isStaffUser = actualRole !== null && actualRole !== 'STUDENT';
  const isAdminUser = actualRole === 'ADMIN';

  const directoryByUid = useMemo(() => {
    const map = new Map<string, DirectoryUser>();
    directoryUsers.forEach((d) => map.set(d.uid, d));
    return map;
  }, [directoryUsers]);

  // Filter conversations by type + search
  const filteredConversations = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return conversations.filter((conv) => {
      if (filterTab !== 'ALL' && conv.type !== filterTab) return false;
      if (!q) return true;
      const meta = getConversationDisplayMeta(conv, myUid, directoryByUid);
      return (
        meta.title.toLowerCase().includes(q) ||
        meta.subtitle.toLowerCase().includes(q) ||
        (conv.lastMessageText || '').toLowerCase().includes(q) ||
        (conv.courseName || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, filterTab, searchTerm, myUid, directoryByUid]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId]
  );

  // Auto-select first conversation on desktop if none selected
  useEffect(() => {
    if (!selectedConvId && filteredConversations.length > 0 && window.innerWidth >= 1024) {
      setSelectedConvId(filteredConversations[0].id);
    }
  }, [filteredConversations, selectedConvId]);

  // Subscribe to real-time messages for activeConversation
  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    const q = query(
      collection(db, 'conversations', selectedConvId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as InternalMessage);
        setMessages(rows);
        setMessagesLoading(false);
      },
      () => {
        setMessages([]);
        setMessagesLoading(false);
      }
    );
    return () => unsub();
  }, [selectedConvId]);

  // Mark conversation as read when opened or when new message arrives
  useEffect(() => {
    if (activeConversation && myUid && !activeConversation.readByUids.includes(myUid)) {
      void markConversationRead(activeConversation, myUid);
    }
  }, [activeConversation, myUid, messages.length]);

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedConvId]);

  // Users allowed for a new 1:1 Direct Message according to Admin policy
  const eligibleDirectUsers = useMemo(() => {
    const q = directSearch.trim().toLowerCase();
    return directoryUsers.filter((u) => {
      if (u.uid === myUid || !u.isActive) return false;
      if (actualRole === 'STUDENT') {
        if (u.role === 'INSTRUCTOR' && !communicationPolicy.allowStudentToInstructor) return false;
        if (u.role === 'ADMIN' && !communicationPolicy.allowStudentToAdmin) return false;
        if (u.role === 'STUDENT' && !communicationPolicy.allowStudentToStudent) return false;
        if (u.role === 'ACCOUNTANT' || u.role === 'GENERAL_STAFF') {
          if (!communicationPolicy.allowStudentToAdmin) return false;
        }
      }
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q) ||
        (u.courseName || '').toLowerCase().includes(q) ||
        (u.studentCode || '').toLowerCase().includes(q)
      );
    });
  }, [directoryUsers, myUid, actualRole, communicationPolicy, directSearch]);

  const handleStartDirect = async (target: DirectoryUser) => {
    if (!profile || !actualRole) return;
    setStartingDirectUid(target.uid);
    try {
      const convId = await startOrOpenDirectConversation(
        { uid: profile.uid, fullName: profile.fullName, role: actualRole },
        target
      );
      setSelectedConvId(convId);
      setShowNewDirectModal(false);
      setDirectSearch('');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to start conversation.');
    } finally {
      setStartingDirectUid(null);
    }
  };

  const applyGroupPreset = (preset: 'INSTRUCTORS' | 'ACCOUNTING' | 'ADMIN' | 'STAFF' | 'COURSE', courseIdVal?: string) => {
    let matched: DirectoryUser[] = [];
    if (preset === 'INSTRUCTORS') {
      matched = directoryUsers.filter((u) => u.isActive && u.role === 'INSTRUCTOR');
      setGroupTitle('All ZACMA Instructors');
      setGroupDesc('Teaching faculty coordination and schedule updates.');
    } else if (preset === 'ACCOUNTING') {
      matched = directoryUsers.filter(
        (u) => u.isActive && (u.role === 'ACCOUNTANT' || u.role === 'ADMIN')
      );
      setGroupTitle('Accounting & Finance Department');
      setGroupDesc('Fee collection, payment approvals, and reconciliation.');
    } else if (preset === 'ADMIN') {
      matched = directoryUsers.filter((u) => u.isActive && u.role === 'ADMIN');
      setGroupTitle('Administration Desk');
      setGroupDesc('Executive management and operational governance.');
    } else if (preset === 'STAFF') {
      matched = directoryUsers.filter((u) => u.isActive && u.role !== 'STUDENT');
      setGroupTitle('All ZACMA Staff');
      setGroupDesc('Institute-wide staff coordination.');
    } else if (preset === 'COURSE' && courseIdVal) {
      const course = courses.find((c) => c.id === courseIdVal);
      matched = directoryUsers.filter(
        (u) =>
          u.isActive &&
          (u.courseId === courseIdVal || (course?.instructorId && u.uid === course.instructorId))
      );
      if (course) {
        setGroupTitle(`${course.name} — Class Group`);
        setGroupDesc(`Course channel for ${course.code} (${course.schedule}).`);
      }
    }
    setGroupSelectedUids(Array.from(new Set(matched.map((m) => m.uid).filter((id) => id !== myUid))));
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !actualRole) return;
    if (!groupTitle.trim()) {
      pushToast('error', 'Please enter a group name.');
      return;
    }
    setCreatingGroup(true);
    try {
      const members = directoryUsers
        .filter((u) => groupSelectedUids.includes(u.uid))
        .map((u) => ({ uid: u.uid, fullName: u.fullName, role: u.role }));
      const selectedCourse = courses.find((c) => c.id === groupCourseId);
      const convId = await createGroupConversation(
        {
          title: groupTitle,
          description: groupDesc,
          members,
          course: selectedCourse,
        },
        { uid: profile.uid, fullName: profile.fullName, role: actualRole }
      );
      setSelectedConvId(convId);
      setShowNewGroupModal(false);
      setGroupTitle('');
      setGroupDesc('');
      setGroupCourseId('');
      setGroupSelectedUids([]);
      pushToast('success', 'Group conversation created.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAttachmentPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const payload = await validateAndReadAttachment(file);
      setAttachment(payload);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Invalid attachment.');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || !profile || !actualRole) return;
    if (!draftText.trim() && !attachment) return;
    setSending(true);
    try {
      await sendInternalMessage(
        {
          conversation: activeConversation,
          body: draftText,
          replyTo,
          attachment,
        },
        { uid: profile.uid, fullName: profile.fullName, role: actualRole }
      );
      setDraftText('');
      setReplyTo(null);
      setAttachment(null);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  if (!communicationPolicy.internalMessagingEnabled && !isAdminUser) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto my-8">
        <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900">Internal Messaging Paused</h3>
        <p className="text-sm text-slate-500 mt-1">
          The ZACMA system administrator has temporarily paused internal messaging. Please check
          back later or review your Portal Notifications.
        </p>
      </div>
    );
  }

  const canReplyInActive =
    Boolean(activeConversation) &&
    (activeConversation?.type !== 'BROADCAST' || isAdminUser);

  const activeMeta = activeConversation
    ? getConversationDisplayMeta(activeConversation, myUid, directoryByUid)
    : null;

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-5'}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#172DEB]" />
            <span>ZACMA Internal Messaging</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time direct chats, course groups, and official broadcasts with role-isolated privacy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewDirectModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] transition shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>New Message</span>
          </button>

          {isStaffUser && (
            <button
              type="button"
              onClick={() => setShowNewGroupModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition"
            >
              <Users className="w-3.5 h-3.5 text-[#172DEB]" />
              <span>New Group</span>
            </button>
          )}

          {isAdminUser && onOpenAdminBroadcast && (
            <button
              type="button"
              onClick={onOpenAdminBroadcast}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#E51B23] text-white hover:bg-[#c8161d] transition shadow-xs"
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>Admin Broadcast</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs grid grid-cols-1 lg:grid-cols-12 min-h-[580px] max-h-[74vh]">
        {/* Left: Conversation List */}
        <aside
          className={`lg:col-span-4 border-r border-slate-200 flex flex-col bg-[#F5F7FC]/60 min-h-0 ${
            selectedConvId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search conversations or messages..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB]"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
              {(['ALL', 'DIRECT', 'GROUP', 'BROADCAST'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`py-1 rounded-md transition ${
                    filterTab === tab
                      ? 'bg-white text-[#172DEB] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'ALL'
                    ? 'All'
                    : tab === 'DIRECT'
                    ? 'Direct'
                    : tab === 'GROUP'
                    ? 'Groups'
                    : 'Alerts'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No conversations yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Start a direct message{isStaffUser ? ' or create a department/course group' : ''}.
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const meta = getConversationDisplayMeta(conv, myUid, directoryByUid);
                const isSelected = conv.id === selectedConvId;
                const isUnread = Boolean(conv.lastMessageAt) && !conv.readByUids.includes(myUid);

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left px-3.5 py-3 flex items-start gap-3 transition ${
                      isSelected
                        ? 'bg-[#172DEB]/8 border-r-2 border-[#172DEB]'
                        : 'bg-white/60 hover:bg-white'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${
                          conv.type === 'BROADCAST'
                            ? 'bg-[#E51B23] text-white'
                            : conv.type === 'GROUP'
                            ? 'bg-[#111827] text-white'
                            : 'bg-[#172DEB] text-white'
                        }`}
                      >
                        {conv.type === 'BROADCAST' ? (
                          <Megaphone className="w-4 h-4" />
                        ) : conv.type === 'GROUP' ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          meta.initials
                        )}
                      </div>
                      {meta.online && (
                        <span
                          title="Recently active"
                          className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white absolute -bottom-0.5 -right-0.5"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs truncate ${
                            isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                          }`}
                        >
                          {meta.title}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                          {formatMessageTimestamp(conv.lastMessageAt || conv.updatedAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#172DEB] font-medium truncate">
                        {meta.subtitle}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p
                          className={`text-xs truncate ${
                            isUnread ? 'text-slate-900 font-medium' : 'text-slate-500'
                          }`}
                        >
                          {conv.lastMessageText || 'No messages yet'}
                        </p>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-[#E51B23] shrink-0" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Active Message Stream */}
        <section
          className={`lg:col-span-8 flex flex-col bg-white min-h-0 ${
            selectedConvId ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!activeConversation || !activeMeta ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F5F7FC]/40">
              <div className="w-14 h-14 rounded-2xl bg-[#172DEB]/10 text-[#172DEB] flex items-center justify-center mb-3">
                <MessageSquare className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Select a Conversation</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Choose a direct thread, course group, or announcement channel from the left — or
                start a new conversation.
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedConvId(null)}
                    className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      activeConversation.type === 'BROADCAST'
                        ? 'bg-[#E51B23] text-white'
                        : activeConversation.type === 'GROUP'
                        ? 'bg-[#111827] text-white'
                        : 'bg-[#172DEB] text-white'
                    }`}
                  >
                    {activeConversation.type === 'BROADCAST' ? (
                      <Megaphone className="w-4 h-4" />
                    ) : activeConversation.type === 'GROUP' ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      activeMeta.initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {activeMeta.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate">
                      {activeMeta.subtitle}
                      {activeMeta.online ? ' · Online recently' : ''}
                    </p>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#172DEB]" />
                  <span>Role-isolated channel</span>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7FC]/50">
                {messagesLoading ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No messages yet. Say hello to start the conversation.
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMine = msg.senderId === myUid;
                    const prevDate = idx > 0 ? messages[idx - 1].createdAt.slice(0, 10) : '';
                    const curDate = msg.createdAt.slice(0, 10);
                    const showDateDivider = curDate !== prevDate;
                    const dualDay = showDateDivider ? formatDualDate(msg.createdAt, true) : null;
                    const isSeenByOthers =
                      activeConversation.readByUids.filter((u) => u !== myUid).length > 0;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateDivider && dualDay && (
                          <div className="flex items-center justify-center my-2">
                            <span className="px-3 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-medium text-slate-600 tabular-nums">
                              {dualDay.gregorian} · {dualDay.ethiopian} E.C.
                            </span>
                          </div>
                        )}

                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[82%] sm:max-w-[72%] rounded-xl px-3.5 py-2.5 shadow-xs group relative ${
                              isMine
                                ? 'bg-[#172DEB] text-white rounded-br-xs'
                                : 'bg-white border border-slate-200 text-slate-900 rounded-bl-xs'
                            }`}
                          >
                            {!isMine && (
                              <div className="flex items-center justify-between gap-3 mb-1">
                                <span className="text-[11px] font-bold text-[#172DEB]">
                                  {msg.senderName}
                                </span>
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                  {ROLE_LABELS[msg.senderRole]}
                                </span>
                              </div>
                            )}

                            {msg.replyToPreview && (
                              <div
                                className={`mb-2 px-2.5 py-1.5 rounded-lg text-[11px] border-l-2 ${
                                  isMine
                                    ? 'bg-white/15 border-white/60 text-white/90'
                                    : 'bg-slate-50 border-[#172DEB] text-slate-600'
                                }`}
                              >
                                <div className="font-semibold text-[10px]">
                                  Replying to {msg.replyToSender || 'message'}
                                </div>
                                <div className="truncate">{msg.replyToPreview}</div>
                              </div>
                            )}

                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {msg.body}
                            </p>

                            {msg.attachmentDataUrl && msg.attachmentName && (
                              <div
                                className={`mt-2 rounded-lg p-2 border ${
                                  isMine
                                    ? 'bg-white/10 border-white/25'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                {msg.attachmentType?.startsWith('image/') && (
                                  <img
                                    src={msg.attachmentDataUrl}
                                    alt={msg.attachmentName}
                                    className="max-h-48 rounded-md mb-1.5 object-contain"
                                  />
                                )}
                                <a
                                  href={msg.attachmentDataUrl}
                                  download={msg.attachmentName}
                                  className={`flex items-center justify-between gap-2 text-xs font-medium ${
                                    isMine
                                      ? 'text-white hover:underline'
                                      : 'text-[#172DEB] hover:underline'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5 truncate">
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{msg.attachmentName}</span>
                                  </span>
                                  <Download className="w-3.5 h-3.5 shrink-0" />
                                </a>
                              </div>
                            )}

                            <div
                              className={`mt-1.5 flex items-center justify-between gap-3 text-[10px] tabular-nums ${
                                isMine ? 'text-white/75' : 'text-slate-400'
                              }`}
                            >
                              <span>{formatMessageTimestamp(msg.createdAt)}</span>
                              <div className="flex items-center gap-2">
                                {canReplyInActive && (
                                  <button
                                    type="button"
                                    onClick={() => setReplyTo(msg)}
                                    className={`opacity-80 hover:opacity-100 inline-flex items-center gap-0.5 ${
                                      isMine ? 'text-white' : 'text-slate-500'
                                    }`}
                                    title="Reply to this message"
                                  >
                                    <CornerUpLeft className="w-3 h-3" />
                                    <span>Reply</span>
                                  </button>
                                )}
                                {isMine &&
                                  (isSeenByOthers ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5 text-white/70" />
                                  ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              {canReplyInActive ? (
                <form
                  onSubmit={handleSend}
                  className="p-3 border-t border-slate-200 bg-white space-y-2"
                >
                  {replyTo && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#F5F7FC] border border-slate-200 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-[#172DEB]">
                          Replying to {replyTo.senderName}:
                        </span>{' '}
                        <span className="text-slate-600 truncate">{replyTo.body}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {attachment && (
                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-[#172DEB]">
                      <div className="flex items-center gap-1.5 truncate font-medium">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{attachment.name}</span>
                        <span className="text-[11px] text-slate-500">
                          ({Math.ceil(attachment.size / 1024)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="text-slate-500 hover:text-[#E51B23]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {communicationPolicy.allowAttachments && (
                      <>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
                          onChange={handleAttachmentPick}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-[#172DEB] hover:border-[#172DEB] transition shrink-0"
                          title="Attach file (PDF, image, doc — max 420 KB)"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <textarea
                      rows={1}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSend(e);
                        }
                      }}
                      placeholder={`Message ${activeMeta.title}... (Enter to send, Shift+Enter for new line)`}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB] resize-none"
                    />

                    <button
                      type="submit"
                      disabled={sending || (!draftText.trim() && !attachment)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#172DEB] text-white text-xs font-semibold hover:bg-[#263FEF] disabled:opacity-50 transition shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sending ? 'Sending...' : 'Send'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#E51B23] shrink-0" />
                  <span>
                    This is an official ZACMA Administration broadcast channel. Only administrators
                    can post updates here.
                  </span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Modal: New Direct Message */}
      {showNewDirectModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Start Direct Message</h3>
                <p className="text-xs text-slate-500">
                  Select a ZACMA member permitted for your role ({effectiveRole}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewDirectModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={directSearch}
                  onChange={(e) => setDirectSearch(e.target.value)}
                  placeholder="Search by name, role, course, or student ID..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#172DEB]/20 focus:border-[#172DEB]"
                />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {eligibleDirectUsers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No matching active users found. Users appear here automatically once they sign
                    in.
                  </div>
                ) : (
                  eligibleDirectUsers.map((u) => {
                    const online = isUserRecentlyOnline(u.lastSeenAt);
                    return (
                      <button
                        key={u.uid}
                        type="button"
                        disabled={startingDirectUid === u.uid}
                        onClick={() => void handleStartDirect(u)}
                        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-[#F5F7FC] transition text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-full bg-[#172DEB] text-white text-xs font-bold flex items-center justify-center">
                              {getInitials(u.fullName)}
                            </div>
                            {online && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white absolute -bottom-0.5 -right-0.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {u.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {ROLE_LABELS[u.role]}
                              {u.courseName ? ` · ${u.courseName}` : ''}
                              {u.studentCode ? ` (${u.studentCode})` : ''}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#172DEB] shrink-0">
                          {startingDirectUid === u.uid ? 'Opening...' : 'Chat'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Group Conversation (Staff & Admin) */}
      {showNewGroupModal && isStaffUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create Group Channel</h3>
                <p className="text-xs text-slate-500">
                  Use department/course presets or select custom ZACMA members.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewGroupModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-5 space-y-4 overflow-y-auto">
              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">Quick Department Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['INSTRUCTORS', 'All Instructors'],
                      ['ACCOUNTING', 'Accounting Dept'],
                      ['ADMIN', 'Admin Desk'],
                      ['STAFF', 'All Staff'],
                    ] as const
                  ).map(([preset, label]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyGroupPreset(preset)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#172DEB] hover:text-[#172DEB] transition"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link to Training Course (Optional)
                </label>
                <select
                  value={groupCourseId}
                  onChange={(e) => {
                    setGroupCourseId(e.target.value);
                    if (e.target.value) applyGroupPreset('COURSE', e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">General / Department Group</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Group Name <span className="text-[#E51B23]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="e.g., Web Development Batch 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  placeholder="Purpose of this group channel..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Select Members ({groupSelectedUids.length} selected + you)
                  </span>
                </div>
                <input
                  type="text"
                  value={groupMemberSearch}
                  onChange={(e) => setGroupMemberSearch(e.target.value)}
                  placeholder="Filter members..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
                />
                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {directoryUsers
                    .filter(
                      (u) =>
                        u.uid !== myUid &&
                        u.isActive &&
                        (!groupMemberSearch.trim() ||
                          u.fullName.toLowerCase().includes(groupMemberSearch.toLowerCase()) ||
                          ROLE_LABELS[u.role]
                            .toLowerCase()
                            .includes(groupMemberSearch.toLowerCase()))
                    )
                    .map((u) => {
                      const checked = groupSelectedUids.includes(u.uid);
                      return (
                        <label
                          key={u.uid}
                          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setGroupSelectedUids((prev) =>
                                  checked ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                                )
                              }
                              className="rounded border-slate-300 text-[#172DEB]"
                            />
                            <span className="font-medium text-slate-800 truncate">
                              {u.fullName}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 shrink-0">
                            {ROLE_LABELS[u.role]}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewGroupModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#172DEB] text-white hover:bg-[#263FEF] disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingGroup ? 'Creating...' : 'Create Group'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
