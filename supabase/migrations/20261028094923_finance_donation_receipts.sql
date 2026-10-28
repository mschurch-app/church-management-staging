begin;
create table finance.receipt_issuer(
 singleton boolean primary key default true check(singleton),
 name text not null check(length(btrim(name)) between 1 and 150),
 tax_number text not null check(tax_number ~ '^[0-9]{8}$'),
 address text not null check(length(btrim(address)) between 1 and 300),
 money_prefix text not null check(money_prefix ~ '^[A-Za-z0-9一-龥]{1,12}$'),
 goods_prefix text not null check(goods_prefix ~ '^[A-Za-z0-9一-龥]{1,12}$'),
 money_last_serial integer not null check(money_last_serial between 0 and 999998),
 goods_last_serial integer not null check(goods_last_serial between 0 and 999998),
 version integer not null default 1,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 check(money_prefix<>goods_prefix)
);
create table finance.donation_receipts(
 id uuid primary key,kind text not null check(kind in ('money','goods')),
 donation_date date not null,project text not null check(length(btrim(project)) between 1 and 120),
 donor_name text not null check(length(btrim(donor_name)) between 1 and 120),
 recipient_name text not null check(length(btrim(recipient_name)) between 1 and 120),
 recipient_address text not null default '' check(length(recipient_address)<=300),
 source_ref text not null check(length(btrim(source_ref)) between 1 and 300),
 amount bigint check(amount between 1 and 9007199254740991),
 items jsonb not null default '[]' check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=50),
 valuation_basis text not null default '' check(length(valuation_basis)<=1000),
 state text not null default 'draft' check(state in ('draft','issued','voided')),
 version integer not null default 1 check(version>0),receipt_year integer,serial integer,receipt_number text unique,
 issuer_snapshot jsonb,issued_at timestamptz,issued_by uuid references auth.users(id),
 void_reason text,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((kind='money' and amount is not null and items='[]') or (kind='goods' and jsonb_array_length(items)>0)),
 check(state='draft' or (receipt_number is not null and issuer_snapshot is not null and issued_at is not null)),
 unique(receipt_year,kind,serial)
);
create index donation_receipts_date on finance.donation_receipts(kind,donation_date desc);
create index donation_receipts_source on finance.donation_receipts(kind,source_ref);
-- An original source stays consumed even after voiding; corrections refer to that receipt explicitly.
create unique index donation_receipts_issued_source on finance.donation_receipts(kind,source_ref) where state in ('issued','voided');
create table finance.receipt_counters(year integer not null,kind text not null,last_serial integer not null check(last_serial>0),primary key(year,kind));
create table finance.receipt_events(
 id bigint generated always as identity primary key,receipt_id uuid references finance.donation_receipts(id),
 request_id uuid not null unique,actor uuid not null references auth.users(id),action text not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table finance.receipt_issuer enable row level security;
alter table finance.donation_receipts enable row level security;
alter table finance.receipt_counters enable row level security;
alter table finance.receipt_events enable row level security;
revoke all on finance.receipt_issuer,finance.donation_receipts,finance.receipt_counters,finance.receipt_events from public,anon,authenticated;
revoke all on sequence finance.receipt_events_id_seq from public,anon,authenticated;

create function finance.receipt_api(p_actor uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a uuid:=church_auth.canonical_account(p_actor); own boolean; can_edit boolean; can_issue boolean; can_camp boolean;
 r finance.donation_receipts%rowtype; old finance.donation_receipts%rowtype;
 cfg finance.receipt_issuer%rowtype; ev finance.receipt_events%rowtype;
 d jsonb:=p_input->'data'; item jsonb; rid uuid; req uuid; n integer; yr integer; out jsonb;
 today date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active)
 or not exists(select 1 from church_auth.accounts aa join church_auth.grants g on aa.user_id=g.user_id where aa.user_id=a and aa.is_active and g.church_id='M+') then raise exception 'forbidden'; end if;
 own:=exists(select 1 from church_auth.owners where user_id=a);
 can_edit:=own or public.finance_user_can(p_actor,'entry') or public.finance_expense_can(p_actor,'accounting');
 can_issue:=own or public.finance_user_can(p_actor,'cash_verify') or public.finance_user_can(p_actor,'approve') or public.finance_expense_can(p_actor,'accounting');
 can_camp:=own or (exists(select 1 from church_auth.grants where user_id=a and church_id='M+' and permission='heat_camp') and coalesce((select can_export and can_view from church_auth.account_feature_permissions where user_id=a and church_id='M+' and feature_key='heat_camp'),true));
 if not can_edit and not can_issue and not can_camp then raise exception 'forbidden'; end if;
 if p_action='profile' then return jsonb_build_object('canEdit',can_edit,'canIssue',can_issue,'canCamp',can_camp,'canExport',can_issue,'owner',own,'firstYear',2026,'issuer',(select to_jsonb(x) from finance.receipt_issuer x)); end if;
 if p_action='camp_list' then
  if not can_camp then raise exception 'forbidden'; end if;
  return jsonb_build_object('registrations',coalesce((select jsonb_agg(x) from (
   select reg.registration_no,reg.guardian_name,reg.player_name,p.amount,p.paid_at,p.trade_no,rec.receipt_no,rec.status receipt_status
   from camp_registration.registrations reg
   join camp_registration.events event on event.id=reg.event_id and event.slug='heat-basketball-camp-2027'
   join lateral (select * from camp_registration.payment_orders p where p.registration_id=reg.id and p.status='paid' and p.payment_environment='production' order by p.created_at desc limit 1) p on true
   left join camp_registration.issued_receipts rec on rec.registration_id=reg.id
   where reg.status='paid' and reg.payment_environment='production' order by p.paid_at desc limit 200
  ) x),'[]'));
 end if;
 if p_action in ('camp_issue','camp_get') then
  if not can_camp then raise exception 'forbidden'; end if;
  if length(coalesce(p_input->>'registrationNo','')) not between 1 and 80 then raise exception 'invalid_request'; end if;
  if p_action='camp_issue' then
   if not exists(select 1 from finance.receipt_issuer) then raise exception 'issuer_required'; end if;
   return jsonb_build_object('campReceipt',public.heat_camp_2027_issue_receipt(a,p_input->>'registrationNo'));
  end if;
  select rec.snapshot||jsonb_build_object('status',rec.status) into out from camp_registration.issued_receipts rec join camp_registration.registrations reg on reg.id=rec.registration_id
  where reg.registration_no=p_input->>'registrationNo';
  if out is null then raise exception 'not_found'; end if;
  return jsonb_build_object('campReceipt',out);
 end if;
 if not can_edit and not can_issue then raise exception 'forbidden'; end if;
 if p_action='export' then
  if not can_issue then raise exception 'forbidden'; end if;
  if (p_input->>'from')::date is null or (p_input->>'to')::date is null or (p_input->>'from')::date>(p_input->>'to')::date then raise exception 'invalid_request'; end if;
  return jsonb_build_object('receipts',coalesce((select jsonb_agg(x order by x.record_date,x.receipt_number) from (
   select receipt_number,case kind when 'money' then '金錢' else '物品' end category,donation_date record_date,project,donor_name payer,recipient_name title,amount,source_ref,items,state status from finance.donation_receipts
   where state in ('issued','voided') and amount is not null and donation_date between (p_input->>'from')::date and (p_input->>'to')::date
   union all
   select rec.receipt_no,'籃球營報名費',rec.paid_date,'熱火籃球營',rec.snapshot->>'payer_name',rec.snapshot->>'receipt_title',(rec.snapshot->>'amount')::bigint,reg.registration_no,'[]'::jsonb,rec.status
   from camp_registration.issued_receipts rec join camp_registration.registrations reg on reg.id=rec.registration_id
   where can_camp and rec.paid_date between (p_input->>'from')::date and (p_input->>'to')::date
  ) x),'[]'));
 end if;
 if p_action='list' then
  if p_input->>'kind' not in ('money','goods') then raise exception 'invalid_request'; end if;
  return jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from finance.donation_receipts where kind=p_input->>'kind' order by created_at desc limit 200) x),'[]'));
 end if;
 if p_action='get' then
  select * into r from finance.donation_receipts where id=(p_input->>'id')::uuid;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('receipt',to_jsonb(r),'events',coalesce((select jsonb_agg(jsonb_build_object('action',action,'created_at',created_at) order by id) from finance.receipt_events where receipt_id=r.id),'[]'));
 end if;
 if p_action not in ('save','issue','void','issuer') then raise exception 'invalid_request'; end if;
 req:=(p_input->>'requestId')::uuid;if req is null then raise exception 'invalid_request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(req::text,0));
 select * into ev from finance.receipt_events where request_id=req;
 if found then
  if ev.actor<>a or ev.action<>p_action or ev.payload<>p_input then raise exception 'request_conflict'; end if;
  return ev.result||jsonb_build_object('replayed',true);
 end if;
 if p_action='issuer' then
  if not own then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance-receipt-issuer',0));
  select * into cfg from finance.receipt_issuer;
  if coalesce((p_input->>'version')::integer,0)<>coalesce(cfg.version,0) then raise exception 'version_conflict'; end if;
  if exists(select 1 from finance.donation_receipts where state<>'draft') and (cfg.money_prefix is distinct from d->>'moneyPrefix' or cfg.goods_prefix is distinct from d->>'goodsPrefix' or cfg.money_last_serial is distinct from (d->>'moneyLastSerial')::integer or cfg.goods_last_serial is distinct from (d->>'goodsLastSerial')::integer) then raise exception 'prefix_locked'; end if;
  insert into finance.receipt_issuer(singleton,name,tax_number,address,money_prefix,goods_prefix,money_last_serial,goods_last_serial,version,updated_by)
  values(true,btrim(d->>'name'),d->>'taxNumber',btrim(d->>'address'),d->>'moneyPrefix',d->>'goodsPrefix',(d->>'moneyLastSerial')::integer,(d->>'goodsLastSerial')::integer,coalesce(cfg.version,0)+1,a)
  on conflict(singleton) do update set name=excluded.name,tax_number=excluded.tax_number,address=excluded.address,money_prefix=excluded.money_prefix,goods_prefix=excluded.goods_prefix,money_last_serial=excluded.money_last_serial,goods_last_serial=excluded.goods_last_serial,version=excluded.version,updated_by=a,updated_at=now();
  out:=jsonb_build_object('issuer',(select to_jsonb(x) from finance.receipt_issuer x));
 else
  rid:=(p_input->>'id')::uuid;if rid is null then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
  select * into old from finance.donation_receipts where id=rid for update;
  if coalesce(old.version,0)<>coalesce((p_input->>'version')::integer,0) then raise exception 'version_conflict'; end if;
  if p_action='save' then
   if not can_edit then raise exception 'forbidden'; end if;
   if old.state is not null and old.state<>'draft' then raise exception 'receipt_locked'; end if;
   if d->>'kind' not in ('money','goods') or d->>'kind' is null then raise exception 'invalid_request'; end if;
   r.id:=rid;r.kind:=d->>'kind';r.donation_date:=(d->>'donationDate')::date;
   r.project:=btrim(d->>'project');r.donor_name:=btrim(d->>'donorName');r.recipient_name:=btrim(d->>'recipientName');
   r.recipient_address:=btrim(coalesce(d->>'recipientAddress',''));r.source_ref:=btrim(d->>'sourceRef');
   r.amount:=nullif(d->>'amount','')::bigint;r.items:=coalesce(d->'items','[]');r.valuation_basis:=btrim(coalesce(d->>'valuationBasis',''));
   if r.donation_date>today or (r.kind='money' and r.donation_date<date '2026-01-01') then raise exception 'donation_date_not_eligible'; end if;
   if r.kind='goods' then
    for item in select * from jsonb_array_elements(r.items) loop
     if length(btrim(coalesce(item->>'name',''))) not between 1 and 120 or length(btrim(coalesce(item->>'unit',''))) not between 1 and 20
     or coalesce(item->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$' or (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric>1000000
     or length(coalesce(item->>'specification',''))>300 then raise exception 'invalid_items'; end if;
    end loop;
    if r.amount is not null and r.valuation_basis='' then raise exception 'valuation_required'; end if;
   end if;
   insert into finance.donation_receipts(id,kind,donation_date,project,donor_name,recipient_name,recipient_address,source_ref,amount,items,valuation_basis,version,created_by,updated_by)
   values(rid,r.kind,r.donation_date,r.project,r.donor_name,r.recipient_name,r.recipient_address,r.source_ref,r.amount,r.items,r.valuation_basis,coalesce(old.version,0)+1,coalesce(old.created_by,a),a)
   on conflict(id) do update set kind=excluded.kind,donation_date=excluded.donation_date,project=excluded.project,donor_name=excluded.donor_name,recipient_name=excluded.recipient_name,recipient_address=excluded.recipient_address,source_ref=excluded.source_ref,amount=excluded.amount,items=excluded.items,valuation_basis=excluded.valuation_basis,version=excluded.version,updated_by=a,updated_at=now();
  else
   if not can_issue then raise exception 'forbidden'; end if;
   if old.id is null then raise exception 'not_found'; end if;
   if p_action='issue' then
    if old.state<>'draft' then raise exception 'receipt_locked'; end if;
    if p_input->>'verified' is distinct from 'true' then raise exception 'verification_required'; end if;
    perform pg_advisory_xact_lock(hashtextextended('finance-receipt-issuer',0));
    select * into cfg from finance.receipt_issuer;
    if cfg.singleton is null then raise exception 'issuer_required'; end if;
    if old.donation_date>today or (old.kind='money' and old.donation_date<date '2026-01-01') then raise exception 'donation_date_not_eligible'; end if;
    yr:=extract(year from old.donation_date);
    insert into finance.receipt_counters values(yr,old.kind,case when yr=2026 then (case old.kind when 'money' then cfg.money_last_serial else cfg.goods_last_serial end)+1 else 1 end) on conflict(year,kind) do update set last_serial=finance.receipt_counters.last_serial+1 returning last_serial into n;
    if n>999999 then raise exception 'serial_exhausted'; end if;
    update finance.donation_receipts set state='issued',receipt_year=yr,serial=n,
     receipt_number=(case old.kind when 'money' then cfg.money_prefix else cfg.goods_prefix end)||'-'||yr||'-'||lpad(n::text,6,'0'),
     issuer_snapshot=to_jsonb(cfg)-'updated_by',issued_by=a,issued_at=now(),updated_by=a,updated_at=now(),version=version+1 where id=rid;
   else
    if old.state<>'issued' then raise exception 'invalid_transition'; end if;
    if length(btrim(coalesce(p_input->>'reason',''))) not between 1 and 500 then raise exception 'reason_required'; end if;
    update finance.donation_receipts set state='voided',void_reason=btrim(p_input->>'reason'),version=version+1,updated_by=a,updated_at=now() where id=rid;
   end if;
  end if;
  out:=jsonb_build_object('receipt',(select to_jsonb(x) from finance.donation_receipts x where id=rid));
 end if;
 insert into finance.receipt_events(receipt_id,request_id,actor,action,payload,result) values(rid,req,a,p_action,p_input,out);
 return out;
end $$;
revoke all on function finance.receipt_api(uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema finance to service_role;
grant execute on function finance.receipt_api(uuid,text,jsonb) to service_role;
create function public.finance_receipt_api(p_actor uuid,p_action text,p_input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select finance.receipt_api(p_actor,p_action,p_input); $$;
revoke all on function public.finance_receipt_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_receipt_api(uuid,text,jsonb) to service_role;
commit;
