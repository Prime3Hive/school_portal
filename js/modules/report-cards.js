// ============================================
// REPORT CARDS MODULE
// Generate PDF student report cards + class/financial reports
// Requires: jsPDF (loaded via window.loadLib('jspdf'))
// ============================================

const reportCardsModule = {
  currentTab: 'student',
  _gradeFilter: 'all',
  _termFilter: 'current',
  _search: '',

  async init(container) {
    this.container = container || document.getElementById('main-content');
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['students','grades','payments','assessments','staff'].includes(e.detail.collection)) this.render();
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  render() {
    const students = this._filteredStudents();
    this.container.innerHTML = `
      <div class="module-container animate-fadeIn">

        <!-- Header -->
        <div class="module-header" style="margin-bottom:var(--space-5);">
          <div>
            <h1 class="module-title">📄 Report Cards & Reports</h1>
            <p class="module-subtitle">Generate student report cards, class performance, and financial summaries</p>
          </div>
          <div style="display:flex;gap:var(--space-3);">
            <button class="btn btn-secondary" onclick="reportCardsModule.generateClassReport()">📊 Class Report</button>
            <button class="btn btn-secondary" onclick="reportCardsModule.generateFinancialReport()">💰 Financial Report</button>
          </div>
        </div>

        <!-- Tab Nav -->
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-5);border-bottom:2px solid var(--border-primary);overflow-x:auto;">
          ${this._tab('student','👤 Student Report Cards')}
          ${this._tab('class','🏫 Class Performance')}
          ${this._tab('financial','💰 Financial Summary')}
        </div>

        <!-- Filters -->
        <div class="card" style="margin-bottom:var(--space-5);padding:var(--space-4);">
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center;">
            <input type="text" class="form-input" placeholder="Search student…" style="flex:1;min-width:180px;" value="${this._search}"
              oninput="reportCardsModule._search=this.value;reportCardsModule.render()">
            <select class="form-select" onchange="reportCardsModule._gradeFilter=this.value;reportCardsModule.render()">
              <option value="all" ${this._gradeFilter==='all'?'selected':''}>All Grades</option>
              ${['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(g=>`<option value="${g}" ${this._gradeFilter===g?'selected':''}>${g}</option>`).join('')}
            </select>
            <select class="form-select" onchange="reportCardsModule._termFilter=this.value;reportCardsModule.render()">
              <option value="current" ${this._termFilter==='current'?'selected':''}>Current Term</option>
              <option value="1" ${this._termFilter==='1'?'selected':''}>1st Term</option>
              <option value="2" ${this._termFilter==='2'?'selected':''}>2nd Term</option>
              <option value="3" ${this._termFilter==='3'?'selected':''}>3rd Term</option>
            </select>
            <button class="btn btn-primary" onclick="reportCardsModule.bulkDownload()">
              📥 Download All PDFs
            </button>
          </div>
        </div>

        <!-- Student List -->
        ${this.currentTab === 'student' ? this._renderStudentList(students) : ''}
        ${this.currentTab === 'class' ? this._renderClassPerformance() : ''}
        ${this.currentTab === 'financial' ? this._renderFinancialSummary() : ''}
      </div>
    `;
  },

  _tab(key, label) {
    const active = this.currentTab === key;
    return `<button onclick="reportCardsModule.currentTab='${key}';reportCardsModule.render()"
      style="padding:var(--space-3) var(--space-5);background:none;border:none;cursor:pointer;
             font-size:var(--font-size-sm);font-weight:${active?'700':'500'};
             color:${active?'var(--color-primary)':'var(--text-secondary)'};
             border-bottom:3px solid ${active?'var(--color-primary)':'transparent'};
             margin-bottom:-2px;white-space:nowrap;">${label}</button>`;
  },

  _filteredStudents() {
    let s = (dataManager.getAll('students') || []).filter(s => s.status === 'active');
    if (this._gradeFilter !== 'all') s = s.filter(st => st.grade === this._gradeFilter || st.class === this._gradeFilter);
    if (this._search) {
      const q = this._search.toLowerCase();
      s = s.filter(st => (st.name||st.fullName||'').toLowerCase().includes(q) || (st.rollNo||st.roll_no||'').toLowerCase().includes(q));
    }
    return s.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  },

  _renderStudentList(students) {
    if (!students.length) return `<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--text-secondary);">No students found.</div></div>`;
    return `
      <div style="display:grid;gap:var(--space-3);">
        ${students.map(s => {
          const grades = this._getStudentGrades(s.id);
          const avg = grades.length ? Math.round(grades.reduce((sum,g)=>sum+(g.score||0),0)/grades.length) : null;
          const feeStatus = s.fees || 'pending';
          const feeColor = {paid:'#10b981',partial:'#f59e0b',pending:'#ef4444',overdue:'#ef4444'}[feeStatus]||'#94a3b8';
          return `
            <div class="card" style="border-left:4px solid var(--color-primary);">
              <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:var(--space-3);">
                <div>
                  <div style="font-weight:600;font-size:var(--font-size-base);">${s.name || s.fullName}</div>
                  <div style="font-size:0.75rem;color:var(--text-secondary);">
                    ${s.rollNo || s.roll_no || ''} | ${s.grade || s.class || '—'}
                    ${avg !== null ? ` | Avg: <strong style="color:${avg>=70?'#10b981':avg>=50?'#f59e0b':'#ef4444'}">${avg}%</strong>` : ''}
                    | Fees: <strong style="color:${feeColor}">${feeStatus}</strong>
                  </div>
                </div>
                <div style="display:flex;gap:var(--space-2);">
                  <button class="btn btn-sm btn-secondary" onclick="reportCardsModule.previewCard('${s.id}')">👁 Preview</button>
                  <button class="btn btn-sm btn-primary" onclick="reportCardsModule.downloadCard('${s.id}')">📥 Download PDF</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  _renderClassPerformance() {
    const students = dataManager.getAll('students') || [];
    const grades = dataManager.getAll('grades') || [];
    const subjects = dataManager.getAll('subjectCatalog') || [];
    const byGrade = {};
    ['JSS1','JSS2','JSS3','SS1','SS2','SS3'].forEach(g => {
      const gs = students.filter(s => (s.grade === g || s.class === g) && s.status === 'active');
      const gids = gs.map(s => s.id);
      const gg = grades.filter(gr => gids.includes(gr.studentId || gr.student_id));
      const avg = gg.length ? Math.round(gg.reduce((sum,g)=>sum+(g.score||0),0)/gg.length) : null;
      byGrade[g] = { count: gs.length, avg, entries: gg.length };
    });
    return `
      <div class="card">
        <div class="card-body">
          <h3 style="margin-bottom:var(--space-4);">Class Performance Overview</h3>
          <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
            <thead><tr style="background:var(--bg-secondary);">
              <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Grade</th>
              <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Students</th>
              <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Avg Score</th>
              <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Performance</th>
              <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Action</th>
            </tr></thead>
            <tbody>
              ${Object.entries(byGrade).map(([g, d]) => `
                <tr style="border-bottom:1px solid var(--border-primary);">
                  <td style="padding:var(--space-3);font-weight:600;">${g}</td>
                  <td style="padding:var(--space-3);">${d.count}</td>
                  <td style="padding:var(--space-3);">
                    ${d.avg !== null
                      ? `<strong style="color:${d.avg>=70?'#10b981':d.avg>=50?'#f59e0b':'#ef4444'}">${d.avg}%</strong>`
                      : '<span style="color:var(--text-tertiary);">No data</span>'}
                  </td>
                  <td style="padding:var(--space-3);">
                    ${d.avg !== null ? `
                      <div style="height:8px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;width:120px;">
                        <div style="height:100%;width:${d.avg}%;background:${d.avg>=70?'#10b981':d.avg>=50?'#f59e0b':'#ef4444'};border-radius:4px;"></div>
                      </div>` : '—'}
                  </td>
                  <td style="padding:var(--space-3);">
                    <button class="btn btn-sm btn-primary" onclick="reportCardsModule.downloadClassReport('${g}')">📥 PDF</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  _renderFinancialSummary() {
    const payments = dataManager.getAll('payments') || [];
    const students = dataManager.getAll('students') || [];
    const paid = payments.filter(p => p.status === 'paid');
    const totalCollected = paid.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pending = students.filter(s => s.fees === 'pending' || s.fees === 'partial' || !s.fees).length;
    const paidCount = students.filter(s => s.fees === 'paid').length;

    return `
      <div style="display:grid;gap:var(--space-4);">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-3);">
          ${this._fChip('Total Collected', `₦${totalCollected.toLocaleString()}`, '#10b981')}
          ${this._fChip('Fees Cleared', paidCount, '#6366f1')}
          ${this._fChip('Pending/Partial', pending, '#ef4444')}
          ${this._fChip('Total Payments', paid.length, '#f59e0b')}
        </div>
        <div class="card">
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
              <h3 style="margin:0;">Recent Payment Summary</h3>
              <button class="btn btn-primary btn-sm" onclick="reportCardsModule.generateFinancialReport()">📥 Download PDF</button>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
              <thead><tr style="background:var(--bg-secondary);">
                <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Student</th>
                <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Amount</th>
                <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Date</th>
                <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Method</th>
                <th style="padding:var(--space-3);text-align:left;border-bottom:1px solid var(--border-primary);">Receipt</th>
              </tr></thead>
              <tbody>
                ${paid.slice(0,20).map(p => `
                  <tr style="border-bottom:1px solid var(--border-primary);">
                    <td style="padding:var(--space-3);">${p.student_name || p.studentName || '—'}</td>
                    <td style="padding:var(--space-3);font-weight:600;color:#10b981;">₦${(p.amount||0).toLocaleString()}</td>
                    <td style="padding:var(--space-3);">${p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB') : '—'}</td>
                    <td style="padding:var(--space-3);">${p.payment_method || p.paymentMethod || '—'}</td>
                    <td style="padding:var(--space-3);">${p.receipt_no || p.receiptNo || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  _fChip(label, val, color) {
    return `<div class="card" style="padding:var(--space-4);text-align:center;">
      <div style="font-size:1.3rem;font-weight:700;color:${color};">${val}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary);">${label}</div>
    </div>`;
  },

  // ── Data helpers ──────────────────────────────────────────────────────────

  _getStudentGrades(studentId) {
    return (dataManager.getAll('grades') || []).filter(g => g.studentId === studentId || g.student_id === studentId);
  },

  _getStudentPayments(studentId) {
    return (dataManager.getAll('payments') || []).filter(p =>
      (p.studentId === studentId || p.student_id === studentId) && p.status === 'paid'
    );
  },

  _getSchoolConfig() {
    return window.schoolConfig || { name: 'TBD Academy', location: 'Makurdi, Benue State' };
  },

  _getCurrentTermYear() {
    const now = new Date();
    const month = now.getMonth() + 1;
    let term = month >= 9 ? '1st' : month >= 1 && month <= 3 ? '2nd' : '3rd';
    const year = month >= 9 ? `${now.getFullYear()}/${now.getFullYear()+1}` : `${now.getFullYear()-1}/${now.getFullYear()}`;
    return { term, year };
  },

  // ── PDF generation ────────────────────────────────────────────────────────

  async _ensureJsPDF() {
    if (window.jspdf) return window.jspdf.jsPDF;
    await window.loadLib('jspdf');
    return window.jspdf.jsPDF;
  },

  previewCard(studentId) {
    const students = dataManager.getAll('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const grades = this._getStudentGrades(studentId);
    const payments = this._getStudentPayments(studentId);
    const config = this._getSchoolConfig();
    const { term, year } = this._getCurrentTermYear();

    // Calculate GPA
    const avg = grades.length ? Math.round(grades.reduce((s,g)=>s+(g.score||0),0)/grades.length) : 0;
    const letterGrade = avg>=90?'A+':avg>=80?'A':avg>=70?'B':avg>=60?'C':avg>=50?'D':'F';

    const previewHtml = `
      <div id="rc-preview-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;"
        onclick="if(event.target===this)this.remove()">
        <div style="background:#fff;border-radius:12px;width:100%;max-width:700px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
          <!-- Toolbar -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0;">
            <h3 style="margin:0;font-size:1rem;">Report Card Preview</h3>
            <div style="display:flex;gap:8px;">
              <button onclick="reportCardsModule.downloadCard('${studentId}')" style="padding:8px 16px;background:#137fec;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">📥 Download PDF</button>
              <button onclick="document.getElementById('rc-preview-overlay').remove()" style="padding:8px 16px;background:#f1f5f9;border:none;border-radius:8px;cursor:pointer;">✕ Close</button>
            </div>
          </div>
          <!-- Card body -->
          <div style="padding:32px;font-family:Arial,sans-serif;">
            <!-- School header -->
            <div style="text-align:center;margin-bottom:24px;border-bottom:3px double #137fec;padding-bottom:16px;">
              <div style="font-size:1.5rem;font-weight:800;color:#0f172a;">${config.name}</div>
              <div style="font-size:0.85rem;color:#64748b;">${config.location || ''}</div>
              <div style="font-size:1.1rem;font-weight:700;color:#137fec;margin-top:8px;">STUDENT REPORT CARD</div>
              <div style="font-size:0.8rem;color:#64748b;">${term} Term | ${year}</div>
            </div>
            <!-- Student info -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;background:#f8fafc;padding:16px;border-radius:8px;">
              <div><span style="color:#64748b;font-size:0.8rem;">Student Name</span><br><strong>${student.name||student.fullName}</strong></div>
              <div><span style="color:#64748b;font-size:0.8rem;">Roll Number</span><br><strong>${student.rollNo||student.roll_no||'—'}</strong></div>
              <div><span style="color:#64748b;font-size:0.8rem;">Grade</span><br><strong>${student.grade||student.class||'—'}</strong></div>
              <div><span style="color:#64748b;font-size:0.8rem;">Section</span><br><strong>${student.section||'—'}</strong></div>
            </div>
            <!-- Grades table -->
            <table style="width:100%;border-collapse:collapse;font-size:0.875rem;margin-bottom:24px;">
              <thead><tr style="background:#137fec;color:#fff;">
                <th style="padding:10px;text-align:left;border-radius:4px 0 0 0;">Subject</th>
                <th style="padding:10px;text-align:center;">Score</th>
                <th style="padding:10px;text-align:center;">Max</th>
                <th style="padding:10px;text-align:center;">%</th>
                <th style="padding:10px;text-align:center;border-radius:0 4px 0 0;">Grade</th>
              </tr></thead>
              <tbody>
                ${grades.length > 0
                  ? grades.map((g,i) => {
                      const pct = g.maxScore ? Math.round((g.score/g.maxScore)*100) : g.score;
                      const letter = pct>=90?'A+':pct>=80?'A':pct>=70?'B':pct>=60?'C':pct>=50?'D':'F';
                      return `<tr style="background:${i%2===0?'#fff':'#f8fafc'};border-bottom:1px solid #e2e8f0;">
                        <td style="padding:10px;">${g.subjectName||g.subject||'—'}</td>
                        <td style="padding:10px;text-align:center;">${g.score??'—'}</td>
                        <td style="padding:10px;text-align:center;">${g.maxScore||100}</td>
                        <td style="padding:10px;text-align:center;">${pct}%</td>
                        <td style="padding:10px;text-align:center;font-weight:700;color:${pct>=70?'#10b981':pct>=50?'#f59e0b':'#ef4444'}">${letter}</td>
                      </tr>`;
                    }).join('')
                  : `<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;">No grade records found</td></tr>`
                }
              </tbody>
            </table>
            <!-- Summary row -->
            <div style="display:flex;justify-content:space-between;align-items:center;background:#f0f9ff;padding:16px;border-radius:8px;margin-bottom:24px;">
              <div style="text-align:center;">
                <div style="font-size:0.75rem;color:#64748b;">AVERAGE SCORE</div>
                <div style="font-size:2rem;font-weight:800;color:#137fec;">${avg}%</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:0.75rem;color:#64748b;">OVERALL GRADE</div>
                <div style="font-size:2rem;font-weight:800;color:${avg>=70?'#10b981':avg>=50?'#f59e0b':'#ef4444'}">${letterGrade}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:0.75rem;color:#64748b;">FEE STATUS</div>
                <div style="font-size:1.2rem;font-weight:700;color:${student.fees==='paid'?'#10b981':'#ef4444'};text-transform:capitalize;">${student.fees||'pending'}</div>
              </div>
              <div style="text-align:center;">
                <div style="font-size:0.75rem;color:#64748b;">SUBJECTS</div>
                <div style="font-size:2rem;font-weight:800;color:#6366f1;">${grades.length}</div>
              </div>
            </div>
            <!-- Remarks -->
            <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:16px;">
              <div style="font-size:0.75rem;color:#92400e;font-weight:600;margin-bottom:4px;">CLASS TEACHER'S REMARKS</div>
              <div style="color:#78350f;">${avg>=70?'Excellent performance! Keep up the great work.':avg>=50?'Good effort. Continue to improve.':'Needs improvement. Please seek additional support.'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', previewHtml);
  },

  async downloadCard(studentId) {
    const students = dataManager.getAll('students') || [];
    const student = students.find(s => s.id === studentId);
    if (!student) { showToast('Student not found', 'error'); return; }

    showToast('Generating PDF…', 'info');
    try {
      const jsPDF = await this._ensureJsPDF();
      const grades = this._getStudentGrades(studentId);
      const config = this._getSchoolConfig();
      const { term, year } = this._getCurrentTermYear();
      const avg = grades.length ? Math.round(grades.reduce((s,g)=>s+(g.score||0),0)/grades.length) : 0;
      const letterGrade = avg>=90?'A+':avg>=80?'A':avg>=70?'B':avg>=60?'C':avg>=50?'D':'F';

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const W = 210, margin = 15;

      // Header bar
      doc.setFillColor(19, 127, 236);
      doc.rect(0, 0, W, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text(config.name, W/2, 14, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(config.location || '', W/2, 21, { align: 'center' });
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.text('STUDENT REPORT CARD', W/2, 30, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`${term} Term | Academic Year ${year}`, W/2, 37, { align: 'center' });

      // Student info box
      let y = 50;
      doc.setTextColor(15, 23, 42);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, W - margin*2, 28, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, W - margin*2, 28, 'S');
      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text('Student Name', margin+4, y+7);
      doc.text('Roll Number', margin+90, y+7);
      doc.text('Grade', margin+4, y+20);
      doc.text('Section', margin+90, y+20);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
      doc.text(student.name||student.fullName||'—', margin+4, y+13);
      doc.text(student.rollNo||student.roll_no||'—', margin+90, y+13);
      doc.text(student.grade||student.class||'—', margin+4, y+26);
      doc.text(student.section||'—', margin+90, y+26);

      // Grades table
      y += 36;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setFillColor(19, 127, 236);
      doc.rect(margin, y, W-margin*2, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('Subject', margin+3, y+5.5);
      doc.text('Score', margin+85, y+5.5, { align: 'center' });
      doc.text('Max', margin+105, y+5.5, { align: 'center' });
      doc.text('%', margin+125, y+5.5, { align: 'center' });
      doc.text('Grade', margin+145, y+5.5, { align: 'center' });
      y += 8;

      doc.setFont('helvetica', 'normal');
      grades.forEach((g, i) => {
        const pct = g.maxScore ? Math.round((g.score/g.maxScore)*100) : (g.score||0);
        const letter = pct>=90?'A+':pct>=80?'A':pct>=70?'B':pct>=60?'C':pct>=50?'D':'F';
        doc.setFillColor(i%2===0 ? 255 : 248, i%2===0 ? 255 : 250, i%2===0 ? 255 : 252);
        doc.rect(margin, y, W-margin*2, 7, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, W-margin*2, 7, 'S');
        doc.setTextColor(15, 23, 42); doc.setFontSize(8);
        doc.text(String(g.subjectName||g.subject||'—').substring(0,35), margin+3, y+5);
        doc.text(String(g.score??'—'), margin+85, y+5, { align: 'center' });
        doc.text(String(g.maxScore||100), margin+105, y+5, { align: 'center' });
        doc.text(String(pct)+'%', margin+125, y+5, { align: 'center' });
        const gc = pct>=70?[16,185,129]:pct>=50?[245,158,11]:[239,68,68];
        doc.setTextColor(...gc);
        doc.setFont('helvetica', 'bold');
        doc.text(letter, margin+145, y+5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        y += 7;
      });

      if (!grades.length) {
        doc.setTextColor(148,163,184); doc.setFontSize(9);
        doc.text('No grade records found for this term', W/2, y+8, { align: 'center' });
        y += 14;
      }

      // Summary
      y += 8;
      doc.setFillColor(240, 249, 255);
      doc.rect(margin, y, W-margin*2, 22, 'F');
      doc.setDrawColor(186, 230, 253);
      doc.rect(margin, y, W-margin*2, 22, 'S');
      const cols = [margin+18, margin+55, margin+100, margin+140];
      ['AVERAGE', 'GRADE', 'FEE STATUS', 'SUBJECTS'].forEach((lbl, i) => {
        doc.setTextColor(100,116,139); doc.setFontSize(7); doc.setFont('helvetica','normal');
        doc.text(lbl, cols[i], y+6, { align: 'center' });
      });
      doc.setFont('helvetica','bold'); doc.setFontSize(14);
      doc.setTextColor(19,127,236); doc.text(`${avg}%`, cols[0], y+16, { align: 'center' });
      const gc2 = avg>=70?[16,185,129]:avg>=50?[245,158,11]:[239,68,68];
      doc.setTextColor(...gc2); doc.text(letterGrade, cols[1], y+16, { align: 'center' });
      doc.setTextColor(student.fees==='paid'?16:239, student.fees==='paid'?185:68, student.fees==='paid'?129:68);
      doc.setFontSize(9); doc.text((student.fees||'pending').toUpperCase(), cols[2], y+16, { align: 'center' });
      doc.setTextColor(99,102,241); doc.setFontSize(14); doc.text(String(grades.length), cols[3], y+16, { align: 'center' });

      // Remarks
      y += 30;
      doc.setFillColor(254,252,232); doc.rect(margin, y, W-margin*2, 18, 'F');
      doc.setDrawColor(253,230,138); doc.rect(margin, y, W-margin*2, 18, 'S');
      doc.setTextColor(146,64,14); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
      doc.text("CLASS TEACHER'S REMARKS", margin+3, y+6);
      doc.setFont('helvetica','normal'); doc.setTextColor(120,53,15); doc.setFontSize(8.5);
      const remark = avg>=70?'Excellent performance! Keep up the great work.':avg>=50?'Good effort. Continue to improve in weaker areas.':'Needs improvement. Please seek additional academic support.';
      doc.text(remark, margin+3, y+13);

      // Footer
      doc.setFillColor(19,127,236); doc.rect(0, 280, W, 17, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont('helvetica','normal');
      doc.text(`Generated: ${new Date().toLocaleString()}  |  ${config.name}`, W/2, 290, { align: 'center' });

      doc.save(`Report_Card_${(student.name||student.fullName||'student').replace(/\s+/g,'_')}_${term.replace(/\s/g,'')}_${year.replace('/','-')}.pdf`);
      showToast('Report card downloaded!', 'success');
    } catch (err) {
      console.error('[ReportCards] PDF error:', err);
      showToast('Failed to generate PDF: ' + err.message, 'error');
    }
  },

  async bulkDownload() {
    const students = this._filteredStudents();
    if (!students.length) { showToast('No students to export', 'warning'); return; }
    showToast(`Generating ${students.length} report cards…`, 'info');
    for (const s of students) {
      await this.downloadCard(s.id);
      await new Promise(r => setTimeout(r, 300));
    }
    showToast('All report cards downloaded!', 'success');
  },

  async generateClassReport() {
    showToast('Generating class report…', 'info');
    try {
      const jsPDF = await this._ensureJsPDF();
      const students = (dataManager.getAll('students') || []).filter(s => s.status === 'active');
      const grades = dataManager.getAll('grades') || [];
      const config = this._getSchoolConfig();
      const { term, year } = this._getCurrentTermYear();

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = 297, margin = 12;

      doc.setFillColor(19, 127, 236); doc.rect(0, 0, W, 22, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold');
      doc.text(`${config.name} — Class Performance Report`, W/2, 10, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica','normal');
      doc.text(`${term} Term | ${year} | Generated: ${new Date().toLocaleDateString('en-GB')}`, W/2, 18, { align: 'center' });

      let y = 30;
      const byGrade = {};
      ['JSS1','JSS2','JSS3','SS1','SS2','SS3'].forEach(g => {
        const gs = students.filter(s => s.grade === g || s.class === g);
        const gids = gs.map(s => s.id);
        const gg = grades.filter(gr => gids.includes(gr.studentId || gr.student_id));
        const avg = gg.length ? Math.round(gg.reduce((sum,g)=>sum+(g.score||0),0)/gg.length) : 0;
        byGrade[g] = { count: gs.length, avg, entries: gg.length };
      });

      // Table header
      doc.setFillColor(15,23,42); doc.rect(margin, y, W-margin*2, 8, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('Grade', margin+4, y+5.5);
      doc.text('Students', margin+35, y+5.5, { align:'center' });
      doc.text('Grade Entries', margin+70, y+5.5, { align:'center' });
      doc.text('Average Score', margin+115, y+5.5, { align:'center' });
      doc.text('Letter Grade', margin+155, y+5.5, { align:'center' });
      doc.text('Performance Level', margin+210, y+5.5, { align:'center' });
      y += 8;

      Object.entries(byGrade).forEach(([g, d], i) => {
        const letter = d.avg>=90?'A+':d.avg>=80?'A':d.avg>=70?'B':d.avg>=60?'C':d.avg>=50?'D':'F';
        const level = d.avg>=70?'Excellent':d.avg>=50?'Average':'Below Average';
        doc.setFillColor(i%2===0?255:248, i%2===0?255:250, i%2===0?255:252);
        doc.rect(margin, y, W-margin*2, 9, 'F');
        doc.setDrawColor(226,232,240); doc.rect(margin, y, W-margin*2, 9, 'S');
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(15,23,42);
        doc.text(g, margin+4, y+6);
        doc.text(String(d.count), margin+35, y+6, { align:'center' });
        doc.text(String(d.entries), margin+70, y+6, { align:'center' });
        doc.text(`${d.avg}%`, margin+115, y+6, { align:'center' });
        const gc = d.avg>=70?[16,185,129]:d.avg>=50?[245,158,11]:[239,68,68];
        doc.setTextColor(...gc); doc.setFont('helvetica','bold');
        doc.text(letter, margin+155, y+6, { align:'center' });
        doc.text(level, margin+210, y+6, { align:'center' });
        y += 9;
      });

      doc.setFillColor(19,127,236); doc.rect(0, 193, W, 12, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont('helvetica','normal');
      doc.text(`${config.name} | Confidential Academic Report`, W/2, 200, { align:'center' });

      doc.save(`Class_Performance_Report_${term.replace(/\s/g,'')}_${year.replace('/','-')}.pdf`);
      showToast('Class report downloaded!', 'success');
    } catch (err) {
      showToast('Failed to generate report: ' + err.message, 'error');
    }
  },

  async downloadClassReport(grade) {
    this._gradeFilter = grade;
    await this.generateClassReport();
    this._gradeFilter = 'all';
  },

  async generateFinancialReport() {
    showToast('Generating financial report…', 'info');
    try {
      const jsPDF = await this._ensureJsPDF();
      const payments = (dataManager.getAll('payments') || []).filter(p => p.status === 'paid');
      const config = this._getSchoolConfig();
      const { term, year } = this._getCurrentTermYear();
      const total = payments.reduce((s,p)=>s+(p.amount||0),0);

      const doc = new jsPDF({ unit:'mm', format:'a4' });
      const W = 210, margin = 15;

      doc.setFillColor(16,185,129); doc.rect(0,0,W,35,'F');
      doc.setTextColor(255,255,255); doc.setFontSize(16); doc.setFont('helvetica','bold');
      doc.text(`${config.name}`, W/2, 14, { align:'center' });
      doc.setFontSize(11); doc.text('FINANCIAL SUMMARY REPORT', W/2, 23, { align:'center' });
      doc.setFontSize(8.5); doc.setFont('helvetica','normal');
      doc.text(`${term} Term | ${year}`, W/2, 31, { align:'center' });

      let y = 45;
      // Summary box
      doc.setFillColor(240,253,244); doc.rect(margin,y,W-margin*2,24,'F');
      doc.setDrawColor(187,247,208); doc.rect(margin,y,W-margin*2,24,'S');
      doc.setTextColor(15,23,42); doc.setFontSize(9); doc.setFont('helvetica','bold');
      doc.text('Total Collected:', margin+5, y+10);
      doc.setFontSize(16); doc.setTextColor(16,185,129);
      doc.text(`NGN ${total.toLocaleString()}`, margin+55, y+10);
      doc.setFontSize(8.5); doc.setTextColor(100,116,139); doc.setFont('helvetica','normal');
      doc.text(`${payments.length} payments recorded`, margin+5, y+20);
      y += 32;

      // Table
      doc.setFillColor(15,23,42); doc.rect(margin,y,W-margin*2,8,'F');
      doc.setTextColor(255,255,255); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
      doc.text('Student', margin+3, y+5.5);
      doc.text('Grade', margin+70, y+5.5, { align:'center' });
      doc.text('Amount (NGN)', margin+110, y+5.5, { align:'center' });
      doc.text('Date', margin+145, y+5.5, { align:'center' });
      doc.text('Method', margin+175, y+5.5, { align:'center' });
      y += 8;

      payments.slice(0,40).forEach((p, i) => {
        if (y > 265) { doc.addPage(); y = 20; }
        doc.setFillColor(i%2===0?255:248, i%2===0?255:250, i%2===0?255:252);
        doc.rect(margin,y,W-margin*2,7,'F');
        doc.setDrawColor(226,232,240); doc.rect(margin,y,W-margin*2,7,'S');
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(15,23,42);
        doc.text((p.student_name||p.studentName||'—').substring(0,28), margin+3, y+5);
        doc.text(p.grade||'—', margin+70, y+5, { align:'center' });
        doc.setTextColor(16,185,129); doc.setFont('helvetica','bold');
        doc.text((p.amount||0).toLocaleString(), margin+110, y+5, { align:'center' });
        doc.setTextColor(15,23,42); doc.setFont('helvetica','normal');
        doc.text(p.payment_date?new Date(p.payment_date).toLocaleDateString('en-GB'):'—', margin+145, y+5, { align:'center' });
        doc.text((p.payment_method||p.paymentMethod||'—').substring(0,12), margin+175, y+5, { align:'center' });
        y += 7;
      });

      doc.setFillColor(16,185,129); doc.rect(0,277,W,20,'F');
      doc.setTextColor(255,255,255); doc.setFontSize(7.5);
      doc.text(`Generated: ${new Date().toLocaleString()} | ${config.name}`, W/2, 289, { align:'center' });

      doc.save(`Financial_Report_${term.replace(/\s/g,'')}_${year.replace('/','-')}.pdf`);
      showToast('Financial report downloaded!', 'success');
    } catch (err) {
      showToast('Failed to generate report: ' + err.message, 'error');
    }
  }
};

if (typeof window !== 'undefined') window.reportCardsModule = reportCardsModule;
