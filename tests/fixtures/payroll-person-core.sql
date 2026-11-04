-- Service-only payroll state. Original photos remain in Google Drive.
alter table mschool.payroll_photos add column worker_id text references mschool.users(id);
alter table mschool.payroll_months add column settled_at timestamptz,
 add column transfer_chart_path text,add column transfer_chart_hash text,
 add column transfer_data_hash text,add column transfer_snapshot jsonb;
create table mschool.schedule_contributors(schedule_id bigint not null references mschool.schedules(id) on delete cascade,actor_id text not null check(actor_id in('2026M0003','2026M0004')),primary key(schedule_id,actor_id));
create table mschool.payroll_person_reviews(month_id uuid not null references mschool.payroll_months(id),worker_id text not null references mschool.users(id),stage text not null check(stage in('yuting','enru','wife')),source_hash text not null,reviewed_by text not null,reviewed_at timestamptz not null default now(),primary key(month_id,worker_id,stage));
create table mschool.payroll_bank_accounts(worker_id text primary key references mschool.users(id),bank_name text not null check(length(bank_name) between 1 and 100),account_number text not null check(account_number~'^[0-9]{5,24}$'),updated_by text not null,updated_at timestamptz not null default now());
alter table mschool.schedule_contributors enable row level security;
alter table mschool.payroll_person_reviews enable row level security;
alter table mschool.payroll_bank_accounts enable row level security;
revoke all on mschool.schedule_contributors,mschool.payroll_person_reviews,mschool.payroll_bank_accounts from public,anon,authenticated;
grant all on mschool.schedule_contributors,mschool.payroll_person_reviews,mschool.payroll_bank_accounts to service_role;
insert into mschool.schedule_contributors
select distinct s.id,f.actor_id from mschool.schedules s join mschool.flow_operations f on f.kind='schedules' and f.actor_id in('2026M0003','2026M0004')
cross join lateral jsonb_array_elements(coalesce(f.result->'proposed','[]'::jsonb))x
where x->>'worker_id'=s.worker_id and x->>'date'=s.date::text and x->>'shift'=s.shift on conflict do nothing;
create function mschool.payroll_record_contributor()returns trigger language plpgsql security invoker set search_path='' as $$declare actor text:=current_setting('mschool.schedule_actor',true);begin
if tg_op='UPDATE' and new.worker_id is distinct from old.worker_id then delete from mschool.schedule_contributors where schedule_id=new.id;end if;
if actor in('2026M0003','2026M0004')then insert into mschool.schedule_contributors values(new.id,actor)on conflict do nothing;end if;return new;end$$;
create trigger payroll_record_contributor after insert or update on mschool.schedules for each row execute function mschool.payroll_record_contributor();
-- Existing deployed writers retain authentication, conflict checks, replay receipts and wage isolation.
do $patch$declare src text;begin
src:=pg_get_functiondef('public.school_mutate_schedules(text,text,bigint,jsonb,uuid,boolean)'::regprocedure);
src:=replace(src,'if p_method not in',E'perform set_config(''mschool.schedule_actor'',a->>''id'',true);\n if p_method not in');
src:=replace(src,$from$coalesce(person.role_type,'') not in ('老師','工讀生')$from$,$to$not (coalesce(person.role_type,'') in ('老師','工讀生') or (person.role_type='同工' and person.id~'^20[0-9]{2}T[0-9]+$'))$to$);
execute src;end$patch$;
create or replace function mschool.payroll_snapshot(p_month date)returns jsonb language sql stable set search_path='' as $$
with lines as(select s.id,s.date,s.worker_id,coalesce(u.name,s.worker_name,s.worker_id)name,
case when u.role_type='同工'and s.worker_id~'^20[0-9]{2}T[0-9]+$'then '老師'else coalesce(u.role_type,s.role_type,'人員')end role_type,
s.shift,s.job_desc,round(extract(epoch from upper(mschool.shift_range(s.date,s.shift))-lower(mschool.shift_range(s.date,s.shift)))/3600,4)hours,r.hourly_wage,
round(extract(epoch from upper(mschool.shift_range(s.date,s.shift))-lower(mschool.shift_range(s.date,s.shift)))*r.hourly_wage/3600,2)amount,
coalesce((select jsonb_agg(actor_id order by actor_id)from mschool.schedule_contributors c where c.schedule_id=s.id),'[]'::jsonb)scheduled_by
from mschool.schedules s left join mschool.users u on u.id=s.worker_id left join lateral(select hourly_wage from mschool.payroll_rates where worker_id=s.worker_id and effective_from<=s.date order by effective_from desc limit 1)r on true where s.date>=p_month and s.date<p_month+interval '1 month'),
workers as(select worker_id,max(name)name,max(role_type)role_type,sum(hours)hours,round(sum(amount),2)amount,count(*)filter(where hourly_wage is null or hours is null or hours<=0)missing_rates,
jsonb_agg(to_jsonb(l)order by date,id)shifts,
case when bool_or(jsonb_array_length(scheduled_by)=0)then '["2026M0004","2026M0003"]'::jsonb else (select jsonb_agg(distinct actor order by actor)from lines l2 cross join lateral jsonb_array_elements_text(l2.scheduled_by)actor where l2.worker_id=l.worker_id)end required_uploaders,
bool_or(jsonb_array_length(scheduled_by)=0)owner_unknown from lines l group by worker_id)
select jsonb_build_object('basis','planned_schedule_hours','month',to_char(p_month,'YYYY-MM'),'workers',coalesce((select jsonb_agg(to_jsonb(w)order by worker_id)from workers w),'[]'::jsonb),'total_hours',coalesce((select sum(hours)from workers),0),'total_amount',coalesce((select sum(amount)from workers),0),'missing_rates',coalesce((select sum(missing_rates)from workers),0),'source_hash',md5(coalesce((select jsonb_agg(to_jsonb(l)order by id)::text from lines l),'[]')));$$;
-- The user specified 200/hour for all current people. Preserve every existing effective rate.
insert into mschool.payroll_rates(worker_id,effective_from,hourly_wage,updated_by)
select distinct s.worker_id,date '2026-11-01',200,'user_authorization_20261103_all_current_200'from mschool.schedules s join mschool.users u on u.id=s.worker_id
where s.date>=date '2026-11-01'and s.date<date '2026-12-01'and not exists(select 1 from mschool.payroll_rates r where r.worker_id=s.worker_id)on conflict do nothing;
create function mschool.payroll_worker_hash(p_worker jsonb,p_stage text)returns text language sql stable set search_path=''as $$select md5(p_worker::text||case when p_stage='wife'then coalesce((select jsonb_build_object('bank_name',bank_name,'account_number',account_number)::text from mschool.payroll_bank_accounts where worker_id=p_worker->>'worker_id'),'missing_bank')else ''end);$$;
create function mschool.payroll_worker_states(p_batch mschool.payroll_months,p_actor text,p_snapshot jsonb)returns jsonb language plpgsql stable set search_path=''as $$
declare w jsonb;states jsonb:='[]';confirmed jsonb;need boolean;own_count int;eligible boolean;stage_actor text:=mschool.payroll_stage_actor(p_batch.stage);begin
for w in select value from jsonb_array_elements(p_snapshot->'workers')loop
select coalesce(jsonb_agg(stage order by stage),'[]')into confirmed from mschool.payroll_person_reviews r where r.month_id=p_batch.id and r.worker_id=w->>'worker_id'and r.source_hash=mschool.payroll_worker_hash(w,r.stage);
need:=coalesce(w->'required_uploaders'?'2026M0004',false)and p_batch.stage='yuting'or coalesce(w->'required_uploaders'?'2026M0003',false)and p_batch.stage='enru';
select count(*)into own_count from mschool.payroll_photos p where p.month_id=p_batch.id and p.worker_id=w->>'worker_id'and p.uploaded_by=p_actor;
eligible:=p_actor=stage_actor and p_batch.stage in('yuting','enru','wife');
states:=states||jsonb_build_array(jsonb_build_object('worker_id',w->>'worker_id','confirmed_stages',confirmed,'stage_confirmed',coalesce(confirmed?p_batch.stage,false),'needs_own_photo',need,'own_photo_count',own_count,'can_upload',eligible and p_batch.stage in('yuting','enru'),'can_confirm',eligible));
end loop;return states;end$$;
create function mschool.payroll_transfer_data(p_month date)returns jsonb language plpgsql stable set search_path=''as $$declare b mschool.payroll_months;s jsonb;workers jsonb;begin
select *into b from mschool.payroll_months where month=p_month;
if b.stage in('pastor','approved')and b.transfer_snapshot is not null then return b.transfer_snapshot;end if;
s:=case when b.stage in('wife','pastor','approved')then b.snapshot else mschool.payroll_snapshot(p_month)end;
select coalesce(jsonb_agg(w||jsonb_build_object('bank_name',k.bank_name,'account_number',k.account_number)order by w->>'worker_id'),'[]')into workers from jsonb_array_elements(s->'workers')w left join mschool.payroll_bank_accounts k on k.worker_id=w->>'worker_id';
return jsonb_build_object('month',to_char(p_month,'YYYY-MM'),'workers',workers,'total_hours',s->'total_hours','total_amount',s->'total_amount','source_hash',s->>'source_hash');end$$;
create function public.school_payroll_prepare_month(p_actor text,p_month date)returns jsonb language plpgsql set search_path=''as $$declare a jsonb;b mschool.payroll_months;begin
a:=mschool.payroll_actor(p_actor);if not mschool.can_manage_schedules(a->>'id')then raise exception 'school_schedule_manager_required'using errcode='42501';end if;
if p_month<date '2026-11-01'or extract(day from p_month)<>1 or p_month>date_trunc('month',now()at time zone'Asia/Taipei')::date then raise exception 'invalid_month';end if;
perform pg_advisory_xact_lock(57203,2);perform pg_advisory_xact_lock(hashtextextended('payroll:'||p_month,57031));
insert into mschool.payroll_months(month,snapshot)values(p_month,mschool.payroll_snapshot(p_month))on conflict(month)do nothing;
select *into b from mschool.payroll_months where month=p_month;return jsonb_build_object('ok',true,'revision',b.revision);end$$;
create function public.school_payroll_person_review(p_actor text,p_month date,p_revision bigint,p_worker text)returns jsonb language plpgsql set search_path=''as $$declare a jsonb;b mschool.payroll_months;w jsonb;who text;begin
a:=mschool.payroll_actor(p_actor);perform pg_advisory_xact_lock(57203,2);perform pg_advisory_xact_lock(hashtextextended('payroll:'||p_month,57031));select *into b from mschool.payroll_months where month=p_month for update;
if b.id is null or b.stage not in('yuting','enru','wife')or a->>'id'is distinct from mschool.payroll_stage_actor(b.stage)then raise exception 'wrong_review_stage'using errcode='42501';end if;
if b.revision is distinct from p_revision then raise exception 'payroll_changed_reload'using errcode='40001';end if;
if b.stage in('yuting','enru')and not b.saved then raise exception 'save_before_submit';end if;
select value into w from jsonb_array_elements(case when b.stage='wife'then b.snapshot else mschool.payroll_snapshot(p_month)end->'workers')where value->>'worker_id'=p_worker;
if w is null then raise exception 'worker_not_in_month';end if;
if (w->>'missing_rates')::int>0 then raise exception 'hourly_rates_missing';end if;
if b.stage in('yuting','enru')and w->'required_uploaders'?(a->>'id')and not exists(select 1 from mschool.payroll_photos where month_id=b.id and worker_id=p_worker and uploaded_by=a->>'id')then raise exception 'own_attendance_photo_required';end if;
if b.stage='enru'and not exists(select 1 from mschool.payroll_person_reviews where month_id=b.id and worker_id=p_worker and stage='yuting'and source_hash=mschool.payroll_worker_hash(w,'yuting'))then raise exception 'previous_worker_review_incomplete';end if;
if b.stage='wife'then
 for who in select jsonb_array_elements_text(w->'required_uploaders')loop if not exists(select 1 from mschool.payroll_photos where month_id=b.id and worker_id=p_worker and uploaded_by=who)then raise exception 'worker_attendance_photos_incomplete';end if;end loop;
 if not exists(select 1 from mschool.payroll_person_reviews where month_id=b.id and worker_id=p_worker and stage='yuting'and source_hash=mschool.payroll_worker_hash(w,'yuting'))or not exists(select 1 from mschool.payroll_person_reviews where month_id=b.id and worker_id=p_worker and stage='enru'and source_hash=mschool.payroll_worker_hash(w,'enru'))then raise exception 'previous_worker_review_incomplete';end if;
