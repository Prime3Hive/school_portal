const AppConfig = {
  // Lazy getters — window.ENV is populated by env-loader.js AFTER this file loads,
  // so we must read ENV at access time, not at definition time.
  supabase: {
    get url() { return window.ENV?.SUPABASE_URL || 'https://your-project.supabase.co'; },
    get anonKey() { return window.ENV?.SUPABASE_ANON_KEY || 'your-anon-key-here'; }
  },

  paystack: {
    get publicKey() { return window.ENV?.PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxxxxxxxxx'; }
  },

  // Mailbox each kind of message comes from. Mail is sent by the Supabase edge
  // functions through Resend, never from the browser — these are here so the UI
  // can tell a parent which address to write to, and must stay in step with
  // MAILBOX in supabase/functions/_shared/email.ts.
  email: {
    get fromAddress() { return window.ENV?.EMAIL_FROM_ADDRESS || 'support@tbdacademy.org'; },
    get fromName() { return window.ENV?.EMAIL_FROM_NAME || 'TBD International Academy'; },
    get support() { return window.ENV?.SUPPORT_EMAIL || 'support@tbdacademy.org'; },
    get finance() { return window.ENV?.FINANCE_EMAIL || 'finance@tbdacademy.org'; },
    get admissions() { return window.ENV?.ADMISSIONS_EMAIL || 'headteacher@tbdacademy.org'; }
  },

  app: {
    get env() { return window.ENV?.APP_ENV || 'development'; },
    get url() { return window.ENV?.APP_URL || window.location.origin; },
    get sessionTimeoutMinutes() { return parseInt(window.ENV?.SESSION_TIMEOUT_MINUTES || '30'); }
  },

  school: {
    get name() { return window.ENV?.SCHOOL_NAME || 'TBD International Academy'; },
    get email() { return window.ENV?.SCHOOL_EMAIL || 'support@tbdacademy.org'; },
    get phone() { return window.ENV?.SCHOOL_PHONE || '0803 061 4777'; },
    get address() { return window.ENV?.SCHOOL_ADDRESS || 'Behind Civil Service Commission, Kertyo, Makurdi, Nigeria'; }
  },

  storage: {
    buckets: {
      documents: 'documents',
      profilePhotos: 'profile-photos',
      assignments: 'assignments',
      resources: 'resources'
    },
    maxFileSize: 10 * 1024 * 1024,
    allowedFileTypes: {
      documents: ['.pdf', '.doc', '.docx', '.txt'],
      images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      assignments: ['.pdf', '.doc', '.docx', '.txt', '.zip']
    }
  },

  features: {
    enableNotifications: true,
    enableMessaging: true,
    enableFileUploads: true,
    enableDarkMode: true,
    enableCalendar: true
  }
};

// ── Brand identity ───────────────────────────────────────────────────────────
// Single source of truth for the crest, wordmark and motto. Loaded in <head>,
// so inline bootstrap scripts can read it before the modules come up.
AppConfig.brand = {
  name: 'TBD International Academy',
  shortName: 'TBD Academy',
  motto: 'Planting Seeds of Knowledge',
  crest: 'assets/logo-mark.svg',   // shield only
  logo: 'assets/logo.svg',         // full lockup with motto ribbon
  navy: '#1E2A5A',
  red: '#E23C3C'
};

// ── Legacy brand-value migration ─────────────────────────────────────────────
// School name and address are admin-editable: they live in localStorage and in
// the school_settings row, and both are applied over the hardcoded defaults at
// runtime. So a rebrand does NOT reach an existing install just by changing the
// defaults — the stale saved value keeps winning.
//
// A stored value that still exactly equals a superseded default was never
// actually customised by an admin, so it is safe to upgrade. Anything else is
// a deliberate choice and is left untouched.
const LEGACY_SCHOOL_VALUES = {
  schoolName: {
    'TBD Academy': 'TBD International Academy'
  },
  schoolAddress: {
    'Lagos, Nigeria': 'Makurdi, Benue State',
    'Lagos': 'Makurdi, Benue State',
    // What the saved settings row actually held: the state, but not the school.
    'Makurdi Benue State, Nigeria': 'Behind Civil Service Commission, Kertyo, Makurdi'
  },
  schoolEmail: {
    'info@tbdacademy.org': 'support@tbdacademy.org'
  },
  // The bank block shipped as a First Bank placeholder with a demo account
  // number. The school's real account, printed on both published fee sheets,
  // is Keystone Bank 1013525760. Changing the defaults alone would not reach
  // an install that has already saved settings, and the placeholder was being
  // shown to parents on invoices and deposit slips.
  bankName: {
    'First Bank of Nigeria': 'Keystone Bank'
  },
  bankAccountNo: {
    '0123456789': '1013525760'
  },
  bankAccountName: {
    'TBD Academy': 'TBD International Academy'
  },
  // First Bank's sort code, meaningless against a Keystone account. No sort
  // code for the real account appears in any school document, so this clears
  // rather than substituting one.
  bankSortCode: {
    '011151003': ''
  },
  // Superseded by the number on both fee sheets' letterhead. The dialling
  // placeholder is what the saved settings row was still holding.
  schoolPhone: {
    '+234-800-000-0000': '0707 171 1692',
    '0803 061 4777': '0707 171 1692'
  }
};

window.upgradeLegacySchoolValue = function (field, value) {
  const map = LEGACY_SCHOOL_VALUES[field];
  if (!map || typeof value !== 'string') return value;
  const key = value.trim();
  // Presence, not truthiness: a superseded value can legitimately map to the
  // empty string. bankSortCode does — the placeholder carried First Bank's
  // code and no sort code for the real account appears in any school
  // document, so the correct replacement is nothing rather than a guess.
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : value;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppConfig;
}

// ── Startup diagnostics ─────────────────────────────────────────────────────
// Runs after env-loader populates window.ENV to catch misconfigured keys early.
// Paystack returns 403 on checkout assets (JS/CSS) when the key is invalid —
// this check surfaces the real problem before the iframe even opens.
(function runConfigDiagnostics() {
  const check = () => {
    const pk = window.ENV?.PAYSTACK_PUBLIC_KEY || '';
    const isPlaceholder = !pk || pk === 'pk_test_xxxxxxxxxxxx' || pk.length < 20;
    if (isPlaceholder) {
      console.error(
        '⚠️  PAYSTACK KEY NOT CONFIGURED — Paystack payments will fail with 403 errors.\n' +
        '   Open .env and set: PAYSTACK_PUBLIC_KEY=pk_test_xxxx  (your real key from dashboard.paystack.com)\n' +
        '   Current value:', pk || '(empty)'
      );
    } else {
      const mode = pk.startsWith('pk_live_') ? '🟢 LIVE' : '🟡 TEST';
      console.log(`✅ Paystack key configured (${mode} mode)`);
    }

    const url = window.ENV?.SUPABASE_URL || '';
    if (!url || url.includes('your-project')) {
      console.error(
        '⚠️  SUPABASE_URL NOT CONFIGURED — Database features will not work.\n' +
        '   Open .env and set: SUPABASE_URL=https://xxxx.supabase.co'
      );
    }
  };

  // Wait for window.envReady — it is set by env-loader.js which may load AFTER
  // this file (config.js is in <head>, env-loader.js is at end of <body>).
  // Poll every 50ms until envReady appears, then await it.
  function waitForEnvReady(fn) {
    if (window.envReady && typeof window.envReady.then === 'function') {
      window.envReady.then(fn);
      return;
    }
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (window.envReady && typeof window.envReady.then === 'function') {
        clearInterval(poll);
        window.envReady.then(fn);
      } else if (attempts > 100) { // 5s max, then give up silently
        clearInterval(poll);
      }
    }, 50);
  }

  waitForEnvReady(check);
})();
