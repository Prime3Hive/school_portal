// ============================================
// AUTH MANAGER — Supabase Auth
//
//   authManager.login(schoolId, password)
//   authManager.logout()
//   authManager.isAuthenticated()
//   authManager.getSession()
//   authManager.getRedirectUrl(role)
//   authManager.changePassword(schoolId, currentPwd, newPwd)
//   authManager.getUsers()   / getUserById()
//   authManager.updateUser() / deleteUser()
//
// ── ACCOUNTS ────────────────────────────────
// There is no self-signup. An admin creates every account, and exactly two
// calls do it:
//
//   authManager.createAccount({ email, role, fullName, ... })
//       → create-account: auth user + profile + role record + credential
//         email via Resend. The account works immediately; the first login
//         forces a password change.
//
//   authManager.resendCredentials(schoolId)
//       → resend-credentials: new password on the *same* account, emailed.
//         This is also the password-reset path.
//
// createUser() and createInvitation() are aliases of createAccount kept for
// older call sites. There is no invitation to accept: an earlier design wrote
// an `invitations` row and left the user to be created on acceptance, but
// nothing created it, so no invitation could ever be accepted.
// ============================================

class AuthManager {
    constructor() {
        // For pages that load before supabaseClient is ready
        this._ready = false;
        this._sessionCache = this._loadLocalSession();
        this._init();
    }

    // ─────────────────────────────────────────
    // Internal bootstrap
    // ─────────────────────────────────────────
    async _init() {
        if (!window.supabaseReady) {
            console.warn('AuthManager: Supabase not ready — running in localStorage-compat mode.');
            return;
        }

        // Hydrate session from Supabase on page load
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            const profile = await this._fetchProfile(session.user.id);
            if (profile) {
                this._sessionCache = this._buildSession(profile, session);
                this._saveLocalSession(this._sessionCache);
            }
        }
        this._ready = true;

        this._changingPassword = false;

        // Keep session refreshed automatically
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            // Skip session rebuilds while changePassword is in progress
            if (this._changingPassword) return;

