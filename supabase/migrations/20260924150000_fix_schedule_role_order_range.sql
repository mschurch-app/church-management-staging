begin;

alter table public.schedule_role_preferences
  drop constraint schedule_role_preferences_order;
alter table public.schedule_role_preferences
  add constraint schedule_role_preferences_order check(sort_order between 0 and 1000);

update public.schedule_role_preferences
set sort_order=case role_key
  when 'wed_prayer' then 110
  when 'transport' then 120
  when 'communion' then 130
  when 'communion_bread' then 140
  when 'communion_cup' then 150
  else sort_order end
where church_id='M+'
  and role_key in ('wed_prayer','transport','communion','communion_bread','communion_cup');

commit;
