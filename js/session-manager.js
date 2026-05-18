const sessionManager = {
  get timeoutMinutes() { return AppConfig.app.sessionTimeoutMinutes; },
  warningMinutes: 5,
  lastActivityTime: Date.now(),
  timeoutTimer: null,
  warningTimer: null,
  warningShown: false,

  init() {
    this.setupActivityListeners();
    this.startTimers();
    this.checkExistingSession();
  },

  setupActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, () => this.resetActivity(), { passive: true });
    });
  },

  resetActivity() {
    this.lastActivityTime = Date.now();
    this.warningShown = false;
    this.clearTimers();
    this.startTimers();
    this.hideWarning();
  },

  startTimers() {
    const warningTime = (this.timeoutMinutes - this.warningMinutes) * 60 * 1000;
    const timeoutTime = this.timeoutMinutes * 60 * 1000;

    this.warningTimer = setTimeout(() => this.showWarning(), warningTime);
    this.timeoutTimer = setTimeout(() => this.handleTimeout(), timeoutTime);
  },

  clearTimers() {
    if (this.warningTimer) clearTimeout(this.warningTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
  },

  showWarning() {
    if (this.warningShown) return;
    this.warningShown = true;

    const modal = document.createElement('div');
    modal.id = 'session-warning-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: var(--radius-xl);
        padding: var(--space-8);
        max-width: 400px;
        box-shadow: var(--shadow-2xl);
        animation: slideUp 0.3s ease;
      ">
        <div style="text-align: center; margin-bottom: var(--space-6);">
          <div style="
            width: 60px;
            height: 60px;
            margin: 0 auto var(--space-4);
            background: linear-gradient(135deg, #ffa726, #ff9800);
            border-radius: var(--radius-full);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
          ">⏰</div>
          <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); color: var(--text-primary); margin-bottom: var(--space-2);">
            Session Expiring Soon
          </h3>
          <p style="color: var(--text-secondary); font-size: var(--font-size-sm);">
            Your session will expire in ${this.warningMinutes} minutes due to inactivity.
          </p>
        </div>
        <div style="display: flex; gap: var(--space-3);">
          <button onclick="sessionManager.extendSession()" class="btn btn-primary" style="flex: 1;">
            Continue Session
          </button>
          <button onclick="sessionManager.logout()" class="btn btn-secondary" style="flex: 1;">
            Logout Now
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  hideWarning() {
    const modal = document.getElementById('session-warning-modal');
    if (modal) modal.remove();
  },

  extendSession() {
    this.resetActivity();
    this.hideWarning();
    if (typeof showToast === 'function') {
      showToast('Session extended', 'success');
    }
  },

  handleTimeout() {
    this.clearTimers();

    // Delegate to authManager which properly calls supabaseClient.auth.signOut()
    // and clears all session keys (sb_session, school_portal_session, sb-*-auth-token)
    if (typeof authManager !== 'undefined' && authManager.logout) {
      authManager.logout();
    } else {
      // Fallback: clear all known session keys used by AuthManager
      localStorage.removeItem('sb_session');
      localStorage.removeItem('school_portal_session');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      }
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: var(--radius-xl);
        padding: var(--space-8);
        max-width: 400px;
        text-align: center;
        box-shadow: var(--shadow-2xl);
      ">
        <div style="
          width: 60px;
          height: 60px;
          margin: 0 auto var(--space-4);
          background: linear-gradient(135deg, #ef5350, #e53935);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
        ">🔒</div>
        <h3 style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); color: var(--text-primary); margin-bottom: var(--space-2);">
          Session Expired
        </h3>
        <p style="color: var(--text-secondary); margin-bottom: var(--space-6);">
          Your session has expired due to inactivity. Please login again.
        </p>
        <button onclick="window.location.href='login.html'" class="btn btn-primary" style="width: 100%;">
          Go to Login
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    setTimeout(() => {
      window.location.href = 'login.html';
    }, 3000);
  },

  logout() {
    this.clearTimers();
    if (typeof authManager !== 'undefined' && authManager.logout) {
      authManager.logout();
    } else {
      window.location.href = 'login.html';
    }
  },

  checkExistingSession() {
    // Read from sb_session — the key AuthManager writes (was previously mismatched as 'session')
    const raw = localStorage.getItem('sb_session');
    if (!raw) return;

    try {
      const sessionData = JSON.parse(raw);
      const lastActivity = sessionData.lastActivity || Date.now();
      const elapsed = Date.now() - lastActivity;
      const maxAge = this.timeoutMinutes * 60 * 1000;

      if (elapsed > maxAge) {
        this.handleTimeout();
      } else {
        this.updateSessionActivity();
      }
    } catch (e) {
      console.error('Session check error:', e);
    }
  },

  updateSessionActivity() {
    // Update lastActivity in the correct key (sb_session) that AuthManager owns
    const raw = localStorage.getItem('sb_session');
    if (!raw) return;

    try {
      const sessionData = JSON.parse(raw);
      sessionData.lastActivity = Date.now();
      localStorage.setItem('sb_session', JSON.stringify(sessionData));
    } catch (e) {
      console.error('Session update error:', e);
    }
  },

  cleanup() {
    this.clearTimers();
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if (window.location.pathname.includes('login.html') || 
        window.location.pathname.includes('verify-invitation.html') ||
        window.location.pathname.includes('public-blog.html') ||
        window.location.pathname.includes('about.html') ||
        window.location.pathname.includes('academics.html') ||
        window.location.pathname.includes('admissions.html') ||
        window.location.pathname.includes('contact.html')) {
      return;
    }
    sessionManager.init();
  });

  window.addEventListener('beforeunload', () => {
    sessionManager.updateSessionActivity();
  });
}
