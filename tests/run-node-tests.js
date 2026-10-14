/* plant-care-tracker-bd -- node unit tests. Run: node tests/run-node-tests.js */
'use strict';
const L = require('../js/logic.js');
const STR = require('../js/i18n.js');

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; }
  else { fail++; console.log('FAIL', name, '| actual:', JSON.stringify(actual), '| expected:', JSON.stringify(expected)); }
}
function ok(name, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL', name); }
}
function has(arr, v) { return arr.indexOf(v) !== -1; }

// --- date parsing ---
eq('parse valid', L.parseDate('2026-10-14'), { y: 2026, m: 10, d: 14 });
eq('parse rejects Feb 30', L.parseDate('2026-02-30'), null);
eq('parse rejects month 13', L.parseDate('2026-13-01'), null);
eq('parse rejects garbage', L.parseDate('hello'), null);
eq('parse rejects bad format', L.parseDate('2026/10/14'), null);
ok('isValid true', L.isValidDateStr('2024-02-29'));
ok('isValid false', !L.isValidDateStr('2023-02-29'));

// --- addDays: leap-safe ---
eq('leap: Feb 28 2024 +1 = Feb 29', L.addDays('2024-02-28', 1), '2024-02-29');
eq('leap: Feb 29 2024 +1 = Mar 1', L.addDays('2024-02-29', 1), '2024-03-01');
eq('non-leap: Feb 28 2023 +1 = Mar 1', L.addDays('2023-02-28', 1), '2023-03-01');
eq('year rollover', L.addDays('2026-12-31', 1), '2027-01-01');
eq('Jan 1 +365 = next Jan 1 (2026 not leap)', L.addDays('2026-01-01', 365), '2027-01-01');
eq('leap year +366', L.addDays('2024-01-01', 366), '2025-01-01');
eq('addDays invalid date', L.addDays('2026-02-30', 1), null);
eq('addDays non-integer', L.addDays('2026-10-14', 1.5), null);
eq('addDays zero', L.addDays('2026-10-14', 0), '2026-10-14');

// --- daysBetween ---
eq('daysBetween forward', L.daysBetween('2026-10-01', '2026-10-14'), 13);
eq('daysBetween reverse', L.daysBetween('2026-10-14', '2026-10-01'), -13);
eq('daysBetween same', L.daysBetween('2026-10-14', '2026-10-14'), 0);
eq('daysBetween across leap Feb', L.daysBetween('2024-02-28', '2024-03-01'), 2);
eq('daysBetween invalid', L.daysBetween('2026-10-14', 'x'), null);

// --- nextDue / careStatus ---
eq('nextDue', L.nextDue('2026-10-10', 3), '2026-10-13');
eq('status overdue', L.careStatus('2026-10-13', '2026-10-14'), 'overdue');
eq('status due-today', L.careStatus('2026-10-14', '2026-10-14'), 'due-today');
eq('status upcoming +3', L.careStatus('2026-10-17', '2026-10-14'), 'upcoming');
eq('status upcoming +7 boundary', L.careStatus('2026-10-21', '2026-10-14'), 'upcoming');
eq('status ok +8', L.careStatus('2026-10-22', '2026-10-14'), 'ok');

// --- validatePlant ---
const TODAY = '2026-10-14';
const good = { name: 'Money Plant', species: 'Pothos', location: 'balcony', acquired: '2026-01-10',
  waterEvery: 3, fertEvery: 30, lastWatered: '2026-10-11', lastFertilized: '2026-10-01', notes: '' };
eq('valid plant', L.validatePlant(good, TODAY), []);
ok('name required', has(L.validatePlant({ ...good, name: '   ' }, TODAY), 'name-required'));
ok('name too long', has(L.validatePlant({ ...good, name: 'x'.repeat(61) }, TODAY), 'name-too-long'));
ok('water interval 0', has(L.validatePlant({ ...good, waterEvery: 0 }, TODAY), 'water-interval'));
ok('water interval 366', has(L.validatePlant({ ...good, waterEvery: 366 }, TODAY), 'water-interval'));
ok('water interval float', has(L.validatePlant({ ...good, waterEvery: 2.5 }, TODAY), 'water-interval'));
ok('fert interval 0', has(L.validatePlant({ ...good, fertEvery: 0 }, TODAY), 'fert-interval'));
ok('acquired future', has(L.validatePlant({ ...good, acquired: '2026-10-15' }, TODAY), 'acquired-future'));
ok('acquired invalid', has(L.validatePlant({ ...good, acquired: '2026-02-30' }, TODAY), 'acquired-invalid'));
ok('last-watered future', has(L.validatePlant({ ...good, lastWatered: '2026-10-20' }, TODAY), 'last-watered-future'));
ok('last-fertilized future', has(L.validatePlant({ ...good, lastFertilized: '2026-10-20' }, TODAY), 'last-fertilized-future'));
ok('notes too long', has(L.validatePlant({ ...good, notes: 'x'.repeat(501) }, TODAY), 'notes-too-long'));
ok('species too long', has(L.validatePlant({ ...good, species: 'x'.repeat(81) }, TODAY), 'species-too-long'));
ok('not object', L.validatePlant(null, TODAY).indexOf('not-object') !== -1);

