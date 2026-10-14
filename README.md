# Plant Care Tracker BD

Offline bilingual (English / Bangla) houseplant care tracker for Bangladesh. Keep
track of watering and fertilizing schedules for your balcony, roof, or indoor
plants -- with a live dashboard, urgency-sorted reminders, and a care log.

## Features

- **Plant records** -- name, species (optional), location (balcony / roof / indoor),
  acquired date, notes. No plants pre-filled: everything is your own data.
- **Care schedules per plant** -- watering interval (days) and fertilizing interval
  (days), plus last-watered / last-fertilized dates.
- **Dashboard** -- plants needing water today, overdue plants, due-this-week count,
  total plants, and the next 8 upcoming care items.
- **Reminders view** -- every care item due within 7 days (including overdue),
  sorted by urgency, with one-tap "Done" buttons that update last-done dates and
  append to the care log.
- **Care log** -- full history of watering / fertilizing actions with dates.
- **Search, edit, delete** -- filter plants by name / species / location.
- **Backup** -- JSON export / import with strict validation; clear-all guarded by
  typing `DELETE`.
- **Bilingual** -- EN / Bangla toggle (persisted), Bengali digits in Bangla mode.
- **Offline** -- zero network requests; all data in one browser's localStorage.

## How it works

Next-due date = last-done date + interval (days), computed with UTC date
arithmetic (leap-safe). Status relative to today:

- `overdue` -- due date before today
- `due-today` -- due date is today
- `upcoming` -- due within the next 7 days
- `ok` -- due later

## Stack

Pure HTML / CSS / JavaScript, no dependencies, no build step. Open
`index.html` in any modern browser.

## Run locally

```sh
# just open the file, or serve the directory:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Testing

```sh
node tests/run-node-tests.js
NODE_PATH=../job-application-tracker-bd/node_modules node tests/smoke.mjs
```

- `tests/run-node-tests.js` -- unit tests for date math, validation, due-list
  ordering, import validation, and EN/BN string parity.
- `tests/smoke.mjs` -- headless-Chromium UI tests (add plant, mark watered,
  overdue reminders, validation, Bangla toggle + digits, import round-trip,
  clear-all, 390px no-overflow, zero console/page errors, zero network
  requests). Uses a fixed `?asof=2026-10-14` date for determinism.

## Limitations

- Care intervals are your own settings, not expert advice (see the in-app
  disclaimer). The app ships with no plant database and no recommended schedules.
- No background notifications -- reminders update only while the page is open.
- Data lives in one browser's localStorage; no sync across devices.
- Dates are calendar dates (no times of day).

## Status

MVP complete. See `TEST_RESULTS.md` for the verified test run.
