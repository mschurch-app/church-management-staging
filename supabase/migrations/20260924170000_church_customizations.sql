begin;

create table public.church_customizations(
  church_id text primary key references public.churches(id) on update cascade on delete restrict,
  feature_modules jsonb not null,
  welcome_fields jsonb not null,
  catalogs jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint church_customizations_church check(church_id in ('M+','SHiNE')),
  constraint church_customizations_features_array check(jsonb_typeof(feature_modules)='array' and jsonb_array_length(feature_modules) between 1 and 30),
  constraint church_customizations_fields_array check(jsonb_typeof(welcome_fields)='array' and jsonb_array_length(welcome_fields) between 1 and 40),
  constraint church_customizations_catalogs_object check(jsonb_typeof(catalogs)='object')
);

alter table public.church_customizations enable row level security;
revoke all on public.church_customizations from anon,authenticated;
grant select on public.church_customizations to anon,authenticated;
grant update on public.church_customizations to authenticated;

create policy church_customizations_public_read on public.church_customizations
for select to anon,authenticated using(true);

create policy church_customizations_members_manage on public.church_customizations
for update to authenticated
using((select church_auth.allowed(church_id,'members')))
with check((select church_auth.allowed(church_id,'members')));

insert into public.church_customizations(church_id,feature_modules,welcome_fields,catalogs)
select church_id,
  '[
    {"key":"members","permission":"members","label":"會友名冊","icon":"👥","description":"會員、新朋友、封存與操作紀錄","enabled":true,"dashboard":true,"navigation":true,"dashboard_order":10,"navigation_order":10},
    {"key":"groups","permission":"groups","label":"小組／小家","icon":"🫶","description":"分組、組長與成員安排","enabled":true,"dashboard":true,"navigation":true,"dashboard_order":20,"navigation_order":20},
    {"key":"attendance","permission":"attendance","label":"聚會點名","icon":"✅","description":"出席登記、修改與統計","enabled":true,"dashboard":true,"navigation":true,"dashboard_order":30,"navigation_order":30},
    {"key":"schedules","permission":"schedules","label":"服事排班","icon":"📅","description":"主日與聚會服事安排","enabled":true,"dashboard":true,"navigation":true,"dashboard_order":40,"navigation_order":40},
    {"key":"prayers","permission":"private_prayers","label":"代禱關懷","icon":"🙏","description":"公開與私密代禱追蹤","enabled":true,"dashboard":true,"navigation":true,"dashboard_order":50,"navigation_order":50},
    {"key":"spaces","permission":"spaces","label":"場地預約","icon":"📍","description":"空間、設備與借用審核","enabled":true,"dashboard":true,"navigation":false,"dashboard_order":60,"navigation_order":60},
    {"key":"pastoral_inbox","permission":"pastoral_chats","label":"牧養訊息","icon":"💬","description":"一對一訊息與跟進紀錄","enabled":true,"dashboard":true,"navigation":false,"dashboard_order":70,"navigation_order":70},
    {"key":"pastoral_content","permission":"pastoral_chats","label":"教牧內容","icon":"✨","description":"祝禱範本與新朋友旅程","enabled":true,"dashboard":true,"navigation":false,"dashboard_order":80,"navigation_order":80}
  ]'::jsonb,
  '[
    {"key":"identity","label":"怎麼稱呼你？","visible":true,"required":true,"sort_order":10,"audience":"all"},
    {"key":"phone","label":"聯絡手機","visible":true,"required":true,"sort_order":20,"audience":"all"},
    {"key":"birthday","label":"你的生日","visible":true,"required":false,"sort_order":30,"audience":"all"},
    {"key":"age","label":"你的年齡區間","visible":true,"required":false,"sort_order":40,"audience":"newcomer"},
    {"key":"district","label":"你平時生活在哪一區？","visible":true,"required":false,"sort_order":50,"audience":"newcomer"},
    {"key":"source","label":"今天是怎麼認識我們的？","visible":true,"required":false,"sort_order":60,"audience":"newcomer"},
    {"key":"faith","label":"關於你的信仰近況","visible":true,"required":false,"sort_order":70,"audience":"newcomer"},
    {"key":"feelings","label":"今天來到這裡，最想感受的是什麼？","visible":true,"required":false,"sort_order":80,"audience":"newcomer"},
    {"key":"interests","label":"平常的生活興趣與休閒？","visible":true,"required":false,"sort_order":90,"audience":"newcomer"},
    {"key":"photo","label":"今日照片留念","visible":true,"required":false,"sort_order":100,"audience":"all"}
  ]'::jsonb,
  jsonb_build_object(
    'growth_progress',jsonb_build_array('穩定聚會(8成以上)','規律聚會(5成以上)','偶爾聚會(5成以下)','暫停聚會（關懷中）','很久沒來(都沒出現）'),
    'faith_status',jsonb_build_array('新朋友（初次聚會）','慕道友（偶爾出現）','受洗初信','一般會友','委身家人','門徒','領袖'),
    'group_types',case when church_id='M+' then jsonb_build_array('成人小組','青年小組','家庭小組','兒童小組','其他') else jsonb_build_array('成人小家','青年小家','家庭小家','兒童小家','其他') end,
    'meeting_types',jsonb_build_array('主日聚會','小組／小家','禱告會','門徒訓練','特別聚會'),
    'prayer_categories',jsonb_build_array('健康','家庭','工作','信仰','關係','感恩','其他'),
    'prayer_statuses',jsonb_build_array('待關懷','關懷中','持續守望','已完成'),
    'newcomer_stages',jsonb_build_array('新朋友','已聯絡','持續關懷','加入小組／小家','穩定聚會'),
    'notification_rules',jsonb_build_array('新朋友登記通知','私密代禱通知','場地申請通知','管理員邀請通知')
  )
from (values ('M+'::text),('SHiNE'::text)) seed(church_id)
on conflict(church_id) do nothing;

alter table public.groups add column if not exists group_type text;
alter table public.attendance_records add column if not exists meeting_type text;
alter table public.prayers add column if not exists category text;

commit;
