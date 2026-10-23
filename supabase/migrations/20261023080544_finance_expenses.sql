begin;
create schema if not exists finance;
revoke all on schema finance from public,anon,authenticated;
create table finance.expense_roles(
 user_id uuid references auth.users(id) on delete restrict,
 role_key text check(role_key in ('entry','accounting','spouse','approve','payment')),
 assigned_by uuid not null references auth.users(id), assigned_at timestamptz not null default now(),
 primary key(user_id,role_key)
);
create table finance.expense_role_events(
 id bigint generated always as identity primary key,
 actor_user_id uuid not null references auth.users(id),target_user_id uuid not null references auth.users(id),
 role_key text not null,enabled boolean not null,created_at timestamptz not null default now()
);
create table finance.expense_receipts(
 id uuid primary key,expense_id uuid not null,uploaded_by uuid not null references auth.users(id),
 object_path text not null unique,file_name text not null check(length(file_name) between 1 and 160),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 8388608),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','ready')),created_at timestamptz not null default now()
);
create index on finance.expense_receipts(expense_id);
create table finance.expenses(
 id uuid primary key, church_id text not null default 'M+' check(church_id='M+'),
 expense_date date not null, category text not null check(category in ('人事','租金','行政','雜支','油資','電信','修繕','膳食','其他')),
 project text not null check(length(btrim(project)) between 1 and 120),
 payee text not null check(length(btrim(payee)) between 1 and 120),
 purpose text not null check(length(btrim(purpose)) between 1 and 500),
 amount bigint not null check(amount between 1 and 9007199254740991),
 kind text not null check(kind in ('advance','reimbursement')),
 payment_source text not null check(payment_source in ('petty_cash','bank')),
 voucher_ref text not null default '' check(length(voucher_ref)<=300),
 no_voucher_reason text not null default '' check(length(no_voucher_reason)<=500),
 receipt_ids uuid[] not null default '{}' check(cardinality(receipt_ids)<=10),
 check(length(btrim(voucher_ref))>0 or length(btrim(no_voucher_reason))>0 or cardinality(receipt_ids)>0),
 status text not null default 'draft' check(status in ('draft','accounting_review','spouse_review','pastor_review','approved','paid','returned','voided')),
 version integer not null default 1 check(version>0),
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 paid_date date, payment_ref text check(length(payment_ref)<=300),
 check(status<>'paid' or (paid_date is not null and length(btrim(payment_ref))>0))
);
create index on finance.expenses(expense_date desc,status);
create table finance.expense_events(
 id bigint generated always as identity primary key, expense_id uuid not null references finance.expenses(id) on delete restrict,
 request_id uuid not null unique, version integer not null, action text not null,
 actor_user_id uuid not null references auth.users(id), reason text, snapshot jsonb not null,
 created_at timestamptz not null default now(), unique(expense_id,version)
);
alter table finance.expense_roles enable row level security;
alter table finance.expense_role_events enable row level security;
alter table finance.expenses enable row level security;
alter table finance.expense_receipts enable row level security;
alter table finance.expense_events enable row level security;
revoke all on all tables in schema finance from public,anon,authenticated;
revoke all on all sequences in schema finance from public,anon,authenticated;
-- RPCs are service-only. The Edge Function supplies a verified user, never a caller-supplied actor.
create function public.finance_expense_can(p_actor uuid,p_role text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from church_auth.accounts where user_id=p_actor and is_active) and exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 where a.user_id=church_auth.canonical_account(p_actor) and a.is_active and g.church_id='M+') and
 exists(select 1 from finance.expense_roles r where r.user_id=church_auth.canonical_account(p_actor) and (r.role_key=p_role or p_role='read'));
$$;
revoke all on function public.finance_expense_can(uuid,text) from public,anon,authenticated;
grant execute on function public.finance_expense_can(uuid,text) to service_role;

