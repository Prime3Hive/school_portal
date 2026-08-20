-- ============================================================
-- 0027 — Correct the placeholder values stored in school_settings
--
-- The saved settings row still holds the values the portal shipped with:
--
--   bankName        First Bank of Nigeria   ->  Keystone Bank
--   bankAccountNo   0123456789              ->  1013525760
--   bankAccountName TBD Academy             ->  TBD International Academy
--   bankSortCode    011151003               ->  (cleared, see below)
--   schoolPhone     +234-800-000-0000       ->  0707 171 1692
--   schoolEmail     info@tbdacademy.org     ->  support@tbdacademy.org
--   schoolAddress   Makurdi Benue State...  ->  Behind Civil Service Commission, Kertyo, Makurdi
--   academicYear    2024/2025               ->  2026/2027
--
-- js/config.js already maps these in the browser, via LEGACY_SCHOOL_VALUES,
-- so the portal displayed the corrected values while the database kept the
-- placeholders. 0026 then exposed those same stored values to anon readers
-- through public_school_settings, which is read by the public admissions
-- page — so the stale row became visible to parents. The mapping has to
-- exist in the data, not only in the client that happens to load config.js.
--
-- A value is only replaced when it still exactly matches the placeholder.
-- Anything an admin has actually typed is left alone, which is the same
-- rule LEGACY_SCHOOL_VALUES applies.
--
-- The sort code is cleared rather than replaced: 011151003 is First Bank's
-- and means nothing against a Keystone account, and no sort code for the
-- real account appears in any school document.
--
-- settings_json is json on some installs, jsonb on others and text on at
-- least one, and jsonb_set is jsonb-only, so this adapts rather than
-- assuming. Safe to re-run.
-- ============================================================

DO $fix$
DECLARE
  col_type text;
  updated  jsonb;
  pairs    text[][] := ARRAY[
    ['bankName',        'First Bank of Nigeria',                 'Keystone Bank'],
    ['bankAccountNo',   '0123456789',                            '1013525760'],
    ['bankAccountName', 'TBD Academy',                            'TBD International Academy'],
    ['bankSortCode',    '011151003',                              ''],
    ['schoolPhone',     '+234-800-000-0000',                      '0707 171 1692'],
    ['schoolPhone',     '0803 061 4777',                          '0707 171 1692'],
    ['schoolEmail',     'info@tbdacademy.org',                    'support@tbdacademy.org'],
    ['schoolAddress',   'Makurdi Benue State, Nigeria',           'Behind Civil Service Commission, Kertyo, Makurdi'],
    ['schoolName',      'TBD Academy',                            'TBD International Academy'],
    ['academicYear',    '2024/2025',                              '2026/2027'],
    ['academicYear',    '2025/2026',                              '2026/2027']
  ];
  i int;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'school_settings'
     AND column_name  = 'settings_json';

  IF col_type IS NULL THEN
    RAISE NOTICE '0027: school_settings.settings_json not found, nothing to do';
    RETURN;
  END IF;

  SELECT (settings_json::text)::jsonb INTO updated
    FROM public.school_settings WHERE id = 1;

  IF updated IS NULL THEN
    RAISE NOTICE '0027: no settings row with id = 1, nothing to do';
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(pairs, 1) LOOP
    -- Replace only an untouched placeholder; an admin's own value stands.
    IF updated ->> pairs[i][1] = pairs[i][2] THEN
      updated := jsonb_set(updated, ARRAY[pairs[i][1]], to_jsonb(pairs[i][3]::text), true);
      RAISE NOTICE '0027: % : % -> %', pairs[i][1], pairs[i][2], pairs[i][3];
    END IF;
  END LOOP;

  IF col_type = 'jsonb' THEN
    UPDATE public.school_settings
       SET settings_json = updated, updated_at = NOW() WHERE id = 1;
  ELSIF col_type = 'json' THEN
    UPDATE public.school_settings
       SET settings_json = updated::json, updated_at = NOW() WHERE id = 1;
  ELSE
    UPDATE public.school_settings
       SET settings_json = updated::text, updated_at = NOW() WHERE id = 1;
  END IF;
END
$fix$;

-- Verification: every value below should be the corrected one.
--   SELECT * FROM public.public_school_settings;
