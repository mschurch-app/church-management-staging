alter table sermon_preparation.jobs drop constraint jobs_kind_check;
alter table sermon_preparation.jobs add constraint jobs_kind_check check(kind in ('search','detail','guide','outline','manuscript','slides','backup','media'));

-- Add three-round guided discovery to the existing private Mini model lane.
create or replace function public.sermon_worker_call(p_worker text,p_token text,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j sermon_preparation.jobs; lane text; resume_at timestamptz;
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
   and available_at<=now()
   and ((lane='model' and kind in ('guide','outline','manuscript','slides','media')) or (lane='io' and kind in ('search','detail','backup')))
   order by case when kind in ('search','detail','guide') then 0 when kind='media' then 2 else 1 end,created_at for update skip locked limit 1;
  if not found then return jsonb_build_object('job',null);end if;
  -- Recheck editor access at execution time; revocation also stops queued work.
  if not sermon_preparation.editor(j.owner_id) then
   update sermon_preparation.jobs set status='failed',error='帳號權限已變更。',updated_at=now() where id=j.id;return jsonb_build_object('job',null);
  end if;
  update sermon_preparation.jobs set status='running',worker=p_worker,lease_token=gen_random_uuid(),lease_until=now()+interval '20 minutes',attempts=attempts+1,updated_at=now()
   where id=j.id returning * into j;return jsonb_build_object('job',to_jsonb(j));
 elsif p_action in ('progress','complete','fail','defer') then
  select * into j from sermon_preparation.jobs where id=(p_input->>'job_id')::uuid and worker=p_worker and status='running'
   and lease_token=(p_input->>'lease_token')::uuid and lease_until>now() for update;
  if not found then raise exception 'lease_lost';end if;
  if p_action='defer' then
   if j.kind<>'media' then raise exception 'invalid_request';end if;
   if p_input->>'stage'='baseline' then
    resume_at:=((date_trunc('day',now() at time zone 'Asia/Taipei')+interval '1 day') at time zone 'Asia/Taipei');
   else resume_at:=now()+interval '1 minute';end if;
   update sermon_preparation.jobs set status='queued',available_at=resume_at,progress=left(coalesce(p_input->>'progress','等待下一次接續；缺少均速時延至台北 00:00。'),300),lease_token=null,lease_until=null,attempts=greatest(0,attempts-1),updated_at=now() where id=j.id;
  elsif p_action='progress' then
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
