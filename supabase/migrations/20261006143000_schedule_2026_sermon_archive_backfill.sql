alter table public.sermon_social_drafts
  add column if not exists source_channel_id text,
  add column if not exists source_channel_name text,
  add column if not exists source_duration_seconds integer check (source_duration_seconds is null or source_duration_seconds > 0),
  add column if not exists archive_backfill boolean not null default false,
  add column if not exists youtube_caption_requested boolean not null default true;

create index if not exists sermon_social_archive_worker_idx
  on public.sermon_social_drafts (archive_backfill,status,updated_at)
  where archive_backfill=true and status='processing';

create table if not exists public.sermon_archive_queue (
  id uuid primary key default gen_random_uuid(),
  source_channel text not null check (source_channel in ('M+','SHiNE')),
  source_channel_id text not null,
  source_channel_name text not null,
  video_id text not null unique,
  video_title text not null,
  service_date date not null,
  duration_seconds integer not null check (duration_seconds > 0),
  scheduled_for timestamptz not null,
  youtube_caption_requested boolean not null default true,
  publish_target text not null default 'M+ Instagram' check (publish_target='M+ Instagram'),
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','skipped')),
  draft_id uuid references public.sermon_social_drafts(id) on delete set null,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sermon_archive_queue enable row level security;
revoke all on public.sermon_archive_queue from anon,authenticated;
grant all on public.sermon_archive_queue to service_role;

insert into public.sermon_archive_queue
  (source_channel,source_channel_id,source_channel_name,video_id,video_title,service_date,duration_seconds,scheduled_for,youtube_caption_requested)
values
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','_R_kNLI-hm0','找回「非神不可」的渴望','2026-07-05',5068,'2026-10-08 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','fAGioCZ7FKk','散發屬天的吸引力','2026-06-28',3172,'2026-10-13 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','_AYaH6Fnk9U','點燃「熱情」的生命','2026-06-14',3186,'2026-10-15 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','8rGQKHoMZYw','啟動信心的翅膀','2026-06-07',5692,'2026-10-20 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','IsXX6vbZl1k','福音的跨越力','2026-05-17',6003,'2026-10-22 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','LxzbXQztl7s','脫離督工的轄制（二）','2026-05-03',5879,'2026-10-27 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','TcMoyQ_6WYA','脫離督工的轄制（一）','2026-04-19',6251,'2026-10-29 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','T9pKdy7U-9s','復活勝過恐懼的門','2026-04-05',5576,'2026-11-03 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','PUlsBqsh81w','蒙福的破曉：道成肉身的震撼','2026-03-22',6063,'2026-11-05 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','T3JDVwH3hqs','來自上帝的12則未讀信息','2026-02-22',5576,'2026-11-10 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','4yD0R-c1vgc','蒙福的眼界','2026-02-15',4742,'2026-11-12 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','fX0OLfSJyn4','上帝給的祝福你裝得下嗎？','2026-01-25',3161,'2026-11-17 10:00:00+08',true),
  ('M+','UClE8pjK0fnA-o18VxblIm6A','M+大雅教會','89YETDdwJN4','蒙福的底氣：人生的原廠說明書','2026-01-11',2420,'2026-11-19 10:00:00+08',true),
  ('SHiNE','UC-aXkHgB_wHR2Y0TJF6o23A','火樂教會','jpCJSXE6MDU','原來不是靠努力就可以','2026-08-30',2178,'2026-10-07 14:00:00+08',false),
  ('SHiNE','UC-aXkHgB_wHR2Y0TJF6o23A','火樂教會','KJ9MdiG2vC8','信心突破界線','2026-06-21',3012,'2026-10-14 14:00:00+08',false),
  ('SHiNE','UC-aXkHgB_wHR2Y0TJF6o23A','火樂教會','bJIYkYK3RmI','成為世界無法熄滅的火','2026-05-24',2565,'2026-10-21 14:00:00+08',false),
  ('SHiNE','UC-aXkHgB_wHR2Y0TJF6o23A','火樂教會','hpbVeE58tgM','解鎖枯乾的手、找回心的溫度','2026-04-12',2382,'2026-10-28 14:00:00+08',false),
  ('SHiNE','UC-aXkHgB_wHR2Y0TJF6o23A','火樂教會','bY-jB-JIwn0','無可取代的你：肢體代償','2026-03-15',2062,'2026-11-04 14:00:00+08',false)
on conflict (video_id) do update set
  video_title=excluded.video_title,service_date=excluded.service_date,duration_seconds=excluded.duration_seconds,
  scheduled_for=excluded.scheduled_for,youtube_caption_requested=excluded.youtube_caption_requested,
  source_channel=excluded.source_channel,source_channel_id=excluded.source_channel_id,
  source_channel_name=excluded.source_channel_name,updated_at=now();

do $block$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('sermon-archive-launcher','sermon-archive-worker');

  perform cron.schedule('sermon-archive-launcher','*/10 * * * *',$job$
    with reset_stalled as (
      update public.sermon_archive_queue q set status='pending',error_code='launcher_retry',updated_at=now()
      where q.status='processing' and q.draft_id is null and q.updated_at < now()-interval '30 minutes'
      returning q.id
    ), candidate as (
      select q.id from public.sermon_archive_queue q
      where q.status='pending' and q.scheduled_for<=now()
        and not exists (select 1 from public.sermon_archive_queue x where x.status='processing')
      order by q.scheduled_for limit 1
    ), claimed as (
      update public.sermon_archive_queue q set status='processing',error_code=null,updated_at=now()
      from candidate c where q.id=c.id
      returning q.*
    )
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-project-url') || '/functions/v1/sermon-social-pipeline',
      headers := jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret')),
      body := jsonb_build_object('video_id',video_id,'title',video_title,'service_date',service_date,'duration_seconds',duration_seconds,
        'source_channel_id',source_channel_id,'source_channel_name',source_channel_name,'archive_backfill',true,
        'youtube_caption_requested',youtube_caption_requested,'segment_index',0),
      timeout_milliseconds := 300000
    ) from claimed;
  $job$);

  perform cron.schedule('sermon-archive-worker','5-59/10 * * * *',$job$
    with synced as (
      update public.sermon_archive_queue q set
        draft_id=d.id,
        status=case when d.status='processing' then q.status else 'completed' end,
        updated_at=now()
      from public.sermon_social_drafts d
      where q.status='processing' and d.youtube_video_id=q.video_id
      returning q.id
    ), active as (
      select q.*,d.id as active_draft_id
      from public.sermon_archive_queue q
      join public.sermon_social_drafts d on d.youtube_video_id=q.video_id
      where q.status='processing' and d.status='processing'
      order by q.scheduled_for limit 1
    ), work as (
      select a.*,(select g.i from generate_series(0,ceil(a.duration_seconds/300.0)::integer-1) g(i)
        where not exists (select 1 from public.sermon_social_segments s where s.draft_id=a.active_draft_id and s.segment_index=g.i and s.status='completed')
        order by g.i limit 1) as next_segment
      from active a
    )
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-project-url') || '/functions/v1/sermon-social-pipeline',
      headers := jsonb_build_object('content-type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='pastoral-care-cron-secret')),
      body := jsonb_build_object('video_id',video_id,'title',video_title,'service_date',service_date,'duration_seconds',duration_seconds,
        'source_channel_id',source_channel_id,'source_channel_name',source_channel_name,'archive_backfill',true,
        'youtube_caption_requested',youtube_caption_requested) || case when next_segment is null then jsonb_build_object('finalize',true) else jsonb_build_object('segment_index',next_segment) end,
      timeout_milliseconds := 300000
    ) from work;
  $job$);
end
$block$;
