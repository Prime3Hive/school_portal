-- ============================================================
-- 0025 — Align application_fee_schedule with the classes the school runs
--
-- 0014 seeded this table with Kindergarten, Nursery, Pre-Primary and
-- Grade 1-6. None of those is a class TBD International Academy runs.
-- The school's structure — in js/school-config.js, on both published fee
-- sheets and in the class register — is fourteen classes:
--
--   Creche · Pre-nursery · Nursery 1-3 · Basic 1-6 · JSS 1-3
--
-- The mismatch mattered because the admissions form offered the 0014
-- names, so an applicant could be recorded against a class that has no
-- fee anywhere in the system. sql/launch-readiness-check.sql already
-- reported this as "12 rows (school-config defines 14 grades)".
--
-- Safe to re-run.
-- ============================================================

BEGIN;

-- 1. The fourteen classes, at the current application fee.
INSERT INTO public.application_fee_schedule (grade, amount) VALUES
  ('Creche',      5000),
  ('Pre-nursery', 5000),
  ('Nursery 1',   5000),
  ('Nursery 2',   5000),
  ('Nursery 3',   5000),
  ('Basic 1',     5000),
  ('Basic 2',     5000),
  ('Basic 3',     5000),
  ('Basic 4',     5000),
  ('Basic 5',     5000),
  ('Basic 6',     5000),
  ('JSS 1',       7500),
  ('JSS 2',       7500),
  ('JSS 3',       7500)
ON CONFLICT (grade) DO UPDATE
  SET amount = EXCLUDED.amount,
      updated_at = now();

-- 2. Retire the names that were never classes here.
--    No foreign key points at this table, so removing a row cannot orphan
--    an application; it only stops the name being quoted a price in future.
DELETE FROM public.application_fee_schedule
 WHERE grade NOT IN (
   'Creche', 'Pre-nursery',
   'Nursery 1', 'Nursery 2', 'Nursery 3',
   'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6',
   'JSS 1', 'JSS 2', 'JSS 3'
 );

COMMIT;

-- Verification: expect 14 rows, and no row outside the list above.
--   SELECT count(*) FROM public.application_fee_schedule;
--   SELECT grade, amount FROM public.application_fee_schedule ORDER BY grade;
