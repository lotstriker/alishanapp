-- Safe, repeatable upgrade for existing Manager approval tables.
begin;
alter table alishan_private.manager_requests
  add column if not exists decision_reason text;
commit;
