-- Migration: 0004
-- Description: School settings table and custom roles support
-- Depends on: 0001
-- Original: 20260301_school_settings_and_custom_roles.sql

CREATE TABLE IF NOT EXISTS school_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO school_settings (key, value, description) VALUES
  ('school_name',     '"TBD Academy"',              'School display name'),
  ('school_address',  '"Makurdi, Benue State"',     'School physical address'),
  ('current_term',    '"1st Term"',                  'Current academic term'),
  ('academic_year',   '"2025-2026"',                 'Current academic year'),
  ('currency',        '"NGN"',                       'Default currency code')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]',
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_roles    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage school settings" ON school_settings
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated users read settings" ON school_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins manage custom roles" ON custom_roles
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
