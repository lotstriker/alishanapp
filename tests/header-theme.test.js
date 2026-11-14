const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'frontend');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function lum(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const blend = (fg, bg, alpha) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(fg.slice(1 + i, 3 + i), 16) * alpha + parseInt(bg.slice(1 + i, 3 + i), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');

const css = read('nav.css');
const themes = [...read('theme-boot.js').match(/var THEMES = \[([\s\S]*?)\]/)[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
const palette = (name) => {
  const m = css.match(new RegExp(`\\.theme-${name} \\.site-topbar \\{([^}]*)\\}`));
  if (!m) return null;
  const v = (k) => (m[1].match(new RegExp(`--${k}:\\s*([^;]+);`)) || [])[1].trim();
  return { a: v('nav-bg-a'), b: v('nav-bg-b'), text: v('nav-text'), accent: v('nav-accent'), ink: v('nav-ink') };
};

test('every theme has its own header palette', () => {
  assert.equal(themes.length, 20);
  const seen = new Set();
  for (const t of themes) {
    const p = palette(t);
    assert.ok(p, `no header colours for theme ${t}`);
    seen.add(JSON.stringify(p));
  }
  assert.equal(seen.size, themes.length, 'two themes share the same header colours');
});

test('header text, accent and logo are never too close to the header background', () => {
  for (const t of themes) {
    const p = palette(t);
    for (const bg of [p.a, p.b]) {
      assert.ok(contrast(p.text, bg) >= 6.5, `${t}: header text is hard to read on ${bg}`);
      assert.ok(contrast(p.accent, bg) >= 2.8, `${t}: accent is too close to ${bg}`);
    }
    assert.ok(contrast(blend(p.text, p.b, 0.78), p.b) >= 4.5, `${t}: dim tab text is hard to read`);
    assert.ok(contrast(p.ink, p.accent) >= 4.5, `${t}: logo ink is hard to see on the accent`);
    assert.notEqual(p.text.toLowerCase(), p.accent.toLowerCase(), `${t}: text and accent are the same colour`);
    assert.notEqual(p.text.toLowerCase(), p.a.toLowerCase(), `${t}: text and background are the same colour`);
  }
});

test('every page uses the new logo (hanger-A mark + wordmark) in its header', () => {
  const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
  let n = 0;
  for (const f of pages) {
    const html = read(f);
    if (!html.includes('site-topbar')) continue;
    n += 1;
    assert.match(html, /<img class="logo-mark" src="icons\/logo-mark\.png"/, `${f}: butterfly-A mark`);
    assert.match(html, /<span class="logo-wordmark" role="img" aria-label="ALISHAN"><\/span><small>LINGERIE &amp; INNERWEAR<\/small>/, `${f}: wordmark and tagline`);
    assert.doesNotMatch(html, /fa-tshirt"><\/i> ALISHAN|<small>INVENTORY<\/small>/, `${f}: old logo`);
    assert.match(html, /icons\/favicon-64\.png/, `${f}: favicon`);
  }
  assert.ok(n >= 9);
});

test('app icons, header font and logo files exist, are in the manifest/service worker and are real images', () => {
  const sw = read('sw.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const f of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon-180.png', 'icons/favicon-64.png', 'icons/logo-mark.png', 'icons/wordmark.png', 'fonts/inter-600.woff', 'fonts/inter-700.woff', 'fonts/inter-800.woff', 'fonts/INTER-LICENSE.txt']) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
    if (!f.endsWith('.txt')) assert.ok(sw.includes(`"${f}"`), `not precached: ${f}`);
  }
  const png = fs.readFileSync(path.join(root, 'icons/icon-512.png'));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), `manifest icon missing: ${icon.src}`);
  assert.match(css, /font-family: 'Alishan Sans'/);
  assert.match(css, /url\('fonts\/inter-800\.woff'\)/);
});

test('the browser bar colour follows the theme header', () => {
  assert.match(read('theme-boot.js'), /--nav-bg-a/);
  assert.match(read('theme-boot.js'), /theme-color/);
});
