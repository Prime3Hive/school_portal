-- Migration: Create Paystack Webhook Event Log Table
-- Purpose: Audit all webhook events from Paystack for reconciliation and debugging
-- Fintech standard: Maintain webhook audit trail for compliance and troubleshooting
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS paystack_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,  -- Paystack's unique event identifier
  event_type TEXT NOT NULL,  -- charge.success, charge.failed, etc.
  reference TEXT NOT NULL,  -- Paystack payment reference
  amount NUMERIC CHECK (amount > 0),  -- Amount in kobo
  status TEXT,  -- Payment status from Paystack
  message TEXT,
  metadata JSONB,  -- Full event metadata
  processed BOOLEAN DEFAULT FALSE,
  processed_payment_id UUID REFERENCES fees_payments(id) ON DELETE SET NULL,
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_event_id ON paystack_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_reference ON paystack_webhook_events(reference);
CREATE INDEX IF NOT EXISTS idx_webhook_processed ON paystack_webhook_events(processed) WHERE NOT processed;
CREATE INDEX IF NOT EXISTS idx_webhook_created_at ON paystack_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_payment_id ON paystack_webhook_events(processed_payment_id);

-- View: Unprocessed webhooks (for admin monitoring)
CREATE OR REPLACE VIEW unprocessed_webhooks AS
SELECT * FROM paystack_webhook_events
WHERE processed = FALSE
ORDER BY received_at DESC;
