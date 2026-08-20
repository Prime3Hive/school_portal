-- ============================================================
-- 0026 — Let the public pages read the settings an admin edits
--
-- school_settings is readable by `authenticated` only (0013), which is
-- right: settings_json holds the whole portal configuration. But it also
-- holds the bank account, the school phone, email and address — the
-- things the public site prints on every page.
--
-- The effect was that an admin editing the bank account in Settings
-- changed it in the portal and nowhere else. A visitor to /admissions is
-- anon, so the public page kept showing whatever was compiled into
-- js/fee-structure.js, and the two could disagree indefinitely.
--
-- This exposes a narrow, read-only view of the fields that are already
-- public — the bank account is printed on both fee sheets handed to every
-- parent, and the contact details are in the footer of every page. It does
-- NOT expose settings_json. Anything added to settings later stays private
-- unless it is named here explicitly.
--
-- The view runs with the owner's rights (security_invoker = false) so it
-- can read through the base table's RLS. That is the point of it, and the
-- reason the column list is a whitelist rather than a passthrough.
--
-- settings_json is json on some installs, jsonb on others and text on at
-- least one (see sql/fix-launch-blockers.sql), so it is cast through text
-- to jsonb, which is valid from all three.
--
-- Safe to re-run.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.public_school_settings;

CREATE VIEW public.public_school_settings
WITH (security_invoker = false) AS
SELECT
  (settings_json::text)::jsonb ->> 'schoolName'      AS school_name,
  (settings_json::text)::jsonb ->> 'schoolPhone'     AS school_phone,
  (settings_json::text)::jsonb ->> 'schoolEmail'     AS school_email,
  (settings_json::text)::jsonb ->> 'schoolAddress'   AS school_address,
  (settings_json::text)::jsonb ->> 'bankName'        AS bank_name,
  (settings_json::text)::jsonb ->> 'bankAccountNo'   AS bank_account_no,
  (settings_json::text)::jsonb ->> 'bankAccountName' AS bank_account_name,
  (settings_json::text)::jsonb ->> 'academicYear'    AS academic_year
FROM public.school_settings
WHERE id = 1;

COMMENT ON VIEW public.public_school_settings IS
  'Whitelisted, read-only projection of school_settings for anon visitors. '
  'Only fields the public site already displays. Never add a key here that '
  'is not safe to hand to an unauthenticated reader.';

REVOKE ALL ON public.public_school_settings FROM PUBLIC;
GRANT SELECT ON public.public_school_settings TO anon, authenticated;

COMMIT;

-- Verification: should return one row, and no settings_json column.
--   SELECT * FROM public.public_school_settings;
