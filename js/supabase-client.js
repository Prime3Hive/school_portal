// ============================================
// SUPABASE CLIENT — TBD Academy School Portal
// ============================================
// Credentials are read from window.ENV (set by env-loader.js / /api/config).
// The values below are compile-time fallbacks only — rotate them via env vars.
// ============================================

const _SUPABASE_URL_FALLBACK  = 'https://orcktihscvksjikicgvj.supabase.co';
const _SUPABASE_ANON_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yY2t0aWhzY3Zrc2ppa2ljZ3ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NDk4ODAsImV4cCI6MjA4NzMyNTg4MH0.P0ErYNqWOHN9Afg7F_XYllNkzSOSicrfPUB0Hm9fGc8';

// ============================================
// Initialize Client
// ============================================
let supabaseClient = null;

function _resolveSupabaseCredentials() {
    const url  = (window.ENV?.SUPABASE_URL  && window.ENV.SUPABASE_URL  !== 'https://your-project.supabase.co')
        ? window.ENV.SUPABASE_URL
        : _SUPABASE_URL_FALLBACK;
    const anon = (window.ENV?.SUPABASE_ANON_KEY && window.ENV.SUPABASE_ANON_KEY !== 'your-anon-key-here')
        ? window.ENV.SUPABASE_ANON_KEY
        : _SUPABASE_ANON_FALLBACK;
    return { url, anon };
}

function _initSupabase() {
    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase JS library not loaded. Add the CDN script above this file.');
        return;
    }

    const { url, anon } = _resolveSupabaseCredentials();

    if (url === 'YOUR_SUPABASE_URL' || anon === 'YOUR_SUPABASE_ANON_KEY') {
        console.warn('⚠️  Supabase credentials not configured — running in localStorage-only mode.');
        window.supabaseReady = false;
        return;
    }

    try {
        supabaseClient = supabase.createClient(url, anon, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false
            }
        });

        window.supabaseClient = supabaseClient;
        window.supabaseReady = true;

        // Expose as globals so auth-manager, applications, user-management can use them
        window.SUPABASE_URL  = url;
        window.SUPABASE_ANON = anon;

        console.log('✅ Supabase client connected:', url);

        // Lightweight health check — just verify the DB is reachable
        supabaseClient.from('students').select('count', { count: 'exact', head: true })
            .then(({ error }) => {
                if (error) console.warn('⚠️  Supabase connection issue:', error.message);
                else console.log('✅ Supabase database reachable.');
            });

    } catch (err) {
        console.error('❌ Failed to initialise Supabase client:', err);
        window.supabaseReady = false;
    }
}

// Initialize immediately with whatever credentials are available now.
// If env-loader.js loads after this script, it will call _initSupabase() again
// with fresh ENV values only if Supabase has not already connected.
_initSupabase();

// Re-init after env-loader finishes (no-op if already connected)
if (window.envReady && !window.supabaseReady) {
    window.envReady.then(() => {
        if (!window.supabaseReady) _initSupabase();
    });
}

// ============================================
// Convenience: internal email mapping for Auth
// Supabase Auth needs an email; we generate one
// from the school user ID so login still works
// with the existing ADMIN-0001 / STU-2024-001 format.
// ============================================
function schoolIdToEmail(schoolId) {
    return schoolId.toLowerCase().replace(/\s+/g, '-') + '@tbd.internal';
}

window.schoolIdToEmail = schoolIdToEmail;

// ============================================
// Auth Helpers (used by auth-manager.js later)
// ============================================
const sbAuth = {
    /**
     * Sign in with school ID + password
     * e.g. sbAuth.signIn('ADMIN-0001', 'Admin@2024')
     */
    async signIn(schoolId, password) {
        if (!window.supabaseReady) return { error: { message: 'Supabase not connected' } };
        const email = schoolIdToEmail(schoolId);
        return await supabaseClient.auth.signInWithPassword({ email, password });
    },

    /**
     * Sign up a new user in Supabase Auth
     * Called by admin when creating accounts
     */
    async signUp(schoolId, password, metadata = {}) {
        if (!window.supabaseReady) return { error: { message: 'Supabase not connected' } };
        const email = schoolIdToEmail(schoolId);
        return await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: metadata }
        });
    },

    /** Sign out the current user */
    async signOut() {
        if (!window.supabaseReady) return;
        return await supabaseClient.auth.signOut();
    },

    /** Get current Supabase session (returns null if not logged in) */
    async getSession() {
        if (!window.supabaseReady) return null;
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session;
    },

    /** Get current user object */
    async getUser() {
        if (!window.supabaseReady) return null;
        const { data: { user } } = await supabaseClient.auth.getUser();
        return user;
    },

    /** Listen for auth state changes (login / logout) */
    onAuthChange(callback) {
        if (!window.supabaseReady) return;
        supabaseClient.auth.onAuthStateChange(callback);
    }
};

window.sbAuth = sbAuth;

// ============================================
// DB Helpers — thin wrapper around supabase-js
// Used by modules before full data-manager swap
// ============================================
const sbDB = {
    /** Fetch all rows from a table */
    async getAll(table, options = {}) {
        if (!window.supabaseReady) return [];
        let query = supabaseClient.from(table).select(options.select || '*');
        if (options.eq) query = query.eq(options.eq[0], options.eq[1]);
        if (options.order) query = query.order(options.order, { ascending: options.asc ?? true });
        if (options.limit) query = query.limit(options.limit);
        const { data, error } = await query;
        if (error) { console.error(`sbDB.getAll(${table}):`, error.message); return []; }
        return data;
    },

    /** Fetch a single row by ID */
    async getById(table, id) {
        if (!window.supabaseReady) return null;
        const { data, error } = await supabaseClient.from(table).select('*').eq('id', id).single();
        if (error) { console.error(`sbDB.getById(${table}):`, error.message); return null; }
        return data;
    },

    /** Insert a new row (returns the inserted row) */
    async create(table, payload) {
        if (!window.supabaseReady) return null;
        const { data, error } = await supabaseClient.from(table).insert(payload).select().single();
        if (error) { console.error(`sbDB.create(${table}):`, error.message); return null; }
        return data;
    },

    /** Update a row by ID (returns the updated row) */
    async update(table, id, updates) {
        if (!window.supabaseReady) return null;
        const { data, error } = await supabaseClient
            .from(table)
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) { console.error(`sbDB.update(${table}):`, error.message); return null; }
        return data;
    },

    /** Delete a row by ID */
    async delete(table, id) {
        if (!window.supabaseReady) return false;
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) { console.error(`sbDB.delete(${table}):`, error.message); return false; }
        return true;
    },

    /** Fetch the logged-in user's profile from `profiles` table */
    async getMyProfile() {
        if (!window.supabaseReady) return null;
        const user = await sbAuth.getUser();
        if (!user) return null;
        return await this.getById('profiles', user.id);
    }
};

window.sbDB = sbDB;
