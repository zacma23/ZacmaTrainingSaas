-- ============================================================================
-- ZACMA TECHNOLOGY & TRAINING INSTITUTE
-- Migration 0002: Automated Payment Reminders, Deduplication & Channel Preferences
-- Backward-compatible additive migration. Never deletes existing rows.
-- ============================================================================

-- 1. Enrich notifications table with structured reminder & student balance fields
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_id TEXT REFERENCES public.students(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_code TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_name TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS course_name TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expected_amount_etb NUMERIC(12, 2);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS paid_amount_etb NUMERIC(12, 2);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS remaining_balance_etb NUMERIC(12, 2);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS payment_status TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup_key
  ON public.notifications(dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_student_id
  ON public.notifications(student_id);

-- 2. Notification Preferences per user
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  upcoming_lead_days INTEGER NOT NULL DEFAULT 7 CHECK (upcoming_lead_days BETWEEN 1 AND 30),
  overdue_repeat_days INTEGER NOT NULL DEFAULT 3 CHECK (overdue_repeat_days BETWEEN 1 AND 30),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_notification_prefs" ON public.notification_preferences;
CREATE POLICY "users_manage_own_notification_prefs"
  ON public.notification_preferences
  FOR ALL
  USING (auth.uid() = user_id OR public.zacma_current_role() = 'ADMIN')
  WITH CHECK (auth.uid() = user_id OR public.zacma_current_role() = 'ADMIN');

-- 3. Automated Reminder Evaluation PostgreSQL Function (for pg_cron or Edge Function)
-- Strictly evaluates ONLY approved installment coverage (amount_paid_etb reflects APPROVED payments only).
CREATE OR REPLACE FUNCTION public.process_zacma_payment_reminders(
  p_upcoming_lead_days INTEGER DEFAULT 7,
  p_overdue_repeat_days INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_checked INTEGER := 0;
  v_overdue_marked INTEGER := 0;
  v_reminders_created INTEGER := 0;
  v_row RECORD;
  v_days_late INTEGER;
  v_bucket INTEGER;
  v_remaining NUMERIC(12, 2);
  v_dedup TEXT;
BEGIN
  FOR v_row IN
    SELECT
      i.*,
      e.remaining_balance_etb AS enr_remaining,
      e.status AS enr_status
    FROM public.payment_installments i
    JOIN public.enrollments e ON e.id = i.enrollment_id
    WHERE e.status = 'ACTIVE'
  LOOP
    v_checked := v_checked + 1;
    v_remaining := ROUND(v_row.amount_due_etb - v_row.amount_paid_etb, 2);

    -- If approved payments already cover the installment, never mark overdue
    IF v_remaining <= 0.01 THEN
      IF v_row.status <> 'PAID' THEN
        UPDATE public.payment_installments SET status = 'PAID', updated_at = NOW() WHERE id = v_row.id;
      END IF;
      CONTINUE;
    END IF;

    -- Case 1: Overdue
    IF v_row.due_date < v_today THEN
      IF v_row.status <> 'OVERDUE' THEN
        UPDATE public.payment_installments SET status = 'OVERDUE', updated_at = NOW() WHERE id = v_row.id;
        v_overdue_marked := v_overdue_marked + 1;
      END IF;

      v_days_late := GREATEST(1, (v_today - v_row.due_date));
      v_bucket := FLOOR((v_days_late - 1) / GREATEST(1, p_overdue_repeat_days));

      -- Student, Accountant, and Admin deduplicated alerts
      FOR v_dedup IN
        SELECT unnest(ARRAY['STUDENT', 'ACCOUNTANT', 'ADMIN'])
      LOOP
        INSERT INTO public.notifications (
          id, type, title, message, target_role, entity_type, entity_id,
          student_id, student_code, student_name, course_name,
          expected_amount_etb, paid_amount_etb, remaining_balance_etb,
          due_date, payment_status, dedup_key, is_read, created_at
        )
        VALUES (
          'rem_' || v_row.id || '_ovd_b' || v_bucket || '_' || LOWER(v_dedup),
          'PAYMENT_OVERDUE',
          'Overdue Installment #' || v_row.installment_number || ' — ' || v_row.student_name,
          v_row.student_name || ' (' || v_row.student_code || ') is ' || v_days_late || ' day(s) overdue for ' || v_row.course_name || '.',
          v_dedup, 'installment', v_row.id,
          v_row.student_id, v_row.student_code, v_row.student_name, v_row.course_name,
          v_row.amount_due_etb, v_row.amount_paid_etb, GREATEST(0, v_row.enr_remaining),
          v_row.due_date, 'OVERDUE',
          'OVERDUE|' || v_row.id || '|b' || v_bucket || '|' || v_dedup,
          FALSE, NOW()
        )
        ON CONFLICT (dedup_key) DO NOTHING;

        IF FOUND THEN
          v_reminders_created := v_reminders_created + 1;
        END IF;
      END LOOP;

    -- Case 2: Due Today
    ELSIF v_row.due_date = v_today THEN
      FOR v_dedup IN SELECT unnest(ARRAY['STUDENT', 'ACCOUNTANT']) LOOP
        INSERT INTO public.notifications (
          id, type, title, message, target_role, entity_type, entity_id,
          student_id, student_code, student_name, course_name,
          expected_amount_etb, paid_amount_etb, remaining_balance_etb,
          due_date, payment_status, dedup_key, is_read, created_at
        )
        VALUES (
          'rem_' || v_row.id || '_due_' || TO_CHAR(v_today, 'YYYYMMDD') || '_' || LOWER(v_dedup),
          'PAYMENT_DUE_TODAY',
          'Payment Due Today — ' || v_row.student_name,
          'Installment #' || v_row.installment_number || ' (' || v_row.course_name || ') is due today.',
          v_dedup, 'installment', v_row.id,
          v_row.student_id, v_row.student_code, v_row.student_name, v_row.course_name,
          v_row.amount_due_etb, v_row.amount_paid_etb, GREATEST(0, v_row.enr_remaining),
          v_row.due_date, v_row.status,
          'DUE_TODAY|' || v_row.id || '|' || TO_CHAR(v_today, 'YYYY-MM-DD') || '|' || v_dedup,
          FALSE, NOW()
        )
        ON CONFLICT (dedup_key) DO NOTHING;

        IF FOUND THEN
          v_reminders_created := v_reminders_created + 1;
        END IF;
      END LOOP;

    -- Case 3: Upcoming within lead window
    ELSIF v_row.due_date > v_today AND v_row.due_date <= (v_today + p_upcoming_lead_days) THEN
      FOR v_dedup IN SELECT unnest(ARRAY['STUDENT', 'ACCOUNTANT']) LOOP
        INSERT INTO public.notifications (
          id, type, title, message, target_role, entity_type, entity_id,
          student_id, student_code, student_name, course_name,
          expected_amount_etb, paid_amount_etb, remaining_balance_etb,
          due_date, payment_status, dedup_key, is_read, created_at
        )
        VALUES (
          'rem_' || v_row.id || '_upc_' || TO_CHAR(v_row.due_date, 'YYYYMMDD') || '_' || LOWER(v_dedup),
          'UPCOMING_PAYMENT',
          'Upcoming Payment Reminder — Due ' || TO_CHAR(v_row.due_date, 'YYYY-MM-DD'),
          v_row.student_name || ' (' || v_row.course_name || ') installment #' || v_row.installment_number || ' is due on ' || TO_CHAR(v_row.due_date, 'YYYY-MM-DD') || '.',
          v_dedup, 'installment', v_row.id,
          v_row.student_id, v_row.student_code, v_row.student_name, v_row.course_name,
          v_row.amount_due_etb, v_row.amount_paid_etb, GREATEST(0, v_row.enr_remaining),
          v_row.due_date, v_row.status,
          'UPCOMING|' || v_row.id || '|' || TO_CHAR(v_row.due_date, 'YYYY-MM-DD') || '|' || v_dedup,
          FALSE, NOW()
        )
        ON CONFLICT (dedup_key) DO NOTHING;

        IF FOUND THEN
          v_reminders_created := v_reminders_created + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_installments', v_checked,
    'overdue_marked', v_overdue_marked,
    'reminders_created', v_reminders_created,
    'ran_at', NOW()
  );
END;
$$;

-- Optional: Schedule daily 06:00 UTC reminder run in Supabase pg_cron (when pg_cron extension is enabled)
-- SELECT cron.schedule('zacma-daily-payment-reminders', '0 6 * * *', $$SELECT public.process_zacma_payment_reminders(7, 3);$$);
