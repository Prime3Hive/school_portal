-- Migration: 0003
-- Description: Create calendar events table for academic calendar
-- Depends on: 0001_create_notifications_table.sql

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  end_date DATE,
  event_type VARCHAR(50) DEFAULT 'general',
  is_holiday BOOLEAN DEFAULT FALSE,
  is_school_wide BOOLEAN DEFAULT TRUE,
  grade VARCHAR(20),
  color VARCHAR(20) DEFAULT '#137fec',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users view events" ON calendar_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage events" ON calendar_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','staff'))
  );
