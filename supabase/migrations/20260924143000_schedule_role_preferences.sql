begin;

create table public.schedule_role_preferences(
  church_id text not null references public.churches(id) on update cascade on delete restrict,
  role_key text not null,
  label text not null,
  icon text not null,
  is_visible boolean not null default true,
  sort_order integer not null,
  updated_at timestamptz not null default now(),
  primary key(church_id,role_key),
  constraint schedule_role_preferences_church check(church_id in ('M+','SHiNE')),
  constraint schedule_role_preferences_key check(role_key in ('speaker','worship_leader','tech_sound','tech_video','usher1','usher2','presider','prayer','sunday_school','sunday_school_ta','singers','keyboard','guitar','bass','drums','ushers','transport','communion','communion_bread','communion_cup','wed_prayer')),
  constraint schedule_role_preferences_label check(char_length(label) between 1 and 30),
  constraint schedule_role_preferences_icon check(char_length(icon) between 1 and 12),
  constraint schedule_role_preferences_order check(sort_order between 0 and 100)
);

alter table public.schedule_role_preferences enable row level security;
revoke all on public.schedule_role_preferences from anon,authenticated;
grant select,insert,update,delete on public.schedule_role_preferences to authenticated;

create policy schedule_role_preferences_church_permission
on public.schedule_role_preferences
for all
to authenticated
using((select church_auth.allowed(church_id,'schedules')))
with check((select church_auth.allowed(church_id,'schedules')));

insert into public.schedule_role_preferences(church_id,role_key,label,icon,is_visible,sort_order) values
('M+','speaker','信息分享','🎙️',true,10),
('M+','worship_leader','敬拜讚美','🎶',true,20),
('M+','presider','司會','🗣️',true,30),
('M+','prayer','主日公禱','🙏',true,40),
('M+','tech_sound','音控控台','🎚️',true,50),
('M+','tech_video','投影字幕／導播','🎥',true,60),
('M+','usher1','招待一','👋',true,70),
('M+','usher2','招待二','🤝',true,80),
('M+','sunday_school','兒主老師','🧒',true,90),
('M+','sunday_school_ta','兒主助教','🌱',true,100),
('M+','wed_prayer','週三禱告會','🕊️',false,91),
('M+','transport','交通服事','🚐',false,92),
('M+','communion','聖餐服事','✝️',false,93),
('M+','communion_bread','聖餐餅','🍞',false,94),
('M+','communion_cup','聖餐杯','🍷',false,95),
('SHiNE','speaker','信息分享','🎙️',true,10),
('SHiNE','worship_leader','敬拜主領','🎶',true,20),
('SHiNE','singers','敬拜歌者','🎤',true,30),
('SHiNE','keyboard','司琴鍵盤','🎹',true,40),
('SHiNE','guitar','木／電吉他','🎸',true,50),
('SHiNE','bass','貝斯手','🎸',true,60),
('SHiNE','drums','爵士鼓手','🥁',true,70),
('SHiNE','tech_sound','音控控台','🎚️',true,80),
('SHiNE','tech_video','直播導播','🎥',true,90),
('SHiNE','ushers','主日招待','👋',true,100)
on conflict(church_id,role_key) do nothing;

commit;
