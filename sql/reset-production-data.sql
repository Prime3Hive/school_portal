-- ============================================================================
-- GO-LIVE DATA RESET — TBD International Academy
-- ============================================================================
--
-- Empties the portal of every student, staff member, application, payment,
-- invitation and notification, leaving exactly one administrator login behind
-- so the school can get back in and start inviting real people.
--
-- THIS IS NOT REVERSIBLE. Supabase's point-in-time restore is the only undo,
-- and only on paid plans. Take a backup first:
--     Dashboard → Database → Backups → "Download backup"
--
-- ── HOW TO RUN ──────────────────────────────────────────────────────────────
--   1. Take the backup.
--   2. Edit KEEP_ADMIN_SCHOOL_ID below to the admin login you want to survive.
--   3. Paste the whole file into Dashboard → SQL Editor and run it.
--   4. Read the summary it prints, then COMMIT (the editor auto-commits a
--      successful run; the script aborts by itself if anything looks wrong).
--
-- The script refuses to run if the school ID you name does not match exactly
-- one admin profile. That guard is the difference between "kept my account"
-- and "locked everyone out of the portal", so do not remove it.
--
-- ── WHAT SURVIVES ───────────────────────────────────────────────────────────
--   • the one admin profile named below, and its auth user
--   • school_settings          — branding, term dates, portal configuration
--   • application_fee_schedule — what each class costs to apply to
--   • custom_roles             — role definitions, not the people holding them
--
-- Everything else in the tables listed under "wipe list" goes.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- ▼▼▼ EDIT THIS ▼▼▼ ------------------------------------------------------
  -- The school_id (login ID) of the administrator to keep, e.g. 'ADM-2026-100042'.
  KEEP_ADMIN_SCHOOL_ID CONSTANT text := 'REPLACE-WITH-YOUR-ADMIN-SCHOOL-ID';
  -- ▲▲▲ EDIT THIS ▲▲▲ ------------------------------------------------------

  keep_id      uuid;
  keep_name    text;
  keep_email   text;
  match_count  int;
  tbl          text;
  removed      bigint;
  total        bigint := 0;

  -- Wipe list, ordered children-before-parents so foreign keys never block a
  -- delete. Tables absent from this database are skipped rather than fatal:
  -- the project has grown through several migration paths and not every
  -- install has every table.
  wipe_list text[] := ARRAY[
    -- payment trail (deepest children first)
    'payment_transaction_logs',
    'payment_allocations',
    'payment_idempotency',
    'paystack_webhook_events',
    'payment_transactions',
    'fees_payments',
    'fee_items',
    -- admissions
    'applications',
    -- academic records
    'school_schedules',
    'classes',
    'documents',
    -- people-adjacent records (profiles themselves are handled below)
    'students',
    'staff',
    -- comms and housekeeping
    'notifications',
    'notification_preferences',
    'calendar_events',
    'invitations',
    'audit_logs'
  ];
BEGIN
  -- ── Guard: name exactly one surviving admin ───────────────────────────────
  IF KEEP_ADMIN_SCHOOL_ID = 'REPLACE-WITH-YOUR-ADMIN-SCHOOL-ID' THEN
    RAISE EXCEPTION
      'Set KEEP_ADMIN_SCHOOL_ID first. Find yours with:  SELECT school_id, full_name, email FROM profiles WHERE role = ''admin'';';
  END IF;

  SELECT count(*) INTO match_count
  FROM public.profiles
  WHERE school_id = KEEP_ADMIN_SCHOOL_ID AND role = 'admin';

  IF match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly 1 admin with school_id %, found %. Nothing was deleted.',
      KEEP_ADMIN_SCHOOL_ID, match_count;
  END IF;

  SELECT id, full_name, email
    INTO keep_id, keep_name, keep_email
  FROM public.profiles
  WHERE school_id = KEEP_ADMIN_SCHOOL_ID AND role = 'admin';

  RAISE NOTICE '── Keeping admin: % (%) <%>', keep_name, KEEP_ADMIN_SCHOOL_ID, keep_email;
  RAISE NOTICE '';

  -- ── Wipe the data tables ──────────────────────────────────────────────────
  FOREACH tbl IN ARRAY wipe_list LOOP
    IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
      RAISE NOTICE '   (skipped)  % — not in this database', tbl;
      CONTINUE;
    END IF;

    EXECUTE format('DELETE FROM public.%I', tbl);
    GET DIAGNOSTICS removed = ROW_COUNT;
    total := total + removed;
    RAISE NOTICE '   deleted % row(s) from %', removed, tbl;
  END LOOP;

  -- ── Profiles and auth users ───────────────────────────────────────────────
  -- Profiles first: profiles.id references auth.users(id), and deleting the
  -- parent while a child row still points at it is exactly the kind of ordering
  -- mistake that leaves a half-wiped database.
  DELETE FROM public.profiles WHERE id <> keep_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  total := total + removed;
  RAISE NOTICE '   deleted % profile(s)', removed;

  DELETE FROM auth.users WHERE id <> keep_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  total := total + removed;
  RAISE NOTICE '   deleted % auth user(s)', removed;

  -- ── Reset the application counter ─────────────────────────────────────────
  -- Cosmetic: numbers also carry a random segment, so reuse cannot collide.
  -- Without it the first application of the new session is numbered ~00087.
  IF to_regclass('public.application_number_seq') IS NOT NULL THEN
    PERFORM setval('public.application_number_seq', 1, false);
    RAISE NOTICE '   application_number_seq reset to 1';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '── Done. % row(s) removed. One admin remains: %', total, KEEP_ADMIN_SCHOOL_ID;
END $$;

COMMIT;


-- ============================================================================
-- VERIFY — run this after the reset. Every count must be 0 except profiles = 1.
-- ============================================================================
SELECT 'profiles'             AS table_name, count(*) AS rows FROM public.profiles
UNION ALL SELECT 'auth.users',              count(*) FROM auth.users
UNION ALL SELECT 'students',                count(*) FROM public.students
UNION ALL SELECT 'staff',                   count(*) FROM public.staff
UNION ALL SELECT 'applications',            count(*) FROM public.applications
UNION ALL SELECT 'fees_payments',           count(*) FROM public.fees_payments
UNION ALL SELECT 'payment_transactions',    count(*) FROM public.payment_transactions
UNION ALL SELECT 'invitations',             count(*) FROM public.invitations
UNION ALL SELECT 'notifications',           count(*) FROM public.notifications
UNION ALL SELECT 'audit_logs',              count(*) FROM public.audit_logs
UNION ALL SELECT 'school_settings (KEPT)',  count(*) FROM public.school_settings
UNION ALL SELECT 'application_fee_schedule (KEPT)', count(*) FROM public.application_fee_schedule
ORDER BY table_name;


-- ============================================================================
-- STORAGE — uploaded files are NOT touched above.
-- ============================================================================
--
-- Birth certificates, passport photos, receipts and report cards live in
-- Storage, not in these tables. Wiping the rows that referenced them leaves the
-- files behind — still real documents about real children, now with nothing
-- pointing at them.
--
-- PREFERRED: empty each bucket from Dashboard → Storage → select bucket →
-- select all → Delete. That removes the objects themselves.
--
-- The SQL below only deletes the metadata rows and orphans the underlying
-- objects, which is why it is commented out. Use it only if a bucket is too
-- large to clear through the dashboard, and follow up with the Storage API.
--
--   DELETE FROM storage.objects
--   WHERE bucket_id IN ('documents', 'profile-photos', 'assignments', 'resources');
-- ============================================================================
