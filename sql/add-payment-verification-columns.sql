-- Migration: Add receipt upload and payment verification columns to fees_payments
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

ALTER TABLE fees_payments
  ADD COLUMN IF NOT EXISTS receipt_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;

-- Optional: Create index for quickly finding pending verifications
CREATE INDEX IF NOT EXISTS idx_fees_payments_status ON fees_payments(status);
