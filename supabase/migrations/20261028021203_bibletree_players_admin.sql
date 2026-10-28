-- TARGET: Reading Tree game project loscejilzfdwhmogkuwf, NOT the Church OS DB.
-- The only caller is the cross-project Edge bridge after fresh OS Auth/grants.
-- No journals, full save documents, OAuth metadata, emails or tokens are returned.
create or replace function game_private.players_admin(p_query text default '',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_query is null or length(p_query)>80 or p_filter is null or p_filter not in ('all','active','beta','feedback','no_profile')
 or p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<>25 then raise exception 'INVALID_PLAYER_QUERY';end if;
 with base as materialized (
  select u.id user_id,u.created_at,u.last_sign_in_at,p.display_name,p.avatar_id,p.gender,p.age_band,p.region,p.church_status,p.church_name,
   p.user_id is not null has_profile,b.first_seen_at beta_first_seen_at,b.robe_claimed_at,b.boost_started_at,b.boost_expires_at,
   (select count(*)::integer from game_private.beta_feedback f where f.user_id=u.id and f.state='submitted') feedback_count
  from auth.users u left join public.game_profiles p on p.user_id=u.id left join game_private.beta_participants b on b.user_id=u.id
  where u.deleted_at is null and not coalesce(u.is_anonymous,false)
 ), filtered as materialized (
  select * from base where (p_query='' or position(lower(p_query) in lower(coalesce(display_name,'')||' '||coalesce(church_name,'')))>0)
   and case p_filter when 'active' then last_sign_in_at>=now()-interval '7 days' when 'beta' then beta_first_seen_at is not null
   when 'feedback' then feedback_count>0 when 'no_profile' then not has_profile else true end
 ), page as (
  select * from filtered order by last_sign_in_at desc nulls last,created_at desc,user_id limit p_limit offset p_offset
 ), rows as (
  select to_jsonb(p)||jsonb_build_object('save_updated_at',s.updated_at,
   'level',case when coalesce(s.document#>>'{snapshot,hero,level}',s.document#>>'{hero,level}') ~ '^[0-9]{1,2}$'
    then greatest(1,least(20,coalesce(s.document#>>'{snapshot,hero,level}',s.document#>>'{hero,level}')::integer)) else null end,
   'reading_days',case when s.user_id is null then null else (
    select count(*) from (select rs.day_number from game_private.reading_sections rs group by rs.day_number
      having bool_and(coalesce((case when jsonb_typeof(s.document#>'{snapshot,annual,read}')='array' then s.document#>'{snapshot,annual,read}' else '[]'::jsonb end) ? rs.chapter_key,false)
       or coalesce((case when jsonb_typeof(s.document#>'{snapshot,annual,read}')='array' then s.document#>'{snapshot,annual,read}' else '[]'::jsonb end) ? rs.section_key,false))) d
   ) end) player,p.last_sign_in_at,p.created_at,p.user_id
  from page p left join game_private.journey_saves s on s.user_id=p.user_id
 )
 select jsonb_build_object('ok',true,'players',coalesce((select jsonb_agg(player order by last_sign_in_at desc nulls last,created_at desc,user_id) from rows),'[]'::jsonb),
  'total',(select count(*) from filtered),'offset',p_offset,'limit',p_limit,'generated_at',now(),
  'stats',jsonb_build_object('accounts',(select count(*) from base),'active',(select count(*) from base where last_sign_in_at>=now()-interval '7 days'),
  'beta',(select count(*) from base where beta_first_seen_at is not null),'feedback',(select count(*) from base where feedback_count>0))) into result;
 return result;
end $$;
revoke all on function game_private.players_admin(text,text,integer,integer) from public,anon,authenticated;
grant execute on function game_private.players_admin(text,text,integer,integer) to service_role;

create or replace function public.game_players_admin(p_query text default '',p_filter text default 'all',p_offset integer default 0,p_limit integer default 25)
returns jsonb language sql stable security invoker set search_path='' as $$
 select game_private.players_admin(p_query,p_filter,p_offset,p_limit);
$$;
revoke all on function public.game_players_admin(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.game_players_admin(text,text,integer,integer) to service_role;