            if (event === 'SIGNED_OUT' || !session) {
                this._sessionCache = null;
                this._clearLocalSession();
            } else if (session) {
                const profile = await this._fetchProfile(session.user.id);
                if (profile) {
                    this._sessionCache = this._buildSession(profile, session);
                    this._saveLocalSession(this._sessionCache);
                }
            }
        });
    }

    // ─────────────────────────────────────────
    // Core: login
    // ─────────────────────────────────────────
    async login(schoolId, password) {
        // No offline fallback. There used to be one — _legacyLogin read users
        // from localStorage and bcrypt-compared in the browser — which meant a
        // second, weaker authentication implementation shipped to every visitor
        // and one refactor away from being reachable. Without Supabase there is
        // nothing to authenticate against, and saying so is the honest answer.
        if (!window.supabaseReady) {
            return { success: false, error: 'The portal cannot reach its server right now. Check your connection and try again.' };
        }

        const email = schoolIdToEmail(schoolId.trim().toUpperCase());

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            return { success: false, error: 'Invalid credentials. Please check your ID and password.' };
        }

        const profile = await this._fetchProfile(data.user.id);
        if (!profile) {
            await supabaseClient.auth.signOut();
            return { success: false, error: 'Account profile not found. Contact your administrator.' };
        }

        if (profile.status === 'inactive' || profile.status === 'suspended') {
            await supabaseClient.auth.signOut();
            return { success: false, error: 'Your account is inactive. Contact your administrator.' };
        }

        // Stamp last_login. Goes through an RPC because a direct UPDATE only
        // lands if the profiles RLS policy lets a user write their own row —
        // and the admin console now treats a null last_login as "credentials
        // may never have reached this person", so a silently dropped write
        // would have admins reissuing passwords to people already using them.
        // Non-fatal: failing to record the visit must not block the sign-in.
        const { error: stampError } = await supabaseClient.rpc('record_login');
        if (stampError) console.warn('record_login:', stampError.message);

        const session = this._buildSession(profile, data.session);
        this._sessionCache = session;
        this._saveLocalSession(session);

        return {
            success: true,
            session,
            mustChangePassword: profile.must_change_password
        };
    }

    // ─────────────────────────────────────────
    // Core: logout
    // ─────────────────────────────────────────
    async logout(redirectTo = 'login.html') {
        // Step 1: Stop all background processes immediately
        try {
            if (typeof dataManager !== 'undefined' && typeof dataManager.stopSync === 'function') {
                dataManager.stopSync();
            }
        } catch (e) { /* ignore */ }

        // Step 2: Sign out from Supabase (server-side token invalidation)
        // Wrap in its own try-catch so a network failure doesn't block the rest
        if (window.supabaseReady && window.supabaseClient) {
            try {
                await supabaseClient.auth.signOut();
            } catch (e) {
                console.error('Supabase signOut error (continuing logout):', e);
            }
        }

        // Step 3: Nuke ALL session storage regardless of what happened above
        this._sessionCache = null;
        this._clearLocalSession();
        sessionStorage.clear();

        // Step 4: Hard redirect — replace() prevents the back-button returning here
        if (redirectTo) {
            window.location.replace(redirectTo);
        }
    }

    // ─────────────────────────────────────────
    // Session helpers (synchronous — used by many modules)
    // ─────────────────────────────────────────
    isAuthenticated() {
        const session = this._sessionCache;
        if (!session) return false;
        // Check expiry stored in local session cache
        if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
            this._clearLocalSession();
            return false;
        }
        return true;
    }

    getSession() {
        return this._sessionCache;
    }

    /**
     * Authoritative session check — the one a page guard should use.
     *
     * isAuthenticated() above is synchronous and reads the cache, which is
     * hydrated from localStorage in the constructor so the UI has something to
     * render before Supabase answers. That makes it a convenience, not a
     * control: a hand-written `sb_session` entry with role "admin" satisfies it.
     * RLS is what actually stops such a person reading anything, but they
     * should not get as far as a rendered admin shell.
     *
     * This asks Supabase for the session, re-reads the profile from the server,
     * and rejects accounts that are no longer active — a suspension now takes
     * effect on the next page load rather than whenever the cached session
     * happens to expire.
     *
     * Fails closed: no Supabase, no session.
     *
     * @param {string[]} [allowedRoles] - roles permitted on this page
     * @returns {Promise<{ok: boolean, reason?: 'offline'|'unauthenticated'|'inactive'|'forbidden', session: object|null}>}
     */
    async requireSession(allowedRoles = null) {
        if (!window.supabaseReady || !window.supabaseClient) {
            this._sessionCache = null;
            this._clearLocalSession();
            return { ok: false, reason: 'offline', session: null };
        }

        let session = null;
        try {
            ({ data: { session } } = await supabaseClient.auth.getSession());
        } catch (err) {
            console.error('requireSession:', err);
        }

        if (!session) {
            this._sessionCache = null;
            this._clearLocalSession();
            return { ok: false, reason: 'unauthenticated', session: null };
        }

        const profile = await this._fetchProfile(session.user.id);
        if (!profile || profile.status === 'inactive' || profile.status === 'suspended') {
            try { await supabaseClient.auth.signOut(); } catch { /* redirect anyway */ }
            this._sessionCache = null;
            this._clearLocalSession();
            return { ok: false, reason: 'inactive', session: null };
        }

        const built = this._buildSession(profile, session);
        this._sessionCache = built;
        this._saveLocalSession(built);

        if (allowedRoles && !allowedRoles.includes(built.role)) {
            return { ok: false, reason: 'forbidden', session: built };
        }
        return { ok: true, session: built };
    }

    /**
     * Where each role lands after signing in.
     *
     * `staff` goes to portal.html, not teacher-portal.html. The nav
     * permissionManager gives a staff member is Dashboard / Inventory /
     * Fees & Payments, and none of those modules are loaded by
     * teacher-portal.html — a staff member sent there saw three links that
     * all rendered "coming soon". portal.html already guards on
     * ['admin','staff'] and hides the modules staff may not open.
     */
    getRedirectUrl(role) {
        const routes = {
            admin: 'portal.html',
            teacher: 'teacher-portal.html',
            staff: 'portal.html',
            student: 'student-portal.html',
            guardian: 'student-portal.html'
        };
        return routes[role] || 'login.html';
    }

    // Check if user has a specific permission
    hasPermission(permission) {
        const session = this.getSession();
        if (!session) return false;
        if (session.role === 'admin') return true;
        return (session.permissions || []).includes(permission);
    }

    // ─────────────────────────────────────────
    // User Management (admin only)
    // ─────────────────────────────────────────

    /** Cached users list — call refreshUsers() to update */
    _usersCache = [];
    _usersCacheReady = false;
    _usersCacheTime = 0;       // timestamp of last fetch
    _invitationsCache = null;  // cached invitations array
    _invitationsCacheTime = 0; // timestamp of last fetch
    static _CACHE_TTL = 30_000; // 30 seconds

    /** Get all users (synchronous from cache). Call refreshUsers() first on page load. */
    getAllUsers() {
        if (!window.supabaseReady) return [];
        return this._usersCache;
    }

    /** Async fetch all users from Supabase profiles table.
     *  Results are cached for 30 s — pass force=true to bypass cache. */
    async getUsers(force = false) {
        if (!window.supabaseReady) return [];

        // Return cached result if still fresh
        if (!force && this._usersCacheReady && (Date.now() - this._usersCacheTime) < AuthManager._CACHE_TTL) {
            return this._usersCache;
        }

        // Every profile is a real, usable account, so every profile is listed.
        //
        // This used to hide anyone whose invitation was not 'accepted' — which,
        // once accounts started being created up front, meant an admin created
        // a user and then could not see them anywhere in the portal. Whether
        // someone has actually signed in is shown per-row from last_login.
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at');
        if (error) { console.error('getUsers:', error.message); return []; }

        this._usersCache = profiles.map(p => this._profileToUser(p));
        this._usersCacheReady = true;
        this._usersCacheTime = Date.now();
        return this._usersCache;
    }

    /** Force-refresh users cache (call after any mutation). */
    async refreshUsers() { return this.getUsers(true); }

    /** Invalidate caches so next getUsers/getInvitations call fetches fresh data. */
    invalidateUsersCache() {
        this._usersCacheTime = 0;
        this._invitationsCacheTime = 0;
    }

    async getUserById(schoolId) {
        if (!window.supabaseReady) return null;
        // Try cache first
        const cached = this._usersCache.find(u => u.id === schoolId || u.schoolId === schoolId);
        if (cached) return cached;
        const { data, error } = await supabaseClient
            .from('profiles').select('*').eq('school_id', schoolId).single();
        if (error) return null;
        return this._profileToUser(data);
    }

    /**
     * Call an account edge function with the admin's own token.
     *
     * Every account operation goes through here, so the authorization header,
     * the "you are signed out" case and the shape of a failure are decided once
     * instead of in each of the eight places that used to open their own fetch.
     */
    async _callAccountFunction(fn, payload) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const accessToken = session?.access_token;
            if (!accessToken) {
                return { success: false, error: 'Your session has expired. Please sign in again.' };
            }

            const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON
                },
                body: JSON.stringify(payload)
            });

            const result = await res.json().catch(() => ({}));
            if (!res.ok || !result.success) {
                return { success: false, error: result.error || `Request failed (HTTP ${res.status})` };
            }

            // Any account change invalidates both lists.
            this.invalidateUsersCache();
            return result;
        } catch (err) {
            console.error(`${fn} error:`, err);
            return { success: false, error: err.message || 'Network error. Check your connection and try again.' };
        }
    }

    /**
     * Create a portal account. The single entry point — there is no separate
     * "invite" flow, because there is nothing to accept: the account is live as
     * soon as this returns, and create-account has already emailed the
     * credentials via Resend.
     *
     * payload: { email, role, fullName, department?, grade?, section?,
     *            dateOfBirth?, gender?, photoUrl?, guardian? }
     *
     * Returns { success, schoolId, userId, authId, password, emailSent,
     *           emailMessage } — `password` is the one and only time the
     * plaintext is available, so show it to the admin before discarding it.
     */
    async createAccount(payload) {
        if (!window.supabaseReady) return { success: false, error: 'Cannot create an account while offline.' };

        const result = await this._callAccountFunction('create-account', {
            email:       payload.email,
            role:        payload.role,
            fullName:    payload.fullName,
            department:  payload.department || null,
            grade:       payload.grade || null,
            section:     payload.section || null,
            dateOfBirth: payload.dateOfBirth || null,
            gender:      payload.gender || null,
            photoUrl:    payload.photoUrl || null,
            guardian:    payload.guardian || null
        });

        if (result.success) await this.refreshUsers();
        return result;
    }

    /**
     * Issue a fresh password for an account that already exists and email it.
     * Same person, same login ID, same records — this is both "resend the
     * credentials" and "reset their password", which are the same operation.
     *
     * Pass `email` only to correct a wrong address at the same time.
     */
    async resendCredentials(schoolId, email) {
        if (!window.supabaseReady) {
            return { success: false, error: 'Resending credentials requires a connection.' };
        }
        const result = await this._callAccountFunction('resend-credentials', { schoolId, email });
        if (result.success) await this.refreshUsers();
        return result;
    }

    /** @deprecated Use createAccount(). Kept so older call sites keep working. */
    async createUser(payload) {
        return this.createAccount(payload);
    }

    async updateUser(schoolId, updates) {
        if (!window.supabaseReady) return { success: false, error: 'Cannot update an account while offline.' };
        // Build only the fields that are provided
        const patch = { updated_at: new Date().toISOString() };
        if (updates.fullName !== undefined) patch.full_name = updates.fullName;
        if (updates.email !== undefined) patch.email = updates.email;
        if (updates.role !== undefined) patch.role = updates.role;
        if (updates.permissions !== undefined) patch.permissions = updates.permissions;
        if (updates.status !== undefined) patch.status = updates.status;

        const { error } = await supabaseClient
            .from('profiles').update(patch).eq('school_id', schoolId);
        if (!error) await this.refreshUsers();
        return { success: !error, error: error?.message };
    }

    async deleteUser(schoolId) {
        if (!window.supabaseReady) return { success: false, error: 'Cannot delete an account while offline.' };

        try {
            const session = await supabaseClient.auth.getSession();
            const accessToken = session.data.session?.access_token;
            if (!accessToken) return { success: false, error: 'Not authenticated' };

            const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON
                },
                body: JSON.stringify({ schoolId })
            });

            const result = await res.json();
            if (!res.ok) return { success: false, error: result.error || 'Failed to delete user' };

            await this.refreshUsers();
            return { success: true };
        } catch (err) {
            console.error('deleteUser error:', err);
            return { success: false, error: err.message };
        }
    }

    async changePassword(schoolId, currentPassword, newPassword) {
        if (!window.supabaseReady) return { success: false, error: 'Password change requires a connection to the portal server.' };

        // Guard: prevent onAuthStateChange from firing during this flow
        this._changingPassword = true;

        try {
            // 1. Verify current password by attempting a fresh sign-in
            const email = schoolIdToEmail(schoolId.trim().toUpperCase());
            const { data: signInData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email, password: currentPassword
            });
            if (authError) {
                this._changingPassword = false;
                return { success: false, error: 'Current password is incorrect.' };
            }

            const userId = signInData.user.id;

            // 2. Update the password via Supabase Auth
            const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword });
            if (updateError) {
                this._changingPassword = false;
                return { success: false, error: updateError.message };
            }

            // 3. Flip must_change_password using auth UUID (reliable with RLS)
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .update({ must_change_password: false })
                .eq('id', userId);

            if (profileError) {
                console.warn('Profile update warning:', profileError.message);
            }

            // 4. Update local session cache
            if (this._sessionCache) {
                this._sessionCache.mustChangePassword = false;
                this._saveLocalSession(this._sessionCache);
            }

            this._changingPassword = false;
            return { success: true };
        } catch (err) {
            this._changingPassword = false;
            console.error('changePassword error:', err);
            return { success: false, error: err.message || 'An unexpected error occurred.' };
        }
    }

    // ─────────────────────────────────────────
    // Issuance records
    //
    // `invitations` is a log of who was granted access, not a set of tickets to
    // redeem. Nothing is pending: the account works the moment it is created.
    // ─────────────────────────────────────────

    /** @deprecated Use createAccount(). Alias kept for existing call sites. */
    async createInvitation(payload) {
        return this.createAccount(payload);
    }

    /** Get all invitations from Supabase. Cached for 30 s; pass force=true to bypass. */
    async getInvitations(force = false) {
        if (!window.supabaseReady) {
            return JSON.parse(localStorage.getItem('tbd_academy_invitations') || '[]');
        }
        // Return cached result if still fresh
        if (!force && this._invitationsCache && (Date.now() - this._invitationsCacheTime) < AuthManager._CACHE_TTL) {
            return this._invitationsCache;
        }
        const { data, error } = await supabaseClient
            .from('invitations').select('*').order('created_at', { ascending: false });
        if (error) { console.error('getInvitations:', error.message); return []; }
        this._invitationsCache = data;
        this._invitationsCacheTime = Date.now();
        return data;
    }

    // ─────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────
    async _fetchProfile(userId) {
        const { data, error } = await supabaseClient
            .from('profiles').select('*').eq('id', userId).single();
        if (error) { console.error('_fetchProfile:', error.message); return null; }
        return data;
    }

    _buildSession(profile, supabaseSession) {
        return {
            userId: profile.school_id,
            fullName: profile.full_name,
            role: profile.role,
            email: profile.email,
            status: profile.status,
            permissions: profile.permissions || [],
            mustChangePassword: !!profile.must_change_password,
            supabaseId: profile.id,
            // NOTE: accessToken intentionally NOT stored here.
            // The Supabase SDK stores and rotates its own token independently.
            expiresAt: supabaseSession?.expires_at
                ? new Date(supabaseSession.expires_at * 1000).toISOString()
                : null,
            loginTime: new Date().toISOString()
        };
    }

    _profileToUser(profile) {
        return {
            id: profile.school_id,
            schoolId: profile.school_id,
            fullName: profile.full_name,
            role: profile.role,
            email: profile.email,
            status: profile.status || 'active',
            permissions: profile.permissions || [],
            createdAt: profile.created_at,
            // Access state, straight off the profile. `lastLogin === null` is
            // the honest answer to "did they ever get in?" — the old proxy for
            // it was an invitation status nothing kept up to date.
            lastLogin: profile.last_login || null,
            mustChangePassword: !!profile.must_change_password
        };
    }

    /** Human-readable access state for a user row. */
    static accessState(user) {
        if (user.status === 'inactive' || user.status === 'suspended') {
            return { label: 'Suspended', tone: 'danger' };
        }
        if (!user.lastLogin) return { label: 'Never signed in', tone: 'warning' };
        if (user.mustChangePassword) return { label: 'Temporary password', tone: 'warning' };
        return { label: 'Active', tone: 'success' };
    }

    // ── Local session cache (keeps login state across page reloads) ──
    _saveLocalSession(session) {
        localStorage.setItem('sb_session', JSON.stringify(session));
    }
    _loadLocalSession() {
        try {
            const raw = localStorage.getItem('sb_session');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    _clearLocalSession() {
        // Our custom session keys
        localStorage.removeItem('sb_session');
        localStorage.removeItem('school_portal_session');

        // Supabase SDK stores its own token with keys like:
        // "sb-{projectRef}-auth-token"
        // We must clear these too or getSession() will restore the session
        // on the next page load even after signOut() fails.
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }

    // ── Removed: the localStorage fallback auth path ──────────────────────
    //
    // _legacyLogin / _legacyGetUsers / _legacyCreateUser / _legacyUpdateUser /
    // _legacyDeleteUser / _legacyChangePassword / initializeDefaultUsers used to
    // live here. Together they were a complete second authentication system —
    // users in localStorage, bcrypt.compareSync in the browser, and seeded
    // admin123 / teacher123 demo accounts — shipped to every visitor so that the
    // portal would "work" with Supabase unreachable.
    //
    // It failed closed in production (the seed refused to run on a non-local
    // hostname, so there were no users to match), but a login form with two
    // implementations only ever has one that is actually reviewed. Deleting it
    // also drops bcrypt.min.js — 21 KB on every page including the login page.
    //
    // Everything above now fails closed when window.supabaseReady is false.
}

// ─────────────────────────────────────────────
// Singleton export (same name all pages use)
// ─────────────────────────────────────────────
const authManager = new AuthManager();
