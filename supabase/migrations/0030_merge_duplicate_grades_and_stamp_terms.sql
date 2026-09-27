-- ============================================================
-- 0030 — One grade per pupil per assessment, every grade in a term,
--        every letter on the school's scale
-- ============================================================
--
-- Why
-- ---
-- Before the score book (js/score-book.js), both mark-entry screens saved
-- every mark with INSERT and recorded no term or session:
--   * a corrected mark left the old grade in place beside the new one, and
--     results pooled both, so a pupil's average moved when a teacher fixed
--     a typo;
--   * grades with no term cannot be placed on a report or a results page;
--   * letters came from three different scales (A+ … F, A … F with other
--     cut-offs), none of them the school's.
--
-- Run sql/check-grades-before-cleanup.sql first; it shows exactly which rows
-- each step below touches.
--
-- What this does, in one transaction
-- ----------------------------------
--   0. Copies every row it will delete or change into
--      grades_cleanup_backup_0030, with the reason. Nothing is lost; see
--      "Undo" at the end.
--   1. Duplicates: for each pupil and assessment, keeps the grade saved most
--      recently (that is the correction) and deletes the rest.
--   2. Term and session: fills them from the assessment where the school
--      set one, otherwise from the assessment's date, otherwise from when
--      the grade was saved. The rule is the portal's own:
--        Sep–Nov First Term · Dec–Mar Second Term · Apr–Jun Third Term ·
--        Jul–Aug First Term of the coming session;
--        the session turns over in July.
--   3. Percentage and letter: recomputed from score and total on the
--      school's scale — the highest band whose minimum is reached:
--        A 90 · B 80 · C 70 · D 60 · E 50 · F below 50.
--
-- Verify after applying: run sql/check-grades-before-cleanup.sql again.
-- Blocks 2, 3 and 4 should all report 0.
-- ============================================================

BEGIN;

-- ── 0. Backup ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.grades_cleanup_backup_0030 AS
  SELECT g.*, ''::text AS cleanup_reason, now() AS backed_up_at
  FROM public.grades g
  WHERE false;

-- Only staff should ever read this.
ALTER TABLE public.grades_cleanup_backup_0030 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grades_cleanup_backup_0030 FROM anon, authenticated;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY student_id, assessment_id
           ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.grades
  WHERE assessment_id IS NOT NULL
)
INSERT INTO public.grades_cleanup_backup_0030
SELECT g.*, 'duplicate removed', now()
FROM public.grades g
JOIN ranked r ON r.id = g.id
WHERE r.rn > 1;

INSERT INTO public.grades_cleanup_backup_0030
SELECT g.*, 'term, session, percentage or letter changed', now()
FROM public.grades g
WHERE g.id NOT IN (SELECT id FROM public.grades_cleanup_backup_0030)
  AND (
    COALESCE(g.term, '') = '' OR COALESCE(g.academic_year, '') = ''
    OR (g.total_marks > 0 AND (
      g.percentage IS DISTINCT FROM ROUND(g.score::numeric / g.total_marks::numeric * 100, 1)
      OR COALESCE(g.grade, '') <> CASE
        WHEN g.score::numeric / g.total_marks::numeric * 100 >= 90 THEN 'A'
        WHEN g.score::numeric / g.total_marks::numeric * 100 >= 80 THEN 'B'
        WHEN g.score::numeric / g.total_marks::numeric * 100 >= 70 THEN 'C'
        WHEN g.score::numeric / g.total_marks::numeric * 100 >= 60 THEN 'D'
        WHEN g.score::numeric / g.total_marks::numeric * 100 >= 50 THEN 'E'
        ELSE 'F' END
    ))
  );

-- ── 1. Duplicates ────────────────────────────────────────────
DELETE FROM public.grades
WHERE id IN (
  SELECT id FROM public.grades_cleanup_backup_0030 WHERE cleanup_reason = 'duplicate removed'
);

