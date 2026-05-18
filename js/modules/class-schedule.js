// ============================================
// CLASS & SCHEDULE MODULE — Restructured
// ============================================

const classScheduleModule = {
  currentTab: 'grades',
  _selectedGrade: null,
  _selectedClass: null,

  // ── Init ──
  async init(container) {
    this.container = container;
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:400px;"><div class="spinner"></div></div>';
    try {
      await dataManager.waitForReady();
    } catch (e) { console.error('[CS] waitForReady failed', e); }
    this.render();
    this._onDataChange = (e) => {
      if (['schoolSchedules', 'studentSchedules', 'classes', 'students', 'studentSubjects'].includes(e.detail.collection)) {
        if (this._selectedClass) {
          this._selectedClass = this._getClasses().find(c => c.id === this._selectedClass.id) || this._selectedClass;
        }
        this.render();
      }
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  // ── Helpers ──
  _esc(str) { const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; },

  _getClasses() { return dataManager.getAll('classes') || []; },
  _getSchedules() { return dataManager.getAll('schoolSchedules') || []; },
  _getStaff() { return (dataManager.getAll('staff') || []).filter(s => s.type === 'teaching'); },
  _getStudents() { return dataManager.getAll('students') || []; },

  // Returns every possible grade+section combo from three sources:
  // 1. schoolConfig (canonical definition, always available)
  // 2. students table (enrolled grade/section combos)
  // 3. classes Supabase table (explicitly created records)
  _getAvailableClasses() {
    const seen = new Set();
    const list = [];
    const add = (grade, section) => {
      const key = `${grade}|${section}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ grade, section });
    };
    // 1. schoolConfig grades (each has a sections array)
    try {
      (window.schoolConfig?.getAllGrades() || []).forEach(g => {
        (g.sections || ['A']).forEach(sec => add(g.name, sec));
      });
    } catch (e) {}
    // 2. students table
    (dataManager.getAll('students') || []).forEach(s => {
      if (s.grade && s.section) add(s.grade, s.section);
    });
    // 3. classes Supabase table
    (dataManager.getAll('classes') || []).forEach(c => {
      if (c.grade && c.section) add(c.grade, c.section);
    });
    return list.sort((a, b) => String(a.grade).localeCompare(String(b.grade)) || String(a.section).localeCompare(String(b.section)));
  },

  _getStudentsInClass(grade, section) {
    return this._getStudents().filter(s =>
      String(s.grade) === String(grade) &&
      (s.section || '').toUpperCase() === (section || '').toUpperCase()
    );
  },

  _getStudentGradeSummary(studentId) {
    const enrollments = dataManager.getAll('studentSubjects') || [];
    const enroll = enrollments.find(e => e.studentId === studentId);
    if (!enroll || !enroll.subjects || !enroll.subjects.length) return null;
    const scored = enroll.subjects.filter(s => s.score != null && s.score !== '');
    if (!scored.length) return { letter: '—', avg: null, count: enroll.subjects.length };
    const avg = scored.reduce((t, s) => t + parseFloat(s.score || 0), 0) / scored.length;
    const letter = avg >= 70 ? 'A' : avg >= 60 ? 'B' : avg >= 50 ? 'C' : avg >= 40 ? 'D' : 'F';
    return { letter, avg: Math.round(avg * 10) / 10, count: enroll.subjects.length };
  },

  // ── Direct Supabase CRUD (only valid columns, awaited, error-checked) ──
  async _insertClass(data) {
    const row = { grade: data.grade, section: data.section, class_teacher: data.class_teacher || '', student_count: data.student_count || 0, room: data.room || '', academic_year: data.academic_year || '2025-2026' };
    const { data: result, error } = await supabaseClient.from('classes').insert(row).select();
    if (error) { console.error('[CS] Insert class failed:', error); showToast('Failed to save: ' + error.message, 'error'); return null; }
    return result;
  },

  async _updateClass(id, data) {
    const row = {};
    if (data.section !== undefined) row.section = data.section;
    if (data.class_teacher !== undefined) row.class_teacher = data.class_teacher;
    if (data.student_count !== undefined) row.student_count = data.student_count;
    if (data.room !== undefined) row.room = data.room;
    if (data.academic_year !== undefined) row.academic_year = data.academic_year;
    row.updated_at = new Date().toISOString();
    const { error } = await supabaseClient.from('classes').update(row).eq('id', id);
    if (error) { console.error('[CS] Update class failed:', error); showToast('Failed to update: ' + error.message, 'error'); return false; }
    return true;
  },

  async _deleteClassRow(id) {
    const { error } = await supabaseClient.from('classes').delete().eq('id', id);
    if (error) { console.error('[CS] Delete class failed:', error); showToast('Failed to delete: ' + error.message, 'error'); return false; }
    return true;
  },

  async _insertSchedule(data) {
    const row = { type: data.type || 'class', title: data.title || '', description: data.description || null, grade: data.grade || null, section: data.section || null, day: data.day || null, start_time: data.start_time || null, end_time: data.end_time || null, start_date: data.start_date || null, end_date: data.end_date || null, room: data.room || null, teacher: data.teacher || null, subject: data.subject || null, period: data.period || null, recurring: data.recurring || false, status: data.status || 'active', academic_year: data.academic_year || '2025-2026' };
    const { data: result, error } = await supabaseClient.from('school_schedules').insert(row).select();
    if (error) { console.error('[CS] Insert schedule failed:', error); showToast('Failed to save: ' + error.message, 'error'); return null; }
    return result;
  },

  async _updateSchedule(id, data) {
    const allowed = ['type', 'title', 'description', 'grade', 'section', 'day', 'start_time', 'end_time', 'start_date', 'end_date', 'room', 'teacher', 'subject', 'period', 'recurring', 'status', 'academic_year'];
    const row = { updated_at: new Date().toISOString() };
    allowed.forEach(k => { if (data[k] !== undefined) row[k] = data[k]; });
    const { error } = await supabaseClient.from('school_schedules').update(row).eq('id', id);
    if (error) { console.error('[CS] Update schedule failed:', error); showToast('Failed to update: ' + error.message, 'error'); return false; }
    return true;
  },

  async _deleteScheduleRow(id) {
    const { error } = await supabaseClient.from('school_schedules').delete().eq('id', id);
    if (error) { console.error('[CS] Delete schedule failed:', error); showToast('Failed to delete: ' + error.message, 'error'); return false; }
    return true;
  },

  async _refreshAndRender() {
    await Promise.all([
      dataManager.refresh('classes'),
      dataManager.refresh('schoolSchedules'),
      dataManager.refresh('students')
    ]);
    if (this._selectedClass) {
      this._selectedClass = this._getClasses().find(c => c.id === this._selectedClass.id) || null;
    }
    this.render();
  },

  _grades() {
    const gradeMap = {};
    const addClass = (c) => {
      const g = c.grade;
      if (!g) return;
      if (!gradeMap[g]) gradeMap[g] = [];
      // Avoid duplicates by ID
      if (!gradeMap[g].find(x => x.id === c.id)) {
        gradeMap[g].push(c);
      }
    };

    // 1. Classes table (explicit records)
    this._getClasses().forEach(addClass);

    // 2. schoolConfig canonical grades (each has sections array)
    try {
      (window.schoolConfig?.getAllGrades() || []).forEach(g => {
        (g.sections || ['A']).forEach(sec => {
          // Generate a synthetic ID if not exists
          const existing = this._getClasses().find(c => c.grade === g.name && c.section === sec);
          if (!existing) {
            addClass({ id: `synth-${g.name}-${sec}`, grade: g.name, section: sec, class_teacher: '', student_count: 0, room: '', academic_year: '2025-2026', isSynthetic: true });
          }
        });
      });
    } catch (e) {}

    // 3. Students table (enrolled grade/section combos)
    (dataManager.getAll('students') || []).forEach(s => {
      if (s.grade && s.section) {
        const existing = this._getClasses().find(c => c.grade === s.grade && c.section === s.section);
        if (!existing) {
          addClass({ id: `synth-${s.grade}-${s.section}`, grade: s.grade, section: s.section, class_teacher: '', student_count: 0, room: '', academic_year: '2025-2026', isSynthetic: true });
        }
      }
    });

    return gradeMap;
  },

  // ── Main render ──
  render() {
    if (!this.container) return;
    const tab = this.currentTab;
    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-6);padding-bottom:var(--space-5);border-bottom:1px solid #e2e8f0;">
          <div>
            <h1 style="font-size:1.75rem;font-weight:800;color:#0f172a;margin:0 0 6px 0;letter-spacing:-0.02em;">Class & Schedule Overview</h1>
            <p style="margin:0;color:#64748b;font-size:0.9rem;">Manage grades, classes, timetables, and school activities</p>
          </div>
          <div style="display:flex;gap:8px;">
            ${tab === 'grades' ? `<button class="btn btn-primary" onclick="classScheduleModule.showAddGradeModal()">➕ Add Grade</button>` : ''}
            ${tab === 'schedules' ? `<button class="btn btn-primary" onclick="classScheduleModule.showAddScheduleModal()">➕ Add Schedule</button>` : ''}
            ${tab === 'activities' ? `<button class="btn btn-primary" onclick="classScheduleModule.showAddActivityModal()">➕ Add Activity</button>` : ''}
            ${tab === 'settings' ? `<button class="btn btn-primary" onclick="classScheduleModule.showAddGradeLevelModal()">➕ Add Grade Level</button>` : ''}
          </div>
        </div>

        <!-- Stats -->
        ${this._renderStats()}

        <!-- Tabs -->
        <div style="display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:10px;margin-bottom:var(--space-6);max-width:680px;">
          ${[
        { id: 'grades', label: '🏫 Grades & Classes' },
        { id: 'schedules', label: '📅 Class Schedules' },
        { id: 'activities', label: '🎯 Activities & Events' },
        { id: 'settings', label: '⚙️ Terms & Grades' }
      ].map(t => `
            <button onclick="classScheduleModule.switchTab('${t.id}')"
              style="flex:1;padding:8px 16px;border:none;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.15s;
              ${tab === t.id ? 'background:white;color:#0f172a;box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent;color:#64748b;'}">
              ${t.label}
            </button>
          `).join('')}
        </div>

        <!-- Tab Content -->
        <div id="cs-tab-content">
          ${this._renderTabContent()}
        </div>
      </div>
    `;
  },

  switchTab(tab) {
    this.currentTab = tab;
    this._selectedGrade = null;
    this._selectedClass = null;
    this.render();
  },

  _renderTabContent() {
    switch (this.currentTab) {
      case 'grades': return this._renderGradesTab();
      case 'schedules': return this._renderSchedulesTab();
      case 'activities': return this._renderActivitiesTab();
      case 'settings': return this._renderSettingsTab();
      default: return '';
    }
  },

  // ── Stats bar ──
  _renderStats() {
    const classes = this._getClasses();
    const grades = Object.keys(this._grades());
    const schedules = this._getSchedules();
    const activities = schedules.filter(s => s.type !== 'class');
    const students = this._getStudents();
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-4);margin-bottom:var(--space-6);">
        ${[
        { label: 'Total Grades', value: grades.length, icon: '🎓', color: '#6366f1' },
        { label: 'Total Classes', value: classes.length, icon: '🏫', color: '#0ea5e9' },
        { label: 'Total Students', value: students.length, icon: '👨‍🎓', color: '#10b981' },
        { label: 'Schedules', value: schedules.filter(s => s.type === 'class').length, icon: '📅', color: '#f59e0b' },
        { label: 'Activities', value: activities.length, icon: '🎯', color: '#ef4444' }
      ].map(s => `
          <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:14px;">
            <div style="width:44px;height:44px;border-radius:10px;background:${s.color}12;display:flex;align-items:center;justify-content:center;font-size:1.3rem;">${s.icon}</div>
            <div>
              <div style="font-size:1.35rem;font-weight:700;color:#0f172a;">${s.value}</div>
              <div style="font-size:0.78rem;color:#64748b;">${s.label}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ============================================
  // TAB 1: GRADES & CLASSES
  // ============================================

  _renderGradesTab() {
    const gradeMap = this._grades();
    const gradeKeys = Object.keys(gradeMap).sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    if (gradeKeys.length === 0) {
      return `
        <div style="text-align:center;padding:60px 20px;">
          <div style="font-size:3rem;margin-bottom:12px;">🏫</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#0f172a;margin-bottom:8px;">No Grades Added Yet</h3>
          <p style="color:#64748b;font-size:0.9rem;margin-bottom:20px;">Start by adding a grade level and its classes/sections.</p>
          <button class="btn btn-primary" onclick="classScheduleModule.showAddGradeModal()">&#x2795; Add First Grade</button>
        </div>`;
    }

    return `
      <div style="display:grid;grid-template-columns:290px 1fr;gap:0;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;min-height:540px;">

        <!-- LEFT: Class Browser -->
        <div style="border-right:1px solid #e2e8f0;background:#fafbfc;display:flex;flex-direction:column;">
          <div style="padding:13px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Grades &amp; Classes</span>
            <button onclick="classScheduleModule._syncCounts()"
              title="Re-sync student counts from Student Directory"
              style="border:none;background:none;cursor:pointer;font-size:0.75rem;color:#64748b;padding:4px 8px;border-radius:6px;transition:background 0.15s;"
              onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='none'">&#x1F504; Sync</button>
          </div>
          <div style="flex:1;overflow-y:auto;padding:8px;">
            ${gradeKeys.map(grade => {
              const sections = gradeMap[grade];
              const isOpen = this._selectedGrade === grade || (this._selectedClass && this._selectedClass.grade === grade);
              const liveTotal = sections.reduce((t, c) => t + this._getStudentsInClass(c.grade, c.section).length, 0);
              return `
                <div style="margin-bottom:4px;">
                  <div onclick="classScheduleModule.toggleGrade('${this._esc(grade)}')"
                    style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:9px;cursor:pointer;transition:background 0.12s;background:${isOpen ? '#eef2ff' : 'transparent'};">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;">
                        ${this._esc(grade)}
                      </div>
                      <div>
                        <div style="font-size:0.88rem;font-weight:700;color:#0f172a;">Grade ${this._esc(grade)}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">${sections.length} class${sections.length !== 1 ? 'es' : ''} &middot; ${liveTotal} student${liveTotal !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px;">
                      <button onclick="event.stopPropagation();classScheduleModule.showAddClassModal('${this._esc(grade)}')"
                        title="Add section"
                        style="border:none;background:none;cursor:pointer;width:22px;height:22px;border-radius:5px;color:#6366f1;font-size:0.9rem;font-weight:700;display:flex;align-items:center;justify-content:center;transition:background 0.1s;"
                        onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='none'">+</button>
                      <button onclick="event.stopPropagation();classScheduleModule.deleteGrade('${this._esc(grade)}')"
                        title="Delete grade"
                        style="border:none;background:none;cursor:pointer;width:22px;height:22px;border-radius:5px;color:#ef4444;font-size:0.78rem;display:flex;align-items:center;justify-content:center;transition:background 0.1s;"
                        onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='none'">&#x1F5D1;</button>
                      <span style="font-size:0.7rem;color:#94a3b8;transform:rotate(${isOpen ? '180' : '0'}deg);transition:transform 0.2s;display:inline-block;">&#9660;</span>
                    </div>
                  </div>
                  ${isOpen ? sections.map(cls => {
                    const isSel = this._selectedClass && this._selectedClass.id === cls.id;
                    const liveCount = this._getStudentsInClass(cls.grade, cls.section).length;
                    return `
                      <div onclick="classScheduleModule.selectClass('${cls.id}')"
                        style="display:flex;justify-content:space-between;align-items:center;margin:2px 0 2px 10px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:all 0.12s;
                        ${isSel ? 'background:#e0e7ff;border:1px solid #c7d2fe;' : 'border:1px solid transparent;'}">
                        <div style="display:flex;align-items:center;gap:8px;">
                          <div style="width:7px;height:7px;border-radius:50%;background:${isSel ? '#6366f1' : '#cbd5e1'};flex-shrink:0;"></div>
                          <div>
                            <div style="font-size:0.85rem;font-weight:${isSel ? '700' : '600'};color:${isSel ? '#4338ca' : '#334155'};">
                              Section ${this._esc(cls.section)}${cls.class_teacher || cls.classTeacher ? ' &middot; ' + this._esc((cls.class_teacher || cls.classTeacher).split(' ')[0]) : ''}
                            </div>
                            <div style="font-size:0.72rem;color:#94a3b8;">${liveCount} student${liveCount !== 1 ? 's' : ''}${cls.room ? ' &middot; Rm ' + this._esc(cls.room) : ''}</div>
                          </div>
                        </div>
                        ${isSel ? '<span style="font-size:0.7rem;color:#6366f1;">&#9654;</span>' : ''}
                      </div>
                    `;
                  }).join('') : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- RIGHT: Class Detail -->
        <div style="background:white;overflow-y:auto;">
          ${this._selectedClass
            ? this._renderClassDetail()
            : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:300px;padding:40px;text-align:center;">
                <div style="font-size:3rem;margin-bottom:12px;opacity:0.35;">&#x1F3EB;</div>
                <p style="font-size:0.95rem;font-weight:600;color:#64748b;margin-bottom:6px;">Select a class</p>
                <p style="font-size:0.85rem;color:#94a3b8;">Click any grade on the left to expand it, then choose a section to view its students and grades.</p>
              </div>`
          }
        </div>
      </div>
    `;
  },

  toggleGrade(grade) {
    if (this._selectedGrade === grade) {
      this._selectedGrade = null;
      if (this._selectedClass && this._selectedClass.grade === grade) {
        this._selectedClass = null;
      }
    } else {
      this._selectedGrade = grade;
      // Auto-select the first section if only one exists
      if (!this._selectedClass || this._selectedClass.grade !== grade) {
        const sections = this._grades()[grade] || [];
        if (sections.length === 1) this._selectedClass = sections[0];
      }
    }
    const el = document.getElementById('cs-tab-content');
    if (el) el.innerHTML = this._renderTabContent(); else this.render();
  },

  selectClass(classId) {
    const cls = this._getClasses().find(c => c.id === classId);
    if (!cls) return;
    this._selectedClass = cls;
    this._selectedGrade = cls.grade;
    const el = document.getElementById('cs-tab-content');
    if (el) el.innerHTML = this._renderTabContent(); else this.render();
  },

  _renderClassDetail() {
    const cls = this._selectedClass;
    if (!cls) return '';
    const students = this._getStudentsInClass(cls.grade, cls.section);
    const liveCount = students.length;
    const storedCount = cls.student_count || cls.studentCount || 0;
    const countDrift = liveCount !== storedCount;
    const letterColors = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

    const rows = students.map(s => {
      const gs = this._getStudentGradeSummary(s.id);
      const lc = gs && gs.letter !== '\u2014' ? (letterColors[gs.letter] || '#94a3b8') : '#94a3b8';
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px;">
            <div style="font-weight:600;color:#0f172a;font-size:0.88rem;">${this._esc(s.name)}</div>
            <div style="font-size:0.73rem;color:#94a3b8;">${this._esc(s.studentId || s.rollNo || (s.id ? s.id.slice(0, 8) + '\u2026' : '\u2014'))}</div>
          </td>
          <td style="padding:10px 14px;font-size:0.85rem;color:#475569;">${this._esc(s.gender || '\u2014')}</td>
          <td style="padding:10px 14px;text-align:center;">
            ${gs
              ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:20px;font-size:0.78rem;font-weight:700;background:${lc}18;color:${lc};">
                  ${gs.letter}${gs.avg != null ? ' &nbsp;&middot;&nbsp; ' + gs.avg + '%' : ''}
                 </span>`
              : '<span style="color:#cbd5e1;font-size:0.78rem;">No grades</span>'
            }
          </td>
          <td style="padding:10px 14px;text-align:center;">
            <span style="padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;
              background:${(s.status || 'active') === 'active' ? '#d1fae5' : '#fee2e2'};
              color:${(s.status || 'active') === 'active' ? '#065f46' : '#991b1b'};">
              ${this._esc(s.status || 'active')}
            </span>
          </td>
          <td style="padding:10px 14px;text-align:right;">
            <button onclick="window.app && window.app.loadModule('grades-management')"
              style="border:none;background:none;cursor:pointer;font-size:0.78rem;color:#6366f1;font-weight:600;padding:4px 8px;border-radius:5px;transition:background 0.1s;"
              onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='none'">Grades &#9658;</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="padding:22px 24px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:46px;height:46px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:800;flex-shrink:0;">${this._esc(cls.grade)}</div>
            <div>
              <h2 style="margin:0;font-size:1.2rem;font-weight:800;color:#0f172a;">Grade ${this._esc(cls.grade)} &mdash; Section ${this._esc(cls.section)}</h2>
              <div style="font-size:0.82rem;color:#64748b;margin-top:3px;display:flex;flex-wrap:wrap;gap:8px;">
                ${cls.class_teacher || cls.classTeacher ? `<span>&#x1F469;&#x200D;&#x1F3EB; ${this._esc(cls.class_teacher || cls.classTeacher)}</span>` : ''}
                ${cls.room ? `<span>&#x1F4CD; Room ${this._esc(cls.room)}</span>` : ''}
                <span>&#x1F4C5; ${this._esc(cls.academic_year || '2025-2026')}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <button class="btn btn-ghost btn-sm" onclick="classScheduleModule.showEditClassModal('${cls.id}')">&#x270F;&#xFE0F; Edit</button>
            <button class="btn btn-ghost btn-sm" style="color:#ef4444;" onclick="classScheduleModule.deleteClass('${cls.id}')">&#x1F5D1;&#xFE0F;</button>
          </div>
        </div>

        ${countDrift ? `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:16px;font-size:0.83rem;color:#92400e;">
            <span>&#x26A0;&#xFE0F; Stored count (${storedCount}) differs from actual students (${liveCount})</span>
            <button onclick="classScheduleModule._syncCounts()" style="padding:4px 12px;background:#f59e0b;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;">Sync Now</button>
          </div>
        ` : ''}

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h4 style="margin:0;font-size:0.95rem;font-weight:700;color:#0f172a;">&#x1F393; Students (${liveCount})</h4>
          <span style="font-size:0.75rem;color:#94a3b8;">Grades from Grades &amp; Subjects module</span>
        </div>

        ${students.length === 0 ? `
          <div style="text-align:center;padding:40px 20px;border:2px dashed #e2e8f0;border-radius:12px;">
            <div style="font-size:2rem;margin-bottom:8px;">&#x1F393;</div>
            <p style="font-weight:600;color:#64748b;margin-bottom:4px;">No students in this class yet</p>
            <p style="font-size:0.82rem;color:#94a3b8;margin-bottom:14px;">Assign students to <strong>Grade ${this._esc(cls.grade)}, Section ${this._esc(cls.section)}</strong> from the Student Directory.</p>
            <button onclick="window.app && window.app.loadModule('student-directory')" class="btn btn-sm btn-primary">Go to Student Directory &#9658;</button>
          </div>
        ` : `
          <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="text-align:left;padding:10px 14px;font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Student</th>
                  <th style="text-align:left;padding:10px 14px;font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Gender</th>
                  <th style="text-align:center;padding:10px 14px;font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Avg Grade</th>
                  <th style="text-align:center;padding:10px 14px;font-size:0.75rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e2e8f0;">Status</th>
                  <th style="border-bottom:1px solid #e2e8f0;"></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  async _syncCounts() {
    const classes = this._getClasses();
    const students = this._getStudents();
    let updated = 0;
    for (const cls of classes) {
      const count = students.filter(s =>
        String(s.grade) === String(cls.grade) &&
        (s.section || '').toUpperCase() === (cls.section || '').toUpperCase()
      ).length;
      if (count !== (cls.student_count || cls.studentCount || 0)) {
        await this._updateClass(cls.id, { student_count: count });
        updated++;
      }
    }
    if (updated > 0) {
      await dataManager.refresh('classes');
      if (this._selectedClass) {
        this._selectedClass = this._getClasses().find(c => c.id === this._selectedClass.id) || this._selectedClass;
      }
      this.render();
      showToast(`Synced ${updated} class${updated !== 1 ? 'es' : ''}`, 'success');
    } else {
      showToast('All student counts are already in sync', 'success');
    }
  },

  // ── Add Grade Modal ──
  showAddGradeModal() {
    const content = `
      <div>
        <p style="color:#64748b;font-size:0.9rem;margin-bottom:var(--space-4);">Add a new grade level. You can add individual sections/classes after creating the grade.</p>
        <div class="form-group">
          <label class="form-label">Grade Level *</label>
          <input type="text" id="cs-grade-name" class="form-input" placeholder="e.g. 10, JSS1, SSS2" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Sections (comma-separated)</label>
          <input type="text" id="cs-grade-sections" class="form-input" placeholder="e.g. A, B, C" value="A">
          <small style="color:#94a3b8;">Leave empty to add sections later</small>
        </div>
        <div class="form-group">
          <label class="form-label">Academic Year</label>
          <input type="text" id="cs-grade-year" class="form-input" value="2025-2026">
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.saveGrade()">✓ Create Grade</button>
        </div>
      </div>
    `;
    createModal('Add New Grade', content);
  },

  async saveGrade() {
    const grade = (document.getElementById('cs-grade-name')?.value || '').trim();
    const sectionsRaw = (document.getElementById('cs-grade-sections')?.value || '').trim();
    const year = (document.getElementById('cs-grade-year')?.value || '2025-2026').trim();

    if (!grade) { showToast('Grade level is required', 'error'); return; }

    const existing = this._getClasses().filter(c => c.grade === grade);
    if (existing.length > 0) { showToast(`Grade "${grade}" already exists`, 'error'); return; }

    const sections = sectionsRaw ? sectionsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : ['A'];
    let allOk = true;

    for (const section of sections) {
      const res = await this._insertClass({ grade, section, class_teacher: '', student_count: 0, room: '', academic_year: year });
      if (!res) { allOk = false; break; }
    }

    document.querySelector('.modal-backdrop')?.remove();
    if (allOk) {
      this._selectedGrade = grade;
      await this._refreshAndRender();
      showToast(`Grade ${grade} created with ${sections.length} section${sections.length > 1 ? 's' : ''}`, 'success');
    }
  },

  // ── Add Section/Class to existing grade ──
  showAddClassModal(grade) {
    const teachers = this._getStaff();
    const content = `
      <div>
        <div class="form-group">
          <label class="form-label">Grade</label>
          <input type="text" id="cs-cls-grade" class="form-input" value="${this._esc(grade || '')}" ${grade ? 'readonly style="background:#f1f5f9;"' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">Section *</label>
          <input type="text" id="cs-cls-section" class="form-input" placeholder="e.g. A, B, C" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Room</label>
          <input type="text" id="cs-cls-room" class="form-input" placeholder="e.g. Room 101">
        </div>
        <div class="form-group">
          <label class="form-label">Class Teacher</label>
          <select id="cs-cls-teacher" class="form-input">
            <option value="">— Select Teacher —</option>
            ${teachers.map(t => `<option value="${this._esc(t.name)}">${this._esc(t.name)} (${this._esc(t.role || '')})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Academic Year</label>
          <input type="text" id="cs-cls-year" class="form-input" value="2025-2026">
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.saveClass()">✓ Add Section</button>
        </div>
      </div>
    `;
    createModal('Add Class Section', content);
  },

  async saveClass() {
    const grade = (document.getElementById('cs-cls-grade')?.value || '').trim();
    const section = (document.getElementById('cs-cls-section')?.value || '').trim().toUpperCase();
    const room = (document.getElementById('cs-cls-room')?.value || '').trim();
    const teacher = (document.getElementById('cs-cls-teacher')?.value || '').trim();
    const year = (document.getElementById('cs-cls-year')?.value || '2025-2026').trim();

    if (!grade || !section) { showToast('Grade and Section are required', 'error'); return; }

    const dup = this._getClasses().find(c => c.grade === grade && (c.section || '').toUpperCase() === section);
    if (dup) { showToast(`Section ${section} already exists in Grade ${grade}`, 'error'); return; }

    const res = await this._insertClass({ grade, section, room, class_teacher: teacher, student_count: 0, academic_year: year });
    document.querySelector('.modal-backdrop')?.remove();
    if (res) {
      this._selectedGrade = grade;
      await this._refreshAndRender();
      showToast(`Section ${section} added to Grade ${grade}`, 'success');
    }
  },

  // ── Edit Class ──
  showEditClassModal(classId) {
    const cls = this._getClasses().find(c => c.id === classId);
    if (!cls) return;
    const teachers = this._getStaff();
    const currentTeacher = cls.classTeacher || cls.class_teacher || '';
    const content = `
      <div>
        <div class="form-group">
          <label class="form-label">Grade</label>
          <input type="text" class="form-input" value="${this._esc(cls.grade)}" readonly style="background:#f1f5f9;">
        </div>
        <div class="form-group">
          <label class="form-label">Section</label>
          <input type="text" id="cs-edit-section" class="form-input" value="${this._esc(cls.section)}">
        </div>
        <div class="form-group">
          <label class="form-label">Room</label>
          <input type="text" id="cs-edit-room" class="form-input" value="${this._esc(cls.room || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Class Teacher</label>
          <select id="cs-edit-teacher" class="form-input">
            <option value="">— Select Teacher —</option>
            ${teachers.map(t => `<option value="${this._esc(t.name)}" ${t.name === currentTeacher ? 'selected' : ''}>${this._esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Student Count</label>
          <input type="number" id="cs-edit-count" class="form-input" value="${cls.studentCount || cls.student_count || 0}" min="0">
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.updateClass('${classId}')">✓ Save Changes</button>
        </div>
      </div>
    `;
    createModal('Edit Class Section', content);
  },

  async updateClass(classId) {
    const section = (document.getElementById('cs-edit-section')?.value || '').trim().toUpperCase();
    const room = (document.getElementById('cs-edit-room')?.value || '').trim();
    const teacher = (document.getElementById('cs-edit-teacher')?.value || '').trim();
    const count = parseInt(document.getElementById('cs-edit-count')?.value || '0') || 0;

    const ok = await this._updateClass(classId, { section, room, class_teacher: teacher, student_count: count });
    document.querySelector('.modal-backdrop')?.remove();
    if (ok) {
      await this._refreshAndRender();
      showToast('Class updated', 'success');
    }
  },

  async deleteClass(classId) {
    if (!confirm('Delete this class section? This cannot be undone.')) return;
    const ok = await this._deleteClassRow(classId);
    if (ok) {
      await this._refreshAndRender();
      showToast('Class section deleted', 'success');
    }
  },

  async deleteGrade(grade) {
    const classes = this._getClasses().filter(c => c.grade === grade);
    if (!confirm(`Delete Grade ${grade} and all ${classes.length} section(s)? This cannot be undone.`)) return;
    for (const cls of classes) {
      await this._deleteClassRow(cls.id);
    }
    const relatedSchedules = this._getSchedules().filter(s => s.grade === grade);
    for (const sch of relatedSchedules) {
      await this._deleteScheduleRow(sch.id);
    }
    this._selectedGrade = null;
    await this._refreshAndRender();
    showToast(`Grade ${grade} deleted`, 'success');
  },

  // ============================================
  // TAB 2: CLASS SCHEDULES (Timetable)
  // ============================================

  _renderSchedulesTab() {
    const classes = this._getAvailableClasses();
    const schedules = this._getSchedules().filter(s => s.type === 'class');


    // Class filter
    const selectedFilter = this._scheduleFilter || 'all';
    const filteredSchedules = selectedFilter === 'all'
      ? schedules
      : schedules.filter(s => `${s.grade}-${s.section}` === selectedFilter);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    return `
      <!-- Filter bar -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:var(--space-5);align-items:center;">
        <span style="font-weight:600;color:#475569;font-size:0.85rem;">Filter by class:</span>
        <button class="btn btn-sm ${selectedFilter === 'all' ? 'btn-primary' : 'btn-ghost'}" onclick="classScheduleModule._scheduleFilter='all';classScheduleModule.render()">All</button>
        ${classes.map(c => {
      const key = `${c.grade}-${c.section}`;
      return `<button class="btn btn-sm ${selectedFilter === key ? 'btn-primary' : 'btn-ghost'}" onclick="classScheduleModule._scheduleFilter='${key}';classScheduleModule.render()">Grade ${this._esc(c.grade)} - ${this._esc(c.section)}</button>`;
    }).join('')}
      </div>

      <!-- Timetable -->
      ${filteredSchedules.length === 0
        ? `<div style="text-align:center;padding:40px;color:#94a3b8;">
            <div style="font-size:2rem;margin-bottom:8px;">📋</div>
            <p>No class schedules found. Click <strong>"Add Schedule"</strong> to create one.</p>
          </div>`
        : this._renderTimetableGrid(filteredSchedules, days)
      }

      <!-- Schedule list -->
      ${filteredSchedules.length > 0 ? `
        <div style="margin-top:var(--space-5);">
          <h4 style="font-weight:700;color:#0f172a;margin-bottom:var(--space-3);font-size:0.95rem;">All Class Schedules (${filteredSchedules.length})</h4>
          <div style="display:grid;gap:8px;">
            ${filteredSchedules.map(s => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:white;border:1px solid #e2e8f0;border-radius:10px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:0.9rem;">📅</div>
                  <div>
                    <div style="font-weight:600;color:#0f172a;font-size:0.9rem;">${this._esc(s.title || s.subject || 'Untitled')}</div>
                    <div style="font-size:0.78rem;color:#94a3b8;">Grade ${this._esc(s.grade || '?')}-${this._esc(s.section || '?')} &bull; ${this._esc(s.day || '')} &bull; ${this._esc(s.start_time || s.startTime || '')}–${this._esc(s.end_time || s.endTime || '')} &bull; ${this._esc(s.room || '')}</div>
                  </div>
                </div>
                <div style="display:flex;gap:4px;">
                  <button class="btn btn-ghost btn-sm" style="padding:4px 8px;" onclick="classScheduleModule.showEditScheduleModal('${s.id}')">✏️</button>
                  <button class="btn btn-ghost btn-sm" style="padding:4px 8px;color:#ef4444;" onclick="classScheduleModule.deleteSchedule('${s.id}')">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  _renderTimetableGrid(schedules, days) {
    const periods = [...new Set(schedules.map(s => s.period).filter(Boolean))].sort((a, b) => a - b);
    if (periods.length === 0) return '';

    return `
      <div class="card" style="overflow:hidden;border-radius:12px;">
        <div style="overflow-x:auto;">
          <table class="table" style="font-size:0.82rem;margin:0;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="width:70px;">Period</th>
                <th style="width:100px;">Time</th>
                ${days.map(d => `<th>${d}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${periods.map(period => {
      const pScheds = schedules.filter(s => s.period === period);
      const first = pScheds[0];
      const time = first ? `${first.start_time || first.startTime || ''}–${first.end_time || first.endTime || ''}` : '';
      return `
                  <tr>
                    <td style="font-weight:600;">${period}</td>
                    <td style="color:#64748b;font-size:0.78rem;white-space:nowrap;">${time}</td>
                    ${days.map(day => {
        const slot = pScheds.find(s => s.day === day);
        if (!slot) return '<td style="color:#cbd5e1;">—</td>';
        return `<td>
                        <div style="font-weight:600;color:#0f172a;">${this._esc(slot.subject || slot.title || '')}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">Gr ${this._esc(slot.grade || '')}${slot.section ? '-' + this._esc(slot.section) : ''} ${slot.room ? '• ' + this._esc(slot.room) : ''}</div>
                      </td>`;
      }).join('')}
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // Populate the subject select for a given grade value ("grade|section" string)
  updateSubjectOptions(classValue, selectId) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const grade = classValue ? classValue.split('|')[0] : '';
    const catalog = dataManager.getAll('subjectCatalog') || [];
    // Include subjects that match this grade OR have no grade set (universal)
    const matched = catalog.filter(s => {
      const sg = (s.grade || '').trim();
      if (!sg) return true; // universal
      return sg.toLowerCase() === (grade || '').toLowerCase();
    });
    const sorted = matched.map(s => s.name).filter(Boolean).sort();
    const current = el.value;
    el.innerHTML = sorted.length > 0
      ? `<option value="">— Select Subject —</option>` + sorted.map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}</option>`).join('')
      : `<option value="">No subjects found for this grade</option>`;
  },

  // ── Add Schedule Modal ──
  showAddScheduleModal() {
    const classes = this._getAvailableClasses();
    const teachers = this._getStaff();
    const content = `
      <div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">Class *</label>
            <select id="cs-sch-class" class="form-input" onchange="classScheduleModule.updateSubjectOptions(this.value, 'cs-sch-subject')">
              <option value="">— Select —</option>
              ${classes.length > 0
                ? classes.map(c => `<option value="${c.grade}|${c.section}">${this._esc(c.grade)} — Section ${this._esc(c.section)}</option>`).join('')
                : '<option value="" disabled>No classes defined — add grades in the Grades tab</option>'}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject *</label>
            <select id="cs-sch-subject" class="form-input">
              <option value="">— Select class first —</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Day *</label>
            <select id="cs-sch-day" class="form-input">
              ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Period #</label>
            <input type="number" id="cs-sch-period" class="form-input" placeholder="e.g. 1" min="1" max="12">
          </div>
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" id="cs-sch-start" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <input type="time" id="cs-sch-end" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Room</label>
            <input type="text" id="cs-sch-room" class="form-input" placeholder="e.g. Room 101">
          </div>
          <div class="form-group">
            <label class="form-label">Teacher</label>
            <select id="cs-sch-teacher" class="form-input">
              <option value="">— Select —</option>
              ${teachers.map(t => `<option value="${this._esc(t.name)}">${this._esc(t.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.saveSchedule()">✓ Add Schedule</button>
        </div>
      </div>
    `;
    createModal('Add Class Schedule', content);
  },

  // ── Conflict Detection ──
  _checkConflicts({ grade, section, teacher, room, day, period, startTime, endTime }, excludeId = null) {
    const schedules = this._getSchedules().filter(s =>
      s.type === 'class' && s.id !== excludeId && s.day === day
    );
    const conflicts = [];

    // Helper: do two time ranges overlap? (both must be set)
    const overlaps = (s1, e1, s2, e2) => {
      if (!s1 || !e1 || !s2 || !e2) return false;
      return s1 < e2 && s2 < e1;
    };

    for (const s of schedules) {
      const samePeriod = period && s.period && s.period === period;
      const timeClash = overlaps(
        startTime, endTime,
        s.start_time || s.startTime,
        s.end_time || s.endTime
      );
      const clash = samePeriod || timeClash;
      if (!clash) continue;

      // HARD: same class + same slot
      if (s.grade === grade && s.section === section) {
        conflicts.push({ type: 'hard', msg: `Grade ${grade}-${section} already has ${s.subject || s.title} on ${day} at this time` });
      }
      // SOFT: teacher double-booked
      if (teacher && s.teacher && s.teacher === teacher) {
        conflicts.push({ type: 'soft', msg: `${teacher} is already teaching ${s.subject || s.title} (Grade ${s.grade}-${s.section}) on ${day} at this time` });
      }
      // SOFT: room double-booked
      if (room && s.room && s.room === room) {
        conflicts.push({ type: 'soft', msg: `Room ${room} is already used by Grade ${s.grade}-${s.section} on ${day} at this time` });
      }
    }
    return conflicts;
  },

  async saveSchedule() {
    const classVal = document.getElementById('cs-sch-class')?.value || '';
    const [grade, section] = classVal.split('|');
    const subject = (document.getElementById('cs-sch-subject')?.value || '').trim();
    const day = document.getElementById('cs-sch-day')?.value || '';
    const period = parseInt(document.getElementById('cs-sch-period')?.value || '0') || null;
    const startTime = document.getElementById('cs-sch-start')?.value || '';
    const endTime = document.getElementById('cs-sch-end')?.value || '';
    const room = (document.getElementById('cs-sch-room')?.value || '').trim();
    const teacher = (document.getElementById('cs-sch-teacher')?.value || '').trim();

    if (!grade || !subject || !day) { showToast('Class, Subject, and Day are required', 'error'); return; }

    // Conflict detection
    const conflicts = this._checkConflicts({ grade, section, teacher, room, day, period, startTime, endTime });
    const hard = conflicts.filter(c => c.type === 'hard');
    const soft = conflicts.filter(c => c.type === 'soft');

    if (hard.length > 0) {
      showToast(`⚠️ Conflict: ${hard[0].msg}`, 'error');
      return;
    }
    if (soft.length > 0) {
      const proceed = confirm(`Scheduling conflict detected:\n\n${soft.map(c => '• ' + c.msg).join('\n')}\n\nProceed anyway?`);
      if (!proceed) return;
    }

    const res = await this._insertSchedule({ type: 'class', title: subject, subject, grade, section, day, period, start_time: startTime, end_time: endTime, room, teacher, status: 'active', academic_year: '2025-2026' });
    document.querySelector('.modal-backdrop')?.remove();
    if (res) {
      await this._refreshAndRender();
      showToast('Schedule added', 'success');
    }
  },

  showEditScheduleModal(id) {
    const s = this._getSchedules().find(x => x.id === id);
    if (!s) return;
    const classes = this._getAvailableClasses();
    const teachers = this._getStaff();
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const content = `
      <div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">Class</label>
            <select id="cs-esch-class" class="form-input" onchange="classScheduleModule.updateSubjectOptions(this.value, 'cs-esch-subject')">
              ${classes.length > 0
                ? classes.map(c => `<option value="${c.grade}|${c.section}" ${c.grade === s.grade && c.section === s.section ? 'selected' : ''}>${this._esc(c.grade)} — Section ${this._esc(c.section)}</option>`).join('')
                : '<option value="" disabled>No classes defined</option>'}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Subject</label>
            <select id="cs-esch-subject" class="form-input">
              ${(() => {
                const grade = s.grade || '';
                const catalog = dataManager.getAll('subjectCatalog') || [];
                const matched = catalog.filter(sub => { const sg = (sub.grade || '').trim(); return !sg || sg.toLowerCase() === grade.toLowerCase(); });
                const sorted = matched.map(sub => sub.name).filter(Boolean).sort();
                const cur = s.subject || s.title || '';
                return sorted.length > 0
                  ? `<option value="">— Select —</option>` + sorted.map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`).join('')
                  : `<option value="${this._esc(cur)}" selected>${this._esc(cur) || 'No subjects'}</option>`;
              })()}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Day</label>
            <select id="cs-esch-day" class="form-input">
              ${days.map(d => `<option value="${d}" ${d === s.day ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Period #</label>
            <input type="number" id="cs-esch-period" class="form-input" value="${s.period || ''}" min="1" max="12">
          </div>
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" id="cs-esch-start" class="form-input" value="${s.start_time || s.startTime || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <input type="time" id="cs-esch-end" class="form-input" value="${s.end_time || s.endTime || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Room</label>
            <input type="text" id="cs-esch-room" class="form-input" value="${this._esc(s.room || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Teacher</label>
            <select id="cs-esch-teacher" class="form-input">
              <option value="">— Select —</option>
              ${teachers.map(t => `<option value="${this._esc(t.name)}" ${t.name === s.teacher ? 'selected' : ''}>${this._esc(t.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.updateSchedule('${id}')">✓ Save</button>
        </div>
      </div>
    `;
    createModal('Edit Schedule', content);
  },

  async updateSchedule(id) {
    const classVal = document.getElementById('cs-esch-class')?.value || '';
    const [grade, section] = classVal.split('|');
    const subject = (document.getElementById('cs-esch-subject')?.value || '').trim();
    const day = document.getElementById('cs-esch-day')?.value || '';
    const period = parseInt(document.getElementById('cs-esch-period')?.value || '0') || null;
    const startTime = document.getElementById('cs-esch-start')?.value || '';
    const endTime = document.getElementById('cs-esch-end')?.value || '';
    const room = (document.getElementById('cs-esch-room')?.value || '').trim();
    const teacher = (document.getElementById('cs-esch-teacher')?.value || '').trim();

    // Conflict detection (exclude self)
    const conflicts = this._checkConflicts({ grade, section, teacher, room, day, period, startTime, endTime }, id);
    const hard = conflicts.filter(c => c.type === 'hard');
    const soft = conflicts.filter(c => c.type === 'soft');

    if (hard.length > 0) {
      showToast(`⚠️ Conflict: ${hard[0].msg}`, 'error');
      return;
    }
    if (soft.length > 0) {
      const proceed = confirm(`Scheduling conflict detected:\n\n${soft.map(c => '• ' + c.msg).join('\n')}\n\nProceed anyway?`);
      if (!proceed) return;
    }

    const ok = await this._updateSchedule(id, { title: subject, subject, grade, section, day, period, start_time: startTime, end_time: endTime, room, teacher });
    document.querySelector('.modal-backdrop')?.remove();
    if (ok) {
      await this._refreshAndRender();
      showToast('Schedule updated', 'success');
    }
  },

  async deleteSchedule(id) {
    if (!confirm('Delete this schedule entry?')) return;
    const ok = await this._deleteScheduleRow(id);
    if (ok) {
      await this._refreshAndRender();
      showToast('Schedule deleted', 'success');
    }
  },

  // ============================================
  // TAB 3: ACTIVITIES & EVENTS
  // ============================================

  _renderActivitiesTab() {
    const allSchedules = this._getSchedules();
    const activities = allSchedules.filter(s => s.type !== 'class');

    const typeColors = {
      activity: { bg: '#eef2ff', color: '#4f46e5', icon: '🎯' },
      exam: { bg: '#fef2f2', color: '#dc2626', icon: '📝' },
      event: { bg: '#f0fdf4', color: '#16a34a', icon: '🎉' },
      break: { bg: '#fffbeb', color: '#d97706', icon: '☕' }
    };

    // Group by status
    const upcoming = activities.filter(a => a.status === 'active');
    const past = activities.filter(a => a.status === 'completed');
    const cancelled = activities.filter(a => a.status === 'cancelled' || a.status === 'postponed');

    if (activities.length === 0) {
      return `
        <div style="text-align:center;padding:60px 20px;">
          <div style="font-size:3rem;margin-bottom:12px;">🎯</div>
          <h3 style="font-size:1.1rem;font-weight:700;color:#0f172a;margin-bottom:8px;">No Activities or Events</h3>
          <p style="color:#64748b;font-size:0.9rem;margin-bottom:20px;">Schedule school activities, exams, events, and breaks.</p>
          <button class="btn btn-primary" onclick="classScheduleModule.showAddActivityModal()">➕ Add First Activity</button>
        </div>`;
    }

    const renderList = (items, label) => {
      if (items.length === 0) return '';
      return `
        <div style="margin-bottom:var(--space-5);">
          <h4 style="font-weight:700;color:#0f172a;margin-bottom:var(--space-3);font-size:0.9rem;">${label} (${items.length})</h4>
          <div style="display:grid;gap:10px;">
            ${items.map(a => {
        const tc = typeColors[a.type] || typeColors.activity;
        return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:white;border:1px solid #e2e8f0;border-radius:12px;transition:box-shadow 0.15s;"
                  onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'" onmouseout="this.style.boxShadow='none'">
                  <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:42px;height:42px;border-radius:10px;background:${tc.bg};display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${tc.icon}</div>
                    <div>
                      <div style="font-weight:600;color:#0f172a;font-size:0.92rem;">${this._esc(a.title)}</div>
                      <div style="font-size:0.78rem;color:#94a3b8;display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;">
                        <span style="background:${tc.bg};color:${tc.color};padding:1px 8px;border-radius:20px;font-weight:600;font-size:0.72rem;text-transform:uppercase;">${a.type}</span>
                        ${a.start_date || a.startDate ? `<span>📅 ${this._esc(a.start_date || a.startDate || '')}</span>` : ''}
                        ${a.day ? `<span>${this._esc(a.day)}</span>` : ''}
                        ${a.start_time || a.startTime ? `<span>🕐 ${this._esc(a.start_time || a.startTime || '')}–${this._esc(a.end_time || a.endTime || '')}</span>` : ''}
                        ${a.grade ? `<span>Grade ${this._esc(a.grade)}</span>` : '<span>All grades</span>'}
                      </div>
                      ${a.description ? `<div style="font-size:0.8rem;color:#64748b;margin-top:4px;">${this._esc(a.description)}</div>` : ''}
                    </div>
                  </div>
                  <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="btn btn-ghost btn-sm" style="padding:4px 8px;" onclick="classScheduleModule.showEditActivityModal('${a.id}')">✏️</button>
                    <button class="btn btn-ghost btn-sm" style="padding:4px 8px;color:#ef4444;" onclick="classScheduleModule.deleteSchedule('${a.id}')">🗑️</button>
                  </div>
                </div>
              `;
      }).join('')}
          </div>
        </div>
      `;
    };

    return `
      ${renderList(upcoming, '🟢 Active / Upcoming')}
      ${renderList(past, '✅ Completed')}
      ${renderList(cancelled, '⛔ Cancelled / Postponed')}
    `;
  },

  // ── Add Activity Modal ──
  showAddActivityModal() {
    const classes = this._getClasses();
    const gradeKeys = [...new Set(classes.map(c => c.grade))].sort();
    const content = `
      <div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input type="text" id="cs-act-title" class="form-input" placeholder="e.g. Mid-Term Exams" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Type *</label>
            <select id="cs-act-type" class="form-input">
              <option value="activity">Activity</option>
              <option value="exam">Exam</option>
              <option value="event">Event</option>
              <option value="break">Break / Holiday</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Description</label>
            <textarea id="cs-act-desc" class="form-input" rows="2" placeholder="Optional description"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Applicable Grade</label>
            <select id="cs-act-grade" class="form-input">
              <option value="">All Grades</option>
              ${gradeKeys.map(g => `<option value="${this._esc(g)}">Grade ${this._esc(g)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Day (if recurring weekly)</label>
            <select id="cs-act-day" class="form-input">
              <option value="">— N/A —</option>
              ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" id="cs-act-sdate" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">End Date</label>
            <input type="date" id="cs-act-edate" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" id="cs-act-stime" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <input type="time" id="cs-act-etime" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">Location / Room</label>
            <input type="text" id="cs-act-room" class="form-input" placeholder="e.g. Assembly Hall">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="cs-act-status" class="form-input">
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="postponed">Postponed</option>
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.saveActivity()">✓ Add Activity</button>
        </div>
      </div>
    `;
    createModal('Add Activity / Event', content);
  },

  async saveActivity() {
    const title = (document.getElementById('cs-act-title')?.value || '').trim();
    const type = document.getElementById('cs-act-type')?.value || 'activity';
    const description = (document.getElementById('cs-act-desc')?.value || '').trim();
    const grade = (document.getElementById('cs-act-grade')?.value || '').trim();
    const day = document.getElementById('cs-act-day')?.value || '';
    const startDate = document.getElementById('cs-act-sdate')?.value || '';
    const endDate = document.getElementById('cs-act-edate')?.value || '';
    const startTime = document.getElementById('cs-act-stime')?.value || '';
    const endTime = document.getElementById('cs-act-etime')?.value || '';
    const room = (document.getElementById('cs-act-room')?.value || '').trim();
    const status = document.getElementById('cs-act-status')?.value || 'active';

    if (!title) { showToast('Title is required', 'error'); return; }

    const res = await this._insertSchedule({ type, title, description: description || null, grade: grade || null, section: null, day: day || null, start_date: startDate || null, end_date: endDate || null, start_time: startTime || null, end_time: endTime || null, room: room || null, teacher: null, subject: null, period: null, recurring: !!day, status, academic_year: '2025-2026' });
    document.querySelector('.modal-backdrop')?.remove();
    if (res) {
      await this._refreshAndRender();
      showToast('Activity added', 'success');
    }
  },

  showEditActivityModal(id) {
    const a = this._getSchedules().find(x => x.id === id);
    if (!a) return;
    const classes = this._getClasses();
    const gradeKeys = [...new Set(classes.map(c => c.grade))].sort();
    const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const content = `
      <div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
          <div class="form-group">
            <label class="form-label">Title</label>
            <input type="text" id="cs-eact-title" class="form-input" value="${this._esc(a.title || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select id="cs-eact-type" class="form-input">
              ${['activity', 'exam', 'event', 'break'].map(t => `<option value="${t}" ${a.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Description</label>
            <textarea id="cs-eact-desc" class="form-input" rows="2">${this._esc(a.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Grade</label>
            <select id="cs-eact-grade" class="form-input">
              <option value="">All Grades</option>
              ${gradeKeys.map(g => `<option value="${this._esc(g)}" ${a.grade === g ? 'selected' : ''}>Grade ${this._esc(g)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Day</label>
            <select id="cs-eact-day" class="form-input">
              <option value="">— N/A —</option>
              ${allDays.map(d => `<option value="${d}" ${a.day === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" id="cs-eact-sdate" class="form-input" value="${a.start_date || a.startDate || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">End Date</label>
            <input type="date" id="cs-eact-edate" class="form-input" value="${a.end_date || a.endDate || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" id="cs-eact-stime" class="form-input" value="${a.start_time || a.startTime || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <input type="time" id="cs-eact-etime" class="form-input" value="${a.end_time || a.endTime || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" id="cs-eact-room" class="form-input" value="${this._esc(a.room || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="cs-eact-status" class="form-input">
              ${['active', 'completed', 'cancelled', 'postponed'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex gap-3 mt-6">
          <button class="btn btn-ghost flex-1" onclick="closeModal(this)">Cancel</button>
          <button class="btn btn-primary flex-1" onclick="classScheduleModule.updateActivity('${id}')">✓ Save</button>
        </div>
      </div>
    `;
    createModal('Edit Activity', content);
  },

  async updateActivity(id) {
    const title = (document.getElementById('cs-eact-title')?.value || '').trim();
    const type = document.getElementById('cs-eact-type')?.value || 'activity';
    const description = (document.getElementById('cs-eact-desc')?.value || '').trim();
    const grade = (document.getElementById('cs-eact-grade')?.value || '').trim();
    const day = document.getElementById('cs-eact-day')?.value || '';
    const startDate = document.getElementById('cs-eact-sdate')?.value || '';
    const endDate = document.getElementById('cs-eact-edate')?.value || '';
    const startTime = document.getElementById('cs-eact-stime')?.value || '';
    const endTime = document.getElementById('cs-eact-etime')?.value || '';
    const room = (document.getElementById('cs-eact-room')?.value || '').trim();
    const status = document.getElementById('cs-eact-status')?.value || 'active';

    if (!title) { showToast('Title is required', 'error'); return; }

    const ok = await this._updateSchedule(id, { type, title, description: description || null, grade: grade || null, day: day || null, start_date: startDate || null, end_date: endDate || null, start_time: startTime || null, end_time: endTime || null, room: room || null, status, recurring: !!day });
    document.querySelector('.modal-backdrop')?.remove();
    if (ok) {
      await this._refreshAndRender();
      showToast('Activity updated', 'success');
    }
  },

  // ============================================
  // SETTINGS TAB — Terms & Grade Levels
  // ============================================

  _renderSettingsTab() {
    const terms = schoolConfig.academicYear.terms;
    const gradeGroups = [
      { key: 'earlyYears', label: 'Early Years', items: schoolConfig.grades.earlyYears },
      { key: 'primary', label: 'Primary', items: schoolConfig.grades.primary },
      { key: 'secondary', label: 'Junior Secondary', items: schoolConfig.grades.secondary }
    ];

    return `
      <div style="display:grid;gap:var(--space-6);">
        <!-- Terms Section -->
        <div class="card" style="padding:var(--space-5);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
            <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:#0f172a;">Academic Terms</h3>
            <button class="btn btn-sm btn-primary" onclick="classScheduleModule.showAddTermModal()">+ Add Term</button>
          </div>
          <div style="display:grid;gap:12px;">
            ${terms.map((t, i) => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                <div style="display:flex;align-items:center;gap:14px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;">${i + 1}</div>
                  <div>
                    <div style="font-weight:600;color:#0f172a;font-size:0.95rem;">${this._esc(t.name)}</div>
                    <div style="font-size:0.8rem;color:#64748b;">Code: ${this._esc(t.code)} &middot; ${(t.months || []).join(', ') || 'No months set'}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-sm btn-ghost" onclick="classScheduleModule.showEditTermModal(${i})" title="Edit">✏️</button>
                  ${terms.length > 1 ? `<button class="btn btn-sm btn-ghost" onclick="classScheduleModule.removeTerm(${i})" title="Remove" style="color:#ef4444;">🗑️</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Grade Levels Section -->
        ${gradeGroups.map(group => `
          <div class="card" style="padding:var(--space-5);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
              <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:#0f172a;">${this._esc(group.label)}</h3>
              <span style="background:#e2e8f0;color:#475569;padding:4px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;">${group.items.length} grades</span>
            </div>
            <div style="display:grid;gap:10px;">
              ${group.items.map((g, gi) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
                  <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#10b981,#059669);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;">${this._esc(g.code)}</div>
                    <div>
                      <div style="font-weight:600;color:#0f172a;font-size:0.95rem;">${this._esc(g.name)}</div>
                      <div style="font-size:0.8rem;color:#64748b;">Sections: ${(g.sections || []).join(', ')} &middot; Age: ${this._esc(g.ageRange || 'N/A')}</div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm btn-ghost" onclick="classScheduleModule.showEditGradeLevelModal('${group.key}', ${gi})" title="Edit">✏️</button>
                    ${group.items.length > 1 ? `<button class="btn btn-sm btn-ghost" onclick="classScheduleModule.removeGradeLevel('${group.key}', ${gi})" title="Remove" style="color:#ef4444;">🗑️</button>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}

        <div style="padding:14px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#92400e;font-size:0.85rem;">
          <strong>Note:</strong> Changes to terms and grade levels take effect immediately across all modules (fees, assessments, etc.). Existing student records retain their original grade codes.
        </div>
      </div>
    `;
  },

  // ── Term CRUD ──
  showAddTermModal() {
    const content = `
      <form onsubmit="classScheduleModule.addTerm(event)">
        <div style="display:grid;gap:16px;">
          <div class="form-group">
            <label class="form-label">Term Name *</label>
            <input type="text" class="form-input" id="cs-term-name" required placeholder="e.g. Fourth Term">
          </div>
          <div class="form-group">
            <label class="form-label">Term Code *</label>
            <input type="text" class="form-input" id="cs-term-code" required placeholder="e.g. TERM4" style="text-transform:uppercase;">
          </div>
          <div class="form-group">
            <label class="form-label">Duration (months)</label>
            <input type="number" class="form-input" id="cs-term-duration" value="3" min="1" max="6">
          </div>
          <div class="form-group">
            <label class="form-label">Months (comma-separated)</label>
            <input type="text" class="form-input" id="cs-term-months" placeholder="e.g. September, October, November">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Start Month (1-12)</label>
              <input type="number" class="form-input" id="cs-term-start" min="1" max="12">
            </div>
            <div class="form-group">
              <label class="form-label">End Month (1-12)</label>
              <input type="number" class="form-input" id="cs-term-end" min="1" max="12">
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button type="submit" class="btn btn-primary" style="flex:1;">Add Term</button>
          <button type="button" class="btn btn-ghost" onclick="document.querySelector('.modal-backdrop')?.remove()">Cancel</button>
        </div>
      </form>
    `;
    createModal('Add Academic Term', content);
  },

  addTerm(event) {
    event.preventDefault();
    const name = document.getElementById('cs-term-name')?.value.trim();
    const code = document.getElementById('cs-term-code')?.value.trim().toUpperCase();
    const duration = parseInt(document.getElementById('cs-term-duration')?.value) || 3;
    const monthsStr = document.getElementById('cs-term-months')?.value.trim();
    const startMonth = parseInt(document.getElementById('cs-term-start')?.value) || null;
    const endMonth = parseInt(document.getElementById('cs-term-end')?.value) || null;

    if (!name || !code) { showToast('Name and code are required', 'error'); return; }
    if (schoolConfig.academicYear.terms.find(t => t.code === code)) { showToast('Term code already exists', 'error'); return; }

    const months = monthsStr ? monthsStr.split(',').map(m => m.trim()).filter(Boolean) : [];
    schoolConfig.academicYear.terms.push({ name, code, duration, months, startMonth, endMonth });
    this._saveSchoolConfig();
    document.querySelector('.modal-backdrop')?.remove();
    this.render();
    showToast(`Term "${name}" added`, 'success');
  },

  showEditTermModal(index) {
    const t = schoolConfig.academicYear.terms[index];
    if (!t) return;
    const content = `
      <form onsubmit="classScheduleModule.updateTerm(event, ${index})">
        <div style="display:grid;gap:16px;">
          <div class="form-group">
            <label class="form-label">Term Name *</label>
            <input type="text" class="form-input" id="cs-term-name" required value="${this._esc(t.name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Term Code *</label>
            <input type="text" class="form-input" id="cs-term-code" required value="${this._esc(t.code)}" style="text-transform:uppercase;">
          </div>
          <div class="form-group">
            <label class="form-label">Duration (months)</label>
            <input type="number" class="form-input" id="cs-term-duration" value="${t.duration || 3}" min="1" max="6">
          </div>
          <div class="form-group">
            <label class="form-label">Months (comma-separated)</label>
            <input type="text" class="form-input" id="cs-term-months" value="${(t.months || []).join(', ')}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Start Month (1-12)</label>
              <input type="number" class="form-input" id="cs-term-start" min="1" max="12" value="${t.startMonth || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">End Month (1-12)</label>
              <input type="number" class="form-input" id="cs-term-end" min="1" max="12" value="${t.endMonth || ''}">
            </div>
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button type="submit" class="btn btn-primary" style="flex:1;">Save Changes</button>
          <button type="button" class="btn btn-ghost" onclick="document.querySelector('.modal-backdrop')?.remove()">Cancel</button>
        </div>
      </form>
    `;
    createModal('Edit Term', content);
  },

  updateTerm(event, index) {
    event.preventDefault();
    const t = schoolConfig.academicYear.terms[index];
    if (!t) return;

    t.name = document.getElementById('cs-term-name')?.value.trim() || t.name;
    t.code = (document.getElementById('cs-term-code')?.value.trim() || t.code).toUpperCase();
    t.duration = parseInt(document.getElementById('cs-term-duration')?.value) || 3;
    const monthsStr = document.getElementById('cs-term-months')?.value.trim();
    t.months = monthsStr ? monthsStr.split(',').map(m => m.trim()).filter(Boolean) : [];
    t.startMonth = parseInt(document.getElementById('cs-term-start')?.value) || null;
    t.endMonth = parseInt(document.getElementById('cs-term-end')?.value) || null;

    this._saveSchoolConfig();
    document.querySelector('.modal-backdrop')?.remove();
    this.render();
    showToast(`Term "${t.name}" updated`, 'success');
  },

  removeTerm(index) {
    const t = schoolConfig.academicYear.terms[index];
    if (!t) return;
    if (!confirm(`Remove "${t.name}"? This affects term options in all modules.`)) return;
    schoolConfig.academicYear.terms.splice(index, 1);
    this._saveSchoolConfig();
    this.render();
    showToast(`Term "${t.name}" removed`, 'info');
  },

  // ── Grade Level CRUD ──
  showAddGradeLevelModal() {
    const content = `
      <form onsubmit="classScheduleModule.addGradeLevel(event)">
        <div style="display:grid;gap:16px;">
          <div class="form-group">
            <label class="form-label">Category *</label>
            <select class="form-select" id="cs-gl-category" required>
              <option value="earlyYears">Early Years</option>
              <option value="primary">Primary</option>
              <option value="secondary">Junior Secondary</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Grade Name *</label>
            <input type="text" class="form-input" id="cs-gl-name" required placeholder="e.g. Grade 7">
          </div>
          <div class="form-group">
            <label class="form-label">Grade Code *</label>
            <input type="text" class="form-input" id="cs-gl-code" required placeholder="e.g. GR7" style="text-transform:uppercase;">
          </div>
          <div class="form-group">
            <label class="form-label">Sections (comma-separated) *</label>
            <input type="text" class="form-input" id="cs-gl-sections" required value="A, B" placeholder="e.g. A, B, C">
          </div>
          <div class="form-group">
            <label class="form-label">Age Range</label>
            <input type="text" class="form-input" id="cs-gl-age" placeholder="e.g. 12-13 years">
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button type="submit" class="btn btn-primary" style="flex:1;">Add Grade Level</button>
          <button type="button" class="btn btn-ghost" onclick="document.querySelector('.modal-backdrop')?.remove()">Cancel</button>
        </div>
      </form>
    `;
    createModal('Add Grade Level', content);
  },

  addGradeLevel(event) {
    event.preventDefault();
    const category = document.getElementById('cs-gl-category')?.value;
    const name = document.getElementById('cs-gl-name')?.value.trim();
    const code = document.getElementById('cs-gl-code')?.value.trim().toUpperCase();
    const sectionsStr = document.getElementById('cs-gl-sections')?.value.trim();
    const ageRange = document.getElementById('cs-gl-age')?.value.trim();

    if (!name || !code || !category) { showToast('Name, code, and category are required', 'error'); return; }
    if (schoolConfig.getAllGrades().find(g => g.code === code)) { showToast('Grade code already exists', 'error'); return; }

    const sections = sectionsStr ? sectionsStr.split(',').map(s => s.trim()).filter(Boolean) : ['A'];
    const levelMap = { earlyYears: 'Early Years', primary: 'Primary', secondary: 'Junior Secondary' };

    schoolConfig.grades[category].push({ name, code, level: levelMap[category], sections, ageRange: ageRange || '' });
    this._saveSchoolConfig();
    document.querySelector('.modal-backdrop')?.remove();
    this.render();
    showToast(`Grade "${name}" added to ${levelMap[category]}`, 'success');
  },

  showEditGradeLevelModal(groupKey, index) {
    const g = schoolConfig.grades[groupKey]?.[index];
    if (!g) return;
    const content = `
      <form onsubmit="classScheduleModule.updateGradeLevel(event, '${groupKey}', ${index})">
        <div style="display:grid;gap:16px;">
          <div class="form-group">
            <label class="form-label">Grade Name *</label>
            <input type="text" class="form-input" id="cs-gl-name" required value="${this._esc(g.name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Grade Code *</label>
            <input type="text" class="form-input" id="cs-gl-code" required value="${this._esc(g.code)}" style="text-transform:uppercase;">
          </div>
          <div class="form-group">
            <label class="form-label">Sections (comma-separated) *</label>
            <input type="text" class="form-input" id="cs-gl-sections" required value="${(g.sections || []).join(', ')}">
          </div>
          <div class="form-group">
            <label class="form-label">Age Range</label>
            <input type="text" class="form-input" id="cs-gl-age" value="${this._esc(g.ageRange || '')}">
          </div>
        </div>
        <div class="flex gap-3 mt-4">
          <button type="submit" class="btn btn-primary" style="flex:1;">Save Changes</button>
          <button type="button" class="btn btn-ghost" onclick="document.querySelector('.modal-backdrop')?.remove()">Cancel</button>
        </div>
      </form>
    `;
    createModal('Edit Grade Level', content);
  },

  updateGradeLevel(event, groupKey, index) {
    event.preventDefault();
    const g = schoolConfig.grades[groupKey]?.[index];
    if (!g) return;

    const newCode = (document.getElementById('cs-gl-code')?.value.trim() || g.code).toUpperCase();
    const existingWithCode = schoolConfig.getAllGrades().find(gr => gr.code === newCode && gr !== g);
    if (existingWithCode) { showToast('Grade code already used by another grade', 'error'); return; }

    g.name = document.getElementById('cs-gl-name')?.value.trim() || g.name;
    g.code = newCode;
    const sectionsStr = document.getElementById('cs-gl-sections')?.value.trim();
    g.sections = sectionsStr ? sectionsStr.split(',').map(s => s.trim()).filter(Boolean) : g.sections;
    g.ageRange = document.getElementById('cs-gl-age')?.value.trim() || g.ageRange;

    this._saveSchoolConfig();
    document.querySelector('.modal-backdrop')?.remove();
    this.render();
    showToast(`Grade "${g.name}" updated`, 'success');
  },

  removeGradeLevel(groupKey, index) {
    const g = schoolConfig.grades[groupKey]?.[index];
    if (!g) return;
    if (!confirm(`Remove "${g.name}"? Students currently assigned this grade code will retain it.`)) return;
    schoolConfig.grades[groupKey].splice(index, 1);
    this._saveSchoolConfig();
    this.render();
    showToast(`Grade "${g.name}" removed`, 'info');
  },

  // ── Persist schoolConfig changes to Supabase ──
  async _saveSchoolConfig() {
    const configData = {
      grades: schoolConfig.grades,
      terms: schoolConfig.academicYear.terms,
      subjects: schoolConfig.subjects,
      feeStructure: schoolConfig.feeStructure
    };
    try {
      const { data: row } = await supabaseClient.from('school_settings').select('id, settings_json').limit(1).single();
      let existing = {};
      if (row?.settings_json) {
        existing = typeof row.settings_json === 'string' ? JSON.parse(row.settings_json) : row.settings_json;
      }
      existing.schoolConfig = configData;
      const settingsJson = JSON.stringify(existing);
      if (row) {
        await supabaseClient.from('school_settings').update({ settings_json: settingsJson, updated_at: new Date().toISOString() }).eq('id', row.id);
      } else {
        await supabaseClient.from('school_settings').insert({ settings_json: settingsJson });
      }
      console.log('[CS] SchoolConfig persisted to Supabase');
    } catch (e) {
      console.warn('[CS] Failed to persist schoolConfig to Supabase, saved in-memory only:', e);
    }
  }
};

window.classScheduleModule = classScheduleModule;
