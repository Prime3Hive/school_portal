// ============================================
// STUDENT RECORD — everything about one pupil on one page
// ============================================
// Opened as #student-record/<id>, so a reload or a shared link comes back
// to the same child. Fees, results, family, health and history used to sit
// in a pop-up with seven tabs; they are now one page with four.
//
// Nothing is estimated. Attendance is the single percentage the school
// keeps on the pupil's file (there is no day-by-day register to draw from),
// and results come from recorded grades only.
//
// Editing, archiving and portal access still go through the student
// directory module's forms — this page is where they are opened from.
// ============================================

const studentRecordModule = {
  currentTab: 'overview',
  studentId: null,

  async init(container, options = {}) {
    this.container = container;
    if (options.id && options.id !== this.studentId) this.currentTab = options.tab || 'overview';
    this.studentId = options.id || this.studentId;
    if (dataManager?.waitForReady) await dataManager.waitForReady();

    // The edit and access forms live in the directory module.
    if (!window.studentDirectoryModule && window.app?.loadScript) {
      try { await window.app.loadScript('js/modules/student-directory.js'); } catch (e) { console.warn('[StudentRecord] directory module not loaded:', e); }
    }

    this.render();
    this._onDataChange = (e) => {
      if (['students', 'payments', 'feeItems', 'grades'].includes(e.detail?.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers ───────────────────────────────────────────────

  esc(v) {
    return window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  money(n) {
    return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
  },

  can(m) {
    return window.app?.canOpen ? window.app.canOpen(m) : true;
  },

  date(v, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', opts);
  },

  /** Contact objects are stored as JSON; older rows sometimes as a string. */
  obj(v) {
    if (!v) return {};
    if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch { return {}; } }
    return v;
  },

  initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  },

  age(dob) {
    if (!dob) return null;
    const b = new Date(dob);
    if (Number.isNaN(b.getTime())) return null;
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a >= 0 ? a : null;
  },

  gradeFor(pct) {
    const scale = window.schoolConfig?.promotion?.gradingScale || [];
    const row = scale.find(g => pct >= g.min && pct <= g.max + 0.999);
    return row ? { letter: row.grade, remark: row.remark } : { letter: '', remark: '' };
  },

  termScope() {
    return {
      term: window.schoolConfig?.getCurrentTerm?.()?.name || '',
      year: String(window.schoolConfig?.getCurrentAcademicYear?.() || '').replace('/', '-')
    };
  },

  student() {
    return this.studentId ? dataManager.getById('students', this.studentId) : null;
  },

  // ── Figures ───────────────────────────────────────────────

  fees(s) {
    const paidOf = (i) => parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0;
    const items = (dataManager.getAll('feeItems') || [])
      .filter(i => (i.student_id || i.studentId) === s.id)
      .map(i => ({ ...i, billed: parseFloat(i.amount) || 0, paid: paidOf(i) }))
      .map(i => ({ ...i, balance: Math.max(0, i.billed - i.paid) }));

    const scope = this.termScope();
    const inTerm = (i) => String(i.term || '') === scope.term && String(i.academic_year || i.academicYear || '').replace('/', '-') === scope.year;
    const termItems = items.filter(inTerm);
    const sum = (list, k) => list.reduce((a, i) => a + i[k], 0);

    const payments = (dataManager.getAll('payments') || [])
      .filter(p => (p.studentId || p.student_id) === s.id)
      .sort((a, b) => new Date(b.paymentDate || b.payment_date || b.createdAt || 0) - new Date(a.paymentDate || a.payment_date || a.createdAt || 0));

    return {
      scope,
      items,
      termItems,
      term: { billed: sum(termItems, 'billed'), paid: sum(termItems, 'paid'), balance: sum(termItems, 'balance') },
      all: { billed: sum(items, 'billed'), paid: sum(items, 'paid'), balance: sum(items, 'balance') },
      payments
    };
  },

  /** A payment's state in words the office uses. */
  paymentState(p) {
    const waiting = window.portalShell?.isAwaitingVerification?.(p);
    if (waiting) return { label: 'Being checked', tone: 'warn' };
    if (p.status === 'paid') return { label: 'Paid', tone: 'good' };
    if (p.rejectionReason || p.rejection_reason) return { label: 'Rejected', tone: 'warn' };
    return { label: p.status ? p.status[0].toUpperCase() + p.status.slice(1) : 'Pending', tone: '' };
  },

  /**
   * Recorded grades grouped by session and term, newest first. Within a term
   * each subject's scores are pooled across its assessments, so a subject
   * with two tests and an exam gets one percentage.
   */
  results(s) {
    const termRank = { 'First Term': 1, 'Second Term': 2, 'Third Term': 3 };
    const groups = new Map();
    (dataManager.getAll('grades') || [])
      .filter(g => (g.studentId || g.student_id) === s.id)
      .forEach(g => {
        const year = String(g.academicYear || g.academic_year || '').replace('/', '-');
        const key = `${year}|${g.term || ''}`;
        if (!groups.has(key)) groups.set(key, { year, term: g.term || '', subjects: new Map() });
        const subj = g.subject || 'Unnamed subject';
        const row = groups.get(key).subjects.get(subj) || { subject: subj, score: 0, total: 0, remarks: [] };
        row.score += parseFloat(g.score) || 0;
        row.total += parseFloat(g.totalMarks ?? g.total_marks) || 0;
        if (g.remarks) row.remarks.push(g.remarks);
        groups.get(key).subjects.set(subj, row);
      });

    return [...groups.values()]
      .map(grp => {
        const subjects = [...grp.subjects.values()]
          .filter(r => r.total > 0)
          .map(r => {
            const pct = Math.round((r.score / r.total) * 1000) / 10;
            return { ...r, pct, ...this.gradeFor(pct) };
          })
          .sort((a, b) => a.subject.localeCompare(b.subject));
        const average = subjects.length ? Math.round((subjects.reduce((a, r) => a + r.pct, 0) / subjects.length) * 10) / 10 : null;
        return { ...grp, subjects, average, ...(average != null ? this.gradeFor(average) : { letter: '', remark: '' }) };
      })
      .filter(grp => grp.subjects.length)
      .sort((a, b) => (b.year.localeCompare(a.year)) || ((termRank[b.term] || 0) - (termRank[a.term] || 0)));
  },

  guardians(s) {
    const people = [];
    const f = this.obj(s.father), m = this.obj(s.mother), g = this.obj(s.guardian);
    if (f.name || f.phone) people.push({ role: 'Father', ...f });
    if (m.name || m.phone) people.push({ role: 'Mother', ...m });
    if (g.name || g.phone) people.push({ role: g.relationship || 'Guardian', ...g });
    return people;
  },

  portalAccount(s) {
    const id = s.guardianAuthId || s.guardian_auth_id;
    if (!id) return null;
    const users = window.authManager?.getAllUsers?.() || [];
    const u = users.find(x => (x.id || x.authId) === id);
    return { id, name: u ? (u.fullName || u.full_name || u.email) : 'A linked account', email: u?.email || '' };
  },

  siblings(s) {
    const gid = s.guardianAuthId || s.guardian_auth_id;
    if (!gid) return [];
    return (dataManager.getAll('students') || []).filter(o => o.id !== s.id && (o.guardianAuthId || o.guardian_auth_id) === gid);
  },

  timeline(s, fees) {
    const out = [];
    const push = (when, title) => { const t = new Date(when).getTime(); if (!Number.isNaN(t)) out.push({ t, title }); };
    fees.payments.forEach(p => {
      const st = this.paymentState(p);
      const when = p.verifiedAt || p.verified_at || p.paymentDate || p.payment_date || p.createdAt || p.created_at;
      const verb = st.label === 'Paid' ? 'Paid' : st.label === 'Being checked' ? 'Sent' : st.label === 'Rejected' ? 'Payment rejected:' : 'Payment';
      push(when, `${verb} ${this.money(p.amount)}${st.label === 'Being checked' ? ', being checked' : ''}${p.receiptNo ? `, receipt ${p.receiptNo}` : ''}`);
    });
    if (s.admissionDate || s.admission_date) push(s.admissionDate || s.admission_date, 'Admitted to the school');
    else if (s.createdAt || s.created_at) push(s.createdAt || s.created_at, 'Record created');
    return out.sort((a, b) => b.t - a.t).slice(0, 6);
  },

  // ── Actions ───────────────────────────────────────────────

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  back() {
    window.app?.loadModule('student-directory');
  },

  edit() {
    window.studentDirectoryModule?.editStudent?.(this.studentId);
  },

  archive() {
    window.studentDirectoryModule?.archiveStudent?.(this.studentId);
  },

  restore() {
    window.studentDirectoryModule?.restoreStudent?.(this.studentId);
  },

  manageAccess() {
    window.studentDirectoryModule?.manageGuardianLink?.(this.studentId);
  },

  removeAccess() {
    window.studentDirectoryModule?.unlinkGuardian?.(this.studentId);
  },

  /** Record a payment without leaving the page: load the fees module's form only. */
  async recordPayment() {
    if (!window.feesPaymentsModule && window.app?.loadScript) {
      try { await window.app.loadScript('js/modules/fees-payments.js'); } catch { showToast('Could not open the payment form.', 'error'); return; }
    }
    window.feesPaymentsModule?.recordPaymentForStudent?.(this.studentId);
  },

  // ── Page ──────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'student-record') return;

    const s = this.student();
    if (!s) {
      this.container.innerHTML = `
        <div class="ui-page">
          <button type="button" class="ui-link" style="align-self:flex-start;" onclick="studentRecordModule.back()">← All students</button>
          <section class="ui-card">
            <h1 class="ui-card-title">Student not found</h1>
            <p class="ui-empty">This record may have been removed, or the link is out of date.</p>
          </section>
        </div>`;
      return;
    }

    const fees = this.fees(s);
    const cls = [s.grade, s.section].filter(Boolean).join(' ');
    const age = this.age(s.dateOfBirth || s.date_of_birth);
    const status = String(s.status || 'active').toLowerCase();
    const photo = typeof s.photo === 'string' && /^data:image\//.test(s.photo) ? s.photo : '';

    const chips = [
      cls && `<span class="ui-chip is-info">${this.esc(cls)}</span>`,
      (s.rollNo || s.roll_no) && `<span class="ui-chip">Adm. no. ${this.esc(s.rollNo || s.roll_no)}</span>`,
      (age != null || s.gender) && `<span class="ui-chip">${this.esc([age != null ? `Age ${age}` : '', s.gender ? s.gender[0].toUpperCase() + s.gender.slice(1) : ''].filter(Boolean).join(' · '))}</span>`,
      `<span class="ui-chip ${status === 'active' ? 'is-good' : 'is-warn'}">${this.esc(status[0].toUpperCase() + status.slice(1))}</span>`
    ].filter(Boolean).join('');

    const tabs = [['overview', 'Overview'], ['fees', 'Fees'], ['results', 'Results'], ['details', 'Family & details']];

    this.container.innerHTML = `
      <div class="ui-page">
        <nav aria-label="Breadcrumb" class="sr-crumbs">
          <button type="button" class="ui-link" onclick="studentRecordModule.back()">Students</button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">${this.esc(s.name || 'Student')}</span>
        </nav>

        <section class="ui-card sr-head">
          <div class="sr-avatar" aria-hidden="true">${photo ? `<img src="${this.esc(photo)}" alt="">` : this.esc(this.initials(s.name))}</div>
          <div class="sr-head-main">
            <h1 class="ui-page-title" style="font-size:1.75rem;">${this.esc(s.name || 'Unnamed student')}</h1>
            <div class="sr-chips">${chips}</div>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn" onclick="studentRecordModule.edit()">Edit record</button>
            ${this.can('fees-payments') ? '<button type="button" class="ui-btn ui-btn-primary" onclick="studentRecordModule.recordPayment()">Record payment</button>' : ''}
          </div>
        </section>

        <div role="tablist" aria-label="Student record" class="sr-tabs">
          ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this.currentTab === id}" class="sr-tab${this.currentTab === id ? ' is-on' : ''}" onclick="studentRecordModule.switchTab('${id}')">${label}</button>`).join('')}
        </div>

        ${this.currentTab === 'fees' ? this.feesTab(s, fees)
          : this.currentTab === 'results' ? this.resultsTab(s)
          : this.currentTab === 'details' ? this.detailsTab(s)
          : this.overviewTab(s, fees)}
      </div>`;
  },

  // ── Overview ─────────────────────────────────────────────

  overviewTab(s, fees) {
    const results = this.results(s);
    const latest = results[0];
    const people = this.guardians(s);
    const account = this.portalAccount(s);
    const events = this.timeline(s, fees);
    const att = Number(s.attendance);
    const hasAtt = s.attendance !== null && s.attendance !== undefined && s.attendance !== '' && Number.isFinite(att);
    const t = fees.term;
    const pct = t.billed ? Math.min(100, Math.round((t.paid / t.billed) * 100)) : 0;
    const blood = s.bloodGroup || s.blood_group;
    const emergency = Array.isArray(s.emergencyContacts) ? s.emergencyContacts : (this.obj(s.emergencyContacts || s.emergency_contacts) || []);

    return `
      <div class="ui-grid-3">
        <section class="ui-card" aria-labelledby="sr-fees">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-fees">Fees · ${this.esc(fees.scope.term || 'this term')}</h2>
            <button type="button" class="ui-link" onclick="studentRecordModule.switchTab('fees')">All fees</button>
          </div>
          ${t.billed ? `
            <div class="sr-trio">
              <div><span>Billed</span><strong>${this.money(t.billed)}</strong></div>
              <div><span>Paid</span><strong>${this.money(t.paid)}</strong></div>
              <div><span>Balance</span><strong class="${t.balance ? 'sr-owe' : ''}">${this.money(t.balance)}</strong></div>
            </div>
            <div class="ui-bar" style="margin:12px 0 4px;" role="img" aria-label="${pct}% of this term's bill paid"><span style="width:${pct}%"></span></div>
          ` : `<p class="ui-empty" style="padding-top:4px;">No bill for ${this.esc(fees.scope.term || 'this term')} yet.${fees.all.balance ? ` ${this.money(fees.all.balance)} is still owed from earlier terms.` : ''}</p>`}
          ${fees.payments.slice(0, 3).map(p => {
            const st = this.paymentState(p);
            return `
            <div class="ui-row" style="padding:10px 0;">
              <div class="ui-row-main">
                <div class="ui-row-title" style="font-size:0.875rem;">${this.money(p.amount)} · ${this.esc((p.paymentMethod || p.payment_method || 'payment').replace(/-/g, ' '))}</div>
                <div class="ui-row-meta">${this.esc([this.date(p.paymentDate || p.payment_date || p.createdAt), p.receiptNo ? 'Receipt ' + p.receiptNo : ''].filter(Boolean).join(' · '))}</div>
              </div>
              ${st.label === 'Being checked' && this.can('payment-checks')
                ? `<button type="button" class="ui-chip is-warn sr-chip-btn" onclick="window.app.loadModule('payment-checks')">Being checked</button>`
                : `<span class="ui-chip ${st.tone ? 'is-' + st.tone : ''}">${st.label}</span>`}
            </div>`;
          }).join('')}
        </section>

        <section class="ui-card" aria-labelledby="sr-res">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-res">Latest results</h2>
            ${results.length ? '<button type="button" class="ui-link" onclick="studentRecordModule.switchTab(\'results\')">All results</button>' : ''}
          </div>
          ${latest ? `
            <div style="display:flex; align-items:baseline; gap:10px; margin:4px 0 12px;">
              <span class="sr-big">${latest.average}%</span>
              <span class="ui-card-note">${this.esc([latest.letter && `Grade ${latest.letter}`, latest.remark, [latest.term, latest.year.replace('-', '/')].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${latest.subjects.slice(0, 6).map(r => `
                <div class="sr-subject">
                  <span>${this.esc(r.subject)}</span>
                  <div class="ui-bar" style="height:6px;"><span style="width:${Math.min(100, r.pct)}%"></span></div>
                  <strong>${Math.round(r.pct)} ${this.esc(r.letter)}</strong>
                </div>`).join('')}
            </div>` : '<p class="ui-empty" style="padding-top:4px;">No scores have been recorded for this student yet.</p>'}
        </section>

        <section class="ui-card" aria-labelledby="sr-att">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-att">Attendance</h2>
          </div>
          ${hasAtt ? `
            <div style="display:flex; align-items:baseline; gap:10px; margin:4px 0 10px;">
              <span class="sr-big">${Math.round(att)}%</span>
              <span class="ui-card-note">as kept on the student's file</span>
            </div>
            <div class="ui-bar"><span style="width:${Math.max(0, Math.min(100, att))}%"></span></div>`
          : '<p class="ui-empty" style="padding-top:4px;">No attendance figure on file.</p>'}
        </section>

        <section class="ui-card" aria-labelledby="sr-fam">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-fam">Parents &amp; guardians</h2>
            <button type="button" class="ui-link" onclick="studentRecordModule.switchTab('details')">Details</button>
          </div>
          ${people.length ? people.map((p, i) => `
            <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:10px 0; align-items:flex-start;">
              <div class="ui-row-main">
                <div class="ui-row-title" style="font-size:0.875rem;">${this.esc(p.name || p.role)}</div>
                <div class="ui-row-meta">${this.esc([p.name ? p.role : '', p.phone || 'No phone number'].filter(Boolean).join(' · '))}</div>
              </div>
              ${p.phone ? `<a class="ui-btn ui-btn-sm" href="tel:${this.esc(String(p.phone).replace(/[^\d+]/g, ''))}">Call</a>` : ''}
            </div>`).join('') : '<p class="ui-empty" style="padding-top:4px;">No parent or guardian on this record. The school cannot reach this family about fees or results.</p>'}
          <p class="ui-row-meta" style="margin:10px 0 0;">${account ? `Parent portal: ${this.esc(account.name)}` : 'No parent can see this child in the parent portal yet.'}</p>
        </section>

        <section class="ui-card" aria-labelledby="sr-care">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-care">Health &amp; emergency</h2>
          </div>
          <dl class="sr-dl">
            <div><dt>Blood group</dt><dd>${this.esc(blood || 'Not recorded')}</dd></div>
            <div><dt>Emergency contact</dt><dd>${emergency.length ? this.esc([emergency[0].name, emergency[0].phone].filter(Boolean).join(', ')) : 'None recorded'}</dd></div>
            <div><dt>Date of birth</dt><dd>${this.esc(this.date(s.dateOfBirth || s.date_of_birth) || 'Not recorded')}</dd></div>
          </dl>
        </section>

        <section class="ui-card" aria-labelledby="sr-tl">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-tl">History</h2>
          </div>
          ${events.length ? events.map(e => `
            <div class="sr-event">
              <span class="sr-event-dot" aria-hidden="true"></span>
              <div><div class="sr-event-title">${this.esc(e.title)}</div><div class="ui-row-meta">${this.esc(this.date(e.t))}</div></div>
            </div>`).join('') : '<p class="ui-empty" style="padding-top:4px;">Nothing recorded yet.</p>'}
        </section>
      </div>`;
  },

  // ── Fees ─────────────────────────────────────────────────

  feesTab(s, fees) {
    const byTerm = new Map();
    fees.items.forEach(i => {
      const key = `${String(i.academic_year || i.academicYear || '').replace('-', '/')} ${i.term || ''}`.trim() || 'No term';
      if (!byTerm.has(key)) byTerm.set(key, []);
      byTerm.get(key).push(i);
    });

    return `
      <div class="ui-grid-4" style="grid-template-columns:repeat(3, minmax(0, 1fr));">
        <div class="ui-card ui-kpi" style="cursor:default;"><span class="ui-kpi-label">Billed, all terms</span><span class="ui-kpi-value">${this.money(fees.all.billed)}</span></div>
        <div class="ui-card ui-kpi" style="cursor:default;"><span class="ui-kpi-label">Paid</span><span class="ui-kpi-value">${this.money(fees.all.paid)}</span></div>
        <div class="ui-card ui-kpi" style="cursor:default;"><span class="ui-kpi-label">Still owed</span><span class="ui-kpi-value${fees.all.balance ? ' sr-owe' : ''}">${this.money(fees.all.balance)}</span></div>
      </div>

      <section class="ui-card" aria-labelledby="sr-bills">
        <div class="ui-card-head"><h2 class="ui-card-title" id="sr-bills">Bills</h2></div>
        ${byTerm.size ? [...byTerm.entries()].map(([label, items]) => `
          <h3 class="pc-h3" style="margin:14px 0 4px;">${this.esc(label)}</h3>
          <table class="pc-table sr-table">
            <thead><tr><th>Item</th><th>Billed</th><th>Paid</th><th>Balance</th></tr></thead>
            <tbody>
              ${items.map(i => `
                <tr>
                  <td>${this.esc(i.item_name || i.itemName || 'Fee')}</td>
                  <td>${this.money(i.billed)}</td>
                  <td>${this.money(i.paid)}</td>
                  <td class="${i.balance ? 'sr-owe' : ''}">${i.balance ? this.money(i.balance) : 'Paid'}</td>
                </tr>`).join('')}
            </tbody>
          </table>`).join('')
        : `<p class="ui-empty">No fees have been assigned to this student.${this.can('fees-payments') ? ' Assign them from Fees &amp; payments.' : ''}</p>`}
      </section>

      <section class="ui-card" aria-labelledby="sr-pays">
        <div class="ui-card-head"><h2 class="ui-card-title" id="sr-pays">Payments</h2></div>
        ${fees.payments.length ? `
          <table class="pc-table sr-table">
            <thead><tr><th>Date</th><th>Method</th><th>Receipt</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              ${fees.payments.map(p => {
                const st = this.paymentState(p);
                return `
                <tr>
                  <td>${this.esc(this.date(p.paymentDate || p.payment_date || p.createdAt) || '—')}</td>
                  <td style="text-transform:capitalize;">${this.esc((p.paymentMethod || p.payment_method || '—').replace(/-/g, ' '))}</td>
                  <td>${this.esc(p.receiptNo || p.receipt_no || '—')}</td>
                  <td>${this.money(p.amount)}</td>
                  <td><span class="ui-chip ${st.tone ? 'is-' + st.tone : ''}">${st.label}</span>${st.label === 'Rejected' ? `<div class="ui-row-meta">${this.esc(p.rejectionReason || p.rejection_reason)}</div>` : ''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>` : '<p class="ui-empty">No payments recorded.</p>'}
      </section>`;
  },

  // ── Results ──────────────────────────────────────────────

  resultsTab(s) {
    const results = this.results(s);
    if (!results.length) {
      return `<section class="ui-card"><p class="ui-empty">No scores have been recorded for this student yet. They appear here as teachers enter them.</p></section>`;
    }
    return results.map(r => `
      <section class="ui-card">
        <div class="ui-card-head">
          <h2 class="ui-card-title">${this.esc([r.term, r.year.replace('-', '/')].filter(Boolean).join(' · ') || 'Results')}</h2>
          <span class="ui-card-note">Average ${r.average}%${r.letter ? ` · ${this.esc(r.letter)}, ${this.esc(r.remark)}` : ''}</span>
        </div>
        <table class="pc-table sr-table">
          <thead><tr><th>Subject</th><th>Score</th><th>%</th><th>Grade</th><th class="sr-remark">Teacher's remark</th></tr></thead>
          <tbody>
            ${r.subjects.map(x => `
              <tr>
                <td>${this.esc(x.subject)}</td>
                <td>${Math.round(x.score * 10) / 10} / ${Math.round(x.total * 10) / 10}</td>
                <td>${x.pct}%</td>
                <td>${this.esc(x.letter || '—')}</td>
                <td class="sr-remark">${this.esc(x.remarks.join('; ') || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>`).join('');
  },

  // ── Family & details ─────────────────────────────────────

  detailsTab(s) {
    const people = this.guardians(s);
    const account = this.portalAccount(s);
    const sibs = this.siblings(s);
    const addr = this.obj(s.address);
    const emergency = Array.isArray(s.emergencyContacts) ? s.emergencyContacts : [];
    const completion = window.studentDirectoryModule?.calculateProfileCompletion?.(s);
    const row = (k, v) => `<div><dt>${this.esc(k)}</dt><dd>${this.esc(v || 'Not recorded')}</dd></div>`;
    const status = String(s.status || 'active').toLowerCase();

    return `
      <div class="ui-grid-3">
        <section class="ui-card ui-span-2" aria-labelledby="sr-people">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-people">Parents &amp; guardians</h2>
            <button type="button" class="ui-link" onclick="studentRecordModule.edit()">Edit</button>
          </div>
          ${people.length ? people.map(p => `
            <h3 class="pc-h3" style="margin:12px 0 6px;">${this.esc(p.role)}</h3>
            <dl class="sr-dl sr-dl-2">
              ${row('Name', p.name)}${row('Phone', p.phone)}${row('Email', p.email)}${row('Occupation', p.occupation)}
            </dl>`).join('') : '<p class="ui-empty">No parent or guardian recorded.</p>'}
        </section>

        <section class="ui-card" aria-labelledby="sr-portal">
          <div class="ui-card-head"><h2 class="ui-card-title" id="sr-portal">Parent portal access</h2></div>
          <p style="margin:4px 0 12px; font-size:0.875rem;">${account
            ? `<strong>${this.esc(account.name)}</strong><br><span class="ui-row-meta">${this.esc(account.email)}</span>`
            : '<span class="ui-row-meta">No parent can see this child in the portal yet.</span>'}</p>
          ${sibs.length ? `<p class="ui-row-meta" style="margin:0 0 12px;">Also sees: ${this.esc(sibs.map(x => x.name).join(', '))}</p>` : ''}
          <div class="ui-actions">
            <button type="button" class="ui-btn ui-btn-sm" onclick="studentRecordModule.manageAccess()">${account ? 'Move to another parent' : 'Link a parent'}</button>
            ${account ? '<button type="button" class="ui-btn ui-btn-sm pc-danger" onclick="studentRecordModule.removeAccess()">Remove access</button>' : ''}
          </div>
        </section>

        <section class="ui-card ui-span-2" aria-labelledby="sr-pers">
          <div class="ui-card-head">
            <h2 class="ui-card-title" id="sr-pers">Personal details</h2>
            ${completion != null ? `<span class="ui-card-note">Record ${completion}% complete</span>` : ''}
          </div>
          <dl class="sr-dl sr-dl-2">
            ${row('Date of birth', this.date(s.dateOfBirth || s.date_of_birth))}
            ${row('Gender', s.gender ? s.gender[0].toUpperCase() + s.gender.slice(1) : '')}
            ${row('Blood group', s.bloodGroup || s.blood_group)}
            ${row('Admitted', this.date(s.admissionDate || s.admission_date))}
            ${row('Previous school', s.previousSchool || s.previous_school)}
            ${row('Student email', s.email)}
            ${row('Address', [addr.street, addr.city, addr.state].filter(Boolean).join(', '))}
            ${row('Student phone', s.phone)}
          </dl>
        </section>

        <section class="ui-card" aria-labelledby="sr-emerg">
          <div class="ui-card-head"><h2 class="ui-card-title" id="sr-emerg">Emergency contacts</h2></div>
          ${emergency.length ? emergency.map((c, i) => `
            <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:10px 0;">
              <div class="ui-row-main">
                <div class="ui-row-title" style="font-size:0.875rem;">${this.esc(c.name || 'Unnamed')}</div>
                <div class="ui-row-meta">${this.esc([c.relationship, c.phone].filter(Boolean).join(' · '))}</div>
              </div>
            </div>`).join('') : '<p class="ui-empty" style="padding-top:4px;">None recorded.</p>'}
        </section>
      </div>

      <section class="ui-card sr-danger-zone">
        <div>
          <h2 class="ui-card-title" style="font-size:1rem;">${status === 'archived' ? 'This student is archived' : 'Archive this student'}</h2>
          <p class="ui-row-meta" style="margin:4px 0 0;">${status === 'archived'
            ? 'Archived students are kept but left out of class lists and billing.'
            : 'For a pupil who has left. Their record, fees and results are kept and can be restored.'}</p>
        </div>
        ${status === 'archived'
          ? '<button type="button" class="ui-btn" onclick="studentRecordModule.restore()">Restore</button>'
          : '<button type="button" class="ui-btn pc-danger" onclick="studentRecordModule.archive()">Archive…</button>'}
      </section>`;
  }
};

window.studentRecordModule = studentRecordModule;
