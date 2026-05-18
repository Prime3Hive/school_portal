// ============================================
// DATA MANAGER — Supabase Edition
// ============================================
// Strategy: Cache-First Hybrid
//   • On boot: load all collections from Supabase into memory cache
//   • Synchronous reads (getAll, getById) served from cache instantly
//     → existing modules need ZERO changes
//   • Writes (create, update, delete) go to BOTH cache AND Supabase
//   • Falls back to localStorage if Supabase is unavailable
// ============================================

class DataManager {
  constructor() {
    // In-memory cache: { students: [...], staff: [...], ... }
    this._cache = {};
    this._loaded = {};   // tracks which collections have been fetched
    this._loading = {};  // prevents duplicate inflight requests
    this._readyPromise = null; // resolves when all core collections are loaded

    // Sync state
    this._realtimeChannel = null;
    this._pollInterval = null;
    this._lastChangeTs = {};  // track last known update per collection
    this._syncPaused = false; // pause sync during local writes to avoid echo

    // Collection → Supabase table name mapping
    this._tableMap = {
      students: 'students',
      staff: 'staff',
      classes: 'classes',
      subjectCatalog: 'subject_catalog',
      studentSubjects: 'student_subjects',
      assessments: 'assessments',
      grades: 'grades',
      assignments: 'student_assignments',
      payments: 'fees_payments',
      feeItems: 'fee_items',
      inventory: 'inventory',
      invitations: 'invitations',
      studentSchedules: 'student_schedules',
      schoolSchedules: 'school_schedules',
      lessonPlans: 'lesson_plans',
      teacherAssessments: 'teacher_assessments',
      inventoryRequests: 'inventory_requests',
      inventoryAssignments: 'inventory_assignments',
      applications: 'applications',
      auditLogs: 'audit_logs',
      emailLogs: 'email_logs',
      paymentTransactions: 'payment_transactions',
      // Aliases used by student portal modules
      studentAssignments: 'student_assignments',
      enhancedPayments: 'fees_payments',
      inventoryHistory: 'inventory_transactions',
      // Non-Supabase collections (cache-only, no localStorage)
      notifications: null,
      siteContent: null,
      schoolConfig: null,
    };

    this.initializeData();
  }

  // ─────────────────────────────────────────
  // Bootstrap
  // ─────────────────────────────────────────
  initializeData() {
    if (!window.supabaseReady) {
      // Legacy localStorage boot
      this._legacyInit();
      this._readyPromise = Promise.resolve();
      return;
    }

    // Tier 1 — needed for the first screen (dashboard). Loaded immediately.
    // waitForReady() resolves when these finish, so first paint is fast.
    const criticalCollections = [
      'students', 'staff', 'classes', 'payments', 'feeItems', 'inventory'
    ];

    // Tier 2 — needed by other modules but not the dashboard.
    // Loaded in background after Tier 1 finishes.
    const deferredCollections = [
      'subjectCatalog', 'assessments', 'grades', 'assignments',
      'studentSubjects', 'studentSchedules', 'schoolSchedules', 'invitations',
      'lessonPlans', 'teacherAssessments',
      'inventoryRequests', 'inventoryAssignments', 'inventoryHistory',
      'applications', 'auditLogs', 'emailLogs', 'paymentTransactions'
    ];

    // _readyPromise resolves after Tier 1 only — modules can render immediately
    this._readyPromise = Promise.all(
      criticalCollections.map(col => this._fetchFromSupabase(col))
    ).then(() => {
      this._startRealtimeSync();
      this._startPolling();
      // Load Tier 2 silently in background — UI already rendered
      Promise.all(deferredCollections.map(col => this._fetchFromSupabase(col)));
    });
  }

  /**
   * Await this once at module init to guarantee data is loaded.
   * Subsequent calls resolve instantly (no extra network requests).
   * Usage: await dataManager.waitForReady();
   */
  waitForReady() {
    return this._readyPromise || Promise.resolve();
  }

  // ─────────────────────────────────────────
  // GENERIC CRUD — async, Supabase-first
  // ─────────────────────────────────────────

  /** Synchronous read from cache.
   *  When Supabase is connected, data comes exclusively from Supabase via cache.
   *  localStorage is only used as offline fallback when Supabase is not available. */
  getAll(collection) {
    if (!window.supabaseReady) {
      return this._legacyGetAll(collection);
    }

    // Start background fetch if not yet loaded (Supabase → cache)
    if (!this._loaded[collection] && !this._loading[collection]) {
      this._fetchFromSupabase(collection);
    }

    // Always return from cache — never from localStorage when Supabase is connected
    return this._cache[collection] || [];
  }

  getById(collection, id) {
    return this.getAll(collection).find(item => item.id === id) || null;
  }

