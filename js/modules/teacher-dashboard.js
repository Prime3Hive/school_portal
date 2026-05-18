// ============================================
// TEACHER DASHBOARD MODULE
// Dashboard for teachers showing their classes, tasks, and quick stats
// ============================================

const teacherDashboardModule = {
    currentSession: null,

    async init(container) {
        this.container = container || document.getElementById('main-content');
        this.currentSession = authManager.getSession();

        if (this._onDataChange) {
            window.removeEventListener('datamanager:change', this._onDataChange);
        }

        await dataManager.waitForReady();
        this.render();

        this._onDataChange = (e) => {
            if (['students', 'assessments', 'teacherAssessments', 'schoolSchedules', 'lessonPlans'].includes(e.detail.collection)) {
                this.render();
            }
        };
        window.addEventListener('datamanager:change', this._onDataChange);
    },

    render() {
        if (!this.container) return;
        const session = this.currentSession;
        if (!session) {
            this.container.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
                    <div style="text-align:center;padding:48px;background:white;border-radius:20px;border:1px solid #e2e8f0;max-width:420px;">
                        <div style="font-size:3rem;margin-bottom:16px;">🔒</div>
                        <h2 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin-bottom:8px;">Session Expired</h2>
                        <p style="color:#64748b;font-size:0.9rem;margin-bottom:24px;">Please log in again to continue.</p>
                        <button class="btn btn-primary" onclick="window.location.href='login.html'">Return to Login</button>
                    </div>
                </div>`;
            return;
        }

        // ── Data ──
        const students        = dataManager.getAll('students') || [];
        const teacherAssess   = dataManager.getAll('teacherAssessments') || [];
        const adminAssess     = dataManager.getAll('assessments') || [];
        const allSchedules    = dataManager.getAll('schoolSchedules') || [];
        const lessonPlans     = dataManager.getAll('lessonPlans') || [];

        const activeStudents  = students.filter(s => s.status === 'active');
        const myAssessments   = [...teacherAssess, ...adminAssess].filter(a => {
            const cb = a.teacherId || a.teacher_id || a.createdBy || a.created_by;
            return cb === session.supabaseId || cb === session.userId;
        });
        const myLessonPlans   = lessonPlans.filter(p => {
            const tid = p.teacher_id || p.teacherId;
            return !tid || tid === session.supabaseId || tid === session.userId;
        });

        // Today
        const now         = new Date();
        const days        = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const todayName   = days[now.getDay()];
        const dateStr     = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
        const hour        = now.getHours();
        const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName   = (session.fullName || 'Teacher').split(' ')[0];

        const todaySchedule = allSchedules
            .filter(s => (s.day || '').toLowerCase() === todayName.toLowerCase() && s.type === 'class')
            .sort((a, b) => (a.period || 0) - (b.period || 0));

        const upcoming = myAssessments
            .filter(a => a.date && new Date(a.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 5);

        this.container.innerHTML = `
        <div style="padding:24px;background:#f8fafc;min-height:100vh;">

          <!-- Hero Banner -->
          <div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 60%,#60a5fa 100%);border-radius:20px;padding:32px 36px;margin-bottom:24px;color:white;position:relative;overflow:hidden;">
            <div style="position:absolute;right:-30px;top:-30px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,0.06);pointer-events:none;"></div>
            <div style="position:absolute;right:80px;bottom:-50px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,0.08);pointer-events:none;"></div>
            <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:20px;">
              <div>
                <p style="font-size:0.85rem;font-weight:500;opacity:0.8;margin:0 0 6px 0;">${greeting} 👋</p>
                <h1 style="font-size:1.9rem;font-weight:800;margin:0 0 8px 0;letter-spacing:-0.03em;">${session.fullName}</h1>
                <p style="font-size:0.85rem;opacity:0.75;margin:0;">📅 ${dateStr}</p>
              </div>
              <div style="display:flex;gap:12px;flex-wrap:wrap;">
                ${[
                  { label:'Students', value: activeStudents.length, icon:'👨‍🎓' },
                  { label:'Assessments', value: myAssessments.length, icon:'📝' },
                  { label:'Lesson Plans', value: myLessonPlans.length, icon:'📚' },
                  { label:'Today', value: todaySchedule.length + ' cls', icon:'⏰' },
                ].map(s => `
                  <div style="background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);border-radius:14px;padding:14px 18px;text-align:center;min-width:76px;">
                    <div style="font-size:1.3rem;margin-bottom:4px;">${s.icon}</div>
                    <div style="font-size:1.4rem;font-weight:800;line-height:1.1;">${s.value}</div>
                    <div style="font-size:0.7rem;opacity:0.8;margin-top:3px;">${s.label}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:24px;">
            ${[
              { icon:'👥', label:'My Classes',    color:'#6366f1', bg:'#eef2ff', hash:'teacher-portal' },
              { icon:'📝', label:'Enter Grades',  color:'#0ea5e9', bg:'#f0f9ff', hash:'teacher-portal' },
              { icon:'📚', label:'Lesson Plans',  color:'#10b981', bg:'#f0fdf4', hash:'teacher-portal' },
              { icon:'📅', label:'Class Schedule',color:'#f59e0b', bg:'#fffbeb', hash:'class-schedule' },
            ].map(a => `
              <button onclick="window.location.hash='${a.hash}'"
                style="display:flex;align-items:center;gap:12px;padding:16px 18px;background:white;border:1px solid #e2e8f0;border-radius:14px;cursor:pointer;transition:all 0.2s;text-align:left;width:100%;"
                onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.09)'"
                onmouseout="this.style.transform='';this.style.boxShadow=''">
                <div style="width:40px;height:40px;border-radius:10px;background:${a.bg};display:flex;align-items:center;justify-content:center;font-size:1.15rem;flex-shrink:0;">${a.icon}</div>
                <span style="font-size:0.87rem;font-weight:600;color:#0f172a;">${a.label}</span>
              </button>
            `).join('')}
          </div>

          <!-- Main 2-col grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">

            <!-- Today's Schedule -->
            <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:22px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:0.95rem;font-weight:700;color:#0f172a;margin:0;">📅 Today's Schedule</h3>
                <span style="font-size:0.73rem;color:#64748b;background:#f1f5f9;padding:4px 10px;border-radius:20px;font-weight:500;">${todayName}</span>
              </div>
              ${todaySchedule.length === 0 ? `
                <div style="text-align:center;padding:32px 16px;">
                  <div style="font-size:2.2rem;margin-bottom:10px;">🎉</div>
                  <p style="color:#94a3b8;font-size:0.85rem;margin:0;">No classes scheduled for today</p>
                </div>
              ` : `
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${todaySchedule.map((s, i) => `
                    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f8fafc;border-radius:10px;">
                      <div style="width:28px;height:28px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:0.73rem;font-weight:700;color:#4f46e5;flex-shrink:0;">${s.period || i+1}</div>
                      <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:#0f172a;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.subject || s.title || 'Class'}</div>
                        <div style="font-size:0.72rem;color:#94a3b8;">Grade ${s.grade || '?'}${s.section ? '-'+s.section : ''}${s.room ? ' · Room '+s.room : ''}</div>
                      </div>
                      <div style="font-size:0.72rem;color:#64748b;white-space:nowrap;">${s.start_time || s.startTime || ''}</div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Upcoming Assessments -->
            <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:22px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:0.95rem;font-weight:700;color:#0f172a;margin:0;">📝 Upcoming Assessments</h3>
                <span style="font-size:0.73rem;color:#64748b;background:#f1f5f9;padding:4px 10px;border-radius:20px;font-weight:500;">${upcoming.length} pending</span>
              </div>
              ${upcoming.length === 0 ? `
                <div style="text-align:center;padding:32px 16px;">
                  <div style="font-size:2.2rem;margin-bottom:10px;">✅</div>
                  <p style="color:#94a3b8;font-size:0.85rem;margin:0;">No upcoming assessments</p>
                </div>
              ` : `
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${upcoming.map(a => {
                    const diff = Math.ceil((new Date(a.date) - now) / 86400000);
                    const dot  = diff <= 1 ? '#ef4444' : diff <= 3 ? '#f59e0b' : '#10b981';
                    const lbl  = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff}d`;
                    return `
                      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f8fafc;border-radius:10px;">
                        <div style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
                        <div style="flex:1;min-width:0;">
                          <div style="font-weight:600;color:#0f172a;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.name || a.title || a.type || 'Assessment'}</div>
                          <div style="font-size:0.72rem;color:#94a3b8;">Grade ${a.grade || '?'}${a.section ? '-'+a.section : ''}${a.subject ? ' · '+a.subject : ''}</div>
                        </div>
                        <div style="font-size:0.72rem;font-weight:600;color:${dot};white-space:nowrap;">${lbl}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          </div>

          <!-- Lesson Plans -->
          <div style="background:white;border:1px solid #e2e8f0;border-radius:16px;padding:22px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <h3 style="font-size:0.95rem;font-weight:700;color:#0f172a;margin:0;">📚 Recent Lesson Plans</h3>
              <button onclick="window.location.hash='teacher-portal'"
                style="font-size:0.78rem;color:#3b82f6;background:none;border:none;cursor:pointer;font-weight:600;padding:4px 8px;border-radius:6px;"
                onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'">
                View All →
              </button>
            </div>
            ${myLessonPlans.length === 0 ? `
              <div style="text-align:center;padding:32px 16px;">
                <div style="font-size:2.2rem;margin-bottom:10px;">📋</div>
                <p style="color:#94a3b8;font-size:0.85rem;margin:0;">No lesson plans yet. <a href="#teacher-portal" style="color:#3b82f6;text-decoration:none;font-weight:600;">Create one →</a></p>
              </div>
            ` : `
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;">
                ${myLessonPlans.slice(0, 4).map(p => {
                  const sc = p.status === 'completed' ? '#10b981' : p.status === 'in-progress' ? '#f59e0b' : '#6366f1';
                  const sb = p.status === 'completed' ? '#f0fdf4' : p.status === 'in-progress' ? '#fffbeb' : '#eef2ff';
                  return `
                    <div style="padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fafafa;transition:box-shadow 0.2s;"
                      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.07)'" onmouseout="this.style.boxShadow=''">
                      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px;">
                        <div style="font-weight:600;color:#0f172a;font-size:0.85rem;line-height:1.35;flex:1;">${p.title || 'Untitled'}</div>
                        <span style="font-size:0.68rem;font-weight:600;color:${sc};background:${sb};padding:2px 8px;border-radius:20px;white-space:nowrap;">${p.status || 'planned'}</span>
                      </div>
                      <div style="font-size:0.75rem;color:#94a3b8;">${p.subject || ''}${p.class ? ' · '+p.class : ''}</div>
                      ${p.date ? `<div style="font-size:0.72rem;color:#cbd5e1;margin-top:5px;">📅 ${p.date}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

        </div>`;
    }
};

window.teacherDashboardModule = teacherDashboardModule;
