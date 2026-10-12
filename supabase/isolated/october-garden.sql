-- Apply only to the existing October test project svwgfgyxxgbqabosriom.
-- The original participants, reading progress and journals remain canonical.
create table public.tree_reading_october_game_states (
  line_subject text primary key references public.tree_reading_october_test_participants(line_subject),
  state jsonb not null check(jsonb_typeof(state)='object'),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.tree_reading_october_game_states enable row level security;
revoke all on public.tree_reading_october_game_states from public,anon,authenticated;
grant select,insert,update on public.tree_reading_october_game_states to service_role;

-- The custom LINE-verifying Edge Function is the only caller. Saving the game
-- and the original reading record is one transaction, guarded by the version.
create or replace function public.october_garden_save(p_subject text,p_version bigint,p_state jsonb,p_action text,p_day date default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_record jsonb;v_note text;v_start date;v_today date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if p_subject !~ '^U[0-9a-f]{32}$' or jsonb_typeof(p_state)<>'object' or octet_length(p_state::text)>4000000 then raise exception 'invalid_request';end if;
 select reading_start_date into v_start from public.tree_reading_october_test_participants where line_subject=p_subject for update;
 if v_start is null then raise exception 'join_required';end if;
 if p_action not in ('me','read','water','journal','avatar','equip','place','move','hit','engage','retreat','attack') then raise exception 'invalid_action';end if;
 if p_action in ('read','water','journal') and (p_day is null or p_day<'2026-10-01' or p_day>'2026-10-31' or p_day<v_start or p_day>v_today or p_day<v_today-7) then raise exception 'date_not_allowed';end if;
 update public.tree_reading_october_game_states set state=p_state,version=version+1,updated_at=now() where line_subject=p_subject and version=p_version;
 if not found then return false;end if;
 if p_action in ('read','water') then
  select value into v_record from jsonb_array_elements(p_state->'records') where value->>'reading_date'=p_day::text;
  if v_record is null then raise exception 'read_first';end if;
  insert into public.tree_reading_october_test_progress(line_subject,reading_date,completion_type,completed_at,watered_at)
   values(p_subject,p_day,v_record->>'completion_type',(v_record->>'completed_at')::timestamptz,(v_record->>'watered_at')::timestamptz)
   on conflict(line_subject,reading_date) do update set watered_at=coalesce(public.tree_reading_october_test_progress.watered_at,excluded.watered_at);
 elsif p_action='journal' then
  if not exists(select 1 from public.tree_reading_october_test_progress where line_subject=p_subject and reading_date=p_day) then raise exception 'read_first';end if;
  select value->>'note' into v_note from jsonb_array_elements(p_state->'notes') where value->>'reading_date'=p_day::text;
  if v_note is null or btrim(v_note)='' or length(v_note)>500 then raise exception 'invalid_note';end if;
  insert into public.tree_reading_october_test_journal(line_subject,reading_date,note,passage,saved_at)
   values(p_subject,p_day,v_note,'箴言 '||extract(day from p_day)::text||' 章',now())
   on conflict(line_subject,reading_date) do update set note=excluded.note,passage=excluded.passage,saved_at=excluded.saved_at;
 end if;
 return true;
end $$;
revoke all on function public.october_garden_save(text,bigint,jsonb,text,date) from public,anon,authenticated;
grant execute on function public.october_garden_save(text,bigint,jsonb,text,date) to service_role;
