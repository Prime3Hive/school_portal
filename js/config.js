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

  email: {
    get fromAddress() { return window.ENV?.EMAIL_FROM_ADDRESS || 'noreply@tbdacademy.edu.ng'; },
    get fromName() { return window.ENV?.EMAIL_FROM_NAME || 'TBD Academy'; }
  },

  app: {
    get env() { return window.ENV?.APP_ENV || 'development'; },
    get url() { return window.ENV?.APP_URL || window.location.origin; },
    get sessionTimeoutMinutes() { return parseInt(window.ENV?.SESSION_TIMEOUT_MINUTES || '30'); }
  },

  school: {
    get name() { return window.ENV?.SCHOOL_NAME || 'TBD Academy'; },
    get email() { return window.ENV?.SCHOOL_EMAIL || 'admin@tbdacademy.edu.ng'; },
    get phone() { return window.ENV?.SCHOOL_PHONE || '+234-800-000-0000'; },
    get address() { return window.ENV?.SCHOOL_ADDRESS || 'Makurdi, Benue State, Nigeria'; }
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
