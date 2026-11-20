-- ============================================================================
-- ZACMA TECHNOLOGY & TRAINING INSTITUTE
-- Migration 0001: Initial Normalized Student Fee & Accounting Schema (Idempotent)
-- Safe to re-run without altering or dropping existing tables or records.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Roles
CREATE TABLE IF NOT EXISTS public.roles (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Profiles (Staff & Portal Users linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'INSTRUCTOR' CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF', 'STUDENT')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Courses
CREATE TABLE IF NOT EXISTS public.courses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks > 0),
  fee_etb NUMERIC(12, 2) NOT NULL CHECK (fee_etb >= 0),
  schedule TEXT NOT NULL,
  instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  instructor_name TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Payment Plans
CREATE TABLE IF NOT EXISTS public.payment_plans (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL CHECK (code IN ('FULL', 'MONTHLY', 'TWO_MONTH', 'THREE_MONTH', 'SIX_MONTH', 'CUSTOM')),
  name TEXT NOT NULL,
  installment_count INTEGER NOT NULL CHECK (installment_count >= 1),
  interval_days INTEGER NOT NULL DEFAULT 30 CHECK (interval_days >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. Students
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  student_code TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
  phone TEXT NOT NULL,
  alt_phone TEXT,
  address TEXT NOT NULL,
  photo_url TEXT,
  course_id TEXT NOT NULL REFERENCES public.courses(id),
  course_name TEXT NOT NULL,
  enrollment_date DATE NOT NULL,
  course_fee_etb NUMERIC(12, 2) NOT NULL CHECK (course_fee_etb >= 0),
  payment_plan_code TEXT NOT NULL,
  registration_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (registration_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  registered_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Enrollments
CREATE TABLE IF NOT EXISTS public.enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES public.courses(id),
  course_name TEXT NOT NULL,
  instructor_id UUID REFERENCES public.profiles(id),
  payment_plan_code TEXT NOT NULL,
  payment_plan_name TEXT,
  enrollment_date DATE NOT NULL,
  agreed_fee_etb NUMERIC(12, 2) NOT NULL CHECK (agreed_fee_etb >= 0),
  approved_paid_etb NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (approved_paid_etb >= 0),
  remaining_balance_etb NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (remaining_balance_etb >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED')),
  registered_by UUID REFERENCES public.profiles(id),
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Payment Installments
CREATE TABLE IF NOT EXISTS public.payment_installments (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES public.courses(id),
  course_name TEXT NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  due_date DATE NOT NULL,
  amount_due_etb NUMERIC(12, 2) NOT NULL CHECK (amount_due_etb >= 0),
  amount_paid_etb NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid_etb >= 0),
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Payments (Maker-Checker enforced: unique transaction_ref, only APPROVED counts toward official income)
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  transaction_ref TEXT UNIQUE NOT NULL,
  enrollment_id TEXT NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES public.courses(id),
  course_name TEXT NOT NULL,
  amount_etb NUMERIC(12, 2) NOT NULL CHECK (amount_etb > 0),
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'CBE Birr', 'Telebirr', 'Bank Transfer', 'Check')),
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  recorded_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approved_by UUID REFERENCES public.profiles(id),
  approved_by_name TEXT,
  approval_date DATE,
  rejection_reason TEXT,
  receipt_id TEXT,
  receipt_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Official Receipts (Issued ONLY upon Admin payment approval; immutable)
CREATE TABLE IF NOT EXISTS public.receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  payment_id TEXT UNIQUE NOT NULL REFERENCES public.payments(id),
  transaction_ref TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES public.students(id),
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_phone TEXT,
  course_name TEXT NOT NULL,
  previous_balance_etb NUMERIC(12, 2) NOT NULL,
  amount_paid_etb NUMERIC(12, 2) NOT NULL,
  remaining_balance_etb NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL,
  authorized_by TEXT NOT NULL,
  verification_hash TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Expense Categories & Expenses (Admin Accounting)
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES public.expense_categories(id),
  category_name TEXT NOT NULL,
  title TEXT NOT NULL,
  amount_etb NUMERIC(12, 2) NOT NULL CHECK (amount_etb > 0),
  expense_date DATE NOT NULL,
  payment_method TEXT NOT NULL,
  reference_no TEXT,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  recorded_by_name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Attendance
CREATE TABLE IF NOT EXISTS public.attendance (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  course_id TEXT NOT NULL REFERENCES public.courses(id),
  course_name TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  recorded_by UUID NOT NULL REFERENCES public.profiles(id),
  recorded_by_name TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enrollment_id, attendance_date)
);

-- 12. Notifications & Immutable Audit Logs
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_role TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_status ON public.payment_installments(due_date, status);
CREATE INDEX IF NOT EXISTS idx_payments_status_date ON public.payments(status, payment_date);
CREATE INDEX IF NOT EXISTS idx_attendance_course_date ON public.attendance(course_id, attendance_date);

-- Enable Row Level Security across all tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS role checks
CREATE OR REPLACE FUNCTION public.zacma_current_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;