// --- validateLogEntry ---
eq('valid log', L.validateLogEntry({ plantId: 'p1', type: 'water', date: '2026-10-14', note: '' }, TODAY, ['p1']), []);
ok('log unknown plant', has(L.validateLogEntry({ plantId: 'zz', type: 'water', date: '2026-10-14' }, TODAY, ['p1']), 'unknown-plant'));
ok('log bad type', has(L.validateLogEntry({ plantId: 'p1', type: 'prune', date: '2026-10-14' }, TODAY, ['p1']), 'type-invalid'));
ok('log future date', has(L.validateLogEntry({ plantId: 'p1', type: 'water', date: '2026-10-15' }, TODAY, ['p1']), 'date-future'));
ok('log note too long', has(L.validateLogEntry({ plantId: 'p1', type: 'water', date: '2026-10-14', note: 'x'.repeat(301) }, TODAY, ['p1']), 'note-too-long'));

// --- dueList + summarize ---
const plants = [
  { id: 'a', name: 'Money Plant', waterEvery: 3, fertEvery: 30, lastWatered: '2026-10-01', lastFertilized: '2026-10-01' },
  { id: 'b', name: 'Tulsi', waterEvery: 2, fertEvery: 14, lastWatered: '2026-10-12', lastFertilized: '2026-10-13' },
  { id: 'c', name: 'Cactus', waterEvery: 30, fertEvery: 90, lastWatered: '2026-10-14', lastFertilized: '2026-10-14' }
];
const due = L.dueList(plants, TODAY);
ok('dueList: overdue first', due[0].status === 'overdue');
ok('dueList: Money Plant water overdue by 10', due.some(d => d.plantId === 'a' && d.kind === 'water' && d.overdueDays === 10));
ok('dueList: Tulsi water due-today', due.some(d => d.plantId === 'b' && d.kind === 'water' && d.status === 'due-today'));
ok('dueList: Cactus excluded (ok)', !due.some(d => d.plantId === 'c'));
const sum = L.summarize(plants, TODAY);
eq('summarize total', sum.total, 3);
eq('summarize needWaterToday (overdue+today water)', sum.needWaterToday, 2);
ok('summarize overdueCount >= 1', sum.overdueCount >= 1);
eq('summarize dueThisWeek == dueList length', sum.dueThisWeek, due.length);
eq('summarize empty', L.summarize([], TODAY), { total: 0, needWaterToday: 0, overdueCount: 0, dueThisWeek: 0 });

// --- validateImport ---
eq('import valid', L.validateImport({ plants: [{ id: 'a', ...good }], log: [{ id: 'l1', plantId: 'a', type: 'water', date: '2026-10-14' }] }, TODAY).ok, true);
ok('import dup id rejected', !L.validateImport({ plants: [{ id: 'a', ...good }, { id: 'a', ...good }], log: [] }, TODAY).ok);
ok('import log unknown plant rejected', !L.validateImport({ plants: [{ id: 'a', ...good }], log: [{ plantId: 'zz', type: 'water', date: '2026-10-14' }] }, TODAY).ok);
ok('import future plant rejected', !L.validateImport({ plants: [{ id: 'a', ...good, acquired: '2027-01-01' }], log: [] }, TODAY).ok);
ok('import non-object rejected', !L.validateImport(null, TODAY).ok);
ok('import plants-not-array rejected', !L.validateImport({ plants: 'x', log: [] }, TODAY).ok);

// --- i18n parity ---
const enKeys = Object.keys(STR.en).sort();
const bnKeys = Object.keys(STR.bn).sort();
eq('i18n key parity', bnKeys, enKeys);
ok('i18n no empty EN values', enKeys.every(k => STR.en[k].length > 0));
ok('i18n no empty BN values', bnKeys.every(k => STR.bn[k].length > 0));
ok('i18n BN differs from EN (translated)', STR.bn.appTitle !== STR.en.appTitle);

// --- misc ---
ok('newId unique', L.newId() !== L.newId());
ok('newId is string', typeof L.newId() === 'string');

console.log('UNIT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