create function public.finance_expense_api(p_actor uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=church_auth.canonical_account(p_actor); v_owner boolean;
 v_id uuid; v_request uuid; v_row finance.expenses%rowtype; v_old finance.expenses%rowtype;
 v_to text; v_role text; v_reason text:=btrim(coalesce(p_input->>'reason',''));
 v_data jsonb:=p_input->'data'; v_event finance.expense_events%rowtype; v_result jsonb;
 v_all boolean; v_role_key text; v_receipts uuid[];
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active) then raise exception 'forbidden'; end if;
 select exists(select 1 from church_auth.owners where user_id=v_actor)
 and exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 where a.user_id=v_actor and a.is_active and g.church_id='M+') into v_owner;
 if p_action='profile' then
  return jsonb_build_object('owner',v_owner,'actorUserId',v_actor,'roles',coalesce((select jsonb_agg(role_key) from finance.expense_roles where user_id=v_actor and public.finance_expense_can(v_actor,role_key)),'[]'::jsonb));
 end if;
 if p_action='assign_role' then
  if not v_owner then raise exception 'forbidden'; end if;
  v_role_key:=p_input->>'role';
  if v_role_key is null or v_role_key not in ('entry','accounting','spouse','approve','payment') or jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'invalid_request'; end if;
  v_id:=church_auth.canonical_account((p_input->>'userId')::uuid);
  if not exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id where a.user_id=v_id and a.is_active and g.church_id='M+') then raise exception 'forbidden'; end if;
  if (p_input->>'enabled')::boolean then insert into finance.expense_roles(user_id,role_key,assigned_by) values(v_id,v_role_key,v_actor) on conflict do nothing;
  else delete from finance.expense_roles where user_id=v_id and role_key=v_role_key; end if;
  insert into finance.expense_role_events(actor_user_id,target_user_id,role_key,enabled) values(v_actor,v_id,v_role_key,(p_input->>'enabled')::boolean);
  return jsonb_build_object('saved',true);
 end if;
 if p_action='roles' then
  if not v_owner then raise exception 'forbidden'; end if;
  return jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'role_key',role_key)) from finance.expense_roles),'[]'::jsonb));
 end if;
 if not v_owner and not public.finance_expense_can(v_actor,'read') then raise exception 'forbidden'; end if;
 v_all:=v_owner or public.finance_expense_can(v_actor,'accounting') or public.finance_expense_can(v_actor,'spouse') or public.finance_expense_can(v_actor,'approve') or public.finance_expense_can(v_actor,'payment');
 if p_action='list' then
  return jsonb_build_object('expenses',coalesce((select jsonb_agg(to_jsonb(e) order by e.expense_date desc,e.created_at desc) from (select * from finance.expenses where church_id='M+' and (v_all or created_by=v_actor) and expense_date>=coalesce(nullif(p_input->>'from','')::date,current_date-interval '1 month') and expense_date<=coalesce(nullif(p_input->>'to','')::date,current_date) order by expense_date desc,created_at desc limit 500) e),'[]'::jsonb));
 end if;
 v_id:=(p_input->>'id')::uuid;
 if v_id is null then raise exception 'invalid_request'; end if;
 if p_action='get' then
  select * into v_row from finance.expenses where id=v_id and (v_all or created_by=v_actor);
  if not found then raise exception 'expense_not_found'; end if;
  return jsonb_build_object('expense',to_jsonb(v_row),'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.file_name)) from finance.expense_receipts r where r.id=any(v_row.receipt_ids)),'[]'::jsonb),'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.version) from finance.expense_events e where expense_id=v_id),'[]'::jsonb));
 end if;
 if p_action not in ('save','submit','verify','review','approve','pay','return','void') then raise exception 'invalid_request'; end if;
 v_request:=(p_input->>'requestId')::uuid;
 if v_request is null then raise exception 'invalid_request'; end if;
 -- Serialize both first creation and retries before checking the event key.
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into v_event from finance.expense_events where request_id=v_request;
 if found then
  if v_event.expense_id<>v_id or v_event.actor_user_id<>v_actor or v_event.action<>p_action then raise exception 'request_conflict'; end if;
  return jsonb_build_object('expense',v_event.snapshot,'replayed',true);
 end if;
 select * into v_old from finance.expenses where id=v_id for update;
 if found then
  if not v_all and v_old.created_by<>v_actor then raise exception 'forbidden'; end if;
  if (p_input->>'version')::integer is distinct from v_old.version then raise exception 'version_conflict'; end if;
 elsif p_action<>'save' or p_input->>'version' is not null then raise exception 'expense_not_found'; end if;
 if p_action='save' then
  if not public.finance_expense_can(v_actor,'entry') or (v_old.id is not null and v_old.created_by<>v_actor) then raise exception 'forbidden'; end if;
  if v_old.id is not null and v_old.status not in ('draft','returned') then raise exception 'expense_locked'; end if;
  if jsonb_typeof(v_data) is distinct from 'object' or coalesce(v_data->>'amount','') !~ '^[1-9][0-9]{0,15}$' then raise exception 'invalid_expense'; end if;
  if jsonb_typeof(coalesce(v_data->'receiptIds','[]'::jsonb))<>'array' then raise exception 'invalid_expense'; end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_receipts from jsonb_array_elements_text(coalesce(v_data->'receiptIds','[]'::jsonb));
  if cardinality(v_receipts)>10 or exists(select 1 from unnest(v_receipts) rid where not exists(select 1 from finance.expense_receipts r where r.id=rid and r.expense_id=v_id and r.uploaded_by=v_actor and r.state='ready')) then raise exception 'invalid_receipt'; end if;
  if v_old.id is not null and v_old.status='returned' and v_reason='' then raise exception 'reason_required'; end if;
  insert into finance.expenses(id,expense_date,category,project,payee,purpose,amount,kind,payment_source,voucher_ref,no_voucher_reason,receipt_ids,created_by,updated_by)
  values(v_id,(v_data->>'expenseDate')::date,v_data->>'category',btrim(v_data->>'project'),btrim(v_data->>'payee'),btrim(v_data->>'purpose'),(v_data->>'amount')::bigint,v_data->>'kind',v_data->>'paymentSource',btrim(coalesce(v_data->>'voucherRef','')),btrim(coalesce(v_data->>'noVoucherReason','')),v_receipts,v_actor,v_actor)
  on conflict(id) do update set expense_date=excluded.expense_date,category=excluded.category,project=excluded.project,payee=excluded.payee,purpose=excluded.purpose,amount=excluded.amount,kind=excluded.kind,payment_source=excluded.payment_source,voucher_ref=excluded.voucher_ref,no_voucher_reason=excluded.no_voucher_reason,receipt_ids=excluded.receipt_ids,version=finance.expenses.version+1,updated_by=v_actor,updated_at=now()
  returning * into v_row;
 else
  if v_old.id is null then raise exception 'expense_not_found'; end if;
  if p_action='submit' and v_old.status in ('draft','returned') then
   if v_old.created_by<>v_actor then raise exception 'forbidden'; end if;
   v_role:='entry';v_to:='accounting_review';
  elsif p_action='verify' and v_old.status='accounting_review' then v_role:='accounting';v_to:='spouse_review';
  elsif p_action='review' and v_old.status='spouse_review' then v_role:='spouse';v_to:='pastor_review';
  elsif p_action='approve' and v_old.status='pastor_review' then v_role:='approve';v_to:='approved';
  elsif p_action='pay' and v_old.status='approved' then v_role:='payment';v_to:='paid';
  elsif p_action='return' and v_old.status in ('accounting_review','spouse_review','pastor_review') then
   v_role:=case v_old.status when 'accounting_review' then 'accounting' when 'spouse_review' then 'spouse' else 'approve' end;v_to:='returned';
  elsif p_action='void' and v_old.status='approved' then v_role:='approve';v_to:='voided';
  else raise exception 'invalid_transition'; end if;
  if not public.finance_expense_can(v_actor,v_role) then raise exception 'forbidden'; end if;
  if p_action in ('return','void') and (length(v_reason) not between 1 and 500) then raise exception 'reason_required'; end if;
  if p_action='pay' and (nullif(btrim(p_input->>'paymentRef'),'') is null or nullif(p_input->>'paidDate','') is null) then raise exception 'payment_details_required'; end if;
  update finance.expenses set status=v_to,version=version+1,updated_by=v_actor,updated_at=now(),paid_date=case when p_action='pay' then (p_input->>'paidDate')::date else paid_date end,payment_ref=case when p_action='pay' then btrim(p_input->>'paymentRef') else payment_ref end where id=v_id returning * into v_row;
 end if;
 insert into finance.expense_events(expense_id,request_id,version,action,actor_user_id,reason,snapshot) values(v_id,v_request,v_row.version,p_action,v_actor,nullif(v_reason,''),to_jsonb(v_row));
 return jsonb_build_object('expense',to_jsonb(v_row));
end $$;
revoke all on function public.finance_expense_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_expense_api(uuid,text,jsonb) to service_role;
commit;
