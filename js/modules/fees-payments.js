// ============================================
// FEES & PAYMENTS
// ============================================
// One term at a time. Every figure for a term — billed, collected, still
// owed, the rate — comes from that term's fee lines (fee_items), so they
// always add up: billed = collected + still owed.
//
// "Collected" is what has been applied to the term's bills. Payments
// recorded against the term can differ from it, because the database
// applies each payment to a pupil's oldest unpaid lines first, whatever
// term it was recorded under, and applies nothing beyond what is owed. When
// the two differ the page says by how much and why.
//
// Money only enters through record_fee_payment and leaves through
// void_fee_payment (both in the database). Charges only enter as fee lines:
// billing a term (feeManager.billStudentForTerm) or adding a fee to many
// pupils. Nothing here edits a fee line; 0023 forbids it.
// ============================================

const feesPaymentsModule = {
  currentTab: 'overview',
  period: null,                               // { term, year } — set in init
  _owing: { q: '', cls: 'all', scope: 'term' },
  _pay: { q: '', status: 'all', term: 'all', page: 1 },
  _pageSize: 25,

  async init(container) {
    this.container = container;
    if (!this.period) this.period = this.currentPeriod();
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['payments', 'feeItems', 'students'].includes(e.detail?.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers ───────────────────────────────────────────────

  _esc(str) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(str)
      : String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  money(n) {
    return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
  },

  plural(n, one, many) {
    return `${n} ${n === 1 ? one : (many || one + 's')}`;
  },

  normYear(v) {
    return String(v || '').replace('/', '-');
  },

  currentPeriod() {
    return {
      term: schoolConfig.getCurrentTerm()?.name || 'First Term',
      year: this.normYear(schoolConfig.getCurrentAcademicYear())
    };
  },

  periodLabel(p = this.period) {
    return `${p.term} ${p.year.replace('-', '/')}`;
  },

  gradeRank(g) {
    const order = (schoolConfig.getAllGrades?.() || []).map(x => x.name);
    const i = order.indexOf(window.feeStructure?.normalizeGrade?.(g) || g);
    return i === -1 ? 99 : i;
  },

  /** Staff members' names for "recorded by"; the RPC falls back to the auth id. */
  _getRecordedBy() {
    const s = window.authManager?.getSession?.();
    return s?.fullName || s?.email || null;
  },

  _getBankDetails() {
    const b = window.feeStructure?.getBankDetails?.() || {};
    return {
      bankName: b.name || 'Keystone Bank',
      accountNo: b.accountNumber || '1013525760',
      accountName: b.accountName || window.schoolConfig?.name || 'TBD International Academy'
    };
  },

  // Kept for callers elsewhere (the pupil record reads these names).
  _isPendingVerification(p) {
    return window.portalShell?.isAwaitingVerification ? window.portalShell.isAwaitingVerification(p)
      : (p?.status === 'pending' && ['bank-deposit', 'paystack'].includes(String(p.paymentMethod || p.payment_method || '').toLowerCase()));
  },

  _isRejected(p) {
    return p && p.status === 'overdue' && (p.rejectionReason || p.rejection_reason);
  },

  /** A payment written by the old "bulk assign fee", which recorded a charge as money received. */
  _isFakeCharge(p) {
    return String(p?.paymentMethod || p?.payment_method || '') === 'bulk-assign';
  },

  generateReceiptNo() {
    const d = new Date();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `RCP${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}-${Date.now().toString(36).slice(-5).toUpperCase()}${rand}`;
  },

  async _refreshAndRender() {
    await Promise.all([dataManager.refresh('payments'), dataManager.refresh('students'), dataManager.refresh('feeItems')]);
    this.render();
    window.portalShell?.updateBadges?.();
  },

  // ── Figures ───────────────────────────────────────────────

  figures(period = this.period) {
    const paidOf = (i) => parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0;
    const students = dataManager.getAll('students') || [];
    const byId = new Map(students.map(s => [s.id, s]));
    const active = students.filter(s => String(s.status || 'active').toLowerCase() === 'active');
    const allItems = (dataManager.getAll('feeItems') || []).map(i => {
      const billed = parseFloat(i.amount) || 0, paid = paidOf(i);
      return { ...i, sid: i.student_id || i.studentId, billed, paid, balance: Math.max(0, billed - paid) };
    });
    const inPeriod = (i) => String(i.term || '') === period.term && this.normYear(i.academic_year || i.academicYear) === period.year;
    const items = allItems.filter(inPeriod);

    const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
    const billed = sum(items, 'billed'), collected = sum(items, 'paid'), owed = sum(items, 'balance');

    const perPupil = new Map();
    for (const i of items) {
      const r = perPupil.get(i.sid) || { billed: 0, paid: 0, balance: 0 };
      r.billed += i.billed; r.paid += i.paid; r.balance += i.balance;
      perPupil.set(i.sid, r);
    }
    const allBalance = new Map();
    for (const i of allItems) allBalance.set(i.sid, (allBalance.get(i.sid) || 0) + i.balance);

    // By class: the pupil's class now, else the class on the bill.
    const byClass = new Map();
    for (const [sid, r] of perPupil) {
      const s = byId.get(sid);
      const grade = s?.grade || items.find(i => i.sid === sid)?.grade || 'Unknown';
      const key = `${grade}|${s?.section || ''}`;
      const c = byClass.get(key) || { grade, section: s?.section || '', pupils: 0, billed: 0, paid: 0, balance: 0 };
      c.pupils++; c.billed += r.billed; c.paid += r.paid; c.balance += r.balance;
      byClass.set(key, c);
    }

    const payments = dataManager.getAll('payments') || [];
    const received = payments
      .filter(p => p.status === 'paid' && !this._isFakeCharge(p) && String(p.term || '') === period.term && this.normYear(p.academicYear || p.academic_year) === period.year)
      .reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

    return {
      items, perPupil, allBalance, byId, active,
      billed, collected, owed,
      rate: billed > 0 ? Math.min(100, Math.round((collected / billed) * 100)) : 0,
      notBilled: active.filter(s => !perPupil.has(s.id)),
      owingCount: [...perPupil.values()].filter(r => r.balance > 0).length,
      byClass: [...byClass.values()].sort((a, b) => this.gradeRank(a.grade) - this.gradeRank(b.grade) || String(a.section).localeCompare(String(b.section))),
      received,
      waiting: payments.filter(p => this._isPendingVerification(p)),
      fakeCharges: payments.filter(p => this._isFakeCharge(p) && p.status === 'paid')
    };
  },

  // ── Page ──────────────────────────────────────────────────

  setPeriod(field, value) {
    this.period = { ...this.period, [field]: value };
    this._pay.page = 1;
    this.render();
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  sessionOptions() {
    const years = new Set((dataManager.getAll('feeItems') || []).map(i => this.normYear(i.academic_year || i.academicYear)).filter(Boolean));
    const now = this.currentPeriod().year;
    const [a] = now.split('-').map(Number);
    [now, `${a - 1}-${a}`, `${a + 1}-${a + 2}`].forEach(y => years.add(y));
    return [...years].sort().reverse();
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'fees-payments') return;
    if (!this.period) this.period = this.currentPeriod();

    const f = this.figures();
    const canCheck = window.app?.canOpen ? window.app.canOpen('payment-checks') : true;
    const tabs = [['overview', 'Overview'], ['owing', 'Who still owes'], ['payments', 'Payments'], ['structure', 'Fee structure']];
    const kpi = (label, value, sub, tab) => `
      <button type="button" class="ui-card ui-kpi" onclick="feesPaymentsModule.switchTab('${tab}')">
        <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
      </button>`;
    const isNow = this.period.term === this.currentPeriod().term && this.period.year === this.currentPeriod().year;

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Fees &amp; payments</h1>
            <p class="ui-page-sub">${this._esc(this.periodLabel())}${isNow ? ' · this term' : ''}</p>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn" onclick="feesPaymentsModule.exportPayments()">Export payments</button>
            <button type="button" class="ui-btn" onclick="feesPaymentsModule.bulkAssignFee()">Add a fee to many pupils</button>
            <button type="button" class="ui-btn" onclick="feesPaymentsModule.openAssignFeesModal()">Bill pupils for a term</button>
            <button type="button" class="ui-btn ui-btn-primary" onclick="feesPaymentsModule.recordPayment()">Record payment</button>
          </div>
        </div>

        <div class="ui-card fp-period">
          <label>Term
            <select class="sd-select" onchange="feesPaymentsModule.setPeriod('term', this.value)">
              ${schoolConfig.getTermNames().map(t => `<option ${t === this.period.term ? 'selected' : ''}>${this._esc(t)}</option>`).join('')}
            </select>
          </label>
          <label>Session
            <select class="sd-select" onchange="feesPaymentsModule.setPeriod('year', this.value)">
              ${this.sessionOptions().map(y => `<option value="${y}" ${y === this.period.year ? 'selected' : ''}>${y.replace('-', '/')}</option>`).join('')}
            </select>
          </label>
          ${isNow ? '' : `<button type="button" class="ui-link" onclick="feesPaymentsModule.period = feesPaymentsModule.currentPeriod(); feesPaymentsModule.render()">Back to this term</button>`}
        </div>

        ${f.waiting.length ? `
          <div class="ui-card fp-waiting">
            <span class="ui-dot is-urgent" aria-hidden="true"></span>
            <div class="ui-row-main">
              <div class="ui-row-title">${this.plural(f.waiting.length, 'payment')} waiting to be checked</div>
              <div class="ui-row-meta">${this.money(f.waiting.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0))} in total. They count once approved.</div>
            </div>
            ${canCheck ? `<button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="window.app.loadModule('payment-checks')">Check now</button>` : ''}
          </div>` : ''}

        ${f.fakeCharges.length ? `
          <div class="ui-card fp-waiting">
            <span class="ui-dot is-warn" aria-hidden="true"></span>
            <div class="ui-row-main">
              <div class="ui-row-title">${this.plural(f.fakeCharges.length, 'charge')} recorded as money received</div>
              <div class="ui-row-meta">The old "bulk assign fee" saved ${this.money(f.fakeCharges.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0))} of charges as paid, which lowered balances. Void each one, then add the fee again with "Add a fee to many pupils".</div>
            </div>
            <button type="button" class="ui-btn ui-btn-sm" onclick="feesPaymentsModule._pay.status = 'fake'; feesPaymentsModule._pay.term = 'all'; feesPaymentsModule.switchTab('payments')">Show them</button>
          </div>` : ''}

        <div class="ui-grid-4">
          ${kpi('Billed', this.money(f.billed), `${f.active.length - f.notBilled.length} of ${this.plural(f.active.length, 'pupil')} billed`, 'owing')}
          ${kpi('Collected', this.money(f.collected), 'applied to this term\'s bills', 'payments')}
          ${kpi('Still owed', this.money(f.owed), `${this.plural(f.owingCount, 'pupil')} with a balance`, 'owing')}
          ${kpi('Collection rate', f.rate + '%', f.billed ? `${this.money(f.collected)} of ${this.money(f.billed)}` : 'Nothing billed yet', 'overview')}
        </div>

        ${Math.round(f.received) !== Math.round(f.collected) && (f.received || f.collected) ? `
          <p class="ui-card-note fp-recon">Payments recorded against ${this._esc(this.period.term)}: <strong>${this.money(f.received)}</strong>. Applied to its bills: <strong>${this.money(f.collected)}</strong>.
          They differ because a payment goes to a pupil's oldest unpaid bills first, whichever term it was recorded under, and nothing above what a pupil owes is applied.</p>` : ''}

        <div role="tablist" aria-label="Fees" class="sr-tabs">
          ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this.currentTab === id}" class="sr-tab${this.currentTab === id ? ' is-on' : ''}" onclick="feesPaymentsModule.switchTab('${id}')">${label}</button>`).join('')}
        </div>

        <div id="fees-tab-content">${this.renderTabContent(f)}</div>
      </div>`;
  },

  renderTabContent(f = this.figures()) {
    switch (this.currentTab) {
      case 'owing': return this.owingHTML(f);
      case 'payments': return this.paymentsHTML();
      case 'structure': return this.renderFeeStructureTab();
      default: return this.overviewHTML(f);
    }
  },

  // ── Overview ─────────────────────────────────────────────

  overviewHTML(f) {
    const months = [];
    const now = new Date();
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), total: 0 });
    }
    const payments = (dataManager.getAll('payments') || []).filter(p => p.status === 'paid' && !this._isFakeCharge(p));
    payments.forEach(p => {
      const when = String(p.verifiedAt || p.verified_at || p.paymentDate || p.payment_date || '').slice(0, 7);
      const m = months.find(x => x.key === when);
      if (m) m.total += parseFloat(p.amount) || 0;
    });
    const top = Math.max(1, ...months.map(m => m.total));
    const recent = [...(dataManager.getAll('payments') || [])]
      .filter(p => !this._isFakeCharge(p))
      .sort((a, b) => new Date(b.paymentDate || b.payment_date || b.createdAt || 0) - new Date(a.paymentDate || a.payment_date || a.createdAt || 0))
      .slice(0, 8);

    return `
      <div class="ui-grid-3">
        <section class="ui-card ui-span-2" aria-labelledby="fo-cls">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="fo-cls">By class · ${this._esc(this.periodLabel())}</h2>
          </div>
          ${f.byClass.length ? `
            <table class="pc-table sr-table fp-table">
              <thead><tr><th>Class</th><th>Pupils</th><th>Billed</th><th>Collected</th><th>Still owed</th><th>Rate</th></tr></thead>
              <tbody>${f.byClass.map(c => {
                const pct = c.billed ? Math.min(100, Math.round((c.paid / c.billed) * 100)) : 0;
                return `<tr>
                  <td>${this._esc([c.grade, c.section].filter(Boolean).join(' '))}</td>
                  <td>${c.pupils}</td><td>${this.money(c.billed)}</td><td>${this.money(c.paid)}</td>
                  <td class="${c.balance ? 'sr-owe' : ''}">${this.money(c.balance)}</td>
                  <td><span class="fp-rate"><span class="ui-bar"><span style="width:${pct}%"></span></span>${pct}%</span></td>
                </tr>`;
              }).join('')}</tbody>
              <tfoot><tr><td>All classes</td><td>${[...f.perPupil.keys()].length}</td><td>${this.money(f.billed)}</td><td>${this.money(f.collected)}</td><td>${this.money(f.owed)}</td><td>${f.rate}%</td></tr></tfoot>
            </table>`
          : `<p class="ui-empty">Nothing has been billed for ${this._esc(this.periodLabel())}. Use "Bill pupils for a term" to raise the term's bills from the fee structure.</p>`}
        </section>

        <section class="ui-card" aria-labelledby="fo-month">
          <div class="ui-card-head"><h2 class="ui-card-title" id="fo-month">Money approved by month</h2></div>
          <div class="fp-months" role="img" aria-label="Payments approved in the last six months">
            ${months.map(m => `
              <div class="fp-month">
                <span class="fp-month-amt">${m.total ? this.money(m.total).replace('₦', '₦ ') : '—'}</span>
                <span class="fp-month-bar"><span style="height:${Math.round((m.total / top) * 100)}%"></span></span>
                <span class="ui-row-meta">${m.label}</span>
              </div>`).join('')}
          </div>
        </section>
      </div>

      <section class="ui-card" aria-labelledby="fo-recent" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title" id="fo-recent">Latest payments</h2>
          <button type="button" class="ui-link" onclick="feesPaymentsModule.switchTab('payments')">All payments</button>
        </div>
        ${recent.length ? this.paymentRowsHTML(recent) : '<p class="ui-empty">No payments recorded yet.</p>'}
      </section>`;
  },

  // ── Who still owes ───────────────────────────────────────

  owingFilter(field, value) {
    this._owing[field] = value;
    const box = document.getElementById('fees-tab-content');
    if (box) box.innerHTML = this.owingHTML(this.figures());
    if (field === 'q') { const i = document.getElementById('fo-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  },

  owingHTML(f) {
    const o = this._owing;
    const q = o.q.trim().toLowerCase();
    const classes = [...new Set(f.active.map(s => s.grade).filter(Boolean))].sort((a, b) => this.gradeRank(a) - this.gradeRank(b));
    const rows = f.active
      .map(s => {
        const r = f.perPupil.get(s.id) || { billed: 0, paid: 0, balance: 0 };
        return { s, ...r, total: f.allBalance.get(s.id) || 0 };
      })
      .filter(x => (o.scope === 'all' ? x.total : x.balance) > 0)
      .filter(x => o.cls === 'all' || x.s.grade === o.cls)
      .filter(x => !q || String(x.s.name || '').toLowerCase().includes(q) || String(x.s.rollNo || '').toLowerCase().includes(q))
      .sort((a, b) => (o.scope === 'all' ? b.total - a.total : b.balance - a.balance));
    const sumCol = rows.reduce((a, x) => a + (o.scope === 'all' ? x.total : x.balance), 0);
    const notBilled = f.notBilled.filter(s => o.cls === 'all' || s.grade === o.cls);

    return `
      <div class="ui-card sd-filters">
        <label class="sd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
          <input id="fo-q" type="search" aria-label="Search pupils" placeholder="Search by name or admission number" value="${this._esc(o.q)}" oninput="feesPaymentsModule.owingFilter('q', this.value)">
        </label>
        <select class="sd-select" aria-label="Class" onchange="feesPaymentsModule.owingFilter('cls', this.value)">
          <option value="all">All classes</option>
          ${classes.map(c => `<option ${o.cls === c ? 'selected' : ''}>${this._esc(c)}</option>`).join('')}
        </select>
        <select class="sd-select" aria-label="Which balance" onchange="feesPaymentsModule.owingFilter('scope', this.value)">
          <option value="term" ${o.scope === 'term' ? 'selected' : ''}>Owed for ${this._esc(this.period.term)}</option>
          <option value="all" ${o.scope === 'all' ? 'selected' : ''}>Owed across all terms</option>
        </select>
      </div>

      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title">${this.plural(rows.length, 'pupil')} owing</h2>
          <span class="ui-card-note">${this.money(sumCol)} in total</span>
        </div>
        ${rows.length ? `
          <table class="pc-table sr-table fp-table fp-owing">
            <thead><tr><th>Pupil</th><th>Class</th>${o.scope === 'term' ? '<th>Billed</th><th>Paid</th>' : ''}<th>${o.scope === 'term' ? 'Still owed' : 'Owed, all terms'}</th><th class="fp-actions-h">Actions</th></tr></thead>
            <tbody>${rows.map(x => `<tr>
              <td><button type="button" class="ui-link" onclick="window.app.loadModule('student-record', { id: '${this._esc(x.s.id)}', tab: 'fees' })">${this._esc(x.s.name || 'Unnamed')}</button></td>
              <td>${this._esc([x.s.grade, x.s.section].filter(Boolean).join(' '))}</td>
              ${o.scope === 'term' ? `<td>${this.money(x.billed)}</td><td>${this.money(x.paid)}</td>` : ''}
              <td class="sr-owe">${this.money(o.scope === 'all' ? x.total : x.balance)}</td>
              <td class="fp-actions"><button type="button" class="ui-btn ui-btn-sm" onclick="feesPaymentsModule.recordPaymentForStudent('${this._esc(x.s.id)}')">Record payment</button></td>
            </tr>`).join('')}</tbody>
          </table>`
        : `<p class="ui-empty">${q || o.cls !== 'all' ? 'No pupil matches.' : `Nobody owes anything ${o.scope === 'term' ? 'for ' + this._esc(this.periodLabel()) : ''}.`}</p>`}
      </section>

      ${notBilled.length ? `
        <section class="ui-card" style="margin-top:16px;">
          <div class="ui-card-head">
            <h2 class="ui-card-title">${this.plural(notBilled.length, 'pupil')} not billed for ${this._esc(this.periodLabel())}</h2>
            <button type="button" class="ui-btn ui-btn-sm" onclick="feesPaymentsModule.openAssignFeesModal()">Bill them</button>
          </div>
          <p class="ui-row-meta" style="margin:0;">${this._esc(notBilled.slice(0, 12).map(s => `${s.name} (${[s.grade, s.section].filter(Boolean).join(' ')})`).join(', '))}${notBilled.length > 12 ? ` and ${notBilled.length - 12} more` : ''}.</p>
        </section>` : ''}`;
  },

  // ── Payments ─────────────────────────────────────────────

  payState(p) {
    if (this._isFakeCharge(p) && p.status === 'paid') return { key: 'fake', label: 'Charge, not a payment', tone: 'warn' };
    const s = window.pupilData?.paymentState?.(p) || { key: p.status, label: p.status, tone: '' };
    if (s.key === 'rejected') return { ...s, label: 'Rejected' };
    return s;
  },

  payFilter(field, value) {
    this._pay[field] = value;
    if (field !== 'page') this._pay.page = 1;
    const box = document.getElementById('fees-tab-content');
    if (box) box.innerHTML = this.paymentsHTML();
    if (field === 'q') { const i = document.getElementById('fp-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  },

  filteredPayments() {
    const f = this._pay;
    const q = f.q.trim().toLowerCase();
    return [...(dataManager.getAll('payments') || [])]
      .filter(p => f.status === 'all' || this.payState(p).key === f.status)
      .filter(p => f.term === 'all' || `${p.term || ''}|${this.normYear(p.academicYear || p.academic_year)}` === f.term)
      .filter(p => !q || [p.studentName, p.receiptNo, p.transactionRef, p.studentRollNo].some(v => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.paymentDate || b.payment_date || b.createdAt || 0) - new Date(a.paymentDate || a.payment_date || a.createdAt || 0));
  },

  paymentRowsHTML(list) {
    return `
      <table class="pc-table sr-table fp-table fp-clickable fp-list">
        <thead><tr><th>Date</th><th>Pupil</th><th>For</th><th>Receipt</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>${list.map(p => {
          const st = this.payState(p);
          return `<tr tabindex="0" role="button" aria-label="Open payment ${this._esc(p.receiptNo || '')}" onclick="feesPaymentsModule.viewPaymentDetails('${this._esc(p.id)}')" onkeydown="if(event.key==='Enter')feesPaymentsModule.viewPaymentDetails('${this._esc(p.id)}')">
            <td>${this._esc(String(p.paymentDate || p.payment_date || p.createdAt || '').slice(0, 10) || '—')}</td>
            <td>${this._esc(p.studentName || '—')}<div class="ui-row-meta">${this._esc([p.grade, p.section].filter(Boolean).join(' '))}</div></td>
            <td>${this._esc([p.feeType || p.fee_type, p.term].filter(Boolean).join(' · ') || '—')}</td>
            <td>${this._esc(p.receiptNo || '—')}</td>
            <td>${this.money(p.amount)}</td>
            <td><span class="ui-chip ${st.tone ? 'is-' + st.tone : ''}">${this._esc(st.label)}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  },

  paymentsHTML() {
    const f = this._pay;
    const list = this.filteredPayments();
    const pages = Math.max(1, Math.ceil(list.length / this._pageSize));
    const page = Math.min(f.page, pages);
    const shown = list.slice((page - 1) * this._pageSize, page * this._pageSize);
    const periods = [...new Set((dataManager.getAll('payments') || []).map(p => `${p.term || ''}|${this.normYear(p.academicYear || p.academic_year)}`))]
      .filter(k => k !== '|').sort().reverse();
    const total = list.filter(p => ['paid'].includes(this.payState(p).key)).reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

    return `
      <div class="ui-card sd-filters">
        <label class="sd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
          <input id="fp-q" type="search" aria-label="Search payments" placeholder="Search by pupil, receipt or reference" value="${this._esc(f.q)}" oninput="feesPaymentsModule.payFilter('q', this.value)">
        </label>
        <select class="sd-select" aria-label="Status" onchange="feesPaymentsModule.payFilter('status', this.value)">
          ${[['all', 'Every status'], ['paid', 'Paid'], ['checking', 'Being checked'], ['rejected', 'Rejected'], ['fake', 'Charges saved as payments']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select class="sd-select" aria-label="Term" onchange="feesPaymentsModule.payFilter('term', this.value)">
          <option value="all">Every term</option>
          ${periods.map(k => { const [t, y] = k.split('|'); return `<option value="${this._esc(k)}" ${f.term === k ? 'selected' : ''}>${this._esc(`${t} ${y.replace('-', '/')}`)}</option>`; }).join('')}
        </select>
      </div>

      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title">${this.plural(list.length, 'payment')}</h2>
          <span class="ui-card-note">${this.money(total)} paid among them</span>
        </div>
        ${shown.length ? this.paymentRowsHTML(shown) : '<p class="ui-empty">No payments match.</p>'}
        ${pages > 1 ? `
          <div class="fp-pager">
            <button type="button" class="ui-btn ui-btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="feesPaymentsModule.payFilter('page', ${page - 1})">Previous</button>
            <span class="ui-card-note">Page ${page} of ${pages}</span>
            <button type="button" class="ui-btn ui-btn-sm" ${page >= pages ? 'disabled' : ''} onclick="feesPaymentsModule.payFilter('page', ${page + 1})">Next</button>
          </div>` : ''}
      </section>`;
  },

  exportPayments() {
    const list = this.currentTab === 'payments' ? this.filteredPayments() : (dataManager.getAll('payments') || []);
    if (!list.length) { showToast('No payments to export.', 'warning'); return; }
    const headers = ['Receipt', 'Date', 'Pupil', 'Admission no.', 'Class', 'For', 'Term', 'Session', 'Amount', 'Method', 'Reference', 'Status', 'Checked by', 'Checked on'];
    const rows = list.map(p => [
      p.receiptNo, String(p.paymentDate || p.payment_date || '').slice(0, 10), p.studentName, p.studentRollNo,
      [p.grade, p.section].filter(Boolean).join(' '), p.feeType, p.term, this.normYear(p.academicYear || p.academic_year),
      parseFloat(p.amount) || 0, p.paymentMethod, p.transactionRef || '', this.payState(p).label,
      p.verifiedBy || '', String(p.verifiedAt || '').slice(0, 10)
    ]);
    // Cells starting with = + - @ are prefixed so a spreadsheet does not run them as formulas.
    const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const csv = [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `payments_${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast(`Exported ${this.plural(list.length, 'payment')}.`, 'success');
  },

  // ── Record a payment ─────────────────────────────────────

  recordPaymentForStudent(studentId) {
    this.recordPayment(studentId);
  },

  recordPayment(studentId = '') {
    const active = (dataManager.getAll('students') || []).filter(s => String(s.status || 'active').toLowerCase() === 'active')
      .sort((a, b) => this.gradeRank(a.grade) - this.gradeRank(b.grade) || String(a.name || '').localeCompare(String(b.name || '')));
    const fixed = studentId ? dataManager.getById('students', studentId) : null;
    const p = this.period || this.currentPeriod();
    const grades = [...new Set(active.map(s => s.grade))];
    const b = this._getBankDetails();

    const content = `
      <form id="rp-form" class="fp-form" onsubmit="feesPaymentsModule.submitRecordPayment(event)">
        ${fixed ? `
          <input type="hidden" name="studentId" value="${this._esc(fixed.id)}">
          <div class="fp-who"><strong>${this._esc(fixed.name)}</strong><span class="ui-row-meta">${this._esc([fixed.grade, fixed.section].filter(Boolean).join(' '))}${fixed.rollNo ? ' · ' + this._esc(fixed.rollNo) : ''}</span></div>`
        : `
          <label class="fam-input"><span>Pupil</span>
            <select name="studentId" required class="sd-select" onchange="feesPaymentsModule._rpRefresh(true)">
              <option value="">Choose a pupil</option>
              ${grades.map(g => `<optgroup label="${this._esc(g)}">${active.filter(s => s.grade === g).map(s => `<option value="${this._esc(s.id)}">${this._esc(s.name)} · ${this._esc([s.grade, s.section].filter(Boolean).join(' '))}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </label>`}

        <div class="fp-grid">
          <label class="fam-input"><span>Amount received (₦)</span>
            <input name="amount" inputmode="decimal" autocomplete="off" required oninput="feesPaymentsModule._rpRefresh(false)">
          </label>
          <label class="fam-input"><span>Date on the transfer</span>
            <input name="paymentDate" type="date" required value="${new Date().toISOString().slice(0, 10)}">
          </label>
          <label class="fam-input"><span>For term</span>
            <select name="term" class="sd-select" onchange="feesPaymentsModule._rpRefresh(true)">${schoolConfig.getTermNames().map(t => `<option ${t === p.term ? 'selected' : ''}>${this._esc(t)}</option>`).join('')}</select>
          </label>
          <label class="fam-input"><span>Session</span>
            <select name="academicYear" class="sd-select" onchange="feesPaymentsModule._rpRefresh(true)">${this.sessionOptions().map(y => `<option value="${y}" ${y === p.year ? 'selected' : ''}>${y.replace('-', '/')}</option>`).join('')}</select>
          </label>
        </div>

        <label class="fam-input"><span>Transaction reference or teller number</span>
          <input name="transactionRef" required autocomplete="off">
        </label>
        <label class="fam-upload" style="min-height:76px;">
          <input type="file" name="receipt" accept="image/*,application/pdf" required onchange="feesPaymentsModule._rpFile(this)">
          <span data-file>Attach the bank receipt or teller</span>
          <span class="ui-row-meta">Photo or PDF, up to 5 MB</span>
        </label>
        <label class="fam-input"><span>Note <span class="ui-row-meta">(optional)</span></span>
          <input name="notes" autocomplete="off">
        </label>

        <div id="rp-preview" aria-live="polite"></div>

        <p class="ui-row-meta" style="margin:0;">Paid to ${this._esc(b.bankName)} ${this._esc(b.accountNo)}. It waits in Payments to check until someone confirms it on the statement, then counts against the bill.</p>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary" id="rp-submit">Record payment</button>
        </div>
      </form>`;

    createModal(fixed ? `Record a payment · ${this._esc(fixed.name)}` : 'Record a payment', content);
    setTimeout(() => this._rpRefresh(true), 0);
  },

  /** Recompute what the pupil owes and how the typed amount will be applied. */
  _rpRefresh(resetAmount) {
    const form = document.getElementById('rp-form');
    const box = document.getElementById('rp-preview');
    if (!form || !box) return;
    const sid = form.studentId.value;
    if (!sid) { box.innerHTML = ''; return; }
    const term = form.term.value, year = form.academicYear.value;
    const owedTerm = (dataManager.getAll('feeItems') || [])
      .filter(i => (i.student_id || i.studentId) === sid && String(i.term || '') === term && this.normYear(i.academic_year || i.academicYear) === year)
      .reduce((a, i) => a + Math.max(0, (parseFloat(i.amount) || 0) - (parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0)), 0);
    const whole = pupilData.allocationPreview(sid, 0).owed;
    if (resetAmount) form.amount.value = owedTerm ? Math.round(owedTerm) : (whole ? Math.round(whole) : '');
    const amount = Number(String(form.amount.value).replace(/[^\d.]/g, '')) || 0;
    const a = pupilData.allocationPreview(sid, amount);

    // Money already sent and waiting to be checked is the likeliest double entry.
    const waiting = (dataManager.getAll('payments') || [])
      .filter(p => (p.studentId || p.student_id) === sid && this._isPendingVerification(p));

    box.innerHTML = `
      ${waiting.length ? `<p class="pc-note is-warn" style="margin:0 0 10px;">${waiting.map(p => `${this.money(p.amount)} sent ${this._esc(String(p.paymentDate || p.payment_date || '').slice(0, 10) || 'recently')}`).join(', ')} ${waiting.length === 1 ? 'is' : 'are'} already waiting to be checked for this pupil. If this is the same money, do not record it again.</p>` : ''}
      <div class="fp-owes">
        <div><span class="ui-row-meta">Owed for ${this._esc(term)}</span><strong>${this.money(owedTerm)}</strong></div>
        <div><span class="ui-row-meta">Owed, all terms</span><strong>${this.money(whole)}</strong></div>
      </div>
      ${amount > 0 && a.lines.length ? `
        <h3 class="pc-h3" style="margin:10px 0 2px;">Once approved, it will pay</h3>
        <table class="pc-table sr-table"><tbody>${a.lines.map(l => `<tr><td>${this._esc(l.name)}<span class="ui-row-meta"> · ${this._esc(l.term || 'no term')}</span></td><td>${this.money(l.amount)}${l.clears ? '' : ' <span class="ui-row-meta">(part)</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
      ${a.unapplied > 0 ? `<p class="pc-note is-warn" style="margin:8px 0 0;">${this.money(a.unapplied)} is more than this pupil owes and will not be applied to any bill.</p>` : ''}
      ${!whole && amount > 0 ? `<p class="pc-note is-warn" style="margin:8px 0 0;">This pupil has no unpaid bill, so the payment would be applied to nothing. Bill them for the term first.</p>` : ''}`;
  },

  _rpFile(input) {
    const box = input.closest('.fam-upload');
    box.classList.toggle('has-file', !!input.files.length);
    box.querySelector('[data-file]').textContent = input.files[0]?.name || 'Attach the bank receipt or teller';
  },

  async submitRecordPayment(e) {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('rp-submit');
    const student = dataManager.getById('students', form.studentId.value);
    const amount = Number(String(form.amount.value).replace(/[^\d.]/g, ''));
    const file = form.receipt.files?.[0];
    if (!student) { showToast('Choose a pupil.', 'warning'); return; }
    if (!amount || amount <= 0) { showToast('Enter the amount received.', 'warning'); form.amount.focus(); return; }
    if (amount > 999999999) { showToast('That amount is too large.', 'warning'); return; }
    if (!file) { showToast('Attach the bank receipt or teller.', 'warning'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('The receipt must be smaller than 5 MB.', 'warning'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Uploading receipt…'; }
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const up = await supabaseClient.storage.from('documents').upload(path, file, { cacheControl: '3600', upsert: false });
      if (up.error) throw new Error('The receipt could not be uploaded: ' + up.error.message);

      if (btn) btn.textContent = 'Recording…';
      const term = form.term.value;
      const { data: rpc, error } = await supabaseClient.rpc('record_fee_payment', {
        p_data: {
          student_id: student.id,
          student_name: student.name,
          student_roll_no: student.rollNo || student.roll_no || '',
          grade: student.grade || '',
          section: student.section || '',
          fee_type: pupilData.nextFeeTypeLabel(student.id, term),
          amount,
          payment_method: 'bank-deposit',
          payment_date: form.paymentDate.value,
          transaction_ref: form.transactionRef.value.trim(),
          notes: form.notes.value.trim() || null,
          receipt_no: this.generateReceiptNo(),
          receipt_url: path,
          term,
          academic_year: form.academicYear.value,
          recorded_by: this._getRecordedBy()
        }
      });
      if (error || !rpc?.success) throw new Error(String(rpc?.error || error?.message || 'The payment could not be recorded.').replace(/^[A-Z_]+:/, '').trim());

      document.querySelector('.modal-backdrop')?.remove();
      if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_RECORDED', student.name, `${this.money(amount)} transfer, waiting to be checked`);
      showToast(`Recorded ${this.money(amount)} for ${student.name}. It counts once checked.`, 'success');
      await this._refreshAndRender();
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Record payment'; }
    }
  },

  // ── Bill pupils for a term ───────────────────────────────

  openAssignFeesModal() {
    const p = this.period || this.currentPeriod();
    const content = `
      <form id="bill-form" class="fp-form" onsubmit="feesPaymentsModule.submitBillTerm(event)">
        <p class="ui-row-meta" style="margin:0;">Adds each enrolled pupil's term fees from the fee structure. A pupil who already has a line is not billed for it again, and nothing already billed or paid is changed, so it is safe to run more than once.</p>
        <div class="fp-grid">
          <label class="fam-input"><span>Term</span>
            <select name="term" class="sd-select" onchange="feesPaymentsModule._billPreview()">${schoolConfig.getTermNames().map(t => `<option ${t === p.term ? 'selected' : ''}>${this._esc(t)}</option>`).join('')}</select>
          </label>
          <label class="fam-input"><span>Session</span>
            <select name="academicYear" class="sd-select" onchange="feesPaymentsModule._billPreview()">${this.sessionOptions().map(y => `<option value="${y}" ${y === p.year ? 'selected' : ''}>${y.replace('-', '/')}</option>`).join('')}</select>
          </label>
        </div>
        <div id="bill-preview"></div>
        <div id="bill-progress" class="ui-bar" style="display:none;"><span style="width:0%"></span></div>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary" id="bill-submit">Bill pupils</button>
        </div>
      </form>`;
    createModal('Bill pupils for a term', content, 'large');
    setTimeout(() => this._billPreview(), 0);
  },

  /** Who would be billed, what for, and who already has the term's lines. */
  _billPlan(term, year) {
    const active = (dataManager.getAll('students') || []).filter(s => String(s.status || 'active').toLowerCase() === 'active');
    const lines = (dataManager.getAll('feeItems') || []).filter(i => String(i.term || '') === term && this.normYear(i.academic_year || i.academicYear) === year);
    const have = new Map();
    lines.forEach(i => { const sid = i.student_id || i.studentId; (have.get(sid) || have.set(sid, new Set()).get(sid)).add(String(i.item_id || i.item_name).toLowerCase()); });
    const byGrade = new Map();
    for (const s of active) {
      const items = window.feeStructure?.getFeeItems?.(s.grade) || [];
      const g = byGrade.get(s.grade) || { grade: s.grade, pupils: 0, perPupil: items.reduce((a, i) => a + i.amount, 0), noStructure: !items.length, toBill: 0, complete: 0, amount: 0 };
      g.pupils++;
      const got = have.get(s.id) || new Set();
      const missing = items.filter(i => !got.has(String(i.id).toLowerCase()) && !got.has(String(i.name).toLowerCase()));
      if (!items.length) { /* counted as no structure */ }
      else if (!missing.length) g.complete++;
      else { g.toBill++; g.amount += missing.reduce((a, i) => a + i.amount, 0); }
      byGrade.set(s.grade, g);
    }
    return { rows: [...byGrade.values()].sort((a, b) => this.gradeRank(a.grade) - this.gradeRank(b.grade)), active };
  },

  _billPreview() {
    const form = document.getElementById('bill-form');
    const box = document.getElementById('bill-preview');
    if (!form || !box) return;
    const plan = this._billPlan(form.term.value, form.academicYear.value);
    const toBill = plan.rows.reduce((a, r) => a + r.toBill, 0);
    const amount = plan.rows.reduce((a, r) => a + r.amount, 0);
    box.innerHTML = `
      <table class="pc-table sr-table fp-table">
        <thead><tr><th>Class</th><th>Pupils</th><th>Per pupil</th><th>Already billed</th><th>To bill</th><th>Amount to bill</th></tr></thead>
        <tbody>${plan.rows.map(r => `<tr>
          <td>${this._esc(r.grade || 'No class')}</td><td>${r.pupils}</td>
          <td>${r.noStructure ? '<span class="ui-chip is-warn">No fee structure</span>' : this.money(r.perPupil)}</td>
          <td>${r.complete}</td><td>${r.toBill}</td><td>${this.money(r.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>All classes</td><td>${plan.active.length}</td><td></td><td>${plan.rows.reduce((a, r) => a + r.complete, 0)}</td><td>${toBill}</td><td>${this.money(amount)}</td></tr></tfoot>
      </table>
      ${plan.rows.some(r => r.noStructure) ? '<p class="pc-note is-warn" style="margin:8px 0 0;">Classes with no fee structure are skipped. Add their fees under Fee structure first.</p>' : ''}`;
    const btn = document.getElementById('bill-submit');
    if (btn) { btn.disabled = !toBill; btn.textContent = toBill ? `Bill ${this.plural(toBill, 'pupil')} · ${this.money(amount)}` : 'Everyone is billed'; }
  },

  async submitBillTerm(e) {
    e.preventDefault();
    const form = e.target;
    const term = form.term.value, year = form.academicYear.value;
    const plan = this._billPlan(term, year);
    const bar = document.getElementById('bill-progress');
    const btn = document.getElementById('bill-submit');
    const pupils = plan.active.filter(s => (window.feeStructure?.getFeeItems?.(s.grade) || []).length);
    if (btn) { btn.disabled = true; btn.textContent = 'Billing…'; }
    if (bar) bar.style.display = 'block';

    let billed = 0, lines = 0; const failed = [];
    for (let k = 0; k < pupils.length; k++) {
      const s = pupils[k];
      const r = await feeManager.billStudentForTerm(s.id, s.grade, { term, academicYear: year, enrolment: 'returning' });
      if (!r.success) failed.push(s.name);
      else if (r.added) { billed++; lines += r.added; }
      if (bar) bar.firstElementChild.style.width = Math.round(((k + 1) / pupils.length) * 100) + '%';
    }
    document.querySelector('.modal-backdrop')?.remove();
    if (typeof writeAuditLog === 'function') writeAuditLog('FEES_BILLED', `${term} ${year}`, `${billed} pupils, ${lines} lines`);
    showToast(failed.length
      ? `Billed ${this.plural(billed, 'pupil')}. ${failed.length} could not be billed: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}.`
      : `Billed ${this.plural(billed, 'pupil')} for ${term}.`, failed.length ? 'warning' : 'success');
    this.period = { term, year };
    await this._refreshAndRender();
  },

  // ── Add a fee to many pupils ─────────────────────────────

  bulkAssignFee() {
    const p = this.period || this.currentPeriod();
    const active = (dataManager.getAll('students') || []).filter(s => String(s.status || 'active').toLowerCase() === 'active');
    const grades = [...new Set(active.map(s => s.grade).filter(Boolean))].sort((a, b) => this.gradeRank(a) - this.gradeRank(b));
    const content = `
      <form id="charge-form" class="fp-form" onsubmit="feesPaymentsModule.submitCharge(event)">
        <p class="ui-row-meta" style="margin:0;">Adds a charge to each pupil's bill for the term — an excursion, a lost book, a levy. It is owed, not paid: it shows as a balance until the family pays it.</p>
        <label class="fam-input"><span>Who</span>
          <select name="who" class="sd-select" onchange="feesPaymentsModule._chargePreview()">
            <option value="all">Every enrolled pupil</option>
            ${grades.map(g => `<option value="${this._esc(g)}">${this._esc(g)} (all sections)</option>`).join('')}
          </select>
        </label>
        <div class="fp-grid">
          <label class="fam-input"><span>What for</span><input name="name" required maxlength="80" placeholder="e.g. Excursion to Abuja" oninput="feesPaymentsModule._chargePreview()"></label>
          <label class="fam-input"><span>Amount per pupil (₦)</span><input name="amount" required inputmode="decimal" oninput="feesPaymentsModule._chargePreview()"></label>
          <label class="fam-input"><span>Term</span><select name="term" class="sd-select" onchange="feesPaymentsModule._chargePreview()">${schoolConfig.getTermNames().map(t => `<option ${t === p.term ? 'selected' : ''}>${this._esc(t)}</option>`).join('')}</select></label>
          <label class="fam-input"><span>Session</span><select name="academicYear" class="sd-select" onchange="feesPaymentsModule._chargePreview()">${this.sessionOptions().map(y => `<option value="${y}" ${y === p.year ? 'selected' : ''}>${y.replace('-', '/')}</option>`).join('')}</select></label>
        </div>
        <div id="charge-preview"></div>
        <div class="ui-actions" style="justify-content:flex-end;">
          <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
          <button type="submit" class="ui-btn ui-btn-primary" id="charge-submit" disabled>Add the charge</button>
        </div>
      </form>`;
    createModal('Add a fee to many pupils', content);
    setTimeout(() => this._chargePreview(), 0);
  },

  _chargePlan(form) {
    const name = form.name.value.trim();
    const amount = Number(String(form.amount.value).replace(/[^\d.]/g, '')) || 0;
    const term = form.term.value, year = form.academicYear.value;
    const active = (dataManager.getAll('students') || []).filter(s => String(s.status || 'active').toLowerCase() === 'active')
      .filter(s => form.who.value === 'all' || s.grade === form.who.value);
    const already = new Set((dataManager.getAll('feeItems') || [])
      .filter(i => String(i.term || '') === term && this.normYear(i.academic_year || i.academicYear) === year && String(i.item_name || '').trim().toLowerCase() === name.toLowerCase())
      .map(i => i.student_id || i.studentId));
    return { name, amount, term, year, pupils: active.filter(s => !already.has(s.id)), skipped: active.filter(s => already.has(s.id)).length };
  },

  _chargePreview() {
    const form = document.getElementById('charge-form');
    const box = document.getElementById('charge-preview');
    const btn = document.getElementById('charge-submit');
    if (!form || !box) return;
    const plan = this._chargePlan(form);
    const ok = plan.name && plan.amount > 0 && plan.pupils.length;
    box.innerHTML = plan.name && plan.amount > 0
      ? `<p class="pc-note ${plan.pupils.length ? '' : 'is-warn'}" style="margin:0;">${this.plural(plan.pupils.length, 'pupil')} × ${this.money(plan.amount)} = <strong>${this.money(plan.pupils.length * plan.amount)}</strong> added to ${this._esc(plan.term)} bills.${plan.skipped ? ` ${this.plural(plan.skipped, 'pupil')} already ${plan.skipped === 1 ? 'has' : 'have'} "${this._esc(plan.name)}" this term and ${plan.skipped === 1 ? 'is' : 'are'} skipped.` : ''}</p>`
      : '';
    if (btn) btn.disabled = !ok;
  },

  async submitCharge(e) {
    e.preventDefault();
    const plan = this._chargePlan(e.target);
    if (!plan.name || !(plan.amount > 0) || !plan.pupils.length) return;
    const btn = document.getElementById('charge-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    const slug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'charge';
    const rows = plan.pupils.map(s => ({
      student_id: s.id, academic_year: plan.year, term: plan.term,
      grade: window.feeStructure?.normalizeGrade?.(s.grade) || s.grade,
      item_id: 'extra_' + slug, item_name: plan.name, amount: plan.amount,
      item_type: 'once', status: 'pending', amount_paid: 0
    }));
    let added = 0, failure = null;
    for (let k = 0; k < rows.length; k += 200) {
      const { data, error } = await supabaseClient.from('fee_items').insert(rows.slice(k, k + 200)).select('id');
      if (error) { failure = error.message; break; }
      added += data?.length || 0;
    }
    document.querySelector('.modal-backdrop')?.remove();
    if (typeof writeAuditLog === 'function') writeAuditLog('FEE_CHARGED', plan.name, `${added} pupils × ${this.money(plan.amount)} · ${plan.term} ${plan.year}`);
    showToast(failure ? `Added to ${this.plural(added, 'pupil')}, then stopped: ${failure}` : `Added "${plan.name}" to ${this.plural(added, 'pupil')}'s bill.`, failure ? 'error' : 'success');
    await this._refreshAndRender();
  },

  // ── Fee structure ────────────────────────────────────────

  renderFeeStructureTab() {
    const fs = window.feeStructure;
    const grades = Object.keys(fs?.feeItems || {}).sort((a, b) => this.gradeRank(a) - this.gradeRank(b));
    const slug = (g) => g.replace(/[^a-z0-9]/gi, '-');
    if (!grades.length) {
      return `<section class="ui-card"><p class="ui-empty">No fee structure yet. Add a class to start.</p><button type="button" class="ui-btn ui-btn-sm" onclick="feesPaymentsModule.promptAddGrade()">Add a class</button></section>`;
    }
    return `
      <div class="ui-card fp-structure-head">
        <p class="ui-row-meta" style="margin:0;">What each class is billed per term (session ${this._esc(String(fs.academicYear || '').replace('-', '/'))}). Changes apply to bills raised after you save; bills already raised keep their amounts.</p>
        <div class="ui-actions">
          <button type="button" class="ui-btn ui-btn-sm" onclick="feesPaymentsModule.resetFeeStructureToDefaults()">Reset to the school's sheet</button>
          <button type="button" class="ui-btn ui-btn-sm" onclick="feesPaymentsModule.promptAddGrade()">Add a class</button>
          <button type="button" class="ui-btn ui-btn-sm ui-btn-primary" onclick="feesPaymentsModule.saveFeeStructure()">Save fee structure</button>
        </div>
      </div>
      <div class="fp-structure">
        ${grades.map(g => {
          const items = fs.feeItems[g] || [];
          const total = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
          const intake = (fs.newIntakeItems?.[g] || []).reduce((a, i) => a + i.amount, 0);
          return `
          <section class="ui-card" id="feecard-${slug(g)}">
            <div class="ui-card-head">
              <h2 class="ui-card-title">${this._esc(g)}</h2>
              <span class="ui-card-note"><strong id="fs-total-${slug(g)}">${this.money(total)}</strong> per term</span>
            </div>
            ${intake ? `<p class="ui-row-meta" style="margin:0 0 8px;">New pupils also pay a one-off ${this.money(intake)} uniform set in their first term.</p>` : ''}
            ${items.map((it, idx) => `
              <div class="fp-fee-row">
                <input class="fp-in" aria-label="Item name" value="${this._esc(it.name)}" data-grade="${this._esc(g)}" data-idx="${idx}" data-field="name" onchange="feesPaymentsModule._feeStructureFieldChange(this)">
                <span class="fp-naira">₦</span>
                <input class="fp-in fp-amt" aria-label="Amount per term" inputmode="numeric" value="${Number(it.amount) || 0}" data-grade="${this._esc(g)}" data-idx="${idx}" data-field="amount" onchange="feesPaymentsModule._feeStructureFieldChange(this)">
                <button type="button" class="ui-btn ui-btn-sm pc-icon pc-danger" aria-label="Remove ${this._esc(it.name)}" onclick="feesPaymentsModule.removeFeeItem(this.dataset.grade, ${idx})" data-grade="${this._esc(g)}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>`).join('') || '<p class="ui-empty">No items. Pupils in this class cannot be billed until one is added.</p>'}
            <div class="ui-actions" style="margin-top:10px;">
              <button type="button" class="ui-link" data-grade="${this._esc(g)}" onclick="feesPaymentsModule.addFeeItem(this.dataset.grade)">Add an item</button>
              <button type="button" class="ui-link pc-danger" style="margin-left:auto;" data-grade="${this._esc(g)}" onclick="feesPaymentsModule.deleteGrade(this.dataset.grade)">Remove class</button>
            </div>
          </section>`;
        }).join('')}
      </div>`;
  },

  _feeStructureFieldChange(el) {
    const grade = el.dataset.grade;
    const idx = parseInt(el.dataset.idx, 10);
    const field = el.dataset.field;
    const list = window.feeStructure?.feeItems?.[grade];
    if (!list?.[idx]) return;
    if (field === 'amount') {
      const n = Number(String(el.value).replace(/[^\d.]/g, ''));
      if (!Number.isFinite(n) || n < 0) { showToast('Amounts must be a number of naira.', 'warning'); el.value = list[idx].amount; return; }
      list[idx].amount = n;
      el.value = n;
    } else {
      list[idx].name = el.value.trim() || list[idx].name;
    }
    const total = list.reduce((a, i) => a + (Number(i.amount) || 0), 0);
    const t = document.getElementById(`fs-total-${grade.replace(/[^a-z0-9]/gi, '-')}`);
    if (t) t.textContent = this.money(total);
  },

  // ── Fee structure edits (unchanged behaviour) ─────────────

  addFeeItem(grade) {
    if (!window.feeStructure?.feeItems) return;
    if (!window.feeStructure.feeItems[grade]) window.feeStructure.feeItems[grade] = [];
    window.feeStructure.feeItems[grade].push({
      id:   'item_' + Date.now(),
      name: 'New Item',
      amount: 0,
      type: 'once',
      required: false
    });
    // Re-render just the fee structure tab
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
  },

  removeFeeItem(grade, idx) {
    if (!window.feeStructure?.feeItems?.[grade]) return;
    window.feeStructure.feeItems[grade].splice(idx, 1);
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
  },

  deleteGrade(grade) {
    if (!window.feeStructure?.feeItems?.[grade]) return;
    const safeGrade = this._esc(grade);
    createModal('Delete Grade Fee Structure', `
      <div>
        <p style="margin-bottom:var(--space-3);">Delete the entire fee structure for <strong>${safeGrade}</strong>?</p>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--space-6);">Students in this grade will no longer have fee items auto-assigned until a structure is re-created.</p>
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-danger flex-1" id="confirm-delete-grade-btn">🗑️ Delete Grade</button>
        </div>
      </div>
    `);
    // Attach handler after modal is in DOM
    setTimeout(() => {
      const btn = document.getElementById('confirm-delete-grade-btn');
      if (btn) btn.onclick = () => feesPaymentsModule._confirmDeleteGrade(grade);
    }, 0);
  },

  _confirmDeleteGrade(grade) {
    document.querySelector('.modal-backdrop')?.remove();
    delete window.feeStructure.feeItems[grade];
    if (window.feeStructure.gradeAliases?.[grade]) delete window.feeStructure.gradeAliases[grade];
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
    showToast('Grade "' + grade + '" removed. Click Save to persist.', 'warning');
  },

  addGrade(gradeName) {
    if (!gradeName || !window.feeStructure?.feeItems) return;
    const name = gradeName.trim();
    if (!name) return;
    if (window.feeStructure.feeItems[name]) { showToast('Grade already exists', 'warning'); return; }
    window.feeStructure.feeItems[name] = [];
    const contentDiv = document.getElementById('fees-tab-content');
    if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
    showToast(`Grade "${name}" added. Add fee items then Save.`, 'success');
  },

  promptAddGrade() {
    createModal('Add New Grade', `
      <div>
        <div class="form-group">
          <label class="form-label">Grade Name <span style="color:var(--color-danger);">*</span></label>
          <input type="text" id="new-grade-name-input" class="form-input"
            placeholder="e.g. JSS 4, Primary 6, Senior Secondary 1"
            maxlength="50">
        </div>
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-2);">
          Add fee items to this grade after saving, then click <strong>Save Fee Structure</strong>.
        </p>
        <div class="flex gap-3 mt-4">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="feesPaymentsModule._confirmAddGrade()">+ Add Grade</button>
        </div>
      </div>
    `);
    setTimeout(() => document.getElementById('new-grade-name-input')?.focus(), 50);
  },

  _confirmAddGrade() {
    const input = document.getElementById('new-grade-name-input');
    const name = input ? input.value.trim() : '';
    if (!name) { input?.focus(); showToast('Please enter a grade name.', 'warning'); return; }
    document.querySelector('.modal-backdrop')?.remove();
    this.addGrade(name);
  },

  async saveFeeStructure() {
    if (!window.feeStructure) { showToast('Fee structure not loaded', 'error'); return; }
    if (!window.supabaseClient) { showToast('Not connected to database', 'error'); return; }

    try {
      // Read existing settings row
      const { data: row } = await supabaseClient.from('school_settings').select('id, settings_json').limit(1).single();
      let existing = {};
      if (row?.settings_json) {
        existing = typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) : row.settings_json;
      }

      // Embed updated feeItems into settings_json
      existing.feeStructure = {
        academicYear: window.feeStructure.academicYear,
        feeItems: window.feeStructure.feeItems
      };

      if (row) {
        const { error } = await supabaseClient.from('school_settings')
          .update({ settings_json: existing, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('school_settings')
          .insert({ settings_json: existing });
        if (error) throw error;
      }

      showToast('Fee structure saved successfully!', 'success');
    } catch (err) {
      console.error('[FeesModule] saveFeeStructure error:', err);
      showToast('Failed to save fee structure: ' + err.message, 'error');
    }
  },

  resetFeeStructureToDefaults() {
    createModal('Reset Fee Structure', `
      <div>
        <p style="margin-bottom:var(--space-3);">Reset all fee items to the built-in defaults?</p>
        <p style="font-size:0.85rem;color:var(--color-warning);font-weight:600;margin-bottom:var(--space-6);">⚠️ Any unsaved edits will be lost.</p>
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" id="confirm-reset-btn">↺ Reset to Defaults</button>
        </div>
      </div>
    `);
    setTimeout(() => {
      const btn = document.getElementById('confirm-reset-btn');
      if (btn) btn.onclick = () => {
        document.querySelector('.modal-backdrop')?.remove();
        if (window.feeStructure?._builtInFeeItems) {
          window.feeStructure.feeItems = JSON.parse(JSON.stringify(window.feeStructure._builtInFeeItems));
          const contentDiv = document.getElementById('fees-tab-content');
          if (contentDiv) contentDiv.innerHTML = this.renderFeeStructureTab();
          showToast('Fee structure reset to built-in defaults. Click Save to persist.', 'info');
        } else {
          location.reload();
        }
      };
    }, 0);
  },


  // ── One payment: details, approve, reject, void, receipt ──

  viewPaymentDetails(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) return;

    const isPending  = this._isPendingVerification(payment);
    const isRejected = this._isRejected(payment);

    // Escape all DB-sourced strings before injecting into HTML
    const safeReceiptNo   = this._esc(payment.receiptNo   || '');
    const safeStudentName = this._esc(payment.studentName || '');
    const safeRollNo      = this._esc(payment.studentRollNo || '—');
    const safeGrade       = this._esc(payment.grade   || '');
    const safeSection     = this._esc(payment.section || '');
    const safeFeeType     = this._esc(payment.feeType || '');
    const safeMethod      = this._esc((payment.paymentMethod || '').replace(/-/g, ' '));
    const safeTxRef       = this._esc(payment.transactionRef || '');
    const safeNotes       = this._esc(payment.notes || '');
    const safeVerifiedBy  = this._esc(payment.verifiedBy || '');
    const safeRejReason   = this._esc(payment.rejectionReason || payment.rejection_reason || 'No reason provided');

    const statusBadge = isPending
      ? '<span class="badge badge-warning" style="font-size: var(--font-size-sm);">⏳ Pending Verification</span>'
      : payment.status === 'paid'
        ? '<span class="badge badge-success" style="font-size: var(--font-size-sm);">✅ Verified & Paid</span>'
        : isRejected
          ? '<span class="badge badge-danger" style="font-size: var(--font-size-sm);">❌ Rejected</span>'
          : `<span class="badge badge-info" style="font-size: var(--font-size-sm);">${this._esc(payment.status || '')}</span>`;

    const receiptSection = payment.receiptUrl ? `
        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">📎 Uploaded Receipt</h4>
          </div>
          <div class="card-body" style="text-align: center;">
            ${payment.receiptUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)
              ? `<img data-storage-src="${this._esc(payment.receiptUrl)}" alt="Payment Receipt" style="max-width: 100%; max-height: 400px; border-radius: var(--radius-md); border: 1px solid var(--border-primary);">`
              : `<a href="${this._esc(payment.receiptUrl)}" data-storage-link target="_blank" rel="noopener noreferrer" class="btn btn-secondary">📄 View Receipt Document</a>`
            }
          </div>
        </div>
    ` : '';

    const verificationSection = payment.verifiedBy ? `
        <div class="card mb-4" style="border-left: 4px solid var(--color-success);">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); color: var(--text-secondary);">
              Verified by <strong>${safeVerifiedBy}</strong> on ${formatDate(payment.verifiedAt)}
            </p>
          </div>
        </div>
    ` : '';

    const rejectionSection = isRejected ? `
        <div class="card mb-4" style="border-left: 4px solid var(--color-danger);">
          <div class="card-body">
            <p style="font-size: var(--font-size-sm); font-weight: 600; color: var(--color-danger); margin-bottom: var(--space-2);">❌ Rejection Reason:</p>
            <p style="font-size: var(--font-size-sm); color: var(--text-secondary); font-style: italic;">${safeRejReason}</p>
          </div>
        </div>
    ` : '';

    const verifyButtons = isPending ? `
        <div class="flex gap-3 mb-4" style="padding: var(--space-4); background: var(--color-warning-bg); border-radius: var(--radius-md);">
          <button class="btn btn-primary flex-1" onclick="feesPaymentsModule.verifyPayment('${payment.id}')">
            ✅ Approve Payment
          </button>
          <button class="btn btn-ghost flex-1" style="color: var(--color-danger); border-color: var(--color-danger);" onclick="feesPaymentsModule.rejectPayment('${payment.id}')">
            ❌ Reject Payment
          </button>
        </div>
    ` : '';

    const content = `
      <div style="max-height: 70vh; overflow-y: auto;">
        <div class="mb-6" style="text-align: center; padding: var(--space-6); background: var(--bg-secondary); border-radius: var(--radius-md);">
          <h3 style="font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-2);">
            Receipt #${safeReceiptNo}
          </h3>
          <p style="color: var(--text-secondary); margin-bottom: var(--space-2);">${formatDate(payment.paymentDate)}</p>
          ${statusBadge}
        </div>

        ${verifyButtons}

        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">Student Information</h4>
          </div>
          <div class="card-body">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Name</p>
                <p style="font-weight: var(--font-weight-semibold);">${safeStudentName}</p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Roll Number</p>
                <p style="font-weight: var(--font-weight-semibold);">${safeRollNo}</p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Grade</p>
                <p style="font-weight: var(--font-weight-semibold);">${safeGrade}</p>
              </div>
              <div>
                <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin-bottom: var(--space-1);">Section</p>
                <p style="font-weight: var(--font-weight-semibold);">${safeSection}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div class="card-header">
            <h4 class="card-title">Payment Details</h4>
          </div>
          <div class="card-body">
            <div class="space-y-3">
              <div class="flex justify-between">
                <span style="color: var(--text-secondary);">Fee Type</span>
                <span style="font-weight: var(--font-weight-semibold);">${safeFeeType}</span>
              </div>
              <div class="flex justify-between">
                <span style="color: var(--text-secondary);">Amount</span>
                <span style="font-weight: var(--font-weight-bold); color: var(--color-success); font-size: var(--font-size-xl);">
                  ${formatCurrency(parseFloat(payment.amount) || 0)}
                </span>
              </div>
              <div class="flex justify-between">
                <span style="color: var(--text-secondary);">Payment Method</span>
                <span style="font-weight: var(--font-weight-semibold); text-transform: capitalize;">
                  ${safeMethod}
                </span>
              </div>
              ${payment.transactionRef ? `
                <div class="flex justify-between">
                  <span style="color: var(--text-secondary);">Transaction Reference</span>
                  <span style="font-family: monospace; font-weight: var(--font-weight-semibold);">${safeTxRef}</span>
                </div>
              ` : ''}
              ${payment.notes ? `
                <div>
                  <p style="color: var(--text-secondary); margin-bottom: var(--space-1);">Notes</p>
                  <p style="font-style: italic;">${safeNotes}</p>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        ${receiptSection}
        ${verificationSection}
        ${rejectionSection}

        <div class="flex gap-3">
          ${payment.status === 'paid' ? `
            <button class="btn btn-primary flex-1" onclick="feesPaymentsModule.generateReceipt('${payment.id}')">
              🧾 Generate PDF Receipt
            </button>
          ` : ''}
          <button class="btn btn-ghost flex-1" style="color: var(--color-danger); border-color: var(--color-danger);" onclick="feesPaymentsModule.voidPayment('${payment.id}')">
            🗑️ Void Payment
          </button>
          <button class="btn btn-secondary flex-1" onclick="closeModal(this)">
            Close
          </button>
        </div>
      </div>
    `;

    createModal('Payment Details', content, 'large');
  },

  async verifyPayment(paymentId) {
    let payment = dataManager.getById('payments', paymentId);
    if (!payment) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).single();
      payment = data;
    }
    if (!payment) { showToast('Payment record not found', 'error'); return; }
    const studentName = payment.studentName || payment.student_name || 'Unknown';
    const amount = parseFloat(payment.amount) || 0;
    createModal('Approve Payment', `
      <div>
        <p style="margin-bottom:var(--space-3);">
          Approve bank deposit of <strong>${formatCurrency(amount)}</strong> from <strong>${this._esc(studentName)}</strong>?
        </p>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:var(--space-6);">
          This will mark the fee as <strong>PAID</strong>. Cannot be undone without voiding the payment.
        </p>
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" id="confirm-verify-btn"
            onclick="feesPaymentsModule._confirmVerifyPayment('${paymentId}')">&#x2705; Approve Payment</button>
        </div>
      </div>
    `);
  },

  async _confirmVerifyPayment(paymentId) {
    const btn = document.getElementById('confirm-verify-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }

    let payment = dataManager.getById('payments', paymentId);
    if (!payment) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).single();
      payment = data;
    }
    const studentName = payment?.studentName || payment?.student_name || 'Unknown';
    const amount = parseFloat(payment?.amount) || 0;

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
    showToast('Payment verified and approved!', 'success');
    if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_VERIFIED', studentName, `₦${amount.toLocaleString()} approved`);
    await this._refreshAndRender();
  },

    async rejectPayment(paymentId) {
    let payment = dataManager.getById('payments', paymentId);
    if (!payment) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).single();
      payment = data;
    }
    if (!payment) { showToast('Payment record not found', 'error'); return; }
    const studentName = payment.studentName || payment.student_name || 'Unknown';

    createModal('Reject Payment', `
      <div>
        <p style="margin-bottom: var(--space-4); color: var(--text-secondary);">
          You are about to reject the bank deposit from <strong>${this._esc(studentName)}</strong>
          (${formatCurrency(parseFloat(payment.amount) || 0)}).
        </p>
        <div class="form-group">
          <label class="form-label">Rejection Reason <span style="color:var(--color-danger);">*</span></label>
          <textarea id="rejection-reason-input" class="form-input" rows="3"
            placeholder="e.g. Receipt not legible, incorrect account number..."
            style="resize: vertical;"></textarea>
        </div>
        <div class="flex gap-3 mt-4">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn flex-1" id="confirm-reject-btn"
            style="background: var(--color-danger); color: white; border: none;"
            onclick="feesPaymentsModule._confirmRejectPayment('${paymentId}')">
            ❌ Confirm Rejection
          </button>
        </div>
      </div>
    `);
  },

  async _confirmRejectPayment(paymentId) {
    const reasonEl = document.getElementById('rejection-reason-input');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) {
      reasonEl?.focus();
      showToast('Please enter a rejection reason.', 'warning');
      return;
    }
    const btn = document.getElementById('confirm-reject-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }

    let payment = dataManager.getById('payments', paymentId);
    if (!payment) {
      const { data } = await supabaseClient.from('fees_payments').select('*').eq('id', paymentId).single();
      payment = data;
    }
    const studentName = payment?.studentName || payment?.student_name || 'Unknown';

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
    showToast('Payment rejected. Student will be notified.', 'warning');
    if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_REJECTED', studentName, reason);
    await this._refreshAndRender();
  },

  async voidPayment(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) return;

    createModal('Void Payment', `
      <div>
        <p style="margin-bottom:var(--space-2);">
          Are you sure you want to void payment <strong>#${this._esc(payment.receiptNo)}</strong>?
        </p>
        <div style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
          <p style="margin:0 0 4px;font-size:0.85rem;"><strong>Amount:</strong> ${formatCurrency(parseFloat(payment.amount) || 0)}</p>
          <p style="margin:0;font-size:0.85rem;"><strong>Student:</strong> ${this._esc(payment.studentName || '')}</p>
        </div>
        <p style="font-size:0.82rem;color:var(--color-danger);font-weight:600;margin-bottom:var(--space-6);">⚠️ This action cannot be undone.</p>
        <div class="flex gap-3">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn flex-1" id="confirm-void-btn"
            style="background:var(--color-danger);color:white;border:none;"
            onclick="feesPaymentsModule._confirmVoidPayment('${paymentId}')">🗑️ Void Payment</button>
        </div>
      </div>
    `);
  },

  async _confirmVoidPayment(paymentId) {
    const btn = document.getElementById('confirm-void-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Voiding…'; }

    const payment = dataManager.getById('payments', paymentId);
    const receiptNo = payment?.receiptNo || paymentId;

    const { data: rpc, error: rpcErr } = await supabaseClient.rpc('void_fee_payment', {
      p_payment_id: paymentId
    });
    if (rpcErr || !rpc?.success) {
      const msg = rpc?.error || rpcErr?.message || 'Failed to void payment.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🗑️ Void Payment'; }
      return;
    }

    document.querySelector('.modal-backdrop')?.remove();
    showToast(`Payment ${receiptNo} has been voided`, 'success');
    await this._refreshAndRender();
  },

  generateReceipt(paymentId) {
    const payment = dataManager.getById('payments', paymentId);
    if (!payment) { showToast('Payment record not found.', 'error'); return; }

    const receiptData = buildReceiptData({
      receipt_no:      payment.receiptNo,
      student_name:    payment.studentName,
      grade:           payment.grade,
      section:         payment.section,
      student_roll_no: payment.studentRollNo,
      items:           [{ name: payment.feeType || 'Fee Payment', amount: parseFloat(payment.amount) || 0 }],
      amount:          parseFloat(payment.amount) || 0,
      payment_method:  payment.paymentMethod,
      payment_date:    payment.paymentDate,
      transaction_ref: payment.transactionRef,
      term:            payment.term,
      academic_year:   payment.academicYear || payment.academic_year,
      status:          payment.status || 'paid',
    });

    showReceiptModal(receiptData);
  }

};

window.feesPaymentsModule = feesPaymentsModule;
