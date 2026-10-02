update public.church_customizations
set feature_modules=(
  select jsonb_agg(
    case when item->>'key'='notification_settings'
      then item || jsonb_build_object(
        'label','通知管道設定',
        'description','設定 App 與 LINE 通知，可逐項停止 LINE'
      )
      else item
    end
    order by ordinality
  )
  from jsonb_array_elements(feature_modules) with ordinality as modules(item,ordinality)
),version=version+1,updated_at=now()
where exists(select 1 from jsonb_array_elements(feature_modules) item where item->>'key'='notification_settings');
