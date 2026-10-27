-- Isolated encrypted credential. No copy, revocation or overwrite of existing OAuth credentials.
create schema if not exists church_album_private;
revoke all on schema church_album_private from public, anon, authenticated;
grant usage on schema church_album_private to service_role;

create or replace function church_album_private.store_google_refresh_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'not authorized'; end if;
 if p_token is null or char_length(p_token) not between 1 and 8192 then raise exception 'invalid token'; end if;
 perform pg_advisory_xact_lock(hashtext('church-albums-google-refresh-token'));
 select id into v_id from vault.secrets where name='church-albums-google-refresh-token' limit 1;
 if v_id is null then
  perform vault.create_secret(p_token,'church-albums-google-refresh-token','Dedicated Google Drive album OAuth credential for mbot; separate from calendar and YouTube');
 else
  perform vault.update_secret(v_id,p_token,'church-albums-google-refresh-token','Dedicated Google Drive album OAuth credential for mbot; separate from calendar and YouTube');
 end if;
end;
$$;
create or replace function church_album_private.get_google_refresh_token()
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_token text;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'not authorized'; end if;
 select decrypted_secret into v_token from vault.decrypted_secrets where name='church-albums-google-refresh-token' order by updated_at desc limit 1;
 return v_token;
end;
$$;
revoke all on function church_album_private.store_google_refresh_token(text) from public, anon, authenticated;
revoke all on function church_album_private.get_google_refresh_token() from public, anon, authenticated;
grant execute on function church_album_private.store_google_refresh_token(text) to service_role;
grant execute on function church_album_private.get_google_refresh_token() to service_role;

create or replace function public.church_albums_store_google_refresh_token(p_token text)
returns void language sql security invoker set search_path = '' as $$
 select church_album_private.store_google_refresh_token(p_token);
$$;
create or replace function public.church_albums_get_google_refresh_token()
returns text language sql stable security invoker set search_path = '' as $$
 select church_album_private.get_google_refresh_token();
$$;
revoke all on function public.church_albums_store_google_refresh_token(text) from public, anon, authenticated;
revoke all on function public.church_albums_get_google_refresh_token() from public, anon, authenticated;
grant execute on function public.church_albums_store_google_refresh_token(text) to service_role;
grant execute on function public.church_albums_get_google_refresh_token() to service_role;
