# TEST_RESULTS — plant-care-tracker-bd

Verified 2026-10-14 (manual factory run #62). Re-run commands:

```sh
node tests/run-node-tests.js
node tests/smoke.mjs   # requires node_modules symlink to ../job-application-tracker-bd/node_modules (test-only, do not push)
```

## Results

- **Node unit tests: 67/67 passed** (`tests/run-node-tests.js`)
  - Date parsing (rejects 2026-02-30, month 13, garbage)
  - Leap-safe `addDays`: 2024-02-28+1 = 2024-02-29; 2024-02-29+1 = 2024-03-01;
    2023-02-28+1 = 2023-03-01; 2026-12-31+1 = 2027-01-01
  - `daysBetween`, `nextDue`, `careStatus` incl. +7 upcoming / +8 ok boundary
  - `validatePlant`: name required/too-long, interval 0/366/float, future
    acquired/last-watered/last-fertilized, notes/species too long
  - `validateLogEntry`: unknown plant, bad type, future date, note too long
  - `dueList` ordering (overdue first, most-overdue first), `summarize` counts
  - `validateImport`: duplicate ids, unknown log plant, future dates rejected
  - i18n EN/BN key parity (75 keys), no empty values, BN differs from EN
- **Headless-Chromium smoke: 28/28 passed** (`tests/smoke.mjs`, `?asof=2026-10-14`)
  - Render + empty states, add plant via UI, mark-watered updates last date + log,
    overdue reminders with badge, empty-name validation rejected inline,
    BN toggle (Bengali title + Bengali digits), import round-trip,
    clear-all with DELETE confirmation, 390px no horizontal overflow
  - **0 console errors, 0 page errors, 0 network requests**

## Hand-verified math (fixed cases)

- Money Plant: last watered 2026-10-11 + 3 days = due 2026-10-14 (due today)
- Tulsi: last watered 2026-10-01 + 3 days = due 2026-10-04, overdue by 10 days
  on 2026-10-14
- Leap: 2024-02-29 + 1 day = 2024-03-01 (see unit tests)

## Hygiene

- `grep -rP '[^\x00-\x7F]'` on all shipped sources: zero matches (pure ASCII;
  Bengali stored as `\uXXXX` escapes, decoded and eyeballed correct).
- No secrets. No network requests. Ships empty (no plants pre-filled).

## Genuine repairs (2)

1. Smoke test file was truncated to 0 bytes by a failed ASCII write (a raw
   Bengali literal raised UnicodeEncodeError mid-write). Rewrote the file with
   escapes in place and converted literals via temp-file + atomic replace.
2. Unit fixture bug (not app logic): Tulsi's test dates implied an "upcoming"
   status, not "due-today". Fixed the fixture (lastWatered 2026-10-12, every
   2 days -> due 2026-10-14). App logic unchanged.
