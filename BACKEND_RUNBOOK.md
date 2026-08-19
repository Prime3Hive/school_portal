# Backend runbook — from here to launch

Written 19 August 2026, after migrations were run against the wrong Supabase
project and failed with `relation "public.students" does not exist`.

**Nothing was damaged by that.** Both migrations are wrapped in `BEGIN/COMMIT`
and failed on their first statement, so both rolled back untouched.

This is the ordered path from where we are now to a working backend with real
school data in it. `PRODUCTION_LAUNCH.md` covers the hosting side — domain,
Resend, Vercel variables, Paystack. This covers the database.

Do the stages in order. Each one ends with a check; do not start the next stage
until the check passes.

---

## Stage 0 — Safety net

### 0.1 Commit the work in progress

There are ~49 changed and new files that exist nowhere but this working tree:
the public-site rework, the `index.html` / `portal.html` swap, the 2026/2027 fee
structure, the guardian linkage fix, and the import tooling. A lost laptop loses
all of it.

```bash
git status --short          # read it before committing anything
```

### 0.2 Find the right database

Two Supabase projects are in play. The one used on 19 August had **70 tables,
7,534 rows and 1 of the portal's 10 core tables** — a different application
entirely.

```
Run sql/diagnose-database.sql in the SQL Editor.
Look for:  core tables present   10 of 10
```

Check both candidates:

| Where to look | What it tells you |
|---|---|
| `.env` → `SUPABASE_URL` | the project this working copy talks to |
| Vercel → Settings → Environment Variables → `SUPABASE_URL` | the project the **live site** talks to |

If those two differ, that is the whole confusion in one line. The live site's
value is the authoritative one.

**Check: `core tables present` reads `10 of 10`.** Do not proceed on any project
that reads otherwise. Row counts near zero are expected if the go-live wipe has
already been run — that is a clean slate, not a fault.

> `documents` is a storage **bucket**, not a table. It will never appear in a
> table listing, and its absence there is not a problem.

---

## Stage 1 — Capture the baseline schema

### Why

`supabase/migrations/` cannot build a database from scratch. **19 of its 24
files reference tables that no migration creates:**

> `students` · `staff` · `profiles` · `classes` · `fee_items` ·
> `fees_payments` · `invitations` · `audit_logs` ·
> `payment_transactions` · `school_schedules`

They were created by hand in the dashboard and never written to a file. Until
that is fixed, a new environment cannot be stood up, and there is no way to tell
whether a database matches what the code expects.

`sql/live_functions_recovered.sql` is the same problem, already hit once and
solved for functions only.

### Do it

From the project confirmed in Stage 0:

```bash
./supabase.exe db dump \
  --db-url "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  --schema public \
  -f supabase/migrations/0000_baseline_schema.sql
```

The password is the database password from Dashboard → Settings → Database, not
the anon key or the service-role key.

**Do not run `supabase db push`.** It applies files in lexicographic order
against a registry that does not match this folder's numbering. The migrations
README says that has already caused trouble here.

**Check: the dump exists and contains all 10 tables above.**

```bash
for t in students staff profiles classes fee_items fees_payments \
         invitations audit_logs payment_transactions school_schedules; do
  grep -q "CREATE TABLE.*\b$t\b" supabase/migrations/0000_baseline_schema.sql \
    && echo "  ok   $t" || echo "  MISSING $t"
done
```

---

## Stage 2 — Apply the pending migrations

Two are written and unapplied.

| Migration | What it does | Risk |
|---|---|---|
| `0023_lock_fee_item_balances.sql` | Revokes client `UPDATE` on `fee_items` so balances move only through RPCs | A student could otherwise clear their own balance from the browser console |
| `0024_link_students_to_guardians.sql` | Adds `students.guardian_auth_id` + RLS so a guardian sees their own children | Without it every guardian sees "No Children Found" |

```
1. Dashboard → Database → Backups → download a backup. Non-negotiable.
2. Confirm the project ref in the URL is the one from Stage 0.
3. Paste 0023 into the SQL Editor. Run it. Read its VERIFY block.
4. Paste 0024. Run it. Read its VERIFY block.
```

**Check: 0024's verify step c — sign in as one guardian, confirm they see their
own child and *not* another guardian's.** That is the RLS policy doing its job;
if it fails, stop, because the failure mode is one family reading another
family's fees.

---

## Stage 3 — Prove the backend works

Before loading real data, confirm the portal runs against this database.