  /**
   * Create a new record. Inserts to Supabase FIRST (letting DB generate the UUID),
   * then adds the returned row to cache. Returns the saved item (with real id) or null on failure.
   */
  async create(collection, item) {
    const table = this._tableMap[collection];

    // Supabase not connected → localStorage fallback (offline mode only)
    if (!window.supabaseReady) {
      const newItem = { ...item, id: item.id || this._generateUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (!this._cache[collection]) this._cache[collection] = [];
      this._cache[collection].push(newItem);
      this._legacyPersistAll(collection);
      this._emitChange(collection, 'INSERT');
      return newItem;
    }

    // No Supabase table mapping → cache-only (no localStorage)
    if (!table) {
      const newItem = { ...item, id: item.id || this._generateUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (!this._cache[collection]) this._cache[collection] = [];
      this._cache[collection].push(newItem);
      this._emitChange(collection, 'INSERT');
      return newItem;
    }

    // Build a row with ONLY valid columns for this table
    const row = this._buildRow(table, item);
    // Always provide a UUID — some tables lack a default generator
    if (!row.id) row.id = this._generateUUID();

    try {
      const { data, error } = await supabaseClient.from(table).insert(row).select();
      if (error) {
        console.error(`DataManager.create(${collection}) FAILED:`, error.message, '| Row:', row);
        showToast?.(`Save failed: ${error.message}`, 'error');
        return null;
      }
      const saved = data?.[0];
      if (saved) {
        const normalized = this._normalizeRows(collection, [saved])[0];
        if (!this._cache[collection]) this._cache[collection] = [];
        this._cache[collection].push(normalized);
        this._emitChange(collection, 'INSERT');
        return normalized;
      }
      return null;
    } catch (err) {
      console.error(`DataManager.create(${collection}) exception:`, err);
      showToast?.('Save failed — check your connection', 'error');
      return null;
    }
  }

  /**
   * Update an existing record. Updates Supabase FIRST, then patches cache on success.
   * Returns the updated item or null on failure.
   */
  async update(collection, id, updates) {
    const table = this._tableMap[collection];

    // Supabase not connected → localStorage fallback (offline mode only)
    if (!window.supabaseReady) {
      if (!this._cache[collection]) this._cache[collection] = this._legacyGetAll(collection);
      const idx = this._cache[collection].findIndex(item => item.id === id);
      if (idx === -1) return null;
      this._cache[collection][idx] = { ...this._cache[collection][idx], ...updates, updated_at: new Date().toISOString() };
      this._legacyPersistAll(collection);
      this._emitChange(collection, 'UPDATE');
      return this._cache[collection][idx];
    }

    // No Supabase table mapping → cache-only (no localStorage)
    if (!table) {
      if (!this._cache[collection]) this._cache[collection] = [];
      const idx = this._cache[collection].findIndex(item => item.id === id);
      if (idx === -1) return null;
      this._cache[collection][idx] = { ...this._cache[collection][idx], ...updates, updated_at: new Date().toISOString() };
      this._emitChange(collection, 'UPDATE');
      return this._cache[collection][idx];
    }

    const row = this._buildRow(table, updates);
    delete row.id; // never overwrite PK
    row.updated_at = new Date().toISOString();

    try {
      const { data, error } = await supabaseClient.from(table).update(row).eq('id', id).select();
      if (error) {
        console.error(`DataManager.update(${collection}, ${id}) FAILED:`, error.message, '| Row:', row);
        showToast?.(`Update failed: ${error.message}`, 'error');
        return null;
      }
      // Patch cache with the returned row
      const saved = data?.[0];
      if (saved && this._cache[collection]) {
        const normalized = this._normalizeRows(collection, [saved])[0];
        const idx = this._cache[collection].findIndex(item => item.id === id);
        if (idx !== -1) this._cache[collection][idx] = normalized;
        this._emitChange(collection, 'UPDATE');
      }
      return saved ? this._normalizeRows(collection, [saved])[0] : null;
    } catch (err) {
      console.error(`DataManager.update(${collection}, ${id}) exception:`, err);
      showToast?.('Update failed — check your connection', 'error');
      return null;
    }
  }

  /**
   * Delete a record. Deletes from Supabase FIRST, then removes from cache on success.
   * Returns true on success, false on failure.
   */
  async delete(collection, id) {
    const table = this._tableMap[collection];

    // Supabase not connected → localStorage fallback (offline mode only)
    if (!window.supabaseReady) {
      if (!this._cache[collection]) this._cache[collection] = this._legacyGetAll(collection);
      this._cache[collection] = this._cache[collection].filter(item => item.id !== id);
      this._legacyPersistAll(collection);
      this._emitChange(collection, 'DELETE');
      return true;
    }

    // No Supabase table mapping → cache-only (no localStorage)
    if (!table) {
      if (!this._cache[collection]) this._cache[collection] = [];
      this._cache[collection] = this._cache[collection].filter(item => item.id !== id);
      this._emitChange(collection, 'DELETE');
      return true;
    }

    try {
      const { error } = await supabaseClient.from(table).delete().eq('id', id);
      if (error) {
        console.error(`DataManager.delete(${collection}, ${id}) FAILED:`, error.message);
        showToast?.(`Delete failed: ${error.message}`, 'error');
        return false;
      }
      if (this._cache[collection]) {
        this._cache[collection] = this._cache[collection].filter(item => item.id !== id);
      }
      this._emitChange(collection, 'DELETE');
      return true;
    } catch (err) {
      console.error(`DataManager.delete(${collection}, ${id}) exception:`, err);
      return false;
    }
  }

  /** Generate a proper UUID v4 for non-Supabase collections */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /** @deprecated — use create() which now returns a promise. Kept for any old callers. */
  generateId() {
    return this._generateUUID();
  }

  // ─────────────────────────────────────────
  // Async refresh — call when you want
  // to guarantee fresh data from Supabase
  // e.g. await dataManager.refresh('students')
  // ─────────────────────────────────────────
  async refresh(collection) {
    return await this._fetchFromSupabase(collection);
  }

  async refreshAll() {
    const all = Object.keys(this._tableMap).filter(k => this._tableMap[k]);
    await Promise.all(all.map(col => this._fetchFromSupabase(col)));
  }

  // ─────────────────────────────────────────
  // Analytics (same API as before)
  // ─────────────────────────────────────────
  getStats() {
    const students = this.getAll('students');
    const staff = this.getAll('staff');
    const payments = this.getAll('payments');
    const inventory = this.getAll('inventory');

    const totalStudents = students.length;
    const activeStudents = students.filter(s => s.status === 'active').length;
    const totalStaff = staff.length;
    const teachingStaff = staff.filter(s => s.type === 'teaching').length;
    const totalFees = payments.reduce((a, p) => a + (p.amount || 0), 0);
    const paidFees = payments.filter(p => p.status === 'paid')
      .reduce((a, p) => a + (p.amount || 0), 0);
    const pendingFees = payments.filter(p => p.status === 'pending' || p.status === 'overdue')
      .reduce((a, p) => a + (p.amount || 0), 0);
    const lowStockItems = inventory.filter(i => (i.quantity - (i.allocated || 0)) <= (i.minStock || 5)).length;

    return {
      totalStudents, activeStudents, totalStaff, teachingStaff,
      totalFees, paidFees, pendingFees, lowStockItems
    };
  }

  // Inventory history logging
  async logInventoryTransaction(type, itemId, itemName, quantity, user, details = {}) {
    const transaction = {
      type, itemId, itemName, quantity,
      userName: user, details,
      timestamp: new Date().toISOString()
    };
    await this.create('inventoryHistory', transaction);
    return transaction;
  }

  // Subject catalog seed (migration helper — kept for compat)
  seedSubjectCatalog() {
    // No-op: data lives in Supabase now, already seeded
    console.log('DataManager: seedSubjectCatalog — data managed by Supabase.');
  }

  // ─────────────────────────────────────────
  // Supabase internals
  // ─────────────────────────────────────────
  async _fetchFromSupabase(collection) {
    const table = this._tableMap[collection];
    if (!table || !window.supabaseReady) return [];

    // Deduplicate parallel calls
    if (this._loading[collection]) return this._cache[collection] || [];
    this._loading[collection] = true;

    try {
      const orderCol = this._orderByColumn[table] || 'created_at';
      const TIMEOUT_MS = 15_000;
      const fetchPromise = supabaseClient.from(table).select('*').order(orderCol, { ascending: true });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Fetch timeout for ${collection} after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
      );
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);
      if (error) {
        console.warn(`DataManager: Supabase fetch failed for ${collection}:`, error.message);
        // No localStorage fallback — keep cache empty until Supabase succeeds
        if (!this._cache[collection]) this._cache[collection] = [];
      } else {
        let rows = data || [];
        // Security: strip sensitive fields from client-side cache
        if (collection === 'invitations') {
          rows = rows.map(r => { const c = { ...r }; delete c.default_password; return c; });
        }
        if (collection === 'staff') {
          const role = authManager?.getSession?.()?.role;
          if (role !== 'admin') {
            rows = rows.map(r => { const c = { ...r }; delete c.salary; return c; });
          }
        }
        this._cache[collection] = this._normalizeRows(collection, rows);
        // Only emit on first successful load so deferred collections notify waiting modules
        const firstLoad = !this._loaded[collection];
        this._loaded[collection] = true;
        if (firstLoad) this._emitChange(collection, 'LOADED');
      }
    } catch (err) {
      console.warn(`DataManager: Error fetching ${collection}:`, err.message);
      // No localStorage fallback — keep cache empty until Supabase succeeds
      if (!this._cache[collection]) this._cache[collection] = [];
    } finally {
      this._loading[collection] = false;
    }

    return this._cache[collection];
  }

