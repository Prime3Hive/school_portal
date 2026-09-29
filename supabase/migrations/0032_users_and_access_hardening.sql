-- ============================================================================
-- 0032 — Users & access: suspension that holds, profiles the browser cannot
--        promote, and an audit log nobody can forge or erase
-- ============================================================================
--
-- 1. A suspended account kept its access. Suspension set profiles.status, but
--    current_user_has_role() and get_my_role() — which every RLS policy calls —
--    checked the role only, so a suspended admin with a tab open could go on
--    reading and writing until the tab closed. Both now require an active
--    account. (The update-account edge function also bans the login, which
--    stops its refresh token; this closes the hour its access token has left.)
--
-- 2. Suspend, restore and change role used to be plain UPDATEs from the
--    browser, so their safety rested on whatever UPDATE policy `profiles`
--    carries in the live database — a policy this repository has never
--    recorded. They now go through the update-account edge function, and the
--    browser loses the privilege outright: it may update its own name and
--    email (My profile) and nothing else. Role, status, school_id, permissions,
--    must_change_password and last_login are writable only by the service role
--    and by the narrow SECURITY DEFINER functions below. A column privilege
--    holds whatever the policies say, which is why it is used here.
--
-- 3. audit_logs: any signed-in user could insert a row naming anyone as the
--    actor, and (policy permitting) edit or delete rows. Now a trigger stamps
--    the real caller and time on every row written from a browser, UPDATE and
--    DELETE are revoked, and only admins read it. Rows written by edge
--    functions (service role) keep the actor they set.
--
-- Safe to re-run. Apply in the SQL Editor.
-- ============================================================================

BEGIN;

-- ============================================================
-- 1. Role helpers require an active account
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_has_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY(allowed_roles)
      AND COALESCE(status, 'active') = 'active'
  );
$$;

REVOKE ALL    ON FUNCTION public.current_user_has_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(TEXT[]) TO authenticated;

-- NULL for a suspended account, exactly as for anon: every policy written as
-- get_my_role() = '…' then denies.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles
   WHERE id = auth.uid()
     AND COALESCE(status, 'active') = 'active'
$$;


-- ============================================================
-- 2. profiles — the browser may change its own name and email only
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (full_name, email, updated_at) ON public.profiles TO authenticated;

-- The forced first-login password change used to clear its flag with a direct
-- UPDATE, which the grant above no longer allows. One column, one row, the
-- caller's own.
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET must_change_password = FALSE,
         updated_at = NOW()
   WHERE id = auth.uid();
$$;

REVOKE ALL    ON FUNCTION public.clear_must_change_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;


-- ============================================================
-- 3. audit_logs — append-only, actor stamped by the database
-- ============================================================
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS performer_id UUID;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.stamp_audit_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name   TEXT;
  v_role   TEXT;
  v_school TEXT;
BEGIN
  -- auth.uid() is NULL for the service role: edge functions name the actor
  -- themselves and are trusted to. Every browser row is re-stamped.
  IF auth.uid() IS NOT NULL THEN
    SELECT full_name, role, school_id INTO v_name, v_role, v_school
      FROM public.profiles WHERE id = auth.uid();
    NEW.performer_id := auth.uid();
    NEW.performed_by := COALESCE(v_name, v_school, auth.uid()::text)
                        || ' (' || COALESCE(v_role, 'unknown') || ')';
    NEW.timestamp    := NOW();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_audit_actor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_audit_actor ON public.audit_logs;
CREATE TRIGGER stamp_audit_actor
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_actor();

-- Replace whatever policies the table carries. They were created by hand and
-- never recorded, and permissive policies OR together — adding strict ones
-- beside them would change nothing.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'audit_logs'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.audit_logs', p.policyname);
  END LOOP;
END $$;

-- Every role writes entries (teachers log marks and lesson plans); the
-- trigger decides who the entry says wrote it.
CREATE POLICY "audit_logs: authenticated append"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "audit_logs: admins read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.current_user_has_role(ARRAY['admin']));

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;
REVOKE INSERT ON public.audit_logs FROM anon;

COMMIT;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- Expect: only full_name, email, updated_at updatable by authenticated.
--   SELECT column_name FROM information_schema.column_privileges
--    WHERE table_schema='public' AND table_name='profiles'
--      AND grantee='authenticated' AND privilege_type='UPDATE';
--
-- Expect: exactly the two policies above.
--   SELECT policyname, cmd FROM pg_policies WHERE tablename='audit_logs';
-- ============================================================================
