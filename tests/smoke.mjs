/* plant-care-tracker-bd smoke tests -- headless Chromium via puppeteer-core.
   Run: NODE_PATH=../job-application-tracker-bd/node_modules node tests/smoke.mjs */
import puppeteer from 'puppeteer-core';

const BASE = 'file:///home/hatch/workspace/muse-project-factory/builds/plant-care-tracker-bd/index.html';
const APP = BASE + '?asof=2026-10-14'; // Wednesday

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  if (actual === expected) { pass++; }
  else { fail++; console.log('FAIL', name, '| actual:', JSON.stringify(actual), '| expected:', JSON.stringify(expected)); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/opt/meta-chromium/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--no-proxy-server', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on('dialog', d => d.accept());
const consoleErrors = [], pageErrors = [];
let netRequests = 0;
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('file:')) netRequests++; });

await page.goto(APP, { waitUntil: 'load' });
await page.waitForFunction(() => window.__PCT_READY === true, { timeout: 8000 });

// 1. render + empty states
eq('asof honored', await page.evaluate(() => window.__PCT_state().asof), '2026-10-14');
eq('h1 title', await page.$eval('#h-title', el => el.textContent.trim()), 'Plant Care Tracker');
eq('lang button shows Bangla label', await page.$eval('#langBtn', el => el.textContent.trim()), 'Bangla');
eq('empty total stat', await page.$eval('#statTotal', el => el.textContent.trim()), '0');
ok('empty plants hint', (await page.$eval('#plantList', el => el.textContent)).includes('No plants added yet'));
ok('form hidden initially', await page.evaluate(() => document.querySelector('#plantForm').hidden));

// 2. add plant via UI: due water today (last 2026-10-11 + 3d = 2026-10-14)
await page.click('#tabPlants');
await page.click('#btnAddPlant');
await page.type('#f-name', 'Money Plant');
await page.type('#f-species', 'Pothos');
await page.type('#f-location', 'balcony');
await page.evaluate(() => { document.querySelector('#f-water-every').value = '3'; });
await page.evaluate(() => { document.querySelector('#f-fert-every').value = '30'; });
await page.evaluate(() => { document.querySelector('#f-last-watered').value = '2026-10-11'; });
await page.evaluate(() => { document.querySelector('#f-last-fertilized').value = '2026-10-01'; });
await page.evaluate(() => { document.querySelector('#f-acquired').value = '2026-01-10'; });
await page.click('#btnSavePlant');
await sleep(400);
eq('plant added', await page.evaluate(() => window.__PCT_state().plants.length), 1);
eq('plant name', await page.evaluate(() => window.__PCT_state().plants[0].name), 'Money Plant');
eq('need water today = 1', await page.$eval('#statWater', el => el.textContent.trim()), '1');
eq('total = 1', await page.$eval('#statTotal', el => el.textContent.trim()), '1');

// 3. mark watered from card -> lastWatered = today, log grows, need-water drops
await page.evaluate(() => { document.querySelector('#plantList button[data-act="water"]').click(); });
await sleep(400);
eq('lastWatered updated', await page.evaluate(() => window.__PCT_state().plants[0].lastWatered), '2026-10-14');
eq('log has 1 entry', await page.evaluate(() => window.__PCT_state().log.length), 1);
eq('need water today = 0 after watering', await page.$eval('#statWater', el => el.textContent.trim()), '0');

// 4. add overdue plant -> reminders show it with overdue badge
await page.click('#btnAddPlant');
await page.type('#f-name', 'Tulsi');
await page.evaluate(() => { document.querySelector('#f-water-every').value = '3'; });
await page.evaluate(() => { document.querySelector('#f-fert-every').value = '30'; });
await page.evaluate(() => { document.querySelector('#f-last-watered').value = '2026-10-01'; });
await page.evaluate(() => { document.querySelector('#f-last-fertilized').value = '2026-10-01'; });
await page.evaluate(() => { document.querySelector('#f-acquired').value = '2026-01-10'; });
await page.click('#btnSavePlant');
await sleep(400);
eq('two plants', await page.evaluate(() => window.__PCT_state().plants.length), 2);
await page.click('#tabReminders');
await sleep(300);
ok('reminders mention Tulsi', (await page.$eval('#reminderList', el => el.textContent)).includes('Tulsi'));
ok('overdue badge shown', (await page.$eval('#reminderList', el => el.textContent)).includes('Overdue'));

// 5. validation: empty name rejected inline
await page.click('#tabPlants');
await page.click('#btnAddPlant');
await page.evaluate(() => { document.querySelector('#f-name').value = ''; });
await page.click('#btnSavePlant');
await sleep(300);
ok('form error visible on empty name', await page.evaluate(() => !document.querySelector('#formErrors').hidden));
eq('still 2 plants after invalid save', await page.evaluate(() => window.__PCT_state().plants.length), 2);
await page.click('#btnCancelPlant');

// 6. BN toggle: Bengali title + Bengali digits (total 2 -> Bengali 2)
await page.click('#langBtn');
await sleep(300);
eq('BN h1', await page.$eval('#h-title', el => el.textContent.trim()), '\u0997\u09be\u099b\u09c7\u09b0\u0020\u09af\u09a4\u09cd\u09a8\u0020\u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0');
eq('BN total digit', await page.$eval('#statTotal', el => el.textContent.trim()), '\u09e8');
await page.click('#langBtn'); // back to EN
await sleep(200);

// 7. export/import round-trip: import a fresh payload, state replaced
await page.evaluate(async () => {
  const payload = JSON.stringify({ plants: [{ id: 'imp1', name: 'Imported Fern', species: '', location: '', acquired: '2026-02-01', waterEvery: 2, fertEvery: 20, lastWatered: '2026-10-14', lastFertilized: '2026-10-01', notes: '' }], log: [] });
  const file = new File([payload], 'backup.json', { type: 'application/json' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.querySelector('#importFile');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(500);
eq('import replaced plants', await page.evaluate(() => window.__PCT_state().plants.length), 1);
eq('imported name', await page.evaluate(() => window.__PCT_state().plants[0].name), 'Imported Fern');

// 8. clear-all with DELETE confirmation
await page.click('#btnClearAll');
await page.type('#clearInput', 'DELETE');
await page.click('#btnConfirmClear');
await sleep(400);
eq('cleared plants', await page.evaluate(() => window.__PCT_state().plants.length), 0);
eq('cleared log', await page.evaluate(() => window.__PCT_state().log.length), 0);

// 9. 390px mobile: no horizontal overflow
await page.setViewport({ width: 390, height: 844 });
await sleep(300);
ok('390px no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= 390));

// 10. hygiene
eq('console errors', consoleErrors.length, 0);
eq('page errors', pageErrors.length, 0);
eq('network requests', netRequests, 0);
if (consoleErrors.length) console.log('console errors:', consoleErrors);
if (pageErrors.length) console.log('page errors:', pageErrors);

await browser.close();
console.log('SMOKE: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
