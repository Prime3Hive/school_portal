// ============================================
// TEACHER · MY STUDENTS
// ============================================
// The pupils in a teacher's classes, with this term's average from the
// marks already entered, and a way to reach each family. Replaces the old
// card grid, which offered a filter chip for every class in the school.
//
// Registered as myClassesModule so the existing #my-classes link keeps
// working; teacher-portal.js defines an older one that this replaces.
// ============================================

window.myClassesModule = {
  _class: null,   // "grade|section", or 'all'
  _search: '',

  async init(container) {
    this.container = container;
    if (dataManager?.waitForReady) await dataManager.waitForReady();
    const mine = this.myClasses();
    if (!this._class) this._class = mine[0] ? this.key(mine[0]) : 'all';
    this.render();
    this._onDataChange = (e) => {
      if (['students', 'grades', 'classes', 'schoolSchedules', 'teacherAssessments'].includes(e.detail?.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  esc(v) {
    return window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  key(c) {
    return `${c.grade}|${c.section || ''}`;
  },

  label(c) {
    return [c.grade, c.section].filter(Boolean).join(' ');
  },

  /** Classes linked to this teacher — the same rule as their Today page. */
  myClasses() {
    return window.teacherTodayModule?.data?.().classes || [];
  },

  allClasses() {
    const out = [];
    (window.schoolConfig?.getAllGrades?.() || []).forEach(g => (g.sections || ['A']).forEach(sec => out.push({ grade: g.name, section: sec })));
    return out;
  },

  pupils() {
    const active = (dataManager.getAll('students') || []).filter(s => String(s.status || 'active').toLowerCase() === 'active');
    const q = this._search.trim().toLowerCase();
    return active
      .filter(s => {
        if (this._class === 'all') return true;
        const [g, sec] = this._class.split('|');
        return s.grade === g && (!sec || s.section === sec);
      })
      .filter(s => !q || String(s.name || '').toLowerCase().includes(q) || String(s.rollNo || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  },

  /** This term's marks for a pupil, pooled into one percentage. */
  termAverage(studentId) {
    const term = window.schoolConfig?.getCurrentTerm?.()?.name || '';
    const year = String(window.schoolConfig?.getCurrentAcademicYear?.() || '').replace('/', '-');
    let score = 0, total = 0, n = 0;
    (dataManager.getAll('grades') || []).forEach(g => {
      if ((g.studentId || g.student_id) !== studentId) return;
      if (String(g.term || '') !== term || String(g.academicYear || g.academic_year || '').replace('/', '-') !== year) return;
      score += parseFloat(g.score) || 0;
      total += parseFloat(g.totalMarks ?? g.total_marks) || 0;
      n++;
    });
    if (!total) return { pct: null, n };
    const pct = Math.round((score / total) * 1000) / 10;
    return { pct, n, grade: window.scoreBook?.gradeFor(pct).grade || '' };
  },

  phone(s) {
    for (const k of ['mother', 'father', 'guardian']) {
      let p = s[k];
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
      if (p && String(p.phone || '').trim()) return { who: k === 'guardian' ? (p.relationship || 'Guardian') : k[0].toUpperCase() + k.slice(1), phone: String(p.phone).trim() };
    }
    return null;
  },

  pick(value) {
    this._class = value;
    this.render();
  },

  search(value) {
    this._search = value;
    const box = document.getElementById('tsd-list');
    if (box) box.innerHTML = this.listHTML();
  },

  listHTML() {
    const pupils = this.pupils();
    if (!pupils.length) {
      return `<p class="ui-empty" style="padding:16px 20px;">${this._search ? 'No pupil matches that search.' : 'No enrolled pupils in this class.'}</p>`;
    }
    return pupils.map(s => {
      const avg = this.termAverage(s.id);
      const ph = this.phone(s);
      const att = Number(s.attendance);
      return `
      <div class="tsd-row">
        <span class="sd-who">
          <span class="sd-avatar" aria-hidden="true">${this.esc(String(s.name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>
          <span><span class="sd-name">${this.esc(s.name || 'Unnamed')}</span><span class="ui-row-meta">${this.esc(this.label(s))}${s.rollNo ? ' · ' + this.esc(s.rollNo) : ''}</span></span>
        </span>
        <span class="tsd-cell">${avg.pct == null ? '<span class="ui-row-meta">No marks yet</span>' : `<strong>${avg.pct}%</strong> <span class="ui-row-meta">${this.esc(avg.grade)} · ${avg.n} ${avg.n === 1 ? 'mark' : 'marks'}</span>`}</span>
        <span class="tsd-cell">${Number.isFinite(att) && s.attendance !== null && s.attendance !== '' ? `${Math.round(att)}%` : '<span class="ui-row-meta">—</span>'}</span>
        <span class="tsd-cell">${ph ? `<a class="ui-btn ui-btn-sm" href="tel:${this.esc(ph.phone.replace(/[^\d+]/g, ''))}" aria-label="Call ${this.esc(s.name)}'s ${this.esc(ph.who.toLowerCase())}">Call ${this.esc(ph.who.toLowerCase())}</a>` : '<span class="ui-chip is-warn">No phone</span>'}</span>
      </div>`;
    }).join('');
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'my-classes') return;

    const mine = this.myClasses();
    const mineKeys = new Set(mine.map(c => this.key(c)));
    const others = this.allClasses().filter(c => !mineKeys.has(this.key(c)));
    const count = this.pupils().length;

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">My students</h1>
            <p class="ui-page-sub">${count} ${count === 1 ? 'pupil' : 'pupils'} · averages are this term's marks so far</p>
          </div>
        </div>

        ${mine.length ? `
          <div class="tsd-chips" role="group" aria-label="Your classes">
            ${mine.map(c => `<button type="button" class="pc-tab${this._class === this.key(c) ? ' is-on' : ''}" aria-pressed="${this._class === this.key(c)}" onclick="myClassesModule.pick('${this.esc(this.key(c))}')">${this.esc(this.label(c))}</button>`).join('')}
          </div>` : ''}

        <div class="ui-card sd-filters">
          <label class="sd-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
            <input type="search" aria-label="Search pupils" placeholder="Search by name" value="${this.esc(this._search)}" oninput="myClassesModule.search(this.value)">
          </label>
          <select class="sd-select" aria-label="Class" onchange="myClassesModule.pick(this.value)">
            ${mine.length ? `<optgroup label="Your classes">${mine.map(c => `<option value="${this.esc(this.key(c))}" ${this._class === this.key(c) ? 'selected' : ''}>${this.esc(this.label(c))}</option>`).join('')}</optgroup>` : ''}
            <optgroup label="${mine.length ? 'Other classes' : 'Classes'}">
              <option value="all" ${this._class === 'all' ? 'selected' : ''}>Whole school</option>
              ${others.map(c => `<option value="${this.esc(this.key(c))}" ${this._class === this.key(c) ? 'selected' : ''}>${this.esc(this.label(c))}</option>`).join('')}
            </optgroup>
          </select>
        </div>

        <div class="ui-card tsd-table">
          <div class="tsd-row tsd-head"><span>Pupil</span><span>This term</span><span>Attendance</span><span>Family</span></div>
          <div id="tsd-list">${this.listHTML()}</div>
        </div>
      </div>`;
  }
};
