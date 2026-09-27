-- ============================================================
-- 0029 — Teachers can correct marks they entered
-- ============================================================
--
-- Why
-- ---
-- Until now every mark was saved with INSERT, even a correction, so a pupil
-- ended up with two grades for one assessment. The score book
-- (js/score-book.js) now updates the existing grade instead. That needs an
-- UPDATE policy on grades that admits the teacher who entered the mark; no
-- migration in this folder creates one, and a refused update is reported to
-- the teacher as "could not be saved".
--
-- Run sql/check-grades-before-cleanup.sql block 1 first. If it already shows
-- an UPDATE policy on grades that admits teachers, this is harmless: policies
-- are OR'd, and this one only adds access for the rows described below.
--
-- What this allows
-- ----------------
--   * admin: update any grade (the Academic Hub corrects marks for anyone).
--   * teacher: update a grade they entered themselves (graded_by = their
--     auth id, which is what the score book records). A mark another teacher
--     or the office entered stays theirs to change.
--   The row after the update must still satisfy the same rule, so a teacher
--   cannot hand a grade to someone else by rewriting graded_by.
--
-- Safe to re-run.
--
-- Verify after applying
-- ---------------------
--   As a teacher: open Enter scores, change a mark you saved earlier, save.
--   It says "(1 corrected)" and the Results page shows the new mark once.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS grades_update_own_or_admin ON public.grades;
CREATE POLICY grades_update_own_or_admin ON public.grades
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_has_role(ARRAY['admin'])
    OR (public.current_user_has_role(ARRAY['teacher']) AND graded_by::text = auth.uid()::text)
  )
  WITH CHECK (
    public.current_user_has_role(ARRAY['admin'])
    OR (public.current_user_has_role(ARRAY['teacher']) AND graded_by::text = auth.uid()::text)
  );

COMMIT;
