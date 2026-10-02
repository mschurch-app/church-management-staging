revoke all on function public.sync_pastoral_staff_for_app_user(uuid) from public;
revoke all on function public.sync_pastoral_staff_for_app_user(uuid) from anon;
revoke all on function public.sync_pastoral_staff_for_app_user(uuid) from authenticated;

revoke all on function public.sync_pastoral_staff_from_account_trigger() from public;
revoke all on function public.sync_pastoral_staff_from_account_trigger() from anon;
revoke all on function public.sync_pastoral_staff_from_account_trigger() from authenticated;
