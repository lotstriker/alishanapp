(function () {
  'use strict';
  const key = 'alishan:timing';
  let state;
  try {
    state = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (new URLSearchParams(location.search).get('timing') === '1') state = { samples: [] };
    if (!state) return;
    persist();
  } catch { return; }

  function persist() {
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {}
  }

  function add(name, ms) {
    state.samples.push({ name, ms: Math.round(ms) });
    state.samples = state.samples.slice(-30);
    persist();
    const output = document.getElementById('alishan-timing-output');
    if (output) output.value = JSON.stringify(state.samples, null, 2);
  }

  function afterPaint(name, from) {
    requestAnimationFrame(() => requestAnimationFrame(() => add(name, performance.now() - from)));
  }

  let pageMeasured = false;
  window.AlishanTimings = {
    pageReady(name) {
      if (pageMeasured) return;
      pageMeasured = true;
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      const route = location.pathname === '/' ? '/index.html' : location.pathname;
      const pending = state.next;
      delete state.next;
      persist();
      if (nav) add(name + ' · server response', nav.responseStart);
      afterPaint(name + ' · content ready', 0);
      if (pending?.path === route) afterPaint(name + ' · tap to content', pending.at - performance.timeOrigin);
    },
    afterPaint,
    action(name) {
      const start = performance.now();
      return () => afterPaint(name, start);
    }
  };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.altKey || link.origin !== location.origin || link.target || link.hasAttribute('download')) return;
    const paths = ['/', '/index.html', '/inventory.html', '/reports.html'];
    if (paths.includes(link.pathname) && link.pathname !== location.pathname) {
      state.next = { at: performance.timeOrigin + performance.now(), path: link.pathname === '/' ? '/index.html' : link.pathname };
      persist();
    }
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('details');
    panel.id = 'alishan-timing-panel';
    const label = document.createElement('summary');
    label.textContent = 'Speed timings';
    const output = document.createElement('textarea');
    output.id = 'alishan-timing-output';
    output.setAttribute('aria-label', 'Speed timings in milliseconds');
    output.readOnly = true;
    output.rows = 8;
    output.style.width = '100%';
    output.value = JSON.stringify(state.samples, null, 2);
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.textContent = 'Stop measuring';
    stop.addEventListener('click', () => {
      state = { samples: [] };
      delete window.AlishanTimings;
      sessionStorage.removeItem(key);
      panel.remove();
      location.replace(location.pathname + location.hash);
    });
    panel.style.cssText = 'position:fixed;left:12px;bottom:76px;z-index:30000;padding:8px;background:var(--bg-secondary,#fff);color:var(--text-primary,#222);border:1px solid #888;max-width:calc(100% - 24px)';
    panel.append(label, output, stop);
    document.body.appendChild(panel);
  }, { once: true });
})();
