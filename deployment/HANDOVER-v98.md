# Alishan v98 performance handover

## Task
- Task ID: ALISHAN-CHG-2026-11-18-002; starting status IN PROGRESS on v97.
- Approved scope: optimize backend reads, payloads and restore persistence; preserve existing frontend and calculation rules.

## Source inspection
- Read AI_HANDOVER_PROTOCOL.md and PROJECT_SOURCE_OF_TRUTH.md; inspected database/domain/API/client, original Store initialization and backup paths, archive and report dependencies.
- Found full-workspace locking/loading/diffing for readers, large settings snapshots, per-row writes and argument echoes.
- Locked decisions retained: original formulas, price snapshots, record shapes, payment validation, UI/navigation and append-only history.

## Implementation
- Changed backend/database.js, backend/domain.js, backend/server.js, client/runtime.js and scripts/build-client.mjs; added backend/operations.js and backend-tests/performance.test.js.
- Added single-statement MVCC projected reads with revision-validated, bounded snapshots; no reader write lock. Copies isolate callers. Writes retain workspace lock and original canonical validation.
- Pure calculation/group/reference operations skip database loading. Reused compiled VM scripts; backup maintenance persists on the background/write path.
- Changed-row writes use batches of up to 100; deleted keys batch per store. No schema change or new dependency.
- Independent Home/Inventory card models are requested in parallel, then appended in original order. Only those exact read-only loops change in the server build; sequential write semantics remain. Static reference lookups are cached. Actual-data JSDOM Inventory plus Edit check: 173 requests before this change, 23 afterwards; Home: 28 to 15. These request counts include the test harness and do not establish physical-phone timings.
- Request-local shared arguments transmit identical large report scopes once per batch, with a 500-call queue bound; the server validates/expands them before executing the same methods. No persistent reference token or automatic write retry is introduced.
- Ordinary responses omit argument copies. Groups keep argument mutation transport. Complete restore uses a three-minute response window and clears client cache; uncertain writes are not automatically retried.
- README/package versions, Source of Truth version row/history/tracker and User Guide topic 30/footer updated. No layout/CSS changes, paid upgrade, database replacement or formula changes.

## Verification
- npm run build: passed, 24 scripts / 250 async functions.
- npm test: 82/82 passed (64 original tests, 12 earlier backend tests, six new SQL/projection/cache/rollback/routing tests).
- New tests use real PGlite SQL execution, including batched insert/delete, mid-write failure rollback, cache revision changes through a second repository, snapshot mutation isolation, projected settings, lock-free reader routing, database-free calculations and omitted large arguments.
- Actual uploaded ZIP restored to an isolated PGlite database: 390 imported, zero skipped, 409 payments; 21 total SQL calls including transaction scaffolding, about 748 ms locally. A projected summary used one SQL call, about 98 ms locally; total value 1088862.5, pending 15055. These are local measurements, not hosted/device guarantees.
- Live v97 baseline summary checks: HTTP 200, 390 items, value 1088862.5; 12.034 / 10.502 / 9.804 seconds end to end.
- Nine simulated JSDOM sample-data pages passed; these do not establish real browser rendering. Actual-data Reports initially exposed a ~69 MB batch (HTTP 413); shared-argument packing and bounded queues correct it. All eight actual-data pages passed simulated JSDOM checks: Home, Inventory + Edit, eight report routes/detail, Settings, Pending Amount, Missing Lot, Missing Completion, Quality History. Largest Reports request was 534137 characters after packing versus roughly 69 MB before. Chart drawing was mocked; this is not real-browser/device acceptance. Live v98 first-deploy summary checks returned unchanged 390 items/value: 8.200 / 7.202 / 7.806 seconds end to end; application Server-Timing 442.6 / 393.0 / 421.3 ms. Final shared-argument/card transport deployed live: commit 04db0f0d4d7e2d8e3f970366a2d71535d11d6697, Render deploy dep-dbut02qfngtc73dpah10 (live). Final summary: 11.233 / 8.104 / 8.392 seconds end to end, with application durations 1652.2 / 404.6 / 533.4 ms; first request was after deployment. A packed pure-calculation batch returned HTTP 200, fixture amount 20, application duration 3.1 ms. One combined payment-read check returned HTTP 502 without a matching application error log; an identical read-only retry passed HTTP 200, both calculation fixtures matched and all 409 payment records were returned (application duration 202.1 ms). The isolated 502 is retained here as a known network/service observation, not hidden. Do not interpret application-only timings as full page-load speed.
- Browser/runtime testing: local API/SQL tests plus live HTTP checks; no real-browser or physical-phone visual pass claimed.
- Mobile/desktop testing: layout unchanged; new guide text/footer not visually checked at 390/360/320 px. Existing real-device acceptance remains PENDING.

## Documentation
- Source of Truth updated: Yes; Pending Tracker updated: Yes; Change history appended: Yes.
- New Version log row: v98 / AlishanApp-v98-Backend-Performance.zip / 2026-11-18 / ALISHAN-CHG-2026-11-18-002.
- Guide topics changed: 30 (new v98 instructions) and synchronized footer; existing topics/layout retained.

## Final status
- COMPLETED for backend optimization/API scope; real-browser/device acceptance remains PENDING separately.
- Final database check: 390 inventory entries, 409 payments, 34 quality-history and 106 activity rows; payment sum 1151288.5 unchanged. No user backup or secret was published in source/archive.
- Separate PENDING: full real-browser/device workflows, all export formats and visual acceptance from the earlier migration tracker.
- Known limits: Free hosting cold starts and network latency remain. Snapshot caches are per process and revalidate the committed database revision on each data read. During a write, readers see the last committed state; after commit their next server read sees the new revision.

## Delivered files
- Archive: AlishanApp-v98-Backend-Performance.zip, root alishanapp-main/. Contains original sources, generated client, tests, setup instructions, Source of Truth and this handover; excludes node_modules, Git metadata, environment secrets and uploaded user data. ZIP is validated before delivery.
- Published source: https://github.com/lotstriker/alishanapp ; live app: https://alishanapp-server.onrender.com .
