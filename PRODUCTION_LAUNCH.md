# Launching on tbdacademy.org

Everything needed to take the portal from "works on localhost" to "the school
runs on it". Work top to bottom — later steps assume the earlier ones.

This is the only deployment runbook. The four older ones
(`DEPLOYMENT_CHECKLIST.md`, `DEPLOYMENT_SUMMARY.md`,
`POST_DEPLOYMENT_VERIFICATION.md`, `ADMISSIONS_SECURITY_DEPLOYMENT.md`) still
described the retired `school-portal-tbd.vercel.app` deployment and have been
removed; `git log` has them if you need to look back.

---

## 0. Do this first: rotate the Paystack secret key

The live Paystack **secret** key (`sk_live_…`) was sitting in `.env`. That file
is fetched over HTTP by `js/env-loader.js` during local development, so anything
that could reach a dev server could read it. It has been removed from the file,
but removing it does not un-expose it.

1. https://dashboard.paystack.com/#/settings/developers → **Generate new secret key**
2. Put the new one in Supabase secrets only (step 4 below).
3. Never put an `sk_live_…` value back into `.env`, Vercel, or any file the
   browser can fetch.

The public key (`pk_live_…`) is fine where it is — it is meant to be published.

---

## 1. Point the domain at Vercel

Vercel → Project → **Settings → Domains** → add both:

| Domain | Purpose |
| --- | --- |
| `tbdacademy.org` | primary |
| `www.tbdacademy.org` | redirect to the primary (Vercel offers this when you add it) |

Then set the DNS records your registrar needs — Vercel shows the exact values:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Set **tbdacademy.org** as the Production Domain so preview deploys do not
inherit it. Wait for the certificate to issue before testing.

### What lives where

`vercel.json` now serves the marketing site at the root, with no redirect hop:

```
tbdacademy.org/            → public-blog.html   (school website)
tbdacademy.org/about       → about.html
tbdacademy.org/academics   → academics.html
tbdacademy.org/admissions  → admissions.html
tbdacademy.org/contact     → contact.html
tbdacademy.org/login       → login.html
tbdacademy.org/portal      → index.html         (staff portal)
tbdacademy.org/student/…   → student-portal.html
tbdacademy.org/teacher/…   → teacher-portal.html
```

The `.html` URLs keep working; each public page carries a `<link rel="canonical">`
naming the clean URL, so search engines index one address rather than two.
`robots.txt` blocks everything behind a login, and each of those pages also
carries `<meta name="robots" content="noindex">` — belt and braces, because
robots.txt is a request and the meta tag is an instruction.

---

## 2. Set up Resend

### 2a. Verify the domain

1. https://resend.com → **Domains → Add Domain** → `tbdacademy.org`
2. Add the DNS records Resend gives you. They hang off the `send` subdomain and
   a DKIM selector, so they do **not** collide with the root `MX` record that
   your inbox provider needs:

   | Type | Name | Purpose |
   | --- | --- | --- |
   | MX | `send.tbdacademy.org` | bounce handling |
   | TXT | `send.tbdacademy.org` | SPF |
   | TXT | `resend._domainkey` | DKIM |

3. Wait for **Verified**. Until then every send fails with HTTP 403 and the
   portal reports "Resend rejected … — is tbdacademy.org verified?".
4. Add a DMARC record once mail is flowing:
   `TXT  _dmarc  v=DMARC1; p=none; rua=mailto:support@tbdacademy.org`

### 2b. Create the mailboxes — separate from Resend

**Resend sends. It does not receive.** Every email the portal sends invites a
reply, and a reply to an address with no mailbox bounces back to a parent.

Before launch, create real, monitored inboxes on Google Workspace, Zoho Mail or
your registrar's mail service, and point the root `MX` record at that provider:

- `support@tbdacademy.org` — accounts, logins, portal problems
- `finance@tbdacademy.org` — fees, receipts, payment queries
- `headteacher@tbdacademy.org` — admissions and official correspondence

These three are on the public contact page and in the footer of every email.

### 2c. Who sends what

Defined once in `supabase/functions/_shared/email.ts`; nothing else picks a
from-address.

| Mailbox | Sends |
| --- | --- |
| `support@` | invitations, new-account credentials |
| `finance@` | payment receipts (school fees and application fees) |
| `headteacher@` | application received — to the applicant, and to the office |

---

## 3. Vercel environment variables

Settings → **Environment Variables**, scope **Production**. These are served to
every visitor through `/api/config`, so **public values only**.

```
SUPABASE_URL=https://orcktihscvksjikicgvj.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi…
PAYSTACK_PUBLIC_KEY=pk_live_…
APP_ENV=production
APP_URL=https://tbdacademy.org
SESSION_TIMEOUT_MINUTES=30
SCHOOL_NAME=TBD International Academy
SCHOOL_EMAIL=support@tbdacademy.org
SCHOOL_PHONE=0803 061 4777
SCHOOL_ADDRESS=Behind Civil Service Commission, Kertyo, Makurdi, Benue State
EMAIL_FROM_ADDRESS=support@tbdacademy.org
EMAIL_FROM_NAME=TBD International Academy
SUPPORT_EMAIL=support@tbdacademy.org
FINANCE_EMAIL=finance@tbdacademy.org
ADMISSIONS_EMAIL=headteacher@tbdacademy.org
SCHOOL_BANK_NAME=…
SCHOOL_BANK_ACCOUNT=…
SCHOOL_BANK_ACCOUNT_NAME=…
SCHOOL_BANK_BRANCH=…
```

Paste values without trailing newlines. `api/config.js` trims them on the way
out, but a stray newline in a key used elsewhere will not be caught.

The bank details are shown to families paying by transfer — fill them in or the
admissions page offers a payment method nobody can complete.

---

