-- Migration: Create Payment-to-Fee-Item Allocation Table
-- Purpose: Track exact allocation of payments to specific fee items
-- This provides the "single source of truth" for payment application
-- Standard fintech procedure: every payment $ must be traceable to specific line items
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES fees_payments(id) ON DELETE CASCADE,
  fee_item_id UUID NOT NULL REFERENCES fee_items(id) ON DELETE CASCADE,
  allocated_amount NUMERIC NOT NULL CHECK (allocated_amount > 0),
  allocation_order INTEGER NOT NULL,  -- Sequence for traceability (first item allocated first, etc)
  allocated_at TIMESTAMPTZ DEFAULT now(),
  allocated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(payment_id, fee_item_id)  -- Prevent duplicate allocation of same payment to same item
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_fee_item ON payment_allocations(fee_item_id);
CREATE INDEX IF NOT EXISTS idx_allocations_created ON payment_allocations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_allocations_by_person ON payment_allocations(allocated_by);

-- Trigger: Ensure allocations are immutable once created (audit compliance)
CREATE OR REPLACE FUNCTION prevent_allocation_updates()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Allocations are immutable. Must reverse and reallocate instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_payment_allocation_updates ON payment_allocations;
CREATE TRIGGER prevent_payment_allocation_updates
BEFORE UPDATE ON payment_allocations
FOR EACH ROW
EXECUTE FUNCTION prevent_allocation_updates();
