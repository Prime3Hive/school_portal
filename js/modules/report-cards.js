// ============================================
// REPORT CARDS
// ============================================
// One class and one term at a time. Every figure comes from pupilData:
//   - a subject's percentage pools its assessments (marks scored / marks
//     available), so a test out of 20 and an exam out of 60 weigh by marks;
//   - a pupil's average is the mean of their subject percentages;
//   - position ranks the class by that average; equal averages share a place;
//   - grades use the school's scale (school-config), the same as everywhere.
// Class is grade + arm (e.g. JSS 1 A), the group a position is quoted in.
// PDFs are drawn with jsPDF, loaded on first use.
// ============================================

const reportCardsModule = {
  currentTab: 'cards',
  period: null,                 // { term, year } — year as 2026-2027
  cls: '',                      // "grade|section"
  _q: '',

  async init(container) {
    this.container = container || document.getElementById('main-content');
    if (!this.period) this.period = this.currentPeriod();
    await dataManager.waitForReady();
    this.render();
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = (e) => {
      if (['students', 'grades', 'feeItems'].includes(e.detail?.collection)) this.render();
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers ───────────────────────────────────────────────

  _esc(str) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(str)
      : String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  money(n) {
    return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
  },

  normYear(v) {
    return String(v || '').replace('/', '-');
  },

  currentPeriod() {
    return {
      term: schoolConfig.getCurrentTerm()?.name || 'First Term',
      year: this.normYear(schoolConfig.getCurrentAcademicYear())
    };
  },

  periodLabel(p = this.period) {
    return `${p.term} ${p.year.replace('-', '/')}`;
  },

  sessionOptions() {
    const years = new Set((dataManager.getAll('grades') || []).map(g => this.normYear(g.academicYear || g.academic_year)).filter(Boolean));
    const now = this.currentPeriod().year;
    const [a] = now.split('-').map(Number);
    [now, `${a - 1}-${a}`].forEach(y => years.add(y));
    return [...years].sort().reverse();
  },

  gradeRank(g) {
    const order = (schoolConfig.getAllGrades?.() || []).map(x => x.name);
    const i = order.indexOf(g);
    return i === -1 ? 99 : i;
  },

  /** Enrolled pupils grouped into classes (grade + arm), in school order. */
  classes() {
    const map = new Map();
    (dataManager.getAll('students') || [])
      .filter(s => String(s.status || 'active').toLowerCase() === 'active' && s.grade)
      .forEach(s => {
        const key = `${s.grade}|${s.section || ''}`;
        if (!map.has(key)) map.set(key, { key, grade: s.grade, section: s.section || '', pupils: [] });
        map.get(key).pupils.push(s);
      });
    return [...map.values()]
      .sort((a, b) => (this.gradeRank(a.grade) - this.gradeRank(b.grade)) || a.grade.localeCompare(b.grade) || a.section.localeCompare(b.section))
      .map(c => ({ ...c, label: [c.grade, c.section].filter(Boolean).join(' '), pupils: c.pupils.sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''))) }));
  },

  currentClass(list = this.classes()) {
    const chosen = list.find(c => c.key === this.cls);
    if (chosen) return chosen;
    // Nothing chosen yet: open on the first class with marks this term.
    return list.find(c => c.pupils.some(s => window.pupilData.termResult(s.id, this.period.term, this.period.year))) || list[0] || null;
  },

  /** This term's bill for one pupil: billed, paid and balance, or null if not billed. */
  termFees(studentId, period = this.period) {
    const items = window.pupilData.fees(studentId).items
      .filter(i => String(i.term || '') === period.term && this.normYear(i.academic_year || i.academicYear) === period.year);
    if (!items.length) return null;
    const sum = (k) => items.reduce((a, i) => a + i[k], 0);
    return { billed: sum('billed'), paid: sum('paid'), balance: sum('balance') };
  },

  /** Everything one report card shows. */
  cardData(studentId, cls = null) {
    const student = dataManager.getById?.('students', studentId) || (dataManager.getAll('students') || []).find(s => s.id === studentId);
    if (!student) return null;
    const c = cls || this.classes().find(x => x.key === `${student.grade}|${student.section || ''}`);
    const cr = window.pupilData.classResults(c ? c.pupils : [student], this.period.term, this.period.year);
    const row = cr.rows.find(r => r.student.id === studentId) || { result: null, position: null };
    return { student, className: c?.label || student.grade || '', result: row.result, position: row.position, of: cr.ranked, cls: cr, fees: this.termFees(studentId) };
  },

  // ── Page ─────────────────────────────────────────────────

  setPeriod(field, value) {
    this.period = { ...this.period, [field]: value };
    this.render();
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  openClass(key) {
    this.cls = key;
    this.currentTab = 'cards';
    this.render();
  },

  search(v) {
    this._q = v;
    const box = document.getElementById('rc-tab');
    if (box) box.innerHTML = this.cardsHTML();
    const i = document.getElementById('rc-q');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'report-cards') return;
    const now = this.currentPeriod();
    const isNow = this.period.term === now.term && this.period.year === now.year;
    const tabs = [['cards', 'Report cards'], ['classes', 'All classes']];

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">Report cards</h1>
            <p class="ui-page-sub">${this._esc(this.periodLabel())}${isNow ? ' · this term' : ''}</p>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn" onclick="reportCardsModule.downloadSummary()">Results summary (PDF)</button>
          </div>
        </div>

        <div class="ui-card fp-period">
          <label>Term
            <select class="sd-select" onchange="reportCardsModule.setPeriod('term', this.value)">
              ${schoolConfig.getTermNames().map(t => `<option ${t === this.period.term ? 'selected' : ''}>${this._esc(t)}</option>`).join('')}
            </select>
          </label>
          <label>Session
            <select class="sd-select" onchange="reportCardsModule.setPeriod('year', this.value)">
              ${this.sessionOptions().map(y => `<option value="${y}" ${y === this.period.year ? 'selected' : ''}>${y.replace('-', '/')}</option>`).join('')}
            </select>
          </label>
          ${isNow ? '' : `<button type="button" class="ui-link" onclick="reportCardsModule.period = reportCardsModule.currentPeriod(); reportCardsModule.render()">Back to this term</button>`}
        </div>

        <div role="tablist" aria-label="Report cards" class="sr-tabs">
          ${tabs.map(([id, label]) => `<button type="button" role="tab" aria-selected="${this.currentTab === id}" class="sr-tab${this.currentTab === id ? ' is-on' : ''}" onclick="reportCardsModule.switchTab('${id}')">${label}</button>`).join('')}
        </div>

        <div id="rc-tab">${this.currentTab === 'classes' ? this.classesHTML() : this.cardsHTML()}</div>
      </div>`;
  },

  cardsHTML() {
    const list = this.classes();
    const c = this.currentClass(list);
    if (!c) return '<p class="ui-empty">No enrolled pupils yet.</p>';
    const cr = window.pupilData.classResults(c.pupils, this.period.term, this.period.year);
    const q = this._q.trim().toLowerCase();
    const rows = cr.rows
      .filter(r => !q || String(r.student.name || '').toLowerCase().includes(q) || String(r.student.rollNo || '').toLowerCase().includes(q))
      .sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9) || String(a.student.name || '').localeCompare(String(b.student.name || '')));
    const missing = cr.rows.length - cr.ranked;
    const pct = (n) => n == null ? '—' : `${n}%`;

    return `
      <div class="ui-card sd-filters">
        <select class="sd-select" aria-label="Class" onchange="reportCardsModule.cls = this.value; reportCardsModule.render()">
          ${list.map(x => `<option value="${this._esc(x.key)}" ${x.key === c.key ? 'selected' : ''}>${this._esc(x.label)} (${x.pupils.length})</option>`).join('')}
        </select>
        <label class="sd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5"/></svg>
          <input id="rc-q" type="search" aria-label="Search pupils" placeholder="Search by name or admission number" value="${this._esc(this._q)}" oninput="reportCardsModule.search(this.value)">
        </label>
        <button type="button" class="ui-btn ui-btn-primary" ${cr.ranked ? '' : 'disabled'} onclick="reportCardsModule.downloadClass('${this._esc(c.key)}')">Download class (${cr.ranked})</button>
      </div>

      <div class="ui-grid-4" style="margin-top:16px;">
        <div class="ui-card ui-kpi"><span class="ui-kpi-label">Class average</span><span class="ui-kpi-value">${pct(cr.average)}</span><span class="ui-kpi-sub">${cr.average == null ? 'No results yet' : this._esc(window.pupilData.gradeFor(cr.average).letter + ' · ' + window.pupilData.gradeFor(cr.average).remark)}</span></div>
        <div class="ui-card ui-kpi"><span class="ui-kpi-label">Highest · lowest</span><span class="ui-kpi-value">${pct(cr.highest)}</span><span class="ui-kpi-sub">lowest ${pct(cr.lowest)}</span></div>
        <div class="ui-card ui-kpi"><span class="ui-kpi-label">Passed</span><span class="ui-kpi-value">${cr.passed} of ${cr.ranked}</span><span class="ui-kpi-sub">average of ${cr.passMark}% or more</span></div>
        <div class="ui-card ui-kpi"><span class="ui-kpi-label">Results in</span><span class="ui-kpi-value">${cr.ranked} of ${cr.rows.length}</span><span class="ui-kpi-sub">${missing ? `${missing} pupil${missing === 1 ? '' : 's'} with no marks` : 'every pupil has marks'}</span></div>
      </div>

      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title">${this._esc(c.label)} · ${this._esc(this.periodLabel())}</h2>
          <span class="ui-card-note">Ranked by average</span>
        </div>
        ${rows.length ? `
          <table class="pc-table sr-table fp-table rc-table">
            <thead><tr><th>Pupil</th><th>Position</th><th>Subjects</th><th>Average</th><th>Grade</th><th class="fp-actions-h">Report card</th></tr></thead>
            <tbody>${rows.map(r => `<tr>
              <td><button type="button" class="ui-link" onclick="window.app.loadModule('student-record', { id: '${this._esc(r.student.id)}', tab: 'results' })">${this._esc(r.student.name || 'Unnamed')}</button></td>
              <td>${r.position ? window.pupilData.ordinal(r.position) : '—'}</td>
              <td>${r.result ? r.result.subjects.length : 0}</td>
              <td>${r.result ? r.result.average + '%' : '<span class="ui-row-meta">No marks</span>'}</td>
              <td>${r.result ? this._esc(r.result.letter) : '—'}</td>
              <td class="fp-actions">${r.result ? `
                <button type="button" class="ui-btn ui-btn-sm" onclick="reportCardsModule.previewCard('${this._esc(r.student.id)}')">View</button>
                <button type="button" class="ui-btn ui-btn-sm" onclick="reportCardsModule.downloadCard('${this._esc(r.student.id)}')">PDF</button>` : ''}</td>
            </tr>`).join('')}</tbody>
          </table>`
        : '<p class="ui-empty">No pupil matches.</p>'}
      </section>`;
  },

  classesHTML() {
    const list = this.classes();
    if (!list.length) return '<p class="ui-empty">No enrolled pupils yet.</p>';
    const rows = list.map(c => ({ c, r: window.pupilData.classResults(c.pupils, this.period.term, this.period.year) }));
    const pct = (n) => n == null ? '—' : `${n}%`;
    return `
      <section class="ui-card" style="margin-top:16px;">
        <div class="ui-card-head">
          <h2 class="ui-card-title">Every class · ${this._esc(this.periodLabel())}</h2>
          <span class="ui-card-note">Averages are of pupils with marks</span>
        </div>
        <table class="pc-table sr-table fp-table fp-clickable">
          <thead><tr><th>Class</th><th>Pupils</th><th>Results in</th><th>Average</th><th>Highest</th><th>Lowest</th><th>Passed</th></tr></thead>
          <tbody>${rows.map(({ c, r }) => `<tr tabindex="0" onclick="reportCardsModule.openClass('${this._esc(c.key)}')" onkeydown="if(event.key==='Enter')reportCardsModule.openClass('${this._esc(c.key)}')">
            <td>${this._esc(c.label)}</td><td>${c.pupils.length}</td><td>${r.ranked}</td>
            <td>${pct(r.average)}</td><td>${pct(r.highest)}</td><td>${pct(r.lowest)}</td>
            <td>${r.ranked ? `${r.passed} of ${r.ranked}` : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>`;
  },

  // ── Report card on screen ────────────────────────────────

  cardHTML(d) {
    const cfg = window.schoolConfig || {};
    const res = d.result;
    const feeLine = !d.fees ? '' : d.fees.balance > 0
      ? `School fees for the term: <strong>${this.money(d.fees.balance)} outstanding</strong> of ${this.money(d.fees.billed)}.`
      : `School fees for the term: <strong>paid in full</strong>.`;
    return `
      <div class="rc-card">
        <div class="rc-head">
          <img src="assets/logo-mark.svg" alt="" width="48" height="48">
          <div>
            <div class="rc-school">${this._esc(cfg.name || 'TBD International Academy')}</div>
            <div class="ui-row-meta">${this._esc(cfg.location || '')}</div>
          </div>
        </div>
        <div class="rc-title">Report card · ${this._esc(this.periodLabel())}</div>
        <dl class="sr-dl sr-dl-2 rc-who">
          <div><dt>Pupil</dt><dd>${this._esc(d.student.name || '')}</dd></div>
          <div><dt>Admission no.</dt><dd>${this._esc(d.student.rollNo || '—')}</dd></div>
          <div><dt>Class</dt><dd>${this._esc(d.className)}</dd></div>
          <div><dt>Position</dt><dd>${d.position ? `${window.pupilData.ordinal(d.position)} of ${d.of}` : '—'}</dd></div>
        </dl>
        ${res ? `
          <table class="pc-table sr-table fp-table rc-subjects">
            <thead><tr><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th><th>Remark</th><th>Class avg</th><th>Highest</th></tr></thead>
            <tbody>${res.subjects.map(s => {
              const cs = d.cls.subjects.get(s.subject);
              return `<tr><td>${this._esc(s.subject)}</td><td>${s.score} / ${s.total}</td><td>${s.pct}</td><td>${this._esc(s.letter)}</td><td>${this._esc(s.remark)}</td><td>${cs ? cs.average : '—'}</td><td>${cs ? cs.highest : '—'}</td></tr>`;
            }).join('')}</tbody>
          </table>
          <div class="rc-summary">
            <div><span>Average</span><strong>${res.average}%</strong></div>
            <div><span>Grade</span><strong>${this._esc(res.letter)} · ${this._esc(res.remark)}</strong></div>
            <div><span>Position</span><strong>${d.position ? window.pupilData.ordinal(d.position) : '—'} of ${d.of}</strong></div>
            <div><span>Class average</span><strong>${d.cls.average}%</strong></div>
          </div>` : '<p class="ui-empty">No marks recorded for this term.</p>'}
        ${feeLine ? `<p class="ui-card-note">${feeLine}</p>` : ''}
        <p class="ui-card-note">Grades: ${(schoolConfig.promotion?.gradingScale || []).map(b => `${b.grade} ${b.min}+`).join(' · ')}. Comments and signatures are added on the printed card.</p>
      </div>`;
  },

  previewCard(studentId) {
    const d = this.cardData(studentId, this.currentClass());
    if (!d) { showToast('Pupil not found', 'error'); return; }
    createModal(`Report card · ${this._esc(d.student.name || '')}`, `
      ${this.cardHTML(d)}
      <div class="ui-actions" style="justify-content:flex-end;margin-top:16px;">
        <button type="button" class="ui-btn" onclick="closeModal(this)">Close</button>
        <button type="button" class="ui-btn ui-btn-primary" onclick="reportCardsModule.downloadCard('${this._esc(studentId)}')">Download PDF</button>
      </div>`, 'large');
  },

  // ── PDFs ─────────────────────────────────────────────────

  async _jsPDF() {
    if (!window.jspdf) await window.loadLib('jspdf');
    return window.jspdf.jsPDF;
  },

  _fileSafe(s) {
    return String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  },

  /** Draws one report card on the current page of `doc` (A4 portrait, mm). */
  _drawCard(doc, d) {
    const cfg = window.schoolConfig || {};
    const NAVY = [30, 42, 90], RED = [226, 60, 60], INK = [15, 23, 42], MUTED = [100, 116, 139], LINE = [226, 232, 240];
    const W = 210, M = 14;
    const ngn = (n) => 'NGN ' + Math.round(n).toLocaleString('en-NG');
    const ord = window.pupilData.ordinal;

    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F');
    doc.setFillColor(...RED); doc.rect(0, 34, W, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
    doc.text(cfg.name || 'TBD International Academy', W / 2, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.text([cfg.motto, cfg.location, cfg.phone].filter(Boolean).join('  ·  '), W / 2, 20, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(`REPORT CARD  ·  ${this.periodLabel().toUpperCase()}`, W / 2, 29, { align: 'center' });

    let y = 44;
    const info = [['Pupil', d.student.name || ''], ['Admission no.', d.student.rollNo || '-'], ['Class', d.className], ['Position', d.position ? `${ord(d.position)} of ${d.of}` : '-']];
    info.forEach(([k, v], i) => {
      const x = M + (i % 2) * 91, yy = y + Math.floor(i / 2) * 12;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text(k, x, yy);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(String(v).slice(0, 44), x, yy + 5);
    });
    y += 28;

    const cols = [
      { h: 'Subject', x: M + 2 },
      { h: 'Marks', x: M + 78, a: 'center' },
      { h: '%', x: M + 100, a: 'center' },
      { h: 'Grade', x: M + 116, a: 'center' },
      { h: 'Remark', x: M + 128 },
      { h: 'Class avg', x: M + 154, a: 'center' },
      { h: 'Highest', x: M + 172, a: 'center' }
    ];
    doc.setFillColor(...NAVY); doc.rect(M, y, W - M * 2, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    cols.forEach(c => doc.text(c.h, c.x, y + 5.5, c.a ? { align: c.a } : undefined));
    y += 8;

    const res = d.result;
    doc.setFont('helvetica', 'normal');
    (res ? res.subjects : []).forEach((s, i) => {
      if (y > 250) { doc.addPage(); y = 20; }
      const cs = d.cls.subjects.get(s.subject);
      if (i % 2) { doc.setFillColor(248, 250, 252); doc.rect(M, y, W - M * 2, 7, 'F'); }
      doc.setDrawColor(...LINE); doc.line(M, y + 7, W - M, y + 7);
      doc.setTextColor(...INK); doc.setFontSize(8.5);
      const cells = [s.subject.slice(0, 40), `${s.score} / ${s.total}`, String(s.pct), s.letter, s.remark, cs ? String(cs.average) : '-', cs ? String(cs.highest) : '-'];
      cells.forEach((v, k) => doc.text(v, cols[k].x, y + 5, cols[k].a ? { align: cols[k].a } : undefined));
      y += 7;
    });
    if (!res) {
      doc.setTextColor(...MUTED); doc.setFontSize(9);
      doc.text('No marks recorded for this term.', W / 2, y + 8, { align: 'center' });
      y += 12;
    }

    y += 6;
    if (res) {
      doc.setFillColor(241, 244, 250); doc.rect(M, y, W - M * 2, 18, 'F');
      const box = [['AVERAGE', `${res.average}%`], ['GRADE', `${res.letter} (${res.remark})`], ['POSITION', d.position ? `${ord(d.position)} of ${d.of}` : '-'], ['CLASS AVERAGE', `${d.cls.average}%`]];
      box.forEach(([k, v], i) => {
        const x = M + 23 + i * 45.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(k, x, y + 6, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text(v, x, y + 13.5, { align: 'center' });
      });
      y += 24;
    }

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
    if (d.fees) {
      doc.text(d.fees.balance > 0
        ? `School fees for the term: ${ngn(d.fees.balance)} outstanding of ${ngn(d.fees.billed)}.`
        : 'School fees for the term: paid in full.', M, y);
      y += 7;
    }
    doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text('Grades: ' + (schoolConfig.promotion?.gradingScale || []).map(b => `${b.grade} ${b.min}+ ${b.remark}`).join(',  '), M, y);
    y += 10;

    ['Class teacher\'s comment', 'Head teacher\'s comment'].forEach(label => {
      if (y > 262) { doc.addPage(); y = 20; }
      doc.setFontSize(8); doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(label, M, y);
      doc.setDrawColor(...LINE); doc.line(M, y + 8, W - M, y + 8); doc.line(M, y + 15, W - M - 50, y + 15);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.text('Signature', W - M - 44, y + 15);
      y += 22;
    });

    doc.setFillColor(...NAVY); doc.rect(0, 287, W, 10, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7);
    doc.text(`${cfg.name || ''}  ·  printed ${new Date().toLocaleDateString('en-GB')}`, W / 2, 293, { align: 'center' });
  },

  async downloadCard(studentId) {
    const d = this.cardData(studentId, this.currentClass());
    if (!d) { showToast('Pupil not found', 'error'); return; }
    try {
      const JsPDF = await this._jsPDF();
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      this._drawCard(doc, d);
      doc.save(`Report_card_${this._fileSafe(d.student.name)}_${this._fileSafe(this.periodLabel())}.pdf`);
    } catch (err) {
      console.error('[ReportCards] PDF:', err);
      showToast('Could not make the PDF: ' + err.message, 'error');
    }
  },

  /** One PDF with a page per pupil who has marks, in position order. */
  async downloadClass(key) {
    const c = this.classes().find(x => x.key === key);
    if (!c) return;
    const cr = window.pupilData.classResults(c.pupils, this.period.term, this.period.year);
    const rows = cr.rows.filter(r => r.result).sort((a, b) => a.position - b.position);
    if (!rows.length) { showToast('No marks recorded for this class this term', 'warning'); return; }
    showToast(`Making ${rows.length} report cards…`, 'info');
    try {
      const JsPDF = await this._jsPDF();
      const doc = new JsPDF({ unit: 'mm', format: 'a4' });
      rows.forEach((r, i) => {
        if (i) doc.addPage();
        this._drawCard(doc, { student: r.student, className: c.label, result: r.result, position: r.position, of: cr.ranked, cls: cr, fees: this.termFees(r.student.id) });
      });
      doc.save(`Report_cards_${this._fileSafe(c.label)}_${this._fileSafe(this.periodLabel())}.pdf`);
      showToast('Report cards ready', 'success');
    } catch (err) {
      console.error('[ReportCards] PDF:', err);
      showToast('Could not make the PDF: ' + err.message, 'error');
    }
  },

  /** Every class's figures for the term on one landscape page. */
  async downloadSummary() {
    try {
      const JsPDF = await this._jsPDF();
      const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = 297, M = 14, NAVY = [30, 42, 90];
      const cfg = window.schoolConfig || {};
      doc.setFillColor(...NAVY); doc.rect(0, 0, W, 22, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text(`${cfg.name || ''}  ·  Results summary`, W / 2, 10, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(`${this.periodLabel()}  ·  printed ${new Date().toLocaleDateString('en-GB')}`, W / 2, 17, { align: 'center' });

      const heads = ['Class', 'Pupils', 'Results in', 'Average', 'Grade', 'Highest', 'Lowest', 'Passed'];
      const xs = [M + 2, 80, 110, 145, 175, 205, 235, 265];
      let y = 30;
      doc.setFillColor(241, 244, 250); doc.rect(M, y, W - M * 2, 8, 'F');
      doc.setTextColor(15, 23, 42); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      heads.forEach((h, i) => doc.text(h, xs[i], y + 5.5, i ? { align: 'center' } : undefined));
      y += 8;
      doc.setFont('helvetica', 'normal');
      this.classes().forEach(c => {
        if (y > 195) { doc.addPage(); y = 20; }
        const r = window.pupilData.classResults(c.pupils, this.period.term, this.period.year);
        const p = (n) => n == null ? '-' : `${n}%`;
        const cells = [c.label, String(c.pupils.length), String(r.ranked), p(r.average), r.average == null ? '-' : window.pupilData.gradeFor(r.average).letter, p(r.highest), p(r.lowest), r.ranked ? `${r.passed} of ${r.ranked}` : '-'];
        cells.forEach((v, i) => doc.text(v, xs[i], y + 5.5, i ? { align: 'center' } : undefined));
        doc.setDrawColor(226, 232, 240); doc.line(M, y + 8, W - M, y + 8);
        y += 8;
      });
      doc.save(`Results_summary_${this._fileSafe(this.periodLabel())}.pdf`);
    } catch (err) {
      console.error('[ReportCards] PDF:', err);
      showToast('Could not make the PDF: ' + err.message, 'error');
    }
  }
};

if (typeof window !== 'undefined') window.reportCardsModule = reportCardsModule;
