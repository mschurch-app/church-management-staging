-- Save the composition before the status transition can queue a review notice.
-- No original text, media, review decision, or consent is rewritten.
alter function testimony_store.call(text,jsonb) rename to call_before_prepared_layout;
create function testimony_store.call(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s testimony_store.submissions;result jsonb;presentation jsonb;actor uuid;
begin
 if p_input is null or octet_length(p_input::text)>50000 then raise exception 'invalid_input';end if;
 if p_action='format_legacy' then
  actor:=(p_input->>'actor')::uuid;
  if not testimony_store.reviewer(actor,false) then raise exception 'forbidden';end if;
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid and status<>'uploading' for update;
  if not found then raise exception 'not_found';end if;
  if s.payload->'presentation' is not null then return jsonb_build_object('version',s.version);end if;
  if s.version is distinct from (p_input->>'version')::integer then raise exception 'version_conflict';end if;
  presentation:=p_input->'presentation';
 elsif p_action='submit' then
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid and capability_hash=p_input->>'capability_hash' for update;
  if not found then raise exception 'not_found';end if;
  if s.status='uploading' then presentation:=p_input->'presentation';end if;
 elsif p_action='prepare' then
  -- A retry after successful submission still compares the original input.
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid;
  if found and s.capability_hash=p_input->>'capability_hash' and s.payload-'presentation'=p_input->'payload' then
   p_input:=jsonb_set(p_input,'{payload}',s.payload);
  end if;
 end if;
 if p_action='format_legacy' or (p_action='submit' and s.status='uploading') then
  if presentation->>'version' is distinct from '1' or jsonb_typeof(presentation->'paragraphs') is distinct from 'array'
   or jsonb_typeof(presentation->'placements') is distinct from 'array' or jsonb_array_length(presentation->'paragraphs')>80
   or jsonb_array_length(presentation->'placements')<>jsonb_array_length(s.payload->'media')
   or octet_length(presentation::text)>12000 then raise exception 'layout_required';end if;
  update testimony_store.submissions set payload=jsonb_set(payload,'{presentation}',presentation),
   version=version+case when p_action='format_legacy' then 1 else 0 end where id=s.id returning * into s;
  if p_action='format_legacy' then return jsonb_build_object('version',s.version);end if;
 end if;
 if p_action in ('initial_review','review') then
  select * into s from testimony_store.submissions where id=(p_input->>'id')::uuid;
  -- Preserve the original authorization and errors; only an authorized reviewer sees this gate.
  if s.id is not null and testimony_store.reviewer((p_input->>'actor')::uuid,p_action='review') and s.payload->'presentation' is null then raise exception 'layout_required';end if;
 end if;
 result:=testimony_store.call_before_prepared_layout(p_action,p_input);
 if p_action='status' then
  -- Internal Edge-only source; the public status response still returns id/status only.
  select * into s from testimony_store.submissions where id=(result->>'id')::uuid;
  result:=result||jsonb_build_object('layout_body',s.payload->>'body');
 elsif p_action='public' then
  result:=result||jsonb_build_object('items',coalesce((select jsonb_agg(item||jsonb_build_object('presentation',story.payload->'presentation') order by n)
   from jsonb_array_elements(result->'items') with ordinality x(item,n)
   join testimony_store.submissions story on story.id=(item->>'id')::uuid),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on function testimony_store.call(text,jsonb),testimony_store.call_before_prepared_layout(text,jsonb) from public,anon,authenticated;
grant execute on function testimony_store.call(text,jsonb) to service_role;
notify pgrst,'reload schema';
