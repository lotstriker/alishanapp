# v101 handover

ZIP file `AlishanApp-v101-Reviewed-Entries.zip`. The version log records the build under ALISHAN-CHG-2026-11-20-001.

- Add Entry uses a server review and a separate confirmation. A saved entry receives a PostgreSQL BIGINT sequence value, sent as a string. Failed and rolled-back transactions can leave gaps.
- Entry and payment retry results are stored with the transaction. An interrupted save can be checked when Save is tapped again. Add and Edit show a local preview built from the same quantity, price and rounding functions used by the server.
- Original and current draft prices can be selected on review after the first review captured a price. Previously submitted records retain the saved price when the master changes. Manager-approved custom pricing is pending.
- Approved quantity edits retain payment history and show Extra Received in report detail. The existing Monday–Sunday split was verified on Friday completion and Sunday/Monday receipts.
- Advanced Export confirms the number of rows in each selected data set. Inventory Advanced JSON export confirms matching entries. New archive, restore and permanent removal operations require the future approval workflow.
- User Guide topic 30 and the version footer describe the current controls.

## Validation and rollout

Run `npm ci`, `npm run build`, `npm test` and `node backend-tests/page-smoke.cjs`. Automated UI checks use JSDOM. Chromium launch was blocked in the host environment, so the required real-browser 390, 360 and 320 px checks, Android timings, and the native Save as PDF dialog still need verification.

Run the additive sequence DDL in `deployment/schema.sql` before deploying v101 to an existing Supabase database. Existing records and codes need no data migration. The candidate has not been deployed to the live Render service.
