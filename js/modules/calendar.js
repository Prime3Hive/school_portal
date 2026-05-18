window.calendarModule = {
  currentDate: new Date(),
  selectedDate: null,
  events: [],
  view: 'month',

  async init(container) {
    this.container = container;
    await dataManager.waitForReady();
    await this.loadEvents();
    this.render();
    if (this._onDataChange) window.removeEventListener('datamanager:change', this._onDataChange);
    this._onDataChange = async (e) => {
      if (['schoolSchedules', 'assessments'].includes(e.detail?.collection)) {
        await this.loadEvents();
        this.render();
      }
    };
    window.addEventListener('datamanager:change', this._onDataChange);
  },

  async loadEvents() {
    if (!window.supabaseReady) {
      this.events = this.getMockEvents();
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from('calendar_events')
        .select('*')
        .order('start_date', { ascending: true });

      if (error) throw error;
      this.events = data || [];
    } catch (error) {
      console.error('Error loading events:', error);
      this.events = this.getMockEvents();
    }
  },

  getMockEvents() {
    const today = new Date();
    return [
      {
        id: '1',
        title: 'First Term Begins',
        start_date: new Date(today.getFullYear(), 8, 15).toISOString(),
        end_date: new Date(today.getFullYear(), 8, 15).toISOString(),
        type: 'academic',
        description: 'Start of first term academic session'
      },
      {
        id: '2',
        title: 'Mid-Term Break',
        start_date: new Date(today.getFullYear(), 10, 1).toISOString(),
        end_date: new Date(today.getFullYear(), 10, 7).toISOString(),
        type: 'holiday',
        description: 'Mid-term break for all students'
      },
      {
        id: '3',
        title: 'Parent-Teacher Meeting',
        start_date: new Date(today.getFullYear(), today.getMonth(), 20).toISOString(),
        end_date: new Date(today.getFullYear(), today.getMonth(), 20).toISOString(),
        type: 'meeting',
        description: 'Quarterly parent-teacher conference'
      }
    ];
  },

  render() {
    this.container.innerHTML = `
      <div class="animate-fadeIn">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-8); flex-wrap: wrap; gap: var(--space-4);">
          <div>
            <h2 class="page-title" style="margin-bottom: var(--space-2);">📅 School Calendar</h2>
            <p class="page-description">View academic events, holidays, and important dates</p>
          </div>
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
            <div class="btn-group">
              <button class="btn ${this.view === 'month' ? 'btn-primary' : 'btn-secondary'}" 
                      onclick="calendarModule.setView('month')">
                Month
              </button>
              <button class="btn ${this.view === 'week' ? 'btn-primary' : 'btn-secondary'}" 
                      onclick="calendarModule.setView('week')">
                Week
              </button>
              <button class="btn ${this.view === 'list' ? 'btn-primary' : 'btn-secondary'}" 
                      onclick="calendarModule.setView('list')">
                List
              </button>
            </div>
            ${permissionManager.canPerformAction('calendar', 'create') ? `
              <button class="btn btn-primary" onclick="calendarModule.showAddEventModal()">
                <span>➕</span> Add Event
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Calendar Navigation -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6); padding: var(--space-4); background: var(--bg-secondary); border-radius: var(--radius-lg);">
          <button class="btn btn-secondary" onclick="calendarModule.previousPeriod()">
            ← Previous
          </button>
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin: 0;">
            ${this.getHeaderText()}
          </h3>
          <button class="btn btn-secondary" onclick="calendarModule.nextPeriod()">
            Next →
          </button>
        </div>

        <!-- Calendar View -->
        <div id="calendar-view">
          ${this.renderView()}
        </div>

        <!-- Upcoming Events -->
        <div class="card" style="margin-top: var(--space-8);">
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-semibold); margin-bottom: var(--space-6);">
            📌 Upcoming Events
          </h3>
          ${this.renderUpcomingEvents()}
        </div>
      </div>
    `;
  },

  renderView() {
    switch (this.view) {
      case 'month':
        return this.renderMonthView();
      case 'week':
        return this.renderWeekView();
      case 'list':
        return this.renderListView();
      default:
        return this.renderMonthView();
    }
  },

  renderMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = `
      <div class="calendar-grid" style="
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 1px;
        background: var(--border-primary);
        border: 1px solid var(--border-primary);
        border-radius: var(--radius-lg);
        overflow: hidden;
      ">
    `;

    days.forEach(day => {
      html += `
        <div style="
          padding: var(--space-3);
          background: var(--bg-tertiary);
          text-align: center;
          font-weight: var(--font-weight-semibold);
          color: var(--text-secondary);
          font-size: var(--font-size-sm);
        ">${day}</div>
      `;
    });

    for (let i = 0; i < startingDayOfWeek; i++) {
      html += `<div style="background: var(--bg-primary); min-height: 100px;"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const dayEvents = this.events.filter(e => {
        const eventStart = new Date(e.start_date).toISOString().split('T')[0];
        const eventEnd = new Date(e.end_date).toISOString().split('T')[0];
        return dateStr >= eventStart && dateStr <= eventEnd;
      });

      const isToday = date.toDateString() === new Date().toDateString();
      const isSelected = this.selectedDate && date.toDateString() === this.selectedDate.toDateString();

      html += `
        <div onclick="calendarModule.selectDate(new Date(${year}, ${month}, ${day}))" style="
          background: var(--bg-secondary);
          min-height: 100px;
          padding: var(--space-2);
          cursor: pointer;
          transition: all 0.2s;
          ${isToday ? 'border: 2px solid var(--color-primary);' : ''}
          ${isSelected ? 'background: var(--bg-tertiary);' : ''}
        " onmouseover="this.style.background='var(--bg-tertiary)'" 
           onmouseout="this.style.background='${isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)'}'">
          <div style="
            font-weight: ${isToday ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)'};
            color: ${isToday ? 'var(--color-primary)' : 'var(--text-primary)'};
            margin-bottom: var(--space-2);
          ">${day}</div>
          ${dayEvents.slice(0, 3).map(e => {
        const typeColors = {
          academic: 'var(--color-primary)',
          holiday: 'var(--color-success)',
          exam: 'var(--color-danger)',
          meeting: 'var(--color-warning)',
          event: 'var(--color-info)'
        };
        return `
              <div style="
                font-size: var(--font-size-xs);
                padding: 0.125rem 0.25rem;
                background: ${typeColors[e.type] || 'var(--color-info)'};
                color: white;
                border-radius: var(--radius-sm);
                margin-bottom: 0.125rem;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              " title="${e.title}">${e.title}</div>
            `;
      }).join('')}
          ${dayEvents.length > 3 ? `<div style="font-size: var(--font-size-xs); color: var(--text-tertiary);">+${dayEvents.length - 3} more</div>` : ''}
        </div>
      `;
    }

    html += '</div>';
    return html;
  },

  renderWeekView() {
    // Build the 7-day range for the week containing this.currentDate
    const startOfWeek = new Date(this.currentDate);
    const dow = startOfWeek.getDay(); // 0=Sun
    startOfWeek.setDate(startOfWeek.getDate() - dow);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = [];
    for (let h = 7; h <= 21; h++) {
      hours.push(h);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const typeColors = {
      academic: 'var(--color-primary)',
      holiday: 'var(--color-success)',
      exam: 'var(--color-danger)',
      meeting: 'var(--color-warning)',
      event: 'var(--color-info)'
    };

    // Helper: does an event touch a given day?
    const eventsForDay = (dayDate) => {
      const ds = dayDate.toISOString().split('T')[0];
      return this.events.filter(e => {
        const es = new Date(e.start_date).toISOString().split('T')[0];
        const ee = new Date(e.end_date).toISOString().split('T')[0];
        return ds >= es && ds <= ee;
      });
    };

    let html = `
      <div style="overflow-x:auto;">
        <div style="
          display: grid;
          grid-template-columns: 60px repeat(7, 1fr);
          min-width: 600px;
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-lg);
          overflow: hidden;
        ">
          <!-- Header row -->
          <div style="background:var(--bg-tertiary);padding:var(--space-3);border-right:1px solid var(--border-primary);"></div>
          ${days.map((d, i) => {
      const ds = d.toISOString().split('T')[0];
      const isToday = ds === todayStr;
      return `
              <div style="
                background:${isToday ? 'var(--color-primary)' : 'var(--bg-tertiary)'};
                color:${isToday ? 'white' : 'var(--text-primary)'};
                text-align:center;
                padding:var(--space-3) var(--space-2);
                font-weight:var(--font-weight-semibold);
                font-size:var(--font-size-sm);
                border-right:1px solid var(--border-primary);
              ">
                <div>${dayNames[d.getDay()]}</div>
                <div style="font-size:1.1rem;font-weight:700;">${d.getDate()}</div>
              </div>
            `;
    }).join('')}

          <!-- Time slots -->
          ${hours.map(h => {
      const label = `${String(h).padStart(2, '0')}:00`;
      return `
              <div style="
                padding:4px 6px;
                font-size:var(--font-size-xs);
                color:var(--text-tertiary);
                border-right:1px solid var(--border-primary);
                border-top:1px solid var(--border-primary);
                min-height:52px;
                display:flex;
                align-items:flex-start;
                background:var(--bg-secondary);
              ">${label}</div>
              ${days.map(d => {
        const dayEvents = eventsForDay(d);
        const ds = d.toISOString().split('T')[0];
        return `
                  <div style="
                    border-right:1px solid var(--border-primary);
                    border-top:1px solid var(--border-primary);
                    min-height:52px;
                    padding:2px 4px;
                    background:${ds === todayStr ? 'rgba(19,127,236,0.04)' : 'var(--bg-primary)'};
                    vertical-align:top;
                  ">
                    ${h === 7 ? dayEvents.map(ev => `
                      <div style="
                        font-size:0.7rem;
                        padding:2px 6px;
                        background:${typeColors[ev.type] || 'var(--color-info)'};
                        color:white;
                        border-radius:4px;
                        margin-bottom:2px;
                        overflow:hidden;
                        text-overflow:ellipsis;
                        white-space:nowrap;
                      " title="${ev.title}">${ev.title}</div>
                    `).join('') : ''}
                  </div>
                `;
      }).join('')}
            `;
    }).join('')}
        </div>
      </div>
      <p style="text-align:center;margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--text-tertiary);">
        All-day events shown in the first row. Use the list view for full details.
      </p>
    `;
    return html;
  },

  renderListView() {
    const sortedEvents = [...this.events].sort((a, b) =>
      new Date(a.start_date) - new Date(b.start_date)
    );

    if (sortedEvents.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <h3 class="empty-state-title">No Events Scheduled</h3>
          <p class="empty-state-description">There are no events in the calendar yet.</p>
        </div>
      `;
    }

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${sortedEvents.map(event => this.renderEventCard(event)).join('')}
      </div>
    `;
  },

  renderEventCard(event) {
    const typeColors = {
      academic: 'var(--color-primary)',
      holiday: 'var(--color-success)',
      exam: 'var(--color-danger)',
      meeting: 'var(--color-warning)',
      event: 'var(--color-info)'
    };

    const typeIcons = {
      academic: '📚',
      holiday: '🎉',
      exam: '📝',
      meeting: '👥',
      event: '📌'
    };

    const startDate = new Date(event.start_date);
    const endDate = new Date(event.end_date);
    const isSameDay = startDate.toDateString() === endDate.toDateString();

    return `
      <div class="card" style="border-left: 4px solid ${typeColors[event.type] || 'var(--color-info)'};">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <span style="font-size: 1.5rem;">${typeIcons[event.type] || '📌'}</span>
              <h4 style="font-weight: var(--font-weight-semibold); margin: 0;">${event.title}</h4>
            </div>
            <p style="color: var(--text-secondary); font-size: var(--font-size-sm); margin: 0;">
              ${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              ${!isSameDay ? ` - ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
            </p>
          </div>
          <span style="
            padding: 0.25rem 0.75rem;
            background: ${typeColors[event.type] || 'var(--color-info)'};
            color: white;
            border-radius: var(--radius-full);
            font-size: var(--font-size-xs);
            font-weight: var(--font-weight-semibold);
            text-transform: capitalize;
          ">${event.type}</span>
        </div>
        ${event.description ? `<p style="color: var(--text-secondary); font-size: var(--font-size-sm);">${event.description}</p>` : ''}
      </div>
    `;
  },

  renderUpcomingEvents() {
    const today = new Date();
    const upcoming = this.events
      .filter(e => new Date(e.start_date) >= today)
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
      .slice(0, 5);

    if (upcoming.length === 0) {
      return '<p style="color: var(--text-secondary);">No upcoming events</p>';
    }

    return `
      <div style="display: flex; flex-direction: column; gap: var(--space-3);">
        ${upcoming.map(event => {
      const startDate = new Date(event.start_date);
      const daysUntil = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));

      return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-md);">
              <div>
                <div style="font-weight: var(--font-weight-semibold); margin-bottom: var(--space-1);">
                  ${event.title}
                </div>
                <div style="font-size: var(--font-size-sm); color: var(--text-secondary);">
                  ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: var(--font-size-sm); color: var(--text-tertiary);">
                  ${daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`}
                </div>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  },

  getHeaderText() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  },

  setView(view) {
    this.view = view;
    this.render();
  },

  previousPeriod() {
    if (this.view === 'month') {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    } else if (this.view === 'week') {
      this.currentDate = new Date(this.currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    this.render();
  },

  nextPeriod() {
    if (this.view === 'month') {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    } else if (this.view === 'week') {
      this.currentDate = new Date(this.currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    this.render();
  },

  selectDate(date) {
    this.selectedDate = date;
    this.render();
  },

  showAddEventModal() {
    showModal('Add Calendar Event', `
      <form id="add-event-form" onsubmit="calendarModule.submitEvent(event)">
        <div class="form-group">
          <label class="form-label">Event Title *</label>
          <input type="text" name="title" class="form-input" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Date *</label>
            <input type="date" name="start_date" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label">End Date *</label>
            <input type="date" name="end_date" class="form-input" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Event Type *</label>
          <select name="type" class="form-input" required>
            <option value="academic">Academic</option>
            <option value="holiday">Holiday</option>
            <option value="exam">Exam</option>
            <option value="meeting">Meeting</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-input" rows="3"></textarea>
        </div>
        <div style="display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-6);">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Event</button>
        </div>
      </form>
    `);
  },

  async submitEvent(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const eventData = Object.fromEntries(formData);

    if (window.supabaseReady) {
      try {
        const { data, error } = await supabaseClient
          .from('calendar_events')
          .insert([eventData])
          .select()
          .single();

        if (error) throw error;
        this.events.push(data);
      } catch (error) {
        console.error('Error creating event:', error);
        showToast('Failed to create event', 'error');
        return;
      }
    } else {
      eventData.id = Date.now().toString();
      this.events.push(eventData);
    }

    showToast('Event added successfully', 'success');
    closeModal();
    this.render();
  },

  cleanup() {
    this.selectedDate = null;
  }
};
