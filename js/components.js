// ============================================
// REUSABLE UI COMPONENTS
// ============================================

// Toast Notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    z-index: 10000;
    animation: slideDown 0.3s ease-out;
    max-width: 400px;
  `;

  const colors = {
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
    info: 'var(--color-info)'
  };

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 20px;">${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}</span>
      <span style="color: ${colors[type]}; font-weight: 500;">${message}</span>
    </div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideUp 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Modal Component
function createModal(title, content, actions = []) {
  // Support createModal(title, content, 'large') — treat string as size hint
  let sizeClass = '';
  if (typeof actions === 'string') {
    sizeClass = actions;
    actions = [];
  }
  if (!Array.isArray(actions)) actions = [];

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal' + (sizeClass ? ' modal-' + sizeClass : '');

  const actionsHTML = actions.map(action =>
    `<button class="btn ${action.class || 'btn-primary'}" onclick="${action.onclick}">${action.label}</button>`
  ).join('');

  modal.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">${title}</h2>
      <button class="modal-close" onclick="closeModal(this)">×</button>
    </div>
    <div class="modal-body">
      ${content}
    </div>
    ${actions.length > 0 ? `<div class="modal-footer">${actionsHTML}</div>` : ''}
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
    }
  });

  return backdrop;
}

function closeModal(button) {
  if (button && button.closest) {
    const backdrop = button.closest('.modal-backdrop');
    if (backdrop) backdrop.remove();
  } else {
    // Called without argument — remove the last (topmost) modal backdrop
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 0) backdrops[backdrops.length - 1].remove();
  }
}

// Alias used by modules (user-management, teacher-portal, applications)
function showModal(title, content, actions) {
  return createModal(title, content, actions || []);
}

// Confirmation Dialog
function confirmDialog(message, onConfirm) {
  const content = `<p style="color: var(--text-primary); font-size: var(--font-size-lg);">${message}</p>`;
  const actions = [
    { label: 'Cancel', class: 'btn-ghost', onclick: 'closeModal(this)' },
    { label: 'Confirm', class: 'btn-primary', onclick: `closeModal(this); (${onConfirm})()` }
  ];
  createModal('Confirm Action', content, actions);
}

// Data Table Component
function createDataTable(columns, data, options = {}) {
  const {
    searchable = true,
    sortable = true,
    actions = [],
    emptyMessage = 'No data available'
  } = options;

  let tableHTML = '<div class="table-container">';

  if (searchable) {
    tableHTML += `
      <div style="padding: 16px; border-bottom: 1px solid var(--border-primary);">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" placeholder="Search..." onkeyup="filterTable(this)">
        </div>
      </div>
    `;
  }

  if (data.length === 0) {
    tableHTML += `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3 class="empty-state-title">No Data Found</h3>
        <p class="empty-state-description">${emptyMessage}</p>
      </div>
    `;
  } else {
    tableHTML += '<table class="table"><thead><tr>';

    columns.forEach(col => {
      tableHTML += `<th>${col.label}</th>`;
    });

    if (actions.length > 0) {
      tableHTML += '<th>Actions</th>';
    }

    tableHTML += '</tr></thead><tbody>';

    data.forEach(row => {
      tableHTML += '<tr>';
      columns.forEach(col => {
        const value = col.render ? col.render(row[col.key], row) : row[col.key];
        tableHTML += `<td>${value}</td>`;
      });

      if (actions.length > 0) {
        tableHTML += '<td><div class="table-actions">';
        actions.forEach(action => {
          tableHTML += `<button class="table-action-btn" onclick="${action.onclick}('${row.id}')" title="${action.label}">${action.icon}</button>`;
        });
        tableHTML += '</div></td>';
      }

      tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';
  }

  tableHTML += '</div>';
  return tableHTML;
}

// Filter table rows
function filterTable(input) {
  const filter = input.value.toLowerCase();
  const table = input.closest('.table-container').querySelector('table');
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

// Stat Card Component
function createStatCard(label, value, change, type = 'primary') {
  return `
    <div class="stat-card ${type} animate-slideUp">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${change ? `<div class="stat-change ${change > 0 ? 'positive' : 'negative'}">
        ${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%
      </div>` : ''}
    </div>
  `;
}

// Badge Component
function createBadge(text, type = 'primary') {
  return `<span class="badge badge-${type}">${text}</span>`;
}

// Format Date
// FIX BUG #8: Enhanced date formatting with validation
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Format Date - Long format (e.g., "Monday, March 12, 2026")
function formatDateLong(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Format Date - Short format (e.g., "3/12/2026")
function formatDateShort(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-US');
}

// Format Time Ago
function timeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((new Date() - date) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }

  return 'Just now';
}

// Format Currency (Nigerian Naira)
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Loading Spinner
function showLoading(container) {
  container.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; min-height: 300px;">
      <div class="spinner"></div>
    </div>
  `;
}

