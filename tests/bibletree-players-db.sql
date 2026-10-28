-- Run on the GAME database. All synthetic accounts and fixtures roll back.
begin;
do $$
declare uid uuid; u1 uuid; u2 uuid; result jsonb; first_page jsonb; second_page jsonb; read_keys jsonb; before_count integer;
begin
 if not has_schema_privilege('service_role','game_private','USAGE') or has_function_privilege('anon','public.game_players_admin(text,text,integer,integer)','EXECUTE')
 or has_function_privilege('authenticated','public.game_players_admin(text,text,integer,integer)','EXECUTE')
 or has_function_privilege('authenticated','game_private.players_admin(text,text,integer,integer)','EXECUTE')
 or not has_function_privilege('service_role','public.game_players_admin(text,text,integer,integer)','EXECUTE') then raise exception 'role boundary failed';end if;
 before_count:=(public.game_players_admin()->'stats'->>'accounts')::integer;
 for i in 1..30 loop
  uid:=gen_random_uuid();if i=1 then u1:=uid;end if;if i=2 then u2:=uid;end if;
  insert into auth.users(id,created_at,last_sign_in_at) values(uid,now()-i*interval '1 day',now()-i*interval '1 minute');
  insert into public.game_profiles(user_id,display_name,avatar_id) values(uid,'QA玩家名冊'||lpad(i::text,2,'0'),'male-1');
  delete from game_private.beta_participants where user_id=uid;
 end loop;
 first_page:=public.game_players_admin('QA玩家名冊','all',0,25);second_page:=public.game_players_admin('QA玩家名冊','all',25,25);
 if (first_page->>'total')::integer<>30 or jsonb_array_length(first_page->'players')<>25 or jsonb_array_length(second_page->'players')<>5 then raise exception 'pagination failed';end if;
 if first_page#>>'{players,0,user_id}'<>u1::text then raise exception 'stable recent ordering failed';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'players') a join jsonb_array_elements(second_page->'players') b on a->>'user_id'=b->>'user_id') then raise exception 'duplicate page member';end if;
 if (public.game_players_admin('%','all',0,25)->>'total')::integer<>0 then raise exception 'literal search failed';end if;
 if (public.game_players_admin('QA玩家名冊','no_profile',0,25)->>'total')::integer<>0 then raise exception 'profile filter failed';end if;
 if (public.game_players_admin('QA玩家名冊','feedback',0,25)->>'total')::integer<>0 then raise exception 'feedback filter failed';end if;
 select jsonb_agg(section_key) into read_keys from game_private.reading_sections where day_number=1;
 insert into game_private.journey_saves(user_id,revision,document,request_id) values(u1,1,jsonb_build_object('snapshot',jsonb_build_object('hero',jsonb_build_object('level',3),'annual',jsonb_build_object('read',read_keys,'notes',jsonb_build_object('1','PRIVATE_JOURNAL_SENTINEL')))),gen_random_uuid());
 result:=public.game_players_admin('QA玩家名冊01');
 if (result#>>'{players,0,reading_days}')::integer<>1 or (result#>>'{players,0,level}')::integer<>3 then raise exception 'cloud summary failed';end if;
 if result::text like '%PRIVATE_JOURNAL_SENTINEL%' then raise exception 'private journal leak';end if;
 if first_page#>>'{players,1,save_updated_at}' is not null or first_page#>>'{players,1,reading_days}' is not null then raise exception 'missing save misrepresented';end if;
 insert into game_private.beta_participants(user_id,first_seen_at) values(u1,now());
 insert into game_private.beta_feedback(user_id,request_id,state,category,body,page_path,screenshot_key,submitted_at) values(u1,gen_random_uuid(),'submitted','feedback','這是完整的測試回饋資料文字','/reading-adventure/','qa-only',now());
 insert into game_private.beta_feedback(user_id,request_id,state,category,body,page_path,screenshot_key) values(u2,gen_random_uuid(),'draft','feedback','','/reading-adventure/','qa-only');
 result:=public.game_players_admin('QA玩家名冊','feedback');
 if (result->>'total')::integer<>1 or result#>>'{players,0,feedback_count}'<>'1' or result#>>'{players,0,boost_started_at}' is not null then raise exception 'reward eligibility or no-side-effects failed';end if;
 result:=public.game_players_admin('QA玩家名冊','beta');if (result->>'total')::integer<>1 then raise exception 'beta filter failed';end if;
 delete from public.game_profiles where user_id=u2;
 result:=public.game_players_admin('','no_profile');if not exists(select 1 from jsonb_array_elements(result->'players') a where a->>'user_id'=u2::text) then raise exception 'unconfigured account missing';end if;
 if (public.game_players_admin()->'stats'->>'accounts')::integer<>before_count+30 then raise exception 'account total failed';end if;
 begin perform public.game_players_admin('','invalid');raise exception 'invalid query accepted';exception when raise_exception then if sqlerrm<>'INVALID_PLAYER_QUERY' then raise;end if;end;
end $$;
set local role service_role;
do $$ begin
 if (public.game_players_admin('QA玩家名冊')->>'total')::integer<>29 then raise exception 'service role RPC failed';end if;
end $$;
rollback;
select jsonb_build_object('ok',true,'checks',16,'fixtures','rolled back') as player_directory_validation;
