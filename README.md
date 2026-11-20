# alishanapp
this is a inventory app

- **PROJECT_SOURCE_OF_TRUTH.md** — complete layout, calculation flow, feature flows and the permanent, append-only change history. Read it before changing code and update it with every change.
- `frontend/ARCHITECTURE.md` — how the code files are organised.
- `frontend/setting.html` + `frontend/user-guide.js` — searchable in-app Visual Learning Center; app and guide versions must match every release.

- **AI_HANDOVER_PROTOCOL.md** — mandatory rules for every AI/developer, including scope control, evidence-based status changes, testing and handover.

- **ZIP version rule:** every update delivers a new ZIP named `AlishanApp-v<NN>-<Short-Description>.zip` (number +1 each time) and adds a line to the Version log in `PROJECT_SOURCE_OF_TRUTH.md`. Current: **v110**.


- **Regression tests:** run `node --test tests/*.test.js` from the project root (pagination, responsive layout, User Guide/version synchronization and the compulsory Version log check).


## Responsive layout

`frontend/responsive-layout.css` contains tablet and desktop-only layout enhancements (`min-width: 769px`). The existing phone layout remains controlled by `frontend/mobile.css`. The tablet/desktop Inventory Overview reads the existing store summary; Dashboard Quick Actions (including Export Data, Import Data and Bulk Import) remain on the Dashboard.

## Server deployment (v97)

Render + Supabase setup: [deployment/SETUP.md](deployment/SETUP.md). Run `npm ci`, `npm run build`, and `npm start` with the required private environment variables. The production server serves only generated UI code from `dist/`; business calculations and storage run on the server. Live deployment and real-browser mobile acceptance are pending.

Backend performance changes and verification: [v98 handover](deployment/HANDOVER-v98.md).

Device view caching and page bundles: [v99 handover](deployment/HANDOVER-v99.md).
