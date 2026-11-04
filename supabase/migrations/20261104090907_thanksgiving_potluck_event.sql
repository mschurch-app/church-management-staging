-- Extend the existing Church OS activity master; no basketball/payment changes.
create schema if not exists potluck;
-- Narrow read privileges for the verified service-side RBAC gate (no client grants).
grant select(user_id,is_active) on church_auth.accounts to service_role;
grant select(user_id) on church_auth.owners to service_role;
grant select(user_id,church_id,feature_key,can_view,can_export,can_manage) on church_auth.account_feature_permissions to service_role;
revoke all on schema potluck from public,anon,authenticated;
grant usage on schema potluck to service_role;
create unique index if not exists camps_potluck_slug on public.camps ((metadata->>'slug')) where metadata->>'type'='potluck';
create table potluck.settings (
 event_id uuid primary key references public.camps(id),
 slug text not null unique,
 default_servings numeric not null default 10 check(default_servings>0),
 registration_deadline timestamptz,
 edit_deadline timestamptz,
 allow_user_edit boolean not null default true,
 archived boolean not null default false,
 version integer not null default 1,
 theme_config jsonb not null default '{}'::jsonb
);
create table potluck.categories (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references potluck.settings(event_id),
 name text not null check(length(name) between 1 and 40),icon text not null,
 target_dishes integer not null check(target_dishes>0),sort_order integer not null,
 unique(event_id,sort_order),unique(id,event_id)
);
create table potluck.households (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references potluck.settings(event_id),
 identity_key text not null,allowance integer not null default 1 check(allowance between 1 and 100),
 unique(event_id,identity_key),unique(id,event_id)
);
create table potluck.participants (
 event_id uuid not null references potluck.settings(event_id),subject text not null,
 household_id uuid not null,
 primary key(event_id,subject),foreign key(household_id,event_id) references potluck.households(id,event_id)
);
create table potluck.dishes (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references potluck.settings(event_id),
 category_id uuid not null,household_id uuid not null,owner_subject text not null,
 display_name text not null check(length(btrim(display_name)) between 1 and 60),
 dish_name text not null check(length(btrim(dish_name)) between 1 and 80),
 servings numeric not null check(servings>0 and servings not in('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 notes text not null default '' check(length(notes)<=1000),
 allergen_info text not null default '' check(length(allergen_info)<=300),
 storage_requirements text not null default '' check(length(storage_requirements)<=300),
 image_path text, status text not null default 'active' check(status in('active','cancelled')),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(category_id,event_id) references potluck.categories(id,event_id),
 foreign key(household_id,event_id) references potluck.households(id,event_id)
);
create index potluck_dishes_catalog on potluck.dishes(event_id,status,category_id);
create index potluck_dishes_owner on potluck.dishes(event_id,owner_subject);
create index potluck_dishes_household on potluck.dishes(household_id,status);
create table potluck.requests (
 event_id uuid not null references potluck.settings(event_id),actor text not null,request_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(event_id,actor,request_id)
);
create table potluck.audit (
 id bigint generated always as identity primary key,event_id uuid not null references potluck.settings(event_id),
 actor text not null,action text not null,dish_id uuid,created_at timestamptz not null default now(),
 detail jsonb not null default '{}'::jsonb
);
create index potluck_audit_event on potluck.audit(event_id,created_at);
do $$ declare t text;begin
 foreach t in array array['settings','categories','households','participants','dishes','requests','audit'] loop
  execute format('alter table potluck.%I enable row level security',t);
  execute format('revoke all on potluck.%I from public,anon,authenticated',t);
  execute format('grant all on potluck.%I to service_role',t);
 end loop;
end $$;
grant usage,select on all sequences in schema potluck to service_role;

-- This read-only projection intentionally omits LINE subjects and household IDs.
create function potluck.view_event(p_event uuid,p_subject text default null,p_admin boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'event',jsonb_build_object('id',c.id,'name',c.name,'date',c.starts_on,'slug',s.slug,
  'registration_open',case when p_admin then c.registration_open else c.registration_open and not s.archived and (s.registration_deadline is null or now()<=s.registration_deadline) end,
  'registration_deadline',s.registration_deadline,'edit_deadline',s.edit_deadline,'allow_user_edit',case when p_admin then s.allow_user_edit else s.allow_user_edit and not s.archived and (s.edit_deadline is null or now()<=s.edit_deadline) end,
  'archived',s.archived,'default_servings',s.default_servings,'version',s.version),
 'categories',(select coalesce(jsonb_agg(x order by x.sort_order),'[]'::jsonb) from(
  select cat.id,cat.name,cat.icon,cat.target_dishes,cat.sort_order,count(d.id) as dish_count,coalesce(sum(d.servings),0) as servings
  from potluck.categories cat left join potluck.dishes d on d.category_id=cat.id and d.status='active'
  where cat.event_id=p_event group by cat.id) x),
 'dishes',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'category_id',d.category_id,'display_name',d.display_name,
  'dish_name',d.dish_name,'servings',d.servings,'allergen_info',d.allergen_info,'storage_requirements',d.storage_requirements,'image_path',d.image_path) order by d.created_at),'[]'::jsonb)
  from potluck.dishes d where d.event_id=p_event and d.status='active'),
 'mine',(select coalesce(jsonb_agg((to_jsonb(d)-'owner_subject'-'household_id') order by d.created_at),'[]'::jsonb) from potluck.dishes d where d.event_id=p_event and d.owner_subject=p_subject and d.status='active'),
 'household_registered',exists(select 1 from potluck.dishes d join potluck.participants p on p.household_id=d.household_id and p.event_id=d.event_id where p.event_id=p_event and p.subject=p_subject and d.status='active'),
 'admin_dishes',case when p_admin then (select coalesce(jsonb_agg(to_jsonb(d)-'owner_subject' order by d.created_at),'[]'::jsonb) from potluck.dishes d where d.event_id=p_event) else null end
) from public.camps c join potluck.settings s on s.event_id=c.id where c.id=p_event and c.entity_key='mplus' and c.metadata->>'type'='potluck';
$$;

