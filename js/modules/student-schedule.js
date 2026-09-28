// ============================================
// MY TIMETABLE (pupil portal)
// ============================================
// The pupil's week from their class timetable (pupilData.timetable, the
// same source as "Today's lessons" on the home page). Built for a phone:
// one day at a time, with the lesson on now and the next one marked.
// ============================================

const studentScheduleModule = {
  day: null,

  async init(container) {
    this._container = container || document.getElementById('main-content');
    await dataManager.waitForReady();
    if (!this.day) this.day = this.defaultDay();
    this.render();
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => {
      if (['studentSchedules', 'schoolSchedules', 'students'].includes(e.detail?.collection)) this.render();
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],

  _esc(v) {
    return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  today() {
    return new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  },

  /** Today on a school day; Monday at the weekend. */
  defaultDay() {
    return this.DAYS.includes(this.today()) ? this.today() : 'Monday';
  },

  pupil() {
    if (window.familyPortal) return window.familyPortal.child();
    const s = window.authManager?.getSession?.() || {};
    return (dataManager.getAll('students') || []).find(x => (x.authId || x.auth_id) === s.supabaseId) || null;
  },

  clock(v) {
    const m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    const h = +m[1];
    return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
  },

  nowHM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  switchDay(day) {
    this.day = day;
    this.render();
  },

  render() {
    if (!this._container) return;
    if (window.app?.currentModule && !['my-schedule', 'student-schedule'].includes(window.app.currentModule)) return;
    const kid = this.pupil();
    if (!kid) {
      this._container.innerHTML = window.familyPortal ? window.familyPortal.noChildHTML('Timetable') : '<div class="ui-page"><p class="ui-empty">Your student record is not linked yet.</p></div>';
      return;
    }
    const week = pupilData.timetable(kid);
    const total = this.DAYS.reduce((a, d) => a + week[d].length, 0);
    const isToday = this.day === this.today();
    const now = this.nowHM();
    const lessons = week[this.day];
    const current = isToday ? lessons.find(l => l.start && l.end && l.start <= now && now < l.end) : null;
    const next = isToday ? lessons.find(l => l.start && l.start > now) : null;

    this._container.innerHTML = `
      <div class="ui-page fam-page">
        <div>
          <h1 class="ui-page-title">Timetable</h1>
          <p class="ui-page-sub">${this._esc(kid.name)} · ${this._esc([kid.grade, kid.section].filter(Boolean).join(' '))}</p>
        </div>

        ${total ? `
          <div class="sch-days" role="tablist" aria-label="Day">
            ${this.DAYS.map(d => `<button type="button" role="tab" aria-selected="${d === this.day}" class="sch-day${d === this.day ? ' is-on' : ''}" onclick="studentScheduleModule.switchDay('${d}')">
              <span>${d.slice(0, 3)}</span><small>${week[d].length}</small>${d === this.today() ? '<i aria-label="today"></i>' : ''}
            </button>`).join('')}
          </div>

          <section class="ui-card">
            <div class="ui-card-head">
              <h2 class="ui-card-title">${this.day}${isToday ? ' · today' : ''}</h2>
              <span class="ui-card-note">${lessons.length} lesson${lessons.length === 1 ? '' : 's'}</span>
            </div>
            ${lessons.length ? lessons.map(l => `
              <div class="ui-row sch-lesson${l === current ? ' is-now' : ''}">
                <div class="sch-time"><strong>${this._esc(this.clock(l.start) || '—')}</strong><span>${this._esc(this.clock(l.end))}</span></div>
                <div class="ui-row-main">
                  <div class="ui-row-title">${this._esc(l.subject)}</div>
                  <div class="ui-row-meta">${this._esc([l.teacher, l.room && `Room ${l.room}`].filter(Boolean).join(' · ') || ' ')}</div>
                </div>
                ${l === current ? '<span class="ui-chip is-good">Now</span>' : l === next ? '<span class="ui-chip is-info">Next</span>' : ''}
              </div>`).join('')
            : '<p class="ui-empty">No lessons on this day.</p>'}
          </section>`
        : `<section class="ui-card"><p class="ui-empty">Your class timetable has not been added yet. It appears here once the school enters it.</p></section>`}
      </div>`;
  }
};

if (typeof window !== 'undefined') {
  window.studentScheduleModule = studentScheduleModule;
  window.myScheduleModule = studentScheduleModule;
}
