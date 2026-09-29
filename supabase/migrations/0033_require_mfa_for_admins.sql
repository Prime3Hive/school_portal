-- ============================================================================
-- 0033 — Admin rights need a second factor
-- ============================================================================
--
-- ⚠️  APPLY ONLY AFTER EVERY ADMIN HAS SET UP TWO-STEP SIGN-IN.
--     Check first — every admin must show a verified factor:
--
--       SELECT p.school_id, p.full_name, count(f.id) FILTER (WHERE f.status = 'verified') AS factors
--         FROM public.profiles p
--         LEFT JOIN auth.mfa_factors f ON f.user_id = p.id
--        WHERE p.role = 'admin' AND p.status = 'active'
--        GROUP BY 1, 2;
--
-- The portal asks admins to set up an authenticator app at their next sign-in
-- and to enter a code on every sign-in after that. That is a front-door check:
-- an admin token that has not passed the code (aal1) could still call the API
-- directly. After this migration the database itself withholds admin rights
-- from any session that has not passed the second factor (aal2).
--
-- Other roles are unaffected.
--
-- To undo in an emergency (an admin lost their phone and is the only admin):
-- re-run section 1 of 0032, then remove the admin's factor in
-- Authentication → Users so they can enrol again.
-- ============================================================================

BEGIN;

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
      AND (role <> 'admin' OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
  );
$$;

REVOKE ALL    ON FUNCTION public.current_user_has_role(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(TEXT[]) TO authenticated;

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
     AND (role <> 'admin' OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

COMMIT;
