begin;

-- Owner-only account list keeps a retired email address for identification.
-- The retired Auth user is not reactivated and does not become a linked login.
create or replace function church_auth.list_admin_accounts_v4() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform church_auth.assert_account_owner();
  select coalesce(jsonb_agg(x.record order by x.record->>'display_name',x.record->>'email'),'[]'::jsonb) into result from (
    select distinct on (church_auth.canonical_account(a.user_id))
      to_jsonb(a)||jsonb_build_object(
        'canonical_user_id',church_auth.canonical_account(a.user_id),
        -- Historical contact detail only; the retired Auth ID stays out of linked_user_ids.
        'retired_email',(select nullif(u.email,'')
          from church_auth.coworker_identity_merge_audit m
          join auth.users u on u.id=m.email_user_id
          where m.line_user_id=church_auth.canonical_account(a.user_id)),
        'linked_user_ids',coalesce((select jsonb_agg(u order by u) from church_auth.account_users(a.user_id) u where u<>a.user_id),'[]'::jsonb),
        'has_line',exists(select 1 from auth.identities i where i.user_id in (select church_auth.account_users(a.user_id)) and i.provider='custom:line-web'),
        'line_user_id',(select i.user_id from auth.identities i where i.user_id in (select church_auth.account_users(a.user_id)) and i.provider='custom:line-web' order by i.user_id limit 1),
        'identity_review_required',exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='custom:line-web') and not exists(select 1 from auth.identities i where i.user_id=a.user_id and i.provider='email') and not exists(select 1 from church_auth.account_identity_links l where l.alias_user_id=a.user_id or l.canonical_user_id=a.user_id) and not exists(select 1 from church_auth.coworker_identity_merge_audit m where m.line_user_id=a.user_id),
        'member_associations',coalesce((select jsonb_agg(distinct jsonb_build_object('church_id',b.church_id,'member_id',b.member_id)) from church_auth.member_bindings b join auth.identities i on i.provider_id=b.line_subject and i.provider='custom:line-web' where i.user_id in (select church_auth.account_users(a.user_id)) and b.active),'[]'::jsonb),
        'version',md5(church_auth.account_snapshot(a.user_id)::text)
      ) record
    from public.list_admin_accounts_v3() a
    order by church_auth.canonical_account(a.user_id),(a.user_id=church_auth.canonical_account(a.user_id)) desc
  ) x;
  return result;
end $$;

-- Keep the original owner-only access model; the public wrapper is unchanged.
revoke all on function church_auth.list_admin_accounts_v4() from public,anon;
grant execute on function church_auth.list_admin_accounts_v4() to authenticated;

notify pgrst,'reload schema';

commit;
