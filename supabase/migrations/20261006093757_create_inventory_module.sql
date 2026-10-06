-- Independent inventory module for M+, SHiNE and the M+ after-school program.
alter table church_auth.grants drop constraint if exists grants_permission_check;
alter table church_auth.grants add constraint grants_permission_check check (permission in (
  'attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces',
  'newcomer_care','tree_reading_admin','binding_review','notification_settings',
  'website_weekly','website_group_resources','inventory'
));

create or replace function church_auth.role_permissions(target_role text)
returns text[] language sql immutable set search_path='' as $$
  select case target_role
    when 'pastor' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']::text[]
    when 'pastor_spouse' then array['attendance','groups','members','pastoral_chats','private_prayers','schedules','spaces','newcomer_care','tree_reading_admin','binding_review','notification_settings','website_weekly','website_group_resources','inventory']::text[]
    when 'administrator' then array['attendance','groups','members','schedules','spaces','newcomer_care','binding_review','notification_settings','inventory']::text[]
    when 'group_leader' then array['attendance','groups','members']::text[]
    when 'care' then array['members','pastoral_chats','private_prayers','newcomer_care']::text[]
    when 'facilities' then array['spaces','inventory']::text[]
    when 'custom' then array[]::text[]
    else null::text[] end;
$$;

create or replace function public.set_admin_account_access_v3(p_user uuid,p_active boolean,p_grants jsonb,p_roles jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item jsonb; target_church text; target_role text; expected text[]; church_count integer;
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if exists(select 1 from church_auth.owners o where o.user_id=p_user) then raise exception 'owner_immutable'; end if;
  if jsonb_typeof(p_grants)<>'array' or jsonb_array_length(p_grants)>24 or jsonb_typeof(p_roles)<>'array' or jsonb_array_length(p_roles)>1 then raise exception 'invalid_access'; end if;
  select count(distinct church_id) into church_count from (
    select value->>'church_id' church_id from jsonb_array_elements(p_grants)
    union all select value->>'church_id' from jsonb_array_elements(p_roles)
  ) selected where church_id is not null;
  if church_count>1 then raise exception 'one_church_only'; end if;
  for item in select value from jsonb_array_elements(p_grants) loop
    if item->>'church_id' not in ('M+','SHiNE') or item->>'permission' not in (
      'members','attendance','groups','schedules','private_prayers','pastoral_chats','spaces',
      'newcomer_care','tree_reading_admin','binding_review','notification_settings',
      'website_weekly','website_group_resources','inventory'
    ) then raise exception 'invalid_grant'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_roles) loop
    target_church:=item->>'church_id'; target_role:=item->>'role_key';
    if target_church not in ('M+','SHiNE') or church_auth.role_permissions(target_role) is null then raise exception 'invalid_role'; end if;
    if not exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church) then raise exception 'role_without_grants'; end if;
    if target_role<>'custom' then
      expected:=church_auth.role_permissions(target_role);
      if exists(select 1 from unnest(expected) permission where not exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church and g->>'permission'=permission))
         or exists(select 1 from jsonb_array_elements(p_grants) g where g->>'church_id'=target_church and not(g->>'permission'=any(expected))) then raise exception 'role_grants_mismatch'; end if;
    end if;
  end loop;
  if exists(select 1 from (select distinct g->>'church_id' church_id from jsonb_array_elements(p_grants) g) x where not exists(select 1 from jsonb_array_elements(p_roles) r where r->>'church_id'=x.church_id)) then raise exception 'missing_role'; end if;
  update church_auth.accounts set is_active=p_active,updated_at=now() where user_id=p_user;
  if not found then raise exception 'account_not_found'; end if;
  delete from church_auth.grants where user_id=p_user;
  insert into church_auth.grants(user_id,church_id,permission) select distinct p_user,x.value->>'church_id',x.value->>'permission' from jsonb_array_elements(p_grants) x(value);
  delete from church_auth.account_roles where user_id=p_user;
  insert into church_auth.account_roles(user_id,church_id,role_key) select p_user,x.value->>'church_id',x.value->>'role_key' from jsonb_array_elements(p_roles) x(value);
  return true;