```
[ ] Admin signs in and lands on /portal
[ ] Staff signs in and lands on /portal (not the teacher portal)
[ ] Teacher signs in and lands on /teacher-portal.html
[ ] Student directory lists pupils
[ ] Fees & Payments opens and shows the 2026/2027 structure
[ ] Assign Fees for one test pupil creates fee_items rows
[ ] Guardian signs in and sees their child
```

Where a role lands is set in `js/auth-manager.js` → `getRedirectUrl()`. Every
portal's guard is checked against it — see the note in that function.

---

## Stage 4 — Load the school's real data

Order matters: fees before pupils, because assigning fees needs the structure to
exist.

### 4.1 Fee structure — done in code, needs reconciling in the database

`js/fee-structure.js` now holds the 2026/2027 figures from the school's two
published sheets. All 28 published totals reconcile.

But `school_settings.settings_json.feeStructure` **overrides the code at
runtime**. If an older structure is saved there, it wins.

```sql
select settings_json -> 'feeStructure' -> 'academicYear'
  from school_settings limit 1;
```

If that returns `2025-2026`, either clear the override or re-save the structure
from Settings so the database matches the code.

> **Outstanding:** Basic 1-3 new-intake uniform is set to ₦26,800 — the figure
> the school's own ₦85,800 total implies. The printed row says ₦25,000. Marked
> PROVISIONAL in the code, awaiting confirmation.

> **Worth a decision:** Christmas Carol (₦2,000) and PTA (₦500) are billed every
> term under per-term billing, so ₦6,000 and ₦1,500 a year. That follows the
> sheets, but a carol fee three times a year may not be intended.

### 4.2 Staff — 16 people

`scripts/import/templates/staff-collection.csv` is pre-filled with names,
designations, phones and **basic salaries** from the July payroll voucher
(₦473,000, reconciling to the voucher's own total). Only the constant Basic
Salary was taken; the Child Fees/Loan deductions vary month to month.

Still needed from the office: **email** (required for a login) and hire date.

Three conflicts are flagged in the sheet's `notes` column and need a human
decision:

- `MR. TERYIMA KUSUGH` is on the staff list but not the July payroll.
- `Mr. FRIDAY ADAJI` is on the payroll but not the staff list.
- `MRS. CHARITY AONDOYAVENGA` and `CHARITY IGYU` hold the same role — same
  person under two surnames?
- Class assignments disagree between the two documents (Kanyi and Msugh Rachel
  look swapped).

### 4.3 Guardians, then pupils

`families-collection.csv` groups 53 of the 88 pupils into 22 households, so the
office collects **57 sets of contacts rather than 88**. Fill that first, then
only the ungrouped pupils need entering individually.

`review-links.csv` holds 4 pupils whose household is uncertain — confirm each.

Pupils are loaded with `auth_id` NULL. **Guardians get logins; pupils do not.**
An admin links each child to its guardian from the pupil's Guardian tab →
Portal Access, which is also how a wrong sibling grouping gets corrected.

### 4.4 Assign fees for the current term

No opening balances — everyone starts clean and is charged for the current term
through the portal's existing Assign Fees.

---

## Stage 5 — Launch readiness

Follow `PRODUCTION_LAUNCH.md` for domain, Resend, Vercel variables, edge
functions and Paystack. On top of that:

```
[ ] The public site's figures match reality.
    It currently claims 500+ students and 50+ staff. The registers say 88 and
    16. It also headlines a 98% BECE pass rate while no JSS 2 or JSS 3 pupils
    exist. Deferred by the school on 19 Aug — but it is live and making these
    claims to parents now.
[ ] about.html names a Principal and Vice Principal who are not on the staff
    list. The Head of School is Agbo Lech Simmon.
[ ] One contact email. Three are in circulation:
    support@tbdacademy.org, tbdinternationalacademymkd@gmail.com,
    tbdinternationalacademy.mkd@gmail.com
[ ] Phone numbers agree. The flyers disagree with each other
    (08080614777 vs 08030614777) and js/public-site-config.js has a 10-digit
    number where the flyer has 11.
[ ] Photographs have parental consent on file.
[ ] A guardian's first login is tested end to end on a real phone.
```

---

## Standing rules

- **Run `sql/diagnose-database.sql` before any migration.** It is read-only and
  takes seconds. It would have caught the 19 August mistake immediately.
- **Back up before anything destructive.** Point-in-time restore is the only
  undo, and only on paid plans.
- **Never `supabase db push`.**
- **The service-role key goes in `.env` and never in a commit.**
