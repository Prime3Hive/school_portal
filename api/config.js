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
module.exports = function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Build the public config object from Vercel environment variables
    const config = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
        APP_ENV: process.env.APP_ENV || 'production',
        SCHOOL_NAME: process.env.SCHOOL_NAME || 'TBD Academy',
        SCHOOL_EMAIL: process.env.SCHOOL_EMAIL || '',
        SCHOOL_PHONE: process.env.SCHOOL_PHONE || '',
        SCHOOL_ADDRESS: process.env.SCHOOL_ADDRESS || '',
        APP_URL: process.env.APP_URL || '',
        EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || '',
        EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'TBD Academy',
        SESSION_TIMEOUT_MINUTES: process.env.SESSION_TIMEOUT_MINUTES || '30',
    };

    // Cache for 60 seconds on CDN, no private caching
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json(config);
}
