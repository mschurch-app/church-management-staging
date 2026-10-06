-- Standalone 2027 Heat Basketball Camp registration and payment ledger.
-- This schema intentionally has no foreign keys to the existing basketball team system.
create schema if not exists camp_registration;

create table if not exists camp_registration.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  venue text not null,
  capacity integer not null check (capacity > 0),
  jersey_choice_ends_at timestamptz not null,
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  eoffering_project_name text not null,
  eoffering_item_no integer not null,
  eoffering_payment_method integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (registration_closes_at > registration_opens_at)
);

create table if not exists camp_registration.price_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references camp_registration.events(id) on delete cascade,
  code text not null,
  label text not null,
  amount integer not null check (amount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  rule_type text not null check (rule_type in ('date_range','verified_onsite','friend_pair')),
  priority integer not null default 100,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  unique (event_id,code),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists camp_registration.promotion_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references camp_registration.events(id) on delete cascade,
  price_rule_id uuid not null references camp_registration.price_rules(id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  max_uses integer not null default 1 check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists camp_registration.friend_pairs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references camp_registration.events(id) on delete cascade,
  code_hash text not null unique,
  status text not null default 'waiting' check (status in ('waiting','matched','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  matched_at timestamptz
);

create table if not exists camp_registration.registrations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  event_id uuid not null references camp_registration.events(id) on delete restrict,
  registration_no text not null unique,
  status text not null default 'draft' check (status in ('draft','exception_review','awaiting_pair','awaiting_payment','paid','waitlisted','cancelled','refunded')),
  player_name text not null,
  guardian_name text not null,
  guardian_phone text not null,
  email text not null,
  line_id text not null,
  national_id_ciphertext text not null,
  national_id_last4 text not null,
  postal_code text not null check (postal_code ~ '^[0-9]{3}([0-9]{2,3})?$'),
  receipt_address text not null,
  birthday date not null,
  school_stage text not null check (school_stage in ('elementary_6_or_below','junior_high','senior_high','college_plus')),
  school_name text not null,
  height_cm numeric(5,1) not null check (height_cm between 100 and 230),
  weight_kg numeric(5,1) not null check (weight_kg between 25 and 200),
  basketball_profile jsonb not null default '{}'::jsonb check (jsonb_typeof(basketball_profile)='object'),
  medical_ciphertext text not null,
  care_notes_ciphertext text,
  special_identity text not null default 'none' check (special_identity in ('none','pk','special_circumstances','both')),
  eligibility_exception boolean not null default false,
  exception_reason text not null default '',
  exception_reviewed_at timestamptz,
  exception_reviewed_by uuid references auth.users(id) on delete set null,
  jersey_size text,
  jersey_number integer check (jersey_number between 0 and 99),
  jersey_name text,
  friend_pair_id uuid references camp_registration.friend_pairs(id) on delete set null,
  price_rule_id uuid references camp_registration.price_rules(id) on delete restrict,
  amount integer check (amount > 0),
  insurance_consent_at timestamptz not null,
  privacy_consent_at timestamptz not null,
  receipt_transfer_consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists heat_camp_registration_status_idx on camp_registration.registrations(event_id,status,created_at);
create index if not exists heat_camp_registration_guardian_idx on camp_registration.registrations(event_id,guardian_name);
create index if not exists heat_camp_registration_pair_idx on camp_registration.registrations(friend_pair_id);
create unique index if not exists heat_camp_unique_active_jersey_number_idx
  on camp_registration.registrations(event_id,jersey_number)
  where jersey_number is not null
    and status in ('draft','exception_review','awaiting_pair','awaiting_payment','paid');

create table if not exists camp_registration.receipt_profiles (
  registration_id uuid primary key references camp_registration.registrations(id) on delete cascade,
  receipt_type text not null check (receipt_type in ('single','annual','none')),
  delivery_method text check (delivery_method in ('mail','email')),
  donor_name text,
  receipt_title text,
  receipt_id_ciphertext text,
  receipt_id_last4 text,
  tax_upload_consent boolean not null default false,
  public_credit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    receipt_type='none'
    or (delivery_method is not null and donor_name is not null and receipt_title is not null)
  ),
  check (receipt_type<>'annual' or receipt_id_ciphertext is not null)
);

create table if not exists camp_registration.payment_orders (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references camp_registration.registrations(id) on delete restrict,
  provider text not null default 'newebpay' check (provider='newebpay'),
  merchant_order_no text not null unique,
  trade_no text unique,
  amount integer not null check (amount > 0),
  status text not null default 'created' check (status in ('created','account_issued','paid','expired','failed','cancelled','refunded')),
  bank_code text,
  virtual_account_masked text,
  virtual_account_ciphertext text,
  account_expires_at timestamptz,
  provider_result jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_result)='object'),
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists heat_camp_one_live_payment_idx
  on camp_registration.payment_orders(registration_id)
  where status in ('created','account_issued','paid');

create table if not exists camp_registration.eoffering_sync (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references camp_registration.registrations(id) on delete restrict,
  project_name text not null default '2027年籃球營',
  idempotency_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sending','imported','failed','manual_csv_ready','skipped_no_receipt')),
  attempt_count integer not null default 0,
  platform_record_id text,
  receipt_no text,
  export_batch text,
  last_error text,
  next_attempt_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists heat_camp_eoffering_queue_idx on camp_registration.eoffering_sync(status,next_attempt_at,created_at);

create table if not exists camp_registration.audit_log (
  id bigint generated always as identity primary key,
  registration_id uuid references camp_registration.registrations(id) on delete set null,
  actor_type text not null check (actor_type in ('public','staff','system','newebpay','eoffering')),
  actor_id text,
  action text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  created_at timestamptz not null default now()
);

insert into camp_registration.events(
  slug,name,starts_on,ends_on,venue,capacity,jersey_choice_ends_at,
  registration_opens_at,registration_closes_at,eoffering_project_name,eoffering_item_no,eoffering_payment_method
) values (
  'heat-basketball-camp-2027','2027 熱火籃球營','2027-07-12','2027-07-15','台中東海大學',100,
  '2027-06-30 23:59:59+08','2026-10-01 00:00:00+08','2027-07-11 23:59:59+08','2027年籃球營',172,106
) on conflict (slug) do update set
  name=excluded.name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,venue=excluded.venue,
  capacity=excluded.capacity,jersey_choice_ends_at=excluded.jersey_choice_ends_at,
  registration_opens_at=excluded.registration_opens_at,registration_closes_at=excluded.registration_closes_at,
  eoffering_project_name=excluded.eoffering_project_name,eoffering_item_no=excluded.eoffering_item_no,
  eoffering_payment_method=excluded.eoffering_payment_method,updated_at=now();

with event as (select id from camp_registration.events where slug='heat-basketball-camp-2027')
insert into camp_registration.price_rules(event_id,code,label,amount,starts_at,ends_at,rule_type,priority,metadata)
select event.id,rule.code,rule.label,rule.amount,rule.starts_at,rule.ends_at,rule.rule_type,rule.priority,rule.metadata
from event cross join (values
  ('onsite_2026','2026 現場優惠',6000,null::timestamptz,null::timestamptz,'verified_onsite',10,'{"requires_token":true}'::jsonb),
  ('year_end_early','跨年早鳥',7000,'2026-10-01 00:00:00+08'::timestamptz,'2027-01-01 00:00:00+08'::timestamptz,'date_range',50,'{}'::jsonb),
  ('new_year','新年優惠',8000,'2027-01-01 00:00:00+08'::timestamptz,'2027-04-01 00:00:00+08'::timestamptz,'date_range',50,'{}'::jsonb),
  ('late_bird','晚鳥優惠',9000,'2027-04-01 00:00:00+08'::timestamptz,'2027-06-01 00:00:00+08'::timestamptz,'date_range',50,'{}'::jsonb),
  ('regular','原價',10000,'2027-06-01 00:00:00+08'::timestamptz,null::timestamptz,'date_range',50,'{}'::jsonb),
  ('friend_pair','熱火友情價',8000,'2027-01-01 00:00:00+08'::timestamptz,'2027-07-01 00:00:00+08'::timestamptz,'friend_pair',20,'{"required_people":2}'::jsonb)
) as rule(code,label,amount,starts_at,ends_at,rule_type,priority,metadata)
on conflict (event_id,code) do update set
  label=excluded.label,amount=excluded.amount,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
  rule_type=excluded.rule_type,priority=excluded.priority,metadata=excluded.metadata,active=true;

alter table camp_registration.events enable row level security;
alter table camp_registration.price_rules enable row level security;
alter table camp_registration.promotion_tokens enable row level security;
alter table camp_registration.friend_pairs enable row level security;
alter table camp_registration.registrations enable row level security;
alter table camp_registration.receipt_profiles enable row level security;
alter table camp_registration.payment_orders enable row level security;
alter table camp_registration.eoffering_sync enable row level security;
alter table camp_registration.audit_log enable row level security;

revoke all on schema camp_registration from public, anon, authenticated;
grant usage on schema camp_registration to service_role;
grant all on all tables in schema camp_registration to service_role;
grant all on all sequences in schema camp_registration to service_role;
alter default privileges in schema camp_registration grant all on tables to service_role;
alter default privileges in schema camp_registration grant all on sequences to service_role;

comment on schema camp_registration is 'Standalone camp registration. No dependency on basketball team data.';
comment on column camp_registration.registrations.national_id_ciphertext is 'AES-GCM ciphertext produced by the server; never decrypt in the browser or list view.';
comment on table camp_registration.eoffering_sync is 'Idempotent receipt import queue for the 思遠 eoffering 2027年籃球營 project.';

create or replace function public.heat_camp_2027_available_jersey_numbers()
returns table(jersey_number integer)
language sql
security definer
set search_path=pg_catalog,public,camp_registration
as $$
  select candidate
  from generate_series(0,99) as candidate
  where not exists (
    select 1
    from camp_registration.registrations registration
    join camp_registration.events event on event.id=registration.event_id
    where event.slug='heat-basketball-camp-2027'
      and registration.jersey_number=candidate
      and registration.status in ('draft','exception_review','awaiting_pair','awaiting_payment','paid')
  )
  order by candidate;
$$;
revoke all on function public.heat_camp_2027_available_jersey_numbers() from public,anon,authenticated;
grant execute on function public.heat_camp_2027_available_jersey_numbers() to service_role;
