-- Migration: 0014
-- Description: Close the admissions / application-fee security holes.
--
-- ⚠️  BREAKING: after this migration the browser can no longer INSERT into
--     `applications`. All submissions must go through the `submit-application`
--     edge function, which verifies the Paystack charge server-side.
--     Deploy the function BEFORE applying this migration:
--
--       supabase functions deploy submit-application
--       supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...
--
-- What this fixes (see the accompanying audit):
--   C1  applications INSERT had `WITH CHECK (true)` for PUBLIC — anyone holding
--       the anon key (it ships in the browser) could insert a row claiming
--       application_fee_paid = true and get a free admission.
--   C2  payment_transactions INSERT never constrained `status`, so a forged row
--       could be inserted already marked 'success' and then referenced by
--       record_application to fake a paid application.
--   H1  The only anon-visible SELECT policy matches an email JWT claim that
--       anonymous visitors never have, so public status lookup silently
--       returned nothing. Replaced with a SECURITY DEFINER RPC that requires
--       application number + email and returns only non-sensitive fields.
--   H2  generate_application_number used COUNT(*)+1 — racy, and re-issued
--       numbers after any deletion, causing a UNIQUE violation *after* the
--       applicant's card had been charged.
--   M1  The application fee was whatever the browser said it was. It is now
--       held server-side in application_fee_schedule.
--   M2  Bank-transfer teller references could be reused across applications.
--   M3  applications UPDATE was granted to 'staff', but the UI hides the
--       module from staff — nav filtering is not an access control.

BEGIN;

-- ============================================================
-- 0. Role helper — normally created by 0013. Repeated here (CREATE OR REPLACE
--    is idempotent) so this migration can be applied to a project where 0013
--    has not been run yet.
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

