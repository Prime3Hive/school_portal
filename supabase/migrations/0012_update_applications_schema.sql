-- Migration: 0012
-- Description: Add missing columns to the applications table required by
--              the admissions module (review fields, payment fields, document URLs).
--              Safe to run multiple times — all statements use IF NOT EXISTS.
-- Run in: Supabase Dashboard → SQL Editor → New Query

ALTER TABLE public.applications
  -- Student information columns
  ADD COLUMN IF NOT EXISTS student_name        text,
  ADD COLUMN IF NOT EXISTS student_dob         date,
  ADD COLUMN IF NOT EXISTS student_gender      text,
  ADD COLUMN IF NOT EXISTS grade               text,
  ADD COLUMN IF NOT EXISTS parent_address      jsonb           DEFAULT '{}',

  -- Document URL columns
  ADD COLUMN IF NOT EXISTS application_form_url  text,
  ADD COLUMN IF NOT EXISTS birth_certificate_url text,
  ADD COLUMN IF NOT EXISTS passport_photo_url    text,
  ADD COLUMN IF NOT EXISTS previous_report_url   text,
  ADD COLUMN IF NOT EXISTS other_documents       jsonb           DEFAULT '[]',

  -- Application fee columns
  ADD COLUMN IF NOT EXISTS application_fee_amount    numeric         DEFAULT 0,
  ADD COLUMN IF NOT EXISTS application_fee_paid      boolean         DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_reference         text,
  ADD COLUMN IF NOT EXISTS payment_date              timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method            text,

  -- Payment verification columns
  ADD COLUMN IF NOT EXISTS receipt_url               text,
  ADD COLUMN IF NOT EXISTS payment_verified_by       uuid,
  ADD COLUMN IF NOT EXISTS payment_verified_at       timestamptz,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason  text,

  -- Review / decision columns
  ADD COLUMN IF NOT EXISTS rejection_reason  text,
  ADD COLUMN IF NOT EXISTS reviewed_date     timestamptz,

  -- Post-approval link columns
  ADD COLUMN IF NOT EXISTS student_id        uuid,
  ADD COLUMN IF NOT EXISTS guardian_auth_id  uuid,

  -- Submission timestamp
  ADD COLUMN IF NOT EXISTS submitted_date    timestamptz     DEFAULT now();

-- Backfill submitted_date from created_at for any pre-existing rows
UPDATE public.applications
SET    submitted_date = created_at
WHERE  submitted_date IS NULL AND created_at IS NOT NULL;

-- Backfill student_name from full_name (old column name) — uses EXECUTE so
-- PostgreSQL only parses the UPDATE at runtime, after checking column existence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'applications'
    AND    column_name  = 'full_name'
  ) THEN
    EXECUTE 'UPDATE public.applications SET student_name = full_name WHERE student_name IS NULL AND full_name IS NOT NULL';
  END IF;
END $$;

-- Backfill grade from grade_applying_for (old column name)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'applications'
    AND    column_name  = 'grade_applying_for'
  ) THEN
    EXECUTE 'UPDATE public.applications SET grade = grade_applying_for WHERE grade IS NULL AND grade_applying_for IS NOT NULL';
  END IF;
END $$;

-- Add FK to students table (wrapped in DO block so it is skipped if students table doesn't exist yet)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  constraint_name = 'applications_student_id_fkey'
    AND    table_schema    = 'public'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_student_id_fkey
        FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipped student_id FK: %', SQLERRM;
END $$;

-- Ensure the admin-update RLS policy also covers staff (matches original policy intent)
DROP POLICY IF EXISTS "Admins can update applications" ON public.applications;
CREATE POLICY "Admins can update applications"
  ON public.applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
    )
  );
