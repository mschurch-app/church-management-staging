-- Offline registrations belong to an independently audited staff entry.
-- Existing LINE dishes keep their owner, identifiers, versions and counts.
alter table potluck.dishes alter column owner_subject drop not null;
alter table potluck.dishes add column registration_source text not null default 'line'
 check(registration_source in ('line','staff'));
alter table potluck.dishes add constraint potluck_dishes_owner_source
 check((registration_source='line' and owner_subject is not null)or(registration_source='staff' and owner_subject is null));

CREATE OR REPLACE FUNCTION public.potluck_action(p_slug text, p_subject text, p_action text, p_data jsonb DEFAULT '{}'::jsonb, p_admin uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  result:=potluck.view_event(e,p_subject,is_admin);
  if p_action='admin_get' then
   result:=result||jsonb_build_object('can_manage',exists(select 1 from church_auth.owners o where o.user_id=p_admin)
    or exists(select 1 from church_auth.account_feature_permissions a where a.user_id=p_admin and a.church_id='M+' and a.feature_key='potluck' and a.can_view and a.can_manage));
  end if;
  return result;
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
  if p_action='admin_create' then
   if c.entity_key is distinct from 'mplus' or c.metadata->>'type' is distinct from 'potluck' then raise exception 'forbidden';end if;
   if s.archived then raise exception 'event_closed';end if;
   -- A staff entry is a new offline provider, never a guessed LINE identity or
   -- a nickname-based merge into someone else's household.
   h:=gen_random_uuid();
   insert into potluck.households(id,event_id,identity_key)values(h,e,'staff:'||h::text);
   insert into potluck.dishes(event_id,category_id,household_id,owner_subject,registration_source,display_name,dish_name,servings,notes,allergen_info,storage_requirements)
   values(e,(p_data->>'category_id')::uuid,h,null,'staff',btrim(p_data->>'display_name'),btrim(p_data->>'dish_name'),(p_data->>'servings')::numeric,
    coalesce(p_data->>'notes',''),coalesce(p_data->>'allergen_info',''),coalesce(p_data->>'storage_requirements',''))returning * into d;
  elsif p_action='admin_settings' then
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
end $function$;


revoke all on function public.potluck_action(text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.potluck_action(text,text,text,jsonb,uuid) to service_role;
