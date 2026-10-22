-- Distinguish owner confirmation of an existing LINE account from merging another account.
-- No account, grant, role, member binding, notification or owner rows are changed by confirmation.
create table church_auth.line_account_identity_confirmations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  line_subject text not null,
  account_name text not null,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  unique(user_id,line_subject,account_name)
);
alter table church_auth.line_account_identity_confirmations enable row level security;
revoke all on church_auth.line_account_identity_confirmations from public,anon,authenticated;
create index line_account_identity_confirmations_actor_idx on church_auth.line_account_identity_confirmations(confirmed_by);

create function church_auth.line_account_identity_confirmed(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from church_auth.line_account_identity_confirmations c
    join church_auth.accounts a on a.user_id=c.user_id and a.display_name=c.account_name
    join auth.identities i on i.user_id=c.user_id and i.provider='custom:line-web' and i.provider_id=c.line_subject
    where c.user_id=p_user)
$$;
create function church_auth.line_account_identity_review_version(p_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object('account',church_auth.account_snapshot(p_user),
    'line',(select jsonb_agg(jsonb_build_object('subject',provider_id,'profile',identity_data) order by provider_id) from auth.identities where user_id=p_user and provider='custom:line-web'),
    'application',(select jsonb_build_object('name',full_name,'updated_at',updated_at) from church_auth.mplus_staff_applications where user_id=p_user))::text)
$$;
revoke all on function church_auth.line_account_identity_confirmed(uuid),church_auth.line_account_identity_review_version(uuid) from public,anon,authenticated;

create function church_auth.confirm_line_account_identity(p_user uuid,p_version text) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare subject text; real_name text;
begin
  perform church_auth.assert_account_owner();
  perform 1 from church_auth.accounts where user_id=p_user for update;
  perform 1 from auth.identities where user_id=p_user and provider='custom:line-web' for update;
  perform 1 from church_auth.mplus_staff_applications where user_id=p_user for share;
  if p_user is null or church_auth.canonical_account(p_user)<>p_user
    or not exists(select 1 from church_auth.accounts where user_id=p_user and is_active and invitation_state='active' and nullif(btrim(display_name),'') is not null)
    then raise exception 'invalid_target'; end if;
  if (select count(*) from auth.identities where user_id=p_user and provider='custom:line-web')<>1 then raise exception 'line_identity_not_found'; end if;
  if p_version is null or p_version<>church_auth.line_account_identity_review_version(p_user) then raise exception 'account_changed'; end if;
  select provider_id into subject from auth.identities where user_id=p_user and provider='custom:line-web';
  select display_name into real_name from church_auth.accounts where user_id=p_user;
  if nullif(subject,'') is null then raise exception 'line_identity_not_found'; end if;
  insert into church_auth.line_account_identity_confirmations(user_id,line_subject,account_name,confirmed_by)
    values(p_user,subject,real_name,auth.uid()) on conflict(user_id,line_subject,account_name) do nothing;
  return true;
end $$;
create function public.confirm_line_account_identity(p_user uuid,p_version text) returns boolean
language sql security invoker set search_path='' as $$ select church_auth.confirm_line_account_identity(p_user,p_version) $$;
revoke all on function public.confirm_line_account_identity(uuid,text),church_auth.confirm_line_account_identity(uuid,text) from public,anon;
grant execute on function public.confirm_line_account_identity(uuid,text),church_auth.confirm_line_account_identity(uuid,text) to authenticated;

create or replace function church_auth.list_admin_accounts_v4() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform church_auth.assert_account_owner();
  select coalesce(jsonb_agg(x.record order by x.record->>'display_name',x.record->>'email'),'[]'::jsonb) into result from (
    select distinct on (church_auth.canonical_account(a.user_id))
      to_jsonb(a)||jsonb_build_object(
        'canonical_user_id',church_auth.canonical_account(a.user_id),
        'linked_user_ids',coalesce((select jsonb_agg(u order by u) from church_auth.account_users(a.user_id) u where u<>a.user_id),'[]'::jsonb),
        'has_line',exists(select 1 from auth.identities i where i.user_id in (select church_auth.account_users(a.user_id)) and i.provider='custom:line-web'),
        'line_user_id',(select i.user_id from auth.identities i where i.user_id in (select church_auth.account_users(a.user_id)) and i.provider='custom:line-web' order by i.user_id limit 1),
        'identity_review_required',exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web') and not exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='email') and not exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=a.user_id or l.canonical_user_id=a.user_id) and not church_auth.line_account_identity_confirmed(a.user_id),
        'member_associations',coalesce((select jsonb_agg(distinct jsonb_build_object('church_id',b.church_id,'member_id',b.member_id)) from church_auth.member_bindings b join auth.identities i on i.provider_id=b.line_subject and i.provider='custom:line-web' where i.user_id in (select church_auth.account_users(a.user_id)) and b.active),'[]'::jsonb),
        'version',md5(church_auth.account_snapshot(a.user_id)::text)
      ) record
    from public.list_admin_accounts_v3() a
    order by church_auth.canonical_account(a.user_id),(a.user_id=church_auth.canonical_account(a.user_id)) desc
  ) x;
  return result;
end $$;

CREATE OR REPLACE FUNCTION church_auth.get_line_admin_access_review(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  perform church_auth.assert_account_owner();
  if not exists(select 1 from auth.identities where user_id=p_user and provider='custom:line-web') then raise exception 'line_identity_not_found'; end if;
  select jsonb_build_object(
    'user_id',p_user,
    'line_name',coalesce((select nullif(btrim(identity_data->>'name'),'') from auth.identities where user_id=p_user and provider='custom:line-web' limit 1),'LINE 同工'),
    'approved',exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=p_user),
    'account_name',(select display_name from church_auth.accounts where user_id=p_user),
    'application_name',(select full_name from church_auth.mplus_staff_applications where user_id=p_user),
    'application_status',(select status from church_auth.mplus_staff_applications where user_id=p_user),
    'identity_confirmed',church_auth.line_account_identity_confirmed(p_user),
    'can_confirm_current',exists(select 1 from church_auth.accounts where user_id=p_user and is_active and invitation_state='active' and nullif(btrim(display_name),'') is not null) and church_auth.canonical_account(p_user)=p_user and (select count(*) from auth.identities where user_id=p_user and provider='custom:line-web')=1,
    'review_version',church_auth.line_account_identity_review_version(p_user),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'display_name',a.display_name,'job_title',a.job_title,'email',u.email) order by a.display_name) from church_auth.accounts a join auth.users u on u.id=a.user_id where a.is_active and a.user_id<>p_user and not exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=a.user_id)),'[]'::jsonb)
  ) into result;
  return result;
end $function$;


notify pgrst, 'reload schema';
