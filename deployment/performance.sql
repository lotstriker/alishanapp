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
