# ALISHAN app — how the code is organised

```
 page (input / draw)  ->  store.js  ->  calc.js   all calculations + all rules
                                    ->  db.js     saving / loading (IndexedDB)
 search.js            one search box, same on every page
```

| File | Does | Never does |
|------|------|-----------|
| `calc.js` | EVERY calculation and rule: quantity, amount, aging, payments, weeks, validation, building a new/edited entry, filters, search matching, suggestions, report data, Excel rows, backup checking, formatting | touch the database, keep data, draw a page |
| `db.js` | storage only (IndexedDB): get / save | calculate anything |
| `loader.js` | loads the Excel and Chart.js libraries from the internet ONLY when an export / chart needs them (so the pages open fast) | anything else |
| `store.js` | the link: takes what a page typed, asks calc.js to build/check it, saves it with db.js, tells every page (and other tabs) it changed | calculate anything |
| `bulk-import.js` + `bulk-import.css` | the Bulk Import window (Inventory page): paste AI JSON, review entries one by one, edit anything, approve, import | check, calculate or save (calc.js checks, store.js saves) |
| `search.js` + `search.css` | the search box: live suggestions, history, search anything, top searches | decide what to do with the result (the page does) |
| `dashboard.js`, `inventory.js`, `reports.html` | take input, show data | keep their own copy of the data, calculate, save |
| `item-form.js`, `item-card.js`, `item-modal.js` | shared UI pieces (pickers, card, edit window) | calculate, save |

## Adding a search to a page
```html
<div id="alishan-search"></div>
<script>AlishanSearch.init({ onSearch: (term) => { /* draw again */ } });</script>
```
Then use `AlishanStore.query({ search: AlishanSearch.getTerm() })`.

## Where to change what
| I want to change...                     | Edit |
|-----------------------------------------|------|
| aging days (7/15/30) and colours        | `calc.js` -> `CONFIG`, `AGING_LEVELS` |
| low-stock limit, "added this week"      | `calc.js` -> `CONFIG` |
| how amount / dozens / pending is worked out | `calc.js` |
| what is checked when an entry is added/edited | `calc.js` -> `buildNewItem`, `buildUpdatedItem`, `validateItem` |
| what the search box can find            | `calc.js` -> `itemSearchText`, `suggest` |
| columns of an Excel report              | `calc.js` -> `inventoryRows`, `pendingRows` ... |
| prices                                  | `qualities.json` |
| how the search box looks                | `search.css` |

## If a file does not load
`db.js` (loaded first) contains a safety net, `AlishanRequire`. At start-up every page calls it:
- a file that did not load is **requested again (up to 3 times)**;
- if it still is missing, a message on the page says **which file**;
- **search.js and loader.js are optional**: without them the page still works (orange message);
  every other file is essential (red message).
Because of this the app's global objects (`AlishanCalc`, `AlishanStore` ...) are declared with `var`
(not `const`): a file that is loaded a second time must be allowed to declare them again.

## Bulk import of old paper records (AI JSON)
Inventory page -> **Bulk Import**:
1. Copy the AI prompt (`AlishanStore.aiPrompt()`), give it + photos of the paper copy to an AI, paste the JSON back.
2. Review entry by entry: every field can be edited (also the price). calc.js (`checkImportDraft`) shows the
   dozens, amount, received and pending and lists problems (red = must fix, orange = look at it).
3. Approve, then **Import**: store.js (`importEntries`) saves the entries + their payments in one go
   (a safety backup is kept first). Old entries default to *Out of stock* (not in Aging) and *Fully received*
   (counted in Total, not in Pending). **Undo** removes a whole import (`undoImport`).

### Bulk import: colours and qualities the app does not know
- A colour that is not in `colors.json` is a **warning** (not an error): the entry can still be imported and the colour
  is saved as written (add it to `colors.json` later). The review window has a panel "Colors that are not in the app"
  where each one can be replaced by an app colour — in every entry at once.
  The colour keeps its sizes (a "different sizes" entry loses nothing). Suggestions come from `calc.js` (`colorSuggestions`).
- A quality that is not in `qualities.json` is a warning: type the price, or use "Did you mean ...?"
  (applied to every entry with the same name). To make a new quality permanent add it to `qualities.json`.
- The AI prompt (`calc.js` -> `bulkPrompt`) explains the ledger **blocks**, the two layouts (same sizes for all
  colours / different sizes per colour) and asks the AI to check its own reading with the paper's total (`paper_total`).

### Bulk import: price, lot, saving and backups
- **Price:** the price written on the paper is used first; if the paper has none, the price of the quality in
  `qualities.json`; if neither exists (quality not in the app, or its price is 0) it is an **error** and the entry
  cannot be imported until a price is typed (`calc.js` -> `checkImportDraft`).
- **Lot:** one number (`312449`) or one range (`309963-309968`). Every size has its own consecutive lot number, so a
  list of lots read by the AI becomes the range first-last (a warning appears if they are not consecutive).
