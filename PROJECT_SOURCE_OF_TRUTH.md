# ALISHAN — Project Source of Truth

This file is the single reference for **how the app is laid out, how every number is calculated, how data flows, and
why every change was made**. It is permanent and **append-only**.

---

## 0. PERMANENT RULES (read before changing any code)

1. **Read this file first** — every developer / AI must read it before changing code.
2. **Update this file in the same change** as the code. A feature is not finished until this file is updated.
3. **Never delete old text.** Old history stays forever. If a decision or behaviour changes, mark the old one
   `SUPERSEDED by <Change ID>` and add the new one below it.
4. **Every change gets a record** in section 6 with: Change ID, Date, Type (New feature / Changed feature / Fix),
   Reason, Before, After, Impact, Files.
5. **Change ID format:** `ALISHAN-CHG-YYYY-MM-DD-NNN` (NNN restarts at 001 each day).
6. **No mismatch:** this file and the code must always agree. If you find a mismatch, fix it and record it as a Fix.
7. **Calculations only in `calc.js`**, saving only through `store.js` / `db.js`, pages only take input and draw data
   (see `frontend/ARCHITECTURE.md`). A new button must reuse the existing calc/store function, never copy its maths.
8. **Every update changes the version of the ZIP file (added by ALISHAN-CHG-2026-11-06-001).** Whenever source files are
   changed and delivered, the project ZIP gets a NEW version number: `AlishanApp-v<NN>-<Short-Description>.zip`, where
   `<NN>` is the previous number + 1 (v74 comes after v73, never reuse or skip a number) and the description names the
   main change in a few words with hyphens (example: `AlishanApp-v74-Export-Center-Redesign.zip`).
   - The same change adds one line to the **Version log** (section 10): version, file name, date, change IDs, summary.
   - The top-level folder inside the ZIP stays `alishanapp-main/`; the version lives in the ZIP file name and the log.
   - A ZIP is never delivered under an old name, and two different ZIPs never share a version number.
   - A change that only fixes the documentation still gets a new version (a documentation-only change is also an update).
9. **Screens must work on a phone (added by ALISHAN-CHG-2026-11-08-001).** The owner uses the app on a phone. Any change to a screen is looked at at **390, 360 and 320 px wide** (a real browser, not only a script test) before delivery: nothing may be wider than the screen, buttons must stay reachable. Rules learned the hard way: (a) a CSS grid or flex child does not shrink below its content by default, so a grid that holds a table or two side-by-side boxes needs `grid-template-columns: minmax(0, 1fr)` and `min-width: 0` on its children; (b) the app styles every `<header>` and `<footer>` tag as its top bar, so dialogs use plain `<div>`s; (c) the phone's bottom navigation sits at z-index 1000–1100, so full-screen dialogs use 1200; (d) a wide table becomes one card per record on a phone (`.rp-stack`).
10. **The Version log is compulsory (added by ALISHAN-CHG-2026-11-11-001).** No ZIP may be delivered unless its row is already in the Version log (section 10) — same change, same ZIP. Rows must be consecutive: no version number may be missing, skipped, reordered or reused, and a row is never deleted. A row has all five parts: version, ZIP file name (`AlishanApp-v<NN>-<Short-Description>.zip`, with the same `<NN>`), date, change ID(s) that exist in this file, and a summary. The latest row must equal the app/User Guide/README version. `node --test tests/*.test.js` (`tests/version-log.test.js`) checks this and must pass before delivery. If a gap is found, restore the missing row from the real history first and record the repair as a Fix; if a past ZIP name is truly unknown, write `*(ZIP filename not preserved)*` rather than leaving the row out.
11. **The User Guide is compulsory (added by ALISHAN-CHG-2026-11-11-003).** Every new feature, and every change a user can see or has to do differently, MUST be written in the in-app User Guide (`frontend/setting.html`) in the same release — before the ZIP is delivered. The guide is for the shop user, not for the developer: simple Hinglish, short steps, a small example, "what you will see", and the common mistakes. No developer wording (ZIP names, change IDs, "implemented", "audit"). Each release must also: (a) add a "Naya kya hai?" entry for the new version (topic 30, heading `vNN — date`), (b) update every topic, example and screenshot the change makes wrong, (c) show the same version in the guide footer (`App version: vNN · User Guide version: vNN · Last verified: <date>`), (d) never describe a feature that the build does not have. `tests/user-guide.test.js` checks (a), (c) and the no-developer-wording rule; (b) and (d) are checked by hand and written in the handover report.

---

## 1. Code structure (short)

```
page (input / draw)  ->  store.js  ->  calc.js   all calculations + all rules
                                   ->  db.js     saving / loading (IndexedDB)
```
Details of each file and "where to change what": `frontend/ARCHITECTURE.md`.

Icons: pages write `<i class="fas fa-NAME">`; `frontend/icons.js` draws a local SVG for each NAME (no CDN). A NAME that is
not in the `ICONS` table shows a small dot and a console warning `icons.js: no icon for "NAME"`. **Whenever a page
starts using a new icon name, add it to `ICONS` in the same change.**

Storage: IndexedDB `AlishanDB` with stores `inventory, payments, qualities, colors, settings, searchAnalytics, users,
editHistory, auditLog`. Reference lists: `qualities.json` (qualities + prices) and `colors.json`.

---

## 2. Pages and what is on them

| Page | File | What it shows / does |
|------|------|----------------------|
| Dashboard | `index.html` + `dashboard.js` | Product Types, Quick Actions, Latest Added Qualities, Product Type Breakdown (top 4 qualities + See more, see -006) |
| Add entry | `add-entry.html` + `item-form.js` + `size-groups.js` | New product entry: Basic Information, Sizes & Colors |
| Inventory | `inventory.html` + `inventory.js` | Complete Inventory, filters, export / import, backups, Bulk Import (`bulk-import.js`) |
| Reports | `reports.html` + `report-engine.js` + `report-views.js` + `reports.css` | **Eight report cards** (Weekly, Payment, Pending, Quality, Valuation, Aging, History, Business Analysis); each opens its own view (`reports.html#<report>`). The old sections (pending cards, amount history, weekly received, valuation tab, aging cards) and the **Add Amount Received** popup live inside the report that needs them. See ALISHAN-CHG-2026-11-06-003. *(SUPERSEDED wording: "Tabs: Pending Amount Receival, Weekly Reports, Amount History, Inventory Valuation, Stock Aging Analysis")* |
| Settings | `setting.html` + `script.js` | Settings dashboard, profiles, business info, display, appearance, users, backup & restore |

**Reports presentation update (v81):** On the Reports home, global filters appear above the eight report cards. Opening a report hides the report-card home and shows only the selected report detail view; `Back to Reports` returns to the card list. This supersedes the v79 presentation note that report cards remain visible after selecting a report. Existing report sections are closed accordion cards by default.

**Responsive presentation update (v85):** At widths above 768px, the shared app navigation becomes a left rail and the existing pages use larger, balanced layouts. Inventory gains a tablet/desktop-only summary overview; the phone Inventory page remains without these cards. Dashboard Quick Actions retain Export Data, Import Data and Bulk Import. No feature is moved between pages.

**Shared pagination update (v81):** Inventory, Reports result lists, and the existing Pending Amount / Amount Received History / Weekly Amount Received lists use the shared `CommonPagination` component. Every pagination control stays on one horizontal line; on narrow phones the row may scroll horizontally rather than wrapping. Each list owns its own page and page-size state.
| Pending Amount | `pending-amount.html` + `audit-pages.js` | One card per quality whose full amount is not received yet (see 2.1) |
| Missing Lot Number | `missing-lot.html` + `audit-pages.js` | Qualities still waiting for a lot number |
| Missing Completion Date | `missing-completion.html` + `audit-pages.js` | Complete qualities that have no completion date; the owner types the real day and saves (added in v77, ALISHAN-CHG-2026-11-06-004). Linked from Home > Quick Actions and from the Weekly Report. |
| Quality History | `quality-history.html` + `audit-pages.js` | Log of important quality changes, newest first; each record has a Delete button (see -005) |

### 2.1 Pending Amount page (`pending-amount.html`)
Shows every quality with `pending > 0` (completed AND incomplete, partial payments included), newest first.
Each quality is one card made of:

| # | Box | Value |
|---|-----|-------|
| 1 | Lot Number + Total Dozen (one full-width box) | lot number or "Not added"; `itemTotals(item).dozens` |
| 1b | **Colors** (full-width box, added by ALISHAN-CHG-2026-11-02-002; look changed by -003) | only the colour names (no label, no coloured tags), bold, same text colour as the Lot Number, no repeats; one colour = centred and biggest, more colours = smaller text; "No colors specified" if none. *(SUPERSEDED look from -002: label "Colors" + coloured tags)* |
| 2 | Added Date | `addedDateTime` (else `dateTime`) |
| 3 | Total Amount | `paymentStatus().expected` |
| 4 | Received | `paymentStatus().received` |
| 5 | Pending Amount | `paymentStatus().pending` |
| 6 | Pending Days | days since the added date |
| 7 | **Received Amount** (button-card) | click = full pending amount is received (see 4.2) |
| – | Edit Quality button | opens `inventory.html#edit=<id>` |

Status chip on the card head: *Complete* (`inStock === false`, out of stock) or *Incomplete* (`inStock !== false`, in stock).
The locked status meaning is *Complete = out of stock* and *Incomplete = in stock*. Pending Amount, Missing Lot Number, Dashboard quality details, Dashboard product-type breakdown, search matching, Quality History and backup-export Status now use that same meaning. Inventory/Home action buttons may still say "Complete" as an action label when the quality is currently in stock; that is the command to mark it complete (out of stock).
Boxes 2–7 sit in a 2-column grid (Lot/Dozen and Colors are full width) (1 column on phones), so with box 7 the grid has 6 boxes and no empty slot.

---

## 3. Calculation flow (all in `calc.js`)

- **Amount of an entry** = `itemAmount(item)` = dozens (sizes in dozens + pieces) x price per dozen (`itemPrice`).
- **Totals** = `itemTotals(item)` (pieces, dozens, amount); half dozens kept: 2.5 dozens = 2 dozens + 6 pieces (`splitPieces`).
- **Payment status** = `paymentStatus(item, payments)`:
  - `expected` = `itemAmount(item)`
  - `received` = sum of the payments of that item (`paymentsFor` / `paymentIndex`), rounded to 2 decimals
  - `pending` = `max(0, expected - received)`
  - `status` = `paid` when `expected > 0` and `pending = 0`; `partial` when something is received; else `pending`
- **A payment** is built and checked by `buildPayment(item, payments, {amount, date, notes})`: date and a number are
  required, amount must be > 0, and amount may **not exceed `pending`**. The entry stored is
  `{id, inventoryId, quality, amount, date, notes, week}`.
- **Aging** (`CONFIG`): >7 days Aging, >15 Warning, >30 Critical; low stock < 10 dozens; "added this week" = 7 days.
- Weeks run Monday to Sunday (`weekInfo`, `weeklyReport`, `weeklyAverage`).
- Dates: `localDate(d)` gives `YYYY-MM-DD` in the user's local time.

---

## 4. Feature flows (click -> what happens -> what is saved)

### 4.1 Add Amount Received (Reports page, existing)
Reports -> *Add Amount Received* on a quality opens the popup (`addAmountForItem`): the amount is pre-filled with the
pending value, the user may change amount, date and notes -> Save calls `AlishanStore.addPayment({inventoryId, amount,
date, notes})` -> `calc.buildPayment` checks -> payment pushed to `payments` and saved (`savePayments`, IndexedDB
`payments`) -> store emits `'payment'` -> pages redraw.

### 4.2 Received Amount card (Pending Amount page, new — ALISHAN-CHG-2026-11-02-001)
Click on the card of a quality ->
1. `AlishanStore.itemPayment(item)` (= `calc.paymentStatus`) gives the latest `pending`.
2. `AlishanStore.addPayment({inventoryId, amount: pending, date: today (localDate), notes: ''})` — the SAME function
   and the SAME checks as 4.1. No amount entry, no popup, no confirmation, no page change.
3. On success the store emits `'payment'`; the page is subscribed (`AlishanStore.subscribe`) and redraws, so the
   quality (now `pending = 0`) disappears from the list. The user stays on the Pending Amount page.
4. On failure an alert shows the store's error and the card stays.
5. While saving the card is disabled, so a double tap cannot save two payments.
Where it shows up afterwards: Reports -> Amount History / Weekly Reports (as a normal payment dated today, no notes).
To undo: delete that payment in Reports -> Amount History (`deletePayment`); the quality returns to Pending Amount.

(Other flows — new entry, edit, Bulk Import, backup/restore, themes, offline — are described in
`frontend/ARCHITECTURE.md`; this file links to it and records every change from now on.)

---

## 5. Decisions

- **D-001** Calculations only in `calc.js`; data only in the db; pages only input/draw. (ARCHITECTURE.md)
- **D-002** *(SUPERSEDED within the same discussion before any code was released)* "After Received Amount on the
  Pending page, open `reports.html`." Replaced by D-003.
- **D-003** The Pending page Received Amount card receives the FULL pending amount at once, shows no extra page / modal
  / amount field, and the quality just leaves the Pending list. Reports' own Add Amount Received popup is unchanged.

---


## User Guide & Documentation Standards (LOCKED — introduced in v89)

The in-app Help & User Guide is a maintained Visual Learning Center, not merely a collection of text paragraphs. Its purpose is to teach the currently implemented Alishan workflows accurately and accessibly.

### Required teaching methods
- Use concise written steps for actions and exact control names.
- Use workflow diagrams for multi-step processes; use decision paths when the user must choose between alternatives.
- Use worked examples for quantity, dozen, amount and payment calculations. Examples must match the actual calculation rules in source code.
- Use report comparison grids, glossary definitions, safe troubleshooting checklists and cross-links/learning paths where they materially help.
- Use annotated screenshots only when captured from the current actual app build. Never fabricate screenshots or present a schematic diagram as a real screenshot. If screenshots are unavailable, use clearly labelled schematic diagrams instead.
- Major topics should explain purpose, where to find the feature, workflow, expected result, examples, common mistakes and safe troubleshooting. Keep minor topics concise.

### Accuracy and scope rules
- Verify all steps, labels, fields, constraints, calculations and outcomes against the current source and implemented app before documenting them.
- Never describe a planned or unavailable feature as implemented. Clearly label conceptual diagrams and future ideas.
- Do not invent button names, field names, capabilities, permissions or background behavior.
- Treat business data safety operations (restore, delete, payment correction, bulk import and undo) as high-impact instructions; explain consequences and verification steps.
- Keep phone readability and responsive behavior in mind. Diagrams and tables must adapt to narrow screens.

### Mandatory release-version synchronization
- The App version and in-app User Guide version must match the latest released app version.
- Every app release must include a User Guide audit before release completion, even if the code change appears unrelated to help content.
- Audit all existing topics for changed labels, moved controls, changed workflows, removed features, calculations, screenshots, diagrams, examples and troubleshooting steps.
- Update stale instructions and visuals in the same release; do not leave a previous version number in the guide footer.
- The guide footer must show the app version, guide version and last verification date. A version mismatch is a release documentation defect.
- Add or update a release checklist/test that asserts the app and guide version labels match.
- The Service Worker cache version must be bumped when cached app-shell assets change, and new guide assets/scripts must be included in the app shell cache list where appropriate.

### Change history policy
- This standard is locked as of v89. Any future change to this policy must be appended as a new dated/versioned decision; do not delete or overwrite this decision history.
- Keep `PROJECT_SOURCE_OF_TRUTH.md` append-only: record what changed, why, previous behavior, new behavior, affected files, tests and known limitations.


## 6. Change history (append only — newest at the bottom)

### ALISHAN-CHG-2026-11-02-001 — Received Amount card on Pending Amount page
- **Type:** New feature (+ this documentation file created)
- **Reason:** The Pending Amount page had 5 boxes in a 2-column grid after the Lot/Dozen box, so the last row held
  only "Pending Days" and one slot was empty. The owner wanted a one-tap way to mark a quality as fully received
  without going to Reports.
- **Before:** The 6th slot was empty; receiving money was only possible from the Reports page popup.
- **After:** A "Received Amount" card fills the slot. One click saves the full pending amount through
  `AlishanStore.addPayment` (same rules as Reports) and the quality leaves the list; the page stays open.
- **Impact:** New payments appear in Reports (history, weekly, totals) like any other payment. Reports' existing
  button and popup are unchanged. No calculation was added or changed. Partial amounts still only from Reports.
- **Files:** `frontend/audit-pages.js` (card, click handler, redraw on store change), `frontend/pending-amount.html`
  (card style), `PROJECT_SOURCE_OF_TRUTH.md` (new), `README.md` (link).
- **Testing:** JavaScript syntax checked. Real click / save test in a browser is still to be done by the owner.

### ALISHAN-CHG-2026-11-02-002 — Colors shown on Pending Amount cards
- **Type:** Changed feature
- **Reason:** On the Pending Amount page the owner could not see which colours a quality has, and had to open the
  quality to find out.
- **Before:** The card showed lot, dozens, dates and amounts only.
- **After:** A full-width "Colors" box (under Lot Number + Total Dozen) lists every colour of that quality as
  coloured tags, same look as the item card; repeated names are shown once.
- **Impact:** Display only: no calculation, saving or payment logic changed. The 2-column grid still has 6 boxes
  (Added Date ... Received Amount), so no empty slot appears.
- **Files:** `frontend/audit-pages.js`, `frontend/pending-amount.html`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked; browser view to be checked by the owner.

### ALISHAN-CHG-2026-11-02-003 — Colors box: only bold names, size follows the count
- **Type:** Changed feature (look of the box added in ALISHAN-CHG-2026-11-02-002)
- **Reason:** The word "Colors" and the coloured tags were not wanted; the owner wanted only the colour names, bold
  and bigger, and easy to read at a glance.
- **Before:** Box with the label "Colors" and each colour as a small coloured tag.
- **After:** No label. Only the colour names in bold, in the same text colour as the Lot Number. One colour: centred
  and in large letters. The more colours, the smaller the letters (1 / 2 / 3-4 / 5+ colours = four sizes, each a
  little smaller on phones). Many colours wrap onto the next line.
- **Impact:** Display only; no calculation, saving or payment logic changed. The grid layout is unchanged.
- **Files:** `frontend/audit-pages.js`, `frontend/pending-amount.html`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked; browser view to be checked by the owner.

### ALISHAN-CHG-2026-11-02-004 — Missing icons added to icons.js
- **Type:** Fix
- **Reason:** The console showed `icons.js: no icon for "..."` on many pages (Settings, Dashboard, Missing Lot,
  Quality History, Pending Amount, advanced search). Those icons appeared as a small dot instead of the real icon.
- **Before:** 20 icon names used by pages were missing from the `ICONS` table: arrow-right, arrow-down-wide-short,
  sort-amount-down, book-open, bookmark, circle-check, circle-plus, clock-rotate-left, cloud-arrow-up, ellipsis-v,
  hourglass-half, house, lightbulb, magnifying-glass, pen, pen-to-square, sliders, sliders-h, tags, wallet.
- **After:** All 20 are in `ICONS` (same Lucide line style as the others). A scan of every `fa-*` name used in all
  pages and scripts finds no missing icon.