## 4. Supabase secrets

Never in Vercel. These reach only the edge functions.

```bash
supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_live_THE_NEW_ONE \
  RESEND_API_KEY=re_… \
  MAIL_DOMAIN=tbdacademy.org \
  APP_URL=https://tbdacademy.org \
  SCHOOL_NAME="TBD International Academy"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not set them yourself.

`APP_URL` matters more than it looks: credential and receipt links are built
from it, never from the request that triggered the send. An email is clicked
hours later, with no request context left to borrow.

`RESEND_API_KEY` is what makes account creation usable. Without it the account
is still created, but the credential email is skipped and the admin has to read
the password down a phone line — the create dialog says so explicitly when it
happens, so a missing key is visible rather than silent.

**Before go-live, verify the sending domain in Resend** (Dashboard → Domains →
add `tbdacademy.org`, then add the DKIM/SPF records it gives you). Mail from
`support@tbdacademy.org` is rejected with a 403 until that is done, and every
new account will report "Resend rejected support@tbdacademy.org".

---

## 5. Deploy the edge functions

All five share `_shared/email.ts`, so all five are redeployed together:

```bash
supabase functions deploy create-account
supabase functions deploy resend-credentials
supabase functions deploy submit-application
supabase functions deploy paystack-webhook
supabase functions deploy delete-user
```

`create-account` and `resend-credentials` replace `create-invitation-v2` and
`create-user-immediate`. Once the new pair is deployed and a test account works,
delete the old two so nothing can call them:

```bash
supabase functions delete create-invitation-v2
supabase functions delete create-user-immediate
```

`paystack-webhook` must stay public (Paystack cannot send a Supabase JWT); it
authenticates by HMAC signature instead. Deploy it with `--no-verify-jwt` if
your project defaults to requiring one.

---

## 5a. Apply migration 0022

`supabase/migrations/0022_consolidate_account_provisioning.sql` — paste it into
the SQL Editor and run it. It rebuilds `create_user_records` (the new version
upserts the profile, so it no longer collides with the `handle_new_user`
trigger) and drops `invitations.default_password`, which stored every new
user's password in plaintext where any signed-in user could read it.

Deploy the functions **and** run this migration. The new `create-account`
passes a `p_department` argument the old 11-argument function does not accept.

---

## 6. Paystack

1. Switch the dashboard to **Live**.
2. **Settings → API Keys & Webhooks → Webhook URL**:
   `https://orcktihscvksjikicgvj.supabase.co/functions/v1/paystack-webhook`
3. Add `tbdacademy.org` to the allowed domains / callback URLs.
4. Send a test charge and confirm the webhook shows a `200`.

The webhook is the authority on whether money arrived — the browser callback is
not, and the code deliberately ignores it. It is also what triggers the receipt
email, so a misconfigured webhook silently means no receipts.

---

## 7. Wipe the existing data

Run `sql/reset-production-data.sql`. Read its header first — it is not
reversible.

```
1. Dashboard → Database → Backups → download a backup.
2. Find the admin login to keep:
     SELECT school_id, full_name, email FROM profiles WHERE role = 'admin';
3. Edit KEEP_ADMIN_SCHOOL_ID at the top of the script.
4. Paste the whole file into the SQL Editor and run it.
5. Run the VERIFY query at the bottom: every count 0, profiles = 1.
6. Empty the Storage buckets by hand — Dashboard → Storage → documents,
   profile-photos, assignments, resources. SQL does not remove the files
   themselves, and they are documents about real children.
```

The script aborts untouched unless the school ID you name matches exactly one
admin profile.

---

## 8. Ship and check

```bash
npm run verify     # lint + tests + build — must pass
npm run verify:db  # asserts RLS is on and policies are as expected
git push           # Vercel builds from the repo; never `vercel --prod` by hand
```

Then walk the site:

- [ ] `https://tbdacademy.org/` serves the school website, no redirect hop
- [ ] `https://tbdacademy.org/portal` reaches the staff login
- [ ] `https://tbdacademy.org/.env` returns **404** (never 200 — that would be everything)
- [ ] `https://tbdacademy.org/api/config` returns public values only: no `sk_`, no `re_`, no service role key
- [ ] `https://tbdacademy.org/robots.txt` and `/sitemap.xml` load
- [ ] Sign in as the surviving admin
- [ ] Create a test user → credential email arrives from `support@tbdacademy.org`
- [ ] Sign in as that user with the emailed ID and password → forced straight to the change-password screen
- [ ] Set a new password → lands on the right portal for the role; the old password no longer works
- [ ] "Email a new password" on that user → a second email arrives, the login ID is unchanged, and no duplicate appears in the users list
- [ ] Delete the test user → they disappear from Users and can no longer sign in
- [ ] Submit a test application → applicant confirmation from `headteacher@`, copy in the head teacher's inbox
- [ ] Make a small live payment → receipt from `finance@`, webhook 200, fee marked paid
- [ ] Reply to each of the three emails and confirm the reply lands in a real inbox
- [ ] Search `site:tbdacademy.org` after a week: portal pages must not appear

---

## Known gaps

- **Application approve / reject sends no email.** Decisions are recorded in the
  admin console and the applicant only sees them by checking their status page.
  Wiring that up means a new edge function — the browser cannot be trusted to
  send mail on the school's behalf.
- **Contact details are taken from the admission flyer.** The invented mobile
  number on `contact.html` has been replaced with the flyer's second line
  (0902 751 2438) — confirm both numbers still reach the office.
- **`assets/og-image.png`** is what every WhatsApp and Facebook share of the
  site will show. It exists and is now referenced at `tbdacademy.org`; give it a
  look before launch and re-scrape with Facebook's Sharing Debugger so the old
  `vercel.app` URL falls out of their cache.
