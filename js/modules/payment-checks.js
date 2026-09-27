// ============================================
// PAYMENTS TO CHECK — the bursar's queue
// ============================================
// Every payment a parent says they have made but nobody has confirmed:
// bank transfers with an uploaded receipt, and the Paystack payments that
// migration 0020 now holds as pending until someone approves them.
//
// One payment at a time: the receipt beside what the parent entered, the
// bill it will be applied to, and what that leaves owing. Approving calls
// verify_fee_payment, the same function the fees page uses, so the rules
// and the audit trail are the database's, not this screen's.
//
// "How it will be applied" mirrors _allocate_payment_to_fee_items exactly:
// the student's unpaid fee items, oldest first, any term. Anything over the
// total owed is not applied to any bill, which is why this screen warns
// about it before approval rather than after.
// ============================================

const paymentChecksModule = {
  currentTab: 'waiting',
  _selectedId: null,
  _rejecting: false,

  async init(container) {
    this.container = container;
    this._rejecting = false;
    if (dataManager?.waitForReady) await dataManager.waitForReady();
    this.render();

    this._onDataChange = (e) => {
      if (['payments', 'feeItems', 'students'].includes(e.detail?.collection) && !this._busy) this.render();
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

  method(p) {
    return String(p?.paymentMethod || p?.payment_method || '').toLowerCase();
  },

  /** A payment someone says they made that nobody has confirmed. */
  isWaiting(p) {
    if (!p || p.status !== 'pending') return false;
    return this.method(p) === 'bank-deposit' || this.method(p) === 'paystack';
  },

  methodLabel(p) {
    return this.method(p) === 'paystack' ? 'Paid online (Paystack)' : 'Bank transfer';
  },

  sentAt(p) {
    const v = p.paymentDate || p.payment_date || p.createdAt || p.created_at;
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  },

  /** Who checked it, unless all that was stored is a user id (the RPC's fallback). */
  verifierName(p) {
    const v = String(p.verifiedBy || p.verified_by || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? '' : v;
  },

  checkedAt(p) {
    const v = p.verifiedAt || p.verified_at || p.updatedAt || p.updated_at;
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isNaN(t) ? 0 : t;
  },

  when(ts, withTime) {
    if (!ts) return 'date not recorded';
    const d = new Date(ts);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    const day = d.toLocaleDateString('en-GB', opts);
    return withTime ? `${day}, ${d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}` : day;
  },

  studentOf(p) {
    const id = p.studentId || p.student_id;
    return id ? dataManager.getById('students', id) : null;
  },

  classOf(p, s) {
    return [s?.grade || p.grade, s?.section || p.section].filter(Boolean).join(' ');
  },

  /**
   * What approving this payment will do to the student's bills — the same
   * walk _allocate_payment_to_fee_items makes in the database.
   */
  allocation(p) {
    const sid = p.studentId || p.student_id;
    const paidOf = (i) => parseFloat(i.amount_paid ?? i.amountPaid ?? 0) || 0;
    const items = (dataManager.getAll('feeItems') || [])
      .filter(i => (i.student_id || i.studentId) === sid && i.status !== 'paid')
      .map(i => ({ ...i, balance: Math.max(0, (parseFloat(i.amount) || 0) - paidOf(i)) }))
      .filter(i => i.balance > 0)
      .sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));

    const owed = items.reduce((a, i) => a + i.balance, 0);
    let left = parseFloat(p.amount) || 0;
    const lines = [];
    for (const i of items) {
      if (left <= 0) break;
      const take = Math.min(left, i.balance);
      lines.push({ name: i.item_name || i.itemName || 'Fee', term: i.term || '', amount: take, clears: take >= i.balance });
      left -= take;
    }
    return { owed, lines, unapplied: Math.max(0, left), remaining: Math.max(0, owed - (parseFloat(p.amount) || 0)) };
  },

  /** One short verdict per payment, for the list and the detail. */
  outcome(p) {
    const a = this.allocation(p);
    const amount = parseFloat(p.amount) || 0;
    if (a.owed <= 0) return { tone: 'warn', short: 'No unpaid bill', long: 'This student has no unpaid bill, so approving applies this payment to nothing.' };
    if (a.unapplied > 0) return { tone: 'warn', short: 'More than owed', long: `${this.money(a.unapplied)} more than this student owes. The extra is not applied to any bill.` };
    if (amount >= a.owed) return { tone: 'good', short: 'Clears balance', long: 'Pays off everything this student owes.' };
    return { tone: 'info', short: 'Part payment', long: `Part payment. ${this.money(a.remaining)} will still be owed.` };
  },

  /** Another claim for the same student and amount is often the same money sent twice. */
  duplicateOf(p, waiting) {
    const sid = p.studentId || p.student_id;
    return waiting.find(o => o.id !== p.id && (o.studentId || o.student_id) === sid && Number(o.amount) === Number(p.amount)) || null;
  },

  waitingList() {
    return (dataManager.getAll('payments') || [])
      .filter(p => this.isWaiting(p))
      .sort((a, b) => this.sentAt(a) - this.sentAt(b)); // oldest first: they have waited longest
  },

  recentlyChecked() {
    const since = Date.now() - 14 * 86400000;
    return (dataManager.getAll('payments') || [])
      .filter(p => (p.verifiedAt || p.verified_at) && this.checkedAt(p) >= since)
      .filter(p => p.status === 'paid' || (p.rejectionReason || p.rejection_reason))
      .sort((a, b) => this.checkedAt(b) - this.checkedAt(a));
  },

  // ── Actions ───────────────────────────────────────────────

  switchTab(tab) {
    this.currentTab = tab;
    this._rejecting = false;
    this.render();
  },

  select(id) {
    this._selectedId = id;
    this._rejecting = false;
    this.render();
    if (window.matchMedia('(max-width: 1024px)').matches) {
      document.getElementById('pc-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  step(delta) {
    const list = this.waitingList();
    const i = list.findIndex(p => p.id === this._selectedId);
    const next = list[Math.min(list.length - 1, Math.max(0, i + delta))];
    if (next) this.select(next.id);
  },

  onConfirmChange(checked) {
    const btn = document.getElementById('pc-approve');
    if (btn) btn.disabled = !checked;
  },

  startReject() {
    this._rejecting = true;
    this.render();
    document.getElementById('pc-reason')?.focus();
  },

  cancelReject() {
    this._rejecting = false;
    this.render();
  },

  _verifier() {
    // verify_fee_payment falls back to auth.uid() when this is null.
    return window.authManager?.getSession?.()?.fullName || null;
  },

  async _afterDecision(doneId) {
    const before = this.waitingList().map(p => p.id);
    const at = before.indexOf(doneId);
    await Promise.all([
      dataManager.refresh('payments'),
      dataManager.refresh('students'),
      dataManager.refresh('feeItems')
    ]);
    // Move on to the payment that was next in line, not back to the top.
    const after = this.waitingList();
    this._selectedId = (after[at] || after[at - 1] || after[0] || {}).id || null;
    this._rejecting = false;
    this._busy = false;
    this.render();
    window.portalShell?.updateBadges?.();
  },

  async approve(id) {
    const p = dataManager.getById('payments', id);
    if (!p) return;
    const btn = document.getElementById('pc-approve');
    if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
    this._busy = true;

    const { data: rpc, error } = await supabaseClient.rpc('verify_fee_payment', {
      p_payment_id: id,
      p_verified_by: this._verifier()
    });
    if (error || !rpc?.success) {
      this._busy = false;
      const msg = rpc?.error || error?.message || 'The payment could not be approved.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Approve payment'; }
      return;
    }
    if (typeof writeAuditLog === 'function') {
      writeAuditLog('PAYMENT_VERIFIED', p.studentName || '', `${this.money(p.amount)} approved`);
    }
    showToast(`Approved. ${this.money(p.amount)} now shows as paid for ${p.studentName || 'the student'}.`, 'success');
    await this._afterDecision(id);
  },

  async reject(id) {
    const p = dataManager.getById('payments', id);
    const reasonEl = document.getElementById('pc-reason');
    const reason = reasonEl ? reasonEl.value.trim() : '';
    if (!p) return;
    if (!reason) {
      reasonEl?.focus();
      showToast('Say why, so the parent knows what to fix.', 'warning');
      return;
    }
    const btn = document.getElementById('pc-reject-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }
    this._busy = true;

    const { data: rpc, error } = await supabaseClient.rpc('reject_fee_payment', {
      p_payment_id: id,
      p_verified_by: this._verifier(),
      p_reason: reason
    });
    if (error || !rpc?.success) {
      this._busy = false;
      const msg = rpc?.error || error?.message || 'The payment could not be rejected.';
      showToast(msg.replace(/^[A-Z_]+:/, '').trim(), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Reject payment'; }
      return;
    }
    if (typeof writeAuditLog === 'function') writeAuditLog('PAYMENT_REJECTED', p.studentName || '', reason);
    showToast('Rejected. The parent will see your reason.', 'warning');
    await this._afterDecision(id);
  },

  openStudent(studentId) {
    window.app?.loadModule('student-record', { id: studentId });
  },

  // ── Page ──────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'payment-checks') return;

    const waiting = this.waitingList();
    const checked = this.recentlyChecked();
    const total = waiting.reduce((a, p) => a + (parseFloat(p.amount) || 0), 0);

    if (this.currentTab === 'waiting' && !waiting.some(p => p.id === this._selectedId)) {
      this._selectedId = waiting[0]?.id || null;
    }

    const tab = (id, label) => {
      const on = this.currentTab === id;
      return `<button type="button" role="tab" aria-selected="${on}" class="pc-tab${on ? ' is-on' : ''}" onclick="paymentChecksModule.switchTab('${id}')">${label}</button>`;
    };

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Payments to check</h1>
            <p class="ui-page-sub">Match each payment to the bank statement before you approve it. It shows as paid on the parent's account the moment you do.</p>
          </div>
          <div role="tablist" aria-label="Which payments" class="pc-tabs">
            ${tab('waiting', `Waiting · ${waiting.length}`)}
            ${tab('checked', `Checked in the last 14 days · ${checked.length}`)}
          </div>
        </div>
        ${this.currentTab === 'waiting' ? this.waitingHTML(waiting, total) : this.checkedHTML(checked)}
      </div>`;
  },

  waitingHTML(waiting, total) {
    if (!waiting.length) {
      return `
        <section class="ui-card">
          <h2 class="ui-card-title">Nothing to check</h2>
          <p class="ui-empty">When a parent sends a transfer and uploads the receipt, it waits here for you.</p>
        </section>`;
    }
    const sel = waiting.find(p => p.id === this._selectedId) || waiting[0];
    return `
      <p class="ui-card-note" style="margin:-8px 0 0;">${waiting.length} waiting, ${this.money(total)} in total. Oldest first.</p>
      <div class="pc-split">
        <ul class="ui-card pc-list" aria-label="Payments waiting">
          ${waiting.map(p => {
            const s = this.studentOf(p);
            const o = this.outcome(p);
            const dup = this.duplicateOf(p, waiting);
            const on = p.id === sel.id;
            return `
            <li>
              <button type="button" class="pc-item${on ? ' is-on' : ''}" ${on ? 'aria-current="true"' : ''} onclick="paymentChecksModule.select('${this.esc(p.id)}')">
                <span class="pc-item-top">
                  <span class="pc-item-name">${this.esc(p.studentName || s?.name || 'Unknown student')}</span>
                  <span class="pc-item-amount">${this.money(p.amount)}</span>
                </span>
                <span class="pc-item-top">
                  <span class="ui-row-meta">${this.esc([this.classOf(p, s), this.when(this.sentAt(p))].filter(Boolean).join(' · '))}</span>
                  <span class="ui-chip ${dup ? 'is-warn' : o.tone === 'good' ? 'is-good' : o.tone === 'warn' ? 'is-warn' : ''}">${dup ? 'Possible duplicate' : o.short}</span>
                </span>
              </button>
            </li>`;
          }).join('')}
        </ul>
        ${this.detailHTML(sel, waiting)}
      </div>`;
  },

  detailHTML(p, waiting) {
    const s = this.studentOf(p);
    const a = this.allocation(p);
    const o = this.outcome(p);
    const dup = this.duplicateOf(p, waiting);
    const index = waiting.findIndex(x => x.id === p.id);
    const receipt = p.receiptUrl || p.receipt_url || '';
    const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(receipt);
    const paystack = this.method(p) === 'paystack';
    const id = this.esc(p.id);

    const facts = [
      ['Student', p.studentName || s?.name || 'Unknown'],
      ['Class', this.classOf(p, s) || 'Not recorded'],
      ['Method', this.methodLabel(p)],
      ['Reference', p.transactionRef || p.transaction_ref || 'None given'],
      ['For', [p.feeType || p.fee_type, p.term].filter(Boolean).join(', ') || 'Not stated'],
      ['Note from parent', p.notes || '']
    ].filter(([, v]) => v);

    return `
      <section class="ui-card pc-detail" id="pc-detail" aria-labelledby="pc-amount">
        <div class="pc-detail-head">
          <div>
            <h2 class="pc-amount" id="pc-amount">${this.money(p.amount)}</h2>
            <p class="ui-row-meta" style="margin:2px 0 0;">${this.esc(this.methodLabel(p))} · sent ${this.esc(this.when(this.sentAt(p), true))}</p>
          </div>
          <div class="pc-nav">
            <span class="ui-card-note">${index + 1} of ${waiting.length}</span>
            <button type="button" class="ui-btn ui-btn-sm pc-icon" aria-label="Previous payment" ${index <= 0 ? 'disabled' : ''} onclick="paymentChecksModule.step(-1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
            </button>
            <button type="button" class="ui-btn ui-btn-sm pc-icon" aria-label="Next payment" ${index >= waiting.length - 1 ? 'disabled' : ''} onclick="paymentChecksModule.step(1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>
        </div>

        <div class="pc-body">
          <div class="pc-receipt">
            ${receipt
              ? (isImage
                  ? `<img data-storage-src="${this.esc(receipt)}" alt="Receipt uploaded for this payment">`
                  : `<div class="pc-receipt-empty">The receipt is a document, not a picture.</div>`)
              : `<div class="pc-receipt-empty">${paystack ? 'Paid online, so there is no receipt upload. Check the Paystack dashboard.' : 'No receipt was uploaded with this payment.'}</div>`}
            ${receipt ? `<a class="ui-btn ui-btn-sm" href="${this.esc(receipt)}" data-storage-link target="_blank" rel="noopener noreferrer">Open receipt full size</a>` : ''}
          </div>

          <div class="pc-facts">
            <dl class="pc-dl">
              ${facts.map(([k, v]) => `<div><dt>${this.esc(k)}</dt><dd>${this.esc(v)}</dd></div>`).join('')}
            </dl>

            ${dup ? `<p class="pc-note is-warn">Another payment of ${this.money(dup.amount)} for this student is also waiting, sent ${this.esc(this.when(this.sentAt(dup)))}. Make sure this is not the same money twice.</p>` : ''}
            <p class="pc-note is-${o.tone}">${this.esc(o.long)}</p>

            ${a.lines.length ? `
              <div>
                <h3 class="pc-h3">How it will be applied</h3>
                <p class="ui-row-meta" style="margin:0 0 6px;">Oldest unpaid items first, as the school's records do it.</p>
                <table class="pc-table">
                  <tbody>
                    ${a.lines.map(l => `
                      <tr>
                        <td>${this.esc(l.name)}${l.term ? `<span class="ui-row-meta"> · ${this.esc(l.term)}</span>` : ''}</td>
                        <td>${this.money(l.amount)}${l.clears ? '' : ' <span class="ui-row-meta">(part)</span>'}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>` : ''}

            ${s && (window.app?.canOpen?.('student-directory') ?? true)
              ? `<button type="button" class="ui-link" style="align-self:flex-start;" onclick="paymentChecksModule.openStudent('${this.esc(s.id)}')">Open ${this.esc(s.name || 'student')}'s record</button>`
              : ''}
          </div>
        </div>

        <div class="pc-actions">
          ${this._rejecting ? `
            <label class="pc-reason">
              <span>Why is it being rejected? The parent will see this.</span>
              <textarea id="pc-reason" rows="2" placeholder="For example: the amount on the receipt does not match, or the receipt is unreadable."></textarea>
            </label>
            <div class="ui-actions">
              <button type="button" class="ui-btn pc-danger" id="pc-reject-confirm" onclick="paymentChecksModule.reject('${id}')">Reject payment</button>
              <button type="button" class="ui-btn" onclick="paymentChecksModule.cancelReject()">Cancel</button>
            </div>` : `
            <label class="pc-confirm">
              <input type="checkbox" onchange="paymentChecksModule.onConfirmChange(this.checked)">
              <span>${paystack
                ? `I can see ${this.money(p.amount)} for this student in the Paystack dashboard.`
                : `I can see ${this.money(p.amount)} credited to the school's account on the bank statement.`}</span>
            </label>
            <div class="ui-actions">
              <button type="button" class="ui-btn ui-btn-primary" id="pc-approve" disabled onclick="paymentChecksModule.approve('${id}')">Approve payment</button>
              <button type="button" class="ui-btn pc-danger" onclick="paymentChecksModule.startReject()">Reject…</button>
            </div>`}
        </div>
      </section>`;
  },

  checkedHTML(list) {
    if (!list.length) {
      return `<section class="ui-card"><p class="ui-empty">No payments have been approved or rejected in the last 14 days.</p></section>`;
    }
    return `
      <section class="ui-card" style="padding-top:8px;">
        ${list.map((p, i) => {
          const rejected = p.status !== 'paid';
          return `
          <div class="ui-row"${i === 0 ? ' style="border-top:0;"' : ''}>
            <div class="ui-row-main">
              <div class="ui-row-title">${this.esc(p.studentName || 'Unknown student')} · ${this.money(p.amount)}</div>
              <div class="ui-row-meta">${this.esc([
                `${rejected ? 'Rejected' : 'Approved'} ${this.when(this.checkedAt(p), true)}`,
                this.verifierName(p) ? `by ${this.verifierName(p)}` : '',
                rejected ? `“${p.rejectionReason || p.rejection_reason}”` : ''
              ].filter(Boolean).join(' · '))}</div>
            </div>
            <span class="ui-chip ${rejected ? 'is-warn' : 'is-good'}">${rejected ? 'Rejected' : 'Approved'}</span>
          </div>`;
        }).join('')}
      </section>`;
  }
};

window.paymentChecksModule = paymentChecksModule;
