-- =============================================================================
-- Migration 0006: Enterprise Financial Adjustments, Granular Permissions &
-- Session Security Audit Tables (Strictly Additive & Idempotent)
-- Powered by ZACMA Technology
-- =============================================================================

-- 1. Extend profiles with granular General Staff module allowlist, Accountant report export permission & last login timestamp
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS allowed_modules text[],
  ADD COLUMN IF NOT EXISTS can_export_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- 2. Immutable Financial Adjustments & Refunds Ledger (never delete approved payments)
CREATE TABLE IF NOT EXISTS public.financial_adjustments (
  id text PRIMARY KEY,
  adjustment_ref text NOT NULL UNIQUE,
  enrollment_id text NOT NULL,
  student_id text NOT NULL,
  student_code text NOT NULL,
  student_name text NOT NULL,
  course_id text NOT NULL,
  course_name text NOT NULL,
  payment_id text,
  type text NOT NULL CHECK (type IN ('REFUND', 'REVERSAL', 'SCHOLARSHIP_DISCOUNT', 'FEE_ADJUSTMENT')),
  amount_etb numeric(12, 2) NOT NULL CHECK (amount_etb > 0),
  effective_date date NOT NULL,
  reason text NOT NULL,
  approved_by text NOT NULL,
  approved_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_adj_student_id ON public.financial_adjustments (student_id);
CREATE INDEX IF NOT EXISTS idx_fin_adj_enrollment_id ON public.financial_adjustments (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_fin_adj_effective_date ON public.financial_adjustments (effective_date DESC);

-- 3. Institutional Security & Session Timeout Configuration
CREATE TABLE IF NOT EXISTS public.security_config (
  id text PRIMARY KEY DEFAULT 'default',
  admin_timeout_minutes integer NOT NULL DEFAULT 10 CHECK (admin_timeout_minutes BETWEEN 1 AND 120),
  user_timeout_minutes integer NOT NULL DEFAULT 15 CHECK (user_timeout_minutes BETWEEN 1 AND 120),
  warning_before_seconds integer NOT NULL DEFAULT 60 CHECK (warning_before_seconds BETWEEN 15 AND 300),
  max_failed_logins integer NOT NULL DEFAULT 5 CHECK (max_failed_logins BETWEEN 3 AND 20),
  lockout_minutes integer NOT NULL DEFAULT 15 CHECK (lockout_minutes BETWEEN 1 AND 120),
  enforce_audit_on_exports boolean NOT NULL DEFAULT true,
  updated_by text,
  updated_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.security_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 4. Immutable Login & Session Lifecycle History
CREATE TABLE IF NOT EXISTS public.login_history (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF', 'STUDENT')),
  event_type text NOT NULL CHECK (event_type IN ('LOGIN', 'LOGOUT', 'SESSION_EXPIRED', 'FAILED_LOGIN', 'LOCKOUT')),
  auth_method text NOT NULL CHECK (auth_method IN ('EMAIL_PASSWORD', 'GOOGLE', 'SYSTEM')),
  user_agent text,
  session_id text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.login_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON public.login_history (created_at DESC);

-- 5. Enable Row Level Security (strict zero-trust alignment with Firestore rules)
ALTER TABLE public.financial_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- 6. Record migration version idempotently
INSERT INTO public.schema_migrations (version, name, applied_by, status)
VALUES ('0006', 'enterprise_finance_adjustments_and_security', 'system', 'APPLIED')
ON CONFLICT (version) DO NOTHING;
