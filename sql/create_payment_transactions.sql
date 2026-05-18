-- Payment Transactions Table
-- Tracks all payment attempts from initialization to completion
-- Provides audit trail and recovery mechanism for failed callbacks

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Transaction identification
  reference VARCHAR(100) UNIQUE NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'application_fee', 'school_fee', 'other'
  
  -- Amount and currency
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  
  -- Payer information
  payer_email VARCHAR(255) NOT NULL,
  payer_name VARCHAR(255),
  payer_phone VARCHAR(50),
  
  -- Related entities
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  application_number VARCHAR(50),
  fee_type VARCHAR(100),
  
  -- Payment gateway details
  gateway VARCHAR(50) NOT NULL DEFAULT 'paystack', -- 'paystack', 'bank-transfer'
  gateway_reference VARCHAR(255), -- Paystack reference after callback
  authorization_url TEXT,
  access_code VARCHAR(255),
  
  -- Transaction state
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'success', 'failed', 'cancelled', 'abandoned'
  
  -- Timestamps
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  callback_data JSONB,
  
  -- Audit
  created_by VARCHAR(255),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast lookups
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled', 'abandoned'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_student_id ON payment_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_application_number ON payment_transactions(application_number);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_initiated_at ON payment_transactions(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway_reference ON payment_transactions(gateway_reference);

-- RLS Policies
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Admins can see all transactions
CREATE POLICY "Admins can view all payment transactions"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can insert/update transactions
CREATE POLICY "Admins can manage payment transactions"
  ON payment_transactions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Students can view their own transactions
CREATE POLICY "Students can view own payment transactions"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT id FROM students WHERE auth_id = auth.uid()
    )
  );

-- Public can insert application fee transactions (before auth)
CREATE POLICY "Public can create application fee transactions"
  ON payment_transactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (transaction_type = 'application_fee');

-- Public can update their own pending application transactions
-- WITH CHECK enforces that the row REMAINS an application_fee and in a mutable status
-- preventing an attacker from altering another applicant's row or escalating status.
CREATE POLICY "Public can update own application transactions"
  ON payment_transactions FOR UPDATE
  TO anon, authenticated
  USING (
    transaction_type = 'application_fee'
    AND status IN ('pending', 'processing')
    AND (payer_email = current_setting('request.jwt.claims', true)::jsonb->>'email' OR
         current_setting('request.jwt.claims', true)::text = '')
  )
  WITH CHECK (
    transaction_type = 'application_fee'
    AND status IN ('pending', 'processing')
  );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_payment_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_transactions_updated_at();

-- Function to mark abandoned transactions (no activity for 30 minutes)
CREATE OR REPLACE FUNCTION mark_abandoned_transactions()
RETURNS void AS $$
BEGIN
  UPDATE payment_transactions
  SET status = 'abandoned',
      error_message = 'Transaction abandoned - no activity for 30 minutes'
  WHERE status IN ('pending', 'processing')
    AND initiated_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE payment_transactions IS 'Tracks all payment attempts with full audit trail for recovery and monitoring';
COMMENT ON COLUMN payment_transactions.reference IS 'Unique transaction reference generated client-side';
COMMENT ON COLUMN payment_transactions.gateway_reference IS 'Payment gateway reference (e.g., Paystack reference from callback)';
COMMENT ON COLUMN payment_transactions.status IS 'pending: initialized, processing: popup opened, success: callback received, failed: error, cancelled: user closed, abandoned: timeout';
