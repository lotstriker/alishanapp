/* ============================================================
   loader.js — loads the two big libraries ONLY WHEN THEY ARE NEEDED.

   Before, every page loaded the Excel library (~900 KB) and Reports also
   Chart.js from the internet BEFORE the page could show anything. On a slow
   connection the page stayed blank. Now they are fetched in the background
   at the moment they are used:

       await AlishanLoader.xlsx();    // before creating an Excel / CSV file
       await AlishanLoader.chart();   // before drawing a chart

   The page itself never waits for them.
   ============================================================ */

var AlishanLoader = (() => {
    'use strict';

    // each library is looked for in vendor/ first (see vendor/README.txt), then on the internet
    const URLS = {
        xlsx: ['vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
        chart: ['vendor/chart.umd.js', 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js']
    };
    const pending = {};

    function addScript(sources, i, resolve, reject, name) {
        const s = document.createElement('script');
        s.src = sources[i];
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
            s.remove();
            if (i + 1 < sources.length) return addScript(sources, i + 1, resolve, reject, name);   // next place to look
            reject(new Error(`Could not load the ${name} library. Connect to the internet once, or put it in the vendor folder.`));
        };
        document.head.appendChild(s);
    }

    function load(name, isReady) {
        if (isReady()) return Promise.resolve();
        if (pending[name]) return pending[name];
        pending[name] = new Promise((resolve, reject) => addScript(URLS[name], 0, resolve, reject, name))
            .catch(err => { delete pending[name]; throw err; });          // allow a retry next time
        return pending[name];
    }

    // Saves an Excel workbook. XLSX.writeFile has its own download code; if that throws (for example inside a
    // preview window), the file bytes are made with XLSX.write and downloaded like every other file in the app.
    function saveWorkbook(wb, fileName) {
        try {
            XLSX.writeFile(wb, fileName);
            return;
        } catch (first) {
            console.warn('XLSX.writeFile failed, saving the file bytes directly:', first && first.message);
        }
        const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }

    // Makes every column of a sheet as wide as its longest text (header included), so that long names, colour
    // lists and tags are readable without widening the columns by hand. Only the look of the file changes.
    function fitColumns(ws) {
        try {
            if (!ws || !ws['!ref']) return ws;
            const range = XLSX.utils.decode_range(ws['!ref']);
            const cols = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                let longest = 6;
                for (let r = range.s.r; r <= range.e.r; r++) {
                    const cell = ws[XLSX.utils.encode_cell({ r, c })];
                    if (!cell || cell.v === undefined || cell.v === null) continue;
                    const text = String(cell.w !== undefined ? cell.w : cell.v);
                    const line = Math.max(...text.split('\n').map(l => l.length));
                    if (line > longest) longest = line;
                }
                cols.push({ wch: Math.min(longest + 2, 70) });
            }
            ws['!cols'] = cols;
        } catch (e) {
            console.warn('Column widths could not be set:', e && e.message);   // never blocks the export
        }
        return ws;
    }

    return {
        xlsx: () => load('xlsx', () => typeof XLSX !== 'undefined'),
        fitColumns,
        chart: () => load('chart', () => typeof Chart !== 'undefined'),
        saveWorkbook
    };
})();

window.AlishanLoader = AlishanLoader;
