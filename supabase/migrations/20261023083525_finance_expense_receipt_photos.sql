begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-expense-receipts','finance-expense-receipts',false,8388608,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy finance_receipts_service_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'finance-expense-receipts') with check(bucket_id<>'finance-expense-receipts');
create function public.finance_expense_receipt_api(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=church_auth.canonical_account(p_actor); e uuid:=(p_input->>'id')::uuid; r uuid:=(p_input->>'receiptId')::uuid;
 old finance.expenses%rowtype; photo finance.expense_receipts%rowtype; details jsonb;
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active) then raise exception 'forbidden'; end if;
 if e is null or r is null then raise exception 'invalid_request'; end if;
 if p_action in ('prepare','complete') then
  if not public.finance_expense_can(a,'entry') then raise exception 'forbidden'; end if;
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
   if not exists(select 1 from finance.expenses where id=e and r=any(receipt_ids)) and not exists(select 1 from finance.expense_events where expense_id=e and snapshot->'receipt_ids' ? r::text) then raise exception 'forbidden'; end if;
  elsif photo.uploaded_by<>a or not public.finance_expense_can(a,'entry') then raise exception 'forbidden'; end if;
 else raise exception 'invalid_request'; end if;
 return jsonb_build_object('id',photo.id,'name',photo.file_name,'path',photo.object_path,'state',photo.state);
end $$;
revoke all on function public.finance_expense_receipt_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_expense_receipt_api(uuid,text,jsonb) to service_role;
commit;
