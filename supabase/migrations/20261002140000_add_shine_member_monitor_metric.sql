create or replace function public.get_system_monitor_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if p_user_id is null or not exists (select 1 from church_auth.accounts a where a.user_id=p_user_id and a.is_active)
    or not (exists(select 1 from church_auth.owners o where o.user_id=p_user_id)
      or exists(select 1 from church_auth.system_monitor_viewers v where v.user_id=p_user_id)) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'generated_at',now(),
    'database',jsonb_build_object(
      'size_bytes',pg_database_size(current_database()),
      'active_connections',(select count(*) from pg_stat_activity where datname=current_database())
    ),
    'church',jsonb_build_object(
      'members',(select count(*) from public.members where archived_at is null),
      'mplus_members',(select count(*) from public.members where church_id='M+' and archived_at is null),
      'shine_members',(select count(*) from public.members where church_id='SHiNE' and archived_at is null),
      'newcomers',(select count(*) from public.members where church_id='M+' and archived_at is null and faith_status='新朋友（初次聚會）'),
      'groups',(select count(*) from public.groups where church_id='M+'),
      'open_care',(select count(*) from public.pastoral_newcomer_care_cases where entity_key='mplus' and status='open'),
      'overdue_care',(select count(*) from public.pastoral_newcomer_care_cases where entity_key='mplus' and status='open' and coalesce(next_follow_up_at,first_contact_due_at)<now()),
      'pending_prayers',(select count(*) from public.prayers where church_id='M+' and status='pending'),
      'future_services',(select count(*) from public.service_schedules where church_id='M+' and service_date>=current_date::text)
    ),
    'school',jsonb_build_object(
      'students',(select count(*) from mschool.users where role_type='學生' and status='在班'),
      'staff',(select count(*) from mschool.users where role_type<>'學生' and status<>'離職'),
      'today_checkins',(select count(*) from mschool.check_in_logs where check_time>=date_trunc('day',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'),
      'month_rollcalls',(select count(*) from mschool.roll_calls where created_at>=date_trunc('month',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'),
      'today_counseling',(select count(*) from mschool.counseling_logs where created_at>=date_trunc('day',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'),
      'last_report',(select coalesce(jsonb_build_object('date',report_date,'status',status,'sent_at',sent_at,'error',error_code),'null'::jsonb) from public.mschool_daily_report_deliveries order by report_date desc limit 1)
    ),
    'basketball',jsonb_build_object(
      'players',(select count(*) from basketball.players),
      'members',(select count(*) from basketball.users),
      'future_games',(select count(*) from basketball.schedules where event_date>=current_date),
      'game_stats',(select count(*) from basketball.game_player_stats),
      'today_checkins',(select count(*) from basketball.daily_checkins where checkin_date=current_date)
    ),
    'automation',jsonb_build_object(
      'line_summary',(select coalesce(jsonb_build_object('date',summary_date,'status',status,'sent_at',sent_at,'messages',message_count,'error',error_code),'null'::jsonb) from public.line_group_daily_summaries order by summary_date desc limit 1),
      'school_report',(select coalesce(jsonb_build_object('date',report_date,'status',status,'sent_at',sent_at,'error',error_code),'null'::jsonb) from public.mschool_daily_report_deliveries order by report_date desc limit 1),
      'cron_jobs',(select coalesce(jsonb_agg(jsonb_build_object('name',j.jobname,'schedule',j.schedule,'active',j.active,'last_status',r.status,'last_start',r.start_time,'last_end',r.end_time) order by j.jobname),'[]'::jsonb)
        from cron.job j left join lateral (select d.status,d.start_time,d.end_time from cron.job_run_details d where d.jobid=j.jobid order by d.start_time desc limit 1) r on true)
    ),
    'trends',jsonb_build_object(
      'member_growth',(select coalesce(jsonb_agg(jsonb_build_object('date',week_start::date,'members',members,'newcomers',newcomers) order by week_start),'[]'::jsonb)
        from (select w.week_start,
          count(m.id) filter(where m.created_at>=w.week_start and m.created_at<w.week_start+interval '7 days') as members,
          count(m.id) filter(where m.created_at>=w.week_start and m.created_at<w.week_start+interval '7 days' and m.faith_status='新朋友（初次聚會）') as newcomers
          from generate_series(date_trunc('week',now())-interval '11 weeks',date_trunc('week',now()),interval '1 week') w(week_start)
          left join public.members m on m.church_id='M+' and m.archived_at is null and m.created_at>=w.week_start and m.created_at<w.week_start+interval '7 days'
          group by w.week_start) q),
      'church_attendance',(select coalesce(jsonb_agg(jsonb_build_object('date',meeting_date,'expected',total_expected,'present',total_present,'rate',case when total_expected>0 then round(total_present*100.0/total_expected) else 0 end) order by meeting_date),'[]'::jsonb)
        from (select meeting_date,sum(total_expected)::int total_expected,sum(total_present)::int total_present from public.attendance_records where church_id='M+' group by meeting_date order by meeting_date desc limit 12) q),
      'school_attendance',(select coalesce(jsonb_agg(jsonb_build_object('date',attendance_day,'expected',expected,'present',present,'rate',case when expected>0 then round(present*100.0/expected) else 0 end) order by attendance_day),'[]'::jsonb)
        from (select (created_at at time zone 'Asia/Taipei')::date attendance_day,count(*)::int expected,count(*) filter(where attendance_status='出席')::int present
          from mschool.roll_calls where created_at>=now()-interval '45 days' group by 1 order by 1 desc limit 30) q),
      'basketball_checkins',(select coalesce(jsonb_agg(jsonb_build_object('date',checkin_date,'count',checkins,'avg_fatigue',avg_fatigue) order by checkin_date),'[]'::jsonb)
        from (select checkin_date,count(*)::int checkins,round(avg(fatigue),1) avg_fatigue from basketball.daily_checkins where checkin_date>=current_date-30 group by checkin_date order by checkin_date desc limit 30) q)
    )
  ) into result;
  return result;
end $$;

revoke all on function public.get_system_monitor_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.get_system_monitor_snapshot(uuid) to service_role;
