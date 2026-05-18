const notificationManager = {
  notifications: [],
  filteredNotifications: [],
  unreadCount: 0,
  isInitialized: false,
  realtimeSubscription: null,
  panelFilter: 'all',
  preferences: {
    inAppEnabled: true,
    mutedTypes: []
  },
  _prefsKey: 'school_portal_notification_prefs',
  _historyKey: 'school_portal_notification_history',
  _historyLimit: 200,

  async init() {
    if (this.isInitialized) return;

    await this.loadPreferences();
    await this.loadNotifications();
    this.setupRealtimeSubscription();
    this.updateBadge();
    this.isInitialized = true;
  },

  async loadNotifications() {
    if (!window.supabaseReady || !authManager.isAuthenticated()) return;

    const session = authManager.getSession();
    if (!session) return;

    try {
      const { data, error } = await supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_id', session.supabaseId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      this.notifications = data || [];
      this._hydrateNotificationHistory();
      this.applyFilter();
      this.unreadCount = this.notifications.filter(n => !n.is_read).length;
      this.updateBadge();
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  },

  setupRealtimeSubscription() {
    if (!window.supabaseReady || !authManager.isAuthenticated()) return;

    const session = authManager.getSession();
    if (!session) return;

    this.realtimeSubscription = supabaseClient
      .channel(`notifications:${session.supabaseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.supabaseId}`
        },
        (payload) => {
          this.notifications.unshift(payload.new);
          this._recordHistory(payload.new);
          this.applyFilter();
          if (!payload.new.is_read) {
            this.unreadCount++;
          }
          this.updateBadge();
          if (this.shouldNotify(payload.new)) {
            this.showToastNotification(payload.new);
          }
          this.refreshOpenPanel();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.supabaseId}`
        },
        (payload) => {
          const index = this.notifications.findIndex(n => n.id === payload.new.id);
          if (index !== -1) {
            this.notifications[index] = payload.new;
            this._recordHistory(payload.new);
            this.applyFilter();
            this.unreadCount = this.notifications.filter(n => !n.is_read).length;
            this.updateBadge();
            this.refreshOpenPanel();
          }
        }
      )
      .subscribe();
  },

  updateBadge() {
    const badge = document.querySelector('.notification-badge');
    const countElement = document.querySelector('.notification-count');
    
    if (this.unreadCount > 0) {
      if (badge) badge.style.display = 'block';
      if (countElement) {
        countElement.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        countElement.style.display = 'flex';
      }
    } else {
      if (badge) badge.style.display = 'none';
      if (countElement) countElement.style.display = 'none';
    }
  },

  showToastNotification(notification) {
    if (typeof showToast === 'function') {
      showToast(notification.message, notification.type || 'info');
    }
  },

  shouldNotify(notification) {
    if (!this.preferences.inAppEnabled) return false;
    const type = notification?.type || 'info';
    return !this.preferences.mutedTypes.includes(type);
  },

  async loadPreferences() {
    const localPrefs = this._loadPreferencesFromLocal();
    if (!window.supabaseReady || !authManager.isAuthenticated()) {
      this.preferences = localPrefs;
      return;
    }

    const session = authManager.getSession();
    const userId = session?.supabaseId;
    if (!userId) {
      this.preferences = localPrefs;
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from('notification_preferences')
        .select('in_app_enabled, muted_types')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        this.preferences = {
          inAppEnabled: data.in_app_enabled !== false,
          mutedTypes: Array.isArray(data.muted_types) ? data.muted_types : []
        };
        this._savePreferencesToLocal(this.preferences);
        return;
      }

      // Bootstrap server-side preferences using local preferences if available.
      this.preferences = localPrefs;
      await this.savePreferences();
    } catch (error) {
      console.warn('Failed to load server notification preferences, using local:', error);
      this.preferences = localPrefs;
    }
  },

  async savePreferences() {
    this._savePreferencesToLocal(this.preferences);
    if (!window.supabaseReady || !authManager.isAuthenticated()) return;
    const session = authManager.getSession();
    const userId = session?.supabaseId;
    if (!userId) return;

    try {
      const { error } = await supabaseClient
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          in_app_enabled: this.preferences.inAppEnabled,
          muted_types: this.preferences.mutedTypes,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (error) {
      console.warn('Failed to save notification preferences to server:', error);
    }
  },

  async toggleInAppNotifications() {
    this.preferences.inAppEnabled = !this.preferences.inAppEnabled;
    await this.savePreferences();
    this.refreshOpenPanel();
    if (typeof showToast === 'function') {
      showToast(
        this.preferences.inAppEnabled ? 'In-app notifications enabled' : 'In-app notifications muted',
        this.preferences.inAppEnabled ? 'success' : 'warning'
      );
    }
  },

  async toggleTypeMute(type) {
    const idx = this.preferences.mutedTypes.indexOf(type);
    if (idx === -1) this.preferences.mutedTypes.push(type);
    else this.preferences.mutedTypes.splice(idx, 1);
    await this.savePreferences();
    this.refreshOpenPanel();
  },

  applyFilter() {
    if (this.panelFilter === 'unread') {
      this.filteredNotifications = this.notifications.filter(n => !n.is_read);
      return;
    }
    this.filteredNotifications = [...this.notifications];
  },

  setFilter(filter) {
    this.panelFilter = filter === 'unread' ? 'unread' : 'all';
    this.applyFilter();
    this.refreshOpenPanel();
  },

  async markAsRead(notificationId) {
    if (!window.supabaseReady) return;

    try {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification && !notification.is_read) {
        notification.is_read = true;
        notification.read_at = new Date().toISOString();
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.updateBadge();
        this.applyFilter();
        this.refreshOpenPanel();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  },

  async markAllAsRead() {
    if (!window.supabaseReady || !authManager.isAuthenticated()) return;

    const session = authManager.getSession();
    if (!session) return;

    try {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', session.supabaseId)
        .eq('is_read', false);

      if (error) throw error;

      this.notifications.forEach(n => {
        if (!n.is_read) {
          n.is_read = true;
          n.read_at = new Date().toISOString();
        }
      });
      this.unreadCount = 0;
      this.updateBadge();
      this.applyFilter();

      // Re-render panel in place so unread highlights clear immediately
      const panel = document.getElementById('notification-panel');
      if (panel) { panel.remove(); this.showPanel(); }

      if (typeof showToast === 'function') {
        showToast('All notifications marked as read', 'success');
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  },

  async deleteNotification(notificationId) {
    if (!window.supabaseReady) return;

    try {
      const { error } = await supabaseClient
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      const index = this.notifications.findIndex(n => n.id === notificationId);
      if (index !== -1) {
        const wasUnread = !this.notifications[index].is_read;
        this.notifications.splice(index, 1);
        if (wasUnread) {
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        }
        this.applyFilter();
        this.updateBadge();
        this.refreshOpenPanel();
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  },

  async createNotification(userId, message, type = 'info', metadata = {}) {
    if (!window.supabaseReady) return;

    try {
      const { data, error } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: userId,
          message,
          type,
          metadata,
          is_read: false
        })
        .select()
        .single();

      if (error) throw error;
      this._recordHistory(data);
      return data;
    } catch (error) {
      console.error('Error creating notification:', error);
      return null;
    }
  },

  showPanel() {
    const existingPanel = document.getElementById('notification-panel');
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.id = 'notification-panel';
    panel.style.cssText = `
      position: fixed;
      top: 70px;
      right: var(--space-6);
      width: 400px;
      max-width: calc(100vw - var(--space-8));
      max-height: 600px;
      background: white;
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-2xl);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      animation: slideDown 0.3s ease;
    `;

    const header = `
      <div style="padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--border-primary); display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); margin: 0;">
          Notifications ${this.unreadCount > 0 ? `<span style="background: var(--color-primary); color: white; padding: 0.25rem 0.5rem; border-radius: var(--radius-full); font-size: var(--font-size-xs); margin-left: var(--space-2);">${this.unreadCount}</span>` : ''}
        </h3>
        <div style="display: flex; gap: var(--space-2);">
          ${this.unreadCount > 0 ? `<button onclick="notificationManager.markAllAsRead()" style="padding: var(--space-2) var(--space-3); background: var(--bg-tertiary); border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--font-size-xs); color: var(--text-secondary);">Mark all read</button>` : ''}
          <button onclick="notificationManager.showPanel()" style="padding: var(--space-2); background: transparent; border: none; cursor: pointer; font-size: var(--font-size-lg); color: var(--text-secondary);">✕</button>
        </div>
      </div>
      <div style="padding: var(--space-3) var(--space-6); border-bottom: 1px solid var(--border-primary); background: var(--bg-primary); display: flex; flex-direction: column; gap: var(--space-3);">
        <div style="display: flex; gap: var(--space-2); align-items: center; justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; gap: var(--space-2);">
            <button onclick="notificationManager.setFilter('all')" style="padding: 6px 10px; border: 1px solid var(--border-primary); border-radius: var(--radius-md); background: ${this.panelFilter === 'all' ? 'var(--color-primary)' : 'var(--bg-secondary)'}; color: ${this.panelFilter === 'all' ? 'white' : 'var(--text-secondary)'}; font-size: var(--font-size-xs); cursor: pointer;">All</button>
            <button onclick="notificationManager.setFilter('unread')" style="padding: 6px 10px; border: 1px solid var(--border-primary); border-radius: var(--radius-md); background: ${this.panelFilter === 'unread' ? 'var(--color-primary)' : 'var(--bg-secondary)'}; color: ${this.panelFilter === 'unread' ? 'white' : 'var(--text-secondary)'}; font-size: var(--font-size-xs); cursor: pointer;">Unread</button>
          </div>
          <button onclick="notificationManager.toggleInAppNotifications()" style="padding: 6px 10px; border: 1px solid var(--border-primary); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-secondary); font-size: var(--font-size-xs); cursor: pointer;">
            ${this.preferences.inAppEnabled ? 'Mute in-app alerts' : 'Enable in-app alerts'}
          </button>
        </div>
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          ${['payment','grade','assessment','exam','timetable','schedule','message','warning','error','info','success'].map((type) => {
            const muted = this.preferences.mutedTypes.includes(type);
            return `<button onclick="notificationManager.toggleTypeMute('${type}')" style="padding: 5px 8px; border: 1px solid var(--border-primary); border-radius: var(--radius-md); background: ${muted ? 'var(--bg-secondary)' : 'var(--bg-tertiary)'}; color: ${muted ? 'var(--text-tertiary)' : 'var(--text-primary)'}; font-size: 11px; cursor: pointer;">${muted ? '🔇' : '🔔'} ${type}</button>`;
          }).join('')}
        </div>
      </div>
    `;

    this.applyFilter();
    const notificationsList = this.filteredNotifications.length > 0
      ? this.filteredNotifications.map(n => this.renderNotification(n)).join('')
      : `<div style="padding: var(--space-8); text-align: center; color: var(--text-secondary);">
          <div style="font-size: 3rem; margin-bottom: var(--space-4);">🔔</div>
          <p>${this.notifications.length > 0 ? 'No notifications in this filter' : 'No notifications yet'}</p>
        </div>`;

    panel.innerHTML = `
      ${header}
      <div style="flex: 1; overflow-y: auto; padding: var(--space-2);">
        ${notificationsList}
      </div>
    `;

    document.body.appendChild(panel);

    setTimeout(() => {
      document.addEventListener('click', function closePanel(e) {
        if (!panel.contains(e.target) && !e.target.closest('.notification-btn')) {
          panel.remove();
          document.removeEventListener('click', closePanel);
        }
      });
    }, 100);
  },

  refreshOpenPanel() {
    const panel = document.getElementById('notification-panel');
    if (!panel) return;
    panel.remove();
    this.showPanel();
  },

  _getScopedKey(baseKey) {
    const session = (typeof authManager !== 'undefined' && authManager.getSession) ? authManager.getSession() : null;
    const userId = session?.supabaseId || session?.userId || 'anonymous';
    return `${baseKey}:${userId}`;
  },

  _loadPreferencesFromLocal() {
    try {
      const key = this._getScopedKey(this._prefsKey);
      const raw = localStorage.getItem(key);
      if (!raw) {
        return { inAppEnabled: true, mutedTypes: [] };
      }
      const saved = JSON.parse(raw);
      return {
        inAppEnabled: saved?.inAppEnabled !== false,
        mutedTypes: Array.isArray(saved?.mutedTypes) ? saved.mutedTypes : []
      };
    } catch (error) {
      console.warn('Failed to load local notification preferences:', error);
      return { inAppEnabled: true, mutedTypes: [] };
    }
  },

  _savePreferencesToLocal(preferences) {
    try {
      const key = this._getScopedKey(this._prefsKey);
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch (error) {
      console.warn('Failed to cache notification preferences locally:', error);
    }
  },

  _recordHistory(notification) {
    try {
      if (!notification || !notification.id) return;
      const key = this._getScopedKey(this._historyKey);
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      const withoutCurrent = Array.isArray(list) ? list.filter(n => n.id !== notification.id) : [];
      withoutCurrent.unshift({
        id: notification.id,
        message: notification.message || '',
        type: notification.type || 'info',
        created_at: notification.created_at || new Date().toISOString(),
        is_read: !!notification.is_read
      });
      localStorage.setItem(key, JSON.stringify(withoutCurrent.slice(0, this._historyLimit)));
    } catch (error) {
      console.warn('Failed to record notification history:', error);
    }
  },

  _hydrateNotificationHistory() {
    try {
      const key = this._getScopedKey(this._historyKey);
      const raw = localStorage.getItem(key);
      const history = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(history) || history.length === 0) return;
      const existingIds = new Set(this.notifications.map(n => n.id));
      const merged = [...this.notifications];
      history.forEach((h) => {
        if (!existingIds.has(h.id)) merged.push(h);
      });
      this.notifications = merged
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, this._historyLimit);
    } catch (error) {
      console.warn('Failed to hydrate notification history:', error);
    }
  },

  renderNotification(notification) {
    const typeIcons = {
      info: '💡',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      message: '💬',
      payment: '💰',
      grade: '📊',
      assessment: '📝',
      exam: '📋',
      timetable: '📅',
      schedule: '📅',
    };

    const icon = typeIcons[notification.type] || '🔔';
    const timeAgo = this.getTimeAgo(notification.created_at);

    return `
      <div onclick="notificationManager.markAsRead('${notification.id}')" style="
        padding: var(--space-4);
        margin-bottom: var(--space-2);
        background: ${notification.is_read ? 'var(--bg-primary)' : 'var(--bg-tertiary)'};
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all 0.2s;
        border-left: 3px solid ${notification.is_read ? 'transparent' : 'var(--color-primary)'};
      " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='${notification.is_read ? 'var(--bg-primary)' : 'var(--bg-tertiary)'}'">
        <div style="display: flex; gap: var(--space-3); align-items: start;">
          <div style="font-size: 1.5rem;">${icon}</div>
          <div style="flex: 1; min-width: 0;">
            <p style="margin: 0 0 var(--space-1) 0; color: var(--text-primary); font-weight: ${notification.is_read ? 'normal' : 'var(--font-weight-semibold)'}; font-size: var(--font-size-sm);">
              ${notification.message}
            </p>
            <p style="margin: 0; color: var(--text-tertiary); font-size: var(--font-size-xs);">
              ${timeAgo}
            </p>
          </div>
          <button onclick="event.stopPropagation(); notificationManager.deleteNotification('${notification.id}')" style="padding: var(--space-1); background: transparent; border: none; cursor: pointer; color: var(--text-tertiary); font-size: var(--font-size-sm);">🗑️</button>
        </div>
      </div>
    `;
  },

  getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return time.toLocaleDateString();
  },

  cleanup() {
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe();
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if (typeof authManager !== 'undefined' && authManager.isAuthenticated()) {
      notificationManager.init();
    }
  });
}
