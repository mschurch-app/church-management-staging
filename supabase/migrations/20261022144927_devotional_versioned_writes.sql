-- Additive API: preserve existing service-only functions for deployment compatibility.
-- The verified Edge handler must supply the version the editor actually opened.
begin;

create or replace function public.update_daily_devotional_content_v2(
 p_id uuid,p_editor uuid,p_values jsonb,p_expected_version integer
) returns public.daily_devotionals
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare current_row public.daily_devotionals;
begin
 if p_expected_version is null or p_expected_version < 1 then raise exception 'version_required'; end if;
 if p_editor is null then raise exception 'invalid_request'; end if;
 select * into current_row from public.daily_devotionals
 where id=p_id and church_id='M+' and devotional_date>=date '2027-01-01' and devotional_date<date '2028-01-01'
 for update;
 if current_row.id is null then raise exception 'not_found'; end if;
 if current_row.version<>p_expected_version then raise exception 'version_conflict'; end if;
 -- Lock, comparison, content update and audit insert share the caller's transaction.
 return public.update_daily_devotional_content(p_id,p_editor,p_values);
end $$;

create or replace function public.review_daily_devotional_v2(
 p_id uuid,p_reviewer uuid,p_to_status text,p_comment text,p_expected_version integer
) returns public.daily_devotionals
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare current_row public.daily_devotionals; result public.daily_devotionals;
begin
 if p_expected_version is null or p_expected_version < 1 then raise exception 'version_required'; end if;
 if p_reviewer is null then raise exception 'invalid_request'; end if;
 select * into current_row from public.daily_devotionals
 where id=p_id and church_id='M+' and devotional_date>=date '2027-01-01' and devotional_date<date '2028-01-01'
 for update;
 if current_row.id is null then raise exception 'not_found'; end if;
 if current_row.version<>p_expected_version then raise exception 'version_conflict'; end if;
 perform public.review_daily_devotional(p_id,p_reviewer,p_to_status,p_comment);
 -- Legacy review changes status without incrementing version. Every v2 review must do so.
 update public.daily_devotionals set version=version+1 where id=p_id returning * into result;
 return result;
end $$;

revoke all on function public.update_daily_devotional_content_v2(uuid,uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.review_daily_devotional_v2(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.update_daily_devotional_content_v2(uuid,uuid,jsonb,integer) to service_role;
grant execute on function public.review_daily_devotional_v2(uuid,uuid,text,text,integer) to service_role;
commit;
