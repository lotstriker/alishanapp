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
| Dashboard | `index.html` + `dashboard.js` | Product Types, Quick Actions, Latest Added Qualities |
| Add entry | `add-entry.html` + `item-form.js` | New product entry: Basic Information, Sizes & Colors |
| Inventory | `inventory.html` + `inventory.js` | Complete Inventory, filters, export / import, backups, Bulk Import (`bulk-import.js`) |
| Reports | `reports.html` | Tabs: Pending Amount Receival, Weekly Reports, Amount History, Inventory Valuation, Stock Aging Analysis; the **Add Amount Received** popup |
| Settings | `setting.html` + `script.js` | Settings dashboard, profiles, business info, display, appearance, users, backup & restore |
| Pending Amount | `pending-amount.html` + `audit-pages.js` | One card per quality whose full amount is not received yet (see 2.1) |
| Missing Lot Number | `missing-lot.html` + `audit-pages.js` | Qualities still waiting for a lot number |
| Quality History | `quality-history.html` + `audit-pages.js` | Read-only log of important quality changes |

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

Status chip on the card head: *Completed* (`inStock !== false`) or *Incomplete*.
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
