begin;
create table church_auth.member_care_team (
 church_id text not null check(church_id in ('M+','SHiNE')),
 user_id uuid not null references church_auth.accounts(user_id),
 primary key(church_id,user_id)
);
alter table church_auth.member_care_team enable row level security;
revoke all on church_auth.member_care_team from public,anon,authenticated;
grant all on church_auth.member_care_team to service_role;
insert into church_auth.member_care_team(church_id,user_id)
 select 'M+',a.user_id from church_auth.accounts a
 where a.is_active and a.display_name in ('吳俊璋','謝碧鳳','邵鈺庭','曾恩茹')
 and exists(select 1 from church_auth.grants g where g.user_id=a.user_id and g.church_id='M+' and g.permission='private_prayers');
do $$begin if (select count(*) from church_auth.member_care_team where church_id='M+')<>4 then raise exception 'pastoral_team_requires_four_verified_accounts';end if;end$$;
create function church_auth.member_care_team_allowed(p_church text) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from church_auth.member_care_team t join church_auth.accounts a using(user_id)
 where t.church_id=p_church and t.user_id=(select auth.uid()) and a.is_active)
 and church_auth.allowed(p_church,'private_prayers');
$$;
revoke all on function church_auth.member_care_team_allowed(text) from public,anon;
grant execute on function church_auth.member_care_team_allowed(text) to authenticated,service_role;
alter table public.prayers add column care_audience text check(care_audience in ('church','pastoral'));
alter table public.prayers add column care_member_id bigint references public.members(id);
alter table public.prayers add constraint member_care_prayer_scope check(care_audience is null or (care_member_id is not null and is_private=(care_audience='pastoral')));
alter policy church_permission on public.prayers
 using(church_auth.allowed(church_id,'private_prayers') and (care_audience is distinct from 'pastoral' or church_auth.member_care_team_allowed(church_id)))
 with check(church_auth.allowed(church_id,'private_prayers') and (care_audience is distinct from 'pastoral' or church_auth.member_care_team_allowed(church_id)));
create index prayers_member_care_owner on public.prayers(church_id,care_member_id,created_at desc) where care_audience is not null;
create index prayers_member_care_public on public.prayers(church_id,created_at desc) where care_audience='church' and not is_private;
create table church_auth.member_devotional_journal (
 church_id text not null check(church_id in ('M+','SHiNE')),
 member_id bigint not null references public.members(id),
 reading_date date not null check(reading_date>='2026-01-01'),
 note text not null default '' check(length(note)<=5000),
 completed_at timestamptz,
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(church_id,member_id,reading_date)
);
alter table church_auth.member_devotional_journal enable row level security;
revoke all on church_auth.member_devotional_journal from public,anon,authenticated;
grant all on church_auth.member_devotional_journal to service_role;
create function public.member_care_operation(p_church text,p_channel text,p_subject text,p_action text,p_input jsonb default '{}'::jsonb)
 returns jsonb language plpgsql set search_path='' as $$
declare mid bigint; m public.members%rowtype; r public.prayers%rowtype;
 j church_auth.member_devotional_journal%rowtype; d date; today date:=(now() at time zone 'Asia/Taipei')::date;
 request uuid; audience text; title_text text; content_text text; note_text text; mark_complete boolean; expected bigint; before_date date;
