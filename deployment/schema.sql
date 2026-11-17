-- Run once in the Supabase SQL editor. Tables are intentionally outside public/Data API.
BEGIN;
CREATE SCHEMA IF NOT EXISTS alishan_private;
REVOKE ALL ON SCHEMA alishan_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS alishan_private.workspaces (
 id text PRIMARY KEY,
 revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS alishan_private.records (
 workspace_id text NOT NULL REFERENCES alishan_private.workspaces(id) ON DELETE CASCADE,
 store text NOT NULL CHECK(store IN ('inventory','payments','qualities','colors','settings','searchAnalytics','users','editHistory','auditLog','archive')),
 record_key text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 PRIMARY KEY(workspace_id,store,record_key)
);
ALTER TABLE alishan_private.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE alishan_private.records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA alishan_private FROM PUBLIC, anon, authenticated;
-- The trusted Render server uses the database owner connection. No browser database key is used.
COMMIT;
