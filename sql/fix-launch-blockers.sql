-- ============================================================================
-- FIX THE TWO LAUNCH BLOCKERS FOUND ON 19 AUGUST 2026
-- ============================================================================
--
-- ⚠️  THIS WRITES. Take a backup first: Dashboard -> Database -> Backups.
--
-- Two problems, both found by sql/launch-readiness-check.sql:
--
--   1. school_settings holds a 2025/2026 fee structure that silently overrides
--      the 2026/2027 one in js/fee-structure.js.
--   2. The `profile-photos` storage bucket is PUBLIC.
--
-- Run the whole file. It is idempotent — running it twice changes nothing the
-- second time.
-- ============================================================================

-- ── Wrong-database guard ────────────────────────────────────────────────────
-- On 19 August 2026 migrations were run against a different Supabase project.
-- Refuse to write unless this is the school portal's database.
DO $guard$
BEGIN
  IF to_regclass('public.students') IS NULL THEN
    RAISE EXCEPTION
      'WRONG DATABASE: public.students does not exist. Run sql/diagnose-database.sql.';
  END IF;
END
$guard$;

BEGIN;

-- ============================================================
-- 1. Drop the stale fee-structure override
-- ============================================================
-- js/fee-structure.js loadFromSupabase() does this:
--
--     for (const [grade, items] of Object.entries(saved.feeItems)) {
--       if (Array.isArray(items) && items.length > 0) {
--         this.feeItems[grade] = items.map(...);      // REPLACES the grade
--       }
--     }
--     if (saved.academicYear) this.academicYear = saved.academicYear;
--
-- It replaces only the grades present in the saved data and leaves the rest on
-- the code's defaults. With a 2025/2026 structure saved, the portal therefore
-- prices SOME grades at last session's rates and others at this session's — a
-- silent mix, which is worse than being wholly out of date.
--
-- It also never touches `newIntakeItems`, so the new-intake uniform would come
-- from the 2026/2027 code while the base items came from the 2025/2026
-- database. Assigning fees in that state would bill families incorrectly.
--
-- Removing the key makes js/fee-structure.js authoritative again. Everything
-- else in settings_json — branding, term dates, portal configuration — is left
-- untouched. The admin Settings page can save a fresh override later; it will
-- then be a 2026/2027 one.
--
-- The column is json on some installs and jsonb on others, and the `-` operator
-- only exists for jsonb, so adapt rather than assume.
DO $fix$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'school_settings'
     AND column_name  = 'settings_json';

  IF col_type = 'jsonb' THEN
    EXECUTE $q$UPDATE public.school_settings
                  SET settings_json = settings_json - 'feeStructure',
                      updated_at    = NOW()$q$;
  ELSIF col_type = 'json' THEN
    EXECUTE $q$UPDATE public.school_settings
                  SET settings_json = ((settings_json::jsonb) - 'feeStructure')::json,
                      updated_at    = NOW()$q$;
  ELSE
    EXECUTE $q$UPDATE public.school_settings
                  SET settings_json = ((settings_json::jsonb) - 'feeStructure')::text,
                      updated_at    = NOW()$q$;
  END IF;
END
$fix$;

-- ============================================================
-- 2. Take the profile-photos bucket private
-- ============================================================
-- A public bucket is readable by anyone who knows or guesses the URL, with no
-- sign-in. This one is meant to hold photographs of children.
--
-- Nothing reads it today: `profile-photos` appears once in the whole codebase,
-- as a name in js/config.js, and no code uploads to or reads from it.
-- students.photo holds an emoji ('👤') or a pasted value, not a bucket path.
-- So flipping it private breaks nothing — and stops it being a hole the first
-- time someone does start uploading pupil photographs.
--
-- Contrast migration 0015, which had to be sequenced carefully because the
-- `documents` bucket was in active use with permanent public URLs stored in the
-- database. There is no such constraint here.
UPDATE storage.buckets
   SET public = false
 WHERE id = 'profile-photos'
   AND public = true;

COMMIT;

-- ------------------------------------------------------------------
-- VERIFY — expected results are stated on each line
-- ------------------------------------------------------------------
select 'fee structure override' as check_name,
       coalesce((select settings_json #>> '{feeStructure,academicYear}'
                   from public.school_settings limit 1),
                'cleared — the code (2026-2027) is authoritative') as value
                -- expected: cleared

union all
select 'settings_json survived',
       case when exists (select 1 from public.school_settings
                          where settings_json is not null)
            then 'yes — other settings intact' else 'EMPTY — investigate' end
                -- expected: yes

union all
select 'public buckets remaining',
       coalesce((select string_agg(id, ', ' order by id)
                   from storage.buckets where public), 'none')
                -- expected: none

union all
-- 14 grades are defined in js/school-config.js. The readiness check found 12
-- rows here, so two classes may have no application fee set. Applying to one
-- of those would charge nothing.
select 'application_fee_schedule',
       (select count(*)::text || ' rows (school-config defines 14 grades)'
          from public.application_fee_schedule);
