-- Basketball camp only: immutable, idempotent receipts; no offering-system changes.
create table camp_registration.receipt_daily_counters (
  camp_roc_year integer not null check(camp_roc_year between 1 and 999),
  paid_date date not null,
  last_serial integer not null check(last_serial between 1 and 9999),
  primary key(camp_roc_year,paid_date)
);
create table camp_registration.issued_receipts (
  registration_id uuid primary key references camp_registration.registrations(id) on delete restrict,
  payment_order_id uuid not null unique references camp_registration.payment_orders(id) on delete restrict,
  receipt_no text not null unique check(receipt_no ~ '^B[0-9]{14}$'),
  camp_roc_year integer not null,
  paid_date date not null,
  daily_serial integer not null check(daily_serial between 1 and 9999),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  issued_by uuid references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  status text not null default 'issued' check(status in ('issued','voided')),
  unique(camp_roc_year,paid_date,daily_serial)
);
alter table camp_registration.receipt_daily_counters enable row level security;
alter table camp_registration.issued_receipts enable row level security;
revoke all on camp_registration.receipt_daily_counters,camp_registration.issued_receipts from public,anon,authenticated;
alter table camp_registration.eoffering_sync drop constraint eoffering_sync_status_check;
alter table camp_registration.eoffering_sync add constraint eoffering_sync_status_check check(status in ('pending','sending','imported','failed','manual_csv_ready','skipped_no_receipt','skipped_test','skipped_direct_receipt'));

