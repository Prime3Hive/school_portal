-- Migration: Add Constraints to Existing Payment Tables
-- Purpose: Enforce data integrity at database level (fintech standard)
-- Prevents: Invalid states, negative amounts, missing verification data
-- Run this in Supabase SQL Editor

-- ============================================
-- SAFE MIGRATION APPROACH
-- All operations use IF EXISTS/IF NOT EXISTS to prevent re-run errors
-- ============================================

-- ============================================
-- fees_payments TABLE: Add Columns (Safe)
-- ============================================

-- Add idempotency_key column (if not exists)
ALTER TABLE IF EXISTS fees_payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Add test payment flag
ALTER TABLE IF EXISTS fees_payments
  ADD COLUMN IF NOT EXISTS is_test_payment BOOLEAN DEFAULT FALSE;

-- Add deleted_at column for soft deletes
ALTER TABLE IF EXISTS fees_payments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================
-- fees_payments TABLE: Add Constraints (Safe)
-- ============================================

-- Positive amount constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'positive_amount' AND conrelid = 'fees_payments'::regclass
  ) THEN
    ALTER TABLE fees_payments ADD CONSTRAINT positive_amount CHECK (amount > 0);
  END IF;
END $$;

-- Payment date required for paid/partial payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_date_required' AND conrelid = 'fees_payments'::regclass
  ) THEN
    ALTER TABLE fees_payments ADD CONSTRAINT payment_date_required
      CHECK (status NOT IN ('paid', 'partial') OR payment_date IS NOT NULL);
  END IF;
END $$;

-- Verified timestamp required if verified_by is set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'verified_requires_verified_at' AND conrelid = 'fees_payments'::regclass
  ) THEN
    ALTER TABLE fees_payments ADD CONSTRAINT verified_requires_verified_at
      CHECK (verified_by IS NULL OR verified_at IS NOT NULL);
  END IF;
END $$;

-- ============================================
-- fee_items TABLE: Add Constraints (Safe)
-- ============================================

-- Positive amount validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'positive_item_amount' AND conrelid = 'fee_items'::regclass
  ) THEN
    ALTER TABLE fee_items ADD CONSTRAINT positive_item_amount CHECK (amount > 0);
  END IF;
END $$;

-- Amount paid must be between 0 and total amount
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'amount_paid_valid' AND conrelid = 'fee_items'::regclass
  ) THEN
    ALTER TABLE fee_items ADD CONSTRAINT amount_paid_valid
      CHECK (amount_paid >= 0 AND amount_paid <= amount);
  END IF;
END $$;

-- Valid status values only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fee_item_status_check' AND conrelid = 'fee_items'::regclass
  ) THEN
    ALTER TABLE fee_items ADD CONSTRAINT fee_item_status_check
      CHECK (status IN ('pending', 'partial', 'paid'));
  END IF;
END $$;

-- ============================================
-- Performance Optimization: Composite Indexes
-- ============================================

-- Index for student payment lookups
CREATE INDEX IF NOT EXISTS idx_fees_payments_student_year_status
  ON fees_payments(student_id, academic_year, status)
  WHERE deleted_at IS NULL;

-- Index for payment method reconciliation
CREATE INDEX IF NOT EXISTS idx_fees_payments_method_status
  ON fees_payments(payment_method, status)
  WHERE deleted_at IS NULL;

-- Index for fee items lookups
CREATE INDEX IF NOT EXISTS idx_fee_items_student_academic
  ON fee_items(student_id, academic_year, status);

-- Index for audit trail (recent payments)
CREATE INDEX IF NOT EXISTS idx_fees_payments_created_at
  ON fees_payments(created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for active records (soft delete support)
CREATE INDEX IF NOT EXISTS idx_fees_payments_active
  ON fees_payments(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- Data Validation Views
-- ============================================

-- View: Find payments with missing allocations (potential bugs)
CREATE OR REPLACE VIEW unallocated_payments AS
SELECT
  fp.id as payment_id,
  fp.student_id,
  fp.amount,
  COALESCE(SUM(pa.allocated_amount), 0) as allocated_amount,
  fp.amount - COALESCE(SUM(pa.allocated_amount), 0) as unallocated
FROM fees_payments fp
LEFT JOIN payment_allocations pa ON fp.id = pa.payment_id
WHERE fp.status = 'paid' AND fp.deleted_at IS NULL
GROUP BY fp.id, fp.student_id, fp.amount
HAVING fp.amount > COALESCE(SUM(pa.allocated_amount), 0)
ORDER BY fp.created_at DESC;

-- View: Payments with verification state issues
CREATE OR REPLACE VIEW payment_verification_issues AS
SELECT
  id,
  student_id,
  amount,
  status,
  verified_by,
  verified_at,
  CASE
    WHEN verified_by IS NOT NULL AND verified_at IS NULL THEN 'Verified without timestamp'
    WHEN verified_by IS NULL AND verified_at IS NOT NULL THEN 'Timestamp without admin'
    ELSE 'OK'
  END as issue
FROM fees_payments
WHERE (verified_by IS NOT NULL AND verified_at IS NULL)
  OR (verified_by IS NULL AND verified_at IS NOT NULL);

-- ============================================
-- DEPLOYMENT COMPLETE
-- ============================================
-- Summary:
-- ✓ All columns added safely (using IF NOT EXISTS)
-- ✓ All constraints added safely (checked before adding)
-- ✓ Performance indexes created
-- ✓ Data validation views created
-- ✓ Can be run multiple times without errors
-- ============================================
