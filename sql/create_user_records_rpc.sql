-- ============================================================
-- create_user_records — Atomic user record creation
-- Called by the create-user-immediate Edge Function.
-- Creates profile + student/staff in a single transaction so
-- a partial failure cannot leave the DB in an inconsistent state.
-- ============================================================

CREATE OR REPLACE FUNCTION create_user_records(
  p_auth_id   UUID,
  p_email     TEXT,
  p_full_name TEXT,
  p_role      TEXT,
  p_school_id TEXT,
  p_grade     TEXT    DEFAULT NULL,
  p_section   TEXT    DEFAULT 'A',
  p_gender    TEXT    DEFAULT NULL,
  p_dob       DATE    DEFAULT NULL,
  p_photo     TEXT    DEFAULT NULL,
  p_guardian  JSONB   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Grant execute to the service role (used by the Edge Function)
GRANT EXECUTE ON FUNCTION create_user_records TO service_role;

COMMENT ON FUNCTION create_user_records IS
  'Atomically creates a profile + student/staff row in one transaction. '
  'Called by the create-user-immediate Edge Function after Auth user creation succeeds.';
