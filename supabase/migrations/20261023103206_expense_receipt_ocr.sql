begin;
alter table finance.expense_receipts
 add column ocr_status text not null default 'idle' check(ocr_status in ('idle','processing','ready','failed')),
 add column ocr_result jsonb,add column ocr_model text,add column ocr_claim_id uuid,
 add column ocr_started_at timestamptz,add column ocr_attempts integer not null default 0 check(ocr_attempts between 0 and 3),
 add column ocr_error text;
create index on finance.expense_receipts(uploaded_by,ocr_started_at) where ocr_started_at is not null;
create or replace function public.finance_expense_receipt_api(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=church_auth.canonical_account(p_actor); e uuid:=(p_input->>'id')::uuid; r uuid:=(p_input->>'receiptId')::uuid;
 old finance.expenses%rowtype; photo finance.expense_receipts%rowtype; details jsonb;
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active) then raise exception 'forbidden'; end if;
 if e is null or r is null then raise exception 'invalid_request'; end if;
 if p_action in ('prepare','complete') then
  if not public.finance_expense_can(a,'entry') then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('expense-ocr:'||a::text,0));
 perform pg_advisory_xact_lock(hashtextextended(e::text,0));
  select * into old from finance.expenses where id=e for update;
  if old.id is not null and (old.created_by<>a or old.status not in ('draft','returned')) then raise exception 'expense_locked'; end if;
  if p_action='prepare' then
   if exists(select 1 from finance.expense_receipts where expense_id=e and uploaded_by<>a) then raise exception 'forbidden'; end if;
   if not exists(select 1 from finance.expense_receipts where id=r) and (select count(*) from finance.expense_receipts where expense_id=e)>=10 then raise exception 'receipt_limit'; end if;
   insert into finance.expense_receipts(id,expense_id,uploaded_by,object_path,file_name,mime_type,size_bytes,sha256)
   values(r,e,a,a::text||'/'||e::text||'/'||r::text,btrim(p_input->>'fileName'),p_input->>'mimeType',(p_input->>'size')::integer,p_input->>'sha256') on conflict(id) do nothing;
   select * into photo from finance.expense_receipts where id=r;
   if photo.expense_id<>e or photo.uploaded_by<>a or photo.sha256<>p_input->>'sha256' then raise exception 'forbidden'; end if;
  else
   update finance.expense_receipts set state='ready' where id=r and expense_id=e and uploaded_by=a returning * into photo;
   if not found then raise exception 'invalid_receipt'; end if;
  end if;
 elsif p_action='view' then
  select * into photo from finance.expense_receipts where id=r and expense_id=e and state='ready';
  if not found then raise exception 'invalid_receipt'; end if;
  if exists(select 1 from finance.expenses where id=e) then
   details:=public.finance_expense_api(a,'get',jsonb_build_object('id',e));
   if not exists(select 1 from finance.expenses where id=e and created_by=a and status in ('draft','returned') and photo.uploaded_by=a and public.finance_expense_can(p_actor,'entry')) and not exists(select 1 from finance.expenses where id=e and r=any(receipt_ids)) and not exists(select 1 from finance.expense_events where expense_id=e and snapshot->'receipt_ids' ? r::text) then raise exception 'forbidden'; end if;
  elsif photo.uploaded_by<>a or not public.finance_expense_can(a,'entry') then raise exception 'forbidden'; end if;
 else raise exception 'invalid_request'; end if;
 return jsonb_build_object('id',photo.id,'name',photo.file_name,'path',photo.object_path,'state',photo.state);
end $$;
revoke all on function public.finance_expense_receipt_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_expense_receipt_api(uuid,text,jsonb) to service_role;
create function public.finance_expense_ocr_api(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=church_auth.canonical_account(p_actor); e uuid:=(p_input->>'id')::uuid;r uuid:=(p_input->>'receiptId')::uuid;
 photo finance.expense_receipts%rowtype;old finance.expenses%rowtype;token uuid;
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active) then raise exception 'forbidden';end if;
 if e is null or r is null then raise exception 'invalid_request';end if;
 -- Applies the same photo/expense authorization as private receipt viewing, including staged drafts.
 perform public.finance_expense_receipt_api(p_actor,'view',jsonb_build_object('id',e,'receiptId',r));
 perform pg_advisory_xact_lock(hashtextextended('expense-ocr:'||a::text,0));
 perform pg_advisory_xact_lock(hashtextextended(e::text,0));
 select * into photo from finance.expense_receipts where id=r and expense_id=e and state='ready' for update;
 if not found then raise exception 'invalid_receipt';end if;
 if p_action='get' then
  return jsonb_build_object('status',photo.ocr_status,'result',photo.ocr_result,'error',photo.ocr_error);
 end if;
 if not public.finance_expense_can(p_actor,'entry') or photo.uploaded_by<>a then raise exception 'forbidden';end if;
 if p_action='claim' then
  select * into old from finance.expenses where id=e for update;
  if old.id is not null and (old.created_by<>a or old.status not in ('draft','returned')) then raise exception 'expense_locked';end if;
  if photo.ocr_status='ready' then return jsonb_build_object('status','ready','result',photo.ocr_result);end if;
  if photo.ocr_status='processing' and photo.ocr_started_at>now()-interval '90 seconds' then return jsonb_build_object('status','processing');end if;
  if photo.ocr_attempts>=3 or (select coalesce(sum(ocr_attempts),0) from finance.expense_receipts where uploaded_by=a and ocr_started_at>now()-interval '24 hours')>=30 then raise exception 'ocr_rate_limited';end if;
  token:=(p_input->>'claimId')::uuid;if token is null then raise exception 'invalid_request';end if;
  update finance.expense_receipts set ocr_status='processing',ocr_claim_id=token,ocr_started_at=now(),ocr_attempts=ocr_attempts+1,ocr_error=null where id=r;
  return jsonb_build_object('status','claimed','path',photo.object_path,'mimeType',photo.mime_type,'claimId',token);
 elsif p_action in ('finish','fail') then
  token:=(p_input->>'claimId')::uuid;
  if token is null or photo.ocr_claim_id is distinct from token or photo.ocr_status<>'processing' then raise exception 'ocr_stale_claim';end if;
  if p_action='finish' and (jsonb_typeof(p_input->'result') is distinct from 'object' or octet_length((p_input->'result')::text)>24000) then raise exception 'invalid_request';end if;
  update finance.expense_receipts set ocr_status=case when p_action='finish' then 'ready' else 'failed' end,
   ocr_result=case when p_action='finish' then p_input->'result' else null end,
   ocr_model=left(p_input->>'model',100),ocr_error=case when p_action='fail' then left(p_input->>'error',80) else null end
   where id=r;
  return jsonb_build_object('status',case when p_action='finish' then 'ready' else 'failed' end,'result',case when p_action='finish' then p_input->'result' else null end);
 else raise exception 'invalid_request';end if;
end $$;
revoke all on function public.finance_expense_ocr_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_expense_ocr_api(uuid,text,jsonb) to service_role;
commit;
