-- Migration: 0023
-- Description: Take fee_items balance writes away from the browser.
--
-- ⚠️  REVIEW BEFORE APPLYING. This removes a table privilege from every signed-in
--     user. Read "What still works" before running it on production.
--
-- What was wrong
-- --------------
-- fee_items.amount_paid and fee_items.status are the record of what a student
-- owes. Three client modules updated them with a plain PostgREST .update():
--
--   fee-manager.js         allocatePayment()        (removed in this change)
--   fee-manager.js         updateFeeItem()          (removed in this change)
--   payment-allocation-manager.js  allocatePaymentAtomic() / reverseAllocations()
--
-- None of them checked a role, and none of them went through an RPC. Nothing
-- called them either — the live path allocates inside record_fee_payment and
-- verify_fee_payment, which are SECURITY DEFINER and authorize the caller since
-- 0020 — but "nothing calls it" is not a control. The functions shipped in the
-- bundle and ran from the console, and whether they worked was decided entirely
-- by whether an UPDATE policy on fee_items happened to permit it.
--
-- A student clearing their own balance is the whole exposure: set amount_paid to
-- amount, set status to 'paid', and the portal shows nothing owing.
--
-- The JS is deleted. This is the half that cannot be undone by a future commit.
--
-- What still works
-- ----------------
--   * record_fee_payment / verify_fee_payment / reject_fee_payment /
--     void_fee_payment — SECURITY DEFINER, so they run as the function owner and
--     are unaffected by a privilege revoked from `authenticated`.
--   * The Paystack webhook — service-role key, bypasses RLS and grants entirely.
--   * Admin "Assign Fees" at the start of each term — that is INSERT and DELETE
--     on fee_items, which this migration deliberately leaves alone.
--   * Every read: students seeing their fees, admins seeing the ledger.
--
-- What stops working
-- ------------------
--   * Any direct UPDATE of fee_items through the REST API, by anyone, admins
--     included. There is no UI that does this today. If one is ever needed, add a
--     SECURITY DEFINER function that validates the change and logs it — do not
--     grant UPDATE back. The note at the bottom shows the shape.

BEGIN;

-- ============================================================
-- 1. anon has no business here at all.
--    The anon key ships in the browser bundle, so anything it can reach is
--    public. fee_items is a per-student financial record.
-- ============================================================
REVOKE ALL ON TABLE public.fee_items FROM anon;

-- ============================================================
-- 2. Signed-in users lose UPDATE. Not narrowed by policy — removed as a
--    privilege, so it holds regardless of which policies exist now or later.
--    A policy can be replaced by the next migration that forgets why it was
--    there; a missing GRANT fails loudly with 42501.
-- ============================================================
REVOKE UPDATE ON TABLE public.fee_items FROM authenticated;

-- Reads, and the per-term assignment writes, stay. Which rows each user may
-- touch is still decided by the RLS policies on the table — this only bounds
-- what is reachable at all.
GRANT SELECT, INSERT, DELETE ON TABLE public.fee_items TO authenticated;

-- ============================================================
-- 3. Drop any surviving UPDATE policy, so `pg_policies` stops advertising a
--    write path that the grants no longer back. Leaving it would send the next
--    reader looking for a bug that is not there.
--
--    Named individually because Postgres has no "drop all policies for a
--    command". These are the names this schema has used; unknown names are
--    harmless to list and are dropped IF EXISTS.
-- ============================================================
DROP POLICY IF EXISTS "Students update own fee items"    ON public.fee_items;
DROP POLICY IF EXISTS "Users update own fee items"       ON public.fee_items;
DROP POLICY IF EXISTS "Admins update fee items"          ON public.fee_items;
DROP POLICY IF EXISTS "Admins manage fee items"          ON public.fee_items;
DROP POLICY IF EXISTS "Authenticated update fee_items"   ON public.fee_items;
DROP POLICY IF EXISTS "fee_items: update"                ON public.fee_items;
DROP POLICY IF EXISTS "fee_items: staff update"          ON public.fee_items;

-- RLS must actually be on, or every policy above is decoration. This schema has
-- shipped policies against RLS-disabled tables four separate times (see 0017).
ALTER TABLE public.fee_items ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ------------------------------------------------------------------
-- VERIFY after applying — read the output, do not assume.
--
-- 1. authenticated must hold SELECT, INSERT, DELETE and NOT UPDATE;
--    anon must appear nowhere.
--
--      SELECT grantee, privilege_type
--      FROM information_schema.role_table_grants
--      WHERE table_schema = 'public' AND table_name = 'fee_items'
--        AND grantee IN ('anon','authenticated')
--      ORDER BY grantee, privilege_type;
--
-- 2. No UPDATE policy should remain:
--
--      SELECT policyname, cmd FROM pg_policies
--      WHERE schemaname = 'public' AND tablename = 'fee_items';
--
-- 3. RLS is on:
--
--      SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'fee_items';
--
-- 4. Behavioural, in this order:
--      a. Sign in as a student, open DevTools, and run
--           await supabaseClient.from('fee_items')
--             .update({ amount_paid: 999999, status: 'paid' })
--             .eq('student_id', '<their own id>');
--         → must fail with 42501 (permission denied), not succeed silently.
--      b. Admin → Fees & Payments → Assign Fees for a term. Must still create rows.
--      c. Student submits a bank deposit; admin approves it. The balance must
--         still move — that write happens inside verify_fee_payment.
--
-- If (c) fails, the RPC is not SECURITY DEFINER or is owned by a role without
-- UPDATE on fee_items. Fix the function's owner; do not re-grant UPDATE here.
--
-- If an admin fee-item correction UI is ever needed, it looks like this — the
-- authorization and the audit line live in the function, not in a grant:
--
--   CREATE FUNCTION public.adjust_fee_item(p_item_id uuid, p_amount numeric,
--                                          p_reason text)
--   RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
--   BEGIN
--     IF NOT public.current_user_has_role(ARRAY['admin']) THEN
--       RAISE EXCEPTION 'FORBIDDEN: admin role required';
--     END IF;
--     -- ... update, then INSERT the before/after into audit_logs ...
--   END $$;
--   REVOKE ALL ON FUNCTION public.adjust_fee_item(uuid, numeric, text) FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.adjust_fee_item(uuid, numeric, text) TO authenticated;
-- ------------------------------------------------------------------
