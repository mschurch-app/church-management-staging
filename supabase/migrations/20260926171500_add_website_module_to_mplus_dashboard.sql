update public.church_customizations as settings
set feature_modules = settings.feature_modules || jsonb_build_array(jsonb_build_object(
  'key','website_weekly',
  'icon','🌐',
  'label','教會網站維護',
  'enabled',true,
  'dashboard',true,
  'navigation',false,
  'permission','pastoral_chats',
  'description','維護 M+大雅教會週報、主日預告圖片與服事表',
  'dashboard_order',90,
  'navigation_order',90
)),
version=settings.version+1,
updated_at=now()
where settings.church_id='M+'
  and not exists (
    select 1 from jsonb_array_elements(settings.feature_modules) as module
    where module->>'key'='website_weekly'
  );
