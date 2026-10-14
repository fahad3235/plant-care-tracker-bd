/* plant-care-tracker-bd -- DOM wiring. Depends on PlantCare (logic) + PlantCareI18n. */
(function () {
  'use strict';
  var L = window.PlantCare;
  var STR = window.PlantCareI18n;
  var KEY = 'plant-care-tracker-bd-v1';

  var params = new URLSearchParams(window.location.search);
  var asof = params.get('asof'); // deterministic date for tests
  function todayStr() {
    if (asof && L.isValidDateStr(asof)) return asof;
    var d = new Date();
    return L.fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (Array.isArray(data.plants) && Array.isArray(data.log)) return data;
      }
    } catch (e) { /* corrupt storage -> fresh state */ }
    return { plants: [], log: [], lang: 'en' };
  }
  var state = load();
  if (state.lang !== 'bn') state.lang = 'en';
  var editingId = null;
  var searchQ = '';

  function save() { window.localStorage.setItem(KEY, JSON.stringify(state)); }
  function t(k) { return (STR[state.lang] && STR[state.lang][k]) || STR.en[k] || k; }
  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
  function locNum(s) {
    s = String(s);
    if (state.lang !== 'bn') return s;
    return s.replace(/[0-9]/g, function (ch) { return BN_DIGITS[+ch]; });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }

  function showToast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 3000);
  }

  function applyStaticText() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    $('h-title').textContent = t('appTitle');
    $('tagline').textContent = t('tagline');
    $('langBtn').textContent = t('langName');
    var tabs = [['tabDashboard', 'dashboard'], ['tabPlants', 'plants'], ['tabReminders', 'reminders'], ['tabLog', 'careLog']];
    tabs.forEach(function (pair) { $(pair[0]).textContent = t(pair[1]); });
    $('btnAddPlant').textContent = '+ ' + t('addPlant');
    $('searchInput').placeholder = t('search');
    $('btnExport').textContent = t('export');
    $('btnImport').textContent = t('import');
    $('btnClearAll').textContent = t('clearAll');
    $('footerDisclaimer').textContent = t('disclaimer');
    $('lblStatTotal').textContent = t('totalPlants');
    $('lblStatWater').textContent = t('waterToday');
    $('lblStatOverdue').textContent = t('overdue');
    $('lblStatWeek').textContent = t('dueThisWeek');
    $('dashDueTitle').textContent = t('reminders');
    $('plantsTitle').textContent = t('allPlants');
    $('remTitle').textContent = t('reminders');
    $('logTitle').textContent = t('careLog');
    $('lblClearConfirm').textContent = t('typeDelete');
    $('btnConfirmClear').textContent = t('clearAll');
    $('btnCancelClear').textContent = t('cancel');
  }

  function statusBadge(kind, due, status) {
    if (status === 'overdue') return '<span class="badge badge-overdue">' + esc(t('overdue')) + ' ' + locNum(daysOverdue(due)) + ' ' + esc(t('days')) + '</span>';
    if (status === 'due-today') return '<span class="badge badge-today">' + esc(t('dueToday')) + '</span>';
    return '<span class="badge badge-upcoming">' + esc(t('inDays')) + ' ' + locNum(L.daysBetween(todayStr(), due)) + ' ' + esc(t('days')) + '</span>';
  }
  function daysOverdue(due) { return -L.daysBetween(todayStr(), due); }

  function renderDashboard() {
    var s = L.summarize(state.plants, todayStr());
    $('statTotal').textContent = locNum(s.total);
    $('statWater').textContent = locNum(s.needWaterToday);
    $('statOverdue').textContent = locNum(s.overdueCount);
    $('statWeek').textContent = locNum(s.dueThisWeek);
    var due = L.dueList(state.plants, todayStr()).slice(0, 8);
    $('dashDueList').innerHTML = due.length === 0
      ? '<p class="empty">' + esc(t('noReminders')) + '</p>'
      : due.map(function (d) {
          return '<div class="row"><span>' + esc(d.plantName) + ' - ' + esc(t(d.kind === 'water' ? 'waterDue' : 'fertDue')) + '</span>' + statusBadge(d.kind, d.due, d.status) + '</div>';
        }).join('');
  }

  function filteredPlants() {
    var q = searchQ.trim().toLowerCase();
    if (!q) return state.plants;
    return state.plants.filter(function (p) {
      return (p.name + ' ' + (p.species || '') + ' ' + (p.location || '')).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderPlants() {
    var list = filteredPlants();
    if (list.length === 0) { $('plantList').innerHTML = '<p class="empty">' + esc(t('noPlants')) + '</p>'; return; }
    $('plantList').innerHTML = list.map(function (p) {
      var wDue = L.nextDue(p.lastWatered, p.waterEvery);
      var fDue = L.nextDue(p.lastFertilized, p.fertEvery);
      var wSt = L.careStatus(wDue, todayStr());
      var fSt = L.careStatus(fDue, todayStr());
      return '<article class="card" data-id="' + esc(p.id) + '">' +
        '<div class="card-head"><h3>' + esc(p.name) + '</h3>' +
        '<div><button class="btn small" data-act="edit">' + esc(t('edit')) + '</button> ' +
        '<button class="btn small danger" data-act="delete">' + esc(t('delete')) + '</button></div></div>' +
        (p.species ? '<p class="meta">' + esc(p.species) + (p.location ? ' &middot; ' + esc(p.location) : '') + '</p>' : (p.location ? '<p class="meta">' + esc(p.location) + '</p>' : '')) +
        '<div class="caregrid">' +
        '<div><span>' + esc(t('water')) + ': ' + esc(t('nextDue')) + ' ' + locNum(wDue) + '</span> ' + statusBadge('water', wDue, wSt) + '</div>' +
        '<div><span>' + esc(t('fertilize')) + ': ' + esc(t('nextDue')) + ' ' + locNum(fDue) + '</span> ' + statusBadge('fertilize', fDue, fSt) + '</div>' +
        '</div>' +
        '<div class="card-actions">' +
        '<button class="btn primary" data-act="water">' + esc(t('markWatered')) + '</button> ' +
        '<button class="btn" data-act="fert">' + esc(t('markFertilized')) + '</button>' +
        '</div>' + (p.notes ? '<p class="notes">' + esc(p.notes) + '</p>' : '') +
        '</article>';
    }).join('');
  }

  function renderReminders() {
    var due = L.dueList(state.plants, todayStr());
    if (due.length === 0) { $('reminderList').innerHTML = '<p class="empty">' + esc(t('noReminders')) + '</p>'; return; }
    $('reminderList').innerHTML = due.map(function (d) {
      return '<div class="row"><span>' + esc(d.plantName) + ' - ' + esc(t(d.kind === 'water' ? 'waterDue' : 'fertDue')) +
        ' (' + locNum(d.due) + ')</span><span>' + statusBadge(d.kind, d.due, d.status) +
        ' <button class="btn small primary" data-act="done" data-plant="' + esc(d.plantId) + '" data-kind="' + esc(d.kind) + '">' + esc(t('done')) + '</button></span></div>';
    }).join('');
  }

  function renderLog() {
    var entries = state.log.slice().sort(function (a, b) { return b.date < a.date ? -1 : (b.date > a.date ? 1 : 0); }).slice(0, 100);
    if (entries.length === 0) { $('logList').innerHTML = '<p class="empty">' + esc(t('noLog')) + '</p>'; return; }
    $('logList').innerHTML = entries.map(function (e) {
      var p = state.plants.filter(function (x) { return x.id === e.plantId; })[0];
      return '<div class="row"><span>' + esc(p ? p.name : '?') + ' - ' + esc(t(e.type === 'water' ? 'wateredLog' : 'fertilizedLog')) +
        (e.note ? ' (' + esc(e.note) + ')' : '') + '</span><span>' + locNum(e.date) + '</span></div>';
    }).join('');
  }

  function renderAll() {
    applyStaticText();
    renderDashboard();
    renderPlants();
    renderReminders();
    renderLog();
  }

  function switchTab(name) {
    ['Dashboard', 'Plants', 'Reminders', 'Log'].forEach(function (v) {
      $('view' + v).hidden = (v.toLowerCase() !== name);
      $('tab' + v).classList.toggle('active', v.toLowerCase() === name);
    });
  }

  function openForm(plant) {
    editingId = plant ? plant.id : null;
    $('formTitle').textContent = t(plant ? 'formTitleEdit' : 'formTitleAdd');
    $('formErrors').hidden = true; $('formErrors').textContent = '';
    $('f-name').value = plant ? plant.name : '';
    $('f-species').value = plant ? (plant.species || '') : '';
    $('f-location').value = plant ? (plant.location || '') : '';
    $('f-acquired').value = plant ? plant.acquired : todayStr();
    $('f-water-every').value = plant ? plant.waterEvery : 3;
    $('f-fert-every').value = plant ? plant.fertEvery : 30;
    $('f-last-watered').value = plant ? plant.lastWatered : todayStr();
    $('f-last-fertilized').value = plant ? plant.lastFertilized : todayStr();
    $('f-notes').value = plant ? (plant.notes || '') : '';
    // Static labels inside the form
    [['lblName', 'name'], ['lblSpecies', 'species'], ['lblLocation', 'location'], ['lblAcquired', 'acquired'],
     ['lblWaterEvery', 'waterEvery'], ['lblFertEvery', 'fertEvery'], ['lblLastWatered', 'lastWatered'],
     ['lblLastFertilized', 'lastFertilized'], ['lblNotes', 'notes']].forEach(function (pair) {
      $(pair[0]).textContent = t(pair[1]);
    });
    $('btnSavePlant').textContent = t('save');
    $('btnCancelPlant').textContent = t('cancel');
    $('plantForm').hidden = false;
    $('f-name').focus();
  }
  function closeForm() { $('plantForm').hidden = true; editingId = null; }

  function markDone(plantId, kind) {
    var p = state.plants.filter(function (x) { return x.id === plantId; })[0];
    if (!p) return;
    var today = todayStr();
    if (kind === 'water') p.lastWatered = today; else p.lastFertilized = today;
    state.log.push({ id: L.newId(), plantId: plantId, type: kind, date: today, note: '' });
    save(); renderAll();
    showToast(t(kind === 'water' ? 'wateredLog' : 'fertilizedLog'));
  }

  // --- events ---
  $('langBtn').addEventListener('click', function () {
    state.lang = state.lang === 'en' ? 'bn' : 'en';
    save(); renderAll();
  });
  ['Dashboard', 'Plants', 'Reminders', 'Log'].forEach(function (v) {
    $('tab' + v).addEventListener('click', function () { switchTab(v.toLowerCase()); });
  });
  $('btnAddPlant').addEventListener('click', function () { openForm(null); });
  $('btnCancelPlant').addEventListener('click', closeForm);
  $('searchInput').addEventListener('input', function (e) { searchQ = e.target.value; renderPlants(); });

  $('btnSavePlant').addEventListener('click', function () {
    var today = todayStr();
    var cand = {
      id: editingId || L.newId(),
      name: L.trimStr($('f-name').value),
      species: L.trimStr($('f-species').value),
      location: L.trimStr($('f-location').value),
      acquired: $('f-acquired').value,
      waterEvery: parseInt($('f-water-every').value, 10),
      fertEvery: parseInt($('f-fert-every').value, 10),
      lastWatered: $('f-last-watered').value,
      lastFertilized: $('f-last-fertilized').value,
      notes: $('f-notes').value
    };
    var errs = L.validatePlant(cand, today);
    if (errs.length > 0) {
      var msg = errs.map(function (c) {
        if (c === 'name-required') return t('errNameRequired');
        if (c === 'name-too-long' || c === 'species-too-long' || c === 'location-too-long' || c === 'notes-too-long') return t('errTextTooLong');
        if (c === 'water-interval' || c === 'fert-interval') return t('errInterval');
        if (c.indexOf('future') !== -1) return t('errDateFuture');
        return t('errDateInvalid');
      }).join(' ');
      $('formErrors').textContent = msg;
      $('formErrors').hidden = false;
      return;
    }
    if (editingId) {
      var idx = state.plants.findIndex(function (x) { return x.id === editingId; });
      if (idx !== -1) state.plants[idx] = cand;
      showToast(t('updated'));
    } else {
      state.plants.push(cand);
      showToast(t('added'));
    }
    save(); closeForm(); renderAll();
  });

  // Delegated card + reminder actions
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var card = btn.closest('[data-id]');
    if (act === 'done') { markDone(btn.getAttribute('data-plant'), btn.getAttribute('data-kind')); return; }
    if (!card) return;
    var id = card.getAttribute('data-id');
    if (act === 'water') markDone(id, 'water');
    else if (act === 'fert') markDone(id, 'fertilize');
    else if (act === 'edit') {
      var p = state.plants.filter(function (x) { return x.id === id; })[0];
      if (p) openForm(p);
    } else if (act === 'delete') {
      if (window.confirm(t('confirmDelete'))) {
        state.plants = state.plants.filter(function (x) { return x.id !== id; });
        state.log = state.log.filter(function (x) { return x.plantId !== id; });
        save(); renderAll(); showToast(t('deleted'));
      }
    }
  });

  $('btnExport').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ plants: state.plants, log: state.log }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plant-care-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    showToast(t('exported'));
  });
  $('btnImport').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var v = L.validateImport(data, todayStr());
        if (!v.ok) throw new Error('invalid');
        state.plants = data.plants; state.log = data.log;
        save(); renderAll(); showToast(t('imported'));
      } catch (err) { showToast(t('importFailed')); }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
  $('btnClearAll').addEventListener('click', function () { $('clearBox').hidden = false; });
  $('btnCancelClear').addEventListener('click', function () { $('clearBox').hidden = true; $('clearInput').value = ''; });
  $('btnConfirmClear').addEventListener('click', function () {
    if ($('clearInput').value !== 'DELETE') return;
    state.plants = []; state.log = [];
    save(); $('clearBox').hidden = true; $('clearInput').value = '';
    renderAll(); showToast(t('deleted'));
  });

  renderAll();
  switchTab('dashboard');
  window.__PCT_READY = true;
  window.__PCT_state = function () { return { plants: state.plants, log: state.log, lang: state.lang, asof: todayStr() }; };
})();
