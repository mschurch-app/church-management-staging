-- Private workspace and bounded Mini job channel. No NAS or database admin keys in clients.
create schema if not exists sermon_preparation;
revoke all on schema sermon_preparation from public,anon,authenticated;
create table sermon_preparation.projects(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 church_id text not null default 'M+' check(church_id='M+'),title text not null check(length(title) between 1 and 200),
 speaker text not null check(length(speaker) between 1 and 80),scripture text not null check(length(scripture) between 1 and 200),
 service_date date,version integer not null default 1,backup_version integer not null default 0,
 archived boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 request_id uuid not null,unique(owner_id,request_id));
create table sermon_preparation.versions(
 project_id uuid not null references sermon_preparation.projects(id),version integer not null,
 payload jsonb not null check(octet_length(payload::text)<=500000),created_at timestamptz not null default now(),
 primary key(project_id,version));
create table sermon_preparation.jobs(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 project_id uuid references sermon_preparation.projects(id),kind text not null check(kind in ('search','detail','outline','manuscript','slides','backup')),
 request_id uuid not null,input jsonb not null check(octet_length(input::text)<=600000),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 result jsonb,progress text not null default '',error text not null default '',attempts integer not null default 0,
 worker text,lease_token uuid,lease_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,request_id));
create index sermon_projects_owner on sermon_preparation.projects(owner_id,updated_at desc);
create index sermon_jobs_queue on sermon_preparation.jobs(status,created_at);
create index sermon_jobs_owner on sermon_preparation.jobs(owner_id,created_at desc);
create table sermon_preparation.workers(
 name text primary key,token_hash text not null check(length(token_hash)=64),enabled boolean not null default true,
 last_seen timestamptz,summary jsonb not null default '{}'::jsonb);
alter table sermon_preparation.projects enable row level security;
alter table sermon_preparation.versions enable row level security;
alter table sermon_preparation.jobs enable row level security;
alter table sermon_preparation.workers enable row level security;
revoke all on all tables in schema sermon_preparation from public,anon,authenticated;

create function sermon_preparation.editor(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from church_auth.accounts a join church_auth.grants g on g.user_id=a.user_id
 left join church_auth.account_feature_permissions f on f.user_id=a.user_id and f.church_id='M+' and f.feature_key='website_weekly'
 where a.user_id=p_user and a.is_active and g.church_id='M+' and g.permission='website_weekly'
 and coalesce(f.can_view,true) and coalesce(f.can_edit,true))
$$;
revoke all on function sermon_preparation.editor(uuid) from public,anon,authenticated;

