-- ============================================================================
-- 0022 — Consolidate account provisioning
-- ============================================================================
--
-- The portal has no self-signup. Every login is created by an admin, and until
-- now that happened down two incompatible paths:
--
--   create-invitation-v2   wrote an `invitations` row and no user, then told the
--                          recipient to "accept" — but nothing ever created the
--                          account, so acceptance could not succeed. Migration
--                          0013 then revoked anon SELECT on `invitations`,
--                          which stopped verify-invitation.html reading the
--                          token at all. The path was dead twice over.
--   create-user-immediate  created the account correctly and was never called.
--
-- Both are replaced by the `create-account` edge function, with
-- `resend-credentials` for reissuing a password. This migration makes the
-- database match that:
--
--   1. create_user_records upserts the profile, so it coexists with the
--      handle_new_user trigger instead of losing a race to it.
--   2. It learns the guardian role and a department, which the admin forms
--      have always collected and the function silently dropped.
--   3. invitations.default_password — a plaintext password readable by every
--      authenticated user — is dropped.
--
-- Safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. Columns the provisioning flow depends on
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login           TIMESTAMPTZ;
ALTER TABLE public.staff    ADD COLUMN IF NOT EXISTS department           TEXT;

-- One account per address. Without this a double-clicked form, or two admins
-- adding the same teacher, quietly produces two logins for one person — and
-- only one of them carries their records.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON public.profiles (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_school_id_unique_idx ON public.profiles (school_id);

-- ============================================================
-- 2. Drop the stored plaintext password
-- ============================================================
-- Credentials are shown to the admin once, in the response to the create call,
-- and mailed to the recipient. Nothing needs them at rest — and 0013 documented
-- that `authenticated` could read this column for every row in the table, so
-- any signed-in student could read every staff member's password.
ALTER TABLE public.invitations DROP COLUMN IF EXISTS default_password;

-- The row is now an issuance record, not a redeemable ticket: no acceptance
-- step exists to expire.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invitations'
      AND column_name = 'expires_at' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.invitations ALTER COLUMN expires_at DROP NOT NULL;
  END IF;
END $$;

COMMENT ON TABLE public.invitations IS
  'Issuance log: who was given portal access, by whom, when. Not a redeemable '
  'invitation — accounts are live the moment they are created by create-account. '
  'Whether the person has signed in is profiles.last_login.';

-- ============================================================
-- 3. create_user_records — atomic profile + role record
-- ============================================================
-- Dropped rather than replaced: adding p_department changes the signature, and
-- CREATE OR REPLACE would leave the 11-argument version in place as an overload
-- that PostgREST could still resolve to.
DROP FUNCTION IF EXISTS public.create_user_records(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_user_records(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, JSONB, TEXT);

CREATE FUNCTION public.create_user_records(
  p_auth_id     UUID,
  p_email       TEXT,
  p_full_name   TEXT,
  p_role        TEXT,
  p_school_id   TEXT,
  p_grade       TEXT  DEFAULT NULL,
  p_section     TEXT  DEFAULT 'A',
  p_gender      TEXT  DEFAULT NULL,
  p_dob         DATE  DEFAULT NULL,
  p_photo       TEXT  DEFAULT NULL,
  p_guardian    JSONB DEFAULT NULL,
  p_department  TEXT  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  -- Upsert, not insert. auth.users carries a handle_new_user trigger that
  -- inserts a profile of its own the moment the auth user is created, guessing
  -- role='student' and school_id=<internal email>. A plain INSERT here loses
  -- that race with a unique violation and rolls the whole account back; the
  -- upsert corrects the trigger's guesses instead.
  INSERT INTO profiles (
    id, email, full_name, role, school_id, status,
    must_change_password, created_at, updated_at
  )
  VALUES (
    p_auth_id, p_email, p_full_name, p_role, p_school_id, 'active',
    TRUE, NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email                = EXCLUDED.email,
    full_name            = EXCLUDED.full_name,
    role                 = EXCLUDED.role,
    school_id            = EXCLUDED.school_id,
    status               = 'active',
    must_change_password = TRUE,
    updated_at           = NOW();

  IF p_role = 'student' THEN
    INSERT INTO students (
      auth_id, name, grade, section, status, attendance, fees,
      photo, date_of_birth, gender, guardian, created_at, updated_at
    )
    SELECT
      p_auth_id, p_full_name, p_grade, COALESCE(p_section, 'A'), 'active', 100, 'pending',
      COALESCE(p_photo, '👤'), p_dob, p_gender, p_guardian, NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM students WHERE auth_id = p_auth_id)
    RETURNING id INTO v_student_id;

  ELSIF p_role IN ('teacher', 'staff') THEN
    INSERT INTO staff (auth_id, name, role, department, status, created_at, updated_at)
    SELECT p_auth_id, p_full_name, p_role, p_department, 'active', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM staff WHERE auth_id = p_auth_id);

  -- admin and guardian have no role table of their own; the profile is the
  -- whole record. Named explicitly so an unrecognised role is a loud failure
  -- rather than an account that quietly half-exists.
  ELSIF p_role NOT IN ('admin', 'guardian') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Unknown role %L', p_role));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'auth_id', p_auth_id,
    'school_id', p_school_id,
    'student_id', v_student_id
  );

EXCEPTION WHEN OTHERS THEN
  -- The transaction rolls back on its own; hand the caller something it can
  -- put in front of the admin and log.
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE);
END;
$$;

-- Only the edge functions call this, and they hold the service-role key.
-- A SECURITY DEFINER function that writes profiles must never be reachable
-- from a browser session.
REVOKE ALL ON FUNCTION public.create_user_records(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_records(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, JSONB, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.create_user_records IS
  'Atomically upserts a profile and inserts the matching student/staff row. '
  'Called by the create-account Edge Function after the auth user exists.';

-- ============================================================
-- 4. record_login — stamp last_login for the calling user
-- ============================================================
-- The admin console now reports "never signed in" per account, and acts on it
-- (that is the cue to reissue credentials), so the stamp has to be reliable.
--
-- login() used to write profiles.last_login with a plain UPDATE from the
-- browser, which only lands if the profiles RLS policy happens to allow a user
-- to update their own row. Widening that policy is the wrong fix — an UPDATE
-- policy broad enough to set last_login is broad enough to set role='admin'.
-- This function is the narrow alternative: it can only ever touch one column,
-- on one row, belonging to the caller.
CREATE OR REPLACE FUNCTION public.record_login()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET last_login = NOW()
   WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.record_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_login() TO authenticated;

COMMENT ON FUNCTION public.record_login IS
  'Stamps profiles.last_login for auth.uid(). Called by authManager.login().';

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- Expect: default_password gone, must_change_password present, one 12-argument
-- create_user_records granted to service_role only.
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='invitations';
--
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_user_records';
-- ============================================================================
