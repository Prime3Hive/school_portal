// ============================================
// MAIN APPLICATION - Router & Initialization
// ============================================

class SchoolPortalApp {
    constructor() {
        this.currentModule = null;
        this.init();
    }

    init() {
        this.applyRolePermissions();
        this.setupNavigation();
        this.loadInitialModule();
        this.setupDataSyncListener();
    }

    /** Role of the signed-in user, or null when unknown. */
    get currentRole() {
        return window.authManager?.getSession?.()?.role || null;
    }

    /**
     * portal.html is shared by `admin` and `staff`, but its sidebar is static
     * markup listing every admin module. Hide the links this role has no
     * business seeing. This is presentation only — loadModule() enforces the
     * same rule, and Supabase RLS is the actual security boundary.
     */
    applyRolePermissions() {
        const role = this.currentRole;
        if (!role || !window.permissionManager) return;

        document.querySelectorAll('.nav-link[data-module]').forEach(link => {
            if (!permissionManager.canAccessModule(role, link.dataset.module)) {
                link.closest('.nav-item')?.setAttribute('hidden', '');
                link.style.display = 'none';
            }
        });

        // A group heading with every link under it hidden is just noise.
        document.querySelectorAll('.nav-section-label').forEach(label => {
            let el = label.nextElementSibling;
            let visible = false;
            while (el && !el.classList.contains('nav-section-label')) {
                if (!el.hidden) { visible = true; break; }
                el = el.nextElementSibling;
            }
            label.hidden = !visible;
        });
    }

    /** True when the signed-in role may open this module. */
    canOpen(moduleName) {
        const role = this.currentRole;
        // No role resolved yet (or no permission manager) — don't lock the user
        // out of their own portal; the auth guard already gated the page.
        if (!role || !window.permissionManager) return true;
        return permissionManager.canAccessModule(role, moduleName);
    }

    // ── Live Sync: Re-render active module when another admin makes changes ──
    setupDataSyncListener() {
        this._syncDebounce = null;
        this._lastSyncRender = 0;

        window.addEventListener('datamanager:change', (e) => {
            const { collection, eventType } = e.detail || {};
            console.log(`[App] Data changed: ${collection} (${eventType}) — scheduling refresh`);

            // Debounce: wait 500ms after last change event before re-rendering
            // (batches rapid multi-table updates into one render)
            clearTimeout(this._syncDebounce);
            this._syncDebounce = setTimeout(() => {
                this._refreshCurrentModule();
            }, 500);
        });
    }

    async _refreshCurrentModule() {
        if (!this.currentModule) return;

        // Throttle: don't re-render more than once every 2 seconds
        const now = Date.now();
        if (now - this._lastSyncRender < 2000) return;
        this._lastSyncRender = now;

        const moduleFnName = this.camelCase(this.currentModule) + 'Module';
        const moduleObj = window[moduleFnName];
        if (!moduleObj) return;

        const contentArea = document.getElementById('main-content');
        if (!contentArea) return;

        try {
            // Skip if the module manages its own data-change listener (avoids double render)
            if (typeof moduleObj._onDataChange === 'function') return;

            // Fallback for modules without their own listener
            if (typeof moduleObj.render === 'function') {
                moduleObj.render();
            } else if (typeof moduleObj.init === 'function') {
                await moduleObj.init(contentArea);
            }
        } catch (err) {
            console.warn(`[App] Sync refresh failed for ${this.currentModule}:`, err);
        }
    }

    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const module = link.dataset.module;

                // Skip if no module (e.g., external links like blog)
                if (!module) {
                    return; // Allow default behavior for external links
                }

                e.preventDefault();
                this.loadModule(module);

