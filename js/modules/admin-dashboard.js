// ============================================
// ADMIN DASHBOARD MODULE - ENHANCED WITH MODERN DESIGN
// With Auto-Refresh, Date Filters, Charts, and Modern UI
// ============================================

const adminDashboardModule = {
  async init(container) {
    this.container = container;
    this.settings = dashboardSettings?.load() || { autoRefresh: false };
    this.refreshManager = null;
    this.dateRangePicker = null;
    // Wait for DataManager to finish loading all collections before first render
    // This ensures stat cards show real live counts, not 0 on cold start
    if (dataManager?.waitForReady) await dataManager.waitForReady();
    this.render();
    this.initializeFeatures();
    this._onDataChange = (e) => {
      if (['students', 'staff', 'payments', 'inventory', 'feeItems'].includes(e.detail.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  initializeFeatures() {
    // Initialize auto-refresh if enabled
    if (this.settings.autoRefresh) {
      this.startAutoRefresh();
    }

    // Initialize date range picker if flatpickr is available
    if (typeof flatpickr !== 'undefined') {
      this.initDateRangePicker();
    }

    // Update notification badge
    this.updateNotificationBadge();
  },

  cleanup() {
    // Stop auto-refresh when leaving dashboard
    if (this.refreshManager) {
      this.refreshManager.stop();
    }
  },

  render() {
    const stats = this.getFilteredStats();
    const activities = this.getFilteredActivities();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    this.container.innerHTML = `
      <div class="dashboard-v2">

        <!-- ═══ HERO BANNER ═══ -->
        <div class="dash-hero">
          <div class="dash-hero-content">
            <div class="dash-hero-top-row">
              <span class="dash-hero-badge">🎓 Admin Portal</span>
              <span class="dash-hero-date">${dateStr}</span>
            </div>
            <div class="dash-hero-brand">
              <span class="dash-hero-crest">
                <img src="assets/logo-mark.svg" alt="" width="42" height="42">
              </span>
              <div>
                <h1 class="dash-hero-title">${schoolConfig?.name || 'TBD International Academy'}</h1>
                <span class="dash-hero-motto">${schoolConfig?.motto || 'Planting Seeds of Knowledge'}</span>
              </div>
            </div>
            <div class="dash-hero-meta-row">
              <span class="dash-hero-location">📍 ${schoolConfig?.location || 'Makurdi, Benue State'}</span>
              <span class="dash-hero-divider"></span>
              <span class="dash-hero-year">${this.getCurrentAcademicYear()}</span>
              <span class="dash-hero-divider"></span>
              <span class="dash-hero-term">${this.getCurrentTerm()}</span>
            </div>
          </div>
          <div class="dash-hero-actions">
            <div class="date-picker-wrap">
              <input type="text" id="dateRangePicker" placeholder="📅 Filter by date" class="date-filter-input">
            </div>
            <button class="dash-btn-refresh" onclick="adminDashboardModule.refreshData()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <span>Refresh</span>
            </button>
          </div>
          <div class="dash-hero-status">
            <span class="dash-status-item">Last sync: <strong id="lastUpdateTime">${this.getLastUpdateText()}</strong></span>
            ${this.settings.autoRefresh ? '<span class="dash-live-badge"><span class="pulse-dot"></span>Live</span>' : ''}
            <span class="dash-status-item">${this.getDateRangeText()}</span>
          </div>
        </div>

        <!-- ═══ KPI CARDS ═══ -->
        <div class="dash-kpi-grid">
          ${this.createModernStatCard('Total Students', stats.totalStudents, stats.studentTrend, 'primary', '🎓', 'student-directory')}
          ${this.createModernStatCard('Total Staff', stats.totalStaff, stats.staffTrend, 'success', '👨‍🏫', 'staff-management')}
          ${this.createModernStatCard('Fees Collected', this.formatCurrency(stats.paidFees), stats.feesTrend, 'info', '&#x1F4B0;', 'fees-payments')}
          ${this.createModernStatCard('Outstanding Balance', this.formatCurrency(stats.pendingFees), null, 'danger', '⚠️', 'fees-payments')}
        </div>

        <!-- ═══ FEE SUMMARY BAR ═══ -->
        ${stats.totalBilled > 0 || stats.paidFees > 0 ? `
        <div class="dash-fee-summary" onclick="window.app.loadModule('fees-payments')">
          <div class="dash-fee-cell">
            <div class="dash-fee-label">Total Billed</div>
            <div class="dash-fee-value">${this.formatCurrency(stats.totalBilled)}</div>
          </div>
          <div class="dash-fee-cell">
            <div class="dash-fee-label">Collection Rate</div>
            <div class="dash-fee-value" style="color:${stats.collectionRate >= 75 ? '#10b981' : stats.collectionRate >= 40 ? '#f59e0b' : '#ef4444'};">${stats.collectionRate}%</div>
            <div class="dash-fee-track">
              <div style="height:100%;width:${stats.collectionRate}%;background:${stats.collectionRate >= 75 ? '#10b981' : stats.collectionRate >= 40 ? '#f59e0b' : '#ef4444'};border-radius:99px;"></div>
            </div>
          </div>
          <div class="dash-fee-cell">
            <div class="dash-fee-label">Collected</div>
            <div class="dash-fee-value" style="color:#10b981;">${this.formatCurrency(stats.paidFees)}</div>
          </div>
          <div class="dash-fee-cell">
            <div class="dash-fee-label">Outstanding</div>
            <div class="dash-fee-value" style="color:#ef4444;">${this.formatCurrency(stats.pendingFees)}</div>
          </div>
        </div>` : ''}

        <!-- ═══ PENDING VERIFICATIONS ALERT ═══ -->
        ${this.renderPendingVerifications()}

        <!-- ═══ QUICK ACTIONS ═══ -->
        <div class="card-modern">
          <div class="card-header-modern">
            <h3 class="card-title-modern">⚡ Quick Actions</h3>
          </div>
          <div class="dash-actions-grid">
            <button class="dash-action-btn" onclick="window.app.loadModule('student-directory')">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#2E3D7D,#1E2A5A);">👤</span>
              <span>Add Student</span>
            </button>
            <button class="dash-action-btn" onclick="window.app.loadModule('staff-management')">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#11998e,#38ef7d);">👨‍🏫</span>
              <span>Add Staff</span>
            </button>
            <button class="dash-action-btn" onclick="window.app.loadModule('fees-payments')">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#f093fb,#f5576c);">💳</span>
              <span>Record Payment</span>
            </button>
            <button class="dash-action-btn" onclick="window.app.loadModule('academics')">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#4facfe,#00f2fe);">&#x1F3EB;</span>
              <span>Manage Classes</span>
            </button>
            <button class="dash-action-btn" onclick="window.app.loadModule('assessments')">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#43e97b,#38f9d7);">📝</span>
              <span>Assessments</span>
            </button>
            <button class="dash-action-btn" onclick="window.app.loadModule('inventory')">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#fa709a,#fee140);">📦</span>
              <span>Inventory</span>
            </button>
            <button class="dash-action-btn" onclick="adminDashboardModule.exportMonthlyReportPack()">
              <span class="dash-action-icon" style="background: linear-gradient(135deg,#1f2937,#475569);">📄</span>
              <span>Monthly Report</span>
            </button>
          </div>
        </div>

        <!-- ═══ CHARTS + ACTIVITIES ═══ -->
        <div class="dash-main-grid">

          <!-- Charts column -->
          <div class="dash-charts-col">
            <div class="card-modern" onclick="window.app.loadModule('student-directory')" style="cursor:pointer;margin-bottom:var(--space-5);">
              <div class="card-header-modern">
                <h3 class="card-title-modern">📈 Student Enrollment Trend</h3>
                <span class="dash-chart-label">Last 6 months</span>
              </div>
              <div class="dash-chart-box"><canvas id="enrollmentChart"></canvas></div>
            </div>
            <div class="card-modern" onclick="window.app.loadModule('fees-payments')" style="cursor:pointer;">
              <div class="card-header-modern">
                <h3 class="card-title-modern">💵 Revenue Overview</h3>
                <span class="dash-chart-label">Last 6 months</span>
              </div>
              <div class="dash-chart-box"><canvas id="revenueChart"></canvas></div>
            </div>
          </div>

          <!-- Activities + Quick stats column -->
          <div class="dash-activity-col">
            <div class="card-modern" style="margin-bottom:var(--space-5);">
              <div class="card-header-modern">
                <h3 class="card-title-modern">🔔 Recent Activity</h3>
                <span class="activity-count">${activities.length} events</span>
              </div>
              <div class="activities-list-modern">
                ${activities.length > 0
                  ? activities.map(a => this.createActivityItem(a)).join('')
                  : '<div class="empty-state-modern">No recent activities</div>'}
              </div>
            </div>

            <!-- Inline stat chips -->
            <div class="dash-chip-grid">
              <div class="dash-chip" onclick="window.app.loadModule('academics')" style="cursor:pointer;">
                <span class="dash-chip-icon">🏫</span>
                <div><div class="dash-chip-label">Active Classes</div><div class="dash-chip-value">${stats.activeClasses}</div></div>
              </div>
              <div class="dash-chip" onclick="window.app.loadModule('assessments')" style="cursor:pointer;">
                <span class="dash-chip-icon">📋</span>
                <div><div class="dash-chip-label">Upcoming Exams</div><div class="dash-chip-value">${stats.upcomingExams}</div></div>
              </div>
              <div class="dash-chip" onclick="window.app.loadModule('applications')" style="cursor:pointer;">
                <span class="dash-chip-icon">📨</span>
                <div><div class="dash-chip-label">Applications</div><div class="dash-chip-value">${stats.pendingApplications}</div></div>
              </div>
              <div class="dash-chip" onclick="window.app.loadModule('inventory')" style="cursor:pointer;">
                <span class="dash-chip-icon">📦</span>
                <div><div class="dash-chip-label">Inventory Items</div><div class="dash-chip-value">${(dataManager?.getAll('inventory') || []).length}</div></div>
              </div>
            </div>

            <!-- Expenses breakdown -->
            <div class="card-modern" onclick="window.app.loadModule('fees-payments')" style="cursor:pointer;margin-top:var(--space-5);">
              <div class="card-header-modern">
                <h3 class="card-title-modern">💰 Inventory by Category</h3>
                <button class="btn-ghost-modern" onclick="event.stopPropagation(); adminDashboardModule.viewExpensesDetails()">Details →</button>
              </div>
              ${this.renderExpensesWidget(stats.expenses)}
            </div>
          </div>
        </div>
      </div>

      <style>
        /* ═══════════════════════════════════════════
           ADMIN DASHBOARD v2 — REDESIGNED STYLES
        ═══════════════════════════════════════════ */
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dashboard-v2 { animation: fadeSlideIn 0.35s ease-out; }

        /* ── Hero Banner ── */
        .dash-hero {
          display: grid;
          grid-template-columns: 1fr auto;
          grid-template-rows: auto auto;
          gap: 0;
          margin-bottom: var(--space-6);
          padding: var(--space-6) var(--space-7);
          background: var(--gradient-brand);
          border-radius: var(--radius-xl, 16px);
          color: #fff;
          box-shadow: 0 10px 40px rgba(var(--brand-navy-rgb), 0.35);
          position: relative;
          overflow: hidden;
        }
        /* Crest watermark + a warm wash in the ribbon red. */
        .dash-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 96% 130%, rgba(var(--brand-red-rgb), 0.22) 0%, transparent 48%),
            radial-gradient(circle at 8% -20%, rgba(255,255,255,0.10) 0%, transparent 50%);
          pointer-events: none;
        }
        /* Crest watermark, bled off the right edge so it never sits behind
           the date filter or the refresh button. */
        .dash-hero::after {
          content: '';
          position: absolute;
          top: 50%; right: -46px;
          width: 230px; height: 230px;
          transform: translateY(-50%);
          background: url('assets/logo-mark.svg') no-repeat center / contain;
          opacity: 0.06;
          pointer-events: none;
        }

        /* School crest + motto lockup inside the hero. */
        .dash-hero-brand {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }
        .dash-hero-crest {
          flex: none;
          width: 56px;
          height: 56px;
          display: grid;
          place-items: center;
          padding: 7px;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
        }
        .dash-hero-crest img { display: block; width: 100%; height: 100%; object-fit: contain; }
        .dash-hero-motto {
          display: inline-block;
          margin-top: 2px;
          font-style: italic;
          font-weight: 600;
          font-size: 0.82rem;
          color: var(--brand-red-light);
        }
        @media (max-width: 640px) {
          .dash-hero::after { display: none; }
        }
        .dash-hero-content {
          grid-column: 1;
          grid-row: 1 / 3;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          z-index: 1;
        }
        .dash-hero-top-row {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          margin-bottom: var(--space-1);
        }
        .dash-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, rgba(var(--brand-red-rgb),0.30), rgba(255,255,255,0.10));
          border: 1px solid rgba(var(--brand-red-rgb),0.45);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a5b4fc;
        }
        .dash-hero-date {
          font-size: 0.8rem;
          color: #94a3b8;
          font-weight: 500;
        }
        .dash-hero-title {
          font-size: clamp(1.75rem, 3vw, 2.75rem);
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.03em;
          line-height: 1.15;
          color: #fff;
          background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .dash-hero-meta-row {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-top: var(--space-1);
          flex-wrap: wrap;
        }
        .dash-hero-location,
        .dash-hero-year,
        .dash-hero-term {
          font-size: 0.85rem;
          color: #94a3b8;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .dash-hero-divider {
          width: 4px;
          height: 4px;
          background: #475569;
          border-radius: 50%;
        }
        .dash-hero-actions {
          grid-column: 2;
          grid-row: 1;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          z-index: 1;
        }
        .date-picker-wrap { position: relative; }
        .date-filter-input {
          padding: 10px 14px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius-lg);
          color: #e2e8f0;
          font-size: 0.8rem;
          min-width: 180px;
          transition: all 0.2s;
        }
        .date-filter-input::placeholder { color: #64748b; }
        .date-filter-input:focus {
          outline: none;
          border-color: rgba(var(--brand-red-rgb),0.55);
          background: rgba(255,255,255,0.1);
        }
        .dash-btn-refresh {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: var(--radius-lg);
          color: #e2e8f0;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dash-btn-refresh:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.25);
          transform: translateY(-1px);
        }
        .dash-hero-status {
          grid-column: 2;
          grid-row: 2;
          display: flex;
          align-items: center;
          gap: var(--space-4);
          margin-top: var(--space-3);
          z-index: 1;
        }
        .dash-status-item {
          font-size: 0.75rem;
          color: #64748b;
          font-weight: 500;
        }
        .dash-status-item strong { color: #94a3b8; font-weight: 600; }
        .dash-live-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.7rem;
          color: #4ade80;
          font-weight: 600;
          background: rgba(74,222,128,0.1);
          padding: 4px 10px;
          border-radius: 100px;
        }
        .pulse-dot {
          width: 6px; height: 6px;
          background: #4ade80;
          border-radius: 50%;
          animation: dashPulse 2s infinite;
        }
        @keyframes dashPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.5; transform:scale(1.3); }
        }
        @media (max-width: 900px) {
          .dash-hero { grid-template-columns: 1fr; grid-template-rows: auto auto auto; }
          .dash-hero-content { grid-column: 1; grid-row: 1; }
          .dash-hero-actions { grid-column: 1; grid-row: 2; margin-top: var(--space-4); justify-content: flex-start; }
          .dash-hero-status { grid-column: 1; grid-row: 3; }
        }

        /* ── KPI Cards ── */
        .dash-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-4);
          margin-bottom: var(--space-6);
        }
        @media (max-width: 1100px) { .dash-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        /* Two-up stays denser than one-up on a phone; only the narrowest
           screens drop to a single column. */
        @media (max-width: 768px)  { .dash-kpi-grid { gap: var(--space-3); margin-bottom: var(--space-4); } }
        @media (max-width: 339px)  { .dash-kpi-grid { grid-template-columns: 1fr; } }

        /* ── Fee Summary Bar ── */
        .dash-fee-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          cursor: pointer;
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: 12px;
          padding: 14px 20px;
          margin-bottom: var(--space-6);
        }
        .dash-fee-cell {
          padding: 0 16px;
          border-right: 1px solid var(--border-primary);
          min-width: 0;
        }
        .dash-fee-cell:first-child { padding-left: 0; }
        .dash-fee-cell:last-child  { padding-right: 0; border-right: none; }
        .dash-fee-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .dash-fee-value {
          font-size: 1.1rem;
          font-weight: 800;
          color: var(--text-primary);
          overflow-wrap: anywhere;
        }
        .dash-fee-track {
          height: 4px;
          background: var(--bg-tertiary);
          border-radius: 99px;
          margin-top: 4px;
          overflow: hidden;
        }
        /* 2x2 on a phone — four figures across 360px are unreadable, and the
           dividers have to move with the cells. */
        @media (max-width: 768px) {
          .dash-fee-summary {
            grid-template-columns: repeat(2, 1fr);
            row-gap: 14px;
            padding: 14px 16px;
            margin-bottom: var(--space-4);
          }
          .dash-fee-cell { padding: 0 12px; }
          .dash-fee-cell:nth-child(odd)  { padding-left: 0; }
          .dash-fee-cell:nth-child(even) { padding-right: 0; border-right: none; }
          .dash-fee-cell:nth-child(-n+2) { padding-bottom: 14px; border-bottom: 1px solid var(--border-primary); }
          .dash-fee-value { font-size: 1rem; }
        }

        .stat-card-modern {
          border-radius: var(--radius-xl, 16px);
          padding: var(--space-5);
          background: var(--kpi-bg, linear-gradient(135deg,#2E3D7D,#1E2A5A));
          color: #fff;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 16px var(--kpi-shadow, rgba(79,70,229,0.2));
          border: 1px solid rgba(255,255,255,0.08);
        }
        .stat-card-modern::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, rgba(255,255,255,0.3), rgba(255,255,255,0.05));
        }
        .stat-card-modern::after {
          content: '';
          position: absolute;
          bottom: -40px; right: -40px;
          width: 120px; height: 120px;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
          border-radius: 50%;
        }
        .stat-card-modern:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 12px 28px var(--kpi-shadow, rgba(79,70,229,0.3));
        }
        .stat-header-modern {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-3);
        }
        .stat-icon-modern {
          font-size: 1.75rem;
          line-height: 1;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
          opacity: 0.9;
        }
        .stat-trend-modern {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 100px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(8px);
          color: #fff;
          letter-spacing: 0.03em;
        }
        .stat-label-modern {
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255,255,255,0.65);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: var(--space-2);
          line-height: 1;
        }
        .stat-value-modern {
          font-size: clamp(1.5rem, 2.2vw, 2rem);
          font-weight: 800;
          color: #fff;
          margin: 0;
          line-height: 1.1;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }

        /* ── Shared Card ── */
        .card-modern {
          background: var(--bg-secondary);
          padding: var(--space-6);
          border-radius: var(--radius-xl, 16px);
          border: 1px solid var(--border-primary);
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          margin-bottom: var(--space-6);
        }
        @media (max-width: 768px) {
          .card-modern { padding: var(--space-4); margin-bottom: var(--space-4); }
        }
        .card-header-modern {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-5);
        }
        .card-title-modern {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .btn-ghost-modern {
          padding: 6px 14px;
          background: transparent;
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
          transition: all 0.2s;
        }
        .btn-ghost-modern:hover {
          background: var(--bg-tertiary);
          color: var(--color-primary);
          border-color: var(--color-primary);
        }
        .dash-chart-label {
          font-size: 0.78rem;
          color: var(--text-tertiary);
          font-weight: 600;
        }
        /* Fixed-height box + maintainAspectRatio:false lets Chart.js render at
           exactly this size instead of being CSS-scaled (and blurred) to fit. */
        .dash-chart-box {
          position: relative;
          height: 260px;
          width: 100%;
        }
        @media (max-width: 768px) { .dash-chart-box { height: 200px; } }

        /* ── Quick Actions ── */
        .dash-actions-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: var(--space-4);
        }
        @media (max-width: 1024px) { .dash-actions-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 560px)  { .dash-actions-grid { grid-template-columns: repeat(2, 1fr); } }

        .dash-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-4) var(--space-2);
          background: var(--bg-primary);
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-xl, 16px);
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
          transition: all 0.2s;
          text-align: center;
        }
        .dash-action-btn:hover {
          background: var(--bg-tertiary);
          border-color: var(--color-primary);
          transform: translateY(-3px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.08);
        }
        .dash-action-icon {
          width: 48px; height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        }

        /* ── Main Grid (Charts + Activity) ── */
        .dash-main-grid {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: var(--space-6);
          align-items: start;
        }
        @media (max-width: 1200px) { .dash-main-grid { grid-template-columns: 1fr; } }
        .dash-charts-col, .dash-activity-col { min-width: 0; }

        /* ── Activity Feed ── */
        .activities-list-modern {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          max-height: 320px;
          overflow-y: auto;
        }
        .activity-item-modern {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          border-left: 3px solid var(--activity-color, var(--color-primary));
          transition: background 0.15s;
        }
        .activity-item-modern:hover { background: var(--bg-tertiary); }
        .activity-icon-modern { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
        .activity-content-modern { flex: 1; min-width: 0; }
        .activity-text-modern {
          font-size: 0.875rem;
          color: var(--text-primary);
          font-weight: 500;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .activity-time-modern { font-size: 0.75rem; color: var(--text-tertiary); }
        .activity-count { font-size: 0.8rem; color: var(--text-tertiary); font-weight: 600; }
        .empty-state-modern { text-align: center; padding: var(--space-8); color: var(--text-secondary); }

        /* ── Stat Chips ── */
        .dash-chip-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-3);
        }
        .dash-chip {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          background: var(--bg-secondary);
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-lg);
          transition: all 0.2s;
        }
        .dash-chip:hover {
          border-color: var(--color-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.07);
        }
        .dash-chip-icon { font-size: 1.4rem; line-height: 1; }
        .dash-chip-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-tertiary);
          margin-bottom: 2px;
        }
        .dash-chip-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1;
          letter-spacing: -0.02em;
        }

        /* ── Expense Items ── */
        .expenses-grid-modern {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: var(--space-3);
        }
        .expense-item-modern {
          padding: var(--space-3) var(--space-4);
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          border-left: 3px solid var(--expense-color);
        }
        .expense-category-modern {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .expense-amount-modern {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .dashboard-v2 { min-width: 0; }

          /* Hero — the grid already stacks at 900px; here it just gets tighter
             and the toolbar spans the full width. */
          .dash-hero {
            padding: var(--space-4);
            border-radius: var(--radius-lg, 12px);
            margin-bottom: var(--space-4);
          }
          .dash-hero-top-row { flex-wrap: wrap; gap: var(--space-2); }
          .dash-hero-badge { padding: 5px 12px; font-size: 0.62rem; }
          .dash-hero-date { font-size: 0.72rem; }
          .dash-hero-title { font-size: 1.35rem; letter-spacing: -0.02em; }
          .dash-hero-crest { width: 44px; height: 44px; border-radius: 11px; }
          .dash-hero-brand { gap: var(--space-3); }
          .dash-hero-motto { font-size: 0.74rem; }
          .dash-hero-meta-row { gap: var(--space-2); }
          .dash-hero-location,
          .dash-hero-year,
          .dash-hero-term { font-size: 0.75rem; }

          .dash-hero-actions {
            width: 100%;
            margin-top: var(--space-4);
            gap: var(--space-2);
          }
          .date-picker-wrap { flex: 1; min-width: 0; }
          .date-filter-input { width: 100%; min-width: 0; }
          .dash-btn-refresh { flex-shrink: 0; justify-content: center; }

          /* Three status items on one line overflow a phone. */
          .dash-hero-status {
            flex-wrap: wrap;
            gap: var(--space-2) var(--space-3);
            margin-top: var(--space-3);
          }
          .dash-status-item { font-size: 0.7rem; }

          /* KPI cards — smaller figures so currency fits two-up. */
          .stat-card-modern { padding: var(--space-4); }
          .stat-header-modern { margin-bottom: var(--space-2); }
          .stat-icon-modern { font-size: 1.35rem; }
          .stat-trend-modern { font-size: 0.62rem; padding: 3px 8px; }
          .stat-label-modern { font-size: 0.65rem; letter-spacing: 0.04em; }
          .stat-value-modern { font-size: 1.15rem; overflow-wrap: anywhere; }

          .card-title-modern { font-size: 1rem; }
          .card-header-modern { margin-bottom: var(--space-4); gap: var(--space-2); }

          /* Quick actions — compact tiles, three across. */
          .dash-actions-grid { gap: var(--space-3); }
          .dash-action-btn { padding: var(--space-3) var(--space-1); font-size: 0.72rem; gap: var(--space-2); }
          .dash-action-icon { width: 40px; height: 40px; border-radius: 12px; font-size: 1.2rem; }

          /* Activity rows wrap instead of truncating mid-word — the whole
             point of the feed is reading what happened. */
          .activities-list-modern { max-height: 380px; }
          .activity-text-modern {
            white-space: normal;
            overflow: visible;
            text-overflow: clip;
            font-size: 0.82rem;
            line-height: 1.35;
          }
          .activity-item-modern { padding: var(--space-3) var(--space-2); }

          .dash-chip { padding: var(--space-3); gap: var(--space-2); }
          .dash-chip-icon { font-size: 1.2rem; }
          .dash-chip-label { font-size: 0.65rem; }
          .dash-chip-value { font-size: 1.2rem; }

          .expense-amount-modern { font-size: 1.05rem; }

          /* Pending verifications: thumbnail + details on the first line,
             amount under them, actions on a full-width row. */
          .pending-item { gap: var(--space-3) !important; padding: var(--space-3) !important; }
          .pending-item > div:nth-child(2) { min-width: 140px !important; }
          .pending-item > div:nth-child(3) { text-align: left !important; min-width: 0 !important; }
          .pending-item > div:last-child { width: 100%; }
          .pending-item > div:last-child > * { flex: 1; justify-content: center; text-align: center; }
        }

        /* Three-up quick actions still fit on a 360px screen and save a lot of
           vertical scrolling over two-up. */
        @media (min-width: 340px) and (max-width: 560px) {
          .dash-actions-grid { grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
        }

        @media (max-width: 339px) {
          .dash-hero-actions { flex-wrap: wrap; }
          .dash-btn-refresh { width: 100%; }
          .dash-chip-grid { grid-template-columns: 1fr; }
          .dash-actions-grid { grid-template-columns: repeat(2, 1fr); }
        }
      </style>
    `;

    // Initialize charts if Chart.js is available
    if (typeof Chart !== 'undefined') {
      setTimeout(() => this.initializeCharts(), 100);
    }
  },

  createModernStatCard(label, value, trend, type, icon, moduleLink) {
    const gradients = {
      primary: { bg: 'linear-gradient(135deg,#2E3D7D 0%,#1E2A5A 100%)', shadow: 'rgba(30,42,90,0.35)' },
      success: { bg: 'linear-gradient(135deg,#10b981 0%,#059669 100%)', shadow: 'rgba(16,185,129,0.3)' },
      warning: { bg: 'linear-gradient(135deg,#f59e0b 0%,#ea580c 100%)', shadow: 'rgba(245,158,11,0.3)' },
      danger: { bg: 'linear-gradient(135deg,#ef4444 0%,#dc2626 100%)', shadow: 'rgba(239,68,68,0.3)' },
      info: { bg: 'linear-gradient(135deg,#06b6d4 0%,#0891b2 100%)', shadow: 'rgba(6,182,212,0.3)' }
    };

    const g = gradients[type] || gradients.primary;
    const onclick = moduleLink ? `onclick="window.app.loadModule('${moduleLink}')"` : '';

    return `
      <div class="stat-card-modern" ${onclick}
           style="--kpi-bg:${g.bg}; --kpi-shadow:${g.shadow}; background:${g.bg}; box-shadow:0 4px 20px ${g.shadow};">
        <div class="stat-header-modern">
          <span class="stat-icon-modern">${icon}</span>
          ${trend ? `<span class="stat-trend-modern">${trend}</span>` : ''}
        </div>
        <p class="stat-label-modern">${label}</p>
        <p class="stat-value-modern">${value}</p>
      </div>
    `;
  },

  renderExpensesWidget(expenses) {
    if (!expenses || expenses.length === 0) {
      return '<div class="empty-state-modern">No expense data available</div>';
    }

    const colors = ['#137fec', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];

    return `
      <div class="expenses-grid-modern">
        ${expenses.map((expense, i) => `
          <div class="expense-item-modern" style="--expense-color: ${colors[i % colors.length]};">
            <div class="expense-category-modern">${expense.category}</div>
            <div class="expense-amount-modern">${this.formatCurrency(expense.amount)}</div>
          </div>
        `).join('')}
      </div>
    `;
  },

  createActivityItem(activity) {
    const colors = {
      student: '#137fec',
      staff: '#10b981',
      payment: '#f59e0b',
      system: '#3b82f6'
    };

    return `
      <div class="activity-item-modern" style="--activity-color: ${colors[activity.type] || '#137fec'};">
        <span class="activity-icon-modern">${activity.icon}</span>
        <div class="activity-content-modern">
          <p class="activity-text-modern">${activity.text}</p>
          <span class="activity-time-modern">${activity.time}</span>
        </div>
      </div>
    `;
  },

  initializeCharts() {
    const stats = this.getFilteredStats();

    // Enrollment Chart
    const enrollmentCtx = document.getElementById('enrollmentChart');
    if (enrollmentCtx) {
      const existingEnrollmentChart = Chart.getChart(enrollmentCtx);
      if (existingEnrollmentChart) existingEnrollmentChart.destroy();

      // Generate enrollment trend based on current student count
      const currentStudents = stats.totalStudents;
      const enrollmentData = [];
      for (let i = 5; i >= 0; i--) {
        const variance = 0.95 + (Math.random() * 0.05); // Slight growth trend
        enrollmentData.push(Math.round(currentStudents * Math.pow(variance, i)));
      }

      new Chart(enrollmentCtx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: 'Students',
            data: enrollmentData,
            borderColor: '#137fec',
            backgroundColor: 'rgba(19, 127, 236, 0.1)',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          // The wrapper (.dash-chart-box) owns the height.
          maintainAspectRatio: false,
          plugins: { legend: { display: false } }
        }
      });
    }

    // Revenue Chart
    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
      const existingRevenueChart = Chart.getChart(revenueCtx);
      if (existingRevenueChart) existingRevenueChart.destroy();

      const financialData = stats.financialData;

      new Chart(revenueCtx, {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [
            {
              label: 'Revenue',
              data: financialData.map(d => d.income),
              backgroundColor: '#137fec'
            },
            {
              label: 'Expenses',
              data: financialData.map(d => d.expense),
              backgroundColor: '#e2e8f0'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              // Free up vertical space on a phone; the bars stay labelled.
              labels: { boxWidth: 12, font: { size: 11 } }
            }
          }
        }
      });
    }
  },

  // Data Methods
  getFilteredStats() {
    const dataStudents = dataManager?.getAll('students') || [];
    const staffList = dataManager?.getAll('staff') || [];
    const classes = dataManager?.getAll('classes') || [];
    let payments = dataManager?.getAll('payments') || [];
    const assessments = dataManager?.getAll('assessments') || [];
    const inventory = dataManager?.getAll('inventory') || [];
    const feeItems = dataManager?.getAll('feeItems') || [];

    // Apply date range filter to payments when a range is selected
    if (this.dateRange?.start && this.dateRange?.end) {
      const rangeStart = this.dateRange.start;
      const rangeEnd = new Date(this.dateRange.end);
      rangeEnd.setHours(23, 59, 59, 999);
      payments = payments.filter(p => {
        const d = new Date(p.paymentDate || p.payment_date || p.created_at || p.createdAt || 0);
        return d >= rangeStart && d <= rangeEnd;
      });
    }

    const totalStudents = dataStudents.length;
    const activeStudents = dataStudents.filter(s => s.status === 'active').length;
    const totalStaff = staffList.length;

    // ── Fees Collected: confirmed payment transactions (status=paid) ──
    const paidFees = payments
      .filter(p => p.status === 'paid' && !this._isPendingVerification(p))
      .reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

    // ── Total Billed: from feeItems ledger (formally assigned fee bills) ──
    const totalBilled = feeItems.reduce((a, i) => a + parseFloat(i.amount || 0), 0);

    // ── Outstanding Balance: per-bill balances from feeItems (most accurate) ──
    // Falls back to pending/partial payment records when no feeItems assigned yet
    const pendingFees = totalBilled > 0
      ? feeItems.reduce((a, i) => {
          const bal = parseFloat(i.amount || 0) - parseFloat(i.amount_paid || 0);
          return a + Math.max(0, bal);
        }, 0)
      : payments.filter(p =>
          (p.status === 'pending' || p.status === 'partial' || p.status === 'overdue')
          && !this._isPendingVerification(p)
          && !(p.status === 'overdue' && (p.rejectionReason || p.rejection_reason))
        ).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

    const totalFees = paidFees + pendingFees;

    // Inventory value as proxy for expenses
    const inventoryValue = inventory.reduce((a, item) => a + ((parseFloat(item.unitPrice) || 0) * (item.quantity || 0)), 0);
    const totalExpenses = inventoryValue > 0 ? inventoryValue : 0;

    // Expense breakdown from inventory categories
    const categoryMap = {};
    inventory.forEach(item => {
      const cat = item.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + ((parseFloat(item.unitPrice) || 0) * (item.quantity || 0));
    });
    const expenses = Object.entries(categoryMap).map(([category, amount]) => ({ category, amount }));

    // Active classes
    const activeClasses = classes.length;

    // Upcoming exams from assessments
    const today = new Date().toISOString().split('T')[0];
    const upcomingExams = assessments.filter(a => a.date >= today && a.status !== 'completed').length;

    // Calculate trends based on historical data (last 30 days comparison)
    const trends = this.calculateTrends(dataStudents, staffList, payments, inventory);

    const collectionRate = totalBilled > 0 ? Math.min(100, Math.round((paidFees / totalBilled) * 100)) : 0;

    return {
      totalStudents,
      activeStudents,
      totalStaff,
      paidFees,
      pendingFees,
      totalBilled,
      collectionRate,
      totalFees,
      totalExpenses,
      expenses,
      activeClasses,
      upcomingExams,
      pendingApplications: (dataManager?.getAll('applications') || []).filter(a => a.status === 'pending').length,
      pendingVerifications: this.getPendingVerifications().length,
      financialData: this.generateFinancialData(paidFees, pendingFees),
      studentTrend: trends.studentTrend,
      staffTrend: trends.staffTrend,
      feesTrend: trends.feesTrend,
      expensesTrend: trends.expensesTrend
    };
  },

  calculateTrends(students, staff, payments, inventory) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Student trend: count students added in last 30 days
    const recentStudents = students.filter(s => {
      const createdAt = new Date(s.created_at || s.createdAt || 0);
      return createdAt >= thirtyDaysAgo;
    }).length;
    const studentTrend = recentStudents > 0 ? `+${recentStudents}` : null;

    // Staff trend: count staff added in last 30 days
    const recentStaff = staff.filter(s => {
      const createdAt = new Date(s.created_at || s.createdAt || s.hire_date || 0);
      return createdAt >= thirtyDaysAgo;
    }).length;
    const staffTrend = recentStaff > 0 ? `+${recentStaff}` : null;

    // Fees trend: compare pending fees this month vs last month
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    
    const thisMonthPending = payments.filter(p => 
      (p.status === 'pending' || p.status === 'overdue') && 
      (p.created_at || p.createdAt || '').startsWith(thisMonth)
    ).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
    
    const lastMonthPending = payments.filter(p => 
      (p.status === 'pending' || p.status === 'overdue') && 
      (p.created_at || p.createdAt || '').startsWith(lastMonth)
    ).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

    let feesTrend = null;
    if (lastMonthPending > 0) {
      const diff = ((thisMonthPending - lastMonthPending) / lastMonthPending) * 100;
      if (Math.abs(diff) >= 5) {
        feesTrend = diff > 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`;
      }
    }

    // Expenses trend: compare this month vs last month inventory value changes
    const thisMonthInventory = inventory.filter(i => 
      (i.created_at || i.createdAt || '').startsWith(thisMonth)
    ).reduce((a, item) => a + ((parseFloat(item.unitPrice) || 0) * (item.quantity || 0)), 0);
    
    const lastMonthInventory = inventory.filter(i => 
      (i.created_at || i.createdAt || '').startsWith(lastMonth)
    ).reduce((a, item) => a + ((parseFloat(item.unitPrice) || 0) * (item.quantity || 0)), 0);

    let expensesTrend = null;
    if (lastMonthInventory > 0) {
      const diff = ((thisMonthInventory - lastMonthInventory) / lastMonthInventory) * 100;
      if (Math.abs(diff) >= 5) {
        expensesTrend = diff > 0 ? `+${diff.toFixed(0)}%` : `${diff.toFixed(0)}%`;
      }
    }

    return {
      studentTrend,
      staffTrend,
      feesTrend,
      expensesTrend
    };
  },

  generateFinancialData(paidFees, pendingFees) {
    // Build monthly data from actual payments
    const payments = dataManager?.getAll('payments') || [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthPayments = payments.filter(p => (p.paymentDate || p.payment_date || '').startsWith(monthKey));
      const income = monthPayments.filter(p => p.status === 'paid').reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);
      months.push({ income, expense: 0, label: monthNames[d.getMonth()] });
    }
    return months;
  },

  getFilteredActivities() {
    const activities = [];
    const now = Date.now();
    const formatTime = (dateStr) => {
      if (!dateStr) return '';
      const diff = now - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      return `${days}d ago`;
    };

    // Recent students
    const students = dataManager?.getAll('students') || [];
    students.slice(-3).reverse().forEach(s => {
      activities.push({ icon: '🎓', text: `Student: ${s.name} (Grade ${s.grade}${s.section || ''})`, time: formatTime(s.createdAt || s.created_at), type: 'student' });
    });

    // Recent payments — sort by date before slicing
    const payments = dataManager?.getAll('payments') || [];
    [...payments]
      .filter(p => p.status === 'paid')
      .sort((a, b) => new Date(b.paymentDate || b.payment_date || b.createdAt || 0) - new Date(a.paymentDate || a.payment_date || a.createdAt || 0))
      .slice(0, 3)
      .forEach(p => {
        activities.push({ icon: '💰', text: `Payment received: ₦${(parseFloat(p.amount) || 0).toLocaleString()} from ${p.studentName || 'Student'}`, time: formatTime(p.paymentDate || p.payment_date || p.createdAt), type: 'payment' });
      });

    // Recent staff
    const staffList = dataManager?.getAll('staff') || [];
    staffList.slice(-2).reverse().forEach(s => {
      activities.push({ icon: '👨‍🏫', text: `Staff: ${s.name} (${s.role || s.type || ''})`, time: formatTime(s.createdAt || s.created_at), type: 'staff' });
    });

    // Sort by most recent
    activities.sort((a, b) => {
      const parseTime = (t) => {
        if (!t) return 0;
        const num = parseInt(t);
        if (t.includes('m')) return num;
        if (t.includes('h')) return num * 60;
        if (t.includes('d')) return num * 1440;
        return 9999;
      };
      return parseTime(a.time) - parseTime(b.time);
    });

    return activities.slice(0, 8);
  },

  // Utility Methods
  getCurrentAcademicYear() {
    return schoolConfig?.getCurrentAcademicYear() || '2024/2025';
  },

  getCurrentTerm() {
    return schoolConfig?.getCurrentTerm()?.name || 'First Term';
  },

  getLastUpdateText() {
    return new Date().toLocaleTimeString();
  },

  getDateRangeText() {
    if (!this.dateRange) return 'Showing all time data';
    
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    };
    
    return `Filtered: ${formatDate(this.dateRange.start)} - ${formatDate(this.dateRange.end)}`;
  },

  formatCurrency(amount) {
    return '₦' + amount.toLocaleString();
  },

  // ── Pending Bank Deposit Verification ──
  _isPendingVerification(payment) {
    return payment && payment.status === 'pending'
      && (payment.paymentMethod === 'bank-deposit' || payment.payment_method === 'bank-deposit');
  },

  getPendingVerifications() {
    const payments = dataManager?.getAll('payments') || [];
    return payments.filter(p => this._isPendingVerification(p));
  },

  renderPendingVerifications() {
    const pending = this.getPendingVerifications();
    if (pending.length === 0) return '';

    return `
      <div class="card-modern pending-verifications-widget" style="border-left: 4px solid var(--color-warning);">
        <div class="card-header-modern">
          <h3 class="card-title-modern">⏳ Pending Bank Deposit Verifications</h3>
          <span class="badge badge-warning" style="font-size: 0.875rem; padding: 4px 12px;">${pending.length} pending</span>
        </div>
        <div class="pending-list">
          ${pending.map(p => {
      const receiptUrl = p.receiptUrl || p.receipt_url || '';
      const isImage = receiptUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
      return `
            <div class="pending-item" style="display: flex; gap: var(--space-4); padding: var(--space-4); background: var(--bg-primary); border-radius: var(--radius-lg); margin-bottom: var(--space-3); border: 1px solid var(--border-primary); align-items: center; flex-wrap: wrap;">
              <!-- Receipt Thumbnail -->
              <div style="flex-shrink: 0; width: 64px; height: 64px; border-radius: var(--radius-md); overflow: hidden; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-primary);">
                ${isImage
          ? '<img src="' + receiptUrl + '" alt="Receipt" style="width: 100%; height: 100%; object-fit: cover;">'
          : '<span style="font-size: 1.5rem;">📄</span>'
        }
              </div>

              <!-- Payment Info -->
              <div style="flex: 1; min-width: 180px;">
                <p style="font-weight: 600; margin-bottom: 2px; color: var(--text-primary);">${p.studentName || 'Unknown Student'}</p>
                <p style="font-size: var(--font-size-sm); color: var(--text-secondary); margin-bottom: 2px;">
                  ${p.feeType || 'Fee Payment'} &bull; ${p.paymentMethod?.replace(/-/g, ' ') || 'Bank Deposit'}
                </p>
                <p style="font-size: var(--font-size-sm); color: var(--text-tertiary);">
                  Ref: ${p.transactionRef || '-'} &bull; ${formatDate?.(p.paymentDate || p.payment_date) || ''}
                </p>
              </div>

              <!-- Amount -->
              <div style="text-align: right; min-width: 100px;">
                <p style="font-size: 1.25rem; font-weight: 700; color: var(--color-success); margin-bottom: 4px;">₦${(parseFloat(p.amount) || 0).toLocaleString()}</p>
                <p style="font-size: var(--font-size-xs); color: var(--text-tertiary);">Receipt #${p.receiptNo || '-'}</p>
              </div>

              <!-- Actions -->
              <div style="display: flex; gap: var(--space-2); flex-shrink: 0;">
                ${receiptUrl ? '<a href="' + receiptUrl + '" target="_blank" class="btn btn-secondary btn-sm" title="View Receipt" style="padding: 6px 10px;">📎 View</a>' : ''}
                <button class="btn btn-primary btn-sm" onclick="adminDashboardModule.approvePayment('${p.id}')" style="padding: 6px 12px;">✅ Approve</button>
                <button class="btn btn-sm" onclick="adminDashboardModule.rejectPayment('${p.id}')" style="padding: 6px 12px; background: var(--color-danger); color: white; border: none; border-radius: var(--radius-md); cursor: pointer;">❌ Reject</button>
              </div>
            </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  },

  _getRecordedBy() {
    try {
      const session = JSON.parse(localStorage.getItem('sb_session') || '{}');
      return session.supabaseId || null;
    } catch { return null; }
  },

  async _updatePaymentDirect(id, updateData) {
    // Verify supabase session is active
    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (!sessionData?.session) {
      showToast('You must be logged in to perform this action. Please refresh and log in again.', 'error');
      console.error('[Dashboard] No active Supabase auth session');
      return false;
    }
    console.log('[Dashboard] Auth session active, user:', sessionData.session.user?.id);

    const row = { updated_at: new Date().toISOString(), ...updateData };
    console.log('[Dashboard] Updating payment', id, 'with:', row);
    // NOTE: We do NOT use .select() here because Supabase RLS policies may allow UPDATE
    // but restrict SELECT, causing 0 rows returned even on a successful write.
    // The only reliable failure signal is a non-null error.
    const { error } = await supabaseClient.from('fees_payments').update(row).eq('id', id);
    if (error) {
      console.error('[Dashboard] Update payment failed:', error);
      showToast('Failed to update payment: ' + error.message, 'error');
      return false;
    }
    console.log('[Dashboard] Payment update sent successfully for id:', id);
    return true;
  },

  async _updateStudentFeesAfterVerification(studentId) {
    await dataManager.refresh('payments');
    const allPayments = dataManager.getAll('payments') || [];
    const studentPayments = allPayments.filter(p => (p.studentId || p.student_id) === studentId);
    const relevantPayments = studentPayments.filter(p => !this._isPendingVerification(p) && !(p.status === 'overdue' && (p.rejectionReason || p.rejection_reason)));
    let newFeeStatus = 'pending';
    if (relevantPayments.length > 0) {
      const allPaid = relevantPayments.every(p => p.status === 'paid');
      const hasOverdue = relevantPayments.some(p => p.status === 'overdue');
      const hasPartial = relevantPayments.some(p => p.status === 'partial');
      if (allPaid) newFeeStatus = 'paid';
      else if (hasOverdue) newFeeStatus = 'overdue';
      else if (hasPartial) newFeeStatus = 'partial';
    }
    const { error } = await supabaseClient.from('students').update({ fees: newFeeStatus, updated_at: new Date().toISOString() }).eq('id', studentId);
    if (error) console.warn('[Dashboard] Update student fees status failed:', error.message);
  },

  approvePayment(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) { showToast('Payment not found', 'error'); return; }
    const studentName = payment.studentName || payment.student_name || 'student';
    const amount = parseFloat(payment.amount) || 0;

    createModal('Approve Payment', `
      <div>
        <p style="margin-bottom:var(--space-3);">Approve bank deposit of <strong>&#x20A6;${amount.toLocaleString()}</strong> from <strong>${studentName}</strong>?</p>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--space-6);">This will mark the fee as <strong>PAID</strong>. Cannot be undone without voiding.</p>
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" id="dash-approve-btn">&#x2705; Approve Payment</button>
        </div>
      </div>
    `);
    setTimeout(() => {
      const btn = document.getElementById('dash-approve-btn');
      if (btn) btn.onclick = () => adminDashboardModule._confirmApprovePayment(paymentId);
    }, 0);
  },

  async _confirmApprovePayment(paymentId) {
    const btn = document.getElementById('dash-approve-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
    try {
      const { data: rpc, error: rpcErr } = await supabaseClient.rpc('verify_fee_payment', {
        p_payment_id:  paymentId,
        p_verified_by: this._getRecordedBy()
      });
      if (rpcErr || !rpc?.success) {
        const msg = rpc?.error || rpcErr?.message || 'Failed to approve payment.';
        showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
        if (btn) { btn.disabled = false; btn.textContent = '✅ Approve Payment'; }
        return;
      }
      document.querySelector('.modal-backdrop')?.remove();
      await Promise.all([dataManager.refresh('payments'), dataManager.refresh('students'), dataManager.refresh('feeItems')]);
      showToast('Payment verified and approved!', 'success');
      this.render();
    } catch (err) {
      console.error('Approve payment error:', err);
      showToast('Failed to approve: ' + (err.message || 'Unknown error'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Approve Payment'; }
    }
  },

  rejectPayment(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) { showToast('Payment not found', 'error'); return; }
    const studentName = payment.studentName || payment.student_name || 'student';

    createModal('Reject Payment', `
      <div>
        <p style="margin-bottom:var(--space-4);color:var(--text-secondary);">Reject bank deposit from <strong>${studentName}</strong>?</p>
        <div class="form-group">
          <label class="form-label">Rejection Reason <span style="color:var(--color-danger);">*</span></label>
          <textarea id="dash-reject-reason" class="form-input" rows="3" placeholder="e.g. Receipt not legible..." style="resize:vertical;"></textarea>
        </div>
        <div class="flex gap-3 mt-4">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn flex-1" id="dash-reject-btn" style="background:var(--color-danger);color:white;border:none;">&#x274C; Confirm Rejection</button>
        </div>
      </div>
    `);
    setTimeout(() => {
      const btn = document.getElementById('dash-reject-btn');
      if (btn) btn.onclick = () => adminDashboardModule._confirmRejectPayment(paymentId);
    }, 0);
  },

  async _confirmRejectPayment(paymentId) {
    const reasonEl = document.getElementById('dash-reject-reason');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) { reasonEl?.focus(); showToast('Please enter a rejection reason.', 'warning'); return; }
    const btn = document.getElementById('dash-reject-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }
    try {
      const { data: rpc, error: rpcErr } = await supabaseClient.rpc('reject_fee_payment', {
        p_payment_id:  paymentId,
        p_verified_by: this._getRecordedBy(),
        p_reason:      reason
      });
      if (rpcErr || !rpc?.success) {
        const msg = rpc?.error || rpcErr?.message || 'Failed to reject payment.';
        showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
        if (btn) { btn.disabled = false; btn.textContent = '❌ Confirm Rejection'; }
        return;
      }
      document.querySelector('.modal-backdrop')?.remove();
      await Promise.all([dataManager.refresh('payments'), dataManager.refresh('students')]);
      showToast('Payment rejected.', 'warning');
      this.render();
    } catch (err) {
      console.error('Reject payment error:', err);
      showToast('Failed to reject: ' + (err.message || 'Unknown error'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '❌ Confirm Rejection'; }
    }
  },

  // Action Methods
  async refreshData() {
    showToast('Refreshing data from server...', 'info');
    try {
      if (window.supabaseReady) {
        await dataManager.refreshAll();
      }
      this.render();
      showToast('Dashboard refreshed with latest data!', 'success');
    } catch (e) {
      console.error('Refresh failed:', e);
      showToast('Refresh failed. Using cached data.', 'warning');
      this.render();
    }
  },

  async exportMonthlyReportPack() {
    if (typeof XLSX === 'undefined') {
      showToast('Loading Excel library…', 'info');
      try { await window.loadLib('xlsx'); } catch {
        showToast('Failed to load Excel library. Check your connection.', 'error'); return;
      }
    }

    const students = dataManager?.getAll('students') || [];
    const staff = dataManager?.getAll('staff') || [];
    const payments = dataManager?.getAll('payments') || [];
    const applications = dataManager?.getAll('applications') || [];
    const stats = this.getFilteredStats();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString();

    const monthlyPayments = payments.filter((p) => {
      const created = p.paymentDate || p.payment_date || p.created_at || p.createdAt;
      return created && new Date(created).toISOString() >= monthStartIso;
    });

    const monthlyApplications = applications.filter((a) => {
      const created = a.created_at || a.createdAt;
      return created && new Date(created).toISOString() >= monthStartIso;
    });

    const summaryRows = [
      { metric: 'Report Generated At', value: new Date().toLocaleString() },
      { metric: 'Generated By', value: authManager?.getSession()?.fullName || 'Administrator' },
      { metric: 'Current Month', value: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }) },
      { metric: 'Total Students', value: stats.totalStudents },
      { metric: 'Total Staff', value: stats.totalStaff },
      { metric: 'Fees Collected', value: stats.paidFees },
      { metric: 'Pending Fees', value: stats.pendingFees },
      { metric: 'Pending Applications', value: stats.pendingApplications },
      { metric: 'Pending Bank Verifications', value: stats.pendingVerifications }
    ];

    const studentRows = students.map((s) => ({
      student_id: s.studentId || s.student_id || s.id || '',
      name: s.name || '',
      class: [s.grade, s.section].filter(Boolean).join(''),
      status: s.status || '',
      fees_status: s.fees || s.fee_status || '',
      guardian_name: s.guardianName || s.parentName || '',
      guardian_phone: s.guardianPhone || s.parentPhone || ''
    }));

    const staffRows = staff.map((m) => ({
      staff_id: m.staffId || m.staff_id || m.id || '',
      name: m.name || '',
      role: m.role || m.type || '',
      department: m.department || '',
      employment_status: m.status || '',
      phone: m.phone || ''
    }));

    const paymentRows = monthlyPayments.map((p) => ({
      payment_date: p.paymentDate || p.payment_date || p.created_at || '',
      student_name: p.studentName || p.student_name || '',
      fee_type: p.feeType || p.fee_type || '',
      amount: parseFloat(p.amount) || 0,
      method: p.paymentMethod || p.payment_method || '',
      status: p.status || '',
      transaction_ref: p.transactionRef || p.transaction_ref || ''
    }));

    const applicationRows = monthlyApplications.map((a) => ({
      submitted_at: a.created_at || a.createdAt || '',
      student_name: a.student_name || a.studentName || '',
      grade: a.grade || '',
      status: a.status || '',
      parent_email: a.parent_email || a.parentEmail || '',
      parent_phone: a.parent_phone || a.parentPhone || ''
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentRows), 'Students');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(staffRows), 'Staff');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), 'Payments_Month');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(applicationRows), 'Applications_Month');

    const fileDate = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `school_report_pack_${fileDate}.xlsx`);
    showToast('Monthly report pack exported successfully!', 'success');
  },

  viewExpensesDetails() {
    if (window.app) {
      window.app.loadModule('fees-payments');
    }
  },

  startAutoRefresh() {
    if (this.refreshManager) this.refreshManager.stop();
    const INTERVAL_MS = 60_000; // 60 seconds
    let timerId = setInterval(() => {
      if (window.supabaseReady && dataManager?.refreshAll) {
        dataManager.refreshAll().then(() => this.render()).catch(() => {});
      }
    }, INTERVAL_MS);
    this.refreshManager = { stop() { clearInterval(timerId); timerId = null; } };
  },

  initDateRangePicker() {
    const input = document.getElementById('dateRangePicker');
    if (!input || typeof flatpickr === 'undefined') return;

    this.dateRangePicker = flatpickr(input, {
      mode: 'range',
      dateFormat: 'Y-m-d',
      maxDate: 'today',
      locale: {
        rangeSeparator: ' to '
      },
      onChange: (selectedDates) => {
        if (selectedDates.length === 2) {
          this.dateRange = {
            start: selectedDates[0],
            end: selectedDates[1]
          };
          this.render();
        }
      },
      onClose: (selectedDates) => {
        // If user only selected one date, clear the filter
        if (selectedDates.length === 1) {
          this.dateRangePicker.clear();
          this.dateRange = null;
          this.render();
        }
      }
    });

    // Add clear button functionality
    const clearBtn = document.createElement('button');
    clearBtn.innerHTML = '✕';
    clearBtn.className = 'date-clear-btn';
    clearBtn.title = 'Clear date filter';
    clearBtn.style.cssText = `
      position: absolute;
      right: 40px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 1.2rem;
      padding: 0 8px;
      display: none;
    `;
    clearBtn.onclick = (e) => {
      e.stopPropagation();
      this.dateRangePicker.clear();
      this.dateRange = null;
      this.render();
    };

    // Show clear button when date is selected
    input.addEventListener('change', () => {
      clearBtn.style.display = input.value ? 'block' : 'none';
    });

    // Insert clear button
    const wrapper = input.parentElement;
    if (wrapper) {
      wrapper.style.position = 'relative';
      wrapper.appendChild(clearBtn);
    }
  },

  updateNotificationBadge() {
    const pending = (dataManager?.getAll('applications') || []).filter(a => a.status === 'pending').length
      + this.getPendingVerifications().length;
    const badges = document.querySelectorAll('[data-notification-badge]');
    badges.forEach(el => {
      el.textContent = pending > 0 ? pending : '';
      el.style.display = pending > 0 ? 'inline-flex' : 'none';
    });
  }
};

// Expose to window
window.adminDashboardModule = adminDashboardModule;
