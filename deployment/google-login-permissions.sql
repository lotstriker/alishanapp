grant select, insert, delete on alishan_private.login_sessions to alishan_backend;
create policy alishan_login_session_select on alishan_private.login_sessions for select to alishan_backend using (true);
create policy alishan_login_session_insert on alishan_private.login_sessions for insert to alishan_backend with check (true);
create policy alishan_login_session_delete on alishan_private.login_sessions for delete to alishan_backend using (true);
create or replace function alishan_private.verified_google_owner(candidate text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id where i.user_id::text=candidate and i.provider='google' and u.email_confirmed_at is not null) $$;
revoke all on function alishan_private.verified_google_owner(text) from public, anon, authenticated;
grant execute on function alishan_private.verified_google_owner(text) to alishan_backend;
