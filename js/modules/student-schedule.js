// ============================================
// STUDENT SCHEDULE MODULE
// Weekly timetable and class schedule
// ============================================

const studentScheduleModule = {
  currentSession: null,
  studentData: null,
  currentDay: null,

  async init(container) {
    this.currentSession = authManager.getSession();

    if (!container) {
      container = document.getElementById('main-content');
    }
    this._container = container;

    await dataManager.waitForReady();
    this.loadStudentData();
    this.currentDay = this.getCurrentDay();
    container.innerHTML = this.render();

    // FIX BUG #8: Remove old listener before adding new one to prevent duplicates
    if (this._onDataChange) {
      window.removeEventListener('datamanager:change', this._onDataChange);
    }
    this._onDataChange = (e) => {
      if (['studentSchedules', 'schoolSchedules'].includes(e.detail.collection)) {
        this.loadStudentData();
        this._container.innerHTML = this.render();
        this.attachEvents();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  loadStudentData() {
    // session.userId = school_id (e.g. STU-2026-001), session.supabaseId = UUID
    const schoolId = this.currentSession?.userId;
    const supabaseId = this.currentSession?.supabaseId;

    // Find the student record by auth_id (UUID) first
    const students = dataManager.getAll('students') || [];
    const student = students.find(s => s.authId === supabaseId || s.auth_id === supabaseId)
      || students.find(s => s.id === supabaseId)
      || students.find(s => s.id === schoolId);
    
    // FIX BUG #1: Don't fallback to first student - return error instead
    if (!student) {
      console.error('[StudentSchedule] Student not found for session:', { schoolId, supabaseId });
      this.studentData = { schedule: null, error: 'Student record not found. Please contact administrator.' };
      return;
    }
    const studentUUID = student.id;

    // Get flat schedule rows from Supabase and transform into nested structure
    const allRows = dataManager.getAll('studentSchedules') || [];

    // Filter for this student using UUID (or all if no match)
    const rows = studentUUID
      ? allRows.filter(r => (r.studentId || r.student_id) === studentUUID)
      : [];

    if (rows.length === 0) {
      this.studentData = { schedule: null };
      return;
    }

    // Build nested schedule object: { Monday: [{period, subject, teacher, room, time}], ... }
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const scheduleByDay = {};
    days.forEach(d => { scheduleByDay[d] = []; });

    rows.forEach(row => {
      const day = row.day;
      if (!day || !days.includes(day)) return;
      const startTime = row.startTime || row.start_time || '';
      const endTime = row.endTime || row.end_time || '';
      scheduleByDay[day].push({
        period: row.period || scheduleByDay[day].length + 1,
        subject: row.subject || 'Unknown',
        teacher: row.teacher || '',
        room: row.room || '',
        time: startTime && endTime ? `${startTime} - ${endTime}` : ''
      });
    });

    // Sort each day by period
    days.forEach(d => {
      scheduleByDay[d].sort((a, b) => (a.period || 0) - (b.period || 0));
    });

    // Use the student already resolved above for grade/section

    this.studentData = {
      schedule: {
        grade: student?.grade || '',
        section: student?.section || '',
        academicYear: rows[0]?.academicYear || rows[0]?.academic_year || '2025-2026',
        schedule: scheduleByDay
      }
    };
  },

  getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date().getDay();
    const day = days[today];
    // Weekend: default to Monday so the timetable still shows
    if (day === 'Sunday' || day === 'Saturday') return 'Monday';
    return day;
  },

  render() {
    const { schedule, error } = this.studentData;

    // FIX BUG #2: Handle error state when student not found
    if (error) {
      return `
        <div class="module-container">
          <div class="card" style="text-align: center; padding: var(--space-10);">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
              style="margin: 0 auto var(--space-4); color: var(--color-danger); opacity: 0.5;">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h2 style="color: var(--color-danger); margin-bottom: var(--space-2);">Error Loading Student Data</h2>
            <p style="color: var(--text-secondary); margin-bottom: var(--space-4);">
              ${error}
            </p>
            <button class="btn btn-primary" onclick="window.location.reload()">
              Reload Page
            </button>
          </div>
        </div>
      `;
    }

    if (!schedule) {
      return `
        <div class="module-container">
          <div class="empty-state">
            <div class="empty-state-icon">📅</div>
            <h3 class="empty-state-title">No Schedule Available</h3>
            <p class="empty-state-description">Your class schedule has not been set up yet.</p>
          </div>
        </div>
      `;
    }

    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const todaySchedule = schedule.schedule[this.currentDay] || [];

    return `
      <div class="module-container">
        <!-- Header -->
        <div class="module-header">
          <div>
            <h1 class="module-title">📅 My Schedule</h1>
            <p class="module-subtitle">Grade ${schedule.grade}-${schedule.section} • ${schedule.academicYear}</p>
          </div>
          <button class="btn btn-primary" onclick="studentScheduleModule.downloadSchedule()">
            📄 Download Schedule
          </button>
        </div>

        <!-- Today's Schedule Highlight -->
        ${todaySchedule.length > 0 ? this.renderTodaySchedule(todaySchedule) : ''}

        <!-- Weekly Schedule Tabs -->
        <div class="card">
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
            Weekly Timetable
          </h3>
          
          <!-- Day Tabs -->
          <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border-primary); overflow-x: auto;">
            ${weekDays.map(day => `
              <button class="tab-btn ${day === this.currentDay ? 'active' : ''}" 
                      onclick="studentScheduleModule.switchDay('${day}')" 
                      id="tab-${day}">
                ${day}
              </button>
            `).join('')}
          </div>

          <!-- Day Content -->
          ${weekDays.map(day => `
            <div id="schedule-${day}" class="tab-content" style="display: ${day === this.currentDay ? 'block' : 'none'};">
              ${this.renderDaySchedule(schedule.schedule[day], day)}
            </div>
          `).join('')}
        </div>

        <!-- Weekly Overview -->
        ${this.renderWeeklyOverview(schedule.schedule, weekDays)}
      </div>
    `;
  },

  renderTodaySchedule(todaySchedule) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Find current or next class
    let currentClass = null;
    let nextClass = null;

    for (const period of todaySchedule) {
      if (period.period === 'Lunch') continue;

      // FIX BUG #6: Add proper error handling for time parsing
      try {
        if (!period.time || typeof period.time !== 'string') {
          console.warn('[Schedule] Invalid time format for period:', period);
          continue;
        }

        const [startTime] = period.time.split(' - ');
        if (!startTime) {
          console.warn('[Schedule] No start time found:', period.time);
          continue;
        }

        const timeMatch = startTime.match(/(\d+):(\d+)/);
        if (!timeMatch) {
          console.warn('[Schedule] Time does not match expected format:', startTime);
          continue;
        }

        const [hours, minutes] = timeMatch.slice(1);
        const isPM = startTime.includes('PM');
        let hour24 = parseInt(hours);
        
        // Correct 12-hour to 24-hour conversion (handles 12AM→0 and 12PM→12)
        if (isPM && hour24 !== 12) hour24 += 12;
        if (!isPM && hour24 === 12) hour24 = 0;
        
        const periodMinutes = hour24 * 60 + parseInt(minutes);

        if (periodMinutes <= currentTime && currentTime < periodMinutes + 60) {
          currentClass = period;
        } else if (periodMinutes > currentTime && !nextClass) {
          nextClass = period;
        }
      } catch (err) {
        console.error('[Schedule] Error parsing time for period:', period, err);
        continue;
      }
    }

    return `
      <div class="card mb-6" style="background: var(--gradient-primary); color: white;">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          📍 Today's Schedule (${this.currentDay})
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${currentClass ? `
            <div style="padding: var(--space-4); background: rgba(255, 255, 255, 0.2); border-radius: var(--radius-md); backdrop-filter: blur(10px);">
              <div style="font-size: var(--font-size-sm); opacity: 0.9; margin-bottom: var(--space-2);">🔴 Current Class</div>
              <div style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-1);">
                ${currentClass.subject}
              </div>
              <div style="font-size: var(--font-size-sm); opacity: 0.9;">
                ${currentClass.teacher} • ${currentClass.room}
              </div>
              <div style="font-size: var(--font-size-sm); opacity: 0.9; margin-top: var(--space-2);">
                ⏰ ${currentClass.time}
              </div>
            </div>
          ` : ''}
          
          ${nextClass ? `
            <div style="padding: var(--space-4); background: rgba(255, 255, 255, 0.2); border-radius: var(--radius-md); backdrop-filter: blur(10px);">
              <div style="font-size: var(--font-size-sm); opacity: 0.9; margin-bottom: var(--space-2);">⏭️ Next Class</div>
              <div style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); margin-bottom: var(--space-1);">
                ${nextClass.subject}
              </div>
              <div style="font-size: var(--font-size-sm); opacity: 0.9);">
                ${nextClass.teacher} • ${nextClass.room}
              </div>
              <div style="font-size: var(--font-size-sm); opacity: 0.9; margin-top: var(--space-2);">
                ⏰ ${nextClass.time}
              </div>
            </div>
          ` : ''}
          
          ${!currentClass && !nextClass ? `
            <div style="padding: var(--space-4); background: rgba(255, 255, 255, 0.2); border-radius: var(--radius-md); backdrop-filter: blur(10px);">
              <div style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold);">
                No classes at this time
              </div>
              <div style="font-size: var(--font-size-sm); opacity: 0.9; margin-top: var(--space-2);">
                Enjoy your free time! 🎉
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderDaySchedule(daySchedule, day) {
    if (!daySchedule || daySchedule.length === 0) {
      return `
        <div style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">
          <p>No classes scheduled for ${day}</p>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${daySchedule.map(period => this.renderPeriodCard(period)).join('')}
      </div>
    `;
  },

  renderPeriodCard(period) {
    const isLunch = period.period === 'Lunch';

    return `
      <div style="padding: var(--space-4); border: 1px solid var(--border-primary); border-radius: var(--radius-md); background: ${isLunch ? 'rgba(var(--color-warning-rgb), 0.05)' : 'var(--bg-secondary)'}; transition: all 0.2s;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div style="width: 40px; height: 40px; border-radius: var(--radius-md); background: var(--gradient-${isLunch ? 'warning' : 'primary'}); display: flex; align-items: center; justify-content: center; color: white; font-weight: var(--font-weight-bold);">
                ${isLunch ? '🍽️' : period.period}
              </div>
              <div>
                <strong style="font-size: var(--font-size-lg); display: block;">${period.subject}</strong>
                <span style="font-size: var(--font-size-xs); color: var(--text-secondary);">⏰ ${period.time}</span>
              </div>
            </div>
            
            ${!isLunch ? `
              <div style="display: flex; gap: var(--space-4); margin-top: var(--space-2); font-size: var(--font-size-sm); color: var(--text-secondary);">
                <span>👨‍🏫 ${period.teacher}</span>
                <span>📍 ${period.room}</span>
              </div>
            ` : `
              <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                📍 ${period.room}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  },

  renderWeeklyOverview(schedule, weekDays) {
    return `
      <div class="card" style="margin-top: var(--space-6);">
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-4);">
          Weekly Overview
        </h3>
        
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Period</th>
                ${weekDays.map(day => `<th>${day}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${this.generateWeeklyOverviewRows(schedule, weekDays)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  generateWeeklyOverviewRows(schedule, weekDays) {
    const maxPeriods = Math.max(...weekDays.map(day => schedule[day]?.length || 0));
    let rows = '';

    for (let i = 0; i < maxPeriods; i++) {
      const period = schedule[weekDays[0]]?.[i];
      const periodLabel = period?.period === 'Lunch' ? 'Lunch' : `Period ${period?.period ?? (i + 1)}`;

      const dayPeriodData = weekDays.map(day => {
        const dayPeriod = schedule[day]?.[i];
        return `
              <td style="font-size: var(--font-size-xs);">
                ${dayPeriod ? `
                  <div><strong>${dayPeriod.subject}</strong></div>
                  <div style="color: var(--text-secondary);">${dayPeriod.room}</div>
                ` : '-'}
              </td>
            `;
      }).join('');

      rows += `
        <tr>
          <td><strong>${periodLabel}</strong></td>
          ${dayPeriodData}
        </tr>
      `;
    }

    return rows;
  },

  switchDay(day) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${day}`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`schedule-${day}`).style.display = 'block';
  },

  downloadSchedule() {
    const container = document.getElementById('main-content');
    if (!container) return;

    showToast('Generating PDF...', 'info');

    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
      showToast('PDF library not loaded. Please check your connection.', 'error');
      return;
    }

    const { jsPDF } = jspdf;
    html2canvas(container, { scale: 1.5, useCORS: true, backgroundColor: '#1a1a2e' })
      .then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        const session = authManager.getSession();
        pdf.save(`schedule_${session?.userId || 'student'}_${new Date().toISOString().split('T')[0]}.pdf`);
        showToast('Schedule downloaded!', 'success');
      })
      .catch(() => showToast('Failed to generate PDF. Please try again.', 'error'));
  }
};

// Initialize module
if (typeof window !== 'undefined') {
  window.studentScheduleModule = studentScheduleModule;
  window.myScheduleModule = studentScheduleModule; // Alias for navigation
}
