create table if not exists church_auth.service_ministry_scopes (
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id text not null check (church_id in ('M+','SHiNE')),
  ministry_key text not null check (ministry_key in ('media','worship','welcome','children','all')),
  created_at timestamptz not null default now(),
  primary key(user_id,church_id,ministry_key)
);
revoke all on church_auth.service_ministry_scopes from public,anon,authenticated;
grant all on church_auth.service_ministry_scopes to service_role;

create or replace function public.get_service_signup_admin(p_church text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_scopes text[]; v_manage boolean;
begin
  if auth.uid() is null or not exists(select 1 from church_auth.accounts a where a.user_id=auth.uid() and a.is_active) then raise exception 'forbidden'; end if;
  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false);
  select coalesce(array_agg(s.ministry_key),'{}') into v_scopes from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church;
  if not v_manage and cardinality(v_scopes)=0 then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'can_manage',v_manage,'scopes',to_jsonb(v_scopes),
    'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'starts_on',s.starts_on,'ends_on',s.ends_on,'status',s.status,'opens_at',s.opens_at,'closes_at',s.closes_at) order by s.starts_on desc) from public.service_signup_seasons s where s.church_id=p_church),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(jsonb_build_object('id',sl.id,'season_id',sl.season_id,'service_date',sl.service_date,'ministry_key',sl.ministry_key,'role_key',sl.role_key,'capacity',sl.capacity,'is_open',sl.is_open,'registrations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'member_id',r.member_id,'name',m.name,'status',r.status,'queue_number',r.queue_number,'created_at',r.created_at) order by case r.status when 'confirmed' then 0 when 'registered' then 1 else 2 end,r.queue_number,r.created_at) from public.service_signup_registrations r join public.members m on m.id=r.member_id where r.slot_id=sl.id and r.status in ('registered','waitlisted','confirmed')),'[]'::jsonb)) order by sl.service_date,sl.ministry_key,sl.role_key) from public.service_signup_slots sl where sl.church_id=p_church and (v_manage or 'all'=any(v_scopes) or sl.ministry_key=any(v_scopes))),'[]'::jsonb)
  );
end $$;

create or replace function public.create_service_signup_quarter(p_church text,p_year integer,p_quarter integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_start date;v_end date;v_id bigint;
begin
  if not (exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false)) then raise exception 'forbidden'; end if;
  if p_church not in ('M+','SHiNE') or p_year not between 2026 and 2100 or p_quarter not between 1 and 4 then raise exception 'invalid_quarter'; end if;
  v_start:=make_date(p_year,(p_quarter-1)*3+1,1);v_end:=(v_start+interval '3 months-1 day')::date;
  insert into public.service_signup_seasons(church_id,title,starts_on,ends_on,status,created_by)
  values(p_church,p_year||' 年第 '||p_quarter||' 季主日服事',v_start,v_end,'draft',auth.uid()) returning id into v_id;
  insert into public.service_signup_slots(season_id,church_id,service_date,ministry_key,role_key,capacity)
  select v_id,p_church,d::date,x.ministry,x.role_key,1 from generate_series(v_start,v_end,interval '1 day') d
  cross join (values
    ('media','sound'),('media','projection_director'),('media','lighting'),
    ('worship','worship_leader'),('worship','assistant_worship_leader'),('worship','keyboard_1'),('worship','keyboard_2'),('worship','drums'),('worship','guitar'),('worship','bass'),('worship','singer_1'),('worship','singer_2'),('worship','singer_3'),
    ('welcome','welcome_1'),('welcome','welcome_2'),('children','children_teacher'),('children','children_assistant')
  ) x(ministry,role_key) where extract(isodow from d)=7;
  return v_id;
end $$;

create or replace function public.update_service_signup_season(p_church text,p_season bigint,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not (exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false)) then raise exception 'forbidden'; end if;
  if p_status not in ('draft','open','closed','archived') then raise exception 'invalid_status'; end if;
  update public.service_signup_seasons set status=p_status,updated_at=now() where id=p_season and church_id=p_church;
  return found;
end $$;

create or replace function public.update_service_signup_slot(p_church text,p_slot bigint,p_capacity integer,p_open boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_ministry text;v_manage boolean;v_allowed boolean;
begin
  select ministry_key into v_ministry from public.service_signup_slots where id=p_slot and church_id=p_church;
  v_manage:=exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) or coalesce((select p.can_manage from church_auth.account_feature_permissions p where p.user_id=auth.uid() and p.church_id=p_church and p.feature_key='schedules'),false);
  v_allowed:=v_manage or exists(select 1 from church_auth.service_ministry_scopes s where s.user_id=auth.uid() and s.church_id=p_church and s.ministry_key in ('all',v_ministry));
  if not v_allowed then raise exception 'forbidden'; end if;
  if p_capacity not between 1 and 20 then raise exception 'invalid_capacity'; end if;
  update public.service_signup_slots set capacity=p_capacity,is_open=p_open,updated_at=now() where id=p_slot and church_id=p_church;
  return found;
end $$;

revoke all on function public.get_service_signup_admin(text),public.create_service_signup_quarter(text,integer,integer),public.update_service_signup_season(text,bigint,text),public.update_service_signup_slot(text,bigint,integer,boolean) from public,anon;
grant execute on function public.get_service_signup_admin(text),public.create_service_signup_quarter(text,integer,integer),public.update_service_signup_season(text,bigint,text),public.update_service_signup_slot(text,bigint,integer,boolean) to authenticated,service_role;
