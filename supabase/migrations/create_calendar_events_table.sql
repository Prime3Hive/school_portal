-- Create calendar_events table
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  type VARCHAR(50) DEFAULT 'event',
  location VARCHAR(255),
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_date ON calendar_events(end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- All authenticated users can view calendar events
CREATE POLICY "Authenticated users can view calendar events"
  ON calendar_events FOR SELECT
  TO authenticated
  USING (true);

-- Admins and teachers can create calendar events
CREATE POLICY "Admins and teachers can create calendar events"
  ON calendar_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

-- Admins and event creators can update calendar events
CREATE POLICY "Admins and creators can update calendar events"
  ON calendar_events FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins and event creators can delete calendar events
CREATE POLICY "Admins and creators can delete calendar events"
  ON calendar_events FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_updated_at();

-- Grant permissions
GRANT ALL ON calendar_events TO authenticated;