create function public.sermon_workspace_call(p_user uuid,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p sermon_preparation.projects; j sermon_preparation.jobs; v jsonb; new_version integer; rid uuid;
begin
 if not sermon_preparation.editor(p_user) then raise exception 'forbidden'; end if;
 if p_input is null or octet_length(p_input::text)>600000 then raise exception 'invalid_request'; end if;
 if p_action='list' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from
   (select id,title,speaker,scripture,service_date,version,backup_version,updated_at from sermon_preparation.projects
    where owner_id=p_user and not archived order by updated_at desc limit 100)x),'[]'::jsonb),
   'worker',(select jsonb_build_object('online',last_seen>now()-interval '2 minutes','last_seen',last_seen,'summary',summary)
    from sermon_preparation.workers where name='mac-mini-sermon'));
 elsif p_action='job' then
  select * into j from sermon_preparation.jobs where id=(p_input->>'job_id')::uuid and owner_id=p_user;
  if not found then raise exception 'not_found';end if;return jsonb_build_object('job',(to_jsonb(j)-'lease_token'-'input')||jsonb_build_object('base_version',(j.input->>'version')::integer));
 elsif p_action='create' then
  rid:=(p_input->>'request_id')::uuid;
  select * into p from sermon_preparation.projects where owner_id=p_user and request_id=rid;
  if found then return jsonb_build_object('project',to_jsonb(p));end if;
  if (select count(*) from sermon_preparation.projects where owner_id=p_user and not archived)>=100 then raise exception 'project_limit';end if;
  insert into sermon_preparation.projects(owner_id,title,speaker,scripture,service_date,request_id)
   values(p_user,p_input->>'title',p_input->>'speaker',p_input->>'scripture',nullif(p_input->>'service_date','')::date,rid) returning * into p;
  v:=p_input->'payload';if v->>'format'<>'mplus-sermon-workspace' then raise exception 'invalid_draft';end if;
  insert into sermon_preparation.versions values(p.id,1,v,now());
  insert into sermon_preparation.jobs(owner_id,project_id,kind,request_id,input)
   values(p_user,p.id,'backup',gen_random_uuid(),jsonb_build_object('project',to_jsonb(p),'version',1,'payload',v));
  return jsonb_build_object('project',to_jsonb(p),'payload',v);
 end if;
 select * into p from sermon_preparation.projects where id=(p_input->>'project_id')::uuid and owner_id=p_user and not archived for update;
 if not found then raise exception 'not_found';end if;
 select payload into v from sermon_preparation.versions where project_id=p.id and version=p.version;
 if p_action='load' then
  return jsonb_build_object('project',to_jsonb(p),'payload',v,
   'versions',coalesce((select jsonb_agg(jsonb_build_object('version',version,'created_at',created_at) order by version desc) from sermon_preparation.versions where project_id=p.id),'[]'::jsonb),
   'jobs',coalesce((select jsonb_agg((to_jsonb(x)-'input'-'lease_token')||jsonb_build_object('base_version',(x.input->>'version')::integer)) from
     (select * from sermon_preparation.jobs where project_id=p.id and owner_id=p_user order by created_at desc limit 20)x),'[]'::jsonb));
 elsif p_action='version' then
  select payload into v from sermon_preparation.versions where project_id=p.id and version=(p_input->>'version')::integer;
  if not found then raise exception 'not_found';end if;return jsonb_build_object('payload',v,'version',(p_input->>'version')::integer);
 elsif p_action='save' then
  if p.version<>(p_input->>'base_version')::integer then raise exception 'conflict';end if;
  v:=p_input->'payload';if v->>'format'<>'mplus-sermon-workspace' then raise exception 'invalid_draft';end if;
  new_version:=p.version+1;
  insert into sermon_preparation.versions values(p.id,new_version,v,now());
  update sermon_preparation.projects set version=new_version,title=v->'information'->>'title',speaker=v->'information'->>'speaker',scripture=v->'information'->>'scripture',service_date=nullif(v->'information'->>'service_date','')::date,updated_at=now() where id=p.id returning * into p;
  insert into sermon_preparation.jobs(owner_id,project_id,kind,request_id,input)
   values(p_user,p.id,'backup',gen_random_uuid(),jsonb_build_object('project',to_jsonb(p),'version',new_version,'payload',v));
  return jsonb_build_object('project',to_jsonb(p),'payload',v);
 elsif p_action='archive' then
  update sermon_preparation.projects set archived=true,updated_at=now() where id=p.id;return jsonb_build_object('archived',true);
 elsif p_action='enqueue' then
  rid:=(p_input->>'request_id')::uuid;
  select * into j from sermon_preparation.jobs where owner_id=p_user and request_id=rid;
  if found then
   if j.project_id<>p.id or j.kind<>p_input->>'kind' then raise exception 'conflict';end if;
   return jsonb_build_object('job',(to_jsonb(j)-'lease_token'-'input')||jsonb_build_object('base_version',(j.input->>'version')::integer));
  end if;
  if p.version<>(p_input->>'base_version')::integer then raise exception 'conflict';end if;
  if (select count(*) from sermon_preparation.jobs where owner_id=p_user and status in ('queued','running') and kind<>'backup')>=10 then raise exception 'queue_limit';end if;
  if p_input->>'kind' in ('outline','manuscript','slides') then
   if (select count(*) from sermon_preparation.jobs where owner_id=p_user and kind in ('outline','manuscript','slides') and created_at>now()-interval '1 day')>=20 then raise exception 'generation_limit';end if;
  end if;
  insert into sermon_preparation.jobs(owner_id,project_id,kind,request_id,input)
   values(p_user,p.id,p_input->>'kind',rid,jsonb_build_object('project',to_jsonb(p),'version',p.version,'payload',v,'options',coalesce(p_input->'options','{}'::jsonb))) returning * into j;
  return jsonb_build_object('job',(to_jsonb(j)-'lease_token'-'input')||jsonb_build_object('base_version',(j.input->>'version')::integer));
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.sermon_workspace_call(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sermon_workspace_call(uuid,text,jsonb) to service_role;

create function public.sermon_worker_call(p_worker text,p_token text,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j sermon_preparation.jobs; lane text;
begin
 if p_token is null or length(p_token)<>64 or not exists(select 1 from sermon_preparation.workers
  where name=p_worker and enabled and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then raise exception 'forbidden';end if;
 if p_input is null or octet_length(p_input::text)>1000000 then raise exception 'invalid_request';end if;
 update sermon_preparation.workers set last_seen=now() where name=p_worker;
 if p_action='ping' then
  update sermon_preparation.workers set summary=coalesce(p_input->'summary','{}'::jsonb) where name=p_worker;
  return jsonb_build_object('ok',true);
 elsif p_action='claim' then
  lane:=p_input->>'lane';if lane not in ('io','model') then raise exception 'invalid_request';end if;
  update sermon_preparation.jobs set status='failed',error='工作中斷，請保留草稿後重新送出。',updated_at=now()
   where status='running' and lease_until<now() and attempts>=3;
  select * into j from sermon_preparation.jobs where
   ((status='queued') or (status='running' and lease_until<now() and attempts<3))
   and ((lane='model' and kind in ('outline','manuscript','slides')) or (lane='io' and kind in ('search','detail','backup')))
   order by case when kind in ('search','detail') then 0 else 1 end,created_at for update skip locked limit 1;
  if not found then return jsonb_build_object('job',null);end if;
  -- Recheck editor access at execution time; revocation also stops queued work.
  if not sermon_preparation.editor(j.owner_id) then
   update sermon_preparation.jobs set status='failed',error='帳號權限已變更。',updated_at=now() where id=j.id;return jsonb_build_object('job',null);
  end if;
  update sermon_preparation.jobs set status='running',worker=p_worker,lease_token=gen_random_uuid(),lease_until=now()+interval '20 minutes',attempts=attempts+1,updated_at=now()
   where id=j.id returning * into j;return jsonb_build_object('job',to_jsonb(j));
 elsif p_action in ('progress','complete','fail') then
  select * into j from sermon_preparation.jobs where id=(p_input->>'job_id')::uuid and worker=p_worker and status='running'
   and lease_token=(p_input->>'lease_token')::uuid and lease_until>now() for update;
  if not found then raise exception 'lease_lost';end if;
  if p_action='progress' then
   update sermon_preparation.jobs set progress=left(coalesce(p_input->>'progress',''),300),lease_until=now()+interval '20 minutes',updated_at=now() where id=j.id;
  elsif p_action='complete' then
   update sermon_preparation.jobs set status='completed',result=p_input->'result',progress='完成',lease_until=null,updated_at=now() where id=j.id;
   if j.kind='backup' and p_input->'result'->>'verified'='true' then
    update sermon_preparation.projects set backup_version=greatest(backup_version,(j.input->>'version')::integer) where id=j.project_id;
   end if;
  else
   update sermon_preparation.jobs set status='failed',error=left(coalesce(p_input->>'error','處理失敗，請重試。'),500),result=p_input->'result',lease_until=null,updated_at=now() where id=j.id;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'invalid_action';
end $$;
revoke all on function public.sermon_worker_call(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.sermon_worker_call(text,text,text,jsonb) to service_role;
