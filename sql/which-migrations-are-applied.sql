-- ============================================================================
-- WHICH MIGRATIONS ARE ALREADY APPLIED?
-- ============================================================================
--
-- Read-only. Writes nothing. Safe on production.
--
-- `_migration_history` does not exist on this database, so nothing has recorded
-- what was applied. This checks for the artefact each migration leaves behind
-- and reports APPLIED or NOT APPLIED per file.
--
-- Every migration in this folder is idempotent, so re-running one that already
-- ran is harmless. This exists so you can skip the ones that don't need running
-- and know exactly where you stand.
--
-- ONE statement: the Supabase SQL Editor only shows the last result, so
-- everything comes back as a single table.
--
-- Paste the whole file into Dashboard -> SQL Editor and run it.
-- ============================================================================

with checks(seq, migration, artefact, applied) as (
  values
  (1,  '0001 notifications table',        'table notifications',
       to_regclass('public.notifications') is not null),

  (2,  '0002 applications table',         'table applications',
       to_regclass('public.applications') is not null),

  (3,  '0003 calendar events',            'table calendar_events',
       to_regclass('public.calendar_events') is not null),

  (4,  '0004 settings + custom roles',    'tables school_settings, custom_roles',
       to_regclass('public.school_settings') is not null
       and to_regclass('public.custom_roles') is not null),

  (5,  '0005 notification prefs',         'table notification_preferences',
       to_regclass('public.notification_preferences') is not null),

  (6,  '0006 payment transaction log',    'table payment_transaction_logs',
       to_regclass('public.payment_transaction_logs') is not null),

  (7,  '0007 payment allocations',        'table payment_allocations',
       to_regclass('public.payment_allocations') is not null),

  (8,  '0008 payment idempotency',        'table payment_idempotency',
       to_regclass('public.payment_idempotency') is not null),

  (9,  '0009 paystack webhooks',          'table paystack_webhook_events',
       to_regclass('public.paystack_webhook_events') is not null),

  (10, '0010 payment constraints',        'fees_payments.deleted_at',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='fees_payments'
                  and column_name='deleted_at')),

  (11, '0011 verification columns',       'fees_payments.verified_by',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='fees_payments'
                  and column_name='verified_by')),

  (12, '0012 applications schema',        'applications.student_name',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='applications'
                  and column_name='student_name')),

  (13, '0013 RLS hardening',              'function current_user_has_role()',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='current_user_has_role')),

  (14, '0014 secure admissions',          'table application_fee_schedule',
       to_regclass('public.application_fee_schedule') is not null),

  (15, '0015 documents bucket private',   'storage bucket not public',
       exists (select 1 from storage.buckets where id='documents' and public=false)),

  (16, '0016 close document reads',       'policy on storage.objects',
       exists (select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid
               join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='storage' and c.relname='objects')),

  (17, '0017 RLS on payment tables',      'payment_transaction_logs RLS on',
       coalesce((select relrowsecurity from pg_class c join pg_namespace n
                   on n.oid=c.relnamespace
                  where n.nspname='public'
                    and c.relname='payment_transaction_logs'), false)),

  (18, '0018 views respect caller RLS',   'a view with security_invoker',
       exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relkind='v'
                  and array_to_string(c.reloptions,',') like '%security_invoker%')),

  (19, '0019 revoke anon on fee fns',     'anon cannot EXECUTE record_fee_payment',
       not coalesce(has_function_privilege('anon',
         'public.record_fee_payment(jsonb)', 'EXECUTE'), false)),

  (20, '0020 authorize fee functions',    'record_fee_payment raises FORBIDDEN',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='record_fee_payment'
                  and pg_get_functiondef(p.oid) like '%FORBIDDEN%')),

  (21, '0021 pin search_path',            'current_user_has_role has search_path set',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and p.proname='current_user_has_role'
                  and array_to_string(p.proconfig,',') like '%search_path%')),

  (22, '0022 account provisioning',       'profiles.must_change_password',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='profiles'
                  and column_name='must_change_password')),

  (23, '0023 lock fee_item balances',     'authenticated cannot UPDATE fee_items',
       not coalesce(has_table_privilege('authenticated',
         'public.fee_items', 'UPDATE'), false)),

  (24, '0024 link students to guardians', 'students.guardian_auth_id',
       exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='students'
                  and column_name='guardian_auth_id'))
)
select
  migration,
  case when applied then 'APPLIED' else '>>> NOT APPLIED — RUN THIS' end as status,
  artefact as checked_for
from checks
order by seq;
