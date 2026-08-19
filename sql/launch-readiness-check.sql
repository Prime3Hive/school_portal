-- ============================================================================
-- IS THIS DATABASE READY FOR THE DATA LOAD?
-- ============================================================================
--
-- Read-only. Writes nothing. Safe on production.
--
-- All 24 migrations report as applied. This checks the things that decide
-- whether the school can actually use the portal, which migration state alone
-- does not tell you:
--
--   * Is there an admin account to sign in with? The go-live wipe leaves
--     exactly one. If it left none, nobody can get in and nothing else matters.
--   * Did 0024 create the RLS POLICY, not just the column? The column is
--     harmless on its own; the policy is what stops one guardian reading
--     another family's records.
--   * Does school_settings override the fee structure in the code? A saved
--     2025-2026 structure silently wins over js/fee-structure.js at runtime.
--
-- Exact counts, not planner estimates — the tables are small enough that a real
-- count is instant, and `~0 rows` from pg_stat_user_tables can mean
-- "never analysed" rather than "empty".
--
-- Paste the whole file into Dashboard -> SQL Editor and run it.
-- ============================================================================

select 'CAN ANYONE SIGN IN' as area, '' as item, '' as value
union all
  select '', 'auth users', (select count(*)::text from auth.users)
union all
  select '', 'profiles', (select count(*)::text from public.profiles)
union all
  select '', 'admins', (select count(*)::text from public.profiles where role = 'admin')
union all
  select '', 'profiles by role',
    coalesce((select string_agg(role || '=' || n, ', ' order by role)
                from (select role, count(*) n from public.profiles group by role) x), 'none')

union all select 'GUARDIAN ACCESS (0024)', '', ''
union all
  select '', 'students.guardian_auth_id column',
    case when exists (select 1 from information_schema.columns
                       where table_schema='public' and table_name='students'
                         and column_name='guardian_auth_id')
         then 'present' else 'MISSING' end
union all
  -- The security-critical half. Without this the column is inert and the
  -- guardian portal returns nothing.
  select '', 'RLS policy students_guardian_select',
    case when exists (select 1 from pg_policy
                       where polrelid = 'public.students'::regclass
                         and polname = 'students_guardian_select')
         then 'present' else 'MISSING — 0024 did not finish' end
union all
  select '', 'RLS enabled on students',
    case when coalesce((select relrowsecurity from pg_class
                         where oid = 'public.students'::regclass), false)
         then 'yes' else 'NO — policies are not enforced' end

union all select 'FEE STRUCTURE', '', ''
union all
  -- js/fee-structure.js now holds 2026-2027. If a structure is saved here it
  -- overrides the code, so an old one silently wins.
  select '', 'school_settings override',
    coalesce((select settings_json #>> '{feeStructure,academicYear}'
                from public.school_settings limit 1),
             'none saved — the code (2026-2027) is authoritative')
union all
  select '', 'application_fee_schedule rows',
    (select count(*)::text from public.application_fee_schedule)

union all select 'DATA TO LOAD', '', ''
union all select '', 'students', (select count(*)::text from public.students)
union all select '', 'staff',    (select count(*)::text from public.staff)
union all select '', 'classes',  (select count(*)::text from public.classes)
union all select '', 'fee_items',(select count(*)::text from public.fee_items)

union all select 'STORAGE', '', ''
union all
  select '', 'buckets',
    coalesce((select string_agg(id || case when public then ' (PUBLIC)' else ' (private)' end,
                                ', ' order by id) from storage.buckets), 'none');
