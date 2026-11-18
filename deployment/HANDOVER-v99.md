# Alishan v99 device cache handover

## Task
- Task ID: ALISHAN-CHG-2026-11-18-003; starting release v98.
- User-approved scope: implement saved-device/RAM views, next-page prefetch, fewer initial requests and server pagination, while retaining the frontend design and backend calculations.

## Source inspection
- Followed AI_HANDOVER_PROTOCOL.md and PROJECT_SOURCE_OF_TRUTH.md; inspected client transport, read/write routing, domain initialization, original Inventory filters/advanced sorting, Home startup, report readers, shared card/modal creation and asset build.
- Existing design/navigation, formulas, stored prices, payment validation, archive rules and original export paths retained. Cached copies are display-only; the server remains authoritative.

## Implementation
- Added client/device-cache.js: isolated RAM copies and scoped IndexedDB snapshots, bounded eviction, TTL, single-flight reads, background revalidation, revision invalidation, stale-flight fencing, authentication purge and storage-unavailable fallback.
- Conditional revalidation computes a digest of the server result. When a cached answer is byte-identical, the API returns only an unchanged marker and the device keeps its copy, including across repeated revalidations. Digests never suppress write execution; backups/exports remain fresh-only.
- Updated client/runtime.js: cache integration, primary page preparation, idle/hover prefetch, visible saved/updating/offline/current status, cross-tab invalidation, 15-second/focus/online checks and a Settings Refresh saved view control.
- Added backend/page-bundles.js. Initial Home/Inventory/Reports data is bundled from original methods. Inventory filters/advanced sorting/pagination use the existing rule functions server-side and return only the chosen 10/20/50/100 raw records plus original card values. Home latest view returns five records.
- Added authenticated revision endpoint and revision response headers; scope identity fingerprints origin/credentials/database/release. Static build metadata replaces a blocking metadata API call. Assets use a deterministic source fingerprint as well as the release version, preventing an interim build from remaining in the app-file cache. Assets are private/ETag revalidated. Authenticated HTML is not stored as a data cache.
- Changed scripts/build-client.mjs to prime initial reads and show primary content before nonblocking form setup; modal injection has a shared readiness promise to avoid concurrent-open initialization races.
- Changed backend/domain.js, database.js, operations.js, server.js; added device/page-bundle tests and updated the memory test adapter. Updated package/README/guide versions and Source of Truth.
- Added client/view-shell-worker.js and backend-tests/shell-cache.test.js: sanitized app-file cache, same-tab bound navigation, new-tab authentication fallback, no API/write caching and no Authorization in asset keys. Generic HTML is stored without session scope; identities are bound to existing same-origin client IDs. This removes the remaining HTML round trip on a warm same-tab navigation once worker preparation completes. Browser workers can stop/evict caches; network fallback remains.
- No schema migration, dependency, paid upgrade, new hosting resource, live-data restore, frontend business calculation or offline write queue.

## Verification
- npm run build: passed, 24 UI scripts and 251 async functions.
- npm test: 98/98 passed (82 existing plus ten cache lifecycle, four page/API and two shell-cache tests).
- node backend-tests/page-smoke.cjs: nine sample-data JSDOM pages passed, including Add Entry save, Inventory Edit and eight report routes/detail. Charts were mocked.
- Cache tests: repeated reads/clone isolation, writes never cached/retried, simulated disk navigation retention, scope/release isolation, revision changes, stale-flight invalidation, uncertain payment errors, offline stale views, single-flight deduplication, authentication purge, monotonic revision protection and compact bundle markers.
- Backups/exports/validation previews and raw DB readers bypass device view caching. An authoritative revision reset invalidates old views.
- Page/API tests: server page cap/order/counts equal original filters, card primes equal original calculation functions, original summaries/history/report overview, no read mutation, auth on revision endpoint, scoped HTML, revision headers, private asset ETags.
- Private actual-backup navigation simulation used 390 entries, 409 payments and a shared simulated IndexedDB adapter, with 150 ms artificial API latency: Home, Inventory, Reports and a return to Inventory all rendered without page errors. Returning Inventory rendered about 330 ms after creating its JSDOM document; this is a simulated renderer/cache-flow timing, not an actual phone or full internet page-load measurement. Initial primary content used one page bundle; edit/entry-form Groups calls remained uncached and did not delay initial cards. Upload data was not committed or included in the ZIP.
- Shell-worker tests: bound navigation returns a cached sanitized shell with zero network; unbound/new tabs and cleared bindings return to normal authentication; API/write requests are not intercepted; per-session scope is stripped from stored HTML. These are VM protocol tests, not actual browser service-worker lifecycle tests.
- Syntax checks and git diff --check passed before final packaging.
- Real browser/mobile: not passed. Local Chromium failed to launch in this runtime; the connected browser extension was unavailable and the cloud browser could not reach the local synthetic preview (ERR_CONNECTION_REFUSED). Actual IndexedDB persistence and 390/360/320px indicator/control/guide rendering remain unverified. Simulated IndexedDB tests must not be presented as actual browser disk tests.
- Hosted verification: final code f8bd10620cd585a3147d73891da0d6c6e0581700 deployed live in Render deploy dep-dbutp756e07s73eli5u0 on 18 Nov 2026. Authenticated release/status, paged reads, initial bundle, scoped HTML, worker source/registration and private asset delivery all returned HTTP 200.
- Live status response: 78 bytes, release 99.0.0, revision 7. Inventory page 2 returned exactly 20 of 390 records with 80 authoritative card primes and snapshot revision 7 (application duration 917.6 ms in a concurrent test). The initial page bundle returned 50 of 390 records in 582778 bytes (application duration 1816.8 ms). These first/live API timings are not warm-cache page-load timings or a subsecond guarantee.
- Live database counts remained 390 inventory, 409 payments, 34 quality-history and 106 activity records. This task did not restore/replace live user data. No new runtime application errors appeared in the observed post-deploy logs.
- Browser worker registration/activation, real browser disk retention and click latency still require an actual device; source delivery and VM tests do not establish these production browser results.

## Documentation
- Source of Truth updated: Yes. Pending Tracker updated: Yes. Change history appended: Yes.
- Version row: v99 / AlishanApp-v99-Device-Cache.zip / 2026-11-18 / ALISHAN-CHG-2026-11-18-003.
- Guide topics: topic 30 new v99 steps/examples/offline and cache limits, matching version footer. Existing screenshots are unchanged examples; no fabricated new screenshot was added.

## Final status
- IMPLEMENTED — NOT VERIFIED: code and automated/simulated flows implemented; real browser/device persistence/visual acceptance pending as ALISHAN-PEND-2026-11-18-003.
- Cached view age is bounded to 24 hours; answers older than one minute revalidate while showing the saved result. Visible pages poll revisions every 15 seconds; visibility/focus/network and browser throttling affect timing.
- RAM disappears when a page/process closes. IndexedDB copies can survive navigation/reopening, subject to browser/private-mode/quota/eviction behavior. This view cache is not a backup.
- Cache is limited to 8 MiB/600 answers, 2 MiB per answer. Large detailed reports/export requests retain their original server paths; not every detailed report is server-paginated in this release.
- Writes always reach the server and purge cache even on uncertain errors; no automatic write retry, success before acknowledgement or offline calculation is introduced.

## Delivered files
- Archive: AlishanApp-v99-Device-Cache.zip, root alishanapp-main/. Sources, generated client, tests, setup, append-only requirements and this handover; no node_modules/Git metadata/environment secrets/user backup data.
- Existing source repository: https://github.com/lotstriker/alishanapp ; existing app: https://alishanapp-server.onrender.com .
