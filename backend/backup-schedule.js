'use strict';

const scheduleKeys = ['autoBackupEnabled', 'backupFrequency', 'lastBackupDate'];
const snapshotKeys = ['autoBackups', 'fullRestoreSafetyBackups'];

function backupDue(rows, now = Date.now()) {
  const settings = new Map(rows.map(row => [row.key, row.value]));
  const frequency = parseInt(settings.get('backupFrequency') ?? '24', 10) || 24;
  const last = settings.get('lastBackupDate');
  return settings.get('autoBackupEnabled') !== 'false' && frequency > 0 &&
    (!last || now - new Date(last).getTime() >= frequency * 3600000);
}

async function runScheduledBackup(repository, createBackup) {
  if (await repository.backupIsDue()) {
    await repository.transaction(createBackup, { onlyWhenBackupDue: true });
  }
}

module.exports = { scheduleKeys, snapshotKeys, backupDue, runScheduledBackup };
