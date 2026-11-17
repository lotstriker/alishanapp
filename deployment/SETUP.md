# Alishan v97 — Render + Supabase setup

Status: implementation and automated verification are available. Live Supabase/Render verification and real-browser mobile acceptance are pending. Keep the current live v96 app until those checks pass.

## What stays the same

The original v96 HTML page bodies, CSS, logo, themes, navigation, field names, calculation rules and saved record shapes are retained. The only intentional visible content update is this release's User Guide information/version. Production serves a generated `dist/` directory. It contains API adapters and asynchronous UI code, not the business engine. Number/date formatting remains presentation code.

The original business source remains in the repository for parity checks and executes on Node through `backend/domain.js`. `frontend/calc.js`, `store.js`, `report-engine.js`, `archive.js`, the size-group rules and advanced-search rules are not sent to the browser. This means the app now needs a working server connection for calculations, records, reports and backups. Offline calculation is incompatible with the requested server-only calculation policy.

## 1. Keep your old data safe

1. Open the existing v96 app in the same browser/profile where your records are stored.
2. Use its existing complete ZIP backup/export flow. Keep that downloaded file.
3. Leave the old app and its browser data untouched until the server copy has been checked.
4. After the new server is running, use its existing complete ZIP restore flow. The server validates and restores inventory, payments, history and settings together, retaining a full pre-restore safety copy.
5. Compare entry count, inventory value, pending amount, received amount, sample entries and Archives between both apps.

Browser IndexedDB is origin-specific. A different Render address cannot read the original GitHub Pages browser database. There is deliberately no silent automatic migration or deletion.

## 2. Prepare Supabase

1. Create a Supabase project or choose the intended existing project.
2. Run `deployment/schema.sql` once in that project's SQL Editor. This creates only `alishan_private` tables; it does not alter existing `public` tables.
3. In Supabase's Connect dialog, copy the **Session pooler** PostgreSQL URI. A persistent Node server can use the session pooler, which also supports IPv4. URL-encode special characters in the password.
4. Use that URI as Render's secret `DATABASE_URL`. Use only the trusted backend's database owner credential; it must never be placed in frontend code or chat.
5. TLS certificate verification is enabled. If the project's certificate chain requires its root certificate, set `DATABASE_CA` to the PEM certificate in Render. Do not disable verification or set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

The records are outside Supabase's exposed Data API schema. The schema revokes access from `anon` and `authenticated` and enables RLS as defense in depth. No Supabase service-role key is used in the browser. This preserves the existing single-shop model; multi-tenant roles and Manager approval workflows are outside this migration.

The generic `records` table preserves the ten existing v96 store shapes and numeric/string keys. Inventory/payment/archive changes run in one PostgreSQL transaction. A workspace-row lock serializes read/modify/write actions across Render instances and devices. Payments use authoritative database inventory and payment totals. The whole workspace is read per request/batch; large deployments should benchmark before scaling. This is a compatibility migration, not a new normalized inventory schema.

## 3. Create the Render service

Use the dedicated Git branch containing this change; keep `main` untouched during review. In Render choose **New → Blueprint**, select this repository/branch, and use `render.yaml`. Alternatively create a Node Web Service manually:

| Setting | Value |
|---|---|
| Root directory | repository root (blank) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Node | `24` |
| Auto deploy | Off during acceptance |

Set these environment variables in Render:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `DATABASE_URL` | Supabase session-pooler URI; secret |
| `DATABASE_CA` | Optional root certificate PEM; TLS verification stays on |
| `APP_USERNAME` | Your chosen server-access username |
| `APP_PASSWORD` | A unique password of at least 20 characters; secret |
| `APP_WORKSPACE` | `alishan` |

The server listens on `0.0.0.0` and Render's `PORT`. `/healthz` checks database readiness. No database credentials or formulas are exposed by static routes. The server intentionally refuses to start without a database and strong access password. All pages and API calls are protected by the browser's HTTPS Basic Authentication prompt; this is a server access gate, not a redesigned app login page. Use HTTPS on Render. The health endpoint returns only readiness, without records.

A Render service is not verified just because its deploy was queued. Wait for the deployment to become live, then verify `/healthz`, sign in, restore the backup and perform the checks below. Choose your plan in Render; no paid resources have been created by this code change.

## 4. Run locally

Use Node 24. Copy `.env.example` to a private `.env` and fill it locally. Do not commit or paste secrets. Run the schema in a development Supabase project first.

```sh
npm ci
npm run build
node --env-file=.env backend/server.js
```

Open `http://localhost:10000/` (or your configured `PORT`). The test-only in-memory repository is never used by `npm start`; it is not a production fallback.

## 5. Verification

```sh
npm run build
npm test
node backend-tests/page-smoke.cjs
```

Tests cover v96 regression rules, server/legacy calculation parity, shared/different colour sizes, server-owned prices and amounts, editing, parallel payments, archive/restore/permanent deletion, full restore safety, report/dashboard projections, wire transport, authentication, CSRF-origin checks, private source routes, and SQL schema/transaction round trips through the PGlite PostgreSQL engine.

Page smoke checks execute nine pages with sample data using JSDOM. They exercise Inventory Edit, eight report routes and report details, plus New Entry colour/size editing. Chart rendering is mocked. These are simulated DOM checks, not actual mobile/browser rendering tests.

Before replacing the old app, use a real browser at 390, 360 and 320 px and a desktop width. Check Add, Edit, Complete/Incomplete, payments, all reports/filters, Bulk Import/Undo, each export format, complete ZIP round trip, theme persistence, Archives and second-device changes. Chart.js/Excel/CDN behavior, offline errors, uncertain network outcomes, performance with your real record count, live TLS and hosted database transactions need acceptance checks. Do not auto-retry an uncertain write; reload and inspect the result first.

## Operations

- Render stores no durable business data on its local disk; Supabase retains it across restarts.
- Application backups stay in Supabase settings and use the existing retention rules. The server checks due automatic backups every minute; these are not a replacement for independent Supabase database backups.
- Existing service workers/caches are retired in server mode so they cannot serve old client formulas or stale authenticated pages. The app's UI and manifest remain; offline business operations require a server connection.
- Same-browser tab changes use BroadcastChannel. Other devices get fresh data when an action, filter, report or page reload reads the server; push-based live updates are not introduced.
- Shutdown drains HTTP work and closes the PostgreSQL pool.
- App access uses one server account matching the existing single-shop scope. There is no new user/role model.