end if;
insert into mschool.payroll_person_reviews values(b.id,p_worker,b.stage,mschool.payroll_worker_hash(w,b.stage),a->>'id',now())on conflict(month_id,worker_id,stage)do update set source_hash=excluded.source_hash,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
insert into mschool.payroll_audit(month_id,actor_id,action,from_stage,to_stage,payload)values(b.id,a->>'id','person_confirmed',b.stage,b.stage,jsonb_build_object('worker_id',p_worker));
update mschool.payroll_months set revision=revision+1,updated_at=now()where id=b.id;return jsonb_build_object('ok',true);end$$;
create function public.school_payroll_bank_save(p_actor text,p_worker text,p_bank text,p_account text,p_expected_updated_at timestamptz default null)returns jsonb language plpgsql set search_path=''as $$declare a jsonb;begin
a:=mschool.payroll_actor(p_actor);if a->>'id'not in('2026M0001','2026M0002')then raise exception 'wage_owner_required'using errcode='42501';end if;
if not exists(select 1 from mschool.users u where u.id=p_worker and (u.role_type in('老師','工讀生')or u.id~'^20[0-9]{2}T[0-9]+$'or exists(select 1 from mschool.schedules s where s.worker_id=u.id)))then raise exception 'worker_not_found';end if;
perform pg_advisory_xact_lock(57203,2);
if exists(select 1 from mschool.payroll_months b cross join lateral jsonb_array_elements(b.snapshot->'workers')w where b.stage='pastor'and w->>'worker_id'=p_worker)then raise exception 'bank_affects_pending_transfer_return_first';end if;
if exists(select 1 from mschool.payroll_bank_accounts where worker_id=p_worker and updated_at is distinct from p_expected_updated_at)then raise exception 'bank_data_changed_reload'using errcode='40001';end if;
insert into mschool.payroll_bank_accounts values(p_worker,btrim(p_bank),regexp_replace(p_account,'[ -]','','g'),a->>'id',now())on conflict(worker_id)do update set bank_name=excluded.bank_name,account_number=excluded.account_number,updated_by=excluded.updated_by,updated_at=now();
update mschool.payroll_months set revision=revision+1,transfer_chart_path=null,transfer_chart_hash=null,transfer_data_hash=null,transfer_snapshot=null,updated_at=now()where stage='wife';
insert into mschool.payroll_audit(actor_id,action,payload)values(a->>'id','bank_saved',jsonb_build_object('worker_id',p_worker,'bank_name',btrim(p_bank),'account_last4',right(p_account,4)));return jsonb_build_object('ok',true);end$$;
create function public.school_payroll_transfer(p_actor text,p_month date,p_revision bigint,p_path text default null,p_hash text default null,p_data_hash text default null)returns jsonb language plpgsql set search_path=''as $$declare a jsonb;b mschool.payroll_months;s jsonb;w jsonb;digest text;begin
a:=mschool.payroll_actor(p_actor);perform pg_advisory_xact_lock(57203,2);perform pg_advisory_xact_lock(hashtextextended('payroll:'||p_month,57031));select *into b from mschool.payroll_months where month=p_month for update;
if a->>'id'<>'2026M0002'or b.stage<>'wife'then raise exception 'wrong_review_stage'using errcode='42501';end if;
if b.revision is distinct from p_revision then raise exception 'payroll_changed_reload'using errcode='40001';end if;
s:=mschool.payroll_transfer_data(p_month);if jsonb_array_length(s->'workers')=0 then raise exception 'empty_payroll';end if;
for w in select value from jsonb_array_elements(b.snapshot->'workers')loop if not exists(select 1 from mschool.payroll_person_reviews where month_id=b.id and worker_id=w->>'worker_id'and stage='wife'and source_hash=mschool.payroll_worker_hash(w,'wife'))then raise exception 'all_workers_must_be_reviewed';end if;end loop;
if exists(select 1 from jsonb_array_elements(s->'workers')item where nullif(item->>'bank_name','')is null or nullif(item->>'account_number','')is null)then raise exception 'bank_accounts_incomplete';end if;
digest:=md5(s::text);
if p_path is not null then
 if p_data_hash is distinct from digest or p_hash!~'^[a-f0-9]{64}$'or p_path is distinct from 'M+/payroll/'||b.id||'/'||p_hash||'.png'then raise exception 'invalid_transfer_chart';end if;
 update mschool.payroll_months set transfer_chart_path=p_path,transfer_chart_hash=p_hash,transfer_data_hash=digest,transfer_snapshot=s,revision=revision+1,updated_at=now()where id=b.id;
