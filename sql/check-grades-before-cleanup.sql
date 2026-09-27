-- ============================================================
-- READ-ONLY. Run before migrations 0028–0030 and keep the output.
-- Blocks 5 and 6 are about fees, not grades: see their notes.
-- ============================================================
-- Paste into the Supabase SQL Editor for the TBD project (check the project
-- name in the top bar first — see BACKEND_RUNBOOK.md, 19 August 2026).
-- Nothing here writes. Each block answers one question.
-- ============================================================

-- 1. Which policies exist today on the tables the new pages read and write?
--    Look for an UPDATE policy on grades that admits teachers. If there is
--    none, a teacher correcting a mark is refused until 0029 is applied.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('grades', 'fee_items', 'fees_payments', 'students')
ORDER BY tablename, cmd, policyname;

-- 2. How many pupils have more than one grade for the same assessment?
--    Every one of these is a correction that was saved as a second row
--    instead of changing the first. 0030 keeps the newest of each.
SELECT COUNT(*) AS pupil_assessment_pairs_with_duplicates,
       COALESCE(SUM(n - 1), 0) AS extra_rows_0030_will_remove
FROM (
  SELECT student_id, assessment_id, COUNT(*) AS n
  FROM public.grades
  WHERE assessment_id IS NOT NULL
  GROUP BY student_id, assessment_id
  HAVING COUNT(*) > 1
) d;

-- 2b. The duplicates themselves, so you can see which value will be kept
--     (the newest, marked keep = true).
SELECT g.student_id, g.assessment_id, g.subject, g.score, g.total_marks,
       g.created_at, g.updated_at,
       ROW_NUMBER() OVER (
         PARTITION BY g.student_id, g.assessment_id
         ORDER BY COALESCE(g.updated_at, g.created_at) DESC NULLS LAST, g.id DESC
       ) = 1 AS keep
FROM public.grades g
WHERE (g.student_id, g.assessment_id) IN (
  SELECT student_id, assessment_id FROM public.grades
  WHERE assessment_id IS NOT NULL
  GROUP BY student_id, assessment_id HAVING COUNT(*) > 1
)
ORDER BY g.student_id, g.assessment_id, keep DESC;

-- 3. How many grades have no term or session recorded?
--    Result pages cannot place these in a term. 0030 fills them in.
SELECT COUNT(*) FILTER (WHERE COALESCE(term, '') = '')          AS missing_term,
       COUNT(*) FILTER (WHERE COALESCE(academic_year, '') = '') AS missing_session,
       COUNT(*)                                                 AS all_grades
FROM public.grades;

-- 4. How many letter grades disagree with the school's scale
--    (A 90+, B 80+, C 70+, D 60+, E 50+, F below 50)? 0030 regrades them.
SELECT COUNT(*) AS grades_with_a_different_letter
FROM public.grades
WHERE total_marks > 0
  AND COALESCE(grade, '') <> CASE
        WHEN score::numeric / total_marks::numeric * 100 >= 90 THEN 'A'
        WHEN score::numeric / total_marks::numeric * 100 >= 80 THEN 'B'
        WHEN score::numeric / total_marks::numeric * 100 >= 70 THEN 'C'
        WHEN score::numeric / total_marks::numeric * 100 >= 60 THEN 'D'
        WHEN score::numeric / total_marks::numeric * 100 >= 50 THEN 'E'
        ELSE 'F' END;

-- ============================================================
-- 5. FEES: "payments" that were really charges
-- ============================================================
-- "Bulk assign fee" used to call record_fee_payment with method
-- 'bulk-assign'. The database treats that as money staff received: each row
-- is marked paid and applied to the pupil's bills. So assigning a fee to a
-- class told the system every pupil had PAID it — balances went down and
-- "collected" went up by money that never arrived.
--
-- Each row below is one of those. Void them from the portal (Fees &
-- payments → Payments → open the row → Void), which reverses what was
-- applied to the bills; void_fee_payment needs a signed-in admin, so it
-- cannot be run from this editor. Then add the fee as a charge with the
-- new "Add a fee to many pupils", which bills it instead.
SELECT id, student_name, fee_type, amount, term, academic_year, payment_date, receipt_no
FROM public.fees_payments
WHERE payment_method = 'bulk-assign'
ORDER BY payment_date DESC, student_name;

-- 6. FEES: bills with no term (created on admission or a class change
--    before this fix). Term pages cannot count them. Note the pupils; the
--    office can see and settle them from the pupil's record, Fees tab.
SELECT COUNT(*) AS bill_lines_without_a_term,
       COUNT(DISTINCT student_id) AS pupils
FROM public.fee_items
WHERE COALESCE(term, '') = '';
