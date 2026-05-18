-- Migration: 0005
-- Description: Notification preferences per user
-- Depends on: 0001_create_notifications_table.sql
-- Original: 20260410_notification_preferences.sql

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT FALSE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  fee_alerts BOOLEAN DEFAULT TRUE,
  grade_alerts BOOLEAN DEFAULT TRUE,
  application_alerts BOOLEAN DEFAULT TRUE,
  system_alerts BOOLEAN DEFAULT TRUE,
  digest_frequency VARCHAR(20) DEFAULT 'immediate',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_notif_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_notif_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_preferences();