begin
 if p_church not in ('M+','SHiNE') or p_church is null or p_channel is distinct from '2011645391' or p_subject is null or p_subject!~'^U[0-9a-f]{32}$' then raise exception 'binding_required';end if;
 select b.member_id into mid from church_auth.member_bindings b join public.members mm on mm.id=b.member_id and mm.church_id=b.church_id
 where b.church_id=p_church and b.login_channel_id=p_channel and b.line_subject=p_subject and b.active and mm.archived_at is null for share of b,mm;
 if mid is null then raise exception 'binding_required';end if;
 select * into strict m from public.members where id=mid and church_id=p_church;
 if p_action='prayer_list' then
  return jsonb_build_object('ok',true,'community',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select id,author_name,title,content,created_at from public.prayers where church_id=p_church and care_audience='church' and not is_private and expires_at>now() and status is distinct from 'closed' order by created_at desc,id desc limit 50)x),'[]'::jsonb),
   'mine',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,content,care_audience as audience,status,created_at,(select d.status from church_auth.member_care_deliveries d where d.prayer_id=p.id)as notice_status from public.prayers p where church_id=p_church and care_member_id=mid and care_audience is not null order by created_at desc,id desc limit 50)x),'[]'::jsonb));
 elsif p_action='prayer_create' then
  audience:=p_input->>'audience';title_text:=btrim(p_input->>'title');content_text:=btrim(p_input->>'content');
  if audience is null or audience not in ('church','pastoral') or title_text is null or length(title_text) not between 2 and 80 or content_text is null or length(content_text) not between 2 and 1000 or coalesce(p_input->>'request_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then raise exception 'invalid_input';end if;
  request:=(p_input->>'request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('member-care-request:'||request::text,0));
  select * into r from public.prayers where wall_request_id=request;
  if found then
   if r.church_id is distinct from p_church or r.care_member_id is distinct from mid or r.care_audience is distinct from audience or r.title is distinct from title_text or r.content is distinct from content_text then raise exception 'request_reused';end if;
   return jsonb_build_object('ok',true,'id',r.id,'audience',r.care_audience);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('member-care:'||p_church||':'||mid,0));
  if (select count(*) from public.prayers where church_id=p_church and care_member_id=mid and created_at>now()-interval '1 minute')>=3 then raise exception 'rate_limited';end if;
  insert into public.prayers(church_id,line_user_id,author_name,group_name,title,content,hands_count,is_private,status,wall_request_id,care_audience,care_member_id)
   values(p_church,p_subject,m.name,coalesce(m.group_name,'未編組'),title_text,content_text,0,audience='pastoral','pending',request,audience,mid) returning * into r;
  return jsonb_build_object('ok',true,'id',r.id,'audience',r.care_audience);
 elsif p_action='journal_get' then
  if coalesce(p_input->>'date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_date';end if;
  d:=(p_input->>'date')::date;
  select * into j from church_auth.member_devotional_journal where church_id=p_church and member_id=mid and reading_date=d;
  return jsonb_build_object('ok',true,'record',case when j.member_id is null then null else jsonb_build_object('reading_date',j.reading_date,'note',j.note,'completed_at',j.completed_at,'revision',j.revision) end,'server_today',today);
 elsif p_action='journal_history' then
  if p_input ? 'before' then before_date:=(p_input->>'before')::date;else before_date:='2028-01-01';end if;
  return jsonb_build_object('ok',true,'items',coalesce((select jsonb_agg(to_jsonb(x)) from(
   select reading_date,note,completed_at,revision from church_auth.member_devotional_journal where church_id=p_church and member_id=mid and reading_date<before_date order by reading_date desc limit 30)x),'[]'::jsonb));
 elsif p_action='journal_save' then
  if coalesce(p_input->>'date','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or jsonb_typeof(p_input->'note') is distinct from 'string' or jsonb_typeof(p_input->'complete') is distinct from 'boolean' or coalesce(p_input->>'revision','')!~'^[0-9]{1,12}$' then raise exception 'invalid_input';end if;
  d:=(p_input->>'date')::date;note_text:=p_input->>'note';mark_complete:=(p_input->>'complete')::boolean;expected:=(p_input->>'revision')::bigint;
  if d<'2026-01-01' or d>today then raise exception 'invalid_date';end if;
  if length(note_text)>5000 then raise exception 'invalid_input';end if;
  perform pg_advisory_xact_lock(hashtextextended('member-care:'||p_church||':'||mid,0));
  select * into j from church_auth.member_devotional_journal where church_id=p_church and member_id=mid and reading_date=d for update;
  if coalesce(j.revision,0)<>expected then
   if j.member_id is null or j.note is distinct from note_text or(mark_complete and j.completed_at is null) then raise exception 'version_conflict';end if;
  else
   insert into church_auth.member_devotional_journal(church_id,member_id,reading_date,note,completed_at)
    values(p_church,mid,d,note_text,case when mark_complete then now()end)
    on conflict(church_id,member_id,reading_date)do update set note=excluded.note,completed_at=coalesce(member_devotional_journal.completed_at,excluded.completed_at),revision=member_devotional_journal.revision+1,updated_at=now() returning * into j;
  end if;
  return jsonb_build_object('ok',true,'record',jsonb_build_object('reading_date',j.reading_date,'note',j.note,'completed_at',j.completed_at,'revision',j.revision));
 end if;
 raise exception 'invalid_action';
end;$$;
revoke all on function public.member_care_operation(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.member_care_operation(text,text,text,text,jsonb) to service_role;
commit;
