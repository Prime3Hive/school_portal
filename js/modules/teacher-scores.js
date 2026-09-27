// ============================================
// ENTER SCORES — one assessment, one class, one column
// ============================================
// A teacher picks an assessment and types marks down a single column, as on
// paper. A mark over the maximum is flagged the moment it is typed and is
// never saved. Typed marks are kept on this device (see scoreBook drafts)
// until they are saved, so a dropped connection or a closed tab loses
// nothing. Saving goes through scoreBook.save(), which updates a pupil's
// existing grade instead of adding a second one.
// ============================================

const teacherScoresModule = {
  assessmentId: null,
  _rows: new Map(),   // studentId → { score, remarks, dirty }
  _busy: false,

  async init(container) {
    this.container = container;
    if (dataManager?.waitForReady) await dataManager.waitForReady();
    const list = this.assessments();
    if (!list.some(a => a.id === this.assessmentId)) this.assessmentId = this._defaultAssessment(list);
    this._load();
    this.render();

    this._onDataChange = (e) => {
      if (this._busy) return;
      if (['grades', 'teacherAssessments', 'assessments'].includes(e.detail?.collection) && !this._hasUnsaved()) {
        this._load();
        this.render();
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Data ──────────────────────────────────────────────────

  esc(v) {
    return window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  /**
   * Assessments set by teachers and by the school: ones already taken,
   * newest first, then ones still to come, soonest first.
   */
  assessments() {
    const tag = (list, source) => (list || []).map(a => ({ ...a, _source: source }));
    const today = new Date().toISOString().slice(0, 10);
    const taken = (a) => !a.date || String(a.date).slice(0, 10) <= today;
    return [...tag(dataManager.getAll('teacherAssessments'), 'teacher'), ...tag(dataManager.getAll('assessments'), 'school')]
      .filter(a => a.id && a.grade)
      .sort((a, b) => (taken(b) - taken(a)) ||
        (taken(a) ? String(b.date || '').localeCompare(String(a.date || '')) : String(a.date || '').localeCompare(String(b.date || ''))));
  },

  /** Where to open: the newest taken assessment with marks still missing. */
  _defaultAssessment(list) {
    const today = new Date().toISOString().slice(0, 10);
    const done = scoreBook.existing;
    const open = list.find(a => (!a.date || String(a.date).slice(0, 10) <= today) && done(a.id).size < this.students(a).length);
    return (open || list[0])?.id || null;
  },

  current() {
    return this.assessments().find(a => a.id === this.assessmentId) || null;
  },

  title(a) {
    return a.name || a.title || (a.type ? a.type[0].toUpperCase() + a.type.slice(1) : 'Assessment');
  },

  classLabel(a) {
    return [a.grade, a.section].filter(Boolean).join(' ');
  },

  students(a) {
    if (!a) return [];
    return (dataManager.getAll('students') || [])
      .filter(s => String(s.status || 'active').toLowerCase() === 'active')
      .filter(s => s.grade === a.grade && (!a.section || s.section === a.section))
      .sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')));
  },

  /** Saved grades, then any draft on this device over the top. */
  _load() {
    this._rows = new Map();
    const a = this.current();
    if (!a) return;
    const saved = scoreBook.existing(a.id);
    this.students(a).forEach(s => {
      const g = saved.get(s.id);
      this._rows.set(s.id, { score: g ? String(g.score ?? '') : '', remarks: g?.remarks || '', savedScore: g ? String(g.score ?? '') : '', savedRemarks: g?.remarks || '', dirty: false });
    });
    const draft = scoreBook.readDraft(a.id);
    this._draftAt = null;
    if (draft?.rows) {
      Object.entries(draft.rows).forEach(([id, d]) => {
        const r = this._rows.get(id);
        if (!r) return;
        if (d.score !== r.savedScore || d.remarks !== r.savedRemarks) {
          Object.assign(r, { score: d.score, remarks: d.remarks, dirty: true });
          this._draftAt = draft.at;
        }
      });
    }
  },

  _hasUnsaved() {
    return [...this._rows.values()].some(r => r.dirty);
  },

  summary() {
    const a = this.current();
    const max = scoreBook.outOf(a);
    const rows = [...this._rows.entries()];
    const entered = rows.filter(([, r]) => String(r.score).trim() !== '' && !scoreBook.problem(r.score, max));
    const nums = entered.map(([, r]) => Number(r.score));
    const problems = rows.filter(([, r]) => scoreBook.problem(r.score, max));
    const missing = rows.filter(([, r]) => String(r.score).trim() === '');
    const names = new Map(this.students(a).map(s => [s.id, s.name]));
    return {
      max,
      total: rows.length,
      entered: entered.length,
      average: nums.length ? Math.round((nums.reduce((x, y) => x + y, 0) / nums.length) * 10) / 10 : null,
      high: nums.length ? Math.max(...nums) : null,
      low: nums.length ? Math.min(...nums) : null,
      problems: problems.length,
      missingNames: missing.map(([id]) => names.get(id)).filter(Boolean),
      unsaved: rows.filter(([, r]) => r.dirty).length
    };
  },

  // ── Typing ────────────────────────────────────────────────

  pick(id) {
    if (this._hasUnsaved() && !confirm('You have marks that are not saved yet. They stay on this device, and will be here when you come back to this assessment. Switch anyway?')) {
      const sel = document.getElementById('ts-assessment');
      if (sel) sel.value = this.assessmentId;
      return;
    }
    this.assessmentId = id;
    this._load();
    this.render();
  },

  onInput(studentId, field, value) {
    const r = this._rows.get(studentId);
    if (!r) return;
    r[field] = value;
    r.dirty = r.score !== r.savedScore || r.remarks !== r.savedRemarks;
    if (field === 'score') this._paintRow(studentId);
    this._saveDraftSoon();
    this._paintSummary();
  },

  /** Enter moves down the column, like a register. */
  onKey(e, index) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.querySelector(`[data-ts-index="${index + (e.shiftKey ? -1 : 1)}"]`);
    if (next) { next.focus(); next.select?.(); }
  },

  _saveDraftSoon() {
    clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => {
      const a = this.current();
      if (!a) return;
      const rows = {};
      this._rows.forEach((r, id) => { if (r.dirty) rows[id] = { score: r.score, remarks: r.remarks }; });
      if (Object.keys(rows).length) scoreBook.writeDraft(a.id, { rows });
      else scoreBook.clearDraft(a.id);
      this._draftAt = Date.now();
      this._paintSummary();
    }, 400);
  },

  _paintRow(studentId) {
    const a = this.current();
    const max = scoreBook.outOf(a);
    const r = this._rows.get(studentId);
    const bad = scoreBook.problem(r.score, max);
    const input = document.querySelector(`[data-ts-score="${CSS.escape(studentId)}"]`);
    const gradeEl = document.querySelector(`[data-ts-grade="${CSS.escape(studentId)}"]`);
    const errEl = document.querySelector(`[data-ts-err="${CSS.escape(studentId)}"]`);
    if (input) { input.classList.toggle('is-bad', !!bad); input.setAttribute('aria-invalid', bad ? 'true' : 'false'); }
    if (errEl) errEl.textContent = bad;
    if (gradeEl) {
      const v = String(r.score).trim();
      gradeEl.textContent = v === '' || bad ? '—' : scoreBook.gradeFor((Number(v) / max) * 100).grade;
    }
  },

  _paintSummary() {
    const box = document.getElementById('ts-summary');
    if (box) box.innerHTML = this.summaryHTML();
  },

  async save() {
    const a = this.current();
    if (!a) return;
    const s = this.summary();
    if (s.problems) { showToast('Fix the marks shown in red first.', 'warning'); return; }
    const rows = [...this._rows.entries()].filter(([, r]) => r.dirty).map(([studentId, r]) => ({ studentId, score: r.score, remarks: r.remarks }));
    if (!rows.length) return;

    this._busy = true;
    const btn = document.getElementById('ts-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const res = await scoreBook.save(a, rows);
    this._busy = false;

    if (res.failed) {
      showToast(`${res.failed} could not be saved. They are still on this device; try again.`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Save marks'; }
      return;
    }
    scoreBook.clearDraft(a.id);
    if (typeof writeAuditLog === 'function') {
      writeAuditLog('GRADES_SAVED', this.title(a), `${res.created + res.updated} marks · ${a.subject || ''} · ${this.classLabel(a)}`);
    }
    showToast(`Saved ${res.created + res.updated} ${res.created + res.updated === 1 ? 'mark' : 'marks'}${res.updated ? ` (${res.updated} corrected)` : ''}.`, 'success');
    this._load();
    this.render();
  },

  discard() {
    const a = this.current();
    if (!a || !confirm('Throw away the marks you have not saved?')) return;
    scoreBook.clearDraft(a.id);
    this._load();
    this.render();
  },

  // ── Page ──────────────────────────────────────────────────

  summaryHTML() {
    const s = this.summary();
    const pct = s.total ? Math.round((s.entered / s.total) * 100) : 0;
    return `
      <section class="ui-card" aria-labelledby="ts-prog">
        <h2 class="ui-card-title" id="ts-prog">Progress</h2>
        <div style="display:flex; align-items:baseline; gap:8px; margin:8px 0 10px;">
          <span class="sr-big">${s.entered} of ${s.total}</span><span class="ui-card-note">entered</span>
        </div>
        <div class="ui-bar" role="img" aria-label="${pct}% entered"><span style="width:${pct}%"></span></div>
        <div class="ts-stats">
          <div><span>Average</span><strong>${s.average ?? '—'}</strong></div>
          <div><span>Highest</span><strong>${s.high ?? '—'}</strong></div>
          <div><span>Lowest</span><strong>${s.low ?? '—'}</strong></div>
        </div>
      </section>
      ${s.problems ? `<p class="pc-note is-warn" style="margin:0;">${s.problems} ${s.problems === 1 ? 'mark needs' : 'marks need'} fixing before you can save.</p>` : ''}
      ${s.missingNames.length ? `
        <section class="ui-card">
          <h2 class="ui-card-title" style="font-size:1rem;">Still to enter</h2>
          <p class="ui-row-meta" style="margin:6px 0 0;">${this.esc(s.missingNames.slice(0, 4).join(', '))}${s.missingNames.length > 4 ? ` and ${s.missingNames.length - 4} more` : ''}.</p>
        </section>` : ''}
      <button type="button" class="ui-btn ui-btn-primary ts-save" id="ts-save" ${s.unsaved && !s.problems ? '' : 'disabled'} onclick="teacherScoresModule.save()">
        ${s.unsaved ? `Save ${s.unsaved} ${s.unsaved === 1 ? 'mark' : 'marks'}` : s.entered ? 'All marks saved' : 'Nothing to save yet'}
      </button>
      <p class="ui-row-meta" style="margin:0; text-align:center;">${s.unsaved
        ? `Kept on this device until you save. <button type="button" class="ui-link" style="font-size:inherit;" onclick="teacherScoresModule.discard()">Discard</button>`
        : 'Press Enter to move down the column.'}</p>`;
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'teacher-scores') return;

    const list = this.assessments();
    const a = this.current();

    if (!list.length) {
      this.container.innerHTML = `
        <div class="ui-page">
          <div class="ui-page-head"><div><h1 class="ui-page-title">Enter scores</h1></div></div>
          <section class="ui-card">
            <h2 class="ui-card-title">No assessments yet</h2>
            <p class="ui-empty">Marks are entered against an assessment: a test, classwork or an exam. Create one in Classes &amp; lessons, then come back here.</p>
            <button type="button" class="ui-btn ui-btn-sm" onclick="window.app.loadModule('academics', { tab: 'assessments' })">Create an assessment</button>
          </section>
        </div>`;
      return;
    }

    const byClass = new Map();
    list.forEach(x => {
      const k = this.classLabel(x) || 'No class';
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k).push(x);
    });
    const order = (window.schoolConfig?.getAllGrades?.() || []).map(g => g.name);
    const rank = (grade) => { const i = order.indexOf(grade); return i === -1 ? 99 : i; };
    const groups = [...byClass.entries()].sort((x, y) => rank(x[1][0].grade) - rank(y[1][0].grade) || x[0].localeCompare(y[0]));

    const max = scoreBook.outOf(a);
    const students = this.students(a);

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">${this.esc([this.classLabel(a), a.subject].filter(Boolean).join(' · ') || 'Enter scores')}</h1>
            <p class="ui-page-sub">${this.esc([this.title(a), `marked out of ${max}`, a.date ? new Date(a.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '', scoreBook.termOf(a)].filter(Boolean).join(' · '))}</p>
          </div>
          <label class="ts-picker">
            <span>Assessment</span>
            <select id="ts-assessment" onchange="teacherScoresModule.pick(this.value)">
              ${groups.map(([label, items]) => `
                <optgroup label="${this.esc(label)}">
                  ${items.map(x => `<option value="${this.esc(x.id)}" ${x.id === a.id ? 'selected' : ''}>${this.esc([x.subject, this.title(x)].filter(Boolean).join(' · '))}</option>`).join('')}
                </optgroup>`).join('')}
            </select>
          </label>
        </div>

        <div class="ts-layout">
          <section class="ui-card ts-sheet" aria-label="Marks">
            ${students.length ? `
            <div class="ts-row ts-head">
              <span>No.</span><span>Student</span><span>Mark / ${max}</span><span>Grade</span><span>Remark (optional)</span>
            </div>
            ${students.map((s, i) => {
              const r = this._rows.get(s.id) || { score: '', remarks: '' };
              const bad = scoreBook.problem(r.score, max);
              const v = String(r.score).trim();
              const grade = v === '' || bad ? '—' : scoreBook.gradeFor((Number(v) / max) * 100).grade;
              const sid = this.esc(s.id);
              return `
              <div class="ts-row">
                <span class="ui-row-meta">${i + 1}</span>
                <span class="ts-name">${this.esc(s.name || 'Unnamed')}</span>
                <span class="ts-mark">
                  <input type="text" inputmode="decimal" autocomplete="off" class="ts-input${bad ? ' is-bad' : ''}" aria-label="Mark for ${this.esc(s.name)}, out of ${max}" aria-invalid="${bad ? 'true' : 'false'}"
                    data-ts-score="${sid}" data-ts-index="${i}" value="${this.esc(r.score)}" placeholder="–"
                    oninput="teacherScoresModule.onInput('${sid}', 'score', this.value)" onkeydown="teacherScoresModule.onKey(event, ${i})">
                  <span class="ts-err" data-ts-err="${sid}" role="status">${this.esc(bad)}</span>
                </span>
                <span class="ts-grade" data-ts-grade="${sid}">${this.esc(grade)}</span>
                <input type="text" class="ts-remark" aria-label="Remark for ${this.esc(s.name)}" value="${this.esc(r.remarks)}" placeholder="—"
                  oninput="teacherScoresModule.onInput('${sid}', 'remarks', this.value)">
              </div>`;
            }).join('')}` : `<p class="ui-empty">There are no enrolled students in ${this.esc(this.classLabel(a))}.</p>`}
          </section>
          <aside class="ts-side" id="ts-summary">${this.summaryHTML()}</aside>
        </div>
      </div>`;
  }
};

window.teacherScoresModule = teacherScoresModule;
