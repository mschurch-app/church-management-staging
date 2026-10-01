alter table public.pastoral_notification_deliveries
  drop constraint pastoral_notification_deliveries_notification_type_check;

alter table public.pastoral_notification_deliveries
  add constraint pastoral_notification_deliveries_notification_type_check
  check (notification_type = any (array[
    'calendar_participant', 'task_assigned', 'task_accepted',
    'newcomer_care_created', 'newcomer_care_completed',
    'newcomer_care_reminder_24h', 'newcomer_care_overdue_48h',
    'newcomer_group_created'
  ]));
