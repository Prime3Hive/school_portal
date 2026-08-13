# Admissions & payment hardening — deployment runbook

This change closes a set of holes in the application-submission, payment-approval
and application-approval flows. **Order matters**: migration `0014` removes the
browser's ability to insert applications, so the edge function that replaces it
must be live first, or admissions stops working.

## What changed, in one paragraph

Applications used to be written straight from the browser using the public anon
key, with the browser deciding both the fee and whether it had been paid. They
are now created only by the `submit-application` edge function, which reads the
fee from the database and verifies the Paystack charge with the secret key
before it will record a payment. The Paystack webhook now handles application
fees too, and no longer 404s on every school-fee payment.

---

## Deploy in this order

### 1. Set secrets (if not already set)

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxxxxxxx
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 2. Deploy the functions

```bash
supabase functions deploy submit-application
supabase functions deploy paystack-webhook
```

`submit-application` must be reachable without a user JWT (applicants are not
signed in). Verify:

```bash
curl -i -X POST "$SUPABASE_URL/functions/v1/submit-application" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'
# expect 400 {"success":false,"error":"Missing required applicant details."}
```

A `401` here means the function is set to verify JWTs — turn that off for this
function in the dashboard, or add `verify_jwt = false` to its config.

### 3. Deploy the frontend

The new client code must be live *before* the migration, because the old build
inserts directly into `applications` and will start failing the moment RLS
changes.

```bash
npm run verify   # lint + tests + build
npm run deploy
```

### 4. Apply migration 0014

```bash
supabase db push          # or paste supabase/migrations/0014_secure_admissions_flow.sql
                          # into the SQL editor
```

Verify immediately afterwards:

```sql
-- Should return zero rows: anon must have no INSERT path into applications.
SELECT policyname, cmd, roles FROM pg_policies
WHERE tablename = 'applications' AND cmd = 'INSERT';

-- Should return the new fee rows.
SELECT * FROM application_fee_schedule ORDER BY amount, grade;
```

### 5. Smoke-test the full flow

1. Submit an application with **Paystack** using a test card → application
   appears in the admin console marked *Fee Paid*.
2. Submit one with **Bank Transfer** → appears under *Pending Payment
   Verifications*, and **cannot** be approved until the payment is approved.
3. Reject a bank payment → it leaves the pending queue, and the applicant's
   status page shows the reason.
4. Check status on the public page with the application ID **and** the email →
   works. With a wrong email → not found.
5. Approve an application → student account created; clicking Approve a second
   time is refused rather than creating a duplicate.

### 6. Migration 0015 — private document bucket

`supabase db push` / `npm run migrate` applies this alongside 0014, which is
correct **provided step 3 really did go out first** — it depends on
`js/storage-urls.js` being live to re-sign document links. If you are applying
migrations before deploying the frontend for any reason, hold 0015 back.

Verify with the checklist at the bottom of
`supabase/migrations/0015_private_documents_bucket.sql`.

---

## Rollback

Migration 0014 is policy-only except for the sequence and the fee table. To
revert the access change without losing data:

```sql
CREATE POLICY "applications: emergency anon insert"
  ON public.applications FOR INSERT TO anon WITH CHECK (
    application_fee_paid IS NOT TRUE AND status = 'pending'
  );
```

That restores submissions from an older frontend build **without** restoring the
free-admission hole (an anon client still cannot claim a paid fee). Only fall
back further than this if you have to.

---

## Notes for the next person

- `record_application`, `record_fee_payment`, `verify_fee_payment` and
  `reject_fee_payment` exist in the live database but **not in this repository**.
  0014 revokes public execute on `record_application` because it is
  `SECURITY DEFINER` and would otherwise bypass every new policy. The three fee
  RPCs are untouched and still in use. Dump them into version control before
  anyone edits them:

  ```sql
  SELECT p.proname, pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('record_fee_payment','verify_fee_payment','reject_fee_payment');
  ```

- Application fees are now in `application_fee_schedule`. Changing a price in
  the browser does nothing; edit that table (admin-only).

- School-fee payments still record from the browser's Paystack callback. The
  webhook now confirms them after the fact instead of 404ing, but the stronger
  fix — insert the `fees_payments` row as `pending` *before* charging, and let
  the webhook be the only thing that marks it `paid` — needs the
  `record_fee_payment` RPC source, which is not in this repo. That is the one
  item from the audit that is mitigated rather than closed.
