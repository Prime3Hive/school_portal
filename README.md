# TBD Academy Portal

**Live Site**: https://school-portal-tbd.vercel.app

Excellence in Education, Character in Action. A comprehensive school management portal for TBD Academy, Makurdi, Benue State.

## 🌐 Public Website

Visit our public website to learn about TBD Academy:
- School information and programs
- Admissions and application process
- Contact information

**Entry Point**: `public-blog.html`

## 👨‍💼 Staff Portal

Secure portal for school administrators and staff:
- Student management
- Staff management
- Class scheduling
- Fees & payments
- Inventory management
- Assessments & grading
- Application management

**Entry Point**: `index.html`

## 🚀 Features

### Public Site
- ✅ Responsive design for all devices
- ✅ Modern UI with TBD Academy branding
- ✅ Downloadable PDF application forms
- ✅ Online application submission
- ✅ Application status tracking
- ✅ Contact form

### Admin Portal
- ✅ Comprehensive dashboard
- ✅ Student directory with photo management
- ✅ Staff management
- ✅ Class scheduling
- ✅ Fees & payments with Paystack integration
- ✅ Inventory tracking
- ✅ Assessments & grading system
- ✅ Application review & approval
- ✅ Expense tracking

## 📦 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **PDF Generation**: jsPDF
- **Data Export**: SheetJS
- **Payment**: Paystack
- **Storage**: localStorage (demo) - needs backend for production
- **Hosting**: Vercel

## 🛠️ Local Development

1. **Clone or download** the repository
2. **Start a local server**:
   ```bash
   python -m http.server 8000
   ```
3. **Open in browser**:
   - Public site: `http://localhost:8000/public-blog.html`
   - Admin portal: `http://localhost:8000/index.html`

Dev serves the repo root directly — no build required, plain filenames, edit and
reload.

## 🏗️ Build & Checks

Production runs through `scripts/build.js`, which content-hashes every JS/CSS
filename (`js/app.js` → `js/app.4f2a1c9d.js`) and rewrites all references.
This is what makes long-lived caching safe: the URL changes whenever the bytes
change, so `immutable` caching never serves a stale build.

| Command | What it does |
| --- | --- |
| `npm run build` | Build into `dist/`. Add `:verbose` to list the hash mapping. |
| `npm run preview` | Build, then serve `dist/` — verifies the built output, not the source. |
| `npm run lint` | Parse every JS file and check per-page global dependencies. |
| `npm test` | Unit tests. |
| `npm run verify` | `lint` + `test` + `build`. **Run this before deploying.** |
| `npm run verify:rls` | Read-only probe of what the public anon key can read. |

Two things to know when editing:

- **`js/html-escape.js` must stay first** in each page's script list. Modules
  interpolate database values into `innerHTML` and depend on `window.escapeHtml`.
- **Reading a global at module top level creates a load-order dependency.** If a
  file reads `AppConfig` outside a function, every page loading it must also load
  `js/config.js` — otherwise the file throws and defines nothing. `npm run lint`
  catches this; register new such globals in `TOP_LEVEL_GLOBALS` in
  `scripts/check-syntax.js`.

Vercel is configured with `buildCommand: node scripts/build.js` and
`outputDirectory: dist`. `api/` is intentionally excluded from `dist` — Vercel
picks serverless functions up from the project root.

## 📝 Deployment

The deploy target is **Vercel**. Always deploy through the build — never by
uploading the repository directory.

```bash
npm run verify    # lint + tests + build
npm run deploy    # vercel --prod
```

`npm run verify` must pass before deploying. It builds into `dist/`, and only
`dist/` is served. That distinction is the whole point: `scripts/build.js`
decides what ships and deliberately excludes `.env*`, `supabase/`, `scripts/`,
`sql/`, `tests/` and the Supabase CLI binary.

> **Do not publish the repository root.** It contains `.env` with live
> configuration. This project previously carried a `netlify.toml` with
> `publish = "."` and a README section telling you to zip the whole folder and
> drag it to Netlify Drop — either of those would have served `.env` to the open
> internet. Both were removed for that reason. If you ever add another host,
> point it at `dist/` and nothing else.

### Database migrations

Migrations live in `supabase/migrations/` as `NNNN_description.sql` and are
applied in order:

```bash
supabase db query --linked -f supabase/migrations/00NN_name.sql
```

`supabase/migrations/archive/` holds superseded migrations. **Do not move them
back.** `20260301_school_settings_and_custom_roles.sql` recreates
world-writable policies on `school_settings` and `custom_roles`, and because the
CLI applies files in lexicographic order it would run *after* the `0013`
hardening and silently undo it.

## ⚙️ Configuration

### Hosting settings
All configuration is in `vercel.json`:
- Build command and output directory
- Rewrites and redirects
- Security headers (HSTS, CSP, frame options)
- Cache policies for content-hashed assets

### Environment variables
Set these in the Vercel project, not in a committed file. `/api/config` serves
the public subset to the browser; anything secret must never appear there.