- **Saving:** entries and their payments are written in ONE IndexedDB transaction (`AlishanDB.addInventoryAndPayments`;
  undo / restore use `replaceInventoryAndPayments`): both are saved or neither.
- **Backups:** the copy taken before an import / undo / restore (`PRE_IMPORT_BACKUP`) is counted apart from the 7
  automatic ones (last 5 are kept), and after every import a backup FILE is downloaded automatically.

### Phone layout (`mobile.css` + `ui.js`)
- `mobile.css` is loaded LAST on every page and everything in it is inside `@media (max-width: 768px)`, so the desktop
  look is untouched. It only changes how things look (smaller text, less margin and padding, one thin row per
  inventory entry, bottom tab bar, bottom sheets). It has no maths and no saving.
- The card (`item-card.js`) is the same markup as before; `mobile.css` lays its parts out as a row
  (name + amount, lot / code / date + total dozens, tags + status, colours). Tap the row to open it: size tiles x
  colours = total calculation, product details and Edit / Delete / Complete are all still there.
- On a phone the closed row shows: quality name + its date, lot and code, the tags (type, cup, IMPORTED, OLD ENTRY,
  aging) on the left; amount, total dozens and status on the right. The colours are only in the opened card. Entries are
  separated by a gap and a coloured rail (the aging colour). In the opened card the date is by the name, lot and code are
  below it (left) and the tags are on the same line on the right. The date is also written into the name line (`.ic-name-date`, hidden on desktop).
- `ui.js` only opens and closes things: the Filters bottom sheet, the "+" tab (`index.html#add` scrolls to the
  New entry form) and a shorter search hint. The Export / Import / Bulk import buttons appear twice on purpose:
  in the filter block (desktop) and in the tool row (phone, `.inv-tools`).
- Reports: the stat boxes become small tiles, tabs scroll sideways, Pending / History / Aging / Weekly entries are one
  compact block each, the valuation table scrolls inside its own box, and the Add Amount Received popup uses two fields
  per row. The report filters stay on the page. (The Filters bottom sheet is only for the Inventory page: its CSS is
  scoped with `.inv-tools ~ .filters`.)
- Reports "Average Weekly Amount Received" card: `AlishanCalc.weeklyAverage(scope, payments)` = total received / number of
  weeks (Monday to Sunday, like the weekly report) from the week of the first payment to the current week; weeks with no
  payment count as 0. It follows the search / filters like the other stat cards.
- Reports filters (phone): folded behind the one-line `#filtersToggle` button, which shows the chosen values; Apply folds
  them again. On desktop they stay open as before.
- Settings: same sections, smaller type and spacing, system font.
- New entry form: same fields and ids; sizes are two per line (dozen + pieces) and the Add / Reset bar stays above
  the tab bar. Entry date and More details are the two folded parts.

### qualities.json: prices and spellings
- Prices come from the shop's Excel price list (checked against it, see `quality_price_update_report.xlsx`). A paper
  spelling that differs from the app name (for example "Jekat Mold" for JAIKAT-MOLD) is listed in that quality's
  `"aliases"`, so bulk import finds it. Existing app names are never renamed (saved entries use them).

### Offline mode, installing on the phone, themes
- `sw.js` (service worker, started by `pwa.js`): app files are fetched from the server when online (so an updated file
  always arrives) and a copy is kept; offline the copy is used. The libraries from the internet (Excel export, charts,
  photo crop) are kept the first time they are downloaded. Entries, payments and backups are NOT in this cache: they
  live in the browser database (IndexedDB). A thin red "Offline" strip shows when there is no connection.
  If files are added or renamed, add them to `APP_FILES` in `sw.js` (a missing file is still kept after it is opened once).
- `vendor/`: put `xlsx.full.min.js`, `chart.umd.js`, `cropper.min.js/css` here (see `vendor/README.txt`) and the app uses
  them before going to the internet (`loader.js` looks in `vendor/` first).
- `manifest.webmanifest` + `icons/`: lets the phone install the app ("Add to home screen" / "Install app"). It needs
  https or localhost, like the service worker.
- `themes.css` + `theme-boot.js`: the 7 colour themes apply on every page. The saved theme (AlishanDB) is put on `<html>`
  as `theme-NAME`; the choice is also copied to localStorage only to avoid a flash of the default colours. The default
  theme changes nothing (pages keep their own colours). A theme sets `--white/--dark/--gray/--light-gray/--light/--body-bg`
  and `--accent-text` / `--on-color` (text on a coloured button); `mobile.css` reads the same variables.

### Names are never typed in the code
Qualities, product types and colours used by the Bulk Import (matching, "Did you mean", the product type of a new
quality, the examples inside the AI prompt) all come from `qualities.json` and `colors.json`.
- To teach the importer a local name, add `"aliases": ["gajri", "gajar"]` to a colour (or a quality) in the json file.
- Every replacement you make in the review window ("Gajri" -> CARROT) is also remembered in the db, so the next import already knows it.
- Half dozens are kept: 2.5 dozens = 2 dozens + 6 pieces (`AlishanCalc.splitPieces`).
