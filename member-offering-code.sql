begin;
set local lock_timeout='3s';
-- Explicit core viewers; no new finance editing or roster grants.
create table church_auth.finance_code_viewers (
 user_id uuid primary key references church_auth.accounts(user_id)
);
alter table church_auth.finance_code_viewers enable row level security;
revoke all on church_auth.finance_code_viewers from public,anon,authenticated;
grant all on church_auth.finance_code_viewers to service_role;
insert into church_auth.finance_code_viewers(user_id)
 select a.user_id from church_auth.accounts a where a.is_active
 and a.display_name in ('吳俊璋','謝碧鳳','邵鈺庭','曾恩茹')
 and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id='M+' and g.permission='members');
do $$begin if(select count(*) from church_auth.finance_code_viewers)<>4 then raise exception 'requires_four_verified_core_accounts';end if;end$$;
-- Narrow authenticated reader: private finance table remains inaccessible directly.
create function public.list_member_offering_codes(p_church text,p_member_ids bigint[])
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=(select auth.uid()); allowed boolean;
begin
 if viewer is null then raise exception 'login_required' using errcode='42501';end if;
 if p_church is distinct from 'M+' then return jsonb_build_object('can_view',false,'codes','[]'::jsonb);end if;
 if p_member_ids is null or cardinality(p_member_ids)>100 then raise exception 'invalid_input' using errcode='22023';end if;
 select exists(select 1 from church_auth.accounts a
 join church_auth.accounts root on root.user_id=church_auth.canonical_account(a.user_id) and root.is_active
 where a.user_id=viewer and a.is_active
 and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id='M+')
 and exists(select 1 from church_auth.grants g where g.user_id=root.user_id and g.church_id='M+')
 and (exists(select 1 from church_auth.finance_code_viewers v where v.user_id=root.user_id)
 or public.finance_user_can(viewer,'entry') or public.finance_user_can(viewer,'cash_verify') or public.finance_user_can(viewer,'approve'))) into allowed;
 if not allowed then return jsonb_build_object('can_view',false,'codes','[]'::jsonb);end if;
 return jsonb_build_object('can_view',true,'codes',coalesce((
 select jsonb_agg(jsonb_build_object('member_id',m.id,'offering_code',c.offering_code) order by m.id)
 from public.members m left join public.finance_member_codes c on c.member_id=m.id
 where m.church_id=p_church and m.id=any(p_member_ids)), '[]'::jsonb));
end$$;
revoke all on function public.list_member_offering_codes(text,bigint[]) from public,anon;
grant execute on function public.list_member_offering_codes(text,bigint[]) to authenticated;
CREATE OR REPLACE FUNCTION public.get_verified_member_status(p_church text, p_channel text, p_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare binding church_auth.member_bindings%rowtype; member_data jsonb; request_status text;
begin
  if p_church is null or p_church not in ('M+','SHiNE') or p_channel is distinct from '2011645391'
    or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('state','unbound'); end if;
  select * into binding from church_auth.member_bindings where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject and active for share;
  if found then
    select jsonb_build_object(
      'offering_code',case when p_church='M+' and archived_at is null then (select c.offering_code from public.finance_member_codes c where c.member_id=binding.member_id) else null end,
      'name',name,
      'phone',phone,
      'district',district,
      'birthday',birthday,
      'gender',gender,
      'group_name',group_name,
      'baptism_date',baptism_date,
      'faith_status',faith_status,
      'age_group',age_group,
      'growth_progress',growth_progress,
      'reconfirmation_id',case when profile_confirmation_completed_at is null then profile_confirmation_id else null end
    ) into member_data
      from public.members where id=binding.member_id and church_id=p_church for share;
    if found then return jsonb_build_object('state','approved','member',member_data); end if;
  end if;
  select status into request_status from church_auth.binding_requests where church_id=p_church and login_channel_id=p_channel and line_subject=p_subject order by created_at desc,id desc limit 1;
  return jsonb_build_object('state',case when request_status='approved' then 'revoked' else coalesce(request_status,'unbound') end);
end $function$;


-- Keep the verified-subject reader service-only; callers never submit a member id.
revoke all on function public.get_verified_member_status(text,text,text) from public,anon,authenticated;
grant execute on function public.get_verified_member_status(text,text,text) to service_role;
commit;
