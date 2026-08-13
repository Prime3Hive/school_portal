-- Migration: 0013
-- Description: Close over-permissive RLS policies introduced by earlier migrations.
--
-- ⚠️  REVIEW BEFORE APPLYING. This tightens live access rules. Apply to a staging
--     project first and re-test the invitation, payment and settings flows.
--
-- Background — three problems in the existing policies:
--
--   1. `USING (true) WITH CHECK (true)` with no `TO` clause grants the policy to
--      PUBLIC, which includes the `anon` role. Since the anon key ships in the
--      browser, anyone on the internet inherits that access. school_settings and
--      custom_roles were both fully world-writable this way.
--
--   2. Postgres OR-combines permissive policies. Migration 0004 added correct
--      admin-only policies for school_settings/custom_roles, but the permissive
--      20260301 versions remained — so the strict policies had no effect at all.
--      Order of application does not matter; the loosest policy always wins.
--
--   3. `FOR INSERT WITH CHECK (true)` policies labelled "System inserts …" were
--      meant for the service-role key. But the service role BYPASSES RLS
--      entirely, so these policies grant nothing to the service role and
--      everything to anon. Anonymous clients could forge payment allocations,
--      transaction logs, webhook events, and notifications addressed to any user.

BEGIN;

-- ============================================================
-- Helper: is the current JWT an admin (or staff, where allowed)?
-- SECURITY DEFINER + a locked search_path so the function can read `profiles`
-- without every caller needing a SELECT policy on it.
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
  );
$$;

REVOKE ALL   ON FUNCTION public.current_user_has_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(TEXT[]) TO authenticated;


-- ============================================================
-- 1. school_settings — drop the world-writable policy
-- ============================================================
DROP POLICY IF EXISTS "Admin full access to school_settings" ON public.school_settings;
DROP POLICY IF EXISTS "Admins manage school settings"        ON public.school_settings;
DROP POLICY IF EXISTS "Authenticated users read settings"    ON public.school_settings;
-- Same policy, a different historical name. Found live on the production project
-- after this migration had already run: the exact-name DROP above walked past it.
-- Harmless in itself (SELECT, USING true, authenticated — a duplicate of the read
-- policy created below), but it must go or every audit turns it up again.
DROP POLICY IF EXISTS "Authenticated users can read school_settings" ON public.school_settings;
-- …and the names this migration creates, so a re-run replaces rather than collides.
DROP POLICY IF EXISTS "school_settings: admins write"        ON public.school_settings;
DROP POLICY IF EXISTS "school_settings: authenticated read"  ON public.school_settings;

CREATE POLICY "school_settings: admins write"
  ON public.school_settings FOR ALL
  TO authenticated
  USING      (public.current_user_has_role(ARRAY['admin']))
  WITH CHECK (public.current_user_has_role(ARRAY['admin']));

-- Every signed-in user needs to read settings (term dates, school name, bank details).
CREATE POLICY "school_settings: authenticated read"
  ON public.school_settings FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- 2. custom_roles — permission arrays feed authorization decisions,
--    so anon must not be able to read or write them.
-- ============================================================
DROP POLICY IF EXISTS "Admin full access to custom_roles" ON public.custom_roles;
DROP POLICY IF EXISTS "Admins manage custom roles"        ON public.custom_roles;
DROP POLICY IF EXISTS "custom_roles: admins write"        ON public.custom_roles;
DROP POLICY IF EXISTS "custom_roles: authenticated read"  ON public.custom_roles;

CREATE POLICY "custom_roles: admins write"
  ON public.custom_roles FOR ALL
  TO authenticated
  USING      (public.current_user_has_role(ARRAY['admin']))
  WITH CHECK (public.current_user_has_role(ARRAY['admin']));

CREATE POLICY "custom_roles: authenticated read"
  ON public.custom_roles FOR SELECT
  TO authenticated
  USING (true);


-- ============================================================
-- 3. notifications — anon could previously insert a notification
--    addressed to any user (phishing vector).
-- ============================================================
DROP POLICY IF EXISTS "System inserts notifications"          ON public.notifications;
DROP POLICY IF EXISTS "notifications: authenticated insert"   ON public.notifications;

CREATE POLICY "notifications: authenticated insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Users may notify themselves; admins and staff may notify anyone.
    user_id = auth.uid()
    OR public.current_user_has_role(ARRAY['admin','staff'])
  );


