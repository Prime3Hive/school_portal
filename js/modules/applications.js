// ============================================
// APPLICATIONS MODULE
// Manages student application submissions from the public blog
// ============================================

const applicationsModule = {
    currentFilter: 'all',
    applications: [],
    searchQuery: '',
    sortBy: 'date',
    sortOrder: 'desc',

    // XSS helper — delegates to global escapeHtml when available
    _esc(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(String(str ?? ''));
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    async init(container) {
        if (container) this.container = container;

        // Stable bound handler — same reference across re-inits so removeEventListener works
        if (!this._boundDataChange) {
            this._boundDataChange = (e) => {
                if (e.detail?.collection === 'applications') {
                    this.applications = dataManager.getAll('applications') || [];
                    this.render();
                }
            };
        }
        window.removeEventListener('datamanager:change', this._boundDataChange);
        window.addEventListener('datamanager:change', this._boundDataChange);
        this._onDataChange = this._boundDataChange; // keep app.js skip-check working

        await this.loadApplications();
        this.render();
        this.attachEventListeners();
    },

    cleanup() {
        if (this._boundDataChange) {
            window.removeEventListener('datamanager:change', this._boundDataChange);
        }
    },

    async loadApplications() {
        await dataManager.waitForReady();
        // applications is a deferred collection — if not yet loaded, wait for it
        if (!dataManager._loaded['applications']) {
            await new Promise((resolve) => {
                const handler = (e) => {
                    if (e.detail?.collection === 'applications') {
                        window.removeEventListener('datamanager:change', handler);
                        resolve();
                    }
                };
                window.addEventListener('datamanager:change', handler);
                // Kick off fetch in case background load hasn't started yet
                if (!dataManager._loading['applications']) {
                    dataManager.refresh('applications');
                }
                // Safety timeout — don't block forever
                setTimeout(() => { window.removeEventListener('datamanager:change', handler); resolve(); }, 12000);
            });
        }
        this.applications = dataManager.getAll('applications') || [];
    },

    attachEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('applicationSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.refreshApplicationsList();
            });
        }
    },

    render() {
        const container = this.container || document.getElementById('main-content');
        const stats = this.getStatistics();

        container.innerHTML = `
      <div class="module-header" style="margin-bottom: 2rem;">
        <div>
          <h1 class="module-title" style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 48px; height: 48px; background: linear-gradient(135deg, hsl(220, 70%, 50%), hsl(220, 70%, 40%)); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
              📋
            </div>
            <span>Applications Management</span>
          </h1>
          <p class="module-subtitle" style="margin-top: 0.5rem;">Review and manage student application submissions</p>
        </div>
        <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-danger" onclick="applicationsModule.clearAllApplications()" title="Permanently delete all application records"
            style="display:inline-flex;align-items:center;gap:0.5rem;font-size:0.875rem;">
            <i class="fas fa-trash-alt"></i> Clear All Applications
          </button>
        </div>
      </div>

      <!-- Statistics Cards with Animation -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; animation: fadeInUp 0.5s ease;">
        
        <!-- Total Applications Card -->
        <div class="card" style="padding: 1.75rem; transition: all 0.3s ease; cursor: pointer;"
          onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div style="width: 56px; height: 56px; background: linear-gradient(135deg, hsl(200, 90%, 55%), hsl(200, 90%, 45%)); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 12px hsla(200, 90%, 50%, 0.3);">
              📥
            </div>
          </div>
          <div style="font-size: 2.75rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; line-height: 1;">${stats.total}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Total Applications</div>
        </div>

        <!-- Pending Review Card -->
        <div class="card" style="padding: 1.75rem; transition: all 0.3s ease; cursor: pointer;"
          onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div style="width: 56px; height: 56px; background: linear-gradient(135deg, hsl(45, 100%, 50%), hsl(45, 100%, 40%)); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 12px hsla(45, 100%, 50%, 0.3);">
              ⏳
            </div>
          </div>
          <div style="font-size: 2.75rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; line-height: 1;">${stats.pending}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Pending Review</div>
        </div>

        <!-- Approved Card -->
        <div class="card" style="padding: 1.75rem; transition: all 0.3s ease; cursor: pointer;"
          onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div style="width: 56px; height: 56px; background: linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%)); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 12px hsla(150, 70%, 45%, 0.3);">
              ✅
            </div>
          </div>
          <div style="font-size: 2.75rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; line-height: 1;">${stats.approved}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Approved</div>
        </div>

        <!-- Rejected Card -->
        <div class="card" style="padding: 1.75rem; transition: all 0.3s ease; cursor: pointer;"
          onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div style="width: 56px; height: 56px; background: linear-gradient(135deg, hsl(0, 80%, 55%), hsl(0, 80%, 45%)); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 12px hsla(0, 80%, 55%, 0.3);">
              ❌
            </div>
          </div>
          <div style="font-size: 2.75rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; line-height: 1;">${stats.rejected}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Rejected</div>
        </div>

        <!-- Pending Payments Card -->
        <div class="card" style="padding: 1.75rem; transition: all 0.3s ease; cursor: pointer;"
          onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-xl)'"
          onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <div style="width: 56px; height: 56px; background: linear-gradient(135deg, hsl(280, 70%, 55%), hsl(280, 70%, 45%)); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 12px hsla(280, 70%, 55%, 0.3);">
              🧾
            </div>
          </div>
          <div style="font-size: 2.75rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; line-height: 1;">${stats.pendingPayments}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;">Pending Payments</div>
        </div>
      </div>

      <!-- Search and Filters -->
      <div class="card" style="padding: 2rem; margin-bottom: 2rem; animation: fadeInUp 0.6s ease;">

        <!-- Search Bar Section -->
        <div style="margin-bottom: 2rem;">
          <label style="display: block; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; font-size: 0.9375rem; display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 32px; height: 32px; background: linear-gradient(135deg, hsl(220, 70%, 50%), hsl(220, 70%, 40%)); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1rem;">
              🔍
            </div>
            Search Applications
          </label>
          <div style="position: relative;">
            <span style="position: absolute; left: 1.25rem; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); font-size: 1.125rem;">🔍</span>
            <input type="text" id="applicationSearch" placeholder="Search by student name, parent name, email, or application number..."
              style="width: 100%; padding: 1rem 1.25rem 1rem 3.5rem; border: 2px solid var(--border-primary); border-radius: 12px; font-size: 1rem; transition: all 0.3s ease; background: var(--bg-secondary); color: var(--text-primary);"
              onfocus="this.style.borderColor='hsl(220, 70%, 50%)'; this.style.boxShadow='0 0 0 4px hsla(220, 70%, 50%, 0.1)'"
              onblur="this.style.borderColor='var(--border-primary)'; this.style.boxShadow='none'">
            ${this.searchQuery ? `<button onclick="document.getElementById('applicationSearch').value=''; applicationsModule.searchQuery=''; applicationsModule.refreshApplicationsList();" style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); background: var(--bg-tertiary); border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; color: var(--text-secondary);" onmouseenter="this.style.background='hsl(0, 80%, 55%)'; this.style.color='white'" onmouseleave="this.style.background='var(--bg-tertiary)'; this.style.color='var(--text-secondary)'">
              ✕
            </button>` : ''}
          </div>
        </div>

        <!-- Divider -->
        <div style="height: 1px; background: linear-gradient(to right, transparent, var(--border-primary), transparent); margin-bottom: 2rem;"></div>

        <!-- Filter Buttons Section -->
        <div>
          <label style="display: block; font-weight: 600; color: var(--text-primary); margin-bottom: 1rem; font-size: 0.9375rem; display: flex; align-items: center; gap: 0.5rem;">
            <div style="width: 32px; height: 32px; background: linear-gradient(135deg, hsl(280, 70%, 55%), hsl(280, 70%, 45%)); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
              <i class="fas fa-filter" style="color: white; font-size: 0.875rem;"></i>
            </div>
            Filter by Status
          </label>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem;">
            <button class="filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" 
              onclick="applicationsModule.filterApplications('all')" 
              style="padding: 0.875rem 1.25rem; border-radius: 10px; border: 2px solid ${this.currentFilter === 'all' ? 'hsl(220, 70%, 50%)' : 'var(--border-primary)'}; background: ${this.currentFilter === 'all' ? 'linear-gradient(135deg, hsl(220, 70%, 50%), hsl(220, 70%, 40%))' : 'white'}; color: ${this.currentFilter === 'all' ? 'white' : 'var(--text-primary)'}; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.9375rem;"
              onmouseenter="if('${this.currentFilter}' !== 'all') { this.style.borderColor='hsl(220, 70%, 50%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }"
              onmouseleave="if('${this.currentFilter}' !== 'all') { this.style.borderColor='var(--border-primary)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'; }">
              <i class="fas fa-list"></i>
              <span>All</span>
              <span style="background: ${this.currentFilter === 'all' ? 'rgba(255,255,255,0.25)' : 'hsl(220, 20%, 95)'}; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 700;">${stats.total}</span>
            </button>
            
            <button class="filter-btn ${this.currentFilter === 'pending' ? 'active' : ''}" 
              onclick="applicationsModule.filterApplications('pending')" 
              style="padding: 0.875rem 1.25rem; border-radius: 10px; border: 2px solid ${this.currentFilter === 'pending' ? 'hsl(45, 100%, 50%)' : 'var(--border-primary)'}; background: ${this.currentFilter === 'pending' ? 'linear-gradient(135deg, hsl(45, 100%, 50%), hsl(45, 100%, 40%))' : 'white'}; color: ${this.currentFilter === 'pending' ? 'white' : 'var(--text-primary)'}; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.9375rem;"
              onmouseenter="if('${this.currentFilter}' !== 'pending') { this.style.borderColor='hsl(45, 100%, 50%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }"
              onmouseleave="if('${this.currentFilter}' !== 'pending') { this.style.borderColor='var(--border-primary)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'; }">
              <i class="fas fa-clock"></i>
              <span>Pending</span>
              <span style="background: ${this.currentFilter === 'pending' ? 'rgba(255,255,255,0.25)' : 'hsl(45, 100%, 95)'}; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 700;">${stats.pending}</span>
            </button>
            
            <button class="filter-btn ${this.currentFilter === 'approved' ? 'active' : ''}" 
              onclick="applicationsModule.filterApplications('approved')" 
              style="padding: 0.875rem 1.25rem; border-radius: 10px; border: 2px solid ${this.currentFilter === 'approved' ? 'hsl(150, 70%, 45%)' : 'var(--border-primary)'}; background: ${this.currentFilter === 'approved' ? 'linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%))' : 'white'}; color: ${this.currentFilter === 'approved' ? 'white' : 'var(--text-primary)'}; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.9375rem;"
              onmouseenter="if('${this.currentFilter}' !== 'approved') { this.style.borderColor='hsl(150, 70%, 45%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }"
              onmouseleave="if('${this.currentFilter}' !== 'approved') { this.style.borderColor='var(--border-primary)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'; }">
              <i class="fas fa-check-circle"></i>
              <span>Approved</span>
              <span style="background: ${this.currentFilter === 'approved' ? 'rgba(255,255,255,0.25)' : 'hsl(150, 70%, 95)'}; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 700;">${stats.approved}</span>
            </button>
            
            <button class="filter-btn ${this.currentFilter === 'rejected' ? 'active' : ''}" 
              onclick="applicationsModule.filterApplications('rejected')" 
              style="padding: 0.875rem 1.25rem; border-radius: 10px; border: 2px solid ${this.currentFilter === 'rejected' ? 'hsl(0, 80%, 55%)' : 'var(--border-primary)'}; background: ${this.currentFilter === 'rejected' ? 'linear-gradient(135deg, hsl(0, 80%, 55%), hsl(0, 80%, 45%))' : 'white'}; color: ${this.currentFilter === 'rejected' ? 'white' : 'var(--text-primary)'}; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.9375rem;"
              onmouseenter="if('${this.currentFilter}' !== 'rejected') { this.style.borderColor='hsl(0, 80%, 55%)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }"
              onmouseleave="if('${this.currentFilter}' !== 'rejected') { this.style.borderColor='var(--border-primary)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'; }">
              <i class="fas fa-times-circle"></i>
              <span>Rejected</span>
              <span style="background: ${this.currentFilter === 'rejected' ? 'rgba(255,255,255,0.25)' : 'hsl(0, 80%, 95)'}; padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8125rem; font-weight: 700;">${stats.rejected}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Pending Payment Verifications -->
      ${stats.pendingPayments > 0 ? `
      <div style="background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid hsl(280, 30%, 90%); margin-bottom: 2rem; animation: fadeInUp 0.65s ease;">
        <h3 style="margin: 0 0 1.5rem; display: flex; align-items: center; gap: 0.75rem; color: var(--text-primary);">
          <div style="width: 36px; height: 36px; background: linear-gradient(135deg, hsl(280, 70%, 55%), hsl(280, 70%, 45%)); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-receipt" style="color: white; font-size: 1rem;"></i>
          </div>
          Pending Payment Verifications
          <span style="background: hsl(280, 70%, 55%); color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.8rem; font-weight: 700;">${stats.pendingPayments}</span>
        </h3>
        <div style="display: grid; gap: 1rem;">
          ${this.renderPendingPayments()}
        </div>
      </div>
      ` : ''}

      <!-- Applications List -->
      <div id="applicationsList" style="animation: fadeInUp 0.7s ease;">
        ${this.renderApplicationsList()}
      </div>

      <style>
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .filter-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .filter-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .filter-btn.active {
          box-shadow: 0 4px 12px rgba(34, 60, 120, 0.2);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }

          .module-title {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.5rem !important;
          }

          #applicationSearch {
            font-size: 16px !important; /* Prevent zoom on iOS */
          }

          .filter-btn {
            font-size: 0.875rem;
            padding: 0.5rem 0.75rem;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr !important;
          }

          .stat-value {
            font-size: 2rem !important;
          }

          .card {
            padding: 1rem !important;
          }
        }

        /* Performance: GPU acceleration for animations */
        .card, .stat-card, .filter-btn {
          will-change: transform;
          backface-visibility: hidden;
          -webkit-font-smoothing: antialiased;
        }
      </style>
    `;
    },

    refreshApplicationsList() {
        const listContainer = document.getElementById('applicationsList');
        if (listContainer) {
            listContainer.innerHTML = this.renderApplicationsList();
        }
    },

    renderApplicationsList() {
        let filteredApps = this.currentFilter === 'all'
            ? this.applications
            : this.applications.filter(app => app.status === this.currentFilter);

        // Apply search filter
        if (this.searchQuery) {
            filteredApps = filteredApps.filter(app => {
                const searchStr = this.searchQuery;
                return (
                    (app.student_name || app.studentName || '').toLowerCase().includes(searchStr) ||
                    (app.parent_name || app.parentName || '').toLowerCase().includes(searchStr) ||
                    (app.parent_email || app.parentEmail || '').toLowerCase().includes(searchStr) ||
                    (app.application_number || app.id || '').toLowerCase().includes(searchStr) ||
                    (app.grade || '').toLowerCase().includes(searchStr)
                );
            });
        }

        if (filteredApps.length === 0) {
            const isLoading = !dataManager._loaded?.['applications'];
            return `
        <div class="card" style="text-align: center; padding: 4rem 2rem; animation: fadeIn 0.5s ease;">
          <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, hsl(220, 70%, 97%), hsl(220, 70%, 93%)); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-${isLoading ? 'spinner fa-spin' : this.searchQuery ? 'search' : 'inbox'}" style="font-size: 2rem; color: var(--color-primary);"></i>
          </div>
          <h3 style="color: var(--text-secondary); margin-bottom: 0.75rem; font-size: 1.25rem;">${isLoading ? 'Loading Applications…' : 'No Applications Found'}</h3>
          <p style="color: var(--text-tertiary); max-width: 400px; margin: 0 auto;">
            ${isLoading
              ? 'Fetching applications from the database, please wait.'
              : this.searchQuery
                ? `No applications match "${this.searchQuery}". Try a different search term.`
                : this.currentFilter === 'all'
                  ? 'No applications have been submitted yet. Applications will appear here once submitted from the public admissions page.'
                  : `No ${this.currentFilter} applications at the moment.`
            }
          </p>
          ${this.searchQuery && !isLoading ? `<button class="btn-secondary" onclick="document.getElementById('applicationSearch').value=''; applicationsModule.searchQuery=''; applicationsModule.refreshApplicationsList();" style="margin-top: 1.5rem;">
            <i class="fas fa-times"></i> Clear Search
          </button>` : ''}
        </div>
      `;
        }

        // Sort by date (newest first)
        const sortedApps = [...filteredApps].sort((a, b) =>
            new Date(b.submitted_date || b.submittedDate) - new Date(a.submitted_date || a.submittedDate)
        );

        return `
          <div style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            <i class="fas fa-info-circle"></i> Showing ${sortedApps.length} ${sortedApps.length === 1 ? 'application' : 'applications'}
          </div>
          ${sortedApps.map((app, index) => this.renderApplicationCard(app, index)).join('')}
        `;
    },

    renderApplicationCard(app, index) {
        const statusColors = {
            pending: { bg: 'hsl(45, 100%, 95%)', border: 'hsl(45, 100%, 50%)', text: 'hsl(45, 100%, 30%)', icon: 'fa-clock', gradient: 'linear-gradient(135deg, hsl(45, 100%, 50%), hsl(45, 100%, 40%))' },
            approved: { bg: 'hsl(150, 70%, 95%)', border: 'hsl(150, 70%, 45%)', text: 'hsl(150, 70%, 25%)', icon: 'fa-check-circle', gradient: 'linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%))' },
            rejected: { bg: 'hsl(0, 80%, 95%)', border: 'hsl(0, 80%, 55%)', text: 'hsl(0, 80%, 30%)', icon: 'fa-times-circle', gradient: 'linear-gradient(135deg, hsl(0, 80%, 55%), hsl(0, 80%, 45%))' },
            incomplete: { bg: 'hsl(30, 100%, 95%)', border: 'hsl(30, 100%, 50%)', text: 'hsl(30, 100%, 30%)', icon: 'fa-exclamation-triangle', gradient: 'linear-gradient(135deg, hsl(30, 100%, 50%), hsl(30, 100%, 40%))' }
        };

        const statusInfo = statusColors[app.status] || statusColors.pending;
        const safeName    = this._esc(app.student_name || app.studentName || '');
        const safeParent  = this._esc(app.parent_name  || app.parentName  || '');
        const safePhone   = this._esc(app.parent_phone || app.parentPhone || '');
        const safeGrade   = this._esc(app.grade || '');
        const safeAppNo   = this._esc(app.application_number || app.id || '');
        const submittedDate = new Date(app.submitted_date || app.submittedDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Count documents
        const docCount = [
            app.application_form_url,
            app.birth_certificate_url,
            app.passport_photo_url,
            app.previous_report_url
        ].filter(Boolean).length;

        return `
      <div class="card" style="margin-bottom: 1.5rem; border-left: 4px solid ${statusInfo.border}; transition: all 0.3s ease; animation: fadeInUp 0.5s ease ${index * 0.05}s both; cursor: pointer;" 
        onmouseenter="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.12)'"
        onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''"
        onclick="applicationsModule.viewApplication('${app.id}')">
        
        <!-- Header Section -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1.5rem;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
              <h3 style="margin: 0; color: var(--text-primary); font-size: 1.25rem;">${safeName}</h3>
              <span style="background: ${statusInfo.gradient}; color: white; padding: 0.375rem 0.875rem; border-radius: 20px; font-size: 0.8125rem; font-weight: 600; text-transform: capitalize; box-shadow: 0 2px 8px ${statusInfo.border}40;">
                <i class="fas ${statusInfo.icon}"></i> ${app.status}
              </span>
              ${app.application_fee_paid ? `<span style="background: linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%)); color: white; padding: 0.375rem 0.875rem; border-radius: 20px; font-size: 0.8125rem; font-weight: 600; box-shadow: 0 2px 8px hsl(150, 70%, 45%)40;">
                <i class="fas fa-check-circle"></i> Fee Paid
              </span>` : (app.payment_method === 'bank-transfer' || app.paymentMethod === 'bank-transfer') ? `<span style="background: linear-gradient(135deg, hsl(45, 100%, 50%), hsl(45, 100%, 40%)); color: white; padding: 0.375rem 0.875rem; border-radius: 20px; font-size: 0.8125rem; font-weight: 600; box-shadow: 0 2px 8px hsl(45, 100%, 50%)40;">
                <i class="fas fa-clock"></i> Payment Pending
              </span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
              <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-hashtag" style="color: var(--text-tertiary);"></i>
                <strong>${safeAppNo}</strong>
              </p>
              ${docCount > 0 ? `<p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-paperclip" style="color: var(--text-tertiary);"></i>
                <strong>${docCount} ${docCount === 1 ? 'Document' : 'Documents'}</strong>
              </p>` : ''}
            </div>
          </div>
          <button class="icon-btn" onclick="event.stopPropagation(); applicationsModule.viewApplication('${app.id}')" title="View Details" style="transition: all 0.3s ease;" onmouseenter="this.style.transform='scale(1.1)'; this.style.background='var(--color-primary)'; this.style.color='white'" onmouseleave="this.style.transform='scale(1)'; this.style.background=''; this.style.color=''">
            <i class="fas fa-eye"></i>
          </button>
        </div>

        <!-- Info Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem; padding: 1.25rem; background: var(--bg-secondary); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, hsl(200, 90%, 55%), hsl(200, 90%, 45%)); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i class="fas fa-graduation-cap" style="color: white; font-size: 1rem;"></i>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.125rem; text-transform: uppercase; letter-spacing: 0.5px;">Grade</div>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9375rem;">${safeGrade}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%)); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i class="fas fa-user-friends" style="color: white; font-size: 1rem;"></i>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.125rem; text-transform: uppercase; letter-spacing: 0.5px;">Parent/Guardian</div>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9375rem;">${safeParent}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, hsl(45, 100%, 50%), hsl(45, 100%, 40%)); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i class="fas fa-phone" style="color: white; font-size: 1rem;"></i>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.125rem; text-transform: uppercase; letter-spacing: 0.5px;">Contact</div>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9375rem;">${safePhone}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, hsl(280, 70%, 55%), hsl(280, 70%, 45%)); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <i class="fas fa-calendar" style="color: white; font-size: 1rem;"></i>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.125rem; text-transform: uppercase; letter-spacing: 0.5px;">Submitted</div>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9375rem;">${submittedDate}</div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <button class="btn-secondary" onclick="event.stopPropagation(); applicationsModule.viewApplication('${app.id}')" style="transition: all 0.3s ease;" onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
            <i class="fas fa-eye"></i> View Full Details
          </button>
          ${app.application_form_url ? `<button class="btn-secondary" onclick="event.stopPropagation(); window.open('${app.application_form_url}', '_blank')" style="transition: all 0.3s ease;" onmouseenter="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow=''">
            <i class="fas fa-file-pdf"></i> View Form
          </button>` : ''}
          ${app.status === 'pending' ? `
            <button class="btn-success" onclick="event.stopPropagation(); applicationsModule.approveApplication('${app.id}')" style="transition: all 0.3s ease; margin-left: auto;" onmouseenter="this.style.transform='translateY(-2px) scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(34, 197, 94, 0.3)'" onmouseleave="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow=''">
              <i class="fas fa-check"></i> Approve Application
            </button>
            <button class="btn-danger" onclick="event.stopPropagation(); applicationsModule.rejectApplication('${app.id}')" style="transition: all 0.3s ease;" onmouseenter="this.style.transform='translateY(-2px) scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.3)'" onmouseleave="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow=''">
              <i class="fas fa-times"></i> Reject
            </button>
          ` : ''}
        </div>
      </div>
    `;
    },

    filterApplications(status) {
        this.currentFilter = status;
        this.render();
    },

    viewApplication(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) return;

        const statusColors = {
            pending:  { bg: 'hsl(45, 100%, 95%)',  border: 'hsl(45, 100%, 50%)',  text: 'hsl(45, 100%, 30%)'  },
            approved: { bg: 'hsl(150, 70%, 95%)',  border: 'hsl(150, 70%, 45%)',  text: 'hsl(150, 70%, 25%)'  },
            rejected: { bg: 'hsl(0, 80%, 95%)',    border: 'hsl(0, 80%, 55%)',    text: 'hsl(0, 80%, 30%)'    }
        };
        const statusInfo = statusColors[app.status] || statusColors.pending;

        // Normalise all document URL fields (camelCase or snake_case)
        const photoUrl      = app.passportPhotoUrl      || app.passport_photo_url      || '';
        const formUrl       = app.applicationFormUrl    || app.application_form_url    || '';
        const birthCertUrl  = app.birthCertificateUrl   || app.birth_certificate_url   || '';
        const reportUrl     = app.previousReportUrl     || app.previous_report_url     || '';
        const otherDocs     = app.otherDocuments        || app.other_documents         || [];
        const receiptUrl    = app.receiptUrl            || app.receipt_url             || '';

        // helper: document link button
        const docBtn = (url, label, icon = 'fa-file-alt') =>
            url ? `<a href="${url}" target="_blank" rel="noopener noreferrer"
                      style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 0.9rem;background:var(--bg-primary);color:var(--text-primary);border:1.5px solid var(--border-primary);border-radius:6px;font-size:0.8rem;font-weight:600;text-decoration:none;transition:opacity 0.2s;"
                      onmouseenter="this.style.opacity='0.75'" onmouseleave="this.style.opacity='1'">
                    <i class="fas ${icon}"></i> ${label}
                  </a>` : `<span style="color:var(--text-tertiary);font-size:0.8rem;font-style:italic;">Not uploaded</span>`;

        // other documents array handling
        const otherDocsHtml = (() => {
            const docs = Array.isArray(otherDocs) ? otherDocs : (typeof otherDocs === 'string' && otherDocs ? [otherDocs] : []);
            if (!docs.length) return `<span style="color:var(--text-tertiary);font-size:0.8rem;font-style:italic;">None</span>`;
            return docs.map((d, i) => docBtn(typeof d === 'string' ? d : d.url, `Document ${i + 1}`, 'fa-paperclip')).join(' ');
        })();

        const submittedAt = app.submittedDate || app.submitted_date || app.createdAt || app.created_at;
        const reviewedAt  = app.reviewedDate  || app.reviewed_date;

        showModal('Application Details', `
      <div style="max-height:75vh;overflow-y:auto;padding-right:0.25rem;">

        <!-- Status Banner -->
        <div style="background:${statusInfo.bg};padding:1rem 1.25rem;border-radius:10px;border-left:4px solid ${statusInfo.border};margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <div style="font-weight:700;font-size:1rem;color:${statusInfo.text};text-transform:capitalize;margin-bottom:0.2rem;">
              <i class="fas fa-circle" style="font-size:0.6rem;margin-right:0.4rem;"></i> ${app.status}
            </div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">
              App No: <strong>${app.applicationNumber || app.application_number || app.id}</strong>
            </div>
          </div>
          ${submittedAt ? `<div style="font-size:0.8rem;color:var(--text-secondary);text-align:right;">
            Submitted<br><strong>${new Date(submittedAt).toLocaleString()}</strong>
          </div>` : ''}
        </div>

        <div style="display:grid;gap:1.5rem;">

          <!-- ── PASSPORT PHOTO ── -->
          ${photoUrl ? `
          <div style="text-align:center;">
            <img src="${photoUrl}" alt="Passport Photo"
              style="width:120px;height:140px;object-fit:cover;border-radius:10px;border:3px solid var(--border-primary);box-shadow:0 4px 12px rgba(0,0,0,0.1);"
              onerror="this.style.display='none'">
            <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:0.4rem;">Passport Photo</div>
          </div>` : ''}

          <!-- ── STUDENT INFORMATION ── -->
          <div>
            <h4 style="margin:0 0 0.75rem;color:var(--text-primary);border-bottom:2px solid var(--border-primary);padding-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
              <i class="fas fa-user-graduate" style="color:var(--color-primary);"></i> Student Information
            </h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem 1.5rem;">
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Full Name</span><br><strong>${app.studentName || app.student_name || '—'}</strong></div>
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Grade Applying For</span><br><strong>${app.grade || '—'}</strong></div>
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Date of Birth</span><br><strong>${app.studentDob || app.student_dob ? new Date(app.studentDob || app.student_dob).toLocaleDateString() : '—'}</strong></div>
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Gender</span><br><strong style="text-transform:capitalize;">${app.studentGender || app.student_gender || '—'}</strong></div>
              <div style="grid-column:span 2;"><span style="color:var(--text-secondary);font-size:0.8rem;">Previous School</span><br><strong>${app.previousSchool || app.previous_school || '—'}</strong></div>
            </div>
          </div>

          <!-- ── PARENT / GUARDIAN ── -->
          <div>
            <h4 style="margin:0 0 0.75rem;color:var(--text-primary);border-bottom:2px solid var(--border-primary);padding-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
              <i class="fas fa-user-friends" style="color:var(--color-primary);"></i> Parent / Guardian
            </h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem 1.5rem;">
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Name</span><br><strong>${app.parentName || app.parent_name || '—'}</strong></div>
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Phone</span><br><strong>${app.parentPhone || app.parent_phone || '—'}</strong></div>
              <div style="grid-column:span 2;"><span style="color:var(--text-secondary);font-size:0.8rem;">Email</span><br><strong>${app.parentEmail || app.parent_email || '—'}</strong></div>
              <div style="grid-column:span 2;"><span style="color:var(--text-secondary);font-size:0.8rem;">Address</span><br><strong>${app.parentAddress || app.parent_address || '—'}</strong></div>
            </div>
          </div>

          <!-- ── UPLOADED DOCUMENTS ── -->
          <div>
            <h4 style="margin:0 0 0.75rem;color:var(--text-primary);border-bottom:2px solid var(--border-primary);padding-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
              <i class="fas fa-folder-open" style="color:var(--color-primary);"></i> Uploaded Documents
            </h4>
            <div style="display:grid;gap:0.75rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.75rem;background:var(--bg-secondary);border-radius:8px;">
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);"><i class="fas fa-file-pdf" style="color:#e74c3c;margin-right:0.4rem;"></i>Application Form</span>
                ${docBtn(formUrl, 'View / Download', 'fa-download')}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.75rem;background:var(--bg-secondary);border-radius:8px;">
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);"><i class="fas fa-certificate" style="color:#f39c12;margin-right:0.4rem;"></i>Birth Certificate</span>
                ${docBtn(birthCertUrl, 'View', 'fa-eye')}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.75rem;background:var(--bg-secondary);border-radius:8px;">
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);"><i class="fas fa-graduation-cap" style="color:#9b59b6;margin-right:0.4rem;"></i>Previous School Report</span>
                ${docBtn(reportUrl, 'View', 'fa-eye')}
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0.75rem;background:var(--bg-secondary);border-radius:8px;">
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);"><i class="fas fa-paperclip" style="color:#3498db;margin-right:0.4rem;"></i>Other Documents</span>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">${otherDocsHtml}</div>
              </div>
            </div>
          </div>

          <!-- ── PAYMENT INFORMATION ── -->
          <div>
            <h4 style="margin:0 0 0.75rem;color:var(--text-primary);border-bottom:2px solid var(--border-primary);padding-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
              <i class="fas fa-credit-card" style="color:var(--color-primary);"></i> Application Fee
            </h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem 1.5rem;">
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Amount</span><br><strong>&#8358;${(app.applicationFeeAmount || app.application_fee_amount || 0).toLocaleString()}</strong></div>
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Method</span><br><strong style="text-transform:capitalize;">${(app.paymentMethod || app.payment_method || 'N/A').replace(/-/g, ' ')}</strong></div>
              <div><span style="color:var(--text-secondary);font-size:0.8rem;">Status</span><br>
                ${(app.applicationFeePaid || app.application_fee_paid)
                  ? '<strong style="color:hsl(150,70%,35%);"><i class="fas fa-check-circle"></i> Paid</strong>'
                  : (app.paymentRejectionReason || app.payment_rejection_reason)
                    ? '<strong style="color:hsl(0,80%,45%);"><i class="fas fa-times-circle"></i> Rejected</strong>'
                    : '<strong style="color:hsl(45,100%,35%);"><i class="fas fa-clock"></i> Pending Verification</strong>'}
              </div>
              ${(app.paymentReference || app.payment_reference) ? `<div><span style="color:var(--text-secondary);font-size:0.8rem;">Reference</span><br><strong>${app.paymentReference || app.payment_reference}</strong></div>` : '<div></div>'}
              ${receiptUrl ? `<div style="grid-column:span 2;"><span style="color:var(--text-secondary);font-size:0.8rem;">Payment Receipt</span><br>${docBtn(receiptUrl, 'View Receipt', 'fa-receipt')}</div>` : ''}
              ${(app.paymentRejectionReason || app.payment_rejection_reason) ? `
              <div style="grid-column:span 2;padding:0.75rem;background:hsl(0,80%,97%);border-radius:8px;border-left:3px solid hsl(0,80%,55%);color:hsl(0,60%,30%);">
                <strong>Rejection Reason:</strong> ${app.paymentRejectionReason || app.payment_rejection_reason}
              </div>` : ''}
            </div>
          </div>

          <!-- ── REVIEW DETAILS ── -->
          ${(reviewedAt || app.notes || app.rejectionReason || app.rejection_reason) ? `
          <div>
            <h4 style="margin:0 0 0.75rem;color:var(--text-primary);border-bottom:2px solid var(--border-primary);padding-bottom:0.5rem;display:flex;align-items:center;gap:0.5rem;">
              <i class="fas fa-clipboard-check" style="color:var(--color-primary);"></i> Review Details
            </h4>
            <div style="display:grid;gap:0.6rem;">
              ${reviewedAt ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Reviewed:</span><strong>${new Date(reviewedAt).toLocaleString()}</strong></div>` : ''}
              ${(app.reviewedBy || app.reviewed_by) ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Reviewed By:</span><strong>${app.reviewedBy || app.reviewed_by}</strong></div>` : ''}
              ${app.notes ? `<div><span style="color:var(--text-secondary);">Notes:</span><div style="margin-top:0.4rem;padding:0.75rem;background:var(--bg-secondary);border-radius:8px;">${app.notes}</div></div>` : ''}
              ${(app.rejectionReason || app.rejection_reason) ? `<div style="padding:0.75rem;background:hsl(0,80%,97%);border-radius:8px;border-left:3px solid hsl(0,80%,55%);color:hsl(0,60%,30%);"><strong>Rejection Reason:</strong> ${app.rejectionReason || app.rejection_reason}</div>` : ''}
            </div>
          </div>` : ''}

        </div>

        <!-- Action Buttons -->
        <div style="margin-top:1.75rem;display:flex;gap:0.75rem;flex-wrap:wrap;padding-top:1rem;border-top:1px solid var(--border-primary);">
          ${formUrl ? `<button class="btn-secondary" onclick="window.open('${formUrl}','_blank')"><i class="fas fa-download"></i> Download Form</button>` : ''}
          ${app.status === 'pending' ? `
            <button class="btn-success" onclick="closeModal(); applicationsModule.approveApplication('${app.id}')">
              <i class="fas fa-check"></i> Approve
            </button>
            <button class="btn-danger" onclick="closeModal(); applicationsModule.rejectApplication('${app.id}')">
              <i class="fas fa-times"></i> Reject
            </button>
          ` : ''}
          <button class="btn-secondary" onclick="closeModal()" style="margin-left:auto;">Close</button>
        </div>
      </div>
    `);
    },

    downloadForm(id) {
        const app = this.applications.find(a => a.id === id);
        const formUrl = app?.application_form_url || app?.applicationFormUrl || app?.fileData;
        
        if (!app || !formUrl) {
            showToast('Application form not found', 'error');
            return;
        }

        // Open form in new tab (Supabase storage URLs)
        window.open(formUrl, '_blank');
        showToast('Opening application form...', 'success');
    },

    approveApplication(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) {
            showToast('Application not found', 'error');
            return;
        }

        // Check if application fee has been paid
        const applicationFeePaid = app.application_fee_paid || app.applicationFeePaid;
        const paymentMethod = app.payment_method || app.paymentMethod;
        
        // Only block approval if payment method is bank-transfer and fee is not yet paid
        // Accept both 'bank-transfer' (hyphen) and 'bank_transfer' (underscore) from DB
        if ((paymentMethod === 'bank-transfer' || paymentMethod === 'bank_transfer') && !applicationFeePaid) {
            showToast('Cannot approve application. Application fee payment must be verified first.', 'error');
            return;
        }

        showModal('Approve Application', `
      <p style="margin-bottom: 1.5rem;">Are you sure you want to approve this application?</p>
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Notes (Optional)</label>
        <textarea id="approvalNotes" rows="3" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-primary); border-radius: var(--radius-md); font-family: inherit;"></textarea>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button class="btn-success" onclick="event.preventDefault(); applicationsModule.confirmApproval('${id}')">
          <i class="fas fa-check"></i> Confirm Approval
        </button>
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    `);
    },

    async confirmApproval(id) {
        console.log('[Applications] confirmApproval called with id:', id);
        
        const notes = document.getElementById('approvalNotes')?.value || '';
        const app = this.applications.find(a => a.id === id);
        
        if (!app) {
            console.error('[Applications] Application not found:', id);
            showToast('Application not found', 'error');
            return;
        }

        console.log('[Applications] Found application:', app);

        // Disable button to prevent double clicks
        const confirmBtn = event?.target;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing...';
        }

        try {
            // Show loading
            showToast('Creating student account...', 'info');
            console.log('[Applications] Starting account creation...');

            // Create student and guardian accounts
            const result = await this.createAccountsFromApplication(app);
            console.log('[Applications] Account creation result:', result);

            if (!result || !result.studentId) {
                throw new Error('Failed to create student account - no student ID returned');
            }

            // Auto-apply grade fee structure
            if (typeof feeManager !== 'undefined' && result.studentId && app.grade) {
                try {
                    const feeResult = await feeManager.applyFeeStructure(result.studentId, app.grade);
                    if (!feeResult?.success) console.warn('[Applications] Fee structure apply:', feeResult?.error);
                } catch (feeErr) {
                    console.warn('[Applications] Fee structure apply threw:', feeErr);
                    showToast('Fee structure could not be applied — please set it manually.', 'warning');
                }
            }

            // Auto-enroll in grade subjects
            if (typeof subjectManager !== 'undefined') {
                try {
                    const enrollResult = await subjectManager.autoEnroll(result.studentId, app.student_name, app.grade, 'A');
                    if (!enrollResult?.success && !enrollResult?.existing) {
                        console.warn('[Applications] Subject auto-enroll:', enrollResult?.error);
                        showToast('Subject enrollment could not be completed — please enroll manually.', 'warning');
                    }
                } catch (enrollErr) {
                    console.warn('[Applications] Subject auto-enroll threw:', enrollErr);
                    showToast('Subject enrollment could not be completed — please enroll manually.', 'warning');
                }
            }

            // Update application status
            console.log('[Applications] Updating application status...');
            const reviewedAt = new Date().toISOString();
            const updateResult = await dataManager.update('applications', id, {
                status: 'approved',
                notes: notes,
                reviewed_date: reviewedAt,
                reviewed_by: authManager?.getSession()?.supabaseId || null,
                student_id: result.studentId,
                guardian_auth_id: result.guardianAuthId
            });

            if (!updateResult) {
                throw new Error('Failed to update application status in database');
            }

            console.log('[Applications] Application updated successfully');

            await this.loadApplications();
            closeModal();
            this.render();
            if (typeof writeAuditLog === 'function') writeAuditLog('APPLICATION_APPROVED', app.student_name, `Grade: ${app.grade} | Student ID: ${result.studentLoginId}`);
            
            // Show success with account details
            showModal('Application Approved', `
                <div style="text-align: center;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, hsl(150, 70%, 45%), hsl(150, 70%, 35%)); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-check" style="font-size: 2.5rem; color: white;"></i>
                    </div>
                    <h3 style="margin: 0 0 1rem;">Application Approved Successfully!</h3>
                    <p style="margin-bottom: 1.5rem;">Student account has been created.</p>
                    <div style="background: hsl(220, 70%, 97%); padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1rem; text-align: left;">
                        <h4 style="margin: 0 0 1rem;">Student Account Details</h4>
                        <p style="margin: 0.5rem 0;"><strong>Student Name:</strong> ${app.student_name}</p>
                        <p style="margin: 0.5rem 0;"><strong>Login ID:</strong> ${result.studentLoginId}</p>
                        <p style="margin: 0.5rem 0;"><strong>Password:</strong> ${result.studentPassword}</p>
                        <p style="margin: 0.5rem 0;"><strong>Grade:</strong> ${app.grade}</p>
                    </div>
                    <div style="background: hsl(45, 100%, 95%); padding: 1rem; border-radius: 0.75rem; border-left: 4px solid hsl(45, 100%, 50%); text-align: left;">
                        <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">
                            <strong>Note:</strong> Guardian account must be created separately via User Management if needed.
                        </p>
                    </div>
                    <p style="margin-top: 1.5rem; font-size: 0.875rem; color: var(--text-secondary);">Please share these credentials with the parent/guardian.</p>
                    <button class="btn-primary" onclick="closeModal()" style="margin-top: 1rem;">Close</button>
                </div>
            `);
        } catch (error) {
            const msg = error?.message || String(error);
            console.error('Error approving application:', msg);
            showToast(msg || 'Error approving application', 'error');
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Approval'; }
        }
    },

    // Create student and guardian accounts from approved application
    async createAccountsFromApplication(app) {
        try {
            console.log('[Applications] Starting student account creation for application:', app.id);

            // Get auth token
            const session = await supabaseClient.auth.getSession();
            const accessToken = session.data.session?.access_token;
            if (!accessToken) {
                throw new Error('Not authenticated — please log out and back in.');
            }

            // Always use an internal email for the student account so the
            // parent's real email never triggers the duplicate-email check.
            const studentInternalEmail = `student-${Date.now()}-${Math.floor(Math.random()*10000)}@tbd.internal`;

            console.log('[Applications] Calling create-invitation-v2 edge function...');
            let studentRes, studentResult;
            try {
                studentRes = await fetch(`${SUPABASE_URL}/functions/v1/create-invitation-v2`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': SUPABASE_ANON
                    },
                    body: JSON.stringify({
                        email: studentInternalEmail,
                        role: 'student',
                        fullName: app.student_name || app.studentName,
                        grade: app.grade,
                        section: 'A',
                        dateOfBirth: app.student_dob || app.studentDob || null,
                        expiryDays: 30
                    })
                });
                studentResult = await studentRes.json();
            } catch (fetchErr) {
                throw new Error('Network error calling edge function: ' + (fetchErr?.message || String(fetchErr)));
            }

            console.log('[Applications] Edge function response:', studentResult);

            if (!studentRes.ok || !studentResult.success) {
                const msg = studentResult?.error || `HTTP ${studentRes.status}`;
                throw new Error('Failed to create student account: ' + msg);
            }

            // Fetch the student DB record — retry a few times to handle
            // the brief propagation delay between auth user creation and
            // the student row being committed by the edge function.
            let studentRecord = null;
            for (let attempt = 0; attempt < 5; attempt++) {
                if (attempt > 0) await new Promise(r => setTimeout(r, 250));
                const { data, error: sErr } = await supabaseClient
                    .from('students')
                    .select('id')
                    .eq('auth_id', studentResult.authId)
                    .maybeSingle();
                if (data) { studentRecord = data; break; }
                console.warn(`[Applications] Student record not found yet (attempt ${attempt + 1}):`, sErr?.message);
            }

            if (!studentRecord) {
                throw new Error('Student auth account was created but the student record could not be found. Check the students table for auth_id: ' + studentResult.authId);
            }

            console.log('[Applications] Student account created successfully. DB id:', studentRecord.id);
            return {
                studentId: studentRecord.id,
                studentLoginId: studentResult.userId,
                studentPassword: studentResult.password,
                guardianAuthId: null,
                guardianPassword: null
            };
        } catch (error) {
            const msg = error?.message || String(error);
            console.error('[Applications] Error creating student account:', msg);
            throw new Error(msg);
        }
    },

    generateUserId(role) {
        const year = new Date().getFullYear();
        const prefixes = {
            guardian: 'GRD',
            student: 'STU',
            teacher: 'TCH',
            staff: 'STF',
            admin: 'ADM'
        };
        const prefix = prefixes[role] || 'USR';
        const random = Math.floor(Math.random() * 900) + 100;
        return `${prefix}-${year}-${String(random).padStart(3, '0')}`;
    },

    formatDatePassword(dateOfBirth) {
        // Convert YYYY-MM-DD to DDMMYYYY
        const parts = dateOfBirth.split('-');
        return parts[2] + parts[1] + parts[0];
    },

    // Generate random password
    generatePassword() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    },

    rejectApplication(id) {
        showModal('Reject Application', `
      <p style="margin-bottom: 1.5rem;">Are you sure you want to reject this application?</p>
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Reason for Rejection:</label>
        <textarea id="rejectionNotes" rows="3" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-primary); border-radius: var(--radius-md); font-family: inherit;" required></textarea>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button class="btn-danger" onclick="applicationsModule.confirmRejection('${id}')">
          <i class="fas fa-times"></i> Confirm Rejection
        </button>
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    `);
    },

    async confirmRejection(id) {
        const notes = document.getElementById('rejectionNotes')?.value?.trim() || '';

        if (!notes) {
            showToast('Please provide a reason for rejection', 'error');
            return;
        }

        try {
            const updateResult = await dataManager.update('applications', id, {
                status: 'rejected',
                rejection_reason: notes,
                notes: notes,
                reviewed_date: new Date().toISOString(),
                reviewed_by: authManager?.getSession()?.supabaseId || null
            });

            if (!updateResult) {
                throw new Error('Failed to update application status');
            }

            await this.loadApplications();
            closeModal();
            this.render();
            const appRecord = dataManager.getById('applications', id);
            if (typeof writeAuditLog === 'function') writeAuditLog('APPLICATION_REJECTED', appRecord?.student_name || id, notes);
            showToast('Application rejected', 'info');
        } catch (error) {
            console.error('Error rejecting application:', error);
            showToast(error.message || 'Error rejecting application', 'error');
        }
    },

    clearAllApplications() {
        showModal('Clear All Applications', `
            <div style="text-align:center;">
                <div style="width:64px;height:64px;margin:0 auto 1.25rem;background:linear-gradient(135deg,hsl(0,80%,55%),hsl(0,80%,45%));border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-trash-alt" style="color:white;font-size:1.75rem;"></i>
                </div>
                <h3 style="margin:0 0 0.75rem;color:hsl(0,80%,35%);">Permanently Delete All Applications?</h3>
                <p style="color:var(--text-secondary);margin-bottom:1.5rem;">
                    This will remove <strong>every</strong> application record. The action cannot be undone.
                </p>
                <div style="display:flex;gap:0.75rem;justify-content:center;">
                    <button class="btn-danger" onclick="applicationsModule._confirmClearAll()">
                        <i class="fas fa-trash-alt"></i> Yes, Delete Everything
                    </button>
                    <button class="btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </div>
        `);
    },

    async _confirmClearAll() {
        closeModal();
        try {
            showToast('Clearing all applications…', 'info');
            // Nullify student_id FK first to avoid constraint errors
            await supabaseClient.from('applications').update({ student_id: null }).not('student_id', 'is', null);
            const { error } = await supabaseClient.from('applications').delete().not('id', 'is', null);
            if (error) throw error;
            await this.loadApplications();
            this.render();
            showToast('All applications cleared successfully.', 'success');
            if (typeof writeAuditLog === 'function') writeAuditLog('CLEAR_APPLICATIONS', 'Applications', 'All application records deleted');
        } catch (err) {
            console.error('[Applications] clearAllApplications error:', err);
            showToast('Failed to clear applications: ' + err.message, 'error');
        }
    },

    getStatistics() {
        return {
            total: this.applications.length,
            pending: this.applications.filter(app => app.status === 'pending').length,
            approved: this.applications.filter(app => app.status === 'approved').length,
            rejected: this.applications.filter(app => app.status === 'rejected').length,
            pendingPayments: this.applications.filter(app => {
                const pm = app.payment_method || app.paymentMethod || '';
                return (pm === 'bank-transfer' || pm === 'bank_transfer') &&
                    !app.application_fee_paid && !app.applicationFeePaid;
            }).length
        };
    },

    _isBankTransfer(app) {
        const pm = app.payment_method || app.paymentMethod || '';
        return pm === 'bank-transfer' || pm === 'bank_transfer';
    },

    // Render pending payment verification cards
    renderPendingPayments() {
        const pending = this.applications.filter(app =>
            this._isBankTransfer(app) &&
            !app.application_fee_paid && !app.applicationFeePaid
        );

        if (pending.length === 0) return '<p style="color: var(--text-tertiary); text-align: center;">No pending payment verifications.</p>';

        return pending.map(app => {
            const receiptUrl  = app.receipt_url  || app.receiptUrl;
            const paymentRef  = this._esc(app.payment_reference || app.paymentReference || 'N/A');
            const feeAmount   = app.application_fee_amount || app.applicationFeeAmount || 0;
            const pName       = this._esc(app.student_name || app.studentName || '');
            const pAppNo      = this._esc(app.application_number || app.id || '');
            const pGrade      = this._esc(app.grade || '');
            const submittedDate = new Date(app.submitted_date || app.submittedDate).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            return `
            <div style="padding: 1.25rem; border: 1px solid var(--border-primary); border-radius: 12px; border-left: 4px solid hsl(280, 70%, 55%); background: hsl(280, 30%, 98%);">
              <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 1rem;">
                <div style="flex: 1; min-width: 200px;">
                  <h4 style="margin: 0 0 0.5rem; color: var(--text-primary);">${pName}</h4>
                  <div style="display: grid; gap: 0.35rem; font-size: 0.875rem; color: var(--text-secondary);">
                    <div><i class="fas fa-hashtag" style="width: 16px;"></i> ${pAppNo}</div>
                    <div><i class="fas fa-graduation-cap" style="width: 16px;"></i> ${pGrade}</div>
                    <div><i class="fas fa-money-bill" style="width: 16px;"></i> &#8358;${feeAmount.toLocaleString()}</div>
                    <div><i class="fas fa-receipt" style="width: 16px;"></i> Ref: ${paymentRef}</div>
                    <div><i class="fas fa-calendar" style="width: 16px;"></i> ${submittedDate}</div>
                  </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end;">
                  ${receiptUrl ? `
                    <button class="btn-secondary" onclick="event.stopPropagation(); window.open('${receiptUrl}', '_blank')" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;">
                      <i class="fas fa-eye"></i> View Receipt
                    </button>
                  ` : '<span style="color: var(--text-tertiary); font-size: 0.8rem;">No receipt uploaded</span>'}
                  <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-success" onclick="event.stopPropagation(); applicationsModule.approvePayment('${app.id}')" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;">
                      <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn-danger" onclick="event.stopPropagation(); applicationsModule.rejectPayment('${app.id}')" style="font-size: 0.8rem; padding: 0.4rem 0.75rem;">
                      <i class="fas fa-times"></i> Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>`;
        }).join('');
    },

    // Approve bank transfer payment for an application
    approvePayment(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) { showToast('Application not found', 'error'); return; }

        const safeName = this._esc(app.student_name || app.studentName || '');
        const feeAmt = (app.application_fee_amount || app.applicationFeeAmount || 0).toLocaleString();

        showModal('Approve Payment', `
            <p style="margin-bottom:1.5rem;">
                Approve payment of <strong>&#8358;${feeAmt}</strong> for <strong>${safeName}</strong>?
            </p>
            <div style="display:flex;gap:0.75rem;">
                <button class="btn-success" onclick="applicationsModule._confirmApprovePayment('${id}')">
                    <i class="fas fa-check"></i> Confirm Approval
                </button>
                <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        `);
    },

    async _confirmApprovePayment(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) { showToast('Application not found', 'error'); closeModal(); return; }

        closeModal();
        try {
            const { data, error } = await supabaseClient
                .from('applications')
                .update({
                    application_fee_paid: true,
                    payment_verified_by: (await supabaseClient.auth.getSession())?.data?.session?.user?.id || null,
                    payment_verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select();

            if (error) {
                console.error('[Applications] Payment approval failed:', error);
                showToast('Failed to approve payment: ' + error.message, 'error');
                return;
            }
            if (!data || data.length === 0) {
                showToast('Update blocked — you may not have permission.', 'error');
                return;
            }

            showToast('Payment approved successfully!', 'success');
            if (typeof writeAuditLog === 'function') writeAuditLog('APPLICATION_PAYMENT_APPROVED', app?.student_name || id, `₦${(app?.application_fee_amount||0).toLocaleString()}`);
            await this.loadApplications();
            this.render();
        } catch (err) {
            console.error('[Applications] approvePayment error:', err);
            showToast('Error approving payment: ' + err.message, 'error');
        }
    },

    // Reject bank transfer payment for an application
    rejectPayment(id) {
        const app = this.applications.find(a => a.id === id);
        if (!app) { showToast('Application not found', 'error'); return; }

        showModal('Reject Payment', `
            <p style="margin-bottom: 1rem;">Reject payment for <strong>${app.student_name || app.studentName}</strong>?</p>
            <div style="margin-bottom: 1.5rem;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Reason for Rejection:</label>
                <textarea id="paymentRejectionReason" rows="3" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-primary); border-radius: var(--radius-md); font-family: inherit;" placeholder="Enter reason for rejecting this payment..." required></textarea>
            </div>
            <div style="display: flex; gap: 0.75rem;">
                <button class="btn-danger" onclick="applicationsModule.confirmPaymentRejection('${id}')">
                    <i class="fas fa-times"></i> Confirm Rejection
                </button>
                <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            </div>
        `);
    },

    async confirmPaymentRejection(id) {
        const reason = document.getElementById('paymentRejectionReason')?.value?.trim();
        if (!reason) {
            showToast('Please provide a reason for rejection', 'error');
            return;
        }

        try {
            const { data, error } = await supabaseClient
                .from('applications')
                .update({
                    payment_rejection_reason: reason,
                    payment_verified_by: (await supabaseClient.auth.getSession())?.data?.session?.user?.id || null,
                    payment_verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select();

            if (error) {
                console.error('[Applications] Payment rejection failed:', error);
                showToast('Failed to reject payment: ' + error.message, 'error');
                return;
            }
            if (!data || data.length === 0) {
                showToast('Update blocked — you may not have permission.', 'error');
                return;
            }

            showToast('Payment rejected', 'info');
            closeModal();
            await this.loadApplications();
            this.render();
        } catch (err) {
            console.error('[Applications] confirmPaymentRejection error:', err);
            showToast('Error rejecting payment: ' + err.message, 'error');
        }
    }
};

// Register module globally
window.applicationsModule = applicationsModule;
