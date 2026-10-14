/* plant-care-tracker-bd -- pure logic (no DOM). UMD: works in Node and browser.
   Dates are YYYY-MM-DD strings; all arithmetic uses UTC to stay leap-safe. */
(function (root) {
  'use strict';

  function isStr(v) { return typeof v === 'string'; }

  // Strict YYYY-MM-DD parse -> {y,m,d} or null (rejects 2026-02-30 etc.)
  function parseDate(s) {
    if (!isStr(s)) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  function isValidDateStr(s) { return parseDate(s) !== null; }

  function fmtDate(y, m, d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return y + '-' + p(m) + '-' + p(d);
  }

  // Leap-safe: add n days via UTC timestamp arithmetic.
  function addDays(dateStr, n) {
    var p = parseDate(dateStr);
    if (!p || !Number.isInteger(n)) return null;
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d) + n * 86400000);
    return fmtDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // Whole days from a to b (b - a). Negative if b is earlier.
  function daysBetween(a, b) {
    var pa = parseDate(a), pb = parseDate(b);
    if (!pa || !pb) return null;
    var ta = Date.UTC(pa.y, pa.m - 1, pa.d);
    var tb = Date.UTC(pb.y, pb.m - 1, pb.d);
    return Math.round((tb - ta) / 86400000);
  }

  function nextDue(lastDone, intervalDays) { return addDays(lastDone, intervalDays); }

  // Status of a care item whose next due date is `due` relative to `today`.
  function careStatus(due, today) {
    if (!isValidDateStr(due) || !isValidDateStr(today)) return null;
    if (due < today) return 'overdue';
    if (due === today) return 'due-today';
    var diff = daysBetween(today, due);
    if (diff <= 7) return 'upcoming';
    return 'ok';
  }

  function trimStr(v) { return isStr(v) ? v.replace(/^\s+|\s+$/g, '') : ''; }

  // Validate a plant record. Returns array of error codes (empty = valid).
  // todayStr: reference date; future dates rejected.
  function validatePlant(p, todayStr) {
    var errs = [];
    if (!p || typeof p !== 'object') return ['not-object'];
    if (trimStr(p.name).length < 1) errs.push('name-required');
    if (trimStr(p.name).length > 60) errs.push('name-too-long');
    if (p.species !== undefined && p.species !== null && trimStr(p.species).length > 80) errs.push('species-too-long');
    if (p.location !== undefined && p.location !== null && trimStr(p.location).length > 80) errs.push('location-too-long');
    if (p.notes !== undefined && p.notes !== null && String(p.notes).length > 500) errs.push('notes-too-long');
    if (!Number.isInteger(p.waterEvery) || p.waterEvery < 1 || p.waterEvery > 365) errs.push('water-interval');
    if (!Number.isInteger(p.fertEvery) || p.fertEvery < 1 || p.fertEvery > 365) errs.push('fert-interval');
    if (!isValidDateStr(p.acquired)) errs.push('acquired-invalid');
    else if (todayStr && p.acquired > todayStr) errs.push('acquired-future');
    if (!isValidDateStr(p.lastWatered)) errs.push('last-watered-invalid');
    else if (todayStr && p.lastWatered > todayStr) errs.push('last-watered-future');
    if (!isValidDateStr(p.lastFertilized)) errs.push('last-fertilized-invalid');
    else if (todayStr && p.lastFertilized > todayStr) errs.push('last-fertilized-future');
    return errs;
  }

  // Validate a care-log entry. plantIds: array of known plant ids.
  function validateLogEntry(e, todayStr, plantIds) {
    var errs = [];
    if (!e || typeof e !== 'object') return ['not-object'];
    if (plantIds && plantIds.indexOf(e.plantId) === -1) errs.push('unknown-plant');
    if (e.type !== 'water' && e.type !== 'fertilize') errs.push('type-invalid');
    if (!isValidDateStr(e.date)) errs.push('date-invalid');
    else if (todayStr && e.date > todayStr) errs.push('date-future');
    if (e.note !== undefined && e.note !== null && String(e.note).length > 300) errs.push('note-too-long');
    return errs;
  }

  // Validate a full import payload. Returns {ok, errors}.
  function validateImport(data, todayStr) {
    var errors = [];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, errors: ['not-object'] };
    if (!Array.isArray(data.plants)) return { ok: false, errors: ['plants-not-array'] };
    if (!Array.isArray(data.log)) return { ok: false, errors: ['log-not-array'] };
    var ids = {};
    data.plants.forEach(function (p, i) {
      if (!isStr(p.id) || p.id.length === 0) errors.push('plant-' + i + '-id');
      else if (ids[p.id]) errors.push('plant-' + i + '-dup-id');
      else ids[p.id] = true;
      validatePlant(p, todayStr).forEach(function (c) { errors.push('plant-' + i + '-' + c); });
    });
    var plantIds = Object.keys(ids);
    data.log.forEach(function (e, i) {
      validateLogEntry(e, todayStr, plantIds).forEach(function (c) { errors.push('log-' + i + '-' + c); });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  // All care items due within the next 7 days (incl. overdue), sorted by urgency:
  // overdue first (most overdue first), then due-today, then by due date.
  function dueList(plants, todayStr) {
    var out = [];
    (plants || []).forEach(function (p) {
      [['water', p.lastWatered, p.waterEvery], ['fertilize', p.lastFertilized, p.fertEvery]].forEach(function (t) {
        var due = nextDue(t[1], t[2]);
        if (due === null) return;
        var status = careStatus(due, todayStr);
        if (status === 'overdue' || status === 'due-today' || status === 'upcoming') {
          out.push({
            plantId: p.id, plantName: p.name, kind: t[0], due: due, status: status,
            overdueDays: status === 'overdue' ? -daysBetween(todayStr, due) : 0
          });
        }
      });
    });
    var rank = { overdue: 0, 'due-today': 1, upcoming: 2 };
    out.sort(function (a, b) {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.status === 'overdue') return b.overdueDays - a.overdueDays;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return a.plantName < b.plantName ? -1 : 1;
    });
    return out;
  }

  // Dashboard summary for today.
  function summarize(plants, todayStr) {
    var due = dueList(plants, todayStr);
    var needWater = 0, overdue = 0, dueWeek = 0;
    due.forEach(function (d) {
      if (d.kind === 'water' && (d.status === 'overdue' || d.status === 'due-today')) needWater++;
      if (d.status === 'overdue') overdue++;
      dueWeek++;
    });
    return { total: (plants || []).length, needWaterToday: needWater, overdueCount: overdue, dueThisWeek: dueWeek };
  }

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  var api = {
    parseDate: parseDate, isValidDateStr: isValidDateStr, fmtDate: fmtDate,
    addDays: addDays, daysBetween: daysBetween, nextDue: nextDue,
    careStatus: careStatus, trimStr: trimStr, validatePlant: validatePlant,
    validateLogEntry: validateLogEntry, validateImport: validateImport,
    dueList: dueList, summarize: summarize, newId: newId
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PlantCare = api;
})(typeof window !== 'undefined' ? window : globalThis);