                // Update active state
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    /**
     * "#student-record/<id>" → { module: 'student-record', id: '<id>' }.
     * A page that shows one record keeps its id in the hash, so a reload or a
     * shared link lands on the same record.
     */
    parseHash(raw = window.location.hash) {
        const [module, ...rest] = String(raw || '').replace(/^#/, '').split('/');
        const id = rest.length ? decodeURIComponent(rest.join('/')) : null;
        return { module: module || null, id };
    }

    loadInitialModule() {
        // Load dashboard by default
        const parsed = this.parseHash();
        // Each portal page names its own home (body data-home); the staff portal's is Today.
        const home = document.body?.dataset?.home || 'admin-dashboard';
        let hash = parsed.module || home;

        // A stale/hand-typed hash for a module this role can't open shouldn't
        // land them on an Access Denied screen at login — send them to the first
        // section they are allowed to see instead.
        if (!this.canOpen(hash)) {
            const firstAllowed = Array.from(document.querySelectorAll('.nav-link[data-module]'))
                .map(l => l.dataset.module)
                .find(m => this.canOpen(m));
            hash = firstAllowed || home;
        }

        this.loadModule(hash, hash === parsed.module && parsed.id ? { id: parsed.id } : {});
    }

    /**
     * @param {string} moduleName
     * @param {{ tab?: string, id?: string }} [options]
     *   tab — open the module on one of its tabs. Modules keep their tab in
     *     `currentTab` or `_tab`; it is set before init() so the first render
     *     is already the right one.
     *   id  — the record a single-record page shows. It goes into the hash and
     *     is passed to init(container, options).
     */
    async loadModule(moduleName, options = {}) {
        const contentArea = document.getElementById('main-content');
        const breadcrumb = document.getElementById('breadcrumb-current');

        // Gate on role before fetching the module script. Without this, any
        // authenticated user could load e.g. #user-management straight from the
        // URL hash regardless of role.
        if (!this.canOpen(moduleName)) {
            console.warn(`[App] Role "${this.currentRole}" is not permitted to open "${moduleName}"`);
            this.currentModule = null;
            if (breadcrumb) breadcrumb.textContent = 'Access Denied';
            if (contentArea) {
                contentArea.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <h3 class="empty-state-title">Access Denied</h3>
            <p class="empty-state-description">You do not have permission to view this section.</p>
          </div>
        `;
            }
            return;
        }

        // Cleanup previous module if it has a cleanup method
        if (this.currentModule) {
            const previousModuleName = this.camelCase(this.currentModule) + 'Module';
            const previousModule = window[previousModuleName];
            if (previousModule && typeof previousModule.cleanup === 'function') {
                await previousModule.cleanup();
            }
        }

        // Most modules add a datamanager:change listener in init() and never
        // remove it, so a data change could redraw a page the user had left
        // over the one in view. Detach every module's listener here; the module
        // being opened adds its own again in init().
        Object.keys(window).forEach(k => {
            if (!k.endsWith('Module')) return;
            const m = window[k];
            if (m && typeof m._onDataChange === 'function') {
                window.removeEventListener('datamanager:change', m._onDataChange);
            }
        });

        // Show loading
        showLoading(contentArea);

        // Update URL hash
        this.currentModule = moduleName;
        this.currentId = options.id || null;
        window.location.hash = options.id ? `${moduleName}/${encodeURIComponent(options.id)}` : moduleName;

        // Keep the sidebar in step however the module was opened — a link on
        // the dashboard, the bell, or the sidebar itself. A record page lights
        // up the list it belongs to.
        const navFor = { 'student-record': 'student-directory' }[moduleName] || moduleName;
        document.querySelectorAll('.nav-link[data-module]').forEach(l => {
            const on = l.dataset.module === navFor;
            l.classList.toggle('active', on);
            if (on) l.setAttribute('aria-current', 'page');
            else l.removeAttribute('aria-current');
        });

        // Module titles
        // Match the sidebar labels, so the title always names the link just clicked.
        const moduleTitles = {
            'admin-dashboard': 'Today',
            'student-directory': 'Students',
            'student-record': 'Student record',
            'staff-management': 'Staff',
            'fees-payments': 'Fees & payments',
            'payment-checks': 'Payments to check',
            'inventory': 'Inventory',
            'academics': 'Classes & scores',
            'applications': 'Applications',
            'user-management': 'Users & access',
            'admin-profile': 'My profile',
            'settings': 'Settings',
            'calendar': 'Calendar & events',
            'teacher-tasks': 'Assignments',
            'report-cards': 'Report cards'
        };

        // Update breadcrumb
        if (breadcrumb) {
            // The sidebar's own label names the page, so a portal that labels a
            // shared module differently (Academics is "Classes & lessons" for
            // teachers) titles it the same way; record pages use the map.
            const navLabel = document.querySelector(`.nav-link[data-module="${navFor}"] .nav-link-text`)?.textContent?.trim();
            breadcrumb.textContent = (navFor === moduleName && navLabel) || moduleTitles[moduleName] || navLabel || moduleName;
        }

        // Load module content
        try {
            // Dynamically load module script if not already loaded
            if (!window[`${this.camelCase(moduleName)}Module`]) {
                await this.loadScript(`js/modules/${moduleName}.js`);
            }

            // Initialize module
            const moduleFunction = window[`${this.camelCase(moduleName)}Module`];
            if (moduleFunction) {
                if (options.tab) {
                    if ('currentTab' in moduleFunction) moduleFunction.currentTab = options.tab;
                    else if ('_tab' in moduleFunction) moduleFunction._tab = options.tab;
                }
                await moduleFunction.init(contentArea, options);
            } else {
                contentArea.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🚧</div>
            <h3 class="empty-state-title">Module Under Development</h3>
            <p class="empty-state-description">The ${moduleTitles[moduleName]} module is coming soon!</p>
          </div>
        `;
            }
        } catch (error) {
            console.error(`Error loading module ${moduleName}:`, error);
            contentArea.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <h3 class="empty-state-title">Error Loading Module</h3>
          <p class="empty-state-description">Failed to load ${moduleTitles[moduleName]}. Please try again.</p>
        </div>
      `;
        }
    }

    /**
     * Resolve a source path to its built filename.
     *
     * Production builds content-hash module filenames (js/modules/x.js →
     * js/modules/x.4f2a1c9d.js) and inline a lookup table as window.__ASSET_MAP.
     * In dev there is no map, so the path passes through unchanged.
     */
    resolveAssetPath(src) {
        return window.__ASSET_MAP?.[src] || src;
    }

    async loadScript(src) {
        const resolved = this.resolveAssetPath(src);
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = resolved;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${resolved}`));
            document.head.appendChild(script);
        });
    }

    camelCase(str) {
        // Convert admin-dashboard to adminDashboard (lowercase first letter)
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SchoolPortalApp();
    // Boot global search after data manager is ready
    if (window.dataManager?.waitForReady) {
        dataManager.waitForReady().then(() => window.globalSearch?.init());
    } else {
        // Fallback: init after a short delay
        setTimeout(() => window.globalSearch?.init(), 1500);
    }
});

// Handle browser back/forward (not nav-link clicks — those call loadModule directly)
window.addEventListener('hashchange', () => {
    if (!window.app) return;
    const { module, id } = window.app.parseHash();
    if (module && (window.app.currentModule !== module || (window.app.currentId || null) !== id)) {
        window.app.loadModule(module, id ? { id } : {});
    }
});