// FIX BUG #13: Pagination Component
function createPagination(options) {
  const {
    totalItems = 0,
    currentPage = 1,
    pageSize = 25,
    onPageChange = () => {},
    onPageSizeChange = () => {},
    pageSizeOptions = [10, 25, 50, 100]
  } = options;

  const totalPages = Math.ceil(totalItems / pageSize);
  
  if (totalItems === 0) {
    return '<div style="text-align: center; color: var(--text-secondary); padding: var(--space-4);">No items to display</div>';
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-4); border-top: 1px solid var(--border-primary);">
      <!-- Items info -->
      <div style="color: var(--text-secondary); font-size: var(--font-size-sm);">
        Showing ${startItem}-${endItem} of ${totalItems} items
      </div>

      <!-- Pagination controls -->
      <div style="display: flex; gap: var(--space-2); align-items: center;">
        <!-- Page size selector -->
        <select 
          onchange="${onPageSizeChange.name}(parseInt(this.value))"
          style="padding: 6px 12px; border: 1px solid var(--border-primary); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm);">
          ${pageSizeOptions.map(size => `
            <option value="${size}" ${size === pageSize ? 'selected' : ''}>${size} per page</option>
          `).join('')}
        </select>

        <!-- Navigation buttons -->
        <div style="display: flex; gap: var(--space-1);">
          <button 
            class="btn btn-sm btn-ghost" 
            onclick="${onPageChange.name}(1)"
            ${currentPage === 1 ? 'disabled' : ''}
            title="First page">
            ⟪
          </button>
          <button 
            class="btn btn-sm btn-ghost" 
            onclick="${onPageChange.name}(${currentPage - 1})"
            ${currentPage === 1 ? 'disabled' : ''}
            title="Previous page">
            ‹
          </button>
          
          <span style="padding: 6px 12px; color: var(--text-primary); font-size: var(--font-size-sm);">
            Page ${currentPage} of ${totalPages}
          </span>
          
          <button 
            class="btn btn-sm btn-ghost" 
            onclick="${onPageChange.name}(${currentPage + 1})"
            ${currentPage === totalPages ? 'disabled' : ''}
            title="Next page">
            ›
          </button>
          <button 
            class="btn btn-sm btn-ghost" 
            onclick="${onPageChange.name}(${totalPages})"
            ${currentPage === totalPages ? 'disabled' : ''}
            title="Last page">
            ⟫
          </button>
        </div>
      </div>
    </div>
  `;
}

// Paginate array helper
function paginateArray(array, page = 1, pageSize = 25) {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  return array.slice(startIndex, endIndex);
}

// FIX BUG #14: Academic Year Utilities
function getCurrentAcademicYear() {
  // Get from school config if available
  const config = JSON.parse(localStorage.getItem('schoolConfig') || '{}');
  if (config.academicYear) {
    return config.academicYear;
  }
  
  // Calculate based on current date (September-August cycle)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  // If before September (month 8), use previous year as start
  if (currentMonth < 8) {
    return `${currentYear - 1}-${currentYear}`;
  } else {
    return `${currentYear}-${currentYear + 1}`;
  }
}

function setAcademicYear(year) {
  const config = JSON.parse(localStorage.getItem('schoolConfig') || '{}');
  config.academicYear = year;
  localStorage.setItem('schoolConfig', JSON.stringify(config));
  
  // Trigger update event
  window.dispatchEvent(new CustomEvent('academicyear:change', { detail: { year } }));
}

function getAcademicYearOptions() {
  const currentYear = new Date().getFullYear();
  const options = [];
  
  // Generate 5 years: 2 past, current, 2 future
  for (let i = -2; i <= 2; i++) {
    const startYear = currentYear + i;
    const endYear = startYear + 1;
    options.push(`${startYear}-${endYear}`);
  }
  
  return options;
}

// ============================================================
//  UNIVERSAL RECEIPT SYSTEM
//  generateReceiptHTML(data)  — builds the receipt markup
//  printReceipt(data)         — opens a print window
//  showReceiptModal(data)     — shows an in-page preview modal
// ============================================================

/**
 * Build receipt data object from a fees_payments row or feeSchedule item.
 * Convenience helper so callers don't have to normalise field names.
 */
function buildReceiptData(payment, student) {
  const s = student || {};
  const p = payment || {};
  const items = p.items || [{ name: p.fee_type || p.feeType || p.feeTypeName || 'Fee Payment', amount: parseFloat(p.amount) || 0 }];
  const totalAmount = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  return {
    receiptNo:      p.receipt_no      || p.receiptNo      || '—',
    studentName:    p.student_name    || p.studentName    || s.name            || '—',
    studentGrade:   p.grade           || s.grade          || '—',
    studentSection: p.section         || s.section        || '',
    rollNo:         p.student_roll_no || p.studentRollNo  || s.rollNo || s.roll_no || '—',
    items,
    totalAmount,
    paymentMethod:  (p.payment_method || p.paymentMethod || 'paystack').replace(/-/g, ' '),
    paymentDate:    p.payment_date    || p.paymentDate    || p.dateStr || new Date().toISOString().split('T')[0],
    transactionRef: p.transaction_ref || p.transactionRef || '—',
    term:           p.term            || '—',
    academicYear:   p.academic_year   || p.academicYear   || window.CURRENT_ACADEMIC_YEAR || '—',
    status:         p.status          || 'paid',
    schoolName:     (typeof schoolConfig !== 'undefined' && schoolConfig.getSchoolName?.()) || window.SCHOOL_NAME || 'TBD Academy',
    schoolAddress:  (typeof schoolConfig !== 'undefined' && schoolConfig.getSchoolAddress?.()) || 'School Address, Nigeria',
  };
}

/**
 * Generate a professional HTML receipt string.
 * @param {object} data  Output of buildReceiptData()
 */
function generateReceiptHTML(data) {
  const d = data || {};
  const isPaid   = (d.status || 'paid').toLowerCase() === 'paid';
  const dateStr  = d.paymentDate ? new Date(d.paymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const items    = d.items && d.items.length ? d.items : [{ name: 'Fee Payment', amount: d.totalAmount || 0 }];
  const methodLabel = (d.paymentMethod || 'Paystack').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:0.875rem;">${item.name || 'Fee'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:0.875rem;font-weight:600;">
        ₦${(parseFloat(item.amount) || 0).toLocaleString('en-NG')}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Receipt ${d.receiptNo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px 48px; }
    .receipt { width: 100%; max-width: 680px; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.14); }

    /* ── Header ── */
    .rcpt-header { background: linear-gradient(135deg, #1d4ed8 0%, #0369a1 60%, #0891b2 100%); padding: 28px 32px; color: #fff; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .school-block { flex: 1; }
    .school-initials { width: 52px; height: 52px; background: rgba(255,255,255,0.2); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 800; margin-bottom: 10px; border: 2px solid rgba(255,255,255,0.35); }
    .school-name { font-size: 1.15rem; font-weight: 700; letter-spacing: 0.01em; line-height: 1.3; }
    .school-address { font-size: 0.75rem; opacity: 0.75; margin-top: 3px; line-height: 1.5; }
    .rcpt-title-block { text-align: right; flex-shrink: 0; }
    .rcpt-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.7; }
    .rcpt-title { font-size: 1.35rem; font-weight: 800; letter-spacing: 0.04em; margin-top: 4px; }
    .rcpt-no { font-size: 0.85rem; opacity: 0.85; margin-top: 5px; font-weight: 500; font-family: monospace; }

    /* ── Status stamp ── */
    .stamp-wrap { display: flex; justify-content: center; padding: 16px 32px 0; }
    .stamp { display: inline-flex; align-items: center; gap: 8px; padding: 7px 22px; border-radius: 999px; font-size: 0.82rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
    .stamp-paid { background: #dcfce7; color: #166534; border: 2px solid #86efac; }
    .stamp-pending { background: #fef9c3; color: #713f12; border: 2px solid #fde047; }

    /* ── Meta row ── */
    .rcpt-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-bottom: 1px solid #e2e8f0; margin: 16px 32px 0; padding-bottom: 16px; }
    .meta-item { padding: 0 12px; border-right: 1px solid #e2e8f0; }
    .meta-item:first-child { padding-left: 0; }
    .meta-item:last-child { border-right: none; }
    .meta-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 3px; }
    .meta-value { font-size: 0.875rem; font-weight: 600; color: #1e293b; }

    /* ── Body sections ── */
    .rcpt-body { padding: 20px 32px 24px; }
    .section { margin-bottom: 20px; }
    .section-heading { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; padding-bottom: 8px; border-bottom: 2px solid #f1f5f9; margin-bottom: 12px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .info-cell label { font-size: 0.68rem; color: #94a3b8; text-transform: uppercase; font-weight: 600; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
    .info-cell span { font-size: 0.875rem; font-weight: 600; color: #1e293b; }

    /* ── Items table ── */
    .items-table { width: 100%; border-collapse: collapse; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
    .items-table thead { background: #f8fafc; }
    .items-table th { padding: 10px 14px; text-align: left; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    .items-table th:last-child { text-align: right; }
    .items-table tfoot tr { background: #f8fafc; }
    .items-table tfoot td { padding: 12px 14px; font-weight: 700; font-size: 0.95rem; color: #1e293b; border-top: 2px solid #e2e8f0; }
    .items-table tfoot td:last-child { text-align: right; color: #15803d; font-size: 1rem; }

    /* ── Total highlight ── */
    .total-banner { background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; border: 1px solid #86efac; }
    .total-banner .tl { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #166534; }
    .total-banner .tv { font-size: 1.6rem; font-weight: 800; color: #15803d; }
    .total-banner .ts { font-size: 2rem; font-weight: 900; color: rgba(21,128,61,0.15); letter-spacing: 0.1em; transform: rotate(-12deg); display: inline-block; }

    /* ── Payment info row ── */
    .pay-info { display: flex; gap: 0; background: #f8fafc; border-radius: 10px; overflow: hidden; margin-top: 16px; border: 1px solid #e2e8f0; }
    .pay-cell { flex: 1; padding: 12px 16px; border-right: 1px solid #e2e8f0; }
    .pay-cell:last-child { border-right: none; }
    .pay-cell label { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.08em; display: block; margin-bottom: 3px; }
    .pay-cell span { font-size: 0.82rem; font-weight: 600; color: #1e293b; word-break: break-all; }

    /* ── Footer ── */
    .rcpt-footer { background: #f8fafc; padding: 14px 32px; border-top: 1px solid #e2e8f0; text-align: center; }
    .rcpt-footer p { font-size: 0.72rem; color: #94a3b8; margin: 0; line-height: 1.6; }
    .rcpt-footer strong { color: #64748b; }

    /* ── Print button (hidden in print) ── */
    .print-bar { display: flex; gap: 10px; justify-content: center; padding: 20px 0 0; }
    @media print {
      body { background: #fff; padding: 0; }
      .receipt { box-shadow: none; border-radius: 0; max-width: 100%; }
      .print-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div>
    <div class="receipt">
      <!-- Header -->
      <div class="rcpt-header">
        <div class="school-block">
          <div class="school-initials">${(d.schoolName || 'T').charAt(0)}</div>
          <div class="school-name">${d.schoolName || 'TBD Academy'}</div>
          <div class="school-address">${d.schoolAddress || ''}</div>
        </div>
        <div class="rcpt-title-block">
          <div class="rcpt-label">Official Document</div>
          <div class="rcpt-title">RECEIPT</div>
          <div class="rcpt-no">${d.receiptNo}</div>
        </div>
      </div>

      <!-- Status stamp -->
      <div class="stamp-wrap">
        <div class="stamp ${isPaid ? 'stamp-paid' : 'stamp-pending'}">
          ${isPaid ? '✅ PAYMENT CONFIRMED' : '⏳ PENDING VERIFICATION'}
        </div>
      </div>

      <!-- Meta row -->
      <div class="rcpt-meta">
        <div class="meta-item">
          <div class="meta-label">Date</div>
          <div class="meta-value">${dateStr}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Term</div>
          <div class="meta-value">${d.term || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Academic Year</div>
          <div class="meta-value">${d.academicYear || '—'}</div>
        </div>
      </div>

      <!-- Body -->
      <div class="rcpt-body">

        <!-- Student Info -->
        <div class="section">
          <div class="section-heading">Student Information</div>
          <div class="info-grid">
            <div class="info-cell">
              <label>Full Name</label>
              <span>${d.studentName}</span>
            </div>
            <div class="info-cell">
              <label>Roll Number</label>
              <span>${d.rollNo}</span>
            </div>
            <div class="info-cell">
              <label>Class</label>
              <span>Grade ${d.studentGrade}${d.studentSection ? ' – ' + d.studentSection : ''}</span>
            </div>
          </div>
        </div>

        <!-- Fee Items -->
        <div class="section">
          <div class="section-heading">Fee Details</div>
          <table class="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
            <tfoot>
              <tr>
                <td>Total Paid</td>
                <td>₦${(d.totalAmount || 0).toLocaleString('en-NG')}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Total highlight -->
        <div class="total-banner">
          <div>
            <div class="tl">Amount Paid</div>
            <div class="tv">₦${(d.totalAmount || 0).toLocaleString('en-NG')}</div>
          </div>
          <div class="ts">PAID</div>
        </div>

        <!-- Payment Info -->
        <div class="pay-info">
          <div class="pay-cell">
            <label>Payment Method</label>
            <span>${methodLabel}</span>
          </div>
          <div class="pay-cell">
            <label>Transaction Ref</label>
            <span style="font-family:monospace;">${d.transactionRef || '—'}</span>
          </div>
          <div class="pay-cell">
            <label>Receipt No.</label>
            <span style="font-family:monospace;">${d.receiptNo}</span>
          </div>
        </div>

      </div><!-- /rcpt-body -->

      <!-- Footer -->
      <div class="rcpt-footer">
        <p>
          <strong>This is an official computer-generated receipt.</strong><br>
          Please keep this for your records. For queries, contact the school bursary.
        </p>
      </div>
    </div><!-- /receipt -->

    <!-- Print/Download Controls -->
    <div class="print-bar">
      <button onclick="window.print()" style="padding:10px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer;">🖨️ Print / Save as PDF</button>
      <button onclick="window.close()" style="padding:10px 22px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer;">✕ Close</button>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate a comprehensive TERM STATEMENT HTML string.
 * Shows all fee schedule items with amount due, paid, balance, and status.
 * @param {object} data  Must include: allItems[], totalDue, totalPaid, balance, plus standard receipt fields.
 */
function generateTermReceiptHTML(data) {
  const d         = data || {};
  const isSettled = (d.balance || 0) <= 0;
  const progress  = d.totalDue > 0 ? Math.min(100, ((d.totalPaid || 0) / d.totalDue) * 100) : 0;
  const dateStr   = d.paymentDate
    ? new Date(d.paymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

  const statusMap = {
    paid:                   { icon: '✅', label: 'Paid',              color: '#15803d', bg: '#dcfce7' },
    partial:                { icon: '⏳', label: 'Partial',           color: '#92400e', bg: '#fef3c7' },
    'not-paid':             { icon: '❌', label: 'Not Paid',          color: '#dc2626', bg: '#fee2e2' },
    'pending-verification': { icon: '🕐', label: 'Awaiting Approval', color: '#1d4ed8', bg: '#dbeafe' },
    rejected:               { icon: '🚫', label: 'Rejected',          color: '#dc2626', bg: '#fee2e2' },
    waived:                 { icon: '🎓', label: 'Waived',            color: '#7c3aed', bg: '#ede9fe' },
  };

  const itemRows = (d.allItems || []).map(item => {
    const st = statusMap[item.status] || { icon: '📄', label: item.status || '—', color: '#64748b', bg: '#f8fafc' };
    const rowBg = item.amountPaid >= item.amountDue && item.amountDue > 0 ? '#f0fdf4' : '';
    return `
      <tr style="border-bottom:1px solid #f1f5f9;${rowBg ? 'background:' + rowBg + ';' : ''}">
        <td style="padding:10px 14px;font-size:0.85rem;font-weight:500;">${item.name || 'Fee'}</td>
        <td style="padding:10px 10px;text-align:right;font-size:0.85rem;">₦${(item.amountDue  || 0).toLocaleString('en-NG')}</td>
        <td style="padding:10px 10px;text-align:right;font-size:0.85rem;font-weight:600;color:#15803d;">₦${(item.amountPaid || 0).toLocaleString('en-NG')}</td>
        <td style="padding:10px 10px;text-align:right;font-size:0.85rem;font-weight:600;color:${item.balance > 0 ? '#d97706' : '#15803d'};">₦${(item.balance || 0).toLocaleString('en-NG')}</td>
        <td style="padding:10px 10px;text-align:center;">
          <span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:0.72rem;font-weight:700;background:${st.bg};color:${st.color};">${st.icon} ${st.label}</span>
        </td>
      </tr>`;
  }).join('');

  const progressBar = `
    <div style="background:#e2e8f0;border-radius:999px;height:10px;margin:6px 0 4px;overflow:hidden;">
      <div style="height:100%;width:${progress.toFixed(1)}%;background:${isSettled ? '#22c55e' : '#3b82f6'};border-radius:999px;transition:width 0.5s;"></div>
    </div>
    <div style="font-size:0.72rem;color:#64748b;text-align:right;">${progress.toFixed(0)}% settled</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Term Statement — ${d.studentName || 'Student'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px 48px; }
    .receipt { width: 100%; max-width: 720px; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.14); }
    .rcpt-header { background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #0891b2 100%); padding: 28px 32px; color: #fff; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .school-block { flex: 1; }
    .school-initials { width: 52px; height: 52px; background: rgba(255,255,255,0.18); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 800; margin-bottom: 10px; border: 2px solid rgba(255,255,255,0.35); }
    .school-name { font-size: 1.15rem; font-weight: 700; }
    .school-address { font-size: 0.72rem; opacity: 0.72; margin-top: 3px; line-height: 1.5; }
    .rcpt-title-block { text-align: right; flex-shrink: 0; }
    .rcpt-label { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.7; }
    .rcpt-title { font-size: 1.2rem; font-weight: 800; letter-spacing: 0.04em; margin-top: 4px; }
    .rcpt-sub  { font-size: 0.75rem; opacity: 0.8; margin-top: 4px; }
    .stamp-wrap { display:flex; justify-content:center; padding: 16px 32px 0; }
    .stamp { display:inline-flex; align-items:center; gap:8px; padding:7px 22px; border-radius:999px; font-size:0.8rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; }
    .stamp-paid    { background:#dcfce7; color:#166534; border:2px solid #86efac; }
    .stamp-partial { background:#fef3c7; color:#78350f; border:2px solid #fcd34d; }
    .meta-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:0; border-bottom:1px solid #e2e8f0; margin:16px 32px 0; padding-bottom:16px; }
    .meta-item { padding:0 12px; border-right:1px solid #e2e8f0; }
    .meta-item:first-child { padding-left:0; }
    .meta-item:last-child  { border-right:none; }
    .meta-label { font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#94a3b8; margin-bottom:3px; }
    .meta-value { font-size:0.85rem; font-weight:600; color:#1e293b; }
    .rcpt-body { padding:20px 32px 24px; }
    .section-heading { font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#94a3b8; padding-bottom:8px; border-bottom:2px solid #f1f5f9; margin-bottom:12px; }
    .info-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:20px; }
    .info-cell label { font-size:0.65rem; color:#94a3b8; text-transform:uppercase; font-weight:600; letter-spacing:0.06em; display:block; margin-bottom:2px; }
    .info-cell span  { font-size:0.875rem; font-weight:600; color:#1e293b; }
    .items-table { width:100%; border-collapse:collapse; border-radius:10px; overflow:hidden; border:1px solid #e2e8f0; font-size:0.85rem; }
    .items-table thead { background:#f8fafc; }
    .items-table th { padding:10px 10px; text-align:left; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; border-bottom:2px solid #e2e8f0; }
    .items-table th:not(:first-child) { text-align:right; }
    .items-table th:last-child { text-align:center; }
    .items-table tfoot tr { background:#f8fafc; }
    .items-table tfoot td { padding:11px 10px; font-weight:700; font-size:0.9rem; border-top:2px solid #e2e8f0; }
    .items-table tfoot td:not(:first-child) { text-align:right; }
    .summary-box { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin:16px 0; }
    .sum-cell { padding:14px 16px; border-radius:10px; text-align:center; }
    .sum-label { font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:5px; }
    .sum-value { font-size:1.2rem; font-weight:800; }
    .rcpt-footer { background:#f8fafc; padding:14px 32px; border-top:1px solid #e2e8f0; text-align:center; }
    .rcpt-footer p { font-size:0.72rem; color:#94a3b8; margin:0; line-height:1.6; }
    .print-bar { display:flex; gap:10px; justify-content:center; padding:20px 0 0; }
    @media print {
      body { background:#fff; padding:0; }
      .receipt { box-shadow:none; border-radius:0; max-width:100%; }
      .print-bar { display:none !important; }
    }
  </style>
</head>
<body>
  <div>
    <div class="receipt">

      <!-- Header -->
      <div class="rcpt-header">
        <div class="school-block">
          <div class="school-initials">${(d.schoolName || 'T').charAt(0)}</div>
          <div class="school-name">${d.schoolName || 'TBD Academy'}</div>
          <div class="school-address">${d.schoolAddress || ''}</div>
        </div>
        <div class="rcpt-title-block">
          <div class="rcpt-label">Official Document</div>
          <div class="rcpt-title">TERM STATEMENT</div>
          <div class="rcpt-sub">${d.term || '—'} &nbsp;·&nbsp; ${d.academicYear || '—'}</div>
        </div>
      </div>

      <!-- Status stamp -->
      <div class="stamp-wrap">
        <div class="stamp ${isSettled ? 'stamp-paid' : 'stamp-partial'}">
          ${isSettled ? '✅ ALL FEES SETTLED' : '⚠️ PARTIAL PAYMENT — BALANCE OUTSTANDING'}
        </div>
      </div>

      <!-- Meta strip -->
      <div class="meta-strip">
        <div class="meta-item">
          <div class="meta-label">Generated</div>
          <div class="meta-value">${dateStr}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Term</div>
          <div class="meta-value">${d.term || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Academic Year</div>
          <div class="meta-value">${d.academicYear || '—'}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">Reference</div>
          <div class="meta-value" style="font-family:monospace;font-size:0.78rem;">${d.receiptNo || '—'}</div>
        </div>
      </div>

      <!-- Body -->
      <div class="rcpt-body">

        <!-- Student Info -->
        <div style="margin-bottom:20px;">
          <div class="section-heading">Student Information</div>
          <div class="info-grid">
            <div class="info-cell">
              <label>Full Name</label>
              <span>${d.studentName || '—'}</span>
            </div>
            <div class="info-cell">
              <label>Class / Grade</label>
              <span>Grade ${d.studentGrade || '—'}${d.studentSection ? ' – ' + d.studentSection : ''}</span>
            </div>
            <div class="info-cell">
              <label>Roll Number</label>
              <span>${d.rollNo || '—'}</span>
            </div>
          </div>
        </div>

        <!-- Payment Progress -->
        <div style="margin-bottom:20px;">
          <div class="section-heading">Payment Progress</div>
          ${progressBar}
        </div>

        <!-- Fee Schedule Table -->
        <div style="margin-bottom:16px;">
          <div class="section-heading">Fee Breakdown</div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="text-align:left;">Fee Item</th>
                <th>Amount Due</th>
                <th>Amount Paid</th>
                <th>Balance</th>
                <th style="text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                <td>₦${(d.totalDue   || 0).toLocaleString('en-NG')}</td>
                <td style="color:#15803d;">₦${(d.totalPaid  || 0).toLocaleString('en-NG')}</td>
                <td style="color:${(d.balance || 0) > 0 ? '#d97706' : '#15803d'};">₦${(d.balance || 0).toLocaleString('en-NG')}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Summary boxes -->
        <div class="summary-box">
          <div class="sum-cell" style="background:#dbeafe;">
            <div class="sum-label" style="color:#1d4ed8;">Total Fees</div>
            <div class="sum-value" style="color:#1d4ed8;">₦${(d.totalDue || 0).toLocaleString('en-NG')}</div>
          </div>
          <div class="sum-cell" style="background:#dcfce7;">
            <div class="sum-label" style="color:#166534;">Total Paid</div>
            <div class="sum-value" style="color:#15803d;">₦${(d.totalPaid || 0).toLocaleString('en-NG')}</div>
          </div>
          <div class="sum-cell" style="background:${(d.balance || 0) > 0 ? '#fef3c7' : '#dcfce7'};">
            <div class="sum-label" style="color:${(d.balance || 0) > 0 ? '#78350f' : '#166534'};">Outstanding</div>
            <div class="sum-value" style="color:${(d.balance || 0) > 0 ? '#d97706' : '#15803d'};">₦${(d.balance || 0).toLocaleString('en-NG')}</div>
          </div>
        </div>

      </div><!-- /rcpt-body -->

      <!-- Footer -->
      <div class="rcpt-footer">
        <p>
          <strong>This is an official computer-generated term statement.</strong><br>
          Generated on ${dateStr}. For queries or discrepancies, please contact the school bursary.
        </p>
      </div>
    </div><!-- /receipt -->

    <!-- Print/Close Controls -->
    <div class="print-bar">
      <button onclick="window.print()" style="padding:10px 28px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer;">🖨️ Print / Save as PDF</button>
      <button onclick="window.close()" style="padding:10px 22px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;border-radius:8px;font-size:0.875rem;font-weight:600;cursor:pointer;">✕ Close</button>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Open a dedicated print window with the styled receipt.
 * Works on any portal — no dependency on jsPDF.
 */
function printReceipt(data) {
  const html = generateReceiptHTML(data);
  const win = window.open('', '_blank', 'width=780,height=900,scrollbars=yes,resizable=yes');
  if (!win) {
    showToast('Pop-up blocked. Please allow pop-ups and try again.', 'warning');
    return;
  }
  win.document.write(html);
  win.document.close();
}

/**
 * Show receipt in a modal overlay (no new window required).
 * Used where pop-ups may be restricted.
 */
function showReceiptModal(data) {
  const d = buildReceiptData(data);
  const isPaid = (d.status || 'paid').toLowerCase() === 'paid';
  const dateStr = d.paymentDate ? new Date(d.paymentDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const items = d.items && d.items.length ? d.items : [{ name: 'Fee Payment', amount: d.totalAmount || 0 }];
  const methodLabel = (d.paymentMethod || 'Paystack').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const itemRows = items.map(item => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:9px 12px;font-size:0.875rem;">${item.name || 'Fee'}</td>
      <td style="padding:9px 12px;text-align:right;font-size:0.875rem;font-weight:600;">₦${(parseFloat(item.amount)||0).toLocaleString('en-NG')}</td>
    </tr>`).join('');

  const content = `
    <div style="font-family:'Inter',sans-serif;max-width:600px;">
      <!-- Header band -->
      <div style="background:linear-gradient(135deg,#1d4ed8,#0891b2);color:#fff;padding:22px 24px;margin:-24px -24px 0;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:1.1rem;font-weight:700;">${d.schoolName}</div>
          <div style="font-size:0.72rem;opacity:0.7;margin-top:2px;">${d.schoolAddress}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.6rem;opacity:0.65;text-transform:uppercase;letter-spacing:0.12em;">Receipt</div>
          <div style="font-size:1.1rem;font-weight:800;letter-spacing:0.04em;">PAYMENT</div>
          <div style="font-size:0.78rem;opacity:0.8;font-family:monospace;">${d.receiptNo}</div>
        </div>
      </div>

      <!-- Status -->
      <div style="text-align:center;padding:14px 0 6px;">
        <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 18px;border-radius:999px;font-size:0.75rem;font-weight:700;letter-spacing:0.07em;${isPaid ? 'background:#dcfce7;color:#166534;border:1.5px solid #86efac;' : 'background:#fef9c3;color:#713f12;border:1.5px solid #fde047;'}">
          ${isPaid ? '✅ PAYMENT CONFIRMED' : '⏳ PENDING VERIFICATION'}
        </span>
      </div>

      <!-- Meta -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin:12px 0;">
        <div style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Date</div>
          <div style="font-size:0.82rem;font-weight:600;color:#1e293b;margin-top:2px;">${dateStr}</div>
        </div>
        <div style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Term</div>
          <div style="font-size:0.82rem;font-weight:600;color:#1e293b;margin-top:2px;">${d.term || '—'}</div>
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Year</div>
          <div style="font-size:0.82rem;font-weight:600;color:#1e293b;margin-top:2px;">${d.academicYear || '—'}</div>
        </div>
      </div>

      <!-- Student info -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Student</div>
          <div style="font-size:0.875rem;font-weight:600;color:#1e293b;margin-top:2px;">${d.studentName}</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:10px 12px;border:1px solid #e2e8f0;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Class / Roll</div>
          <div style="font-size:0.875rem;font-weight:600;color:#1e293b;margin-top:2px;">Grade ${d.studentGrade}${d.studentSection ? ' '+d.studentSection : ''} · ${d.rollNo}</div>
        </div>
      </div>

      <!-- Fee items table -->
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:12px;">
        <thead style="background:#f8fafc;">
          <tr>
            <th style="padding:9px 12px;text-align:left;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;border-bottom:2px solid #e2e8f0;">Fee Description</th>
            <th style="padding:9px 12px;text-align:right;font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;border-bottom:2px solid #e2e8f0;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:#f8fafc;">
            <td style="padding:10px 12px;font-weight:700;font-size:0.9rem;border-top:2px solid #e2e8f0;">Total Paid</td>
            <td style="padding:10px 12px;text-align:right;font-weight:800;font-size:1rem;color:#15803d;border-top:2px solid #e2e8f0;">₦${(d.totalAmount||0).toLocaleString('en-NG')}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Payment info -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="padding:9px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Method</div>
          <div style="font-size:0.8rem;font-weight:600;color:#1e293b;margin-top:2px;">${methodLabel}</div>
        </div>
        <div style="padding:9px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Transaction Ref</div>
          <div style="font-size:0.78rem;font-weight:600;color:#1e293b;margin-top:2px;font-family:monospace;word-break:break-all;">${d.transactionRef || '—'}</div>
        </div>
        <div style="padding:9px 12px;">
          <div style="font-size:0.62rem;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Receipt No.</div>
          <div style="font-size:0.8rem;font-weight:600;color:#1e293b;margin-top:2px;font-family:monospace;">${d.receiptNo}</div>
        </div>
      </div>

      <p style="font-size:0.7rem;color:#94a3b8;text-align:center;margin:14px 0 0;line-height:1.6;">
        This is an official computer-generated receipt. Please keep it for your records.
      </p>
    </div>`;

  window._pendingReceiptData = d;
  const backdrop = createModal(`🧾 Payment Receipt`, content, [
    { label: '🖨️ Print / Download', class: 'btn-primary', onclick: `window._pendingReceiptPrint()` },
    { label: 'Close', class: 'btn-ghost', onclick: 'closeModal(this)' }
  ]);
  window._pendingReceiptPrint = () => {
    printReceipt(window._pendingReceiptData);
  };
}
