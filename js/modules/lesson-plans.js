// ============================================
// LESSON PLANS MODULE
// Teachers create & manage weekly lesson plans
// Admins review and approve plans
// DB: lessonPlans → lesson_plans table
// ============================================

const lessonPlansModule = {
  currentTab: 'my-plans',
  _weekFilter: '',
  _subjectFilter: 'all',
  _statusFilter: 'all',
  _currentTeacher: null,
  _selectedPlan: null,

  async init(container) {
    this.container = container || document.getElementById('main-content');
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    await dataManager.waitForReady();
    this._resolveTeacher();
    // Default week to current Monday
    if (!this._weekFilter) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() + 1);
      this._weekFilter = d.toISOString().split('T')[0];
    }
    this.render();
    this._onDataChange = (e) => {
      if (['lessonPlans', 'subjectCatalog', 'schoolSchedules'].includes(e.detail.collection)) {
        this._resolveTeacher();
        this.render();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  _resolveTeacher() {
    const session = authManager?.getSession();
    if (!session) { this._currentTeacher = null; return; }
    const staff = dataManager.getAll('staff') || [];
    const t = staff.find(s => s.authId === session.supabaseId || s.auth_id === session.supabaseId)
           || staff.find(s => s.id === session.userId);
    this._currentTeacher = t
      ? { ...t, sessionId: session.supabaseId, role: session.role }
      : { id: session.supabaseId, name: session.fullName, sessionId: session.supabaseId, role: session.role };
  },

  _isAdmin() {
    return ['admin','staff'].includes(this._currentTeacher?.role || authManager?.getSession()?.role);
  },

  // ── Data helpers ──────────────────────────────────────────────────────────

  _getMyPlans() {
    const all = dataManager.getAll('lessonPlans') || [];
    const tid = this._currentTeacher?.id || this._currentTeacher?.sessionId;
    return this._isAdmin() && this.currentTab === 'all-plans'
      ? all
      : all.filter(p => p.teacherId === tid || p.teacher_id === tid);
  },

  _filteredPlans() {
    let plans = this._getMyPlans();
    if (this._subjectFilter !== 'all') plans = plans.filter(p => p.subjectId === this._subjectFilter || p.subject_id === this._subjectFilter);
    if (this._statusFilter !== 'all') plans = plans.filter(p => p.status === this._statusFilter);
    if (this._weekFilter) plans = plans.filter(p => {
      const pw = p.weekStarting || p.week_starting || '';
      return pw.startsWith(this._weekFilter.slice(0,7)); // match year-month
    });
    return plans.sort((a, b) => new Date(b.weekStarting || b.week_starting || 0) - new Date(a.weekStarting || a.week_starting || 0));
  },

  _getSubjects() {
    return dataManager.getAll('subjectCatalog') || [];
  },

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    const all = this._getMyPlans();
    const pending = all.filter(p => p.status === 'submitted').length;
    const approved = all.filter(p => p.status === 'approved').length;
    const draft = all.filter(p => p.status === 'draft').length;

    this.container.innerHTML = `
      <div class="module-container animate-fadeIn">
        <!-- Header -->
        <div class="module-header" style="margin-bottom:var(--space-5);">
          <div>
            <h1 class="module-title">📖 Lesson Plans</h1>
            <p class="module-subtitle">Create weekly lesson plans, track topics, and get admin approval</p>
          </div>
          <button class="btn btn-primary" onclick="lessonPlansModule.openCreateModal()">
            ➕ New Lesson Plan
          </button>
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3);margin-bottom:var(--space-5);">
          ${this._chip('Total Plans', all.length, 'var(--color-primary)')}
          ${this._chip('Draft', draft, '#94a3b8')}
          ${this._chip('Submitted', pending, '#f59e0b')}
          ${this._chip('Approved', approved, '#10b981')}
        </div>

        <!-- Tabs (admin sees extra All Plans tab) -->
        <div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-5);border-bottom:2px solid var(--border-primary);overflow-x:auto;">
          ${this._tabBtn('my-plans','📋 My Plans')}
          ${this._isAdmin() ? this._tabBtn('all-plans','👁 All Plans') : ''}
        </div>

        <!-- Filters -->
        <div class="card" style="margin-bottom:var(--space-5);padding:var(--space-4);">
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center;">
            <div style="display:flex;align-items:center;gap:var(--space-2);">
              <label style="font-size:var(--font-size-sm);color:var(--text-secondary);white-space:nowrap;">Week of:</label>
              <input type="date" class="form-input" value="${this._weekFilter}"
                onchange="lessonPlansModule._weekFilter=this.value;lessonPlansModule.render()" style="width:160px;">
            </div>
            <select class="form-select" onchange="lessonPlansModule._subjectFilter=this.value;lessonPlansModule.render()">
              <option value="all">All Subjects</option>
              ${this._getSubjects().map(s=>`<option value="${s.id}" ${this._subjectFilter===s.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
            <select class="form-select" onchange="lessonPlansModule._statusFilter=this.value;lessonPlansModule.render()">
              <option value="all" ${this._statusFilter==='all'?'selected':''}>All Statuses</option>
              <option value="draft" ${this._statusFilter==='draft'?'selected':''}>Draft</option>
              <option value="submitted" ${this._statusFilter==='submitted'?'selected':''}>Submitted</option>
              <option value="approved" ${this._statusFilter==='approved'?'selected':''}>Approved</option>
              <option value="needs_revision" ${this._statusFilter==='needs_revision'?'selected':''}>Needs Revision</option>
            </select>
            <button class="btn btn-secondary btn-sm" onclick="lessonPlansModule._weekFilter='';lessonPlansModule._subjectFilter='all';lessonPlansModule._statusFilter='all';lessonPlansModule.render()">
              ↺ Clear Filters
            </button>
          </div>
        </div>

        <!-- Plan Cards -->
        <div style="display:grid;gap:var(--space-4);">
          ${this._filteredPlans().length > 0
            ? this._filteredPlans().map(p => this._renderPlanCard(p)).join('')
            : this._emptyState()}
        </div>
      </div>

      <!-- Create/Edit Modal -->
      <div id="lp-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)lessonPlansModule.closeModal()">
        <div class="modal-container" style="max-width:680px;width:95%;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
          <div id="lp-modal-body"></div>
        </div>
      </div>

      <!-- View Modal -->
      <div id="lp-view-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)lessonPlansModule.closeViewModal()">
        <div class="modal-container" style="max-width:700px;width:95%;max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
          <div id="lp-view-body"></div>
        </div>
      </div>
    `;
  },

  _chip(label, val, color) {
    return `<div class="card" style="padding:var(--space-4);text-align:center;">
      <div style="font-size:1.5rem;font-weight:700;color:${color};">${val}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">${label}</div>
    </div>`;
  },

  _tabBtn(key, label) {
    const active = this.currentTab === key;
    return `<button onclick="lessonPlansModule.currentTab='${key}';lessonPlansModule.render()"
      style="padding:var(--space-3) var(--space-5);background:none;border:none;cursor:pointer;
             font-size:var(--font-size-sm);font-weight:${active?'700':'500'};
             color:${active?'var(--color-primary)':'var(--text-secondary)'};
             border-bottom:3px solid ${active?'var(--color-primary)':'transparent'};
             margin-bottom:-2px;white-space:nowrap;">${label}</button>`;
  },

  _renderPlanCard(p) {
    const statusColors = { draft:'#94a3b8', submitted:'#f59e0b', approved:'#10b981', needs_revision:'#ef4444' };
    const statusIcons  = { draft:'📝', submitted:'📤', approved:'✅', needs_revision:'⚠️' };
    const color = statusColors[p.status] || '#94a3b8';
    const icon  = statusIcons[p.status]  || '📝';
    const dayCount = (p.days || []).length;
    const weekStr = p.weekStarting || p.week_starting;

    return `
      <div class="card" style="border-left:4px solid ${color};">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:var(--space-3);">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);">
                <span style="font-size:1.3rem;">${icon}</span>
                <h3 style="margin:0;font-size:var(--font-size-lg);font-weight:600;">${p.title || p.subjectName || 'Untitled Plan'}</h3>
                <span style="font-size:0.7rem;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};font-weight:600;text-transform:uppercase;">${p.status}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);font-size:var(--font-size-sm);color:var(--text-secondary);">
                <span>📚 ${p.subjectName || p.subject || '—'}</span>
                <span>🏫 ${p.grade || p.class || '—'}</span>
                ${weekStr ? `<span>📅 Week of ${new Date(weekStr).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>` : ''}
                <span>📋 ${dayCount} day${dayCount!==1?'s':''} planned</span>
                ${p.teacherName || p.teacher_name ? `<span>👨‍🏫 ${p.teacherName||p.teacher_name}</span>` : ''}
              </div>
              ${p.objectives ? `<p style="margin:var(--space-2) 0 0;font-size:var(--font-size-sm);color:var(--text-secondary);">${p.objectives.substring(0,120)}${p.objectives.length>120?'…':''}</p>` : ''}
              ${p.adminFeedback ? `
                <div style="margin-top:var(--space-2);padding:var(--space-2) var(--space-3);background:${p.status==='approved'?'#f0fdf4':'#fef2f2'};border-radius:var(--radius-md);font-size:var(--font-size-sm);color:${p.status==='approved'?'#166534':'#991b1b'};">
                  💬 ${p.adminFeedback}
                </div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-2);">
              <button class="btn btn-sm btn-secondary" onclick="lessonPlansModule.viewPlan('${p.id}')">👁 View</button>
              ${p.status !== 'approved' ? `<button class="btn btn-sm btn-secondary" onclick="lessonPlansModule.openEditModal('${p.id}')">✏️ Edit</button>` : ''}
              ${p.status === 'draft' ? `<button class="btn btn-sm btn-primary" onclick="lessonPlansModule.submitPlan('${p.id}')">📤 Submit</button>` : ''}
              ${this._isAdmin() && p.status === 'submitted' ? `
                <button class="btn btn-sm" style="background:#10b981;color:#fff;" onclick="lessonPlansModule.approvePlan('${p.id}')">✅ Approve</button>
                <button class="btn btn-sm" style="background:#ef4444;color:#fff;" onclick="lessonPlansModule.requestRevision('${p.id}')">⚠️ Revise</button>
              ` : ''}
              <button class="btn btn-sm btn-ghost" onclick="lessonPlansModule.deletePlan('${p.id}')">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _emptyState() {
    return `<div class="card"><div class="card-body" style="text-align:center;padding:var(--space-12);">
      <div style="font-size:3rem;margin-bottom:var(--space-3);">📖</div>
      <h3 style="color:var(--text-secondary);">No Lesson Plans</h3>
      <p style="color:var(--text-tertiary);">Create your first weekly lesson plan.</p>
      <button class="btn btn-primary" style="margin-top:var(--space-4);" onclick="lessonPlansModule.openCreateModal()">➕ Create Plan</button>
    </div></div>`;
  },

  // ── Create / Edit Modal ───────────────────────────────────────────────────

  openCreateModal() {
    this._selectedPlan = null;
    this._renderModal(null);
    document.getElementById('lp-modal').style.display = 'flex';
  },

  openEditModal(id) {
    const all = dataManager.getAll('lessonPlans') || [];
    this._selectedPlan = all.find(p => p.id === id);
    this._renderModal(this._selectedPlan);
    document.getElementById('lp-modal').style.display = 'flex';
  },

  _renderModal(plan) {
    const subjects = this._getSubjects();
    const isEdit = !!plan;
    const days = plan?.days || [{ day:'Monday', topic:'', activities:'', resources:'' }];

    document.getElementById('lp-modal-body').innerHTML = `
      <div style="padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
          <h2 style="margin:0;font-size:var(--font-size-xl);font-weight:600;">${isEdit ? '✏️ Edit Lesson Plan' : '➕ New Lesson Plan'}</h2>
          <button class="btn btn-ghost btn-sm" onclick="lessonPlansModule.closeModal()">✕</button>
        </div>
        <form id="lp-form" onsubmit="lessonPlansModule.savePlan(event)">
          <div style="display:grid;gap:var(--space-4);">

            <div>
              <label class="form-label">Plan Title *</label>
              <input class="form-input" name="title" required placeholder="e.g. Introduction to Algebra"
                value="${plan?.title || ''}">
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
              <div>
                <label class="form-label">Subject *</label>
                <select class="form-select" name="subjectId" required onchange="lessonPlansModule._syncLpSubject(this)">
                  <option value="">Select subject</option>
                  ${subjects.map(s=>`<option value="${s.id}" data-name="${s.name}" ${plan?.subjectId===s.id?'selected':''}>${s.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">Grade *</label>
                <select class="form-select" name="grade" required>
                  <option value="">Select grade</option>
                  ${['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(g=>`<option value="${g}" ${plan?.grade===g?'selected':''}>${g}</option>`).join('')}
                </select>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
              <div>
                <label class="form-label">Week Starting *</label>
                <input class="form-input" type="date" name="weekStarting" required value="${plan?.weekStarting ? plan.weekStarting.split('T')[0] : this._weekFilter}">
              </div>
              <div>
                <label class="form-label">Term</label>
                <select class="form-select" name="term">
                  ${['1st Term','2nd Term','3rd Term'].map(t=>`<option value="${t}" ${plan?.term===t?'selected':''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>

            <div>
              <label class="form-label">Learning Objectives</label>
              <textarea class="form-input" name="objectives" rows="2" placeholder="What students will learn by the end of the week…">${plan?.objectives || ''}</textarea>
            </div>

            <!-- Daily Breakdown -->
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3);">
                <label class="form-label" style="margin:0;">Daily Plan</label>
                <button type="button" class="btn btn-sm btn-secondary" onclick="lessonPlansModule.addDay()">+ Add Day</button>
              </div>
              <div id="lp-days-container" style="display:grid;gap:var(--space-3);">
                ${days.map((d,i) => this._dayRow(d, i)).join('')}
              </div>
            </div>

            <div>
              <label class="form-label">Materials / Resources</label>
              <textarea class="form-input" name="materials" rows="2" placeholder="Textbooks, worksheets, lab equipment…">${plan?.materials || ''}</textarea>
            </div>

            <div>
              <label class="form-label">Assessment Plan</label>
              <textarea class="form-input" name="assessment" rows="2" placeholder="How you'll assess student learning this week…">${plan?.assessment || ''}</textarea>
            </div>
          </div>
          <input type="hidden" name="subjectName" id="lp-subject-name" value="${plan?.subjectName || ''}">
          <div style="display:flex;gap:var(--space-3);margin-top:var(--space-5);justify-content:flex-end;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" onclick="lessonPlansModule.closeModal()">Cancel</button>
            <button type="submit" name="saveAs" value="draft" class="btn btn-secondary" onclick="this.form.elements.saveAs.value='draft'">💾 Save Draft</button>
            <button type="submit" name="saveAs" value="submitted" class="btn btn-primary" onclick="this.form.elements.saveAs.value='submitted'">📤 Save & Submit</button>
          </div>
          <input type="hidden" name="saveAs" value="draft">
        </form>
      </div>
    `;
  },

  _dayRow(day, idx) {
    return `
      <div class="card" style="padding:var(--space-3);" id="lp-day-${idx}">
        <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:var(--space-3);align-items:start;">
          <select class="form-select" style="width:120px;" name="day_${idx}_name">
            ${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(d=>`<option ${day.day===d?'selected':''}>${d}</option>`).join('')}
          </select>
          <div>
            <input class="form-input" name="day_${idx}_topic" placeholder="Topic / Lesson title" value="${day.topic||''}">
          </div>
          <div style="display:flex;gap:var(--space-2);align-items:center;">
            <input class="form-input" style="flex:1;" name="day_${idx}_activities" placeholder="Key activities" value="${day.activities||''}">
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger);" onclick="lessonPlansModule.removeDay(${idx})">✕</button>
          </div>
        </div>
      </div>
    `;
  },

  addDay() {
    const container = document.getElementById('lp-days-container');
    if (!container) return;
    const idx = container.children.length;
    container.insertAdjacentHTML('beforeend', this._dayRow({ day:'Monday', topic:'', activities:'' }, idx));
  },

  removeDay(idx) {
    const el = document.getElementById(`lp-day-${idx}`);
    if (el) el.remove();
  },

  _syncLpSubject(sel) {
    const opt = sel.options[sel.selectedIndex];
    const h = document.getElementById('lp-subject-name');
    if (h) h.value = opt?.dataset?.name || '';
  },

  async savePlan(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tid = this._currentTeacher?.id || this._currentTeacher?.sessionId;

    // Collect day rows
    const days = [];
    const container = document.getElementById('lp-days-container');
    if (container) {
      [...container.children].forEach((_, i) => {
        const name = fd.get(`day_${i}_name`);
        const topic = fd.get(`day_${i}_topic`);
        const activities = fd.get(`day_${i}_activities`);
        if (name && topic) days.push({ day:name, topic, activities: activities||'' });
      });
    }

    const data = {
      title: fd.get('title'),
      subjectId: fd.get('subjectId'),
      subjectName: fd.get('subjectName'),
      grade: fd.get('grade'),
      weekStarting: fd.get('weekStarting'),
      term: fd.get('term'),
      objectives: fd.get('objectives'),
      materials: fd.get('materials'),
      assessment: fd.get('assessment'),
      days,
      status: fd.get('saveAs') || 'draft',
      teacherId: tid,
      teacher_id: tid,
      teacherName: this._currentTeacher?.name || this._currentTeacher?.fullName || '',
    };

    if (this._selectedPlan) {
      data.updatedAt = new Date().toISOString();
      await dataManager.update('lessonPlans', this._selectedPlan.id, data);
      showToast('Lesson plan updated', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await dataManager.create('lessonPlans', data);
      showToast(data.status === 'submitted' ? 'Plan submitted for approval' : 'Draft saved', 'success');
    }
    this.closeModal();
    this.render();
  },

  closeModal() {
    const el = document.getElementById('lp-modal');
    if (el) el.style.display = 'none';
  },

  // ── View Modal ─────────────────────────────────────────────────────────────

  viewPlan(id) {
    const all = dataManager.getAll('lessonPlans') || [];
    const p = all.find(pl => pl.id === id);
    if (!p) return;

    const weekStr = p.weekStarting || p.week_starting;
    const statusColors = { draft:'#94a3b8', submitted:'#f59e0b', approved:'#10b981', needs_revision:'#ef4444' };

    document.getElementById('lp-view-body').innerHTML = `
      <div style="padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
          <h2 style="margin:0;font-size:var(--font-size-xl);font-weight:600;">📖 ${p.title}</h2>
          <button class="btn btn-ghost btn-sm" onclick="lessonPlansModule.closeViewModal()">✕</button>
        </div>

        <!-- Meta info -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--space-3);margin-bottom:var(--space-5);background:var(--bg-secondary);padding:var(--space-4);border-radius:var(--radius-lg);">
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Subject</div><strong>${p.subjectName||p.subject||'—'}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Grade</div><strong>${p.grade||p.class||'—'}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Week of</div><strong>${weekStr?new Date(weekStr).toLocaleDateString('en-GB'):'—'}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Term</div><strong>${p.term||'—'}</strong></div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Status</div>
            <span style="font-size:0.75rem;padding:2px 8px;border-radius:99px;background:${statusColors[p.status]||'#94a3b8'}22;color:${statusColors[p.status]||'#94a3b8'};font-weight:600;text-transform:uppercase;">${p.status}</span>
          </div>
          <div><div style="font-size:0.7rem;color:var(--text-tertiary);">Teacher</div><strong>${p.teacherName||p.teacher_name||'—'}</strong></div>
        </div>

        ${p.objectives ? `
          <div style="margin-bottom:var(--space-4);">
            <h4 style="margin-bottom:var(--space-2);">🎯 Learning Objectives</h4>
            <p style="color:var(--text-secondary);margin:0;">${p.objectives}</p>
          </div>` : ''}

        <!-- Daily plan table -->
        ${p.days && p.days.length > 0 ? `
          <div style="margin-bottom:var(--space-4);">
            <h4 style="margin-bottom:var(--space-3);">📅 Daily Breakdown</h4>
            <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
              <thead><tr style="background:var(--color-primary);color:#fff;">
                <th style="padding:10px;text-align:left;">Day</th>
                <th style="padding:10px;text-align:left;">Topic</th>
                <th style="padding:10px;text-align:left;">Activities</th>
              </tr></thead>
              <tbody>
                ${p.days.map((d,i)=>`
                  <tr style="background:${i%2===0?'var(--bg-primary)':'var(--bg-secondary)'};border-bottom:1px solid var(--border-primary);">
                    <td style="padding:10px;font-weight:600;">${d.day}</td>
                    <td style="padding:10px;">${d.topic||'—'}</td>
                    <td style="padding:10px;color:var(--text-secondary);">${d.activities||'—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}

        ${p.materials ? `<div style="margin-bottom:var(--space-3);"><h4 style="margin-bottom:var(--space-2);">📚 Materials & Resources</h4><p style="color:var(--text-secondary);margin:0;">${p.materials}</p></div>` : ''}
        ${p.assessment ? `<div style="margin-bottom:var(--space-3);"><h4 style="margin-bottom:var(--space-2);">📊 Assessment Plan</h4><p style="color:var(--text-secondary);margin:0;">${p.assessment}</p></div>` : ''}

        ${p.adminFeedback ? `
          <div style="padding:var(--space-4);background:${p.status==='approved'?'#f0fdf4':'#fef2f2'};border:1px solid ${p.status==='approved'?'#bbf7d0':'#fecaca'};border-radius:var(--radius-lg);">
            <h4 style="margin:0 0 var(--space-2);color:${p.status==='approved'?'#166534':'#991b1b'};">💬 Admin Feedback</h4>
            <p style="margin:0;color:${p.status==='approved'?'#15803d':'#b91c1c'};">${p.adminFeedback}</p>
          </div>` : ''}

        <div style="display:flex;justify-content:flex-end;margin-top:var(--space-5);gap:var(--space-2);">
          ${p.status !== 'approved' ? `<button class="btn btn-secondary" onclick="lessonPlansModule.closeViewModal();lessonPlansModule.openEditModal('${p.id}')">✏️ Edit</button>` : ''}
          <button class="btn btn-primary" onclick="lessonPlansModule.closeViewModal()">Close</button>
        </div>
      </div>
    `;
    document.getElementById('lp-view-modal').style.display = 'flex';
  },

  closeViewModal() {
    const el = document.getElementById('lp-view-modal');
    if (el) el.style.display = 'none';
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  async submitPlan(id) {
    if (!confirm('Submit this lesson plan for admin review?')) return;
    await dataManager.update('lessonPlans', id, { status: 'submitted', submittedAt: new Date().toISOString() });
    showToast('Plan submitted for review', 'success');
    this.render();
  },

  async approvePlan(id) {
    const feedback = prompt('Optional approval note (leave blank for none):') || '';
    await dataManager.update('lessonPlans', id, {
      status: 'approved',
      adminFeedback: feedback || 'Approved.',
      approvedAt: new Date().toISOString(),
      approvedBy: this._currentTeacher?.name || authManager?.getSession()?.fullName || 'Admin'
    });
    showToast('Plan approved', 'success');
    this.render();
  },

  async requestRevision(id) {
    const feedback = prompt('What needs to be revised?');
    if (!feedback) return;
    await dataManager.update('lessonPlans', id, { status: 'needs_revision', adminFeedback: feedback });
    showToast('Revision requested', 'info');
    this.render();
  },

  async deletePlan(id) {
    if (!confirm('Delete this lesson plan?')) return;
    await dataManager.delete('lessonPlans', id);
    showToast('Plan deleted', 'info');
    this.render();
  }
};

if (typeof window !== 'undefined') window.lessonPlansModule = lessonPlansModule;
