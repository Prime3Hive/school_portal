-- Migration: 0002
-- Description: Create student applications table for admissions portal
-- Depends on: 0001_create_notifications_table.sql

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_number VARCHAR(20) UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  date_of_birth DATE,
  gender VARCHAR(20),
  address TEXT,
  grade_applying_for VARCHAR(20),
  parent_name VARCHAR(255),
  parent_phone VARCHAR(50),
  parent_email VARCHAR(255),
  previous_school TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  documents JSONB,
  notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_number ON applications(application_number);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage applications" ON applications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM auth.users u
            JOIN profiles p ON p.id = u.id
            WHERE u.id = auth.uid() AND p.role IN ('admin','staff'))
  );

CREATE POLICY "Public can submit applications" ON applications
  FOR INSERT WITH CHECK (true);