REVOKE ALL    ON FUNCTION public.current_user_has_role(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(TEXT[]) TO authenticated;


-- ============================================================
-- 1. Server-side fee schedule (M1)
--    The browser may read this to render prices, but the authoritative
--    amount charged is read from here by the submit-application function.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.application_fee_schedule (
  grade      text PRIMARY KEY,
  amount     numeric NOT NULL CHECK (amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.application_fee_schedule (grade, amount) VALUES
  ('Kindergarten', 5000), ('Nursery', 5000), ('Pre-Primary', 5000),
  ('Grade 1', 5000), ('Grade 2', 5000), ('Grade 3', 5000),
  ('Grade 4', 5000), ('Grade 5', 5000), ('Grade 6', 5000),
  ('JSS 1', 7500), ('JSS 2', 7500), ('JSS 3', 7500)
ON CONFLICT (grade) DO NOTHING;

ALTER TABLE public.application_fee_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee_schedule: public read"  ON public.application_fee_schedule;
DROP POLICY IF EXISTS "fee_schedule: admin write"  ON public.application_fee_schedule;

-- Prices are shown on the public admissions page; reading them is not sensitive.
CREATE POLICY "fee_schedule: public read"
  ON public.application_fee_schedule FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "fee_schedule: admin write"
  ON public.application_fee_schedule FOR ALL
  TO authenticated
  USING      (public.current_user_has_role(ARRAY['admin']))
  WITH CHECK (public.current_user_has_role(ARRAY['admin']));


-- ============================================================
-- 2. Collision-free application numbers (H2)
--    Format: TBD-<year>-<8 hex>-<seq>. The random block makes numbers
--    unguessable so they cannot be enumerated (see H1); the sequence
--    keeps them sortable and human-referenceable.
--
--    The random block comes from gen_random_uuid() rather than
--    gen_random_bytes(). Both are CSPRNG-backed, but gen_random_bytes lives in
--    pgcrypto, which Supabase installs into the `extensions` schema — and this
--    function pins `search_path = public`, so the call could not resolve and
--    CREATE FUNCTION failed outright ("function gen_random_bytes(integer) does
--    not exist"). gen_random_uuid() is core Postgres 13+ and lives in
--    pg_catalog, which is always on the search path, so this needs no extension
--    and no search_path widening.
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.application_number_seq;

CREATE OR REPLACE FUNCTION public.generate_application_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'TBD-' || EXTRACT(YEAR FROM now())::int || '-'
         || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) || '-'
         || lpad(nextval('public.application_number_seq')::text, 5, '0');
$$;

-- Start the sequence past any numbers already issued by the old COUNT(*) scheme.
SELECT setval('public.application_number_seq',
               GREATEST((SELECT count(*) FROM public.applications), 1));

-- Only the edge function (service role) mints numbers now.
REVOKE EXECUTE ON FUNCTION public.generate_application_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_application_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_application_number() FROM authenticated;


-- ============================================================
-- 3. applications RLS (C1, M3)
-- ============================================================

-- Every historical INSERT policy, from both competing migrations.
DROP POLICY IF EXISTS "Anyone can submit applications"   ON public.applications;
DROP POLICY IF EXISTS "Public can submit applications"   ON public.applications;
DROP POLICY IF EXISTS "Admins manage applications"       ON public.applications;
DROP POLICY IF EXISTS "Applicants can view their own applications" ON public.applications;
DROP POLICY IF EXISTS "Admins can view all applications"  ON public.applications;
DROP POLICY IF EXISTS "Admins can update applications"    ON public.applications;
DROP POLICY IF EXISTS "Admins can delete applications"    ON public.applications;
-- …and the names created below, so a re-run replaces rather than collides.
DROP POLICY IF EXISTS "applications: staff read"              ON public.applications;
DROP POLICY IF EXISTS "applications: admin update"            ON public.applications;
DROP POLICY IF EXISTS "applications: admin delete unapproved" ON public.applications;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- No INSERT policy at all: submissions arrive via the submit-application edge
-- function using the service-role key, which bypasses RLS. An anon client
-- holding the public key can no longer create application rows.

-- Admin + staff may read (staff answer the phone and need to look applicants up).
CREATE POLICY "applications: staff read"
  ON public.applications FOR SELECT
  TO authenticated
  USING (public.current_user_has_role(ARRAY['admin','staff']));

-- Only admins may change a decision or a payment state. Staff must not be able
-- to flip application_fee_paid — the UI hides the module from them, but the UI
-- is not a security boundary.
CREATE POLICY "applications: admin update"
  ON public.applications FOR UPDATE
  TO authenticated
  USING      (public.current_user_has_role(ARRAY['admin']))
  WITH CHECK (public.current_user_has_role(ARRAY['admin']));

-- Approved applications are the admission record of an enrolled student and
-- must not be deleted (M8) — reject or archive instead.
CREATE POLICY "applications: admin delete unapproved"
  ON public.applications FOR DELETE
  TO authenticated
  USING (
    public.current_user_has_role(ARRAY['admin'])
    AND status <> 'approved'
    AND student_id IS NULL
  );


-- ============================================================
-- 4. Public status lookup without leaking PII (H1)
--    Requires BOTH the application number and the email on file, and returns
--    only the fields the status card renders — never phone, address, DOB or
--    document URLs.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_application_status(
  p_app_no text,
  p_email  text
)
RETURNS TABLE (
  application_number     text,
  student_name           text,
  grade                  text,
  status                 text,
  application_fee_paid    boolean,
  application_fee_amount  numeric,
  payment_method         text,
  payment_rejection_reason text,
  rejection_reason       text,
  submitted_date         timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.application_number, a.student_name, a.grade, a.status,
         a.application_fee_paid, a.application_fee_amount, a.payment_method,
         a.payment_rejection_reason, a.rejection_reason, a.submitted_date
  FROM   public.applications a
  WHERE  upper(trim(a.application_number)) = upper(trim(p_app_no))
  AND    lower(trim(a.parent_email))       = lower(trim(p_email))
  LIMIT  1;
$$;

REVOKE ALL    ON FUNCTION public.check_application_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_application_status(text, text) TO anon, authenticated;


-- ============================================================
-- 5. record_application is superseded by the edge function (C1)
--    It is SECURITY DEFINER, so it bypasses every policy in section 3.
--    Leaving it callable by anon would reopen the hole this migration closes.
-- ============================================================
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public' AND p.proname = 'record_application'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    RAISE NOTICE 'Revoked public execute on %', fn.sig;
  END LOOP;
END $$;


-- ============================================================
-- 6. payment_transactions: forbid self-declared success (C2)
-- ============================================================
DROP POLICY IF EXISTS "Public can create application fee transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Public can update own application transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "payment_transactions: anon open pending"        ON public.payment_transactions;
DROP POLICY IF EXISTS "payment_transactions: anon update non-final"    ON public.payment_transactions;

-- An unauthenticated client may only open a transaction in 'pending'.
CREATE POLICY "payment_transactions: anon open pending"
  ON public.payment_transactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    transaction_type = 'application_fee'
    AND status   = 'pending'
    AND gateway  = 'paystack'
    AND currency = 'NGN'
    AND student_id IS NULL
    AND amount > 0
    AND amount <= 1000000
  );

-- …and may only move it between the two non-final states (popup opened /
-- popup closed). Promotion to 'success' is service-role only.
CREATE POLICY "payment_transactions: anon update non-final"
  ON public.payment_transactions FOR UPDATE
  TO anon, authenticated
  USING (
    transaction_type = 'application_fee'
    AND status IN ('pending', 'processing')
  )
  WITH CHECK (
    transaction_type = 'application_fee'
    AND status IN ('pending', 'processing', 'cancelled', 'failed')
  );


-- ============================================================
-- 7. Payment reference reuse (M2)
--    One Paystack charge funds exactly one application; one teller slip is
--    accepted once. Partial indexes so NULLs and legacy rows are unaffected.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_paystack_reference
  ON public.applications (payment_reference)
  WHERE payment_reference IS NOT NULL AND payment_method = 'paystack';

CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_bank_reference
  ON public.applications (lower(payment_reference))
  WHERE payment_reference IS NOT NULL AND payment_method = 'bank-transfer';

-- Supports the per-email submission rate limit in the edge function.
CREATE INDEX IF NOT EXISTS idx_applications_email_submitted
  ON public.applications (lower(parent_email), submitted_date DESC);


-- ============================================================
-- 8. Reconciliation view: money taken but no application saved.
--    The old flow charged the card before writing the row, so a browser
--    closing at the wrong moment lost the application silently.
-- ============================================================
--    Exposed as an admin-gated function rather than a view: a plain view runs
--    with the owner's rights, which would let any signed-in student read
--    other people's payment emails.
DROP VIEW IF EXISTS public.orphaned_application_payments;

CREATE OR REPLACE FUNCTION public.list_orphaned_application_payments()
RETURNS TABLE (
  reference          text,
  amount             numeric,
  payer_email        text,
  application_number text,
  initiated_at       timestamptz,
  completed_at       timestamptz,
  error_message      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.reference, t.amount, t.payer_email, t.application_number,
         t.initiated_at, t.completed_at, t.error_message
  FROM   public.payment_transactions t
  LEFT   JOIN public.applications a ON a.payment_reference = t.reference
  WHERE  t.transaction_type = 'application_fee'
  AND    t.status = 'success'
  AND    a.id IS NULL
  AND    public.current_user_has_role(ARRAY['admin'])
  ORDER  BY t.initiated_at DESC;
$$;

REVOKE ALL    ON FUNCTION public.list_orphaned_application_payments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_orphaned_application_payments() TO authenticated;

COMMIT;
