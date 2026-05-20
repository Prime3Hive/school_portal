// ================================================================
// AUDIT LOGGER — global utility loaded before any module
// Writes to the `audit_logs` Supabase table. Non-blocking.
// All modules call writeAuditLog(action, target, details).
// ================================================================

async function writeAuditLog(action, target, details = '') {
  try {
    if (!window.supabaseClient) return;
    const session = (typeof authManager !== 'undefined') ? authManager.getSession() : null;
    const performedBy = session ? `${session.fullName || session.userId} (${session.role})` : 'System';
    const performerId = session?.supabaseId || null;
    await window.supabaseClient.from('audit_logs').insert({
      action,
      target: String(target || '').substring(0, 255),
      details: String(details || '').substring(0, 1000),
      performed_by: performedBy,
      performer_id: performerId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // Non-blocking — never throw
    console.warn('[AuditLog] Failed to write:', action, err?.message || err);
  }
}