end $$;
revoke all on function public.set_admin_account_access_v3(uuid,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.set_admin_account_access_v3(uuid,boolean,jsonb,jsonb) to authenticated,service_role;

create or replace function public.inventory_scope_allowed(p_scope text)
returns boolean language sql stable security invoker set search_path='' as $$
  select case
    when p_scope in ('M+','MSCHOOL') then church_auth.allowed('M+','inventory')
    when p_scope='SHiNE' then church_auth.allowed('SHiNE','inventory')
    else false end;
$$;
revoke all on function public.inventory_scope_allowed(text) from public,anon;
grant execute on function public.inventory_scope_allowed(text) to authenticated,service_role;

create table public.inventory_locations(
  id uuid primary key default gen_random_uuid(),
  scope text not null check(scope in ('M+','MSCHOOL','SHiNE')),
  parent_id uuid references public.inventory_locations(id) on delete restrict,
  name text not null check(char_length(trim(name)) between 1 and 100),
  location_type text not null default 'area' check(location_type in ('building','floor','room','cabinet','shelf','box','area')),
  photo_path text,
  notes text check(char_length(notes)<=2000),
  sort_order integer not null default 100,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index inventory_locations_unique_root on public.inventory_locations(scope,lower(name)) where parent_id is null and archived_at is null;
create unique index inventory_locations_unique_child on public.inventory_locations(scope,parent_id,lower(name)) where parent_id is not null and archived_at is null;
create index inventory_locations_scope_idx on public.inventory_locations(scope,sort_order,name);

create table public.inventory_items(
  id uuid primary key default gen_random_uuid(),
  scope text not null check(scope in ('M+','MSCHOOL','SHiNE')),
  location_id uuid references public.inventory_locations(id) on delete restrict,
  name text not null check(char_length(trim(name)) between 1 and 120),
  category text not null default '其他' check(char_length(category)<=80),
  brand text check(char_length(brand)<=100),model text check(char_length(model)<=120),
  specifications text check(char_length(specifications)<=3000),
  unit text not null default '個' check(char_length(unit)<=20),
  total_quantity integer not null default 0 check(total_quantity>=0),
  minimum_quantity integer not null default 0 check(minimum_quantity>=0),
  status text not null default 'available' check(status in ('available','maintenance','damaged','missing_parts','retired','lost')),
  management_type text not null default 'quantity' check(management_type in ('quantity','asset')),
  asset_number text,serial_number text,warranty_until date,purchased_on date,purchase_price numeric(12,2),supplier text,
  primary_photo_path text,
  notes text check(char_length(notes)<=4000),
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index inventory_items_scope_idx on public.inventory_items(scope,category,name) where archived_at is null;
create index inventory_items_location_idx on public.inventory_items(location_id) where archived_at is null;
create unique index inventory_items_asset_number_unique on public.inventory_items(scope,asset_number) where asset_number is not null and archived_at is null;

create table public.inventory_loans(
  id uuid primary key default gen_random_uuid(),item_id uuid not null references public.inventory_items(id) on delete restrict,
  borrower_name text not null check(char_length(trim(borrower_name)) between 1 and 100),borrower_unit text,contact text,purpose text,
  quantity integer not null check(quantity>0),returned_quantity integer not null default 0 check(returned_quantity>=0 and returned_quantity<=quantity),
  loaned_on date not null default current_date,due_on date,returned_at timestamptz,
  checkout_condition text,return_condition text,notes text check(char_length(notes)<=3000),
  status text not null default 'borrowed' check(status in ('borrowed','partial','returned','overdue')),
  created_by uuid not null default auth.uid() references auth.users(id),updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index inventory_loans_open_idx on public.inventory_loans(item_id,due_on) where status in ('borrowed','partial','overdue');

create table public.inventory_movements(
  id bigint generated always as identity primary key,item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type text not null check(movement_type in ('initial','purchase','consume','count_increase','count_decrease','damaged','lost','retired','checkout','return','other')),
  quantity_delta integer not null,quantity_before integer not null,quantity_after integer not null,
  reason text not null check(char_length(trim(reason)) between 1 and 500),notes text check(char_length(notes)<=2000),loan_id uuid references public.inventory_loans(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now()
);
create index inventory_movements_item_idx on public.inventory_movements(item_id,created_at desc);

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_loans enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_locations_select on public.inventory_locations for select to authenticated using((select public.inventory_scope_allowed(scope)));
create policy inventory_locations_insert on public.inventory_locations for insert to authenticated with check((select public.inventory_scope_allowed(scope)) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy inventory_locations_update on public.inventory_locations for update to authenticated using((select public.inventory_scope_allowed(scope))) with check((select public.inventory_scope_allowed(scope)) and updated_by=(select auth.uid()));
create policy inventory_items_select on public.inventory_items for select to authenticated using((select public.inventory_scope_allowed(scope)));
create policy inventory_items_insert on public.inventory_items for insert to authenticated with check((select public.inventory_scope_allowed(scope)) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy inventory_items_update on public.inventory_items for update to authenticated using((select public.inventory_scope_allowed(scope))) with check((select public.inventory_scope_allowed(scope)) and updated_by=(select auth.uid()));
create policy inventory_loans_select on public.inventory_loans for select to authenticated using(exists(select 1 from public.inventory_items i where i.id=item_id and public.inventory_scope_allowed(i.scope)));
create policy inventory_loans_insert on public.inventory_loans for insert to authenticated with check(created_by=(select auth.uid()) and updated_by=(select auth.uid()) and exists(select 1 from public.inventory_items i where i.id=item_id and public.inventory_scope_allowed(i.scope)));
create policy inventory_loans_update on public.inventory_loans for update to authenticated using(exists(select 1 from public.inventory_items i where i.id=item_id and public.inventory_scope_allowed(i.scope))) with check(updated_by=(select auth.uid()) and exists(select 1 from public.inventory_items i where i.id=item_id and public.inventory_scope_allowed(i.scope)));
create policy inventory_movements_select on public.inventory_movements for select to authenticated using(exists(select 1 from public.inventory_items i where i.id=item_id and public.inventory_scope_allowed(i.scope)));
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.inventory_items i where i.id=item_id and public.inventory_scope_allowed(i.scope)));

grant select,insert,update on public.inventory_locations,public.inventory_items,public.inventory_loans to authenticated;
grant select,insert on public.inventory_movements to authenticated;
grant usage,select on sequence public.inventory_movements_id_seq to authenticated;

create or replace function public.inventory_adjust_quantity(p_item uuid,p_new_quantity integer,p_reason text,p_notes text default null,p_type text default 'other')
returns public.inventory_items language plpgsql security invoker set search_path='' as $$
declare current public.inventory_items%rowtype; delta integer;
begin
  if p_new_quantity<0 or length(trim(coalesce(p_reason,'')))=0 or p_type not in ('purchase','consume','count_increase','count_decrease','damaged','lost','retired','other') then raise exception 'invalid_adjustment'; end if;
  select * into current from public.inventory_items where id=p_item for update;
  if current.id is null or not public.inventory_scope_allowed(current.scope) then raise exception 'forbidden'; end if;
  delta:=p_new_quantity-current.total_quantity;
  update public.inventory_items set total_quantity=p_new_quantity,updated_by=auth.uid(),updated_at=now() where id=p_item returning * into current;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,notes,created_by) values(p_item,p_type,delta,p_new_quantity-delta,p_new_quantity,trim(p_reason),nullif(trim(coalesce(p_notes,'')),''),auth.uid());
  return current;
end $$;

create or replace function public.inventory_checkout(p_item uuid,p_quantity integer,p_borrower text,p_unit text,p_contact text,p_purpose text,p_due date,p_condition text,p_notes text)
returns public.inventory_loans language plpgsql security invoker set search_path='' as $$
declare item public.inventory_items%rowtype; outstanding integer; result public.inventory_loans%rowtype;
begin
  if p_quantity<=0 or length(trim(coalesce(p_borrower,'')))=0 then raise exception 'invalid_loan'; end if;
  select * into item from public.inventory_items where id=p_item for update;
  if item.id is null or not public.inventory_scope_allowed(item.scope) then raise exception 'forbidden'; end if;
  select coalesce(sum(quantity-returned_quantity),0) into outstanding from public.inventory_loans where item_id=p_item and status in ('borrowed','partial','overdue');
  if item.total_quantity-outstanding<p_quantity then raise exception 'insufficient_inventory'; end if;
  insert into public.inventory_loans(item_id,borrower_name,borrower_unit,contact,purpose,quantity,due_on,checkout_condition,notes,created_by,updated_by)
  values(p_item,trim(p_borrower),nullif(trim(coalesce(p_unit,'')),''),nullif(trim(coalesce(p_contact,'')),''),nullif(trim(coalesce(p_purpose,'')),''),p_quantity,p_due,nullif(trim(coalesce(p_condition,'')),''),nullif(trim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()) returning * into result;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,notes,loan_id,created_by) values(p_item,'checkout',-p_quantity,item.total_quantity,item.total_quantity,'借出給：'||trim(p_borrower),p_notes,result.id,auth.uid());
  return result;
end $$;

create or replace function public.inventory_return(p_loan uuid,p_quantity integer,p_condition text,p_notes text)
returns public.inventory_loans language plpgsql security invoker set search_path='' as $$
declare loan public.inventory_loans%rowtype; item public.inventory_items%rowtype; remaining integer;
begin
  select * into loan from public.inventory_loans where id=p_loan for update;
  if loan.id is null then raise exception 'loan_not_found'; end if;
  select * into item from public.inventory_items where id=loan.item_id;
  if item.id is null or not public.inventory_scope_allowed(item.scope) then raise exception 'forbidden'; end if;
  remaining:=loan.quantity-loan.returned_quantity;
  if p_quantity<=0 or p_quantity>remaining then raise exception 'invalid_return'; end if;
  update public.inventory_loans set returned_quantity=returned_quantity+p_quantity,return_condition=nullif(trim(coalesce(p_condition,'')),''),notes=case when nullif(trim(coalesce(p_notes,'')),'') is null then notes else concat_ws(E'\n',notes,p_notes) end,status=case when returned_quantity+p_quantity=quantity then 'returned' else 'partial' end,returned_at=case when returned_quantity+p_quantity=quantity then now() else null end,updated_by=auth.uid(),updated_at=now() where id=p_loan returning * into loan;
  insert into public.inventory_movements(item_id,movement_type,quantity_delta,quantity_before,quantity_after,reason,notes,loan_id,created_by) values(item.id,'return',p_quantity,item.total_quantity,item.total_quantity,'歸還：'||loan.borrower_name,p_notes,loan.id,auth.uid());
  return loan;
end $$;
revoke all on function public.inventory_adjust_quantity(uuid,integer,text,text,text),public.inventory_checkout(uuid,integer,text,text,text,text,date,text,text),public.inventory_return(uuid,integer,text,text) from public,anon;
grant execute on function public.inventory_adjust_quantity(uuid,integer,text,text,text),public.inventory_checkout(uuid,integer,text,text,text,text,date,text,text),public.inventory_return(uuid,integer,text,text) to authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('inventory-media','inventory-media',false,8388608,array['image/jpeg','image/png','image/webp','image/heic']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy inventory_media_select on storage.objects for select to authenticated using(bucket_id='inventory-media' and (select public.inventory_scope_allowed((storage.foldername(name))[1])));
create policy inventory_media_insert on storage.objects for insert to authenticated with check(bucket_id='inventory-media' and (select public.inventory_scope_allowed((storage.foldername(name))[1])));
create policy inventory_media_update on storage.objects for update to authenticated using(bucket_id='inventory-media' and (select public.inventory_scope_allowed((storage.foldername(name))[1]))) with check(bucket_id='inventory-media' and (select public.inventory_scope_allowed((storage.foldername(name))[1])));
create policy inventory_media_delete on storage.objects for delete to authenticated using(bucket_id='inventory-media' and (select public.inventory_scope_allowed((storage.foldername(name))[1])));

insert into church_auth.grants(user_id,church_id,permission) select o.user_id,c.church_id,'inventory' from church_auth.owners o cross join (values('M+'),('SHiNE')) c(church_id) on conflict do nothing;
insert into church_auth.grants(user_id,church_id,permission)
select r.user_id,r.church_id,'inventory' from church_auth.account_roles r
where r.role_key in ('pastor','pastor_spouse','administrator','facilities') on conflict do nothing;

create or replace function public.set_admin_home_preferences(p_user uuid,p_church text,p_home_modules text[],p_notification_topics text[] default '{}')
returns boolean language plpgsql security definer set search_path='' as $$
declare
  allowed_modules constant text[]:=array[
    'members','newcomer_care','pastoral_workspace','private_prayers','pastoral_chats','attendance','groups','schedules','spaces','inventory',
    'website_weekly','website_group_resources','tree_reading_admin','binding_review','notification_settings',
    'school','school_checkin','school_schedules','school_rollcall','school_students','school_counseling','school_reports',
    'basketball','basketball_gamecenter','basketball_tactics','basketball_assignments','basketball_schedule','basketball_daily',
    'system_monitor','church_settings'
  ];
  allowed_topics constant text[]:=array['newcomer','newcomer_care','tasks','calendar','prayers','schedules','school','system'];
begin
  if not exists(select 1 from church_auth.owners o where o.user_id=auth.uid()) then raise exception 'not_owner'; end if;
  if p_church not in ('M+','SHiNE')
     or cardinality(coalesce(p_home_modules,'{}'))>40 or cardinality(coalesce(p_notification_topics,'{}'))>24
     or exists(select 1 from unnest(coalesce(p_home_modules,'{}')) x where not(x=any(allowed_modules)))
     or exists(select 1 from unnest(coalesce(p_notification_topics,'{}')) x where not(x=any(allowed_topics))) then raise exception 'invalid_preferences'; end if;
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user) then raise exception 'account_not_found'; end if;
  insert into church_auth.account_home_preferences(user_id,church_id,home_modules,notification_topics,updated_at)
  values(p_user,p_church,coalesce(p_home_modules,'{}'),coalesce(p_notification_topics,'{}'),now())
  on conflict(user_id,church_id) do update set home_modules=excluded.home_modules,notification_topics=excluded.notification_topics,updated_at=now();
  return true;
end $$;
revoke all on function public.set_admin_home_preferences(uuid,text,text[],text[]) from public,anon;
grant execute on function public.set_admin_home_preferences(uuid,text,text[],text[]) to authenticated,service_role;

update church_auth.account_home_preferences p set home_modules=array_append(p.home_modules,'inventory'),updated_at=now()
where exists(select 1 from church_auth.account_roles r where r.user_id=p.user_id and r.church_id=p.church_id and r.role_key in ('administrator','facilities'))
and not('inventory'=any(p.home_modules));

update public.church_customizations c set feature_modules=c.feature_modules||jsonb_build_array(jsonb_build_object('key','inventory','label','物品清冊','description','位置、數量、借還、盤點與列印','icon','📦','permission','inventory','enabled',true,'navigation',true,'navigation_order',95)),version=version+1,updated_at=now()
where not exists(select 1 from jsonb_array_elements(c.feature_modules) x where x->>'key'='inventory');
