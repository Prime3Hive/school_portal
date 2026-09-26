// ============================================
// PORTAL SHELL — live parts of the sidebar and top bar
// ============================================
// The shell markup is static; this fills in what depends on the session and
// on live data: the current session and term, who is signed in, and the
// counts beside the sidebar links that have work waiting.
//
// Counts are presentation only. They read the same DataManager caches the
// modules read, so a link never promises work the module will not show.
// ============================================

(function () {
  'use strict';

  /**
   * A payment a parent says they made that nobody has confirmed: a bank
   * transfer with its receipt, or a Paystack payment, which migration 0020
   * holds as pending until staff approve it. The same rule as the Payments
   * to check screen, so the badge agrees with the list it leads to.
   */
  function isAwaitingVerification(p) {
    if (!p || p.status !== 'pending') return false;
    const m = String(p.paymentMethod || p.payment_method || '').toLowerCase();
    return m === 'bank-deposit' || m === 'paystack';
  }

  function counts() {
    const dm = window.dataManager;
    if (!dm || typeof dm.getAll !== 'function') return null;
    return {
      verifications: (dm.getAll('payments') || []).filter(isAwaitingVerification).length,
      applications: (dm.getAll('applications') || []).filter(a => a.status === 'pending').length
    };
  }

  function updateBadges() {
    const c = counts();
    if (!c) return;
    document.querySelectorAll('[data-nav-badge]').forEach(el => {
      const n = c[el.dataset.navBadge] || 0;
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = n === 0;
      const link = el.closest('.nav-link');
      const label = link?.querySelector('.nav-link-text')?.textContent || '';
      if (link) link.setAttribute('aria-label', n ? `${label}, ${n} waiting` : label);
    });
    const dot = document.getElementById('shell-bell-dot');
    if (dot) dot.hidden = !(c.verifications || c.applications);
  }

  function fillTerm() {
    const el = document.getElementById('term-chip-label');
    const cfg = window.schoolConfig;
    if (!el || !cfg) return;
    const year = cfg.getCurrentAcademicYear?.() || '';
    const term = cfg.getCurrentTerm?.()?.name || '';
    const text = [year, term].filter(Boolean).join(' · ');
    if (text) el.textContent = text;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  const ROLE_LABELS = { admin: 'Administrator', staff: 'Staff', teacher: 'Teacher', student: 'Student', parent: 'Parent' };

  function fillUser() {
    const session = window.authManager?.getSession?.();
    if (!session) return;
    const name = session.fullName || session.email || '';
    const role = ROLE_LABELS[session.role] || session.role || '';
    const set = (id, text) => { const el = document.getElementById(id); if (el && text) el.textContent = text; };
    set('nav-user-name', name);
    set('nav-user-role', role);
    set('nav-user-avatar', initials(name));
  }

  function init() {
    fillTerm();
    fillUser();
    updateBadges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('supabase-data-ready', updateBadges);
  window.addEventListener('datamanager:change', (e) => {
    const c = e.detail?.collection;
    if (!c || c === 'payments' || c === 'applications') updateBadges();
  });

  window.portalShell = { updateBadges, isAwaitingVerification, initials };
})();
