// ============================================
// AUTH MANAGER — Supabase Auth Edition
// Drop-in replacement for the localStorage+bcrypt version.
// Public API is identical so all existing pages work unchanged:
//   authManager.login(userId, password)
//   authManager.logout()
//   authManager.isAuthenticated()
//   authManager.getSession()
//   authManager.getRedirectUrl(role)
//   authManager.createUser(...)
//   authManager.changePassword(userId, currentPwd, newPwd)
//   authManager.getUsers()   / getUserById()
//   authManager.updateUser() / deleteUser()
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
        if (!window.supabaseReady) {
            return this._legacyLogin(schoolId, password);
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

        // Update last login
        await supabaseClient
            .from('profiles')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.user.id);

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

    getRedirectUrl(role) {
        const routes = {
            admin: 'index.html',
            teacher: 'teacher-portal.html',
            staff: 'teacher-portal.html',
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
        if (!window.supabaseReady) return this._legacyGetUsers();
        return this._usersCache;
    }

    /** Async fetch all users from Supabase profiles table.
     *  Results are cached for 30 s — pass force=true to bypass cache. */
    async getUsers(force = false) {
        if (!window.supabaseReady) return this._legacyGetUsers();

        // Return cached result if still fresh
        if (!force && this._usersCacheReady && (Date.now() - this._usersCacheTime) < AuthManager._CACHE_TTL) {
            return this._usersCache;
        }

        // Fetch profiles joined with invitations to filter out unaccepted invited users
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('created_at');
        if (error) { console.error('getUsers:', error.message); return []; }

        // Fetch all invitations keyed by school_id
        const { data: invitations } = await supabaseClient
            .from('invitations')
            .select('school_id, status');
        const inviteMap = {};
        (invitations || []).forEach(inv => { inviteMap[inv.school_id] = inv.status; });

        // Only include profiles that:
        // 1. Have no invitation record (e.g. built-in admin), OR
        // 2. Have an invitation with status 'accepted'
        const filtered = profiles.filter(p => {
            const invStatus = inviteMap[p.school_id];
            return invStatus === undefined || invStatus === 'accepted';
        });

        this._usersCache = filtered.map(p => this._profileToUser(p));
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
        if (!window.supabaseReady) return this._legacyGetUserById(schoolId);
        // Try cache first
        const cached = this._usersCache.find(u => u.id === schoolId || u.schoolId === schoolId);
        if (cached) return cached;
        const { data, error } = await supabaseClient
            .from('profiles').select('*').eq('school_id', schoolId).single();
        if (error) return null;
        return this._profileToUser(data);
    }

    /**
     * Create a new user via the create-invitation-v2 edge function.
     * This is the unified path — creates auth user + profile + role record.
     * payload: { role, fullName, email, department, grade, section, dateOfBirth }
     */
    async createUser(payload) {
        if (!window.supabaseReady) return this._legacyCreateUser(payload);

        const { role, fullName, email, department, grade, section, dateOfBirth } = payload;

        try {
            const session = await supabaseClient.auth.getSession();
            const accessToken = session.data.session?.access_token;
            if (!accessToken) return { success: false, error: 'Not authenticated' };

            const res = await fetch(`${SUPABASE_URL}/functions/v1/create-invitation-v2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON
                },
                body: JSON.stringify({ email, role, fullName, department, grade, section, dateOfBirth })
            });

            const result = await res.json();
            if (!res.ok) return { success: false, error: result.error || 'Failed to create user' };

            // Refresh cache
            await this.refreshUsers();
            return { success: true, userId: result.userId, password: result.password, authId: result.authId };
        } catch (err) {
            console.error('createUser error:', err);
            return { success: false, error: err.message };
        }
    }

    async updateUser(schoolId, updates) {
        if (!window.supabaseReady) return this._legacyUpdateUser(schoolId, updates);
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
        if (!window.supabaseReady) return this._legacyDeleteUser(schoolId);

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
        if (!window.supabaseReady) return this._legacyChangePassword(schoolId, currentPassword, newPassword);

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
    // Invitation system (admin-driven)
    // ─────────────────────────────────────────

    /**
     * Admin creates an invitation via create-invitation-v2 edge function.
     * Creates auth user + profile + role record + invitation in one call.
     * Returns { success, userId, password, authId }
     */
    async createInvitation({ email, role, fullName, department, grade, section, dateOfBirth, schoolId, password, expiryDays = 14 }) {
        if (!window.supabaseReady) {
            return this._legacyCreateInvitation({ email, role, fullName, department, schoolId, password });
        }

        try {
            const session = await supabaseClient.auth.getSession();
            const accessToken = session.data.session?.access_token;
            if (!accessToken) return { success: false, error: 'Not authenticated' };

            const res = await fetch(`${SUPABASE_URL}/functions/v1/create-invitation-v2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': SUPABASE_ANON
                },
                body: JSON.stringify({ email, role, fullName, department, grade, section, dateOfBirth, expiryDays })
            });

            const result = await res.json();
            if (!res.ok) return { success: false, error: result.error || 'Failed to create invitation' };

            await this.refreshUsers();
            return {
                success: true,
                token: result.token,
                schoolId: result.userId,
                password: result.password,
                authId: result.authId,
                emailSent: result.emailSent,
                emailMessage: result.emailMessage
            };
        } catch (err) {
            console.error('createInvitation error:', err);
            return { success: false, error: err.message };
        }
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

    /** Verify an invitation token — returns pending or accepted invitations */
    async verifyInvitation(token) {
        if (!window.supabaseReady) return null;
        const { data, error } = await supabaseClient
            .from('invitations')
            .select('*')
            .eq('token', token)
            .in('status', ['pending', 'accepted'])
            .single();
        if (error || !data) return null;
        // Reject if pending and expired
        if (data.status === 'pending' && new Date(data.expires_at) < new Date()) return null;
        return data;
    }

    /** Mark invitation as accepted */
    async acceptInvitation(token) {
        if (!window.supabaseReady) return { success: false, error: 'Supabase not ready' };
        const { error } = await supabaseClient
            .from('invitations')
            .update({ status: 'accepted', accepted_at: new Date().toISOString() })
            .eq('token', token);
        return { success: !error, error: error?.message };
    }

    /** Resend invitation — refreshes token and expiry, keeps status as accepted
     *  so the user remains visible in the users list */
    async resendInvitation(oldToken) {
        const inv = await this.verifyInvitation(oldToken);
        if (!inv) return { success: false, error: 'Invitation not found or expired' };

        const newToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

        // Update existing invitation with new token/expiry instead of creating a new one
        const { error } = await supabaseClient.from('invitations')
            .update({
                token: newToken,
                expires_at: expiresAt
            })
            .eq('token', oldToken);

        return error
            ? { success: false, error: error.message }
            : { success: true, token: newToken };
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
            createdAt: profile.created_at
        };
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

    // ──────────────────────────────────────────
    // Legacy localStorage fallback methods
    // (used when Supabase is not connected/offline)
    // ──────────────────────────────────────────
    async _legacyLogin(schoolId, password) {
        const users = JSON.parse(localStorage.getItem('school_portal_users') || '[]');
        const user = users.find(u => u.id === schoolId.toUpperCase());
        if (!user) return { success: false, error: 'User not found.' };

        let passwordMatch = false;
        try {
            if (typeof dcodeIO !== 'undefined') {
                passwordMatch = dcodeIO.bcrypt.compareSync(password, user.passwordHash);
            } else if (typeof bcrypt !== 'undefined') {
                passwordMatch = bcrypt.compareSync(password, user.passwordHash);
            }
        } catch { passwordMatch = (password === user.passwordHash); }

        if (!passwordMatch) return { success: false, error: 'Invalid password.' };

        const session = {
            userId: user.id,
            fullName: user.fullName,
            role: user.role,
            permissions: user.permissions || [],
            loginTime: new Date().toISOString()
        };
        this._sessionCache = session;
        localStorage.setItem('school_portal_session', JSON.stringify(session));
        return { success: true, session };
    }

    _legacyGetUsers() {
        return JSON.parse(localStorage.getItem('school_portal_users') || '[]');
    }
    _legacyGetUserById(schoolId) {
        return this._legacyGetUsers().find(u => u.id === schoolId) || null;
    }
    _legacyCreateUser(payload) {
        const users = this._legacyGetUsers();
        users.push({ id: payload.schoolId, ...payload });
        localStorage.setItem('school_portal_users', JSON.stringify(users));
        return { success: true };
    }
    _legacyUpdateUser(schoolId, updates) {
        const users = this._legacyGetUsers();
        const idx = users.findIndex(u => u.id === schoolId);
        if (idx > -1) { users[idx] = { ...users[idx], ...updates }; }
        localStorage.setItem('school_portal_users', JSON.stringify(users));
        return { success: true };
    }
    _legacyDeleteUser(schoolId) {
        const users = this._legacyGetUsers().filter(u => u.id !== schoolId);
        localStorage.setItem('school_portal_users', JSON.stringify(users));
        return { success: true };
    }
    _legacyCreateInvitation({ email, role, fullName, department, schoolId, password }) {
        // Create user in localStorage
        this._legacyCreateUser({ schoolId, password, role, fullName, email, passwordHash: password });
        // Store invitation
        const token = crypto.randomUUID();
        const invitations = JSON.parse(localStorage.getItem('tbd_academy_invitations') || '[]');
        invitations.push({
            token, email, role, school_id: schoolId, full_name: fullName,
            default_password: password, status: 'pending',
            metadata: { fullName, department },
            expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
            createdAt: Date.now()
        });
        localStorage.setItem('tbd_academy_invitations', JSON.stringify(invitations));
        return { success: true, token, schoolId, password };
    }
    _legacyChangePassword(schoolId, currentPwd, newPwd) {
        return { success: false, error: 'Password change requires Supabase connection.' };
    }

    // ──────────────────────────────────────────
    // Default user seeding (localStorage fallback)
    // ──────────────────────────────────────────
    initializeDefaultUsers() {
        // Only seed demo accounts in development/offline mode.
        // In production (Supabase connected), all accounts are managed via the DB.
        if (window.supabaseReady) {
            console.warn('AuthManager: Skipping demo user seed — Supabase is connected. Use the admin UI to create accounts.');
            return;
        }

        // Additional guard: refuse to seed if we detect a production hostname
        const hostname = window.location.hostname;
        const isProd = hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.local');
        if (isProd) {
            console.warn('AuthManager: Refusing to seed demo accounts on production host:', hostname);
            return;
        }

        const existing = JSON.parse(localStorage.getItem('school_portal_users') || '[]');
        if (existing.length > 0) return;

        let hashFn = (pwd) => pwd;
        try {
            if (typeof dcodeIO !== 'undefined') {
                hashFn = (pwd) => dcodeIO.bcrypt.hashSync(pwd, 10);
            } else if (typeof bcrypt !== 'undefined') {
                hashFn = (pwd) => bcrypt.hashSync(pwd, 10);
            }
        } catch { /* plain text fallback */ }

        const defaultUsers = [
            { id: 'ADMIN-0001', fullName: 'System Administrator', role: 'admin', passwordHash: hashFn('admin123'), status: 'active', permissions: [] },
            { id: 'TCH-0001', fullName: 'Sample Teacher', role: 'teacher', passwordHash: hashFn('teacher123'), status: 'active', permissions: [] },
            { id: 'STU-0001', fullName: 'Sample Student', role: 'student', passwordHash: hashFn('student123'), status: 'active', permissions: [] },
            { id: 'STAFF-001', fullName: 'Admin Officer', role: 'staff', passwordHash: hashFn('staff123'), status: 'active', permissions: [] }
        ];

        localStorage.setItem('school_portal_users', JSON.stringify(defaultUsers));
        console.log('AuthManager: Default users seeded for localStorage dev mode.');
    }
}

// ─────────────────────────────────────────────
// Singleton export (same name all pages use)
// ─────────────────────────────────────────────
const authManager = new AuthManager();

// Auto-seed default users if in localStorage mode
if (!window.supabaseReady) {
    authManager.initializeDefaultUsers();
}