  // _persistCreate, _persistUpdate, _persistDelete are no longer needed.
  // create/update/delete now talk to Supabase directly and synchronously
  // update the cache only on confirmed success.

  // Normalize Supabase snake_case rows → app camelCase objects
  _normalizeRows(collection, rows) {
    return rows.map(row => ({
      ...row,
      // Common
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt,
      // Students
      dateOfBirth: row.date_of_birth || row.dateOfBirth,
      admissionDate: row.admission_date || row.admissionDate,
      bloodGroup: row.blood_group || row.bloodGroup,
      authId: row.auth_id || row.authId,
      rollNo: row.roll_no || row.rollNo,
      emergencyContacts: row.emergency_contacts || row.emergencyContacts,
      previousSchool: row.previous_school || row.previousSchool,
      // Staff
      hireDate: row.hire_date || row.hireDate,
      // Classes
      classTeacher: row.class_teacher || row.classTeacher,
      studentCount: row.student_count || row.studentCount,
      // Fees
      paymentDate: row.payment_date || row.paymentDate,
      paymentMethod: row.payment_method || row.paymentMethod,
      receiptNo: row.receipt_no || row.receiptNo,
      feeType: row.fee_type || row.feeType,
      transactionRef: row.transaction_ref || row.transactionRef,
      receiptUrl: row.receipt_url || row.receiptUrl,
      verifiedBy: row.verified_by || row.verifiedBy,
      verifiedAt: row.verified_at || row.verifiedAt,
      rejectionReason: row.rejection_reason || row.rejectionReason,
      studentRollNo: row.student_roll_no || row.studentRollNo,
      academicYear: row.academic_year || row.academicYear,
      studentId: row.student_id || row.studentId,
      studentName: row.student_name || row.studentName,
      recordedBy: row.recorded_by || row.recordedBy,
      // Assessments
      totalMarks: row.total_marks || row.totalMarks,
      createdBy: row.created_by || row.createdBy,
      // Grades
      assessmentId: row.assessment_id || row.assessmentId,
      gradedBy: row.graded_by || row.gradedBy,
      // Student assignments
      subjectId: row.subject_id || row.subjectId,
      subjectName: row.subject_name || row.subjectName,
      dueDate: row.due_date || row.dueDate,
      submittedDate: row.submitted_date || row.submittedDate,
      // Attendance
      markedBy: row.marked_by || row.markedBy,
      // Schedules
      startTime: row.start_time || row.startTime,
      endTime: row.end_time || row.endTime,
      startDate: row.start_date || row.startDate,
      endDate: row.end_date || row.endDate,
      // Inventory
      unitPrice: row.unit_price || row.unitPrice,
      unitCost: row.unit_cost || row.unitCost,
      minStock: row.min_stock || row.minStock,
      dateAdded: row.date_added || row.dateAdded,
      lastUpdated: row.last_updated || row.lastUpdated,
      // Invitations
      invitedBy: row.invited_by || row.invitedBy,
      expiresAt: row.expires_at || row.expiresAt,
      acceptedAt: row.accepted_at || row.acceptedAt,
      // Teacher assessments & lesson plans
      teacherId: row.teacher_id || row.teacherId,
      teacherName: row.teacher_name || row.teacherName,
      classId: row.class_id || row.classId,
      assignedTo: row.assigned_to || row.assignedTo,
      itemId: row.item_id || row.itemId,
      itemName: row.item_name || row.itemName,
      requestedBy: row.requested_by || row.requestedBy,
      approvedBy: row.approved_by || row.approvedBy,
      assigneeType: row.assignee_type || row.assigneeType,
      assigneeName: row.assignee_name || row.assigneeName,
      conditionOut: row.condition_out || row.conditionOut,
      conditionIn: row.condition_in || row.conditionIn,
      assignedDate: row.assigned_date || row.assignedDate,
      assignedBy: row.assigned_by || row.assignedBy,
      assignedByName: row.assigned_by_name || row.assignedByName,
      returnDate: row.return_date || row.returnDate,
      expectedReturnDate: row.expected_return_date || row.expectedReturnDate,
      returnedDate: row.returned_date || row.returnedDate,
      estimatedCost: row.estimated_cost || row.estimatedCost,
      requestedByName: row.requested_by_name || row.requestedByName,
      reviewNotes: row.review_notes || row.reviewNotes,
      studentName: row.student_name || row.studentName,
      parentName: row.parent_name || row.parentName,
      parentEmail: row.parent_email || row.parentEmail,
      parentPhone: row.parent_phone || row.parentPhone,
      fileName: row.file_name || row.fileName,
      fileData: row.file_data || row.fileData,
      reviewedDate: row.reviewed_date || row.reviewedDate,
      reviewedBy: row.reviewed_by || row.reviewedBy,
      performedBy: row.performed_by || row.performedBy,
      recipientName: row.recipient_name || row.recipientName,
      userName: row.user_name || row.userName,
    }));
  }

