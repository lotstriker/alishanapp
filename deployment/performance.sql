create table if not exists alishan_private.performance_visits (
  account_scope text not null,
  visit_id uuid not null,
  device_id uuid not null,
  page text not null,
  release text not null,
  metrics jsonb not null,
  received_at timestamptz not null default now(),
  primary key(account_scope, visit_id)
);
alter table alishan_private.performance_visits enable row level security;
revoke all on table alishan_private.performance_visits from public, anon, authenticated;
create index if not exists performance_visits_recent on alishan_private.performance_visits(account_scope, received_at desc);
select cron.schedule('alishan-performance-retention','19 3 * * *',
  $job$delete from alishan_private.performance_visits where received_at < now()-interval '30 days'$job$);

-- Restricted production application role. Owner-based local installs need no extra grants.
do $role$
begin
  if exists (select 1 from pg_roles where rolname = 'alishan_backend') then
    grant select,insert,update on table alishan_private.performance_visits to alishan_backend;
    drop policy if exists alishan_backend_performance_read on alishan_private.performance_visits;
    create policy alishan_backend_performance_read on alishan_private.performance_visits for select to alishan_backend using (true);
    drop policy if exists alishan_backend_performance_insert on alishan_private.performance_visits;
    create policy alishan_backend_performance_insert on alishan_private.performance_visits for insert to alishan_backend with check (true);
    drop policy if exists alishan_backend_performance_update on alishan_private.performance_visits;
    create policy alishan_backend_performance_update on alishan_private.performance_visits for update to alishan_backend using (true) with check (true);
  end if;
end
$role$;
