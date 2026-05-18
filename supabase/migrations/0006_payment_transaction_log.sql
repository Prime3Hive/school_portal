-- Migration: 0006
-- Description: Immutable payment transaction audit log
-- Depends on: (core auth tables)
-- Original: sql/create-payment-transaction-log.sql

CREATE TABLE IF NOT EXISTS payment_transaction_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID,
  transaction_type VARCHAR(50) NOT NULL,
  old_state JSONB,
  new_state JSONB,
  performed_by UUID REFERENCES auth.users(id),
  performer_email VARCHAR(255),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- This table must be immutable — no UPDATE or DELETE allowed
CREATE INDEX IF NOT EXISTS idx_ptl_payment_id   ON payment_transaction_logs(payment_id);
CREATE INDEX IF NOT EXISTS idx_ptl_created_at   ON payment_transaction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptl_performed_by ON payment_transaction_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_ptl_type         ON payment_transaction_logs(transaction_type);

ALTER TABLE payment_transaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read transaction logs" ON payment_transaction_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','staff')));

CREATE POLICY "System inserts transaction logs" ON payment_transaction_logs
  FOR INSERT WITH CHECK (true);
-- Note: No UPDATE or DELETE policies — logs are immutable by design