create function camp_registration.issue_receipt(p_registration_no text,p_user uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r camp_registration.registrations%rowtype;
  p camp_registration.payment_orders%rowtype;
  rp camp_registration.receipt_profiles%rowtype;
  existing camp_registration.issued_receipts%rowtype;
  sync camp_registration.eoffering_sync%rowtype;
  paid_day date;
  serial integer;
  number text;
  doc jsonb;
  reprint boolean:=false;
begin
  select x.* into r from camp_registration.registrations x join camp_registration.events e on e.id=x.event_id
   where e.slug='heat-basketball-camp-2027' and x.registration_no=p_registration_no for update of x;
  if not found then raise exception 'registration_not_found'; end if;
  if r.payment_environment<>'production' or r.status<>'paid' then raise exception 'paid_production_required'; end if;
  select * into p from camp_registration.payment_orders x where x.registration_id=r.id order by (x.status='paid') desc,x.created_at desc,x.id desc limit 1 for update;
  if not found or p.status<>'paid' or p.payment_environment<>'production' or p.paid_at is null or coalesce(p.trade_no,'')='' or p.amount<>r.amount
  then raise exception 'paid_production_required'; end if;
  select * into rp from camp_registration.receipt_profiles x where x.registration_id=r.id for update;
  if not found or rp.receipt_type='none' then raise exception 'receipt_not_requested'; end if;
  if nullif(trim(rp.receipt_title),'') is null or nullif(trim(rp.donor_name),'') is null then raise exception 'receipt_profile_incomplete'; end if;
  select * into sync from camp_registration.eoffering_sync x where x.registration_id=r.id for update;
  if found and (sync.status in ('sending','imported','manual_csv_ready') or sync.platform_record_id is not null or sync.receipt_no is not null or sync.export_batch is not null)
  then raise exception 'external_receipt_conflict'; end if;
  select * into existing from camp_registration.issued_receipts x where x.registration_id=r.id;
  if found then
    if existing.status<>'issued' or existing.payment_order_id<>p.id then raise exception 'receipt_not_active'; end if;
    doc:=existing.snapshot; reprint:=true;
  else
    paid_day:=(p.paid_at at time zone 'Asia/Taipei')::date;
    -- ON CONFLICT atomically allocates one counter per camp year / paid day.
    insert into camp_registration.receipt_daily_counters as c(camp_roc_year,paid_date,last_serial)
      values(116,paid_day,1) on conflict(camp_roc_year,paid_date)
      do update set last_serial=c.last_serial+1 where c.last_serial<9999 returning last_serial into serial;
    if serial is null then raise exception 'daily_serial_exhausted'; end if;
    number:='B116'||lpad((extract(year from paid_day)::integer-1911)::text,3,'0')||to_char(paid_day,'MMDD')||lpad(serial::text,4,'0');
    doc:=jsonb_build_object('receipt_no',number,'status','issued','payment_status','paid','payment_environment','production',
      'amount',p.amount,'paid_at',p.paid_at,'issued_at',now(),'receipt_title',rp.receipt_title,'payer_name',rp.donor_name,
      'registration_no',r.registration_no,'trade_no',p.trade_no,
      'payment_method',case when p.provider='line_pay' then 'LINE_PAY' else coalesce(p.provider_result->>'PaymentType','未記錄') end);
    insert into camp_registration.issued_receipts(registration_id,payment_order_id,receipt_no,camp_roc_year,paid_date,daily_serial,snapshot,issued_by)
      values(r.id,p.id,number,116,paid_day,serial,doc,p_user);
    update camp_registration.eoffering_sync set status='skipped_direct_receipt',updated_at=now(),last_error='Receipt issued directly by camp system; do not import to eoffering.' where registration_id=r.id;
  end if;
  insert into camp_registration.audit_log(registration_id,actor_type,actor_id,action,details)
   values(r.id,case when p_user is null then 'system' else 'staff' end,p_user::text,case when reprint then 'receipt_reprinted' else 'receipt_issued' end,jsonb_build_object('receipt_no',doc->>'receipt_no','payment_order_id',p.id));
  return doc||jsonb_build_object('reprinted',reprint);
end $$;
revoke all on function camp_registration.issue_receipt(text,uuid) from public,anon,authenticated,service_role;

create function public.heat_camp_2027_issue_receipt(p_user uuid,p_registration_no text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from church_auth.accounts a where a.user_id=p_user and a.is_active)
     or (not exists(select 1 from church_auth.owners o where o.user_id=p_user)
       and not exists(select 1 from church_auth.grants g where g.user_id=p_user and g.church_id='M+' and g.permission='heat_camp'))
     or coalesce((select f.can_export and f.can_view from church_auth.account_feature_permissions f where f.user_id=p_user and f.church_id='M+' and f.feature_key='heat_camp'),true)=false
  then raise exception 'forbidden'; end if;
  return camp_registration.issue_receipt(p_registration_no,p_user);
end $$;
revoke all on function public.heat_camp_2027_issue_receipt(uuid,text) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_issue_receipt(uuid,text) to service_role;

-- request_id is the existing secret UUID capability used by payment-status recovery.
-- It is accepted only in POST bodies, never printed, logged or put in a URL.
create function public.heat_camp_2027_customer_receipt(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare reg_no text;
begin
  select r.registration_no into reg_no from camp_registration.registrations r
    join camp_registration.events e on e.id=r.event_id
    where r.request_id=p_request_id and e.slug='heat-basketball-camp-2027';
  if reg_no is null then raise exception 'receipt_unavailable'; end if;
  return camp_registration.issue_receipt(reg_no);
end $$;
revoke all on function public.heat_camp_2027_customer_receipt(uuid) from public,anon,authenticated;
grant execute on function public.heat_camp_2027_customer_receipt(uuid) to service_role;

-- Deferred until both authoritative payment and registration writes have completed.
-- Receipt errors are audited without interrupting an already accepted payment.
create function camp_registration.sync_direct_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
declare reg_id uuid; reg_no text; reg_status text; pay_status text; error_code text;
begin
  if TG_TABLE_NAME='registrations' then reg_id:=NEW.id; else reg_id:=NEW.registration_id; end if;
  select r.registration_no,r.status into reg_no,reg_status from camp_registration.registrations r
    join camp_registration.events e on e.id=r.event_id
    where r.id=reg_id and e.slug='heat-basketball-camp-2027' and r.payment_environment='production';
  if reg_no is null then return null; end if;
  select p.status into pay_status from camp_registration.payment_orders p
    join camp_registration.issued_receipts i on i.payment_order_id=p.id where i.registration_id=reg_id;
  if reg_status='refunded' or pay_status='refunded' then
    update camp_registration.issued_receipts set status='voided' where registration_id=reg_id and status='issued';
    if found then insert into camp_registration.audit_log(registration_id,actor_type,action,details)
      values(reg_id,'system','receipt_voided_after_refund','{}'::jsonb); end if;
  elsif reg_status='paid' then
    begin
      perform camp_registration.issue_receipt(reg_no);
    exception when others then
      error_code:=SQLERRM;
      if error_code<>'receipt_not_requested' then
        insert into camp_registration.audit_log(registration_id,actor_type,action,details)
        values(reg_id,'system','receipt_issuance_pending',jsonb_build_object('code',case when error_code in
         ('receipt_profile_incomplete','external_receipt_conflict','daily_serial_exhausted','paid_production_required','receipt_not_active')
          then error_code else 'receipt_issue_failed' end));
      end if;
    end;
  end if;
  return null;
end $$;
revoke all on function camp_registration.sync_direct_receipt() from public,anon,authenticated,service_role;
create constraint trigger camp_receipt_registration after insert or update on camp_registration.registrations
  deferrable initially deferred for each row execute function camp_registration.sync_direct_receipt();
create constraint trigger camp_receipt_payment after insert or update on camp_registration.payment_orders
  deferrable initially deferred for each row execute function camp_registration.sync_direct_receipt();

-- An issued receipt is an immutable snapshot. Correcting it requires an audited
-- void/reissue workflow, which is deliberately outside this first camp release.
create function camp_registration.protect_issued_receipt_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (NEW.donor_name,NEW.receipt_title,NEW.receipt_type) is distinct from (OLD.donor_name,OLD.receipt_title,OLD.receipt_type)
    and exists(select 1 from camp_registration.issued_receipts where registration_id=OLD.registration_id)
  then raise exception 'receipt_already_issued'; end if;
  return NEW;
end $$;
revoke all on function camp_registration.protect_issued_receipt_profile() from public,anon,authenticated,service_role;
create trigger protect_camp_receipt_profile before update on camp_registration.receipt_profiles
  for each row execute function camp_registration.protect_issued_receipt_profile();