end if;return jsonb_build_object('ok',true,'data',s,'data_hash',digest,'batch_id',b.id);end$$;
-- Preserve existing monthly API while adding per-person and transfer gates.
do $patch$declare src text;begin
src:=pg_get_functiondef('public.school_payroll_action(text,text,date,bigint,jsonb)'::regprocedure);
src:=replace(src,$txt$role_type in ('老師','工讀生')$txt$,$txt$(role_type in ('老師','工讀生') or id~'^20[0-9]{2}T[0-9]+$' or exists(select 1 from mschool.schedules scheduled where scheduled.worker_id=mschool.users.id))$txt$);
src:=replace(src,$txt$'role_type',role_type,'status'$txt$,$txt$'role_type',case when role_type='同工'and id~'^20[0-9]{2}T[0-9]+$'then '老師'else role_type end,'status'$txt$);
src:=replace(src,'else to_jsonb(b)end','else to_jsonb(b)-''transfer_snapshot''end');
src:=replace(src,$txt$'history',history);$txt$,$txt$'history',history,'worker_states',mschool.payroll_worker_states(b,aid,snap),'can_prepare',mschool.can_manage_schedules(aid),'banks',case when aid in('2026M0001','2026M0002')then coalesce((select jsonb_agg(to_jsonb(k)-'updated_by')from mschool.payroll_bank_accounts k),'[]'::jsonb)else '[]'::jsonb end,'transfer',case when aid='2026M0001'then b.transfer_snapshot else null end);$txt$);
src:=replace(src,$txt$if p_action<>'submit' then raise exception 'invalid_payroll_action';end if;$txt$,$gate$if p_action<>'submit' then raise exception 'invalid_payroll_action';end if;
 if b.settled_at is null then raise exception 'month_not_settled_yet';end if;
 if b.stage in('yuting','enru','wife')then
  snap:=case when b.stage='wife'then b.snapshot else mschool.payroll_snapshot(p_month)end;
  if jsonb_array_length(snap->'workers')=0 then raise exception 'empty_payroll';end if;
  if exists(select 1 from jsonb_array_elements(snap->'workers')w where not exists(select 1 from mschool.payroll_person_reviews pr where pr.month_id=b.id and pr.worker_id=w->>'worker_id'and pr.stage=b.stage and pr.source_hash=mschool.payroll_worker_hash(w,b.stage)))then raise exception 'all_workers_must_be_reviewed';end if;
 end if;
 if b.stage='wife'and (b.transfer_chart_path is null or b.transfer_data_hash is distinct from md5(mschool.payroll_transfer_data(p_month)::text))then raise exception 'transfer_chart_required';end if;$gate$);
