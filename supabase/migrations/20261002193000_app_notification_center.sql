create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  church_id text check (church_id in ('M+','SHiNE')),
  event_key text not null check (char_length(event_key) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  target_url text not null default '/admin-dashboard.html' check (target_url like '/%' and target_url not like '//%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists app_notifications_user_created_idx on public.app_notifications(user_id,created_at desc);
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public,anon,authenticated;
grant select,update(read_at) on public.app_notifications to authenticated;
grant all on public.app_notifications to service_role;
create policy app_notifications_own_read on public.app_notifications for select to authenticated using(user_id=auth.uid());
create policy app_notifications_own_update on public.app_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.list_my_app_notifications(p_limit integer default 30)
returns table(id uuid,church_id text,event_key text,title text,body text,target_url text,read_at timestamptz,created_at timestamptz)
language sql security definer set search_path='' as $$
 select n.id,n.church_id,n.event_key,n.title,n.body,n.target_url,n.read_at,n.created_at
 from public.app_notifications n where n.user_id=auth.uid()
 order by n.created_at desc limit least(greatest(coalesce(p_limit,30),1),100);
$$;
create or replace function public.mark_app_notification_read(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.app_notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid();
 return found;
end $$;
create or replace function public.create_my_test_notification(p_church text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 if p_church is not null and p_church not in ('M+','SHiNE') then raise exception 'invalid_church'; end if;
 insert into public.app_notifications(user_id,church_id,event_key,title,body,target_url)
 values(auth.uid(),p_church,'test','教會 OS 通知測試','通知中心已經開始運作。下一步會由後端主動推播新朋友、工作與服事提醒。','/admin-dashboard.html') returning id into new_id;
 return new_id;
end $$;
revoke all on function public.list_my_app_notifications(integer),public.mark_app_notification_read(uuid),public.create_my_test_notification(text) from public,anon;
grant execute on function public.list_my_app_notifications(integer),public.mark_app_notification_read(uuid),public.create_my_test_notification(text) to authenticated,service_role;
