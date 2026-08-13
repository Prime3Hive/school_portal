-- Migration: 0019
-- Description: Stop anonymous clients executing the fee-mutating RPCs.
--
-- ⚠️  THIS CLOSES A LIVE FINANCIAL AUTHORIZATION HOLE. Apply immediately.
--
-- What was wrong
-- --------------
-- The fee functions are SECURITY DEFINER, perform no caller role check, and
-- were granted EXECUTE to PUBLIC, anon and authenticated:
--
--   proacl: =X/postgres | anon=X/postgres | authenticated=X/postgres | ...
--
-- SECURITY DEFINER means they run as the owner and bypass RLS entirely. So
-- every policy hardened in 0013 and enforced in 0017 was irrelevant to anyone
-- who called these directly instead of touching the tables. Confirmed against
-- production with nothing but the anon key:
--
--   POST /rest/v1/rpc/record_fee_payment  → 200  "INVALID:Payment…"   executed
--   POST /rest/v1/rpc/verify_fee_payment  → 200  "NOT_FOUND:Payment…" executed
--   POST /rest/v1/rpc/reject_fee_payment  → 200  executed
--   POST /rest/v1/rpc/void_fee_payment    → 200  executed
--   POST /rest/v1/rpc/generate_invoice_number → 200  "PROBE-2026-08-0001"
--
-- Those are validation errors from *inside* the function bodies — the calls
-- reached the logic and were rejected on their arguments, not on permission.
-- With well-formed arguments an anonymous caller could record a fee payment
-- against any student, or verify a bank transfer that never arrived.
--
-- ADMISSIONS_SECURITY_DEPLOYMENT.md noted these three RPCs were "untouched and
-- still in use" and asked for their source to be dumped before anyone edited
-- them. That dump is now in sql/live_functions_recovered.sql, and reviewing it
-- is what surfaced this.
--
-- What this does, and what it deliberately does not
-- -------------------------------------------------
-- Revokes PUBLIC and anon. The admin console calls the four fee mutators from
-- the browser as a signed-in admin, so `authenticated` keeps EXECUTE and the
-- fees module continues to work.
--
-- That leaves a narrower gap: any *authenticated* user — including a student —
-- can still call them, because the bodies check nothing. Closing that properly
-- means adding a role check inside each function. These move money, so they get
-- their own reviewed change rather than a blind rewrite bundled in here. Until
-- then the exposure is "any account holder" instead of "anyone on the
-- internet", which is the difference between a bug and a breach.
--
-- get_my_role() is intentionally left executable by anon: several RLS policies
-- call it, and revoking it would turn those policy evaluations into permission
-- errors instead of a clean NULL. It only ever returns the caller's own role.

BEGIN;

-- ── The four fee mutators ────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.record_fee_payment(jsonb)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_fee_payment(uuid, text)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_fee_payment(uuid, text, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_fee_payment(uuid)                     FROM PUBLIC, anon;

-- ── Invoice numbering: anon minting numbers burns the sequence ───────────────
REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(text)              FROM PUBLIC, anon;

-- ── Internal helpers. Called only from the SECURITY DEFINER functions above,
--    which execute as the owner, so revoking them from callers is safe. ───────
REVOKE EXECUTE ON FUNCTION public._allocate_payment_to_fee_items(uuid, numeric)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._reverse_fee_item_allocation(uuid, numeric)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recalculate_student_fee_status(uuid)          FROM PUBLIC, anon, authenticated;

-- ── User provisioning: the edge function calls this with the service-role
--    key, which is unaffected by these grants. ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_user_records(uuid, text, text, text, text, text, text, text, date, text, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ── Trigger function; never called directly. ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying — each must return 401/42501 for the anon key:
--
--   POST /rest/v1/rpc/verify_fee_payment
--     {"p_payment_id":"00000000-0000-0000-0000-000000000000","p_verified_by":"x"}
--   → expect 401 42501, NOT 200 with "NOT_FOUND:Payment…"
--
-- And these must still work:
--   - admin records a fee payment from the fees module
--   - admin verifies a pending bank deposit
--   - creating a user through create-user-immediate (service-role key)
-- ------------------------------------------------------------------
