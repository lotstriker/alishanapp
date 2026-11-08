/* Settings > Data & Backup. Uses the existing IndexedDB records and backup settings. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const message = (text, ok = true) => {
    const el = $('alishanBackupSettingsStatus');
    if (el) { el.textContent = text; el.style.color = ok ? 'var(--success,#16834a)' : 'var(--danger,#c33)'; }
  };
  const formatDate = value => value && !isNaN(new Date(value)) ? new Date(value).toLocaleString() : 'Unknown date';
  const backupType = b => {
    const type = b?.metadata?.type || 'LOCAL_BACKUP';
    if (type === 'PRE_IMPORT_BACKUP') return 'Safety copy';
    if (type === 'MANUAL_BACKUP') return 'Manual';
    if (type === 'AUTO_BACKUP') return 'Automatic';
    return type.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  };

  async function refresh() {
    await AlishanDB.init();
    const enabled = (await AlishanDB.getSetting('autoBackupEnabled', 'true')) !== 'false';
    const frequency = parseInt(await AlishanDB.getSetting('backupFrequency', '24'), 10) || 24;
    const history = (await AlishanDB.getSetting('autoBackups', [])) || [];
    const inventory = await AlishanDB.getInventory();
    const payments = await AlishanDB.getPayments();
    $('alishanAutoBackup').checked = enabled;
    $('alishanBackupFrequency').value = frequency;
    $('alishanBackupHistory').innerHTML = history.length ? history.slice().reverse().map(b => {
      const created = formatDate(b?.metadata?.created);
      return `<div class="alishan-backup-row"><span><b>${created}</b><small>${Number(b?.metadata?.totalItems ?? b?.inventory?.length ?? 0)} qualities · ${Number(b?.metadata?.totalPayments ?? b?.payments?.length ?? 0)} payments</small></span><span>${backupType(b)}</span></div>`;
    }).join('') : '<p class="settings-help">No local backups have been created yet.</p>';
    const latest = history.length ? history[history.length - 1] : null;
    $('alishanBackupSummary').textContent = `${inventory.length} quality records · ${payments.length} payment records currently saved. ${latest ? `Latest local backup: ${formatDate(latest.metadata?.created)} (${backupType(latest)}).` : 'No local backup exists yet.'}`;
    $('restoreLatestAlishanBackup').disabled = !latest || !Array.isArray(latest.inventory) || !Array.isArray(latest.payments);
  }

  async function saveSettings() {
    const frequency = Number($('alishanBackupFrequency').value);
    if (!Number.isInteger(frequency) || frequency < 1 || frequency > 720) {
      message('Enter an interval from 1 to 720 hours.', false); return;
    }
    const btn = $('saveAlishanBackupSettings'); btn.disabled = true;
    try {
      await AlishanDB.setSetting('autoBackupEnabled', $('alishanAutoBackup').checked ? 'true' : 'false');
      await AlishanDB.setSetting('backupFrequency', String(frequency));
      message('Backup settings saved. The app applies the schedule when its store starts; it cannot run while the app/browser is fully closed.');
    } catch (e) { message(e.message || 'Could not save backup settings.', false); }
    finally { btn.disabled = false; }
  }

  async function createBackup() {
    const btn = $('createLocalAlishanBackup'); btn.disabled = true;
    try {
      const inventory = await AlishanDB.getInventory();
      const payments = await AlishanDB.getPayments();
      if (!inventory.length && !payments.length) throw new Error('There are no quality or payment records to back up.');
      const created = new Date().toISOString();
      const backup = { metadata: { type: 'MANUAL_BACKUP', created, exportedAt: created, totalItems: inventory.length, totalPayments: payments.length, system: 'ALISHAN_INVENTORY', version: '2.0' }, inventory, payments };
      const history = (await AlishanDB.getSetting('autoBackups', [])) || [];
      history.push(backup);
      await AlishanDB.setSetting('autoBackups', history.slice(-12));
      message('Local backup created successfully. Check its date and record counts in Backup History.');
      await refresh();
    } catch (e) { message(e.message || 'Could not create backup.', false); }
    finally { btn.disabled = false; }
  }

  async function restoreLatest() {
    const history = (await AlishanDB.getSetting('autoBackups', [])) || [];
    const backup = history[history.length - 1];
    if (!backup || !Array.isArray(backup.inventory) || !Array.isArray(backup.payments)) {
      message('No valid local backup was found.', false); return;
    }
    const created = formatDate(backup.metadata?.created);
    if (!confirm(`Restore ${backup.inventory.length} quality records and ${backup.payments.length} payment records from the local backup dated ${created}? Current records will be saved as a safety copy first.`)) return;
    const btn = $('restoreLatestAlishanBackup'); btn.disabled = true;
    try {
      const currentInventory = await AlishanDB.getInventory();
      const currentPayments = await AlishanDB.getPayments();
      if (currentInventory.length || currentPayments.length) {
        const now = new Date().toISOString();
        const safety = { metadata: { type: 'PRE_IMPORT_BACKUP', created: now, totalItems: currentInventory.length, totalPayments: currentPayments.length, system: 'ALISHAN_INVENTORY', version: '2.0' }, inventory: currentInventory, payments: currentPayments };
        const updated = [...((await AlishanDB.getSetting('autoBackups', [])) || []), safety];
        await AlishanDB.setSetting('autoBackups', updated.slice(-12));
      }
      await AlishanDB.replaceInventoryAndPayments(backup.inventory, backup.payments);
      message('Restore completed. Reloading the app…');
      await refresh();
      setTimeout(() => location.reload(), 700);
    } catch (e) { message(e.message || 'Restore failed.', false); }
    finally { btn.disabled = false; }
  }

  async function refreshStorage() {
    const btn = $('refreshAlishanStorage'); if (btn) btn.disabled = true;
    try {
      if (window.settingsManager?.calculateStorageUsage) await window.settingsManager.calculateStorageUsage();
      else if (navigator.storage?.estimate) {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        const pct = quota ? Math.min(100, usage / quota * 100) : 0;
        $('storageProgressBar').style.width = `${pct.toFixed(0)}%`;
        $('storageUsageText').textContent = `${(usage / 1048576).toFixed(2)} MB of ${quota ? (quota / 1048576).toFixed(0) : '—'} MB used`;
        $('storagePercentage').textContent = quota ? `${pct.toFixed(0)}%` : '—';
      } else $('storageUsageText').textContent = 'Storage usage unavailable in this browser';
      message('Backup and storage information refreshed.');
    } catch (e) { message(e.message || 'Could not refresh browser storage information.', false); }
    finally { if (btn) btn.disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh().catch(e => message(e.message || 'Could not load backup settings.', false));
    $('saveAlishanBackupSettings')?.addEventListener('click', () => saveSettings());
    $('createLocalAlishanBackup')?.addEventListener('click', createBackup);
    $('restoreLatestAlishanBackup')?.addEventListener('click', () => restoreLatest().catch(e => message(e.message || 'Restore failed.', false)));
    $('refreshAlishanStorage')?.addEventListener('click', refreshStorage);
  });
})();
