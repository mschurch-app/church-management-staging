begin;
create or replace function public.finance_transition_cash_batch(
  p_actor uuid,p_batch_id uuid,p_expected_version integer,p_action text,p_verified_cash bigint default null,p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_batch public.finance_cash_batches%rowtype;
  v_total bigint;
  v_to text;
  v_capability text;
  v_event text;
  v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  select * into v_batch from public.finance_cash_batches where id=p_batch_id and church_id='M+' for update;
  if not found then raise exception 'batch_not_found'; end if;
  if p_expected_version is distinct from v_batch.version then raise exception 'version_conflict'; end if;
  if p_action='submit' and v_batch.status in ('draft','returned') then
    v_to:='spouse_review'; v_capability:='entry'; v_event:='submitted';
  elsif p_action='verify_cash' and v_batch.status='spouse_review' then
    v_to:='pastor_review'; v_capability:='cash_verify'; v_event:='cash_verified';
  elsif p_action='approve' and v_batch.status='pastor_review' then
    v_to:='booked'; v_capability:='approve'; v_event:='approved';
  elsif p_action='return' and v_batch.status='spouse_review' then
    v_to:='returned'; v_capability:='cash_verify'; v_event:='returned';
  elsif p_action='return' and v_batch.status='pastor_review' then
    v_to:='returned'; v_capability:='approve'; v_event:='returned';
  else raise exception 'invalid_transition'; end if;
  if not public.finance_user_can(p_actor,v_capability) then raise exception 'forbidden'; end if;
  if p_action='return' and v_reason is null then raise exception 'reason_required'; end if;
  if p_action='submit' and not (
    (v_batch.counter_1_confirmed_at is not null
     and v_batch.counter_1_confirmed_by=v_batch.counter_1
     and public.finance_user_can(v_batch.counter_1,'entry'))
    or (v_batch.counter_2_confirmed_at is not null
     and v_batch.counter_2_confirmed_by=v_batch.counter_2
     and public.finance_user_can(v_batch.counter_2,'entry'))
  ) then raise exception 'counter_confirmations_required'; end if;
  if p_action<>'return' then
    if exists(select 1 from public.finance_cash_bags where batch_id=p_batch_id and (confirmed_by is null or confirmed_at is null))
      then raise exception 'bag_confirmations_required'; end if;
    select coalesce(sum(l.amount),0) into v_total
    from public.finance_cash_bags b join public.finance_cash_lines l on l.bag_id=b.id
    where b.batch_id=p_batch_id;
    if v_total<>v_batch.entered_total or v_total<>v_batch.counted_cash then raise exception 'cash_total_mismatch'; end if;
    if exists (
      select 1 from public.finance_cash_bags b where b.batch_id=p_batch_id and
      b.declared_total<>(select coalesce(sum(l.amount),0) from public.finance_cash_lines l where l.bag_id=b.id)
    ) then raise exception 'bag_total_mismatch'; end if;
    if p_action='verify_cash' and p_verified_cash is distinct from v_batch.counted_cash then raise exception 'verified_cash_mismatch'; end if;
  end if;
  update public.finance_cash_batches set
    status=v_to,version=version+1,updated_by=p_actor,updated_at=now(),
    counter_1_confirmed_by=case when p_action='return' then null else counter_1_confirmed_by end,
    counter_1_confirmed_at=case when p_action='return' then null else counter_1_confirmed_at end,
    counter_2_confirmed_by=case when p_action='return' then null else counter_2_confirmed_by end,
    counter_2_confirmed_at=case when p_action='return' then null else counter_2_confirmed_at end,
    spouse_verified_cash=case when p_action='verify_cash' then p_verified_cash when p_action='return' then null else spouse_verified_cash end,
    spouse_verified_by=case when p_action='verify_cash' then p_actor when p_action='return' then null else spouse_verified_by end,
    pastor_approved_by=case when p_action='approve' then p_actor else pastor_approved_by end
  where id=p_batch_id;
  insert into public.finance_cash_events(batch_id,version,action,from_status,to_status,actor_user_id,reason)
  values(p_batch_id,v_batch.version+1,v_event,v_batch.status,v_to,p_actor,v_reason);
  return jsonb_build_object('id',p_batch_id,'version',v_batch.version+1,'status',v_to);
end $$;
revoke all on function public.finance_transition_cash_batch(uuid,uuid,integer,text,bigint,text) from public,anon,authenticated;
grant execute on function public.finance_transition_cash_batch(uuid,uuid,integer,text,bigint,text) to service_role;







create or replace function public.finance_confirm_cash_batch(p_actor uuid,p_batch_id uuid,p_expected_version integer,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_batch public.finance_cash_batches%rowtype;
  v_actor uuid;
  v_total bigint;
  v_counter integer;
begin
  if not public.finance_user_can(p_actor,'entry') then raise exception 'forbidden'; end if;
  v_actor := church_auth.canonical_account(p_actor);
  select * into v_batch from public.finance_cash_batches where id=p_batch_id and church_id='M+' for update;
  if not found then raise exception 'batch_not_found'; end if;
  if p_expected_version is distinct from v_batch.version then raise exception 'version_conflict'; end if;
  if v_batch.status not in ('draft','returned') then
    if p_confirmed is distinct from true then raise exception 'batch_locked'; end if;
    if v_batch.status not in ('spouse_review','pastor_review','booked') then raise exception 'batch_locked'; end if;
  end if;
  if p_confirmed and exists(select 1 from public.finance_cash_bags where batch_id=p_batch_id and (confirmed_by is null or confirmed_at is null))
    then raise exception 'bag_confirmations_required'; end if;
  if p_confirmed is null then raise exception 'invalid_confirmation'; end if;
  if v_actor=v_batch.counter_1 then v_counter:=1;
  elsif v_actor=v_batch.counter_2 then v_counter:=2;
  else raise exception 'counter_confirmation_forbidden'; end if;
  if not public.finance_user_can(v_batch.counter_1,'entry') or not public.finance_user_can(v_batch.counter_2,'entry')
    then raise exception 'invalid_counters'; end if;
  select coalesce(sum(l.amount),0) into v_total from public.finance_cash_bags b
    join public.finance_cash_lines l on l.bag_id=b.id where b.batch_id=p_batch_id;
  if v_total<=0 or v_total<>v_batch.entered_total or v_total<>v_batch.counted_cash
    then raise exception 'cash_total_mismatch'; end if;
  if exists (select 1 from public.finance_cash_bags b where b.batch_id=p_batch_id
    and b.declared_total<>(select coalesce(sum(l.amount),0) from public.finance_cash_lines l where l.bag_id=b.id))    then raise exception 'bag_total_mismatch'; end if;
  update public.finance_cash_batches set
    counter_1_confirmed_by=case when v_counter=1 then case when p_confirmed then v_actor else null end else counter_1_confirmed_by end,
    counter_1_confirmed_at=case when v_counter=1 then case when p_confirmed then now() else null end else counter_1_confirmed_at end,
    counter_2_confirmed_by=case when v_counter=2 then case when p_confirmed then v_actor else null end else counter_2_confirmed_by end,
    counter_2_confirmed_at=case when v_counter=2 then case when p_confirmed then now() else null end else counter_2_confirmed_at end,
    version=version+1,updated_by=p_actor,updated_at=now()
    where id=p_batch_id;
  insert into public.finance_cash_events(batch_id,version,action,from_status,to_status,actor_user_id,snapshot)
    values(p_batch_id,v_batch.version+1,case when p_confirmed then 'counter_confirmed' else 'counter_unconfirmed' end,
      v_batch.status,v_batch.status,p_actor,jsonb_build_object('counter',v_counter,'total',v_total));
  return jsonb_build_object('id',p_batch_id,'version',v_batch.version+1,'status',v_batch.status);
end $$;
revoke all on function public.finance_confirm_cash_batch(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.finance_confirm_cash_batch(uuid,uuid,integer,boolean) to service_role;


create table public.finance_cash_confirmation_notifications(
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.finance_cash_batches(id),
 submitted_version integer not null,recipient_user_id uuid not null references auth.users(id),
 offering_date date not null,total bigint not null,bag_count integer not null,category_totals jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','cancelled')),
 attempt_count integer not null default 0,last_error text,recipient_line_subject text,created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),sent_at timestamptz,
 unique(batch_id,submitted_version,recipient_user_id)
);
alter table public.finance_cash_confirmation_notifications enable row level security;
revoke all on public.finance_cash_confirmation_notifications from public,anon,authenticated;
grant select,insert,update on public.finance_cash_confirmation_notifications to service_role;
create index on public.finance_cash_confirmation_notifications(status,created_at);
create function public.finance_queue_counter_invitation() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.finance_cash_batches%rowtype; target uuid;
begin
 if new.action<>'submitted' then return new; end if;
 select * into b from public.finance_cash_batches where id=new.batch_id;
 if b.counter_1_confirmed_at is null then target:=b.counter_1;
 elsif b.counter_2_confirmed_at is null then target:=b.counter_2;
 else return new; end if;
 insert into public.finance_cash_confirmation_notifications(batch_id,submitted_version,recipient_user_id,offering_date,total,bag_count,category_totals)
 values(b.id,new.version,target,b.offering_date,b.entered_total,
 (select count(*) from public.finance_cash_bags where batch_id=b.id),
 coalesce((select jsonb_object_agg(category,total) from (select l.category,sum(l.amount) total from public.finance_cash_lines l join public.finance_cash_bags g on g.id=l.bag_id where g.batch_id=b.id group by l.category) totals),'{}'::jsonb)) on conflict do nothing;
 return new;
end $$;
revoke all on function public.finance_queue_counter_invitation() from public,anon,authenticated;
create trigger finance_queue_counter_invitation after insert on public.finance_cash_events for each row execute function public.finance_queue_counter_invitation();
commit;
