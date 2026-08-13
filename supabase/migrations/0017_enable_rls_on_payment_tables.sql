-- Migration: 0017
-- Description: Actually enable RLS on the payment tables 0013 wrote policies for.
--
-- What was wrong
-- --------------
-- 0013 carefully replaced the world-writable "System inserts …" policies on
-- payment_allocations, payment_transaction_logs, payment_idempotency and
-- paystack_webhook_events. Every one of those policies is inert, because RLS
-- was never enabled on the tables. A policy on a table without
-- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` does nothing at all.
--
--   payment_allocations       rls_enabled = false   1 policy
--   payment_idempotency       rls_enabled = false   1 policy
--   payment_transaction_logs  rls_enabled = false   1 policy
--   paystack_webhook_events   rls_enabled = false   0 policies
--
-- Confirmed with the anon key: a write reaches the table and is rejected on
-- payload shape (PGRST204), not on authorization (42501). Anonymous clients can
-- therefore write all four.
--
-- Currently latent — all four tables are empty, so nothing is exposed today.
-- It stops being latent the moment the fees module records a payment:
--
--   payment_allocations       decides how much of a fee item is settled;
--                             a forged row zeroes a student's balance
--   payment_transaction_logs  the audit trail; forgeable records are worse
--                             than no records
--   payment_idempotency       poisoning a key can block or replay a payment
--   paystack_webhook_events   forged events make a failed payment look settled
--
-- This is the fourth instance of one pattern in this schema: 0013's
-- school_settings survivor, 0015's nine surviving document policies, 0014's
-- non-idempotent policy names, and now policies written against tables where
-- RLS is off. Writing a policy is not the same as enforcing it — worth a CI
-- check that asserts relrowsecurity for every table carrying a policy.

BEGIN;

ALTER TABLE public.payment_allocations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_idempotency      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transaction_logs ENABLE ROW LEVEL SECURITY;

-- Intentionally has no policies: only the webhook writes here, and it uses the
-- service-role key, which bypasses RLS. Enabling RLS with no policy is exactly
-- the desired end state — nothing reaches it through the public API.
ALTER TABLE public.paystack_webhook_events  ENABLE ROW LEVEL SECURITY;

-- 0013 gave payment_transaction_logs an INSERT policy but no SELECT policy.
-- With RLS now enforced that would make the audit trail unreadable through the
-- API, including `paymentEventLogger.getAuditTrail()` and `getEventsByUser()`.
-- The trail stays append-only — still no UPDATE or DELETE policy — but the
-- people who investigate payments can read it.
DROP POLICY IF EXISTS "payment_transaction_logs: staff read" ON public.payment_transaction_logs;

CREATE POLICY "payment_transaction_logs: staff read"
  ON public.payment_transaction_logs FOR SELECT
  TO authenticated
  USING (public.current_user_has_role(ARRAY['admin','staff']));

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying:
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('payment_allocations','payment_idempotency',
--                     'payment_transaction_logs','paystack_webhook_events');
--   → relrowsecurity must be true for all four
--
--   Anonymous write must now fail with 42501, not PGRST204:
--     POST /rest/v1/payment_allocations  with the anon key
--
--   And these must still work:
--     - admin records a fee payment (allocations written via the
--       SECURITY DEFINER RPCs, which bypass RLS)
--     - the Paystack webhook settles a payment (service-role key)
-- ------------------------------------------------------------------
