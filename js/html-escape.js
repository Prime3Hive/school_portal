// ============================================
// HTML ESCAPING — canonical, load-early utility
// ============================================
// This project builds most of its UI by interpolating database values into
// innerHTML. That is only safe if every interpolated value is escaped.
//
// `escapeHtml` used to be a private function inside application-manager.js that
// assigned itself to window on the way past. Pages that don't load that file —
// the teacher portal, the student portal, login, verify-invitation — therefore
// had no global at all, and modules calling window.escapeHtml silently fell
// through to whatever inline fallback they happened to define.
//
// This file has no dependencies and must load before any rendering module.
// ============================================

(function () {
  'use strict';

  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  /**
   * Escape a value for interpolation into HTML text or a quoted attribute.
   *
   * null and undefined become '' rather than the strings "null"/"undefined",
   * which is almost always what a template wants for a missing field.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ENTITIES[ch]);
  }

  /**
   * Escape a value for use inside a JS string in an inline handler, e.g.
   *   onclick="doThing('${escapeJs(id)}')"
   *
   * Prefer addEventListener over inline handlers. Where the existing markup
   * already uses them, this at least prevents quote-breaking.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeJs(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/</g, '\\x3C');
  }

  window.escapeHtml = escapeHtml;
  window.escapeJs = escapeJs;

  // Short aliases — several modules already define a local `_esc`.
  window.esc = escapeHtml;
})();
