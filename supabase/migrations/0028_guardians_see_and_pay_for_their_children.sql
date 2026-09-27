-- ============================================================
-- 0028 — Guardians can see their children's bills and results,
--        and send a payment for them
-- ============================================================
--
-- Why
-- ---
-- 0024 let a guardian read their own children's rows in `students`
-- (students.guardian_auth_id = auth.uid()). Nothing let them read anything
-- else about those children, and record_fee_payment only accepts a payment
-- against the caller's *own* student row (students.auth_id). So a parent
-- signed in to the parent portal could see their child's name and nothing
-- more, and the school's main payment route — a parent transferring money —
-- was refused with "No student record is linked to this account."
--
-- What this does
-- --------------
--   1. SELECT policies on fee_items, fees_payments and grades for rows that
--      belong to a pupil linked to the caller. Read-only: no INSERT, UPDATE
--      or DELETE policy is added for guardians.
--   2. record_fee_payment also accepts a guardian recording for a linked
--      child. Everything else about the non-staff path is unchanged: the row
--      is always 'pending', never allocated, and recorded_by is the caller's
--      auth id, not anything from the payload. Staff approve it as before.
--
-- Safe to re-run: every policy is dropped before it is created, and the
-- function is CREATE OR REPLACE.
--
-- Verify after applying
-- ---------------------
--   a. Sign in as a guardian linked to one child. The parent portal shows
--      that child's bill and results, and no other child's.
--   b. As that guardian, send a transfer with a receipt. It appears in the
--      staff portal under Payments to check, pending.
--   c. As a guardian, try (from the browser console) to call
--      record_fee_payment for a child not linked to you:
--        FORBIDDEN:You may only record payments for your own account or your own children.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Read access to a linked child's bills, payments and grades
-- ============================================================
-- Compared as text so the policy holds whatever type each table's
-- student_id column was created with.

DROP POLICY IF EXISTS fee_items_guardian_select ON public.fee_items;
CREATE POLICY fee_items_guardian_select ON public.fee_items
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id::text = fee_items.student_id::text
      AND s.guardian_auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS fees_payments_guardian_select ON public.fees_payments;
CREATE POLICY fees_payments_guardian_select ON public.fees_payments
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id::text = fees_payments.student_id::text
      AND s.guardian_auth_id = auth.uid()
  ));

DROP POLICY IF EXISTS grades_guardian_select ON public.grades;
CREATE POLICY grades_guardian_select ON public.grades
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id::text = grades.student_id::text
      AND s.guardian_auth_id = auth.uid()
  ));


