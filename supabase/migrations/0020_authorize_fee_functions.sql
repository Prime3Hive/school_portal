-- Migration: 0020
-- Description: Put authorization inside the fee functions.
--
-- ⚠️  BEHAVIOUR CHANGE: student-initiated payments now land as `pending` and
--     require admin approval. Read "Operational impact" below before applying.
--
-- What was wrong
-- --------------
-- 0019 revoked anon, which stopped the internet calling these. It did not stop
-- *account holders*, because the bodies check nothing at all. The functions are
-- SECURITY DEFINER, so they run as the owner and ignore RLS completely.
--
-- The live exploit was in record_fee_payment:
--
--     v_is_deposit := v_method = 'bank-deposit';
--     v_status     := CASE WHEN v_is_deposit THEN 'pending' ELSE 'paid' END;
--
-- Any method other than 'bank-deposit' was recorded as `paid` immediately and
-- allocated against fee items. `student_id` and `recorded_by` came straight
-- from the caller's payload. So any signed-in student could call it with
-- payment_method 'cash' for their own id and any amount, and clear their own
-- balance — no gateway, no approval, no trace of who did it. They could equally
-- pass another student's id.
--
-- verify_fee_payment / reject_fee_payment / void_fee_payment were likewise
-- callable by any authenticated user. A student could approve their own pending
-- deposit, or delete a payment record outright via void.
--
-- Why `pending` is now forced for students
-- ----------------------------------------
-- The obvious narrower fix — let students keep recording 'paystack' as paid —
-- does not work, because nothing verifies that claim. The Paystack webhook has
-- never fired on this project:
--
--     fees_payments        24 rows   (8 of them payment_method = 'paystack')
--     paystack_webhook_events  0 rows
--
-- So every Paystack school fee to date was marked paid purely on the browser's
-- say-so. Until that webhook is configured and confirmed, a browser claim is
-- not evidence of payment, and the only safe rule is that no unprivileged
-- caller may produce a `paid` row.
--
-- This is the item ADMISSIONS_SECURITY_DEPLOYMENT.md described as "mitigated
-- rather than closed", blocked on not having the RPC source. The source is now
-- in sql/live_functions_recovered.sql, so it can be closed.
--
-- Operational impact
-- ------------------
--   * A student paying by Paystack sees "pending" until an admin approves it.
--     Volume is low — 8 such payments exist in total.
--   * verify_fee_payment and reject_fee_payment previously accepted *only*
--     pending bank deposits. They now accept any pending payment, so admins can
--     actually clear the pending Paystack rows this change creates. Without
--     that they would be stranded: unapprovable and unrejectable.
--   * Admin and staff behaviour is otherwise unchanged.
--
-- Once the webhook is live it should become the thing that settles Paystack
-- payments automatically, and this stays as the backstop.

BEGIN;

-- ============================================================
-- record_fee_payment — callers may only record for themselves,
-- and only staff may produce a settled payment.
-- ============================================================
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
    -- Everyone else may only record against their own student record …
    SELECT id INTO v_own_student FROM students WHERE auth_id = auth.uid();

    IF v_own_student IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN:No student record is linked to this account.';
    END IF;
    IF v_student_id IS NULL OR v_student_id <> v_own_student THEN
      RAISE EXCEPTION 'FORBIDDEN:You may only record payments for your own account.';
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


