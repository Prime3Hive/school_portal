// ============================================
// SCORE BOOK — one way to read and write pupils' scores
// ============================================
// Two screens used to save scores, and both called dataManager.create for
// every row, every time. Correcting a mark therefore added a second grade
// for the same pupil and assessment instead of changing the first, and
// neither stamped the term or session, so results could not be grouped by
// term anywhere downstream.
//
// save() finds the pupil's existing grade for the assessment and updates
// it, or creates one, and always records the term and session. Letter
// grades come from the school's own scale in schoolConfig.
// ============================================

(function () {
  'use strict';

  const DRAFT_PREFIX = 'tbd_score_draft_';

  function scale() {
    const s = window.schoolConfig?.promotion?.gradingScale || [];
    return [...s].sort((a, b) => b.min - a.min);
  }

  /**
   * The band a percentage falls in: the highest band whose minimum it reaches.
   * Bands are stored as whole-number ranges (80–89, 90–100), so testing
   * against both ends put 89.5% in no band at all.
   */
  function gradeFor(pct) {
    if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return { grade: '', remark: '' };
    const bands = scale();
    const band = bands.find(b => Number(pct) >= b.min) || bands[bands.length - 1];
    return band ? { grade: band.grade, remark: band.remark } : { grade: '', remark: '' };
  }

  function outOf(assessment) {
    return parseFloat(assessment?.totalMarks ?? assessment?.total_marks) || 100;
  }

  // An assessment's own term, else the term of its date, else today's. Teacher
  // assessments have no term column, so without the date a test marked after
  // the holiday was filed under the new term.
  const dateOf = (a) => { const d = String(a?.date || '').slice(0, 10); return /^d{4}-d{2}-d{2}$/.test(d) ? d : null; };

  function termOf(assessment) {
    const d = dateOf(assessment);
    return assessment?.term || (d && window.schoolConfig?.termFor?.(d)?.name) || window.schoolConfig?.getCurrentTerm?.()?.name || '';
  }

  function yearOf(assessment) {
    const d = dateOf(assessment);
    return String(assessment?.academicYear || assessment?.academic_year ||
      (d && window.schoolConfig?.academicYearFor?.(d)) || window.schoolConfig?.getCurrentAcademicYear?.() || '').replace('/', '-');
  }

  /** Saved grades for an assessment, keyed by student id. */
  function existing(assessmentId) {
    const map = new Map();
    (window.dataManager?.getAll('grades') || [])
      .filter(g => (g.assessmentId || g.assessment_id) === assessmentId)
      .forEach(g => map.set(g.studentId || g.student_id, g));
    return map;
  }

  /** Why a typed score cannot be saved, or '' if it can. */
  function problem(raw, max) {
    const v = String(raw ?? '').trim();
    if (v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Numbers only';
    if (n < 0) return 'Cannot be below 0';
    if (n > max) return `The most is ${max}`;
    return '';
  }

  /**
   * Save typed scores for one assessment.
   * @param {object} assessment
   * @param {Array<{studentId:string, score:string|number, remarks?:string}>} rows
   * @returns {Promise<{created:number, updated:number, failed:number}>}
   */
  async function save(assessment, rows) {
    const max = outOf(assessment);
    const saved = existing(assessment.id);
    const session = window.authManager?.getSession?.();
    const result = { created: 0, updated: 0, failed: 0 };

    for (const r of rows) {
      const raw = String(r.score ?? '').trim();
      if (raw === '' || problem(raw, max)) continue;
      const score = Number(raw);
      const pct = (score / max) * 100;
      const band = gradeFor(pct);
      const data = {
        studentId: r.studentId,
        assessmentId: assessment.id,
        subject: assessment.subject || '',
        term: termOf(assessment),
        academicYear: yearOf(assessment),
        score,
        totalMarks: max,
        percentage: Math.round(pct * 10) / 10,
        grade: band.grade,
        remarks: r.remarks || '',
        gradedBy: session?.supabaseId || null
      };
      const prior = saved.get(r.studentId);
      try {
        const ok = prior
          ? await window.dataManager.update('grades', prior.id, data)
          : await window.dataManager.create('grades', data);
        if (ok) result[prior ? 'updated' : 'created']++;
        else result.failed++;
      } catch (e) {
        console.error('[ScoreBook] save failed for', r.studentId, e);
        result.failed++;
      }
    }
    return result;
  }

  // ── Drafts: typed scores kept on this device until saved ──
  function readDraft(assessmentId) {
    try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + assessmentId) || 'null'); } catch { return null; }
  }

  function writeDraft(assessmentId, draft) {
    try { localStorage.setItem(DRAFT_PREFIX + assessmentId, JSON.stringify({ ...draft, at: Date.now() })); } catch { /* storage full or blocked */ }
  }

  function clearDraft(assessmentId) {
    try { localStorage.removeItem(DRAFT_PREFIX + assessmentId); } catch { /* ignore */ }
  }

  window.scoreBook = { gradeFor, outOf, termOf, yearOf, existing, problem, save, readDraft, writeDraft, clearDraft };
})();
