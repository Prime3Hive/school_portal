/**
 * Netlify serverless function: /api/config
 * Returns ONLY the public (client-safe) environment variables.
 * Server-side secrets (SERVICE_ROLE_KEY, PAYSTACK_SECRET_KEY, etc.)
 * are intentionally excluded and never sent to the browser.
 */
exports.handler = async () => {
  const config = {
    SUPABASE_URL:        process.env.SUPABASE_URL        || '',
    SUPABASE_ANON_KEY:   process.env.SUPABASE_ANON_KEY   || '',
    PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
    APP_ENV:             process.env.APP_ENV             || 'production',
    SCHOOL_NAME:         process.env.SCHOOL_NAME         || 'TBD Academy',
    SCHOOL_EMAIL:        process.env.SCHOOL_EMAIL        || '',
    SCHOOL_PHONE:        process.env.SCHOOL_PHONE        || '',
    SCHOOL_ADDRESS:      process.env.SCHOOL_ADDRESS      || '',
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(config),
  };
};
