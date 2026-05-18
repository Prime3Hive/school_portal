-- Migration: 0009
-- Description: Paystack webhook event audit log
-- Depends on: 0006_payment_transaction_log.sql
-- Original: sql/create-paystack-webhooks.sql

CREATE TABLE IF NOT EXISTS paystack_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,
  reference VARCHAR(255),
  amount NUMERIC(12,2),
  currency VARCHAR(10) DEFAULT 'NGN',
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwe_reference  ON paystack_webhook_events(reference);
CREATE INDEX IF NOT EXISTS idx_pwe_event_type ON paystack_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pwe_processed  ON paystack_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_pwe_created_at ON paystack_webhook_events(created_at DESC);

ALTER TABLE paystack_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System inserts webhook events" ON paystack_webhook_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins read webhook events" ON paystack_webhook_events
  FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','staff')));
