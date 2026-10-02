begin;

update public.church_customizations c
set feature_modules = c.feature_modules || jsonb_build_array(
  jsonb_build_object('key','newcomer_care','icon','🌱','label','新朋友關懷','enabled',true,'dashboard',true,'navigation',false,'permission','members','description','分派關懷、聯絡紀錄、下一步與逾期追蹤','dashboard_order',11,'navigation_order',11),
  jsonb_build_object('key','tree_reading_admin','icon','🌳','label','讀經生命樹','enabled',c.church_id='M+','dashboard',c.church_id='M+','navigation',false,'permission','members','description','查看參與同工、讀經進度與生命樹活動','dashboard_order',12,'navigation_order',12),
  jsonb_build_object('key','binding_review','icon','🔗','label','LINE 綁定審核','enabled',true,'dashboard',true,'navigation',false,'permission','members','description','確認既有會友、補登手機並綁定 LINE','dashboard_order',13,'navigation_order',13),
  jsonb_build_object('key','notification_settings','icon','🔔','label','LINE 通知設定','enabled',true,'dashboard',true,'navigation',false,'permission','members','description','設定自動通知的同工與群組','dashboard_order',14,'navigation_order',14)
), version=c.version+1, updated_at=now()
where not exists (
  select 1 from jsonb_array_elements(c.feature_modules) item where item->>'key'='newcomer_care'
);

commit;