- **Impact:** Display only (icons now show and the warnings stop). No data, calculation or payment logic changed.
- **Files:** `frontend/icons.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** `icons.js` syntax and load checked, and a scan of all used icon names done; visual check in the browser
  is still to be done by the owner. (The separate `pay is not defined` error is NOT part of this change: not yet found.)

### ALISHAN-CHG-2026-11-02-005 — Complete button on Home > In Stock Items, Quality History redesign, Complete/Incomplete wording fix
- **Type:** New feature + Changed feature + Fix
- **Meaning of Complete (owner's rule):** pressing **Complete** on a quality makes it *out of stock* (`inStock = false`):
  it leaves In Stock Items and leaves Aging. The Inventory card button then shows "Pending"; pressing it puts the
  quality back in stock. Both are the single function `AlishanStore.toggleStock(id)`.
- **(a) Home > In Stock Items — Complete button.** *Reason:* to finish a quality without opening Inventory.
  *Before:* the list only showed rows; opening a row showed details. *After:* every row has a "Complete" button
  (right side; below the row on phones). It calls `toggleStock` (same as the Inventory button), the row disappears,
  the count in the dialog heading drops, and the action is written to Quality History. No confirmation and no page
  change; the list does not jump back to the top. *Impact:* In Stock count, Aging and Dashboard numbers update by the
  normal store refresh. *Files:* `dashboard.js` (`completeFromInStockList`, row markup, click handler), `dashboard.css`.
- **(b) Quality History cards.** *Reason:* a newly added quality showed every detail and filled the screen; Previous /
  New values were stacked; records could not be removed. *Before:* all records fully open, values stacked on phones,
  no delete. *After:* **New Quality Added** is a short card only (event, time, quality name / ID / product type, no
  details); other records keep the changed fields with **Previous value on the left and New value on the right**
  (also on phones); every record has a **Delete** button (asks first; removes only that history record, never the
  quality or payments); the list is sorted newest first. *Impact:* history only. *Files:* `audit-pages.js`,
  `quality-history.html`, `store.js` (`deleteQualityHistory`).
- **(c) Fix: Complete / Incomplete shown the wrong way round in Quality History.** *Problem:* pressing Complete made the
  quality out of stock, but history logged "Quality Marked Incomplete" and the Status changed "Complete -> Incomplete".
  *Cause:* `toggleStock` and `qualitySnapshot` treated *in stock* as Complete. *After:* out of stock = **Complete**,
  back in stock = **Incomplete** (action names `Quality Completed` / `Quality Marked Incomplete`, Status values).
  New records carry `statusModel: 2`. **Old records are not edited**: when shown, records without `statusModel` get
  their Status values and the two action names swapped on screen only. *Files:* `store.js` (`toggleStock`,
  `qualitySnapshot`, `writeQualityHistory`), `audit-pages.js`. Also removed a stray duplicate line in the failure
  branch of `toggleStock` (it only puts `inStock` back; behaviour unchanged).
- **Testing:** JavaScript syntax checked; history page simulated (order, short new card, old-record correction,
  delete). Real browser click tests on Home and Inventory are still to be done by the owner.


### ALISHAN-CHG-2026-11-04-001 — Correct Complete / Incomplete status display across pages
- **Type:** Bug fix (status wording consistency)
- **Reason:** The locked rule from ALISHAN-CHG-2026-11-02-005 is Complete = out of stock (`inStock === false`) and Incomplete = in stock. Pending Amount, Missing Lot Number and parts of the Dashboard still displayed the reverse meaning.
- **Before:** Audit-page chips and Dashboard breakdown/detail rows treated in-stock records as Complete; product-type summary counts also put in-stock entries in the Complete count. Search text used the same reversed terms.
- **After:** All status displays and search terms follow the locked mapping. Action buttons labelled Complete remain action labels and were not changed.
- **Impact:** Display, search matching and dashboard summary counts only; stored `inStock` values and stock-toggle behaviour are unchanged.
- **Files:** `frontend/audit-pages.js`, `frontend/dashboard.js`, `frontend/calc.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked; browser visual verification remains pending.

### ALISHAN-CHG-2026-11-04-002 — Remove invalid Received Amount control from Missing Lot Number
- **Type:** Bug fix
- **Reason:** The Missing Lot Number page had a copied Received Amount button whose `aria-label` referenced an undefined `pay` variable. The page is for adding lot numbers, not recording payments.
- **Before:** Rendering the button template could throw a ReferenceError; the button had no working payment handler.
- **After:** Removed the stray Received Amount button from Missing Lot Number. The valid Received Amount card remains only on Pending Amount.
- **Impact:** Missing Lot Number page renders without the undefined-variable error; no payment or lot-number data is changed.
- **Files:** `frontend/audit-pages.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked; browser page-load test remains pending.

### ALISHAN-CHG-2026-11-04-003 — Make localStorage migration retry-safe
- **Type:** Bug fix (data migration safety)
- **Reason:** The migration-complete flag was set even when one or more inventory, payment or settings migration steps failed.
- **Before:** A failed migration could be permanently marked complete, preventing automatic retry on the next load.
- **After:** The completion flag is written only if every migration step succeeds. Failed steps leave the flag unset; already-successful writes are idempotent and can safely be encountered again.
- **Impact:** Failed migrations can retry on the next app load; existing IndexedDB records are not cleared by this fix.
- **Files:** `frontend/db.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked; browser migration simulation remains pending.

### ALISHAN-CHG-2026-11-04-004 — Atomic payment append and safer payment IDs
- **Type:** Bug fix (multi-tab payment integrity)
- **Reason:** Payment changes previously rewrote the entire payments store from one tab's in-memory array, risking overwriting another tab's newer payments. `Date.now()` alone was also used as the payment ID.
- **Before:** A stale tab could replace newer payment rows; two simultaneous tabs could both validate against the same stale pending balance.
- **After:** New payments are appended in a single IndexedDB readwrite transaction. The transaction checks the latest persisted received total against the current pending balance before writing, so concurrent tabs cannot both receive the same remaining amount. Payment IDs use `crypto.randomUUID()` where available, with a random fallback. Deletion removes only the selected payment record instead of rewriting the whole store.
- **Impact:** Payment records are less vulnerable to stale-tab overwrites and duplicate IDs; existing Reports UI and payment-entry rules remain unchanged.
- **Files:** `frontend/db.js`, `frontend/store.js`, `frontend/calc.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked. IndexedDB concurrency and browser payment flows still require runtime tests.

### ALISHAN-CHG-2026-11-04-005 — v70 brought in line with this file (details of -001 to -004 and what else they needed)
- **Type:** Bug fix (the code of v70 did not yet contain the fixes written in -001 to -004; this record lists exactly what was done so file and code match again)
- **Reason:** v70 still had: the stray Received Amount button on Missing Lot Number (`pay is not defined`), the reversed
  Complete/Incomplete wording on several pages, a migration flag that was set even after a failed step, and payments
  saved by rewriting the whole payments store.
- **Before / After (by change):**
  - **-002 Missing Lot Number:** the copied Received Amount button is removed; the Pending Amount card is untouched.
  - **-001 status wording** (Complete = out of stock, Incomplete = in stock): chips on Pending Amount and Missing Lot,
    Dashboard product-type counts (`complete` / `incomplete`), Dashboard breakdown rows and detail text, search text in
    `calc.js`, and **also** the Status filter in `advanced-search.js` (it filtered the opposite way; not listed in -001)
    now follow it. The guide text in `setting.html` (topic 4) got one sentence saying the same. The backup-export column
    `Status` (`In Stock` / `Out of Stock`) is stock wording and was already correct.
  - **-003 migration:** `allOk` in `db.js`; the flag `alishan_db_migrated` is written only if every step worked.
  - **-004 payments:** `AlishanDB.appendPayment(entry, expected)` adds one payment in ONE readwrite transaction and
    re-checks the saved received total first; `AlishanDB.removePayment(id)` removes one record; `store.addPayment` and
    `store.deletePayment` use them (the old whole-store `savePayments` in `store.js` is gone); payment ids are
    `pay-<uuid>` (`newPaymentId()` in `calc.js`). If a second tab already received the amount, the save is refused with
    the message "Amount exceeds the pending value! ... Another tab may have saved a payment for this quality."
  - **Needed because ids are now text:** `reports.html` writes the id in quotes, `deleteAmountEntry('<id>')`.
    Old numeric ids still work (all comparisons use `String(id)`).
- **Impact:** old payments, old history and stored `inStock` values are unchanged. New payment ids look like
  `pay-xxxxxxxx-...`. The Reports popup and its rules are unchanged.
- **Files:** `frontend/audit-pages.js`, `frontend/dashboard.js`, `frontend/calc.js`, `frontend/advanced-search.js`,
  `frontend/setting.html`, `frontend/db.js`, `frontend/store.js`, `frontend/reports.html`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax of every script checked. Simulated: Pending Amount page (card + click) and Missing Lot
  page load without errors; two tabs saving the same full amount at the same time with a mock IndexedDB (first saved,
  second refused, nothing extra written); `buildPayment` ids differ and an over-receive is blocked. Real browser tests
  (Reports add/delete payment, Home/Inventory Complete, migration on a fresh browser) are still to be done by the owner.

### ALISHAN-CHG-2026-11-04-006 — Change a colour in Edit (sizes kept) + Product Type Breakdown "See more" and per-quality list
- **Type:** New feature (two parts). Formatting / Prettier is NOT part of this change (not done yet).
- **(a) Change a colour in the Edit form.** *Reason:* in Edit the only way to change a colour was to remove it and add
  another, which threw away the sizes typed for it ("different sizes" mode). Bulk Import already had a "replace colour,
  keep sizes" feature. *Before:* remove + add = sizes lost. *After:* every picked colour in Edit has a swap button
  (`fa-exchange-alt`) and every size card has a **Change** button next to Remove. Both open the row "Replace X with:
  [Choose a colour]" under the colour picker (Suggestions from `AlishanStore.closeColors`, then All colours from
  `AlishanStore.getColors`, the same lists Bulk Import uses). Picking a colour changes the name in the same place of
  the list and renames the size card in place, so **all sizes stay** (in "same sizes" mode the one size grid is not
  touched). A colour that is already picked is not offered (it would merge two colours); a colour not in the app list is
  refused. It changes only the entry being edited and is saved with the normal Save, so Quality History shows the
  Colours change as "Quality Updated". *Code:* `ItemForm.swapColor / openColorSwap / closeColorSwap / onColorRename`
  (`item-form.js`), `renameEditCard` + `changeColorSizeItem` (`item-modal.js`), styles in `item-form.css`. Bulk Import
  itself was not changed (it uses its own draft data but the same colour lists).
- **(b) Product Type Breakdown (Home).** *Reason:* only the top 4 qualities were visible and clicking one opened the
  whole product type. *Before:* top 4 rows, click = all qualities of that product type. *After:* a **See more (N more)**
  button under the top 4 opens "All Qualities" (same ranking, all rows); clicking a quality (in the top 4 or in See
  more) opens only the entries of that quality name inside its product type (case and spaces ignored), newest first,
  with Total Entries / Total Dozen / Total Amount; from See more a "Back to all qualities" button returns to the list;
  opening an entry and pressing Back returns to that quality's list. **All Product Types** (title arrow) and the product
  type cards inside it are unchanged. The same quality name under different product types stays separate; the time
  period filter still applies. *Code:* `getQualityRanking`, `qualityRankRowHTML`, `showAllQualityNames`,
  `showQualityEntries`, `breakdownEntryRowHTML` (the entry row markup moved out of `showProductTypeDetails`, output
  identical) in `dashboard.js`; styles in `dashboard.css`.
- **Impact:** display and editing only; no calculation, payment or stock logic changed. Saved data format is unchanged.
- **Files:** `frontend/item-form.js`, `frontend/item-modal.js`, `frontend/item-form.css`, `frontend/dashboard.js`,
  `frontend/dashboard.css`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked. `swapColor` tested with stub data (keeps position, calls the rename hook,
  refuses a picked / unknown / unselected / same colour). Breakdown ranking and per-quality list tested with stub data
  (only that quality's entries, See more list, back wiring). Real browser checks are still to be done by the owner:
  Edit a quality with different sizes, change a colour and confirm the sizes stay after Save; Home > Product Type
  Breakdown > See more / click a quality.

### ALISHAN-CHG-2026-11-04-007 — Quality History records only what really changed
- **Type:** Changed feature (how a "Quality Updated" record is built; supersedes the "one row per changed field" rule
  of ALISHAN-CHG-2026-11-02-005 (b) for the Colours and Size Quantities fields)
- **Reason:** Changing only the colour name D_GRAY -> D-GRAY produced a Colours row with the whole colour list and a
  Size Quantities row with every size of every colour on both sides (the sizes looked "changed" only because the colour
  name inside them changed). The owner wants only the changed word or number.
- **Before:** Colours and Size Quantities were two long texts; if the text differed at all, both full texts were saved.
- **After:** `store.js` (`qualityDetail`, `diffSnapshots`) compares the colour list and each size cell on its own:
  - a changed normal field (Quality, Lot Number, Notes ...) = one row, old value and new value;
  - **Colours:** one row per changed colour (`D_GRAY -> D-GRAY`; an added colour is `— -> PISTA`, a removed one
    `WHITE -> —`);
  - **Size Quantities:** one row per changed size cell, named with its colour and size
    (`Size Quantities · D-GRAY 32: 15 dozen 0 pcs -> 16 dozen 0 pcs`; `All colours` in same-sizes mode; `—` = none);
  - a colour that was only renamed shows just its one Colours row, its unchanged sizes are not listed again;
  - if nothing changed there is no row (and no record, as before).
- **Impact:** only new "Quality Updated" records are shorter. Old records already saved stay exactly as they were
  (history is append-only); use the Delete button on a record you do not want. New Quality Added, Quality Deleted and
  Complete/Incomplete records are unchanged. No calculation, stock or payment logic changed.
- **Files:** `frontend/store.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Testing:** JavaScript syntax checked; the diff was run on stub data for: only a colour renamed, one number changed,
  rename + one number, colour added, colour removed, only the lot number changed, nothing changed, one number in
  same-sizes mode. Real browser check still to be done by the owner (edit a quality, change one number or colour,
  open Quality History).


---

## 7. Current implementation tracker — v73 handover

**This tracker is the current status snapshot.** Statuses describe the source files in the delivered project archive, not promises or plans. `IMPLEMENTED — NOT VERIFIED` means code is present but the required real-browser/user acceptance checks have not yet been completed.

### 7.1 Mandatory all-AI documentation protocol

Every AI, coding agent, developer, reviewer, and contributor must follow `AI_HANDOVER_PROTOCOL.md` together with this file.

- Read both documents and inspect the actual source before coding.
- Work only within the user-approved scope.
- Preserve old decisions and append change history; never silently delete or overwrite it.
- Keep unimplemented work `PENDING`.
- Use `IMPLEMENTED — NOT VERIFIED` when source changes exist but required checks are incomplete.
- Mark work `COMPLETED` only after updated source files are delivered and required verification passes.
- Report actual tests, untested cases, limitations, and remaining work.
- Documentation must reflect the verified state of the delivered source, never an AI's verbal claim.

### 7.2 Export Center and Settings work status

| Pending ID | Work | Current status | Reason |
|---|---|---|---|
| `ALISHAN-PEND-2026-11-04-001` | Home Advanced Export Center | `IMPLEMENTED — NOT VERIFIED` | Home entry point, category selection, filters and output flows are present in source. Real browser exports still need testing. |
| `ALISHAN-PEND-2026-11-04-002` | Settings cleanup and organization | `IMPLEMENTED — NOT VERIFIED` | Settings navigation is reorganized into the five approved sections and demo-only sections/controls are removed from the visible UI. Real browser/persistence checks remain. |
| `ALISHAN-PEND-2026-11-04-003` | ZIP restore and backup safety | `IMPLEMENTED — NOT VERIFIED` | The Export Center creates a complete ZIP backup with manifest/checksum and validates it before calling the existing safety-backup restore flow. Real browser round-trip testing remains. |
| `ALISHAN-PEND-2026-11-04-004` | Advanced backup capabilities | `PENDING` | Incremental backups, backup comparison, retention controls beyond the existing bounded history, and scheduled export delivery are not implemented by this change. |
| `ALISHAN-PEND-2026-11-04-005` | Regression and runtime verification | `PENDING` | Static checks have been run, but full browser, mobile, export round-trip and regression checks remain. |
| `ALISHAN-PEND-2026-11-05-001` | Data-driven Export Center filters | `IMPLEMENTED — NOT VERIFIED` | Filter values now load from saved records as selectable multi-select lists with dependent Quality Type → Quality → Colour options, date presets, live match count, and Clear All. Real browser interaction and export-result verification remain.

### 7.3 Export Center — current implementation details

- Home > Quick Actions > Export Data opens the Advanced Export Center in the Home page.
- Categories: Quality / Inventory; Payments & Received Amount; Quality History; Activity Log; Settings; Quality / Colour Master Data; Backup History.
- Filters: date range, quality name, Quality ID, Lot Number, Quality Type, Colour, Cup, Maal Gaya, Notes, quality status, payment status, and a general search field.
- Formats:
  - JSON: selected categories and filtered rows.
  - Excel: multiple workbook sheets; the Excel library is loaded only when requested.
  - CSV: first available selected sheet; this limitation is shown in the UI.
  - PDF: printable summary opened in a print window; it is a summary/preview, not a complete row-by-row PDF archive.
  - ZIP: complete backup containing `manifest.json` and `data.json`; the manifest includes record counts and a CRC-32 checksum for the data payload.
- ZIP restore accepts the stored/uncompressed ZIP format generated by this Export Center. It checks required files, manifest, data size, checksum, and backup structure before asking for confirmation. Before applying the restore it stores a full safety snapshot (quality/payment data, quality history, activity log, and settings) in `fullRestoreSafetyBackups`; it then uses the existing store restore path and restores the ZIP's quality history, activity log, and settings.
- Export reads from the existing IndexedDB / Store source of truth. It does not intentionally modify quality or payment records.
- The service worker cache version was bumped and the new export/settings assets were added to the offline asset list.
- The export filter date range is applied where exported rows contain a recognizable date. General and field-specific text filters are applied to the matching exported row fields.
- `Maal Gaya` and Weight/Metre are added to the Quality Inventory export rows from the saved quality record.

### 7.4 Settings — current visible structure

Settings navigation is now:
1. Overview
2. Business Preferences
3. Appearance
4. Data & Backup
5. Help & User Guide

The old visible Users, Notifications, Import/Export, Security, and Audit sections were removed from the Settings navigation/UI for this scope because their controls were demo, duplicate, unsupported, or outside the approved five-section layout. Their previous code/history is not represented as deleted business data. Existing business preference, theme, and user-guide functionality is retained where supported.

Data & Backup now exposes:
- Automatic backup enable/disable and interval in hours, using the same IndexedDB settings consumed by the existing Store backup scheduler.
- Manual local backup of quality and payment records.
- Restore of the latest local backup, with a safety copy of current records before replacement.
- Browser storage usage where supported.
- Portable complete ZIP backup and ZIP restore through Home > Export Data.

### 7.5 Remaining verification checklist

Before changing the above `IMPLEMENTED — NOT VERIFIED` statuses to `COMPLETED`, verify in a real browser:

- Open Home Export Center and close it by close button, Cancel, backdrop, and Escape.
- Export JSON and confirm selected categories/filters are correct.
- Export Excel with multiple sheets and inspect the workbook.
- Export CSV and confirm the first-sheet limitation is clear.
- Open the PDF summary and use Print / Save as PDF.
- Create a ZIP, inspect `manifest.json` and `data.json`, and verify CRC-32.
- Restore a ZIP into a test dataset; verify the pre-restore safety backup exists and records/payments are correct.
- Try a modified/corrupt ZIP and confirm restore is refused without changing current data.
- Check Settings navigation, business preference save, theme save, backup interval save, manual backup and local restore.
- Test desktop and mobile layouts.
- Recheck Home, Inventory, Add Entry, Reports, Payments, Pending Amount, Missing Lot Number, Quality History, and existing automatic backup behavior.
- Confirm export does not mutate quality/payment records.

---

## 8. Change history — new entry (append-only)

### ALISHAN-CHG-2026-11-04-008 — Home Advanced Export Center, Settings cleanup, and backup safety

- **Type:** New feature + Settings organization.
- **Status:** `IMPLEMENTED — NOT VERIFIED` for the implemented Export Center, Settings layout, and ZIP restore workflow. Advanced backup capabilities and full regression verification remain `PENDING`.
- **Reason:** The user requested that the previously documented Export Center and Settings work be implemented in the actual source, not merely described in documentation. The previous Home Export Data action navigated to `inventory.html#export`; Settings exposed multiple demo/duplicate/non-functional sections and controls.
- **Before:**
  - Home Export Data navigated away to `inventory.html#export`.
  - Settings sidebar showed Dashboard, User Guide, General, Appearance, Users, Backup & Restore, Notifications, Import/Export, Security, and Audit Log.
  - Settings overview included simulated AI suggestions, Undo/Redo, hard-coded system health/activity, and Settings Profiles.
  - The old export function exported only a limited JSON-shaped data object; non-JSON formats fell back to JSON.
  - Backup timeline contained hard-coded sample dates.
- **After:**
  - Home Export Data opens an in-page Advanced Export Center.
  - Export Center includes data categories, field-specific filters, date range and general search.
  - JSON, multi-sheet Excel, first-sheet CSV, printable PDF summary, and complete ZIP backup paths are present.
  - ZIP includes manifest and data payload, record counts, and CRC-32. ZIP restore validates the generated archive before confirmation, creates a full safety snapshot, restores quality/payment records, quality history, activity log, and settings.
  - Settings visible navigation is Overview, Business Preferences, Appearance, Data & Backup, and Help & User Guide.
  - Demo overview content and unused/demo sections and modals are removed from the visible Settings UI.
  - Data & Backup exposes actual IndexedDB-backed automatic backup preferences, local manual backup/restore, and storage usage.
- **Impact:** Export is read-only for quality/payment records. Restore is intentionally destructive after explicit confirmation and takes a safety backup first. Existing quality/payment calculations and business record format are not intentionally changed.
- **Files changed:**
  - `frontend/index.html`
  - `frontend/export-center.js` (new)
  - `frontend/export-center.css` (new)
  - `frontend/setting.html`
  - `frontend/script.js`
  - `frontend/settings-data-backup.js` (new)
  - `frontend/sw.js` (cache version bumped; new assets precached; unused Cropper dependency removed)
  - `frontend/ARCHITECTURE.md`
  - `README.md`
  - `PROJECT_SOURCE_OF_TRUTH.md`
  - `AI_HANDOVER_PROTOCOL.md` (included as the mandatory project protocol companion; protocol rules themselves were not changed)
