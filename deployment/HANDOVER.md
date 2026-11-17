# Alishan v97 handover

## Task
- Task ID: ALISHAN-CHG-2026-11-18-001.
- Approved scope: Render/Supabase backend, server-side business calculations, existing UI and business behavior preserved.
- Starting version/status: v96; migration not present.

## Source inspection
- Read AI_HANDOVER_PROTOCOL.md and PROJECT_SOURCE_OF_TRUTH.md.
- Inspected calculation, store, DB, report, archive, size-group, advanced-search, export/backup and UI callers.
- Retained original formulas, price snapshots, import rules, archive behavior and append-only history.

## Implementation
- Added Node/Express service with password-protected app/API access, origin checks, bounded JSON input, private static-root serving, health checks, verified PostgreSQL TLS and graceful shutdown.
- Added Supabase private schema and transactional record adapter. Workspace lock serializes writes. Server loads canonical state and applies original v96 rules. Payment checks do not trust browser totals. Full restore is one transaction with a complete safety snapshot.
- Added asynchronous browser adapters and a build that rewires existing UI callers. Original HTML page bodies, CSS, assets, themes and navigation are retained; topic 30/guide footer explain the new connection/migration requirement.
- Moved view-embedded business totals, percentages, advanced-search, report detail quantities and pending days to the server as well.
- Retained presentation formatting, selection state, layout and pagination in the client. The build retires browser workers/caches in server mode; business actions require an online server.
- Added Render Blueprint, environment example, setup/data-migration guide and automated tests.
- No hosted resources were created, no production/main branch was replaced, no existing user data was imported/deleted, and no secrets were included.

## Verification
- `npm run build`: passed; 24 UI scripts processed, 250 functions wired for asynchronous calls; source formulas are not served as client scripts.
- `npm test`: 76/76 passed (64 original regression checks + 12 backend/API/PostgreSQL-engine checks).
- `node backend-tests/page-smoke.cjs`: nine simulated pages passed with sample data. Checked Home counters/card, Inventory card and Edit modal, eight report routes and detail popup, New Entry colour/size input and actual backend save, plus Settings and audit pages. Chart renderer is a stub. These are JSDOM tests, not browser layout tests.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities reported.
- `git diff --check`: passed before final commit.
- Original CSS/assets/navigation source unchanged; original business engine unchanged.
- Browser/runtime limitation: local Chromium launch rejected by environment (`socket() failed: Operation not permitted`). No real 390/360/320 px or desktop-rendering acceptance is claimed.
- Hosted Supabase/Render, external Chart/Excel rendering, real-data scale, hosted backup round trip and uncertain-network behavior remain untested. PostgreSQL schema/rollback checks use the real PGlite PostgreSQL engine, not a live Supabase connection.

## Documentation
- Source of Truth updated: yes, appended change/pending records and v97 row.
- Pending Tracker updated: new acceptance item appended; older history preserved.
- User Guide updated: topic 30 and version footer; existing topics retained.
- Protocol changed: no.

## Final status
IMPLEMENTED — NOT VERIFIED (hosted and real-browser acceptance pending).

Remaining work: configure the intended Supabase project and Render service with private credentials, deploy the branch, restore a copy of the old complete backup, compare records/totals, and complete the real-device/export checks listed in SETUP.md before replacing the existing deployment.

## Deliverables
- Source branch: `backend/render-supabase-v97`.
- Archive: `AlishanApp-v97-Render-Supabase-Backend.zip` (source under `alishanapp-main/`; excludes `.git`, private environment files, generated client and dependencies).
- Version log row: v97, 2026-11-18, ALISHAN-CHG-2026-11-18-001.
