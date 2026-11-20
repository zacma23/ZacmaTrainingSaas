-- ============================================================================
-- ZACMA TECHNOLOGY & TRAINING INSTITUTE — MIGRATION 0005
-- Dual Ethiopian/Gregorian Registration Dates, Automated SMS Gateway & Logs,
-- Unified Notification Matrix, and Internal Messaging System
-- Additive-only migration (preserves 100% of existing tables and data).
-- ============================================================================

-- 1. Dual Calendar Columns on Students
ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS registration_date_ethiopian TEXT,
  ADD COLUMN IF NOT EXISTS registration_time_eat TEXT;

-- 2. SMS System Configuration (non-secret operational settings only; API keys live in server env vars)
CREATE TABLE IF NOT EXISTS public.sms_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  owner_phone_number TEXT NOT NULL DEFAULT '+251911000000',
  active_provider TEXT NOT NULL DEFAULT 'afromessage'
    CHECK (active_provider IN ('afromessage', 'geezsms', 'twilio', 'africastalking')),
  sender_id TEXT,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  portal_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  internal_messaging_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  allow_student_to_instructor BOOLEAN NOT NULL DEFAULT TRUE,
  allow_student_to_admin BOOLEAN NOT NULL DEFAULT TRUE,
  allow_student_to_student BOOLEAN NOT NULL DEFAULT FALSE,
  allow_attachments BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SMS Message Templates
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SMS Delivery Logs with Event Deduplication
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id TEXT PRIMARY KEY,
  dedup_key TEXT UNIQUE,
  event_type TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  student_id TEXT,
  student_code TEXT,
  course_name TEXT,
  template_id TEXT,
  message_body TEXT NOT NULL,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('LIVE', 'TEST')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'TEST_SIMULATED')),
  provider_message_id TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_by TEXT NOT NULL,
  sent_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_student_id ON public.sms_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs(created_at DESC);

-- 5. Unified Notification Channel Rules Matrix
CREATE TABLE IF NOT EXISTS public.notification_channel_rules (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  portal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  internal_message_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Internal Messaging Conversations, Participants & Messages
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('DIRECT', 'GROUP', 'BROADCAST')),
  title TEXT NOT NULL,
  description TEXT,
  course_id TEXT,
  course_name TEXT,
  broadcast_audience TEXT,
  created_by TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_by TEXT,
  last_message_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_uid TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_uid)
);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants(user_uid);

CREATE TABLE IF NOT EXISTS public.internal_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  reply_to_id TEXT,
  reply_to_sender TEXT,
  reply_to_preview TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_messages_conv_created
  ON public.internal_messages(conversation_id, created_at ASC);

-- Record migration version
INSERT INTO public.schema_migrations (version, name, applied_by_name, status)
VALUES ('0005', 'Dual Calendar, Automated SMS Gateway & Internal Messaging', 'System Migration', 'APPLIED')
ON CONFLICT (version) DO NOTHING;
