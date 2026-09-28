create or replace function church_auth.list_member_binding_statuses(p_church text, p_member_ids bigint[])
returns table(member_id bigint, line_bound boolean)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_member_ids is null or cardinality(p_member_ids) < 1 or cardinality(p_member_ids) > 100 then
    raise exception 'invalid_member_scope' using errcode='22023';
  end if;
  perform church_auth.lock_binding_reviewer(p_church);
  return query
    select m.id,
      exists (
        select 1
        from church_auth.member_bindings b
        where b.church_id = p_church
          and b.member_id = m.id
          and b.active
      )
    from public.members m
    where m.church_id = p_church
      and m.id = any(p_member_ids);
end
$function$;

create or replace function public.list_member_binding_statuses(p_church text, p_member_ids bigint[])
returns table(member_id bigint, line_bound boolean)
language sql
set search_path = ''
as $function$
  select * from church_auth.list_member_binding_statuses(p_church, p_member_ids);
$function$;

revoke all on function church_auth.list_member_binding_statuses(text, bigint[]) from public, anon;
grant execute on function church_auth.list_member_binding_statuses(text, bigint[]) to authenticated;
revoke all on function public.list_member_binding_statuses(text, bigint[]) from public, anon;
grant execute on function public.list_member_binding_statuses(text, bigint[]) to authenticated;