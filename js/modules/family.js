// ============================================
// FAMILY — the parent and student portal
// ============================================
// Three pages shared by parents (role guardian) and pupils (role student):
//
//   family-home     balance, latest result, today's lessons, school notices
//   family-fees     the bill, how to pay by transfer, and every payment's state
//   family-results  results by term
//
// A parent may have several children; the one being looked at is kept on
// the device so every page, and the next visit, shows the same child.
//
// Figures come from js/pupil-data.js, which the staff student record also
// reads, so the office and the family always see the same balance.
//
// Paying: the family transfers to the school's account and uploads the
// receipt. That records a *pending* payment (record_fee_payment never lets a
// non-staff caller settle one) which staff approve under Payments to check.
// For a guardian this needs migration 0028; before it is applied the
// database refuses, and the page says so in plain words.
// ============================================

(function () {
  'use strict';

  const CHILD_KEY = 'tbd_family_child';

  const esc = (v) => window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const money = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
  const firstName = (n) => String(n || '').trim().split(/\s+/).filter(w => !/^(mr|mrs|ms|miss|dr|chief)\.?$/i.test(w))[0] || '';
  const date = (v, o = { day: 'numeric', month: 'short' }) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', o); };

  // ── Whose portal is this ─────────────────────────────────

  const family = {
    session() {
      return window.authManager?.getSession?.() || {};
    },

    isGuardian() {
      return this.session().role === 'guardian';
    },

    /**
     * The pupils this login may see. A pupil's own login is students.auth_id;
     * a guardian is students.guardian_auth_id (migration 0024). Both hold the
     * auth user id, which the session calls supabaseId. The guardian email on
     * the pupil's record is a fallback for children not yet linked.
     */
    children() {
      const s = this.session();
      const uid = s.supabaseId || s.authId || null;
      const email = String(s.email || '').trim().toLowerCase();
      const students = window.dataManager?.getAll('students') || [];
      if (s.role === 'student') {
        return students.filter(x => uid && (x.authId || x.auth_id) === uid);
      }
      const linked = students.filter(x => uid && (x.guardianAuthId || x.guardian_auth_id) === uid);
      const byEmail = !email ? [] : students.filter(x => {
        if (linked.includes(x) || x.guardianAuthId || x.guardian_auth_id) return false;
        let g = x.guardian;
        if (typeof g === 'string') { try { g = JSON.parse(g); } catch { g = null; } }
        return String(g?.email || '').trim().toLowerCase() === email;
      });
      return [...linked, ...byEmail].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    },

    child() {
      const kids = this.children();
      let id = null;
      try { id = localStorage.getItem(CHILD_KEY); } catch { /* storage blocked */ }
      return kids.find(k => k.id === id) || kids[0] || null;
    },

    pickChild(id) {
      try { localStorage.setItem(CHILD_KEY, id); } catch { /* storage blocked */ }
      const current = window.app?.currentModule;
      const mod = { 'family-home': window.familyHomeModule, 'family-fees': window.familyFeesModule, 'family-results': window.familyResultsModule }[current];
      mod?.render();
    },

    switcherHTML() {
      const kids = this.children();
      if (kids.length < 2) return '';
      const current = this.child();
      return `
        <div class="fam-kids" role="group" aria-label="Choose child">
          ${kids.map(k => `<button type="button" class="fam-kid${k.id === current?.id ? ' is-on' : ''}" aria-pressed="${k.id === current?.id}" onclick="familyPortal.pickChild('${esc(k.id)}')">
            <strong>${esc(firstName(k.name) || k.name)}</strong><span>${esc([k.grade, k.section].filter(Boolean).join(' '))}</span>
          </button>`).join('')}
        </div>`;
    },

    noChildHTML(title) {
      const g = this.isGuardian();
      return `
        <div class="ui-page">
          <h1 class="ui-page-title">${esc(title)}</h1>
          <section class="ui-card">
            <h2 class="ui-card-title">${g ? 'No child is linked to your account yet' : 'Your student record is not linked yet'}</h2>
            <p class="ui-empty">${g
              ? 'The school links each child to their parent\'s login. Please call or visit the school office and ask them to link your child to this account.'
              : 'Please ask the school office to link your login to your student record.'}</p>
            <p class="ui-row-meta" style="margin:8px 0 0;">Signed in as ${esc(this.session().email || this.session().fullName || '')}</p>
          </section>
        </div>`;
    },

    /** Re-render the open family page when its data changes. */
    listen(mod, name) {
      mod._onDataChange = (e) => {
        if (['students', 'payments', 'feeItems', 'grades', 'schoolSchedules'].includes(e.detail?.collection) && window.app?.currentModule === name) mod.render();
      };
      window.removeEventListener('datamanager:change', mod._onDataChange);
      window.addEventListener('datamanager:change', mod._onDataChange);
    }
  };

  // ── Home ─────────────────────────────────────────────────

  const familyHomeModule = {
    events: null,

    async init(container) {
      this.container = container;
      if (window.dataManager?.waitForReady) await dataManager.waitForReady();
      this.render();
      this.loadEvents();
      family.listen(this, 'family-home');
    },

    cleanup() {
      if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    },

    async loadEvents() {
      if (!window.supabaseClient) { this.events = []; this.render(); return; }
      try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const from = new Date(today); from.setDate(from.getDate() - 31);
        const until = new Date(today); until.setDate(until.getDate() + 21);
        const { data, error } = await supabaseClient.from('calendar_events')
          .select('id, title, start_date, end_date, type')
          .gte('start_date', from.toISOString()).lte('start_date', until.toISOString())
          .order('start_date', { ascending: true });
        if (error) throw error;
        this.events = (data || []).filter(e => new Date(e.end_date || e.start_date) >= today).slice(0, 4);
      } catch (err) {
        console.warn('[Family] calendar not read:', err);
        this.events = [];
      }
      this.render();
    },

    render() {
      if (!this.container || (window.app?.currentModule && window.app.currentModule !== 'family-home')) return;
      const kid = family.child();
      if (!kid) { this.container.innerHTML = family.noChildHTML('Home'); return; }

      const s = family.session();
      const fees = pupilData.fees(kid.id);
      const results = pupilData.results(kid.id);
      const latest = results[0];
      const lessons = pupilData.lessonsToday(kid);
      const checking = fees.payments.filter(p => pupilData.paymentState(p).key === 'checking');
      const rejected = fees.payments.find(p => pupilData.paymentState(p).key === 'rejected');
      const t = fees.term;
      const owed = t.billed ? t.balance : fees.all.balance;
      const pct = t.billed ? Math.min(100, Math.round((t.paid / t.billed) * 100)) : 0;
      const h = new Date().getHours();
      const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      const att = Number(kid.attendance);
      const hasAtt = kid.attendance !== null && kid.attendance !== undefined && kid.attendance !== '' && Number.isFinite(att);
      const time = (v) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const hh = +m[1]; return `${((hh + 11) % 12) + 1}:${m[2]} ${hh < 12 ? 'am' : 'pm'}`; };

      const tile = (label, value, go, icon) => `
        <button type="button" class="fam-tile" onclick="${go}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon}"/></svg>
          <span class="ui-row-meta">${label}</span>
          <strong>${value}</strong>
        </button>`;

      this.container.innerHTML = `
        <div class="ui-page fam-page">
          <div>
            <h1 class="ui-page-title">${greet}${firstName(s.fullName) ? ', ' + esc(firstName(s.fullName)) : ''}</h1>
            <p class="ui-page-sub">${family.isGuardian() ? esc(kid.name) + ' · ' : ''}${esc([kid.grade, kid.section].filter(Boolean).join(' '))}</p>
          </div>

          ${family.switcherHTML()}

          <section class="fam-balance" aria-labelledby="fam-bal">
            <h2 id="fam-bal">${t.billed ? esc(fees.scope.term || 'This term') + ' balance' : 'Balance'}</h2>
            <div class="fam-balance-amount">${money(owed)}</div>
            ${t.billed ? `
              <div class="fam-balance-sub">${money(t.paid)} paid of ${money(t.billed)}</div>
              <div class="fam-balance-bar" role="img" aria-label="${pct}% paid"><span style="width:${pct}%"></span></div>`
            : `<div class="fam-balance-sub">${fees.items.length ? 'No bill for this term yet.' : 'No fees have been billed yet.'}</div>`}
            ${checking.length ? `<p class="fam-balance-note">${money(checking.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0))} you sent is being checked by the school.</p>` : ''}
            <div class="fam-balance-actions">
              ${owed > 0 && !checking.length ? `<button type="button" class="fam-pay" onclick="familyFeesModule.openPay()">Pay now</button>` : ''}
              <button type="button" class="fam-ghost" onclick="window.app.loadModule('family-fees')">${owed > 0 && !checking.length ? 'Statement' : 'See fees'}</button>
            </div>
          </section>

          ${rejected && !checking.length ? `
            <p class="pc-note is-warn" style="margin:0;">Your transfer of ${money(rejected.amount)} was not accepted: “${esc(rejected.rejectionReason || rejected.rejection_reason)}”. <button type="button" class="ui-link" onclick="familyFeesModule.openPay()">Send it again</button></p>` : ''}

          <div class="fam-tiles">
            ${tile('Latest result', latest ? `${latest.average}%${latest.letter ? ' · ' + esc(latest.letter) : ''}` : 'None yet', "window.app.loadModule('family-results')", 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5')}
            ${tile('Attendance', hasAtt ? `${Math.round(att)}%` : 'Not recorded', "window.app.loadModule('family-results')", 'M4 12l5 5L20 6')}
            ${tile('Today', lessons.length ? `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'}` : 'No lessons listed', family.isGuardian() ? "familyHomeModule.scrollToDay()" : "window.app.loadModule('my-schedule')", 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4')}
            ${tile('Class', esc([kid.grade, kid.section].filter(Boolean).join(' ') || '—'), "window.app.loadModule('family-results')", 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6')}
          </div>

          ${lessons.length ? `
          <section class="ui-card" id="fam-day" aria-labelledby="fam-day-h">
            <h2 class="ui-card-title" id="fam-day-h">Today's lessons</h2>
            ${lessons.map((l, i) => `
              <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:10px 0;">
                <div class="tt-time">${esc(time(l.start_time || l.startTime) || '—')}</div>
                <div class="ui-row-main"><div class="ui-row-title" style="font-size:0.875rem;">${esc(l.subject || l.title || 'Lesson')}</div>${l.teacher ? `<div class="ui-row-meta">${esc(l.teacher)}</div>` : ''}</div>
              </div>`).join('')}
          </section>` : ''}

          <section aria-labelledby="fam-news">
            <h2 class="pc-h3" id="fam-news" style="margin:0 0 8px;">From the school</h2>
            ${this.events === null ? '<p class="ui-empty">Loading…</p>'
              : this.events.length ? this.events.map(e => `
                <div class="ui-card fam-notice">
                  <div class="ui-date" aria-hidden="true"><div class="ui-date-day">${esc(date(e.start_date, { weekday: 'short' }))}</div><div class="ui-date-num">${new Date(e.start_date).getDate()}</div></div>
                  <div><div class="ui-row-title" style="font-size:0.875rem;">${esc(e.title)}</div><div class="ui-row-meta">${esc(date(e.start_date, { weekday: 'long', day: 'numeric', month: 'long' }))}</div></div>
                </div>`).join('')
              : '<p class="ui-empty" style="padding-top:0;">No school events in the next three weeks.</p>'}
          </section>
        </div>`;
    },

    scrollToDay() {
      document.getElementById('fam-day')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // ── Fees and paying ──────────────────────────────────────

  const familyFeesModule = {
    _paying: false,
    _busy: false,

    async init(container) {
      this.container = container;
      if (window.dataManager?.waitForReady) await dataManager.waitForReady();
      this.render();
      family.listen(this, 'family-fees');
    },

    cleanup() {
      this._paying = false;
      if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    },

    openPay() {
      this._paying = true;
      if (window.app?.currentModule === 'family-fees') this.render();
      else window.app?.loadModule('family-fees');
    },

    closePay() {
      this._paying = false;
      this.render();
    },

    bank() {
      const b = window.feeStructure?.getBankDetails?.() || {};
      return { name: b.name || 'Keystone Bank', accountName: b.accountName || 'TBD International Academy', accountNumber: b.accountNumber || '1013525760' };
    },

    /** What to write in the transfer narration so the bursar can match it. */
    narration(kid) {
      const ref = String(kid.rollNo || kid.roll_no || String(kid.id || '').slice(0, 6)).toUpperCase();
      const name = String(firstName(kid.name) || kid.name || '').toUpperCase();
      // Admission numbers already begin TBD/…; do not say it twice.
      return `${/^TBD/.test(ref) ? '' : 'TBD '}${ref} ${name}`.trim();
    },

    async copy(text, btn) {
      try {
        await navigator.clipboard.writeText(text);
        if (btn) { const was = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = was; }, 1500); }
      } catch {
        showToast('Copy did not work here. Please write it down.', 'warning');
      }
    },

    /**
     * record_fee_payment refuses a second payment with the same fee type and
     * term once one is paid, so each transfer in a term gets its own label.
     */
    feeType(kid, term) {
      return pupilData.nextFeeTypeLabel(kid.id, term);
    },

    onFile(input) {
      const f = input.files?.[0];
      const label = document.getElementById('fam-file-label');
      if (label) label.textContent = f ? f.name : 'Choose a screenshot or photo';
      input.closest('.fam-upload')?.classList.toggle('has-file', !!f);
    },

    async submit(e) {
      e.preventDefault();
      if (this._busy) return;
      const kid = family.child();
      if (!kid) return;
      const form = e.target;
      const amount = Number(String(form.amount.value).replace(/[^\d.]/g, ''));
      const file = form.receipt.files?.[0];
      const ref = form.reference.value.trim();

      if (!amount || amount <= 0) { showToast('Enter the amount you sent.', 'warning'); form.amount.focus(); return; }
      if (!file) { showToast('Add the receipt from your bank app or the teller.', 'warning'); return; }
      if (file.size > 5 * 1024 * 1024) { showToast('The receipt must be smaller than 5 MB.', 'warning'); return; }

      this._busy = true;
      const btn = document.getElementById('fam-send');
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading receipt…'; }

      try {
        // A retry after a refused send reuses the receipt already uploaded
        // rather than leaving a second copy in storage.
        let path = this._uploaded?.file === file ? this._uploaded.path : null;
        if (!path) {
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
          path = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const up = await supabaseClient.storage.from('documents').upload(path, file, { cacheControl: '3600', upsert: false });
          if (up.error) throw new Error('The receipt could not be uploaded. Check your connection and try again.');
          this._uploaded = { file, path };
        }

        if (btn) btn.textContent = 'Sending…';
        const term = pupilData.termScope().term;
        const { data: rpc, error } = await supabaseClient.rpc('record_fee_payment', {
          p_data: {
            student_id: kid.id,
            student_name: kid.name,
            student_roll_no: kid.rollNo || kid.roll_no || null,
            grade: kid.grade || '',
            section: kid.section || '',
            fee_type: this.feeType(kid, term),
            amount,
            payment_method: 'bank-deposit',
            payment_date: new Date().toISOString().slice(0, 10),
            transaction_ref: ref || this.narration(kid),
            notes: family.isGuardian() ? `Sent by parent: ${family.session().fullName || ''}`.trim() : null,
            receipt_url: path,
            term,
            academic_year: pupilData.termScope().year
          }
        });
        if (error || !rpc?.success) {
          const raw = rpc?.error || error?.message || '';
          throw new Error(this.explain(raw));
        }
        await Promise.all([dataManager.refresh('payments'), dataManager.refresh('feeItems')]);
        this._paying = false;
        this._busy = false;
        this._uploaded = null;
        showToast('Sent. The school will check it against their bank statement, usually within one school day.', 'success');
        this.render();
      } catch (err) {
        this._busy = false;
        showToast(err.message || 'Your payment could not be sent.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Send to the school'; }
      }
    },

    /** The database's refusals, in words a parent can act on. */
    explain(raw) {
      const msg = String(raw || '');
      if (/^FORBIDDEN:No student record/.test(msg) || /own account/.test(msg)) {
        return 'The school has not yet switched on payments from the parent portal. Please pay at the office, or call the school, and keep your bank receipt.';
      }
      if (/^PENDING:/.test(msg)) return 'You already have a transfer being checked. You can send another once the school has checked it.';
      if (/^DUPLICATE:/.test(msg)) return 'This payment looks like one already recorded. Please call the school office.';
      if (/^INVALID:/.test(msg)) return msg.replace(/^INVALID:/, '');
      return 'Your payment could not be sent. Please try again, or call the school office.';
    },

    render() {
      if (!this.container || (window.app?.currentModule && window.app.currentModule !== 'family-fees')) return;
      const kid = family.child();
      if (!kid) { this.container.innerHTML = family.noChildHTML('Fees'); return; }
      this.container.innerHTML = this._paying ? this.payHTML(kid) : this.feesHTML(kid);
    },

    feesHTML(kid) {
      const fees = pupilData.fees(kid.id);
      const checking = fees.payments.filter(p => pupilData.paymentState(p).key === 'checking');
      const owed = fees.all.balance;
      const byTerm = new Map();
      fees.items.forEach(i => {
        const key = `${i.term || ''} ${String(i.academic_year || i.academicYear || '').replace('-', '/')}`.trim() || 'Fees';
        if (!byTerm.has(key)) byTerm.set(key, []);
        byTerm.get(key).push(i);
      });

      return `
        <div class="ui-page fam-page">
          <div>
            <h1 class="ui-page-title">Fees</h1>
            <p class="ui-page-sub">${esc(kid.name)} · ${esc([kid.grade, kid.section].filter(Boolean).join(' '))}</p>
          </div>
          ${family.switcherHTML()}

          <section class="ui-card fam-owed">
            <div>
              <span class="ui-row-meta">Still to pay</span>
              <strong class="${owed ? 'sr-owe' : ''}">${money(owed)}</strong>
              <span class="ui-row-meta">${money(fees.all.paid)} paid of ${money(fees.all.billed)} billed</span>
            </div>
            ${owed > 0 && !checking.length ? '<button type="button" class="ui-btn ui-btn-primary" onclick="familyFeesModule.openPay()">Pay by transfer</button>' : ''}
          </section>
          ${checking.length ? `<p class="pc-note is-warn" style="margin:0;">${money(checking.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0))} sent on ${esc(date(checking[0].paymentDate || checking[0].payment_date || checking[0].createdAt))} is being checked. You can send another payment once it has been checked.</p>` : ''}

          <section class="ui-card" aria-labelledby="fam-bills">
            <h2 class="ui-card-title" id="fam-bills">What you have been billed</h2>
            ${byTerm.size ? [...byTerm.entries()].map(([label, items]) => `
              <h3 class="pc-h3" style="margin:14px 0 2px;">${esc(label)}</h3>
              ${items.map(i => `
                <div class="fam-line">
                  <span>${esc(i.item_name || i.itemName || 'Fee')}</span>
                  <span>${i.balance ? `<span class="sr-owe">${money(i.balance)}</span> <span class="ui-row-meta">of ${money(i.billed)}</span>` : `<span class="ui-chip is-good">Paid</span>`}</span>
                </div>`).join('')}`).join('')
            : '<p class="ui-empty">Nothing has been billed yet.</p>'}
          </section>

          <section class="ui-card" aria-labelledby="fam-pays">
            <h2 class="ui-card-title" id="fam-pays">Payments</h2>
            ${fees.payments.length ? fees.payments.map((p, i) => {
              const st = pupilData.paymentState(p);
              return `
              <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:12px 0; align-items:flex-start;">
                <div class="ui-row-main">
                  <div class="ui-row-title" style="font-size:0.9375rem;">${money(p.amount)}</div>
                  <div class="ui-row-meta">${esc([date(p.paymentDate || p.payment_date || p.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }), p.receiptNo || p.receipt_no ? 'Receipt ' + (p.receiptNo || p.receipt_no) : ''].filter(Boolean).join(' · '))}</div>
                  ${st.key === 'rejected' ? `<div class="ui-row-meta" style="color:var(--ui-bad-ink);">Not accepted: ${esc(p.rejectionReason || p.rejection_reason)}</div>` : ''}
                  ${st.key === 'checking' ? '<div class="ui-row-meta">The school checks this against their bank statement.</div>' : ''}
                </div>
                <span class="ui-chip ${st.tone ? 'is-' + st.tone : ''}">${esc(st.label)}</span>
              </div>`;
            }).join('') : '<p class="ui-empty">No payments yet.</p>'}
          </section>
        </div>`;
    },

    payHTML(kid) {
      const fees = pupilData.fees(kid.id);
      const due = fees.term.billed ? fees.term.balance : fees.all.balance;
      const bank = this.bank();
      const narration = this.narration(kid);
      // The text rides in a data attribute: interpolated into the onclick, a
      // name with an apostrophe would end the string and break the button.
      const copyBtn = (text, label) => `<button type="button" class="ui-btn ui-btn-sm" aria-label="Copy ${esc(label)}" data-copy="${esc(text)}" onclick="familyFeesModule.copy(this.dataset.copy, this)">Copy</button>`;

      return `
        <div class="ui-page fam-page">
          <button type="button" class="ui-link fam-back" onclick="familyFeesModule.closePay()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
            Fees
          </button>
          <div>
            <h1 class="ui-page-title">Pay school fees</h1>
            <p class="ui-page-sub">${esc(kid.name)} · ${due ? money(due) + ' to pay' : 'nothing owed'}</p>
          </div>

          <section class="ui-card fam-step" aria-labelledby="fam-s1">
            <h2 id="fam-s1"><span class="fam-num">1</span>Transfer to the school's account</h2>
            <div class="fam-field"><div><span class="ui-row-meta">Bank</span><strong>${esc(bank.name)}</strong></div></div>
            <div class="fam-field"><div><span class="ui-row-meta">Account number</span><strong class="fam-acct">${esc(bank.accountNumber)}</strong></div>${copyBtn(bank.accountNumber, 'account number')}</div>
            <div class="fam-field"><div><span class="ui-row-meta">Account name</span><strong>${esc(bank.accountName)}</strong></div></div>
            <div class="fam-field"><div><span class="ui-row-meta">Write this as the narration</span><strong>${esc(narration)}</strong></div>${copyBtn(narration, 'narration')}</div>
          </section>

          <form class="ui-card fam-step" aria-labelledby="fam-s2" onsubmit="familyFeesModule.submit(event)">
            <h2 id="fam-s2"><span class="fam-num">2</span>Tell the school what you sent</h2>
            <label class="fam-input">
              <span>Amount you sent (₦)</span>
              <input name="amount" inputmode="numeric" autocomplete="off" value="${due ? Math.round(due) : ''}" required>
            </label>
            <label class="fam-upload">
              <input type="file" name="receipt" accept="image/*,application/pdf" onchange="familyFeesModule.onFile(this)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>
              <span id="fam-file-label">Choose a screenshot or photo</span>
              <span class="ui-row-meta">of the receipt from your bank app or the teller</span>
            </label>
            <label class="fam-input">
              <span>Transaction reference <span class="ui-row-meta">(optional)</span></span>
              <input name="reference" autocomplete="off" placeholder="From your receipt">
            </label>
            <p class="ui-row-meta" style="margin:0;">The school checks your receipt against their bank statement, usually within one school day. It then shows as paid here.</p>
            <button type="submit" class="ui-btn ui-btn-primary fam-submit" id="fam-send">Send to the school</button>
          </form>
        </div>`;
    }
  };

  // ── Results ──────────────────────────────────────────────

  const familyResultsModule = {
    async init(container) {
      this.container = container;
      if (window.dataManager?.waitForReady) await dataManager.waitForReady();
      this.render();
      family.listen(this, 'family-results');
    },

    cleanup() {
      if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    },

    render() {
      if (!this.container || (window.app?.currentModule && window.app.currentModule !== 'family-results')) return;
      const kid = family.child();
      if (!kid) { this.container.innerHTML = family.noChildHTML('Results'); return; }
      const results = pupilData.results(kid.id);
      const att = Number(kid.attendance);
      const hasAtt = kid.attendance !== null && kid.attendance !== undefined && kid.attendance !== '' && Number.isFinite(att);

      this.container.innerHTML = `
        <div class="ui-page fam-page">
          <div>
            <h1 class="ui-page-title">Results</h1>
            <p class="ui-page-sub">${esc(kid.name)} · ${esc([kid.grade, kid.section].filter(Boolean).join(' '))}${hasAtt ? ` · attendance ${Math.round(att)}%` : ''}</p>
          </div>
          ${family.switcherHTML()}
          ${results.length ? results.map((r, i) => `
            <section class="ui-card">
              <div class="ui-card-head">
                <h2 class="ui-card-title">${esc([r.term, r.year.replace('-', '/')].filter(Boolean).join(' · ') || 'Results')}</h2>
                ${i === 0 ? '<span class="ui-chip is-info">Latest</span>' : ''}
              </div>
              <div style="display:flex; align-items:baseline; gap:10px; margin:2px 0 12px;">
                <span class="sr-big">${r.average}%</span>
                <span class="ui-card-note">${esc([r.letter && 'Grade ' + r.letter, r.remark].filter(Boolean).join(' · '))}</span>
              </div>
              ${r.subjects.map(x => `
                <div class="fam-subject">
                  <div class="fam-subject-top"><span>${esc(x.subject)}</span><strong>${Math.round(x.pct)}% ${esc(x.letter)}</strong></div>
                  <div class="ui-bar" style="height:6px;"><span style="width:${Math.min(100, x.pct)}%"></span></div>
                  ${x.remarks.length ? `<div class="ui-row-meta">“${esc(x.remarks.join('; '))}”</div>` : ''}
                </div>`).join('')}
            </section>`).join('')
          : `<section class="ui-card"><p class="ui-empty">No results yet. They appear here as teachers enter marks during the term.</p></section>`}
        </div>`;
    }
  };

  window.familyPortal = family;
  window.familyHomeModule = familyHomeModule;
  window.familyFeesModule = familyFeesModule;
  window.familyResultsModule = familyResultsModule;
})();
