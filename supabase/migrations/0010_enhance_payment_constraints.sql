-- Migration: 0010
-- Description: Data integrity constraints and performance indexes for payments
-- Depends on: 0006, 0007, 0008, 0009
-- Original: sql/enhance-payment-constraints.sql

-- Ensure unique transaction references (prevent double-recording)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fees_payments_transaction_ref_unique'
  ) THEN
    ALTER TABLE fees_payments
      ADD CONSTRAINT fees_payments_transaction_ref_unique
      UNIQUE (transaction_ref)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Ensure amount is always positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fees_payments_amount_positive'
  ) THEN
    ALTER TABLE fees_payments
      ADD CONSTRAINT fees_payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- Add soft-delete column if not present
ALTER TABLE fees_payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_fees_payments_student_id   ON fees_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_payments_status       ON fees_payments(status);
CREATE INDEX IF NOT EXISTS idx_fees_payments_payment_date ON fees_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_fees_payments_academic_year ON fees_payments(academic_year);
CREATE INDEX IF NOT EXISTS idx_fees_payments_deleted_at   ON fees_payments(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fee_items_student_status   ON fee_items(student_id, status);
