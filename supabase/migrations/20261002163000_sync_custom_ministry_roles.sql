begin;

alter table public.service_schedules
  add column if not exists custom_assignments jsonb not null default '{}'::jsonb;

alter table public.service_schedules
  drop constraint if exists service_schedules_custom_assignments_object;
alter table public.service_schedules
  add constraint service_schedules_custom_assignments_object
  check(jsonb_typeof(custom_assignments)='object');

alter table public.schedule_role_preferences
  drop constraint if exists schedule_role_preferences_key;
alter table public.schedule_role_preferences
  add constraint schedule_role_preferences_key check(
    role_key in ('speaker','worship_leader','tech_sound','tech_video','usher1','usher2','presider','prayer','sunday_school','sunday_school_ta','singers','keyboard','guitar','bass','drums','ushers','transport','communion','communion_bread','communion_cup','wed_prayer')
    or role_key ~ '^custom_[a-f0-9]{16}$'
  );

create or replace function public.sync_new_ministry_options_to_schedule_roles()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_label text;
  v_key text;
  v_order integer;
begin
  select coalesce(max(r.sort_order),0) into v_order
  from public.schedule_role_preferences r
  where r.church_id=new.church_id;

  for v_label in
    select trim(value)
    from jsonb_array_elements_text(new.options) as value
    where trim(value)<>''
      and not exists(
        select 1 from jsonb_array_elements_text(coalesce(old.options,'[]'::jsonb)) as old_value
        where trim(old_value)=trim(value)
      )
  loop
    v_key := 'custom_' || substr(md5(new.church_id || ':' || v_label),1,16);
    v_order := v_order + 10;
    insert into public.schedule_role_preferences(church_id,role_key,label,icon,is_visible,sort_order,updated_at)
    values(new.church_id,v_key,left(v_label,30),'🍽️',true,least(v_order,1000),now())
    on conflict(church_id,role_key) do update
      set label=excluded.label,is_visible=true,updated_at=now();
  end loop;
  return new;
end;
$$;

revoke all on function public.sync_new_ministry_options_to_schedule_roles() from public,anon,authenticated;

drop trigger if exists sync_new_ministry_options_to_schedule_roles on public.member_ministry_options;
create trigger sync_new_ministry_options_to_schedule_roles
after update of options on public.member_ministry_options
for each row execute function public.sync_new_ministry_options_to_schedule_roles();

insert into public.schedule_role_preferences(church_id,role_key,label,icon,is_visible,sort_order)
select m.church_id,
       'custom_' || substr(md5(m.church_id || ':愛宴服事'),1,16),
       '愛宴服事','🍽️',true,
       least(coalesce((select max(r.sort_order)+10 from public.schedule_role_preferences r where r.church_id=m.church_id),10),1000)
from public.member_ministry_options m
where m.options ? '愛宴服事'
on conflict(church_id,role_key) do update
set label=excluded.label,icon=excluded.icon,is_visible=true,updated_at=now();

create or replace function public.get_website_weekly_data(
  p_church text default 'M+',
  p_service_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_bulletin public.website_weekly_bulletins%rowtype;
  v_schedule jsonb;
  v_next_schedule jsonb;
  v_roles jsonb;
  v_can_edit boolean := false;
begin
  if p_church not in ('M+','SHiNE') then return null; end if;
  v_can_edit := auth.uid() is not null and church_auth.allowed(p_church,'pastoral_chats');

  if p_service_date is not null then
    select * into v_bulletin from public.website_weekly_bulletins b
    where b.church_id=p_church and b.service_date=p_service_date
      and (b.status='published' or v_can_edit)
    limit 1;
  elsif v_can_edit then
    select * into v_bulletin from public.website_weekly_bulletins b
    where b.church_id=p_church and b.status='published'
    order by b.service_date desc limit 1;
  else
    select * into v_bulletin from public.website_weekly_bulletins b
    where b.church_id=p_church and b.status='published' and b.service_date<=current_date
    order by b.service_date desc limit 1;
    if v_bulletin.id is null then
      select * into v_bulletin from public.website_weekly_bulletins b
      where b.church_id=p_church and b.status='published'
      order by b.service_date asc limit 1;
    end if;
  end if;

  if v_bulletin.id is null and not v_can_edit then return null; end if;

  if v_bulletin.id is not null then
    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=v_bulletin.service_date::text
    group by s.id;

    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_next_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=(v_bulletin.service_date + 7)::text
    group by s.id;
  elsif p_service_date is not null and v_can_edit then
    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=p_service_date::text
    group by s.id;

    select jsonb_build_object('event',s.event) || coalesce(
      jsonb_object_agg(r.role_key,coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key))
        filter(where r.role_key is not null and coalesce(s.custom_assignments->r.role_key,to_jsonb(s)->r.role_key) is not null),'{}'::jsonb)
      into v_next_schedule
    from public.service_schedules s
    left join public.schedule_role_preferences r on r.church_id=s.church_id and r.is_visible
    where s.church_id=p_church
      and replace(s.service_date,'/','-')=(p_service_date + 7)::text
    group by s.id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'role_key',r.role_key,
        'label',r.label,
        'icon',r.icon,
        'sort_order',r.sort_order
      ) order by r.sort_order,r.role_key
    ),
    '[]'::jsonb
  ) into v_roles
  from public.schedule_role_preferences r
  where r.church_id=p_church and r.is_visible;

  return jsonb_build_object(
    'bulletin',case when v_bulletin.id is null then null else jsonb_build_object(
      'id',v_bulletin.id,
      'church_id',v_bulletin.church_id,
      'service_date',v_bulletin.service_date,
      'title',v_bulletin.title,
      'subtitle',v_bulletin.subtitle,
      'service_time',v_bulletin.service_time,
      'hero_image_path',v_bulletin.hero_image_path,
      'sections',v_bulletin.sections,
      'status',v_bulletin.status,
      'version',v_bulletin.version,
      'updated_at',v_bulletin.updated_at,
      'published_at',v_bulletin.published_at
    ) end,
    'schedule',v_schedule,
    'next_schedule',v_next_schedule,
    'schedule_roles',v_roles
  );
end;
$$;

revoke all on function public.get_website_weekly_data(text,date) from public;
grant execute on function public.get_website_weekly_data(text,date) to anon,authenticated;


commit;
