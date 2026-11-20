-- ============================================================================
-- ZACMA TECHNOLOGY & TRAINING INSTITUTE
-- Migration 0004: Schema Migration Registry & AI Assistant Governance Tracking
-- Idempotent and append-only for audit transparency.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED', 'VERIFIED')),
  notes TEXT
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schema_migrations_admin_only" ON public.schema_migrations;
CREATE POLICY "schema_migrations_admin_only"
  ON public.schema_migrations
  FOR ALL
  USING (public.zacma_current_role() = 'ADMIN')
  WITH CHECK (public.zacma_current_role() = 'ADMIN');

INSERT INTO public.schema_migrations (version, name, applied_by, status, notes) VALUES
  ('0001', '0001_initial_zacma_schema', 'sql_migration', 'APPLIED', 'Initial ZACMA institutional tables, constraints, indexes, and RLS enablement.'),
  ('0002', '0002_reminders_and_notifications', 'sql_migration', 'APPLIED', 'Automated payment reminder metadata, deduplication index, preferences table, and reminder function.'),
  ('0003', '0003_student_portal_and_general_staff', 'sql_migration', 'APPLIED', 'GENERAL_STAFF and STUDENT roles, linked_student_id binding, and strict student-own RLS policies.'),
  ('0004', '0004_ai_audit_and_migration_tracking', 'sql_migration', 'APPLIED', 'Schema migration registry and AI assistant read-only governance readiness.')
ON CONFLICT (version) DO NOTHING;
