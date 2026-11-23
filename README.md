# AlishanApp

A mobile-friendly web app for managing inventory, payments, and reporting.

## What it does

- Record product quantities by quality, colour, and size.
- Review drafts before submitting them. The server verifies the entry and assigns a permanent Quality Code.
- Track stock, pending amounts, and payment history.

## Entry walkthrough

1. Open **Add Entry**, enter the product details and quantities, and select **Send to Review**.
2. Go to **Dashboard → Quick Actions → Entry Review**. Open the quality card to check the sizes, quantities, and total. Use **Edit** to make corrections.
3. Select **Submit**. The server assigns the Quality Code and the saved entry moves to **Inventory**.

## Run locally

Use Node.js 24 or newer. Configure the backend using the environment variables in [deployment/SETUP.md](deployment/SETUP.md), then run:

```sh
npm ci
npm run build
npm start
```

Run `npm test` to run the frontend and backend test suites.

## Recent changes

- Added draft review cards with Edit, Delete, and final Submit actions.
- Added an invite list for Google sign-in.
- Added browser caching and server timing diagnostics for startup and navigation.

See the [Version log](PROJECT_SOURCE_OF_TRUTH.md#version-log) for the complete change history.

## Project documentation\n\n- **MANAGER_APP_HANDOVER.md** — Manager Control Center redesign, rationale, connected features and verification status.

- **PROJECT_SOURCE_OF_TRUTH.md** — complete layout, calculation flow, feature flows and the permanent, append-only change history. Read it before changing code and update it with every change.
- `frontend/ARCHITECTURE.md` — how the code files are organised.
- `frontend/setting.html` + `frontend/user-guide.js` — searchable in-app Visual Learning Center; app and guide versions must match every release.

- **AI_HANDOVER_PROTOCOL.md** — mandatory rules for every AI/developer, including scope control, evidence-based status changes, testing and handover.

- **ZIP version rule:** every update delivers a new ZIP named `AlishanApp-v<NN>-<Short-Description>.zip` (number +1 each time) and adds a line to the Version log in `PROJECT_SOURCE_OF_TRUTH.md`. Current: **v126**.


- **Regression tests:** run `node --test tests/*.test.js` from the project root (pagination, responsive layout, User Guide/version synchronization and the compulsory Version log check).


## Responsive layout

`frontend/responsive-layout.css` contains tablet and desktop-only layout enhancements (`min-width: 769px`). The existing phone layout remains controlled by `frontend/mobile.css`. The tablet/desktop Inventory Overview reads the existing store summary; Dashboard Quick Actions (including Export Data, Import Data and Bulk Import) remain on the Dashboard.

## Server deployment (v97)

Render + Supabase setup: [deployment/SETUP.md](deployment/SETUP.md). Run `npm ci`, `npm run build`, and `npm start` with the required private environment variables. The production server serves only generated UI code from `dist/`; business calculations and storage run on the server.

Backend performance changes and verification: [v98 handover](deployment/HANDOVER-v98.md).

Device view caching and page bundles: [v99 handover](deployment/HANDOVER-v99.md).
