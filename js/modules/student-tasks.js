// ============================================
// MY TASKS (pupil portal)
// ============================================
// Homework, tests and projects set for the pupil (student_assignments, one
// row per pupil, written by the Assignments page) and their marks.
//
//   to do      not handed in, due today or later
//   late       not handed in, due date passed
//   handed in  waiting for a mark
//   marked     a mark and grade on the school scale
// ============================================

const myTasksModule = {
  _show: 'todo',

  async init(container) {
    this._container = container || document.getElementById('main-content');
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

  _esc(v) {
    return typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  pupil() {
    if (window.familyPortal) return window.familyPortal.child();
    const s = window.authManager?.getSession?.() || {};
    return (dataManager.getAll('students') || []).find(x => (x.authId || x.auth_id) === s.supabaseId) || null;
  },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /** A task's state, from its row and today's date. */
  stateOf(t, today = this.today()) {
    const due = String(t.dueDate || t.due_date || '').slice(0, 10);
    const hasMark = t.score !== null && t.score !== undefined && t.score !== '';
    if (t.status === 'graded' && hasMark) return 'marked';
    if (t.status === 'submitted' || t.status === 'graded') return 'handed';
    if (due && due < today) return 'late';
    return 'todo';
  },

  tasks(kid) {
    const today = this.today();
    return (dataManager.getAll('studentAssignments') || [])
      .filter(t => (t.studentId || t.student_id) === kid.id)
      .map(t => {
        const total = parseFloat(t.totalMarks ?? t.total_marks) || 0;
        const score = t.score !== null && t.score !== undefined && t.score !== '' ? parseFloat(t.score) : null;
        return {
          ...t,
          due: String(t.dueDate || t.due_date || '').slice(0, 10),
          total, score,
          pct: score != null && total ? Math.round((score / total) * 1000) / 10 : null,
          state: this.stateOf(t, today)
        };
      });
  },

  dueLabel(due) {
    if (!due) return 'No due date';
    const today = this.today();
    const days = Math.round((new Date(due + 'T12:00:00') - new Date(today + 'T12:00:00')) / 864e5);
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days > 1 && days < 7) return `Due ${new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}`;
    if (days < 0) return `Was due ${new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    return `Due ${new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  },

  setFilter(v) {
    this._show = v;
    this.render();
  },

  render() {
    if (!this._container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'my-tasks') return;
    const kid = this.pupil();
    if (!kid) {
      this._container.innerHTML = window.familyPortal ? window.familyPortal.noChildHTML('Assignments') : '<div class="ui-page"><p class="ui-empty">Your student record is not linked yet.</p></div>';
      return;
    }
    const all = this.tasks(kid);
    const by = (s) => all.filter(t => t.state === s);
    const todo = by('todo').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const late = by('late').sort((a, b) => a.due.localeCompare(b.due));
    const handed = by('handed').sort((a, b) => b.due.localeCompare(a.due));
    const marked = by('marked').sort((a, b) => b.due.localeCompare(a.due));
    const avg = marked.length ? Math.round((marked.reduce((a, t) => a + t.pct, 0) / marked.length) * 10) / 10 : null;
    const tabs = [['todo', 'To do', todo.length + late.length], ['handed', 'Handed in', handed.length], ['marked', 'Marked', marked.length]];

    const row = (t) => {
      const kind = { assignment: 'Homework', test: 'Test', quiz: 'Quiz', project: 'Project', exam: 'Exam' }[t.type] || 'Homework';
      return `
        <div class="ui-row">
          <span class="ui-dot ${t.state === 'late' ? 'is-urgent' : t.state === 'todo' ? 'is-warn' : t.state === 'handed' ? 'is-info' : ''}" aria-hidden="true"></span>
          <div class="ui-row-main">
            <div class="ui-row-title">${this._esc(t.title || 'Task')}</div>
            <div class="ui-row-meta">${this._esc([t.subjectName || t.subject_name, kind, t.total ? `out of ${t.total}` : ''].filter(Boolean).join(' · '))}</div>
            ${t.remarks ? `<div class="ui-row-meta">“${this._esc(t.remarks)}”</div>` : ''}
          </div>
          ${t.state === 'marked'
            ? `<div class="tk-mark"><strong>${t.score}/${t.total}</strong><span>${t.pct}%${t.grade ? ` · ${this._esc(t.grade)}` : ''}</span></div>`
            : `<span class="ui-chip ${t.state === 'late' ? 'is-warn' : t.state === 'handed' ? 'is-info' : ''}">${t.state === 'handed' ? 'Waiting for a mark' : this.dueLabel(t.due)}</span>`}
        </div>`;
    };

    let body;
    if (this._show === 'handed') body = handed.length ? handed.map(row).join('') : '<p class="ui-empty">Nothing waiting for a mark.</p>';
    else if (this._show === 'marked') body = marked.length ? marked.map(row).join('') : '<p class="ui-empty">No marks yet.</p>';
    else body = (late.length ? `<h3 class="tk-h">Late</h3>${late.map(row).join('')}` : '')
      + (todo.length ? `${late.length ? '<h3 class="tk-h">Coming up</h3>' : ''}${todo.map(row).join('')}` : '')
      || '<p class="ui-empty">Nothing to do. Well done.</p>';

    this._container.innerHTML = `
      <div class="ui-page fam-page">
        <div>
          <h1 class="ui-page-title">Assignments</h1>
          <p class="ui-page-sub">${this._esc(kid.name)} · ${this._esc([kid.grade, kid.section].filter(Boolean).join(' '))}</p>
        </div>

        <div class="fam-tiles tk-tiles">
          <div class="ui-card ui-kpi"><span class="ui-kpi-label">To do</span><span class="ui-kpi-value">${todo.length}</span><span class="ui-kpi-sub">${late.length ? `${late.length} late` : 'none late'}</span></div>
          <div class="ui-card ui-kpi"><span class="ui-kpi-label">Average mark</span><span class="ui-kpi-value">${avg == null ? '—' : avg + '%'}</span><span class="ui-kpi-sub">${marked.length} marked</span></div>
        </div>

        <div role="tablist" aria-label="Assignments" class="sr-tabs">
          ${tabs.map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${this._show === k}" class="sr-tab${this._show === k ? ' is-on' : ''}" onclick="myTasksModule.setFilter('${k}')">${l} (${n})</button>`).join('')}
        </div>

        <section class="ui-card">${all.length ? body : '<p class="ui-empty">No tasks yet. Homework and tests your teachers set appear here.</p>'}</section>
      </div>`;
  }
};

if (typeof window !== 'undefined') {
  window.myTasksModule = myTasksModule;
}
