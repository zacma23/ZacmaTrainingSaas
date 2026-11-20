import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Check,
  CheckSquare,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { usePortal } from '../context/PortalContext';
import { ZacmaLogo } from './ZacmaLogo';

type PortalTab = 'STAFF' | 'STUDENT';
type AuthMode = 'SIGN_IN' | 'SIGN_UP' | 'RESET';

export function LoginScreen() {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    clearAuthError,
    authLoading,
    authError,
    sessionExpiredNotice,
    clearSessionExpiredNotice,
  } = usePortal();

  const [portalTab, setPortalTab] = useState<PortalTab>('STAFF');
  const [authMode, setAuthMode] = useState<AuthMode>('SIGN_IN');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{
    token: string;
    email: string;
    tenantName: string;
  } | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('invite')?.trim() || '';
      const invEmail = params.get('email')?.trim() || '';
      const tenantName = params.get('tenant')?.trim() || '';
      if (token && invEmail) {
        setInviteInfo({ token, email: invEmail, tenantName: tenantName || 'Your Training Institute' });
        setPortalTab('STAFF');
        setAuthMode('SIGN_UP');
        setEmail(invEmail);
      }
    } catch {
      // Ignore malformed search params
    }
  }, []);

  const isUnauthorizedDomain = Boolean(authError?.startsWith('UNAUTHORIZED_DOMAIN|'));
  const [, unauthorizedHost = '', unauthorizedProjectId = ''] = isUnauthorizedDomain
    ? (authError || '').split('|')
    : [];

  const isEmailProviderDisabled = Boolean(authError?.startsWith('EMAIL_PASSWORD_DISABLED|'));
  const [, disabledProjectId = ''] = isEmailProviderDisabled
    ? (authError || '').split('|')
    : [];

  const handleCopyHost = () => {
    if (!unauthorizedHost) return;
    void navigator.clipboard?.writeText(unauthorizedHost);
    setCopiedHost(true);
    window.setTimeout(() => setCopiedHost(false), 2000);
  };

  const switchPortalTab = (next: PortalTab) => {
    setPortalTab(next);
    setLocalError(null);
    setResetSent(false);
    clearAuthError();
  };

  const switchAuthMode = (next: AuthMode) => {
    setAuthMode(next);
    setLocalError(null);
    setResetSent(false);
    clearAuthError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSent(false);

    if (authMode === 'RESET') {
      setSubmitting(true);
      const ok = await sendPasswordReset(email);
      setSubmitting(false);
      if (ok) setResetSent(true);
      return;
    }

    if (authMode === 'SIGN_UP') {
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match. Please re-enter both fields.');
        return;
      }
      setSubmitting(true);
      await signUpWithEmail({
        fullName,
        email,
        password,
        portalType: portalTab,
      });
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    await signInWithEmail(email, password);
    setSubmitting(false);
  };

  const busy = authLoading || submitting;
  const activeError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Institutional Brand Rail */}
      <div className="lg:col-span-7 bg-slate-900 text-white relative flex flex-col justify-between overflow-hidden">
        <div className="h-1.5 w-full zacma-brand-stripe shrink-0" />
        <div className="p-8 sm:p-12 lg:p-16 flex-1 flex flex-col justify-between">
          <div>
            <div className="mb-12">
              <ZacmaLogo
                variant="lockup"
                theme="dark"
                size="lg"
                framed
                subtitle="Student Fee Management & Institutional Accounting Portal"
              />
            </div>

            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 mb-4">
              <span className="w-6 h-0.5 bg-blue-500 rounded-full" />
              <span>Enterprise Educational Finance Platform</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-white max-w-xl leading-tight mb-5">
              Student Fee Management &amp; Institutional Accounting Portal
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-lg leading-relaxed mb-10">
              Centralized admissions approval, ETB tuition installment tracking, maker-checker payment verification, official receipt issuance, automated fee reminders, and daily class attendance for ZACMA Technology &amp; Training Institute.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Admin Control</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Approves student registrations and fee submissions, configures courses, monitors cash flow, and audits all ledger activity.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold mb-2">
                  <Calculator className="w-4 h-4" />
                  <span>Accountant Desk</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Registers students with installment schedules, records fee receipts for verification, and prints official approved receipts.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-red-400 text-xs font-semibold mb-2">
                  <CheckSquare className="w-4 h-4" />
                  <span>Instructor &amp; Student</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Instructors track daily attendance with financial isolation, while Students view their own deadlines, balances, and approved receipts.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-10 mt-10 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-500" />
              <span>ZACMA Technology &amp; Training Institute · Addis Ababa</span>
            </div>
            <span className="font-mono text-slate-400">Currency: ETB</span>
          </div>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-md">
          {/* Compact Official Brand Mark on Authentication Side */}
          <div className="flex items-center justify-between mb-6 pb-5 border-b border-slate-200">
            <ZacmaLogo variant="lockup" theme="light" size="sm" subtitle="Official Portal Sign-In" />
            <span className="text-[11px] font-mono font-semibold text-slate-500">ETB</span>
          </div>
          {/* Portal Role Switcher: Staff vs Student */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-6 border border-slate-200">
            <button
              type="button"
              onClick={() => switchPortalTab('STAFF')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                portalTab === 'STAFF'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Staff Portal</span>
            </button>
            <button
              type="button"
              onClick={() => switchPortalTab('STUDENT')}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                portalTab === 'STUDENT'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Student Portal</span>
            </button>
          </div>

          <div className="mb-5">
            <p className="text-xs font-semibold text-blue-700 mb-1">
              {portalTab === 'STAFF'
                ? 'ZACMA Staff Access · Admin, Accountant, Instructor & General Staff'
                : 'ZACMA Student Self-Service Portal'}
            </p>
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-1.5">
              {authMode === 'SIGN_IN'
                ? portalTab === 'STAFF'
                  ? 'Staff Sign In'
                  : 'Student Sign In'
                : authMode === 'SIGN_UP'
                ? portalTab === 'STAFF'
                  ? 'Create Instructor Account'
                  : 'Create Student Account'
                : 'Reset Your Password'}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {authMode === 'RESET'
                ? 'Enter the email address associated with your ZACMA account to receive a password reset link.'
                : authMode === 'SIGN_UP'
                ? 'Self-registration is available for Instructors and Students only. Admin, Accountant, and General Staff roles are assigned by a ZACMA Admin.'
                : portalTab === 'STAFF'
                ? 'Sign in with your institutional email & password or Google account. Role permissions are enforced automatically.'
                : 'Sign in with your student email & password or Google account to view your tuition schedule, reminders, and official receipts.'}
            </p>
          </div>

          {/* Auth Mode Tabs (Sign In vs Create Account) */}
          {authMode !== 'RESET' && (
            <div className="flex items-center gap-5 border-b border-slate-200 mb-5">
              <button
                type="button"
                onClick={() => switchAuthMode('SIGN_IN')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  authMode === 'SIGN_IN'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchAuthMode('SIGN_UP')}
                className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  authMode === 'SIGN_UP'
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Institute Administrator Onboarding Invitation Banner */}
          {inviteInfo && (
            <div className="mb-5 p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-blue-900">
                <Building2 className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Institute Portal Invitation — {inviteInfo.tenantName}</span>
              </div>
              <p className="text-[11px] text-blue-900/90 leading-relaxed">
                You have been invited by ZACMA Platform Operations to activate your account for{' '}
                <strong>{inviteInfo.tenantName}</strong>. Create a password below or sign in with Google using{' '}
                <strong className="font-mono">{inviteInfo.email}</strong> to claim your assigned role automatically.
              </p>
            </div>
          )}

          {/* Inactivity Session Expiration Notice */}
          {sessionExpiredNotice && (
            <div className="mb-5 p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start justify-between gap-2">
              <p className="leading-relaxed">
                <strong className="font-bold">Session Expired:</strong> {sessionExpiredNotice}
              </p>
              <button
                type="button"
                onClick={clearSessionExpiredNotice}
                className="text-amber-800 hover:text-amber-950 font-semibold shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Error & Diagnostic Banners */}
          {activeError && (
            isUnauthorizedDomain ? (
              <div className="mb-5 p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 space-y-2.5">
                <p className="font-bold text-red-800">
                  Firebase Auth: Unauthorized Domain ({unauthorizedHost})
                </p>
                <p className="text-red-800 leading-relaxed">
                  Google Sign-In rejected this hostname because it is not listed under{' '}
                  <strong>Authentication &rarr; Settings &rarr; Authorized domains</strong> in the{' '}
                  <strong>active</strong> Firebase project:
                </p>
                <div className="bg-white border border-red-200 rounded-md p-2.5 space-y-1.5 font-mono text-[11px] text-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      Domain: <strong>{unauthorizedHost}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyHost}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-sans font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded shrink-0"
                    >
                      {copiedHost ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                      {copiedHost ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="truncate">
                    Active Firebase Project: <strong>{unauthorizedProjectId}</strong>
                  </p>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-red-800 leading-snug">
                  <li>
                    Add the domain in project <strong>{unauthorizedProjectId}</strong> without{' '}
                    <code>https://</code> or trailing slashes.
                  </li>
                  <li>
                    You can also sign in right now using <strong>Email &amp; Password</strong> above.
                  </li>
                </ul>
              </div>
            ) : isEmailProviderDisabled ? (
              <div className="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
                <p className="font-bold text-amber-900">
                  Enable Email/Password Sign-In in Firebase Console
                </p>
                <p className="leading-relaxed">
                  Email/Password authentication is currently turned off in Firebase project{' '}
                  <strong className="font-mono">{disabledProjectId}</strong>. Enable it in 2 clicks:
                </p>
                <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                  <li>Open Firebase Console &rarr; Authentication &rarr; Sign-in method.</li>
                  <li>Click <strong>Add new provider &rarr; Email/Password</strong>, toggle Enable, and click <strong>Save</strong>.</li>
                </ol>
                <a
                  href={`https://console.firebase.google.com/project/${disabledProjectId}/authentication/providers`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded-md bg-amber-900 hover:bg-amber-950 text-white text-[11px] font-semibold transition-colors"
                >
                  <span>Open Firebase Auth Providers</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {activeError}
              </div>
            )
          )}

          {resetSent && (
            <div className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              Password reset instructions have been sent to <strong>{email}</strong>. Please check your inbox and spam folder.
            </div>
          )}

          {/* Email & Password Form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            {authMode === 'SIGN_UP' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={portalTab === 'STUDENT' ? 'e.g., Dawit Bekele' : 'e.g., Selamawit Tadesse'}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={portalTab === 'STUDENT' ? 'student@example.com' : 'name@zacma.edu.et'}
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                />
              </div>
            </div>

            {authMode !== 'RESET' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  {authMode === 'SIGN_IN' && (
                    <button
                      type="button"
                      onClick={() => switchAuthMode('RESET')}
                      className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete={authMode === 'SIGN_UP' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={authMode === 'SIGN_UP' ? 'Minimum 6 characters' : 'Enter your password'}
                    className="w-full pl-9 pr-10 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {authMode === 'SIGN_UP' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700"
                    />
                  </div>
                </div>

                {portalTab === 'STAFF' ? (
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
                    New self-registered staff accounts are created as <strong>Instructor</strong> (attendance &amp; courses only). <strong>Admin</strong>, <strong>Accountant</strong>, and <strong>General Staff</strong> roles are assigned exclusively by a ZACMA Administrator in Staff &amp; Roles.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
                    New Student Portal accounts are strictly isolated. After creating your account, an Admin links your email to your official ZACMA Student ID (<code>ZAC-...</code>) in Staff &amp; Roles.
                  </p>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {authMode === 'SIGN_IN'
                  ? submitting
                    ? 'Signing in...'
                    : portalTab === 'STAFF'
                    ? 'Sign in to Staff Portal'
                    : 'Sign in to Student Portal'
                  : authMode === 'SIGN_UP'
                  ? submitting
                    ? 'Creating account...'
                    : portalTab === 'STAFF'
                    ? 'Create Instructor Account'
                    : 'Create Student Account'
                  : submitting
                  ? 'Sending link...'
                  : 'Send Password Reset Link'}
              </span>
            </button>

            {authMode === 'RESET' && (
              <button
                type="button"
                onClick={() => switchAuthMode('SIGN_IN')}
                className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Back to Sign In
              </button>
            )}
          </form>

          {/* Divider + Google Sign-In */}
          {authMode !== 'RESET' && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase">
                  <span className="bg-white px-3 text-slate-400 font-semibold tracking-wider">
                    or continue with
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void signInWithGoogle(portalTab)}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.27v3.09A12 12 0 0 0 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.29A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4.01-3.09Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4.01 3.09c.95-2.84 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>
                  {authLoading
                    ? 'Signing in...'
                    : portalTab === 'STAFF'
                    ? 'Continue with Google (Staff)'
                    : 'Continue with Google (Student)'}
                </span>
              </button>
            </>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200 flex items-start gap-2.5 text-xs text-slate-500">
            <Lock className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Protected by database-enforced Role-Based Access Control (Admin, Accountant, Instructor, General Staff, Student) and immutable financial audit logging.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
