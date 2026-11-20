-- ============================================================================
-- ZACMA TECHNOLOGY & TRAINING INSTITUTE
-- Migration 0003: Isolated Student Self-Service Portal & General Staff Role
-- Additive & idempotent. Preserves existing Admin, Accountant, and Instructor roles.
-- ============================================================================

-- 1. Add linked_student_id on profiles so STUDENT accounts are strictly bound to one student record
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linked_student_id TEXT REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_student_id
  ON public.profiles(linked_student_id)
  WHERE linked_student_id IS NOT NULL;

-- 2. Seed canonical roles idempotently (Admin, Accountant, Instructor, General Staff, Student)
INSERT INTO public.roles (id, code, name, description, permissions) VALUES
  ('role_admin', 'ADMIN', 'System Administrator', 'Full institutional governance, approvals, courses, fees, expenses, staff roles, and audit logs.', '["approve_registrations","approve_payments","manage_courses","manage_staff","view_reports","manage_expenses","manage_attendance","view_audit_logs"]'::jsonb),
  ('role_accountant', 'ACCOUNTANT', 'Accountant & Registrar', 'Registers students, assigns payment plans, submits payments for admin approval, and prints approved receipts.', '["register_students","record_payments","view_balances","print_approved_receipts"]'::jsonb),
  ('role_instructor', 'INSTRUCTOR', 'Course Instructor', 'Views assigned classes and enrolled students and records daily attendance with zero financial access.', '["view_assigned_classes","record_attendance","view_attendance_reports"]'::jsonb),
  ('role_general_staff', 'GENERAL_STAFF', 'General Operations Staff', 'Supports campus schedules, student directory coordination, and non-financial operations.', '["view_courses","view_student_directory","view_attendance_summary"]'::jsonb),
  ('role_student', 'STUDENT', 'Enrolled Student', 'Isolated self-service portal access strictly limited to own fee balance, deadlines, reminders, and receipts.', '["view_own_balance","view_own_receipts","view_own_reminders"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. Helper to resolve the signed-in student's bound student_id
CREATE OR REPLACE FUNCTION public.zacma_linked_student_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT linked_student_id
  FROM public.profiles
  WHERE id = auth.uid() AND role = 'STUDENT' AND is_active = TRUE
  LIMIT 1;
$$;

-- 4. Strict Row Level Security Policies enforcing Role & Student Isolation
DROP POLICY IF EXISTS "students_self_or_staff_read" ON public.students;
CREATE POLICY "students_self_or_staff_read" ON public.students
  FOR SELECT USING (
    public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF')
    OR id = public.zacma_linked_student_id()
  );

DROP POLICY IF EXISTS "enrollments_self_or_staff_read" ON public.enrollments;
CREATE POLICY "enrollments_self_or_staff_read" ON public.enrollments
  FOR SELECT USING (
    public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF')
    OR student_id = public.zacma_linked_student_id()
  );

DROP POLICY IF EXISTS "installments_finance_or_own_student_read" ON public.payment_installments;
CREATE POLICY "installments_finance_or_own_student_read" ON public.payment_installments
  FOR SELECT USING (
    public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT')
    OR student_id = public.zacma_linked_student_id()
  );

DROP POLICY IF EXISTS "payments_finance_or_own_student_read" ON public.payments;
CREATE POLICY "payments_finance_or_own_student_read" ON public.payments
  FOR SELECT USING (
    public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT')
    OR student_id = public.zacma_linked_student_id()
  );

DROP POLICY IF EXISTS "receipts_finance_or_own_student_read" ON public.receipts;
CREATE POLICY "receipts_finance_or_own_student_read" ON public.receipts
  FOR SELECT USING (
    public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT')
    OR student_id = public.zacma_linked_student_id()
  );

DROP POLICY IF EXISTS "notifications_role_or_own_student_read" ON public.notifications;
CREATE POLICY "notifications_role_or_own_student_read" ON public.notifications
  FOR SELECT USING (
    public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT', 'INSTRUCTOR', 'GENERAL_STAFF')
    OR (target_role = 'STUDENT' AND student_id = public.zacma_linked_student_id())
  );

DROP POLICY IF EXISTS "expenses_finance_read" ON public.expenses;
CREATE POLICY "expenses_finance_read" ON public.expenses
  FOR SELECT USING (public.zacma_current_role() IN ('ADMIN', 'ACCOUNTANT'));

DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT USING (public.zacma_current_role() = 'ADMIN');