  // ─────────────────────────────────────────
  // Per-table ORDER BY column overrides
  // Use when a table's primary timestamp is not named created_at
  // ─────────────────────────────────────────
  _orderByColumn = {
    payment_transactions: 'initiated_at',  // uses initiated_at, no created_at column
  };

  // ─────────────────────────────────────────
  // Column whitelists per Supabase table
  // Only these columns are sent to the DB — everything else is stripped.
  // ─────────────────────────────────────────
  _tableColumns = {
    students: ['id', 'name', 'grade', 'section', 'roll_no', 'status', 'attendance', 'fees', 'photo', 'date_of_birth', 'gender', 'blood_group', 'admission_date', 'previous_school', 'email', 'phone', 'address', 'father', 'mother', 'guardian', 'emergency_contacts', 'created_at', 'updated_at', 'auth_id'],
    staff: ['id', 'name', 'role', 'type', 'subjects', 'classes', 'attendance', 'photo', 'email', 'phone', 'address', 'status', 'hire_date', 'salary', 'created_at', 'updated_at', 'auth_id'],
    classes: ['id', 'grade', 'section', 'class_teacher', 'student_count', 'room', 'academic_year', 'created_at', 'updated_at'],
    subject_catalog: ['id', 'name', 'code', 'grade', 'grades', 'icon', 'teacher_id', 'description', 'created_at', 'updated_at'],
    student_subjects: ['id', 'student_id', 'student_name', 'grade', 'section', 'academic_year', 'subjects', 'created_at', 'updated_at'],
    assessments: ['id', 'name', 'subject', 'grade', 'section', 'date', 'total_marks', 'description', 'status', 'created_by', 'created_at', 'updated_at', 'type', 'term', 'academic_year'],
    grades: ['id', 'student_id', 'assessment_id', 'subject', 'term', 'academic_year', 'score', 'total_marks', 'percentage', 'grade', 'remarks', 'graded_by', 'created_at', 'updated_at'],
    student_assignments: ['id', 'student_id', 'subject_id', 'subject_name', 'title', 'type', 'status', 'total_marks', 'score', 'grade', 'due_date', 'submitted_date', 'remarks', 'created_at', 'updated_at'],
    fees_payments: ['id', 'student_id', 'student_name', 'amount', 'fee_type', 'term', 'academic_year', 'status', 'payment_date', 'payment_method', 'receipt_no', 'notes', 'recorded_by', 'created_at', 'updated_at', 'transaction_ref', 'student_roll_no', 'grade', 'section', 'receipt_url', 'verified_by', 'verified_at', 'rejection_reason'],
    inventory: ['id', 'name', 'category', 'quantity', 'available', 'condition', 'location', 'unit_price', 'unit_cost', 'supplier', 'description', 'last_updated', 'created_at', 'updated_at', 'unit', 'min_stock', 'allocated', 'date_added'],
    invitations: ['id', 'email', 'role', 'token', 'status', 'invited_by', 'metadata', 'expires_at', 'accepted_at', 'created_at', 'school_id', 'full_name'],
    student_schedules: ['id', 'student_id', 'day', 'period', 'subject', 'teacher', 'room', 'start_time', 'end_time', 'term', 'academic_year', 'created_at', 'updated_at'],
    school_schedules: ['id', 'type', 'title', 'description', 'grade', 'section', 'day', 'start_time', 'end_time', 'start_date', 'end_date', 'room', 'teacher', 'subject', 'period', 'recurring', 'status', 'academic_year', 'created_at', 'updated_at'],
    lesson_plans: ['id', 'teacher_id', 'subject', 'grade', 'section', 'topic', 'title', 'class', 'objectives', 'materials', 'activities', 'assessment', 'homework', 'notes', 'date', 'duration', 'status', 'created_at', 'updated_at'],
    teacher_assessments: ['id', 'teacher_id', 'teacher_name', 'title', 'name', 'subject', 'grade', 'section', 'class_id', 'type', 'date', 'total_marks', 'duration', 'instructions', 'status', 'description', 'created_at', 'updated_at'],
    inventory_requests: ['id', 'item_id', 'item_name', 'requested_by', 'requested_by_name', 'department', 'quantity', 'reason', 'status', 'approved_by', 'notes', 'created_at', 'updated_at', 'estimated_cost', 'justification', 'priority', 'reviewed_by', 'reviewed_date', 'review_notes', 'category'],
    inventory_assignments: ['id', 'item_id', 'item_name', 'assigned_to', 'assignee_type', 'assignee_name', 'quantity', 'condition_out', 'condition_in', 'condition', 'assigned_date', 'return_date', 'expected_return_date', 'returned_date', 'status', 'notes', 'created_at', 'updated_at', 'assigned_by', 'assigned_by_name'],
    applications: ['id', 'application_number', 'student_name', 'student_dob', 'student_gender', 'grade', 'previous_school', 'parent_name', 'parent_email', 'parent_phone', 'parent_address', 'application_form_url', 'birth_certificate_url', 'passport_photo_url', 'previous_report_url', 'other_documents', 'application_fee_amount', 'application_fee_paid', 'payment_reference', 'payment_date', 'payment_method', 'receipt_url', 'payment_verified_by', 'payment_verified_at', 'payment_rejection_reason', 'status', 'reviewed_by', 'reviewed_date', 'notes', 'rejection_reason', 'student_id', 'guardian_auth_id', 'submitted_date', 'created_at', 'updated_at'],
    audit_logs: ['id', 'action', 'performed_by', 'target', 'details', 'timestamp', 'created_at', 'performer_id'],
    email_logs: ['id', 'recipient', 'recipient_name', 'subject', 'status', 'timestamp', 'created_at'],
    inventory_transactions: ['id', 'type', 'item_id', 'item_name', 'quantity', 'user_name', 'details', 'timestamp', 'created_at', 'updated_at'],
  }

