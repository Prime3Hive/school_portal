// ============================================
// DASHBOARD SETTINGS - Helper Module
// ============================================

class DashboardSettings {
    constructor() {
        this.storageKey = 'dashboardSettings';
        this.defaultSettings = {
            autoRefresh: true,
            refreshInterval: 30000, // 30 seconds
            widgets: {
                stats: { visible: true, order: 1 },
                shortcuts: { visible: true, order: 2 },
                activity: { visible: true, order: 3 },
                quickActions: { visible: true, order: 4 },
                charts: { visible: true, order: 5 },
                alerts: { visible: true, order: 6 }
            },
            dateRange: {
                start: null,
                end: null,
                preset: 'all' // 'today', 'week', 'month', 'year', 'custom', 'all'
            },
            lastUpdate: null,
            unreadActivities: 0
        };
    }

    // Load settings from localStorage
    load() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const settings = JSON.parse(saved);
                return { ...this.defaultSettings, ...settings };
            }
        } catch (error) {
            console.error('Error loading dashboard settings:', error);
        }
        return { ...this.defaultSettings };
    }

    // Save settings to localStorage
    save(settings) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving dashboard settings:', error);
            return false;
        }
    }

    // Update specific setting
    update(key, value) {
        const settings = this.load();
        settings[key] = value;
        return this.save(settings);
    }

    // Reset to defaults
    reset() {
        return this.save(this.defaultSettings);
    }

    // Widget management
    getWidgets() {
        const settings = this.load();
        return settings.widgets;
    }

    updateWidget(widgetId, updates) {
        const settings = this.load();
        if (settings.widgets[widgetId]) {
            settings.widgets[widgetId] = { ...settings.widgets[widgetId], ...updates };
            return this.save(settings);
        }
        return false;
    }

    toggleWidget(widgetId) {
        const settings = this.load();
        if (settings.widgets[widgetId]) {
            settings.widgets[widgetId].visible = !settings.widgets[widgetId].visible;
            return this.save(settings);
        }
        return false;
    }

    reorderWidgets(newOrder) {
        const settings = this.load();
        Object.keys(newOrder).forEach(widgetId => {
            if (settings.widgets[widgetId]) {
                settings.widgets[widgetId].order = newOrder[widgetId];
            }
        });
        return this.save(settings);
    }

    // Date range management
    getDateRange() {
        const settings = this.load();
        return settings.dateRange;
    }

    setDateRange(start, end, preset = 'custom') {
        const settings = this.load();
        settings.dateRange = { start, end, preset };
        return this.save(settings);
    }

    // Get preset date ranges
    getPresetRange(preset) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        switch (preset) {
            case 'today':
                return {
                    start: today,
                    end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
                };

            case 'week':
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - today.getDay());
                return {
                    start: weekStart,
                    end: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
                };

            case 'month':
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                return { start: monthStart, end: monthEnd };

            case 'year':
                const yearStart = new Date(now.getFullYear(), 0, 1);
                const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                return { start: yearStart, end: yearEnd };

            case 'all':
            default:
                return { start: null, end: null };
        }
    }

    // Notification management
    getUnreadCount() {
        const settings = this.load();
        return settings.unreadActivities || 0;
    }

    setUnreadCount(count) {
        return this.update('unreadActivities', count);
    }

    incrementUnread() {
        const settings = this.load();
        settings.unreadActivities = (settings.unreadActivities || 0) + 1;
        return this.save(settings);
    }

    clearUnread() {
        return this.update('unreadActivities', 0);
    }

    // Last update tracking
    getLastUpdate() {
        const settings = this.load();
        return settings.lastUpdate ? new Date(settings.lastUpdate) : null;
    }

    setLastUpdate(timestamp = new Date()) {
        return this.update('lastUpdate', timestamp.toISOString());
    }
}

// Auto-refresh manager
class AutoRefreshManager {
    constructor(callback, interval = 30000) {
        this.callback = callback;
        this.interval = interval;
        this.timer = null;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.timer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.callback();
            }
        }, this.interval);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
    }

    restart(newInterval) {
        this.stop();
        if (newInterval) {
            this.interval = newInterval;
        }
        this.start();
    }

    isActive() {
        return this.isRunning;
    }
}

// Export instances
const dashboardSettings = new DashboardSettings();
window.dashboardSettings = dashboardSettings;
window.AutoRefreshManager = AutoRefreshManager;
