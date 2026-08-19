-- ============================================================================
-- WHICH DATABASE AM I LOOKING AT, AND WHAT IS IN IT?
-- ============================================================================
--
-- Read-only. Writes nothing, locks nothing, safe on production.
--
-- Run this when a migration fails with `relation "public.<table>" does not
-- exist`. That error means one of three things, and this tells you which:
--
--   1. The SQL Editor is open on a different Supabase project than you think.
--      Far and away the most common cause once more than one project exists.
--   2. The tables live in a schema other than `public`.
--   3. The tables genuinely are not there.
--
-- ONE statement on purpose: the Supabase SQL Editor only displays the result of
-- the LAST statement it runs, so a file of separate SELECTs silently shows you
-- just the final one. Everything below comes back as a single table.
--
-- Paste the whole file into Dashboard -> SQL Editor and run it.
-- ============================================================================

with
-- Cross-check `database` against the project ref in the dashboard URL:
--   https://supabase.com/dashboard/project/<THIS IS THE REF>/sql
connection as (
  select
    current_database()             as db,
    current_user                   as usr,
    current_setting('search_path') as sp
),

-- The tables the portal cannot run without. None of these is created by any
-- file in supabase/migrations/ — they were made by hand in the dashboard.
-- NOTE: `documents` is deliberately absent. It is a STORAGE BUCKET, not a
-- table — every `.from('documents')` in the app is `supabase.storage.from(...)`.
-- An earlier version of this file listed it here and reported it MISSING on a
-- perfectly healthy database.
core(name) as (
  values ('students'), ('staff'), ('profiles'), ('classes'),
         ('fee_items'), ('fees_payments'), ('invitations'),
         ('audit_logs'), ('payment_transactions'), ('school_schedules')
),

-- Row estimates come from the planner, so this stays instant and never scans.
counts as (
  select relname, n_live_tup from pg_stat_user_tables
)

select * from (
  select 1 as sort, 0 as sub, 'WHERE AM I'            as check_name, ''                                   as value
  union all select 1, 1, 'database',                  (select db  from connection)
  union all select 1, 2, 'connected as',              (select usr from connection)
  union all select 1, 3, 'search_path',               (select sp  from connection)

  union all select 2, 0, 'CORE TABLES', ''
  union all
    select 2, 1, '  ' || name,
           case when to_regclass('public.' || name) is null
                then 'MISSING'
                else 'exists, ~' || coalesce((select n_live_tup from counts where relname = name), 0)::text || ' rows'
           end
      from core

  union all select 3, 0, 'TOTALS', ''
  union all select 3, 1, '  base tables in public',
    (select count(*)::text from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE')
  union all select 3, 2, '  core tables present',
    (select count(*)::text || ' of 10' from core where to_regclass('public.' || name) is not null)
  union all select 3, 3, '  rows across all tables',
    (select coalesce(sum(n_live_tup), 0)::text from counts)

  -- run-migrations.js creates `_migration_history`. Absent means migrations
  -- have only ever been applied by hand through the dashboard.
  union all select 4, 0, 'MIGRATION LOG', ''
  union all select 4, 1, '  _migration_history',
    coalesce(to_regclass('public._migration_history')::text, 'MISSING')

  -- If the core tables read MISSING above but turn up here under another
  -- schema, the problem is search_path, not a missing database.
  union all select 5, 0, 'CORE TABLES FOUND IN OTHER SCHEMAS', ''
  union all
    select 5, 1, '  ' || schemaname || '.' || tablename, 'found outside public'
      from pg_tables
     where schemaname not in ('public', 'pg_catalog', 'information_schema')
       and tablename in (select name from core)
) rows
order by sort, sub, check_name;
