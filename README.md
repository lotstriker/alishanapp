# alishanapp
this is a inventory app

- **PROJECT_SOURCE_OF_TRUTH.md** — complete layout, calculation flow, feature flows and the permanent, append-only change history. Read it before changing code and update it with every change.
- `frontend/ARCHITECTURE.md` — how the code files are organised.
- `frontend/setting.html` + `frontend/user-guide.js` — searchable in-app Visual Learning Center; app and guide versions must match every release.

- **AI_HANDOVER_PROTOCOL.md** — mandatory rules for every AI/developer, including scope control, evidence-based status changes, testing and handover.

- **ZIP version rule:** every update delivers a new ZIP named `AlishanApp-v<NN>-<Short-Description>.zip` (number +1 each time) and adds a line to the Version log in `PROJECT_SOURCE_OF_TRUTH.md`. Current: **v90**.


- **Regression tests:** run `node --test tests/*.test.js` from the project root (pagination, responsive layout and User Guide/version synchronization).


## Responsive layout

`frontend/responsive-layout.css` contains tablet and desktop-only layout enhancements (`min-width: 769px`). The existing phone layout remains controlled by `frontend/mobile.css`. The tablet/desktop Inventory Overview reads the existing store summary; Dashboard Quick Actions (including Export Data, Import Data and Bulk Import) remain on the Dashboard.
