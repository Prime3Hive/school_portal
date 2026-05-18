// ============================================
// SUBJECT MANAGER - Auto-enrollment utility
// Populates student_subjects from subject_catalog
// whenever a student is added or accepted.
// ============================================

const subjectManager = {

  /**
   * Auto-enroll a student in all subjects configured for their grade.
   * Reads from subjectCatalog, writes one student_subjects row.
   * Safe to call multiple times — skips if a record already exists
   * for this student + academic year.
   *
   * @param {string} studentId   - Student Supabase UUID
   * @param {string} studentName - Student full name
   * @param {string} grade       - Grade (e.g. "Grade 1", "JSS 2")
   * @param {string} section     - Section (e.g. "A")
   * @returns {Promise<{success:boolean, count:number, existing?:boolean, error?:string}>}
   */
  async autoEnroll(studentId, studentName, grade, section) {
    if (!studentId || !grade) {
      console.warn('[SubjectManager] autoEnroll: missing studentId or grade');
      return { success: false, error: 'Missing required parameters' };
    }

    try {
      const academicYear = window.CURRENT_ACADEMIC_YEAR || '2025-2026';

      // Guard: skip if already enrolled this year
      const allEnrollments = dataManager.getAll('studentSubjects') || [];
      const existing = allEnrollments.find(e => {
        const sid = e.student_id || e.studentId;
        const yr  = e.academic_year || e.academicYear;
        return sid === studentId && yr === academicYear;
      });
      if (existing) {
        console.log('[SubjectManager] Already enrolled:', studentName);
        return { success: true, count: 0, existing: true };
      }

      // Get subjects seeded for this grade
      const allSubjects  = dataManager.getAll('subjectCatalog') || [];
      const gradeSubjects = allSubjects.filter(s =>
        (s.grade || '').toString().trim() === (grade || '').toString().trim()
      );

      if (gradeSubjects.length === 0) {
        console.warn('[SubjectManager] No subjects found for grade:', grade);
        return { success: false, error: `No subjects configured for grade ${grade}` };
      }

      // Resolve teacher names from staff cache
      const allStaff = dataManager.getAll('staff') || [];
      const subjects  = gradeSubjects.map(sub => {
        const tid     = sub.teacher_id || sub.teacherId || null;
        const teacher = tid ? allStaff.find(t => t.id === tid) : null;
        return {
          subjectId:    sub.id,
          subjectName:  sub.name,
          teacherId:    tid,
          teacherName:  teacher ? teacher.name : null,
          currentGrade: null,
          letterGrade:  null,
        };
      });

      const payload = {
        studentId:    studentId,
        studentName:  studentName,
        grade:        grade,
        section:      section || '',
        academicYear: academicYear,
        subjects:     subjects,
      };

      const result = await dataManager.create('studentSubjects', payload);
      if (!result) {
        return { success: false, error: 'Failed to save student subjects' };
      }

      console.log(`[SubjectManager] Enrolled ${subjects.length} subjects for "${studentName}" (${grade})`);
      return { success: true, count: subjects.length };

    } catch (err) {
      console.error('[SubjectManager] autoEnroll error:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Look up a student record by their auth_id (used after edge-function creation)
   * and then auto-enroll them.
   */
  async autoEnrollByAuthId(authId, grade, section) {
    if (!authId) return { success: false, error: 'No authId provided' };
    try {
      // Wait briefly for the edge function's DB write to propagate
      await new Promise(r => setTimeout(r, 800));
      await dataManager.refresh('students');

      const students = dataManager.getAll('students') || [];
      const student  = students.find(s => (s.auth_id || s.authId) === authId);

      if (!student) {
        console.warn('[SubjectManager] Student not found by authId:', authId);
        return { success: false, error: 'Student record not found' };
      }

      return this.autoEnroll(
        student.id,
        student.name,
        grade || student.grade,
        section || student.section
      );
    } catch (err) {
      console.error('[SubjectManager] autoEnrollByAuthId error:', err);
      return { success: false, error: err.message };
    }
  },
};
