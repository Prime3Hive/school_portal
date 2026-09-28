// ============================================
// CALENDAR
// ============================================
// The school calendar: a month grid, a list, and the chosen day's events.
// Reading and writing go through js/calendar-events.js, which copes with
// both shapes of the calendar_events table and compares local days.
// Admin and office staff can add, change and delete events (the table's
// policy allows admin and staff); everyone else reads.
// ============================================

window.calendarModule = {
  month: null,        // first day of the month shown
  selected: null,     // "YYYY-MM-DD"
  view: 'month',
  events: [],
  failed: false,

  TYPES: [
    ['academic', 'Academic'], ['exam', 'Exams'], ['holiday', 'Holiday'], ['meeting', 'Meeting'], ['event', 'Event']
  ],

  async init(container) {
    this.container = container;
    const today = new Date();
    if (!this.month) this.month = new Date(today.getFullYear(), today.getMonth(), 1);
    if (!this.selected) this.selected = calendarEvents.dayKey(today);
    this.events = null;
    this.render();
    await this.loadEvents();
    this.render();
  },

  cleanup() {},

  // ── Helpers ───────────────────────────────────────────────

  _esc(v) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(v)
      : String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  canEdit() {
    const role = window.authManager?.getSession?.()?.role;
    return role === 'admin' || role === 'staff';
  },

  typeLabel(t) {
    return (this.TYPES.find(([k]) => k === t) || [, 'Event'])[1];
  },

  today() {
    return calendarEvents.dayKey(new Date());
  },

  /** "12 Sept" or "12–14 Sept 2026". */
  range(e, withYear = false) {
    const opts = { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) };
    const a = calendarEvents.fromKey(e.start).toLocaleDateString('en-GB', opts);
    if (e.end === e.start) return a;
    return `${a} – ${calendarEvents.fromKey(e.end).toLocaleDateString('en-GB', opts)}`;
  },

  on(key) {
    return (this.events || []).filter(e => e.start <= key && e.end >= key);
  },

  async loadEvents() {
    try {
      this.events = await calendarEvents.list();
      this.failed = false;
    } catch (err) {
      console.warn('[Calendar] could not load events:', err);
      this.events = [];
      this.failed = true;
    }
  },

  // ── Page ─────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'calendar') return;
    const monthName = this.month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const term = window.schoolConfig?.getCurrentTerm?.()?.name;
    const session = window.schoolConfig?.getCurrentAcademicYear?.();

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Calendar</h1>
            <p class="ui-page-sub">${this._esc([term, session].filter(Boolean).join(' · '))}</p>
          </div>
          <div class="ui-actions">
            <div class="app-filters" role="group" aria-label="View">
              <button type="button" class="ui-btn${this.view === 'month' ? ' ui-btn-primary' : ''}" aria-pressed="${this.view === 'month'}" onclick="calendarModule.setView('month')">Month</button>
              <button type="button" class="ui-btn${this.view === 'list' ? ' ui-btn-primary' : ''}" aria-pressed="${this.view === 'list'}" onclick="calendarModule.setView('list')">List</button>
            </div>
            ${this.canEdit() ? '<button type="button" class="ui-btn ui-btn-primary" onclick="calendarModule.showAddEventModal()">Add event</button>' : ''}
          </div>
        </div>

        ${this.failed ? '<div class="ui-card"><p class="ui-empty">The calendar could not be loaded just now. Try again in a moment.</p></div>' : ''}

        ${this.view === 'list' ? this.listHTML() : `
          <div class="cal-layout">
            <section class="ui-card cal-month">
              <div class="ui-card-head">
                <button type="button" class="ui-btn ui-btn-sm" onclick="calendarModule.previousPeriod()" aria-label="Previous month">‹</button>
                <h2 class="ui-card-title">${this._esc(monthName)}</h2>
                <button type="button" class="ui-btn ui-btn-sm" onclick="calendarModule.nextPeriod()" aria-label="Next month">›</button>
              </div>
              ${this.monthHTML()}
              <div class="cal-legend">${this.TYPES.map(([k, l]) => `<span><i class="cal-dot cal-${k}"></i>${l}</span>`).join('')}</div>
            </section>
            <section class="ui-card">${this.dayHTML()}</section>
          </div>`}

        <section class="ui-card">
          <div class="ui-card-head"><h2 class="ui-card-title">Coming up</h2></div>
          ${this.upcomingHTML()}
        </section>
      </div>`;
  },

  monthHTML() {
    const y = this.month.getFullYear(), m = this.month.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
    const today = this.today();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-cell is-blank"></div>');
    for (let d = 1; d <= days; d++) {
      const key = calendarEvents.dayKey(new Date(y, m, d));
      const evs = this.on(key);
      const weekend = [0, 6].includes(new Date(y, m, d).getDay());
      cells.push(`
        <button type="button" class="cal-cell${key === today ? ' is-today' : ''}${key === this.selected ? ' is-on' : ''}${weekend ? ' is-weekend' : ''}"
          onclick="calendarModule.selectDate('${key}')" aria-label="${this._esc(calendarEvents.fromKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}${evs.length ? `, ${evs.length} event${evs.length === 1 ? '' : 's'}` : ''}">
          <span class="cal-num">${d}</span>
          <span class="cal-evs">${evs.slice(0, 2).map(e => `<span class="cal-ev cal-${this._esc(e.type)}">${this._esc(e.title)}</span>`).join('')}${evs.length > 2 ? `<span class="cal-more">+${evs.length - 2}</span>` : ''}</span>
          ${evs.length ? `<span class="cal-dots">${evs.slice(0, 3).map(e => `<i class="cal-dot cal-${this._esc(e.type)}"></i>`).join('')}</span>` : ''}
        </button>`);
    }
    return `
      <div class="cal-grid" role="grid">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-head">${d}</div>`).join('')}
        ${cells.join('')}
      </div>`;
  },

  eventRow(e, withYear = false) {
    const id = this._esc(e.id);
    return `
      <div class="ui-row cal-row">
        <i class="cal-dot cal-${this._esc(e.type)}" aria-hidden="true"></i>
        <div class="ui-row-main">
          <div class="ui-row-title">${this._esc(e.title)}</div>
          <div class="ui-row-meta">${this._esc(this.range(e, withYear))} · ${this._esc(this.typeLabel(e.type))}</div>
          ${e.description ? `<div class="ui-row-meta">${this._esc(e.description)}</div>` : ''}
        </div>
        ${this.canEdit() ? `
          <div class="ui-actions">
            <button type="button" class="ui-btn ui-btn-sm" onclick="calendarModule.showEditEventModal('${id}')">Edit</button>
          </div>` : ''}
      </div>`;
  },

  dayHTML() {
    const key = this.selected;
    const evs = this.on(key);
    const label = calendarEvents.fromKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return `
      <div class="ui-card-head">
        <h2 class="ui-card-title">${this._esc(label)}</h2>
        ${key === this.today() ? '<span class="ui-chip is-good">Today</span>' : ''}
      </div>
      ${this.events === null ? '<p class="ui-empty">Loading…</p>'
        : evs.length ? evs.map(e => this.eventRow(e)).join('')
        : `<p class="ui-empty">Nothing on this day.${this.canEdit() ? ` <button type="button" class="ui-link" onclick="calendarModule.showAddEventModal('${key}')">Add an event</button>` : ''}</p>`}`;
  },

  listHTML() {
    if (this.events === null) return '<section class="ui-card"><p class="ui-empty">Loading…</p></section>';
    const today = this.today();
    const coming = this.events.filter(e => e.end >= today);
    const past = this.events.filter(e => e.end < today).reverse().slice(0, 20);
    return `
      <section class="ui-card">
        <div class="ui-card-head"><h2 class="ui-card-title">Today and after</h2><span class="ui-card-note">${coming.length}</span></div>
        ${coming.length ? coming.map(e => this.eventRow(e, true)).join('') : '<p class="ui-empty">Nothing ahead on the calendar.</p>'}
      </section>
      ${past.length ? `
        <section class="ui-card">
          <div class="ui-card-head"><h2 class="ui-card-title">Recently</h2></div>
          ${past.map(e => this.eventRow(e, true)).join('')}
        </section>` : ''}`;
  },

  /** Events under way today or starting in the next 60 days. */
  upcomingHTML() {
    if (this.events === null) return '<p class="ui-empty">Loading…</p>';
    const today = this.today();
    const limit = calendarEvents.dayKey(new Date(Date.now() + 60 * 864e5));
    const list = this.events.filter(e => e.end >= today && e.start <= limit).slice(0, 6);
    if (!list.length) return '<p class="ui-empty">Nothing in the next two months.</p>';
    return list.map(e => {
      const days = Math.round((calendarEvents.fromKey(e.start) - calendarEvents.fromKey(today)) / 864e5);
      const when = e.start <= today ? 'On now' : days === 1 ? 'Tomorrow' : `In ${days} days`;
      return `
        <div class="ui-row">
          <i class="cal-dot cal-${this._esc(e.type)}" aria-hidden="true"></i>
          <div class="ui-row-main">
            <div class="ui-row-title">${this._esc(e.title)}</div>
            <div class="ui-row-meta">${this._esc(this.range(e))}</div>
          </div>
          <span class="ui-row-meta">${when}</span>
        </div>`;
    }).join('');
  },

  setView(view) {
    this.view = view;
    this.render();
  },

  previousPeriod() {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() - 1, 1);
    this.render();
  },

  nextPeriod() {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + 1, 1);
    this.render();
  },

  selectDate(key) {
    this.selected = calendarEvents.dayKey(key);
    this.render();
  },

  // ── Add, change, delete ──────────────────────────────────

  _form(ev = null, day = null) {
    const e = (v) => this._esc(v ?? '');
    const start = ev?.start || day || this.selected || this.today();
    return `
      <form class="fp-form" onsubmit="calendarModule.submitEvent(event${ev ? `, '${e(ev.id)}'` : ''})">
        <label class="form-group"><span class="form-label">Title</span><input type="text" name="title" class="form-input" required maxlength="255" value="${e(ev?.title)}"></label>
        <div class="fp-grid">
          <label class="form-group"><span class="form-label">From</span><input type="date" name="start" class="form-input" required value="${e(start)}"></label>
          <label class="form-group"><span class="form-label">To (same day if blank)</span><input type="date" name="end" class="form-input" value="${e(ev && ev.end !== ev.start ? ev.end : '')}"></label>
          <label class="form-group"><span class="form-label">Kind</span>
            <select name="type" class="form-select">${this.TYPES.map(([k, l]) => `<option value="${k}" ${(ev?.type || 'event') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <label class="form-group"><span class="form-label">Details</span><textarea name="description" class="form-textarea" rows="3">${e(ev?.description)}</textarea></label>
        <div class="ui-actions" style="justify-content:space-between;">
          ${ev ? `<button type="button" class="ui-btn pc-danger" onclick="calendarModule.deleteEvent('${e(ev.id)}')">Delete</button>` : '<span></span>'}
          <span class="ui-actions">
            <button type="button" class="ui-btn" onclick="closeModal()">Cancel</button>
            <button type="submit" class="ui-btn ui-btn-primary">${ev ? 'Save' : 'Add event'}</button>
          </span>
        </div>
      </form>`;
  },

  showAddEventModal(day) {
    if (!this.canEdit()) return;
    showModal('Add an event', this._form(null, day));
  },

  showEditEventModal(id) {
    const ev = (this.events || []).find(e => String(e.id) === String(id));
    if (ev && this.canEdit()) showModal('Change event', this._form(ev));
  },

  /** The event a form describes, or an error message. */
  readForm(form) {
    const f = new FormData(form);
    const ev = {
      title: String(f.get('title') || '').trim(),
      start: String(f.get('start') || ''),
      end: String(f.get('end') || '') || String(f.get('start') || ''),
      type: String(f.get('type') || 'event'),
      description: String(f.get('description') || '').trim()
    };
    if (!ev.title) return { error: 'Give the event a title' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.start)) return { error: 'Choose the day it starts' };
    if (ev.end < ev.start) return { error: 'It cannot end before it starts' };
    return { ev };
  },

  async submitEvent(e, id) {
    e.preventDefault();
    const { ev, error } = this.readForm(e.target);
    if (error) { showToast(error, 'warning'); return; }
    const btn = e.target.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    try {
      if (id) await calendarEvents.update(id, ev);
      else await calendarEvents.create(ev);
      if (typeof writeAuditLog === 'function') writeAuditLog(id ? 'CALENDAR_EVENT_UPDATED' : 'CALENDAR_EVENT_CREATED', ev.title, `${ev.start} to ${ev.end}`);
      closeModal();
      showToast(id ? 'Event saved' : 'Event added', 'success');
      this.selected = ev.start;
      this.month = new Date(calendarEvents.fromKey(ev.start).getFullYear(), calendarEvents.fromKey(ev.start).getMonth(), 1);
      await this.loadEvents();
      this.render();
    } catch (err) {
      console.error('[Calendar] save failed:', err);
      showToast('Could not save the event: ' + (err.message || 'unknown error'), 'error');
      if (btn) btn.disabled = false;
    }
  },

  async deleteEvent(id) {
    const ev = (this.events || []).find(e => String(e.id) === String(id));
    if (!ev || !confirm(`Delete "${ev.title}" (${this.range(ev, true)})?`)) return;
    try {
      await calendarEvents.remove(id);
      if (typeof writeAuditLog === 'function') writeAuditLog('CALENDAR_EVENT_DELETED', ev.title, `${ev.start} to ${ev.end}`);
      closeModal();
      showToast('Event deleted', 'success');
      await this.loadEvents();
      this.render();
    } catch (err) {
      showToast('Could not delete the event: ' + (err.message || 'unknown error'), 'error');
    }
  }
};