-- ── 2. Term and session ──────────────────────────────────────
-- The date each grade belongs to: the assessment's date if there is one,
-- else when the grade was saved.
WITH dated AS (
  SELECT g.id,
         COALESCE(NULLIF(a.term, ''), NULL)          AS school_term,
         COALESCE(NULLIF(a.academic_year, ''), NULL) AS school_year,
         COALESCE(NULLIF(a.date::text, '')::date, NULLIF(ta.date::text, '')::date, g.created_at::date) AS on_day
  FROM public.grades g
  LEFT JOIN public.assessments a          ON a.id::text  = g.assessment_id::text
  LEFT JOIN public.teacher_assessments ta ON ta.id::text = g.assessment_id::text
  WHERE COALESCE(g.term, '') = '' OR COALESCE(g.academic_year, '') = ''
),
derived AS (
  SELECT id,
         COALESCE(school_term, CASE
           WHEN EXTRACT(MONTH FROM on_day) IN (9, 10, 11)   THEN 'First Term'
           WHEN EXTRACT(MONTH FROM on_day) IN (12, 1, 2, 3) THEN 'Second Term'
           WHEN EXTRACT(MONTH FROM on_day) IN (4, 5, 6)     THEN 'Third Term'
           ELSE 'First Term' END)                                       AS term,
         COALESCE(REPLACE(school_year, '/', '-'), CASE
           WHEN EXTRACT(MONTH FROM on_day) >= 7
             THEN EXTRACT(YEAR FROM on_day)::int || '-' || (EXTRACT(YEAR FROM on_day)::int + 1)
           ELSE (EXTRACT(YEAR FROM on_day)::int - 1) || '-' || EXTRACT(YEAR FROM on_day)::int
           END)                                                          AS academic_year
  FROM dated
  WHERE on_day IS NOT NULL
)
UPDATE public.grades g
SET term          = CASE WHEN COALESCE(g.term, '') = '' THEN d.term ELSE g.term END,
    academic_year = CASE WHEN COALESCE(g.academic_year, '') = '' THEN d.academic_year ELSE g.academic_year END,
    updated_at    = now()
FROM derived d
WHERE d.id = g.id;

-- ── 3. Percentage and letter ─────────────────────────────────
UPDATE public.grades
SET percentage = ROUND(score::numeric / total_marks::numeric * 100, 1),
    grade = CASE
      WHEN score::numeric / total_marks::numeric * 100 >= 90 THEN 'A'
      WHEN score::numeric / total_marks::numeric * 100 >= 80 THEN 'B'
      WHEN score::numeric / total_marks::numeric * 100 >= 70 THEN 'C'
      WHEN score::numeric / total_marks::numeric * 100 >= 60 THEN 'D'
      WHEN score::numeric / total_marks::numeric * 100 >= 50 THEN 'E'
      ELSE 'F' END,
    updated_at = now()
WHERE total_marks > 0
  AND (
    percentage IS DISTINCT FROM ROUND(score::numeric / total_marks::numeric * 100, 1)
    OR COALESCE(grade, '') <> CASE
      WHEN score::numeric / total_marks::numeric * 100 >= 90 THEN 'A'
      WHEN score::numeric / total_marks::numeric * 100 >= 80 THEN 'B'
      WHEN score::numeric / total_marks::numeric * 100 >= 70 THEN 'C'
      WHEN score::numeric / total_marks::numeric * 100 >= 60 THEN 'D'
      WHEN score::numeric / total_marks::numeric * 100 >= 50 THEN 'E'
      ELSE 'F' END
  );

-- What happened, for the record.
SELECT cleanup_reason, COUNT(*) FROM public.grades_cleanup_backup_0030 GROUP BY cleanup_reason;

COMMIT;

-- ============================================================
-- Undo (only if something is wrong)
-- ---------------------------------
-- 1. Put the removed duplicates back. List public.grades' columns in both
--    places (the backup has the same columns plus two of its own):
--
--      INSERT INTO public.grades (<every grades column>)
--      SELECT <every grades column> FROM public.grades_cleanup_backup_0030
--      WHERE cleanup_reason = 'duplicate removed';
--
-- 2. Restore the old term, session, percentage and letter:
--
--      UPDATE public.grades g
--      SET term = b.term, academic_year = b.academic_year,
--          percentage = b.percentage, grade = b.grade
--      FROM public.grades_cleanup_backup_0030 b
--      WHERE b.id = g.id AND b.cleanup_reason <> 'duplicate removed';
--
-- Keep grades_cleanup_backup_0030 until the term's reports have gone out.
-- ============================================================
