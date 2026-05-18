-- Migration: 0011
-- Description: Add verification columns to fees_payments for bank deposit workflow
-- Depends on: 0010_enhance_payment_constraints.sql
-- Original: sql/add-payment-verification-columns.sql

ALTER TABLE fees_payments
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_fps_verified_by     ON fees_payments(verified_by);
CREATE INDEX IF NOT EXISTS idx_fps_idempotency_key ON fees_payments(idempotency_key);
