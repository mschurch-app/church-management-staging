create table finance.projects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 120),
 active boolean not null default true, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index finance_projects_name on finance.projects(lower(btrim(name)));
create table finance.ministry_items (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references finance.projects(id),
 name text not null check(length(btrim(name)) between 1 and 120), active boolean not null default true,
 version integer not null default 1, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(project_id,name)
);
create table finance.income_accounts (
 id uuid primary key default gen_random_uuid(), ministry_item_id uuid not null unique references finance.ministry_items(id),
 name text not null check(length(btrim(name)) between 1 and 150), code text not null default '' check(length(code)<=40)
);
create unique index finance_income_accounts_code on finance.income_accounts(code) where code<>'';
create table finance.online_donation_items (
 id uuid primary key default gen_random_uuid(),ministry_item_id uuid not null unique references finance.ministry_items(id),
 name text not null check(length(btrim(name)) between 1 and 150),enabled boolean not null default true,
 provider text not null default 'church_os' check(provider in ('church_os','eoffering')),
 external_item_no integer check(external_item_no>0), external_project_name text,
 event_slug text unique
);
create unique index finance_online_external_item on finance.online_donation_items(provider,external_item_no) where external_item_no is not null;
alter table finance.projects enable row level security;
alter table finance.ministry_items enable row level security;
alter table finance.income_accounts enable row level security;
alter table finance.online_donation_items enable row level security;
revoke all on finance.projects,finance.ministry_items,finance.income_accounts,finance.online_donation_items from public,anon,authenticated;

-- Existing receipt text remains untouched. Parent names are reusable catalog entries.
insert into finance.projects(name) select distinct btrim(project) from finance.donation_receipts where length(btrim(project)) between 1 and 120 on conflict do nothing;
insert into finance.projects(name) values('M+') on conflict do nothing;
insert into finance.ministry_items(project_id,name) select id,'一般捐贈' from finance.projects where lower(btrim(name))='m+';
-- Reuse the existing camp item metadata; never create another external item or
-- change the payment, refund, receipt numbering or provider synchronization path.
insert into finance.projects(name) select eoffering_project_name from camp_registration.events where slug='heat-basketball-camp-2027' on conflict do nothing;
insert into finance.ministry_items(project_id,name)
 select p.id,'熱火籃球營' from finance.projects p join camp_registration.events e on lower(btrim(p.name))=lower(btrim(e.eoffering_project_name)) where e.slug='heat-basketball-camp-2027' on conflict do nothing;
insert into finance.income_accounts(ministry_item_id,name)
 select m.id,case when e.slug is not null then '籃球營報名費收入' else m.name||'收入' end
 from finance.ministry_items m join finance.projects p on p.id=m.project_id
 left join camp_registration.events e on lower(btrim(p.name))=lower(btrim(e.eoffering_project_name)) and m.name='熱火籃球營' and e.slug='heat-basketball-camp-2027';
insert into finance.online_donation_items(ministry_item_id,name,provider,external_item_no,external_project_name,event_slug)
 select m.id,m.name,case when e.slug is null then 'church_os' else 'eoffering' end,e.eoffering_item_no,e.eoffering_project_name,e.slug
 from finance.ministry_items m join finance.projects p on p.id=m.project_id
 left join camp_registration.events e on lower(btrim(p.name))=lower(btrim(e.eoffering_project_name)) and m.name='熱火籃球營' and e.slug='heat-basketball-camp-2027';

alter table finance.donation_receipts add column ministry_item_id uuid references finance.ministry_items(id),add column classification_snapshot jsonb;

