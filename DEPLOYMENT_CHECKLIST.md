# Vercel Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. Environment Variables Configuration
**Status:** ✅ Properly configured

- `.env` file is **gitignored** and **vercelignored** ✓
- `.env.example` exists as template ✓
- `/api/config.js` serverless function exposes only **public** keys ✓
- Paystack **secret key** is NOT exposed to frontend ✓

### 2. Paystack Configuration
**Status:** ✅ Secure

**Public Key (Safe to expose):**
- Loaded via `/api/config` endpoint in production
- Loaded from `.env` file in local development
- Accessed via `AppConfig.paystack.publicKey` getter
- Validated on startup with diagnostics

**Secret Key (Server-only):**
- Stored in Vercel environment variables
- NEVER sent to frontend
- Only used in Supabase edge functions (if needed)

### 3. Security Measures
**Status:** ✅ Implemented

- `.env` blocked via `vercel.json` routes (404 response) ✓
- `.vercelignore` prevents `.env*` files from being deployed ✓
- CSP headers allow Paystack domains ✓
- HSTS and security headers configured ✓

### 4. Files That Should NOT Be Deployed
**Status:** ✅ Protected

```
.env
.env.local
.env.production
supabase/ (migrations and functions)
node_modules/
```

### 5. Files That WILL Be Deployed
**Status:** ✅ Ready

```
index.html
student-portal.html
teacher-portal.html
public-blog.html
js/ (all JavaScript modules)
css/ (all stylesheets)
api/config.js (serverless function)
vercel.json (configuration)
```

---

## 🔧 Vercel Environment Variables Setup

Before deploying, ensure these variables are set in **Vercel Dashboard → Project Settings → Environment Variables**:

### Required Variables

```bash
# Supabase (from dashboard.supabase.com)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Paystack (from dashboard.paystack.com)
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxx
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx

# Application
APP_ENV=production
APP_URL=https://your-domain.vercel.app
SESSION_TIMEOUT_MINUTES=30

# School Information
SCHOOL_NAME=TBD Academy
SCHOOL_EMAIL=admin@tbdacademy.edu.ng
SCHOOL_PHONE=+234-800-000-0000
SCHOOL_ADDRESS=Makurdi, Benue State, Nigeria

# Email (Optional - if using email features)
EMAIL_FROM_ADDRESS=noreply@tbdacademy.edu.ng
EMAIL_FROM_NAME=TBD Academy
```

### Variable Scope
Set all variables for **Production**, **Preview**, and **Development** environments.

---

## 🚀 Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

```bash
# 1. Install Vercel CLI (if not installed)
npm install -g vercel

# 2. Login to Vercel
vercel login

# 3. Link project (first time only)
vercel link

# 4. Deploy to preview
vercel

# 5. Deploy to production
vercel --prod
```

### Option 2: Deploy via Git Integration

```bash
# 1. Commit all changes
git add .
git commit -m "Deploy updated code with multi-grade subjects and dashboard redesign"

# 2. Push to GitHub/GitLab/Bitbucket
git push origin main

# Vercel will automatically deploy from the connected repository
```

---

## 🔍 Post-Deployment Verification

### 1. Check Environment Variables Loading
Open browser console on deployed site:
```javascript
// Should show ✅ Paystack key configured (🟢 LIVE mode)
// Should NOT show any ⚠️ warnings
```

### 2. Test Paystack Integration
1. Navigate to Fees & Payments module
2. Click "Record Payment" → "Pay with Paystack"
3. Verify Paystack checkout modal opens without 403 errors
4. Test a small transaction (₦100)

### 3. Test Supabase Connection
1. Login with admin credentials
2. Verify dashboard loads real data
3. Check that student/staff lists populate
4. Test creating a new record

### 4. Test Multi-Grade Subjects
1. Navigate to Academics → Subjects
2. Add a subject and assign to multiple grades
3. Verify grade badges display correctly
4. Check student auto-enrollment

### 5. Verify Security
```bash
# Test .env is blocked
curl https://your-domain.vercel.app/.env
# Should return 404

# Test /api/config returns only public keys
curl https://your-domain.vercel.app/api/config
# Should return JSON with PAYSTACK_PUBLIC_KEY
# Should NOT contain PAYSTACK_SECRET_KEY
```

---

## ⚠️ Common Issues & Solutions

### Issue: "Paystack key not configured" warning
**Solution:** Ensure `PAYSTACK_PUBLIC_KEY` is set in Vercel environment variables and redeploy.

### Issue: 403 errors on Paystack checkout
**Solution:** 
1. Verify the public key starts with `pk_live_` or `pk_test_`
2. Check CSP headers allow `https://checkout.paystack.com`
3. Ensure key is valid on dashboard.paystack.com

### Issue: Supabase connection fails
**Solution:**
1. Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel
2. Check RLS policies are enabled on tables
3. Verify anon key has correct permissions

### Issue: Environment variables not updating
**Solution:**
1. Update variables in Vercel dashboard
2. Trigger a new deployment (redeploy or push new commit)
3. Clear browser cache and hard refresh

---

## 📝 Deployment Log

| Date | Version | Changes | Status |
|------|---------|---------|--------|
| 2026-04-09 | 2.0 | Multi-grade subjects, dashboard redesign, class-schedule fixes | Ready |

---

## ✅ Final Checklist Before Deploy

- [ ] All environment variables set in Vercel dashboard
- [ ] `.env` file is gitignored and vercelignored
- [ ] Paystack keys verified (test mode for staging, live mode for production)
- [ ] Supabase credentials verified
- [ ] All code changes committed to git
- [ ] Local testing completed
- [ ] Security headers verified in `vercel.json`
- [ ] CSP allows Paystack domains
- [ ] `/api/config` endpoint tested locally

**Ready to deploy!** 🚀
