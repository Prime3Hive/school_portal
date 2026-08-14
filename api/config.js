/**
 * Vercel Serverless Function — /api/config
 * Serves public (non-secret) environment variables to the frontend.
 *
 * ONLY include keys that are safe to expose to the browser.
 * Supabase anon key and Paystack public key are intentionally public;
 * they are row-level-security protected on the backend.
 *
 * SECRET keys (service role, webhook secrets, etc.) must NEVER appear here.
 */
/**
 * Read an environment variable, stripping surrounding whitespace.
 *
 * Values pasted into the Vercel dashboard from a Windows `.env` keep their
 * trailing CRLF, and every variable on this project currently carries one.
 * The URL parser and fetch's header normalisation happen to strip it, but a
 * Paystack key with a newline on the end is sent verbatim to Paystack and
 * rejected. Trim on the way out so a stray newline can never reach the client.
 */
function env(name, fallback = '') {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

module.exports = function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Build the public config object from Vercel environment variables
    const config = {
        SUPABASE_URL: env('SUPABASE_URL'),
        SUPABASE_ANON_KEY: env('SUPABASE_ANON_KEY'),
        PAYSTACK_PUBLIC_KEY: env('PAYSTACK_PUBLIC_KEY'),
        APP_ENV: env('APP_ENV', 'production'),
        SCHOOL_NAME: env('SCHOOL_NAME', 'TBD International Academy'),
        SCHOOL_EMAIL: env('SCHOOL_EMAIL'),
        SCHOOL_PHONE: env('SCHOOL_PHONE'),
        SCHOOL_ADDRESS: env('SCHOOL_ADDRESS'),
        APP_URL: env('APP_URL'),
        EMAIL_FROM_ADDRESS: env('EMAIL_FROM_ADDRESS'),
        EMAIL_FROM_NAME: env('EMAIL_FROM_NAME', 'TBD International Academy'),
        SESSION_TIMEOUT_MINUTES: env('SESSION_TIMEOUT_MINUTES', '30'),
    };

    // Cache for 60 seconds on CDN, no private caching
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json(config);
}
