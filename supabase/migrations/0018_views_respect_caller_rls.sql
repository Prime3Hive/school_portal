-- Migration: 0018
-- Description: Make the payment reporting views respect the caller's RLS.
--
-- What was wrong
-- --------------
-- A Postgres view runs with the privileges of its *owner*, not its caller. All
-- three payment reporting views are owned by postgres, so every RLS policy on
-- the tables underneath them was bypassed for anyone who could query the view —
-- and PostgREST exposes views on the public schema just like tables.
--
-- Confirmed with the anon key:
--
--   GET /rest/v1/unallocated_payments        → 200, <b>24 rows</b>
--   GET /rest/v1/unprocessed_webhooks        → 200, 0 rows (source table empty)
--   GET /rest/v1/payment_verification_issues → 200, 0 rows (source table empty)
--
-- `unallocated_payments` exposes payment_id, student_id, amount,
-- allocated_amount and unallocated for every settled payment. That is the
-- financial record RLS on `fees_payments` exists to protect, readable by anyone
-- holding the anon key that ships in the page source. The other two leak
-- nothing today only because their source tables happen to be empty.
--
-- 0014 already identified this hazard and deliberately shipped
-- `list_orphaned_application_payments` as an admin-gated function rather than a
-- view, noting that "a plain view runs with the owner's rights, which would let
-- any signed-in student read other people's payment emails." These three
-- predate that decision and were never revisited.
--
-- The fix
-- -------
-- `security_invoker` (Postgres 15+; this project is on 17) makes a view execute
-- as the querying role, so the underlying policies apply normally. Admin and
-- staff keep full visibility because they already hold SELECT on
-- `fees_payments`; anon and students see only what their own policies allow.
--
-- This is preferable to REVOKE-ing anon: the view stays a view, the admin
-- reconciliation screen at js/payment-reconciliation-manager.js:189 is
-- unaffected, and correctness no longer depends on remembering to re-revoke
-- every time the view is recreated.

BEGIN;

ALTER VIEW public.unallocated_payments        SET (security_invoker = on);
ALTER VIEW public.unprocessed_webhooks        SET (security_invoker = on);
ALTER VIEW public.payment_verification_issues SET (security_invoker = on);

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying:
--
--   With the anon key, all three must return 0 rows:
--     GET /rest/v1/unallocated_payments?select=*
--
--   Signed in as an admin, the reconciliation screen must still list
--   unallocated payments exactly as before.
--
--   SELECT relname, reloptions FROM pg_class
--   WHERE relname IN ('unallocated_payments','unprocessed_webhooks',
--                     'payment_verification_issues');
--   → reloptions must contain security_invoker=on
-- ------------------------------------------------------------------
