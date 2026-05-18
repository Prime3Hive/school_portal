-- Migration: Create Payment Transaction Log Table
-- Purpose: Immutable audit trail for all payment state changes (created, verified, rejected, allocated, voided, refunded)
-- This ensures compliance with fintech standards for transaction tracking
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS payment_transaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES fees_payments(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'CREATED', 'UPDATED', 'VERIFIED', 'REJECTED',
    'ALLOCATED', 'UNALLOCATED', 'VOIDED', 'CANCELLED', 'REFUNDED'
  )),
  old_state JSONB,  -- Snapshot of payment before change
  new_state JSONB,  -- Snapshot of payment after change
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  performer_email TEXT,
  details JSONB,  -- Additional context (e.g., rejection_reason, allocation details)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_id ON payment_transaction_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_type ON payment_transaction_logs(transaction_type);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON payment_transaction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_performer ON payment_transaction_logs(performer_email);
