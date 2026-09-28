// ============================================
// CALENDAR EVENTS — one way to read and write calendar_events
// ============================================
// The table exists in two shapes. The first version had
//   start_date (timestamptz), end_date, type
// and migration 0003 describes
//   event_date (date), end_date, event_type.
// 0003 uses CREATE TABLE IF NOT EXISTS, so whichever ran first is what the
// database has. The pages used to assume the first shape: on a 0003 table
// every read failed (the calendar then showed made-up sample events) and
// every new event was refused.
//
// Here rows are read with select('*') and normalised, and writes use the
// shape the table has (learned from a row, or from the database's answer
// when a column is missing).
//
// Dates are calendar days, compared as local "YYYY-MM-DD" keys. Comparing
// toISOString() days put every event a day late in Nigeria (UTC+1).
// ============================================

(function () {
  'use strict';

  let shape = null; // 'start' (start_date/type) or 'event' (event_date/event_type)

  /** "YYYY-MM-DD" for a Date or a stored value, in local time. */
  function dayKey(v) {
    if (!v) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** A local Date at midnight for a "YYYY-MM-DD" key. */
  function fromKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function learn(row) {
    if (shape || !row) return;
    if ('event_date' in row) shape = 'event';
    else if ('start_date' in row) shape = 'start';
  }

  /** A row in either shape → { id, title, description, start, end, type } with day keys. */
  function normalise(row) {
    const start = dayKey(row.start_date ?? row.event_date);
    const end = dayKey(row.end_date) || start;
    return {
      id: row.id,
      title: row.title || 'Untitled',
      description: row.description || '',
      start,
      end: end < start ? start : end,
      type: row.type ?? row.event_type ?? 'event',
      createdBy: row.created_by || null
    };
  }

  function toRow(ev, which) {
    const base = { title: ev.title, description: ev.description || null, end_date: ev.end || ev.start };
    return which === 'event'
      ? { ...base, event_date: ev.start, event_type: ev.type, is_holiday: ev.type === 'holiday' }
      : { ...base, start_date: ev.start, type: ev.type };
  }

  const missingColumn = (err) => /column|schema cache|PGRST204|42703/i.test(`${err?.code || ''} ${err?.message || ''}`);

  /** Every event, oldest first. Throws if the table cannot be read. */
  async function list() {
    if (!window.supabaseClient) return [];
    const { data, error } = await window.supabaseClient.from('calendar_events').select('*');
    if (error) throw error;
    (data || []).forEach(learn);
    return (data || []).map(normalise).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  }

  /** Events that touch [fromKey, untilKey] (inclusive day keys). */
  async function between(from, until) {
    const a = dayKey(from), b = dayKey(until);
    return (await list()).filter(e => e.end >= a && e.start <= b);
  }

  /** Runs a write in the known shape, or tries one shape then the other. */
  async function write(run) {
    const order = shape ? [shape] : ['start', 'event'];
    let last;
    for (const which of order) {
      const { data, error } = await run(which);
      if (!error) { shape = which; return data; }
      last = error;
      if (!missingColumn(error)) break;
    }
    throw last;
  }

  async function create(ev) {
    const row = await write(which => window.supabaseClient.from('calendar_events').insert([toRow(ev, which)]).select().single());
    return normalise(row);
  }

  async function update(id, ev) {
    const row = await write(which => window.supabaseClient.from('calendar_events').update(toRow(ev, which)).eq('id', id).select().single());
    return normalise(row);
  }

  async function remove(id) {
    const { error } = await window.supabaseClient.from('calendar_events').delete().eq('id', id);
    if (error) throw error;
  }

  window.calendarEvents = { list, between, create, update, remove, normalise, dayKey, fromKey };
})();
