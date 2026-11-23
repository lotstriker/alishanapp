'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { domain } = require('./domain');

const fingerprint = record => createHash('sha256').update(JSON.stringify(record)).digest('hex');
const storeFor = action => action === 'archive' ? 'inventory' : 'archive';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const problem = (status, error) => ({ ok: false, status, error });
const publicFields = 'id,action,label,status,requested_at,decided_at';

function managerApprovals(pool, repositoryFor) {
  async function invited(actor, client = pool) {
    const { rowCount } = await client.query(
      'SELECT 1 FROM alishan_private.manager_invites WHERE user_id=$1', [actor]);
    return rowCount === 1;
  }

  async function request({ actor, repository }, action, id) {
    if (!['archive','restore'].includes(action) || typeof id !== 'string' || !id || id.length > 100)
      return problem(400, 'Invalid approval request.');
    return repository.transaction(async (state, revision, issueCode, client) => {
      const records = state[storeFor(action)].filter(row => String(row.id) === id);
      if (records.length !== 1) return problem(404, 'Entry is unavailable.');
      const record = records[0], item = action === 'archive' ? record : record.item;
      const label = [item.quality, item.code].filter(Boolean).join(' · ').slice(0, 200);
      const { rows } = await client.query(
        `INSERT INTO alishan_private.manager_requests
         (id,workspace_id,requested_by,action,record_id,fingerprint,label)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (workspace_id,action,record_id) WHERE status='pending' DO NOTHING RETURNING id`,
        [randomUUID(),repository.workspace,actor,action,id,fingerprint(record),label]);
      return { ok: true, alreadyPending: !rows.length };
    }, { omitBackupSnapshots: true });
  }

  async function list(actor) {
    if (!await invited(actor)) return problem(403, 'Manager invite required.');
    const { rows } = await pool.query(`SELECT ${publicFields} FROM alishan_private.manager_requests
      ORDER BY (status='pending') DESC, requested_at DESC LIMIT 100`);
    return { ok: true, requests: rows };
  }

  async function decide(actor, id, decision, reason = null) {
    if (!uuid.test(id) || !['approved','rejected'].includes(decision))
      return problem(400, 'Invalid decision.');
    if (!await invited(actor)) return problem(403, 'Manager invite required.');
    const { rows: [target] } = await pool.query(
      'SELECT workspace_id FROM alishan_private.manager_requests WHERE id=$1', [id]);
    if (!target) return problem(404, 'Request not found.');
    return repositoryFor(target.workspace_id).transaction(async (state, revision, issueCode, client) => {
      if (!await invited(actor, client)) return problem(403, 'Manager invite required.');
      const { rows: [row] } = await client.query(
        'SELECT * FROM alishan_private.manager_requests WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [id,target.workspace_id]);
      if (!row || row.status !== 'pending') return problem(409, 'This request already has a decision.');
      if (decision === 'approved') {
        const matches = state[storeFor(row.action)].filter(record => String(record.id) === row.record_id);
        if (matches.length !== 1 || fingerprint(matches[0]) !== row.fingerprint)
          return problem(409, 'Entry changed after the request. Reject it and ask for a fresh request.');
        const app = await domain(state, { actor, runAutoBackup: false });
        const outcome = row.action === 'archive'
          ? await app.Store.deleteItem(matches[0].id)
          : await app.Archive.restore(matches[0].id);
        if (!outcome.ok) return problem(409, outcome.error);
      }
      await client.query(`UPDATE alishan_private.manager_requests
        SET status=$2, decided_by=$3, decided_at=now(), decision_reason=$4 WHERE id=$1`, [id,decision,actor,reason]);
      return { ok: true };
    }, { omitBackupSnapshots: true });
  }

  return { invited, request, list, decide };
}
module.exports = { managerApprovals };
