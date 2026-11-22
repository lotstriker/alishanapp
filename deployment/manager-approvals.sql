begin;
create table if not exists alishan_private.manager_invites (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);
create table if not exists alishan_private.manager_requests (
  id uuid primary key,
  workspace_id text not null,
  requested_by uuid not null,
  action text not null check (action in ('archive','restore')),
  record_id text not null,
  fingerprint text not null,
  label text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create unique index if not exists manager_requests_pending_record
  on alishan_private.manager_requests(workspace_id, action, record_id) where status='pending';
alter table alishan_private.manager_invites enable row level security;
alter table alishan_private.manager_requests enable row level security;
revoke all on alishan_private.manager_invites, alishan_private.manager_requests from public, anon, authenticated;
grant select on alishan_private.manager_invites to alishan_backend;
grant select,insert,update on alishan_private.manager_requests to alishan_backend;
create policy manager_invite_backend_read on alishan_private.manager_invites for select to alishan_backend using (true);
create policy manager_requests_backend on alishan_private.manager_requests for all to alishan_backend using (true) with check (true);
commit;
