-- Live database functions, recovered into version control.
--
-- These functions existed only in the running database — no file in this
-- repository defined them, so the authorization logic behind the fees module
-- could not be reviewed, diffed or rebuilt. ADMISSIONS_SECURITY_DEPLOYMENT.md
-- flagged this and asked for exactly this dump; migration 0019 is what made it
-- urgent, because reviewing them turned up that none performs any role check.
--
-- Recovered with pg_get_functiondef() on 2026-08-13.
--
-- This file is a RECORD, not a migration. Do not apply it blindly — it would
-- recreate these functions exactly as they are, including the missing
-- authorization. Read 0019 first.
--
-- Status of each, as recovered:
--   no function below performs any caller role check. All were granted EXECUTE
--   to PUBLIC, anon and authenticated. 0019 revokes PUBLIC and anon; the
--   remaining gap is that any *authenticated* user, including a student, can
--   still call the fee mutators. Closing that needs a role check added to each
--   body — tracked separately, since these move money and deserve their own
--   review rather than a blind rewrite.


-- ==========================================================================
-- _allocate_payment_to_fee_items
-- ==========================================================================
CREATE OR REPLACE FUNCTION public._allocate_payment_to_fee_items(p_student_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item        RECORD;
  v_remaining   NUMERIC := p_amount;
  v_item_balance NUMERIC;
  v_alloc       NUMERIC;
  v_new_paid    NUMERIC;
  v_new_status  TEXT;
BEGIN
  FOR v_item IN
    SELECT * FROM fee_items
    WHERE student_id = p_student_id
      AND status != 'paid'
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_item_balance := v_item.amount - COALESCE(v_item.amount_paid, 0);
    v_alloc        := LEAST(v_remaining, v_item_balance);
    v_new_paid     := COALESCE(v_item.amount_paid, 0) + v_alloc;

    IF    v_new_paid >= v_item.amount THEN v_new_status := 'paid';
    ELSIF v_new_paid > 0              THEN v_new_status := 'partial';
    ELSE                                   v_new_status := 'pending';
    END IF;

    UPDATE fee_items
       SET amount_paid = v_new_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = v_item.id;

    v_remaining := v_remaining - v_alloc;
  END LOOP;
END;
$function$;

-- ==========================================================================
-- _recalculate_student_fee_status
-- ==========================================================================
CREATE OR REPLACE FUNCTION public._recalculate_student_fee_status(p_student_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status       TEXT := 'pending';
  v_has_paid     BOOLEAN;
  v_all_paid     BOOLEAN;
  v_has_overdue  BOOLEAN;
  v_has_partial  BOOLEAN;
  v_count        INT;
BEGIN
  -- Count relevant payments: exclude pending-bank-deposits and rejected (overdue+reason) records
  SELECT COUNT(*) INTO v_count
  FROM fees_payments
  WHERE student_id = p_student_id
    AND NOT (status = 'pending' AND payment_method = 'bank-deposit')
    AND NOT (status = 'overdue'  AND rejection_reason IS NOT NULL);

  IF v_count = 0 THEN
    v_status := 'pending';
  ELSE
    SELECT
      BOOL_AND(status = 'paid'),
      BOOL_OR(status = 'overdue'),
      BOOL_OR(status = 'partial')
    INTO v_all_paid, v_has_overdue, v_has_partial
    FROM fees_payments
    WHERE student_id = p_student_id
      AND NOT (status = 'pending' AND payment_method = 'bank-deposit')
      AND NOT (status = 'overdue'  AND rejection_reason IS NOT NULL);

    IF v_all_paid     THEN v_status := 'paid';
    ELSIF v_has_overdue THEN v_status := 'overdue';
    ELSIF v_has_partial THEN v_status := 'partial';
    ELSE                    v_status := 'pending';
    END IF;
  END IF;

  UPDATE students SET fees = v_status WHERE id = p_student_id;
  RETURN v_status;
END;
$function$;

-- ==========================================================================
-- _reverse_fee_item_allocation
-- ==========================================================================
CREATE OR REPLACE FUNCTION public._reverse_fee_item_allocation(p_student_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_item        RECORD;
  v_remaining   NUMERIC := p_amount;
  v_reverse     NUMERIC;
  v_new_paid    NUMERIC;
  v_new_status  TEXT;
BEGIN
  FOR v_item IN
    SELECT * FROM fee_items
    WHERE student_id = p_student_id
      AND COALESCE(amount_paid, 0) > 0
    ORDER BY created_at DESC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_reverse  := LEAST(v_remaining, COALESCE(v_item.amount_paid, 0));
    v_new_paid := COALESCE(v_item.amount_paid, 0) - v_reverse;

    IF    v_new_paid <= 0              THEN v_new_status := 'pending';
    ELSIF v_new_paid >= v_item.amount  THEN v_new_status := 'paid';
    ELSE                                    v_new_status := 'partial';
    END IF;

    UPDATE fee_items
       SET amount_paid = v_new_paid,
           status      = v_new_status,
           updated_at  = NOW()
     WHERE id = v_item.id;

    v_remaining := v_remaining - v_reverse;
  END LOOP;
END;
$function$;

-- ==========================================================================
-- create_user_records
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.create_user_records(p_auth_id uuid, p_email text, p_full_name text, p_role text, p_school_id text, p_grade text DEFAULT NULL::text, p_section text DEFAULT 'A'::text, p_gender text DEFAULT NULL::text, p_dob date DEFAULT NULL::date, p_photo text DEFAULT NULL::text, p_guardian jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id UUID;
BEGIN
  -- Insert profile (always required)
  INSERT INTO profiles (id, email, full_name, role, school_id, status, created_at, updated_at)
  VALUES (
    p_auth_id, p_email, p_full_name, p_role, p_school_id, 'active',
    NOW(), NOW()
  );

  -- Insert role-specific record inside the same transaction
  IF p_role = 'student' THEN
    INSERT INTO students (
      auth_id, name, grade, section, status, attendance, fees,
      photo, date_of_birth, gender, guardian, created_at, updated_at
    )
    VALUES (
      p_auth_id, p_full_name, p_grade, COALESCE(p_section, 'A'), 'active', 100, 'pending',
      COALESCE(p_photo, '👤'), p_dob, p_gender, p_guardian, NOW(), NOW()
    )
    RETURNING id INTO v_student_id;

  ELSIF p_role IN ('teacher', 'staff') THEN
    INSERT INTO staff (auth_id, name, role, status, created_at, updated_at)
    VALUES (p_auth_id, p_full_name, p_role, 'active', NOW(), NOW());
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'auth_id', p_auth_id,
    'student_id', v_student_id
  );

EXCEPTION WHEN OTHERS THEN
  -- Transaction auto-rolls back; return error details to caller
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', SQLSTATE
  );
END;
$function$;

-- ==========================================================================
-- generate_invoice_number
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year_month TEXT;
  v_new_num    INTEGER;
BEGIN
  v_year_month := to_char(NOW(), 'YYYY-MM');

  INSERT INTO public.invoice_sequences (prefix, year_month, last_number)
    VALUES (p_prefix, v_year_month, 1)
    ON CONFLICT (prefix, year_month)
    DO UPDATE SET last_number = public.invoice_sequences.last_number + 1
    RETURNING last_number INTO v_new_num;

  RETURN p_prefix || '-' || v_year_month || '-' || lpad(v_new_num::TEXT, 4, '0');
END;
$function$;

-- ==========================================================================
-- get_my_role
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$function$;

-- ==========================================================================
-- handle_new_user
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, school_id, role, full_name, email, must_change_password, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'school_id', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    NEW.email,
    true,
    'active'
  )
  ON CONFLICT (id) DO NOTHING;  -- Don't overwrite if edge function already created it
  RETURN NEW;
END;
$function$;

-- ==========================================================================
-- record_application
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.record_application(p_app_data jsonb, p_txn_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_txn     RECORD;
  v_app     RECORD;
BEGIN
  -- ── EXECUTE + CHECK: Only validate payment_transaction for Paystack flow ──
  IF p_txn_reference IS NOT NULL THEN
    SELECT * INTO v_txn
    FROM payment_transactions
    WHERE reference = p_txn_reference
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TXN_NOT_FOUND:Transaction % not found.', p_txn_reference;
    END IF;

    IF v_txn.status = 'success' THEN
      RAISE EXCEPTION 'DUPLICATE:Application for transaction % was already recorded.', p_txn_reference;
    END IF;

    IF v_txn.status NOT IN ('pending', 'processing') THEN
      RAISE EXCEPTION 'INVALID_STATE:Transaction % is in state %, cannot record application.',
        p_txn_reference, v_txn.status;
    END IF;

    -- Mark payment_transaction as success
    UPDATE payment_transactions
       SET status            = 'success',
           gateway_reference = COALESCE(p_app_data->>'payment_reference', p_txn_reference),
           completed_at      = NOW(),
           callback_data     = p_app_data->'callback_data',
           updated_at        = NOW()
     WHERE reference = p_txn_reference;
  END IF;

  -- ── EXECUTE: Insert application record using only actual table columns ──
  INSERT INTO applications (
    application_number,
    student_name,
    student_dob,
    student_gender,
    grade,
    previous_school,
    parent_name,
    parent_email,
    parent_phone,
    parent_address,
    application_form_url,
    birth_certificate_url,
    passport_photo_url,
    previous_report_url,
    application_fee_amount,
    application_fee_paid,
    payment_reference,
    payment_date,
    payment_method,
    receipt_url,
    status,
    submitted_date
  ) VALUES (
    p_app_data->>'application_number',
    p_app_data->>'student_name',
    NULLIF(p_app_data->>'student_dob', '')::DATE,
    p_app_data->>'student_gender',
    p_app_data->>'grade',
    p_app_data->>'previous_school',
    p_app_data->>'parent_name',
    p_app_data->>'parent_email',
    p_app_data->>'parent_phone',
    COALESCE((p_app_data->'parent_address'), '{}'::JSONB),
    p_app_data->>'application_form_url',
    p_app_data->>'birth_certificate_url',
    p_app_data->>'passport_photo_url',
    p_app_data->>'previous_report_url',
    (p_app_data->>'application_fee_amount')::NUMERIC,
    COALESCE((p_app_data->>'application_fee_paid')::BOOLEAN, false),
    -- For bank transfer: use bank_transaction_ref as payment_reference
    COALESCE(p_app_data->>'payment_reference', p_app_data->>'bank_transaction_ref'),
    COALESCE(NULLIF(p_app_data->>'payment_date', '')::TIMESTAMPTZ, NOW()),
    p_app_data->>'payment_method',
    p_app_data->>'receipt_url',
    COALESCE(p_app_data->>'status', 'pending'),
    COALESCE(NULLIF(p_app_data->>'submitted_date', '')::TIMESTAMPTZ, NOW())
  )
  RETURNING * INTO v_app;

  -- ── COMMIT ──────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',     true,
    'application', row_to_json(v_app)::JSONB
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

-- ==========================================================================
-- record_fee_payment
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.record_fee_payment(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
BEGIN
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
    p_data->>'recorded_by'
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

-- ==========================================================================
-- reject_fee_payment
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.reject_fee_payment(p_payment_id uuid, p_verified_by text DEFAULT NULL::text, p_reason text DEFAULT 'No reason provided'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment    RECORD;
  v_student_id UUID;
BEGIN
  -- ── EXECUTE: Fetch & lock ──────────────────────────────────
  SELECT * INTO v_payment
  FROM fees_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  -- ── CHECK: Must exist ──────────────────────────────────────
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND:Payment record % not found.', p_payment_id;
  END IF;

  -- ── CHECK: Must be a pending bank deposit ──────────────────
  IF NOT (v_payment.status = 'pending' AND v_payment.payment_method = 'bank-deposit') THEN
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
         verified_by      = p_verified_by,
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
    'student_id', v_student_id,
    'reason',     p_reason
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

-- ==========================================================================
-- verify_fee_payment
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.verify_fee_payment(p_payment_id uuid, p_verified_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment    RECORD;
  v_student_id UUID;
  v_amount     NUMERIC;
BEGIN
  -- ── EXECUTE: Fetch & lock the payment row ──────────────────
  SELECT * INTO v_payment
  FROM fees_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  -- ── CHECK: Must exist ──────────────────────────────────────
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND:Payment record % not found.', p_payment_id;
  END IF;

  -- ── CHECK: Must be a pending bank deposit ──────────────────
  IF NOT (v_payment.status = 'pending' AND v_payment.payment_method = 'bank-deposit') THEN
    RAISE EXCEPTION 'INVALID_STATE:Payment % is not a pending bank deposit (status=%, method=%).',
      p_payment_id, v_payment.status, v_payment.payment_method;
  END IF;

  v_student_id := v_payment.student_id;
  v_amount     := v_payment.amount;

  -- ── EXECUTE: Mark as paid ──────────────────────────────────
  UPDATE fees_payments
     SET status      = 'paid',
         verified_by = p_verified_by,
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

-- ==========================================================================
-- void_fee_payment
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.void_fee_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_payment    RECORD;
  v_student_id UUID;
  v_amount     NUMERIC;
BEGIN
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