create table finance.project_events(id bigint generated always as identity primary key,request_id uuid not null unique,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table finance.project_events enable row level security;
revoke all on finance.project_events from public,anon,authenticated;
revoke all on sequence finance.project_events_id_seq from public,anon,authenticated;

create function finance.project_api(p_actor uuid,p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=church_auth.canonical_account(p_actor);own boolean; saved_project finance.projects%rowtype;saved_ministry finance.ministry_items%rowtype;rid uuid;req uuid;out jsonb;event finance.project_events%rowtype;
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active)
 or not exists(select 1 from church_auth.accounts aa join church_auth.grants g on g.user_id=aa.user_id where aa.user_id=a and aa.is_active and g.church_id='M+') then raise exception 'forbidden';end if;
 own:=exists(select 1 from church_auth.owners where user_id=a);
 if not own and not(finance.permission_can(p_actor,'money.view') or finance.permission_can(p_actor,'goods.view') or finance.permission_can(p_actor,'reports.view') or finance.permission_can(p_actor,'money.draft') or finance.permission_can(p_actor,'goods.draft'))then raise exception 'forbidden';end if;
 if p_action='projects' then
  return jsonb_build_object('owner',own,'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from finance.projects p),'[]'),
  'ministries',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('income_account',to_jsonb(i),'online_item',to_jsonb(o)) order by p.name,m.name) from finance.ministry_items m join finance.projects p on p.id=m.project_id join finance.income_accounts i on i.ministry_item_id=m.id join finance.online_donation_items o on o.ministry_item_id=m.id),'[]'));
 end if;
 if not own then raise exception 'forbidden';end if;
 if p_action not in ('project_save','ministry_save') then raise exception 'invalid_request';end if;
 rid:=(p_input->>'id')::uuid;req:=(p_input->>'requestId')::uuid;
 if rid is null or req is null then raise exception 'invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended('finance-project:'||req::text,0));
 perform pg_advisory_xact_lock(hashtextextended('finance-project-object:'||rid::text,0));
 select * into event from finance.project_events where request_id=req;
 if found then
  if event.actor<>a or event.payload<>p_input or event.action<>p_action then raise exception 'request_conflict';end if;
  return event.result;
 end if;
 if length(btrim(coalesce(p_input->>'name',''))) not between 1 and 120 then raise exception 'invalid_request';end if;
 if p_action='project_save' then
  select * into saved_project from finance.projects where id=rid for update;
  if (saved_project.id is null and p_input->>'version' is not null) or (saved_project.id is not null and saved_project.version is distinct from (p_input->>'version')::int)then raise exception 'version_conflict';end if;
  insert into finance.projects(id,name,active,version) values(rid,btrim(p_input->>'name'),coalesce((p_input->>'active')::boolean,true),coalesce(saved_project.version,0)+1)
  on conflict(id) do update set name=excluded.name,active=excluded.active,version=excluded.version,updated_at=now();
 else
  select * into saved_ministry from finance.ministry_items where id=rid for update;
  if (saved_ministry.id is null and p_input->>'version' is not null) or (saved_ministry.id is not null and saved_ministry.version is distinct from (p_input->>'version')::int)then raise exception 'version_conflict';end if;
  if saved_ministry.id is not null and saved_ministry.project_id is distinct from (p_input->>'projectId')::uuid then raise exception 'project_locked';end if;
  if not exists(select 1 from finance.projects where id=(p_input->>'projectId')::uuid and active)then raise exception 'project_inactive';end if;
  if length(btrim(coalesce(p_input->>'incomeName',''))) not between 1 and 150 or length(coalesce(p_input->>'incomeCode',''))>40 then raise exception 'invalid_request';end if;
  insert into finance.ministry_items(id,project_id,name,active,version)values(rid,(p_input->>'projectId')::uuid,btrim(p_input->>'name'),coalesce((p_input->>'active')::boolean,true),coalesce(saved_ministry.version,0)+1)
  on conflict(id) do update set name=excluded.name,active=excluded.active,version=excluded.version,updated_at=now();
  insert into finance.income_accounts(ministry_item_id,name,code)values(rid,btrim(p_input->>'incomeName'),btrim(coalesce(p_input->>'incomeCode','')))
  on conflict(ministry_item_id)do update set name=excluded.name,code=excluded.code;
  -- External provider identifiers are immutable here; they belong to the existing
  -- provider/camp integration, not editable display names.
  insert into finance.online_donation_items(ministry_item_id,name,enabled)values(rid,btrim(p_input->>'name'),coalesce((p_input->>'onlineEnabled')::boolean,true))
  on conflict(ministry_item_id)do update set name=excluded.name,enabled=excluded.enabled;
 end if;
 out:=jsonb_build_object('id',rid,'saved',true);
 insert into finance.project_events(request_id,actor,action,payload,result)values(req,a,p_action,p_input,out);
 return out;
