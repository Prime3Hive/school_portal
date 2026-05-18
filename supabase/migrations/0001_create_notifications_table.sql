-- Migration: 0001
-- Description: Create notifications table
-- Depends on: (none)
-- Original file: create_notifications_table.sql

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  link TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System inserts notifications" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
