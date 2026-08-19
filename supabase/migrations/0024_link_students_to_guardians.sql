-- Migration: 0024
-- Description: Give a student a real link to their guardian's login.
--
-- What was wrong
-- --------------
-- js/modules/guardian-portal.js resolved a guardian's children like this:
--
--   this.children = allStudents.filter(student =>
--     student.parentEmail    === guardianEmail ||
--     student.parent_email   === guardianEmail ||
--     student.guardianEmail  === guardianEmail ||
--     student.guardian_email === guardianEmail
--   );
--
-- None of those four fields exist on a `students` row. `parent_email` lives on
-- `applications`; the students table keeps the guardian inside a jsonb blob at
-- `guardian->>'email'`, one level down. The filter therefore always returned an
-- empty array, and every guardian who signed in was told "No Children Found".
--
-- Matching on the email inside that blob would work, but only until a parent
-- changes address or the office mistypes one. This adds the same explicit link
-- `applications.guardian_auth_id` already uses.
--
-- Safe to re-run.

BEGIN;

-- ============================================================
-- 1. The link itself
-- ============================================================
-- Nullable on purpose. Most pupils are loaded from the school's registers
-- before their guardian has an account — a student record must not depend on
-- one existing, and Creche pupils may never have a linked login at all.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS guardian_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- The guardian portal's only query is "every student whose guardian is me".
CREATE INDEX IF NOT EXISTS students_guardian_auth_id_idx
  ON public.students (guardian_auth_id)
  WHERE guardian_auth_id IS NOT NULL;

COMMENT ON COLUMN public.students.guardian_auth_id IS
  'auth.users.id of the guardian who may view this pupil. NULL means no portal '
  'access has been granted for this child yet. Set by an admin, never by the '
  'guardian themselves.';

-- ============================================================
-- 2. Let a guardian read their own children
-- ============================================================
-- Without this the column is set but the rows stay invisible: RLS decides what
-- the guardian's SELECT returns, and no existing policy mentions guardians.
DROP POLICY IF EXISTS students_guardian_select ON public.students;
CREATE POLICY students_guardian_select ON public.students
  FOR SELECT
  TO authenticated
  USING (guardian_auth_id = auth.uid());

-- Read-only, deliberately. A guardian may look at their child's record and
-- must never edit it — no INSERT, UPDATE or DELETE policy is created here.

COMMIT;

-- ------------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------------
-- 1. Column and index exist:
--      SELECT column_name, is_nullable, data_type
--        FROM information_schema.columns
--       WHERE table_name = 'students' AND column_name = 'guardian_auth_id';
--
-- 2. Policy is present:
--      SELECT polname, polcmd FROM pg_policy
--       WHERE polrelid = 'public.students'::regclass;
--
-- 3. Behavioural — the whole point of the change:
--      a. Link a test pupil:
--           UPDATE students SET guardian_auth_id = '<guardian auth id>'
--            WHERE id = '<student id>';
--      b. Sign in as that guardian and open the portal. The child must appear
--         under "Child Overview" instead of "No Children Found".
--      c. Sign in as a DIFFERENT guardian. They must see none of that pupil —
--         if they do, the policy is not filtering on auth.uid().
-- ------------------------------------------------------------------