-- ============================================================
-- 2. record_fee_payment — a guardian may record for a linked child
-- ============================================================
-- Identical to 0020 except the non-staff authorisation block.
CREATE OR REPLACE FUNCTION public.record_fee_payment(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_student_id    UUID    := (p_data->>'student_id')::UUID;
  v_fee_type      TEXT    := p_data->>'fee_type';
  v_amount        NUMERIC := (p_data->>'amount')::NUMERIC;
  v_method        TEXT    := p_data->>'payment_method';
  v_term          TEXT    := p_data->>'term';
  v_acad_year     TEXT    := COALESCE(p_data->>'academic_year', '2025-2026');
  v_is_deposit    BOOLEAN := v_method = 'bank-deposit';
  v_status        TEXT    := CASE WHEN v_is_deposit THEN 'pending' ELSE 'paid' END;
  v_dup_status    TEXT;
  v_dup_method    TEXT;
  v_payment       RECORD;
  v_result        JSONB;
  v_is_staff      BOOLEAN;
  v_own_student   UUID;
  v_recorded_by   TEXT;
BEGIN
  -- ── AUTHORIZE ──────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN:You must be signed in to record a payment.';
  END IF;

  v_is_staff := public.current_user_has_role(ARRAY['admin','staff']);

  IF v_is_staff THEN
    -- Staff record on behalf of others and may settle immediately (cash, POS).
    v_recorded_by := COALESCE(p_data->>'recorded_by', auth.uid()::text);
  ELSE
    -- Everyone else may record against their own student record, or against
    -- a child an admin has linked to them as guardian (0024) …
    SELECT id INTO v_own_student FROM students WHERE auth_id = auth.uid();

    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN:Say which student this payment is for.';
    END IF;

    IF v_own_student IS DISTINCT FROM v_student_id
       AND NOT EXISTS (
         SELECT 1 FROM students
         WHERE id = v_student_id AND guardian_auth_id = auth.uid()
       )
    THEN
      IF v_own_student IS NULL
         AND NOT EXISTS (SELECT 1 FROM students WHERE guardian_auth_id = auth.uid())
      THEN
        RAISE EXCEPTION 'FORBIDDEN:No student record is linked to this account.';
      END IF;
      RAISE EXCEPTION 'FORBIDDEN:You may only record payments for your own account or your own children.';
    END IF;

    -- … and may never settle one. The row is a claim awaiting verification.
    v_status      := 'pending';
    v_is_deposit  := TRUE;                  -- suppresses allocation below
    v_recorded_by := auth.uid()::text;      -- not forgeable from the payload
  END IF;

  -- ── EXECUTE: Check for duplicate ──────────────────────────
  SELECT status, payment_method INTO v_dup_status, v_dup_method
  FROM fees_payments
  WHERE student_id = v_student_id
    AND LOWER(fee_type) = LOWER(v_fee_type)
    AND (v_term IS NULL OR LOWER(term) = LOWER(v_term))
    AND (
      status = 'paid'
      OR (status = 'pending' AND payment_method = 'bank-deposit')
    )
  LIMIT 1;

  -- ── CHECK: Reject duplicate ────────────────────────────────
  IF FOUND THEN
    IF v_dup_status = 'paid' THEN
      RAISE EXCEPTION 'DUPLICATE:% has already been paid for %. Void the existing payment first.',
        v_fee_type, v_term;
    ELSE
      RAISE EXCEPTION 'PENDING:A bank deposit for % (%) is awaiting admin approval. No new transaction can start until it is approved or rejected.',
        v_fee_type, v_term;
    END IF;
  END IF;

  -- ── EXECUTE: Validate amount ───────────────────────────────
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID:Payment amount must be greater than 0.';
  END IF;
  IF v_amount > 999999999 THEN
    RAISE EXCEPTION 'INVALID:Payment amount is too large.';
  END IF;

  -- ── EXECUTE: Insert payment record ────────────────────────
  INSERT INTO fees_payments (
    student_id, student_name, student_roll_no, grade, section,
    fee_type, amount, payment_method, payment_date,
    transaction_ref, notes, receipt_no, receipt_url,
    term, academic_year, status, recorded_by
  ) VALUES (
    v_student_id,
    p_data->>'student_name',
    p_data->>'student_roll_no',
    p_data->>'grade',
    p_data->>'section',
    v_fee_type,
    v_amount,
    v_method,
    (p_data->>'payment_date')::DATE,
    p_data->>'transaction_ref',
    p_data->>'notes',
    p_data->>'receipt_no',
    p_data->>'receipt_url',
    v_term,
    v_acad_year,
    v_status,
    v_recorded_by
  )
  RETURNING * INTO v_payment;

  -- ── EXECUTE: Allocate fee items + update student (paid only) ─
  IF NOT v_is_deposit THEN
    PERFORM _allocate_payment_to_fee_items(v_student_id, v_amount);
    PERFORM _recalculate_student_fee_status(v_student_id);
  END IF;

  -- ── COMMIT: Return result ──────────────────────────────────
  SELECT row_to_json(v_payment)::JSONB INTO v_result;
  RETURN jsonb_build_object('success', true, 'payment', v_result);

EXCEPTION
  WHEN OTHERS THEN
    -- ROLLBACK is automatic; surface the message to the client
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

-- 0019 revoked anon EXECUTE; CREATE OR REPLACE keeps existing grants, but
-- restate it so this file is safe on its own.
REVOKE EXECUTE ON FUNCTION public.record_fee_payment(jsonb) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.record_fee_payment(jsonb) TO authenticated;

COMMIT;
