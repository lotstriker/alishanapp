create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists alishan_monitor;
revoke all on schema alishan_monitor from public, anon, authenticated;
create table if not exists alishan_monitor.probes (
 id bigint primary key, started_at timestamptz not null default clock_timestamp(),
 checked_at timestamptz, kind text, elapsed_ms integer
);
alter table alishan_monitor.probes enable row level security;
create or replace function alishan_monitor.enqueue() returns void
language sql set search_path='' as $$
 insert into alishan_monitor.probes(id) values (net.http_get(
   url:='https://alishanapp-server.onrender.com/healthz', timeout_milliseconds:=90000));
$$;
create or replace function alishan_monitor.collect() returns void
language sql set search_path='' as $$
 update alishan_monitor.probes p set checked_at=r.created,
   kind=case when r.status_code=200 and coalesce(r.content,'') ~ '^\s*\{\s*"status"\s*:\s*"ok"\s*\}\s*$' then 'ok'
             when r.status_code is not null then 'http-'||r.status_code::text else 'unreachable' end,
   elapsed_ms=greatest(0,round(extract(epoch from (r.created-p.started_at))*1000))::integer
 from net._http_response r where p.id=r.id and p.checked_at is null;
 update alishan_monitor.probes set checked_at=clock_timestamp(),kind='no-result'
 where checked_at is null and started_at < clock_timestamp()-interval '3 minutes';
 delete from alishan_monitor.probes where started_at < now()-interval '90 days';
$$;
revoke execute on function alishan_monitor.enqueue(), alishan_monitor.collect() from public, anon, authenticated;
create or replace function public.alishan_monitor_history()
returns table(id text, at timestamptz, kind text, ms integer)
language sql stable security definer set search_path='' as $$
 select p.id::text,p.checked_at,p.kind,p.elapsed_ms from alishan_monitor.probes p
 where p.checked_at is not null order by p.id desc limit 100;
$$;
revoke execute on function public.alishan_monitor_history() from public, authenticated;
grant execute on function public.alishan_monitor_history() to anon;
select cron.schedule('alishan-monitor-probe','*/20 * * * *','select alishan_monitor.enqueue()');
select cron.schedule('alishan-monitor-collect','* * * * *','select alishan_monitor.collect()');
select alishan_monitor.enqueue();
