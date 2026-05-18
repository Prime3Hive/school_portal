-- Migration: 0008
-- Description: Payment idempotency keys table (prevent duplicate payments)
-- Depends on: 0006_payment_transaction_log.sql
-- Original: sql/create-payment-idempotency.sql

CREATE TABLE IF NOT EXISTS payment_idempotency (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  payment_id UUID REFERENCES fees_payments(id),
  student_id UUID,
  amount NUMERIC(12,2),
  status VARCHAR(50) DEFAULT 'processing',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_pi_key        ON payment_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_pi_student_id ON payment_idempotency(student_id);
CREATE INDEX IF NOT EXISTS idx_pi_expires_at ON payment_idempotency(expires_at);

ALTER TABLE payment_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System manages idempotency records" ON payment_idempotency
  FOR ALL WITH CHECK (true);

CREATE POLICY "Admins read idempotency records" ON payment_idempotency
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','staff')));

-- Clean up expired records automatically (run periodically via pg_cron or Supabase scheduled function)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM payment_idempotency WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
