'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('Settings navigation is usable while backup data is pending', async () => {
  const dist = path.join(__dirname, '../dist');
  const read = name => fs.readFileSync(path.join(dist, name), 'utf8');
  const html = read('setting.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const dom = new JSDOM(html, { url: 'https://alishan.test/setting.html', runScripts: 'outside-only' });
  const { window } = dom;
  try {
    await new Promise(resolve => window.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    let calls = 0, complete;
    const backup = new Promise(resolve => { complete = resolve; });
    window.eval(read('bootstrap.js'));
    window.eval(read('server-client.js'));
    window.localStorage.setItem('alishan-theme','rose-wine');
    window.eval(read('theme-manager.js'));
    window.AlishanDB = { init: () => { throw Error('Settings startup must not initialize DB'); } };
    window.AlishanRemote = { call: (target, method) => {
      assert.equal(target, 'Views');
      assert.equal(method, 'backupOverview');
      calls++;
      return backup;
    }};
    window.eval(read('script.js'));
    window.eval(read('settings-data-backup.js'));
    const document = window.document;
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const click = selector => document.querySelector(selector).click();
    click('[data-open-section="appearance"]');
    assert.equal(document.querySelector('.settings-section.active').id, 'appearance');
    assert.equal(calls, 0);
    click('.nav-link[data-section="backup"]');
    assert.equal(document.querySelector('.settings-section.active').id, 'backup');
    assert.equal(calls, 1);
    assert.equal(document.getElementById('saveAlishanBackupSettings').disabled, true);
    click('.nav-link[data-section="general"]');
    assert.equal(document.querySelector('.settings-section.active').id, 'general');
    click('.nav-link[data-section="backup"]');
    assert.equal(calls, 1);
    complete({enabled:true,frequency:24,history:[],inventoryCount:5,paymentCount:1});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(document.getElementById('saveAlishanBackupSettings').disabled, false);
    assert.match(document.getElementById('alishanBackupSummary').textContent, /5 quality records/);
  } finally {
    window.close();
  }
});