  // camelCase app field → snake_case DB column mapping
  _camelToSnake = {
    createdAt: 'created_at', updatedAt: 'updated_at',
    dateOfBirth: 'date_of_birth', admissionDate: 'admission_date',
    bloodGroup: 'blood_group', authId: 'auth_id', rollNo: 'roll_no',
    emergencyContacts: 'emergency_contacts', hireDate: 'hire_date',
    classTeacher: 'class_teacher', studentCount: 'student_count',
    paymentDate: 'payment_date', paymentMethod: 'payment_method',
    receiptNo: 'receipt_no', feeType: 'fee_type',
    transactionRef: 'transaction_ref', studentRollNo: 'student_roll_no',
    academicYear: 'academic_year', studentId: 'student_id',
    studentName: 'student_name', recordedBy: 'recorded_by',
    totalMarks: 'total_marks', createdBy: 'created_by',
    assessmentId: 'assessment_id', gradedBy: 'graded_by',
    subjectId: 'subject_id', subjectName: 'subject_name',
    dueDate: 'due_date', submittedDate: 'submitted_date',
    markedBy: 'marked_by',
    startTime: 'start_time', endTime: 'end_time',
    startDate: 'start_date', endDate: 'end_date',
    unitPrice: 'unit_price', lastUpdated: 'last_updated',
    invitedBy: 'invited_by', expiresAt: 'expires_at',
    acceptedAt: 'accepted_at', teacherId: 'teacher_id', teacherName: 'teacher_name',
    classId: 'class_id',
    assignedTo: 'assigned_to',
    itemId: 'item_id', itemName: 'item_name',
    requestedBy: 'requested_by', approvedBy: 'approved_by',
    assigneeType: 'assignee_type',
    conditionOut: 'condition_out', conditionIn: 'condition_in',
    assignedDate: 'assigned_date', returnDate: 'return_date',
    assigneeName: 'assignee_name', assignedBy: 'assigned_by',
    assignedByName: 'assigned_by_name',
    expectedReturnDate: 'expected_return_date', returnedDate: 'returned_date',
    estimatedCost: 'estimated_cost', requestedByName: 'requested_by_name',
    reviewNotes: 'review_notes', reviewedDate: 'reviewed_date', reviewedBy: 'reviewed_by',
    parentName: 'parent_name', parentEmail: 'parent_email',
    parentPhone: 'parent_phone', parentAddress: 'parent_address',
    fileName: 'file_name', fileData: 'file_data',
    performedBy: 'performed_by', recipientName: 'recipient_name', userName: 'user_name',
    performerId: 'performer_id',
    receiptUrl: 'receipt_url', verifiedBy: 'verified_by', verifiedAt: 'verified_at', rejectionReason: 'rejection_reason',
    applicationNumber: 'application_number', studentDob: 'student_dob',
    studentGender: 'student_gender', previousSchool: 'previous_school',
    applicationFormUrl: 'application_form_url',
    birthCertificateUrl: 'birth_certificate_url',
    passportPhotoUrl: 'passport_photo_url',
    previousReportUrl: 'previous_report_url',
    otherDocuments: 'other_documents',
    applicationFeeAmount: 'application_fee_amount',
    applicationFeePaid: 'application_fee_paid',
    paymentReference: 'payment_reference',
    guardianAuthId: 'guardian_auth_id',
    paymentVerifiedBy: 'payment_verified_by', paymentVerifiedAt: 'payment_verified_at',
    paymentRejectionReason: 'payment_rejection_reason',
    minStock: 'min_stock',
    unitCost: 'unit_cost',
    dateAdded: 'date_added',
  }

