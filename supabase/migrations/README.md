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

## Running Migrations

### Option A — Supabase Dashboard (recommended for production)
1. Open Supabase Dashboard → SQL Editor
2. Run migrations **in order** (0001 → 0011)
3. Each migration is idempotent (`CREATE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### Option B — Supabase CLI
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Link your project
supabase link --project-ref <your-project-ref>

# Push all migrations
supabase db push
```

### Option C — Node.js runner script
```bash
node supabase/run-migrations.js
```
Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

## Rules
- **Never modify** a migration that has already been applied to production.
- **Always create a new** numbered migration for schema changes.
- All migrations use `IF NOT EXISTS` / `IF EXISTS` guards to be safe to re-run.
- Immutable tables (e.g., `payment_transaction_logs`) have no UPDATE/DELETE policies.