| Variable | Where | Notes |
|---|---|---|
| `SUPABASE_URL` | Vercel | public |
| `SUPABASE_ANON_KEY` | Vercel | public by design, RLS-protected |
| `PAYSTACK_PUBLIC_KEY` | Vercel | must match the secret key's mode |
| `APP_ENV` | Vercel | `production` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | **never** in Vercel or `/api/config` |
| `PAYSTACK_SECRET_KEY` | Supabase secrets | **never** in Vercel or `/api/config` |

## 📱 Pages

### Public Site
- `/public-blog.html` - Homepage
- `/about.html` - About TBD Academy
- `/academics.html` - Academic programs
- `/admissions.html` - Admissions & applications
- `/contact.html` - Contact information

### Admin Portal
- `/index.html` - Admin dashboard
- All modules accessible via navigation

## 🔒 Security Notes

This portal holds the personal data of children — names, dates of birth, birth
certificates, passport photographs — and it moves money. Treat changes to
authorization as production changes.

**The security model:**

- **Authorization lives in the database, not the UI.** Hiding a nav item is not
  an access control. Every rule is a Postgres RLS policy or a check inside a
  `SECURITY DEFINER` function.
- **The anon key is public.** It ships in the source of every page. Anything it
  can reach is effectively world-readable, which is what `npm run verify:rls`
  probes for.
- **Secrets never reach the browser.** `SUPABASE_SERVICE_ROLE_KEY` and
  `PAYSTACK_SECRET_KEY` live only in Supabase function secrets. `/api/config`
  serves the public subset and must never be extended with a secret.
- **Payment amounts are never taken from the client.** Application fees are read
  from `application_fee_schedule`; Paystack charges are verified server-side with
  the secret key before anything is recorded as paid.

**When changing RLS, verify the end state — not the migration text.** This
schema has repeatedly had migrations that looked like they hardened something
and did not:

- a policy dropped by exact name, while the live policy had a different name
- policies written against a table where RLS was never enabled, so they did
  nothing at all
- a view left `SECURITY DEFINER`, bypassing the policies underneath it
- a `SECURITY DEFINER` function granted `EXECUTE` to `PUBLIC`

After any policy change, run both:

```bash
npm run verify:rls                          # what the anon key can read
supabase db advisors --linked --type security
```

`db advisors` should report zero ERRORs.

## 📊 Data Storage

- **Database**: Supabase (PostgreSQL) with row-level security on every table
- **Auth**: Supabase Auth; roles in `profiles.role`, read via `get_my_role()`
  and `current_user_has_role()`
- **Files**: Supabase Storage, `documents` bucket — **private**. Links are
  minted on demand by `js/storage-urls.js`; stored `getPublicUrl()` links no
  longer resolve and must not be relied on.
- **Server logic**: Supabase edge functions (`supabase/functions/`) for anything
  that must not be decided by the browser — application submission, Paystack
  verification, user creation.

## 🎨 Customization

### Branding
Update school information in:
- `js/school-config.js` - School details, grades, fees
- `css/design-system.css` - Colors and styling
- `css/public-blog.css` - Public site styling

### Contact Information
Update in all HTML files:
- Phone numbers
- Email addresses
- Physical address
- Social media links

## 📚 Documentation

- **Quick Start Guide**: `BLOG_QUICK_START.md`
- **Implementation Plan**: See artifacts folder
- **Walkthrough**: See artifacts folder

## 🐛 Known Limitations

1. **The Paystack webhook has never fired.** `paystack_webhook_events` is empty
   despite 8 Paystack payments, so the endpoint is not configured in the Paystack
   dashboard. Until it is, nothing verifies a school-fee payment server-side —
   which is why student-recorded payments land as `pending` and need admin
   approval (migration `0020`).
2. **Invitation activation does not work.** The RLS policy on `invitations`
   matches an `invitation_token` JWT claim that nothing in the codebase ever
   sets, so the lookup returns no rows. Admins hand out credentials directly from
   the user-management modal instead.
3. **`invitations.default_password` is a plaintext credential.** Admin-only, but
   it should not exist; activation belongs in an edge function.
4. **Fee mutators are authorized but not audited by role.** `record_fee_payment`
   and friends now check the caller, but 10 other `SECURITY DEFINER` functions
   still lack a pinned `search_path` — see `db advisors`.
5. **`yp_*` tables belong to a separate app** on the same Supabase project and
   have `{public}` read policies. They are currently empty; that stops being safe
   the moment that app stores a row.

## 🚀 Future Enhancements

- [ ] Configure and verify the Paystack webhook, then let it settle payments
- [ ] `activate-invitation` edge function, removing the plaintext password
- [ ] CI check asserting RLS end state (see Security Notes)
- [ ] Pin `search_path` on the remaining `SECURITY DEFINER` functions
- [ ] Email/SMS notifications
- [ ] Advanced reporting

## 📞 Support

For questions or support:
- **Email**: info@tbdacademy.edu.ng
- **Phone**: +234 XXX XXX XXXX
- **Location**: Makurdi, Benue State, Nigeria

## 📄 License

© 2026 TBD Academy. All rights reserved.

---

**Built with ❤️ for Excellence in Education**