-- ============================================================
-- verify_fee_payment — admin/staff only. Now accepts any pending
-- payment, not just bank deposits (see Operational impact).
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_fee_payment(p_payment_id uuid, p_verified_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_payment    RECORD;
  v_student_id UUID;
  v_amount     NUMERIC;
BEGIN
  -- ── AUTHORIZE ──────────────────────────────────────────────
  IF NOT public.current_user_has_role(ARRAY['admin','staff']) THEN
    RAISE EXCEPTION 'FORBIDDEN:Only admins and staff may verify a payment.';
  END IF;

  -- ── EXECUTE: Fetch & lock the payment row ──────────────────
  SELECT * INTO v_payment
  FROM fees_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  -- ── CHECK: Must exist ──────────────────────────────────────
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND:Payment record % not found.', p_payment_id;
  END IF;

  -- ── CHECK: Must be pending (any method) ────────────────────
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE:Payment % is not pending (status=%, method=%).',
      p_payment_id, v_payment.status, v_payment.payment_method;
  END IF;

  v_student_id := v_payment.student_id;
  v_amount     := v_payment.amount;

  -- ── EXECUTE: Mark as paid ──────────────────────────────────
  UPDATE fees_payments
     SET status      = 'paid',
         verified_by = COALESCE(p_verified_by, auth.uid()::text),
         verified_at = NOW(),
         updated_at  = NOW()
   WHERE id = p_payment_id;

  -- ── EXECUTE: Allocate against fee items ───────────────────
  IF v_amount > 0 THEN
    PERFORM _allocate_payment_to_fee_items(v_student_id, v_amount);
  END IF;

  -- ── EXECUTE: Update student fee status ────────────────────
  PERFORM _recalculate_student_fee_status(v_student_id);

  -- ── COMMIT: Respond ───────────────────────────────────────
  RETURN jsonb_build_object(
    'success',      true,
    'payment_id',   p_payment_id,
    'new_status',   'paid',
    'student_id',   v_student_id,
    'amount',       v_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;


-- ============================================================
-- reject_fee_payment — admin/staff only, any pending payment.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_fee_payment(p_payment_id uuid, p_verified_by text DEFAULT NULL::text, p_reason text DEFAULT 'No reason provided'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_payment    RECORD;
  v_student_id UUID;
BEGIN
  -- ── AUTHORIZE ──────────────────────────────────────────────
  IF NOT public.current_user_has_role(ARRAY['admin','staff']) THEN
    RAISE EXCEPTION 'FORBIDDEN:Only admins and staff may reject a payment.';
  END IF;

  -- ── EXECUTE: Fetch & lock ──────────────────────────────────
  SELECT * INTO v_payment
  FROM fees_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  -- ── CHECK: Must exist ──────────────────────────────────────
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND:Payment record % not found.', p_payment_id;
  END IF;

  -- ── CHECK: Must be pending (any method) ────────────────────
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'INVALID_STATE:Payment % cannot be rejected (status=%, method=%).',
      p_payment_id, v_payment.status, v_payment.payment_method;
  END IF;

  v_student_id := v_payment.student_id;

  -- ── EXECUTE: Mark as rejected (overdue + reason) ──────────
  UPDATE fees_payments
     SET status           = 'overdue',
         rejection_reason = COALESCE(p_reason, 'No reason provided'),
         notes            = CASE
                              WHEN notes IS NOT NULL THEN notes || ' | REJECTED: ' || COALESCE(p_reason, 'No reason provided')
                              ELSE 'REJECTED: ' || COALESCE(p_reason, 'No reason provided')
                            END,
         verified_by      = COALESCE(p_verified_by, auth.uid()::text),
         verified_at      = NOW(),
         updated_at       = NOW()
   WHERE id = p_payment_id;

  -- ── EXECUTE: Recalculate student fee status ────────────────
  PERFORM _recalculate_student_fee_status(v_student_id);

  -- ── COMMIT ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',    true,
    'payment_id', p_payment_id,
    'new_status', 'overdue',
    'student_id', v_student_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;


-- ============================================================
-- void_fee_payment — admin only. It DELETEs the row and reverses
-- allocations, so it is the most destructive of the four.
-- ============================================================
CREATE OR REPLACE FUNCTION public.void_fee_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_payment    RECORD;
  v_student_id UUID;
  v_amount     NUMERIC;
BEGIN
  -- ── AUTHORIZE ──────────────────────────────────────────────
  IF NOT public.current_user_has_role(ARRAY['admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN:Only admins may void a payment.';
  END IF;

  -- ── EXECUTE: Fetch & lock ──────────────────────────────────
  SELECT * INTO v_payment
  FROM fees_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  -- ── CHECK: Must exist ──────────────────────────────────────
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND:Payment record % not found.', p_payment_id;
  END IF;

  v_student_id := v_payment.student_id;
  v_amount     := v_payment.amount;

  -- ── EXECUTE: Reverse fee_items allocation (only if was paid) ─
  IF v_payment.status = 'paid' AND v_amount > 0 THEN
    PERFORM _reverse_fee_item_allocation(v_student_id, v_amount);
  END IF;

  -- ── EXECUTE: Delete the payment record ─────────────────────
  DELETE FROM fees_payments WHERE id = p_payment_id;

  -- ── EXECUTE: Recalculate student fee status ────────────────
  IF v_student_id IS NOT NULL THEN
    PERFORM _recalculate_student_fee_status(v_student_id);
  END IF;

  -- ── COMMIT ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',     true,
    'payment_id',  p_payment_id,
    'student_id',  v_student_id,
    'amount',      v_amount,
    'receipt_no',  v_payment.receipt_no
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

-- CREATE OR REPLACE resets grants to the owner's defaults on some Postgres
-- versions, so re-assert 0019's revocations rather than assuming they held.
REVOKE EXECUTE ON FUNCTION public.record_fee_payment(jsonb)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.verify_fee_payment(uuid, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_fee_payment(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.void_fee_payment(uuid)               FROM PUBLIC, anon;

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying:
--
--   As a signed-in STUDENT:
--     record_fee_payment for own id            → succeeds, status 'pending'
--     record_fee_payment for another student   → FORBIDDEN
--     record_fee_payment method 'cash'         → recorded 'pending', not 'paid'
--     verify_fee_payment on own payment        → FORBIDDEN
--     void_fee_payment                         → FORBIDDEN
--
--   As an ADMIN:
--     record / verify / reject unchanged
--     a pending Paystack payment is now approvable
--
--   As ANON: all four still 42501 (0019).
-- ------------------------------------------------------------------
