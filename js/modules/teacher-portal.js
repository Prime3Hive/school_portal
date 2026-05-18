// ============================================
// TEACHER PORTAL MODULE
// Overview · Grades · Students
// ============================================

const teacherPortalModule = {
  currentTab: 'overview',
  currentTeacher: null,
  teacherError: null,
  selectedClass: null,
  selectedAssessment: null,
  _classFilter: 'all',
  _notifications: [],
  _notifOpen: false,
  _pendingGrades: {},

  async init(container) {
    this.container = container;
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);

    await dataManager.waitForReady();
    this.loadTeacherData();
    this.loadNotifications();
    this.render();

    this._onDataChange = (e) => {
      if (['grades', 'lessonPlans', 'teacherAssessments', 'students', 'schoolSchedules'].includes(e.detail.collection)) {
        this.loadNotifications();
        this.render();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  loadTeacherData() {
    // FIX BUG #1: Proper teacher record validation
    const session = authManager?.getSession();
    if (!session) {
      console.error('[TeacherPortal] No session found');
      this.teacherError = 'Session not found. Please log in again.';
      this.currentTeacher = null;
      return;
    }

    // Verify teacher exists in staff table
    const staff = dataManager.getAll('staff') || [];
    const teacher = staff.find(s => 
      (s.authId === session.supabaseId || s.auth_id === session.supabaseId) &&
      (s.role === 'teacher' || s.role === 'staff')
    );

    if (!teacher) {
      console.error('[TeacherPortal] Teacher record not found for session:', session.userId);
      this.teacherError = 'Teacher record not found. Please contact administrator.';
      this.currentTeacher = null;
      return;
    }

    this.currentTeacher = {
      id: teacher.id,
      name: teacher.name || session.fullName,
      role: teacher.role,
      subjects: Array.isArray(teacher.subjects) ? teacher.subjects : (teacher.subjects ? [teacher.subjects] : []),
      supabaseId: session.supabaseId,
      userId: session.userId
    };
    this.teacherError = null;
  },

  render() {
    if (!this.container) return;
    if (this.teacherError) {
      this.container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
          <div style="text-align:center;padding:48px;background:white;border-radius:20px;border:1px solid #e2e8f0;max-width:420px;">
            <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
            <h2 style="font-size:1.2rem;font-weight:700;color:#0f172a;margin-bottom:8px;">${this.teacherError}</h2>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:20px;">
              <button class="btn btn-primary" onclick="window.location.reload()">Reload</button>
              <button class="btn btn-ghost" onclick="window.location.href='login.html'">Login</button>
            </div>
          </div>
        </div>`;
      return;
    }

    this.container.innerHTML = `
      <div style="min-height:100vh;background:#f8fafc;">
        ${this._renderHeader()}
        <div style="padding:0 24px 32px;">
          ${this._renderTabs()}
          <div id="tp-tab-content">${this._renderTabContent()}</div>
        </div>
      </div>`;

    this._attachNotifListener();
  },

  _renderTabs() {
    const tabs = [
      { id: 'overview',  icon: '📊', label: 'Overview'      },
      { id: 'grades',    icon: '📝', label: 'Enter Grades'  },
      { id: 'students',  icon: '�', label: 'My Students'   },
    ];
    return `
      <div style="display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:12px;margin:20px 0 24px;max-width:500px;">
        ${tabs.map(t => `
          <button data-tp-tab="${t.id}" onclick="teacherPortalModule.switchTab('${t.id}')"
            style="flex:1;padding:10px 14px;border:none;border-radius:9px;font-size:0.84rem;font-weight:600;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:6px;
            ${this.currentTab === t.id ? 'background:white;color:#0f172a;box-shadow:0 1px 4px rgba(0,0,0,0.1);' : 'background:transparent;color:#64748b;'}">
            <span>${t.icon}</span><span>${t.label}</span>
          </button>`).join('')}
      </div>`;
  },

  switchTab(tabId) {
    this.currentTab = tabId;
    const el = document.getElementById('tp-tab-content');
    if (el) el.innerHTML = this._renderTabContent();
    document.querySelectorAll('[data-tp-tab]').forEach(btn => {
      const active = btn.dataset.tpTab === tabId;
      btn.style.background    = active ? 'white' : 'transparent';
      btn.style.color         = active ? '#0f172a' : '#64748b';
      btn.style.boxShadow     = active ? '0 1px 4px rgba(0,0,0,0.1)' : '';
    });
  },

  _renderTabContent() {
    switch (this.currentTab) {
      case 'overview':  return this._renderOverview();
      case 'grades':    return this.renderGrades();
      case 'students':  return this._renderStudents();
      default:          return '';
    }
  },

  // Keep legacy names so older onclick references still work
  renderTabContent() { return this._renderTabContent(); },

  // ============================================
  // OVERVIEW TAB
  // ============================================
  _renderOverview() {
    const session = authManager?.getSession();
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr  = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    const classes            = this.getTeacherClasses();
    const upcomingAssessments = this.getUpcomingAssessments();
    const lessonPlans        = this.getLessonPlans();
    const allStudents        = dataManager?.getAll('students') || [];
    const activeStudents     = allStudents.filter(s => s.status === 'active');

    return `
      <!-- Hero Banner -->
      <div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 60%,#60a5fa 100%);border-radius:20px;padding:28px 32px;margin-bottom:20px;color:white;position:relative;overflow:hidden;">
        <div style="position:absolute;right:-30px;top:-30px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.06);pointer-events:none;"></div>
        <div style="position:absolute;right:70px;bottom:-40px;width:140px;height:140px;border-radius:50%;background:rgba(255,255,255,0.08);pointer-events:none;"></div>
        <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
          <div>
            <p style="font-size:0.83rem;font-weight:500;opacity:0.8;margin:0 0 4px;">${greeting} 👋</p>
            <h1 style="font-size:1.7rem;font-weight:800;margin:0 0 6px;letter-spacing:-0.03em;">${session?.fullName || 'Teacher'}</h1>
            <p style="font-size:0.82rem;opacity:0.75;margin:0;">📅 ${dateStr}</p>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            ${[
              { icon:'👥', label:'Students',    value: activeStudents.length },
              { icon:'📝', label:'Assessments', value: upcomingAssessments.length },
              { icon:'📚', label:'Lesson Plans',value: lessonPlans.length },
            ].map(s => `
              <div style="background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);border-radius:14px;padding:12px 16px;text-align:center;min-width:72px;">
                <div style="font-size:1.2rem;margin-bottom:3px;">${s.icon}</div>
                <div style="font-size:1.35rem;font-weight:800;line-height:1.1;">${s.value}</div>
                <div style="font-size:0.68rem;opacity:0.8;margin-top:2px;">${s.label}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
        ${[
          { icon:'📝', label:'Enter Grades',   bg:'#f0f9ff', c:'#0ea5e9', tab:'grades'   },
          { icon:'👥', label:'My Students',    bg:'#eef2ff', c:'#6366f1', tab:'students' },
          { icon:'📅', label:'Class Schedule', bg:'#fffbeb', c:'#f59e0b', hash:'class-schedule' },
          { icon:'📋', label:'Lesson Plan',    bg:'#f0fdf4', c:'#10b981', fn:'createLessonPlan' },
        ].map(a => `
          <button onclick="${a.tab ? `teacherPortalModule.switchTab('${a.tab}')` : a.hash ? `window.location.hash='${a.hash}'` : `teacherPortalModule.${a.fn}()`}"
            style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:white;border:1px solid #e2e8f0;border-radius:14px;cursor:pointer;transition:all 0.2s;text-align:left;width:100%;"
            onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(0,0,0,0.08)'"
            onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="width:38px;height:38px;border-radius:10px;background:${a.bg};display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${a.icon}</div>
            <span style="font-size:0.84rem;font-weight:600;color:#0f172a;">${a.label}</span>
          </button>`).join('')}
      </div>

      <!-- Main 2-col grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px;">

        <!-- Today's Schedule -->
        <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-size:0.92rem;font-weight:700;color:#0f172a;margin:0;">📅 Today's Schedule</h3>
            <button onclick="teacherPortalModule.openCalendarModal()" style="font-size:0.75rem;color:#3b82f6;background:none;border:none;cursor:pointer;font-weight:600;">Full Calendar →</button>
          </div>
          ${this.renderTodaySchedule()}
        </div>

        <!-- Mini Calendar -->
        ${this.renderMiniCalendar()}
      </div>

      <!-- Bottom 2-col grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">

        <!-- Upcoming Assessments -->
        <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-size:0.92rem;font-weight:700;color:#0f172a;margin:0;">📝 Upcoming Assessments</h3>
            <button class="btn btn-sm btn-primary" onclick="teacherPortalModule.createNewAssessment()" style="font-size:0.75rem;padding:4px 10px;">+ New</button>
          </div>
          ${this.renderUpcomingAssessmentsList(upcomingAssessments)}
        </div>

        <!-- Recent Activity -->
        <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-size:0.92rem;font-weight:700;color:#0f172a;margin:0;">🕒 Recent Activity</h3>
          </div>
          ${this.renderRecentActivity()}
        </div>
      </div>
    `;
  },

  // Keep legacy name for any lingering references
  renderDashboard() { return this._renderOverview(); },

  createStatCard(label, value, change, type, icon) {
    return `
      <div class="stat-card stat-card-${type}">
        <div class="stat-card-icon">${icon}</div>
        <div class="stat-card-content">
          <div class="stat-card-label">${label}</div>
          <div class="stat-card-value">${value}</div>
          <div class="stat-card-change">${change}</div>
        </div>
      </div>
    `;
  },

  createClickableStatCard(label, value, subtitle, targetTab, icon, gradient) {
    return `
      <div class="clickable-stat-card" 
           onclick="teacherPortalModule.switchTab('${targetTab}')"
           style="
             background: ${gradient};
             color: white;
             padding: var(--space-6);
             border-radius: var(--radius-lg);
             cursor: pointer;
             transition: all 0.3s ease;
             box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
             position: relative;
             overflow: hidden;
           "
           onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 16px rgba(0, 0, 0, 0.2)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px rgba(0, 0, 0, 0.1)';">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-4);">
          <div style="font-size: 2.5rem; opacity: 0.9;">${icon}</div>
          <div style="
            background: rgba(255, 255, 255, 0.2);
            padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-full);
            font-size: 0.75rem;
            font-weight: 600;
          ">View Details →</div>
        </div>
        <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: var(--space-2); font-weight: 500;">${label}</div>
        <div style="font-size: 2.25rem; font-weight: 700; margin-bottom: var(--space-2);">${value}</div>
        <div style="font-size: 0.875rem; opacity: 0.8;">${subtitle}</div>
        <div style="
          position: absolute;
          bottom: -20px;
          right: -20px;
          font-size: 6rem;
          opacity: 0.1;
        ">${icon}</div>
      </div>
    `;
  },

  renderTodaySchedule() {
    const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
    const session = authManager?.getSession();
    const allSchedules = dataManager?.getAll('schoolSchedules') || [];

    // Filter schedules assigned to this teacher for today
    const teacherName = (this.currentTeacher?.name || session?.fullName || '').toLowerCase();
    let schedule = allSchedules.filter(s => {
      const dayMatch = (s.day || '').toLowerCase() === todayName.toLowerCase();
      const teacherMatch =
        (s.teacher || '').toLowerCase() === teacherName ||
        s.teacherId === session?.userId ||
        s.teacher_id === session?.userId ||
        s.teacher_id === this.currentTeacher?.id;
      return dayMatch && teacherMatch;
    });

    // Fallback: if teacher has classes but no schedules in DB, derive from classes
    if (schedule.length === 0) {
      schedule = this.getTeacherClasses()
        .slice(0, 4)
        .map((cls, i) => ({
          time: `${8 + i}:00 - ${9 + i}:00`,
          subject: session?.subject || 'Mathematics',
          class: `Grade ${cls.grade}-${cls.section}`,
          room: cls.room || (200 + i).toString()
        }));
    } else {
      schedule = schedule.map(s => ({
        time: s.startTime
          ? `${s.startTime} - ${s.endTime || ''}`
          : (s.time || 'TBD'),
        subject: s.subject || s.subjectName || '',
        class: s.className || `Grade ${s.grade}-${s.section}`,
        room: s.room || s.roomNumber || '-'
      }));
    }

    if (schedule.length === 0) {
      return '<p class="text-secondary">No classes scheduled for today</p>';
    }

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${schedule.map(item => `
          <div class="schedule-item" style="padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 3px solid var(--color-primary);">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <div>
                <div style="font-weight: var(--font-weight-semibold); color: var(--text-primary);">${item.subject}</div>
                <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">${item.class} • Room ${item.room}</div>
              </div>
              <div style="font-size: var(--font-size-sm); color: var(--text-tertiary);">${item.time}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderUpcomingAssessmentsList(assessments) {
    if (assessments.length === 0) {
      return `
                <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
                    <div style="font-size: 3rem; margin-bottom: var(--space-3);">📝</div>
                    <p style="color: var(--text-secondary); margin: 0;">No upcoming assessments</p>
                    <button class="btn btn-sm btn-primary" onclick="teacherPortalModule.createNewAssessment()" style="margin-top: var(--space-4);">
                        Create Assessment
                    </button>
                </div>
            `;
    }

    return `
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                ${assessments.slice(0, 5).map(assessment => `
                    <div onclick="teacherPortalModule.switchTab('grades')" 
                         style="padding: var(--space-4); background: var(--bg-secondary); border-radius: var(--radius-md); 
                                border-left: 4px solid var(--color-primary); cursor: pointer; transition: all 0.2s ease;"
                         onmouseover="this.style.background='var(--bg-tertiary)'; this.style.transform='translateX(4px)';"
                         onmouseout="this.style.background='var(--bg-secondary)'; this.style.transform='translateX(0)';">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-2);">
                            <div style="font-weight: 600; color: var(--text-primary);">${assessment.name}</div>
                            <span class="badge badge-warning" style="font-size: 0.75rem;">${assessment.date}</span>
                        </div>
                        <div style="display: flex; gap: var(--space-4); font-size: 0.875rem; color: var(--text-secondary);">
                            <span>📚 ${assessment.subject}</span>
                            <span>🎯 ${assessment.grade}-${assessment.section}</span>
                            <span>📊 ${assessment.totalMarks} marks</span>
                        </div>
                    </div>
                `).join('')}
                ${assessments.length > 5 ? `
                    <button class="btn btn-ghost btn-sm" onclick="teacherPortalModule.switchTab('grades')" 
                            style="margin-top: var(--space-2);">
                        View all ${assessments.length} assessments →
                    </button>
                ` : ''}
            </div>
        `;
  },

  renderRecentActivity() {
    const now = Date.now();
    const timeAgoStr = (dateStr) => {
      if (!dateStr) return '';
      const diff = now - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    };

    const session = authManager?.getSession();
    const teacherId = session?.userId;
    const activities = [];

    // Recent grades entered by this teacher
    (dataManager?.getAll('grades') || [])
      .filter(g => g.gradedBy === teacherId || g.graded_by === teacherId)
      .slice(-5)
      .reverse()
      .forEach(g => activities.push({
        icon: '📝', color: '#fa709a',
        message: `Entered grade: ${g.grade || g.score} for ${g.subject || 'assessment'}`,
        time: timeAgoStr(g.createdAt || g.created_at)
      }));

    // Recent lesson plans
    (dataManager?.getAll('lessonPlans') || [])
      .filter(lp => lp.teacherId === teacherId || lp.teacher_id === teacherId)
      .slice(-3)
      .reverse()
      .forEach(lp => activities.push({
        icon: '📚', color: '#4facfe',
        message: `Created lesson plan: ${lp.title || 'Untitled'}`,
        time: timeAgoStr(lp.createdAt || lp.created_at)
      }));

    // Recent assessments
    (dataManager?.getAll('teacherAssessments') || [])
      .filter(a => a.teacherId === teacherId)
      .slice(-3)
      .reverse()
      .forEach(a => activities.push({
        icon: '📋', color: '#667eea',
        message: `Created assessment: ${a.name}`,
        time: timeAgoStr(a.createdAt)
      }));

    if (activities.length === 0) {
      return `<p style="color:var(--text-secondary);text-align:center;padding:var(--space-6);">No recent activity found.</p>`;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${activities.slice(0, 8).map(activity => `
          <div style="display: flex; gap: var(--space-3); padding: var(--space-3); border-bottom: 1px solid var(--border-primary); align-items: center;">
            <div style="
                width: 40px; height: 40px;
                display: flex; align-items: center; justify-content: center;
                background: ${activity.color}15;
                border-radius: var(--radius-md); font-size: 1.25rem;
            ">${activity.icon}</div>
            <div style="flex: 1;">
              <div style="font-weight: var(--font-weight-medium); margin-bottom: var(--space-1);">${activity.message}</div>
              <div style="font-size: var(--font-size-sm); color: var(--text-tertiary);">🕒 ${activity.time}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ============================================
  // GRADES TAB
  // ============================================
  renderGrades() {
    const assessments = this.getTeacherAssessments();
    const classes     = this.getTeacherClasses();

    if (assessments.length === 0 && classes.length === 0) {
      return `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:60px 20px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:12px;">📝</div>
          <h3 style="font-size:1.05rem;font-weight:700;color:#0f172a;margin-bottom:8px;">No Assessments Yet</h3>
          <p style="color:#64748b;font-size:0.88rem;margin-bottom:20px;">Create your first assessment to start entering grades.</p>
          <button class="btn btn-primary" onclick="teacherPortalModule.createNewAssessment()">+ Create Assessment</button>
        </div>`;
    }

    // Build smart options: each assessment labelled with class + subject + date
    const smartOptions = assessments.map(a => {
      const label = [
        a.name || a.type || 'Assessment',
        a.subject ? `· ${a.subject}` : '',
        (a.grade || a.class_id) ? `· Grade ${a.grade || ''}${a.section ? '-'+a.section : ''}` : '',
        a.date ? `· ${a.date}` : '',
        `(${a.totalMarks || 100} marks)`
      ].filter(Boolean).join(' ');
      return `<option value="${a.id}" ${this.selectedAssessment === a.id ? 'selected' : ''}>${label}</option>`;
    }).join('');

    // Progress bar
    let progressHTML = '';
    if (this.selectedAssessment) {
      const students = this.getStudentsByClass(this.selectedClass);
      const pending  = this._pendingGrades?.[this.selectedAssessment] || [];
      const graded   = pending.filter(g => g.score !== '' && g.score !== undefined).length;
      const total    = students.length;
      const pct      = total > 0 ? Math.round((graded / total) * 100) : 0;
      progressHTML = `
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:0.8rem;font-weight:600;color:#475569;">Grading Progress</span>
            <span style="font-size:0.8rem;color:#64748b;">${graded}/${total} students</span>
          </div>
          <div style="height:6px;background:#e2e8f0;border-radius:10px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#3b82f6,#6366f1);border-radius:10px;transition:width 0.3s;"></div>
          </div>
        </div>`;
    }

    return `
      <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:24px;">

        <!-- Header row -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div>
            <h2 style="font-size:1.05rem;font-weight:700;color:#0f172a;margin:0 0 4px;">Grade Entry</h2>
            <p style="font-size:0.8rem;color:#64748b;margin:0;">Select an assessment below to start entering scores</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="teacherPortalModule.createNewAssessment()">+ New Assessment</button>
        </div>

        <!-- Single-step smart selector -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px;">
          <label style="font-size:0.8rem;font-weight:600;color:#475569;display:block;margin-bottom:8px;">SELECT ASSESSMENT</label>
          <select id="grade-assessment-select" class="form-select"
            style="font-size:0.88rem;"
            onchange="teacherPortalModule.selectAssessmentForGrades(this.value)">
            <option value="">-- Choose an assessment to grade --</option>
            ${smartOptions}
          </select>
          <p style="font-size:0.75rem;color:#94a3b8;margin:8px 0 0;">Students from the matching class will appear automatically below.</p>
        </div>

        ${progressHTML}

        <!-- Grade Entry Form -->
        <div id="grade-entry-form">
          ${this.renderGradeEntryForm()}
        </div>
      </div>
    `;
  },

  // Legacy selectors kept for backward compat
  selectClassForGrades(classId) {
    this.selectedClass = classId;
    const el = document.getElementById('grade-entry-form');
    if (el) el.innerHTML = this.renderGradeEntryForm();
  },

  renderGradeEntryForm() {
    if (!this.selectedClass || !this.selectedAssessment) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3 class="empty-state-title">Select Class and Assessment</h3>
          <p class="empty-state-description">Choose a class and assessment to enter grades</p>
        </div>
      `;
    }

    const students = this.getStudentsByClass(this.selectedClass);
    const assessment = this.getAssessmentById(this.selectedAssessment);
    const grades = this.getGradesForAssessment(this.selectedAssessment);

    return `
      <div style="margin-bottom: var(--space-4);">
        <h4>${assessment.name} - ${assessment.totalMarks} marks</h4>
        <p class="text-secondary">${assessment.subject} • ${assessment.date}</p>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Student Name</th>
              <th>Marks Obtained</th>
              <th>Grade</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(student => {
      const grade = grades.find(g => g.studentId === student.id) || { score: '', grade: '', remarks: '' };
      return `
                <tr>
                  <td>${student.roll_no || student.rollNo || '—'}</td>
                  <td>${student.name}</td>
                  <td>
                    <input 
                      type="number" 
                      class="form-input form-input-sm" 
                      placeholder="0"
                      min="0"
                      max="${assessment.totalMarks}"
                      value="${grade.score || ''}"
                      onchange="teacherPortalModule.updateGrade('${student.id}', 'score', this.value, ${assessment.totalMarks})"
                      style="width: 100px;">
                    <span class="text-secondary">/ ${assessment.totalMarks}</span>
                  </td>
                  <td>
                    <span class="badge badge-${this.getGradeBadgeType(grade.grade)}" data-grade-badge="${student.id}">${grade.grade || '-'}</span>
                  </td>
                  <td>
                    <input 
                      type="text" 
                      class="form-input form-input-sm" 
                      placeholder="Add remarks..."
                      value="${grade.remarks || ''}"
                      onchange="teacherPortalModule.updateGrade('${student.id}', 'remarks', this.value)"
                      style="min-width: 200px;">
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-top: var(--space-4); display: flex; justify-content: space-between; align-items: center;">
        <div class="text-secondary">
          <strong>Class Average:</strong> ${this.calculateClassAverage(grades, assessment.totalMarks)}%
        </div>
        <div style="display: flex; gap: var(--space-3);">
          <button id="cancel-grades-btn" class="btn btn-ghost" onclick="teacherPortalModule.cancelGradeEntry()">Cancel</button>
          <button id="save-grades-btn" class="btn btn-primary" onclick="teacherPortalModule.saveGrades()">
            <span>💾</span> Save Grades
          </button>
        </div>
      </div>
    `;
  },

  selectClassForGrades(classId) {
    this.selectedClass = classId;
    document.getElementById('grade-entry-form').innerHTML = this.renderGradeEntryForm();
  },

  selectAssessmentForGrades(assessmentId) {
    this.selectedAssessment = assessmentId;
    // Auto-derive the matching class from the assessment
    if (assessmentId) {
      const assessment = this.getAssessmentById(assessmentId);
      if (assessment) {
        const classes = this.getTeacherClasses();
        const match = classes.find(c =>
          c.grade === (assessment.grade || assessment.class?.split('-')[0]) &&
          c.section === (assessment.section || assessment.class?.split('-')[1])
        );
        this.selectedClass = match ? match.id : (classes[0]?.id || null);
      }
    } else {
      this.selectedClass = null;
    }
    const el = document.getElementById('grade-entry-form');
    if (el) el.innerHTML = this.renderGradeEntryForm();
  },

  updateGrade(studentId, field, value, totalMarks = null) {
    if (!this._pendingGrades) this._pendingGrades = {};
    if (!this._pendingGrades[this.selectedAssessment]) this._pendingGrades[this.selectedAssessment] = [];
    const grades = this._pendingGrades[this.selectedAssessment];

    let entry = grades.find(g => g.studentId === studentId);
    if (!entry) {
      entry = { studentId, score: '', grade: '', remarks: '' };
      grades.push(entry);
    }
    entry[field] = value;

    // If score changed, recalculate letter grade and update only the badge span
    if (field === 'score' && totalMarks) {
      entry.grade = this.calculateLetterGrade(value, totalMarks);
      const badge = document.querySelector(`[data-grade-badge="${studentId}"]`);
      if (badge) {
        badge.className = `badge badge-${this.getGradeBadgeType(entry.grade)}`;
        badge.textContent = entry.grade || '-';
      }
    }
  },

  calculateLetterGrade(score, totalMarks) {
    const percentage = (score / totalMarks) * 100;
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
  },

  getGradeBadgeType(grade) {
    if (grade === 'A+' || grade === 'A') return 'success';
    if (grade === 'B' || grade === 'C') return 'warning';
    if (grade === 'D' || grade === 'F') return 'danger';
    return 'secondary';
  },

  calculateClassAverage(grades, totalMarks) {
    // FIX BUG #6: Add comprehensive null checks and validation
    if (!grades || grades.length === 0) return 0;
    if (!totalMarks || totalMarks === 0) return 0;
    
    const validGrades = grades.filter(g => {
      const score = parseFloat(g.score);
      return !isNaN(score) && score >= 0 && g.score !== '' && g.score !== null && g.score !== undefined;
    });
    
    if (validGrades.length === 0) return 0;
    
    const sum = validGrades.reduce((acc, g) => acc + parseFloat(g.score), 0);
    const average = (sum / validGrades.length / totalMarks) * 100;
    
    // Ensure result is within valid range
    return Math.min(100, Math.max(0, average)).toFixed(1);
  },

  async saveGrades() {
    // FIX BUG #9: Add loading state
    const saveBtn = document.getElementById('save-grades-btn');
    const cancelBtn = document.getElementById('cancel-grades-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.6s linear infinite; margin-right: 8px;"></span>Saving...';
    }
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // Persist grades via dataManager → Supabase
      const assessment = this.getAssessmentById(this.selectedAssessment);
      const session = authManager?.getSession();
      const grades = this._pendingGrades?.[this.selectedAssessment] || [];
      for (const g of grades) {
        if (g.score !== '' && g.score !== undefined) {
          await dataManager.create('grades', {
            studentId: g.studentId,
            assessmentId: this.selectedAssessment,
            subject: assessment?.subject || '',
            score: parseFloat(g.score),
            totalMarks: assessment?.totalMarks || 100,
            grade: g.grade || '',
            remarks: g.remarks || '',
            gradedBy: session?.supabaseId || null
          });
        }
      }
      if (this._pendingGrades) delete this._pendingGrades[this.selectedAssessment];
      showToast('Grades saved successfully!', 'success');
      this.selectedClass = null;
      this.selectedAssessment = null;
      const assessSel = document.getElementById('grade-assessment-select');
      if (assessSel) assessSel.value = '';
      const entryForm = document.getElementById('grade-entry-form');
      if (entryForm) entryForm.innerHTML = this.renderGradeEntryForm();
    } catch (error) {
      console.error('[TeacherPortal] Error saving grades:', error);
      showToast('Failed to save grades. Please try again.', 'error');
    } finally {
      // FIX BUG #9: Reset loading state
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Save Grades';
      }
      if (cancelBtn) cancelBtn.disabled = false;
    }
  },

  cancelGradeEntry() {
    this.selectedClass = null;
    this.selectedAssessment = null;
    const assessSel = document.getElementById('grade-assessment-select');
    if (assessSel) assessSel.value = '';
    const entryForm = document.getElementById('grade-entry-form');
    if (entryForm) entryForm.innerHTML = this.renderGradeEntryForm();
  },

  createNewAssessment() {
    // Get teacher's subject from session
    const session = authManager?.getSession();
    const teacherSubject = session?.subject || 'Mathematics';

    // Get unique grades from teacher's classes
    const teacherClasses = this.getTeacherClasses();
    const uniqueGrades = [...new Set(teacherClasses.map(cls => cls.grade))].sort();

    showModal('Create Subject-Based Assessment', `
      <form id="new-assessment-form" onsubmit="teacherPortalModule.submitNewAssessment(event)">
        <div class="form-group">
          <label class="form-label">Assessment Type</label>
          <select name="assessmentType" class="form-select" required>
            <option value="">Select assessment type</option>
            <option value="Quiz">Quiz</option>
            <option value="Test">Test</option>
            <option value="Mid-Term Exam">Mid-Term Exam</option>
            <option value="Final Exam">Final Exam</option>
            <option value="Assignment">Assignment</option>
            <option value="Project">Project</option>
          </select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Subject</label>
          <input type="text" name="subject" class="form-input" value="${teacherSubject}" readonly 
                 style="background: var(--bg-tertiary); cursor: not-allowed;">
          <small class="form-help">Subject is auto-assigned based on your profile</small>
        </div>
        
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Grade Level</label>
            <select name="grade" class="form-select" required id="assessment-grade-select" 
                    onchange="teacherPortalModule.updateClassOptions(this.value)">
              <option value="">Select grade</option>
              ${uniqueGrades.map(grade => `
                <option value="${grade}">Grade ${grade}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Section</label>
            <select name="section" class="form-select" required id="assessment-section-select">
              <option value="">Select grade first</option>
            </select>
          </div>
        </div>
        
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Assessment Date</label>
            <input type="date" name="date" class="form-input" required 
                   min="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label class="form-label">Total Marks</label>
            <input type="number" name="totalMarks" class="form-input" required min="1" max="100" 
                   placeholder="100" value="100">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Duration (minutes)</label>
          <input type="number" name="duration" class="form-input" min="15" placeholder="60" value="60">
        </div>
        
        <div class="form-group">
          <label class="form-label">Instructions (Optional)</label>
          <textarea name="instructions" class="form-input" rows="3" 
                    placeholder="Enter any special instructions for students..."></textarea>
        </div>
        
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Assessment</button>
        </div>
      </form>
    `);
  },

  updateClassOptions(selectedGrade) {
    const sectionSelect = document.getElementById('assessment-section-select');
    if (!sectionSelect) return;

    const teacherClasses = this.getTeacherClasses();
    const sectionsForGrade = teacherClasses
      .filter(cls => cls.grade === selectedGrade)
      .map(cls => cls.section);

    sectionSelect.innerHTML = sectionsForGrade.length > 0
      ? sectionsForGrade.map(section => `
                <option value="${section}">Section ${section}</option>
              `).join('')
      : '<option value="">No sections available</option>';
  },

  async submitNewAssessment(event) {
    event.preventDefault();
    
    // FIX BUG #10: Add comprehensive validation
    const formData = new FormData(event.target);
    const session = authManager?.getSession();

    const grade = formData.get('grade');
    const section = formData.get('section');
    const assessmentType = formData.get('assessmentType');
    const subject = formData.get('subject');
    const date = formData.get('date');
    const totalMarks = parseInt(formData.get('totalMarks'));
    const duration = parseInt(formData.get('duration'));

    // Validate required fields
    if (!assessmentType || !grade || !section || !date || !totalMarks) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    // Validate date is not in the past
    const assessmentDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (assessmentDate < today) {
      showToast('Assessment date cannot be in the past', 'error');
      return;
    }

    // Validate totalMarks range
    if (isNaN(totalMarks) || totalMarks < 1 || totalMarks > 100) {
      showToast('Total marks must be between 1 and 100', 'error');
      return;
    }

    // Validate duration if provided
    if (duration && (isNaN(duration) || duration < 15 || duration > 300)) {
      showToast('Duration must be between 15 and 300 minutes', 'error');
      return;
    }

    // Find the class ID based on grade and section
    const teacherClasses = this.getTeacherClasses();
    const selectedClass = teacherClasses.find(cls =>
      cls.grade === grade && cls.section === section
    );

    if (!selectedClass) {
      showToast('Invalid class selection', 'error');
      return;
    }

    // Check for duplicate assessments
    const existingAssessments = dataManager.getAll('teacherAssessments') || [];
    const duplicate = existingAssessments.find(a => 
      a.subject === subject && 
      a.grade === grade && 
      a.section === section && 
      a.date === date && 
      a.type === assessmentType
    );
    if (duplicate) {
      showToast('An identical assessment already exists for this date', 'warning');
      return;
    }

    // Add loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner" style="width: 16px; height: 16px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.6s linear infinite; margin-right: 8px;"></span>Creating...';
    }

    try {
      const assessment = {
      name: `${subject} - ${assessmentType}`,
      type: assessmentType,
      subject: subject,
      grade: grade,
      section: section,
      classId: selectedClass.id,
      date: formData.get('date'),
      totalMarks: parseInt(formData.get('totalMarks')),
        duration: duration || 60,
        instructions: formData.get('instructions') || '',
        teacherId: session?.userId || this.currentTeacher.id,
        teacherName: session?.fullName || this.currentTeacher.name,
        status: 'scheduled',
        createdAt: new Date().toISOString()
      };

      const result = await dataManager.create('teacherAssessments', assessment);
      if (!result) {
        showToast('Failed to create assessment', 'error');
        return;
      }

      closeModal();
      showToast(`${assessmentType} created successfully for Grade ${grade}-${section}!`, 'success');
      this.switchTab('grades');
    } catch (error) {
      console.error('[TeacherPortal] Error creating assessment:', error);
      showToast('Failed to create assessment. Please try again.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Create Assessment';
      }
    }
  },

  // ============================================
  // LESSON PLANS TAB
  // ============================================
  renderLessonPlans() {
    const lessonPlans = this.getLessonPlans();

    return `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Lesson Plans</h3>
          <button class="btn btn-primary btn-sm" onclick="teacherPortalModule.createLessonPlan()">
            <span>+</span> New Lesson Plan
          </button>
        </div>
        <div class="card-body">
          ${lessonPlans.length === 0 ? `
            <div class="empty-state">
              <div class="empty-state-icon">📚</div>
              <h3 class="empty-state-title">No Lesson Plans Yet</h3>
              <p class="empty-state-description">Create your first lesson plan to get started</p>
              <button class="btn btn-primary" onclick="teacherPortalModule.createLessonPlan()">
                <span>+</span> Create Lesson Plan
              </button>
            </div>
          ` : `
            <div class="grid grid-3">
              ${lessonPlans.map(plan => this.renderLessonPlanCard(plan)).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },

  renderLessonPlanCard(plan) {
    return `
      <div class="card">
        <div class="card-body">
          <div style="display: flex; justify-content: between; align-items: start; margin-bottom: var(--space-3);">
            <div style="flex: 1;">
              <h4 style="margin: 0 0 var(--space-2) 0;">${plan.title}</h4>
              <div class="text-secondary" style="font-size: var(--font-size-sm);">
                ${plan.subject} • ${plan.class}
              </div>
            </div>
            <span class="badge badge-${plan.status === 'completed' ? 'success' : 'primary'}">${plan.status}</span>
          </div>
          
          <div style="margin: var(--space-3) 0;">
            <div class="text-secondary" style="font-size: var(--font-size-sm);">
              📅 ${plan.date} • ⏱️ ${plan.duration}
            </div>
          </div>

          <div style="margin-top: var(--space-4); display: flex; gap: var(--space-2);">
            <button class="btn btn-sm btn-ghost" onclick="teacherPortalModule.viewLessonPlan('${plan.id}')">View</button>
            <button class="btn btn-sm btn-ghost" onclick="teacherPortalModule.editLessonPlan('${plan.id}')">Edit</button>
            <button class="btn btn-sm btn-ghost" onclick="teacherPortalModule.deleteLessonPlan('${plan.id}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  },

  createLessonPlan() {
    showModal('Create Lesson Plan', `
      <form id="lesson-plan-form" onsubmit="teacherPortalModule.submitLessonPlan(event)">
        <div class="form-group">
          <label class="form-label">Lesson Title</label>
          <input type="text" name="title" class="form-input" required placeholder="e.g., Introduction to Algebra">
        </div>
        
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input type="text" name="subject" class="form-input" required placeholder="Mathematics">
          </div>
          <div class="form-group">
            <label class="form-label">Class</label>
            <select name="class" class="form-select" required>
              <option value="">Select class</option>
              ${this.getTeacherClasses().map(cls => `
                <option value="${cls.grade}-${cls.section}">${cls.grade}-${cls.section}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" name="date" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label">Duration</label>
            <input type="text" name="duration" class="form-input" required placeholder="60 minutes">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Learning Objectives</label>
          <textarea name="objectives" class="form-textarea" rows="3" required placeholder="What students will learn..."></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Materials Needed</label>
          <textarea name="materials" class="form-textarea" rows="2" placeholder="Textbooks, worksheets, etc."></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Lesson Activities</label>
          <textarea name="activities" class="form-textarea" rows="4" required placeholder="Step-by-step lesson activities..."></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Assessment Method</label>
          <textarea name="assessment" class="form-textarea" rows="2" placeholder="How will you assess student understanding?"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Homework/Follow-up</label>
          <textarea name="homework" class="form-textarea" rows="2" placeholder="Assignments or follow-up activities..."></textarea>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Save Lesson Plan</button>
        </div>
      </form>
    `, 'large');
  },

  async submitLessonPlan(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const session = authManager?.getSession();
    const lessonPlan = {
      teacher_id: this.currentTeacher?.id || session?.supabaseId || null,
      title: formData.get('title'),
      subject: formData.get('subject'),
      class: formData.get('class'),
      date: formData.get('date'),
      duration: formData.get('duration'),
      objectives: formData.get('objectives'),
      materials: formData.get('materials'),
      activities: formData.get('activities'),
      assessment: formData.get('assessment'),
      homework: formData.get('homework'),
      status: 'planned'
    };

    const result = await dataManager.create('lessonPlans', lessonPlan);
    if (!result) return;

    closeModal();
    showToast('Lesson plan created successfully!', 'success');
    this.switchTab('lessons');
  },

  viewLessonPlan(planId) {
    const plan = this.getLessonPlanById(planId);
    if (!plan) return;

    showModal(plan.title, `
      <div class="modal-body">
        <div style="margin-bottom: var(--space-4);">
          <div class="text-secondary">${plan.subject} • ${plan.class}</div>
          <div class="text-secondary">📅 ${plan.date} • ⏱️ ${plan.duration}</div>
        </div>

        <div style="margin-bottom: var(--space-4);">
          <h4>Learning Objectives</h4>
          <p>${plan.objectives}</p>
        </div>

        ${plan.materials ? `
          <div style="margin-bottom: var(--space-4);">
            <h4>Materials Needed</h4>
            <p>${plan.materials}</p>
          </div>
        ` : ''}

        <div style="margin-bottom: var(--space-4);">
          <h4>Lesson Activities</h4>
          <p style="white-space: pre-wrap;">${plan.activities}</p>
        </div>

        ${plan.assessment ? `
          <div style="margin-bottom: var(--space-4);">
            <h4>Assessment Method</h4>
            <p>${plan.assessment}</p>
          </div>
        ` : ''}

        ${plan.homework ? `
          <div style="margin-bottom: var(--space-4);">
            <h4>Homework/Follow-up</h4>
            <p>${plan.homework}</p>
          </div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="teacherPortalModule.editLessonPlan('${planId}'); closeModal();">Edit</button>
      </div>
    `, 'large');
  },

  editLessonPlan(planId) {
    const plan = this.getLessonPlanById(planId);
    if (!plan) return;

    showModal('Edit Lesson Plan', `
      <form id="edit-lesson-plan-form" onsubmit="teacherPortalModule.updateLessonPlan(event, '${planId}')">
        <div class="form-group">
          <label class="form-label">Lesson Title</label>
          <input type="text" name="title" class="form-input" required value="${plan.title}">
        </div>
        
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Subject</label>
            <input type="text" name="subject" class="form-input" required value="${plan.subject}">
          </div>
          <div class="form-group">
            <label class="form-label">Class</label>
            <select name="class" class="form-select" required>
              ${this.getTeacherClasses().map(cls => `
                <option value="${cls.grade}-${cls.section}" ${plan.class === `${cls.grade}-${cls.section}` ? 'selected' : ''}>
                  ${cls.grade}-${cls.section}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" name="date" class="form-input" required value="${plan.date}">
          </div>
          <div class="form-group">
            <label class="form-label">Duration</label>
            <input type="text" name="duration" class="form-input" required value="${plan.duration}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Learning Objectives</label>
          <textarea name="objectives" class="form-textarea" rows="3" required>${plan.objectives}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Materials Needed</label>
          <textarea name="materials" class="form-textarea" rows="2">${plan.materials || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Lesson Activities</label>
          <textarea name="activities" class="form-textarea" rows="4" required>${plan.activities}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Assessment Method</label>
          <textarea name="assessment" class="form-textarea" rows="2">${plan.assessment || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Homework/Follow-up</label>
          <textarea name="homework" class="form-textarea" rows="2">${plan.homework || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <option value="planned" ${plan.status === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="in-progress" ${plan.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${plan.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Update Lesson Plan</button>
        </div>
      </form>
    `, 'large');
  },

  async updateLessonPlan(event, planId) {
    event.preventDefault();
    const formData = new FormData(event.target);

    await dataManager.update('lessonPlans', planId, {
      title: formData.get('title'),
      subject: formData.get('subject'),
      class: formData.get('class'),
      date: formData.get('date'),
      duration: formData.get('duration'),
      objectives: formData.get('objectives'),
      materials: formData.get('materials'),
      activities: formData.get('activities'),
      assessment: formData.get('assessment'),
      homework: formData.get('homework'),
      status: formData.get('status')
    });
    closeModal();
    showToast('Lesson plan updated successfully!', 'success');
    this.switchTab('lessons');
  },

  async deleteLessonPlan(planId) {
    if (!confirm('Are you sure you want to delete this lesson plan?')) return;

    await dataManager.delete('lessonPlans', planId);

    showToast('Lesson plan deleted successfully!', 'success');
    this.switchTab('lessons');
  },

  // ============================================
  // MY STUDENTS TAB
  // ============================================
  _renderStudents() {
    const classes = this.getTeacherClasses();
    const filter  = this._classFilter || 'all';

    if (classes.length === 0) {
      return `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:60px 20px;text-align:center;">
          <div style="font-size:3rem;margin-bottom:12px;">🎓</div>
          <h3 style="font-size:1.05rem;font-weight:700;color:#0f172a;margin-bottom:8px;">No Classes Assigned</h3>
          <p style="color:#64748b;font-size:0.88rem;">Contact the administrator to assign classes to your account.</p>
        </div>`;
    }

    // Build unified student list based on filter
    let students = [];
    if (filter === 'all') {
      const seen = new Set();
      classes.forEach(cls => {
        this.getStudentsByClass(cls.id).forEach(s => {
          if (!seen.has(s.id)) { seen.add(s.id); students.push({ ...s, _cls: cls }); }
        });
      });
    } else {
      const cls = classes.find(c => c.id === filter);
      if (cls) students = this.getStudentsByClass(cls.id).map(s => ({ ...s, _cls: cls }));
    }

    const activeCount   = students.filter(s => s.status === 'active').length;
    const inactiveCount = students.length - activeCount;

    return `
      <!-- Summary bar -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        ${[
          { label:'Total Students', value: students.length,  bg:'#eef2ff', c:'#6366f1' },
          { label:'Active',         value: activeCount,       bg:'#f0fdf4', c:'#10b981' },
          { label:'Inactive',       value: inactiveCount,     bg:'#fff7ed', c:'#f59e0b' },
        ].map(s => `
          <div style="padding:10px 18px;background:${s.bg};border-radius:12px;display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.15rem;font-weight:800;color:${s.c};">${s.value}</span>
            <span style="font-size:0.78rem;font-weight:600;color:${s.c};">${s.label}</span>
          </div>`).join('')}
      </div>

      <!-- Class filter tabs -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
        <button onclick="teacherPortalModule.setClassFilter('all')"
          style="padding:6px 14px;border-radius:20px;border:none;cursor:pointer;font-size:0.8rem;font-weight:600;transition:all 0.15s;
          ${filter==='all' ? 'background:#3b82f6;color:white;' : 'background:#f1f5f9;color:#64748b;'}">All</button>
        ${classes.map(c => `
          <button onclick="teacherPortalModule.setClassFilter('${c.id}')"
            style="padding:6px 14px;border-radius:20px;border:none;cursor:pointer;font-size:0.8rem;font-weight:600;transition:all 0.15s;
            ${filter===c.id ? 'background:#3b82f6;color:white;' : 'background:#f1f5f9;color:#64748b;'}">
            Grade ${c.grade}${c.section ? '-'+c.section : ''}
          </button>`).join('')}
      </div>

      <!-- Student grid -->
      ${students.length === 0 ? `
        <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:40px;text-align:center;">
          <div style="font-size:2rem;margin-bottom:8px;">👤</div>
          <p style="color:#94a3b8;font-size:0.88rem;margin:0;">No students in this class</p>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
          ${students.map(s => this._renderStudentCard(s)).join('')}
        </div>
      `}
    `;
  },

  _renderStudentCard(student) {
    const cls       = student._cls || {};
    const statusC   = student.status === 'active' ? '#10b981' : '#94a3b8';
    const statusBg  = student.status === 'active' ? '#f0fdf4' : '#f8fafc';
    return `
      <div style="background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px;transition:box-shadow 0.2s;cursor:pointer;"
        onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow=''"
        onclick="teacherPortalModule.viewStudentDetail('${student.id}')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="width:44px;height:44px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">${student.photo || '👤'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;color:#0f172a;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${student.name}</div>
            <div style="font-size:0.72rem;color:#94a3b8;">Roll: ${student.roll_no || student.rollNo || '—'}</div>
          </div>
          <span style="font-size:0.68rem;font-weight:600;color:${statusC};background:${statusBg};padding:2px 8px;border-radius:20px;white-space:nowrap;">${student.status || 'active'}</span>
        </div>
        <div style="font-size:0.75rem;color:#64748b;margin-bottom:10px;">
          Grade ${cls.grade || student.grade || '?'}${cls.section || student.section ? '-'+(cls.section||student.section) : ''}
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="event.stopPropagation();teacherPortalModule.viewClassRoster('${cls.id}')"
            style="flex:1;padding:5px 8px;background:#f1f5f9;border:none;border-radius:8px;font-size:0.75rem;font-weight:600;color:#475569;cursor:pointer;"
            onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
            📋 Roster
          </button>
          <button onclick="event.stopPropagation();teacherPortalModule.switchTab('grades')"
            style="flex:1;padding:5px 8px;background:#eff6ff;border:none;border-radius:8px;font-size:0.75rem;font-weight:600;color:#3b82f6;cursor:pointer;"
            onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
            📝 Grades
          </button>
        </div>
      </div>`;
  },

  setClassFilter(classId) {
    this._classFilter = classId;
    const el = document.getElementById('tp-tab-content');
    if (el) el.innerHTML = this._renderStudents();
  },

  viewStudentDetail(studentId) {
    const student = (dataManager?.getAll('students') || []).find(s => s.id === studentId);
    if (!student) return;
    const grades = (dataManager?.getAll('grades') || []).filter(g => (g.studentId || g.student_id) === studentId).slice(-5).reverse();
    showModal(`${student.name} — Profile`, `
      <div style="padding:4px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:12px;">
          <div style="width:56px;height:56px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:1.8rem;">${student.photo || '👤'}</div>
          <div>
            <div style="font-weight:700;font-size:1rem;color:#0f172a;">${student.name}</div>
            <div style="font-size:0.82rem;color:#64748b;">Grade ${student.grade || '?'}-${student.section || '?'} &bull; Roll: ${student.roll_no || student.rollNo || '—'}</div>
            <span style="font-size:0.72rem;font-weight:600;color:${student.status==='active'?'#10b981':'#94a3b8'};background:${student.status==='active'?'#f0fdf4':'#f8fafc'};padding:2px 8px;border-radius:20px;">${student.status}</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
          ${[
            { label:'Guardian',   value: student.guardianName || student.guardian_name || '—' },
            { label:'Phone',      value: student.phone || student.guardianPhone || '—'       },
            { label:'Attendance', value: (student.attendance || 0) + '%'                     },
            { label:'Email',      value: student.email || student.guardianEmail || '—'       },
          ].map(r => `
            <div style="padding:10px 14px;background:#f8fafc;border-radius:10px;">
              <div style="font-size:0.72rem;font-weight:600;color:#94a3b8;margin-bottom:3px;">${r.label.toUpperCase()}</div>
              <div style="font-size:0.85rem;font-weight:600;color:#0f172a;">${r.value}</div>
            </div>`).join('')}
        </div>
        ${grades.length > 0 ? `
          <div>
            <div style="font-size:0.82rem;font-weight:700;color:#0f172a;margin-bottom:10px;">Recent Grades</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${grades.map(g => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8fafc;border-radius:8px;">
                  <div style="flex:1;font-size:0.82rem;font-weight:600;color:#374151;">${g.subject || 'Subject'}</div>
                  <div style="font-size:0.82rem;color:#64748b;">${g.score || '—'}/${g.totalMarks || g.total_marks || 100}</div>
                  <span class="badge badge-${this.getGradeBadgeType(g.grade)}">${g.grade || '—'}</span>
                </div>`).join('')}
            </div>
          </div>` : `<p style="color:#94a3b8;font-size:0.85rem;text-align:center;">No grades recorded yet.</p>`}
      </div>
    `, 'medium');
  },

  renderMyClasses() { return this._renderStudents(); },

  renderClassCard(cls) {
    const students = this.getStudentsByClass(cls.id);
    const avgAttendance = this.getClassAttendanceAverage(cls.id);

    return `
      <div class="card">
        <div class="card-body">
          <h3 style="margin: 0 0 var(--space-2) 0;">Grade ${cls.grade}-${cls.section}</h3>
          <div class="text-secondary" style="margin-bottom: var(--space-4);">
            Room ${cls.room} • ${students.length} students
          </div>

          <div style="display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4);">
            <div style="display: flex; justify-content: space-between;">
              <span class="text-secondary">Avg. Attendance:</span>
              <strong>${avgAttendance}%</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span class="text-secondary">Class Teacher:</span>
              <strong>${cls.classTeacher}</strong>
            </div>
          </div>

          <div style="display: flex; gap: var(--space-2);">
            <button class="btn btn-sm btn-primary" onclick="teacherPortalModule.viewClassDetails('${cls.id}')">
              View Details
            </button>
            <button class="btn btn-sm btn-ghost" onclick="teacherPortalModule.viewClassRoster('${cls.id}')">
              Roster
            </button>
          </div>
        </div>
      </div>
    `;
  },

  viewClassDetails(classId) {
    const cls = this.getTeacherClasses().find(c => c.id === classId);
    const students = this.getStudentsByClass(classId);

    showModal(`Grade ${cls.grade}-${cls.section} Details`, `
      <div class="modal-body">
        <div style="margin-bottom: var(--space-4);">
          <h4>Class Information</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div>
              <div class="text-secondary">Room</div>
              <div><strong>${cls.room}</strong></div>
            </div>
            <div>
              <div class="text-secondary">Total Students</div>
              <div><strong>${students.length}</strong></div>
            </div>
            <div>
              <div class="text-secondary">Class Teacher</div>
              <div><strong>${cls.classTeacher}</strong></div>
            </div>
            <div>
              <div class="text-secondary">Average Attendance</div>
              <div><strong>${this.getClassAttendanceAverage(classId)}%</strong></div>
            </div>
          </div>
        </div>

        <div>
          <h4>Quick Actions</h4>
          <div style="display: flex; flex-direction: column; gap: var(--space-2);">
            <button class="btn btn-ghost" onclick="teacherPortalModule.selectedClass='${classId}'; teacherPortalModule.switchTab('grades'); closeModal();">
              Enter Grades
            </button>
            <button class="btn btn-ghost" onclick="teacherPortalModule.viewClassRoster('${classId}');">
              View Student Roster
            </button>
          </div>
        </div>
      </div>
    `);
  },

  viewClassRoster(classId) {
    const students = this.getStudentsByClass(classId);
    const cls = this.getTeacherClasses().find(c => c.id === classId);

    showModal(`${cls.grade}-${cls.section} Student Roster`, `
      <div class="modal-body">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Name</th>
                <th>Attendance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${students.map(student => `
                <tr>
                  <td>${student.roll_no || student.rollNo || '—'}</td>
                  <td>
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                      <div style="font-size: var(--font-size-2xl);">${student.photo || '👤'}</div>
                      <div>${student.name}</div>
                    </div>
                  </td>
                  <td>${student.attendance || 0}%</td>
                  <td><span class="badge badge-${student.status === 'active' ? 'success' : 'secondary'}">${student.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `, 'large');
  },

  viewAllStudents() {
    this.switchTab('classes');
  },

  // ============================================
  // HELPER METHODS
  // ============================================
  getTeacherClasses() {
    if (!this.currentTeacher) return [];

    // Build a deduplicated grade+section list from three sources
    // (mirrors _getAvailableClasses in class-schedule.js)
    const seen = new Set();
    const list = [];
    const add = (grade, section, extra = {}) => {
      const key = `${grade}|${section}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ id: key, grade, section, ...extra });
    };

    // 1. Explicit classes table entries assigned to this teacher
    (dataManager?.getAll('classes') || []).forEach((cls, i) => {
      if (!cls.grade || !cls.section) return;
      const assignedToMe =
        cls.teacherId === this.currentTeacher.id ||
        cls.teacher_id === this.currentTeacher.id ||
        cls.teacher === this.currentTeacher.name;
      if (assignedToMe) add(cls.grade, cls.section, { ...cls, id: cls.id || `class-${i}` });
    });

    // 2. schoolConfig grades expanded to sections
    try {
      (window.schoolConfig?.getAllGrades() || []).forEach(g => {
        (g.sections || ['A']).forEach(sec => add(g.name, sec));
      });
    } catch (e) {}

    // 3. Unique grade+section from students table
    (dataManager?.getAll('students') || []).forEach(s => {
      if (s.grade && s.section) add(s.grade, s.section);
    });

    return list;
  },

  getStudentsByClass(classId) {
    if (!classId) return [];
    const cls = this.getTeacherClasses().find(c => c.id === classId);
    if (!cls) return [];

    const allStudents = dataManager?.getAll('students') || [];
    return allStudents.filter(s => s.grade === cls.grade && s.section === cls.section);
  },

  getClassAttendanceAverage(classId) {
    const students = this.getStudentsByClass(classId);
    const total = students.reduce((sum, s) => sum + (s.attendance || 0), 0);
    return students.length > 0 ? Math.round(total / students.length) : 0;
  },

  getUpcomingAssessments() {
    const mine = dataManager?.getAll('teacherAssessments') || [];
    const admin = dataManager?.getAll('assessments') || [];
    const myClasses = this.getTeacherClasses();
    const classKeys = new Set(myClasses.map(c => `${c.grade}|${c.section}`));
    const adminForMe = admin.filter(a => classKeys.has(`${a.grade}|${a.section}`));
    const all = [...mine, ...adminForMe];
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return all.filter(a => {
      const d = new Date(a.date);
      return d >= today && d <= nextWeek;
    });
  },


  getTeacherAssessments() {
    return dataManager?.getAll('teacherAssessments') || [];
  },

  getAssessmentById(assessmentId) {
    const assessments = this.getTeacherAssessments();
    return assessments.find(a => a.id === assessmentId);
  },

  getGradesForAssessment(assessmentId) {
    // Check pending (unsaved) grades first
    if (this._pendingGrades?.[assessmentId]) {
      return this._pendingGrades[assessmentId];
    }
    // Otherwise read from Supabase via dataManager
    const allGrades = dataManager?.getAll('grades') || [];
    return allGrades.filter(g => (g.assessmentId || g.assessment_id) === assessmentId);
  },

  getLessonPlans() {
    const all = dataManager?.getAll('lessonPlans') || [];
    if (!this.currentTeacher) return all;
    const myId = this.currentTeacher.id;
    const filtered = all.filter(p => p.teacher_id === myId || p.teacherId === myId);
    return filtered.length > 0 ? filtered : all;
  },

  getLessonPlanById(planId) {
    const plans = this.getLessonPlans();
    return plans.find(p => p.id === planId);
  },

  attachEventListeners() {
    // Any additional event listeners can be attached here
  },

  // ============================================
  // NOTIFICATION SYSTEM
  // ============================================
  loadNotifications() {
    const now  = new Date();
    const notifs = [];

    // 1. Upcoming assessments in next 7 days
    this.getUpcomingAssessments().forEach(a => {
      const d    = new Date(a.date);
      const diff = Math.ceil((d - now) / 86400000);
      if (diff >= 0 && diff <= 7) {
        notifs.push({
          id:   `assess-${a.id}`,
          type: 'assessment', icon: '📝',
          title: `Assessment: ${a.name || a.type || 'Untitled'}`,
          body:  `${a.subject || ''} · Grade ${a.grade || ''}${a.section ? '-'+a.section : ''} · ${diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `in ${diff} days`}`,
          time:  a.date,
          read:  diff > 2
        });
      }
    });

    // 2. New students added to my classes in the last 3 days
    const classKeys = new Set(this.getTeacherClasses().map(c => `${c.grade}-${c.section}`));
    const threeDaysAgo = new Date(now - 3 * 86400000);
    (dataManager?.getAll('students') || []).filter(s => {
      const created = new Date(s.created_at || s.createdAt || 0);
      return created >= threeDaysAgo && classKeys.has(`${s.grade}-${s.section}`);
    }).forEach(s => {
      notifs.push({
        id:   `student-${s.id}`,
        type: 'student', icon: '👤',
        title: `New Student: ${s.name}`,
        body:  `Added to Grade ${s.grade}-${s.section}`,
        time:  s.created_at || s.createdAt,
        read:  false
      });
    });

    this._notifications = notifs;
  },

  // ============================================
  // HEADER & NOTIFICATION PANEL
  // ============================================
  _renderHeader() {
    const session = authManager?.getSession();
    const unread  = (this._notifications || []).filter(n => !n.read).length;
    return `
      <div style="background:white;border-bottom:1px solid #e2e8f0;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:50;">
        <div>
          <h1 style="font-size:1.1rem;font-weight:800;color:#0f172a;margin:0;">Teacher Portal</h1>
          <p style="font-size:0.78rem;color:#64748b;margin:0;">${session?.fullName || ''}</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <button onclick="teacherPortalModule.openCalendarModal()"
            title="View Calendar"
            style="width:38px;height:38px;border-radius:10px;background:#f1f5f9;border:none;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;"
            onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">📅</button>
          <div style="position:relative;">
            <button id="tp-notif-btn" onclick="teacherPortalModule.toggleNotifications()"
              title="Notifications"
              style="width:38px;height:38px;border-radius:10px;background:#f1f5f9;border:none;cursor:pointer;font-size:1.1rem;display:flex;align-items:center;justify-content:center;"
              onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">🔔</button>
            ${unread > 0 ? `<span style="position:absolute;top:-4px;right:-4px;background:#ef4444;color:white;font-size:0.65rem;font-weight:700;border-radius:10px;padding:1px 5px;min-width:16px;text-align:center;pointer-events:none;">${unread}</span>` : ''}
            <div id="tp-notif-panel" style="display:none;position:absolute;right:0;top:46px;width:320px;background:white;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.12);z-index:200;overflow:hidden;">
              <div style="padding:14px 16px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;color:#0f172a;font-size:0.9rem;">Notifications</span>
                ${(this._notifications || []).some(n => !n.read) ? `<button onclick="teacherPortalModule.markAllRead()" style="font-size:0.75rem;color:#3b82f6;background:none;border:none;cursor:pointer;font-weight:600;">Mark all read</button>` : ''}
              </div>
              <div style="max-height:340px;overflow-y:auto;">
                ${(this._notifications || []).length === 0 ? `
                  <div style="text-align:center;padding:28px 16px;">
                    <div style="font-size:2rem;margin-bottom:6px;">🎉</div>
                    <p style="color:#94a3b8;font-size:0.85rem;margin:0;">All caught up!</p>
                  </div>
                ` : (this._notifications || []).map(n => `
                  <div style="padding:12px 16px;border-bottom:1px solid #f8fafc;display:flex;gap:10px;align-items:flex-start;${n.read ? '' : 'background:#f0f9ff;'}">
                    <div style="font-size:1.05rem;flex-shrink:0;margin-top:1px;">${n.icon}</div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:600;color:#0f172a;font-size:0.82rem;">${n.title}</div>
                      <div style="font-size:0.74rem;color:#64748b;margin-top:2px;">${n.body}</div>
                    </div>
                    ${!n.read ? `<div style="width:6px;height:6px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:5px;"></div>` : ''}
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  toggleNotifications() {
    this._notifOpen = !this._notifOpen;
    const panel = document.getElementById('tp-notif-panel');
    if (panel) panel.style.display = this._notifOpen ? 'block' : 'none';
  },

  markAllRead() {
    (this._notifications || []).forEach(n => { n.read = true; });
    const panel = document.getElementById('tp-notif-panel');
    if (panel) {
      const badge = document.querySelector('#tp-notif-btn + span');
      if (badge) badge.remove();
      panel.querySelector('button[onclick*="markAllRead"]')?.remove();
      panel.querySelectorAll('[style*="background:#f0f9ff"]').forEach(el => el.style.background = '');
      panel.querySelectorAll('[style*="background:#3b82f6"]').forEach(el => el.remove());
    }
  },

  _attachNotifListener() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#tp-notif-btn') && !e.target.closest('#tp-notif-panel')) {
        const panel = document.getElementById('tp-notif-panel');
        if (panel && panel.style.display !== 'none') {
          panel.style.display = 'none';
          this._notifOpen = false;
        }
      }
    }, { once: true });
  },

  // ============================================
  // CALENDAR WIDGET
  // ============================================
  renderMiniCalendar() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    // Build event map: day → set of types
    const eventMap = {};
    const mark = (dateStr, type) => {
      const d = new Date(dateStr);
      if (!dateStr || d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      if (!eventMap[day]) eventMap[day] = new Set();
      eventMap[day].add(type);
    };
    this.getUpcomingAssessments().forEach(a => a.date && mark(a.date, 'assessment'));
    (dataManager?.getAll('schoolSchedules') || []).forEach(s => s.date && mark(s.date, 'schedule'));

    const firstDay     = new Date(year, month, 1).getDay();
    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const monthName    = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += `<div></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today;
      const events  = eventMap[day];
      cells += `
        <div onclick="teacherPortalModule.openCalendarModal(${day})"
          title="${day} ${monthName}"
          style="width:32px;height:32px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:0.8rem;font-weight:${isToday?'700':'400'};position:relative;margin:auto;
          ${isToday ? 'background:#3b82f6;color:white;' : 'color:#374151;'}
          transition:background 0.1s;"
          onmouseover="${isToday ? '' : "this.style.background='#f1f5f9'"}"
          onmouseout="${isToday ? '' : "this.style.background=''"}">
          ${day}
          ${events ? `<div style="display:flex;gap:2px;position:absolute;bottom:3px;">${[...events].map(t => `<div style="width:4px;height:4px;border-radius:50%;background:${t==='assessment'?'#ef4444':'#6366f1'};"></div>`).join('')}</div>` : ''}
        </div>`;
    }

    return `
      <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <h3 style="font-size:0.92rem;font-weight:700;color:#0f172a;margin:0;">🗓 ${monthName}</h3>
          <button onclick="teacherPortalModule.openCalendarModal()" style="font-size:0.75rem;color:#3b82f6;background:none;border:none;cursor:pointer;font-weight:600;">Expand →</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px;text-align:center;">
          ${['S','M','T','W','T','F','S'].map(d => `<div style="font-size:0.68rem;font-weight:600;color:#94a3b8;padding:3px 0;">${d}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">
          ${cells}
        </div>
        <div style="display:flex;gap:14px;margin-top:10px;">
          <div style="display:flex;align-items:center;gap:5px;font-size:0.72rem;color:#64748b;">
            <div style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></div> Assessment
          </div>
          <div style="display:flex;align-items:center;gap:5px;font-size:0.72rem;color:#64748b;">
            <div style="width:6px;height:6px;border-radius:50%;background:#6366f1;"></div> Schedule
          </div>
        </div>
      </div>`;
  },

  openCalendarModal(highlightDay = null) {
    const now  = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const assessments = this.getTeacherAssessments();
    const schedules   = dataManager?.getAll('schoolSchedules') || [];

    // Build per-day event lists
    const dayEvents = {};
    const addEvent  = (dateStr, label, color) => {
      const d = new Date(dateStr);
      if (!dateStr || d.getFullYear() !== year || d.getMonth() !== month) return;
      const day = d.getDate();
      if (!dayEvents[day]) dayEvents[day] = [];
      dayEvents[day].push({ label, color });
    };
    assessments.forEach(a => a.date && addEvent(a.date, `📝 ${a.name||a.type||'Assessment'} (${a.subject||''})`, '#fef2f2'));
    schedules.forEach(s => s.date && addEvent(s.date, `📅 ${s.subject||''} - ${s.className||''}`, '#eef2ff'));

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName   = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const todayDate   = now.getDate();

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += `<td style="padding:6px;vertical-align:top;min-height:80px;"></td>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === todayDate;
      const isHL    = day === highlightDay;
      const events  = dayEvents[day] || [];
      if ((day + firstDay - 1) % 7 === 0 && day > 1) cells += '</tr><tr>';
      cells += `
        <td style="padding:6px;vertical-align:top;min-height:80px;border:1px solid #f1f5f9;border-radius:8px;${isHL?'background:#eff6ff;':''}" >
          <div style="font-size:0.82rem;font-weight:${isToday?'800':'500'};color:${isToday?'white':'#374151'};
            ${isToday?'background:#3b82f6;':''}width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:4px;">${day}</div>
          ${events.map(ev => `<div style="font-size:0.7rem;background:${ev.color};border-radius:4px;padding:2px 5px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.label}</div>`).join('')}
        </td>`;
      if ((day + firstDay) % 7 === 0) cells += '</tr><tr>';
    }

    showModal(`📅 ${monthName}`, `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:separate;border-spacing:3px;">
          <thead>
            <tr>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<th style="padding:8px 4px;font-size:0.78rem;font-weight:600;color:#64748b;text-align:center;">${d}</th>`).join('')}</tr>
          </thead>
          <tbody><tr>${cells}</tr></tbody>
        </table>
      </div>
      <div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:#64748b;"><div style="width:10px;height:10px;border-radius:3px;background:#fef2f2;border:1px solid #fca5a5;"></div>Assessment</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:#64748b;"><div style="width:10px;height:10px;border-radius:3px;background:#eef2ff;border:1px solid #a5b4fc;"></div>Schedule</div>
      </div>
    `, 'large');
  }
};

// Export to window
window.teacherPortalModule = teacherPortalModule;

// My Classes nav item → delegates to teacherPortalModule with Students tab active
window.myClassesModule = {
  async init(container) {
    teacherPortalModule.currentTab = 'students';
    await teacherPortalModule.init(container);
  }
};
