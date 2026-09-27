// ============================================
// TODAY — the admin home page
// ============================================
// What needs someone's attention now, then how the term is going.
//
// Every figure comes from the DataManager caches or the calendar table.
// When a source has nothing in it the page says so plainly; it never draws
// a placeholder number. (The page this replaced plotted an enrolment trend
// made from Math.random() — nothing on this one is estimated.)
// ============================================

const adminDashboardModule = {
  async init(container) {
    this.container = container;
    this.settings = window.dashboardSettings?.load() || { autoRefresh: false };
    this.refreshManager = null;
    this.events = null; // null until the calendar has answered
    if (dataManager?.waitForReady) await dataManager.waitForReady();
    this.render();
    this.loadEvents();
    if (this.settings.autoRefresh) this.startAutoRefresh();

    this._onDataChange = (e) => {
      if (['students', 'staff', 'payments', 'inventory', 'feeItems', 'applications', 'classes'].includes(e.detail?.collection)) {
        this.render();
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    this.refreshManager?.stop();
    // Without this the listener outlived the page and redrew the dashboard
    // over whatever section the user had moved to when data changed.
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  /** True while this page is the one on screen. */
  _isActive() {
    return !window.app?.currentModule || window.app.currentModule === 'admin-dashboard';
  },

  // ── Helpers ───────────────────────────────────────────────

  esc(v) {
    return window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  money(n) {
    return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
  },

  plural(n, one, many) {
    return `${n} ${n === 1 ? one : (many || one + 's')}`;
  },

  /** Seconds since the epoch for any of the date spellings the tables use. */
  _ts(...values) {
    for (const v of values) {
      if (!v) continue;
      const t = new Date(v).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return 0;
  },

  timeAgo(ts) {
    if (!ts) return '';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  },

  /** The session and term everything on this page is measured against. */
  termScope() {
    const term = window.schoolConfig?.getCurrentTerm?.()?.name || '';
    const year = String(window.schoolConfig?.getCurrentAcademicYear?.() || '').replace('/', '-');
    return { term, year, yearLabel: year.replace('-', '/') };
  },

  _isActiveStudent(s) {
    return String(s?.status || 'active').toLowerCase() === 'active';
  },

  /** Any phone number the school could reach this pupil's family on. */
  _hasFamilyPhone(s) {
    const read = (p) => {
      if (!p) return '';
      if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch { return ''; }
      }
      return String(p?.phone || '').trim();
    };
    return Boolean(read(s.father) || read(s.mother) || read(s.guardian) || String(s.phone || '').trim());
  },

  /** Same rule as the sidebar badge and Payments to check: transfers and Paystack claims. */
  _isAwaitingVerification(p) {
    if (window.portalShell?.isAwaitingVerification) return window.portalShell.isAwaitingVerification(p);
    const m = String(p?.paymentMethod || p?.payment_method || '').toLowerCase();
    return p?.status === 'pending' && (m === 'bank-deposit' || m === 'paystack');
  },

  _levelOf(grade) {
    return window.schoolConfig?.getGradeByCode?.(grade)?.level || 'Other classes';
  },

  /** Whether the signed-in role may open a module (the rule the sidebar uses). */
  can(moduleName) {
    return window.app?.canOpen ? window.app.canOpen(moduleName) : true;
  },

  open(moduleName, options) {
    return window.app?.loadModule(moduleName, options);
  },

  /** Open Fees & payments, then one of its own dialogs (recordPayment, openAssignFeesModal). */
  async feesAction(method) {
    await this.open('fees-payments', { tab: 'overview' });
    window.feesPaymentsModule?.[method]?.();
  },

  // ── Figures ───────────────────────────────────────────────

  getStats() {
    const all = (c) => dataManager?.getAll(c) || [];
    const scope = this.termScope();
    const students = all('students');
    const active = students.filter(s => this._isActiveStudent(s));
    const staff = all('staff');
    const payments = all('payments');
    const applications = all('applications');
    const inventory = all('inventory');

    // This term's bills. Each fee item is one line of one pupil's bill, so
    // billed, collected and outstanding all come from the same rows and
    // cannot disagree with each other.
    const termItems = all('feeItems').filter(i =>
      String(i.term || '') === scope.term &&
      String(i.academic_year || i.academicYear || '').replace('/', '-') === scope.year
    );
    const paidOf = (i) => parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0;
    const billed = termItems.reduce((a, i) => a + (parseFloat(i.amount) || 0), 0);
    const collected = termItems.reduce((a, i) => a + paidOf(i), 0);

    const owing = new Map();
    for (const i of termItems) {
      const bal = Math.max(0, (parseFloat(i.amount) || 0) - paidOf(i));
      if (bal > 0) owing.set(i.student_id, (owing.get(i.student_id) || 0) + bal);
    }
    const outstanding = [...owing.values()].reduce((a, b) => a + b, 0);

    const byLevel = new Map();
    for (const i of termItems) {
      const level = this._levelOf(i.grade);
      const row = byLevel.get(level) || { level, billed: 0, collected: 0 };
      row.billed += parseFloat(i.amount) || 0;
      row.collected += paidOf(i);
      byLevel.set(level, row);
    }
    const levelOrder = ['Early Years', 'Primary', 'Junior Secondary'];
    const levels = [...byLevel.values()].sort((a, b) => {
      const ia = levelOrder.indexOf(a.level), ib = levelOrder.indexOf(b.level);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const billedIds = new Set(termItems.map(i => i.student_id));
    const unbilled = active.filter(s => !billedIds.has(s.id));

    const waiting = payments.filter(p => this._isAwaitingVerification(p));
    const pendingApps = applications.filter(a => a.status === 'pending');
    const noPhone = active.filter(s => !this._hasFamilyPhone(s));
    const lowStock = inventory.filter(i => {
      const min = Number(i.minStock ?? i.min_stock) || 0;
      if (min <= 0) return false;
      return (Number(i.quantity) || 0) - (Number(i.allocated) || 0) <= min;
    });

    const classKeys = new Set(active.map(s => `${s.grade || ''}|${s.section || ''}`).filter(k => k !== '|'));

    return {
      scope,
      totalStudents: active.length,
      totalStaff: staff.length,
      classCount: classKeys.size,
      termItems,
      billed,
      collected,
      outstanding,
      owingCount: owing.size,
      rate: billed > 0 ? Math.min(100, Math.round((collected / billed) * 100)) : 0,
      levels,
      unbilled,
      waiting,
      waitingTotal: waiting.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0),
      pendingApps,
      noPhone,
      lowStock,
      // Kept under the names the report pack export reads.
      paidFees: collected,
      pendingFees: outstanding,
      pendingApplications: pendingApps.length,
      pendingVerifications: waiting.length
    };
  },

  /** Work waiting on someone, most urgent first. Only rows with something in them. */
  attentionItems(st) {
    const items = [];
    const term = st.scope.term || 'this term';

    if (st.waiting.length) {
      const oldest = Math.min(...st.waiting.map(p => this._ts(p.paymentDate, p.payment_date, p.createdAt, p.created_at)).filter(Boolean));
      const bits = [`${this.money(st.waitingTotal)} in total`];
      if (Number.isFinite(oldest)) bits.push(`oldest sent ${this.timeAgo(oldest)}`);
      items.push({
        tone: 'urgent',
        title: `${this.plural(st.waiting.length, 'payment')} from parents waiting to be checked`,
        meta: bits.join(' · ') + '. They show as paid once you approve them.',
        action: 'Check now',
        run: "adminDashboardModule.open('payment-checks')",
        module: 'payment-checks'
      });
    }

    if (st.pendingApps.length) {
      const byGrade = {};
      st.pendingApps.forEach(a => { const g = a.grade || 'no class given'; byGrade[g] = (byGrade[g] || 0) + 1; });
      const meta = Object.entries(byGrade).map(([g, n]) => `${n} for ${g}`).join(', ');
      items.push({
        tone: 'warn',
        title: `${this.plural(st.pendingApps.length, 'admission application')} to review`,
        meta,
        action: 'Review',
        run: "adminDashboardModule.open('applications')",
        module: 'applications'
      });
    }

    if (st.totalStudents && !st.termItems.length) {
      items.push({
        tone: 'info',
        title: `No fees have been assigned for ${term} yet`,
        meta: 'Until they are, parents see no balance and nothing can be paid against this term.',
        action: 'Assign fees',
        run: "adminDashboardModule.feesAction('openAssignFeesModal')",
        module: 'fees-payments'
      });
    } else if (st.unbilled.length) {
      items.push({
        tone: 'info',
        title: `${this.plural(st.unbilled.length, 'student')} with no ${term} bill`,
        meta: st.unbilled.slice(0, 3).map(s => s.name).filter(Boolean).join(', ') + (st.unbilled.length > 3 ? ` and ${st.unbilled.length - 3} more` : ''),
        action: 'Assign fees',
        run: "adminDashboardModule.feesAction('openAssignFeesModal')",
        module: 'fees-payments'
      });
    }

    if (st.noPhone.length) {
      items.push({
        tone: 'quiet',
        title: `${this.plural(st.noPhone.length, 'student')} with no parent phone number`,
        meta: 'These families cannot be reached about fees or results.',
        action: 'Fix records',
        run: "adminDashboardModule.open('student-directory')",
        module: 'student-directory'
      });
    }

    if (st.lowStock.length) {
      items.push({
        tone: 'quiet',
        title: `${this.plural(st.lowStock.length, 'inventory item')} running low`,
        meta: st.lowStock.slice(0, 3).map(i => i.name).filter(Boolean).join(', ') + (st.lowStock.length > 3 ? ` and ${st.lowStock.length - 3} more` : ''),
        action: 'Restock',
        run: "adminDashboardModule.open('inventory')",
        module: 'inventory'
      });
    }

    // Offer only work this role can open; the module would refuse it anyway.
    return items.filter(i => this.can(i.module));
  },

  recentActivity() {
    const all = (c) => dataManager?.getAll(c) || [];
    const out = [];

    // Each feed only for a role that can open where it comes from.
    if (this.can('fees-payments')) all('payments')
      .filter(p => p.status === 'paid')
      .forEach(p => out.push({
        ts: this._ts(p.verifiedAt, p.verified_at, p.paymentDate, p.payment_date, p.createdAt, p.created_at),
        title: `${this.money(p.amount)} received for ${p.studentName || 'a student'}`,
        meta: p.receiptNo ? `Receipt ${p.receiptNo}` : 'Payment recorded'
      }));

    if (this.can('applications')) all('applications').forEach(a => out.push({
      ts: this._ts(a.created_at, a.createdAt, a.submitted_date),
      title: `Application for ${a.grade || 'a new pupil'}`,
      meta: a.student_name || a.studentName || ''
    }));

    if (this.can('student-directory')) all('students').forEach(s => out.push({
      ts: this._ts(s.createdAt, s.created_at),
      title: `${s.name || 'A student'} added`,
      meta: [s.grade, s.section].filter(Boolean).join(' ')
    }));

    return out.filter(e => e.ts).sort((a, b) => b.ts - a.ts).slice(0, 5);
  },

  // ── Calendar ──────────────────────────────────────────────

  async loadEvents() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const until = new Date(today);
    until.setDate(until.getDate() + 14);

    if (!window.supabaseClient) {
      this.events = [];
      this.renderEvents();
      return;
    }
    try {
      // Fetch from a month back so an event already under way still shows.
      const from = new Date(today);
      from.setDate(from.getDate() - 31);
      const { data, error } = await supabaseClient
        .from('calendar_events')
        .select('id, title, start_date, end_date, type')
        .gte('start_date', from.toISOString())
        .lte('start_date', until.toISOString())
        .order('start_date', { ascending: true });
      if (error) throw error;
      this.events = (data || [])
        .filter(e => this._ts(e.end_date, e.start_date) >= today.getTime())
        .slice(0, 5);
      this.eventsFailed = false;
    } catch (err) {
      console.warn('[Today] Calendar could not be read:', err);
      this.events = [];
      this.eventsFailed = true;
    }
    this.renderEvents();
  },

  eventsHTML() {
    if (this.events === null) return '<p class="ui-empty">Loading the calendar…</p>';
    if (!this.events.length) {
      return `<p class="ui-empty">${this.eventsFailed ? 'The calendar could not be loaded just now.' : 'Nothing on the calendar for the next two weeks.'}</p>`;
    }
    return this.events.map(e => {
      const start = new Date(e.start_date);
      const end = e.end_date ? new Date(e.end_date) : null;
      const multiDay = end && end.toDateString() !== start.toDateString();
      const meta = multiDay
        ? `Until ${end.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
        : start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      return `
        <div class="ui-row" style="border-top:0; padding:8px 0; align-items:flex-start;">
          <div class="ui-date" aria-hidden="true">
            <div class="ui-date-day">${start.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
            <div class="ui-date-num">${start.getDate()}</div>
          </div>
          <div class="ui-row-main" style="padding-top:4px;">
            <div class="ui-row-title" style="font-size:0.875rem;">${this.esc(e.title)}</div>
            <div class="ui-row-meta">${this.esc(meta)}</div>
          </div>
        </div>`;
    }).join('');
  },

  renderEvents() {
    const box = document.getElementById('today-events');
    if (box) box.innerHTML = this.eventsHTML();
  },

  // ── Page ──────────────────────────────────────────────────

  render() {
    if (!this.container || !this._isActive()) return;
    const st = this.getStats();
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = (window.authManager?.getSession?.()?.fullName || '').trim().split(/\s+/)[0] || '';
    const dateLine = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const termLine = [st.scope.yearLabel, st.scope.term].filter(Boolean).join(', ');
    const attention = this.attentionItems(st);
    const activity = this.recentActivity();

    // A figure is a link only when this role can open what it leads to.
    const kpi = (label, value, sub, run) => {
      const target = (run.match(/open\('([a-z-]+)'/) || [])[1];
      const inner = `
        <span class="ui-kpi-label">${label}</span>
        <span class="ui-kpi-value">${value}</span>
        <span class="ui-kpi-sub">${sub}</span>`;
      return target && this.can(target)
        ? `<button type="button" class="ui-card ui-kpi" onclick="${run}">${inner}</button>`
        : `<div class="ui-card ui-kpi" style="cursor:default;">${inner}</div>`;
    };

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">${greeting}${firstName ? ', ' + this.esc(firstName) : ''}</h1>
            <p class="ui-page-sub">${this.esc(dateLine)}${termLine ? ' · ' + this.esc(termLine) : ''}</p>
          </div>
          <div class="ui-actions">
            ${this.can('student-directory') ? `
              <button type="button" class="ui-btn" onclick="adminDashboardModule.exportMonthlyReportPack()">Monthly report</button>
              <button type="button" class="ui-btn" onclick="adminDashboardModule.open('student-directory')">Add student</button>` : ''}
            ${this.can('fees-payments') ? `
              <button type="button" class="ui-btn ui-btn-primary" onclick="adminDashboardModule.feesAction('recordPayment')">Record payment</button>` : ''}
          </div>
        </div>

        <div class="ui-grid-4">
          ${kpi('Students', st.totalStudents.toLocaleString('en-NG'),
                st.classCount ? `${this.plural(st.classCount, 'class', 'classes')} · ${this.plural(st.totalStaff, 'member')} of staff` : 'No classes yet',
                "adminDashboardModule.open('student-directory')")}
          ${kpi(`Collected${st.scope.term ? ' · ' + this.esc(st.scope.term) : ''}`, this.money(st.collected),
                st.billed ? `${st.rate}% of ${this.money(st.billed)} billed` : 'No bills for this term yet',
                "adminDashboardModule.open('fees-payments')")}
          ${kpi('Still owed', this.money(st.outstanding),
                st.owingCount ? `${this.plural(st.owingCount, 'student')} with a balance` : (st.billed ? 'Every bill is paid' : 'Nothing billed yet'),
                "adminDashboardModule.open('fees-payments', { tab: 'pending' })")}
          ${kpi('Payments to check', String(st.waiting.length),
                st.waiting.length ? `${this.money(st.waitingTotal)} sent by parents` : 'None waiting',
                "adminDashboardModule.open('payment-checks')")}
        </div>

        <div class="ui-grid-3">
          <section class="ui-card ui-span-2" aria-labelledby="today-attn" style="padding-bottom:8px;">
            <div class="ui-card-head">
              <h2 class="ui-card-title" id="today-attn">Needs your attention</h2>
              ${attention.length ? '<span class="ui-card-note">Most urgent first</span>' : ''}
            </div>
            ${attention.length ? attention.map(a => `
              <div class="ui-row">
                <span class="ui-dot is-${a.tone}" aria-hidden="true"></span>
                <div class="ui-row-main">
                  <div class="ui-row-title">${this.esc(a.title)}</div>
                  <div class="ui-row-meta">${this.esc(a.meta)}</div>
                </div>
                <button type="button" class="ui-btn ui-btn-sm" onclick="${a.run}">${this.esc(a.action)}</button>
              </div>`).join('')
            : '<p class="ui-empty">Nothing is waiting on you. New transfers, applications and gaps in records will show here.</p>'}
          </section>

          <section class="ui-card" aria-labelledby="today-week">
            <div class="ui-card-head">
              <h2 class="ui-card-title" id="today-week">Coming up</h2>
              <button type="button" class="ui-link" onclick="adminDashboardModule.open('calendar')">Calendar</button>
            </div>
            <div id="today-events">${this.eventsHTML()}</div>
          </section>
        </div>

        <div class="ui-grid-3">
          <section class="ui-card ui-span-2" aria-labelledby="today-coll">
            <div class="ui-card-head">
              <h2 class="ui-card-title" id="today-coll">${this.esc(st.scope.term || 'Term')} fee collection</h2>
              <button type="button" class="ui-link" onclick="adminDashboardModule.open('fees-payments', { tab: 'pending' })">Who still owes</button>
            </div>
            ${st.billed ? `
              <div style="display:flex; align-items:baseline; gap:10px; margin:6px 0 16px;">
                <span style="font-family:var(--font-display); font-size:1.625rem; font-weight:600;">${st.rate}%</span>
                <span class="ui-card-note">${this.money(st.collected)} collected of ${this.money(st.billed)} billed</span>
              </div>
              <div style="display:flex; flex-direction:column; gap:14px;">
                ${st.levels.map(l => {
                  const pct = l.billed ? Math.min(100, Math.round((l.collected / l.billed) * 100)) : 0;
                  return `
                  <div class="ui-bar-row">
                    <span style="font-weight:500;">${this.esc(l.level)}</span>
                    <div class="ui-bar" role="img" aria-label="${this.esc(l.level)}: ${pct}% collected"><span style="width:${pct}%"></span></div>
                    <span class="ui-bar-figure">${pct}% · ${this.money(l.collected)} of ${this.money(l.billed)}</span>
                  </div>`;
                }).join('')}
              </div>`
            : `<p class="ui-empty">No bills have been raised for ${this.esc(st.scope.term || 'this term')} yet, so there is nothing to measure. Once fees are assigned, collection by class level shows here.</p>
               <button type="button" class="ui-btn ui-btn-sm" onclick="adminDashboardModule.open('fees-payments')">Go to fees</button>`}
          </section>

          <section class="ui-card" aria-labelledby="today-act">
            <div class="ui-card-head">
              <h2 class="ui-card-title" id="today-act">Recent activity</h2>
            </div>
            ${activity.length ? activity.map((e, i) => `
              <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:10px 0;">
                <div class="ui-row-main">
                  <div class="ui-row-title" style="font-size:0.875rem; font-weight:500;">${this.esc(e.title)}</div>
                  <div class="ui-row-meta">${this.esc([e.meta, this.timeAgo(e.ts)].filter(Boolean).join(' · '))}</div>
                </div>
              </div>`).join('')
            : '<p class="ui-empty">Payments, applications and new students will show here as they happen.</p>'}
          </section>
        </div>
      </div>
    `;
  },

  async refreshData() {
    showToast('Refreshing…', 'info');
    try {
      if (window.supabaseReady) await dataManager.refreshAll();
      this.render();
      this.loadEvents();
    } catch (e) {
      console.error('Refresh failed:', e);
      showToast('Could not refresh. Showing the last data loaded.', 'warning');
      this.render();
    }
  },

  startAutoRefresh() {
    if (this.refreshManager) this.refreshManager.stop();
    const INTERVAL_MS = 60_000;
    let timerId = setInterval(() => {
      if (window.supabaseReady && dataManager?.refreshAll) {
        dataManager.refreshAll().then(() => this.render()).catch(() => {});
      }
    }, INTERVAL_MS);
    this.refreshManager = { stop() { clearInterval(timerId); timerId = null; } };
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
    const stats = this.getStats();

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
};

// Expose to window
window.adminDashboardModule = adminDashboardModule;
