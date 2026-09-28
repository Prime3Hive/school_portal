// ============================================
// ASSIGNMENTS
// ============================================
// Homework, tests and projects set for a class, and their marks.
//
// Everything lives in student_assignments, one row per pupil: the row is
// what the pupil sees on "My tasks". Its columns are student_id, subject_id,
// subject_name, title, type, status, total_marks, score, grade, due_date,
// submitted_date and remarks. There is no teacher, class or "assignment"
// column, so the old page (which saved one class-level row with those
// fields) lost its teacher and class on reload, and marks it saved never
// linked back. Here an assignment is the set of rows for one class that
// share a title, subject, kind, due date and total marks.
//
// A pupil's row: status 'pending' (not handed in), 'submitted' (handed in,
// not marked) or 'graded' (marked). Grades use the school's scale.
// ============================================

const teacherTasksModule = {
  _f: { q: '', cls: 'all', show: 'open' },
  TYPES: [['assignment', 'Homework'], ['test', 'Test'], ['quiz', 'Quiz'], ['project', 'Project'], ['exam', 'Exam']],

  async init(container) {
    this.container = container || document.getElementById('main-content');
    await dataManager.waitForReady();
    this.render();
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => {
      if (['studentAssignments', 'students'].includes(e.detail?.collection)) this.render();
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers ───────────────────────────────────────────────

  _esc(v) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(v)
      : String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  typeLabel(t) {
    return (this.TYPES.find(([k]) => k === t) || [, 'Homework'])[1];
  },

  day(v) {
    return String(v || '').slice(0, 10);
  },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  dateLabel(v) {
    if (!v) return 'no due date';
    const d = new Date(this.day(v) + 'T12:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  },

  classLabel(grade, section) {
    return [grade, section].filter(Boolean).join(' ');
  },

  gradeRank(g) {
    const i = (schoolConfig.getAllGrades?.() || []).map(x => x.name).indexOf(g);
    return i === -1 ? 99 : i;
  },

  activePupils() {
    return (dataManager.getAll('students') || []).filter(s => String(s.status || 'active').toLowerCase() === 'active');
  },

  classes() {
    const map = new Map();
    this.activePupils().forEach(s => {
      if (!s.grade) return;
      const key = `${s.grade}|${s.section || ''}`;
      if (!map.has(key)) map.set(key, { key, grade: s.grade, section: s.section || '', pupils: [] });
      map.get(key).pupils.push(s);
    });
    return [...map.values()].sort((a, b) => (this.gradeRank(a.grade) - this.gradeRank(b.grade)) || a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section));
  },

  gradeFor(score, total) {
    const pct = total ? (score / total) * 100 : 0;
    return window.scoreBook ? window.scoreBook.gradeFor(pct).grade : (window.pupilData?.gradeFor(pct).letter || '');
  },

  /**
   * Group per-pupil rows into assignments. A row's class is its pupil's
   * class; rows whose pupil has left are kept with the class they had last
   * (unknown, so they group under "Pupils who have left").
   */
  sets(rows = dataManager.getAll('studentAssignments') || [], students = dataManager.getAll('students') || []) {
    const byId = new Map(students.map(s => [s.id, s]));
    const map = new Map();
    rows.forEach(r => {
      const pupil = byId.get(r.studentId || r.student_id);
      const grade = pupil?.grade || '', section = pupil?.section || '';
      const total = parseFloat(r.totalMarks ?? r.total_marks) || 0;
      const due = this.day(r.dueDate || r.due_date);
      const subject = r.subjectName || r.subject_name || '';
      const key = [r.title || '', subject, r.type || 'assignment', due, total, grade, section].join('|');
      if (!map.has(key)) {
        map.set(key, { key, title: r.title || 'Untitled', subjectName: subject, subjectId: r.subjectId || r.subject_id || null, type: r.type || 'assignment', due, total, grade, section, rows: [] });
      }
      map.get(key).rows.push({ ...r, pupil });
    });
    return [...map.values()].map(s => {
      const marked = s.rows.filter(r => r.status === 'graded' && r.score != null && r.score !== '');
      const pcts = marked.map(r => s.total ? (parseFloat(r.score) / s.total) * 100 : 0);
      return {
        ...s,
        pupils: s.rows.length,
        handedIn: s.rows.filter(r => r.status === 'submitted' || r.status === 'graded').length,
        marked: marked.length,
        average: pcts.length ? Math.round((pcts.reduce((a, n) => a + n, 0) / pcts.length) * 10) / 10 : null
      };
    }).sort((a, b) => (b.due || '').localeCompare(a.due || '') || a.title.localeCompare(b.title));
  },

  findSet(key) {
    return this.sets().find(s => s.key === key) || null;
  },

  // ── Page ─────────────────────────────────────────────────

  setFilter(field, value) {
    this._f[field] = value;
    const box = document.getElementById('tt-list');
    if (box) box.innerHTML = this.listHTML();
    if (field === 'q') { const i = document.getElementById('tt-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'teacher-tasks') return;
    const all = this.sets();
    const today = this.today();
    const open = all.filter(s => !s.due || s.due >= today);
    const toMark = all.reduce((a, s) => a + s.rows.filter(r => r.status === 'submitted').length, 0);
    const classes = this.classes();
    const kpi = (label, value, sub, onclick) => `
      <button type="button" class="ui-card ui-kpi" onclick="${onclick}">
        <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
      </button>`;

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Assignments</h1>
            <p class="ui-page-sub">Homework, tests and projects set for a class, and their marks</p>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn ui-btn-primary" onclick="teacherTasksModule.openCreateModal()">Set an assignment</button>
          </div>
        </div>

        <div class="ui-grid-4">
          ${kpi('Still open', open.length, 'due today or later', "teacherTasksModule.setFilter('show','open')")}
          ${kpi('Handed in, not marked', toMark, 'pupils waiting for a mark', "teacherTasksModule.setFilter('show','tomark')")}
          ${kpi('Past due', all.length - open.length, 'due date has passed', "teacherTasksModule.setFilter('show','past')")}
          ${kpi('Classes', new Set(all.map(s => s.grade + '|' + s.section)).size, `of ${classes.length} have assignments`, "teacherTasksModule.setFilter('show','all')")}
        </div>

        <div class="ui-card sd-filters">
          <label class="sd-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
            <input id="tt-q" type="search" aria-label="Search assignments" placeholder="Search by title or subject" value="${this._esc(this._f.q)}" oninput="teacherTasksModule.setFilter('q', this.value)">
          </label>
          <select class="sd-select" aria-label="Class" onchange="teacherTasksModule.setFilter('cls', this.value)">
            <option value="all">All classes</option>
            ${classes.map(c => `<option value="${this._esc(c.key)}" ${this._f.cls === c.key ? 'selected' : ''}>${this._esc(this.classLabel(c.grade, c.section))}</option>`).join('')}
          </select>
          <select class="sd-select" aria-label="Which" onchange="teacherTasksModule.setFilter('show', this.value)">
            ${[['open', 'Still open'], ['tomark', 'Waiting for marks'], ['past', 'Past due'], ['all', 'All']].map(([k, l]) => `<option value="${k}" ${this._f.show === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>

        <section class="ui-card" id="tt-list">${this.listHTML()}</section>
      </div>`;
  },

  listHTML() {
    const today = this.today();
    const q = this._f.q.trim().toLowerCase();
    const list = this.sets()
      .filter(s => this._f.cls === 'all' || `${s.grade}|${s.section}` === this._f.cls)
      .filter(s => this._f.show === 'all'
        || (this._f.show === 'open' && (!s.due || s.due >= today))
        || (this._f.show === 'past' && s.due && s.due < today)
        || (this._f.show === 'tomark' && s.rows.some(r => r.status === 'submitted')))
      .filter(s => !q || [s.title, s.subjectName].some(v => String(v).toLowerCase().includes(q)));

    if (!list.length) {
      return `<p class="ui-empty">${this.sets().length ? 'No assignment matches.' : 'No assignments yet. Use "Set an assignment" to give one to a class.'}</p>`;
    }
    return `
      <div class="ui-card-head"><h2 class="ui-card-title">${list.length} assignment${list.length === 1 ? '' : 's'}</h2><span class="ui-card-note">Latest due date first</span></div>
      ${list.map(s => {
        const key = this._esc(s.key);
        const late = s.due && s.due < today;
        const waiting = s.rows.filter(r => r.status === 'submitted').length;
        return `
          <div class="ui-row tt-row" role="button" tabindex="0" onclick="teacherTasksModule.openSubmissions('${key}')" onkeydown="if(event.key==='Enter')teacherTasksModule.openSubmissions('${key}')">
            <span class="ui-dot ${waiting ? 'is-urgent' : late ? '' : 'is-info'}" aria-hidden="true"></span>
            <div class="ui-row-main">
              <div class="ui-row-title">${this._esc(s.title)}</div>
              <div class="ui-row-meta">${this._esc([this.classLabel(s.grade, s.section) || 'Pupils who have left', s.subjectName, this.typeLabel(s.type), `${s.total} marks`].filter(Boolean).join(' · '))}</div>
            </div>
            <div class="tt-figs">
              <span><strong>${s.handedIn}/${s.pupils}</strong> handed in</span>
              <span><strong>${s.marked}</strong> marked${s.average != null ? ` · avg ${s.average}%` : ''}</span>
            </div>
            <span class="ui-chip ${waiting ? 'is-warn' : late ? '' : 'is-good'}">${waiting ? `${waiting} to mark` : late ? `Was due ${this.dateLabel(s.due)}` : `Due ${this.dateLabel(s.due)}`}</span>
          </div>`;
      }).join('')}`;
  },

  // ── Set, change, delete ──────────────────────────────────

  _form(set = null) {
    const e = (v) => this._esc(v ?? '');
    const subjects = [...(dataManager.getAll('subjectCatalog') || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const classes = this.classes();
    return `
      <form class="fp-form" onsubmit="teacherTasksModule.saveAssignment(event${set ? `, '${e(set.key)}'` : ''})">
        <label class="form-group"><span class="form-label">Title</span><input class="form-input" name="title" required maxlength="200" value="${e(set?.title)}" placeholder="e.g. Fractions worksheet"></label>
        <div class="fp-grid">
          ${set ? `<div class="form-group"><span class="form-label">Class</span><div class="fp-who"><strong>${e(this.classLabel(set.grade, set.section))}</strong><span class="ui-row-meta">${set.pupils} pupils</span></div></div>`
            : `<label class="form-group"><span class="form-label">Class</span>
                <select class="form-select" name="cls" required><option value="">Choose…</option>
                  ${classes.map(c => `<option value="${e(c.key)}" ${this._f.cls === c.key ? 'selected' : ''}>${e(this.classLabel(c.grade, c.section))} (${c.pupils.length} pupils)</option>`).join('')}
                </select></label>`}
          <label class="form-group"><span class="form-label">Subject</span>
            <select class="form-select" name="subjectId" required><option value="">Choose…</option>
              ${subjects.map(s => `<option value="${e(s.id)}" ${(set?.subjectId === s.id || (!set?.subjectId && set?.subjectName === s.name)) ? 'selected' : ''}>${e(s.name)}</option>`).join('')}
            </select></label>
          <label class="form-group"><span class="form-label">Kind</span>
            <select class="form-select" name="type">${this.TYPES.map(([k, l]) => `<option value="${k}" ${(set?.type || 'assignment') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="form-group"><span class="form-label">Due</span><input class="form-input" type="date" name="due" required value="${e(set?.due)}"></label>
          <label class="form-group"><span class="form-label">Out of (marks)</span><input class="form-input" type="number" name="total" min="1" max="1000" step="1" required value="${set ? set.total : 10}"></label>
        </div>
        ${set?.marked ? '<p class="ui-card-note">Changing the marks it is out of re-grades the pupils already marked.</p>' : ''}
        <div class="ui-actions" style="justify-content:space-between;">
          ${set ? `<button type="button" class="ui-btn pc-danger" onclick="teacherTasksModule.deleteAssignment('${e(set.key)}')">Delete</button>` : '<span></span>'}
          <span class="ui-actions">
            <button type="button" class="ui-btn" onclick="closeModal(this)">Cancel</button>
            <button type="submit" class="ui-btn ui-btn-primary">${set ? 'Save' : 'Set it'}</button>
          </span>
        </div>
      </form>`;
  },

  openCreateModal() {
    if (!this.classes().length) { showToast('There are no enrolled pupils to set work for', 'info'); return; }
    createModal('Set an assignment', this._form(), 'large');
  },

  openEditModal(key) {
    const set = this.findSet(key);
    if (set) createModal(`Change · ${this._esc(set.title)}`, this._form(set), 'large');
  },

  _read(form) {
    const f = new FormData(form);
    const subject = (dataManager.getAll('subjectCatalog') || []).find(s => s.id === f.get('subjectId'));
    return {
      title: String(f.get('title') || '').trim(),
      cls: String(f.get('cls') || ''),
      subjectId: subject?.id || null,
      subjectName: subject?.name || '',
      type: String(f.get('type') || 'assignment'),
      dueDate: String(f.get('due') || ''),
      totalMarks: Math.max(1, parseInt(f.get('total'), 10) || 0)
    };
  },

  /** Insert many rows in one request, then reload the cache. */
  async _insertRows(rows) {
    if (!rows.length) return true;
    if (!window.supabaseReady) { for (const r of rows) await dataManager.create('studentAssignments', r); return true; }
    const table = 'student_assignments';
    const built = rows.map(r => { const row = dataManager._buildRow(table, r); if (!row.id) row.id = dataManager._generateUUID(); return row; });
    const { error } = await supabaseClient.from(table).insert(built);
    if (error) { showToast('Not saved: ' + error.message, 'error'); return false; }
    await dataManager.refresh('studentAssignments');
    return true;
  },

  async saveAssignment(e, key) {
    e.preventDefault();
    const d = this._read(e.target);
    if (!d.title || !d.subjectId || !d.dueDate) { showToast('Fill in the title, subject and due date', 'warning'); return; }
    const btn = e.target.querySelector('[type=submit]');
    if (btn) btn.disabled = true;

    if (key) {
      const set = this.findSet(key);
      if (!set) return;
      let failed = 0;
      for (const r of set.rows) {
        const marked = r.status === 'graded' && r.score != null && r.score !== '';
        const ok = await dataManager.update('studentAssignments', r.id, {
          title: d.title, subjectId: d.subjectId, subjectName: d.subjectName, type: d.type, dueDate: d.dueDate, totalMarks: d.totalMarks,
          ...(marked ? { grade: this.gradeFor(parseFloat(r.score), d.totalMarks) } : {})
        });
        if (!ok) failed++;
      }
      closeModal();
      showToast(failed ? `Saved for ${set.rows.length - failed} of ${set.rows.length} pupils` : 'Saved', failed ? 'warning' : 'success');
    } else {
      const cls = this.classes().find(c => c.key === d.cls);
      if (!cls) { showToast('Choose a class', 'warning'); if (btn) btn.disabled = false; return; }
      const rows = cls.pupils.map(p => ({
        studentId: p.id, subjectId: d.subjectId, subjectName: d.subjectName, title: d.title, type: d.type,
        status: 'pending', totalMarks: d.totalMarks, dueDate: d.dueDate, score: null, grade: null
      }));
      const ok = await this._insertRows(rows);
      if (!ok) { if (btn) btn.disabled = false; return; }
      if (typeof writeAuditLog === 'function') writeAuditLog('ASSIGNMENT_SET', d.title, `${this.classLabel(cls.grade, cls.section)} | ${d.subjectName} | due ${d.dueDate}`);
      closeModal();
      showToast(`Set for ${rows.length} pupils in ${this.classLabel(cls.grade, cls.section)}`, 'success');
    }
    this.render();
  },

  async deleteAssignment(key) {
    const set = this.findSet(key);
    if (!set) return;
    if (!confirm(`Delete "${set.title}" for ${this.classLabel(set.grade, set.section)}? ${set.marked ? `${set.marked} marks will be lost. ` : ''}Pupils will no longer see it.`)) return;
    let ok = true;
    if (window.supabaseReady) {
      const { error } = await supabaseClient.from('student_assignments').delete().in('id', set.rows.map(r => r.id));
      if (error) { showToast('Not deleted: ' + error.message, 'error'); ok = false; }
      else await dataManager.refresh('studentAssignments');
    } else {
      for (const r of set.rows) await dataManager.delete('studentAssignments', r.id);
    }
    if (!ok) return;
    if (typeof writeAuditLog === 'function') writeAuditLog('ASSIGNMENT_DELETED', set.title, `${this.classLabel(set.grade, set.section)} | ${set.rows.length} rows`);
    closeModal();
    showToast('Deleted', 'success');
    this.render();
  },

  // ── Marks ────────────────────────────────────────────────

  openSubmissions(key) {
    const set = this.findSet(key);
    if (!set) return;
    const e = (v) => this._esc(v ?? '');
    const byPupil = new Map(set.rows.map(r => [r.studentId || r.student_id, r]));
    // Pupils in the class now (a pupil who joined later has no row yet), then rows for pupils who have left.
    const current = this.activePupils().filter(p => set.grade && p.grade === set.grade && (p.section || '') === set.section);
    const lines = [
      ...current.map(p => ({ pupil: p, row: byPupil.get(p.id) || null })),
      ...set.rows.filter(r => !current.some(p => p.id === (r.studentId || r.student_id))).map(r => ({ pupil: r.pupil || { id: r.studentId || r.student_id, name: 'Pupil who has left' }, row: r }))
    ].sort((a, b) => String(a.pupil.name || '').localeCompare(String(b.pupil.name || '')));

    createModal(`${e(set.title)} · ${e(this.classLabel(set.grade, set.section))}`, `
      <p class="ui-card-note">${e([set.subjectName, this.typeLabel(set.type), `due ${this.dateLabel(set.due)}`, `out of ${set.total}`].join(' · '))}.
      A mark saves the pupil as marked; leave it blank and tick "Handed in" for work not yet marked.</p>
      <form id="tt-marks" class="tt-marks" onsubmit="teacherTasksModule.saveMarks(event, '${e(set.key)}')">
        <table class="pc-table sr-table tt-marks-table">
          <thead><tr><th>Pupil</th><th>Handed in</th><th>Mark /${set.total}</th><th>Grade</th></tr></thead>
          <tbody>${lines.map(({ pupil, row }) => {
            const pid = e(pupil.id);
            const score = row && row.score != null && row.score !== '' ? row.score : '';
            return `<tr>
              <td>${e(pupil.name)}${row ? '' : ' <span class="ui-row-meta">joined later</span>'}</td>
              <td><input type="checkbox" name="in_${pid}" aria-label="Handed in: ${e(pupil.name)}" ${row && (row.status === 'submitted' || row.status === 'graded') ? 'checked' : ''}></td>
              <td><input type="number" class="fp-in fp-amt" style="width:84px;" name="score_${pid}" min="0" max="${set.total}" step="0.5" value="${e(score)}" aria-label="Mark for ${e(pupil.name)}"
                oninput="teacherTasksModule._previewGrade(this, ${set.total}, 'g_${pid}')"></td>
              <td id="g_${pid}">${score !== '' ? e(this.gradeFor(parseFloat(score), set.total)) : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        <div class="ui-actions" style="justify-content:space-between;margin-top:16px;flex-wrap:wrap;">
          <span class="ui-actions">
            <button type="button" class="ui-btn" onclick="closeModal(this); teacherTasksModule.openEditModal('${e(set.key)}')">Change details</button>
            <button type="button" class="ui-btn" onclick="teacherTasksModule.exportSubmissions('${e(set.key)}')">Export CSV</button>
          </span>
          <span class="ui-actions">
            <button type="button" class="ui-btn" onclick="closeModal(this)">Close</button>
            <button type="submit" class="ui-btn ui-btn-primary">Save marks</button>
          </span>
        </div>
      </form>`, 'large');
  },

  _previewGrade(input, total, cellId) {
    const cell = document.getElementById(cellId);
    const n = parseFloat(input.value);
    if (!cell) return;
    cell.textContent = input.value === '' || isNaN(n) ? '—' : n < 0 || n > total ? `0–${total}` : this.gradeFor(n, total);
    if (input.value !== '') { const box = input.closest('tr')?.querySelector('input[type=checkbox]'); if (box) box.checked = true; }
  },

  /** What a pupil's row should become, given the form: null if nothing to save. */
  markChange(row, handedIn, scoreText, total) {
    const had = row && row.score != null && row.score !== '' ? parseFloat(row.score) : null;
    if (scoreText !== '') {
      const score = parseFloat(scoreText);
      if (isNaN(score) || score < 0 || score > total) return { error: true };
      if (row && row.status === 'graded' && had === score) return null;
      return { score, grade: this.gradeFor(score, total), status: 'graded', submittedDate: row?.submittedDate || row?.submitted_date || new Date().toISOString() };
    }
    const status = handedIn ? 'submitted' : 'pending';
    if (row && row.status === status && had == null) return null;
    if (!row && !handedIn) return null;
    return { score: null, grade: null, status, submittedDate: handedIn ? (row?.submittedDate || row?.submitted_date || new Date().toISOString()) : null };
  },

  async saveMarks(e, key) {
    e.preventDefault();
    const set = this.findSet(key);
    if (!set) return;
    const form = e.target;
    const byPupil = new Map(set.rows.map(r => [r.studentId || r.student_id, r]));
    const updates = [], inserts = [], bad = [];
    form.querySelectorAll('input[name^="score_"]').forEach(input => {
      const pid = input.name.slice(6);
      const row = byPupil.get(pid) || null;
      const handedIn = !!form.querySelector(`input[name="in_${CSS.escape(pid)}"]`)?.checked;
      const change = this.markChange(row, handedIn, input.value.trim(), set.total);
      if (!change) return;
      if (change.error) { bad.push(pid); return; }
      if (row) updates.push([row.id, change]);
      else inserts.push({ studentId: pid, subjectId: set.subjectId, subjectName: set.subjectName, title: set.title, type: set.type, totalMarks: set.total, dueDate: set.due, ...change });
    });
    if (bad.length) { showToast(`Marks must be between 0 and ${set.total}`, 'warning'); return; }
    if (!updates.length && !inserts.length) { showToast('Nothing changed', 'info'); return; }

    const btn = form.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    let failed = 0;
    for (const [id, change] of updates) if (!(await dataManager.update('studentAssignments', id, change))) failed++;
    if (inserts.length && !(await this._insertRows(inserts))) failed += inserts.length;
    closeModal();
    showToast(failed ? `${failed} could not be saved` : `Saved ${updates.length + inserts.length} pupil${updates.length + inserts.length === 1 ? '' : 's'}`, failed ? 'warning' : 'success');
    this.render();
  },

  exportSubmissions(key) {
    const set = this.findSet(key);
    if (!set) return;
    const cell = (v) => { const s = String(v ?? ''); return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
    const rows = [['Pupil', 'Admission no.', 'Status', 'Mark', 'Out of', 'Percent', 'Grade'],
      ...set.rows.map(r => {
        const score = r.score != null && r.score !== '' ? parseFloat(r.score) : '';
        return [r.pupil?.name || '', r.pupil?.rollNo || '', r.status === 'graded' ? 'Marked' : r.status === 'submitted' ? 'Handed in' : 'Not handed in',
          score, set.total, score === '' ? '' : Math.round((score / set.total) * 1000) / 10, r.grade || ''];
      })];
    const blob = new Blob([rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${set.title.replace(/[^A-Za-z0-9]+/g, '_')}_${this.classLabel(set.grade, set.section).replace(/\s+/g, '_')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
};

if (typeof window !== 'undefined') window.teacherTasksModule = teacherTasksModule;
