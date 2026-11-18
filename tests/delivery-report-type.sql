begin;
create temporary table isolated_report_delivery (like public.pastoral_notification_deliveries including defaults including constraints including indexes);
insert into isolated_report_delivery(entity_key,notification_type,recipient_staff_id,related_id,idempotency_key,status,error_code,app_status,line_status,sent_at,updated_at)
values ('mplus','daily_traffic_report',null,'isolation-notice','isolation:daily-traffic-report','sent',null,'disabled','sent',now(),now())
on conflict(idempotency_key) do update set line_status=excluded.line_status;
insert into isolated_report_delivery(entity_key,notification_type,related_id,idempotency_key,status,app_status,line_status)
values ('mplus','daily_traffic_report','isolation-notice','isolation:daily-traffic-report','sent','disabled','sent')
on conflict(idempotency_key) do update set line_status=excluded.line_status;
do $test$ begin
 if (select count(*) from isolated_report_delivery)<>1 then raise exception 'duplicate delivery'; end if;
 begin
  insert into isolated_report_delivery(entity_key,notification_type,related_id,idempotency_key,status) values('mplus','invalid_type','isolation-notice','isolation:invalid','sent');
  raise exception 'invalid type accepted';
 exception when check_violation then null; end;
end $test$;
select 'PASS: full v25 delivery payload accepted, duplicate upsert remains one row, invalid type rejected; isolated transaction rollback' as result;
rollback;