  /**
   * Build a Supabase-safe row: convert camelCase → snake_case,
   * then strip any key NOT in the table's column whitelist.
   */
  _buildRow(table, item) {
    const allowedCols = this._tableColumns[table];
    if (!allowedCols) return { ...item }; // unknown table, pass through

    const row = {};
    for (const [key, value] of Object.entries(item)) {
      // Convert camelCase to snake_case if mapping exists
      const snakeKey = this._camelToSnake[key] || key;
      // Only include if column exists in the table
      if (allowedCols.includes(snakeKey)) {
        row[snakeKey] = value;
      }
    }
    return row;
  }

  /** @deprecated — kept for backward compat, delegates to _buildRow */
  _itemToRow(collection, item) {
    const table = this._tableMap[collection];
    return table ? this._buildRow(table, item) : { ...item };
  }

  // ─────────────────────────────────────────
  // REALTIME SYNC — Supabase postgres_changes
  // ─────────────────────────────────────────
  _startRealtimeSync() {
    if (!window.supabaseReady || !supabaseClient) return;

    // Build a reverse map: supabase_table → collection name
    this._tableToCollection = {};
    for (const [col, table] of Object.entries(this._tableMap)) {
      if (table && !this._tableToCollection[table]) {
        this._tableToCollection[table] = col;
      }
    }

    const channel = supabaseClient.channel('schema-db-changes');

    // Subscribe to ALL tables in our map
    const tables = [...new Set(Object.values(this._tableMap).filter(Boolean))];
    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => this._handleRealtimeEvent(table, payload)
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('DataManager: 🔴 Realtime connected — listening for changes on', tables.length, 'tables');
      } else if (status === 'CHANNEL_ERROR') {
        console.warn('DataManager: Realtime channel error — polling will keep data fresh');
      }
    });

    this._realtimeChannel = channel;
  }

  _handleRealtimeEvent(table, payload) {
    if (this._syncPaused) return;

    const collection = this._tableToCollection[table];
    if (!collection || !this._cache[collection]) return;

    const eventType = payload.eventType;
    const newRow = payload.new;
    const oldRow = payload.old;


    let changed = false;

    if (eventType === 'INSERT') {
      const normalized = this._normalizeRows(collection, [newRow])[0];
      // Avoid duplicate (in case we inserted this ourselves)
      const exists = this._cache[collection].find(item => item.id === normalized.id);
      if (!exists) {
        this._cache[collection].push(normalized);
        changed = true;
      }
    } else if (eventType === 'UPDATE') {
      const normalized = this._normalizeRows(collection, [newRow])[0];
      const idx = this._cache[collection].findIndex(item => item.id === normalized.id);
      if (idx !== -1) {
        // Only update if the data actually changed
        const current = JSON.stringify(this._cache[collection][idx]);
        const incoming = JSON.stringify(normalized);
        if (current !== incoming) {
          this._cache[collection][idx] = normalized;
          changed = true;
        }
      } else {
        // Item not in cache yet, add it
        this._cache[collection].push(normalized);
        changed = true;
      }
    } else if (eventType === 'DELETE') {
      const id = oldRow?.id;
      if (id) {
        const before = this._cache[collection].length;
        this._cache[collection] = this._cache[collection].filter(item => item.id !== id);
        changed = this._cache[collection].length !== before;
      }
    }

    if (changed) {
      this._emitChange(collection, eventType);
    }
  }

  // ─────────────────────────────────────────
  // POLLING FALLBACK — catches anything Realtime misses
  // ─────────────────────────────────────────
  _startPolling() {
    if (!window.supabaseReady) return;

    // Poll every 60 seconds — Realtime handles instant updates; polling is just a safety net
    this._pollInterval = setInterval(() => this._pollForChanges(), 60000);
  }

  async _pollForChanges() {
    if (this._syncPaused || !window.supabaseReady) return;

    // Only poll collections that have been loaded
    const loadedCollections = Object.keys(this._loaded).filter(k => this._loaded[k]);

    for (const collection of loadedCollections) {
      const table = this._tableMap[collection];
      if (!table) continue;

      try {
        const { data, error } = await supabaseClient
          .from(table)
          .select('*')
          .order('created_at', { ascending: true });

        if (error || !data) continue;

        const normalized = this._normalizeRows(collection, data);
        const oldJson = JSON.stringify(this._cache[collection] || []);
        const newJson = JSON.stringify(normalized);

        if (oldJson !== newJson) {
          this._cache[collection] = normalized;
          this._emitChange(collection, 'POLL');
        }
      } catch (err) {
        // Silent fail — will retry next cycle
      }
    }
  }

  stopSync() {
    if (this._realtimeChannel) {
      supabaseClient.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  // ─────────────────────────────────────────
  // CHANGE EVENT — notify the UI to re-render
  // ─────────────────────────────────────────
  _emitChange(collection, eventType) {
    window.dispatchEvent(new CustomEvent('datamanager:change', {
      detail: { collection, eventType, timestamp: Date.now() }
    }));
  }

  // ─────────────────────────────────────────
  // Legacy localStorage helpers (fallback)
  // ─────────────────────────────────────────
  _legacyInit() {
    const flag = localStorage.getItem('school_portal_initialized');
    if (!flag) {
      console.log('DataManager: localStorage mode — seeding sample data.');
      this.seedSampleData();
      localStorage.setItem('school_portal_initialized', 'true');
    }
  }

  _legacyGetAll(collection) {
    try {
      const raw = localStorage.getItem(collection);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  _legacyPersistAll(collection) {
    try {
      localStorage.setItem(collection, JSON.stringify(this._cache[collection] || []));
    } catch (e) {
      console.warn('DataManager: localStorage write failed:', e.message);
    }
  }

  // ─────────────────────────────────────────
  // Seed sample data (localStorage fallback only)
  // ─────────────────────────────────────────
  seedSubjectCatalogLocal() {
    const subjects = [
      { id: 'MATH-10', name: 'Mathematics', code: 'MATH-10', grade: '10', icon: '📐' },
      { id: 'ENG-10', name: 'English', code: 'ENG-10', grade: '10', icon: '📖' },
      { id: 'PHY-10', name: 'Physics', code: 'PHY-10', grade: '10', icon: '⚡' },
      { id: 'CHEM-10', name: 'Chemistry', code: 'CHEM-10', grade: '10', icon: '🧪' },
      { id: 'BIO-10', name: 'Biology', code: 'BIO-10', grade: '10', icon: '🌱' },
      { id: 'MATH-9', name: 'Mathematics', code: 'MATH-9', grade: '9', icon: '📐' },
      { id: 'ENG-9', name: 'English', code: 'ENG-9', grade: '9', icon: '📖' },
      { id: 'SCI-9', name: 'Basic Science', code: 'SCI-9', grade: '9', icon: '🔬' },
      { id: 'MATH-8', name: 'Mathematics', code: 'MATH-8', grade: '8', icon: '📐' },
      { id: 'ENG-8', name: 'English', code: 'ENG-8', grade: '8', icon: '📖' },
    ];
    if (!localStorage.getItem('subjectCatalog')) {
      localStorage.setItem('subjectCatalog', JSON.stringify(subjects));
    }
  }

  seedSampleData() {
    // Students
    if (!localStorage.getItem('students')) {
      const students = [
        { id: 'STU-2024-001', name: 'Amara Okafor', grade: 'JSS3', section: 'A', status: 'active', attendance: 92, fees: 'paid', gender: 'female', bloodGroup: 'O+', admissionDate: '2022-09-01', phone: '+234 801 234 5678', address: { street: '12 Elm St', city: 'Lagos', state: 'Lagos' }, father: { name: 'Emmanuel Okafor', phone: '+234 802 345 6789' }, mother: { name: 'Grace Okafor', phone: '+234 803 456 7890' } },
        { id: 'STU-2024-002', name: 'Chisom Eze', grade: 'JSS3', section: 'A', status: 'active', attendance: 85, fees: 'pending', gender: 'male', bloodGroup: 'A+', admissionDate: '2022-09-01', phone: '+234 801 234 5679' },
        { id: 'STU-2024-003', name: 'Fatima Abdullahi', grade: 'JSS3', section: 'B', status: 'active', attendance: 94, fees: 'paid', gender: 'female', bloodGroup: 'B+', admissionDate: '2021-09-01' },
        { id: 'STU-2024-004', name: 'David Mensah', grade: 'JSS2', section: 'A', status: 'active', attendance: 88, fees: 'partial', gender: 'male' },
        { id: 'STU-2024-005', name: 'Ngozi Adeyemi', grade: 'JSS2', section: 'B', status: 'active', attendance: 90, fees: 'paid', gender: 'female' },
        { id: 'STU-2024-006', name: 'Kwame Asante', grade: 'JSS1', section: 'A', status: 'active', attendance: 78, fees: 'overdue', gender: 'male' },
      ];
      localStorage.setItem('students', JSON.stringify(students));
    }

    // Staff
    if (!localStorage.getItem('staff')) {
      const staff = [
        { id: 'TCH-2024-001', name: 'Dr. Adebayo Ogundimu', role: 'Mathematics Teacher', type: 'teaching', subjects: ['Mathematics'], classes: ['JSS3-A', 'JSS2-A'], attendance: 96, email: 'adebayo@school.edu', phone: '+234 802 111 2222', status: 'active', hireDate: '2018-09-01', salary: 180000 },
        { id: 'TCH-2024-002', name: 'Mrs. Pearl Nwosu', role: 'English Teacher', type: 'teaching', subjects: ['English'], classes: ['JSS3-B', 'JSS2-B'], attendance: 94, email: 'pearl@school.edu', phone: '+234 803 222 3333', status: 'active', hireDate: '2019-01-10', salary: 160000 },
        { id: 'TCH-2024-003', name: 'Mr. Samuel Dike', role: 'Physics Teacher', type: 'teaching', subjects: ['Physics'], classes: ['JSS3-A'], attendance: 91, email: 'samuel@school.edu', phone: '+234 804 333 4444', status: 'active', hireDate: '2020-09-01', salary: 155000 },
        { id: 'STAFF-001', name: 'Mr. Emeka Ikenna', role: 'Admin Officer', type: 'non-teaching', subjects: [], classes: [], attendance: 98, email: 'emeka@school.edu', phone: '+234 805 444 5555', status: 'active', hireDate: '2017-03-15', salary: 120000 },
      ];
      localStorage.setItem('staff', JSON.stringify(staff));
    }

    // Classes
    if (!localStorage.getItem('classes')) {
      const classes = [
        { id: 'CLS-001', grade: 'JSS3', section: 'A', classTeacher: 'Dr. Adebayo Ogundimu', studentCount: 28, room: 'Room 101', academicYear: '2025-2026' },
        { id: 'CLS-002', grade: 'JSS3', section: 'B', classTeacher: 'Mrs. Pearl Nwosu', studentCount: 26, room: 'Room 102', academicYear: '2025-2026' },
        { id: 'CLS-003', grade: 'JSS2', section: 'A', classTeacher: 'Mr. Samuel Dike', studentCount: 30, room: 'Room 201', academicYear: '2025-2026' },
        { id: 'CLS-004', grade: 'JSS2', section: 'B', classTeacher: '', studentCount: 27, room: 'Room 202', academicYear: '2025-2026' },
        { id: 'CLS-005', grade: 'JSS1', section: 'A', classTeacher: '', studentCount: 25, room: 'Room 301', academicYear: '2025-2026' },
      ];
      localStorage.setItem('classes', JSON.stringify(classes));
    }

    // Payments
    if (!localStorage.getItem('payments')) {
      const payments = [
        { id: 'PAY-001', studentId: 'STU-2024-001', studentName: 'Amara Okafor', amount: 75000, feeType: 'tuition', term: 'First Term', academicYear: '2025-2026', status: 'paid', paymentDate: '2025-09-05', paymentMethod: 'bank_transfer', receiptNo: 'RCP-0001' },
        { id: 'PAY-002', studentId: 'STU-2024-002', studentName: 'Chisom Eze', amount: 75000, feeType: 'tuition', term: 'First Term', academicYear: '2025-2026', status: 'pending', paymentDate: null },
        { id: 'PAY-003', studentId: 'STU-2024-003', studentName: 'Fatima Abdullahi', amount: 75000, feeType: 'tuition', term: 'First Term', academicYear: '2025-2026', status: 'paid', paymentDate: '2025-09-10', paymentMethod: 'cash', receiptNo: 'RCP-0002' },
      ];
      localStorage.setItem('payments', JSON.stringify(payments));
    }

    // Inventory
    if (!localStorage.getItem('inventory')) {
      const inventory = [
        { id: 'INV-001', name: 'Scientific Calculators', category: 'Electronics', quantity: 50, available: 32, condition: 'good', location: 'Science Lab', unitPrice: 8500, minStock: 10 },
        { id: 'INV-002', name: 'Textbooks (Maths Gr10)', category: 'Books', quantity: 100, available: 72, condition: 'good', location: 'Library', unitPrice: 4200, minStock: 20 },
        { id: 'INV-003', name: 'Whiteboard Markers', category: 'Stationery', quantity: 12, available: 12, condition: 'new', location: 'Store', unitPrice: 350, minStock: 15 },
      ];
      localStorage.setItem('inventory', JSON.stringify(inventory));
    }

    // Assessments
    if (!localStorage.getItem('assessments')) {
      const assessments = [
        { id: 'EXAM-001', name: 'First Term Maths Exam', subject: 'Mathematics', grade: 'JSS3', section: 'A', date: '2025-11-15', totalMarks: 100, status: 'completed', description: 'End of first term examination' },
        { id: 'EXAM-002', name: 'Physics Test 1', subject: 'Physics', grade: 'JSS3', section: 'A', date: '2025-10-20', totalMarks: 50, status: 'completed' },
      ];
      localStorage.setItem('assessments', JSON.stringify(assessments));
    }

    this.seedSubjectCatalogLocal();
  }
}

// Export singleton
const dataManager = new DataManager();
