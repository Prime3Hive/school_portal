// ============================================
// MAIN APPLICATION - Router & Initialization
// ============================================

class SchoolPortalApp {
    constructor() {
        this.currentModule = null;
        this.init();
    }

    init() {
        this.setupNavigation();
        this.loadInitialModule();
        this.setupDataSyncListener();
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

    loadInitialModule() {
        // Load dashboard by default
        const hash = window.location.hash.slice(1) || 'admin-dashboard';
        this.loadModule(hash);

        // Set active nav link
        const activeLink = document.querySelector(`[data-module="${hash}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    async loadModule(moduleName) {
        const contentArea = document.getElementById('main-content');
        const breadcrumb = document.getElementById('breadcrumb-current');

        // Cleanup previous module if it has a cleanup method
        if (this.currentModule) {
            const previousModuleName = this.camelCase(this.currentModule) + 'Module';
            const previousModule = window[previousModuleName];
            if (previousModule && typeof previousModule.cleanup === 'function') {
                await previousModule.cleanup();
            }
        }

        // Show loading
        showLoading(contentArea);

        // Update URL hash
        window.location.hash = moduleName;
        this.currentModule = moduleName;

        // Module titles
        const moduleTitles = {
            'admin-dashboard': 'Admin Dashboard',
            'student-directory': 'Student Directory',
            'staff-management': 'Staff Management',
            'class-schedule': 'Class & Schedule',
            'fees-payments': 'Fees & Payments',
            'inventory': 'Inventory Management',
            'academics': 'Academics',
            'applications': 'Applications',
            'user-management': 'User Management',
            'admin-profile': 'My Profile',
            'settings': 'Settings',
            'calendar': 'School Calendar',
            'teacher-tasks': 'Assignments',
            'lesson-plans': 'Lesson Plans',
            'report-cards': 'Report Cards'
        };

        // Update breadcrumb
        if (breadcrumb) {
            breadcrumb.textContent = moduleTitles[moduleName] || moduleName;
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
                await moduleFunction.init(contentArea);
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

    async loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
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
    const module = window.location.hash.slice(1);
    if (module && window.app && window.app.currentModule !== module) {
        window.app.loadModule(module);
        document.querySelectorAll('.nav-link').forEach(l => {
            l.classList.toggle('active', l.dataset.module === module);
        });
    }
});