-- ============================================================
-- 4. payment_allocations — allocations are the source of truth for
--    "how much of this fee item is paid". An anonymous INSERT here
--    could zero out a student's outstanding balance.
-- ============================================================
DROP POLICY IF EXISTS "System inserts allocations"            ON public.payment_allocations;
DROP POLICY IF EXISTS "Admins manage allocations"             ON public.payment_allocations;
DROP POLICY IF EXISTS "payment_allocations: staff manage"     ON public.payment_allocations;

CREATE POLICY "payment_allocations: staff manage"
  ON public.payment_allocations FOR ALL
  TO authenticated
  USING      (public.current_user_has_role(ARRAY['admin','staff']))
  WITH CHECK (public.current_user_has_role(ARRAY['admin','staff']));


-- ============================================================
-- 5. payment_transaction_logs — append-only audit trail.
--    Forgeable audit records are worse than no audit records.
-- ============================================================
DROP POLICY IF EXISTS "System inserts transaction logs"           ON public.payment_transaction_logs;
DROP POLICY IF EXISTS "payment_transaction_logs: staff insert"    ON public.payment_transaction_logs;

CREATE POLICY "payment_transaction_logs: staff insert"
  ON public.payment_transaction_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_has_role(ARRAY['admin','staff']));


-- ============================================================
-- 6. paystack_webhook_events — only the webhook (service role, which
--    bypasses RLS) should ever write here. Forged rows could be used to
--    make a failed payment look settled.
-- ============================================================
DROP POLICY IF EXISTS "System inserts webhook events" ON public.paystack_webhook_events;
-- Intentionally no INSERT policy: the edge function uses the service-role key.


-- ============================================================
-- 7. payment_idempotency — the old policy had a WITH CHECK but no USING
--    and no TO, making its effective read scope unclear. State it explicitly.
-- ============================================================
DROP POLICY IF EXISTS "System manages idempotency records"  ON public.payment_idempotency;
DROP POLICY IF EXISTS "Admins read idempotency records"     ON public.payment_idempotency;
DROP POLICY IF EXISTS "payment_idempotency: staff read"     ON public.payment_idempotency;

CREATE POLICY "payment_idempotency: staff read"
  ON public.payment_idempotency FOR SELECT
  TO authenticated
  USING (public.current_user_has_role(ARRAY['admin','staff']));
-- Writes are service-role only (the webhook), which bypasses RLS.


-- ============================================================
-- 8. invitations — invitations.default_password holds a plaintext
--    credential. Confirm RLS is on and that anon cannot read the table.
--
--    NOTE: verify-invitation.html reads this table while the visitor is
--    unauthenticated. Locking anon out of it will break that page unless the
--    lookup moves server-side. See the accompanying report: the correct fix is
--    an edge function that takes the token, returns only non-secret fields, and
--    performs the activation — so the plaintext password never reaches a browser.
-- ============================================================
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- NOTE: this section originally read
--
--     REVOKE SELECT (default_password) ON public.invitations FROM anon;
--     REVOKE SELECT (default_password) ON public.invitations FROM authenticated;
--
-- Those were no-ops. A column-level REVOKE cannot subtract from a table-wide
-- GRANT — it only removes a column-level grant, and where SELECT was granted on
-- the whole table the column stays readable. Confirmed against production after
-- this migration ran: selecting the "revoked" column still returned 200, where an
-- effective revoke returns 42501 at plan time regardless of matching rows.
--
-- anon has no legitimate read of this table. The only anon-facing policy
-- ("Anyone can look up invitation by exact token") is gated on an
-- `invitation_token` JWT claim that nothing in the application ever sets, so it
-- already matches zero rows for an anonymous visitor.
REVOKE SELECT ON public.invitations FROM anon;

-- `authenticated` is deliberately left alone. Admins read default_password to
-- hand credentials to a new user (js/modules/user-management.js:3524), and
-- excluding one column from their access would mean revoking table SELECT and
-- re-granting every other column by name — brittle, and it breaks the moment a
-- column is added.
--
-- The real fix is architectural, not a grant: an `activate-invitation` edge
-- function that performs the token exchange with the service-role key, so the
-- plaintext password never reaches a browser and this column can stop existing.
-- See B7 in the deployment audit.

COMMIT;
