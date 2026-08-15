# Database Migrations

## Convention

Files are numbered sequentially: `NNNN_description.sql`

| # | File | Description |
|---|------|-------------|
| 0001 | `0001_create_notifications_table.sql` | Notifications + RLS |
| 0002 | `0002_create_applications_table.sql` | Admissions applications |
| 0003 | `0003_create_calendar_events_table.sql` | Academic calendar |
| 0004 | `0004_school_settings_and_custom_roles.sql` | School config + custom roles |
| 0005 | `0005_notification_preferences.sql` | Per-user notification prefs |
| 0006 | `0006_payment_transaction_log.sql` | Immutable payment audit trail |
| 0007 | `0007_payment_allocations.sql` | Payment → fee-item mapping |
| 0008 | `0008_payment_idempotency.sql` | Duplicate payment prevention |
| 0009 | `0009_paystack_webhooks.sql` | Paystack event audit log |
| 0010 | `0010_enhance_payment_constraints.sql` | Payment integrity constraints |
| 0011 | `0011_add_payment_verification_columns.sql` | Bank deposit verification columns |
| 0012 | `0012_update_applications_schema.sql` | Applications schema alignment |
| 0013 | `0013_harden_rls_policies.sql` | RLS hardening across every table |
| 0014 | `0014_secure_admissions_flow.sql` | Server-side admissions + fee authority |
| 0015 | `0015_private_documents_bucket.sql` | Private storage bucket for documents |
| 0016 | `0016_close_document_read_exposure.sql` | Close document read exposure |
| 0017 | `0017_enable_rls_on_payment_tables.sql` | RLS on the payment tables |
| 0018 | `0018_views_respect_caller_rls.sql` | Views stop bypassing caller RLS |
| 0019 | `0019_revoke_anon_execute_on_fee_functions.sql` | Revoke anon EXECUTE on fee functions |
| 0020 | `0020_authorize_fee_functions.sql` | Authorization inside the fee functions |
| 0021 | `0021_pin_search_path_and_revoke_triggers.sql` | Pin `search_path`, revoke trigger functions |
| 0022 | `0022_consolidate_account_provisioning.sql` | One account-creation path; drops the plaintext password column |

`archive/` holds superseded files that must never be run — see `archive/README.md`.

## Running Migrations

### Supabase Dashboard — the way to do this
1. Open Supabase Dashboard → SQL Editor.
2. Paste the migration and run it. Apply them **in order**.
3. Each migration is idempotent (`CREATE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `DROP ... IF EXISTS`), so a re-run is safe.
4. Run the `VERIFY` block at the bottom of the file, where there is one, and read
   the result. A migration that ran without error has not necessarily done what
   it says — see the Security Notes in the root README for the several times
   that was exactly what happened here.

### Do not run `supabase db push`

The CLI applies migrations in **lexicographic** order and tracks them in a remote
registry that does not match this folder's numbering. Pushing here has already
been established as dangerous:

- the remote registry held 99 entries under a different timestamp scheme and
  none matching `0001`–`0020`, so a push would have replayed all twenty against
  the live database
- the legacy `20260301_…` file sorted *after* `0020` and ends with
  `CREATE POLICY … FOR ALL USING (true) WITH CHECK (true)` and no `TO` clause —
  no `TO` clause means `PUBLIC`, which includes `anon`. It would have silently
  reopened everything `0013` closed.

`0001`–`0020` are registered as applied via migration repair and the legacy files
are in `archive/`, so a push is currently a no-op for them — but `0021` and `0022`
are not registered, and the ordering hazard returns the moment someone adds a file
whose name does not sort where they expect. Use the SQL Editor.

### Node.js runner script
```bash
node supabase/run-migrations.js          # or: npm run migrate
node supabase/run-migrations.js --dry-run
```
Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

## Rules
- **Never modify** a migration that has already been applied to production.
- **Always create a new** numbered migration for schema changes.
- All migrations use `IF NOT EXISTS` / `IF EXISTS` guards to be safe to re-run.
- Immutable tables (e.g., `payment_transaction_logs`) have no UPDATE/DELETE policies.
- Verify the **end state**, not the migration text. `npm run verify:db` and
  `npm run verify:rls` probe what the database actually allows.
