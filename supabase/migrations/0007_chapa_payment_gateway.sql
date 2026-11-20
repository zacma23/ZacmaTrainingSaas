-- ============================================================================
-- ZACMA TECHNOLOGY — MIGRATION 0007
-- CHAPA PAYMENT GATEWAY INTEGRATION (ONLINE PAYMENTS & APPROVAL QUEUE)
-- Strictly additive migration: preserves all existing tables and constraints.
-- ============================================================================

-- 1. Extend payments.payment_method constraint to permit 'Chapa' alongside existing methods
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payments' AND constraint_name = 'payments_payment_method_check'
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_payment_method_check;
  END IF;
  ALTER TABLE payments
    ADD CONSTRAINT payments_payment_method_check
    CHECK (payment_method IN ('Cash', 'CBE Birr', 'Telebirr', 'Bank Transfer', 'Check', 'Chapa'));
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- 2. Create dedicated chapa_transactions ledger table with strict unique tx_ref lock
CREATE TABLE IF NOT EXISTS chapa_transactions (
  id TEXT PRIMARY KEY,
  tx_ref VARCHAR(64) NOT NULL UNIQUE,
  enrollment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_code VARCHAR(24) NOT NULL,
  student_name VARCHAR(120) NOT NULL,
  student_phone VARCHAR(30) NOT NULL,
  student_email VARCHAR(160),
  course_id TEXT NOT NULL,
  course_name VARCHAR(120) NOT NULL,
  amount_etb NUMERIC(12, 2) NOT NULL CHECK (amount_etb > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'ETB' CHECK (currency = 'ETB'),
  payment_method VARCHAR(24) NOT NULL DEFAULT 'Chapa' CHECK (payment_method = 'Chapa'),
  checkout_url TEXT NOT NULL,
  source VARCHAR(24) NOT NULL CHECK (source IN ('STUDENT_PORTAL', 'PAYMENT_LINK')),
  payment_status VARCHAR(32) NOT NULL CHECK (
    payment_status IN ('INITIATED', 'PENDING_VERIFICATION', 'VERIFIED', 'FAILED', 'CANCELLED', 'REFUNDED')
  ),
  approval_status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_APPROVAL' CHECK (
    approval_status IN ('AWAITING_APPROVAL', 'APPROVED', 'REJECTED')
  ),
  created_by TEXT NOT NULL,
  created_by_name VARCHAR(120) NOT NULL,
  created_by_role VARCHAR(24) NOT NULL,
  expires_at TIMESTAMPTZ,
  chapa_reference VARCHAR(120),
  chapa_channel VARCHAR(80),
  chapa_fee_etb NUMERIC(12, 2) DEFAULT 0,
  verification_proof VARCHAR(128),
  verification_payload_summary TEXT,
  verified_at TIMESTAMPTZ,
  payment_date DATE,
  approved_by TEXT,
  approved_by_name VARCHAR(120),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  rejection_reason TEXT,
  payment_id TEXT,
  receipt_id TEXT,
  receipt_number VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapa_tx_student_id ON chapa_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_chapa_tx_status ON chapa_transactions(payment_status, approval_status);
CREATE INDEX IF NOT EXISTS idx_chapa_tx_created_at ON chapa_transactions(created_at DESC);