- **Tests actually run:** Node.js syntax checks for all frontend JavaScript files; HTML parsing and duplicate-ID checks for Home and Settings. These static checks passed.
- **Not yet tested:** Real browser interactions, Excel library load in deployment, PDF print/save, ZIP create/restore round-trip, corrupt ZIP refusal, backup safety copy, actual mobile rendering, and full regression testing.
- **Known limitations:** CSV exports the first available selected sheet. PDF is a printable summary/preview, not a full data dump. ZIP reader intentionally supports the uncompressed ZIP format generated by this Export Center; other compressed ZIP formats are rejected with an explanation. Advanced incremental backup, backup comparison, and additional retention/scheduling features remain pending.
- **Related pending items:** `ALISHAN-PEND-2026-11-04-001` through `ALISHAN-PEND-2026-11-04-005`.



### 9. Export Center usability enhancement — data-driven selection filters

- The Export Center no longer asks users to type Quality, Quality ID, Lot Number, Quality Type, Colour, Cup, Maal Gaya, or Notes filter values manually.
- These choices are populated from the existing saved quality records after `AlishanStore` initializes. The filter controls support multiple selections.
- Dependent lists narrow as follows: selected Quality Type narrows Quality and Cup choices; selected Quality narrows Colour choices.
- Added date presets: All dates, Today, Last 7 days, Last 30 days, This month, This year, and Custom range.
- Added a Clear all filters action and a live count of matching quality records.
- The selected filters continue to apply to exported inventory and payment rows through the existing export flow. No quality/payment record mutation was introduced.
- **Status:** `IMPLEMENTED — NOT VERIFIED`. Static checks can verify source integrity, but actual browser selection behavior and resulting exports still require runtime verification.

### ALISHAN-CHG-2026-11-05-001 — Data-driven Advanced Export filters

- **Type:** Export Center usability enhancement.
- **Status:** `IMPLEMENTED — NOT VERIFIED`.
- **User problem:** Existing filter inputs required manual text entry even though the app already stores the available qualities, IDs, lots, types, colours, cups, Maal Gaya values, and notes.
- **Before:** Text search inputs for most filters; users had to know and type the exact values.
- **After:** Existing values appear in selectable multi-select lists. Quality Type narrows Quality and Cup options; Quality narrows Colour options. Date presets, Clear all filters, and a live matching-record count are added.
- **Files changed:** `frontend/index.html`, `frontend/export-center.js`, `frontend/export-center.css`, `frontend/sw.js`, `frontend/ARCHITECTURE.md`, `PROJECT_SOURCE_OF_TRUTH.md`, `AI_HANDOVER_PROTOCOL.md`.
- **Scope protection:** No business calculation, record schema, payment logic, or quality editing flow was intentionally changed. Export remains read-only.
- **Tests run:** JavaScript syntax check for `export-center.js`; further static checks and archive integrity check.
- **Not yet tested:** Real browser dropdown selection, dependent list behavior, mobile rendering, and exported file contents after combined filters.


### ALISHAN-CHG-2026-11-06-001 — Export Center redesigned (matches the app) and made more advanced; ZIP version rule added

- **Type:** Changed feature + new capabilities + documentation rule.
- **Status:** `IMPLEMENTED — NOT VERIFIED` (static checks and a simulated-browser test were run; a real browser test is still to be done by the owner). Related pending item: `ALISHAN-PEND-2026-11-06-001`.
- **User requirement:** Redesign the Export Center properly, fix it, make the layout, input boxes and everything else look like the rest of the app, make it more advanced, and add the rule that every update changes the ZIP version.
- **Old problems found (v73):**
  - The Export Center used colour variables that do not exist in this app (`--border-color`, `--bg-main`, hard-coded fallbacks), so inputs and borders looked different from the app and wrong in dark themes. It did not use the app's `.btn` and `.form-group` look.
  - Filters used plain browser multi-select boxes (hard to use on a phone) and matched by *contains* (choosing lot `5` also exported lot `55`).
  - Quality filters were not applied to Quality History (different field names); rows without a date passed every date filter.
  - CSV exported only the first sheet; the PDF was a JSON-text summary of 12 rows; Master Data and Settings were exported as one JSON text cell.
  - There was no preview, no totals, no column choice, no saved presets and no export history.
- **New behaviour:**
  - Same look as the app: dialog like the Home breakdown dialog, the app's `.btn` / `.btn-secondary`, `.form-group` inputs, chips and tags like the colour picker, all colours from the app's theme variables (works in every theme).
  - Four steps in the **Export** tab: 1 Select data (13 data sets in groups: Stock, Payments, Records, Reference & system), 2 Filters, 3 Preview, 4 File format. Two more tabs: **Presets & History** and **Restore Backup**.
  - Data sets: Quality Inventory, **Size-wise Detail (new)**, **Inventory Valuation (new)**, **Stock Aging (new)**, Received Payments, Pending Amount, Weekly Payments, Quality History, Activity Log, **Quality Master and Colour Master as proper rows**, Settings (as Setting / Value rows, logo and backup copies left out), Backup History.
  - Filters: searchable multi-select lists with tags and counts (Quality Type, Quality Name, Quality ID, Lot Number, Colour, Cup, Maal Gaya, Notes) that narrow each other; date presets + from/to; Stock status and Payment status chips; a search box; removable chips for every active filter; Clear all; live count of matching quality entries. Matching is **exact** (lot 5 no longer matches lot 55). Each data set says which filters apply to it.
  - Preview: first 8 rows of every selected data set, column totals (dozens, pieces, amounts), and a column chooser (hide columns; they are left out of the file).
  - Formats: **Excel** (one sheet per data set + Summary sheet, filter buttons on the header row), **CSV** (one file per data set; several files are packed in a ZIP; UTF-8 with BOM so Excel shows text correctly), **PDF report** (print-ready A4 landscape, every row, repeating headers, totals row, filters and date at the top — use *Save as PDF*), **JSON** (data sets + filters + optional summary), **Complete backup ZIP** (unchanged format, still restorable).
  - **Presets**: four ready-made ones and your own (saved with name, data, filters, columns, format; max 20). **Recent exports**: the last 15 downloads. Both are kept in the app's settings store (`exportPresets`, `exportHistory`).