-- Called only by the Edge Function after provider token verification.
create function public.potluck_action(p_slug text,p_subject text,p_action text,p_data jsonb default '{}'::jsonb,p_admin uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e uuid;s potluck.settings%rowtype;c public.camps%rowtype;d potluck.dishes%rowtype;
 h uuid;family_key text;req uuid;previous potluck.requests%rowtype;result jsonb;is_admin boolean:=false;wanted text;
begin
 select event_id into e from potluck.settings where slug=p_slug;
 if e is null then raise exception 'event_not_found';end if;
 if p_admin is not null then
  is_admin:=exists(select 1 from church_auth.accounts a where a.user_id=p_admin and a.is_active)
   and (exists(select 1 from church_auth.owners o where o.user_id=p_admin)
    or exists(select 1 from church_auth.account_feature_permissions a where a.user_id=p_admin and a.church_id='M+' and a.feature_key='potluck' and a.can_view
       and case when p_action='admin_get' then true when p_action='export' then a.can_export else a.can_manage end));
  if not is_admin then raise exception 'forbidden';end if;
 elsif p_subject is not null and p_subject !~ '^U[0-9a-f]{32}$' then raise exception 'login_required';end if;
 if p_action='public' then return potluck.view_event(e);end if;
 if p_admin is null and p_subject is null then raise exception 'login_required';end if;
 if p_action in('get','admin_get','export') then
  if p_action<>'get' and not is_admin then raise exception 'forbidden';end if;
  return potluck.view_event(e,p_subject,is_admin);
 end if;
 -- Serialise writes per event: capacity, household limit, request dedupe and cancellation agree.
 select * into s from potluck.settings where event_id=e for update;
 select * into c from public.camps where id=e for update;
 req:=(p_data->>'request_id')::uuid;
 if req is null then raise exception 'request_id_required';end if;
 wanted:=coalesce(p_admin::text,p_subject);
 select * into previous from potluck.requests where event_id=e and actor=wanted and request_id=req;
 if found then
  if previous.payload is distinct from jsonb_build_object('action',p_action,'data',p_data) then raise exception 'request_conflict';end if;
  return previous.result;
 end if;
 if p_action like 'admin_%' then
  if not is_admin then raise exception 'forbidden';end if;
  if p_action='admin_settings' then
   if s.version is distinct from (p_data->>'version')::integer then raise exception 'stale_version';end if;
   update potluck.settings set registration_deadline=nullif(p_data->>'registration_deadline','')::timestamptz,
    edit_deadline=nullif(p_data->>'edit_deadline','')::timestamptz,allow_user_edit=coalesce((p_data->>'allow_user_edit')::boolean,true),
    archived=coalesce((p_data->>'archived')::boolean,false),version=version+1 where event_id=e;
   update public.camps set registration_open=coalesce((p_data->>'registration_open')::boolean,false) where id=e;
   update potluck.categories cat set target_dishes=(x.value->>'target')::integer
     from jsonb_array_elements(coalesce(p_data->'targets','[]'::jsonb)) x where cat.event_id=e and cat.id=(x.value->>'id')::uuid;
  elsif p_action='admin_allow_extra' then
   update potluck.households set allowance=least(100,allowance+1) where event_id=e and id=(p_data->>'household_id')::uuid;
   if not found then raise exception 'not_found';end if;
  elsif p_action='admin_dish' then
   select * into d from potluck.dishes where id=(p_data->>'id')::uuid and event_id=e for update;
   if not found then raise exception 'not_found';end if;
   if d.version is distinct from (p_data->>'version')::integer then raise exception 'stale_version';end if;
   update potluck.dishes set display_name=btrim(p_data->>'display_name'),dish_name=btrim(p_data->>'dish_name'),category_id=(p_data->>'category_id')::uuid,
    servings=(p_data->>'servings')::numeric,notes=coalesce(p_data->>'notes',''),allergen_info=coalesce(p_data->>'allergen_info',''),
    storage_requirements=coalesce(p_data->>'storage_requirements',''),status=coalesce(p_data->>'status','active'),version=version+1,updated_at=now() where id=d.id;
  else raise exception 'invalid_action';end if;
 elsif p_action in('save','cancel') then
  if s.archived then raise exception 'event_closed';end if;
  if nullif(p_data->>'id','') is not null then
   select * into d from potluck.dishes where id=(p_data->>'id')::uuid and event_id=e and owner_subject=p_subject and status='active' for update;
   if not found then raise exception 'not_found';end if;
   if not s.allow_user_edit or (s.edit_deadline is not null and now()>s.edit_deadline) then raise exception 'editing_closed';end if;
   if d.version is distinct from (p_data->>'version')::integer then raise exception 'stale_version';end if;
  else
   if p_action='cancel' then raise exception 'not_found';end if;
   if not c.registration_open or (s.registration_deadline is not null and now()>s.registration_deadline) then raise exception 'registration_closed';end if;
   select household_id into h from potluck.participants where event_id=e and subject=p_subject;
   if h is null then
    -- Approved roster family is server data, never a front-end nickname or supplied userId.
    select 'roster-family:'||btrim(m.family) into family_key from church_auth.member_bindings b join public.members m on m.id=b.member_id and m.church_id='M+'
     where b.church_id='M+' and b.login_channel_id='2011645391' and b.line_subject=p_subject and b.active and nullif(btrim(m.family),'') is not null limit 1;
    family_key:=coalesce(family_key,'line:'||p_subject);
    insert into potluck.households(event_id,identity_key) values(e,family_key) on conflict(event_id,identity_key) do nothing;
    select id into h from potluck.households where event_id=e and identity_key=family_key;
    insert into potluck.participants(event_id,subject,household_id) values(e,p_subject,h);
   end if;
   if (select count(*) from potluck.dishes where household_id=h and status='active')>=(select allowance from potluck.households where id=h) then raise exception 'household_limit';end if;
  end if;
  if p_action='cancel' then
   update potluck.dishes set status='cancelled',version=version+1,updated_at=now() where id=d.id returning * into d;
  else
   if nullif(p_data->>'image_path','') is not null and (p_data->>'image_path') !~ ('^'||e::text||'/[0-9a-f-]+[.]jpg$') then raise exception 'invalid_image';end if;
   if d.id is null then
    insert into potluck.dishes(event_id,category_id,household_id,owner_subject,display_name,dish_name,servings,notes,allergen_info,storage_requirements,image_path)
    values(e,(p_data->>'category_id')::uuid,h,p_subject,btrim(p_data->>'display_name'),btrim(p_data->>'dish_name'),(p_data->>'servings')::numeric,
     coalesce(p_data->>'notes',''),coalesce(p_data->>'allergen_info',''),coalesce(p_data->>'storage_requirements',''),nullif(p_data->>'image_path','')) returning * into d;
   else
    update potluck.dishes set category_id=(p_data->>'category_id')::uuid,display_name=btrim(p_data->>'display_name'),dish_name=btrim(p_data->>'dish_name'),servings=(p_data->>'servings')::numeric,
     notes=coalesce(p_data->>'notes',''),allergen_info=coalesce(p_data->>'allergen_info',''),storage_requirements=coalesce(p_data->>'storage_requirements',''),
     image_path=case when p_data?'image_path' then nullif(p_data->>'image_path','') else image_path end,version=version+1,updated_at=now() where id=d.id returning * into d;
   end if;
  end if;
 else raise exception 'invalid_action';end if;
 insert into potluck.audit(event_id,actor,action,dish_id,detail) values(e,wanted,p_action,d.id,jsonb_build_object('version',d.version,'request_id',req));
 result:=jsonb_build_object('saved',true,'id',d.id,'version',d.version);
 insert into potluck.requests(event_id,actor,request_id,payload,result) values(e,wanted,req,jsonb_build_object('action',p_action,'data',p_data),result);
 return result;
end $$;
revoke all on all functions in schema potluck from public,anon,authenticated;
grant execute on all functions in schema potluck to service_role;
revoke all on function public.potluck_action(text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.potluck_action(text,text,text,jsonb,uuid) to service_role;

with event as (
 insert into public.camps(entity_key,name,starts_on,ends_on,registration_open,metadata)
 values('mplus','感恩美食大冒險','2026-11-22','2026-11-22',true,'{"type":"potluck","slug":"thanksgiving-2026","timezone":"Asia/Taipei"}') returning id
) insert into potluck.settings(event_id,slug) select id,'thanksgiving-2026' from event;
insert into potluck.categories(event_id,name,icon,target_dishes,sort_order)
select s.event_id,x.name,x.icon,x.target,x.n from potluck.settings s cross join(values
 ('主菜／肉類','main',6,1),('蔬菜／配菜','vegetable',5,2),('飯麵／主食','rice',5,3),('湯品','soup',3,4),('甜點／水果','dessert',5,5),('飲料','drink',4,6)) x(name,icon,target,n) where s.slug='thanksgiving-2026';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('potluck-dishes','potluck-dishes',false,2621440,array['image/jpeg']);
-- No anonymous/authenticated bucket policy: only verified service-side uploads and signed reads.
