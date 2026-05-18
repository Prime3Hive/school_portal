-- Migration: Create Payment Idempotency Table
-- Purpose: Prevent duplicate payment processing (Fintech standard: idempotent operations)
-- Scenario: Network timeout or double-click could cause duplicate payment creation
-- Solution: Check idempotency key before creating payment record
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payment_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  paystack_reference TEXT UNIQUE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  amount NUMERIC CHECK (amount > 0),
  payment_id UUID REFERENCES fees_payments(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  processed_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours')  -- Auto-cleanup old records
);

-- Indexes for quick idempotency checks
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON payment_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_paystack_ref ON payment_idempotency(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_idempotency_student ON payment_idempotency(student_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_status ON payment_idempotency(status) WHERE status = 'pending';

-- Cleanup old expired idempotency records (optional - can be scheduled)
-- SELECT * FROM payment_idempotency WHERE expires_at < now();