- **Rules placed in `calc.js` (so the page does not calculate):** `exportParseDate`, `exportInRange`, `exportFilterItems`, `exportSizeRows`, `exportTotals`. `store.js` passes them on (`exportFilterItems`, `exportSizeRows`, `exportTotals`, `exportInRange`, `exportParseDate`) and now owns the old-history correction `normalizeQualityHistory`, which Quality History (`audit-pages.js`) and the Export Center both use (the saved record is still never changed).
- **Not changed (deliberately):** every existing calculation and `exportRows` function, payment rules, quality records and their format, the ZIP backup / restore code (`completeBackup`, `restoreZip`, ZIP reader/writer are the v73 code, moved unchanged), Settings page rules in `export-center.css` (kept at the bottom unchanged).
- **Files changed:** `frontend/index.html` (Export Center markup), `frontend/export-center.js` (rewritten), `frontend/export-center.css` (rewritten; Settings rules kept), `frontend/calc.js`, `frontend/store.js`, `frontend/audit-pages.js` (uses the shared history correction), `frontend/icons.js` (file-pdf, file-code, file-zipper), `frontend/sw.js` (cache v7), `frontend/ARCHITECTURE.md`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`, `AI_HANDOVER_PROTOCOL.md`.
- **Data / calculation impact:** none on saved data. Export stays read-only. Only presets and the export list are saved (two new settings keys).
- **Tests actually run:** JavaScript syntax check of every script; duplicate-ID check of `index.html`; `calc.js` export functions run on sample entries (exact lot match, colour / status / payment / date / search filters, size rows, totals, date helper); history page simulation; Export Center simulated with a fake page and the real `calc.js`: tiles, selection, live count, status filter, Excel (Summary + 13 sheets), CSV (single file with a hidden column, and ZIP of 13 CSV files), JSON (with summary), PDF report HTML, history saved.
- **Not tested yet:** real browser (layout on phone and desktop, dark themes, dropdown behaviour, real Excel and PDF files, pop-up blocker), ZIP backup/restore round trip after this change, performance with several thousand entries.
- **Known limitations:** PDF is made with the browser's print dialog (no PDF library); Weekly Payments ignores the date range; the ZIP reader accepts only ZIPs made by this Export Center.

---

## 10. Version log (ZIP versions) — append-only

Rule: see section 0, rule 8. Newest at the bottom.

| Version | ZIP file name | Date | Change IDs | Summary |
|---|---|---|---|---|
| v73 | `AlishanApp-v73-Export-Center-Selection-Upgrade.zip` | 2026-11-05 | `ALISHAN-CHG-2026-11-05-001` and earlier | Starting point of this work: Export Center with data-driven filters, Settings cleanup, backup safety. |
| v74 | `AlishanApp-v74-Export-Center-Redesign.zip` | 2026-11-06 | `ALISHAN-CHG-2026-11-06-001` | Export Center redesigned to match the app and made more advanced; ZIP version rule added. |
| v75 | `AlishanApp-v75-Completion-Date.zip` | 2026-11-06 | `ALISHAN-CHG-2026-11-06-002` | Complete now saves the date the goods went ("Maal Gaya"); shown on Pending Amount and in the quality details; editable; the owner's way of using the app is written down (section 11). |
| v76 | `AlishanApp-v76-Report-Page-Redesign.zip` | 2026-11-06 | `ALISHAN-CHG-2026-11-06-003` | Report Page redesigned: eight report cards, each with filters, summary, charts and table; Weekly Report and Business Analysis by Quality Completion Date. No calculation file changed. |
| v77 | `AlishanApp-v77-Limits-Fixed.zip` | 2026-11-06 | `ALISHAN-CHG-2026-11-06-004` | Known limits of v74–v76 fixed: Export Center completion-date and amount filters + Completed Work data set (Weekly Report / Business Analysis now export), Missing Completion Date page, Activity Log keeps 1000, Payment Report's old sections follow its date range, Bulk Import and Edit share one colour-choice function. |
| v78 | `AlishanApp-v78-Mobile-Fixes.zip` | 2026-11-08 | `ALISHAN-CHG-2026-11-08-001` | Export Center and Report Page made to work on a phone (found by looking at them in a real browser at phone width); phone rule added. |
| v79 | `AlishanApp-v79-Report-Cards-Pagination-Limits.zip` | 2026-11-08 | `ALISHAN-CHG-2026-11-08-002` | Report Page result cards and read-only detail popup redesigned; report selection stays visible; Inventory and Reports now share Common Pagination; Activity Log readers use the full 1000-record retained limit. |
| v80 | `AlishanApp-v80-Reports-Runtime-Pagination-Fix.zip` | 2026-11-08 | `ALISHAN-CHG-2026-11-08-003` | Fixed Reports overview runtime error caused by removed Aging Stock DOM nodes; restored a consistent two-column six-card overview on phones; made Reports Common Pagination render with Inventory's exact shared component styling. |
| v81 | `AlishanApp-v81-Reports-Settings-Usability.zip` | 2026-11-08 | `ALISHAN-CHG-2026-11-08-004` | Enforced one-line shared pagination; moved Reports home filters above report cards; made each selected report a focused view; separated and collapsed existing report sections; added pagination to long pending/payment-history/weekly lists; expanded the latest User Guide and improved Data & Backup status, backup/restore safeguards and storage refresh. |
| v82 | `AlishanApp-v82-Reports-Compact-Pagination-Focus.zip` | 2026-11-08 | `ALISHAN-CHG-2026-11-08-005` | Made Previous/Next pagination buttons compact so all controls fit on one line without clipping or horizontal scrolling; in a selected Report view, hide dashboard preview cards and report chooser while keeping Search and global filters visible above the selected report. |
| v83 | `AlishanApp-v83-Reports-Pagination-Test-Audit.zip` | 2026-11-09 | `ALISHAN-CHG-2026-11-09-001` | Added a transparent verification log: shared pagination callbacks and synthetic ReportEngine filter checks passed; responsive browser and real stored-record acceptance tests remain pending. No application code changed. |
| v84 | `AlishanApp-v84-Responsive-Pagination-Fix.zip` | 2026-11-09 | `ALISHAN-CHG-2026-11-09-002` | Fixed shared pagination accessibility and narrow-phone fit, added repeatable Node regression tests, and bumped the service-worker cache to v14. Real-device/browser and owner IndexedDB acceptance remain pending. |
| v85 | `AlishanApp-v85-Tablet-Desktop-Responsive-Enhancement.zip` | 2026-11-09 | `ALISHAN-CHG-2026-11-09-003` | Added tablet/desktop-only responsive layouts with a left navigation rail, balanced spacing and a tablet/desktop Inventory Overview. Phone layout remains controlled by the existing mobile stylesheet; Dashboard Export/Import/Bulk Import actions stay on Home. Static checks passed; browser rendering remains pending. |
| v86 | *(ZIP filename not preserved in the v89 source log)* | 2026-11-09 | `ALISHAN-CHG-2026-11-09-004` | Matched tablet/desktop quality-card colours to the restrained phone theme palette; removed vivid product-type gradients without changing card data or actions. |
| v87 | *(ZIP filename not preserved in the v89 source log)* | 2026-11-09 | `ALISHAN-CHG-2026-11-09-005` | Replaced the tablet/desktop left rail with a horizontal topbar and restored two quality-card columns. This was subsequently superseded by v88's one-card-per-row requirement. |
| v88 | *(ZIP filename not preserved in the v89 source log)* | 2026-11-09 | `ALISHAN-CHG-2026-11-09-006` | Changed tablet/desktop Inventory to one full-width quality card per row and removed the separate action-panel background. |
| v89 | `AlishanApp-v89-Visual-Learning-Center.zip` | 2026-11-09 | `ALISHAN-CHG-2026-11-09-007` | Expanded the User Guide to 29 topics, five learning paths, workflow diagrams and searchable help; synchronized guide version to v89. |
| v90 | `AlishanApp-v90-Visual-Screenshot-Tutorials.zip` | 2026-11-10 | `ALISHAN-CHG-2026-11-10-001` | Extracted 42 individual screenshots from the supplied 21-page PDF and placed each in its relevant User Guide topic; added mobile swipe galleries, full-size image links, screenshot asset precaching (SW v20), and synchronized App/User Guide v90. No business logic or stored data changed. |
| v91 | `AlishanApp-v91-Mandatory-Version-Log.zip` | 2026-11-11 | `ALISHAN-CHG-2026-11-11-001` | Restored the missing v86–v89 rows in this Version log; made the Version log compulsory (rule 10 in section 0, protocol section 17) and enforced it with a new regression test `tests/version-log.test.js`; the User Guide version test now follows the log. App/User Guide/README synchronized to v91. No business logic or stored data changed. |
| v92 | `AlishanApp-v92-Size-Groups-And-Sizes-48-50.zip` | 2026-11-11 | `ALISHAN-CHG-2026-11-11-002` | New **Size Groups** editor (`size-groups.js`) used by New Entry AND Edit: all colours start in one group; ⇄ on a colour splits only that colour into its own group or moves it to another group; the old "Same / Different sizes" radio buttons are gone. Saved shapes are unchanged (one group = same, several groups = different), and groups with equal sizes are joined. Inventory/Home cards show colours with the same sizes together in one table. Sizes **48 and 50** added everywhere (they follow `SIZES` in `calc.js`). Size grid no longer overflows on desktop. Service worker v21. |
| v93 | `AlishanApp-v93-New-Header-Logo-And-User-Guide.zip` | 2026-11-11 | `ALISHAN-CHG-2026-11-11-003` | New header (gradient bar, accent stripe, bold bundled font, hanger-A logo + wordmark) with its own colours for every one of the 19 themes (checked for readable contrast by `tests/header-theme.test.js`); browser bar colour follows the theme; new app icons (any / maskable / Apple / favicon); User Guide rewritten for the user (Quick Start, topic 2A Size Groups, rewritten topic 2, Q&A, What's new, 5 new screenshots, developer wording removed); new rule 11 / protocol section 18: the User Guide is compulsory for every new feature. Service worker v22. |
| v94 | `AlishanApp-v94-Edit-Price-And-Colour-Cards.zip` | 2026-11-13 | `ALISHAN-CHG-2026-11-13-001` | Fix: entries whose quality is not in `qualities.json` (for that product type) could not be edited — the Update button did nothing. New: Price per dozen box in the Edit window (with the app price shown, "Use app price", amount follows the price, price change written to Quality History). Card: colours that share one size table are shown as own-colour cards (colours.json) on a theme-neutral header; one-colour tables and plain same-size cards are unchanged. User Guide updated. Service worker v23. |
| v95 | `AlishanApp-v95-Compact-Colour-Cards.zip` | 2026-11-13 | `ALISHAN-CHG-2026-11-13-002` | Colour cards in a shared size table made small (9 px text, 4 px padding) and the totals moved onto the same row (`EACH 5 · TOTAL 25 DZ`), so the header is about as low as a one-colour header (2–3 colours: 31 px at phone width, before 53 px; a one-colour header is 34 px). Guide screen 45 retaken. Service worker v24. |
| v96 | `AlishanApp-v96-Archives-Brand-Logo-Rose-Wine.zip` | 2026-11-13 | `ALISHAN-CHG-2026-11-13-003` | **Archives:** Delete now moves an entry (with its payments) into Settings → Archives (new IndexedDB store `archive`, DB version 2); Restore, Delete for good (type the 6-digit code; removes payments, Quality History rows, Recent Activity lines and the copies in the automatic backups, so no shadow) and a cleaner for old traces of entries deleted before Archives existed. **Brand:** the butterfly-A logo as app icon, favicon and header mark, the ALISHAN lettering as a light theme-coloured mask, tagline "Lingerie & Innerwear" instead of INVENTORY, new theme **Rose Wine** (20 themes). User Guide: topic 3A, Rose Wine/logo text, What's new v96, screens 47–49. Service worker v25. |
| v97 | `AlishanApp-v97-Render-Supabase-Backend.zip` | 2026-11-18 | `ALISHAN-CHG-2026-11-18-001` | Server-only business calculations and transactional Supabase persistence on Render; existing UI retained with asynchronous API wiring, private server access and migration instructions. Hosted and real-browser acceptance remain pending. |
| v98 | `AlishanApp-v98-Backend-Performance.zip` | 2026-11-18 | `ALISHAN-CHG-2026-11-18-002` | Lock-free projected reads, revision-checked snapshots, bulk restore writes and smaller API responses; original UI and calculation rules preserved. |
| v99 | `AlishanApp-v99-Device-Cache.zip` | 2026-11-18 | `ALISHAN-CHG-2026-11-18-003` | Scoped RAM/device caches of server-computed views, revision checks, background refresh/prefetch, static metadata and server-paged Inventory. |
| v100 | `AlishanApp-v100-Theme-and-Loading.zip` | 2026-11-18 | `ALISHAN-CHG-2026-11-18-004` | Local-first theme, independent theme persistence, compressed reads and compact backup overview. |
| v101 | `AlishanApp-v101-Reviewed-Entries.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-001` | Entry review, permanent Quality Codes, retry confirmation, live form preview, extra received and export counts. |
| v102 | `AlishanApp-v102-Google-Login.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-002` | Google sign-in candidate, private per-user workspaces, navigation prefetch and changed-record cache priming. |
| v103 | `AlishanApp-v103-Speed-Timings.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-003` | Opt-in device timings for page loads, page switches, theme changes and confirmed saves. |
| v104 | `AlishanApp-v104-Page-Performance.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-004` | Automatic page visits, API and database timings, and filtered performance history. |
| v105 | `AlishanApp-v105-Responsive-Settings.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-005` | Settings navigation binds immediately, with backup and archive requests deferred to the relevant sections. |
| v106 | `AlishanApp-v106-Faster-Startup.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-006` | Parallel first render, intent-based prefetch, and page-by-release performance comparison. |
| v107 | `AlishanApp-v107-SPA-Navigation.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-007` | In-app navigation retains visited views and shared transport in a single document. |
| v108 | `AlishanApp-v108-SPA-Styles.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-008` | Attach route stylesheets to the active document during SPA navigation. |
| v109 | `AlishanApp-v109-Performance-Insights.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-009` | Visit type breakdown, slow visit filters, and individual timing visualization. |
| v110 | `AlishanApp-v110-SPA-Icons.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-010` | Restore navigation icons when the SPA starts on Page Performance. |
| v111 | `AlishanApp-v111-First-Visit-Performance.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-011` | Prioritize dashboard totals and inventory list, warm Settings, and measure startup phases. |
| v112 | `AlishanApp-v112-Startup-Timings.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-012` | Measure report startup phases and saved view startup, and warm Add Entry files. |
| v113 | `AlishanApp-v113-Monitor-Copy.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-013` | Group performance timings and copy visits or selected timings. |
| v114 | `AlishanApp-v114-Text-Guide-and-Reports.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-014` | Revise the text-only guide, trim cached assets, and warm Reports. |
| v115 | `AlishanApp-v115-Dashboard-and-Inventory-Startup.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-015` | Paint server-calculated Dashboard totals before the startup bundle and warm the Inventory route. |
| v116 | `AlishanApp-v116-Cached-Startup.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-016` | Reuse shared startup data and refresh Inventory without blanking the current list. |
| v117 | `AlishanApp-v117-Startup-Cache.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-017` | Show saved startup content before the bundle finishes and trace cache lookups. |
| v118 | `AlishanApp-v118-Backup-Egress.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-018` | Avoid repeated backup snapshot reads for schedule checks, routine saves and backup overview. |
| v119 | `AlishanApp-v119-Backup-Monitor.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-019` | Expose minimal read-only backup freshness to the authorized monitor. |
| v120 | `AlishanApp-v120-Live-Monitor.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-020` | Add scoped operational summaries and document paint telemetry. |
| v121 | `AlishanApp-v121-Monitor-Link.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-021` | Link the newer Alishan Monitor from Settings and detailed timing history. |
| v122 | `AlishanApp-v122-Startup-Diagnostics.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-022` | Measure startup assets, API batches, response sizes, database waits and response processing. |
| v123 | `AlishanApp-v123-Manual-Sync.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-023` | Add manual revision sync and persist the latest server check. |
| v124 | `AlishanApp-v124-Reports-Route.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-024` | Reuse sanitized versioned route HTML for signed-in tab navigation and trace route prep. |
| v125 | `AlishanApp-v125-Account-Login.zip` | 2026-11-20 | `ALISHAN-CHG-2026-11-20-025` | Clarify Google account creation and exit the current view upon account or session changes. |
| v126 | `AlishanApp-v126-Google-Setup.zip` | 2026-11-21 | `ALISHAN-CHG-2026-11-21-001` | Add an owner verification stage before Google-only activation. |

> **Note on two ZIPs named v90 (added 2026-11-11, history kept):** an earlier ZIP, `AlishanApp-v90-Visual-Manual-Workflow-Fixes.zip` (change ID `ALISHAN-CHG-2026-11-09-008`: Expand All / Collapse All fix, Add Entry order Quality Type → Quality → Cup, 32 PDF screenshots), was delivered on a separate branch. Its changes are **not** contained in the v90 row above or in v91. This lineage continues from `AlishanApp-v90-Visual-Screenshot-Tutorials.zip`. Whether to bring those fixes into this lineage is an open owner decision.

### 7.6 Pending work added on 2026-11-06

| Pending ID | Work | Current status | Reason |
|---|---|---|---|
| `ALISHAN-PEND-2026-11-06-001` | Export Center redesign | `IMPLEMENTED — NOT VERIFIED` | Delivered in v74. Real-browser tests of every format, mobile layout, dark themes and ZIP round trip remain. |
| `ALISHAN-PEND-2026-11-06-002` | Report Page redesign (8 report cards, from `AlishanApp_Report_Page_AI_Implementation_Handover.md`) | `PENDING` | Specification received on 2026-11-06; not started. The app stores no quality **completion date** (no `completedAt` field), which the Weekly Report needs; this gap must be decided by the owner before coding. |
| `ALISHAN-PEND-2026-11-06-003` | Completion date for the Weekly Report | `IMPLEMENTED — NOT VERIFIED` | Delivered in v75 (`completedAt`). It answers the data gap noted in `ALISHAN-PEND-2026-11-06-002`; entries without a date still cannot be counted in any week. The Report Page itself is still `PENDING` (planned as v76). |
| `ALISHAN-PEND-2026-11-06-004` | Report Page redesign (was `ALISHAN-PEND-2026-11-06-002`) | `IMPLEMENTED — NOT VERIFIED` | Delivered in v76. Real-browser checks of every report, filters on a phone, dark themes, the Export Center hand-off and the Add Amount Received flow remain. Weekly Report and Business Analysis cannot be exported through the Export Center (it has no completion-date filter); they use the Excel button. |
| `ALISHAN-PEND-2026-11-06-005` | Limits of v74–v76 (see ALISHAN-CHG-2026-11-06-004) | `IMPLEMENTED — NOT VERIFIED` | Delivered in v77. Real-browser checks remain: Export Center new filters and the Completed Work file, hand-off from Weekly Report / Business Analysis, Missing Completion Date page, Payment Report old sections with a date range, Bulk Import colour replace, Edit colour swap. |
| `ALISHAN-PEND-2026-11-08-006` | Phone layout of Export Center and Report Page | `IMPLEMENTED — PARTLY VERIFIED` | Checked in a real browser (Chromium, 390 / 360 / 320 px) with test data. Not checked on a real phone (Android Chrome, iPhone Safari), landscape, Excel files and charts (their libraries are not in `vendor/`, they load from the internet). |
| `ALISHAN-PEND-2026-11-08-007` | Report result-card redesign, read-only detail popup, shared pagination and 1000-record Activity Log reads | `IMPLEMENTED — NOT VERIFIED` | Delivered in v79. JavaScript / HTML static checks passed; actual browser checks at 390 / 360 / 320 px, report-data flows, pagination state isolation, popup completeness and backup/export contents remain. |
| `ALISHAN-PEND-2026-11-08-008` | Verify v80 Reports runtime error fix, six-card mobile overview layout, and Inventory-matching pagination in a real browser | `IMPLEMENTED — NOT VERIFIED` | v80 removes the stale Aging Stock DOM writes, overrides the legacy third-card full-width rule for Reports, and gives `.pagination-controls.common-pagination` precedence over the old Report-only styles. Static checks are pending; real browser tests at 390 / 360 / 320 px and real report data are still required. |
| `ALISHAN-PEND-2026-11-08-009` | Verify v81 Reports focused views, collapsed legacy sections, one-line pagination, updated User Guide and Data & Backup flows | `IMPLEMENTED — NOT VERIFIED` | v81 source changes and static checks are present. Real browser checks at 390 / 360 / 320 px, actual long payment/pending datasets, pagination callbacks, restore safety behavior and ZIP hand-off still require user/browser verification. |
| `ALISHAN-PEND-2026-11-08-010` | Verify shared pagination and Reports focused-view visibility/order | `IMPLEMENTED — NOT VERIFIED` | v84 replaces the narrow-phone clipping/scrolling rules with compact icon-only controls at 380px and below, adds accessibility semantics and repeatable Node tests. Real browser checks at 390 / 360 / 320 px, Android Chrome, focused-report click-through and actual stored list data are still required. |
| `ALISHAN-PEND-2026-11-09-001` | Verify tablet/desktop responsive navigation, page sizing and Inventory Overview | `IMPLEMENTED — NOT VERIFIED` | v85 adds the tablet/desktop-only responsive stylesheet and Inventory Overview. Static tests pass, but real browser/device rendering at tablet and desktop widths remains required. Confirm the phone layout is unchanged and Dashboard Export/Import/Bulk Import actions remain in place. |


### ALISHAN-CHG-2026-11-06-002 — Completion date ("Maal Gaya") saved when a quality is completed
- **Type:** New feature (one new optional field on a quality: `completedAt`).
- **Status:** `IMPLEMENTED — NOT VERIFIED` (see tests). Related pending item: `ALISHAN-PEND-2026-11-06-003`.
- **Reason:** The owner uses **Complete** as "the goods have gone" and **Pending Amount** as the payment status (section 11). The app only stored In Stock / Out of Stock, not the day the goods went. The Report Page (weekly report, business analysis) needs that day, and the owner wants to see how long ago goods went while the money is still pending.
- **Before:** Complete only switched `inStock` to false. No date was kept; Quality History had the event time but nothing showed it on the quality.
- **After:**
  - **Complete** (Inventory card button and Home > In Stock Items button, both `AlishanStore.toggleStock`) saves `completedAt` = the moment of pressing. Going **back in stock** removes `completedAt`. If saving fails, both `inStock` and `completedAt` are put back.
  - **Edit** shows a "Maal Gaya (Completion Date)" box only for a Complete quality. Choosing a day sets it (today = now, the day already saved = unchanged, any other day = 12:00 of that day); an empty box removes the date. Refused: a future day, a day before the entry day, a text that is not a date. A quality that is still in stock has no such box and edits never change its date.
  - **Shown:** on every Pending Amount card of a Complete quality ("Maal gaya: 12 Nov 2026 · 5 days ago", or "date not set"), and in the quality details window (MAAL GAYA row).
  - **Quality History:** the snapshot has a new row "Completion Date", so Complete / back-in-stock / edit records show the date change like any other change.
  - **Older Complete qualities (saved before v75):** when the app loads, a Complete quality without a date takes the time of its latest real **"Quality Completed"** record in Quality History (records of v65–v69 are read through `normalizeQualityHistory`, which fixes their old reversed wording). A quality with no such record stays "date not set"; **nothing is guessed**. The saved history is never changed.
  - Backup, restore, ZIP backup and Export carry the field because they copy whole records.
- **Not changed:** calculations, amounts, payments, aging (aging still counts from the entry date), the Complete button name and wording, Bulk Import.
- **Files changed:** `frontend/calc.js` (`completionStamp`, `completionInfo`, Edit rule in `buildUpdatedItem`), `frontend/store.js` (`toggleStock`, `backfillCompletionDates`, history snapshot row, `completionInfo`), `frontend/item-modal.js` (Edit box), `frontend/item-card.js` (details row), `frontend/audit-pages.js` and `frontend/pending-amount.html` (Pending Amount line), `PROJECT_SOURCE_OF_TRUTH.md`, `README.md`.
- **Tests actually run:** JavaScript syntax of the changed scripts. Run with stub data: Edit rules (unchanged day keeps its time, other day becomes 12:00, today = now, future refused, before-entry refused, empty removes, absent field keeps, in-stock entry ignores, garbage refused); `completionInfo` (days ago, no date, in stock = none); `normalizeInventory` keeps the field; Complete / back in stock / failed save in `toggleStock`; back-fill (latest record wins, an old reversed record is read correctly, an entry that already has a date is not touched, an entry without a record stays empty).
- **Not tested yet:** real browser (Edit box layout, Pending Amount line, details row, Home button), back-fill on the owner's real data, backup / restore round trip with the new field.
- **Known limitations:** Qualities completed before v70 have no history record, so they show "date not set" until the owner types a date in Edit. A date typed for another day is stored as 12:00 of that day.

---

## 11. How the owner uses the app (business workflow) — recorded 2026-11-06

This section records how the app is really used. Read it before changing anything about stock, payments or reports. It is append-only; a changed way of working is added below with the old text marked `SUPERSEDED`.

1. **Order arrives → entry added at once.** The quality is added as soon as the order is received. It stays **In Stock**, which means the goods are **not finished / not sent yet** (shown as *Incomplete*).
2. **Goods finished and gone → press Complete.** The owner presses **Complete** when the goods are ready and **go out**. The quality becomes **Out of Stock = Complete = "Maal Gaya"**. It leaves In Stock Items and Aging. (The Complete button is used for "the goods have gone"; since v75 the day is saved as `completedAt`.)
3. **Money comes later → Received.** Payment usually arrives later: after one week, two weeks or a month, and in parts or at once. The owner records it with **Add Amount Received** (Reports) or the **Received Amount** card (Pending Amount page). **Pending Amount = the payment status**: a quality stays there until its pending balance is zero, whether it is Complete or Incomplete.
4. **The two things are independent.** Money can arrive before the goods go or a week or a month after. Never connect "paid" with "Complete", and never use one to decide the other.
5. **Questions the app must answer:**
   - Which orders are not sent yet? → Home > **In Stock Items** (Incomplete).
   - Which goods have gone but are not fully paid? → **Pending Amount**, cards marked *Completed*, with "Maal gaya: date · N days ago".
   - How long have the goods been waiting for money? → the same cards (Pending Days counts from the entry date; the Maal gaya line counts from the day the goods went).
6. **Decisions made in this discussion:**
   - **D-004** Locked: *Complete = Out of Stock = goods gone (Maal Gaya).* The Complete button keeps its name; a rename to "Maal Gaya" is possible later only on the owner's request.
   - **D-005** Locked: *Pending Amount page = payment status.*
   - **D-006** `SUPERSEDED` before any code was written: the chat idea of a separate "Maal Gaya" button, a "dispatch pending" list and three stages per quality (Complete / Paid / Gaya). Replaced by D-004 and D-005 (the owner already uses Complete as Maal Gaya). Replaced by: D-007.
   - **D-007** The day the goods went is saved when Complete is pressed (`completedAt`, ALISHAN-CHG-2026-11-06-002); it is shown, editable, and never guessed for old entries.
7. **For the Report Page (planned v76):** weekly figures such as "this week's work" use the **completion date** (`completedAt`). A quality without a date is not counted in any week and is listed as "date not set". Payment figures use the payment's own date. Aging stays on the entry date.

### ALISHAN-CHG-2026-11-06-003 — Report Page redesigned: eight report cards
- **Type:** Changed feature (presentation) + new read-only report views. Source: `AlishanApp_Report_Page_AI_Implementation_Handover.md`.
- **Status:** `IMPLEMENTED — NOT VERIFIED` (static checks and simulated-page tests were run; real browser tests are still to be done by the owner).
- **Calculation files:** **`calc.js`, `store.js` and `db.js` were NOT changed in this version** (checked against the v75 ZIP: only `export-center.js`, `reports.html`, `sw.js` changed and `report-engine.js`, `report-views.js`, `reports.css` were added). No existing formula was reimplemented: amount, quantity, received, pending, valuation and aging come from `AlishanCalc` / `AlishanStore`; the new files only choose records (filters, weeks, months), add up those existing numbers and arrange them.
- **Before:** `reports.html` opened on a tab bar (Pending Amount Receival, Weekly Reports, Amount History, Inventory Valuation, Stock Aging Analysis). One shared filter panel (Time Period, Product Type, Quality) filtered everything; Weekly Reports meant *payments received per week*.
- **After:**
  - **Main page:** the report search box, **eight report cards** (each with one real figure), then the old overview cards, Advanced Quality Search and the old filter panel (these three are shown only on the main page; the old filter panel still filters the overview cards and the old *Export Report* window as before).
  - **Opening a card** shows that report with: Back to reports; filters (only those the report's records support); summary tiles; charts; a table (click a heading to sort, 50 rows at a time, click a row to see the quality read-only); *Export Center* and *Excel* buttons. The address is `reports.html#<report>` so the browser's Back button works. Opening or filtering never writes any record.
  - **Shared filters:** Date range, Quality, Quality ID, Quality Type, Lot Number, Colour, Cup, Status (Complete / Incomplete), Amount range. Matching is exact; lists narrow each other like the Export Center; the page's quick search also narrows every report. Clicking a chart bar or slice applies that value as a filter (Aging: opens that age group).
  - **Old sections kept:** Pending cards with *Add Amount Received* (inside Pending Report), Amount History with delete and Weekly received per week (inside Payment Report), the valuation trend / stock summary (inside Valuation Report), the aging cards (inside Aging Report). They draw from the same filtered entries as the new parts.
- **The eight reports and what they mean (definitions):**
  1. **Weekly Report** — Monday–Sunday week (navigate ‹ ›, or a custom range). *Work of the week = qualities whose Quality Completion Date (`completedAt`) is inside the week.* Tiles: qualities completed, quantity (dozens), work amount, amount received and pending **for those qualities (till today)**, cash received in the week (payment dates), incomplete qualities (not completed yet, **not** counted as work) and completed-without-a-date (**not** counted in any week). Compared with the previous week; charts: work amount by day, received vs pending, quantity and quality-count trend over 8 weeks.
  2. **Payment Report** — the really saved payments: total received, number of entries, average (total ÷ entries); monthly bar and received-by-type; date range = payment date.
  3. **Pending Report** — qualities with remaining amount > 0 (partly paid ones show the remaining amount; fully paid ones never appear): total pending, count, quantity, oldest pending record; by type and highest-pending qualities.
  4. **Quality Report** — qualities with quantity and amount; average = total ÷ qualities; type breakdown, leading qualities, quality-wise amount.
  5. **Valuation Report** — the app's existing valuation (`qualitySummary` / `summary`) of the selected entries (as in the old Inventory Valuation tab, it counts the selected entries, not only those in stock). It is not the cash received.
  6. **Aging Report** — existing aging (`agingReport`, entry date): Fresh 0–7, Aging 8–15, Warning 16–30, Critical 31+ days; only entries still in stock (Incomplete) age; the four group tiles open their list.
  7. **History Report** — Quality History (old records read through `normalizeQualityHistory`) and the Activity Log together, newest first. The Activity Log keeps only the newest 200 actions and has no quality fields, so quality filters hide it (the screen says so).
  8. **Business Analysis** — week or month against the one before. Work amount, quantity, quality count and pending use the Quality Completion Date (same as the Weekly Report); cash received uses payment dates (same as the Payment Report). Comparison table with change and %, bar and 6-period line chart.
