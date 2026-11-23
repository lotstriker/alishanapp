# Alishan Manager — UI Redesign & Implementation Handover

**Date:** 2026-11-23  
**Branch:** `manager-control-center-redesign`  
**Status:** IMPLEMENTED — NOT VERIFIED (automated tests and live authenticated/browser acceptance still pending)

## Purpose

Replace the deployed single-purpose Approval Requests page with the previously designed Alishan Manager Control Center layout, while keeping only real, connected data visible as live information. Add the Manager's approved dashboard ideas and fix the rejection-reason persistence/validation gap found during the deployment audit.

## Why these changes

### Before
- Manager page only had a small approval request list, three action filters and a header.
- No navigation framework for future Manager modules.
- No Dashboard overview, mobile navigation, participant strip, system-health panel or Activity view.
- Approval decisions were sent without a reason field; the backend attempted to store `decision_reason`, but the original migration did not create the column.
- The requests API did not return requester identity or a saved decision reason.

### After
- Alishan-style header branding and desktop top navigation.
- Mobile bottom navigation for Home, Users, Inventory, Approvals and More (More sheet provides Reports, Search, Activity, Backup, Health and Settings).
- Dashboard Control Center includes live approval counters, service-health check, pending-attention panel, recent decisions and horizontal request-participant strip.
- Approval Center has search, status/action filters, pending counts, requester identity, timestamps, approve confirmation and rejection dialog with required reason.
- Activity view shows available decision history.
- Backend exposes requester ID and decision reason to invited Managers only through the existing authenticated Manager API.
- Backend rejects a rejected decision without a non-empty reason, or a reason longer than 500 characters.
- SQL migration adds `decision_reason` to fresh tables; a standalone repeatable `deployment/manager-approval-reason-migration.sql` is provided for existing deployments.
- Regression test covers missing-reason rejection, saved reason and requester field.

## Data truth / limitations

Only Approval Center/request participants/decision history and the `/healthz` readiness check use live data in this iteration.

The following are present as navigation and clear integration-pending states, not fake/demo data:
- Full User Directory and profiles
- All Inventory and read-only Quality details
- Reports & analytics
- Global Search
- Full audit/activity feed
- Backup/restore operations and history
- Detailed System Health / metrics
- Manager notifications

The horizontal strip represents **request participants from real approval rows**, not all users and not Instagram-like activity presence. The current API does not provide a full user roster, profile names, avatars or user activity status. It displays a short requester ID rather than inventing names or online states.

## Permission and safety boundaries

- Manager invitation remains server-checked.
- Quality/inventory data must remain read-only for Manager.
- Payment UI/API is not added.
- Archive and restore are the only current approval actions.
- Permanent delete is not implemented through this Manager workflow.
- Restore and backup controls are not exposed as working actions until a permission-scoped API, safeguards and verification are designed.
- Rejection reason is validated in both UI and backend; the backend is authoritative.

## Files changed

- `manager-app/index.html` — Control Center UI and responsive navigation.
- `backend/manager-approvals.js` — requester/reason fields, required rejection reason validation.
- `backend/server.js` — pass reason through decision API.
- `deployment/manager-approvals.sql` — schema for fresh Manager approval setup.
- `deployment/manager-approval-reason-migration.sql` — standalone idempotent upgrade for an existing Manager table.
- `backend-tests/manager-approvals.test.js` — requester/reason regression coverage.
- `PROJECT_SOURCE_OF_TRUTH.md` — append-only change record.
- `README.md` — link to this handover.

## Verification still required

- Run `npm test` and `npm run build` from a complete checkout.
- Verify the manager approval test on PGlite.
- Authenticated browser acceptance at desktop and 390/360/320 px mobile widths.
- Verify actual theme integration and logo asset path in deployed build.
- Verify live health and approval read, approve, reject-with-reason, and history behavior.
- Apply migration to a test copy of an existing Manager table and confirm it is safe/idempotent.
- Review this branch before merging to `main`; no production deployment is claimed.

## Why this release is intentionally staged

The design is being integrated into the existing Manager route rather than treating the earlier ZIP mockup as production code. The missing read APIs are dependencies for Users, Inventory, Reports, Search and Backup. Their sections are visible so the product structure is established, but they are not presented as working features until the server has permission-scoped endpoints and tests.

## CodeRabbit follow-up fixes (2026-11-23)

- **Approval filter/status ID collision:** the status dropdown and status message now use distinct IDs (`approval-filter-status` and `approval-status`), so the refresh message no longer overwrites the dropdown options.
- **Recent decisions ordering:** the dashboard now sorts completed requests by descending `decided_at` before taking the latest five. Pending queue order is unchanged.
- **Reject dialog focus:** focus moves into the reason field when opened; Tab/Shift+Tab are contained inside the modal; Escape and Cancel close it and restore focus to the invoking Reject button (or a stable status control if that button no longer exists). Validation/API errors keep focus in the dialog. After a successful rejection and reload, focus moves to the Approval Center status control.
- **Validation performed here:** both inline JavaScript scripts were parsed successfully with `new Function` after the change. Full automated suite/build and browser accessibility checks remain pending.

- **Async rejection race guard:** each reject-dialog opening/closing has a session token. A late API response from a cancelled/older dialog cannot close or overwrite a newly opened rejection dialog; only the matching session can close or display its error.
- **CI setup:** added `.github/workflows/manager-pr-verification.yml` to run `npm ci`, `npm test`, and `npm run build` on Node 24 for PRs into `main` and pushes to this branch. Workflow execution is not yet confirmed.

- **CI workflow correction:** the first workflow attempt exposed that existing backend tests expect generated `dist/` files. The workflow now runs `npm run build` before `npm test`; the failed first attempt was a test-order setup failure, not a Manager feature assertion. The corrected run is pending.
