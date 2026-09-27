// ============================================
// TEACHER · TODAY
// ============================================
// A teacher's home page: marks still to enter, today's lessons, and what is
// coming up. The overview it replaces filled an empty timetable with four
// invented Mathematics lessons; this page shows only what the timetable
// holds, and says so when it holds nothing.
// ============================================

const teacherTodayModule = {
  async init(container) {
    this.container = container;
    if (dataManager?.waitForReady) await dataManager.waitForReady();
    this.render();
    this._onDataChange = (e) => {
      if (['grades', 'teacherAssessments', 'assessments', 'schoolSchedules', 'students', 'classes', 'staff'].includes(e.detail?.collection)) this.render();
    };
    window.removeEventListener('datamanager:change', this._onDataChange);
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  cleanup() {
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
  },

  esc(v) {
    return window.escapeHtml ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  },

  plural(n, one, many) {
    return `${n} ${n === 1 ? one : (many || one + 's')}`;
  },

  /** The signed-in teacher's staff record, matched on their login. */
  teacher() {
    const session = window.authManager?.getSession?.() || {};
    const staff = dataManager.getAll('staff') || [];
    const rec = staff.find(s => (s.authId || s.auth_id) && (s.authId || s.auth_id) === session.supabaseId);
    return { id: rec?.id || null, name: rec?.name || session.fullName || '', session };
  },

  mine(a, t) {
    const lower = (v) => String(v || '').trim().toLowerCase();
    return [a.teacherId, a.teacher_id].some(v => v && (v === t.id || v === t.session.userId || v === t.session.supabaseId)) ||
      (t.name && lower(a.teacherName || a.teacher_name) === lower(t.name));
  },

  studentsOf(a) {
    return (dataManager.getAll('students') || []).filter(s =>
      String(s.status || 'active').toLowerCase() === 'active' && s.grade === a.grade && (!a.section || s.section === a.section));
  },

  data() {
    const t = this.teacher();
    const lower = (v) => String(v || '').trim().toLowerCase();

    const assessments = (dataManager.getAll('teacherAssessments') || []).filter(a => this.mine(a, t));
    const graded = new Map();
    (dataManager.getAll('grades') || []).forEach(g => {
      const id = g.assessmentId || g.assessment_id;
      graded.set(id, (graded.get(id) || 0) + 1);
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const soon = new Date(today); soon.setDate(soon.getDate() + 14);
    const at = (a) => { const d = new Date(a.date); return Number.isNaN(d.getTime()) ? null : d; };

    const toMark = assessments
      .filter(a => { const d = at(a); return !d || d <= new Date(); })
      .map(a => { const total = this.studentsOf(a).length; return { a, total, done: Math.min(total, graded.get(a.id) || 0) }; })
      .filter(x => x.total > x.done)
      .sort((x, y) => String(y.a.date || '').localeCompare(String(x.a.date || '')));

    const upcoming = assessments
      .filter(a => { const d = at(a); return d && d > new Date() && d <= soon; })
      .sort((x, y) => String(x.date).localeCompare(String(y.date)));

    const dayName = today.toLocaleDateString('en-GB', { weekday: 'long' });
    const lessons = (dataManager.getAll('schoolSchedules') || [])
      .filter(s => lower(s.day) === lower(dayName) && t.name && lower(s.teacher) === lower(t.name))
      .filter(s => String(s.status || 'active').toLowerCase() !== 'inactive')
      .sort((x, y) => String(x.start_time || x.startTime || '').localeCompare(String(y.start_time || y.startTime || '')));

    // Classes: the ones they are class teacher of, teach on the timetable, or assess.
    const classes = new Map();
    const addClass = (grade, section, why) => { if (!grade) return; const k = `${grade}|${section || ''}`; if (!classes.has(k)) classes.set(k, { grade, section, why }); };
    (dataManager.getAll('classes') || []).forEach(c => { if (t.name && lower(c.classTeacher || c.class_teacher) === lower(t.name)) addClass(c.grade, c.section, 'Class teacher'); });
    (dataManager.getAll('schoolSchedules') || []).forEach(s => { if (t.name && lower(s.teacher) === lower(t.name)) addClass(s.grade, s.section, 'On your timetable'); });
    assessments.forEach(a => addClass(a.grade, a.section, 'You set work'));
    const pupils = [...classes.values()].reduce((n, c) => n + this.studentsOf(c).length, 0);

    return { t, assessments, toMark, upcoming, lessons, classes: [...classes.values()], pupils, dayName };
  },

  openScores(assessmentId) {
    if (window.teacherScoresModule) window.teacherScoresModule.assessmentId = assessmentId;
    window.app?.loadModule('teacher-scores');
  },

  render() {
    if (!this.container) return;
    if (window.app?.currentModule && window.app.currentModule !== 'teacher-today') return;

    const d = this.data();
    const now = new Date();
    const h = now.getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const first = (d.t.name || '').trim().split(/\s+/).filter(w => !/^(mr|mrs|ms|miss|dr)\.?$/i.test(w))[0] || '';
    const term = [window.schoolConfig?.getCurrentAcademicYear?.(), window.schoolConfig?.getCurrentTerm?.()?.name].filter(Boolean).join(', ');
    const missing = d.toMark.reduce((n, x) => n + (x.total - x.done), 0);
    const time = (v) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const hh = +m[1]; return `${((hh + 11) % 12) + 1}:${m[2]} ${hh < 12 ? 'am' : 'pm'}`; };

    const kpi = (label, value, sub) => `
      <div class="ui-card ui-kpi" style="cursor:default;">
        <span class="ui-kpi-label">${label}</span><span class="ui-kpi-value">${value}</span><span class="ui-kpi-sub">${sub}</span>
      </div>`;

    this.container.innerHTML = `
      <div class="ui-page">
        <div class="ui-page-head">
          <div>
            <h1 class="ui-page-title">${greet}${first ? ', ' + this.esc(first) : ''}</h1>
            <p class="ui-page-sub">${this.esc(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}${term ? ' · ' + this.esc(term) : ''}</p>
          </div>
          <div class="ui-actions">
            <button type="button" class="ui-btn" onclick="window.app.loadModule('academics', { tab: 'assessments' })">New assessment</button>
            <button type="button" class="ui-btn ui-btn-primary" onclick="window.app.loadModule('teacher-scores')">Enter scores</button>
          </div>
        </div>

        <div class="ui-grid-4">
          ${kpi('Lessons today', String(d.lessons.length), d.lessons.length ? `First at ${this.esc(time(d.lessons[0].start_time || d.lessons[0].startTime) || 'a time not set')}` : 'None on your timetable')}
          ${kpi('Your classes', String(d.classes.length), `${this.plural(d.pupils, 'pupil')}`)}
          ${kpi('Marks to enter', String(missing), d.toMark.length ? `across ${this.plural(d.toMark.length, 'assessment')}` : 'All caught up')}
          ${kpi('Coming up', String(d.upcoming.length), 'assessments in the next two weeks')}
        </div>

        <div class="ui-grid-3">
          <section class="ui-card ui-span-2" aria-labelledby="tt-mark" style="padding-bottom:8px;">
            <div class="ui-card-head">
              <h2 class="ui-card-title" id="tt-mark">Marks to enter</h2>
              ${d.toMark.length ? '<span class="ui-card-note">Newest first</span>' : ''}
            </div>
            ${d.toMark.length ? d.toMark.slice(0, 6).map(x => `
              <div class="ui-row">
                <span class="ui-dot ${x.done ? 'is-info' : 'is-warn'}" aria-hidden="true"></span>
                <div class="ui-row-main">
                  <div class="ui-row-title">${this.esc([[x.a.grade, x.a.section].filter(Boolean).join(' '), x.a.subject].filter(Boolean).join(' · '))}</div>
                  <div class="ui-row-meta">${this.esc(x.a.name || x.a.title || 'Assessment')} · ${x.done} of ${x.total} marked</div>
                </div>
                <button type="button" class="ui-btn ui-btn-sm" onclick="teacherTodayModule.openScores('${this.esc(x.a.id)}')">${x.done ? 'Continue' : 'Start'}</button>
              </div>`).join('')
            : `<p class="ui-empty">${d.assessments.length ? 'Every assessment you have set is fully marked.' : 'You have not set any assessments yet. Create one to start entering marks.'}</p>`}
          </section>

          <section class="ui-card" aria-labelledby="tt-day">
            <div class="ui-card-head"><h2 class="ui-card-title" id="tt-day">${this.esc(d.dayName)}</h2></div>
            ${d.lessons.length ? d.lessons.map((l, i) => `
              <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:10px 0;">
                <div class="tt-time">${this.esc(time(l.start_time || l.startTime) || '—')}</div>
                <div class="ui-row-main">
                  <div class="ui-row-title" style="font-size:0.875rem;">${this.esc(l.subject || l.title || 'Lesson')}</div>
                  <div class="ui-row-meta">${this.esc([[l.grade, l.section].filter(Boolean).join(' '), l.room ? 'Room ' + l.room : ''].filter(Boolean).join(' · '))}</div>
                </div>
              </div>`).join('')
            : `<p class="ui-empty">Nothing on your timetable for ${this.esc(d.dayName)}. If that is wrong, ask the office to add your lessons under your name.</p>`}
          </section>
        </div>

        <div class="ui-grid-3">
          <section class="ui-card ui-span-2" aria-labelledby="tt-cls">
            <div class="ui-card-head">
              <h2 class="ui-card-title" id="tt-cls">Your classes</h2>
              <button type="button" class="ui-link" onclick="window.app.loadModule('my-classes')">All students</button>
            </div>
            ${d.classes.length ? `<div class="tt-classes">${d.classes.map(c => `
              <div class="tt-class">
                <strong>${this.esc([c.grade, c.section].filter(Boolean).join(' '))}</strong>
                <span class="ui-row-meta">${this.plural(this.studentsOf(c).length, 'pupil')} · ${this.esc(c.why)}</span>
              </div>`).join('')}</div>`
            : '<p class="ui-empty">No classes are linked to you yet. Classes appear here when you are named as class teacher, are on the timetable, or set an assessment.</p>'}
          </section>

          <section class="ui-card" aria-labelledby="tt-up">
            <div class="ui-card-head"><h2 class="ui-card-title" id="tt-up">Coming up</h2></div>
            ${d.upcoming.length ? d.upcoming.map((a, i) => {
              const dt = new Date(a.date);
              return `
              <div class="ui-row" style="${i === 0 ? 'border-top:0;' : ''} padding:8px 0; align-items:flex-start;">
                <div class="ui-date" aria-hidden="true"><div class="ui-date-day">${dt.toLocaleDateString('en-GB', { weekday: 'short' })}</div><div class="ui-date-num">${dt.getDate()}</div></div>
                <div class="ui-row-main" style="padding-top:4px;">
                  <div class="ui-row-title" style="font-size:0.875rem;">${this.esc(a.name || a.title || 'Assessment')}</div>
                  <div class="ui-row-meta">${this.esc([[a.grade, a.section].filter(Boolean).join(' '), a.subject].filter(Boolean).join(' · '))}</div>
                </div>
              </div>`;
            }).join('') : '<p class="ui-empty">No assessments in the next two weeks.</p>'}
          </section>
        </div>
      </div>`;
  }
};

window.teacherTodayModule = teacherTodayModule;