- **Export:** *Export Center* hands the report's data set and filters over (`sessionStorage 'alishanExportPreset'`, read by `export-center.js` which then opens with them applied; nothing is exported until the owner presses Export). Pending, Payment, Quality, Valuation, Aging and History map to existing Export Center data sets. **Weekly Report and Business Analysis cannot be expressed there** (no completion-date filter) and the Amount range is not an Export Center filter; for these the *Excel* button downloads the report's summary and table (same Excel helpers as before). This is a documented limitation, not a second export system.
- **Data not available / not invented:** qualities without a completion date are never put into a week; no completion dates are guessed; no new payment-status or aging labels were created (existing ones are used).
- **Decisions:** `SUPERSEDED` — the five-tab layout and the single Time Period / Product Type / Quality filter panel as the way into reports (replaced by the eight cards and per-report filters; the old panel remains on the main page for the overview cards and the old Export Report window). `SUPERSEDED` — "Weekly Reports = amount received per week" as *the* weekly report (kept as a section inside the Payment Report; the Weekly Report now follows section 11 of this file).
- **Files changed:** `frontend/reports.html`, `frontend/export-center.js` (hand-off), `frontend/sw.js` (cache v8, new files), `frontend/ARCHITECTURE.md`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`. **Added:** `frontend/report-engine.js`, `frontend/report-views.js`, `frontend/reports.css`.
- **Tests actually run:** JavaScript syntax of all scripts and of the inline script of `reports.html`; HTML id uniqueness and div balance. Engine run on sample entries with the real `calc.js`: week range (Monday–Sunday), completion-date weeks and previous week, no-date quality not counted, partly paid / fully paid pending, aging groups and their lists, payments by month, exact lot filter (5 vs 55), amount range, status and payment filters, history with and without a quality filter, week and month analysis, custom range, Export Center presets. Eight views, card figures, navigation, week buttons, aging group click, quality window, Excel hand-off and filter + clear run in a simulated page; Export Center opens with a report's hand-off applied.
- **Not tested yet:** real browser (layout on phone and desktop, dark themes, charts, the read-only quality card, the old sections inside a report, Add Amount Received and delete from inside a report), real Excel files, large data (thousands of entries), hand-off through the real page navigation.
- **Known limitations:** Weekly Report / Business Analysis are not exportable through the Export Center; the Amount range is not passed to it; the Activity Log keeps 200 actions; qualities completed before v70 without a date appear only as "completed without a date"; the old section *Weekly received per week* inside the Payment Report does not follow the new date range.

(Update 2026-11-06: item 7 above was delivered in v76 — see ALISHAN-CHG-2026-11-06-003.)

### ALISHAN-CHG-2026-11-06-004 — Known limits of v74–v76 fixed
- **Type:** Changed features + one new page (no formula or amount rule changed; `calc.js` unchanged).
- **Status:** `IMPLEMENTED — NOT VERIFIED` (see tests). Related pending item: `ALISHAN-PEND-2026-11-06-005`.
- **Reason:** The owner asked to fix the limitations listed after v76. Each limit and its fix:
  1. **Weekly Report and Business Analysis could not go to the Export Center** (it had no completion-date filter). *Fix:* the Export Center now has **Completion date — from / to** (only qualities completed inside it, with a saved completion date) and a new data set **Completed Work** (completion date, quality, ID, type, lot, quantity, total / received / pending amount). The report hands over this data set with the open week or month; all eight reports now open in the Export Center. *(SUPERSEDES the limitation written in ALISHAN-CHG-2026-11-06-003.)*
  2. **Amount range was not an Export Center filter.** *Fix:* **Amount — min / max (₹)** added. It applies to the amount of Quality Inventory (*Total Amount*), Completed Work (*Total Amount*), Pending Amount (*Pending Amount*), Received Payments (*Amount Received*) and Stock Aging (*Value*); the preview line says when it does not apply to a data set (Size-wise Detail, Valuation, Weekly Payments, history, master and system lists). The hand-off passes the report's range.
  3. **Complete qualities with no completion date stayed "date not set" until edited one by one.** *Fix:* new page **Missing Completion Date** (Home > Quick Actions; also linked from the Weekly Report note). It lists every Complete quality without a date, with a date box (not before the entry day, not in the future) and *Save date*. Saving (`AlishanStore.setCompletionDate`) uses the same rules as the Edit box (`AlishanCalc.completionStamp`), is written to Quality History as *Quality Updated* with a "Completion Date" row, and the quality leaves the list. Nothing is guessed or filled automatically.
  4. **Activity Log kept only the newest 200 actions.** *Fix:* it keeps the newest **1000** (`db.js`). Actions already dropped cannot be recovered. The History Report note says 1000.
  5. **The old "received per week" and Amount History sections inside the Payment Report ignored its date range.** *Fix:* they now follow the Payment Report's payment date range and payment amount range (weeks without a payment in range are not offered; totals follow the shown days).
  6. **Bulk Import colour replace and Edit colour swap used separate code for the choices.** *Fix:* one function `AlishanStore.colorChoices(colorName, takenColours)` (close suggestions first, then every colour, taken colours left out) is used by the Edit swap row, the Bulk Import swap row and the Bulk Import "colours not in the app" list. The behaviour of both screens is unchanged; the colour-swapping itself still works on the Edit form (live size cards) and on the Bulk Import draft (data) respectively, because they hold their data differently.
- **Not changed:** every calculation (`calc.js`), amounts, payments, aging, the Complete button, the report definitions of ALISHAN-CHG-2026-11-06-003.
- **Files changed:** `frontend/store.js` (`colorChoices`, `setCompletionDate`, `missingCompletionItems`), `frontend/db.js` (activity cap), `frontend/export-center.js`, `frontend/index.html` (new Export Center inputs, Quick Action), `frontend/report-engine.js`, `frontend/report-views.js`, `frontend/reports.html`, `frontend/item-form.js`, `frontend/bulk-import.js`, `frontend/audit-pages.js`, `frontend/icons.js` (calendar-check, code-compare, hand-pointer — the last two were already used by the Report Page without an icon), `frontend/sw.js`, `PROJECT_SOURCE_OF_TRUTH.md`, `README.md`, `frontend/ARCHITECTURE.md`. **Added:** `frontend/missing-completion.html`.
- **Tests actually run:** JavaScript syntax of every script and of the inline script of `reports.html`; id checks of `index.html` and `export-center.js`; with stub data: `setCompletionDate` (future, before entry, in-stock quality refused; a valid day saves, writes history, leaves the list), colour choices, export presets of Weekly Report (Monday–Sunday completion range) and Business Analysis (month), amount flags, payment range check; the Export Center with the new inputs (Completed Work 2 rows, this week 1 row, amount min 1000 → 0 rows, filter chips); the Missing Completion Date page (card, date limits, empty date refused, save call, list becomes "All caught up").
- **Not tested yet:** real browser (layout of the new Export Center inputs and the new page on a phone and in dark themes, the real Completed Work Excel / CSV / PDF file, hand-off by real page navigation, the old sections inside the Payment Report with a date range, Edit colour swap and Bulk Import replace after the shared change), large data.
- **Known limitations:** the amount range is not applied to every Export Center data set (the screen says which); the Activity Log still has a cap (1000); Complete qualities without a completion date still need the owner to type it (by design: nothing is guessed).

### ALISHAN-CHG-2026-11-08-001 — Export Center and Report Page fixed for phones
- **Type:** Bug fixes (layout only; no data, calculation or report definition changed).
- **Status:** `IMPLEMENTED — PARTLY VERIFIED` (looked at in a real Chromium browser at phone width; see tests).
- **Reason:** The owner thought the Report Page and the Export Center did not work in the mobile view. They did not: v74–v77 had only been tested with scripts, which cannot see layout. The pages were then opened in a real browser at 390 × 844 with test data and the problems below were found and fixed.
- **Problems found (before) and fixes (after):**
  1. **Export Center — wrong header and footer.** The app styles every `<header>` and `<footer>` tag as its blue top bar, so the dialog had a blue gradient header with unreadable text and tabs hidden behind it. *Fix:* plain `<div>`s.
  2. **Export Center — wider than the screen.** Content was cut at the right edge (the dialog body was 2335 px wide inside a 388 px screen) because grid children do not shrink by default. *Fix:* `minmax(0, 1fr)` and `min-width: 0`; grid columns use `min(230px, 100%)`.
  3. **Export Center — the Export and Cancel buttons were hidden behind the phone's bottom navigation.** *Fix:* the dialog now sits above it (z-index 1200) and is a full-height sheet on a phone with the footer above the system bar; filter boxes sit two by two; date and amount boxes two by two.
  4. **Report views — the page became 578–866 px wide** (same grid problem, plus a 10-column table). *Fix:* `minmax(0, 1fr)`, `min-width: 0`.
  5. **Report views on a phone:** week buttons were full-width bars (now one row ‹ label ›); the Filters box starts closed on a phone and its boxes sit two by two; the Details and comparison tables became cards (one card per record; the comparison shows current / previous / change together instead of hiding two columns); charts that cannot load no longer leave large empty boxes (one note instead); the Aging Report showed the four age groups twice (now totals plus the four clickable group cards, titles no longer repeat the range); the Valuation Report's old table pushed the page wider at 360 px and below.
  6. **Read-only quality window:** raised above the bottom navigation (z-index 1200); its title bar no longer uses a `<header>` tag.
- **Not changed:** calculations, report definitions (ALISHAN-CHG-2026-11-06-003), export contents, the old pagination block on the Report home.
- **Files changed:** `frontend/index.html` (header / footer tags of the Export Center), `frontend/export-center.css`, `frontend/reports.css`, `frontend/report-views.js`, `frontend/report-engine.js` (Aging tiles), `frontend/sw.js` (cache v9), `PROJECT_SOURCE_OF_TRUTH.md` (rule 9, this record), `README.md`, `frontend/ARCHITECTURE.md`, `AI_HANDOVER_PROTOCOL.md`.
- **Tests actually run (real Chromium, phone viewport, test data of 6 qualities and 2 payments, service worker blocked):**
  - Screenshots and an "anything wider than the screen" check of: Report home, all eight report views, the read-only quality window, the Export Center (every section, an opened filter list), the Missing Completion Date page and the Edit form with the colour swap row — at 390 px, and the Report views, Export Center and new page again at 360 and 320 px: **no horizontal overflow** after the fixes.
  - Real flows: Pending Report → Export Center (Pending Amount pre-selected); Weekly Report → Export Center (Completed Work, completion range Monday–Sunday, 1 row); real **CSV**, **JSON** and **complete ZIP backup** downloads (file contents checked); ZIP **restore round trip** (6 qualities → one deleted → restored to 6).
- **Not tested yet:** a real phone (Android Chrome, iPhone Safari), landscape, the Excel file and the PDF print window, the charts (the libraries are not in `vendor/` and could not be downloaded here: Excel and charts need the internet unless the files are copied into `frontend/vendor/` as described in `vendor/README.txt`), the Quality History and Home pages at phone width were not re-checked in this change.
- **Known limitations:** without internet and without the files in `vendor/`, charts and Excel do not load (the pages say so and everything else works); the Home breakdown window and a few older dialogs use z-index 1000 and may still sit under the bottom navigation (not changed here).


### ALISHAN-CHG-2026-11-08-002 — Report result cards, detail popup, shared pagination and Activity Log read limits
- **Type:** Changed feature (Report Page presentation and navigation) + shared UI module + limit consistency fix.
- **Status:** `IMPLEMENTED — NOT VERIFIED` (static checks passed; browser checks are pending). Related pending item: `ALISHAN-PEND-2026-11-08-007`.
- **User-approved scope:** Implement the Report Page decisions agreed on 2026-11-08, and correct the 200 / 500 record read limits to match the Activity Log's 1000-record retention. Do not change business calculations or unrelated screens.
- **Before:** Report cards disappeared after opening a report; result rows were displayed as a wide table / single-column phone stack; clicking a row reused the Inventory ItemCard with its Inventory layout; report pagination used a separate show-more control; Inventory and Reports had separate pagination markup; Export Center Activity Log / safety backup / complete ZIP backup read 200 records and Report History read 500 even though the retained Activity Log limit is 1000.
- **After:** The six Report Page overview cards remain at the top (Aging Stock is removed from this Report Page overview only). Search and Advanced Quality Search sit below them, followed by the report-selection cards. Selecting a report keeps those cards visible and shows that report's data underneath. Result records are compact two-column cards: Quality Name is a compact centered heading; the report-specific essential fields sit in two columns; each report uses the same card shell but its own fields. Clicking a quality card opens a read-only popup with a neutral detail grid (not the Inventory ItemCard layout), including available quality, size/quantity summary, colour, payment and other saved details; payment and history cards add their own report context.
- **Sorting:** Latest First, Oldest First, Quality A–Z / Z–A, Amount High to Low / Low to High. Sorting uses fields already returned by the selected report.
- **Pagination:** Added `common-pagination.js` / `common-pagination.css`, using Inventory's existing 10 / 20 / 50 / 100 options and Previous / Next / Page n of m behavior. Inventory now uses the shared module; Reports uses the same module and keeps each report's own page and page-size state. Filtering resets that report to page 1.
- **Activity Log:** All three Export Center readers now call `getRecentActivity(1000)` (Activity Log export, complete ZIP backup, pre-restore safety backup); Report History now calls `getRecentActivity(1000)`. This reads the newest 1000 retained actions. Actions already deleted from storage by earlier retention limits cannot be recovered.
- **Data / calculation flow:** Report Engine continues to read AlishanStore / AlishanCalc outputs. No formula, quantity conversion, price, payment application, database schema, or quality record was changed. The popup is read-only. Pagination state is UI-only and is not saved to business records.
- **Files changed:** `frontend/reports.html`, `frontend/reports.css`, `frontend/report-views.js`, `frontend/report-engine.js`, `frontend/export-center.js`, `frontend/inventory.html`, `frontend/inventory.js`, `frontend/common-pagination.js` (new), `frontend/common-pagination.css` (new), `frontend/sw.js` (cache v10), `frontend/ARCHITECTURE.md`, `PROJECT_SOURCE_OF_TRUTH.md`, `README.md`.
- **Tests actually run:** `node --check` for every frontend `.js` file and the inline script in `reports.html`; Python HTML parsing for `reports.html` / `inventory.html` (no duplicate IDs; all script sources exist); CSS brace-balance check; CommonPagination mock test (page count, Next callback, page-size callback); Report History mock test (requests 1000 actions and exposes Previous / New values); source scan confirmed six overview cards and no remaining `getRecentActivity(200)` / `getRecentActivity(500)` calls in the changed readers.
- **Not yet tested:** Real browser at 390 / 360 / 320 px. A headless Chromium screenshot attempt did not complete in this runtime, so no visual/browser result is claimed. Actual quality/payment/history data click-through; pagination on Inventory and multiple Reports; data export and restore contents after the 1000-record change; theme checks; Android Chrome / iPhone Safari remain untested.
- **Known limitations:** This is not a real-device acceptance test. Activity actions that were already pruned before v79 are not recoverable. The existing report-specific filter definitions and calculation models were not expanded as part of this task.


### ALISHAN-CHG-2026-11-08-003 — v80 Reports runtime and pagination styling corrections
- **Type:** Bug fix (Report Page runtime + mobile overview layout + shared pagination presentation).
- **Status:** `IMPLEMENTED — NOT VERIFIED` until all checks below pass.
- **User-reported v79 defects:** `Reports: cards failed` / `TypeError`; Added This Week overview card occupied the full row on mobile; Reports pagination did not visually match Inventory.
- **Root cause:** The six-card Report overview had removed the Aging Stock overview DOM nodes, but the legacy `updateDashboard()` still attempted to write to `agingItems`, `agingLabel` and `agingBreakdown`, causing a null-element TypeError. The mobile stylesheet still applied the old four-card Reports rule that made card 3 span the full row. The old inline `.pagination-controls` styles in `reports.html` had equal/later cascade priority and overrode the shared pagination module's Inventory-based shell.
- **Fix:** Removed only the obsolete Aging Stock overview DOM writes; the separate Aging Report remains untouched. The six Report overview cards now use two equal columns on mobile and no card is forced full-width. The shared pagination base selector is now `.pagination-controls.common-pagination`, so the shared Inventory design wins over legacy page styles.
- **Files changed:** `frontend/reports.html`, `frontend/mobile.css`, `frontend/common-pagination.css`, `frontend/sw.js` (cache v11), `PROJECT_SOURCE_OF_TRUTH.md`.
- **Data/calculation impact:** None. Existing report data, calculations, filters, payment flows, and Inventory pagination behavior are unchanged.
- **Verification required:** Run JS syntax checks, HTML/script reference checks, CSS checks, then open Reports and Inventory in Chromium at 390 / 360 / 320 px; confirm no `Reports: cards failed` error, all six overview cards are two-per-row, report result pagination matches Inventory, page navigation/page-size changes work, and Inventory pagination is unchanged.
- **Known limitations:** Until the browser and real-data checks pass, status remains `IMPLEMENTED — NOT VERIFIED`.


### ALISHAN-CHG-2026-11-08-004 — Reports focus, one-line pagination, and Settings usability

- **Type:** Changed feature + usability improvements.
- **Status:** `IMPLEMENTED — NOT VERIFIED`. Related pending item: `ALISHAN-PEND-2026-11-08-009`.
- **User requirement:** Keep every pagination row on one line like Inventory; move Reports home filters above the report cards; when a report card is selected show only that report; separate the old Amount Received History, Weekly Amount Received and Select Week sections into clear cards that are closed initially; add pagination to long existing report lists; update Help & User Guide for current features; make Data & Backup easier to understand and operate.
- **Previous behavior / problem:** Reports had global filters after the report cards; the selected report view left the report-card home visible; old report sections appeared as one long expanded block; Payment History and Weekly Amount Received used a growing Show More pattern or no visible pagination; the shared pagination component could wrap controls on narrow screens; the guide did not explain the latest report, export, history and backup workflows in sufficient detail.
- **After:**
  - Reports home filters are before the report cards. Selecting a report hides the card home and opens only that report. A Back to Reports control returns to the home. This explicitly supersedes the v79 presentation decision that report cards remain visible while a report is open; no report data or report definitions are removed.
  - Payment Report's Amount Received History, Select Week, and Weekly Amount Received are individual collapsed accordion cards. Other legacy sections (Pending Amount Receival, Inventory Valuation Details, Inventory Aging Details) are also collapsed cards.
  - Pending Amount, Amount Received History, and Weekly Amount Received legacy lists use Common Pagination with independent page/page-size state. Search/filter refresh resets their page to 1.
  - Common Pagination stays in a single horizontal row. On narrow phones it can scroll horizontally; controls do not wrap into multiple rows. The shared component remains used by Inventory and Reports.
  - Help & User Guide now covers Dashboard, Inventory, Pending Amount, Missing Lot Number, Reports, Payment Report sub-sections, Quality History, Export Center formats and ZIP restore, Data & Backup, mobile layouts and pagination. Existing guide content was corrected where the quantity display wording was inaccurate.
  - Data & Backup now shows current quality/payment counts and latest local backup date/type, labels backup types, allows local backup when either quality or payment records exist, saves a safety copy if either current dataset exists before restore, disables restore when no valid local backup exists, and provides a Refresh Storage Usage action plus a direct link back to Home for the complete ZIP Export Center.
- **Impact:** Presentation, navigation and local backup UI only. No quantity, amount, payment validation, week calculation, record schema or business calculation changed. Local restore continues to replace quality/payment stores after confirmation; portable complete ZIP remains handled by Home Export Center.
- **Files changed:** `frontend/reports.html`, `frontend/report-views.js`, `frontend/reports.css`, `frontend/common-pagination.css`, `frontend/mobile.css`, `frontend/setting.html`, `frontend/settings-data-backup.js`, `PROJECT_SOURCE_OF_TRUTH.md`, `frontend/sw.js` (cache version).
- **Tests actually run:** Node syntax checks for every frontend JavaScript file; extracted inline Reports script syntax check; HTML parse and duplicate-ID checks for Reports and Settings; CSS brace-balance checks; source assertions for one-line pagination, report-home hiding, filter ordering, collapsed section markup, and guide topic count. ZIP integrity check is run after packaging.
- **Not yet tested:** Real browser interactions, actual datasets exceeding page size in each legacy report section, visual overflow at 390 / 360 / 320 px, browser storage API behavior, automatic backup scheduling across page navigation, manual backup/restore round trip, ZIP export/restore hand-off.
- **Known limitations:** Browser automatic backups cannot run while the app/browser is fully closed; the schedule is applied by app initialization while the app is active. The Settings local backup covers quality/payment records only; use the Export Center's complete ZIP for history, activity and settings.
- **Related pending item:** `ALISHAN-PEND-2026-11-08-009`.


### ALISHAN-CHG-2026-11-08-005 — Compact shared pagination and focused Report view

- **Type:** Fix (responsive pagination width + Report view focus).
- **Status:** `IMPLEMENTED — NOT VERIFIED`. Related pending item: `ALISHAN-PEND-2026-11-08-010`.
- **User requirement:** Make Report Previous/Next buttons as compact as Inventory so Previous is never clipped and the pagination row does not require horizontal scrolling. When a report card is selected, hide preview/dashboard cards and the report-card chooser; keep Search and global filters visible above the selected report content.
- **Before:** Reports pagination inherited wide button sizing and an overflow-scroll row; at phone width the Previous button could be partly hidden. The selected-report CSS hid all `.rp-home-only` elements, including the global filters, while dashboard preview cards were not explicitly hidden by selected-view state.
- **After:** The shared pagination stylesheet gives Previous/Next explicit compact auto widths, removes inherited minimum widths from page information, fixes the page-size selector width, and keeps the four controls on one line without horizontal scrolling at 320px and above. Selected-report mode hides only `.dashboard-cards` and `#reportHome`; search and global filter controls remain visible before the report detail.
- **Reason:** The shared pagination component should have the same compact behavior in every page, and a report detail should be the only report content shown after the search/filter controls.
- **Impact:** UI only. No calculations, saved records, payments, filtering logic, or pagination state logic changed. Both Inventory and Reports continue to use `CommonPagination`.
- **Files changed:** `frontend/common-pagination.css`, `frontend/reports.css`, `frontend/sw.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Tests actually run:** `node --check` passed for every `frontend/*.js`; `reports.html` parsed with no duplicate IDs; combined pagination/report CSS brace-balance check passed; source assertions confirmed filter controls precede report results, selected-report mode hides dashboard/report preview cards without hiding global search/filter controls, and compact pagination rules disable horizontal overflow. ZIP integrity check passed after packaging.
- **Browser/runtime attempt:** Headless Chromium was launched against a local HTTP server, but the browser process timed out before producing a usable DOM/render result; this is not counted as a browser test pass.
- **Not yet tested:** Actual browser layout at 390 / 360 / 320px, Android browser rendering, and long real-data lists.

### ALISHAN-CHG-2026-11-09-001 — v82 pagination and Reports test audit
- **Type:** Verification / documentation-only change.
- **Status:** `IMPLEMENTED — NOT VERIFIED`. Related pending item: `ALISHAN-PEND-2026-11-08-010`.
- **Reason:** Begin the agreed stability pass before adding features or declaring a final release.
- **Scope:** Test the existing v82 shared pagination and Reports filter/view implementation. No application code, styles, calculations, storage, or business data were changed in this audit.
- **Tests actually run:**
  - **PASS:** `node --check` for `common-pagination.js`, `report-engine.js`, `report-views.js`, and `inventory.js`.
  - **PASS:** CommonPagination logic harness using the actual `common-pagination.js`: 10/20/50/100 page-size options; correct page count; Previous/Next callbacks; page-size callback; pagination hidden when total records do not exceed page size.
  - **PASS (synthetic test records only):** Actual `calc.js` exact-match filter function connected to `ReportEngine.scopeItems`: Lot `5` does not match Lot `55`; colour selection; date range; amount range.
  - **PASS:** Source assertions: Reports Search precedes report home; selected report filters precede result summary; selected-view CSS hides dashboard preview and report chooser without using the old broad `.rp-home-only` hide rule; Inventory and Reports both reference `CommonPagination`; 768px and 340px responsive CSS breakpoints are present.
  - **PASS:** Local HTTP server served `reports.html`, `inventory.html`, and `common-pagination.js` with HTTP 200.
  - **FAIL / ENVIRONMENT BLOCKER:** Headless Chromium did not produce a DOM or screenshot before timeout (tested with two launch configurations). This is not evidence of a layout defect, but it means visual browser verification could not be completed here.
  - **NOT RUN:** Real browser visual checks at 390px, 360px and 320px; Android Chrome / actual device; click-through of selected report view in a browser; Inventory and Reports pagination with actual saved records; all report-specific filters against the user's actual stored data; long result sets beyond one page; previous/next visual clipping at each target width.
- **Important test boundary:** The ReportEngine checks used synthetic fixtures, not the owner's actual IndexedDB records. They verify filter plumbing and exact-match behaviour only; they do not count as real-data acceptance tests.
- **Result / status decision:** No reproducible clipping defect was confirmed or ruled out because the browser renderer could not run. Do not mark v82 or the Report/Pagination work `COMPLETED`. Keep `ALISHAN-PEND-2026-11-08-010` as `IMPLEMENTED — NOT VERIFIED`.
- **Next verification:** Open the delivered v83 project in a functioning browser/device. At 390 / 360 / 320px compare Inventory and Reports pagination, test Previous / Next and all page sizes, open each Report and verify search/filter order and visibility, then repeat the filters and pagination with actual saved records. Append every discovered fix and its test evidence before release.
- **Files changed in this audit:** `PROJECT_SOURCE_OF_TRUTH.md` only. No application source changed.



### ALISHAN-CHG-2026-11-09-002 — Responsive shared pagination and repeatable regression tests
- **Type:** Bug fix + test infrastructure.
- **Status:** `IMPLEMENTED — STATIC TESTS PASSED; BROWSER NOT VERIFIED`. Related pending item: `ALISHAN-PEND-2026-11-08-010`.
- **Problem found in v83:** The shared pagination CSS and Inventory mobile overrides could clip or horizontally scroll controls. The Previous/Next labels consumed scarce width at 320–380px. The shared component also lacked explicit navigation semantics and a polite live announcement for page changes. The prior audit's tests were documented but not retained as runnable project tests.
- **Before:** Controls used a nowrap row with overflow clipping/scrolling depending on stylesheet precedence. On narrow phones, text labels competed with the page indicator and page-size selector. No repository-owned regression test file existed for the shared component.
- **After:**
  - `common-pagination.css` now keeps the row visible without `overflow-x: hidden`, `auto` or `scroll`. At widths up to 380px the Previous/Next text labels are hidden while their accessible names and icons remain; fixed compact icon buttons and a 72px page-size selector preserve room for the page indicator. At 381–420px controls use tighter spacing and sizing.
  - `common-pagination.js` adds navigation role/label, accessible button names, decorative-icon hiding, a polite live page indicator, safe callback guards and bounded page transitions. Existing Inventory and Reports callbacks and page-size choices remain unchanged.
  - Added `tests/common-pagination.test.js`, runnable with `node --test tests/common-pagination.test.js`. It covers page-size options, accessibility markup, page clamping, Previous/Next boundaries, invalid page-size input, hidden single-page state and responsive CSS safeguards.
  - Service Worker cache version changed from v13 to v14 so installed clients can fetch the updated shared pagination assets.
  - README test instructions and this append-only change history were updated.
- **Impact:** Shared pagination presentation/accessibility and test coverage only. No report calculations, inventory calculations, stored records, payments, filters, or business rules were changed.
- **Files changed:** `frontend/common-pagination.js`, `frontend/common-pagination.css`, `frontend/sw.js`, `tests/common-pagination.test.js`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Tests actually run:** Node built-in regression tests; JavaScript syntax checks for all frontend scripts; HTML parse/duplicate-ID checks for Reports and Inventory; CSS brace balance; source checks that Inventory and Reports both use CommonPagination; ZIP integrity.
- **Not tested:** Actual Android Chrome / physical device rendering at 390 / 360 / 320px; real IndexedDB records; browser click-through of every report; actual list datasets exceeding one page. This environment did not provide a successful browser-rendering run, so no visual browser pass is claimed.
- **Known limitation:** At narrow widths the Previous/Next text is visually replaced by chevron icons. Screen readers retain the full accessible names, and the buttons retain title text.


### ALISHAN-CHG-2026-11-09-003 — Tablet and desktop responsive enhancement

- **Type:** Responsive UI enhancement.
- **Status:** `IMPLEMENTED — STATIC CHECKS PENDING BROWSER VERIFICATION`.
- **Locked user decisions:** Desktop uses a left navigation sidebar; information density is balanced. Phone layout must remain unchanged. Tablet and desktop may be visually larger and show more information, but the same features must remain on their existing pages. A small number of useful desktop/tablet-only additions are allowed.
- **User clarification:** Existing phone layout and workflows are the reference. Do not move features between pages. Export Data, Import Data and Bulk Import remain in Dashboard → Quick Actions, as on phone. Inventory may gain an additional overview section on tablet/desktop even though the phone Inventory page has no overview cards.
- **Before:** Shared navigation used a horizontal top tab row outside phone widths. The Inventory page began with its heading and search area and did not provide a summary overview. Desktop/tablet sizing and information density were not unified across the main pages.
- **After:** Added `frontend/responsive-layout.css`, loaded after the existing page styles on Dashboard, Inventory, Reports and Settings. At widths above 768px it provides a fixed left navigation rail, larger readable typography and controls, balanced page spacing, wider report cards/tiles, and tablet/desktop grids. Narrow tablets use an icon-only navigation rail; larger desktop widths show labelled navigation. Existing mobile CSS remains the sole layout authority at 768px and below. Added a tablet/desktop-only Inventory Overview with Total Items, Total Inventory Value, In Stock Items and Aging Stock, populated by the existing `AlishanStore.summary()` values through the existing `updateDashboard()` routine.
- **Feature placement:** No feature was moved. Dashboard Quick Actions continue to contain Export Data, Import Data and Bulk Import. The Inventory page retains its existing search, item list, filters, pagination and import/export entry points. Reports and Settings retain their existing sections and actions.
- **Data/calculation impact:** None intended. The new Inventory overview reads the same summary object already used by Inventory's existing dashboard update function. No database schema, records, calculations, filters, pagination state or business rules were changed.
- **Phone protection:** All new responsive layout rules are inside `@media (min-width: 769px)`. The Inventory overview has the `desktop-tablet-only` class and is hidden by default, shown only within that same tablet/desktop media query. Existing `mobile.css` and phone navigation markup are not edited.
- **Service Worker:** Cache version bumped from v14 to v15 and `responsive-layout.css` added to the app shell.
- **Files changed:** `frontend/responsive-layout.css` (new), `frontend/index.html`, `frontend/inventory.html`, `frontend/reports.html`, `frontend/setting.html`, `frontend/sw.js`, `tests/responsive-layout.test.js` (new), `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`. `inventory.js` was not changed; its existing `updateDashboard()` already fills the overview IDs from `AlishanStore.summary()`.
- **Tests actually run:** `node --check` for every `frontend/*.js`; `node --test tests/common-pagination.test.js` (6/6 passed); `node --test tests/responsive-layout.test.js` (5/5 passed); HTML duplicate-ID and stylesheet-reference checks for all four primary pages; CSS brace checks; source assertions for phone-hidden-by-default overview, existing Inventory summary IDs, Dashboard Quick Actions placement and Service Worker v15.
- **Browser verification:** A local headless Chromium screenshot attempt timed out before producing a rendered page. This is an environment limitation, not a visual pass. Actual browser/device rendering remains pending at 390px, 768px, 820px, 1024px, 1280px, 1440px and 1920px.


### ALISHAN-CHG-2026-11-09-004 — Match tablet/desktop quality-card colours to phone palette

- **Type:** Visual consistency fix.
- **Status:** `IMPLEMENTED — STATIC CHECKS PASSED; BROWSER NOT VERIFIED`.
- **User requirement:** Quality cards on tablet and desktop should use the same restrained theme colours already used on the phone, rather than strong product-type-specific colours.
- **Before:** Desktop/tablet quality cards inherited vivid BRA/PANTY/SET/BLOUSE gradient headers (purple, pink, teal and orange), white header text and bright chips. The phone intentionally suppresses these gradients and uses theme-based neutral surfaces, readable text and a slim aging-status rail.
- **After:** At widths above 768px, quality-card headers, names, chips, type badges, icon surfaces and expand controls now use the active app theme tokens, matching the phone palette. The large product-type gradients are removed on tablet/desktop. Aging status remains communicated by the same slim coloured left rail used on phone. Card layout, size, content and interactions are unchanged.
- **Phone protection:** No phone CSS or phone breakpoint was changed. All new overrides are scoped to `@media (min-width: 769px)`.
- **Files changed:** `frontend/responsive-layout.css`, `frontend/sw.js` (cache v16), `tests/responsive-layout.test.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Tests actually run:** `node --test tests/responsive-layout.test.js` (6/6 passed); `node --test tests/common-pagination.test.js` (6/6 passed); `node --check` for every `frontend/*.js`; CSS brace-balance check; ZIP integrity check after packaging.
- **Not yet tested:** Actual browser rendering across all saved themes and real device widths.


### ALISHAN-CHG-2026-11-09-005 — Replace tablet/desktop sidebar with topbar and restore two-column quality cards

- **Type:** Responsive layout correction.
- **Status:** `IMPLEMENTED — STATIC TESTS PASSED; BROWSER NOT VERIFIED`.
- **User requirement:** Remove the tablet/desktop left sidebar because it consumes too much horizontal space; use a horizontal topbar instead. Quality cards must remain two per row and must not be reduced to one or expanded to three per row.
- **Before:** The v85/v86 responsive stylesheet converted the shared navigation bar into a fixed left sidebar. This reduced the content width. It also changed Inventory quality cards to one column on narrow tablets and three columns on wide desktop screens, making the cards appear inconsistent and smaller than requested.
- **After:** At widths from 769px upward, the shared navigation is now a full-width, fixed horizontal topbar with the ALISHAN logo and existing Dashboard, Inventory, Reports and Settings links in one row. The page content no longer reserves any left-side navigation width and starts below the 66px topbar. Quality cards use exactly two equal-width columns at every tablet and desktop width, with a larger gap, roomier card header padding and readable content typography. The old breakpoint rules are intentionally superseded by the final two-column override.
- **Phone protection:** All new overrides are inside `@media (min-width: 769px)`. No phone navigation markup, `mobile.css`, or phone styles were changed.
- **Feature/data impact:** Navigation destinations and feature locations remain the same. No data, calculations, business logic, filters, pagination, or storage behavior changed. Settings' own in-page category navigation is not the global left rail and remains unchanged.
- **Service Worker:** Cache version bumped from v16 to v17 so clients refresh the updated responsive stylesheet.
- **Files changed:** `frontend/responsive-layout.css`, `frontend/sw.js`, `tests/responsive-layout.test.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Tests actually run:** `node --test tests/responsive-layout.test.js tests/common-pagination.test.js`; `node --check` for all `frontend/*.js`; CSS brace-balance check; ZIP integrity check after packaging.
- **Not yet tested:** Actual browser rendering and device verification at 769px, 820px, 1024px, 1280px, 1440px and 1920px; visual confirmation of topbar fit at all tablet widths; real Inventory card content with long quality names. No browser visual pass is claimed.


### ALISHAN-CHG-2026-11-09-006 — One quality card per row and remove separate action-panel background

- **Type:** Inventory quality-card layout and visual cleanup.
- **Status:** `IMPLEMENTED — STATIC TESTS PENDING BROWSER VERIFICATION`.
- **User requirement:** Show only one quality card in each row. Remove the separate white background visible behind the Edit / Delete / Complete / Total Amount action section.
- **Before:** v87 used two quality-card columns at tablet and desktop widths. The expanded card's action footer inherited a gradient footer surface and the nested `.card-actions` wrapper had its own white background and border, making the controls look like a separate white panel inside the quality card.
- **After:** At widths above 768px, Inventory quality cards now occupy one full-width column. The expanded action footer blends into the card surface; the nested action wrapper has a transparent background, no separate border and no separate panel shadow. The action buttons, labels, order, click handlers and total amount remain unchanged.
- **Phone protection:** No phone CSS or phone breakpoint was changed. Existing phone layout remains controlled by `mobile.css`; the new rules are scoped to `@media (min-width: 769px)`.
- **Data/behavior impact:** None. No data, calculations, storage, filters, pagination, or action behavior changed.
- **Service Worker:** Cache version bumped from v17 to v18.
- **Files changed:** `frontend/responsive-layout.css`, `frontend/sw.js`, `tests/responsive-layout.test.js`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Tests actually run:** `node --test tests/responsive-layout.test.js tests/common-pagination.test.js` (15/15 passed); `node --check` for all frontend JavaScript files; CSS brace-balance check; ZIP integrity check after packaging.
- **Not yet tested:** Actual browser rendering on tablet and desktop, including expanded cards in the user's active theme. No visual browser pass is claimed.


### ALISHAN-CHG-2026-11-09-007 — Expand User Guide into a visual learning centre and synchronize release version

- **Type:** Documentation / in-app Help Centre enhancement.
- **Status:** `IMPLEMENTED — STATIC CHECKS PENDING BROWSER VERIFICATION`.
- **User requirement:** Explain all proposed User Guide improvements in more detail; teach workflows using methods beyond plain text; and make it mandatory that the User Guide version matches the latest app version.
- **Before:** The in-app guide contained 21 expandable topics with mostly text instructions. Its footer incorrectly showed `Guide version: v81` while the app was at v88. It had no complete workflow map, no expand/collapse-all controls, and no formal release synchronization standard.
- **After:** The guide now identifies itself as a visual learning centre. It includes five workflow learning paths, schematic process diagrams, expand/collapse-all controls, clearer search result counts, and eight additional detailed topics (22–29): complete quality entry, quantity/dozen/amount calculation, payment workflow, report selection guide, master data/colour/size guide, practical search examples, safe troubleshooting and glossary. Existing 21 topics remain in place. The footer now shows App v89, User Guide v89 and last verified date 09 Nov 2026.
- **Teaching formats:** CSS-based flow diagrams, decision guidance, calculation examples, report comparison grid, workflow checklist and glossary were added. Diagrams are explicitly labelled as schematics; no fabricated app screenshots were added. Actual annotated screenshots remain a future enhancement requiring capture from the running v89 app.
- **Accuracy checks:** Quantity and amount examples were checked against `frontend/calc.js` (12 pieces per dozen; amount = total dozens × saved price per dozen; fractional dozens retained). Payment instructions were checked against `frontend/store.js` and `frontend/calc.js` (positive amount, required date, amount cannot exceed pending). Report descriptions/date semantics were checked against `frontend/report-views.js`. Entry fields and same/different-size modes were checked against `frontend/add-entry.html`.
- **Version policy:** Added a locked `User Guide & Documentation Standards` section to this document. Every release must audit the guide, update stale instructions/visuals, match app and guide version, show last verification date, and treat a mismatch as a release defect. History remains append-only.
- **Service Worker:** Bumped cache version from v18 to v19 and added `user-guide.js` to the app-shell precache list.
- **Files changed:** `frontend/setting.html`, `frontend/setting.css`, `frontend/user-guide.js`, `frontend/sw.js`, `tests/user-guide.test.js`, `tests/responsive-layout.test.js` (updated cache-version expectations), `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Data/business logic:** No inventory, payment, quantity, amount, report calculation, database or storage logic was changed.
- **Tests actually run:** `node --check` for every `frontend/*.js`; `node --test tests/*.test.js` (21/21 passed); HTML parse with 29 guide topics, no duplicate IDs and all five learning-path anchors resolving; local setting-page script/style reference check; CSS brace-balance check; User Guide version-match assertions; Service Worker v19 and guide-script precache assertions. ZIP integrity is checked after packaging.
- **Browser verification:** Not yet performed. Actual rendering, anchor navigation, expand/collapse controls, search behavior and diagram fit still need browser checks at phone, tablet and desktop widths.


### ALISHAN-CHG-2026-11-10-001 — Add 42 individual app screenshots to the Visual Learning Center

- **Type:** Documentation / visual learning enhancement.
- **Status:** `IMPLEMENTED — STATIC CHECKS PENDING BROWSER VERIFICATION`.
- **User requirement:** Extract screenshots from the supplied `ALISHAN Complete App Screenshots Manual (1).pdf` and use each screenshot separately in the relevant User Guide topic, rather than displaying the PDF pages as combined images.
- **Before:** v89 contained schematic workflow diagrams and text instructions, but no individual app-screen references. Users could not visually identify the real screen or compare the guide with the supplied app captures.
- **After:** Extracted all 42 embedded screen images from the 21-page PDF into separate PNG files under `frontend/assets/user-guide/`. Each image has its own screen number, descriptive caption, alt text, lazy loading and a link to open the full-size original. The 42 images are placed in the relevant existing guide topics (dashboard, inventory, status, filters, sorting, reports, payments, backup/restore, settings, bulk import, entry, calculations and analytics).
- **Mobile presentation:** Screenshot galleries become horizontal swipe galleries on narrow screens, with one readable screenshot card at a time. Wider screens show a two-column gallery. Images preserve their portrait aspect ratio and are not cropped.
- **Accuracy boundary:** These are screenshots extracted from the user's supplied reference PDF, not newly captured live browser screenshots. They are visual references; if a later app release changes a screen, its image and caption must be re-verified or replaced. The guide does not claim that the PDF proves every shown feature is currently available in every build.
- **Version synchronization:** App version and User Guide version now both show v90, last verified 10 Nov 2026. The release version rule remains mandatory.
- **Service Worker:** Bumped cache version from v19 to v20 and added all 42 screenshot assets to the app-shell precache list so the guide images can load offline after installation.
- **Files changed:** `frontend/setting.html`, `frontend/setting.css`, `frontend/sw.js`, `frontend/assets/user-guide/screen-01.png` through `screen-42.png`, `tests/user-guide.test.js`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`.
- **Data/business logic:** No inventory, payment, quantity, amount, report, database, IndexedDB or business workflow logic was changed.
- **Tests actually run:** `node --test tests/*.test.js` (22/22 passed); `node --check` for every `frontend/*.js`; 29 topic count; 42 separate image assets and 42 guide references; image dimensions checked; App/User Guide v90 match; all 42 images listed in SW v20 precache; CSS brace balance; ZIP integrity after packaging.
- **Browser verification:** Not performed in this environment. Actual phone/tablet/desktop rendering, swipe behavior, full-size image opening and offline image loading remain to be checked in a real browser.

### ALISHAN-CHG-2026-11-11-001 — Restore v86–v89 Version log rows and make the Version log compulsory

- **Type:** Fix (documentation) + new rule + new automated test.
- **Status:** `IMPLEMENTED — STATIC CHECKS PASSED` (no browser needed; no screen changed except the version text in the User Guide footer).
- **User requirement:** The Version log must contain v86–v89 (they were missing between v85 and v90) and maintaining the log must be compulsory, always.
- **Before:** The log jumped from v85 to v90. Rule 8 already required a log line with every ZIP, but nothing checked it, so it was skipped. A second ZIP also called v90 existed on a separate branch and was not mentioned.
- **After:**
  - Rows v86, v87, v88, v89 restored word for word from the earlier v90 source (their change records `ALISHAN-CHG-2026-11-09-004` to `-007` were already present in this file).
  - Row v91 added. A note after the table records the two ZIPs named v90 and what the other one contains; nothing was deleted.
  - Rule 10 added to section 0 and section 17 added to `AI_HANDOVER_PROTOCOL.md` (the Version log is compulsory).
  - New `tests/version-log.test.js`: rows are consecutive, each row has a matching ZIP name / date / change ID / summary, every change ID exists in this file, and the latest row equals the version in `README.md` and the User Guide footer.
  - `tests/user-guide.test.js` now takes the expected version from the latest log row instead of a hard-coded number, so a release cannot be forgotten in one place only.
  - App / User Guide / README now say v91, last verified 11 Nov 2026.
- **Not changed:** calculations, stored data, any page layout, service worker, screenshots, Add Entry field order (still Product Type → Cup Size → Quality Name in this lineage; see the note on the other v90).
- **Files changed:** `PROJECT_SOURCE_OF_TRUTH.md`, `AI_HANDOVER_PROTOCOL.md`, `README.md`, `frontend/setting.html`, `tests/user-guide.test.js`, `tests/version-log.test.js` (new).

### ALISHAN-CHG-2026-11-11-002 — Size Groups (one size system for New Entry, Edit and cards) + sizes 48 and 50

- **Type:** New feature + change of how sizes are entered/shown (storage format NOT changed).
- **Status:** `IMPLEMENTED — TESTED IN HEADLESS CHROMIUM (390/360/320/768/1280 px)`; not tried on a real phone.
- **User requirement:** One system with full authority in New Entry, in Edit and after saving: one card with all colours; a colour whose sizes change must not push every other colour into its own size card; sizes 48 and 50 added and matching everywhere in the app.
- **Before:** An entry was either "same sizes" (one grid) or "different sizes" (one card per colour). Changing one colour in Edit meant switching the whole entry to "different", so every colour got its own card and the entry could not go back to "same".
- **After:**
  - `frontend/size-groups.js` (new): colours are put into groups, every group has one size grid. New colours join the first group. ⇄ on a colour: **New group** (sizes copied, then edited) or **Move to Group N**. Typed values stay when groups change. A note appears when two groups have exactly the same sizes.
  - On save the groups become the two existing shapes: one group → `sizeOption: 'same'` (`colors` + one `sizes`); several groups → `sizeOption: 'different'` (`colorSizes`). Groups with exactly the same sizes are joined first (12 pieces = 1 dozen counts as equal), so an entry whose colours all match is always saved as 'same'. `calc.js` quantity/total/price code, backup, export and history are unchanged.
  - Opening an old entry: 'same' → one group; 'different' → colours with equal sizes are grouped, others get their own group. Nothing is converted in storage until the entry is saved again.
  - Inventory/Home card (`calc.js` `describeItem().groups`, `item-card.js`): in a 'different' entry, colours with the same sizes share one table, e.g. "MOKA · RAMA-GREEN - EACH: 6 · TOTAL: 12 DOZENS". The mobile Large view follows the groups.
  - Sizes: `SIZES` in `calc.js` is now 28…46, 48, 50 (12 sizes). Every page, the Edit window, Bulk Import review, export and backup read `SIZES`, so they follow; the AI prompt and import messages list 48 and 50. Old entries have no 48/50 values and count as 0.
  - Size grid fix: 4 columns now shrink (`minmax(0, 1fr)`); before, the last column could be pushed outside its box on desktop.
  - `SizeGroups` added to the loader table (`db.js`), the page script lists and the service worker (`size-groups.js`, cache `v21`). `dashboard.js` and `item-modal.js` lost the old per-colour card code; User Guide text updated.
- **Not changed:** Bulk Import JSON format (CASE A "same" / CASE B "different" still works as before), prices, payments, lot numbers, history, the Add Entry field order (Product Type → Cup Size → Quality Name in this lineage), User Guide screenshots (they still show the old size section — to be re-taken).
- **Tests:** new `tests/size-groups.test.js` (14 tests: group rules, 48/50 maths, old entries, card grouping); the service-worker and User Guide tests now accept any `v2x` cache version.
- **Files changed:** `frontend/size-groups.js` (new), `calc.js`, `item-card.js`, `item-modal.js`, `dashboard.js`, `db.js`, `inventory.js`, `item-form.css`, `sw.js`, `add-entry.html`, `index.html`, `inventory.html`, `reports.html`, `quality-history.html`, `setting.html`, `ARCHITECTURE.md`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`, tests.

### ALISHAN-CHG-2026-11-11-003 — New header, logo and app icon; User Guide made user-friendly; User Guide made compulsory

- **Type:** UI change + documentation + new rule + new tests (no change to data, calculations or stored formats).
- **Status:** `IMPLEMENTED — TESTED IN HEADLESS CHROMIUM` (all 19 themes, 320–1280 px); not tried on a real phone or in the installed app (the new home-screen icon needs the app to be removed/re-added on some phones).
- **User requirements:** (1) make the User Guide better and easier to understand; (2) write in the md files that a new feature MUST be added to the User Guide; (3) the guide footer text that was written for developers is not for the user — fix it; (4) the app header must be more unique, with good colours that change with the theme, text never the same colour as the background, a better font, a new logo and a new app icon.
- **Header / logo / icon:**
  - `nav.css`: gradient bar + 3 px accent stripe on top, logo = rounded accent square with a hanger-shaped "A" (hook, two legs, bar) + wordmark ALISHAN with a small INVENTORY line. The font is "Alishan Sans" = Inter 600/700/800, Latin subset, bundled in `frontend/fonts/` (SIL OFL licence file included), used in the header only.
  - Every theme has its own palette at the end of `nav.css` ("HEADER COLOURS PER THEME"): gradient a→b, text, accent, logo ink, mobile-menu colour. Light themes get a deep brand-colour header (white text), dark themes a dark gradient with a bright accent. `tests/header-theme.test.js` fails if text/accent/logo ink are too close to the background (text ≥ 6.5:1, dim tab text ≥ 4.5:1, accent ≥ 2.8:1, logo ink ≥ 4.5:1) or if two themes share a palette.
  - `theme-boot.js`: the browser/status-bar colour (`theme-color`) is set from the theme's header colour; `manifest.webmanifest` theme colour is the default indigo `#1f2470`.
  - All 9 pages use the same logo markup (inline SVG, no image request) and a `favicon.svg` link; `apple-touch-icon-180.png` replaces the 192 px image for iOS. New `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`, `favicon.svg`, `logo.svg` (hanger-A on an indigo→violet gradient, amber hook and bar).
  - Service worker cache `v22`: precaches the fonts, new icons and the 5 new guide screenshots.
- **User Guide (`frontend/setting.html`, styles in `setting.css`):** intro rewritten; new **Quick Start** (5 steps + the 3 daily jobs); topic 2 rewritten as clear numbered steps with an example; new topic **2A. Size Groups** (flow diagram, worked example, steps, rules, 3 questions-and-answers, screens 43–46); topics 10, 21, 26, 28 and the glossary updated; new topic **30. Naya kya hai?** (v93, v92); heading "Visual reference — actual app screen" became "App ki screen (example)"; **the footer is now written for the user** (the developer text — supplied manual, 42 screenshots, audit, mandatory — was removed from the app and lives here and in protocol section 18 instead); screen 47 shows the header in four themes. Bulk Import wording is unchanged because its review screen still has its own same/different choice.
- **Rule:** section 0 rule 11 and `AI_HANDOVER_PROTOCOL.md` section 18 — a feature is not finished until it is in the User Guide; checked in part by `tests/user-guide.test.js` (What's-new entry for the latest version, footer version, no developer wording, screenshots numbered without gaps and precached).
- **Not changed:** the old screenshots 01–42 (taken before v92/v93; where they show the old size section or the old header, the text next to them points to topic 2A) — to be retaken from the real app; Add Entry field order; Bulk Import.
- **Files changed:** `nav.css`, `theme-boot.js`, `manifest.webmanifest`, `sw.js`, `setting.html`, `setting.css`, all other `*.html` pages (logo, favicon, icon links, theme colour), `icons/*`, `fonts/*` (new), `assets/user-guide/screen-43…47.png` (new), `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`, `AI_HANDOVER_PROTOCOL.md`, tests.

### ALISHAN-CHG-2026-11-13-001 — Edit fix for qualities missing from qualities.json, price option in Edit, colour cards in grouped size tables

- **Type:** Bug fix + new Edit option + card display change (no change to the stored data format).
- **Status:** `IMPLEMENTED — TESTED IN HEADLESS CHROMIUM`; not tried on the owner's real data or phone.
- **Investigation (user: "two qualities cannot be edited — is the name missing in qualities.json, or the rate?"):** The real data was not available, so the cause was reproduced. The Edit window fills the quality through a hidden `<select>` that is built only from `qualities.json` for the entry's PRODUCT TYPE. An entry whose saved quality is not in that list (renamed, removed, typo, or listed under another product type, e.g. made by Bulk Import with a price typed from paper) left the select empty, the browser blocked the form (`required` on a hidden select) and **Update did nothing, with no message**. A missing price is NOT the cause (the entry keeps its own saved price). All 117 qualities in `qualities.json` have a price above 0, no name is repeated under two product types and no name has stray spaces or lower-case letters. How to find the two entries on the owner's data: open each one — the "Selected" line says "(not in qualities.json, or its price is not set)" — or compare the quality names on the Inventory page with `qualities.json`.
- **Fix:** `item-form.js` `setQualitySilently` adds the saved quality as an extra choice of the hidden select, so such entries open and save normally. The label tells the user that the quality is not in `qualities.json`.
- **Price in Edit (`item-modal.js`, `calc.js`):** new box "Price per dozen (₹)" (filled with the entry's saved price). The hint shows the app price of the selected quality; a different price shows "Use app price"; for a quality without a price in `qualities.json` it says to type the price. Picking another quality in the Edit window fills that quality's app price (still editable). `buildUpdatedItem`: a typed price wins (rounded to 2 decimals, must be above 0, else "The price must be a number above 0."); an empty box keeps the saved price for an unchanged quality, else the quality price (the old rule). The amount follows the price (`applyTotals`). `qualitySnapshot` (`store.js`) now contains "Price / Dozen (₹)", so a price change is written to the Quality History.
- **Colour cards (`item-card.js`, `item-card.css`):** in the Inventory/Home card, a size table that is shared by two or more colours (a Size Group, `describeItem().groups`) shows every colour as its own small card in its own colours from `colours.json` (the same `color-<name>` classes as the COLORS row), on a neutral header made from theme variables, so it fits all 19 themes; below the cards: `EACH … · TOTAL … DOZENS`. Tables with ONE colour keep the old header, and plain "same sizes" cards (the COLORS row + one grid) are unchanged. The Large view title is unchanged.
- **Known data note:** a few colours in `colours.json` have a light text colour on a pale background (e.g. RAMA-GREEN, L-COFFEE), which is hard to read in every place that shows them; the data was not changed.
- **Not changed (waiting for the owner):** the new brand logo files (butterfly-A in rose gold on burgundy) — none of the three images has real transparency, see the handover answer; the Archive for deleted qualities with permanent delete — needs the owner's answer on what "no shadow" must remove.
- **Files changed:** `item-form.js`, `item-modal.js`, `calc.js`, `store.js`, `item-card.js`, `item-card.css`, `item-form.css`, `sw.js` (v23), `setting.html`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`, `tests/edit-price.test.js` (new).

### ALISHAN-CHG-2026-11-13-002 — Compact colour cards in the shared-colour size header

- **Type:** UI/CSS fix (v94 follow-up). No data or calculation change.
- **Status:** `IMPLEMENTED — TESTED IN HEADLESS CHROMIUM` at 320 / 390 / 768 / 1280 px.
- **User requirement:** the colour cards in a shared-colour table made its header too high; make the colour cards smaller but keep the header low, as before.
- **Before (v94):** header 53 px high for 2–3 colours at phone width (108 px for 5 colours at 390/320 px) because the cards were large and the EACH/TOTAL line had its own row.
- **After:** cards 9 px bold, 4 px padding, 1 px border, no shadow; the summary is `EACH x · TOTAL y DZ` on the same row as the cards and the eye button is icon-only. Header height: 2–3 colours = 31 px at 390 px (one-colour header = 34 px); 5 colours = 49 px at 390 px (the cards need a second row). Cards still use their own `colours.json` colours on the neutral theme header.
- **Files changed:** `item-card.css`, `item-card.js` (summary text), `setting.html` (What's new v95, footer, wording), `assets/user-guide/screen-45.png` (retaken), `sw.js` (v24), `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`.

### ALISHAN-CHG-2026-11-13-003 — Archives (restore / delete for good without a shadow), ALISHAN brand logo and icon, Rose Wine theme

- **Type:** New feature (Archives) + brand/UI change + new theme. Storage: one new IndexedDB store (`archive`, DB version 1 → 2, nothing else changed; the upgrade only adds the store).
- **Status:** `IMPLEMENTED — TESTED IN HEADLESS CHROMIUM` (add → delete → Archives → Restore; Delete for good; old-trace cleanup; backup purge; 20 themes' header; 320–1280 px). Not tried on the owner's real data or phone. Back up before updating a real install.
- **User requirements:** (1) use the supplied butterfly-A logo as app icon and in the header, with a light wordmark, tagline "Lingerie & Innerwear" instead of "INVENTORY", and a burgundy theme that matches the brand; (2) a Settings → Archives where a deleted quality goes, is hidden everywhere (inventory, totals, reports), and can be restored or deleted for good; a permanently deleted quality must leave **no shadow**; (3) other suggestions.
- **What "shadow" meant (found in the code):** the old Delete removed only the inventory record. Its payments stayed in storage (hidden "orphan" payments, still inside every backup), its Quality History rows and Recent Activity lines stayed, and copies stayed inside the automatic backups.
- **Archives:**
  - `store.js` `deleteItem` now builds an archive record (`calc.js` `makeArchiveRecord`: copy of the entry + its payments) and `db.js` `archiveInventoryItem` moves it in ONE transaction (inventory + payments out, archive in). The entry is therefore missing from inventory, totals, reports, pending amounts and every other page automatically. Quality History still gets "Quality Deleted"; the activity line says "Moved … to Archives".
  - `archive.js` (new, `AlishanArchive`): `restore` (one transaction back to inventory + payments; history "Quality Restored"), `deleteForever`, `scanLeftovers` / `cleanLeftovers`. `calc.js` decides WHAT to remove (`purgePlan`, `purgeBackup`, `leftoverPlan`, `archiveSummary`); `db.js` `removeMany` removes. **Delete for good** removes: its payments, its Quality History rows (by entry id, and by code when no other entry has that code), the Recent Activity lines that contain `(code)` (same rule), its copy inside every automatic backup and the corrupted-items backup (and fixes their totals), and last the archive record itself — so an interrupted delete can just be repeated. No log line is written about it. A backup file the user downloaded earlier is outside the app and cannot be changed (the confirmation says so). Archived entries are not part of a downloaded backup.
  - Stock-toggle and completion-date activity lines now include `(code)` so they can be removed with their entry (older lines without a code cannot be matched and stay).
  - `settings-archive.js` + the Archives section in `setting.html` (+ `setting.css`): list with search, Restore, Delete for good (the 6-digit code must be typed), and "Old traces" (check, then delete) for entries deleted before Archives existed. The Inventory delete confirmation now says the entry moves to Archives.
- **Brand (`icons/`, `nav.css`, all 9 pages):** from the owner's images (none of them had real transparency: the "transparent" one has the checkerboard drawn into the pixels). `icon-192/512`, `icon-maskable-512` (symbol inside the safe zone), `apple-touch-icon-180`, `favicon-64`, `logo-mark` are made from the burgundy image with the ALISHAN text cut off and the background rebuilt as a smooth gradient (no corner artefacts); `wordmark.png` is the ALISHAN lettering of the light logo as a real alpha mask, drawn in the theme's text colour (CSS mask) so it is light on every header. Tagline "LINGERIE & INNERWEAR" replaces "INVENTORY" (live text in the accent colour). The old hanger-A icon files are removed. `manifest.webmanifest` colours and the default `theme-color` are the brand burgundy `#3a0f1d`.
- **Theme Rose Wine** (`rose-wine`, 20th theme): wine surfaces, rose-gold accents; registered in `theme-boot.js`, `theme-manager.js`, `script.js`, `themes.css` (+ the dark-theme lists), `setting.css`, and `nav.css` (header palette, checked by `tests/header-theme.test.js`). The default theme is NOT changed.
- **User Guide:** new topic 3A (Archives), topic 10 (Rose Wine, logo), Common problems, What's new v96, footer v96; screens 47 (header in 4 themes, retaken), 48, 49.
- **Not changed:** the guide screenshots 01–42 and 46 (taken with older headers/screens). Download backups do not include Archives.
- **Files changed:** `calc.js`, `db.js`, `store.js`, `archive.js` (new), `settings-archive.js` (new), `item-modal.js`, `setting.html`, `setting.css`, `nav.css`, `themes.css`, `theme-boot.js`, `theme-manager.js`, `script.js`, `sw.js` (v25), `manifest.webmanifest`, all `*.html` (logo, favicon, theme colour), `icons/*`, `assets/user-guide/screen-47…49.png`, `README.md`, `PROJECT_SOURCE_OF_TRUTH.md`, tests (`archive.test.js` new, `header-theme.test.js`).



### ALISHAN-CHG-2026-11-18-001 — Render + Supabase server migration
- **Date:** 2026-11-18. **Type:** Changed feature. **Status:** IMPLEMENTED — NOT VERIFIED (hosted and actual-browser acceptance pending).
- **User-approved scope:** Run this same app using Render and Supabase; move frontend business calculations to the backend; preserve existing design, navigation, formulas and user workflows. No redesign or new price-approval workflow.
- **Before:** Calculations, reports and business rules execute in browser JavaScript; durable records use origin-local IndexedDB.
- **After:** Node executes the original v96 calculation, store, report, archive, search and size-group rules. A build emits API adapters and asynchronous UI code. Render serves only this generated client. Supabase PostgreSQL persists the same ten store shapes in private tables. Number/date formatting and UI pagination remain presentation work.
- **Supersession:** Section 0 rule 7's single calculation source is preserved; in server mode it executes on Node. Descriptions of IndexedDB as the active persistence layer, and offline business calculation/cache behavior, are SUPERSEDED FOR SERVER DEPLOYMENT by this entry. Original local v96 sources and history remain available for regression and comparison. Changing the hosting architecture is explicitly authorized by this request.
- **Data impact:** Manual complete-backup migration across origins; no automatic deletion of old IndexedDB. Inventory/payment/archive changes and complete restore run transactionally. Workspace locks serialize concurrent writes; expected payment amount comes from canonical database state. Existing saved prices and original custom-price edit behavior are retained.
- **Files:** backend/*, client/runtime.js, scripts/build-client.mjs, deployment/schema.sql, deployment/SETUP.md, render.yaml, package.json, package-lock.json, .env.example, .gitignore, backend-tests/*; README and this document; User Guide topic 30 and version footer only. UI styles, assets, navigation and other page layout markup are retained.
- **Verification:** 64 original regression checks and 12 backend/SQL tests passed before final documentation update; final rerun results are recorded in deployment/HANDOVER.md. JSDOM page checks are simulated; chart drawing is mocked. Real Chromium launch failed because this execution environment rejects browser socket creation. Do not interpret these checks as real mobile acceptance.
- **Known limitations:** Live Render/Supabase connection, 390/360/320 px rendering, real chart/export rendering, full hosted backup round trip, real-data performance and uncertain-network outcomes remain unverified. Private access uses one server account, not a new multi-user role system. No offline calculations. Generic JSONB records preserve compatibility; large-data scaling requires benchmarks.
- **Related pending item:** ALISHAN-PEND-2026-11-18-001 — hosted deployment and real-browser/data migration acceptance.

### ALISHAN-PEND-2026-11-18-001 — Server migration acceptance
- **Status:** PENDING.
- Apply the supplied schema to the intended Supabase project, configure Render secrets and deploy the dedicated branch; verify live health/auth/TLS. Restore an exported copy of the existing app's data and compare record counts, totals, payments, archives and prices. Perform real-browser workflows at 390, 360, 320 px and desktop, all export formats/ZIP round trip, and concurrent-device writes before replacing the existing v96 deployment.

### ALISHAN-CHG-2026-11-18-002 — Backend performance correction (v98)
- **Date:** 2026-11-18. **Type:** Fix. **Status:** COMPLETED (backend optimization and live API scope); real-browser/device acceptance remains PENDING under ALISHAN-PEND-2026-11-18-001.
- **User-approved scope:** Optimize the deployed backend: load needed data, avoid read locks, batch restore writes, retain frontend and calculation rules. Follow this source of truth and AI_HANDOVER_PROTOCOL; preserve decision history and leave unrelated acceptance pending.
- **Before:** Every API batch locked the workspace, fetched every record including nested safety/automatic backups, initialized automatic backup checks and diffed all stores. Restore wrote one SQL statement per row. Responses echoed uploaded arguments. Live summary checks on 390 entries took 12.034 / 10.502 / 9.804 seconds end to end.
- **After:** Explicit reader allowlists use a single MVCC snapshot query without a write lock, projecting stores/settings and excluding backup bodies from routine reads. Revision-checked, bounded caches avoid transferring unchanged database payloads and invalidate after committed writes; each invocation receives an isolated copy. Pure calculation/group/reference requests skip the database. Compiled VM scripts are reused. Automatic catch-up/repair persists only in write transactions/background maintenance, never as a side effect of a reader. Read initialization still applies existing normalization rules on its isolated copy.
- **Restore:** Changed records save in batches of at most 100 per store and deleted keys use one statement per store; the original lock, validation, safety backup and transaction/rollback semantics are preserved. A complete restore has a three-minute client response window. This does not retry uncertain writes.
- **Card rendering:** Server build parallelizes only the exact independent ItemCard creation loops on Home/Inventory; cards are appended in original order. This reduces serial round trips without parallelizing business writes. Reference lookups are cached in the client. In the actual-data JSDOM Inventory plus Edit check, requests fell from 173 to 23. Source page markup, CSS and formulas remain unchanged.
- **Transport:** Only size-group calls return mutated arguments; ordinary responses no longer echo large uploads. A zero-delay batch window combines independent UI jobs, bounds queues to 500 calls per request, and sends repeated large report arguments once per batch. Actual-data testing found a ~69 MB weekly-report request; request-local shared arguments remove that duplication before the same original methods run. Complete restore clears client caches. Server-Timing separates application duration from network time.
- **Files:** backend/database.js, backend/domain.js, backend/operations.js, backend/server.js, client/runtime.js, backend-tests/performance.test.js, scripts/build-client.mjs, package.json, package-lock.json, README.md, frontend/setting.html (topic 30/footer), deployment/HANDOVER-v98.md, PROJECT_SOURCE_OF_TRUTH.md.
- **Data/calculation impact:** No schema migration, new dependency, data replacement or formula change. Same stored prices, payments and original validation rules. Existing v96 static service remains untouched. No paid upgrade.
- **Verification:** See deployment/HANDOVER-v98.md for exact final checks and live comparison. 82 checks passed (76 existing + six performance/transport tests); nine sample-data and eight actual-data JSDOM page checks passed. Live final code commit 04db0f0d4d7e2d8e3f970366a2d71535d11d6697 is deployed in dep-dbut02qfngtc73dpah10. Warm summary application time was 404.6 / 533.4 ms; end-to-end timings were 8.104 / 8.392 seconds over the test connection, so these are not subsecond device-load claims. Live database remained 390 inventory / 409 payments / 34 quality-history / 106 activity records, payment total 1151288.5. Packed pure-calculation batch returned HTTP 200 in 3.1 ms application time. Page checks are JSDOM simulations, not browser layout acceptance.
- **Known limitations:** Free hosting cold starts and network latency remain; no promise of a particular device speed. Real-device layout/interaction acceptance remains pending, including guide text at phone widths. No unrelated UI redesign.
- **Related pending item:** ALISHAN-PEND-2026-11-18-002 — performance release verification.

### ALISHAN-PEND-2026-11-18-002 — Performance release verification
- **Status:** COMPLETED (backend/API and archive delivery scope).
- Verified projected reads, cache invalidation, atomic bulk rollback, business regression, actual uploaded backup locally, live response times and unchanged live counts/totals; v98 source published to the existing repository and archive supplied. See deployment/HANDOVER-v98.md. Leave physical-phone and browser visual acceptance as a separate PENDING part of ALISHAN-PEND-2026-11-18-001.

### ALISHAN-CHG-2026-11-18-003 — Device view cache and page bundles (v99)
- **Date:** 2026-11-18. **Type:** Changed feature. **Status:** IMPLEMENTED — NOT VERIFIED (real browser/device persistence and phone-width visual acceptance pending).
- **User-approved scope:** Implement the proposed instant saved-view display, next-page prefetch, fewer page requests and server pagination; keep a loaded device copy in RAM/cache. Preserve original frontend layout and server-side calculation/validation rules. Follow both project documents, keep history append-only and leave incomplete acceptance Pending.
- **Before:** Most server-read answers were discarded across full-page navigation; live API requests and edit-form initialization delayed visible cards. Static bootstrap metadata required an additional blocking API request on each page.
- **After:** RAM holds isolated server-result copies, with an IndexedDB view cache across navigations/reopens where available. Cache scope includes server origin, authenticated identity/credential/database fingerprint and release; no credential is stored in the cache. Cache is bounded to 8 MiB / 600 answers, 2 MiB per answer, with a 24-hour maximum saved-view age; browser quota/eviction/private mode may prevent persistence. RAM fallback remains usable.
- **Freshness:** A small authenticated revision endpoint is checked at most every 15 seconds while visible and on focus/online. Changed revisions invalidate view copies and redraw from canonical server data. Saved answers display immediately with an updating/offline indicator; answers older than 60 seconds refresh in background. Old in-flight results cannot repopulate a newly invalidated cache. Older read responses cannot roll back the known revision; an authoritative status check can recognize a reset database.
- **Write safety:** Writes/Groups are never replayed from view cache. All writes clear view caches before and after the attempt (including uncertain errors), notify other tabs, and still use server validation/transactions. Backups, exports, validation previews and raw database readers bypass device view caching. No optimistic payment/save success or offline write queue. The existing v97 no-offline-calculation requirement remains. The older no-browser-view-cache restriction is SUPERSEDED only for server-computed display copies explicitly authorized here.
- **Page delivery:** A single read bundle primes initial Home/Inventory/Reports answers. Inventory filters, advanced sort and pagination now execute together on the server and return only the requested 10/20/50/100 raw entries with their original calculation-derived card values. Home fetches its latest five through a dedicated view. Initial primary content renders before edit/entry-form setup. Existing full export and detailed report readers remain available; this release does not claim that every detailed report is server-paginated.
- **Prefetch/assets:** Idle/hover preparation primes default Inventory/Reports views; it does not submit actions. Authenticated HTML supplies a non-secret cache scope; static API metadata is bundled at build time. Scripts/styles are release-versioned and authenticated assets use private ETag revalidation. A separate worker caches sanitized app HTML/static files to avoid blocking same-tab navigation on another HTML download. Only existing bound same-origin clients may carry their shell identity forward; navigation without a bound initiating app window goes through server authentication. A matching same-origin app referrer can carry an existing bound window session when the browser omits the prior client ID. Stored HTML contains no per-session scope; asset cache keys omit Authorization headers. API/write requests are never intercepted or cached. No service-worker business formulas or offline writes are introduced.
- **Visible changes:** Small saved-view status/refresh control and Settings → Data & Backup → Refresh saved view. User Guide topic 30/footer explains saved views, freshness and limits. Core page layout/navigation/CSS/calculations stay unchanged.
- **Files:** client/device-cache.js, client/runtime.js, client/view-shell-worker.js, backend/page-bundles.js, backend/domain.js, backend/database.js, backend/server.js, backend/operations.js, scripts/build-client.mjs, backend-tests/device-cache.test.js, backend-tests/page-bundles.test.js, backend-tests/shell-cache.test.js, backend-tests/helpers.js, package.json, package-lock.json, README.md, frontend/setting.html, deployment/HANDOVER-v99.md, PROJECT_SOURCE_OF_TRUTH.md.
- **Tests/limits:** See deployment/HANDOVER-v99.md for exact commands/evidence. Device-cache lifecycle tests use a simulated IndexedDB adapter; they do not establish actual browser disk persistence. No live data replacement or paid hosting change is part of this release.
- **Related pending:** ALISHAN-PEND-2026-11-18-003 — real browser/device cache and 390/360/320px acceptance; earlier full migration acceptance remains separate.

### ALISHAN-PEND-2026-11-18-003 — Device cache acceptance
- **Status:** IMPLEMENTED — NOT VERIFIED.
- Cache and page-bundle source is implemented. Verify actual IndexedDB retention and eviction, cross-tab/other-device updates, offline warm views, login/identity changes and status/control placement at 390/360/320 px in a functioning browser before marking the full feature Completed. Test live API/version/record invariants and deliver v99 code/ZIP; record executed checks in deployment/HANDOVER-v99.md.

#### v99 delivery verification — ALISHAN-CHG-2026-11-18-003
- 96 automated tests passed after final code changes; nine sample-data JSDOM pages passed. Final code commit f8bd10620cd585a3147d73891da0d6c6e0581700 is live in Render deploy dep-dbutp756e07s73eli5u0. Cache-status response is 78 bytes; server pagination and page-bundle checks returned 20 / 50 of 390 entries with HTTP 200 and matching revision 7. Live record counts remain 390 inventory / 409 payments / 34 quality-history / 106 activity records.
- Updated source and AlishanApp-v99-Device-Cache.zip are delivered; real browser/device acceptance remains IMPLEMENTED — NOT VERIFIED, as recorded above. Actual service-worker activation/cache-hit navigation and IndexedDB retention were not verified in a production browser. See deployment/HANDOVER-v99.md for first API timings, simulated warm-view measurements and limits.

#### v99 conditional revalidation follow-up — ALISHAN-CHG-2026-11-18-003
- Revalidation now sends the digest of the previously cached answer. If the original server method returns the same answer, the response contains an unchanged marker rather than another copy of the data. Clock-dependent values are still recomputed by the server; changed results are returned normally. Writes, Groups, backups/exports and validation previews never use this shortcut.
- Two added regression checks cover unchanged response-body omission and preservation of the cached value/digest across repeated revalidation; total automated checks: 98. The earlier f8bd106 code marker above is an interim deployment; the final conditional-read deployment is recorded in deployment/HANDOVER-v99.md.

- Final cache-worker compatibility/fallback checks bring the automated count to 100: storage/quota failures retain network fallback, and navigation resolves the prior window via replacesClientId or an exact same-origin initiating referrer. Browser/device acceptance remains pending.

- Final v99 live code is 0e166d34db7c6d61aa7a80c8e55b873d12e3a8c7, Render deploy dep-dbuu2agn74is739e71u0 (live). The unchanged summary result is 20 bytes versus its 9671-byte full reply. Final HTTP delivery includes the browser navigation/cache-failure guards. All 100 automated checks pass; actual browser/device acceptance remains pending. Earlier v99 deployment markers above remain as interim history.

### ALISHAN-CHG-2026-11-18-004 — Theme and page loading
- Theme initialization applies the remembered preference without writing it, explicit changes display before background persistence, and the dedicated settings row write does not invalidate inventory revisions. Large read RPC replies negotiate gzip, and Settings fetches backup metadata/counts instead of backup contents when rendering the list.
- Full report response structure and manual backup/restore APIs remain compatible. Actual phone timing remains pending.

### ALISHAN-CHG-2026-11-20-001 — Reviewed entries and save confirmation

New entries require server review and explicit confirmation. The server issues a PostgreSQL BIGINT Quality Code on submission and returns it as text. Save attempts are confirmed by ID, and repeated submissions return the original result. Add and Edit preview totals use the same quantity and money functions as the server. Report detail shows extra received, and Advanced Export confirms row counts. Manager approval and account changes remain future work.

### ALISHAN-CHG-2026-11-20-002 — Google sign-in and account workspaces

Google mode links a verified Google-backed Supabase user ID to a private server workspace. The existing workspace can be assigned to one explicitly verified legacy owner. Navigation warms Dashboard, Inventory and Reports on intent, and confirmed saves can prime the changed item and balance.

### ALISHAN-CHG-2026-11-20-003 — Device speed timings

Open Dashboard with `?timing=1` to capture navigation and action timings locally in the current tab. Measurements contain labels and durations only. Report times are grouped by page and shown in milliseconds. Startup continues through ordinary readers if a page warm-up request fails. Real Android measurements are pending.

### ALISHAN-CHG-2026-11-20-004 — Automatic page performance

Records approved timing fields per authenticated account and random browser-device identifier. Owners can filter across accounts. Shared password mode separates devices only. Measurements exclude business data and are kept for 30 days.

### ALISHAN-CHG-2026-11-20-005 — Responsive Settings

Settings navigation is available before server data arrives. Backup and archive data load only when requested through their sections. The page-performance marker reflects when Settings controls can be used.

### ALISHAN-CHG-2026-11-20-006 — Faster initial rendering

Dashboard and Inventory run independent reads together and render once on startup. Prefetch follows navigation intent. The performance report compares page readiness and the slowest captured visit by release.

### ALISHAN-CHG-2026-11-20-007 — Single-document navigation

The hosted UI routes reuse the same authenticated transport and retain visited views in the current tab. Back and Forward restore views. Direct and special action URLs continue to work. Performance measures in-app switches separately from document loads.

### ALISHAN-CHG-2026-11-20-008 — SPA stylesheet fix

Stylesheet nodes parsed in a separate document are attached to the live document head. Regression coverage verifies Inventory CSS loads and remains usable on Back navigation.

### ALISHAN-CHG-2026-11-20-009 — Performance breakdown

New readings distinguish document loads, first in-tab page visits, and returns. The dashboard filters slow visits and visualizes each measured phase. Historical SPA visits without a recorded type remain unclassified.

### ALISHAN-CHG-2026-11-20-010 — SPA icon loading

Page Performance starts the shared SVG icon renderer when opened directly. Navigation regression coverage verifies Dashboard and Inventory icons and back navigation.

### ALISHAN-CHG-2026-11-20-011 — First-visit performance

Dashboard totals and the Inventory list render ahead of other sections during startup. The Settings HTML and script warm in the background once the initial document settles. Telemetry measures initial data setup, first key-content paint, and the time between them.

### ALISHAN-CHG-2026-11-20-012 — Report and startup timings

- Record shared store wait, filter setup, scope calculation and initial render setup in Reports.
- Time device cache initialization and startup bundle preparation. Record the bundle network time when a request occurs during the visit.
- Warm Add Entry route files after Settings during idle time. Keep the existing account-scoped saved data and background revalidation behavior.

### ALISHAN-CHG-2026-11-20-013 — Performance monitor sharing

- Show timings by group and allow copying a visit, filtered visit selections, a group, or individually selected timings.
- Include page, time, release and visit type in copied text. Exclude account and device identifiers.

### ALISHAN-CHG-2026-11-20-014 — Text guide and Reports startup

- Use searchable written instructions and examples for the Settings User Guide. Remove the screenshot files and their service-worker cache entries.
- Warm the Reports route and account-scoped page bundle on idle after Settings and Add Entry, respecting connection and data-saving checks.
- Measure startup bundle wait from the active visit, including when a previous prefetch is still running.

### ALISHAN-CHG-2026-11-20-015 — Dashboard and Inventory startup

- Use the existing server summary for an early Dashboard totals paint and continue to full initialization. Query inventory and payments for summary-only reads.
- Warm Inventory HTML and route JavaScript during idle time, subject to the existing connection checks.

### ALISHAN-CHG-2026-11-20-016 — Cached startup and sync

- Reuse the existing account and release scoped runtime cache across routes. Check the server revision at startup in the background and continue to deduplicate identical in-flight reads.
- Keep a rendered Inventory list visible until its new page of cards is ready. Ignore superseded render results.

### ALISHAN-CHG-2026-11-20-017 — Startup cache and request ordering

- Use saved Dashboard totals or the matching Inventory page while the startup bundle prepares.
- On a Dashboard cache miss, use the bundle summary instead of issuing a separate summary request ahead of the bundle.
- Report startup cache hits, misses and time spent joining a running bundle request. Remove unused script loads from the generated HTML.

### ALISHAN-CHG-2026-11-20-018 — Backup egress

- Check schedule metadata without a write lock. Recheck under the lock before loading the workspace when a backup is due.
- Omit retained backup blobs from routine inventory, payments and search writes. Keep full transactional data for restore and other backup actions.
- Project backup history and filtered export settings in Postgres before sending the result to the app server.

### ALISHAN-CHG-2026-11-20-019 — Backup monitor

- A dedicated server-side credential grants read-only access to backup timestamps and the next scheduled check for the existing workspace. Backup payloads and business records stay out of this endpoint.

### ALISHAN-CHG-2026-11-20-020 — Live Monitor

- Collect supported document paint signals and expose bounded API and anonymous page aggregates through the dedicated Monitor credential.

### ALISHAN-CHG-2026-11-20-021 — Monitor navigation

- Open the standalone Alishan Monitor from Settings. Keep the authenticated per-visit timing details available beside it.

### ALISHAN-CHG-2026-11-20-022 — Startup diagnostics

- Add a bounded API waterfall, route script resource sizes, response compression and database-client timing breakdowns to per-visit diagnostics.
- Keep server-calculated Dashboard totals and current Inventory startup behavior. Browser timings depend on Resource Timing support.

### ALISHAN-CHG-2026-11-20-023 — Manual sync

- Keep account-scoped saved views when Sync Now finds the same revision. Display the last successful revision check separately from record updates.
- Reduce periodic revision polling while keeping startup, foreground and reconnect checks.

### ALISHAN-CHG-2026-11-20-024 — Reports route preparation

- Warm Reports HTML alongside Inventory. Serve sanitized version-matched shells to already bound tabs, with authenticated network fallback.
- Record HTML fetch, script factory readiness and HTML parse separately in Page Timing Details.

### ALISHAN-CHG-2026-11-20-025 — Account login

- Explain Google account creation and empty first-use workspaces. On account mismatches and expired sessions, leave the previous signed-in view. Explicit logout still submits its server request.

### ALISHAN-CHG-2026-11-21-001 — Google setup

- Allow Google verification with the existing password gate still in place. Setup callbacks issue no Alishan session. Google-only mode still requires a verified legacy owner.


### ALISHAN-CHG-2026-11-23-001 — Manager Control Center UI and approval reason fix

- **Status:** IMPLEMENTED — NOT VERIFIED; this is on branch `manager-control-center-redesign`, not yet merged or production-deployed.
- **Why:** The deployed Manager was only a basic approval queue, missing the approved Control Center design/navigation. The backend decision endpoint stored `decision_reason`, but the initial migration omitted that column and the UI did not collect a rejection reason.
- **Before:** Small approval list; no dashboard; no responsive mobile navigation; no requester identity in API; rejection sent without a reason; schema mismatch could fail decision writes.
- **After:** Redesigned Manager route with Alishan header, desktop top navigation, mobile bottom navigation and More sheet, dashboard overview, live approval counts, service health check, horizontal request-participant strip, Needs Attention, recent decisions, approval search/status/action filters, required rejection dialog and Activity section. Users/Inventory/Reports/Search/Backup/Health are clearly marked integration-pending rather than using fake data.
- **Backend:** Manager request listing now exposes requester ID and decision reason. Rejection reason is required (trimmed, 1–500 chars) and enforced by backend. The API route forwards reason. Fresh setup adds `decision_reason`; existing deployments receive a separate repeatable `deployment/manager-approval-reason-migration.sql` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **Tests:** Approval regression test extended for requester field, missing reason rejection and stored reason. Tests/build/browser acceptance have not yet been run in a complete checkout; status must remain not verified.
- **Impact:** No calculation or payment logic changes. Archive/restore remain the only Manager approval actions. No permanent-delete feature, backup payload access, user directory or inventory/report APIs were added. Manager permission check remains server-side.
- **Files:** `manager-app/index.html`, `backend/manager-approvals.js`, `backend/server.js`, `deployment/manager-approvals.sql`, `deployment/manager-approval-reason-migration.sql`, `backend-tests/manager-approvals.test.js`, `MANAGER_APP_HANDOVER.md`, `README.md`, this source-of-truth entry.
- **Next verification:** run `npm test`, `npm run build`, authenticated browser acceptance on desktop and 390/360/320px, and apply migration to an existing test database before merge/deployment.


### ALISHAN-CHG-2026-11-23-002 — Manager recent decisions ordering and reject-dialog focus

- **Status:** IMPLEMENTED — inline script syntax checked; full tests/build/browser acceptance NOT VERIFIED. Still on `manager-control-center-redesign` branch, not production.
- **Review findings verified:** recent decisions used request-order API results before `.slice(0,5)`, so a recently decided older request could be omitted. Reject dialog moved focus to the textarea but did not trap keyboard focus or restore focus when closed.
- **Changes:** Recent decisions now sort completed requests by descending `decided_at` before selecting five; pending queue ordering is unchanged. Reject modal keyboard focus is trapped on Tab/Shift+Tab, Escape closes it, Cancel restores the invoking Reject button when still present, otherwise the stable Approval status control. Validation and request errors refocus the reason field. On successful reject/reload, focus moves to the Approval status control.
- **Validation:** both inline script blocks parsed successfully using JavaScript `new Function`. No full `npm test`, build or browser accessibility run has yet been confirmed.
- **Files:** `manager-app/index.html`, `MANAGER_APP_HANDOVER.md`, this source-of-truth entry, and regression checks in `backend-tests/manager-approvals.test.js`.

- **Additional verified defect:** CodeRabbit identified a duplicate DOM ID on the approval status dropdown and status paragraph. The dropdown was renamed to `approval-filter-status`; the message paragraph retains `approval-status`, and all references were updated to their correct element. Regression checks assert both IDs and uniqueness.


### ALISHAN-CHG-2026-11-23-003 — Async reject-dialog race guard and CI verification workflow

- **Status:** IMPLEMENTED; GitHub Actions execution pending.
- **Review finding:** a late completion from a rejected request could close a subsequently opened reject dialog.
- **Fix:** reject dialog sessions now use an incrementing token. Completion/error handlers update the dialog only if the session and request ID still match. The server operation can finish after a user closes the modal, but stale UI completions cannot disturb a newer modal.
- **CI:** added a Node 24 GitHub Actions workflow to install the lockfile, run the full test suite, and build the production client on PRs to `main` and pushes to `manager-control-center-redesign`.
- **Local limitation:** available runtime is Node 22, while `package.json` requires Node >=24; repository dependencies are not installed and network DNS prevents cloning/installing. Therefore local `npm test` and `npm run build` were not run. Awaiting GitHub Actions results.

- **CI workflow ordering correction:** first run failed because `npm test` was executed before generating `dist/`, while existing backend tests load files from `dist/`. Reordered steps to build first, then test. Awaiting the next run; no claim of test pass yet.


### ALISHAN-CHG-2026-11-23-004 — CI build and automated test verification

- **Status:** AUTOMATED CI PASS; browser acceptance and production DB migration pending.
- **Evidence:** GitHub Actions run #13 on `4f018ac0ad3f0e74c3d0bc76035a67a610ca7c62` completed successfully. Node 24 `npm run build` passed; `npm test` passed 125/125 tests (0 failures, 0 skipped).
- **Migration:** SQL migration was exercised in the automated PGlite tests; it has not been applied to the production database.
- **Browser preview:** Netlify commit status reports success, but the Netlify bot comment says the deploy preview was canceled. No mobile/desktop browser acceptance is claimed.
- **Release gate:** PR #2 remains open and unmerged until a working preview/browser check and production migration readiness are confirmed.
