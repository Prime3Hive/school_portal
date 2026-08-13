-- Migration: 0021
-- Description: Pin search_path on every SECURITY DEFINER function, and stop
--              granting EXECUTE on things nobody should call directly.
--
-- Why search_path matters here
-- ---------------------------
-- A SECURITY DEFINER function runs with the owner's privileges — on Supabase
-- that is a superuser. If it does not pin `search_path`, the objects it
-- resolves depend on the *caller's* search_path. Anyone able to create an
-- object earlier in that path can shadow a table or function the body relies on
-- and have it executed with the definer's rights.
--
-- Supabase revokes CREATE on `public` from anon and authenticated by default, so
-- this is defence in depth rather than an open door today. It costs nothing to
-- close, and "today's default" is not a security boundary worth betting a
-- children's records system on.
--
-- Why revoke EXECUTE on the trigger functions
-- -------------------------------------------
-- Ten of these return `trigger`. PostgREST cannot expose a trigger-returning
-- function as an RPC, and PostgreSQL does not check the invoking user's EXECUTE
-- privilege when firing a trigger — the grant does nothing except widen the
-- surface. Revoking is free and removes them from the audit permanently.
--
-- current_user_has_role() is revoked from anon for a different reason: every
-- policy that calls it is declared `TO authenticated`, so anon never evaluates
-- it. get_my_role() is deliberately left alone — it *is* called from `{public}`
-- policies, and revoking it would turn those evaluations into permission errors
-- instead of a clean NULL.
--
-- This clears the last of the `db advisors` security warnings that are ours; the
-- remainder belong to the yp_* application sharing this project.

BEGIN;

-- ── Pin search_path where it is missing ──────────────────────────────────────
ALTER FUNCTION public.record_application(jsonb, text)                    SET search_path = public;
ALTER FUNCTION public._recalculate_student_fee_status(uuid)              SET search_path = public;
ALTER FUNCTION public._allocate_payment_to_fee_items(uuid, numeric)      SET search_path = public;
ALTER FUNCTION public._reverse_fee_item_allocation(uuid, numeric)        SET search_path = public;
ALTER FUNCTION public.notify_on_assessment_created()                     SET search_path = public;
ALTER FUNCTION public.notify_on_grade_change()                           SET search_path = public;
ALTER FUNCTION public.notify_on_schedule_change()                        SET search_path = public;

-- ── Trigger functions: nothing should call these directly ────────────────────
REVOKE EXECUTE ON FUNCTION public.notify_on_assessment_created()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_grade_change()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_schedule_change()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_applications_updated_at()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_calendar_events_updated_at()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_fee_items_updated_at()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_notifications_updated_at()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.yp_events_update_registration_count()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.yp_rooms_update_occupancy()            FROM PUBLIC, anon, authenticated;

-- ── Anon has no business refreshing a materialized view ──────────────────────
REVOKE EXECUTE ON FUNCTION public.refresh_event_stats()                  FROM PUBLIC, anon;

-- ── Policy helper: only ever called from `TO authenticated` policies ─────────
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(text[])          FROM PUBLIC, anon;

-- ── SECURITY INVOKER trigger functions ───────────────────────────────────────
-- These run with the caller's own privileges, so a mutable search_path is not an
-- escalation path and check-db-security.js does not assert on them. Pinned
-- anyway: it costs nothing, it silences the advisor, and it removes the need for
-- the next reader to work out which of the two categories each function is in.
ALTER FUNCTION public.prevent_allocation_updates()                 SET search_path = public;
ALTER FUNCTION public.update_payment_transactions_updated_at()     SET search_path = public;
ALTER FUNCTION public.update_notification_preferences_updated_at() SET search_path = public;

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying:
--
--   node scripts/check-db-security.js
--   → "SECURITY DEFINER functions must pin search_path" must pass
--   → the anon-executable assertion should list only the two allowlisted
--     helpers (check_application_status, get_my_role)
--
--   And these must still work:
--     - editing a student record still stamps updated_at (triggers fire)
--     - a grade change still creates a notification
--     - admin and staff still pass current_user_has_role() checks
--     - the public admissions status lookup still resolves
-- ------------------------------------------------------------------
