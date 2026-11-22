-- Keep one change marker per record. A marker with no matching record is a tombstone.
CREATE TABLE IF NOT EXISTS alishan_private.record_changes (
 workspace_id text NOT NULL REFERENCES alishan_private.workspaces(id) ON DELETE CASCADE,
 store text NOT NULL CHECK (store IN ('inventory','payments')),
 record_key text NOT NULL,
 revision bigint NOT NULL,
 PRIMARY KEY (workspace_id, store, record_key)
);
CREATE INDEX IF NOT EXISTS record_changes_workspace_revision
 ON alishan_private.record_changes(workspace_id, revision);
ALTER TABLE alishan_private.record_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alishan_private.record_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON alishan_private.record_changes TO alishan_backend;
CREATE POLICY backend_record_changes_read ON alishan_private.record_changes FOR SELECT TO alishan_backend USING (true);
CREATE POLICY backend_record_changes_insert ON alishan_private.record_changes FOR INSERT TO alishan_backend WITH CHECK (true);
CREATE POLICY backend_record_changes_update ON alishan_private.record_changes FOR UPDATE TO alishan_backend USING (true) WITH CHECK (true);
