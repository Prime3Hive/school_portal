-- Notification preferences stored server-side per user.
-- This allows preferences to follow users across devices.

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  muted_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_preferences_muted_types_array
    CHECK (jsonb_typeof(muted_types) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_updated_at
  ON notification_preferences(updated_at DESC);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification preferences"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;
