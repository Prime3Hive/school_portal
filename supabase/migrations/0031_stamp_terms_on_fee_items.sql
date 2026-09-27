-- ============================================================
-- 0031 — Every bill line belongs to a term
-- ============================================================
--
-- Why
-- ---
-- Bills raised when a pupil was admitted, moved class, or given a login
-- (feeManager.applyFeeStructure) were written with term = NULL. Every page
-- that measures a term — Today, Fees & payments, the pupil's record, the
-- parent's balance — counts only the term's lines, so these bills were owed
-- but never shown as owed for any term. The code now always names the term;
-- this fills in the ones already written.
--
-- Rule (the portal's own): the term the line was created in —
--   Sep–Nov First · Dec–Mar Second · Apr–Jun Third · Jul–Aug First of the
--   coming session; the session turns over in July.
-- A line that already has a term, or a session, keeps it.
--
-- Backs up every line it changes into fee_items_term_backup_0031 first.
-- Safe to re-run: the second run finds nothing to change.
--
-- Verify: sql/check-grades-before-cleanup.sql block 6 reports 0.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.fee_items_term_backup_0031 AS
  SELECT f.*, now() AS backed_up_at FROM public.fee_items f WHERE false;
ALTER TABLE public.fee_items_term_backup_0031 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_items_term_backup_0031 FROM anon, authenticated;

INSERT INTO public.fee_items_term_backup_0031
SELECT f.*, now() FROM public.fee_items f
WHERE COALESCE(f.term, '') = '' OR COALESCE(f.academic_year, '') = '';

UPDATE public.fee_items f
SET term = CASE WHEN COALESCE(f.term, '') <> '' THEN f.term ELSE CASE
             WHEN EXTRACT(MONTH FROM f.created_at) IN (9, 10, 11)   THEN 'First Term'
             WHEN EXTRACT(MONTH FROM f.created_at) IN (12, 1, 2, 3) THEN 'Second Term'
             WHEN EXTRACT(MONTH FROM f.created_at) IN (4, 5, 6)     THEN 'Third Term'
             ELSE 'First Term' END END,
    academic_year = CASE WHEN COALESCE(f.academic_year, '') <> '' THEN REPLACE(f.academic_year, '/', '-') ELSE CASE
             WHEN EXTRACT(MONTH FROM f.created_at) >= 7
               THEN EXTRACT(YEAR FROM f.created_at)::int || '-' || (EXTRACT(YEAR FROM f.created_at)::int + 1)
             ELSE (EXTRACT(YEAR FROM f.created_at)::int - 1) || '-' || EXTRACT(YEAR FROM f.created_at)::int
             END END,
    updated_at = now()
WHERE (COALESCE(f.term, '') = '' OR COALESCE(f.academic_year, '') = '')
  AND f.created_at IS NOT NULL;

SELECT COUNT(*) AS lines_given_a_term FROM public.fee_items_term_backup_0031;

COMMIT;

-- Undo:
--   UPDATE public.fee_items f SET term = b.term, academic_year = b.academic_year
--   FROM public.fee_items_term_backup_0031 b WHERE b.id = f.id;
