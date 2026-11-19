begin;
set local lock_timeout='3s';
-- Candidate schema: deploy only after verified-contact delivery and pilot authorization are accepted.
-- No production account is enabled by this migration.
create schema member_offering;
revoke all on schema member_offering from public,anon,authenticated;
grant usage on schema member_offering to service_role;
create table member_offering.pilot_access(
 member_id bigint primary key references public.members(id),
 enabled boolean not null default false,
 activated_by uuid not null references auth.users(id),
 activated_at timestamptz not null default now()
);
create table member_offering.sessions(
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 member_id bigint not null references public.members(id),
 church_id text not null check(church_id='M+'),
 login_channel_id text not null,
 line_subject text not null check(line_subject ~ '^U[0-9a-f]{32}$'),
 expires_at timestamptz not null,
 revoked_at timestamptz
);
create table member_offering.receipt_links(
 receipt_id uuid primary key references finance.donation_receipts(id),
 member_id bigint not null references public.members(id),
 source_bag_id uuid references public.finance_cash_bags(id),
 linked_by uuid not null references auth.users(id),
 linked_at timestamptz not null default now()
);
alter table member_offering.pilot_access enable row level security;
alter table member_offering.sessions enable row level security;
alter table member_offering.receipt_links enable row level security;
revoke all on all tables in schema member_offering from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema member_offering to service_role;
create function public.read_my_offering(p_church text,p_channel text,p_subject text,p_session_hash text,p_year integer,p_page integer default 0)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare mid bigint; start_day date; end_day date; output jsonb;
begin
 if p_church is distinct from 'M+' or p_channel is distinct from '2011645391' or p_subject is null or p_subject !~ '^U[0-9a-f]{32}$' then raise exception 'identity_required' using errcode='42501';end if;
 if p_year is null or p_year not between 2020 and 2100 or p_page is null or p_page not between 0 and 10000 then raise exception 'invalid_input' using errcode='22023';end if;
 select b.member_id into mid from church_auth.member_bindings b
 join public.members m on m.id=b.member_id and m.church_id=b.church_id and m.archived_at is null
 join member_offering.pilot_access a on a.member_id=m.id and a.enabled
 join member_offering.sessions s on s.member_id=m.id and s.church_id=b.church_id and s.login_channel_id=b.login_channel_id and s.line_subject=b.line_subject
 where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active
 and s.token_hash=p_session_hash and s.revoked_at is null and s.expires_at>now();
 if mid is null then raise exception 'verification_required' using errcode='42501';end if;
 start_day:=make_date(p_year,1,1);end_day:=make_date(p_year+1,1,1);
 with owned as materialized(
 select g.id,b.offering_date,g.payment_method,b.status,
 (select coalesce(sum(l.amount),0) from public.finance_cash_lines l where l.bag_id=g.id) amount,
 (select coalesce(jsonb_agg(jsonb_build_object('name',l.category,'designation',l.designation,'amount',l.amount) order by l.id),'[]'::jsonb) from public.finance_cash_lines l where l.bag_id=g.id) categories
 from public.finance_cash_bags g join public.finance_cash_batches b on b.id=g.batch_id
 where g.member_id=mid and not g.anonymous and b.church_id=p_church
 and b.offering_date>=start_day and b.offering_date<end_day and b.status in('spouse_review','pastor_review','booked','returned')
 ), paged as(
 select * from owned order by offering_date desc,id desc limit 21 offset p_page*20
 )
 select jsonb_build_object('year',p_year,
 'offeringCode',(select offering_code from public.finance_member_codes where member_id=mid),
 'total',coalesce((select sum(amount) from owned where status='booked'),0),
 'confirmedCount',(select count(*) from owned where status='booked'),
 'pendingCount',(select count(*) from owned where status in('spouse_review','pastor_review')),
 'hasNext',(select count(*)>20 from paged),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.offering_date,'amount',x.amount,'categories',x.categories,'method',x.payment_method,'state',case when x.status='booked' then 'confirmed' when x.status='returned' then 'returned' else 'pending' end) order by x.offering_date desc,x.id desc) from (select * from paged order by offering_date desc,id desc limit 20)x),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.receipt_number,'date',r.donation_date,'amount',r.amount,'state',r.state,'project',r.project) order by r.donation_date desc,r.id)
 from member_offering.receipt_links link join finance.donation_receipts r on r.id=link.receipt_id
 where link.member_id=mid and r.donation_date>=start_day and r.donation_date<end_day
 and (link.source_bag_id is null or exists(select 1 from public.finance_cash_bags g join public.finance_cash_batches b on b.id=g.batch_id where g.id=link.source_bag_id and g.member_id=mid and b.church_id=p_church))),'[]'::jsonb)) into output;
 return output;
end$$;
revoke all on function public.read_my_offering(text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.read_my_offering(text,text,text,text,integer,integer) to service_role;
commit;
