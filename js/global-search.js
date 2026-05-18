// ============================================
// GLOBAL SEARCH
// Cross-collection search: students, staff, payments, applications
// Triggered from the top header search bar
// ============================================

const globalSearch = {
  _open: false,
  _query: '',
  _results: [],
  _debounce: null,

  // ── Bootstrap: inject UI into the header ─────────────────────────────────
  init() {
    // Already initialised?
    if (document.getElementById('gs-wrapper')) return;

    // Find a suitable header anchor
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    // Insert search bar before the notification button
    const wrapper = document.createElement('div');
    wrapper.id = 'gs-wrapper';
    wrapper.style.cssText = 'position:relative;display:flex;align-items:center;';
    wrapper.innerHTML = `
      <div id="gs-input-wrap" style="
        display:flex;align-items:center;gap:8px;
        background:var(--bg-tertiary);border:1px solid var(--border-primary);
        border-radius:10px;padding:6px 12px;transition:all 0.2s;cursor:text;
        min-width:200px;max-width:300px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--text-tertiary);flex-shrink:0;">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input id="gs-input" type="text" placeholder="Search everything…"
          autocomplete="off" spellcheck="false"
          style="background:none;border:none;outline:none;font-size:0.875rem;color:var(--text-primary);width:100%;min-width:0;"
          oninput="globalSearch._onInput(this.value)"
          onkeydown="globalSearch._onKeydown(event)"
          onfocus="globalSearch._onFocus()"
          onblur="globalSearch._onBlur()">
        <kbd id="gs-shortcut" style="font-size:0.65rem;padding:2px 5px;background:var(--bg-primary);border:1px solid var(--border-primary);border-radius:4px;color:var(--text-tertiary);white-space:nowrap;">Ctrl K</kbd>
        <button id="gs-clear" onclick="globalSearch.clear()" style="display:none;background:none;border:none;cursor:pointer;color:var(--text-tertiary);padding:0;line-height:1;font-size:16px;">✕</button>
      </div>
      <div id="gs-dropdown" style="
        display:none;position:absolute;top:calc(100% + 8px);left:0;right:0;
        background:var(--bg-secondary);border:1px solid var(--border-primary);
        border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.18);
        z-index:9999;overflow:hidden;min-width:380px;max-height:480px;overflow-y:auto;">
      </div>
    `;
    headerRight.insertBefore(wrapper, headerRight.firstChild);

    // Keyboard shortcut: Ctrl/Cmd + K
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('gs-input')?.focus();
      }
      if (e.key === 'Escape') globalSearch.close();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!document.getElementById('gs-wrapper')?.contains(e.target)) globalSearch.close();
    });
  },

  // ── Event handlers ────────────────────────────────────────────────────────

  _onInput(val) {
    this._query = val.trim();
    clearTimeout(this._debounce);
    const clearBtn = document.getElementById('gs-clear');
    const shortcut = document.getElementById('gs-shortcut');
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
    if (shortcut) shortcut.style.display = val ? 'none' : '';
    if (!this._query) { this._clearResults(); return; }
    this._debounce = setTimeout(() => this._search(), 200);
  },

  _onKeydown(e) {
    const items = document.querySelectorAll('.gs-result-item');
    const active = document.querySelector('.gs-result-item.gs-active');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = active ? [...items].indexOf(active) : -1;
      const next = items[idx + 1] || items[0];
      active?.classList.remove('gs-active');
      next?.classList.add('gs-active');
      next?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = active ? [...items].indexOf(active) : items.length;
      const prev = items[idx - 1] || items[items.length - 1];
      active?.classList.remove('gs-active');
      prev?.classList.add('gs-active');
      prev?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) active.click();
    }
  },

  _onFocus() {
    const wrap = document.getElementById('gs-input-wrap');
    if (wrap) wrap.style.borderColor = 'var(--color-primary)';
    if (this._query && this._results.length) this._showDropdown();
  },

  _onBlur() {
    const wrap = document.getElementById('gs-input-wrap');
    if (wrap) wrap.style.borderColor = 'var(--border-primary)';
  },

  clear() {
    const input = document.getElementById('gs-input');
    if (input) { input.value = ''; input.focus(); }
    this._query = '';
    this._clearResults();
    const clearBtn = document.getElementById('gs-clear');
    const shortcut = document.getElementById('gs-shortcut');
    if (clearBtn) clearBtn.style.display = 'none';
    if (shortcut) shortcut.style.display = '';
  },

  close() {
    const dd = document.getElementById('gs-dropdown');
    if (dd) dd.style.display = 'none';
    this._open = false;
  },

  // ── Search engine ─────────────────────────────────────────────────────────

  _search() {
    const q = this._query.toLowerCase();
    const results = [];
    const MAX = 6; // max per category

    // Students
    const students = dataManager?.getAll('students') || [];
    students.filter(s =>
      (s.name||s.fullName||'').toLowerCase().includes(q) ||
      (s.rollNo||s.roll_no||'').toLowerCase().includes(q) ||
      (s.grade||s.class||'').toLowerCase().includes(q)
    ).slice(0, MAX).forEach(s => results.push({
      type: 'student', icon: '🎓',
      title: s.name || s.fullName,
      sub: `${s.rollNo||s.roll_no||''} · ${s.grade||s.class||''} · ${s.status||'active'}`,
      action: () => { globalSearch.close(); window.app?.loadModule('student-directory'); }
    }));

    // Staff
    const staff = dataManager?.getAll('staff') || [];
    staff.filter(s =>
      (s.name||s.fullName||'').toLowerCase().includes(q) ||
      (s.role||'').toLowerCase().includes(q) ||
      (s.department||'').toLowerCase().includes(q) ||
      (s.email||'').toLowerCase().includes(q)
    ).slice(0, MAX).forEach(s => results.push({
      type: 'staff', icon: '👨‍🏫',
      title: s.name || s.fullName,
      sub: `${s.role||''} · ${s.department||''} · ${s.status||''}`,
      action: () => { globalSearch.close(); window.app?.loadModule('staff-management'); }
    }));

    // Payments
    const payments = dataManager?.getAll('payments') || [];
    payments.filter(p =>
      (p.student_name||p.studentName||'').toLowerCase().includes(q) ||
      (p.receipt_no||p.receiptNo||'').toLowerCase().includes(q) ||
      (p.transaction_ref||p.transactionRef||'').toLowerCase().includes(q)
    ).slice(0, MAX).forEach(p => results.push({
      type: 'payment', icon: '💰',
      title: p.student_name || p.studentName || 'Payment',
      sub: `₦${(p.amount||0).toLocaleString()} · ${p.status} · ${p.receipt_no||p.receiptNo||''}`,
      action: () => { globalSearch.close(); window.app?.loadModule('fees-payments'); }
    }));

    // Applications
    const applications = dataManager?.getAll('applications') || [];
    applications.filter(a =>
      (a.fullName||a.full_name||'').toLowerCase().includes(q) ||
      (a.applicationNumber||a.application_number||'').toLowerCase().includes(q) ||
      (a.email||'').toLowerCase().includes(q)
    ).slice(0, MAX).forEach(a => results.push({
      type: 'application', icon: '📋',
      title: a.fullName || a.full_name || 'Application',
      sub: `${a.applicationNumber||a.application_number||''} · ${a.status||'pending'}`,
      action: () => { globalSearch.close(); window.app?.loadModule('applications'); }
    }));

    // Inventory
    const inventory = dataManager?.getAll('inventory') || [];
    inventory.filter(i =>
      (i.name||'').toLowerCase().includes(q) ||
      (i.category||'').toLowerCase().includes(q) ||
      (i.serialNo||i.serial_no||'').toLowerCase().includes(q)
    ).slice(0, MAX).forEach(i => results.push({
      type: 'inventory', icon: '📦',
      title: i.name,
      sub: `${i.category||''} · Qty: ${i.quantity||0} · ${i.status||'available'}`,
      action: () => { globalSearch.close(); window.app?.loadModule('inventory'); }
    }));

    // Nav shortcuts (always show if query matches)
    const shortcuts = [
      { label:'Dashboard', module:'admin-dashboard', icon:'🏠' },
      { label:'Students', module:'student-directory', icon:'🎓' },
      { label:'Staff', module:'staff-management', icon:'👨‍🏫' },
      { label:'Fees & Payments', module:'fees-payments', icon:'💰' },
      { label:'Grades & Subjects', module:'academics', icon:'📊' },
      { label:'Class Schedule', module:'class-schedule', icon:'🗓️' },
      { label:'Applications', module:'applications', icon:'📋' },
      { label:'Inventory', module:'inventory', icon:'📦' },
      { label:'Calendar', module:'calendar', icon:'📅' },
      { label:'Settings', module:'settings', icon:'⚙️' },
      { label:'Report Cards', module:'report-cards', icon:'📄' },
      { label:'Lesson Plans', module:'lesson-plans', icon:'📖' },
    ];
    shortcuts.filter(s => s.label.toLowerCase().includes(q)).forEach(s => results.push({
      type: 'shortcut', icon: s.icon,
      title: `Go to ${s.label}`,
      sub: 'Navigation',
      action: () => { globalSearch.close(); window.app?.loadModule(s.module); }
    }));

    this._results = results;
    this._renderResults(q);
  },

  // ── Render ────────────────────────────────────────────────────────────────

  _renderResults(q) {
    const dd = document.getElementById('gs-dropdown');
    if (!dd) return;
    if (!this._results.length) {
      dd.innerHTML = `
        <div style="padding:32px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:8px;">🔍</div>
          <div style="color:var(--text-secondary);font-size:0.875rem;">No results for "<strong>${this._escape(q)}</strong>"</div>
        </div>`;
      dd.style.display = 'block';
      return;
    }

    const byType = {};
    const typeLabels = { student:'Students', staff:'Staff', payment:'Payments', application:'Applications', inventory:'Inventory', shortcut:'Quick Actions' };
    this._results.forEach(r => {
      if (!byType[r.type]) byType[r.type] = [];
      byType[r.type].push(r);
    });

    let html = `<div style="padding:8px 12px 4px;font-size:0.7rem;font-weight:700;color:var(--text-tertiary);letter-spacing:0.05em;">
      ${this._results.length} result${this._results.length!==1?'s':''} for "${this._escape(q)}"
    </div>`;

    Object.entries(byType).forEach(([type, items]) => {
      html += `<div style="padding:4px 12px;font-size:0.7rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.08em;background:var(--bg-tertiary);border-top:1px solid var(--border-primary);">
        ${typeLabels[type]||type}
      </div>`;
      items.forEach((item, i) => {
        const highlighted = this._highlight(item.title, q);
        html += `
          <div class="gs-result-item" tabindex="-1"
            onclick="globalSearch._results.find((r,idx)=>idx===${this._results.indexOf(item)})?.action()"
            style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background 0.15s;"
            onmouseenter="this.classList.add('gs-active');document.querySelectorAll('.gs-result-item').forEach(el=>el!==this&&el.classList.remove('gs-active'))"
            onmouseleave="this.classList.remove('gs-active')">
            <span style="font-size:1.2rem;flex-shrink:0;">${item.icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.875rem;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${highlighted}</div>
              <div style="font-size:0.75rem;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.sub}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-tertiary);flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
      });
    });

    html += `<div style="padding:8px 16px;font-size:0.72rem;color:var(--text-tertiary);border-top:1px solid var(--border-primary);display:flex;gap:16px;background:var(--bg-secondary);">
      <span>↑↓ Navigate</span><span>↵ Select</span><span>Esc Close</span>
    </div>`;

    dd.innerHTML = html;
    dd.style.display = 'block';

    // Wire onclick by index
    dd.querySelectorAll('.gs-result-item').forEach((el, i) => {
      el.onclick = () => { this._results[i]?.action(); };
    });
  },

  _clearResults() {
    this._results = [];
    const dd = document.getElementById('gs-dropdown');
    if (dd) { dd.innerHTML = ''; dd.style.display = 'none'; }
  },

  _showDropdown() {
    const dd = document.getElementById('gs-dropdown');
    if (dd && dd.innerHTML) dd.style.display = 'block';
  },

  _highlight(text, q) {
    if (!q || !text) return this._escape(text);
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return this._escape(text).replace(regex, '<mark style="background:#fef08a;color:#713f12;border-radius:2px;">$1</mark>');
  },

  _escape(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
};

// Inject active-state styles
(function injectGsStyles() {
  if (document.getElementById('gs-styles')) return;
  const s = document.createElement('style');
  s.id = 'gs-styles';
  s.textContent = `.gs-result-item.gs-active { background: var(--bg-tertiary); }`;
  document.head.appendChild(s);
})();

if (typeof window !== 'undefined') window.globalSearch = globalSearch;