end $$;
revoke all on function finance.project_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function finance.project_api(uuid,text,jsonb) to service_role;
create function public.finance_project_api(p_actor uuid,p_action text,p_input jsonb default '{}')returns jsonb language sql security invoker set search_path='' as $$select finance.project_api(p_actor,p_action,p_input);$$;
revoke all on function public.finance_project_api(uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.finance_project_api(uuid,text,jsonb)to service_role;

CREATE OR REPLACE FUNCTION finance.receipt_api(p_actor uuid, p_action text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 a uuid:=church_auth.canonical_account(p_actor); own boolean; can_edit boolean; can_issue boolean; can_camp boolean;
 r finance.donation_receipts%rowtype; old finance.donation_receipts%rowtype;
 classification jsonb; chosen uuid; cfg finance.receipt_issuer%rowtype; ev finance.receipt_events%rowtype;
 d jsonb:=p_input->'data'; item jsonb; rid uuid; req uuid; n integer; yr integer; out jsonb;
 today date:=(now() at time zone 'Asia/Taipei')::date;
begin
 if not exists(select 1 from church_auth.accounts where user_id=p_actor and is_active)
 or not exists(select 1 from church_auth.accounts aa join church_auth.grants g on aa.user_id=g.user_id where aa.user_id=a and aa.is_active and g.church_id='M+') then raise exception 'forbidden'; end if;
 own:=exists(select 1 from church_auth.owners where user_id=a);
 can_edit:=finance.permission_can(p_actor,'money.draft')or finance.permission_can(p_actor,'goods.draft');
 can_issue:=finance.permission_can(p_actor,'money.issue')or finance.permission_can(p_actor,'goods.issue')or finance.permission_can(p_actor,'money.view')or finance.permission_can(p_actor,'goods.view')or finance.permission_can(p_actor,'reports.view');
 can_camp:=own or (exists(select 1 from church_auth.grants where user_id=a and church_id='M+' and permission='heat_camp') and coalesce((select can_export and can_view from church_auth.account_feature_permissions where user_id=a and church_id='M+' and feature_key='heat_camp'),true));
 if exists(select 1 from finance.permission_overrides where user_id=a and permission_key='money.view'and not enabled)then can_camp:=false;end if;if p_action='camp_issue'and exists(select 1 from finance.permission_overrides where user_id=a and permission_key=case when exists(select 1 from camp_registration.issued_receipts rec join camp_registration.registrations reg on reg.id=rec.registration_id where reg.registration_no=p_input->>'registrationNo')then 'money.reprint'else 'money.issue'end and not enabled)then raise exception 'forbidden';end if;if not can_edit and not can_issue and not can_camp then raise exception 'forbidden'; end if;
 if p_action='profile' then return jsonb_build_object('canEdit',can_edit,'canIssue',can_issue,'canCamp',can_camp,'canExport',(finance.permission_can(p_actor,'reports.export')or(not exists(select 1 from finance.permission_overrides where user_id=church_auth.canonical_account(p_actor)and permission_key='reports.export')and(finance.legacy_user_can(p_actor,'cash_verify')or finance.legacy_user_can(p_actor,'approve')or public.finance_expense_can(p_actor,'accounting')))),'permissions',(select jsonb_object_agg(key,finance.permission_can(p_actor,key))from unnest(finance.permission_keys())key),'owner',own,'firstYear',2026,'issuer',(select to_jsonb(x) from finance.receipt_issuer x)); end if;
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
  if not (finance.permission_can(p_actor,'reports.export')or(not exists(select 1 from finance.permission_overrides where user_id=church_auth.canonical_account(p_actor)and permission_key='reports.export')and(finance.legacy_user_can(p_actor,'cash_verify')or finance.legacy_user_can(p_actor,'approve')or public.finance_expense_can(p_actor,'accounting'))))then raise exception 'forbidden';end if;
  if (p_input->>'from')::date is null or (p_input->>'to')::date is null or (p_input->>'from')::date>(p_input->>'to')::date then raise exception 'invalid_request'; end if;
  return jsonb_build_object('receipts',coalesce((select jsonb_agg(x order by x.record_date,x.receipt_number) from (
   select receipt_number,case kind when 'money' then '金錢' else '物品' end category,donation_date record_date,project,donor_name payer,recipient_name title,amount,source_ref,items,state status,coalesce(classification_snapshot->>'projectName',project) project_name,classification_snapshot->>'ministryName' ministry_name,classification_snapshot->>'incomeAccountName' income_account,classification_snapshot->>'incomeAccountCode' income_code,classification_snapshot->>'externalItemNo' online_item_no from finance.donation_receipts
   where state in ('issued','voided') and amount is not null and donation_date between (p_input->>'from')::date and (p_input->>'to')::date
   union all
   select rec.receipt_no,'籃球營報名費',rec.paid_date,'熱火籃球營',rec.snapshot->>'payer_name',rec.snapshot->>'receipt_title',(rec.snapshot->>'amount')::bigint,reg.registration_no,'[]'::jsonb,rec.status,'2027年籃球營','熱火籃球營','籃球營報名費收入','', (select eoffering_item_no::text from camp_registration.events where slug='heat-basketball-camp-2027')
   from camp_registration.issued_receipts rec join camp_registration.registrations reg on reg.id=rec.registration_id
   where can_camp and rec.paid_date between (p_input->>'from')::date and (p_input->>'to')::date
  ) x),'[]'));
 end if;
 if p_action='list' then
  if not finance.permission_can(p_actor,(p_input->>'kind')||'.view')then raise exception 'forbidden';end if;
  if p_input->>'kind' not in ('money','goods') then raise exception 'invalid_request'; end if;
  return jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from finance.donation_receipts where kind=p_input->>'kind' order by created_at desc limit 200) x),'[]'));
 end if;
 if p_action='get' then
  select * into r from finance.donation_receipts where id=(p_input->>'id')::uuid;
  if not found then raise exception 'not_found'; end if;
  if not finance.permission_can(p_actor,r.kind||'.view')or(coalesce((p_input->>'forPrint')::boolean,false)and r.state='issued'and not finance.permission_can(p_actor,r.kind||'.reprint'))then raise exception 'forbidden';end if;
  return jsonb_build_object('receipt',to_jsonb(r),'events',coalesce((select jsonb_agg(jsonb_build_object('action',action,'created_at',created_at) order by id) from finance.receipt_events where receipt_id=r.id),'[]'));
 end if;
 if p_action in('issue','void')then
 select * into r from finance.donation_receipts where id=(p_input->>'id')::uuid;if not found then raise exception 'not_found';end if;
 if not finance.permission_can(p_actor,r.kind||case when p_action='void'then'.void'when r.state='issued'then'.reprint'else'.issue'end)then raise exception 'forbidden';end if;end if;
 if p_action='save'and not finance.permission_can(p_actor,(d->>'kind')||'.draft')then raise exception 'forbidden';end if;
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
  on conflict(singleton) do update set name=excluded.name,tax_number=excluded.tax_number,address=excluded.address,money_prefix=excluded.money_prefix,goods_prefix=excluded.goods_prefix,money_last_serial=excluded.money_last_serial,goods_last_serial=excluded.goods_last_serial,version=excluded.version,updated_by=a,updated_at=now(),ministry_item_id=excluded.ministry_item_id,classification_snapshot=excluded.classification_snapshot;
  out:=jsonb_build_object('issuer',(select to_jsonb(x) from finance.receipt_issuer x));
 else
  rid:=(p_input->>'id')::uuid;if rid is null then raise exception 'invalid_request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(rid::text,0));
  select * into old from finance.donation_receipts where id=rid for update;
  if coalesce(old.version,0)<>coalesce((p_input->>'version')::integer,0) then raise exception 'version_conflict'; end if;
  if p_action='save' then
   if not finance.permission_can(p_actor,(d->>'kind')||'.draft')or(old.id is not null and old.kind is distinct from d->>'kind')then raise exception 'forbidden';end if;
   if not can_edit then raise exception 'forbidden'; end if;
   if old.state is not null and old.state<>'draft' then raise exception 'receipt_locked'; end if;
   if d->>'kind' not in ('money','goods') or d->>'kind' is null then raise exception 'invalid_request'; end if;
   r.id:=rid;r.kind:=d->>'kind';r.donation_date:=(d->>'donationDate')::date;
   r.project:=btrim(d->>'project');
   chosen:=nullif(d->>'ministryItemId','')::uuid;
   if chosen is not null then
    select jsonb_build_object('projectId',p.id,'projectName',p.name,'ministryId',m.id,'ministryName',m.name,'incomeAccountId',i.id,'incomeAccountName',i.name,'incomeAccountCode',i.code,'onlineItemId',o.id,'externalItemNo',o.external_item_no)
    into classification from finance.ministry_items m join finance.projects p on p.id=m.project_id join finance.income_accounts i on i.ministry_item_id=m.id join finance.online_donation_items o on o.ministry_item_id=m.id
    where m.id=chosen and ((m.active and p.active) or old.ministry_item_id=chosen);
    if classification is null then raise exception 'ministry_inactive';end if;
    r.project:=classification->>'projectName';r.ministry_item_id:=chosen;r.classification_snapshot:=classification;
   elsif old.ministry_item_id is not null then raise exception 'classification_required';end if;
   r.donor_name:=btrim(d->>'donorName');r.recipient_name:=btrim(d->>'recipientName');
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
   insert into finance.donation_receipts(id,kind,donation_date,project,donor_name,recipient_name,recipient_address,source_ref,amount,items,valuation_basis,version,created_by,updated_by,ministry_item_id,classification_snapshot)
   values(rid,r.kind,r.donation_date,r.project,r.donor_name,r.recipient_name,r.recipient_address,r.source_ref,r.amount,r.items,r.valuation_basis,coalesce(old.version,0)+1,coalesce(old.created_by,a),a,r.ministry_item_id,r.classification_snapshot)
   on conflict(id) do update set kind=excluded.kind,donation_date=excluded.donation_date,project=excluded.project,donor_name=excluded.donor_name,recipient_name=excluded.recipient_name,recipient_address=excluded.recipient_address,source_ref=excluded.source_ref,amount=excluded.amount,items=excluded.items,valuation_basis=excluded.valuation_basis,version=excluded.version,updated_by=a,updated_at=now(),ministry_item_id=excluded.ministry_item_id,classification_snapshot=excluded.classification_snapshot;
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
end $function$