src:=replace(src,$txt$if target is null then raise exception 'invalid_payroll_stage';end if;$txt$,$txt$if target is null then raise exception 'invalid_payroll_stage';end if;$txt$);
src:=replace(src,$txt$target:=case b.stage when 'enru' then 'yuting' when 'wife' then 'enru' when 'pastor' then 'wife'end;$txt$,$ret$target:=case b.stage when 'enru' then 'yuting' when 'wife' then 'enru' when 'pastor' then 'wife'end;
delete from mschool.payroll_person_reviews where month_id=b.id and (target='yuting'or target='enru'and stage in('enru','wife')or target='wife'and stage='wife');
update mschool.payroll_months set transfer_chart_path=null,transfer_chart_hash=null,transfer_data_hash=null,transfer_snapshot=null where id=b.id;$ret$);
src:=replace(src,$from$if not exists(select 1 from mschool.payroll_photos where month_id=b.id)then raise exception 'attendance_photo_required';end if;$from$,'');
execute src;
src:=pg_get_functiondef('mschool.payroll_schedule_guard()'::regprocedure);
src:=replace(src,'set revision=revision+1,saved=false,updated_at=now()','set revision=revision+1,saved=false,transfer_chart_path=null,transfer_chart_hash=null,transfer_data_hash=null,transfer_snapshot=null,updated_at=now()');
src:=replace(src,$txt$where month=d;$txt$,$txt$where month=d;delete from mschool.payroll_person_reviews where month_id in(select id from mschool.payroll_months where month=d);$txt$);execute src;
src:=pg_get_functiondef('public.school_payroll_month_end()'::regprocedure);
src:=replace(src,'insert into mschool.payroll_months(month,snapshot)values(m,mschool.payroll_snapshot(m))on conflict(month)do nothing',$txt$insert into mschool.payroll_months(month,snapshot,settled_at)values(m,mschool.payroll_snapshot(m),now())on conflict(month)do update set snapshot=excluded.snapshot,settled_at=now(),saved=false,revision=mschool.payroll_months.revision+1 where mschool.payroll_months.settled_at is null$txt$);execute src;
end$patch$;
-- New photo registration binds each receipt to the selected person and uploader.
create function public.school_payroll_worker_photo(p_actor text,p_month date,p_revision bigint,p_worker text,p_photo uuid default null,p_file text default null,p_name text default null)returns jsonb language plpgsql set search_path=''as $$declare a jsonb;b mschool.payroll_months;begin
a:=mschool.payroll_actor(p_actor);perform pg_advisory_xact_lock(57203,2);perform pg_advisory_xact_lock(hashtextextended('payroll:'||p_month,57031));select *into b from mschool.payroll_months where month=p_month for update;
if b.id is null or b.stage not in('yuting','enru')or a->>'id'is distinct from mschool.payroll_stage_actor(b.stage)then raise exception 'photo_stage_forbidden'using errcode='42501';end if;
if not exists(select 1 from jsonb_array_elements(mschool.payroll_snapshot(p_month)->'workers')w where w->>'worker_id'=p_worker)then raise exception 'worker_not_in_month';end if;
if exists(select 1 from mschool.payroll_photos where id=p_photo and month_id=b.id and worker_id=p_worker and uploaded_by=a->>'id')then return jsonb_build_object('ok',true,'duplicate',true);end if;
if b.revision is distinct from p_revision then raise exception 'payroll_changed_reload'using errcode='40001';end if;
if p_file is not null then
if p_photo is null or p_file!~'^[A-Za-z0-9_-]{10,120}$'or length(p_name)not between 1 and 180 then raise exception 'invalid_photo';end if;
insert into mschool.payroll_photos(id,month_id,worker_id,drive_file_id,file_name,uploaded_by,uploaded_stage)values(p_photo,b.id,p_worker,p_file,p_name,a->>'id',b.stage);
delete from mschool.payroll_person_reviews where month_id=b.id and worker_id=p_worker and (stage=b.stage or stage='wife');
update mschool.payroll_months set revision=revision+1,saved=false,updated_at=now()where id=b.id;
insert into mschool.payroll_audit(month_id,actor_id,action,from_stage,to_stage,payload)values(b.id,a->>'id','photo_uploaded',b.stage,b.stage,jsonb_build_object('photo_id',p_photo,'worker_id',p_worker,'file_name',p_name));end if;
return jsonb_build_object('ok',true,'batch',to_jsonb(b));end$$;
-- All new RPCs remain service-only, behind verified school sessions in mschool-api.
do $acl$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where(n.nspname='mschool'and p.proname in('payroll_record_contributor','payroll_worker_hash','payroll_worker_states','payroll_transfer_data'))or(n.nspname='public'and p.proname in('school_payroll_prepare_month','school_payroll_person_review','school_payroll_bank_save','school_payroll_transfer','school_payroll_worker_photo'))loop
execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end$acl$;
