// ============================================
// TEACHER TASKS MODULE
// Full CRUD: create assignments, track submissions, grade work
// ============================================

const teacherTasksModule = {
  currentTab: 'assignments',
  _search: '',
  _classFilter: 'all',
  _statusFilter: 'all',
  _selectedTask: null,
  _currentTeacher: null,

  async init(container) {
    this.container = container || document.getElementById('main-content');
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    await dataManager.waitForReady();
    this._resolveTeacher();
    this.render();
    this._onDataChange = (e) => {
      if (['assignments', 'studentAssignments', 'students', 'schoolSchedules', 'subjectCatalog'].includes(e.detail.collection)) {
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
    const teacher = staff.find(s =>
      s.authId === session.supabaseId || s.auth_id === session.supabaseId
    ) || staff.find(s => s.id === session.userId);
    this._currentTeacher = teacher
      ? { ...teacher, sessionId: session.supabaseId, sessionUserId: session.userId }
      : { id: session.supabaseId, name: session.fullName, sessionId: session.supabaseId, sessionUserId: session.userId };
  },

  // ── Helpers ──────────────────────────────────────────────────────────────

  _getMyAssignments() {
    const all = dataManager.getAll('assignments') || [];
    const tid = this._currentTeacher?.id || this._currentTeacher?.sessionId;
    return all.filter(a => a.teacherId === tid || a.teacher_id === tid || a.createdBy === tid);
  },

  _getSubmissions(assignmentId) {
    const all = dataManager.getAll('studentAssignments') || [];
    return all.filter(s => s.assignmentId === assignmentId || s.assignment_id === assignmentId);
  },

  _getClasses() {
    return dataManager.getAll('schoolSchedules') || [];
  },

  _getSubjects() {
    return dataManager.getAll('subjectCatalog') || [];
  },

  _getStudentName(studentId) {
    const students = dataManager.getAll('students') || [];
    const s = students.find(st => st.id === studentId);
    return s ? (s.name || s.fullName || `Student ${studentId.slice(0, 6)}`) : 'Unknown';
  },

  _filteredAssignments() {
    let list = this._getMyAssignments();
    if (this._classFilter !== 'all') list = list.filter(a => a.grade === this._classFilter || a.class === this._classFilter);
    if (this._statusFilter !== 'all') list = list.filter(a => a.status === this._statusFilter);
    if (this._search) {
      const q = this._search.toLowerCase();
      list = list.filter(a => (a.title || '').toLowerCase().includes(q) || (a.subjectName || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
  },

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this.container) return;
    const assignments = this._getMyAssignments();
    const pending = assignments.filter(a => a.status === 'active').length;
    const grading  = assignments.reduce((sum, a) => sum + this._getSubmissions(a.id).filter(s => s.status === 'submitted' || s.status === 'pending').length, 0);

    this.container.innerHTML = `
      <div class="module-container animate-fadeIn">

        <!-- Header -->
        <div class="module-header" style="margin-bottom:var(--space-5);">
          <div>
            <h1 class="module-title">📋 Task & Assignment Manager</h1>
            <p class="module-subtitle">Create assignments, track student submissions, grade work</p>
          </div>
          <button class="btn btn-primary" onclick="teacherTasksModule.openCreateModal()">
            ➕ New Assignment
          </button>
        </div>

        <!-- Stats -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3);margin-bottom:var(--space-5);">
          ${this._chip('Total Assignments', assignments.length, 'var(--color-primary)')}
          ${this._chip('Active', pending, '#10b981')}
          ${this._chip('Awaiting Grading', grading, '#f59e0b')}
          ${this._chip('Closed', assignments.filter(a => a.status === 'closed').length, '#6366f1')}
        </div>

        <!-- Filters -->
        <div class="card" style="margin-bottom:var(--space-5);padding:var(--space-4);">
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center;">
            <input type="text" class="form-input" placeholder="Search assignments…"
              style="min-width:200px;flex:1;" value="${this._search}"
              oninput="teacherTasksModule._search=this.value;teacherTasksModule.render()">
            <select class="form-select" onchange="teacherTasksModule._classFilter=this.value;teacherTasksModule.render()">
              <option value="all" ${this._classFilter==='all'?'selected':''}>All Grades</option>
              ${['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(g=>`<option value="${g}" ${this._classFilter===g?'selected':''}>${g}</option>`).join('')}
            </select>
            <select class="form-select" onchange="teacherTasksModule._statusFilter=this.value;teacherTasksModule.render()">
              <option value="all" ${this._statusFilter==='all'?'selected':''}>All Status</option>
              <option value="active" ${this._statusFilter==='active'?'selected':''}>Active</option>
              <option value="closed" ${this._statusFilter==='closed'?'selected':''}>Closed</option>
              <option value="draft" ${this._statusFilter==='draft'?'selected':''}>Draft</option>
            </select>
          </div>
        </div>

        <!-- Assignment List -->
        <div style="display:grid;gap:var(--space-4);">
          ${this._filteredAssignments().length > 0
            ? this._filteredAssignments().map(a => this._renderCard(a)).join('')
            : this._emptyState()}
        </div>
      </div>

      <!-- Create/Edit Modal -->
      <div id="tt-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)teacherTasksModule.closeModal()">
        <div class="modal-container" style="max-width:600px;width:95%;" onclick="event.stopPropagation()">
          <div id="tt-modal-body"></div>
        </div>
      </div>

      <!-- Submissions Modal -->
      <div id="tt-subs-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this)teacherTasksModule.closeSubsModal()">
        <div class="modal-container" style="max-width:700px;width:95%;" onclick="event.stopPropagation()">
          <div id="tt-subs-body"></div>
        </div>
      </div>
    `;
  },

  _chip(label, value, color) {
    return `<div class="card" style="padding:var(--space-4);text-align:center;">
      <div style="font-size:1.5rem;font-weight:700;color:${color};">${value}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.2rem;">${label}</div>
    </div>`;
  },

  _renderCard(a) {
    const submissions = this._getSubmissions(a.id);
    const submitted = submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length;
    const pending   = submissions.filter(s => s.status === 'submitted').length;
    const due = new Date(a.dueDate || a.due_date);
    const isOverdue = due < new Date() && a.status === 'active';
    const statusColor = { active: '#10b981', closed: '#6366f1', draft: '#94a3b8' }[a.status] || '#94a3b8';

    return `
      <div class="card" style="border-left:4px solid ${statusColor};transition:box-shadow 0.2s;" onmouseenter="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)'" onmouseleave="this.style.boxShadow=''">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:var(--space-4);flex-wrap:wrap;">
            <div style="flex:1;min-width:200px;">
              <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1);">
                <span style="font-size:1.4rem;">${{ assignment:'📄', quiz:'📝', exam:'📋', project:'🎯', test:'📊' }[a.type]||'📄'}</span>
                <h3 style="font-size:var(--font-size-lg);font-weight:var(--font-weight-semibold);margin:0;">${a.title}</h3>
                <span style="font-size:0.7rem;padding:2px 8px;border-radius:99px;background:${statusColor}22;color:${statusColor};font-weight:600;text-transform:uppercase;">${a.status}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-3);">
                <span>📚 ${a.subjectName || a.subject || '—'}</span>
                <span>🏫 ${a.grade || a.class || '—'}</span>
                <span style="color:${isOverdue?'var(--color-danger)':'inherit'}">📅 Due: ${due.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>
                <span>🎯 ${a.totalMarks || a.total_marks || 100} marks</span>
              </div>
              ${a.description ? `<p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin:0 0 var(--space-3);">${a.description}</p>` : ''}
              <!-- Submission progress bar -->
              <div style="margin-top:var(--space-2);">
                <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;">
                  <span>${submitted} submitted</span>
                  ${pending > 0 ? `<span style="color:#f59e0b;font-weight:600;">${pending} need grading</span>` : ''}
                </div>
                <div style="height:6px;background:var(--bg-tertiary);border-radius:99px;overflow:hidden;">
                  <div style="height:100%;width:${submissions.length?Math.round(submitted/submissions.length*100):0}%;background:#10b981;border-radius:99px;transition:width 0.4s;"></div>
                </div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-2);">
              <button class="btn btn-sm btn-primary" onclick="teacherTasksModule.openSubmissions('${a.id}')">
                📊 Submissions (${submissions.length})
              </button>
              <button class="btn btn-sm btn-secondary" onclick="teacherTasksModule.openEditModal('${a.id}')">
                ✏️ Edit
              </button>
              <button class="btn btn-sm btn-ghost" onclick="teacherTasksModule.toggleStatus('${a.id}','${a.status}')">
                ${a.status === 'active' ? '🔒 Close' : '🔓 Reopen'}
              </button>
              <button class="btn btn-sm" style="background:var(--color-danger);color:#fff;" onclick="teacherTasksModule.deleteAssignment('${a.id}')">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _emptyState() {
    return `<div class="card"><div class="card-body" style="text-align:center;padding:var(--space-12);">
      <div style="font-size:3rem;margin-bottom:var(--space-3);">📋</div>
      <h3 style="color:var(--text-secondary);">No Assignments Yet</h3>
      <p style="color:var(--text-tertiary);">Create your first assignment using the button above.</p>
      <button class="btn btn-primary" style="margin-top:var(--space-4);" onclick="teacherTasksModule.openCreateModal()">➕ Create Assignment</button>
    </div></div>`;
  },

  // ── Create / Edit Modal ───────────────────────────────────────────────────

  openCreateModal() {
    this._selectedTask = null;
    this._renderModal(null);
    document.getElementById('tt-modal').style.display = 'flex';
  },

  openEditModal(id) {
    const all = dataManager.getAll('assignments') || [];
    this._selectedTask = all.find(a => a.id === id);
    this._renderModal(this._selectedTask);
    document.getElementById('tt-modal').style.display = 'flex';
  },

  _renderModal(task) {
    const subjects = this._getSubjects();
    const isEdit = !!task;
    document.getElementById('tt-modal-body').innerHTML = `
      <div style="padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-5);">
          <h2 style="margin:0;font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);">
            ${isEdit ? '✏️ Edit Assignment' : '➕ New Assignment'}
          </h2>
          <button class="btn btn-ghost btn-sm" onclick="teacherTasksModule.closeModal()">✕</button>
        </div>
        <form id="tt-form" onsubmit="teacherTasksModule.saveAssignment(event)">
          <div style="display:grid;gap:var(--space-4);">
            <div>
              <label class="form-label">Title *</label>
              <input class="form-input" name="title" required placeholder="Assignment title"
                value="${task?.title || ''}">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
              <div>
                <label class="form-label">Type *</label>
                <select class="form-select" name="type" required>
                  ${['assignment','quiz','exam','project','test'].map(t=>
                    `<option value="${t}" ${(task?.type||'assignment')===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`
                  ).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">Status</label>
                <select class="form-select" name="status">
                  <option value="active" ${(task?.status||'active')==='active'?'selected':''}>Active</option>
                  <option value="draft" ${task?.status==='draft'?'selected':''}>Draft</option>
                  <option value="closed" ${task?.status==='closed'?'selected':''}>Closed</option>
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
              <div>
                <label class="form-label">Grade/Class *</label>
                <select class="form-select" name="grade" required>
                  <option value="">Select grade</option>
                  ${['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(g=>
                    `<option value="${g}" ${task?.grade===g?'selected':''}>${g}</option>`
                  ).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">Subject *</label>
                <select class="form-select" name="subjectId" required onchange="teacherTasksModule._syncSubjectName(this)">
                  <option value="">Select subject</option>
                  ${subjects.map(s=>`<option value="${s.id}" data-name="${s.name}" ${task?.subjectId===s.id?'selected':''}>${s.name}</option>`).join('')}
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
              <div>
                <label class="form-label">Due Date *</label>
                <input class="form-input" type="date" name="dueDate" required
                  value="${task?.dueDate ? task.dueDate.split('T')[0] : ''}">
              </div>
              <div>
                <label class="form-label">Total Marks *</label>
                <input class="form-input" type="number" name="totalMarks" min="1" max="1000" required
                  value="${task?.totalMarks || task?.total_marks || 100}">
              </div>
            </div>
            <div>
              <label class="form-label">Instructions / Description</label>
              <textarea class="form-input" name="description" rows="3" placeholder="Describe the assignment…">${task?.description || ''}</textarea>
            </div>
          </div>
          <input type="hidden" name="subjectName" id="tt-subject-name" value="${task?.subjectName || ''}">
          <div style="display:flex;gap:var(--space-3);margin-top:var(--space-5);justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" onclick="teacherTasksModule.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'} Assignment</button>
          </div>
        </form>
      </div>
    `;
    // If editing and subject already set, pre-fill hidden name
    if (task?.subjectId) {
      const sel = document.querySelector('[name="subjectId"]');
      if (sel) this._syncSubjectName(sel);
    }
  },

  _syncSubjectName(sel) {
    const opt = sel.options[sel.selectedIndex];
    const hidden = document.getElementById('tt-subject-name');
    if (hidden) hidden.value = opt?.dataset?.name || opt?.text || '';
  },

  async saveAssignment(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tid = this._currentTeacher?.id || this._currentTeacher?.sessionId;
    const data = {
      title: fd.get('title'),
      type: fd.get('type'),
      status: fd.get('status'),
      grade: fd.get('grade'),
      subjectId: fd.get('subjectId'),
      subjectName: fd.get('subjectName'),
      dueDate: fd.get('dueDate'),
      totalMarks: parseInt(fd.get('totalMarks')),
      description: fd.get('description'),
      teacherId: tid,
      createdBy: tid,
    };

    if (this._selectedTask) {
      await dataManager.update('assignments', this._selectedTask.id, data);
      showToast('Assignment updated', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await dataManager.create('assignments', data);
      showToast('Assignment created', 'success');
    }
    this.closeModal();
    this.render();
  },

  closeModal() {
    const el = document.getElementById('tt-modal');
    if (el) el.style.display = 'none';
  },

  // ── Submissions Panel ─────────────────────────────────────────────────────

  openSubmissions(assignmentId) {
    const all = dataManager.getAll('assignments') || [];
    const assignment = all.find(a => a.id === assignmentId);
    if (!assignment) return;
    const submissions = this._getSubmissions(assignmentId);
    const students = dataManager.getAll('students') || [];

    // Build submission map for students in this grade
    const gradeStudents = students.filter(s =>
      (s.grade === assignment.grade || s.class === assignment.grade) && s.status === 'active'
    );

    document.getElementById('tt-subs-body').innerHTML = `
      <div style="padding:var(--space-6);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
          <div>
            <h2 style="margin:0 0 4px;font-size:var(--font-size-xl);font-weight:var(--font-weight-semibold);">
              📊 ${assignment.title} — Submissions
            </h2>
            <p style="margin:0;font-size:var(--font-size-sm);color:var(--text-secondary);">
              ${assignment.subjectName} | ${assignment.grade} | Due: ${new Date(assignment.dueDate).toLocaleDateString('en-GB')} | ${assignment.totalMarks} marks
            </p>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="teacherTasksModule.closeSubsModal()">✕</button>
        </div>

        <!-- Summary chips -->
        <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-4);">
          ${this._subChip('Total Students', gradeStudents.length, '#6366f1')}
          ${this._subChip('Submitted', submissions.filter(s=>s.status!=='upcoming').length, '#10b981')}
          ${this._subChip('Not Submitted', gradeStudents.length - submissions.filter(s=>s.status!=='upcoming').length, '#ef4444')}
          ${this._subChip('Graded', submissions.filter(s=>s.status==='graded').length, '#f59e0b')}
        </div>

        <!-- Submissions Table -->
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:var(--font-size-sm);">
            <thead>
              <tr style="background:var(--bg-secondary);text-align:left;">
                <th style="padding:var(--space-3);border-bottom:1px solid var(--border-primary);">Student</th>
                <th style="padding:var(--space-3);border-bottom:1px solid var(--border-primary);">Status</th>
                <th style="padding:var(--space-3);border-bottom:1px solid var(--border-primary);">Submitted</th>
                <th style="padding:var(--space-3);border-bottom:1px solid var(--border-primary);">Score</th>
                <th style="padding:var(--space-3);border-bottom:1px solid var(--border-primary);">Grade</th>
                <th style="padding:var(--space-3);border-bottom:1px solid var(--border-primary);">Action</th>
              </tr>
            </thead>
            <tbody>
              ${gradeStudents.length > 0
                ? gradeStudents.map(student => {
                    const sub = submissions.find(s => s.studentId === student.id || s.student_id === student.id);
                    return this._renderSubmissionRow(student, sub, assignment);
                  }).join('')
                : `<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-secondary);">No students found in ${assignment.grade}</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div style="margin-top:var(--space-4);display:flex;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="teacherTasksModule.exportSubmissions('${assignmentId}')">
            📥 Export Grades CSV
          </button>
        </div>
      </div>
    `;
    document.getElementById('tt-subs-modal').style.display = 'flex';
  },

  _subChip(label, val, color) {
    return `<div style="padding:8px 16px;border-radius:8px;background:${color}18;border:1px solid ${color}33;text-align:center;">
      <div style="font-weight:700;color:${color};">${val}</div>
      <div style="font-size:0.7rem;color:var(--text-secondary);">${label}</div>
    </div>`;
  },

  _renderSubmissionRow(student, sub, assignment) {
    const statusColors = { graded:'#10b981', submitted:'#f59e0b', upcoming:'#94a3b8', pending:'#3b82f6', overdue:'#ef4444' };
    const status = sub?.status || 'not_submitted';
    const color = statusColors[status] || '#94a3b8';
    const scoreVal = sub?.score !== undefined && sub?.score !== null ? sub.score : '';
    const grade = sub?.grade || '';

    return `
      <tr style="border-bottom:1px solid var(--border-primary);" id="tt-row-${student.id}">
        <td style="padding:var(--space-3);">
          <div style="font-weight:500;">${student.name || student.fullName}</div>
          <div style="font-size:0.7rem;color:var(--text-tertiary);">${student.rollNo || student.roll_no || ''}</div>
        </td>
        <td style="padding:var(--space-3);">
          <span style="font-size:0.75rem;padding:3px 10px;border-radius:99px;background:${color}22;color:${color};font-weight:600;text-transform:uppercase;">
            ${status === 'not_submitted' ? 'Not Submitted' : status}
          </span>
        </td>
        <td style="padding:var(--space-3);color:var(--text-secondary);">
          ${sub?.submittedDate ? new Date(sub.submittedDate).toLocaleDateString('en-GB') : '—'}
        </td>
        <td style="padding:var(--space-3);">
          <input type="number" style="width:70px;padding:4px 8px;border:1px solid var(--border-primary);border-radius:6px;font-size:0.875rem;"
            id="score-${student.id}" placeholder="0" min="0" max="${assignment.totalMarks}"
            value="${scoreVal}"
            onchange="teacherTasksModule._autoGrade('${student.id}','${assignment.id}',this.value,${assignment.totalMarks})">
          <span style="color:var(--text-secondary);">/${assignment.totalMarks}</span>
        </td>
        <td style="padding:var(--space-3);" id="grade-cell-${student.id}">
          <span style="font-weight:600;">${grade}</span>
        </td>
        <td style="padding:var(--space-3);">
          <button class="btn btn-sm btn-primary" onclick="teacherTasksModule.gradeSubmission('${student.id}','${assignment.id}',${assignment.totalMarks})">
            ✅ Save
          </button>
        </td>
      </tr>
    `;
  },

  _autoGrade(studentId, assignmentId, score, totalMarks) {
    const pct = (score / totalMarks) * 100;
    const letter = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
    const cell = document.getElementById(`grade-cell-${studentId}`);
    if (cell) cell.innerHTML = `<span style="font-weight:600;">${letter}</span>`;
  },

  async gradeSubmission(studentId, assignmentId, totalMarks) {
    const scoreEl = document.getElementById(`score-${studentId}`);
    const score = parseFloat(scoreEl?.value);
    if (isNaN(score) || score < 0 || score > totalMarks) {
      showToast(`Score must be between 0 and ${totalMarks}`, 'error'); return;
    }
    const pct = (score / totalMarks) * 100;
    const letter = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';

    const all = dataManager.getAll('studentAssignments') || [];
    const existing = all.find(s =>
      (s.studentId === studentId || s.student_id === studentId) &&
      (s.assignmentId === assignmentId || s.assignment_id === assignmentId)
    );

    const payload = {
      studentId, student_id: studentId,
      assignmentId, assignment_id: assignmentId,
      score, grade: letter, status: 'graded',
      gradedAt: new Date().toISOString(),
    };

    if (existing) {
      await dataManager.update('studentAssignments', existing.id, payload);
    } else {
      payload.submittedDate = new Date().toISOString();
      payload.id = `sub_${studentId}_${assignmentId}_${Date.now()}`;
      await dataManager.create('studentAssignments', payload);
    }

    showToast(`Graded: ${score}/${totalMarks} (${letter})`, 'success');
    this.openSubmissions(assignmentId);
  },

  closeSubsModal() {
    const el = document.getElementById('tt-subs-modal');
    if (el) el.style.display = 'none';
  },

  // ── Actions ───────────────────────────────────────────────────────────────

  async toggleStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'closed' : 'active';
    await dataManager.update('assignments', id, { status: newStatus });
    showToast(`Assignment ${newStatus}`, 'success');
    this.render();
  },

  async deleteAssignment(id) {
    if (!confirm('Delete this assignment and all its submissions?')) return;
    await dataManager.delete('assignments', id);
    showToast('Assignment deleted', 'info');
    this.render();
  },

  exportSubmissions(assignmentId) {
    const all = dataManager.getAll('assignments') || [];
    const assignment = all.find(a => a.id === assignmentId);
    const submissions = this._getSubmissions(assignmentId);
    const students = dataManager.getAll('students') || [];
    const gradeStudents = students.filter(s =>
      (s.grade === assignment?.grade || s.class === assignment?.grade) && s.status === 'active'
    );

    const rows = [
      ['Student Name', 'Roll No', 'Status', 'Score', `Total (${assignment?.totalMarks})`, 'Grade %', 'Letter Grade', 'Submitted Date'],
      ...gradeStudents.map(student => {
        const sub = submissions.find(s => s.studentId === student.id || s.student_id === student.id);
        const pct = sub?.score != null ? Math.round((sub.score / assignment.totalMarks) * 100) : '';
        return [
          student.name || student.fullName,
          student.rollNo || student.roll_no || '',
          sub?.status || 'not_submitted',
          sub?.score ?? '',
          assignment?.totalMarks,
          pct,
          sub?.grade || '',
          sub?.submittedDate ? new Date(sub.submittedDate).toLocaleDateString('en-GB') : ''
        ];
      })
    ];

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${assignment?.title?.replace(/\s+/g,'_') || 'assignment'}_grades.csv`;
    a.click();
    showToast('Grades exported', 'success');
  }
};

if (typeof window !== 'undefined') window.teacherTasksModule = teacherTasksModule;
