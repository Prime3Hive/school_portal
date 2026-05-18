-- Migration: 0007
-- Description: Payment-to-fee-item allocation mapping (single source of truth)
-- Depends on: 0006_payment_transaction_log.sql
-- Original: sql/create-payment-allocations.sql

CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES fees_payments(id) ON DELETE CASCADE,
  fee_item_id UUID NOT NULL REFERENCES fee_items(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(12,2) NOT NULL CHECK (allocated_amount > 0),
  allocation_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (payment_id, fee_item_id)
);

CREATE INDEX IF NOT EXISTS idx_pa_payment_id  ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_pa_fee_item_id ON payment_allocations(fee_item_id);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage allocations" ON payment_allocations
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','staff')));

CREATE POLICY "System inserts allocations" ON payment_allocations
  FOR INSERT WITH CHECK (true);
